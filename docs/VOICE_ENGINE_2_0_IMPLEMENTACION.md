# Voice Engine 2.0: revisión e implementación

Fecha: 2026-07-24  
Ámbito: backend de llamadas, motor de voz local/Open Source y evolución hacia conversaciones full dúplex.

## Resumen ejecutivo

La arquitectura actual ya tiene una base útil para evolucionar:

- Telefonía Twilio y WebSocket de media.
- Puente de audio entre entrada y salida.
- STT en streaming, agente LLM, TTS, barge-in y transferencia.
- Persistencia de llamada, transcript, resultado, sentimiento y actividad comercial.
- Simulación de llamadas en navegador y un voice-engine sidecar experimental con Whisper/Piper/vLLM.

El cuello de botella no es únicamente escoger un modelo con una voz más bonita. Para acercarse a una experiencia full dúplex natural hay que coordinar cinco sistemas:

1. Detección de cuándo termina realmente el usuario.
2. Generación y cancelación de audio por turnos.
3. Planificación comercial separada de la redacción de la frase.
4. Prosodia, pronunciación y selección de TTS.
5. Observabilidad suficiente para medir y corregir cada llamada.

### Recomendación

Implementar por capas, manteniendo un modo híbrido y un fallback seguro:

1. **2.1 Observabilidad y snapshots de runtime.**
2. **2.2 Turn-taking con Smart Turn, sin retirar inicialmente el RMS/VAD actual.**
3. **2.3 Prosody Controller, diccionario fonético, caché y TTS Router.**
4. **2.4 Prospect State y Sales Brain determinista.**
5. **2.5 Simulador, Call Judge y regresión de voz.**
6. **3.0 Experimentos de modelos y PersonaPlex únicamente después de disponer de métricas y rollback.**

No conviene convertir todo el pipeline a speech-to-speech de una sola vez. En PSTN se necesita seguir pudiendo explicar qué oyó el sistema, qué decidió, qué dijo y por qué.

### Estado de implementación

La primera entrega de código ya cubre:

- eventos y métricas persistentes de voz;
- runtime snapshot y asignación voice A/B;
- Turn Manager acústico y Smart Turn opcional en el sidecar;
- normalización prosódica y caché de frases no sensibles;
- Prospect State y Sales Brain determinista;
- clasificación AMD, buzón, IVR y gatekeeper;
- escenarios reproducibles y Call Judge asíncrono.

Quedan como operaciones de despliegue, no como código pendiente: aplicar las migraciones en staging, descargar los checkpoints Smart Turn/TTS elegidos, ejecutar una campaña canary y calibrar la rúbrica del Judge con llamadas reales revisadas por una persona.

## 1. Qué existe hoy y qué falta

| Área | Estado actual | Lectura para Voice Engine 2.0 |
|---|---|---|
| Telefonía | Twilio, WebSocket de media, cierre de llamada y transferencia en mediaStream.ts. | Base adecuada; hay que añadir eventos y estados de calidad. |
| Audio | AudioBridge, RMS y clasificación básica de ruido. | Sirve como protección de baja latencia, pero no entiende intención conversacional. |
| Barge-in | Cancelación especulativa y cancelación ante energía del usuario. | Debe distinguir ruido, backchannel, interrupción y final de turno. |
| STT | Deepgram en el pipeline principal; faster-whisper en el sidecar local. | Hay que normalizar parciales, finales y timestamps en un contrato común. |
| LLM | CerebrasAgent y GuruSupervisor. | Falta separar decisión comercial, redacción y control de seguridad. |
| TTS | ElevenLabs en producción actual, caché/prosodia en Node y Piper/Qwen3-TTS opcional en sidecar. | Validar calidad real por voz y formato telefónico antes de seleccionar la variante ganadora. |
| Sesión | callContext, SessionLogger, transcript final y metadatos en Call. | Falta una línea temporal completa y consultable de cada evento. |
| CRM | Call, SalesActivity, OutboxEvent, experimentos y webhooks. | Se puede reutilizar, pero el runtime debe guardar la variante exacta ejecutada. |
| Simulación | simStream.ts, SessionLogger y fixtures reproducibles con CLI de regresión. | Ampliar la cobertura con audio real y escenarios nocturnos. |
| AMD | Callback Twilio persistido como humano, buzón, IVR, gatekeeper, fax o número equivocado. | Calibrar señales con tráfico real y revisión humana. |
| Evaluación | Call Judge asíncrono con rúbrica, evidencias, training tag y endpoint. | Calibrar la rúbrica heurística contra evaluaciones humanas y añadir Judge LLM si aporta valor. |

### Diagnóstico

La estructura actual es un pipeline lineal parecido a:

~~~text
Twilio -> MediaStream -> STT -> agente -> TTS -> Twilio
                 \-> RMS/barge-in
                 \-> persistencia final
~~~

La estructura objetivo debe conservar ese camino corto, pero añadir un plano de control:

~~~text
audio
  -> AudioBridge
  -> VAD + Smart Turn
  -> normalizador de turnos
  -> Prospect State
  -> Sales Brain
  -> LLM de redacción
  -> Prosody Controller
  -> TTS Router
  -> audio de respuesta

todos los pasos
  -> Trace Collector
  -> métricas
  -> CRM
  -> Call Judge asíncrono
~~~

## 2. Arquitectura propuesta

### 2.1 Camino de tiempo real

El camino de tiempo real no debe depender de escrituras lentas en base de datos ni de una evaluación LLM. Cada componente debe emitir un evento ligero y el cierre de llamada puede completar el resumen.

~~~text
Twilio Media WebSocket
  -> MediaStream
  -> AudioBridge
     -> audio guard
     -> VAD/RMS de seguridad
     -> Smart Turn
     -> Turn Manager
  -> STT streaming
  -> Conversation State
     -> Prospect State
     -> Sales Brain
     -> Tool Gateway
  -> LLM Planner/Writer
  -> Prosody Controller
  -> TTS Router
  -> audio chunked
  -> Twilio
~~~

### 2.2 Plano de control

El plano de control debe ser observable y versionado:

- configuración de campaña;
- persona y prompt;
- modelo STT, LLM y TTS;
- detector de turnos;
- diccionario fonético;
- playbook comercial;
- variante de experimento;
- versión de código;
- resultado, transferencias, opt-out y errores;
- métricas por fase y por proveedor.

El principio importante es que cada llamada tenga un **runtime snapshot** inmutable. Si mañana cambia el prompt o el modelo, debe seguir siendo posible reconstruir qué se ejecutó en una llamada anterior.

## 3. Fase 2.1: observabilidad primero

### 3.1 Contrato de eventos

Crear un evento común para todos los componentes:

~~~ts
type VoiceEvent = {
  id: string;
  callId: string;
  externalCallId?: string;
  seq: number;
  atMs: number;
  type: string;
  role?: 'system' | 'user' | 'assistant' | 'tool';
  payload: Record<string, unknown>;
  runtime?: {
    component: string;
    version: string;
    model?: string;
    provider?: string;
  };
};
~~~

Eventos mínimos:

- call.connected, call.answered, call.ended;
- audio.input_started, audio.input_stopped, audio.output_started;
- stt.partial, stt.eager_end, stt.final;
- turn.user_started, turn.user_finished, turn.interruption, turn.backchannel;
- llm.started, llm.first_token, llm.completed, llm.cancelled;
- tts.selected, tts.cache_hit, tts.first_audio, tts.completed;
- audio.output_cancelled, barge_in.detected;
- prospect_state.updated, sales_action.selected;
- tool.started, tool.completed, tool.failed;
- transfer.requested, transfer.completed, compliance.opt_out;
- runtime.warning, runtime.error.

No se debe guardar audio o transcript sin una política clara de retención. El evento puede referenciar el objeto de almacenamiento y registrar hash, duración y consentimiento.

### 3.2 Persistencia recomendada

Añadir un modelo específico de eventos, separado de Call:

~~~prisma
model VoiceCallEvent {
  id             String   @id @default(cuid())
  callId         String
  seq            Int
  atMs           Int
  type           String
  role           String?
  payload        Json
  component      String?
  componentVer   String?
  model          String?
  provider       String?
  createdAt      DateTime @default(now())

  call Call @relation(fields: [callId], references: [id], onDelete: Cascade)

  @@unique([callId, seq])
  @@index([callId, atMs])
  @@index([callId, type])
}
~~~

Para no sobrecargar la transacción de audio:

1. El proceso de llamada escribe en memoria/buffer.
2. Un writer asíncrono agrupa eventos.
3. Se hace flush por tamaño, tiempo o cierre.
4. Si la base de datos falla, el runtime conserva un log local temporal y marca trace_degraded.

Después puede añadirse un agregado:

~~~prisma
model VoiceCallMetric {
  id              String   @id @default(cuid())
  callId          String
  metric          String
  value           Float
  unit            String?
  sampleCount     Int?
  dimensions      Json?
  createdAt       DateTime @default(now())

  call Call @relation(fields: [callId], references: [id], onDelete: Cascade)

  @@index([metric, createdAt])
  @@index([callId, metric])
}
~~~

### 3.3 Métricas principales

Medir por llamada y también por percentiles:

- tiempo desde final de voz del usuario hasta primer audio del agente;
- STT time-to-final;
- LLM time-to-first-token;
- TTS time-to-first-audio;
- duración de audio cancelado;
- número y duración de interrupciones;
- ratio de frases repetidas;
- tasa de silencios largos;
- tasa de transferencia y opt-out;
- buzón, IVR, gatekeeper y número equivocado;
- errores de herramienta;
- audio con clipping, volumen bajo o ruido;
- resultado comercial y calidad de la llamada.

Definir desde el principio:

~~~text
TTFA = assistant.first_audio_at - user.turn_finished_at
TTFT = llm.first_token_at - llm.started_at
TTFTTS = tts.first_audio_at - tts.started_at
Turn accuracy = turnos clasificados correctamente / turnos evaluados
~~~

### 3.4 Herramientas de diagnóstico

Endpoints internos recomendados:

- GET /api/calls/:id/trace
- GET /api/calls/:id/metrics
- GET /api/calls/:id/evaluation
- GET /api/voice/metrics?from=&to=&campaignId=

La pantalla de diagnóstico debería mostrar:

- audio y waveform;
- transcript alineado con timestamps;
- timeline de turnos;
- interrupciones y chunks cancelados;
- llamadas a herramientas;
- modelo/variante por turno;
- errores;
- puntuación de Call Judge;
- resultado CRM.

## 4. Fase 2.2: turn-taking y full dúplex

### 4.1 Principio

La energía de la señal responde a “hay sonido”, no a “la persona ha terminado una idea”. Mantener RMS/VAD como guardia de seguridad, pero añadir un clasificador de final de turno.

Estados mínimos:

~~~text
LISTENING
USER_MAY_CONTINUE
USER_FINISHED
USER_INTERRUPTING
BACKCHANNEL
NOISE
~~~

Tipos de interrupción:

- **hard interrupt**: el usuario toma el turno; cancelar audio inmediatamente.
- **soft interrupt**: backchannel o apoyo breve; bajar volumen o esperar.
- **noise**: no cambia el estado conversacional.

### 4.2 Smart Turn

[Smart Turn de Pipecat](https://github.com/pipecat-ai/smart-turn) es una opción adecuada para probar un detector de turnos de audio local. Su repositorio documenta modelos pequeños para detectar si el usuario ha terminado de hablar, entrada PCM mono a 16 kHz, soporte multilingüe incluido español y variantes orientadas a CPU/GPU.

Integración propuesta:

~~~text
AudioBridge
  -> buffer PCM 16 kHz mono
  -> RMS/VAD: evita procesar silencio obvio
  -> Smart Turn: decide may_continue / finished
  -> TurnManager: aplica debounce, timeout y reglas de campaña
~~~

No debe decidir solo. Añadir reglas:

- duración mínima de turno;
- pausa mínima y máxima;
- final de frase detectado por STT;
- lista de backchannels;
- palabras críticas que exigen esperar;
- timeout de silencio;
- protección frente a ruido de línea.

Archivos sugeridos:

~~~text
backend/src/voice/turn/turnTypes.ts
backend/src/voice/turn/turnManager.ts
backend/src/voice/turn/smartTurnClient.ts
voice-engine/smart_turn_adapter.py
~~~

El TurnManager debe emitir un generationId. Si llega una nueva interrupción, se invalida el generationId anterior y todos los chunks tardíos se descartan.

## 5. Fase 2.3: Prosody Controller y TTS Router

### 5.1 Prosody Plan

La naturalidad no depende solo de la calidad del modelo. En llamadas comerciales importan la pausa, la longitud, la pronunciación de nombres y teléfonos y la ausencia de párrafos largos.

Usar un plan estructurado:

~~~ts
type ProsodyPlan = {
  text: string;
  style: 'warm' | 'professional' | 'empathetic' | 'energetic' | 'neutral';
  pace: 'slow' | 'normal' | 'fast';
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  emphasis?: string[];
  pronunciationHints?: Array<{
    surface: string;
    spoken: string;
  }>;
  maxDurationMs?: number;
  interruptible: boolean;
};
~~~

Reglas prácticas:

- una idea por frase;
- frases de una a dos líneas en transcript;
- números, fechas, URLs y nombres propios pasan por normalización fonética;
- no comenzar el audio si la primera cláusula aún no está lista;
- permitir cancelación en límites seguros;
- no usar prosodia emocional cuando la política exige tono neutro.

### 5.2 Router de proveedores

El TTS Router debe elegir por contenido y no por proveedor fijo:

| Caso | Ruta recomendada |
|---|---|
| “Sí”, “entiendo”, backchannel corto | clip cacheado o TTS de latencia mínima |
| Nombre, dirección, teléfono, código postal | proveedor con diccionario fonético |
| Frase comercial normal | voz local o remota según latencia y calidad |
| Frase sensible o de alta conversión | voz de mayor naturalidad con límites de coste |
| Timeout/error | voz local de fallback |

[Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) es una alternativa Open Source para validar en el sidecar: el proyecto documenta variantes de 0.6B/1.7B, streaming, diseño/clonado de voz y soporte multilingüe. Antes de producción hay que probar checkpoints concretos, latencia real y la conversión a audio telefónico de 8 kHz.

No asumir que una demo de TTS conserva calidad después de:

1. generación streaming;
2. resampling;
3. compresión G.711;
4. transporte Twilio;
5. reproducción en un teléfono con ruido.

### 5.3 Componentes

~~~text
backend/src/voice/tts/ttsRouter.ts
backend/src/voice/tts/ttsProvider.ts
backend/src/voice/tts/phoneticDictionary.ts
backend/src/voice/tts/expressionBank.ts
backend/src/voice/tts/prosodyController.ts
voice-engine/tts_router.py
~~~

Clave de caché:

~~~text
sha256(provider + model + voice + normalizedText + prosodyVersion + audioFormat)
~~~

El caché debe excluir texto que contenga datos personales salvo que la política de retención lo permita. Para frases genéricas, el caché reduce latencia y coste.

## 6. Fase 2.4: Prospect State y Sales Brain

### 6.1 Estado explícito

El estado comercial no debe vivir únicamente dentro del prompt:

~~~ts
type ProspectState = {
  stage:
    | 'opening'
    | 'permission'
    | 'discovery'
    | 'qualification'
    | 'value'
    | 'objection'
    | 'scheduling'
    | 'closing'
    | 'opt_out'
    | 'not_interested'
    | 'wrong_number';
  contact: {
    name?: string;
    company?: string;
    role?: string;
    confirmed: boolean;
  };
  needs: string[];
  painPoints: string[];
  objections: Array<{
    label: string;
    confidence: number;
    resolved: boolean;
  }>;
  qualification: {
    fit?: number;
    urgency?: number;
    authority?: number;
    budget?: number;
  };
  constraints: string[];
  nextBestAction: string;
  evidence: Array<{
    source: 'user' | 'crm' | 'tool';
    text: string;
    atMs: number;
  }>;
};
~~~

### 6.2 Separar cuatro responsabilidades

1. **Classifier**: detecta intención, etapa, objeción y entidades.
2. **Sales Brain**: decide la próxima acción permitida.
3. **LLM Writer**: convierte la acción en una frase breve.
4. **Prosody Controller**: decide cómo pronunciarla.

GuruSupervisor es un precursor útil del clasificador y del motor de objeciones, pero no debería ser al mismo tiempo clasificador, estratega y redactor final.

El Sales Brain debe impedir:

- saltos de etapa sin evidencia;
- inventar precios, integraciones o resultados;
- afirmar que hay una reunión confirmada sin confirmación;
- seguir hablando después de un opt-out;
- pedir dos datos sensibles a la vez;
- repetir una objeción ya resuelta;
- usar argumentos que no estén en la base aprobada.

### 6.3 Acciones permitidas

~~~text
ASK_PERMISSION
ASK_DISCOVERY_QUESTION
REFLECT_AND_CONFIRM
ANSWER_WITH_APPROVED_EVIDENCE
HANDLE_OBJECTION
PROPOSE_MEETING
CONFIRM_MEETING
TRANSFER_TO_HUMAN
END_POLITELY
MARK_VOICEMAIL
MARK_GATEKEEPER
MARK_WRONG_NUMBER
~~~

El resultado del LLM debería ser una acción estructurada y no texto libre sin validación:

~~~json
{
  "action": "HANDLE_OBJECTION",
  "reason": "El prospecto expresa falta de tiempo",
  "question": "¿Es por el momento o porque no ve utilidad?",
  "evidenceIds": [],
  "risk": "low"
}
~~~

El texto final se genera después y se valida contra longitud, opt-out, idioma, datos permitidos y política comercial.

### 6.4 Playbook de objeciones

Versionar objeciones en YAML o JSON:

~~~yaml
id: no_time
version: 1
patterns:
  - ahora no puedo
  - no tengo tiempo
meaning: falta_de_tiempo_o_baja_prioridad
diagnostic_questions:
  - ¿Es por el momento o porque no es una prioridad?
allowed_evidence:
  - case_study_sector
forbidden:
  - prometer_resultados
next_actions:
  - ASK_DISCOVERY_QUESTION
  - PROPOSE_MEETING
~~~

Toda respuesta debe guardar objectionId, playbookVersion, evidenceIds y resultado posterior.

## 7. Transferencias, buzón y gatekeeper

### 7.1 Transferencia

La transferencia ya existe en el flujo actual. Añadir:

- evento transfer.requested;
- motivo estructurado;
- resumen de contexto;
- estado de transferencia;
- resultado de la transferencia;
- notificación Socket.IO para el panel;
- fallback si el humano no responde.

Resumen mínimo para el humano:

~~~json
{
  "contact": "nombre confirmado",
  "need": "necesidad detectada",
  "objection": "objeción activa",
  "whatWasPromised": "solo lo aprobado",
  "recommendedNextStep": "acción sugerida",
  "confidence": 0.86
}
~~~

### 7.2 AMD

El callback AMD no debe quedar sin efecto operativo. Implementar estados:

~~~text
HUMAN
VOICEMAIL
IVR
GATEKEEPER
DECISION_MAKER
WRONG_NUMBER
FAX_OR_NOISE
UNKNOWN
~~~

La clasificación debe combinar AMD, audio inicial, STT y reglas de tiempo. No se debe intentar engañar a un gatekeeper ni simular una identidad humana: el sistema tiene que cumplir las políticas de identificación y consentimiento aplicables.

## 8. Fase 2.5: simulador de prospectos y Call Judge

### 8.1 Simulador

simStream.ts ya permite una base de simulación de audio. La siguiente capa debe simular el comportamiento del prospecto:

~~~text
backend/fixtures/voice-scenarios/
backend/scripts/voice-simulator.mjs
backend/scripts/voice-regression.mjs
~~~

Escenario:

~~~json
{
  "id": "busy-but-curious",
  "language": "es-ES",
  "persona": {
    "role": "directora comercial",
    "style": "brief",
    "patience": 0.35
  },
  "objective": "aceptar una reunión si se entiende el valor",
  "objections": ["no_time", "send_email"],
  "interruptions": true,
  "noise": "office",
  "successCriteria": [
    "ask_permission_before_pitch",
    "discover_current_process",
    "propose_calendar_slot"
  ],
  "criticalErrors": [
    "ignore_opt_out",
    "invent_result",
    "repeat_same_question"
  ]
}
~~~

Crear suites de:

- apertura y permiso;
- prospecto que interrumpe;
- silencio y pausa larga;
- mala calidad de audio;
- buzón y IVR;
- gatekeeper;
- objeción de precio;
- “envíame un email”;
- opt-out;
- transferencia;
- confirmación de reunión;
- datos mal pronunciados.

Objetivo operativo:

- 20 escenarios por pull request;
- 100 escenarios cada noche;
- 1.000 escenarios antes de cambiar modelo o prompt de producción.

### 8.2 Call Judge

El Judge se ejecuta después de persistir Call, nunca en el camino crítico. Debe devolver JSON validado:

~~~json
{
  "overall": 82,
  "dimensions": {
    "turnTaking": 78,
    "voiceNaturalness": 84,
    "discovery": 80,
    "objectionHandling": 76,
    "compliance": 100,
    "crmAccuracy": 88
  },
  "criticalErrors": [],
  "evidence": [
    {
      "dimension": "discovery",
      "atMs": 18320,
      "reason": "pregunta abierta relevante"
    }
  ],
  "trainingTag": "good_discovery"
}
~~~

Guardar también:

- versión de rúbrica;
- modelo del Judge;
- snapshot de runtime;
- evidencias temporales;
- revisión humana si existe;
- si el resultado puede entrar en datasets de entrenamiento.

El Judge no debe reescribir automáticamente prompts de producción. Primero genera señal, luego se revisan errores, después se cambia una variante y se prueba en simulación/canary.

## 9. Versionado, A/B y canary

El esquema ya contiene RevenueExperiment, variantes y asignaciones. Reutilizarlo, pero asignar la variante antes de iniciar la llamada y guardar el snapshot:

~~~text
orgId + campaignId + leadId
  -> asignación determinista
  -> runtime snapshot
  -> llamada
  -> eventos y resultado
~~~

Versionar independientemente:

- voiceEngineVersion;
- turnDetectorVersion;
- sttVersion;
- llmVersion;
- ttsVersion;
- prosodyVersion;
- salesBrainVersion;
- playbookVersion;
- judgeRubricVersion.

Métrica primaria recomendada: reunión atendida o oportunidad cualificada, no solo reunión creada. Métricas de guardia:

- opt-out;
- quejas;
- transferencia errónea;
- alucinación;
- error de CRM;
- latencia TTFA;
- tasa de silencios;
- coste por conversación.

Regla de despliegue:

~~~text
simulación -> revisión de errores críticos -> canary pequeño
-> comparación con control -> expansión gradual
-> rollback por configuración
~~~

## 10. Audio telefónico y modelos candidatos

### 10.1 Realidad de PSTN

El teléfono sigue siendo el último tramo de la experiencia. Aunque el modelo genere audio de alta fidelidad, la llamada puede pasar por 8 kHz, G.711, ganancia, ruido y altavoz del móvil.

Prioridades:

- voz clara y estable;
- volumen consistente;
- evitar clipping;
- de-esser y compresión moderada;
- pausas naturales;
- pronunciación de nombres, números y fechas;
- frases cortas y cancelables.

Separar métricas WebRTC de métricas PSTN. No comparar directamente naturalidad de un navegador con calidad percibida de una llamada telefónica.

### 10.2 Stack local recomendado para la primera versión

| Función | Opción inicial | Alternativa | Nota |
|---|---|---|---|
| STT | faster-whisper | servicio STT actual | Comparar WER, diarización y latencia en español telefónico. |
| VAD | Silero VAD o VAD actual | RMS de seguridad | VAD no sustituye a Smart Turn. |
| Turn-taking | Smart Turn | reglas + STT final | Ejecutar en sidecar o proceso local. |
| LLM | vLLM compatible OpenAI | runtime actual | Mantener fallback y límites de contexto. |
| TTS | Piper para fallback | Qwen3-TTS para calidad | Medir streaming y salida µ-law. |
| Voz experimental | Qwen3-TTS | Chatterbox/Kokoro según idioma | Validar licencia, español y latencia. |

[vLLM OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/) puede servir como API común para el LLM local, pero el servidor no resuelve por sí mismo el estado comercial, el streaming de audio ni el control de herramientas.

### 10.3 PersonaPlex

[PersonaPlex de NVIDIA](https://github.com/NVIDIA/personaplex) es interesante para un laboratorio de full dúplex speech-to-speech y control de persona. El repositorio documenta control mediante prompt de rol y condicionamiento de voz.

No lo pondría inicialmente en el camino de producción porque hay que validar conjuntamente:

- licencia del código y licencia de pesos;
- calidad en español;
- transcript y observabilidad completa;
- cancelación y reproducción de herramientas;
- cumplimiento, opt-out y transferencia;
- control de frases inventadas;
- comportamiento ante PSTN y ruido.

Usarlo primero en shadow mode:

~~~text
llamada real
  -> pipeline actual responde
  -> PersonaPlex escucha y genera respuesta paralela
  -> no se reproduce al prospecto
  -> se comparan turnos, latencia y Judge
~~~

## 11. Plan de implementación concreto

### Sprint 1: contrato y trazas

- crear VoiceEvent y un emisor único;
- capturar eventos en mediaStream y pipeline;
- guardar runtime snapshot;
- añadir endpoints de trace;
- crear métricas TTFA, TTFT y TTFTTS;
- añadir tests de orden, duplicados y cierre abrupto.

### Sprint 2: Turn Manager

- aislar el RMS/VAD actual;
- normalizar parciales/finales de STT;
- integrar Smart Turn detrás de una interfaz;
- añadir generationId y cancelación segura;
- registrar interrupciones y backchannels;
- hacer replay de audio grabado.

### Sprint 3: TTS Router

- separar proveedor de decisión;
- implementar diccionario fonético;
- añadir caché de frases seguras;
- probar Piper y Qwen3-TTS en español;
- medir salida telefónica real;
- incorporar límite de duración por frase.

### Sprint 4: Sales Brain

- definir ProspectState;
- extraer el clasificador de GuruSupervisor;
- validar transiciones;
- convertir playbook de objeciones a datos versionados;
- conectar herramientas mediante acciones permitidas;
- guardar evidencia y decisión.

### Sprint 5: simulación y evaluación

- crear escenarios reproducibles;
- ejecutar regresión de audio y conversación;
- añadir Call Judge asíncrono;
- revisar errores críticos;
- conectar resultado de Judge con panel y experimentos.

### Sprint 6: canary

- elegir una campaña pequeña;
- comparar control contra una única variante;
- observar latencia, opt-out, transferencia, calidad y resultado;
- mantener rollback por configuración;
- no combinar cambio de modelo, prompt, voz y playbook en el mismo experimento.

## 12. Criterios de aceptación

La versión 2.1 no debería considerarse lista hasta que:

- cada llamada tenga trace ordenada y runtime snapshot;
- un fallo de observabilidad no interrumpa el audio;
- se pueda explicar cada cancelación de audio;
- TTFA y TTFT estén disponibles por percentil;
- el sistema diferencie interrupción, backchannel y ruido en una suite de replay;
- el TTS tenga fallback local;
- el opt-out cierre la conversación y quede auditado;
- la transferencia incluya resumen estructurado;
- AMD produzca un estado operativo;
- el Judge sea asíncrono, versionado y auditable.

La versión 2.5 debería añadir:

- regresión automática de 100 escenarios;
- comparación de voces;
- objeciones con evidencia;
- evaluación humana calibrada contra Call Judge;
- A/B con snapshot exacto;
- canary y rollback.

La versión 3.0 puede investigar speech-to-speech de extremo a extremo, pero solo si conserva:

- transcript;
- eventos;
- estado comercial;
- control de herramientas;
- políticas de seguridad;
- transferencia;
- explicación posterior de la decisión.

## 13. Fuentes y referencias

- [Smart Turn, Pipecat](https://github.com/pipecat-ai/smart-turn)
- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)
- [PersonaPlex, NVIDIA](https://github.com/NVIDIA/personaplex)
- [Pipecat](https://github.com/pipecat-ai/pipecat)
- [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/)
