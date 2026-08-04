"""Transcribe los clips de referencia (ES) para tener el ref_text que pide Qwen3-TTS."""
import json
from pathlib import Path

from transformers import pipeline

asr = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-large-v3-turbo",
    device=0,
    torch_dtype="float16",
)

out = {}
for wav in sorted(Path(__file__).parent.joinpath("ref").glob("*.wav")):
    r = asr(str(wav), generate_kwargs={"language": "spanish", "task": "transcribe"})
    out[wav.name] = r["text"].strip()
    print(f"{wav.name}: {out[wav.name]}", flush=True)

Path(__file__).parent.joinpath("ref_text.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
)
