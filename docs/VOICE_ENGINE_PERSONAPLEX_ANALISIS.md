# Análisis de NVIDIA PersonaPlex para VozIA

**Fecha:** 24 de julio de 2026  
**Conclusión:** candidato excelente para un laboratorio full dúplex, pero no debe sustituir todavía la ruta OSS de producción en español.

## Qué es

[PersonaPlex](https://github.com/NVIDIA/personaplex) es un modelo speech-to-speech de aproximadamente 7B basado en la arquitectura Moshi. Escucha y genera audio de forma simultánea usando un codec neuronal, con prompts de rol y una condición de voz. El modelo puede producir audio y texto mientras mantiene el estado de la conversación, por lo que ataca directamente la parte que todavía nos falta: turn-taking, pausas, solapamientos y barge-in.

El model card oficial describe entrada y salida mono a 24 kHz, ejecución con PyTorch en Linux y optimización para GPU NVIDIA; también indica soporte de uso en inglés. El repositorio incluye un servidor interactivo local y una opción de CPU offload, pero la ruta documentada está orientada a su servidor/web client, no a nuestro protocolo de telefonía. Fuentes: [repositorio oficial](https://github.com/NVIDIA/personaplex) y [model card](https://huggingface.co/nvidia/personaplex-7b-v1).

## Encaje con nuestra arquitectura

```text
PSTN/WebRTC
    -> Node media gateway y control de tenant
    -> adaptador PersonaPlex 16 kHz <-> 24 kHz / WebSocket-Opus
    -> PersonaPlex 7B local
    -> audio PCM24k cancelable
    -> Node / Twilio o gateway SIP
```

PersonaPlex podría sustituir de una vez a:

- faster-whisper para la interpretación de voz;
- Smart Turn para parte de la toma de turno;
- el LLM conversacional rápido;
- Piper/Qwen3-TTS para la voz de respuesta.

No sustituiría:

- Node como autoridad de tenant, permisos y CRM;
- Sales Brain y las reglas de compliance;
- AMD, persistencia, trazas y evaluación;
- el media gateway, codecs PSTN, SIP o Twilio.

## Ventajas para el objetivo GPT-Live

| Área | PersonaPlex | Beneficio para nosotros |
|---|---|---|
| Full dúplex | Nativo speech-to-speech | Menos dependencia de turnos cerrados. |
| Interrupciones | El modelo escucha mientras habla | Mejor respuesta a barge-in y solapamientos. |
| Backchannels | Está entrenado y evaluado para ellos | Puede sonar más humano que reglas de “Ajá”. |
| Latencia | Generación de audio continua | Evita esperar a STT final + LLM + TTS. |
| Persona | Prompt de rol y voz condicionada | Puede conservar identidad y estilo. |
| Autoalojamiento | Servidor local, pesos descargables | Encaja con privacidad y control operativo. |

## Riesgos y límites para este proyecto

### 1. Español

El model card oficial especifica respuesta de voz en inglés para entrada de voz en inglés. Nuestro producto necesita conversaciones comerciales en español. No debemos inferir que un modelo que generaliza prompts producirá una voz española comercial estable.

Esto exige una prueba específica con:

- español peninsular y latino;
- nombres, precios, fechas y teléfonos;
- objeciones comerciales;
- ruido telefónico y audio G.711;
- interrupciones durante números y propuestas.

Hasta superar esa prueba, la ruta faster-whisper + LLM local + TTS local sigue siendo la opción de producción.

### 2. Licencia

El código del repositorio está bajo MIT, pero los pesos están bajo [NVIDIA Open Model License](https://www.nvidia.com/en-us/ai-data-science/foundation-models/open-model-license/) y requieren aceptar las condiciones en Hugging Face. Por ello lo clasificamos como **autoalojable con revisión de licencia**, no como una dependencia MIT completa. La licencia del modelo también menciona información adicional CC-BY-4.0 en el model card.

### 3. Hardware y operación

Es un modelo 7B con codec y dos streams. La documentación oficial está centrada en Linux y GPU NVIDIA, con CPU offload como alternativa. Necesitamos medir VRAM, latencia y concurrencia en la GPU concreta del servidor; no se debe asumir que el mismo equipo que sirve vLLM y TTS pueda servir PersonaPlex con margen suficiente.

### 4. Integración y herramientas

PersonaPlex no conoce nuestro CRM ni debe recibir credenciales de organización. El patrón correcto es que el modelo genere una intención o evento y Node valide y ejecute las herramientas. No se debe conectar PersonaPlex directamente a Prisma o a APIs de negocio.

### 5. Contrato de audio

Nuestra sesión remota usa PCM16 mono a 16 kHz de entrada y PCM16 a 24 kHz de salida. PersonaPlex documenta audio a 24 kHz y su servidor usa el stack Moshi/Opus/WebAudio. Necesitamos un adaptador aislado que:

1. convierta el audio entrante a 24 kHz;
2. gestione Opus/WebSocket si no existe un endpoint PCM estable;
3. convierta la salida a PCM24k para el contrato actual;
4. invalide inmediatamente la salida de una generación interrumpida;
5. emita transcripción/eventos sin romper la autoridad de Node.

## Decisión recomendada

No introducir PersonaPlex como `VOICE_ENGINE_TTS_PROVIDER`: no es TTS, sino un motor conversacional speech-to-speech completo.

Introducirlo, si el servidor tiene GPU NVIDIA suficiente, como un **motor experimental independiente**:

```text
VOICE_ENGINE_MODE=personaplex
```

Ese modo debe estar detrás de un adaptador con el mismo contrato `VoiceSession`, sin fallback silencioso y con una bandera de laboratorio. La primera comparación debe ser A/B contra la ruta OSS actual:

| Variante | STT | Turn-taking | LLM | TTS | Uso |
|---|---|---|---|---|---|
| OSS-cascade | faster-whisper | VAD + Smart Turn | vLLM local | Piper/Qwen3 | Producción española inicial |
| PersonaPlex-lab | PersonaPlex | nativo | PersonaPlex | PersonaPlex | Benchmark full dúplex |

## Plan de integración si supera el benchmark

1. Crear `PersonaPlexVoiceSession` sin tocar `VoiceSession` ni la lógica CRM.
2. Aislar el proceso en un contenedor GPU separado.
3. Añadir health/capabilities con versión, voz, idioma, GPU y licencia.
4. Implementar un bridge de audio 24 kHz y cancelación por generación.
5. Añadir eventos `speech.started`, `transcript.partial`, `assistant.audio`, `assistant.interrupt` y `tool.requested` al contrato común.
6. Probar llamadas de 30 minutos con pérdida de paquetes, silencio, solapamiento y transferencia.
7. Hacer canary sólo después de validar español, coste por llamada, seguridad y licencia.

## Veredicto

PersonaPlex es probablemente la alternativa OSS/autoalojable más alineada con la parte “GPT-Live” de nuestra hoja de ruta: full dúplex nativo, audio continuo y persona/voz en un único modelo. Sin embargo, para este CRM concreto tiene tres bloqueadores antes de producción: **español no garantizado, integración de audio distinta y licencia de pesos separada del código**.

La recomendación es usarlo como benchmark de investigación y posible motor `personaplex` aislado, mientras la ruta `remote` basada en faster-whisper + vLLM + Piper/Qwen3 queda como producción OSS controlable.

## ¿Podemos modificarlo para producción española?

Sí. Podemos construir una variante española, pero hay que distinguir entre una adaptación superficial y una adaptación de modelo.

### Lo que no es suficiente

- Cambiar el prompt de rol a español.
- Enviar audio español al modelo original esperando que el codec y el transformer aprendan el idioma en tiempo de inferencia.
- Traducir la conversación antes de PersonaPlex: añade latencia, rompe la prosodia y deja de ser una conversación española nativa.
- Cambiar sólo la voz NAT/VAR: una voz distinta no convierte el modelo en hispanohablante.

El modelo oficial aparece etiquetado como inglés y su model card limita explícitamente el caso de uso descrito a entrada inglesa y respuesta inglesa. Además, el repositorio oficial publica inferencia y evaluación, pero no una receta completa de fine-tuning español lista para ejecutar. Esto significa que tendríamos que desarrollar el pipeline de entrenamiento y validación sobre la arquitectura Moshi/Mimi.

### Tres niveles de adaptación

| Nivel | Qué hacemos | Calidad esperable | Recomendación |
|---|---|---:|---|
| Prompt + voz española | Prompt español y muestra de voz licenciada | Baja/irregular | Sólo demo inicial |
| Ajuste de adaptación | LoRA/ajuste parcial sobre audio y conversaciones españolas | Media, depende mucho de datos | Buen primer experimento |
| Fine-tuning de producción | Ajustar componentes de lenguaje, audio y comportamiento full dúplex con datos españoles | Potencialmente alta | Objetivo real, más costoso |

### Datos que necesitaríamos

El dataset no debe ser sólo locución limpia. PersonaPlex tiene que aprender simultáneamente idioma, prosodia y comportamiento interactivo:

1. Conversaciones españolas naturales de dos canales.
2. Turnos con pausas, interrupciones, solapamientos y backchannels.
3. Variantes peninsular y latinoamericana si el producto las necesita.
4. Casos comerciales: saludo, objeciones, precio, agenda, rechazo y transferencia.
5. Nombres, fechas, importes, direcciones y teléfonos.
6. Audio de micrófono y degradación telefónica G.711/µ-law.
7. Transcripción, rol de cada hablante, turnos y marcas de solapamiento.
8. Consentimiento documentado de cada voz y derechos de uso comercial del audio.

Para un prototipo, usaría decenas de horas muy limpias y bien anotadas. Para pretender producción robusta, planificaría cientos de horas de conversación española diversa; son órdenes de magnitud de proyecto, no requisitos publicados por NVIDIA.

### Estrategia de entrenamiento propuesta

```text
PersonaPlex v1 congelado
        │
        ├─ 1. Evaluación base en español: ASR, acento, turn-taking, voz
        │
        ├─ 2. Adaptación lingüística española
        │      audio español + texto español + conversaciones sintéticas revisadas
        │
        ├─ 3. Fine-tuning de diálogo y persona comercial
        │      prompts de rol + respuestas + voz licenciada
        │
        ├─ 4. Alineamiento full dúplex
        │      pausa, backchannel, interrupción y turn-taking
        │
        └─ 5. Evaluación PSTN y canary
               sólo si no degrada seguridad, latencia ni calidad
```

El paso 4 es imprescindible. Un modelo puede hablar español y aun así responder demasiado pronto, no ceder el turno o cortar palabras. La investigación reciente sobre alineamiento de modelos full dúplex trata precisamente pausa, turn-taking, backchannel e interrupción como objetivos separados; se puede usar como referencia metodológica, no como garantía de que el checkpoint ya esté listo para nuestro caso. Véase [Multi-Faceted Interactivity Alignment in Full-Duplex Speech Models](https://arxiv.org/abs/2606.11167).

### Cómo lo integraríamos en este repositorio

No modificaría directamente el checkpoint descargado ni mezclaría el entrenamiento con el backend. Haríamos un proyecto separado:

```text
personaplex-es/
  data_manifest/
  preprocessing/
  training/
  evaluation/
  checkpoints/
  serving_adapter/
```

El repositorio de llamadas sólo conocería un adaptador:

```text
backend VoiceSession
       -> PersonaPlexVoiceSession
       -> servidor local PersonaPlex-ES
       -> audio 24 kHz + eventos de texto
```

El adaptador debe conservar el mismo contrato que la ruta OSS actual: `speech.started`, `transcript.partial`, `transcript.final`, `assistant.audio`, `assistant.interrupt` y eventos de herramientas. Node seguiría controlando CRM, permisos, opt-out, AMD, transferencias y trazabilidad.

### Mi recomendación concreta

No sustituiría todavía la ruta de producción española. Haría lo siguiente:

1. Crear un benchmark español de 100–200 conversaciones cortas con audio real y teléfono.
2. Ejecutar PersonaPlex original para medir cuánto entiende, cuánto español genera y cómo maneja interrupciones.
3. Si la base es aprovechable, crear un primer ajuste parcial español y compararlo con el baseline `faster-whisper + vLLM + Piper/Qwen3`.
4. Mantener ambos motores aislados y comparar WER, latencia, barge-in, backchannel, naturalidad y conversión comercial.
5. Sólo hacer fine-tuning grande si el primer experimento demuestra que la arquitectura conserva sus ventajas full dúplex en español.

La decisión técnica sería: **sí podemos hacerlo, pero como proyecto de entrenamiento de modelos, no como una modificación pequeña del servidor**. La ruta actual nos permite producir y medir mientras desarrollamos `PersonaPlex-ES` sin poner en riesgo las llamadas reales.

## Alternativas más viables que adaptar directamente PersonaPlex

### Opción 1 — Crear `Moshi-ES` propio

Esta es la opción que elegiría si el objetivo principal es conseguir un “PersonaPlex español” realmente full dúplex.

Moshi ya es un framework de diálogo hablado full dúplex basado en Mimi y mantiene dos streams de audio. Además, Kyutai publica [moshi-finetune](https://github.com/kyutai-labs/moshi-finetune), que acepta conversaciones estéreo con el canal del agente y el canal del usuario, permite LoRA o fine-tuning completo y carga los adapters directamente en el servidor Moshi.

Ventajas:

- arquitectura nativa full dúplex;
- pipeline de entrenamiento público;
- formato de dataset ya definido;
- LoRA para empezar con menos coste;
- control total de idioma, persona, llamadas y datos.

Inconvenientes:

- el modelo base no está especializado en español;
- necesitamos adaptar idioma, voz y comportamiento;
- la licencia de los pesos base es CC-BY-4.0, y habría que documentar también la licencia del dataset y de las voces;
- la receta oficial de fine-tuning publica como referencia un entrenamiento exigente: una GPU H100 de 80 GB ronda 39.6 GB de memoria asignada en su configuración de ejemplo.

Es la ruta técnicamente más limpia para crear nuestro propio modelo: `Moshi + dataset español + LoRA + alineamiento de llamadas`.

### Opción 2 — Usar Qwen3-Omni como base multilingüe

[Qwen3-Omni](https://github.com/QwenLM/Qwen3-Omni) es una alternativa local end-to-end que oficialmente declara 19 idiomas de entrada de voz y 10 de salida, incluyendo español. También declara respuestas streaming de texto y voz, interacción en tiempo real y turn-taking natural. El repositorio se publica bajo Apache-2.0; debemos revisar por separado la licencia del checkpoint que descarguemos.

Ventajas:

- parte de una base lingüística mucho más adecuada para español;
- ya incluye voz de salida, texto y audio en una arquitectura Thinker–Talker;
- puede servir como modelo conversacional y de voz en un único servicio;
- el README incluye demo local, Docker y serving.

Inconvenientes:

- el checkpoint oficial principal es `30B-A3B`, mucho más exigente que nuestro vLLM de 8B;
- “streaming y turn-taking natural” no equivale automáticamente al full dúplex extremo de PersonaPlex;
- habría que adaptar su interfaz a `VoiceSession` y verificar cancelación inmediata;
- la personalización de voz y fine-tuning específico de llamadas requiere trabajo propio.

Esta es probablemente la mejor opción para un **benchmark español de calidad**, pero no asumiría todavía que sea la mejor opción para muchas llamadas concurrentes.

### Opción 3 — GLM-4-Voice

[GLM-4-Voice](https://github.com/zai-org/GLM-4-Voice) es end-to-end y ofrece streaming de texto/voz, pero su documentación oficial declara comprensión y generación en chino e inglés. El código es Apache-2.0, mientras que los pesos tienen condiciones propias.

Es interesante para estudiar el diseño tokenizer + modelo + decoder, pero no lo elegiría como base española sin un proyecto de adaptación mayor.

## Recomendación final de arquitectura

```text
Producción inmediata:
  faster-whisper + Smart Turn + Qwen local + Qwen3-TTS/Piper

Modelo full dúplex propio:
  Moshi-ES + Mimi + LoRA/fine-tuning + dataset estéreo español

Benchmark multilingüe:
  Qwen3-Omni local, adaptado al contrato VoiceSession
```

La mejor decisión no es elegir un único modelo a ciegas. Es mantener la ruta modular para producción y construir `Moshi-ES` en paralelo. Así podemos conseguir una voz española controlada ahora y, si el entrenamiento sale bien, migrar después a un modelo nativo full dúplex.

### Orden recomendado de trabajo

1. Ejecutar un benchmark de Qwen3-Omni en español con 20–50 llamadas grabadas.
2. Preparar el mismo dataset en formato estéreo para `moshi-finetune`.
3. Entrenar un LoRA pequeño sobre Moshi con diálogos españoles.
4. Comparar ambos contra la ruta actual en WER, latencia, interrupciones, backchannels, naturalidad y conversión.
5. Sólo después decidir si merece la pena un fine-tuning completo o una adaptación más profunda del codec/decoder.

**Mi recomendación:** para “crear nuestro propio PersonaPlex español”, elegir `Moshi-ES`; para obtener resultados españoles antes, probar `Qwen3-Omni`; para producción estable hoy, continuar con nuestra arquitectura modular OSS.

## Ranking de arquitecturas y modelos

El ranking separa dos preguntas distintas:

1. ¿Qué podemos poner en producción con riesgo controlado?
2. ¿Qué opción tiene más potencial para acercarnos a GPT-Live?

La puntuación es una valoración de ingeniería para este CRM, no una clasificación oficial de los autores. Peso usado: español 30 %, full dúplex 25 %, producción 20 %, coste/hardware 15 % y facilidad de integración 10 %.

### Ranking general para nuestro proyecto

| Puesto | Arquitectura | Español | Full dúplex | Producción | Hardware | Integración | Nota |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Cascada OSS + Interaction Loop continuo | 9 | 7 | 9 | 9 | 10 | Mejor opción para operar ya. |
| 2 | Moshi-ES entrenado con llamadas españolas | 7→9 | 10 | 6 | 5 | 6 | Mejor apuesta estratégica para crear nuestro propio PersonaPlex. |
| 3 | Qwen3-Omni local + adapter `VoiceSession` | 9 | 8 | 7 | 4 | 6 | Mejor candidato preentrenado para español, pero pesado. |
| 4 | PersonaPlex-ES fine-tuned | 5→8 | 10 | 5 | 5 | 5 | Gran potencial, más riesgo de datos y licencia. |
| 5 | GLM-4-Voice adaptado a español | 4→8 | 7 | 5 | 6 | 6 | Parte de chino/inglés; exige adaptación profunda. |
| 6 | PersonaPlex original con prompt español | 3 | 10 | 3 | 5 | 4 | Sólo laboratorio; no recomendar para llamadas españolas. |

### Ranking de producción inmediata

#### 1. Cascada OSS + Interaction Loop — recomendada ahora

```text
Twilio/SIP
  -> Node media gateway
  -> audio ring buffer
  -> Silero VAD + Smart Turn
  -> faster-whisper o Qwen3-ASR
  -> Qwen3/Llama local servido por vLLM
  -> Sales Brain + herramientas en Node
  -> Qwen3-TTS/Kokoro/Piper
  -> audio cancelable
```

Es la arquitectura que ya tenemos parcialmente implementada. Permite sustituir cada componente, medirlo y mantener la autoridad de Node sobre CRM, permisos y compliance. No es audio-audio nativo, pero es la opción con mejor relación calidad/riesgo.

**Modelos recomendados:**

- STT: faster-whisper como baseline; Qwen3-ASR como benchmark multilingüe.
- Turn: Silero VAD + Smart Turn.
- LLM rápido: Qwen3 8B/14B instruct sin thinking durante la llamada.
- TTS rápido: Piper o Kokoro.
- TTS calidad: Qwen3-TTS con voz española licenciada.

#### 2. Cascada OSS partida por servicios — recomendada para escalar

```text
Node gateway
  -> Turn service CPU
  -> STT GPU pool
  -> LLM GPU pool
  -> TTS GPU/CPU pool
  -> Node audio e integración CRM
```

Cada servicio escala de forma independiente y puede tener modelos distintos para llamadas rápidas y llamadas de calidad. Es mejor para concurrencia, pero añade colas, observabilidad y coordinación entre procesos.

#### 3. Dual-engine A/B — recomendada durante la transición

```text
                    ┌─ Cascada OSS producción
Call -> Router -----┤
                    └─ Moshi-ES/Qwen3-Omni laboratorio
```

Ambos motores implementan `VoiceSession`. El router asigna por organización, campaña o porcentaje canary. Es la estructura que permite entrenar y comparar un motor full dúplex sin poner en riesgo todo el tráfico.

### Ranking de evolución full dúplex

#### 1. Moshi-ES propio

Es la mejor opción si queremos controlar el modelo y crear una experiencia especializada en llamadas españolas. Moshi ya tiene arquitectura full dúplex y el proyecto oficial `moshi-finetune` define dataset estéreo, LoRA y fine-tuning completo. [Moshi](https://github.com/kyutai-labs/moshi) · [Moshi-finetune](https://github.com/kyutai-labs/moshi-finetune)

```text
Canal usuario ─┐
               ├─ Mimi ─ Moshi-ES ─ Mimi ─ salida agente
Canal agente ──┘          │
                    texto/eventos
                         ↓
                  Node policy/tools
```

**Ideal para:** full dúplex real, control de voz, español y turn-taking.  
**Riesgo principal:** necesita datos estéreo de calidad y GPU de entrenamiento.

#### 2. Qwen3-Omni como motor español preentrenado

Qwen3-Omni declara español tanto en entrada como en salida de voz, streaming y turn-taking natural. Es la opción más atractiva para probar calidad española antes de entrenar un modelo propio. [Qwen3-Omni](https://github.com/QwenLM/Qwen3-Omni)

```text
Audio 24 kHz
   -> Qwen3-Omni Thinker/Talker
   -> texto + audio streaming
   -> adapter PCM/WebSocket
   -> Node VoiceSession
```

**Ideal para:** validar rápidamente si un modelo nativo multilingüe mejora la voz española.  
**Riesgo principal:** el checkpoint `30B-A3B` es pesado y el comportamiento full dúplex debe medirse específicamente en nuestro protocolo.

#### 3. PersonaPlex-ES

```text
PersonaPlex 7B
   + audio español
   + conversaciones comerciales
   + LoRA/fine-tuning
   + alineamiento de turn-taking
   = PersonaPlex-ES
```

**Ideal para:** explotar el diseño de voz/persona y full dúplex de PersonaPlex.  
**Riesgo principal:** el modelo base está orientado a inglés, y el checkpoint tiene licencia NVIDIA distinta de la licencia MIT del código.

#### 4. GLM-4-Voice-ES

GLM-4-Voice tiene un diseño end-to-end con tokenizer de audio, modelo de lenguaje y decoder streaming, pero el proyecto oficial declara chino e inglés. [GLM-4-Voice](https://github.com/zai-org/GLM-4-Voice)

**Ideal para:** investigación de arquitectura speech-text-speech.  
**Riesgo principal:** el salto de chino/inglés a español puede exigir modificar tokenizer, datos y decoder.

## Estructuras de despliegue

| Estructura | Servicios | GPU | Uso | Ranking |
|---|---|---:|---|---:|
| Sidecar monolítico | Node + un `voice-engine` | 1 | Desarrollo y primera producción | 1 para empezar |
| Pools separados | STT, LLM, TTS y turn service | 2+ | Concurrencia y escalado | 1 para crecer |
| Motor S2S aislado | Node + Moshi-ES/Qwen3-Omni | 1 GPU dedicada | Investigación full dúplex | 1 para laboratorio |
| Dual-engine canary | Cascada + S2S | 2+ | Migración segura | 1 para transición |
| Todo SIP autoalojado | Asterisk/FreeSWITCH + Node + IA | Variable | Eliminar Twilio | Después de estabilizar IA |

### Estructura de repositorios recomendada

```text
llamadasrobin/
├─ backend/                    # CRM, tenant, tools, telephony control
├─ voice-engine/               # cascada OSS y protocolo VoiceSession
├─ voice-models/
│  ├─ moshi-es/
│  │  ├─ data-manifests/
│  │  ├─ preprocessing/
│  │  ├─ training/
│  │  ├─ evaluation/
│  │  └─ checkpoints/
│  ├─ qwen3-omni-adapter/
│  └─ personaplex-es-adapter/
├─ voice-benchmarks/
│  ├─ spanish-calls/
│  ├─ duplex-tests/
│  ├─ pstn-tests/
│  └─ reports/
└─ docs/
```

El backend nunca debe importar directamente el código de entrenamiento. Sólo debe depender del contrato `VoiceSession` y de un endpoint interno autenticado.

## Decisión recomendada

### Ahora

Mantener la cascada OSS con el Interaction Loop continuo y crear un benchmark de Qwen3-Omni. Es la forma más rápida de saber si ya tenemos una alternativa española end-to-end sin entrenar meses.

### En paralelo

Construir `Moshi-ES` con LoRA sobre conversaciones estéreo españolas. El formato oficial de `moshi-finetune` encaja muy bien con llamadas porque separa el canal del agente y el del usuario y conserva la dinámica full dúplex.

### Después

Si `Moshi-ES` supera la cascada en interrupciones, latencia percibida, naturalidad y conversión, convertirlo en motor canary. Si Qwen3-Omni da mejor español con menos entrenamiento, usarlo como motor S2S y conservar Moshi-ES como línea de investigación.

**Ranking final de decisión:**

1. Cascada OSS + Interaction Loop para producción.
2. Moshi-ES como proyecto propio full dúplex.
3. Qwen3-Omni como benchmark y posible motor español preentrenado.
4. PersonaPlex-ES como alternativa experimental.
5. GLM-4-Voice-ES sólo como investigación.
