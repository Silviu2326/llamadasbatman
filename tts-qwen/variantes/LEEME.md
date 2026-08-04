# Variantes de cadencia — elige de oído

12 tomas, 4 por frase, todas ya a 8 kHz μ-law y recortadas de silencio. Ninguna cambia
una sola palabra respecto al original de Carlos: solo cambian dos cosas.

**Referencia de voz** (de dónde copia la prosodia):
- `1ref` — un solo clip de Carlos (~5 s). Es lo que había hasta ahora.
- `2ref` — los otros dos clips pegados (~11 s). Más prosodia real de la que copiar.

**Puntuación del texto**:
- `medido` — las pausas que Carlos hace de verdad, medidas por energía (`pauses.py`).
- `exagerado` — puntuación partida a propósito para romper el metrónomo.

## Duraciones (habla, sin silencios de cabeza ni cola)

| frase | real | 1ref_medido | 1ref_exagerado | 2ref_medido | 2ref_exagerado |
|---|---|---|---|---|---|
| 52_15 | **4.29 s** | 3.75 | **4.44** | 3.24 | 4.93 |
| 52_53 | **5.22 s** | 4.91 | 5.97 | **5.20** | 6.06 |
| 53_11 | **4.32 s** | 3.91 | **4.50** | 3.42 | 4.96 |

`1ref_exagerado` es el que más se acerca en dos de las tres. Pero la duración no es lo
que tú estabas oyendo, así que júzgalo por el oído, no por esta tabla.

## Lo que no funcionó

- **Temperatura** (0.9 / 1.2 / 1.5): mueve el timbre, no el ritmo. Sin patrón claro.
- **Métricas automáticas**: medí variación de tono (f0_std) y nPVI rítmico contra los
  reales. Ninguna de las dos da los sintéticos como más planos — o sea que no capturan
  lo que oyes. Por eso esto va a oído y no a número.
- Qwen3-TTS no tiene parámetro de velocidad ni de expresividad para voz clonada
  (`instruct` solo existe en `generate_custom_voice`, que exige un speaker predefinido).
  La puntuación es la única palanca real.

## Regenerar

`..\.venv\Scripts\python.exe ..\variantes.py` — los textos exagerados están escritos a
mano en el diccionario `EXAGERADO` de ese archivo, edítalos ahí.
