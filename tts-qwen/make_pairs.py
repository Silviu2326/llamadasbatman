"""Genera, por cada nota de voz real de Carlos, un sintetico que dice EXACTAMENTE lo mismo.

Cruzado a proposito: la frase de un clip se sintetiza usando OTRO clip como referencia,
para que el sintetico no salga del mismo audio contra el que se compara.
"""
import json
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = Path(__file__).parent
ref_text = json.loads((HERE / "ref_text.json").read_text(encoding="utf-8"))
# El texto a sintetizar lleva la puntuacion que reproduce las pausas reales de Carlos
# (ver pauses.py). La transcripcion de la referencia se queda sin tocar.
paced = json.loads((HERE / "ref_text_paced.json").read_text(encoding="utf-8"))
names = sorted(ref_text)  # 52_15, 52_53, 53_11

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)

dest = HERE / "pairs_raw"
dest.mkdir(exist_ok=True)
for i, target in enumerate(names):
    voice = names[(i + 2) % len(names)]  # ponytail: rota la referencia, nunca la del propio texto
    wavs, sr = model.generate_voice_clone(
        text=paced[target],
        language="Spanish",
        ref_audio=str(HERE / "ref" / voice),
        ref_text=ref_text[voice],
    )
    out = dest / f"syn_{Path(target).stem[-5:]}.wav"
    sf.write(out, wavs[0], sr)
    print(f"[qwen] {out}  texto de {Path(target).stem[-5:]}  voz de {Path(voice).stem[-5:]}", flush=True)
