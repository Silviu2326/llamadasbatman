# Receta ganadora — `52_15_2ref_medido`

La toma elegida a oído (más natural de las 12). Archivos:

- `variantes/52_15_2ref_medido.wav` — 8 kHz μ-law, 3.24 s
- `variantes/whatsapp/52_15_2ref_medido.ogg` — Opus mono 32 kbps

Dice: *"Hola, buenos días. Soy Carlos de Padeltop. ¿Podría hablar contigo un minuto?"*

## Cómo se hizo

**Modelo** — `Qwen/Qwen3-TTS-12Hz-1.7B-Base`, bfloat16, `attn_implementation="sdpa"`
(flash-attn no compila en Windows). Es el modelo Base porque es el único de la familia
que clona voz; `generate_custom_voice` exige un speaker predefinido y `VoiceDesign` no
clona.

**Referencia de voz (`2ref`)** — los **otros dos** clips de Carlos concatenados a
24 kHz, ~11 s en total: la nota de las 15:52:53 seguida de la de las 15:53:11. El clip
de las 15:52:15, que es el que dice esta misma frase, **queda fuera a propósito** para
que la comparación no esté contaminada. La transcripción de referencia es la
concatenación de las dos, en el mismo orden:

> "Hola, ¿qué tal? Me llamo Carlos, soy de Padeltop. ¿Podría hablar con el encargado?
> Buenos días Silvio, soy Carlos de Padeltop. ¿Podría hablar contigo un minuto?"

Esta es la palanca que más pesó: 11 s de prosodia real en vez de 5 s.

**Texto (`medido`)** — la puntuación sale de medir las pausas reales de Carlos
(`pauses.py`): silencios detectados por energía sobre la onda, asignados al límite entre
palabras más cercano, y convertidos en coma (≥0.15 s) o puntos suspensivos (≥0.35 s). En
esta frase concreta Carlos solo hace una pausa de 0.20 s tras "Padeltop.", que el punto
ya produce — así que el texto quedó **sin marcas añadidas**:

> "Hola, buenos días. Soy Carlos de Padeltop. ¿Podría hablar contigo un minuto?"

**Muestreo** — `do_sample=True, temperature=1.0, top_p=0.95, top_k=50`.

**Post** — recorte de silencio de cabeza y cola (`librosa.effects.trim`, `top_db=35`),
luego códec telefónico: 8 kHz μ-law y vuelta a PCM 16 bit. Para WhatsApp, encima,
Opus mono 32 kbps a 16 kHz.

## Reproducirlo

```python
import json, librosa, numpy as np, soundfile as sf, torch
from qwen_tts import Qwen3TTSModel

rt = json.load(open("ref_text.json", encoding="utf-8"))
others = ["WhatsApp_Ptt_2026-07-30_at_15_52_53.wav", "WhatsApp_Ptt_2026-07-30_at_15_53_11.wav"]
ref_y = np.concatenate([librosa.load(f"ref/{o}", sr=24000, mono=True)[0] for o in others])

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cuda:0",
    dtype=torch.bfloat16, attn_implementation="sdpa")

torch.manual_seed(0)  # sin esto cada ejecucion sale distinta
wavs, sr = model.generate_voice_clone(
    text="Hola, buenos días. Soy Carlos de Padeltop. ¿Podría hablar contigo un minuto?",
    language="Spanish",
    ref_audio=(ref_y, 24000),
    ref_text=" ".join(rt[o] for o in others),
    do_sample=True, temperature=1.0, top_p=0.95, top_k=50)
sf.write("nuevo.wav", wavs[0], sr)
```

Luego el códec, con el WAV ya recortado de silencios:

```
ffmpeg -y -i nuevo.wav -ar 8000 -ac 1 -c:a pcm_mulaw tel.wav          # telefono
ffmpeg -y -i nuevo.wav -c:a libopus -b:a 32k -ar 16000 -ac 1 -application voip nuevo.ogg
```

⚠️ **La toma exacta no se puede recuperar.** `variantes.py` corrió con `do_sample=True`
y sin semilla, así que cada ejecución da una realización distinta. La receta reproduce
el *estilo*, no ese archivo bit a bit — el archivo bueno es el que ya está en
`variantes/`, consérvalo. Para nuevas frases, fija `torch.manual_seed(...)` desde el
principio y anota la semilla que te gustó.

## Lo que las métricas dijeron mal

Vale la pena dejarlo escrito porque contradice dos tablas anteriores:

- Por **duración** esta toma era la peor de las cuatro de su frase: 3.24 s frente a los
  4.29 s del Carlos real (−1.05 s). Yo había recomendado `1ref_exagerado` (4.44 s).
- Por **variabilidad rítmica** (nPVI) y por **variación de tono** (f0_std) tampoco
  destacaba.

O sea: acercarse a la duración del original no predice que suene natural, y las
variantes con puntuación exagerada suenan peor aunque cuadren mejor en el reloj.
Para elegir toma, oído; las métricas solo sirven para descartar fallos gordos.
