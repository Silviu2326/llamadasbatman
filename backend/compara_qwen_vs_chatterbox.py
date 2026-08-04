"""Compara Qwen3-TTS (voice clone) contra Chatterbox usando el mismo banco de referencias.

Tesis a validar: la referencia condiciona la voz generada.
Metrica: dispersion ENTRE registros vs ruido DENTRO del mismo registro (3 variantes).
Si ratio > 1, la referencia manda; si ~1, el modelo ignora la referencia.

Uso (venv .venv-qwen3-tts):
    python compara_qwen_vs_chatterbox.py gen [n_registros]   # genera banco_qwen/
    python compara_qwen_vs_chatterbox.py mide                # tabla comparativa
"""
import glob
import os
import statistics
import sys

import librosa
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
REFS = os.path.join(HERE, "banco_voz_roger")
OUT_QWEN = os.path.join(HERE, os.getenv("QWEN_OUT", "banco_qwen"))
VARIANTES = [int(v) for v in os.getenv("QWEN_VARIANTES", "1,2,3").split(",")]
OUT_CHATTERBOX = os.path.join(HERE, "banco_chatterbox")

# Mismo texto fijo que se uso con Chatterbox (objecion tipica de venta).
TEXT = (
    "I completely understand your concern. Many of our clients felt exactly the same way "
    "before we started working together. Would it be okay if I asked you just one quick "
    "question to see whether this could actually be useful for you?"
)

# Los 5 grupos audibles que sobrevivieron a Chatterbox (COMPARATIVA_VOCES_CHATTERBOX.md).
REGISTROS = [
    "apertura_energica",
    "neutro_informativo",
    "empatico",
    "cierre_calido",
    "susurro_confidencial",
]


def ref_texts(nombres):
    """Qwen en modo ICL exige la transcripcion de la referencia; la sacamos con whisper-tiny."""
    import json

    cache_path = os.path.join(HERE, "banco_qwen", "ref_texts.json")
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    faltan = [n for n in nombres if n not in cache]
    if faltan:
        from transformers import pipeline

        asr = pipeline("automatic-speech-recognition", model="openai/whisper-tiny.en")
        for n in faltan:
            cache[n] = asr(os.path.join(REFS, n))["text"].strip()
            print(f"  transcrito {n}: {cache[n][:60]}...", flush=True)
        json.dump(cache, open(cache_path, "w"), indent=1)
    return cache


def gen(n_registros):
    import torch
    from qwen_tts import Qwen3TTSModel

    model_id = os.getenv("QWEN3_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-Base")
    device = os.getenv("QWEN3_TTS_DEVICE", "cuda:0" if torch.cuda.is_available() else "cpu")
    dtype = torch.float32 if device == "cpu" else torch.bfloat16
    print(f"cargando {model_id} en {device} ({dtype})...", flush=True)
    model = Qwen3TTSModel.from_pretrained(model_id, device_map=device, dtype=dtype)

    os.makedirs(OUT_QWEN, exist_ok=True)
    nombres = [f"{r}_{v}.wav" for r in REGISTROS[:n_registros] for v in VARIANTES]
    textos = ref_texts(nombres)
    for name in nombres:
            dst = os.path.join(OUT_QWEN, name)
            if os.path.exists(dst):
                print(f"  saltando {name} (ya existe)")
                continue
            t0 = __import__("time").perf_counter()
            wavs, sr = model.generate_voice_clone(
                text=TEXT,
                language="English",
                ref_audio=os.path.join(REFS, name),
                ref_text=textos[name],
            )
            sf.write(dst, wavs[0], sr)
            print(f"  {name}: {len(wavs[0]) / sr:.1f}s audio en {__import__('time').perf_counter() - t0:.0f}s", flush=True)


def metricas(path):
    y, sr = librosa.load(path, sr=24000, mono=True)
    f0 = librosa.yin(y, fmin=60, fmax=350, sr=sr)
    f0 = f0[np.isfinite(f0)]
    return {
        "f0": float(np.median(f0)),
        "rms": float(np.sqrt(np.mean(y**2))),
        "dur": len(y) / sr,
        "brillo": float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))),
    }


def _sd(vals):
    return statistics.pstdev(vals) if len(vals) > 1 else 0.0


def mide():
    bancos = {"referencias (ElevenLabs)": REFS, "Chatterbox": OUT_CHATTERBOX, "Qwen3-TTS": OUT_QWEN}
    hechos = {}
    for nombre, carpeta in bancos.items():
        por_registro = {}
        for registro in REGISTROS:
            ms = [metricas(f) for f in sorted(glob.glob(os.path.join(carpeta, registro + "_*.wav")))]
            if ms:
                por_registro[registro] = ms
        if por_registro:
            hechos[nombre] = por_registro

    for clave, unidad in [("f0", "Hz"), ("rms", ""), ("dur", "s"), ("brillo", "Hz")]:
        print(f"\n### {clave} ({unidad})")
        print("| banco | " + " | ".join(REGISTROS) + " | entre-registros SD | intra-registro SD | ratio |")
        print("|---" * (len(REGISTROS) + 4) + "|")
        for nombre, por_registro in hechos.items():
            medias = {r: statistics.mean(m[clave] for m in ms) for r, ms in por_registro.items()}
            entre = _sd(list(medias.values()))
            intra = statistics.mean(_sd([m[clave] for m in ms]) for ms in por_registro.values())
            fila = " | ".join(f"{medias.get(r, float('nan')):.3g}" for r in REGISTROS)
            ratio = entre / intra if intra else float("inf")
            print(f"| {nombre} | {fila} | {entre:.3g} | {intra:.3g} | **{ratio:.2f}** |")

    # Prueba directa de la tesis: clip a clip, .cuanto de la referencia llega a la salida?
    print("\n### Referencia -> salida, clip a clip (r = correlacion, pendiente <1 = comprime)")
    print("| modelo | metrica | r | pendiente |")
    print("|---|---|---|---|")
    ref_por_registro = hechos["referencias (ElevenLabs)"]
    for nombre in ("Chatterbox", "Qwen3-TTS"):
        if nombre not in hechos:
            continue
        for clave in ("f0", "rms", "dur"):
            x, y = [], []
            for registro, ms in hechos[nombre].items():
                for i, m in enumerate(ms):
                    x.append(ref_por_registro[registro][i][clave])
                    y.append(m[clave])
            r = float(np.corrcoef(x, y)[0, 1])
            pend = float(np.polyfit(x, y, 1)[0])
            print(f"| {nombre} | {clave} | {r:+.2f} | {pend:.2f} |")


if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else "mide"
    if modo == "gen":
        gen(int(sys.argv[2]) if len(sys.argv) > 2 else len(REGISTROS))
    else:
        mide()
