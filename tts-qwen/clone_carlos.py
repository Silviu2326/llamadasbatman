"""Clona la voz de Carlos con Qwen3-TTS y genera la frase de apertura de llamada.

Uso:  .venv\\Scripts\\python.exe clone_carlos.py ["texto a decir"]
Salida: out/carlos_<clip>.wav — un WAV por clip de referencia, para elegir el mejor.
"""
import json
import sys
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = Path(__file__).parent
TEXT = sys.argv[1] if len(sys.argv) > 1 else (
    "Hola, buenos días. Soy Carlos, de Padeltop. ¿Podría hablar contigo un minuto?"
)

ref_text = json.loads((HERE / "ref_text.json").read_text(encoding="utf-8"))

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",  # ponytail: sdpa en vez de flash_attention_2 — no compila en Windows
)

(HERE / "out").mkdir(exist_ok=True)
for name, text in ref_text.items():
    wavs, sr = model.generate_voice_clone(
        text=TEXT,
        language="Spanish",
        ref_audio=str(HERE / "ref" / name),
        ref_text=text,
    )
    dest = HERE / "out" / f"carlos_{Path(name).stem[-5:]}.wav"
    sf.write(dest, wavs[0], sr)
    print(f"[qwen] {dest}", flush=True)
