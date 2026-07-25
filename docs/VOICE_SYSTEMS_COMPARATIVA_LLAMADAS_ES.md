# Comparativa de sistemas de voz para llamadas en español

**Fecha:** 24 de julio de 2026  
**Ámbito:** comparación conceptual de arquitecturas y modelos autoalojables para llamadas comerciales en español.  
**Fuera de alcance:** cambios de código, despliegue y configuración del backend.

## 1. Conclusión

Para este producto no basta con medir WER, latencia o calidad de TTS. Una llamada española convincente tiene que saber:

- si `mmm… un momento` es una pausa y no el final del turno;
- cuándo emitir un `ajá`, `claro`, `vale` o permanecer en silencio;
- cuándo dejar de hablar si el prospecto entra encima;
- cómo pronunciar nombres, precios, fechas y teléfonos;
- cómo mantener acento, ritmo y naturalidad después de varias interrupciones.

La publicación de Kyutai es importante porque trata la interactividad como un objetivo de entrenamiento separado: pausa, turn-taking, backchannel e interrupción. El método usa post-entrenamiento con recompensas específicas para esos cuatro ejes y una recompensa adicional de calidad semántica; se aplica a Moshi y PersonaPlex, pero **no es un checkpoint español listo para producción**. [Artículo de Kyutai](https://kyutai.org/blog/2026-06-10-interactivity/) · [paper técnico](https://arxiv.org/abs/2606.11167)

## 2. Sistemas comparados

### S1 — Cascada OSS básica

```text
audio -> VAD -> STT -> LLM -> TTS -> audio
```

**Ejemplo:** faster-whisper + Smart Turn + Qwen/Llama local + Piper/Kokoro/Qwen3-TTS.

**Puntos fuertes**

- Es la ruta más controlable y depurable.
- Cada componente puede especializarse en español.
- Es fácil conectar CRM, reglas, opt-out, AMD y herramientas.
- Permite cambiar la voz sin reentrenar el razonamiento.
- Coste y consumo de GPU más previsibles.

**Puntos débiles**

- La conversación tiende a ser por turnos.
- STT final y TTS por frase añaden latencia acumulada.
- Las pausas cortas como `mmm… un momento` pueden cerrar el turno demasiado pronto.
- Los backchannels suelen ser reglas externas y pueden sonar artificiales.
- El modelo no recibe directamente emoción, ritmo, solapamiento y prosodia completos.

**Adecuación al español:** alta.  
**Adecuación full dúplex:** media si se añade un Interaction Loop; baja en la versión puramente secuencial.

### S2 — Cascada OSS con Interaction Loop y controlador acústico-semántico

```text
audio continuo
  -> ring buffer
  -> VAD + Smart Turn + STT parcial
  -> estado escuchar / pausar / backchannel / responder / interrumpir
  -> LLM local + herramientas en background
  -> TTS cancelable
```

**Puntos fuertes**

- Es la evolución más segura de la arquitectura actual.
- Permite tratar explícitamente `mmm`, silencios, dudas, respiraciones y autocorrecciones.
- La política de backchannel se puede ajustar al español comercial.
- Node mantiene autoridad sobre CRM, seguridad y decisiones de negocio.
- Puede usar modelos españoles distintos para STT, LLM y TTS.

**Puntos débiles**

- Sigue teniendo fronteras entre STT, LLM y TTS.
- El controlador puede acumular reglas difíciles de mantener.
- Los parciales de un STT no nativo no equivalen a comprensión acústica continua.
- Si el TTS es por frase, la salida aún puede sentirse ensamblada.

**Adecuación al español:** muy alta.  
**Adecuación full dúplex:** alta a nivel de experiencia; no es speech-to-speech nativo.

### S3 — Moshi base

Moshi es un modelo de diálogo hablado full dúplex basado en Mimi, con streams de audio del usuario y del agente. [Repositorio oficial de Moshi](https://github.com/kyutai-labs/moshi)

**Puntos fuertes**

- Escucha y habla de forma nativa en el mismo sistema.
- Puede modelar pausas, solapamientos, prosodia y señales no verbales.
- Tiene una ruta de latencia muy baja en GPU.
- Es una base adecuada para crear un modelo propio.

**Puntos débiles**

- La base no está especializada en llamadas españolas.
- El comportamiento puede ser bueno en conversación general y malo en nombres, precios o políticas comerciales.
- Es más difícil inspeccionar y corregir que una cascada.
- El modelo base y el codec pueden requerir adaptación lingüística y de voz.

**Adecuación al español:** media sin fine-tuning.  
**Adecuación full dúplex:** muy alta.

### S4 — Moshi-ES con LoRA o fine-tuning completo

```text
Moshi + Mimi
  + conversaciones estéreo españolas
  + anotación temporal
  + LoRA/fine-tuning
  + datos de llamadas y backchannels
  = Moshi-ES
```

Kyutai publica [moshi-finetune](https://github.com/kyutai-labs/moshi-finetune), que acepta audio estéreo con un canal del agente y otro del usuario, permite LoRA o fine-tuning completo y carga los adapters en inferencia.

**Puntos fuertes**

- Es la mejor opción para crear un “PersonaPlex español” propio.
- Permite entrenar idioma, voz, persona y comportamiento conjuntamente.
- Los ejemplos de `mmm`, dudas, interrupciones y backchannels pueden entrar en el dataset.
- Conserva el potencial full dúplex nativo.
- Podemos optimizarlo específicamente para venta telefónica.

**Puntos débiles**

- Necesita datos españoles de calidad, no sólo grabaciones de lectura.
- Es difícil evitar que aprenda respuestas o acentos demasiado ligados al dataset.
- El fine-tuning puede degradar la conversación general o el timing.
- Requiere GPU, evaluación continua y control de versiones de checkpoints.
- El codec y la salida de voz necesitan validación específica a 8 kHz telefónicos.

**Adecuación al español:** alta después de adaptación.  
**Adecuación full dúplex:** muy alta.

### S5 — Moshi/PersonaPlex con alineamiento de interactividad de Kyutai

```text
modelo full dúplex
  -> post-entrenamiento RL específico
     ├─ pausa
     ├─ turn-taking
     ├─ backchannel
     ├─ interrupción
     └─ calidad semántica
```

La aportación de Kyutai no sustituye al modelo base. Es una etapa adicional para mejorar **cuándo** hablar y **cuándo** permanecer callado. El trabajo reporta mejoras en Moshi y PersonaPlex mediante evaluación offline y conversaciones multi-turno en tiempo real, pero las conclusiones publicadas no validan automáticamente español comercial.

**Puntos fuertes**

- Ataca directamente el problema de `mmm… un momento`.
- Optimiza la interactividad como comportamiento, no sólo como predicción de tokens.
- Reduce el riesgo de mejorar latencia a costa de respuestas semánticamente peores al incluir una recompensa de calidad.
- Es aplicable después de una adaptación lingüística española.

**Puntos débiles**

- No arregla por sí solo un modelo que no domine español.
- El RL puede aprender hábitos no deseados si las recompensas no representan llamadas reales.
- Necesita ejemplos positivos y negativos muy bien definidos.
- Es más complejo que LoRA supervisado.
- Requiere un evaluador semántico fiable y un simulador de conversación.

**Adecuación al español:** alta si se entrena sobre datos españoles.  
**Adecuación full dúplex:** máxima de las opciones consideradas.

### S6 — PersonaPlex original

PersonaPlex es un modelo speech-to-speech full dúplex basado en Moshi, con control de persona mediante texto y voz mediante embeddings. [Repositorio oficial](https://github.com/NVIDIA/personaplex) · [model card](https://huggingface.co/nvidia/personaplex-7b-v1)

**Puntos fuertes**

- Full dúplex nativo.
- Buena base para voz, rol, pausas y solapamientos.
- Menos piezas que una cascada.
- Puede ser un buen punto de partida para comparar interactividad.

**Puntos débiles**

- La documentación del checkpoint declara uso de voz inglesa.
- No garantiza español ni pronunciación comercial española.
- Tiene voces preempaquetadas, no una voz española comercial validada.
- Los pesos usan NVIDIA Open Model License aunque el código sea MIT.
- La integración documentada no coincide directamente con nuestro contrato PCM/VoiceSession.

**Adecuación al español:** baja sin adaptación.  
**Adecuación full dúplex:** máxima.

### S7 — PersonaPlex-ES con alineamiento Kyutai

Es la combinación de adaptación lingüística/voz de PersonaPlex con el método de interactividad de Kyutai.

**Puntos fuertes**

- Potencialmente la mejor naturalidad conversacional.
- Puede aprender que un `mmm`, una pausa o un `un momento` no significan lo mismo.
- Permite optimizar respuestas breves, backchannels y toma de turno para llamadas.

**Puntos débiles**

- Es el sistema con mayor incertidumbre de entrenamiento.
- Necesita resolver español, voces, datos, licencia y hardware simultáneamente.
- Es difícil atribuir un fallo a idioma, codec, modelo o política de interactividad.
- No debe ser el primer sistema que se ponga delante de clientes.

**Adecuación al español:** potencialmente alta, actualmente no demostrada.  
**Adecuación full dúplex:** máxima.

### S8 — Qwen3-Omni

Qwen3-Omni declara 19 idiomas de entrada de voz y 10 de salida, incluyendo español, además de streaming de texto y voz e interacción en tiempo real. [Repositorio oficial Qwen3-Omni](https://github.com/QwenLM/Qwen3-Omni)

**Puntos fuertes**

- Es el candidato preentrenado más interesante para probar español end-to-end.
- Ya contempla audio de entrada, texto y voz de salida.
- Permite evaluar español antes de crear nuestro propio checkpoint.
- Tiene serving local y documentación de Docker.

**Puntos débiles**

- El checkpoint principal `30B-A3B` tiene una exigencia de hardware elevada.
- Streaming y turn-taking natural no garantizan el mismo comportamiento de interrupción que un modelo full dúplex especializado.
- Hay que adaptar audio, cancelación y eventos al contrato de llamadas.
- Las voces predefinidas pueden no encajar con la identidad comercial buscada.
- La licencia del repositorio y la licencia del checkpoint deben revisarse por separado.

**Adecuación al español:** muy alta de partida.  
**Adecuación full dúplex:** alta, pendiente de medir en llamadas reales.

### S9 — GLM-4-Voice

GLM-4-Voice es end-to-end y ofrece streaming texto/voz, pero su repositorio oficial declara comprensión y generación de chino e inglés. [Repositorio oficial GLM-4-Voice](https://github.com/zai-org/GLM-4-Voice)

**Puntos fuertes**

- Arquitectura speech-text-speech integrada.
- Decoder de voz streaming.
- Control de emoción, velocidad y estilo en su dominio publicado.
- Código Apache-2.0.

**Puntos débiles**

- No parte de español.
- Su comportamiento documentado es más turn-based que el de Moshi/PersonaPlex.
- La adaptación española implicaría tokenizer, modelo y decoder.
- Los pesos tienen condiciones propias diferentes del código.

**Adecuación al español:** baja sin entrenamiento.  
**Adecuación full dúplex:** media.

## 3. Ranking para llamadas comerciales españolas

Puntuación de 1 a 10. No es una medición de laboratorio; es una priorización para decidir qué evaluar primero.

| Puesto | Sistema | Español | “Mmm… un momento” | Latencia | Calidad de voz | Integración CRM | Riesgo | Total orientativo |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Cascada OSS + Interaction Loop español | 9 | 9 | 7 | 8 | 10 | 2 | **8,5** |
| 2 | Moshi-ES + alineamiento Kyutai | 8→10 | 10 | 10 | 8→9 | 7 | 7 | **8,3** |
| 3 | Qwen3-Omni adaptado a VoiceSession | 9 | 7 | 8 | 8 | 7 | 5 | **7,9** |
| 4 | Moshi-ES con LoRA, sin RL | 8→10 | 8 | 10 | 8 | 7 | 6 | **7,8** |
| 5 | PersonaPlex-ES + alineamiento Kyutai | 6→9 | 10 | 9 | 9 | 6 | 9 | **7,6** |
| 6 | PersonaPlex original | 3 | 8 | 9 | 8 | 5 | 5 | **6,3** |
| 7 | GLM-4-Voice adaptado | 4→8 | 6 | 7 | 8 | 6 | 8 | **6,2** |

El sistema número 1 gana por control y riesgo, no por ser el más parecido a GPT-Live. El número 2 tiene el mayor potencial, pero necesita datos y entrenamiento. El número 3 es el experimento que conviene ejecutar antes de invertir en un fine-tuning grande.

## 4. Medición específica para español

### 4.1 Idioma y comprensión

| Métrica | Qué mide | Ejemplo |
|---|---|---|
| WER/CER español | Errores de reconocimiento | nombres, apellidos y direcciones |
| Exactitud semántica | Si entiende la intención | “no me interesa ahora” vs “llámame mañana” |
| Exactitud numérica | Números y entidades sensibles | 1.500 €, 15:30, 600 123 456 |
| Acento y variedad | Robustez de dialecto | peninsular, mexicano, argentino, colombiano |
| Code-switching | Cambio ocasional de idioma | marca, software, nombre propio |
| Repetición | Si obliga al prospecto a repetir | mismo audio con ruido y solapamiento |

No debemos evaluar sólo la transcripción completa. En una llamada, un error en `martes` o `1.500` puede ser más grave que varios errores en palabras de relleno.

### 4.2 Pausas, rellenos y `mmm… un momento`

Crear un conjunto etiquetado con estas situaciones:

1. **Pausa corta:** `eh… sí`.
2. **Pausa de pensamiento:** `mmm… déjame pensar`.
3. **Retención explícita:** `mmm… un momento, voy a mirarlo`.
4. **Final real:** `eso sería todo, gracias`.
5. **Autocorrección:** `el martes… perdón, el miércoles`.
6. **Solapamiento:** el prospecto empieza antes de que termine el agente.
7. **Backchannel del prospecto:** `sí`, `ajá`, `claro` sin intención de tomar el turno.
8. **Silencio con ruido:** teclado, respiración, oficina o música.

Métricas:

- `false_takeover_rate`: respuestas iniciadas durante una pausa que no era final.
- `hold_compliance`: porcentaje de casos donde el agente permanece callado tras “un momento”.
- `backchannel_precision`: backchannels que aparecen en un momento apropiado.
- `backchannel_overlap_rate`: backchannels que pisan palabras importantes.
- `turn_end_precision` y `turn_end_recall`.
- `interruption_success_rate`.

El objetivo no es que el sistema responda rápido siempre. Es que responda rápido **cuando corresponde** y aguarde **cuando el hablante todavía conserva el turno**.

### 4.3 Latencia

Medir P50, P90 y P95, no sólo la media:

| Métrica | Inicio | Fin | Objetivo inicial |
|---|---|---|---:|
| `speech_to_first_audio_ms` | última palabra/decisión de turno | primer audio del agente | < 700 ms P50 |
| `barge_in_stop_ms` | inicio de voz del usuario | silencio del audio agente | < 250 ms P95 |
| `pause_decision_ms` | pausa ambigua | decisión esperar/hablar | < 300 ms |
| `backchannel_delay_ms` | oportunidad etiquetada | primer backchannel | 300–1.200 ms |
| `stt_partial_ms` | llegada de frame | parcial útil | < 400 ms |
| `tts_first_byte_ms` | texto listo | primer audio | < 300 ms local |
| `tool_while_speaking_ms` | solicitud | primer evento de herramienta | sin bloquear audio |

Los objetivos son metas iniciales de producto, no garantías de los modelos. Se deben repetir bajo CPU/GPU, concurrencia, ruido y codec reales.

### 4.4 Calidad de voz

Evaluar por separado:

- inteligibilidad en G.711/µ-law a 8 kHz;
- naturalidad y prosodia en español;
- acento seleccionado;
- pronunciación de nombres, siglas y números;
- estabilidad durante 30 minutos;
- consistencia de voz tras interrupciones;
- ausencia de chasquidos, cortes y audio duplicado;
- adecuación de `ajá`, `claro`, `vale`, `entiendo` y silencios;
- emoción y energía sin sonar teatral o manipuladora.

Métricas recomendadas:

- MOS de naturalidad por evaluadores españoles;
- MOS de inteligibilidad telefónica;
- speaker similarity para la voz de marca;
- WER de una segunda transcripción sobre el audio generado;
- tasa de artefactos y cortes;
- evaluación ciega contra grabaciones humanas y contra la baseline TTS.

## 5. Diseño de la evaluación

Cada sistema debe probar exactamente el mismo material:

```text
Dataset español
  ├─ conversación normal
  ├─ pausas y “mmm”
  ├─ retención “un momento”
  ├─ interrupciones
  ├─ objeciones comerciales
  ├─ nombres/números/fechas
  ├─ ruido de oficina
  └─ PSTN G.711
```

### Fases

1. **Offline:** audio pregrabado, transcripción y etiquetas temporales.
2. **Realtime local:** micrófono/WebSocket sin red telefónica.
3. **PSTN:** Twilio o SIP, µ-law, pérdida y jitter.
4. **Multi-turno:** mínimo 10–15 turnos por llamada.
5. **Evaluación humana:** oyentes españoles sin saber qué sistema escuchan.
6. **Evaluación comercial:** calidad de calificación, objeciones, opt-out y agenda.

### Regla de aprobación

Un sistema no pasa a canary sólo porque tenga mejor voz. Debe cumplir simultáneamente:

- no aumentar `false_takeover_rate` en pausas españolas;
- detenerse rápido ante interrupciones;
- mantener WER y entidades críticas bajo el umbral;
- no degradar la semántica al optimizar latencia;
- sonar natural en teléfono, no sólo en audio 24 kHz limpio;
- conservar opt-out, privacidad y trazabilidad.

## 6. Decisión comparativa

| Necesidad principal | Sistema que priorizar |
|---|---|
| Producción española inmediata | Cascada OSS + Interaction Loop |
| Mejor control de herramientas y CRM | Cascada OSS |
| Construir nuestro propio modelo full dúplex | Moshi-ES |
| Probar español end-to-end sin entrenar primero | Qwen3-Omni |
| Mejorar `mmm`, pausas y backchannels | Moshi/PersonaPlex + alineamiento Kyutai |
| Voz de marca y números | TTS local especializado dentro de cascada |
| Latencia mínima potencial | Moshi-ES o PersonaPlex-ES |
| Riesgo operativo mínimo | Cascada OSS |

## 7. Veredicto

El trabajo de Kyutai cambia la conclusión: el problema no es únicamente elegir un modelo que hable español. Hay que entrenar y medir **el comportamiento temporal de la conversación española**.

La ruta más sensata es:

1. usar cascada OSS + Interaction Loop como referencia de producción;
2. aplicar el mismo benchmark español a Qwen3-Omni;
3. entrenar Moshi-ES con conversaciones estéreo;
4. aplicar después un alineamiento de interactividad inspirado en Kyutai;
5. comparar contra PersonaPlex-ES sólo cuando el idioma y la licencia estén resueltos.

En otras palabras: **la voz española y la inteligencia comercial pueden vivir en una cascada controlable, mientras que el comportamiento full dúplex se puede convertir en un objetivo de entrenamiento medible**. Ésa es la combinación con mejor equilibrio entre calidad, privacidad, latencia y riesgo.
