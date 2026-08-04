"""Streaming STT con Kyutai stt-1b-en_fr (semantic VAD incluido).

WebSocket /stt montado por server.py:
  entrada  binaria : PCM16 mono 16 kHz crudo
  entrada  texto   : {"type":"config","eotTimeoutMs":1500,"eotThreshold":0.6,"eagerEotThreshold":0.35}
  salida   texto   : {"type":"ready"|"speech.started"|"partial"|"eager_end"|"turn_resumed"|"final"}

Eventos calcados a la semantica de Deepgram Flux para que el cliente Node
(backend/src/voice/stt/localKyutai.ts) sea intercambiable con DeepgramSTT.

Env: KYUTAI_STT_REPO   (default kyutai/stt-1b-en_fr; kyutai/stt-2.6b-en para en-only)
     KYUTAI_STT_DEVICE (default cuda)

Requiere el extra opcional "stt" del pyproject (moshi, torch).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("vozia.kyutai_stt")

IN_RATE = 16_000
MODEL_RATE = 24_000
FRAME_SECONDS = 0.08  # Mimi: 1920 muestras a 24 kHz


def resample_16k_to_24k(pcm16: bytes) -> np.ndarray:
    """PCM16 16 kHz -> float32 24 kHz (interpolacion lineal, suficiente para voz telefonica)."""
    samples = np.frombuffer(pcm16, dtype="<i2").astype(np.float32) / 32768.0
    if samples.size == 0:
        return samples
    target_len = int(round(samples.size * MODEL_RATE / IN_RATE))
    positions = np.linspace(0, samples.size - 1, target_len)
    return np.interp(positions, np.arange(samples.size), samples).astype(np.float32)


class TurnState:
    """Maquina de turnos pura (testeable sin torch): acumula texto y decide eventos.

    feed(piece, vad_prob, now) -> lista de eventos [(tipo, payload)] a emitir.
    """

    def __init__(self, eot_timeout_ms: int = 1500, eot_threshold: float = 0.6,
                 eager_threshold: float = 0.35) -> None:
        self.eot_timeout_ms = eot_timeout_ms
        self.eot_threshold = eot_threshold
        self.eager_threshold = eager_threshold
        self.text = ""
        self.speaking = False
        self.eager_sent = False
        self.last_token_at = 0.0
        self.turn_started_at = 0.0

    def _final(self, now: float, confidence: float) -> tuple[str, dict[str, Any]]:
        payload = {
            "text": self.text.strip(),
            "confidence": round(confidence, 3),
            "durationSec": round(max(0.0, now - self.turn_started_at), 2),
        }
        self.text = ""
        self.speaking = False
        self.eager_sent = False
        return ("final", payload)

    def feed(self, piece: str, vad_prob: float, now: float) -> list[tuple[str, dict[str, Any]]]:
        events: list[tuple[str, dict[str, Any]]] = []
        if piece:
            if not self.speaking:
                self.speaking = True
                self.turn_started_at = now
                events.append(("speech.started", {}))
            elif self.eager_sent:
                self.eager_sent = False
                events.append(("turn_resumed", {}))
            self.text += piece
            self.last_token_at = now
            events.append(("partial", {"text": self.text.strip()}))
            return events

        if not self.speaking or not self.text.strip():
            return events

        if vad_prob >= self.eot_threshold:
            events.append(self._final(now, vad_prob))
        elif vad_prob >= self.eager_threshold and not self.eager_sent:
            self.eager_sent = True
            events.append(("eager_end", {"text": self.text.strip(), "confidence": round(vad_prob, 3)}))
        elif (now - self.last_token_at) * 1000 >= self.eot_timeout_ms:
            events.append(self._final(now, 0.9))
        return events


class KyutaiRuntime:
    """Carga unica del checkpoint. Un solo stream activo por GPU (como el gateway Moshi)."""

    def __init__(self) -> None:
        self._loaded = False
        self._lock = threading.Lock()
        self._active = False
        self._active_lock = threading.Lock()

    def ensure_loaded(self) -> None:
        with self._lock:
            if self._loaded:
                return
            # sin triton en Windows torch.compile revienta; moshi respeta esta env
            os.environ.setdefault("NO_TORCH_COMPILE", "1")
            try:
                import torch
                from moshi.models import LMGen, loaders
            except ImportError as error:
                raise RuntimeError(
                    "Kyutai STT requiere el extra opcional: pip install -e '.[stt]'"
                ) from error
            self.torch = torch
            self.device = os.getenv("KYUTAI_STT_DEVICE", "cuda").strip()
            if self.device.startswith("cuda") and not torch.cuda.is_available():
                raise RuntimeError("KYUTAI_STT_DEVICE pide CUDA pero CUDA no esta disponible")
            self.repo = os.getenv("KYUTAI_STT_REPO", "kyutai/stt-1b-en_fr").strip()
            logger.info("cargando Kyutai STT repo=%s device=%s", self.repo, self.device)
            info = loaders.CheckpointInfo.from_hf_repo(self.repo)
            self.mimi = info.get_mimi(device=self.device)
            self.tokenizer = info.get_text_tokenizer()
            if self.device.startswith("cuda"):
                # Turing (RTX 20xx) no tiene bf16 nativo -> fp16 salvo override
                requested = os.getenv("KYUTAI_STT_DTYPE", "").strip()
                if requested:
                    dtype = getattr(torch, requested)
                elif torch.cuda.is_bf16_supported():
                    dtype = torch.bfloat16
                else:
                    dtype = torch.float16
            else:
                dtype = torch.float32
            self.lm = info.get_moshi(device=self.device, dtype=dtype)
            self.lm_gen_factory = LMGen
            stt_cfg = getattr(info, "stt_config", None) or {}
            self.silence_prefix_frames = round(float(stt_cfg.get("audio_silence_prefix_seconds", 1.0)) / FRAME_SECONDS)
            # el modelo emite texto con retardo: al cerrar turno se empujan frames de
            # silencio para vaciar los tokens pendientes antes del final
            self.flush_frames = round(float(stt_cfg.get("audio_delay_seconds", 0.5)) / FRAME_SECONDS) + 2
            raw_cfg = getattr(info, "raw_config", None) or {}
            self.skip_tokens = {0, int(raw_cfg.get("text_padding_token_id", 3))}
            self.frame_size = int(self.mimi.frame_size)
            self._loaded = True

    def acquire(self) -> None:
        with self._active_lock:
            if self._active:
                # ponytail: un stream por GPU — para concurrencia real hace falta batching
                raise RuntimeError("ya hay un stream Kyutai STT activo en esta GPU")
            self._active = True

    def release(self) -> None:
        with self._active_lock:
            self._active = False


class KyutaiStream:
    """Un stream Mimi->LM con estado. Todos los pasos torch van a un executor propio."""

    def __init__(self, runtime: KyutaiRuntime) -> None:
        self.rt = runtime
        self.lm_gen = runtime.lm_gen_factory(runtime.lm, temp=0, temp_text=0.0)
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="kyutai-stt")
        self._ctx: Any = None
        self._closed = False

    def _open_sync(self) -> None:
        from contextlib import ExitStack

        stack = ExitStack()
        stack.enter_context(self.rt.torch.no_grad())
        stack.enter_context(self.lm_gen.streaming(1))
        stack.enter_context(self.rt.mimi.streaming(1))
        self._ctx = stack
        silence = np.zeros(self.rt.frame_size, dtype=np.float32)
        for _ in range(self.rt.silence_prefix_frames):
            self._step_sync(silence)

    def _step_sync(self, frame_f32: np.ndarray) -> tuple[str, float]:
        torch = self.rt.torch
        wav = torch.from_numpy(frame_f32).view(1, 1, -1).to(self.rt.device)
        codes = self.rt.mimi.encode(wav)
        text_tokens, vad_heads = self.lm_gen.step_with_extra_heads(codes)
        vad_prob = 0.0
        if vad_heads:
            vad_prob = float(vad_heads[2][0, 0, 0].cpu().item())
        piece = ""
        if text_tokens is not None:
            token = int(text_tokens[0, 0, 0].item())
            if token not in self.rt.skip_tokens:
                piece = self.rt.tokenizer.id_to_piece(token).replace("▁", " ")
        return piece, vad_prob

    def _flush_sync(self) -> str:
        silence = np.zeros(self.rt.frame_size, dtype=np.float32)
        collected = ""
        for _ in range(self.rt.flush_frames):
            piece, _ = self._step_sync(silence)
            collected += piece
        return collected

    async def open(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._executor, self._open_sync)

    async def step(self, frame_f32: np.ndarray) -> tuple[str, float]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._step_sync, frame_f32)

    async def flush(self) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._flush_sync)

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True

        def _close() -> None:
            if self._ctx is not None:
                self._ctx.close()

        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(self._executor, _close)
        finally:
            self._executor.shutdown(wait=True, cancel_futures=True)
            self.rt.release()


runtime = KyutaiRuntime()


async def handle_stt(websocket: WebSocket, valid_token: Callable[[WebSocket], bool]) -> None:
    if not valid_token(websocket):
        await websocket.close(code=1008, reason="unauthorized")
        return
    await websocket.accept()

    try:
        await asyncio.to_thread(runtime.ensure_loaded)
        runtime.acquire()
    except Exception as error:
        logger.exception("Kyutai STT no disponible")
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(error)[:240]}))
            await websocket.close(code=1011)
        except Exception:
            pass
        return

    stream = KyutaiStream(runtime)
    turn = TurnState()
    pending = np.empty(0, dtype=np.float32)
    frame_bytes_lock = asyncio.Lock()

    async def emit(kind: str, payload: dict[str, Any]) -> None:
        await websocket.send_text(json.dumps({"type": kind, **payload}, ensure_ascii=False))

    async def finalize_with_flush(payload: dict[str, Any]) -> None:
        extra = await stream.flush()
        if extra.strip():
            payload["text"] = (payload["text"] + extra).strip()
        await emit("final", payload)

    async def watchdog() -> None:
        # fallback por timeout cuando el VAD semantico no dispara (p.ej. ruido de linea)
        while True:
            await asyncio.sleep(0.25)
            async with frame_bytes_lock:
                events = turn.feed("", 0.0, time.monotonic())
            for kind, payload in events:
                if kind == "final":
                    await finalize_with_flush(payload)
                else:
                    await emit(kind, payload)

    watchdog_task: asyncio.Task[None] | None = None
    try:
        await stream.open()
        await emit("ready", {"model": runtime.repo})
        watchdog_task = asyncio.create_task(watchdog())

        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("text") is not None:
                try:
                    cfg = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                if cfg.get("type") == "config":
                    if "eotTimeoutMs" in cfg:
                        turn.eot_timeout_ms = max(250, min(int(cfg["eotTimeoutMs"]), 10_000))
                    if "eotThreshold" in cfg:
                        turn.eot_threshold = float(cfg["eotThreshold"])
                    if "eagerEotThreshold" in cfg:
                        turn.eager_threshold = float(cfg["eagerEotThreshold"])
                continue

            audio = message.get("bytes")
            if not audio:
                continue
            pending = np.concatenate([pending, resample_16k_to_24k(audio)])
            while pending.size >= runtime.frame_size:
                frame = pending[: runtime.frame_size]
                pending = pending[runtime.frame_size:]
                piece, vad_prob = await stream.step(frame)
                async with frame_bytes_lock:
                    events = turn.feed(piece, vad_prob, time.monotonic())
                for kind, payload in events:
                    if kind == "final":
                        await finalize_with_flush(payload)
                    else:
                        await emit(kind, payload)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("sesion Kyutai STT fallida")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        if watchdog_task is not None:
            watchdog_task.cancel()
        await stream.close()
