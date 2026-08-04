"""Ataca la cadencia plana: mide el ritmo real de Carlos y prueba referencias mas largas.

Metrica: nPVI sobre los intervalos entre nucleos silabicos (detectados por energia).
Es el indice estandar de "cuanto se diferencia una silaba de la siguiente en duracion".
nPVI bajo = todas las silabas duran lo mismo = eso que suena a robot.

Variantes que prueba, por cada frase:
  cross   — referencia = un solo clip distinto (lo que habia hasta ahora)
  dual    — referencia = los otros DOS clips concatenados (~11 s de prosodia real,
            sin incluir nunca el clip contra el que se compara)
"""
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = Path(__file__).parent
ref_text = json.loads((HERE / "ref_text.json").read_text(encoding="utf-8"))
paced = json.loads((HERE / "ref_text_paced.json").read_text(encoding="utf-8"))
names = sorted(ref_text)


def npvi(path):
    """Indice de variabilidad ritmica + tono + duracion."""
    y, sr = librosa.load(str(path), sr=16000, mono=True)
    y, _ = librosa.effects.trim(y, top_db=35)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time", backtrack=True)
    d = np.diff(onsets)
    if len(d) < 3:
        return 0.0, 0.0, len(y) / sr
    pairs = [abs(a - b) / ((a + b) / 2) for a, b in zip(d, d[1:])]
    f0, _, _ = librosa.pyin(y, fmin=60, fmax=350, sr=sr)
    f0 = f0[~np.isnan(f0)]
    f0_std = float(np.std(12 * np.log2(f0 / np.median(f0)))) if len(f0) > 5 else 0.0
    return 100 * float(np.mean(pairs)), f0_std, len(y) / sr


print("=== REAL ===", flush=True)
target = {}
for n in names:
    target[n] = npvi(HERE / "ref" / n)
    print(f"{n[-9:-4]}  nPVI={target[n][0]:.1f}  f0_std={target[n][1]:.2f} st  {target[n][2]:.2f}s", flush=True)

# Referencia dual: los otros dos clips pegados, con su transcripcion pegada
dual = {}
for i, n in enumerate(names):
    others = [o for o in names if o != n]
    y = np.concatenate([librosa.load(str(HERE / "ref" / o), sr=24000, mono=True)[0] for o in others])
    dual[n] = ((y, 24000), " ".join(ref_text[o] for o in others))

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)

dest = HERE / "cadence"
dest.mkdir(exist_ok=True)
print("\n=== SINTETICO ===", flush=True)
for i, n in enumerate(names):
    cross = names[(i + 2) % len(names)]
    variants = {
        "cross": (str(HERE / "ref" / cross), ref_text[cross]),
        "dual": dual[n],
    }
    for tag, (audio, rtext) in variants.items():
        for t in (0.9, 1.3):
            wavs, sr = model.generate_voice_clone(
                text=paced[n],
                language="Spanish",
                ref_audio=audio,
                ref_text=rtext,
                do_sample=True,
                temperature=t,
                top_p=0.95,
                top_k=50,
            )
            out = dest / f"{n[-9:-4]}_{tag}_t{t}.wav"
            sf.write(out, wavs[0], sr)
            p, f, d = npvi(out)
            tp, tf, td = target[n]
            print(f"{out.name}  nPVI={p:.1f} ({p - tp:+.1f})  f0_std={f:.2f} ({f - tf:+.2f})  {d:.2f}s ({d - td:+.2f})", flush=True)
