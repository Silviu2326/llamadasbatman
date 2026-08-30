# El sistema de llamadas

Actualizado: 12 de agosto de 2026.

Mapa completo de todo lo que rodea a una llamada: de dónde sale, qué la
bloquea, qué configura el agente, qué pasa al colgar y dónde se ve.

El **motor de voz** (STT → LLM → TTS, anatomía del turno, barge-in, formatos de
audio) no se repite aquí: vive en [ARQUITECTURA_VOZ.md](./ARQUITECTURA_VOZ.md).
Resumen de una línea:

```
teléfono → Cartesia Ink-2 (STT) → Cerebras gpt-oss-120b (LLM) → MiniMax Speech 2.8 (TTS) → teléfono
objetivo: 650 ms desde que el interlocutor calla hasta el primer audio del agente
```

---

## 1. Los cuatro orígenes de una llamada

| Origen | Punto de entrada | Quién lo dispara |
|---|---|---|
| **Cola de leads** | `enqueueLeadCall()` → worker BullMQ | Automatizaciones, importación de leads, secuencias de venta |
| **Llamar ahora** | `POST /api/leads/:id/call-now` | Un humano desde la pantalla de Leads o Llamadas |
| **Reintento** | `scheduleRetry()` desde `POST /api/voice/webhook/status` | Twilio, cuando la llamada no se contestó |
| **Entrante** | `POST /api/voice/webhook/voice/inbound` | El prospecto llama al número de Twilio |

Y aparte, sin teléfono: la **cabina** `/voz/cabina`, que habla con el mismo motor
desde el navegador ([simStream.ts](../backend/src/voice/telephony/simStream.ts)).
Sirve para probar un agente sin gastar Twilio; no crea registros de `Call`.

### La cola

[backend/src/jobs/leadCallDispatch.ts](../backend/src/jobs/leadCallDispatch.ts)

- Cola BullMQ `lead-call-dispatch` sobre Redis.
- **`MAX_CALL_ATTEMPTS = 3`** intentos por lead (`Lead.attempts`).
- Reintento con backoff **15 min × intentos previos**.
- Worker: concurrencia **10**, tope **20 llamadas/minuto** por proceso.
- Solo consume la cola el proceso con `BACKGROUND_WORKERS_ENABLED=true`; la API
  encola pero no marca.
- `dedupeKey` opcional → `jobId` de BullMQ: encolar dos veces el mismo paso de
  una secuencia no llama dos veces al prospecto. Sin clave, dos formularios son
  dos llamadas.
- Un lead **sin campaña** no se llama: los webhooks de voz validan el contexto
  completo y sus callbacks fallarían.

> **Estado hoy**: si Redis no está levantado, la cola se desactiva sola
> (`[LeadCallDispatch] Redis no disponible`) y `call-now` responde **503
> `call_queue_unavailable`**. Las llamadas manuales desde la interfaz no salen.

---

## 2. Antes de marcar: qué puede bloquear la llamada

[backend/src/voice/compliance.ts](../backend/src/voice/compliance.ts) → `canCall()`,
en este orden:

| Motivo | Comprobación |
|---|---|
| `invalid_phone` | No se puede normalizar a E.164 |
| `quota_exceeded` | Minutos del plan agotados (se comprueba **antes** de marcar: una llamada arranca cuatro proveedores de pago) |
| `optout` | Hay fila en `OptOut` para ese `orgId` + teléfono |
| `outside_hours` | Fuera de `CALL_HOUR_START`–`CALL_HOUR_END` en la zona del prefijo (tabla de ladas MX; por defecto 9–20) |
| `missing_voice_consent` | Solo si `REQUIRE_VOICE_CONSENT=true`: falta `ContactConsent(channel=voice, status=granted)` vigente |

Cuota mensual por plan ([consumption.ts](../backend/src/access-control/consumption.ts)),
medida como suma de `Call.durationSeconds` del mes en curso:

| Plan | free | pro | completo | agency |
|---|---|---|---|---|
| minutos/mes | 60 | 2.000 | 10.000 | 50.000 |

Durante la llamada, el compliance sigue vivo: frases de opt-out y de petición de
humano se detectan en el transcripto (listas bilingües ES/EN) y cortan o
transfieren la llamada.

---

## 3. Qué configura un agente

Modelo `Agent` + `Agent.settings` (JSON). Se crea en el modal
[NewAgenteModal.jsx](../src/modals/NewAgenteModal.jsx) y se edita en
[AgentDetailPage.jsx](../src/pages/AgentDetailPage.jsx).

**Columnas propias**: `name`, `role`, `agentType`, `callDirection`, `language`,
`voiceId`, `personality`, `systemPrompt`, `isActive`.

**`settings`** (validado en [agents.controller.ts](../backend/src/controllers/agents.controller.ts)):

| Clave | Qué hace |
|---|---|
| `strategyId` | Estrategia de llamada (ver abajo) |
| `speechSpeed` | `0.8`–`1.2` |
| `keyMessages` | Puntos que debe mencionar → bloque `PRIORITY MESSAGES` del prompt |
| `escalationRules` | Cuándo transferir → `CUSTOM ESCALATION RULES` |
| `behavior.formality` | `auto` / `tu` / `usted` |
| `behavior.verbosity` | `brief` / `balanced` / `detailed` |
| `behavior.openingLine` | Primera frase, literal |
| `behavior.structure` | Estructura de la llamada |
| `behavior.doNotSay` | Prohibiciones duras |
| `activePlaybookId` | Playbook de la organización que se inyecta entero |
| `operationalLimits`, `schedule` | Informativos en la ficha; **hoy no los aplica el motor** |

### Tipos de agente y estrategias

Siete tipos ([agentPlaybooks.ts](../backend/src/voice/agentPlaybooks.ts)): `sales`,
`receptionist`, `qualification`, `appointment`, `support`, `collections`,
`handoff`. Cada uno cambia el saludo, el objetivo y si puede transferir.

Ocho estrategias de cuatro fases ([callStrategies.ts](../backend/src/voice/callStrategies.ts)),
filtradas por tipo y dirección: `permission_diagnosis`, `warm_reactivation`,
`objection_to_evidence`, `meeting_recovery`, `fast_qualification`,
`inbound_triage`, `renewal_value`, `payment_commitment`.

### Cómo se monta el system prompt

[promptContext.ts](../backend/src/voice/intelligence/promptContext.ts) →
`buildIntelligentPrompt()`, en este orden:

1. `systemPrompt` del agente
2. Ficha del lead (nombre, empresa, origen, estado, intentos, etiquetas)
3. **Perfil de empresa autoritativo**: descripción, cliente ideal, propuesta de
   valor, ofertas con **precios exactos**, política de descuentos, garantías,
   afirmaciones prohibidas. Con la orden de no inventar ni redondear nada.
4. Base de conocimiento (6 entradas, 400 caracteres cada una)
5. Directiva del tipo de agente + directiva de la estrategia
6. Playbook propio, mensajes clave, reglas de escalado
7. Señales ([tone: annoyed], transcripción dudosa) y cómo hablar (latencia)
8. **Comportamiento configurado por el cliente** — va al final, pesa más

Todo cacheado 5 min por agente en [agentConfig.ts](../backend/src/voice/agentConfig.ts);
`invalidateAgentConfigCache(orgId)` al guardar.

---

## 4. Durante la llamada

[twilioClient.ts](../backend/src/voice/telephony/twilioClient.ts) marca con
`machineDetection: 'DetectMessageEnd'` y devuelve un TwiML que abre un
**Media Stream** contra [mediaStream.ts](../backend/src/voice/telephony/mediaStream.ts).

**Autenticación del stream**: token de un solo uso firmado
([streamAuth.ts](../backend/src/voice/telephony/streamAuth.ts)), TTL
`VOICE_STREAM_TOKEN_TTL_SECONDS` (300 s). El handler **nunca** deriva el tenant
de `start.customParameters`, que lo controla el cliente; todo sale del token y
se revalida contra la base (`agent`, `lead`, `campaign` de esa `orgId`).

**Topes del socket**: 256 KB por mensaje, 500 mensajes/s, 2 MB/s, 15 s para
arrancar, **4 h** de duración máxima.

**Grabación** — `CALL_RECORDING_POLICY` (por defecto `always`):

| Valor | Comportamiento |
|---|---|
| `always` | Twilio graba desde el principio |
| `consent` | No se graba hasta que el prospecto lo autoriza en la llamada |
| `off` | Nunca |

La URL llega después por `POST /api/voice/webhook/recording` y se guarda en
`Call.recordingUrl`.

**Clasificación de quién contestó** ([amd.ts](../backend/src/voice/telephony/amd.ts)):
`HUMAN`, `VOICEMAIL`, `IVR`, `FAX_OR_NOISE`, `UNKNOWN`. Sale del `AnsweredBy` de
Twilio y se refina con la primera frase real del interlocutor.

**Llamadas en vivo**: [liveCalls.ts](../backend/src/voice/telephony/liveCalls.ts)
mantiene un registro en memoria por organización, que expone
`GET /api/calls/live`.

---

## 5. Al colgar

`ingestCall()` en [mediaStream.ts](../backend/src/voice/telephony/mediaStream.ts)
traduce el estado interno del motor a resultado canónico y llama a
[calls.service.ts](../backend/src/services/calls.service.ts) `ingestCall()`, que
es el **único** sitio donde nace una llamada en el CRM (también lo usa
`POST /api/calls/ingest` para proveedores externos). Efectos, todos idempotentes
por `externalCallId`:

1. Crea o completa la fila `Call` (transcripción, palabras con tiempos, duración, sentimiento, resultado, clasificación AMD).
2. Registra `SalesActivity` de tipo `call`.
3. Escribe un `Message` de canal `voice` en la conversación del lead y actualiza `lastMessageAt`.
4. Publica `OutboxEvent` `call.completed` (con clave determinista: sobrevive a un crash a medias).
5. Si es la primera vez: lead `new` → `contacted`, y `Campaign.contacted++`.
6. Si el resultado es `meeting_scheduled`: crea la reunión automática y `Campaign.meetingsScheduled++`.
7. Encola el evento de automatizaciones `call.completed`.
8. Emite `call:completed` por WebSocket a la organización.

### Catálogo de resultados

[lib/callOutcome.ts](../backend/src/lib/callOutcome.ts) — un proveedor externo
puede mandar su vocabulario, pero se traduce o se rechaza; nunca se guarda tal
cual.

| Resultado | Significa | ¿Lo produce el motor? |
|---|---|---|
| `meeting_scheduled` | Reunión agendada en la llamada | Sí (`demo_agendada`) |
| `callback_requested` | **Transferido a una persona** (nombre heredado y engañoso) | Sí (`transferido`) |
| `not_interested` | Rechazó o pidió no ser contactado | Sí (`rechazado`, `optout`) |
| `interested` | Conversó con interés sin agendar | **No** — solo por ingesta externa |
| `voicemail`, `ivr`, `fax_or_noise`, `unknown` | Clasificación AMD | Sí |
| `none` | Sin resultado registrado | Sí |

Cualifican: `meeting_scheduled`, `callback_requested`, `interested`.
No hubo contacto: `voicemail`, `ivr`, `fax_or_noise`, `unknown`, `none`.

---

## 6. Evaluación y observabilidad

**Traza por llamada** ([voiceTrace.ts](../backend/src/voice/observability/voiceTrace.ts))
→ `VoiceCallEvent`: cada evento con su milisegundo, componente, proveedor y
modelo. Tipos: `call.connected`, `turn.*`, `barge_in.detected`, `audio.*`,
`transcript.final`, `emotion.update`, `guru.update`, `compliance.opt_out`,
`transfer.requested`, `experiment.assigned`, `error`…

**Métricas** → `VoiceCallMetric`: `turn.time_to_first_audio_ms`,
`turn.stt_inference_ms`, `turn.stt_queue_wait_ms`, `turn.policy_gate_ms`,
`turn.supervisor_latency_ms`, `call.duration_seconds`, `call.turn_count`.

**Juez automático** ([callJudge.ts](../backend/src/voice/evaluation/callJudge.ts))
→ `VoiceCallEvaluation`. Puntúa 0-100 en seis dimensiones a partir de la traza:

| Dimensión | Cómo se mide hoy |
|---|---|
| `turnTaking` | Interrupciones del prospecto por turno suyo |
| `voiceNaturalness` | % de turnos por debajo de **650 ms**, penalizando audio cortado |
| `discovery` | Preguntas por turno del agente, sacadas del transcripto |
| `compliance` | 0 si el agente habló después de un opt-out, 100 si no |
| `crmAccuracy` | 92 con resultado registrado, 78 sin él |
| `objectionHandling` | **`null`** — nadie clasifica objeciones en el camino de la llamada |

Etiqueta final: `good_call` (≥85), `needs_review` (≥65), `poor_call`,
`critical_error` o `not_measurable`.

**Experimentos**: `VOICE_EXPERIMENT_ID` + `VOICE_CANARY_PERCENT` asignan variante
por llamada y registran el resultado
([voiceExperiment.ts](../backend/src/voice/experiments/voiceExperiment.ts)).

---

## 7. API

Todo bajo permiso `calls.read` / `calls.write` de ámbito organización.

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/calls` | Listado con filtros: `agentId`, `campaignId`, `status`, `outcome`, `dateFrom`, `dateTo`, paginación (traduce alias antiguos de resultado) |
| GET | `/api/calls/live` | Llamadas en curso de la organización |
| GET | `/api/calls/voice-metrics` | Métricas agregadas de voz |
| GET | `/api/calls/:id` | Ficha completa |
| GET | `/api/calls/:id/trace` | Traza de eventos (1000 por defecto) |
| GET | `/api/calls/:id/metrics` | Métricas de esa llamada |
| GET | `/api/calls/:id/evaluation` | Nota del juez |
| POST | `/api/calls/:id/favorite` | Marcar/desmarcar |
| POST | `/api/calls/bulk-actions` | `priority` (favorito) o `follow_up` (crea `CallTask`) |
| GET/POST/PUT/DELETE | `/api/calls/:id/notes` | Notas |
| GET/POST/PUT | `/api/calls/:id/tasks` | Checklist de seguimiento (pide también permiso de tareas) |
| POST | `/api/calls/ingest` | Ingesta desde un servicio de voz externo (`VOICE_SERVICE_SECRET`) |
| POST | `/api/leads/:id/call-now` | Encolar llamada a un lead |

**Webhooks de Twilio** (`/api/voice/webhook/*`), todos con verificación de firma
`X-Twilio-Signature` contra el `authToken` de la organización:
`voice` (saliente contestada), `voice/inbound` (entrante), `status` (reintentos),
`recording`, `amd`.

**Para el servicio de voz externo** (`authenticateVoiceService`):
`GET /api/voice/config/:agentId` y `POST /api/voice/outbound`.

---

## 8. Pantallas

| Ruta | Fichero | Qué muestra |
|---|---|---|
| `/llamadas` | [Calls.jsx](../src/components/Calls.jsx) | Listado, filtros, acciones en bloque, lanzar llamada a un lead |
| `/llamadas/:id` | [CallDetailPage.jsx](../src/pages/CallDetailPage.jsx) | Transcripción, grabación, sentimiento, notas, tareas, métricas |
| `/agentes`, `/agentes/:id` | [Agentes.jsx](../src/components/Agentes.jsx), [AgentDetailPage.jsx](../src/pages/AgentDetailPage.jsx) | Alta y configuración del agente, estadísticas, duplicar |
| `/voz/cabina` | [VoiceCabinPage.jsx](../src/pages/VoiceCabinPage.jsx) | Hablar con el agente desde el navegador |

---

## 9. Variables de entorno

```bash
# Motor
CARTESIA_API_KEY=            # STT
CARTESIA_VERSION=2026-03-01
CEREBRAS_API_KEY=            # LLM
CEREBRAS_MODEL=gpt-oss-120b
MINIMAX_API_KEY=             # TTS
MINIMAX_VOICE_ID=English_expressive_narrator

# Telefonía
TWILIO_ACCOUNT_SID=          # por organización en TwilioIntegration; esto es el fallback
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
TWILIO_WEBHOOK_BASE_URL=http://localhost:3000
TWILIO_MX_NUMBERS={}         # número saliente por lada
TWILIO_ALLOW_GLOBAL_FALLBACK=false

# Reglas de negocio — ninguna aparece en .env.example, se documentan aquí
CALL_HOUR_START=9                          # en .env local, no en el ejemplo
CALL_HOUR_END=20                           # en .env local, no en el ejemplo
CALL_RECORDING_POLICY=always|consent|off   # sin definir en ningún sitio → always
REQUIRE_VOICE_CONSENT=false                # sin definir → no se exige consentimiento
BACKGROUND_WORKERS_ENABLED=true            # sin esto nadie consume la cola

# Stream y cabina
VOICE_STREAM_SECRET=
VOICE_STREAM_TOKEN_TTL_SECONDS=300
VOICE_SIM_MAX_CONCURRENT_PER_USER=1
VOICE_SIM_MAX_CONCURRENT_PER_ORG=3
VOICE_SIM_MAX_DURATION_SECONDS=600

# Versionado y experimentos
VOICE_ENGINE_VERSION=3.0.0
VOICE_JUDGE_RUBRIC_VERSION=1
VOICE_EXPERIMENT_ID=
VOICE_CANARY_PERCENT=100
VOICE_EMOTION_RECOGNITION_ENABLED=false

# Servicio de voz externo
VOICE_SERVICE_URL=
VOICE_SERVICE_SECRET=
```

---

## 10. Lo que hoy no está

- **`objectionHandling` del juez es `null`**: nadie clasifica objeciones durante la llamada.
- **`interested` no lo produce el motor**: los estados internos no contemplan "conversó con interés sin agendar". Solo entra por ingesta externa.
- **`operationalLimits` y `schedule` del agente son decorativos**: se guardan y se muestran, pero ni el worker ni el motor los leen. Los topes reales son `CALL_HOUR_START/END` (globales) y la cuota del plan.
- **Sin Redis no hay llamadas salientes**: la cola se desactiva y `call-now` devuelve 503.
- **Un solo idioma en el motor**: el andamiaje del prompt es inglés por decisión del 11/08/2026; `Agent.language` viaja como acento, no cambia el pipeline.
- **[sistema-llamadas-explicado.md](./sistema-llamadas-explicado.md) está obsoleto**: describe la arquitectura autoalojada (Silero, Smart Turn, faster-whisper, Qwen3-TTS) borrada el 10/08/2026, y enlaza a documentos que ya no existen. Candidato a borrar.
