"""Variantes de cadencia para elegir de oido. 4 tomas por frase, en ab-listo (8 kHz mu-law).

Dos palancas, combinadas:
  ref   normal = un solo clip de referencia   |  dual = los otros dos clips pegados (~11 s)
  texto medido = las pausas que hace Carlos   |  exagerado = puntuacion partida a proposito

El texto exagerado NO cambia ni una palabra respecto al real: solo mueve la puntuacion,
que es lo unico que Qwen3-TTS usa para romper el metronomo.
"""
import json
import subprocess
import tempfile
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

EXAGERADO = {
    names[0]: "Hola... buenos días. Soy Carlos, de Padeltop... ¿Podría hablar contigo, un minuto?",
    names[1]: "Hola,... ¿qué tal? Me llamo Carlos... soy de Padeltop. ¿Podría hablar, con el encargado?",
    names[2]: "Buenos días, Silvio... soy Carlos, de Padeltop... ¿Podría hablar contigo, un minuto?",
}

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)

dest = HERE / "variantes"
dest.mkdir(exist_ok=True)


def telefono(y, sr, out):
    """Recorta silencio de cabeza/cola y pasa por el codec telefonico."""
    y, _ = librosa.effects.trim(y, top_db=35)
    with tempfile.TemporaryDirectory() as td:
        a, b = Path(td) / "a.wav", Path(td) / "b.wav"
        sf.write(a, y, sr)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(a),
                        "-ar", "8000", "-ac", "1", "-c:a", "pcm_mulaw", str(b)], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(b),
                        "-c:a", "pcm_s16le", str(out)], check=True)
    return len(y) / sr


for i, n in enumerate(names):
    cross = names[(i + 2) % len(names)]
    others = [o for o in names if o != n]
    dual_y = np.concatenate(
        [librosa.load(str(HERE / "ref" / o), sr=24000, mono=True)[0] for o in others]
    )
    refs = {
        "1ref": (str(HERE / "ref" / cross), ref_text[cross]),
        "2ref": ((dual_y, 24000), " ".join(ref_text[o] for o in others)),
    }
    textos = {"medido": paced[n], "exagerado": EXAGERADO[n]}

    for rtag, (audio, rtxt) in refs.items():
        for ttag, txt in textos.items():
            wavs, sr = model.generate_voice_clone(
                text=txt, language="Spanish", ref_audio=audio, ref_text=rtxt,
                do_sample=True, temperature=1.0, top_p=0.95, top_k=50,
            )
            out = dest / f"{n[-9:-4]}_{rtag}_{ttag}.wav"
            dur = telefono(wavs[0], sr, out)
            print(f"[var] {out.name}  {dur:.2f}s", flush=True)

real = {n: librosa.effects.trim(librosa.load(str(HERE / "ref" / n), sr=16000, mono=True)[0], top_db=35)[0]
        for n in names}
print("\nreal: " + "  ".join(f"{n[-9:-4]}={len(y)/16000:.2f}s" for n, y in real.items()), flush=True)
