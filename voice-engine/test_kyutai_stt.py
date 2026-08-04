"""Tests de la logica pura de kyutai_stt (sin torch ni modelo)."""

import numpy as np

from kyutai_stt import TurnState, resample_16k_to_24k


def events_of(kinds):
    return [k for k, _ in kinds]


def test_resample_ratio():
    pcm = np.zeros(1600, dtype="<i2").tobytes()  # 100 ms a 16 kHz
    out = resample_16k_to_24k(pcm)
    assert out.size == 2400  # 100 ms a 24 kHz


def test_turn_flow_with_semantic_vad():
    t = TurnState(eot_timeout_ms=1500, eot_threshold=0.6, eager_threshold=0.35)
    ev = t.feed(" hola", 0.0, 10.0)
    assert events_of(ev) == ["speech.started", "partial"]
    ev = t.feed(" que tal", 0.0, 10.5)
    assert events_of(ev) == ["partial"]
    # VAD dudoso -> eager_end una sola vez
    ev = t.feed("", 0.4, 10.8)
    assert events_of(ev) == ["eager_end"]
    assert events_of(t.feed("", 0.4, 10.9)) == []
    # el hablante sigue -> turn_resumed
    ev = t.feed(" perdona", 0.0, 11.0)
    assert events_of(ev) == ["turn_resumed", "partial"]
    # VAD seguro -> final con texto acumulado y duracion
    ev = t.feed("", 0.9, 11.5)
    assert events_of(ev) == ["final"]
    payload = ev[0][1]
    assert payload["text"] == "hola que tal perdona"
    assert payload["durationSec"] == 1.5
    assert not t.speaking and t.text == ""


def test_timeout_fallback_final():
    t = TurnState(eot_timeout_ms=1000)
    t.feed(" si", 0.0, 5.0)
    assert events_of(t.feed("", 0.0, 5.5)) == []  # aun dentro del timeout
    ev = t.feed("", 0.0, 6.1)
    assert events_of(ev) == ["final"]
    assert ev[0][1]["text"] == "si"


def test_silence_without_speech_emits_nothing():
    t = TurnState()
    assert t.feed("", 0.99, 1.0) == []


if __name__ == "__main__":
    test_resample_ratio()
    test_turn_flow_with_semantic_vad()
    test_timeout_fallback_final()
    test_silence_without_speech_emits_nothing()
    print("ok")
