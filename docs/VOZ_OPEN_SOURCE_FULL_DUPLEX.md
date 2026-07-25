# Arquitectura de voz Open Source para llamadas full-duplex

> Documento de diseño para `llamadasrobin`. Revisa el módulo actual de llamadas y propone alternativas para ejecutar STT, TTS, detección de turnos y LLM en un servidor propio.
>
> Fecha: 2026-07-24

> **Estado actualizado:** la decisión de despliegue y el análisis de PersonaPlex están en [VOICE_ENGINE_OPENSOURCE_GPT_LIVE_ESTADO.md](./VOICE_ENGINE_OPENSOURCE_GPT_LIVE_ESTADO.md). Este documento conserva el diseño y el inventario histórico.

## 1. Conclusión ejecutiva

El backend actual ya tiene una buena base de transporte y CRM:

```text
Twilio Media Stream
  -> WebSocket Fastify
  -> µ-law 8 kHz -> PCM16 16 kHz
  -> Deepgram Flux STT
  -> Cerebras LLM por tokens
  -> ElevenLabs TTS PCM 24 kHz
  -> PCM 24 kHz -> µ-law 8 kHz
  -> Twilio
```

También existen barge-in, cancelación especulativa, clasificación de ruido, perfiles de voz, persistencia idempotente de la llamada y eventos al CRM.

La limitación principal es arquitectónica: la conversación sigue siendo **turn-based**. El agente espera un evento final de STT, genera texto y después sintetiza voz. El barge-in interrumpe la salida, pero no convierte el modelo en una conversación de audio continua.

### Recomendación

Para la primera iteración recomiendo:

1. Mantener Twilio, Fastify, Prisma y el flujo de `/voice`.
2. Mantener el WebSocket y `AudioBridge` de Node como adaptador de telefonía.
3. Añadir un `voice-engine` Python autoalojado detrás de WebSocket o gRPC.
4. Sustituir primero STT y TTS mediante interfaces intercambiables.
5. Añadir VAD + detección semántica de turno para mejorar interrupciones.
6. Servir el LLM local con vLLM y respuestas sin modo de razonamiento durante la llamada.
7. Mantener el fallback propietario desactivado en producción; sólo habilitarlo temporalmente con una bandera explícita de migración.

No empezaría migrando todo a un modelo speech-to-speech end-to-end: es más difícil de depurar, evaluar, interrumpir, conectar con herramientas y controlar en un CRM comercial.

## 2. Qué hace realmente el backend actual

### Entrada de llamada

- `backend/src/routes/voice.ts` valida contexto multi-tenant, firma de Twilio y datos de la llamada.
- `backend/src/voice/telephony/twilioClient.ts` genera TwiML e inicia llamadas salientes.
- `backend/src/voice/telephony/mediaStream.ts` recibe el WebSocket de Twilio.
- `backend/src/voice/telephony/streamAuth.ts` protege la capacidad temporal de abrir el stream.

### Audio

`backend/src/voice/audio/bridge.ts` convierte:

- Entrada: µ-law/G.711 a 8 kHz de Twilio → PCM16 a 16 kHz para STT.
- Salida: PCM16 a 24 kHz de TTS → µ-law a 8 kHz y frames de 20 ms para Twilio.

Esto es correcto para telefonía, pero la llamada telefónica limita la calidad final a banda estrecha. Un TTS excelente seguirá oyéndose como voz de 8 kHz cuando salga por PSTN.

### Pipeline de IA

`backend/src/voice/pipelines/deepgramElevenLabs.ts` crea por llamada:

- `DeepgramSTT` para parciales, `EagerEndOfTurn`, `EndOfTurn` y `TurnResumed`.
- `CerebrasAgent` para generar tokens.
- `ElevenLabsTTS` que dispara una petición HTTP por frase completa.
- `GuruSupervisor` opcional para cambiar estrategia de venta en segundo plano.

El pipeline ya mide aproximadamente tres intervalos importantes:

```text
fin de turno -> primer token LLM
primer token LLM -> primer audio TTS
fin de turno -> primer audio TTS
```

Hay que conservar esas métricas y añadir métricas de VAD, cancelación y reproducción.

### Persistencia y CRM

`backend/src/services/calls.service.ts` hace más que guardar una grabación: valida que lead, agente, campaña y organización coincidan; crea/actualiza `Call`; registra actividad; crea el mensaje de conversación; publica `call.completed`; actualiza campaña y puede crear una reunión.

El motor de voz no debe escribir directamente en Prisma. Debe devolver eventos al backend actual para conservar seguridad, multi-tenant, idempotencia y auditoría.

## 3. Full-duplex: qué debemos construir

Full-duplex no significa únicamente que el WebSocket pueda enviar y recibir audio a la vez. Necesitamos cuatro bucles concurrentes:

```text
                 ┌───────────────┐
audio entrante ->│ VAD / turn    │-> parciales STT -> contexto
                 └──────┬────────┘                    │
                        │ habla el usuario             │
                        v                               v
                 cancelar salida             LLM streaming / tools
                        │                               │
                        v                               v
                 limpiar playback <--------- TTS streaming -> audio saliente
```

Comportamiento esperado:

- El usuario puede hablar mientras el agente está hablando.
- La detección de voz del usuario cancela LLM/TTS inmediatamente.
- El sistema conserva la última frase válida y no duplica la respuesta especulativa.
- El agente puede emitir un acuse corto (“sí”, “entiendo”) sin iniciar una respuesta larga.
- La decisión de fin de turno combina silencio, texto parcial, gramática y prosodia.
- Cada frame de audio lleva `sessionId`, secuencia y timestamp para detectar pérdida o reordenación.

## 4. Opciones de estructura

### Opción A — Sidecar de voz junto al backend actual (recomendada)

```text
                    ┌──────────────────────────┐
Twilio <-> Node     │ Fastify + Prisma          │
Media Stream        │ CRM, auth, compliance    │
                    │ µ-law, WebSocket         │
                    └───────────┬──────────────┘
                                │ PCM16 + eventos
                    ┌───────────v──────────────┐
                    │ voice-engine Python      │
                    │ VAD + STT + LLM + TTS    │
                    │ GPU                      │
                    └──────────────────────────┘
```

**Ventajas**

- Cambia el motor de IA sin tocar Twilio ni el CRM.
- Python tiene mejor ecosistema para audio y GPU.
- Permite hacer shadow testing contra Deepgram/ElevenLabs.
- El servidor Node sigue siendo el único dueño de identidad, permisos y persistencia.

**Inconvenientes**

- Hay un salto adicional de red.
- Se necesitan contratos de eventos y control de backpressure.
- Hay que operar dos runtimes.

Es el mejor equilibrio para este repositorio.

### Opción B — Pipecat como motor de voz

Pipecat es un framework Open Source orientado a agentes de voz en tiempo real, con transportes, serializadores de Twilio, VAD, STT, TTS, herramientas y observabilidad. Su catálogo incluye integraciones locales y proveedores como Whisper, Kokoro, Piper, Chatterbox/Resemble y otros. [Pipecat](https://github.com/pipecat-ai/pipecat)

```text
Twilio -> Pipecat voice worker -> Node API / eventos CRM
```

**Cuándo elegirlo**

- Queremos acelerar la experimentación con diferentes modelos.
- Aceptamos que el orquestador principal de una llamada pase a Python.
- Queremos añadir después WebRTC, audio local, WhatsApp o vídeo.

**Riesgo**

No conviene introducir Pipecat y cambiar todos los modelos en el mismo despliegue. Primero debe reproducir el contrato actual de `call.completed`, transferencia, opt-out y cierre.

### Opción C — LiveKit self-hosted

LiveKit Agents ofrece un framework Open Source para agentes realtime, con servidor LiveKit autoalojable, WebRTC, telephony, distribución de trabajos, turn detection y herramientas. [LiveKit Agents](https://github.com/livekit/agents)

```text
PSTN/SIP o navegador -> LiveKit Server -> LiveKit Agent -> Node CRM API
```

**Ventajas**

- Mejor transporte para audio de banda ancha y clientes web.
- Muy buena base para llamadas de navegador, vídeo y agentes concurrentes.
- La separación media/control es más limpia a gran escala.

**Inconvenientes**

- Añade un servidor de medios y una capa operativa importante.
- Migrar desde Twilio Media Streams es más grande.
- No mejora la calidad de una llamada PSTN por sí solo.

La reservaría para una segunda fase, especialmente si se quiere que el usuario pueda hablar desde el navegador con Opus/WebRTC en lugar de una llamada telefónica.

### Opción D — Media server dedicado

Separar la terminación de audio en un servicio SIP/WebRTC/media server y dejar Node como control plane:

```text
Twilio/SIP/WebRTC -> media gateway -> voice-engine -> Node CRM
```

Es útil para muchas llamadas simultáneas, grabación avanzada, mezcla, monitorización y failover. Para el volumen actual parece prematuro; primero hay que medir concurrencia real y coste de GPU.

## 5. Modelos Open Source por capa

### 5.1 STT

| Candidato | Papel | Ventajas | Limitaciones |
|---|---|---|---|
| `faster-whisper` con `large-v3-turbo` | Calidad principal en GPU | MIT, buena precisión y hasta 4× de mejora frente a la implementación Whisper original según su proyecto; admite cuantización | No ofrece por sí solo los eventos Flux de fin de turno; hay que añadir VAD y segmentación |
| `faster-whisper` `medium` o `small` | Baja latencia / menor GPU | Adecuado para un piloto y más concurrencia | Más errores con ruido, nombres y teléfonos |
| `whisper.cpp` | CPU/edge o servicio ligero | Muy portable y fácil de empaquetar | Streaming y calidad dependen del wrapper y del tamaño elegido |

`faster-whisper` es un buen primer reemplazo, pero no debe tratarse como un sustituto directo de Deepgram Flux. El servicio debe producir un contrato propio: `partial`, `speech_started`, `eager_end`, `turn_resumed` y `final`.

Fuente: [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper).

### 5.2 VAD y turn-taking

| Candidato | Uso |
|---|---|
| Silero VAD | Detectar voz/no-voz en streaming. Es ligero, funciona a 8/16 kHz y tiene licencia MIT. |
| Smart Turn | Decidir si la persona terminó la idea usando audio y prosodia, no solo silencio. El proyecto publica pesos y código con licencia BSD-2-Clause. |
| Heurística actual | Mantenerla como fallback durante la migración. |

Silero VAD puede ejecutarse en CPU y su proyecto afirma que un chunk de 30 ms puede procesarse en menos de 1 ms en un hilo moderno. Debe validarse con nuestras grabaciones y ruido de llamadas, no asumir ese número como SLA. [Silero VAD](https://github.com/snakers4/silero-vad)

Smart Turn encaja mejor con el objetivo de conversación natural porque intenta distinguir una pausa interna de un final de turno. [Smart Turn](https://github.com/pipecat-ai/smart-turn)

### 5.3 TTS

| Candidato | Papel recomendado | Calidad/latencia esperable | Licencia y riesgos |
|---|---|---|---|
| Chatterbox Multilingual V3 | Principal para voz expresiva y clonación consentida | 500M; incluye español y variantes `es-es`/`es-mx`; debe medirse el primer audio en GPU | El repositorio es MIT; el audio de salida incorpora watermark Perth. Revisar siempre los términos del checkpoint y usar solo voces con consentimiento |
| Kokoro-82M | Opción ligera y rápida | Muy pequeño y económico de ejecutar; excelente candidato para fallback | Pesos Apache-2.0, pero hay que validar específicamente acento y voces españolas antes de adoptarlo como voz comercial |
| Piper | Fallback CPU y alta disponibilidad | Muy rápido, estable y local; voz menos expresiva | La implementación actual `piper1-gpl` es GPL-3.0; evaluar impacto si se redistribuye el producto o la imagen |

Chatterbox tiene un pack dedicado de español de España y otro latinoamericano, lo que lo hace especialmente interesante para este proyecto. [Chatterbox](https://github.com/resemble-ai/chatterbox)

Kokoro es atractivo si la prioridad es servir muchas llamadas con poca GPU: el model card describe 82M de parámetros y pesos Apache-2.0. Hay que comprobar la voz concreta, no solo el tamaño del modelo. [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)

Piper es una red de seguridad excelente para degradar con elegancia, pero GPL-3.0 requiere una revisión legal antes de empaquetarlo en un producto distribuido. [Piper](https://github.com/OHF-Voice/piper1-gpl)

### 5.4 LLM de conversación

La llamada necesita un modelo rápido, breve y predecible; el razonamiento largo debe ir a un worker separado.

| Candidato | Uso |
|---|---|
| Qwen3 8B/14B | Respuesta en vivo con `enable_thinking=false`; buen equilibrio entre calidad y latencia |
| Qwen3 32B | Supervisor o llamadas de mayor valor; no lo pondría en el camino crítico sin GPU dedicada |
| Llama/Mistral de tamaño equivalente | Alternativas si las pruebas internas muestran mejor español o tool calling |

Qwen3 documenta un interruptor explícito para activar/desactivar el razonamiento. Para una llamada usaría modo no-thinking y limitaría la respuesta a 1–3 frases; para `GuruSupervisor` usaría otro modelo o una cola asíncrona. [Qwen3 model card](https://huggingface.co/Qwen/Qwen3-32B)

Para servirlo usaría vLLM, que expone API compatible con OpenAI para chat, streaming, embeddings y otros endpoints. Esto permite reutilizar gran parte del cliente actual. [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/)

## 6. Arquitectura técnica propuesta

### Separación de responsabilidades

```text
Node / control plane
  - Twilio, firma, auth y capability de stream
  - multi-tenant y compliance
  - AgentConfig desde Prisma
  - autorización de tools
  - CallContext y persistencia
  - eventos CRM y auditoría

Python / voice-engine
  - decodificación opcional y normalización PCM
  - Silero VAD + Smart Turn
  - STT streaming o ventanas incrementales
  - interrupción y cola de audio
  - LLM streaming
  - TTS streaming
  - métricas de latencia
```

### Contrato mínimo entre Node y voice-engine

El contrato debe ser independiente de Deepgram, ElevenLabs, Cerebras o cualquier modelo concreto:

```json
{ "type": "session.start", "sessionId": "...", "orgId": "...", "agent": { "language": "es-ES", "voice": "..." } }
{ "type": "audio.in", "seq": 42, "timestampMs": 840, "pcm16kBase64": "..." }
{ "type": "speech.started", "timestampMs": 900 }
{ "type": "transcript.partial", "text": "hola, quería..." }
{ "type": "turn.eager_end", "text": "hola, quería información", "confidence": 0.82 }
{ "type": "turn.final", "text": "hola, quería información", "words": [] }
{ "type": "assistant.audio", "seq": 18, "sampleRate": 24000, "pcmBase64": "..." }
{ "type": "assistant.interrupt" }
{ "type": "transcript.final", "role": "agente", "text": "..." }
{ "type": "session.end", "reason": "remote_stop" }
```

Reglas importantes:

- El `orgId`, `leadId`, `agentId` y `campaignId` los firma y valida Node; nunca se aceptan como autoridad desde un cliente de audio.
- El motor de voz no puede llamar Prisma ni ejecutar herramientas arbitrarias.
- Las herramientas se solicitan a Node con un `tool.call` y Node responde con `tool.result` después de comprobar permisos.
- Los frames deben tener límite de tamaño, límite de tasa y timeout de sesión.
- El motor debe soportar `cancel` con `AbortController` o equivalente para cortar generación inmediatamente.

### Interfaz de proveedor en Node

Aunque la implementación viva en Python, conviene definir un contrato equivalente en TypeScript:

```ts
export interface VoiceEngineSession {
  sendAudio(pcm16k: Buffer): Promise<void>
  interrupt(): Promise<void>
  close(): Promise<void>
  onAudio(cb: (pcm24k: Buffer) => Promise<void>): void
  onEvent(cb: (event: VoiceEngineEvent) => Promise<void>): void
}

export interface VoiceEngineFactory {
  createSession(input: {
    callSid: string
    language: string
    systemPrompt: string
    voice: string
    context: Record<string, unknown>
  }): Promise<VoiceEngineSession>
}
```

El pipeline actual puede seguir llamándose `DeepgramElevenLabsSession` durante la transición, pero conviene renombrar la abstracción a `VoiceEngineSession` y mover los nombres de proveedores a adaptadores.

## 7. Cambios necesarios en el backend

### Estado de esta implementación

La primera integración ya está implementada en TypeScript:

```text
backend/src/voice/engine/voiceSession.ts
backend/src/voice/engine/remoteVoiceEngine.ts
backend/src/voice/engine/factory.ts
```

El WebSocket de Twilio ahora obtiene una sesión a través de `createVoiceSession()`.
Por defecto usa el motor autoalojado. Para activarlo explícitamente:

```env
VOICE_ENGINE_MODE=remote
VOICE_ENGINE_URL=ws://voice-engine:9100/ws
VOICE_ENGINE_TOKEN=<secreto-compartido>
VOICE_ENGINE_FALLBACK=false
VOICE_ENGINE_ALLOW_PROPRIETARY=false
```

El cliente remoto conecta antes de consumir audio, envía un `session.start` con el contexto ya validado por Node, transmite PCM16/16 kHz y espera eventos `assistant.audio` en PCM16/24 kHz. Si no logra conectar, la llamada falla de forma visible; no vuelve al pipeline legado salvo que se habiliten simultáneamente `VOICE_ENGINE_ALLOW_PROPRIETARY=true` y `VOICE_ENGINE_FALLBACK=true`.

El servicio remoto debe implementar el protocolo descrito en este documento. La autenticación es servicio-a-servicio; el motor remoto no debe estar expuesto directamente al navegador ni tener acceso directo a Prisma.

También se incluye un servicio de referencia ejecutable en `voice-engine/` con `faster-whisper`, vLLM/OpenAI-compatible y Piper. Está diseñado para validar el contrato y la ruta de migración; antes de producción hay que medir la latencia real, añadir Smart Turn y seleccionar una voz española con licencia adecuada.

### Prioridad P0: abstraer proveedores

Crear:

```text
backend/src/voice/engine/
  voiceEngine.ts
  voiceEngineEvents.ts
  remoteVoiceEngine.ts
backend/src/voice/providers/
  sttProvider.ts
  ttsProvider.ts
  llmProvider.ts
```

El pipeline debe depender de interfaces, no de `DeepgramSTT`, `ElevenLabsTTS` o `CerebrasAgent` directamente.

### Prioridad P0: corregir la semántica de audio

- Mantener `µ-law 8 kHz` para Twilio.
- Mantener PCM16 16 kHz para STT/VAD.
- Mantener un formato interno único para TTS, preferiblemente PCM16 24 kHz.
- No enviar WAV con cabecera dentro de un stream de frames.
- Mantener frames de 20 ms y backpressure.
- Vaciar la cola de salida en cada interrupción.
- Asociar cada chunk a un `generationId`, para descartar audio viejo después de un barge-in.

### Prioridad P0: desacoplar fin de turno

No reemplazar `EndOfTurn` de Deepgram por un `setTimeout` simple. Implementar:

```text
VAD start -> partials -> Smart Turn score -> eager end -> final
```

El `EagerEnd` puede iniciar una respuesta especulativa corta. Si llega `TurnResumed`, se cancela. Solo se guarda en el historial la respuesta que haya sobrevivido a la confirmación final.

### Prioridad P1: LLM local compatible

El actual `cerebras.ts` debería aceptar:

```env
LLM_BASE_URL=http://vllm:8000/v1
LLM_API_KEY=local-token
LLM_MODEL=Qwen/Qwen3-8B
LLM_ENABLE_THINKING=false
LLM_TIMEOUT_MS=2500
```

No reutilizar el nombre `CEREBRAS_*` para un servidor local. Mantener compatibilidad temporal con las variables antiguas, pero introducir nombres neutrales.

### Prioridad P1: TTS con streaming real

El adaptador actual genera una petición HTTP por frase. Para el motor local se necesita una cola de texto y audio:

```text
token LLM -> segmentador de frase -> cola TTS -> audio chunk -> playback
```

Cada generación debe tener cancelación, `firstAudioAt`, `lastAudioAt` y `generationId`. Si el motor TTS solo entrega el wav completo al final, no es apto para conversación de baja latencia.

### Prioridad P1: preservar el contrato CRM

El sidecar debe finalizar con el mismo evento que hoy usa `ingestCall`:

```text
voice-engine -> Node -> ingestCall() -> Call + Message + SalesActivity + Outbox
```

No duplicar `Call` desde Python ni publicar directamente en Redis/Prisma sin pasar por la lógica existente.

## 8. Despliegues posibles

### Perfil de laboratorio

```text
1 servidor GPU
  Node + PostgreSQL + Redis
  voice-engine
  vLLM
```

Útil para probar un flujo y una llamada simultánea. No mezclar demasiadas llamadas con un modelo grande hasta medir VRAM y colas.

### Perfil recomendado para producción inicial

```text
Servidor 1: Node API + worker + PostgreSQL/Redis
Servidor 2: voice-engine + VAD + STT + TTS
Servidor 3: vLLM dedicado
```

Ventajas: el LLM no puede bloquear el audio y es posible escalar motores por separado.

### Perfil de mayor concurrencia

```text
Load balancer
  -> varios voice-engine workers
  -> pool de GPU STT/TTS
  -> pool vLLM
  -> Redis para estado efímero
```

La afinidad de sesión debe mantenerse durante toda la llamada. Una llamada no puede saltar de worker sin migración explícita del estado y del playback.

### Hardware orientativo para empezar

Son puntos de partida, no garantías de concurrencia:

| Perfil | Objetivo | Punto de partida |
|---|---|---|
| CPU | VAD, fallback TTS y pruebas | 8 vCPU, 16 GB RAM; no esperar la mejor voz ni varias llamadas fluidas |
| GPU única media | 1–3 llamadas, modelos pequeños/medios | 16–24 GB VRAM; separar procesos y medir contención |
| GPU alta | LLM 14B/32B, TTS expresivo y más concurrencia | 24–48 GB VRAM o varias GPU |

La métrica decisiva no es el tamaño del modelo, sino `turn.final -> first audio` bajo concurrencia real.

## 9. Comparativa de decisión

| Ruta | Calidad de voz | Latencia | Complejidad | Recomendación |
|---|---:|---:|---:|---|
| Node actual + proveedores actuales | Alta | Buena si los proveedores responden | Baja | Mantener como fallback |
| Node + sidecar Open Source | Alta potencial | Buena con GPU dedicada | Media | **Siguiente paso recomendado** |
| Pipecat + modelos locales | Alta potencial | Buena | Media/alta | Elegir si queremos framework de voz |
| LiveKit self-hosted | Muy alta en WebRTC | Muy buena | Alta | Segunda fase para navegador/WebRTC |
| Speech-to-speech end-to-end | Variable | Potencialmente excelente | Muy alta | Experimental, no primera migración |

## 10. Plan de migración sin romper llamadas

### Fase 0 — Instrumentación

- Medir P50/P95 de EOT, TTFT, primer audio y duración de barge-in.
- Registrar WER aproximado con un conjunto de llamadas consentidas.
- Añadir `generationId`, secuencia de audio y motivo de cancelación.
- No cambiar proveedores todavía.

### Fase 1 — Abstracción

- Introducir interfaces STT/TTS/LLM.
- Mover nombres específicos de proveedor a adaptadores.
- Configurar `LLM_BASE_URL` y timeouts neutrales.
- Añadir un `RemoteVoiceEngine` que implemente el protocolo.

### Fase 2 — Shadow STT

- Duplicar audio hacia `faster-whisper` sin usar su resultado en vivo.
- Comparar transcripción, detección de números, nombres, opt-out y EOT.
- Aceptar el modelo local solo si no empeora los criterios de seguridad.

### Fase 3 — TTS A/B

- Generar muestras offline con las mismas frases y perfiles actuales.
- Probar Chatterbox, Kokoro y Piper.
- Evaluar pronunciación española, naturalidad, interrupción y primer chunk.
- Guardar solo métricas y muestras con consentimiento.

### Fase 4 — LLM local

- Servir Qwen3 con vLLM en modo no-thinking.
- Limitar el camino crítico a 1–3 frases.
- Mantener `GuruSupervisor` fuera del camino crítico.
- Fallback a Cerebras si el LLM local supera el timeout.

### Fase 5 — Turn-taking full-duplex

- Silero VAD en cada frame.
- Smart Turn o clasificador propio para EOT.
- Cancelación por `generationId`.
- Pruebas específicas: pausas, interrupciones, ruido, eco, solapamiento y frases incompletas.

### Fase 6 — Canary

- Activar por organización o agente, no globalmente.
- Comparar métricas con el pipeline anterior.
- Rollback por variable de entorno.
- Solo después considerar mover el WebSocket a Pipecat o LiveKit.

## 11. Criterios de aceptación

### Latencia

- P50 de `fin de turno -> primer audio`: objetivo inicial < 900 ms.
- P95: objetivo inicial < 1.8 s.
- Barge-in: detener audio audible en < 250 ms desde `speech.started`.
- Ningún TTS cancelado debe continuar reproduciéndose después de cambiar `generationId`.

Los objetivos son de diseño y deben validarse con hardware y red reales.

### Calidad

- Transcripción española correcta en nombres, teléfonos, precios y fechas.
- Voz comprensible después de la conversión a µ-law 8 kHz.
- Sin repeticiones ni frases truncadas en cortes de TTS.
- Pronunciación estable de marcas y nombres propios mediante diccionario fonético.
- Opt-out y transferencia detectados antes de cualquier respuesta comercial.

### Operación

- Una caída del modelo local no pierde la llamada ni el registro CRM.
- El fallback no duplica mensajes ni eventos.
- El sidecar no tiene acceso directo a secretos de organizaciones.
- Las grabaciones y transcripciones siguen las políticas de consentimiento y retención.
- Toda llamada conserva `orgId`, `callSid`, `leadId`, `agentId` y `campaignId` validados por Node.

## 12. Decisión final propuesta

```text
Ahora:
  Twilio + Fastify + AudioBridge + Prisma
  + interfaces de proveedores

Después:
  voice-engine Python
  + Silero VAD
  + faster-whisper large-v3-turbo o medium
  + Chatterbox es-es/es-mx
  + Qwen3 8B/14B no-thinking vía vLLM
  + Kokoro/Piper como fallback TTS

Más adelante:
  Pipecat si se necesita acelerar la orquestación
  LiveKit si el producto necesita WebRTC, navegador o vídeo
```

La mejora más visible para el usuario no será solo cambiar el modelo de voz. Será combinar:

1. TTS realmente streaming.
2. VAD y turn detection semántico.
3. Cancelación inmediata y fiable.
4. Respuestas del LLM más cortas y rápidas.
5. Un transporte de banda ancha cuando la llamada sea desde navegador.

## Fuentes técnicas

- [Presentamos GPT-Live — OpenAI](https://openai.com/es-ES/index/introducing-gpt-live/)
- [Pipecat](https://github.com/pipecat-ai/pipecat)
- [LiveKit Agents](https://github.com/livekit/agents)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [Silero VAD](https://github.com/snakers4/silero-vad)
- [Smart Turn](https://github.com/pipecat-ai/smart-turn)
- [Chatterbox](https://github.com/resemble-ai/chatterbox)
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
- [Piper](https://github.com/OHF-Voice/piper1-gpl)
- [Qwen3 model card](https://huggingface.co/Qwen/Qwen3-32B)
- [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/)
