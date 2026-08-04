# Comparativa de voces clonadas con Chatterbox

Mismo texto en los 4 audios: *"I completely understand your concern. Many of our clients felt exactly the same way before we started working together. Would it be okay if I asked you just one quick question to see whether this could actually be useful for you?"*

| Archivo | Referencia | Ajustes |
|---|---|---|
| `clon_voz_19.48.25.wav` | nota de voz 19.48.25 | por defecto (exaggeration 0.5, cfg 0.5) |
| `clon_voz_19.48.35.wav` | nota de voz 19.48.35 | por defecto |
| `clon_voz_19.48.25_expresivo.wav` | nota de voz 19.48.25 | exaggeration 0.7, cfg 0.35 |
| `clon_voz_19.48.35_expresivo.wav` | nota de voz 19.48.35 | exaggeration 0.7, cfg 0.35 |

## Lo primero: tus dos referencias son casi idénticas en tono

Medidas sobre las notas de voz originales:

| | 19.48.25 | 19.48.35 |
|---|---|---|
| Tono mediano (F0) | 175,7 Hz | 174,7 Hz |
| Variación de tono (desv. típica) | 23,7 Hz | 24,4 Hz |
| Volumen medio (RMS) | 0,073 | 0,082 |
| Brillo (centroide espectral) | 1461 Hz | 1352 Hz |

Es decir: acústicamente **confirman que es la misma persona** (1 Hz de diferencia en tono es imperceptible). Las únicas diferencias reales entre referencias son que la 19.48.35 se grabó un poco más fuerte y suena un pelín más apagada (menos brillo), probablemente por distancia al micro.

## En qué se diferencian los dos clones (versión normal)

| | clon 19.48.25 | clon 19.48.35 | Qué notarás |
|---|---|---|---|
| Tono mediano | 173,7 Hz | 167,8 Hz | El clon .35 suena **ligeramente más grave** |
| Variación de tono | 57 Hz | 64,5 Hz (picos hasta 266 Hz) | El clon .35 es **más melódico**, sube más en la pregunta final |
| Duración (mismo texto) | 13,9 s | 15,2 s | El clon .35 habla **~9% más despacio**, más pausado |
| Brillo | 1371 Hz | 1459 Hz | El clon .35 suena **más brillante/nítido** |

Curioso: el clon .35 salió más brillante aunque su referencia era la más apagada — señal de que parte de estas diferencias no vienen de la referencia sino de la **variabilidad propia de Chatterbox** (cada generación sale distinta, incluso con la misma referencia).

### En qué fijarte al escucharlos

1. **La pregunta final** ("Would it be okay...?"): es donde más difiere la entonación — compara cuánto sube el tono cada clon.
2. **El ritmo y las pausas** entre frases: el clon .35 respira más.
3. **La identidad de la voz** (timbre, "quién habla"): debería sonar la misma persona en ambos. Si notas identidades distintas, la referencia es demasiado corta (7-8 s; Chatterbox recomienda 10+ s).
4. **Artefactos**: finales de palabra metálicos o sibilantes raras — típicos con referencias cortas de WhatsApp (audio comprimido Opus).

## Versiones expresivas: qué cambia

| | 19.48.25 expresivo | 19.48.35 expresivo | vs. versión normal |
|---|---|---|---|
| Tono mediano | 188,3 Hz | 177,7 Hz | **Más agudo** (+8-15 Hz) |
| Duración | 11,8 s | 13,3 s | **~15% más rápido** |
| Fracción hablada | 0,82 | 0,76 | **Menos pausas**, más continuo |
| Volumen | +4-5% | +5% | Un poco más de energía |

En resumen, las expresivas suenan **más animadas y con más urgencia comercial**: tono más alto, ritmo más ágil, menos silencios. La contrapartida es que se alejan un poco más del carácter tranquilo de tus notas de voz originales — si buscas máxima fidelidad a cómo habla esa persona, quédate con las normales; si buscas energía de venta, las expresivas.

## Piloto: referencias sintéticas de ElevenLabs → Chatterbox

Pregunta: ¿si genero referencias de estilo con ElevenLabs (voz "Sarah", modelo v3), Chatterbox conserva esas diferencias de estilo? Tres referencias extremas (susurro, neutro, eufórico) y el mismo texto de venta en las tres salidas.

| Métrica | ref susurro → salida | ref neutro → salida | ref eufórico → salida |
|---|---|---|---|
| Tono mediano (Hz) | 182 → 194 | 211 → 209 | 233 → 219 |
| Volumen (RMS) | 0,131 → 0,140 | 0,173 → 0,171 | 0,209 → 0,193 |
| Archivos | `piloto_ref_susurro.wav` → `piloto_chatterbox_susurro.wav` | ídem neutro | ídem eufórico |

**Veredicto: funciona, pero comprime.** El orden se conserva siempre (susurro < neutro < eufórico en tono y volumen), pero la separación se reduce a la mitad: 51 Hz de rango entre referencias quedan en 25 Hz entre salidas. Una referencia extrema produce una salida moderada.

Lecciones para el banco de variaciones:

1. **Genera las referencias exageradas** — Chatterbox las va a suavizar ~50%. Si quieres un susurro audible en la salida, la referencia debe ser un susurro teatral.
2. **Las etiquetas de v3 necesitan refuerzo**: una sola `[whispers]` al inicio apenas hizo nada (el primer intento salió con las 3 referencias casi idénticas). Funcionó con etiqueta en cada frase + `stability: 0.0` + `speed` distinto por estilo.
3. **50 estilos no darán 50 salidas distinguibles.** Con la compresión medida, apuesta por 8-12 registros muy contrastados × 3-4 variantes, no 50 matices finos.

## Banco de estilos: voz masculina norteamericana (Roger)

En `banco_voz_roger/` hay **30 referencias WAV (24 kHz mono, listas para Chatterbox)**: 10 registros de venta × 3 variantes, generadas con ElevenLabs v3 (`stability 0.0`, etiquetas por frase, velocidad propia por registro). Nota: la API free no permite voces de la biblioteca (el "canadiense" real requería plan de pago), así que se usó Roger, prediseñada, hombre de mediana edad con acento General American — indistinguible del canadiense anglófono en la práctica.

| Registro | Velocidad | Tono mediano* | Uso en la llamada |
|---|---|---|---|
| `apertura_energica` | 1.1 | 120 Hz | Saludo inicial |
| `neutro_informativo` | 1.0 | 106 Hz | Explicar producto/precio |
| `empatico` | 0.95 | 126 Hz | Acoger objeciones |
| `curioso_pregunta` | 1.0 | 119 Hz | Preguntas de descubrimiento |
| `asertivo_seguro` | 1.0 | 121 Hz | Rebatir, demostrar |
| `urgencia_suave` | 1.1 | 104 Hz | Escasez, fechas límite |
| `cierre_calido` | 0.9 | 100 Hz | Despedida, acuerdo |
| `disculpa` | 0.95 | 106 Hz | Rectificar errores |
| `susurro_confidencial` | 0.8 | 101 Hz | Confidencia, "oferta especial" |
| `risa_divertido` | 1.05 | 126 Hz | Romper el hielo, humor |

*Medido sobre la variante 1 de cada registro. Separación de tono entre extremos: 100→126 Hz (~26%), coherente con lo esperado (excitación/risa/empatía agudos; cierre/susurro/urgencia graves). Pendiente de validar al oído si el susurro de v3 susurra de verdad — en los pilotos anteriores la etiqueta `[whispers]` fue la menos obediente.

Crédito de la key free tras generar el banco: 7.922/10.000 caracteres usados.

## Validación: los 30 clips del banco pasados por Chatterbox

Las 30 referencias de `banco_voz_roger/` se pasaron por Chatterbox con el mismo texto fijo (salidas en `banco_chatterbox/`). Con 3 tomas por registro se puede separar la señal (diferencia entre registros) del ruido (variabilidad entre tomas del mismo registro):

| Métrica | Dispersión entre registros | Ruido intra-registro | Ratio |
|---|---|---|---|
| Tono mediano (f0) | 7,3 Hz | 4,2 Hz | **1,73** |
| Volumen (RMS) | 0,006 | 0,004 | **1,49** |
| Duración | 0,67 s | 0,38 s | **1,79** |

**Veredicto: la separación es medible (ratio > 1 en todo), pero los 10 registros colapsan en ~5 grupos audibles:**

| Grupo audible | Registros | f0 medio |
|---|---|---|
| Enérgico | apertura_energica (125,6), risa_divertido (123,8) | ~125 Hz |
| Medio | curioso (118,3), asertivo (118,2), neutro (115,8) | ~117 Hz |
| Calmado | empatico (112,2) | 112 Hz |
| Suave-grave | cierre_calido (108,8), urgencia (108,3), disculpa (108,2) | ~108 Hz |
| Susurro | susurro_confidencial (101,2, y el más silencioso: RMS 0,087) | 101 Hz |

Los extremos (apertura 125,6 vs susurro 101,2, con ruido intra de 4-9 Hz) son inconfundibles; los vecinos dentro de un grupo (p. ej. curioso vs asertivo, 0,1 Hz de diferencia) son indistinguibles por métricas — solo el contenido del texto los diferenciaría al oído.

Implicación para producción: mapear los estados de la llamada a **5 registros bien separados** (enérgico / medio / calmado / suave / susurro) en vez de 10; los otros 5 no aportan variación que sobreviva a Chatterbox.

## Demo "con vida": los 5 puntos aplicados

`demo_con_vida.wav` / `whatsapp_demo_con_vida.ogg` (~29,5 s) — una mini-llamada de venta montada así:

1. **Texto humanizado**: puntos suspensivos, guiones, "Honestly?", "you know", frases cortas + largas.
2. **Parámetros por segmento**: exaggeration 0,55-0,75 y cfg_weight 0,35-0,45 según el registro (más alto en la apertura, más contenido en el cierre).
3. **Frase a frase con registro propio**: apertura enérgica → empatía → pregunta curiosa → cierre cálido, cada segmento generado con su referencia y concatenado.
4. **Referencias sobreactuadas** regeneradas con v3 (etiquetas dobles, mayúsculas enfáticas, `stability 0.0`) para compensar la compresión ~50% de Chatterbox.
5. **Postproducción**: velocidad ±3% distinta por frase (atempo 1,03 / 0,97 / 1,02 / 0,96) y pausas irregulares entre frases (0,42 / 0,31 / 0,55 s).

Crédito final de la key free: ~8.800/10.000 caracteres usados.

## Demo conversación: inicio de llamada de venta de Vendrava a una peluquería

`conversacion_peluqueria.wav` / `whatsapp_conversacion_peluqueria.ogg` (~35,6 s), 6 turnos alternos:

- **Peluquera** (Sarah, ElevenLabs v3 directo, en local): saluda alegre → recelosa ("estoy con una clienta") → concede un minuto.
- **Agente "Mark" de Vendrava** (Roger vía Chatterbox + referencias sobreactuadas, gratis): apertura enérgica → empatía ("te robo poco tiempo") → pregunta curiosa (citas perdidas por no coger el teléfono).
- El agente lleva **filtro telefónico** (paso banda 300-3.400 Hz + volumen reducido): se oye como desde el auricular de la peluquera. Ambos con jitter de velocidad y pausas de turno irregulares.

Esta demo es también la arquitectura de producción propuesta: voz del cliente/interlocutor solo en pruebas, agente = banco Chatterbox local (coste cero por llamada).

## Prueba ciega: línea telefónica (8 kHz μ-law, como Twilio)

`telefono_A.ogg` y `telefono_B.ogg`: misma voz (Roger), mismo texto (el de la objeción), ambos degradados a línea telefónica real (paso banda 300-3.400 Hz → 8 kHz → códec μ-law). Uno es ElevenLabs v3 directo y el otro nuestro Chatterbox local. Escúchalos antes de leer la solución.

**Solución**: A = ElevenLabs, B = Chatterbox. Si tras el embudo telefónico te cuesta elegir (o la diferencia ya no te parece "mucho mejor"), el agente de producción puede ser Chatterbox local a coste cero por llamada; si A sigue ganando claramente, ElevenLabs Flash (barato, ~75 ms) es el candidato para las llamadas.

## Versión "calmada y expresiva": best-of-N + temperatura alta

`empatico_mejorado.wav` / `whatsapp_empatico_mejorado.ogg` vs `empatico_antes.wav` (mismo texto):

Pipeline: referencia recortada a su ventana más animada (7 s) → 3 cláusulas cortas → 5 tomas por cláusula con `temperature 1.0`, `exaggeration 0.65`, `cfg_weight 0.3` → selector automático (descarta tomas desbocadas; elige por expresividad = variación de tono) → micro-pitch ±10-20 cents por cláusula → pausas largas entre cláusulas (0,6/0,75 s) → high-shelf +3 dB y compresión suave.

Lección de la v1: ralentizar con `atempo` global se nota como voz arrastrada — **la calma debe venir de las pausas entre frases, nunca de estirar la voz**. La v2 mantiene la velocidad natural de cada toma y mete el aire en los silencios. La cláusula final (la pregunta) es la toma más melódica de sus 5 (65,7 Hz de variación).

Coste: 15 generaciones para 1 segmento (~7 min en la 2080). En producción, cachear las ganadoras.

## Qwen3-TTS vs Chatterbox con el mismo banco de referencias

Prueba de la tesis "la referencia condiciona la voz generada", con los dos modelos sobre las mismas
15 referencias (los 5 registros que sobreviven × 3 variantes) y el mismo texto fijo de la objeción.
Script: `compara_qwen_vs_chatterbox.py` (`gen` / `mide`). Salidas de Qwen en `banco_qwen/`
(`Qwen/Qwen3-TTS-12Hz-0.6B-Base`, modo clonación ICL — exige transcripción de la referencia, generada
con whisper-tiny y cacheada en `banco_qwen/ref_texts.json`).

**Prueba directa: clip a clip, ¿cuánto de la referencia llega a la salida?**

| Métrica | Chatterbox r / pendiente | Qwen3-TTS r / pendiente |
|---|---|---|
| Tono (f0) | +0,85 / **0,52** | +0,81 / **1,00** |
| Volumen (RMS) | +0,86 / 0,99 | +0,69 / 0,88 |
| Duración | +0,04 / 0,01 | +0,14 / 0,07 |

La tesis se confirma en tono y volumen en ambos modelos (r ≈ 0,7-0,9) y se cae del todo en ritmo:
la duración de la referencia **no** se transfiere (r ≈ 0), cada modelo impone su propia velocidad.

La diferencia grande está en la pendiente del tono: **Chatterbox comprime a la mitad (0,52) y Qwen no
comprime nada (1,00)**. Traducido al banco: 35 Hz de rango entre referencias quedan en 23 Hz con
Chatterbox y en 40 Hz con Qwen. Ya no hace falta sobreactuar las referencias para compensar.

**Señal (entre registros) vs ruido (entre tomas del mismo registro):**

| Métrica | Referencias | Chatterbox | Qwen3-TTS |
|---|---|---|---|
| f0 | 1,67 | **2,60** | 1,49 |
| RMS | 1,36 | 1,57 | **4,04** |
| Duración | 1,46 | 1,32 | 0,60 |
| Brillo | 1,40 | 0,47 | 0,63 |

Lectura: Chatterbox es **más repetible** en tono (ruido intra 2,9 Hz vs 8,8 Hz de Qwen) aunque
aplaste el rango; Qwen respeta el rango pero cada toma sale más distinta. Para volumen Qwen es
netamente mejor (ratio 4,0): su susurro sí baja de verdad (RMS 0,073 vs 0,102 de la apertura).
El **brillo/timbre no lo pone la referencia en ninguno de los dos** (ratio < 1): eso lo decide el modelo.

**Coste:** ~68 s por clip de 12 s en CPU (~5,5× tiempo real, torch 2.13+cpu, sin flash-attn). Sirve para
el A/B offline, no para llamada; el juicio de latencia real hay que hacerlo en el pod con GPU.

**Veredicto de escucha ciega (30/07/2026): gana Qwen, y con claridad.** Pares A/B generados con
`blind_ab.py` (mismo registro, misma referencia, mismo texto; versión limpia y filtrada a línea
telefónica) en `ab_qwen_vs_chatterbox/`. Las métricas no lo predecían —Chatterbox salía mejor en
repetibilidad— así que en calidad percibida mandan los oídos: la compresión de rango de Chatterbox
(pendiente 0,52) se oye como voz plana.

Consecuencias:

1. `voice-engine/server.py` usaba `generate_custom_voice` (speaker fijo "Ryan"), que **no clona nada**.
   Añadido el modo clonación: con `VOICE_ENGINE_QWEN3_REF_AUDIO` + `VOICE_ENGINE_QWEN3_REF_TEXT` usa
   `generate_voice_clone` con el modelo `-Base` y precalcula el prompt de clonado una sola vez.
2. La prueba se hizo con el modelo **más pequeño** (0.6B). Pendiente comparar contra 1.7B.
3. Sigue sin medirse la latencia de Qwen en GPU: es el único dato que puede tumbar la elección.
4. Su punto débil es la variabilidad toma a toma (8,8 Hz): compensable con best-of-N cacheado en las
   frases fijas (saludo, propuesta, cierre).

## Conclusión práctica

- La diferencia entre usar una referencia u otra es **pequeña y en parte aleatoria**: mismo timbre, con variaciones de ritmo y melodía comparables a generar dos veces con la misma referencia.
- Para decidir con rigor habría que generar 3-4 tomas por referencia y comparar promedios, no una toma de cada.
- Mejora con más impacto: una única referencia de **15-20 s, grabada cerca del micro y sin compresión de WhatsApp**.
