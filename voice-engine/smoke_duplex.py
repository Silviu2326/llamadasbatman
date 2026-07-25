"""Staging smoke test for a real Moshi/Mimi gateway.

Run after starting ``moshi_gateway.py`` with model weights installed:

    python smoke_duplex.py

It sends a short synthetic English speech-shaped signal and verifies that the
gateway returns the session handshake, full-duplex interruption and audio.
"""

from __future__ import annotations

import asyncio
import base64
import json
import math
import os
import struct

import websockets


def frame_16k(frame_index: int) -> bytes:
    samples = []
    for offset in range(320):  # 20 ms at 16 kHz.
        t = (frame_index * 320 + offset) / 16_000
        value = int(2_000 * math.sin(2 * math.pi * 220 * t))
        samples.append(value)
    return struct.pack(f"<{len(samples)}h", *samples)


async def run() -> None:
    url = os.getenv("VOICE_DUPLEX_SMOKE_URL", "ws://127.0.0.1:9200/ws")
    token = os.getenv("VOICE_DUPLEX_ENGINE_TOKEN", "")
    headers = {"Authorization": f"Bearer {token}"} if token else None
    events: list[dict[str, object]] = []

    async with websockets.connect(url, additional_headers=headers, max_size=512 * 1024) as socket:
        async def receive() -> None:
            async for raw in socket:
                events.append(json.loads(raw))

        receiver = asyncio.create_task(receive())
        await socket.send(json.dumps({
            "type": "session.start",
            "sessionId": "smoke-duplex",
            "context": {"callSid": "smoke-duplex", "orgId": "smoke", "leadId": "smoke"},
            "agent": {"language": "en-US", "systemPrompt": "You are an English sales assistant."},
            "audio": {"inputSampleRate": 16_000, "outputSampleRate": 24_000, "encoding": "pcm_s16le"},
        }))
        for index in range(18):
            audio = frame_16k(index)
            await socket.send(json.dumps({
                "type": "audio.in",
                "seq": index,
                "sampleRate": 16_000,
                "encoding": "pcm_s16le",
                "pcmBase64": base64.b64encode(audio).decode("ascii"),
            }))
            await asyncio.sleep(0.02)
        await asyncio.sleep(3)
        await socket.send(json.dumps({"type": "session.end", "reason": "smoke_complete"}))
        receiver.cancel()
        try:
            await receiver
        except asyncio.CancelledError:
            pass

    types = {str(event.get("type")) for event in events}
    required = {"session.ready", "assistant.interrupt", "assistant.audio"}
    missing = required - types
    if missing:
        raise SystemExit(f"Duplex smoke failed; missing events: {sorted(missing)}; received={sorted(types)}")
    print(f"Duplex smoke OK: {len(events)} events, audio returned, barge-in observed")


if __name__ == "__main__":
    asyncio.run(run())
