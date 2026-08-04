"""Mide donde y cuanto calla Carlos en cada nota real y reescribe el texto con esas pausas.

Whisper da tramos por palabra que son contiguos: el silencio queda absorbido dentro de la
palabra anterior (su "Hola," ocupa 1.4 s). Asi que los silencios se detectan por energia
sobre la onda y se atribuyen a la palabra cuyo tramo los contiene. Cada silencio se
convierte en puntuacion, que es lo unico que entiende Qwen3-TTS para alargar un hueco.
"""
import json
import re
from pathlib import Path

import librosa
import numpy as np
from transformers import pipeline

HERE = Path(__file__).parent
SIL_MIN = 0.15          # silencio mas corto que esto no es una pausa perceptible
HOP = 0.010             # 10 ms
FLOOR_DB = -35.0        # respecto al pico del clip

# Whisper transcribe bien la frase pero se inventa la marca; se corrige al final.
FIX = {"PaddleTop": "Padeltop", "Padre Top": "Padeltop", "Padel Top": "Padeltop",
       "Padletop": "Padeltop", "Pailtop": "Padeltop", "Silviu": "Silvio"}

asr = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-large-v3",  # ponytail: turbo no trae alignment heads
    device=0,
    dtype="float16",
)


def silences(path):
    """Intervalos (inicio, fin) de silencio interno, en segundos."""
    y, sr = librosa.load(str(path), sr=16000, mono=True)
    hop = int(HOP * sr)
    db = librosa.amplitude_to_db(librosa.feature.rms(y=y, hop_length=hop)[0], ref=np.max)
    quiet = db < FLOOR_DB
    out, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        elif not q and start is not None:
            out.append((start * HOP, i * HOP))
            start = None
    voiced = np.flatnonzero(~quiet)
    if len(voiced) == 0:
        return []
    lo, hi = voiced[0] * HOP, voiced[-1] * HOP  # descarta el silencio de cabeza y cola
    return [(a, b) for a, b in out if b - a >= SIL_MIN and a > lo and b < hi]


paced, report = {}, []
for wav in sorted((HERE / "ref").glob("*.wav")):
    chunks = asr(
        str(wav),
        return_timestamps="word",
        generate_kwargs={"language": "spanish", "task": "transcribe"},
    )["chunks"]
    sils = silences(wav)

    # Cada silencio se lleva al limite entre palabras mas cercano a su centro: los tramos
    # de Whisper son contiguos, asi que el silencio cae "dentro" de una palabra u otra
    # segun donde corte, y adjudicarlo a la palabra parte la frase por un sitio raro.
    bounds = [c["timestamp"][1] for c in chunks[:-1]]
    pause_at = {}
    for s, e in sils:
        mid = (s + e) / 2
        i = min(range(len(bounds)), key=lambda k: abs(bounds[k] - mid))
        pause_at[i] = pause_at.get(i, 0) + (e - s)

    parts = []
    for i, c in enumerate(chunks):
        w = c["text"].strip()
        parts.append(w)
        dur = pause_at.get(i, 0)
        if dur >= 0.35:
            parts.append("...")           # pausa larga
        elif dur >= SIL_MIN and not w.endswith((",", ".", "?", "!", "…")):
            parts.append(",")             # pausa corta
        if dur >= SIL_MIN:
            report.append((wav.name[-10:-4], f"tras '{w}'", round(dur, 2)))

    text = re.sub(r"\s+([,.?!…])", r"\1", " ".join(parts)).replace(".  ...", "...")
    for bad, good in FIX.items():
        text = text.replace(bad, good)
    paced[wav.name] = text
    print(f"{wav.name}\n  {text}", flush=True)

print(f"\npausas detectadas: {report}", flush=True)
(HERE / "ref_text_paced.json").write_text(
    json.dumps(paced, ensure_ascii=False, indent=2), encoding="utf-8"
)
