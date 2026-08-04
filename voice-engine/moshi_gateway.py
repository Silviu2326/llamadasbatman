"""Vendrava Duplex gateway for a local Moshi/Mimi installation.

The gateway deliberately keeps business authority in Node. Moshi receives only
the already-authorized session context and returns audio plus observational
events. A small parallel faster-whisper tap provides language-aware transcripts
for the Node Policy Engine, CRM audit and compliance checks.

Run from this directory:

    uvicorn moshi_gateway:app --host 0.0.0.0 --port 9200

The heavy Moshi imports are lazy so health/capability checks and protocol tests
can run on machines without CUDA or model weights.
"""

from __future__ import annotations

import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from ambience import mix_line_noise

from server import (
    INPUT_RATE,
    MAX_EVENT_BYTES,
    OUTPUT_RATE,
    env_bool,
    env_int,
    pcm_rms,
    resample_pcm16,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("vozia.moshi_gateway")

MIMI_FRAME_SIZE = 1_920  # 80 ms at 24 kHz, as required by Moshi/Mimi streaming.
MAX_TURN_SECONDS = 30
DEFAULT_EOT_MS = 720


def chunk_bytes(audio: bytes, size: int = 9_600) -> list[bytes]:
    return [audio[index : index + size] for index in range(0, len(audio), size)]


def as_record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def valid_token(websocket: WebSocket) -> bool:
    expected = (
        os.getenv("VOICE_DUPLEX_ENGINE_TOKEN", "").strip()
        or os.getenv("VOICE_ENGINE_TOKEN", "").strip()
    )
    if not expected:
        return env_bool("VOICE_ENGINE_ALLOW_UNAUTHENTICATED", False)
    return websocket.headers.get("authorization", "") == f"Bearer {expected}"


class DuplexSpeechToText:
    """Independent language-aware transcript tap for the duplex session."""

    def __init__(self, language: str) -> None:
        from faster_whisper import WhisperModel

        model_name = os.getenv("VOICE_DUPLEX_STT_MODEL", "large-v3-turbo")
        device = os.getenv("VOICE_DUPLEX_STT_DEVICE", os.getenv("VOICE_ENGINE_STT_DEVICE", "cuda"))
        compute_type = os.getenv(
            "VOICE_DUPLEX_STT_COMPUTE_TYPE",
            "float16" if device == "cuda" else "int8",
        )
        logger.info("loading duplex STT model=%s device=%s compute=%s", model_name, device, compute_type)
        self.model = WhisperModel(model_name, device=device, compute_type=compute_type)
        self.language = language

    def _transcribe_sync(self, audio: bytes) -> dict[str, Any]:
        samples = np.frombuffer(audio, dtype="<i2").astype(np.float32) / 32768.0
        segments, info = self.model.transcribe(
            samples,
            language=self.language,
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
            "language": getattr(info, "language", self.language),
        }

    async def transcribe(self, audio: bytes) -> dict[str, Any]:
        return await asyncio.to_thread(self._transcribe_sync, audio)


class MoshiRuntime:
    """Loads one local Moshi/Mimi checkpoint and creates isolated streams."""

    def __init__(self) -> None:
        self._loaded = False
        self._lock = threading.Lock()
        self.torch: Any = None
        self.mimi: Any = None
        self.moshi: Any = None
        self.lm_gen_factory: Any = None
        self.device = "cuda"
        self.repo = ""
        self.stt_by_language: dict[str, DuplexSpeechToText] = {}
        self._active_stream = False
        self._active_stream_lock = threading.Lock()

    def ensure_loaded(self) -> None:
        with self._lock:
            if self._loaded:
                return
            try:
                import torch
                from huggingface_hub import hf_hub_download
                from moshi.models import LMGen, loaders
            except ImportError as error:
                raise RuntimeError(
                    "Vendrava Duplex requires the optional Moshi stack: "
                    "torch, moshi and huggingface-hub"
                ) from error

            self.torch = torch
            self.device = os.getenv("VOICE_DUPLEX_MOSHI_DEVICE", "cuda").strip()
            if self.device.startswith("cuda") and not torch.cuda.is_available():
                raise RuntimeError("VOICE_DUPLEX_MOSHI_DEVICE requests CUDA but CUDA is unavailable")
            self.repo = os.getenv("VOICE_DUPLEX_MOSHI_REPO", "kyutai/moshiko-pytorch-bf16").strip()
            logger.info("loading Moshi/Mimi repo=%s device=%s", self.repo, self.device)
            mimi_weight = os.getenv("VOICE_DUPLEX_MIMI_WEIGHT", "").strip() or hf_hub_download(self.repo, loaders.MIMI_NAME)
            moshi_weight = os.getenv("VOICE_DUPLEX_MOSHI_WEIGHT", "").strip() or hf_hub_download(self.repo, loaders.MOSHI_NAME)
            mimi = loaders.get_mimi(mimi_weight, device=self.device)
            mimi.set_num_codebooks(8)
            moshi = loaders.get_moshi_lm(moshi_weight, device=self.device)
            self.mimi = mimi
            self.moshi = moshi
            self.lm_gen_factory = LMGen
            self._loaded = True

    async def create_stream(self) -> "MoshiStream":
        await asyncio.to_thread(self.ensure_loaded)
        with self._active_stream_lock:
            if self._active_stream:
                raise RuntimeError(
                    "Vendrava Duplex currently supports one Moshi stream per GPU; "
                    "batching must be enabled before increasing concurrency"
                )
            self._active_stream = True
        stream: MoshiStream | None = None
        try:
            stream = MoshiStream(self)
            await stream.initialize()
            return stream
        except Exception:
            if stream is not None:
                await stream.close()
            else:
                self.release_stream()
            raise

    def release_stream(self) -> None:
        with self._active_stream_lock:
            self._active_stream = False

    def get_stt(self, language: str) -> DuplexSpeechToText:
        normalized = language.strip().lower().replace("_", "-") or "es"
        if normalized.startswith("es"):
            normalized = "es"
        elif normalized.startswith("en"):
            normalized = "en"
        if normalized not in self.stt_by_language:
            self.stt_by_language[normalized] = DuplexSpeechToText(normalized)
        return self.stt_by_language[normalized]


class MoshiStream:
    """One stateful Mimi encoder -> Moshi LM -> Mimi decoder stream."""

    def __init__(self, runtime: MoshiRuntime) -> None:
        self.runtime = runtime
        temperature = float(os.getenv("VOICE_DUPLEX_TEMPERATURE", "0.8"))
        text_temperature = float(os.getenv("VOICE_DUPLEX_TEXT_TEMPERATURE", "0.7"))
        self.lm_gen = runtime.lm_gen_factory(
            runtime.moshi,
            temp=temperature,
            temp_text=text_temperature,
            top_k=250,
            top_k_text=25,
        )
        self._closed = False
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="vendrava-moshi")
        self._stream_context: Any = None
        self._initialized = False

    def _start_streaming(self) -> None:
        from contextlib import ExitStack

        stack = ExitStack()
        stack.enter_context(self.runtime.torch.no_grad())
        stack.enter_context(self.lm_gen.streaming(1))
        stack.enter_context(self.runtime.mimi.streaming(1))
        self._stream_context = stack
        self._initialized = True

    async def initialize(self) -> None:
        await asyncio.get_running_loop().run_in_executor(self._executor, self._start_streaming)

    def _step_sync(self, pcm24k: bytes) -> bytes:
        if self._closed:
            return b""
        torch = self.runtime.torch
        samples = np.frombuffer(pcm24k, dtype="<i2").astype(np.float32) / 32768.0
        if samples.size != MIMI_FRAME_SIZE:
            raise ValueError(f"Moshi requires {MIMI_FRAME_SIZE} samples per frame, got {samples.size}")
        wav = torch.from_numpy(samples).view(1, 1, MIMI_FRAME_SIZE).to(self.runtime.device)
        codes = self.runtime.mimi.encode(wav)
        tokens = self.lm_gen.step(codes)
        if tokens is None:
            return b""
        decoded = self.runtime.mimi.decode(tokens[:, 1:])
        audio = decoded.detach().float().clamp(-1.0, 1.0).cpu().numpy()
        if audio.ndim == 3:
            audio = audio[0, 0]
        elif audio.ndim == 2:
            audio = audio[0]
        return (audio * 32767.0).astype("<i2").tobytes()

    async def step(self, pcm24k: bytes) -> bytes:
        if not self._initialized:
            raise RuntimeError("Moshi stream is not initialized")
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._step_sync, pcm24k)

    def _close_sync(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._stream_context is not None:
            self._stream_context.close()
            self._stream_context = None

    async def close(self) -> None:
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(self._executor, self._close_sync)
        finally:
            self._executor.shutdown(wait=True, cancel_futures=True)
            self.runtime.release_stream()


@dataclass
class DuplexSession:
    websocket: WebSocket
    runtime: MoshiRuntime
    context: dict[str, Any] = field(default_factory=dict)
    system_prompt: str = ""
    session_id: str = ""
    language: str = "es-ES"
    eot_timeout_ms: int = field(default_factory=lambda: env_int("VOICE_DUPLEX_EOT_MS", DEFAULT_EOT_MS))
    closed: bool = False
    input_buffer: bytearray = field(default_factory=bytearray)
    transcript_buffer: bytearray = field(default_factory=bytearray)
    last_voice_at: float = 0.0
    in_speech: bool = False
    transcript_task: asyncio.Task[None] | None = None
    assistant_transcript_task: asyncio.Task[None] | None = None
    model_task: asyncio.Task[None] | None = None
    frame_queue: asyncio.Queue[bytes] = field(default_factory=lambda: asyncio.Queue(maxsize=64))
    assistant_audio_buffer: bytearray = field(default_factory=bytearray)
    ambience_seed: int = 0
    stream: MoshiStream | None = None

    async def send(self, payload: dict[str, Any]) -> None:
        if self.closed:
            return
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > MAX_EVENT_BYTES:
            raise RuntimeError("voice-engine event is too large")
        await self.websocket.send_text(encoded)

    async def start(self, payload: dict[str, Any]) -> None:
        self.context = as_record(payload.get("context"))
        agent = as_record(payload.get("agent"))
        self.system_prompt = str(agent.get("systemPrompt") or "")
        self.language = str(agent.get("language") or os.getenv("VOICE_DUPLEX_LANGUAGE", "es-ES"))
        self.session_id = str(payload.get("sessionId") or self.context.get("callSid") or "")
        self.stream = await self.runtime.create_stream()
        # Base Moshi is an audio dialogue model; the business prompt is retained
        # for traceability and future Vendrava fine-tuned checkpoints.
        await self.send({
            "type": "session.ready",
            "sessionId": self.session_id,
            "architecture": "duplex",
            "provider": "moshi-mimi-local",
            "model": os.getenv("VOICE_DUPLEX_MOSHI_REPO", "kyutai/moshiko-pytorch-bf16"),
            "language": self.language,
            "audio": {"inputSampleRate": INPUT_RATE, "outputSampleRate": OUTPUT_RATE, "encoding": "pcm_s16le"},
            "controlPlane": "node-policy-engine",
        })
        await self.send({
            "type": "duplex.prompt.ready",
            "role": "system",
            "metadata": {"promptAppliedBy": "trace-only-node-policy", "promptChars": len(self.system_prompt), "agentType": agent.get("agentType", "sales"), "callDirection": agent.get("callDirection", "both")},
        })
        self.model_task = asyncio.create_task(self.model_loop())

    async def receive_audio(self, audio16k: bytes) -> None:
        if len(audio16k) > MAX_EVENT_BYTES:
            raise RuntimeError("audio frame is too large")
        now = time.monotonic()
        speaking = pcm_rms(audio16k) >= float(os.getenv("VOICE_DUPLEX_VAD_THRESHOLD", "0.018"))
        if speaking:
            if not self.in_speech:
                self.in_speech = True
                self.last_voice_at = now
                self.schedule_assistant_transcript()
                await self.send({"type": "speech.started", "role": "user", "timestampMs": round(now * 1000)})
                await self.send({"type": "assistant.interrupt", "role": "user", "reason": "barge_in"})
            self.last_voice_at = now
            self.transcript_buffer.extend(audio16k)
        elif self.in_speech and (now - self.last_voice_at) * 1000 >= self.eot_timeout_ms:
            self.in_speech = False
            if self.transcript_buffer and (self.transcript_task is None or self.transcript_task.done()):
                audio = bytes(self.transcript_buffer)
                self.transcript_buffer.clear()
                self.transcript_task = asyncio.create_task(self.transcribe_user(audio))

        self.input_buffer.extend(resample_pcm16(audio16k, INPUT_RATE, OUTPUT_RATE))
        while len(self.input_buffer) >= MIMI_FRAME_SIZE * 2:
            frame = bytes(self.input_buffer[: MIMI_FRAME_SIZE * 2])
            del self.input_buffer[: MIMI_FRAME_SIZE * 2]
            try:
                self.frame_queue.put_nowait(frame)
            except asyncio.QueueFull:
                # Preserve realtime behavior: drop the oldest audio frame if the
                # GPU cannot keep up instead of building unbounded lag.
                _ = self.frame_queue.get_nowait()
                self.frame_queue.put_nowait(frame)
                await self.send({"type": "runtime.warning", "role": "system", "payload": {"code": "MOSHI_AUDIO_BACKPRESSURE"}})

    async def transcribe_user(self, audio: bytes) -> None:
        try:
            result = await self.runtime.get_stt(self.language).transcribe(audio)
            text = str(result.get("text") or "").strip()
            if not text or self.closed:
                return
            await self.send({"type": "turn.user_finished", "role": "user", "metadata": {"language": result.get("language", self.language)}})
            await self.send({
                "type": "transcript.final",
                "role": "prospecto",
                "text": text,
                "words": result.get("words", []),
                "metadata": {"language": result.get("language", self.language), "transcriptTap": "faster-whisper"},
            })
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning("duplex STT failed: %s", error)
            await self.send({"type": "runtime.warning", "role": "system", "payload": {"code": "DUPLEX_STT_FAILED", "message": str(error)[:200]}})

    def schedule_assistant_transcript(self) -> None:
        if not self.assistant_audio_buffer:
            return
        if self.assistant_transcript_task and not self.assistant_transcript_task.done():
            return
        audio = bytes(self.assistant_audio_buffer)
        self.assistant_audio_buffer.clear()
        self.assistant_transcript_task = asyncio.create_task(self.transcribe_assistant(audio))

    async def transcribe_assistant(self, audio24k: bytes) -> None:
        try:
            audio16k = resample_pcm16(audio24k, OUTPUT_RATE, INPUT_RATE)
            result = await self.runtime.get_stt(self.language).transcribe(audio16k, self.language)
            text = str(result.get("text") or "").strip()
            if text and not self.closed:
                await self.send({
                    "type": "transcript.final",
                    "role": "agente",
                    "text": text,
                    "words": result.get("words", []),
                    "metadata": {"language": result.get("language", self.language), "transcriptTap": "faster-whisper-output"},
                })
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning("duplex assistant transcript failed: %s", error)
            await self.send({"type": "runtime.warning", "role": "system", "payload": {"code": "DUPLEX_ASSISTANT_STT_FAILED", "message": str(error)[:200]}})

    async def model_loop(self) -> None:
        if self.stream is None:
            raise RuntimeError("Moshi stream not initialized")
        while not self.closed:
            frame = await self.frame_queue.get()
            audio = await self.stream.step(frame)
            if not audio or self.closed:
                continue
            self.assistant_audio_buffer.extend(audio)
            max_audio_bytes = MAX_TURN_SECONDS * OUTPUT_RATE * 2
            if len(self.assistant_audio_buffer) > max_audio_bytes:
                self.schedule_assistant_transcript()
            # Versión "arriesgada": ruido de línea sobre la voz de Moshi (el
            # STT paralelo transcribe el buffer limpio, sin ruido).
            level = float(os.getenv("VOICE_DUPLEX_AMBIENCE_LEVEL", "0") or 0)
            if level > 0:
                self.ambience_seed += 1
                audio = mix_line_noise(audio, level, self.ambience_seed)
            await self.send({"type": "tts.first_audio", "role": "assistant", "sampleRate": OUTPUT_RATE, "provider": "moshi-mimi-local"})
            for chunk in chunk_bytes(audio):
                if self.closed:
                    return
                await self.send({
                    "type": "assistant.audio",
                    "role": "assistant",
                    "sampleRate": OUTPUT_RATE,
                    "encoding": "pcm_s16le",
                    "pcmBase64": base64.b64encode(chunk).decode("ascii"),
                    "architecture": "duplex",
                })

    async def close(self) -> None:
        if self.closed:
            return
        self.schedule_assistant_transcript()
        for task in (self.model_task, self.transcript_task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        if self.assistant_transcript_task and not self.assistant_transcript_task.done():
            try:
                await self.assistant_transcript_task
            except asyncio.CancelledError:
                pass
        self.closed = True
        if self.stream is not None:
            await self.stream.close()
            self.stream = None


runtime = MoshiRuntime()
app = FastAPI(title="Vendrava Duplex Gateway", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "vendrava-duplex-gateway"}


@app.on_event("startup")
async def preload_models() -> None:
    """Con VOICE_DUPLEX_PRELOAD=true carga Moshi al arrancar (en background)
    para que la primera sesión no pague los ~30-60 s de carga del modelo."""
    if os.getenv("VOICE_DUPLEX_PRELOAD", "").strip().lower() in {"1", "true", "yes"}:
        threading.Thread(target=runtime.ensure_loaded, daemon=True, name="moshi-preload").start()


@app.get("/capabilities")
async def capabilities() -> dict[str, Any]:
    return {
        "service": "vendrava-duplex-gateway",
        "deployment": "self-hosted",
        "architecture": "duplex",
        "provider": "moshi-mimi-local",
        "model": os.getenv("VOICE_DUPLEX_MOSHI_REPO", "kyutai/moshiko-pytorch-bf16"),
        "language": os.getenv("VOICE_DUPLEX_LANGUAGE", "es-ES"),
        "sttTap": {"provider": "faster-whisper", "model": os.getenv("VOICE_DUPLEX_STT_MODEL", "large-v3-turbo")},
        "audio": {"inputSampleRate": INPUT_RATE, "modelSampleRate": OUTPUT_RATE, "outputSampleRate": OUTPUT_RATE, "encoding": "pcm_s16le"},
        "fullDuplex": True,
        "bargeIn": True,
        "businessAuthority": "node-policy-engine",
    }


@app.websocket("/ws")
async def duplex_websocket(websocket: WebSocket) -> None:
    if not valid_token(websocket):
        await websocket.close(code=1008, reason="unauthorized")
        return
    await websocket.accept()
    session: DuplexSession | None = None
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
                session = DuplexSession(websocket, runtime)
                await session.start(payload)
            elif session is None:
                raise RuntimeError("session.start required")
            elif event_type == "audio.in":
                encoded = payload.get("pcmBase64")
                if not isinstance(encoded, str):
                    raise RuntimeError("audio.in requires pcmBase64")
                await session.receive_audio(base64.b64decode(encoded, validate=True))
            elif event_type == "turn.config":
                session.eot_timeout_ms = max(250, min(int(payload.get("eotTimeoutMs", DEFAULT_EOT_MS)), 10_000))
            elif event_type == "session.end":
                break
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception as error:
        logger.exception("duplex session failed")
        if session is not None:
            try:
                await session.send({"type": "voice.error", "message": str(error)[:240]})
            except Exception:
                pass
        try:
            await websocket.close(code=1011, reason="duplex gateway error")
        except Exception:
            pass
    finally:
        if session is not None:
            await session.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "moshi_gateway:app",
        host=os.getenv("VOICE_DUPLEX_HOST", "0.0.0.0"),
        port=env_int("VOICE_DUPLEX_PORT", 9200),
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
