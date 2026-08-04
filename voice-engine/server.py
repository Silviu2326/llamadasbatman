from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from openai import AsyncOpenAI

from ambience import filler_phrases, mix_line_noise

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("vozia.voice_engine")

INPUT_RATE = 16_000
OUTPUT_RATE = 24_000
MAX_EVENT_BYTES = 512 * 1024
MAX_TURN_SECONDS = 30
SMART_TURN_RATE = 16_000
PARTIAL_MIN_MS = 650
PARTIAL_INTERVAL_MS = 700
CONTINUATION_WAIT_MS = 650


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
        return value if value > 0 else default
    except ValueError:
        return default


def stt_language(value: str) -> str:
    """Map product locale values such as en-US to Whisper language codes."""
    normalized = value.strip().lower().replace("_", "-")
    if normalized.startswith("en"):
        return "en"
    if normalized.startswith("es"):
        return "es"
    if normalized.startswith("fr"):
        return "fr"
    if normalized.startswith("de"):
        return "de"
    if normalized.startswith("it"):
        return "it"
    return normalized or "en"


def tts_language(value: str) -> str:
    """Map product locale values to language labels expected by Qwen3-TTS."""
    normalized = value.strip().lower().replace("_", "-")
    if normalized.startswith("es"):
        return "Spanish"
    if normalized.startswith("en"):
        return "English"
    if normalized.startswith("fr"):
        return "French"
    if normalized.startswith("de"):
        return "German"
    if normalized.startswith("it"):
        return "Italian"
    return value.strip() or "Spanish"


def pcm_rms(audio: bytes) -> float:
    if len(audio) < 2:
        return 0.0
    samples = np.frombuffer(audio[: len(audio) - (len(audio) % 2)], dtype="<i2").astype(np.float32)
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(samples / 32768.0))))


def resample_pcm16(audio: bytes, source_rate: int, target_rate: int) -> bytes:
    if source_rate == target_rate or not audio:
        return audio
    samples = np.frombuffer(audio[: len(audio) - (len(audio) % 2)], dtype="<i2")
    if samples.size < 2:
        return audio
    target_size = max(1, round(samples.size * target_rate / source_rate))
    source_x = np.linspace(0.0, 1.0, samples.size)
    target_x = np.linspace(0.0, 1.0, target_size)
    output = np.interp(target_x, source_x, samples.astype(np.float32))
    return np.clip(output, -32768, 32767).astype("<i2").tobytes()


def chunk_bytes(audio: bytes, size: int = 9600) -> list[bytes]:
    return [audio[index : index + size] for index in range(0, len(audio), size)]


class SpeechToText:
    def __init__(self) -> None:
        from faster_whisper import WhisperModel

        model_name = os.getenv("VOICE_ENGINE_STT_MODEL", "large-v3-turbo")
        device = os.getenv("VOICE_ENGINE_STT_DEVICE", "cuda")
        compute_type = os.getenv("VOICE_ENGINE_STT_COMPUTE_TYPE", "float16" if device == "cuda" else "int8")
        logger.info("loading STT model=%s device=%s compute=%s", model_name, device, compute_type)
        self.model = WhisperModel(model_name, device=device, compute_type=compute_type)
        self.default_language = stt_language(os.getenv("VOICE_ENGINE_LANGUAGE", "es-ES"))

    def _transcribe_sync(self, audio: bytes, language: str | None = None) -> dict[str, Any]:
        samples = np.frombuffer(audio, dtype="<i2").astype(np.float32) / 32768.0
        target_language = stt_language(language or self.default_language)
        segments, info = self.model.transcribe(
            samples,
            language=target_language,
            beam_size=1,
            best_of=1,
            temperature=0,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 350},
            word_timestamps=True,
            condition_on_previous_text=False,
        )
        words: list[dict[str, Any]] = []
        text_parts: list[str] = []
        for segment in segments:
            text_parts.append(segment.text.strip())
            for word in segment.words or []:
                words.append({
                    "word": word.word.strip(),
                    "confidence": float(word.probability),
                    "start": float(word.start),
                    "end": float(word.end),
                })
        return {
            "text": " ".join(part for part in text_parts if part).strip(),
            "words": words,
            "language": getattr(info, "language", target_language),
        }

    async def transcribe(self, audio: bytes, language: str | None = None) -> dict[str, Any]:
        return await asyncio.to_thread(self._transcribe_sync, audio, language)


class PiperSynthesizer:
    def __init__(self) -> None:
        from piper import PiperVoice

        model_path = os.getenv("VOICE_ENGINE_PIPER_MODEL", "").strip()
        if not model_path:
            raise RuntimeError("VOICE_ENGINE_PIPER_MODEL must point to a Piper .onnx voice")
        logger.info("loading Piper voice=%s", model_path)
        self.voice = PiperVoice.load(model_path, use_cuda=env_bool("VOICE_ENGINE_PIPER_CUDA"))

    def _synthesize_sync(self, text: str) -> bytes:
        chunks: list[bytes] = []
        sample_rate = 0
        for chunk in self.voice.synthesize(text):
            sample_rate = int(chunk.sample_rate)
            chunks.append(chunk.audio_int16_bytes)
        return resample_pcm16(b"".join(chunks), sample_rate, OUTPUT_RATE)

    async def synthesize(self, text: str) -> bytes:
        return await asyncio.to_thread(self._synthesize_sync, text)


class Qwen3TtsSynthesizer:
    """Optional Qwen3-TTS provider selected with VOICE_ENGINE_TTS_PROVIDER."""

    def __init__(self) -> None:
        import soundfile as sf
        import torch
        from qwen_tts import Qwen3TTSModel

        # Con REF_AUDIO clona la voz del banco (modelo -Base); sin el, speaker fijo (-CustomVoice).
        self.ref_audio = os.getenv("VOICE_ENGINE_QWEN3_REF_AUDIO", "").strip()
        default_model = "Qwen/Qwen3-TTS-12Hz-0.6B-" + ("Base" if self.ref_audio else "CustomVoice")
        model_name = os.getenv("VOICE_ENGINE_QWEN3_MODEL", default_model)
        device = os.getenv("VOICE_ENGINE_QWEN3_DEVICE", "cuda:0")
        dtype_name = os.getenv("VOICE_ENGINE_QWEN3_DTYPE", "bfloat16")
        dtype = getattr(torch, dtype_name, torch.bfloat16)
        self.model = Qwen3TTSModel.from_pretrained(model_name, device_map=device, dtype=dtype)
        self.language = tts_language(os.getenv("VOICE_ENGINE_TTS_LANGUAGE", "es-ES"))
        self.speaker = os.getenv("VOICE_ENGINE_QWEN3_SPEAKER", "Ryan")
        self.instruct = os.getenv("VOICE_ENGINE_QWEN3_INSTRUCT", "Voz española cálida, clara y profesional, con pausas naturales")
        self.soundfile = sf
        self.clone_prompt = None
        if self.ref_audio:
            # El prompt de clonado se calcula una vez, no en cada frase.
            ref_text = os.getenv("VOICE_ENGINE_QWEN3_REF_TEXT", "").strip()
            if not ref_text:
                raise ValueError("VOICE_ENGINE_QWEN3_REF_TEXT es obligatorio: Qwen exige la transcripcion de la referencia")
            logger.info("Qwen3-TTS clonando voz de %s", self.ref_audio)
            self.clone_prompt = self.model.create_voice_clone_prompt(ref_audio=self.ref_audio, ref_text=ref_text)

    def _synthesize_sync(self, text: str) -> bytes:
        if self.clone_prompt is not None:
            wavs, sample_rate = self.model.generate_voice_clone(
                text=text,
                language=self.language,
                voice_clone_prompt=self.clone_prompt,
            )
        else:
            wavs, sample_rate = self.model.generate_custom_voice(
                text=text,
                language=self.language,
                speaker=self.speaker,
                instruct=self.instruct,
            )
        import io
        output = io.BytesIO()
        self.soundfile.write(output, wavs[0], sample_rate, format="WAV", subtype="PCM_16")
        output.seek(0)
        import wave
        with wave.open(output, "rb") as wav:
            pcm = wav.readframes(wav.getnframes())
            source_rate = wav.getframerate()
        return resample_pcm16(pcm, source_rate, OUTPUT_RATE)

    async def synthesize(self, text: str) -> bytes:
        return await asyncio.to_thread(self._synthesize_sync, text)


class ChatterboxSynthesizer:
    """Optional Chatterbox TTS provider selected with VOICE_ENGINE_TTS_PROVIDER=chatterbox.

    Usa siempre el checkpoint multilingüe (cubre es/en con el mismo modelo).
    """

    def __init__(self) -> None:
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        device = os.getenv("VOICE_ENGINE_CHATTERBOX_DEVICE", "cuda")
        logger.info("loading Chatterbox multilingual TTS device=%s", device)
        self.model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        # ponytail: mismo mapeo de locale→código que STT; Chatterbox usa "es"/"en"/…
        self.language = stt_language(os.getenv("VOICE_ENGINE_TTS_LANGUAGE", os.getenv("VOICE_ENGINE_LANGUAGE", "es-ES")))
        self.voice_prompt = os.getenv("VOICE_ENGINE_CHATTERBOX_VOICE", "").strip() or None
        self.exaggeration = float(os.getenv("VOICE_ENGINE_CHATTERBOX_EXAGGERATION", "0.5"))
        self.cfg_weight = float(os.getenv("VOICE_ENGINE_CHATTERBOX_CFG_WEIGHT", "0.5"))
        self.torch = torch

    def _synthesize_sync(self, text: str) -> bytes:
        kwargs: dict[str, Any] = {
            "language_id": self.language,
            "exaggeration": self.exaggeration,
            "cfg_weight": self.cfg_weight,
        }
        if self.voice_prompt:
            kwargs["audio_prompt_path"] = self.voice_prompt
        with self.torch.inference_mode():
            wav = self.model.generate(text, **kwargs)
        samples = wav.squeeze().detach().cpu().numpy().astype(np.float32)
        pcm = np.clip(samples * 32767.0, -32768, 32767).astype("<i2").tobytes()
        return resample_pcm16(pcm, int(self.model.sr), OUTPUT_RATE)

    async def synthesize(self, text: str) -> bytes:
        return await asyncio.to_thread(self._synthesize_sync, text)


class SmartTurnDetector:
    """Optional local Smart Turn v3 ONNX detector.

    Smart Turn is only evaluated after the lightweight VAD observes silence.
    This keeps the realtime path cheap and follows the model's recommended
    usage: provide the complete current turn, padded/truncated to eight
    seconds, instead of feeding arbitrary tiny audio fragments.
    """

    def __init__(self, model_path: str) -> None:
        import onnxruntime as ort
        from transformers import WhisperFeatureExtractor

        options = ort.SessionOptions()
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.inter_op_num_threads = 1
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(model_path, sess_options=options)
        self.extractor = WhisperFeatureExtractor(chunk_length=8)
        self.model_path = model_path

    @staticmethod
    def _prepare(audio: bytes) -> np.ndarray:
        samples = np.frombuffer(audio[: len(audio) - (len(audio) % 2)], dtype="<i2").astype(np.float32) / 32768.0
        max_samples = 8 * SMART_TURN_RATE
        if samples.size > max_samples:
            samples = samples[-max_samples:]
        if samples.size < max_samples:
            samples = np.pad(samples, (max_samples - samples.size, 0))
        return samples

    def _predict_sync(self, audio: bytes) -> dict[str, Any]:
        samples = self._prepare(audio)
        inputs = self.extractor(
            samples,
            sampling_rate=SMART_TURN_RATE,
            return_tensors="np",
            padding="max_length",
            max_length=8 * SMART_TURN_RATE,
            truncation=True,
            do_normalize=True,
        )
        input_features = inputs.input_features.squeeze(0).astype(np.float32)
        output = self.session.run(None, {"input_features": np.expand_dims(input_features, axis=0)})
        probability = float(np.asarray(output[0]).reshape(-1)[0])
        return {"prediction": int(probability >= 0.5), "probability": probability}

    async def predict(self, audio: bytes) -> dict[str, Any]:
        return await asyncio.to_thread(self._predict_sync, audio)


@dataclass
class EngineRuntime:
    stt: SpeechToText | None = None
    tts: Any = None
    llm: AsyncOpenAI | None = None
    tts_cache: dict[str, Any] = field(default_factory=dict)

    def get_tts(self, provider: str | None) -> Any:
        """TTS por proveedor con caché: la página de laboratorio puede pedir
        qwen/chatterbox/piper por sesión sin recargar el modelo cada vez."""
        key = (provider or os.getenv("VOICE_ENGINE_TTS_PROVIDER", "piper")).strip().lower()
        if key in {"qwen3", "qwen3-tts"}:
            key = "qwen"
        if key not in self.tts_cache:
            try:
                if key == "qwen":
                    self.tts_cache[key] = Qwen3TtsSynthesizer()
                elif key == "chatterbox":
                    self.tts_cache[key] = ChatterboxSynthesizer()
                else:
                    self.tts_cache[key] = PiperSynthesizer()
            except Exception as error:
                logger.warning("TTS %s unavailable, falling back to Piper: %s", key, error)
                self.tts_cache[key] = PiperSynthesizer()
        return self.tts_cache[key]

    def ensure_models(self) -> None:
        if self.stt is None:
            self.stt = SpeechToText()
        if self.tts is None:
            self.tts = self.get_tts(None)
        if self.llm is None:
            self.llm = AsyncOpenAI(
                base_url=os.getenv("VOICE_ENGINE_LLM_BASE_URL", "http://127.0.0.1:8000/v1"),
                api_key=os.getenv("VOICE_ENGINE_LLM_API_KEY", "local-token"),
                timeout=env_int("VOICE_ENGINE_LLM_TIMEOUT_MS", 2500) / 1000,
            )


runtime = EngineRuntime()
app = FastAPI(title="VozIA Voice Engine", version="0.1.0")


@app.on_event("startup")
async def preload_models() -> None:
    """Con VOICE_ENGINE_PRELOAD=true carga STT/TTS al arrancar (en background)
    para que la primera sesión no pague la carga de whisper/Chatterbox."""
    if env_bool("VOICE_ENGINE_PRELOAD"):
        import threading

        threading.Thread(target=runtime.ensure_models, daemon=True, name="engine-preload").start()


@dataclass
class Session:
    websocket: WebSocket
    context: dict[str, Any]
    system_prompt: str
    runtime: EngineRuntime
    smart_turn: SmartTurnDetector | None = None
    language: str = "es-ES"
    eot_timeout_ms: int = field(default_factory=lambda: env_int("VOICE_ENGINE_EOT_MS", 700))
    audio_buffer: bytearray = field(default_factory=bytearray)
    in_speech: bool = False
    last_voice_at: float = 0.0
    generation_id: int = 0
    turn_task: asyncio.Task[None] | None = None
    continuation_task: asyncio.Task[None] | None = None
    partial_task: asyncio.Task[None] | None = None
    response_task: asyncio.Task[None] | None = None
    history: list[dict[str, str]] = field(default_factory=list)
    closed: bool = False
    waiting_for_continuation: bool = False
    last_partial_at: float = 0.0
    last_partial_text: str = ""
    backchannel_clips: list[bytes] = field(default_factory=list)
    backchannel_index: int = 0
    ambience_seed: int = 0
    tts: Any = None
    kyutai: Any = None
    kyutai_turn: Any = None
    kyutai_pending: Any = None

    async def send(self, payload: dict[str, Any]) -> None:
        if self.closed:
            return
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > MAX_EVENT_BYTES:
            raise RuntimeError("voice-engine event is too large")
        await self.websocket.send_text(encoded)

    async def start(self, payload: dict[str, Any]) -> None:
        context = payload.get("context") or {}
        agent = payload.get("agent") or {}
        self.context = context if isinstance(context, dict) else {}
        self.system_prompt = str(agent.get("systemPrompt") or self.system_prompt)
        self.language = str(agent.get("language") or os.getenv("VOICE_ENGINE_LANGUAGE", "es-ES"))
        self.runtime.ensure_models()
        pipeline = payload.get("pipeline") if isinstance(payload.get("pipeline"), dict) else {}
        self.tts = self.runtime.get_tts(str(pipeline.get("tts") or "") or None)
        if str(pipeline.get("stt") or "") == "kyutai":
            await self.start_kyutai_stt()
        if env_bool("VOICE_ENGINE_SMART_TURN_ENABLED"):
            model_path = os.getenv("VOICE_ENGINE_SMART_TURN_MODEL", "").strip()
            if model_path:
                try:
                    self.smart_turn = SmartTurnDetector(model_path)
                    await self.send({"type": "turn.detector.ready", "provider": "smart-turn", "model": model_path})
                except Exception as error:
                    logger.warning("Smart Turn unavailable, using VAD fallback: %s", error)
                    await self.send({"type": "turn.detector.fallback", "provider": "vad", "reason": str(error)[:240]})
            else:
                await self.send({"type": "turn.detector.fallback", "provider": "vad", "reason": "VOICE_ENGINE_SMART_TURN_MODEL missing"})
        await self.send({"type": "session.ready", "sessionId": self.context.get("callSid")})
        # El agente abre la llamada, como en una venta real: Node envía la
        # apertura (disclosure + presentación) en agent.greeting; el env queda
        # como fallback para pruebas sueltas del sidecar.
        greeting = str(agent.get("greeting") or os.getenv("VOICE_ENGINE_GREETING", "")).strip()
        if greeting:
            self.history.append({"role": "assistant", "content": greeting})
            await self.send({"type": "transcript.final", "role": "agente", "text": greeting})
            await self.speak(greeting, self.generation_id)
        # Versión "arriesgada": pre-sintetiza muletillas cortas que se sueltan
        # mientras el LLM piensa. Después del saludo para no retrasar el
        # primer audio de la llamada.
        if env_bool("VOICE_ENGINE_BACKCHANNEL"):
            for phrase in filler_phrases(self.language):
                try:
                    self.backchannel_clips.append(await self.tts.synthesize(phrase))
                except Exception as error:
                    logger.warning("backchannel synthesis failed: %s", error)
                    break

    async def start_kyutai_stt(self) -> None:
        """STT streaming Kyutai por sesión (laboratorio). Si no está disponible
        (sin extra [stt], sin GPU o stream ya activo) se sigue con whisper."""
        try:
            from kyutai_stt import KyutaiStream
            from kyutai_stt import TurnState
            from kyutai_stt import runtime as kyutai_runtime

            await asyncio.to_thread(kyutai_runtime.ensure_loaded)
            kyutai_runtime.acquire()
            stream = KyutaiStream(kyutai_runtime)
            await stream.open()
            self.kyutai = stream
            self.kyutai_turn = TurnState(eot_timeout_ms=self.eot_timeout_ms)
            self.kyutai_pending = np.empty(0, dtype=np.float32)
            await self.send({"type": "stt.provider", "provider": "kyutai", "model": kyutai_runtime.repo})
        except Exception as error:
            logger.warning("Kyutai STT unavailable, using faster-whisper: %s", error)
            self.kyutai = None
            await self.send({"type": "stt.provider", "provider": "faster-whisper", "reason": str(error)[:240]})

    async def receive_audio_kyutai(self, audio: bytes) -> None:
        from kyutai_stt import resample_16k_to_24k

        self.kyutai_pending = np.concatenate([self.kyutai_pending, resample_16k_to_24k(audio)])
        frame_size = self.kyutai.rt.frame_size
        while self.kyutai_pending.size >= frame_size:
            frame = self.kyutai_pending[:frame_size]
            self.kyutai_pending = self.kyutai_pending[frame_size:]
            piece, vad_prob = await self.kyutai.step(frame)
            for kind, event in self.kyutai_turn.feed(piece, vad_prob, time.monotonic()):
                if self.closed:
                    return
                if kind == "speech.started":
                    self.generation_id += 1
                    await self.cancel_response()
                    await self.send({"type": "speech.started", "timestampMs": round(time.monotonic() * 1000)})
                elif kind == "partial":
                    await self.send({
                        "type": "transcript.partial",
                        "role": "prospecto",
                        "text": event["text"],
                        "metadata": {"language": self.language, "provider": "kyutai"},
                    })
                elif kind == "final":
                    text = (event["text"] + await self.kyutai.flush()).strip()
                    if not text:
                        continue
                    await self.send({"type": "turn.user_finished", "role": "user", "metadata": {"provider": "kyutai"}})
                    await self.send({
                        "type": "transcript.final",
                        "role": "prospecto",
                        "text": text,
                        "metadata": {"language": self.language, "provider": "kyutai", "confidence": event.get("confidence")},
                    })
                    long_turn = float(event.get("durationSec") or 0) >= 3
                    self.response_task = asyncio.create_task(self.respond(text, self.generation_id, long_turn))

    async def receive_audio(self, audio: bytes) -> None:
        if len(audio) > MAX_EVENT_BYTES:
            raise RuntimeError("audio frame is too large")
        if self.kyutai is not None:
            await self.receive_audio_kyutai(audio)
            return
        now = time.monotonic()
        speaking = pcm_rms(audio) >= float(os.getenv("VOICE_ENGINE_VAD_THRESHOLD", "0.018"))
        if speaking:
            if not self.in_speech:
                self.in_speech = True
                self.waiting_for_continuation = False
                if self.continuation_task and not self.continuation_task.done():
                    self.continuation_task.cancel()
                self.last_partial_at = 0.0
                self.last_partial_text = ""
                self.generation_id += 1
                await self.cancel_response()
                await self.send({"type": "speech.started", "timestampMs": round(now * 1000)})
            self.last_voice_at = now
            self.audio_buffer.extend(audio)
            max_bytes = MAX_TURN_SECONDS * INPUT_RATE * 2
            if len(self.audio_buffer) > max_bytes:
                self.schedule_turn_finalization()
            else:
                self.schedule_partial_transcription()
            return

        if self.in_speech and (now - self.last_voice_at) * 1000 >= self.eot_timeout_ms:
            self.schedule_turn_finalization()

    def schedule_turn_finalization(self) -> None:
        if self.turn_task and not self.turn_task.done():
            return
        self.turn_task = asyncio.create_task(self.finalize_turn())

    def schedule_partial_transcription(self) -> None:
        if self.partial_task and not self.partial_task.done():
            return
        if not self.in_speech or len(self.audio_buffer) < PARTIAL_MIN_MS * INPUT_RATE * 2 // 1000:
            return
        now = time.monotonic()
        if (now - self.last_partial_at) * 1000 < PARTIAL_INTERVAL_MS:
            return
        self.last_partial_at = now
        self.partial_task = asyncio.create_task(self.emit_partial_transcription(self.generation_id))

    async def emit_partial_transcription(self, generation_id: int) -> None:
        audio = bytes(self.audio_buffer)
        if not audio or self.runtime.stt is None:
            return
        try:
            result = await self.runtime.stt.transcribe(audio, self.language)
            text = str(result.get("text") or "").strip()
            if (
                text
                and text != self.last_partial_text
                and generation_id == self.generation_id
                and self.in_speech
                and not self.closed
            ):
                self.last_partial_text = text
                await self.send({
                    "type": "transcript.partial",
                    "role": "prospecto",
                    "text": text,
                    "metadata": {"language": result.get("language", self.language), "continuous": True},
                })
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.debug("partial STT failed: %s", error)

    async def finalize_after_continuation(self, generation_id: int) -> None:
        try:
            await asyncio.sleep(CONTINUATION_WAIT_MS / 1000)
            if generation_id != self.generation_id or self.in_speech or self.closed or not self.audio_buffer:
                return
            self.waiting_for_continuation = False
            await self.finalize_turn(force=True)
        except asyncio.CancelledError:
            raise

    async def finalize_turn(self, force: bool = False) -> None:
        if not self.audio_buffer:
            self.in_speech = False
            return
        turn_generation = self.generation_id
        audio = bytes(self.audio_buffer)
        self.in_speech = False
        if self.smart_turn is not None and not force:
            prediction = await self.smart_turn.predict(audio)
            await self.send({
                "type": "turn.semantic_prediction",
                "role": "user",
                "provider": "smart-turn",
                "probability": prediction["probability"],
                "complete": bool(prediction["prediction"]),
            })
            if not prediction["prediction"]:
                self.waiting_for_continuation = True
                await self.send({"type": "turn.may_continue", "role": "user", "provider": "smart-turn"})
                if self.continuation_task and not self.continuation_task.done():
                    self.continuation_task.cancel()
                self.continuation_task = asyncio.create_task(self.finalize_after_continuation(turn_generation))
                return
            self.waiting_for_continuation = False

        if turn_generation != self.generation_id or self.closed:
            return
        self.audio_buffer.clear()
        self.waiting_for_continuation = False
        result = await self.runtime.stt.transcribe(audio, self.language)  # type: ignore[union-attr]
        text = str(result.get("text") or "").strip()
        if not text:
            return
        if turn_generation != self.generation_id or self.closed:
            return
        await self.send({
            "type": "turn.user_finished",
            "role": "user",
            "metadata": {"language": result.get("language", self.language)},
        })
        await self.send({
            "type": "transcript.final",
            "role": "prospecto",
            "text": text,
            "words": result.get("words", []),
            "metadata": {"language": result.get("language", self.language)},
        })
        long_turn = len(audio) >= 3 * INPUT_RATE * 2  # el prospecto habló ≥3 s
        self.response_task = asyncio.create_task(self.respond(text, turn_generation, long_turn))

    async def respond(self, text: str, generation_id: int, long_turn: bool = False) -> None:
        client = self.runtime.llm
        if client is None:
            raise RuntimeError("LLM is not initialized")
        # Muletilla inmediata solo tras intervenciones largas: enmascara la
        # latencia STT+LLM sin sonar a coletilla en cada turno.
        if long_turn and self.backchannel_clips:
            clip = self.backchannel_clips[self.backchannel_index % len(self.backchannel_clips)]
            self.backchannel_index += 1
            await self.send_pcm(clip, generation_id)
        self.history.append({"role": "user", "content": text})
        messages: list[dict[str, str]] = [{"role": "system", "content": self.system_prompt}]
        messages.extend(self.history[-10:])
        model = os.getenv("VOICE_ENGINE_LLM_MODEL", "Qwen/Qwen3-8B")
        answer_parts: list[str] = []
        sentence = ""
        first_token = True
        await self.send({"type": "llm.started", "role": "system", "model": model})
        try:
            stream = await client.chat.completions.create(
                model=model,
                messages=messages,  # type: ignore[arg-type]
                # Tunables en vivo: un comercial responde en 1-2 frases, no en
                # párrafos; bajar max_tokens acorta y acelera cada turno.
                max_tokens=env_int("VOICE_ENGINE_LLM_MAX_TOKENS", 160),
                temperature=float(os.getenv("VOICE_ENGINE_LLM_TEMPERATURE", "0.55")),
                stream=True,
                # vLLM ignora enable_thinking a nivel raiz; hay que pasarlo al
                # chat template (verificado contra vLLM 0.26 + Qwen3-8B).
                extra_body={"chat_template_kwargs": {"enable_thinking": False}},
            )
            async for event in stream:
                if generation_id != self.generation_id or self.closed:
                    return
                token = event.choices[0].delta.content or ""
                if not token:
                    continue
                if first_token:
                    first_token = False
                    await self.send({"type": "llm.first_token", "role": "assistant", "model": model})
                answer_parts.append(token)
                sentence += token
                if sentence.rstrip().endswith((".", "?", "!", "…")):
                    await self.speak(sentence.strip(), generation_id)
                    sentence = ""
            if sentence.strip():
                await self.speak(sentence.strip(), generation_id)
            answer = "".join(answer_parts).strip()
            if answer and generation_id == self.generation_id and not self.closed:
                self.history.append({"role": "assistant", "content": answer})
                await self.send({"type": "llm.completed", "role": "assistant", "metadata": {"chars": len(answer)}})
                await self.send({"type": "transcript.final", "role": "agente", "text": answer})
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.exception("LLM response failed")
            await self.send({"type": "voice.error", "message": str(error)[:240]})

    async def speak(self, text: str, generation_id: int) -> None:
        if generation_id != self.generation_id or self.closed:
            return
        audio = await self.tts.synthesize(text)
        await self.send_pcm(audio, generation_id)

    async def send_pcm(self, audio: bytes, generation_id: int) -> None:
        level = float(os.getenv("VOICE_ENGINE_AMBIENCE_LEVEL", "0") or 0)
        if level > 0:
            self.ambience_seed += 1
            audio = mix_line_noise(audio, level, self.ambience_seed)
        first_chunk = True
        for chunk in chunk_bytes(audio):
            if generation_id != self.generation_id or self.closed:
                return
            if first_chunk:
                first_chunk = False
                await self.send({"type": "tts.first_audio", "role": "assistant", "sampleRate": OUTPUT_RATE})
            await self.send({
                "type": "assistant.audio",
                "sampleRate": OUTPUT_RATE,
                "encoding": "pcm_s16le",
                "pcmBase64": base64.b64encode(chunk).decode("ascii"),
            })

    async def cancel_response(self) -> None:
        if self.response_task and not self.response_task.done():
            self.response_task.cancel()
            try:
                await self.response_task
            except asyncio.CancelledError:
                pass
        self.response_task = None
        await self.send({"type": "assistant.interrupt"})

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        if self.turn_task and not self.turn_task.done():
            self.turn_task.cancel()
            try:
                await self.turn_task
            except asyncio.CancelledError:
                pass
        for task in (self.continuation_task, self.partial_task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        if self.kyutai is not None:
            await self.kyutai.close()
            self.kyutai = None
        await self.cancel_response()


def valid_token(websocket: WebSocket) -> bool:
    expected = os.getenv("VOICE_ENGINE_TOKEN", "").strip()
    if not expected:
        return env_bool("VOICE_ENGINE_ALLOW_UNAUTHENTICATED", False)
    value = websocket.headers.get("authorization", "")
    return value == f"Bearer {expected}"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "vozia-voice-engine"}


@app.get("/capabilities")
async def capabilities() -> dict[str, Any]:
    """Expose the active local stack without loading heavyweight models."""
    return {
        "service": "vozia-voice-engine",
        "deployment": "self-hosted",
        "stt": {"provider": "faster-whisper", "model": os.getenv("VOICE_ENGINE_STT_MODEL", "large-v3-turbo")},
        "sttStreaming": {"provider": "kyutai", "model": os.getenv("KYUTAI_STT_REPO", "kyutai/stt-1b-en_fr"), "endpoint": "/stt"},
        "llm": {
            "provider": "vllm-compatible-local",
            "model": os.getenv("VOICE_ENGINE_LLM_MODEL", "Qwen/Qwen3-8B"),
            "baseUrl": os.getenv("VOICE_ENGINE_LLM_BASE_URL", "http://127.0.0.1:8000/v1"),
        },
        "tts": {
            "provider": os.getenv("VOICE_ENGINE_TTS_PROVIDER", "piper"),
            "model": os.getenv("VOICE_ENGINE_PIPER_MODEL", "") or os.getenv("VOICE_ENGINE_QWEN3_MODEL", ""),
        },
        "turn": {
            "vad": "rms",
            "smartTurn": env_bool("VOICE_ENGINE_SMART_TURN_ENABLED"),
            "continuousPartials": True,
            "bargeIn": True,
        },
        "audio": {"inputSampleRate": INPUT_RATE, "outputSampleRate": OUTPUT_RATE, "encoding": "pcm_s16le"},
    }


@app.websocket("/stt")
async def stt_websocket(websocket: WebSocket) -> None:
    """STT streaming puro (Kyutai). Import perezoso: el engine arranca sin torch."""
    from kyutai_stt import handle_stt

    await handle_stt(websocket, valid_token)


@app.websocket("/ws")
async def voice_websocket(websocket: WebSocket) -> None:
    if not valid_token(websocket):
        await websocket.close(code=1008, reason="unauthorized")
        return
    await websocket.accept()
    session: Session | None = None
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            raw = message.get("text")
            if raw is None:
                continue
            if len(raw.encode("utf-8")) > MAX_EVENT_BYTES:
                await websocket.close(code=1009, reason="event too large")
                break
            payload = json.loads(raw)
            event_type = payload.get("type")
            if event_type == "session.start":
                if session is not None:
                    raise RuntimeError("duplicate session.start")
                session = Session(websocket, {}, "", runtime)
                await session.start(payload)
            elif session is None:
                raise RuntimeError("session.start required")
            elif event_type == "audio.in":
                encoded = payload.get("pcmBase64")
                if not isinstance(encoded, str):
                    raise RuntimeError("audio.in requires pcmBase64")
                await session.receive_audio(base64.b64decode(encoded, validate=True))
            elif event_type == "turn.config":
                session.eot_timeout_ms = max(250, min(int(payload.get("eotTimeoutMs", 700)), 10_000))
            elif event_type == "session.end":
                break
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception as error:
        logger.exception("voice session failed")
        if session is not None:
            try:
                await session.send({"type": "voice.error", "message": str(error)[:240]})
            except Exception:
                pass
        try:
            await websocket.close(code=1011, reason="voice engine error")
        except Exception:
            pass
    finally:
        if session is not None:
            await session.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=os.getenv("VOICE_ENGINE_HOST", "0.0.0.0"),
        port=env_int("VOICE_ENGINE_PORT", 9100),
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
