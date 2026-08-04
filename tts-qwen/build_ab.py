"""Monta la prueba a ciegas: recorta el silencio de cabeza y cola de todos los clips
(el real trae el arranque y el corte de la grabacion de WhatsApp, y eso solo delata
cual es cual) y los pasa por el codec telefonico, 8 kHz mu-law.
"""
import subprocess
import tempfile
from pathlib import Path

import librosa
import soundfile as sf

HERE = Path(__file__).parent
AB = HERE / "ab"
AB.mkdir(exist_ok=True)

REF = "ref/WhatsApp_Ptt_2026-07-30_at_15_{}.wav"
SYN = "pairs_raw/syn_{}.wav"
# (destino, origen) — quien es real y quien sintetico esta en ab/SOLUCION.md
LAYOUT = [
    ("par1_a", SYN.format("52_15")), ("par1_b", REF.format("52_15")),
    ("par2_a", REF.format("52_53")), ("par2_b", SYN.format("52_53")),
    ("par3_a", SYN.format("53_11")), ("par3_b", REF.format("53_11")),
]

for name, src in LAYOUT:
    y, sr = librosa.load(str(HERE / src), sr=24000, mono=True)
    y, _ = librosa.effects.trim(y, top_db=35)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "t.wav"
        sf.write(tmp, y, sr)
        ulaw = Path(td) / "u.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp),
                        "-ar", "8000", "-ac", "1", "-c:a", "pcm_mulaw", str(ulaw)], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(ulaw),
                        "-c:a", "pcm_s16le", str(AB / f"{name}.wav")], check=True)
    print(f"[ab] {name}.wav  {len(y)/sr:.2f}s  <- {src}", flush=True)
