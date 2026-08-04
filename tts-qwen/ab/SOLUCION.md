# Prueba a ciegas — ¿cuál es Carlos y cuál es la IA?

Tres pares. En cada par, los dos audios dicen **exactamente el mismo texto**: uno es la
nota de voz real de Carlos y el otro es un clon de Qwen3-TTS. Todos recortados de
silencio inicial y final, y pasados por el códec telefónico real (8 kHz μ-law).

| par | qué dicen | duración a / b |
|---|---|---|
| `par1_a.wav` / `par1_b.wav` | "Hola, buenos días. Soy Carlos de Padeltop. ¿Podría hablar contigo un minuto?" | 3.69 s / 4.25 s |
| `par2_a.wav` / `par2_b.wav` | "Hola, ¿qué tal? Me llamo Carlos, soy de Padeltop. ¿Podría hablar con el encargado?" | 5.18 s / 5.06 s |
| `par3_a.wav` / `par3_b.wav` | "Buenos días Silvio, soy Carlos de Padeltop. ¿Podría hablar contigo un minuto?" | 4.22 s / 4.29 s |

> ⚠️ La clave cambió respecto a la versión anterior de este archivo. Si ya la habías
> mirado, no te sirve.

Escúchalos antes de seguir leyendo.

---

## Solución

| archivo | qué es |
|---|---|
| `par1_a.wav` | 🤖 sintético (voz clonada del clip de las 15:53:11) |
| `par1_b.wav` | 🧑 **REAL — Carlos** |
| `par2_a.wav` | 🧑 **REAL — Carlos** |
| `par2_b.wav` | 🤖 sintético (voz clonada del clip de las 15:52:15) |
| `par3_a.wav` | 🤖 sintético (voz clonada del clip de las 15:52:53) |
| `par3_b.wav` | 🧑 **REAL — Carlos** |

Los sintéticos están **cruzados a propósito**: cada frase se generó usando como
referencia un clip distinto del que se compara.

## Pausas

Qwen3-TTS no tiene parámetro de velocidad; lo único que alarga un silencio es la
puntuación. Así que se midieron por energía los silencios reales de cada nota de
Carlos, se asignaron al límite entre palabras más cercano y se convirtieron en coma
(≥0.15 s) o puntos suspensivos (≥0.35 s):

| clip | pausa real detectada | texto sintetizado |
|---|---|---|
| 15:52:15 | 0.20 s tras "Padeltop." | *(el punto ya la da; sin marca extra)* |
| 15:52:53 | 0.53 s tras "Hola," | "Hola,... ¿qué tal? Me llamo Carlos, soy de Padeltop…" |
| 15:53:11 | 0.41 s tras "Padeltop." | "…soy Carlos de Padeltop.... ¿Podría hablar contigo un minuto?" |

Resultado: par2 y par3 quedan a 0.12 s y 0.07 s del real. **Par1 sigue 0.56 s corto**
— ahí Carlos no hace una pausa marcada, simplemente habla más despacio, y eso la
puntuación no lo arregla.

## Similitud medida (ECAPA-TDNN, antes del códec)

| | coseno |
|---|---|
| baseline: dos grabaciones reales de Carlos entre sí | 0.743 (rango 0.695–0.774) |
| sintético de `par2_b` | 0.684 |
| sintético de `par3_a` | 0.668 |
| sintético de `par1_a` | 0.613 |

## Notas

- Los reales vienen en Opus de WhatsApp, así que arrastran esa compresión además de la
  telefónica; los sintéticos parten de WAV limpio a 24 kHz. Es la única asimetría, y
  juega en contra del real.
- Regenerar todo: `..\.venv\Scripts\python.exe ..\make_pairs.py` y luego
  `..\..\tts-chatterbox\.venv\Scripts\python.exe ..\build_ab.py`. Las pausas se
  recalculan con `pauses.py`.
