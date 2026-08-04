"""Escucha ciega entre dos bancos: mismos registros, misma referencia, mismo texto.

Genera pares A/B (banda ancha + filtrado a linea telefonica) y la solucion aparte.
    python blind_ab.py [banco_izq] [banco_der] [carpeta_salida]
"""
import audioop
import hashlib
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
IZQ, DER = (sys.argv + ["banco_chatterbox", "banco_qwen"])[1:3]
OUT = os.path.join(HERE, sys.argv[3] if len(sys.argv) > 3 else f"ab_{IZQ}_vs_{DER}")
REGISTROS = ["apertura_energica_1", "empatico_1", "susurro_confidencial_1"]


def telefono(y, sr):
    """300-3400 Hz -> 8 kHz -> mu-law, como una llamada Twilio real."""
    sos = butter(4, [300, 3400], btype="band", fs=sr, output="sos")
    y = sosfilt(sos, y)
    y8 = np.interp(np.arange(0, len(y), sr / 8000), np.arange(len(y)), y)
    pcm = (np.clip(y8, -1, 1) * 32767).astype("<i2").tobytes()
    return np.frombuffer(audioop.ulaw2lin(audioop.lin2ulaw(pcm, 2), 2), dtype="<i2") / 32768.0


os.makedirs(OUT, exist_ok=True)
solucion = []
for registro in REGISTROS:
    fuentes = {b: os.path.join(HERE, b, registro + ".wav") for b in (IZQ, DER)}
    # ponytail: "sorteo" estable por hash del nombre — reproducible sin guardar semilla.
    invertir = int(hashlib.md5((registro + OUT).encode()).hexdigest(), 16) % 2 == 1
    etiquetas = ["B", "A"] if invertir else ["A", "B"]
    for etiqueta, (modelo, src) in zip(etiquetas, fuentes.items()):
        y, sr = sf.read(src)
        sf.write(os.path.join(OUT, f"{registro}_{etiqueta}.wav"), y, sr)
        sf.write(os.path.join(OUT, f"{registro}_{etiqueta}_tel.wav"), telefono(y, sr), 8000)
        solucion.append(f"{registro}: {etiqueta} = {modelo}")

with open(os.path.join(OUT, "SOLUCION.txt"), "w") as fh:
    fh.write("\n".join(solucion) + "\n")
# ponytail: no imprimimos la solucion — la gracia es escuchar a ciegas.
print(f"{len(REGISTROS)} pares en {OUT} (escucha los _tel primero; solucion en SOLUCION.txt)")
