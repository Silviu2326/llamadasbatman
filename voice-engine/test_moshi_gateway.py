"""Offline tests for the Vendrava Duplex gateway contract.

These tests intentionally do not load CUDA, Moshi weights or Whisper. GPU
inference is covered by the staging smoke test described in the runbook.
"""

from __future__ import annotations

import base64
import asyncio
import json
import unittest

import numpy as np

from moshi_gateway import MIMI_FRAME_SIZE, OUTPUT_RATE, capabilities, chunk_bytes
from moshi_gateway import DuplexSession
from server import resample_pcm16


class MoshiGatewayContractTests(unittest.TestCase):
    def test_mimi_frame_is_80ms_at_24khz(self) -> None:
        self.assertEqual(MIMI_FRAME_SIZE, 1_920)
        self.assertEqual(MIMI_FRAME_SIZE / OUTPUT_RATE, 0.08)

    def test_pcm_resample_from_node_rate_to_mimi_rate(self) -> None:
        input_samples = np.zeros(320, dtype="<i2").tobytes()  # 20 ms at 16 kHz.
        output = resample_pcm16(input_samples, 16_000, OUTPUT_RATE)
        self.assertEqual(len(output) // 2, 480)  # 20 ms at 24 kHz.

    def test_audio_chunks_are_bounded_and_base64_safe(self) -> None:
        audio = bytes(range(256)) * 100
        chunks = chunk_bytes(audio, 960)
        self.assertEqual(b"".join(chunks), audio)
        encoded = base64.b64encode(chunks[0]).decode("ascii")
        payload = {"type": "assistant.audio", "sampleRate": OUTPUT_RATE, "pcmBase64": encoded}
        self.assertEqual(json.loads(json.dumps(payload))["sampleRate"], 24_000)

    def test_capabilities_are_spanish_full_duplex_and_node_controlled(self) -> None:
        # The FastAPI handler has no model side effects and is safe to inspect offline.
        result = asyncio.run(capabilities())
        self.assertEqual(result["architecture"], "duplex")
        self.assertEqual(result["language"], "es-ES")
        self.assertTrue(result["fullDuplex"])
        self.assertEqual(result["businessAuthority"], "node-policy-engine")

    def test_duplex_session_streams_audio_and_interrupts_on_barge_in(self) -> None:
        async def run() -> list[dict[str, object]]:
            websocket = FakeWebSocket()
            session = DuplexSession(websocket, FakeRuntime())  # type: ignore[arg-type]
            await session.start({
                "type": "session.start",
                "sessionId": "fake-call",
                "context": {"callSid": "fake-call"},
                "agent": {"language": "es-ES", "systemPrompt": "Agente comercial en español"},
            })
            speech = np.full(320, 2_000, dtype="<i2").tobytes()
            for _ in range(4):
                await session.receive_audio(speech)
            await asyncio.sleep(0.03)
            await session.close()
            return websocket.messages

        messages = asyncio.run(run())
        types = [str(message.get("type")) for message in messages]
        self.assertIn("session.ready", types)
        self.assertIn("assistant.interrupt", types)
        self.assertIn("assistant.audio", types)
        self.assertIn("transcript.final", types)
        self.assertTrue(any(message.get("role") == "agente" for message in messages))


class FakeWebSocket:
    def __init__(self) -> None:
        self.messages: list[dict[str, object]] = []

    async def send_text(self, value: str) -> None:
        self.messages.append(json.loads(value))


class FakeStream:
    async def step(self, _frame: bytes) -> bytes:
        return b"\x01\x00" * 480

    async def close(self) -> None:
        return None


class FakeSpeechToText:
    async def transcribe(self, _audio: bytes, language: str | None = None) -> dict[str, object]:
        return {"text": "sí, me parece bien", "words": [], "language": language or "es"}


class FakeRuntime:
    async def create_stream(self) -> FakeStream:
        return FakeStream()

    def get_stt(self, _language: str = "es-ES") -> FakeSpeechToText:
        return FakeSpeechToText()


if __name__ == "__main__":
    unittest.main()
