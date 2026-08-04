"""nPVI (variabilidad ritmica silaba a silaba) sobre los audios ya generados.

Uso: python measure_cadence.py <carpeta> [<carpeta> ...]
"""
import sys
from pathlib import Path

import librosa
import numpy as np

HERE = Path(__file__).parent
MIN_IOI = 0.05  # onsets mas juntos que esto son el mismo ataque detectado dos veces


def npvi(path):
    y, sr = librosa.load(str(path), sr=16000, mono=True)
    y, _ = librosa.effects.trim(y, top_db=35)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time", backtrack=True)
    d = np.diff(np.unique(onsets))
    d = d[d >= MIN_IOI]
    if len(d) < 3:
        return float("nan"), len(y) / sr, len(d)
    pairs = [abs(a - b) / ((a + b) / 2) for a, b in zip(d, d[1:])]
    return 100 * float(np.mean(pairs)), len(y) / sr, len(d)


for folder in sys.argv[1:]:
    print(f"--- {folder}")
    for f in sorted((HERE / folder).glob("*.wav")):
        p, dur, n = npvi(f)
        print(f"  {f.name:32s} nPVI={p:6.1f}  silabas={n:3d}  {dur:.2f}s")
