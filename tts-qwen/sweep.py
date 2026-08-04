"""Barrido de temperatura: genera cada frase a varias temperaturas y mide si la cadencia
se parece a la de Carlos.

Dos numeros por clip, ambos comparados contra el real:
  f0_std  — variacion de tono en semitonos. Bajo = monotono.
  rms_std — variacion de volumen en dB. Bajo = todas las silabas igual de fuertes.
"""
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = Path(__file__).parent
TEMPS = [0.9, 1.2, 1.5]
ref_text = json.loads((HERE / "ref_text.json").read_text(encoding="utf-8"))
paced = json.loads((HERE / "ref_text_paced.json").read_text(encoding="utf-8"))
names = sorted(ref_text)


def prosody(path_or_y, sr=None):
    y, sr = librosa.load(str(path_or_y), sr=16000, mono=True) if sr is None else (path_or_y, sr)
    y, _ = librosa.effects.trim(y, top_db=35)
    f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=350, sr=sr)
    f0 = f0[~np.isnan(f0)]
    f0_std = float(np.std(12 * np.log2(f0 / np.median(f0)))) if len(f0) > 5 else 0.0
    db = librosa.amplitude_to_db(librosa.feature.rms(y=y, hop_length=160)[0], ref=np.max)
    return f0_std, float(np.std(db[db > -45])), len(y) / sr


print("=== REAL ===", flush=True)
target = {}
for n in names:
    target[n] = prosody(HERE / "ref" / n)
    print(f"{n[-9:-4]}  f0_std={target[n][0]:.2f} st  rms_std={target[n][1]:.2f} dB  {target[n][2]:.2f}s", flush=True)

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)

dest = HERE / "sweep"
dest.mkdir(exist_ok=True)
print("\n=== SINTETICO ===", flush=True)
for i, n in enumerate(names):
    voice = names[(i + 2) % len(names)]  # misma referencia cruzada que en make_pairs.py
    for t in TEMPS:
        wavs, sr = model.generate_voice_clone(
            text=paced[n],
            language="Spanish",
            ref_audio=str(HERE / "ref" / voice),
            ref_text=ref_text[voice],
            do_sample=True,
            temperature=t,
            top_p=0.95,
            top_k=50,
        )
        out = dest / f"syn_{n[-9:-4]}_t{t}.wav"
        sf.write(out, wavs[0], sr)
        f0s, rms, dur = prosody(out)
        tf0, trms, tdur = target[n]
        print(
            f"{out.name}  f0_std={f0s:.2f} ({f0s - tf0:+.2f})  "
            f"rms_std={rms:.2f} ({rms - trms:+.2f})  {dur:.2f}s ({dur - tdur:+.2f})",
            flush=True,
        )
