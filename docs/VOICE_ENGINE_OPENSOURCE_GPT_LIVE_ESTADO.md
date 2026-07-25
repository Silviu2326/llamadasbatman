# Voice Engine: estado Open Source y evolución tipo GPT-Live

**Fecha:** 24 de julio de 2026  
**Objetivo:** ejecutar el motor de voz en servidores propios usando únicamente proyectos autoalojables y Open Source, y acercar la experiencia a un sistema de voz full dúplex.

## Decisión ejecutiva

La base técnica ya está preparada para una ruta de voz autoalojada, pero el sistema actual **todavía no es OSS estricto por defecto**.

- La ruta nueva es `Node/Fastify -> voice-engine FastAPI -> STT/VAD/LLM/TTS local`.
- El sidecar ya soporta audio bidireccional, cancelación por interrupción, Smart Turn opcional, LLM local compatible con OpenAI, Piper y Qwen3-TTS opcional, trazas y métricas.
- La ruta de producción por defecto sigue siendo `legacy`, con Deepgram, ElevenLabs y Cerebras; Anthropic también aparece como supervisor opcional.
- El fallback actual puede volver a esa ruta propietaria si el sidecar no está disponible.
- La simulación de navegador todavía instancia directamente la sesión Deepgram/ElevenLabs y debe migrarse al factory común.

Por tanto, el estado real es:

> **Arquitectura OSS implementada: sí. Modo OSS obligatorio y validado de extremo a extremo: todavía no.**

Para activar el modo estricto sin cambiar todavía el código por defecto:

```env
VOICE_ENGINE_MODE=remote
VOICE_ENGINE_FALLBACK=false
VOICE_ENGINE_URL=ws://voice-engine:9100/ws
VOICE_ENGINE_TOKEN=un-token-interno
VOICE_ENGINE_VOICE=default
```

No se deben configurar claves de Deepgram, ElevenLabs, Cerebras ni Anthropic en ese despliegue.

## 1. Qué significa “únicamente Open Source”

Hay dos alcances distintos:

### Opción A — IA autoalojada, telefonía externa

Se mantiene Twilio como transporte PSTN/media y se autoalojan todos los componentes de IA. Es la migración más rápida y conserva el flujo telefónico actual.

```text
Teléfono -> Twilio Media Streams -> Node -> voice-engine local -> Node -> Twilio -> teléfono
```

Esto **no es 100 % Open Source**, porque Twilio es un servicio propietario. Sí puede ser una plataforma de IA sin proveedores externos de STT, LLM o TTS.

### Opción B — software 100 % autoalojado

Se sustituye Twilio por un servidor SIP propio y un trunk SIP de un operador:

```text
Teléfono -> operador SIP -> Asterisk/FreeSWITCH -> media gateway -> voice-engine local
```

El trunk y la numeración siguen dependiendo de un operador de telecomunicaciones, pero el software que controla señalización, audio, grabación y motor de IA se ejecuta en nuestros servidores.

## 2. Inventario actual del repositorio

| Capa | Estado actual | ¿Autoalojable? | Observación |
|---|---|---:|---|
| API/control plane | Node, Fastify, Prisma, WebSocket, Socket.IO | Sí | Gestiona llamadas, CRM, eventos y permisos. |
| Telefonía | Twilio Media Streams | No como software | Servicio externo; sustituible por SIP + Asterisk/FreeSWITCH. |
| STT legacy | Deepgram | No | Debe quedar fuera del modo OSS. |
| LLM legacy | Cerebras; Anthropic opcional | No | Sustituible por un servidor local compatible con OpenAI. |
| TTS legacy | ElevenLabs | No | Sustituible por Piper, Kokoro, Chatterbox o Qwen3-TTS. |
| Sidecar | `voice-engine/server.py` + FastAPI | Sí | Punto de entrada de la ruta OSS. |
| VAD | RMS en sidecar; Silero como alternativa | Sí | RMS es el fallback simple; Silero mejora robustez. |
| Turn detection | Smart Turn opcional | Sí | Detecta si el usuario ha terminado su intervención. Incluye español. |
| STT OSS | faster-whisper | Sí | Adecuado para servidor GPU o CPU; se puede evaluar whisper.cpp para despliegues ligeros. |
| LLM OSS | vLLM compatible con API OpenAI | Sí | El paquete `openai` en el sidecar es sólo cliente HTTP compatible; no implica usar OpenAI hospedado. |
| TTS OSS actual | Piper | Sí | Buena latencia y operación sencilla; revisar licencia GPL antes de redistribuir producto. |
| TTS OSS alternativo | Qwen3-TTS opcional | Sí | Mejor expresividad potencial; la integración actual genera por frase y necesita streaming real. |
| Observabilidad | trazas, métricas, runtime snapshot, evaluación | Sí | Ya hay `VoiceCallEvent`, `VoiceCallMetric` y `VoiceCallEvaluation`. |
| Inteligencia comercial | Sales Brain local | Sí | Estado de prospecto, objeciones, opt-out, transferencia y acciones. |
| AMD | Clasificador local + persistencia | Sí | Permite distinguir humano, buzón, IVR y gatekeeper. |
| Experimentos | canary/A-B local | Sí | Asignación determinista y registro de conversión. |

Archivos principales:

- [voice-engine/server.py](../voice-engine/server.py)
- [voice-engine/README.md](../voice-engine/README.md)
- [backend/src/voice/engine/factory.ts](../backend/src/voice/engine/factory.ts)
- [backend/src/voice/pipelines/deepgramElevenLabs.ts](../backend/src/voice/pipelines/deepgramElevenLabs.ts)
- [backend/src/voice/telephony/simStream.ts](../backend/src/voice/telephony/simStream.ts)
- [docs/VOICE_ENGINE_2_0_IMPLEMENTACION.md](./VOICE_ENGINE_2_0_IMPLEMENTACION.md)

## 3. Estado de la implementación OSS

### Ya está hecho

1. **Transporte de audio bidireccional** por WebSocket.
2. **Recepción concurrente de audio** mientras el servidor genera respuesta.
3. **Barge-in acústico:** cuando empieza a hablar el usuario se cancela la respuesta en curso.
4. **Generaciones cancelables:** los chunks de una respuesta antigua no deben contaminar la nueva respuesta.
5. **VAD y detección de turno** separados: RMS como base y Smart Turn como detector semántico opcional.
6. **STT local** con faster-whisper.
7. **LLM local** mediante endpoint OpenAI-compatible, pensado para vLLM.
8. **TTS local** con Piper y ruta opcional para Qwen3-TTS.
9. **Normalización de texto y prosodia** antes del TTS.
10. **Trazas por llamada**, métricas de latencia, snapshot de runtime y evaluación de calidad.
11. **Sales Brain, AMD, transferencias, escenarios de simulación y canary/A-B.**

### Todavía falta para declararlo “OSS estricto”

1. Cambiar el valor por defecto del backend de `legacy` a `remote` cuando se decida el corte de producción.
2. Hacer que el fallback OSS sea explícito y que nunca vuelva silenciosamente a Deepgram/ElevenLabs/Cerebras.
3. Migrar `simStream.ts` para usar `createVoiceSession` y que la simulación no dependa de proveedores externos.
4. Añadir un health check que publique el proveedor, modelo, licencia declarada y dispositivo activo de cada componente.
5. Fijar versiones y hashes de modelos en el despliegue.
6. Añadir una comprobación de CI que falle si el perfil `OSS_ONLY=true` detecta variables o imports de proveedores propietarios.
7. Validar voces españolas con llamadas reales, ruido, solapamiento y distintos teléfonos.
8. Sustituir la síntesis por frase de Qwen3-TTS por un modo de streaming o mantener Piper como ruta de baja latencia.

## 4. Componentes Open Source recomendados

La selección debe separar software, pesos del modelo y condiciones de uso. Un repositorio Open Source no garantiza que todos sus checkpoints o voces tengan las mismas condiciones.

| Función | Recomendación inicial | Alternativas | Decisión práctica |
|---|---|---|---|
| VAD | Silero VAD | RMS | Silero para producción; RMS como fallback de emergencia. |
| Turn detection | Smart Turn v3 | reglas + energía | Activarlo después del silencio de VAD; no usarlo como sustituto del VAD. |
| STT | faster-whisper | whisper.cpp | `small`/`medium` según GPU, idioma y concurrencia. |
| LLM rápido | modelo instruct local servido por vLLM | llama.cpp, Ollama | Separar modelo conversacional rápido del modelo de razonamiento. |
| TTS latencia | Piper | Kokoro | Piper como baseline medible y reproducible. |
| TTS expresivo | Qwen3-TTS | Chatterbox | Qwen3-TTS como experimento de calidad; confirmar streaming y licencia de cada voz. |
| Orquestación de voz | código actual + protocolo propio | Pipecat, LiveKit Agents | No introducir otro framework hasta medir la ruta actual. |
| SIP/media | Asterisk | FreeSWITCH, Kamailio | Sólo necesario si se elimina Twilio. |

Enlaces de referencia:

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [Silero VAD](https://github.com/snakers4/silero-vad)
- [Smart Turn](https://github.com/pipecat-ai/smart-turn)
- [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/)
- [Piper](https://github.com/OHF-Voice/piper1-gpl)
- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
- [Chatterbox](https://github.com/resemble-ai/chatterbox)
- [Pipecat](https://github.com/pipecat-ai/pipecat)
- [LiveKit Agents](https://github.com/livekit/agents)
- [Análisis de PersonaPlex](./VOICE_ENGINE_PERSONAPLEX_ANALISIS.md)

### Nota de licencias

Antes de empaquetar o redistribuir el producto hay que revisar la licencia exacta de cada repositorio, modelo, checkpoint, voz y dependencia transitiva. En particular:

- Piper puede implicar GPL-3.0 en su repositorio actual.
- Los modelos y voces pueden tener condiciones distintas del código.
- Las opciones de clonación de voz requieren autorización y una política de consentimiento.
- “Autoalojable” no significa automáticamente “apto para uso comercial sin revisión legal”.

## 5. ¿Cómo vamos respecto a GPT-Live?

La referencia de GPT-Live describe una interacción full dúplex que escucha y habla simultáneamente, permite backchannels, interrupciones y pausas, y toma decisiones de interacción continuamente mientras puede delegar trabajo profundo en segundo plano. Véase [Presentamos GPT-Live, OpenAI](https://openai.com/es-ES/index/introducing-gpt-live/).

### Comparación honesta

| Capacidad | GPT-Live de referencia | Nuestra implementación actual | Estado |
|---|---|---|---|
| Audio bidireccional | Sí | Sí, por WebSocket y bridge de audio | Bien encaminado |
| Escuchar mientras habla | Sí | Sí, el receptor sigue activo durante la salida | Implementado |
| Interrupción humana | Sí | Sí, VAD cancela la generación y limpia salida | Implementado |
| Detección de final de turno | Continua y multimodal | VAD + ventana STT + Smart Turn opcional | Parcial |
| Respuesta incremental | Audio generado continuamente | LLM streaming + TTS por frase/chunks | Parcial |
| Backchannels | “Ajá”, “claro”, señales breves | Modular: política externa; Duplex: comportamiento acústico del checkpoint, pendiente de calibración comercial | Parcial |
| Decidir escuchar, hablar o pausar | Bucle de interacción continuo | Modular: Interaction Loop OSS; Duplex: Moshi/Mimi streaming con barge-in y STT paralelo | Implementado en dos modos |
| Delegación en segundo plano | Sí | Hay lógica CRM/Sales Brain, pero no worker de background conectado al protocolo de voz | Parcial |
| Modelo nativo audio-audio | Sí, en la referencia | `Vendrava Duplex`: gateway local Moshi/Mimi; `Vendrava Voice Modular`: STT -> LLM -> TTS | Dúplex en canario |
| Seguridad de voz intercalada | Integrada en el modelo/interacción | Ambos modos delegan CRM, opt-out, permisos y transferencia a Node Policy Engine | Implementado |
| Observabilidad | No es el foco público principal | Trazas, métricas, evaluación, AMD y experimentos | Ventaja operativa |
| Autoalojamiento | No es el objetivo de ese producto | Sí para la IA con el sidecar OSS | Ventaja de control |

### Valoración actual

La implementación está aproximadamente en **7/10 para Voice Modular** y **8/10 en audio/interactividad para Voice Duplex**, entendiendo GPT-Live como referencia de interacción y no como una especificación pública reproducible. El modo dúplex todavía no debe considerarse producción comercial hasta validar pesos, GPU, concurrencia y un checkpoint especializado.

- **8/10 en transporte y control de sesión.**
- **7/10 en interrupción y cancelación.**
- **6/10 en detección semántica de turno.**
- **5/10 en salida TTS incremental.**
- **5/10 en backchannels y delegación en segundo plano**: el comportamiento existe en el modo dúplex y la política comercial aún debe calibrarse.
- **8/10 en modelo nativo audio-audio para el canario**, gracias al gateway Moshi/Mimi; todavía no equivale a `Moshi-Call-EN` especializado.
- **8/10 en trazabilidad y operación comercial**, porque ya se han añadido eventos, métricas, AMD, evaluación y experimentos.

La conclusión importante es que **ya tenemos los dos modos operativos a nivel de arquitectura y protocolo**. El modular es la ruta controlable para clientes; el dúplex es la ruta experimental con mayor potencial humano. Falta validar el modelo en la GPU de despliegue y acumular datos antes de entrenar `Moshi-Call-EN`.

## 6. Arquitectura objetivo autoalojada

```text
                    ┌──────────────────────────────┐
PSTN/WebRTC ───────►│ Media gateway / Node control │◄──── CRM, tools, auth
                    └──────────────┬───────────────┘
                                   │ audio + eventos
                         ┌─────────▼─────────┐
                         │ Interaction Loop  │
                         │ listen / speak /  │
                         │ pause / interrupt │
                         └───┬─────────┬─────┘
                             │         │
                     ┌───────▼───┐ ┌──▼────────────┐
                     │ VAD +      │ │ audio ring    │
                     │ Smart Turn │ │ buffer        │
                     └───────┬────┘ └──┬────────────┘
                             │         │
                     ┌───────▼─────────▼──────┐
                     │ faster-whisper local  │
                     │ partial + final STT    │
                     └────────────┬───────────┘
                                  │ texto / estado
                     ┌────────────▼────────────┐
                     │ LLM local vía vLLM     │
                     │ respuesta rápida        │
                     └──────┬─────────┬────────┘
                            │         │
                 ┌──────────▼───┐ ┌──▼────────────────┐
                 │ TTS local    │ │ background worker │
                 │ Piper/Qwen   │ │ CRM/tools/search  │
                 └──────┬───────┘ └─────────┬─────────┘
                        │ audio PCM/G.711   │ resultado
                        └──────────┬────────┘
                                   ▼
                         Media gateway / teléfono
```

En `Vendrava Voice Modular`, el `Interaction Loop` debe mantener un estado de sesión y decidir con baja latencia entre:

- escuchar y acumular audio;
- emitir un backchannel corto;
- empezar una respuesta provisional;
- pausar para esperar más contexto;
- cancelar una respuesta por barge-in;
- llamar una herramienta sin bloquear la conversación;
- reanudar con el resultado de la herramienta.

En `Vendrava Duplex`, el gateway `voice-engine/moshi_gateway.py` mantiene el
streaming audio-audio Moshi/Mimi y usa un STT inglés paralelo para que Node
pueda aplicar las mismas reglas de CRM y compliance. El checkpoint base todavía
no recibe el `systemPrompt` como condicionamiento comercial; esa especialización
corresponde a la futura variante `Moshi-Call-EN`.

## 7. Validación de los dos modos

### Fase 1 — Arrancar Voice Modular en inglés

1. Configurar `VOICE_ENGINE_ARCHITECTURE=modular` y `VOICE_CALL_LANGUAGE=en-US`.
2. Ejecutar una llamada controlada con `faster-whisper`, vLLM/Qwen y TTS local.
3. Verificar que la traza no contiene Deepgram, ElevenLabs, Cerebras o Anthropic.
4. Ejecutar la misma batería en el simulador y en PSTN.

### Fase 2 — Arrancar Voice Duplex en la GPU objetivo

1. Instalar `pip install -e '.[duplex]'` en el servidor con GPU suficiente.
2. Arrancar `python moshi_gateway.py` en el puerto 9200.
3. Ejecutar `python smoke_duplex.py`.
4. Medir `first_audio_ms`, `barge_in_ms`, `turn_end_ms`, coste por minuto y llamadas simultáneas.
5. Mantener una sola sesión por GPU hasta implementar batching seguro.

### Fase 3 — Comparación A/B

1. Mantener el mismo guion, CRM, Policy Engine, consentimiento y herramientas.
2. Enviar inicialmente 5–10 % de las llamadas a `duplex`.
3. Comparar conversión, interrupciones, `false_takeover_rate`, `hold_compliance`, latencia, errores y satisfacción.
4. No activar fallback silencioso entre arquitecturas: una llamada debe conservar la variante que se le asignó.

### Fase 4 — Especialización `Moshi-Call-EN`

1. Recoger llamadas consentidas y etiquetar cliente/agente en estéreo.
2. Enseñar pausas, `uh-huh`, `right`, objeciones y transferencias.
3. Aplicar LoRA/fine-tuning sólo cuando exista dataset propio suficiente.
4. Sustituir el checkpoint base en `VOICE_DUPLEX_MOSHI_WEIGHT` y repetir el mismo benchmark.

### Fase 3 — Separar conversación y trabajo profundo

Crear un worker local para tareas que no deben bloquear el diálogo:

```text
voz -> LLM rápido -> “voy a comprobarlo” -> worker CRM/búsqueda -> resultado -> voz
```

El worker debe publicar eventos de progreso y tener timeout, cancelación, permisos y trazabilidad. El agente de voz nunca debe esperar indefinidamente a una consulta de CRM o a una operación externa.

### Fase 4 — Mejor voz

Comparar bajo la misma frase, hardware y volumen de concurrencia:

1. Piper como baseline de latencia.
2. Kokoro para calidad/latencia.
3. Qwen3-TTS para expresividad, español y control de estilo.
4. Chatterbox sólo si la licencia del checkpoint, el coste de GPU y el consentimiento de voz encajan.

La decisión debe basarse en escucha humana y métricas, no sólo en la demo del modelo:

- latencia al primer audio;
- inteligibilidad por teléfono de 8 kHz;
- naturalidad en español;
- estabilidad de nombres, números y precios;
- interrupción sin colas de audio antiguas;
- consumo de VRAM y llamadas simultáneas.

### Fase 5 — Eliminar Twilio si realmente se exige 100 % autoalojado

Evaluar [Asterisk](https://github.com/asterisk/asterisk) o [FreeSWITCH](https://github.com/signalwire/freeswitch) como media server SIP, y [Kamailio](https://github.com/kamailio/kamailio) si se necesita un proxy SIP dedicado.

Esto es un proyecto separado del motor de IA: incluye alta disponibilidad, NAT, codecs, grabación, seguridad SIP, fraude telefónico, cumplimiento, números, trunk y monitorización.

## 8. Configuración recomendada para el primer despliegue OSS

```env
# Backend: producción inicial
VOICE_ENGINE_MODE=remote
VOICE_ENGINE_ARCHITECTURE=modular
VOICE_CALL_LANGUAGE=en-US
VOICE_ENGINE_URL=ws://voice-engine:9100/ws
VOICE_ENGINE_TOKEN=internal-token
VOICE_ENGINE_CONNECT_TIMEOUT_MS=3000
VOICE_ENGINE_FALLBACK=false
VOICE_ENGINE_VOICE=en_default

# Sidecar
VOICE_ENGINE_HOST=0.0.0.0
VOICE_ENGINE_PORT=9100
VOICE_ENGINE_STT_MODEL=small
VOICE_ENGINE_STT_DEVICE=cuda
VOICE_ENGINE_STT_COMPUTE_TYPE=float16
VOICE_ENGINE_TTS_PROVIDER=piper
VOICE_ENGINE_PIPER_VOICE=en_US-lessac-medium
VOICE_ENGINE_SMART_TURN_ENABLED=true
VOICE_ENGINE_SMART_TURN_MODEL=pipecat-ai/smart-turn-v3
VOICE_ENGINE_LLM_BASE_URL=http://vllm:8000/v1
VOICE_ENGINE_LLM_API_KEY=local-only
VOICE_ENGINE_LLM_MODEL=<modelo-instruct-local>

# Política explícita
OSS_ONLY=true

# Canary dúplex separado
VOICE_DUPLEX_LANGUAGE=en-US
VOICE_DUPLEX_ENGINE_URL=ws://moshi-gateway:9200/ws
VOICE_DUPLEX_ENGINE_TOKEN=internal-duplex-token
```

Los nombres concretos de modelo y voz deben fijarse después del benchmark del servidor. No conviene prometer una latencia determinada sin conocer GPU, CPU, concurrencia y codec de la llamada.

## 9. Criterios de aceptación

El hito “OSS-only voice” se puede dar por cerrado cuando:

- una llamada real funciona con `VOICE_ENGINE_MODE=remote`;
- `VOICE_ENGINE_FALLBACK=false` y el sidecar caído producen un error visible, no un cambio silencioso a un proveedor externo;
- las variables de Deepgram, ElevenLabs, Cerebras y Anthropic están ausentes;
- `/health` informa modelos y dispositivos locales;
- la traza de llamada identifica STT, LLM, TTS, VAD y Smart Turn locales;
- el usuario puede interrumpir al agente sin oír audio de una respuesta anterior;
- la simulación de navegador usa la misma ruta OSS que producción;
- se registran latencias, errores, consumo de GPU y calidad por modelo;
- se han validado licencias de código, pesos, voces y redistribución;
- hay pruebas separadas para PSTN/Twilio y el smoke test del gateway Moshi/Mimi.

## 10. Resumen final

Estamos en una posición buena para abandonar los proveedores de IA propietarios: el sidecar modular, el gateway Moshi/Mimi y el protocolo de sesión ya existen, y las piezas principales están desacopladas.

La prioridad inmediata es validar ambos modos en inglés con el mismo tráfico controlado. Voice Modular debe entrar primero en producción; Voice Duplex debe medirse como canario y evolucionar hacia `Moshi-Call-EN` cuando exista dataset propio. Eso nos acercará mucho más a la sensación GPT-Live que cambiar de modelo sin controlar turn-taking, backchannels, cancelación y audio incremental.

La arquitectura objetivo realista es:

```text
SIP/Twilio -> Node media gateway -> VAD/Smart Turn -> faster-whisper
-> interaction loop -> LLM local/vLLM -> tools en background -> TTS local
-> audio cancelable -> teléfono
```

Es una arquitectura full dúplex y autoalojable. Voice Modular ofrece control comercial y Voice Duplex aporta el camino nativo audio-audio; todavía hay que validar la calidad del checkpoint y completar la especialización comercial para igualar la experiencia de referencia.

## 11. Actualización de implementación

La ruta OSS estricta ya queda aplicada en el código:

- `remote` es el modo efectivo por defecto.
- `legacy` sólo funciona si se declara explícitamente `VOICE_ENGINE_ALLOW_PROPRIETARY=true`.
- El fallback hacia Deepgram/ElevenLabs sólo se permite con esa misma bandera y `VOICE_ENGINE_FALLBACK=true`.
- La simulación de navegador usa `createVoiceSession`, igual que el flujo de telefonía.
- El sidecar expone `/capabilities` y anuncia STT, LLM, TTS, audio, barge-in y parciales continuos.
- El sidecar mantiene parciales STT sobre snapshots del buffer, cancela respuestas en curso y reevalúa el final de turno con una ventana de continuación cuando Smart Turn indica que el usuario puede seguir.
- `voice-engine/moshi_gateway.py` implementa el modo `duplex` con Moshi/Mimi, frames de 24 kHz, barge-in, STT inglés paralelo y autoridad de negocio en Node.
- `VOICE_ENGINE_ARCHITECTURE` permite ejecutar `modular` o `duplex`; un payload de experimento puede seleccionar la variante por llamada.
- `voice-engine/smoke_duplex.py` valida el handshake, audio devuelto e interrupción cuando se dispone de pesos y GPU.

Esto mejora el bucle continuo, pero no convierte faster-whisper en un decoder streaming nativo ni sustituye el audio-audio de PersonaPlex. Es el paso seguro para producción en español mientras se comparan modelos speech-to-speech.
