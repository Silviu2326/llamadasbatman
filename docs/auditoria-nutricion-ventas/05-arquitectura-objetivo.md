# Arquitectura funcional objetivo

## 1. Decisiones rectoras

1. **El CRM es la fuente de verdad comercial.** Lead, empresa, consentimiento, oportunidad, tarea, reunión y atribución se gobiernan en Postgres.
2. **Mautic es motor de ejecución, no autoridad multi-tenant.** El CRM mantiene ownership, configuración operativa, bindings y métricas reconciliadas.
3. **Outbox es la fuente de verdad de eventos.** Redis transporta trabajo; no crea un segundo camino lógico.
4. **Toda automatización usa versiones inmutables.** Un run histórico siempre se puede explicar.
5. **Consentimiento y supresión son barreras de envío.** Ningún controlador o worker puede saltárselas.
6. **Los efectos externos son idempotentes o reconciliables.** “No sé si se envió” no se resuelve repitiendo a ciegas.
7. **Toda métrica tiene definición, periodo y procedencia.** No se admiten números decorativos en superficies operativas.
8. **`orgId` y RBAC se validan en cada frontera.** Una FK simple no demuestra ownership.
9. **Zona horaria explícita.** Persistir instantes en UTC y conservar timezone IANA cuando tenga semántica de calendario.
10. **Evolución incremental.** Reutilizar `Conversation`, `Message`, `ContactConsent`, `AutomationRun`, `OutboxEvent` y `NextBestAction` existentes.

## 2. Vista lógica

```text
Fuentes de captación
  Meta · Landing · CSV · Manual · API
                    │
                    ▼
          Lead Ingestion Service
       dedupe · consent · ownership
                    │
          transacción + OutboxEvent
                    │
       ┌────────────┼───────────────┐
       ▼            ▼               ▼
 Sales CRM     Automation Engine   Sync adapters
 Lead/Account  versions/runs       Mautic/Calendar
 Opportunity   scheduler/steps     Twilio/etc.
 Task/Activity       │               │
 Meeting             └──────┬────────┘
                            ▼
                    Deliveries/Events
                            │
                            ▼
                 Analytics + Attribution
```

## 3. Evolución recomendada del modelo comercial

### 3.1 Evitar una migración “big bang”

El modelo actual usa `Lead` como persona y guarda `company` como texto. La transición segura es:

1. crear `Account` y enlazar opcionalmente `Lead.accountId`;
2. tratar temporalmente `Lead` como registro de contacto con lifecycle comercial;
3. normalizar email/teléfono y deduplicar;
4. añadir `OpportunityContact` para varios participantes;
5. cuando el producto esté estable, valorar renombrar `Lead` a `Contact` mediante migración controlada, sin duplicar fichas.

Así se respeta la regla de la especificación: una persona no debe tener una ficha Lead y otra Cliente; cambia su lifecycle.

### 3.2 Modelos nuevos o ampliados

#### Account

| Campo | Uso |
| --- | --- |
| `id`, `orgId` | Identidad y tenant. |
| `name`, `normalizedName`, `domain` | Identificación y dedupe. |
| `industry`, `sizeBand`, `website`, `phone`, `address` | Firmografía. |
| `ownerId`, `lifecycleStatus` | Responsabilidad y ciclo. |
| `source`, `customFields` | Origen/extensión. |
| `createdAt`, `updatedAt`, `lastActivityAt` | Operación y filtros. |

Índices: `(orgId, domain)`, `(orgId, ownerId, lifecycleStatus)`, `(orgId, updatedAt)`.

#### Lead, ampliación incremental

| Campo | Uso |
| --- | --- |
| `accountId`, `ownerId` | Empresa y responsable. |
| `normalizedEmail`, `normalizedPhone` | Dedupe e identidad. |
| `lifecycleStatus` | subscriber, lead, MQL, SQL, customer, churned; separado de oportunidad. |
| `score`, `scoreVersion`, `scoreUpdatedAt` | Último score materializado. |
| `lastActivityAt`, `nextActivityAt`, `updatedAt` | Cola y SLA. |
| `mergedIntoId`, `deletedAt` | Merge/soft delete. |

No añadir “Reunión” o “Negociación” como estado del lead; se derivan de objetos relacionados.

#### SalesActivity

| Campo | Uso |
| --- | --- |
| `id`, `orgId`, `type` | Identidad y tipo normalizado. |
| `leadId`, `accountId`, `opportunityId`, `meetingId`, `conversationId` | Contexto relacionado. |
| `actorUserId`, `source`, `sourceId` | Autor/procedencia. |
| `subject`, `body`, `metadata` | Presentación y datos específicos. |
| `occurredAt`, `createdAt` | Orden temporal. |

`source + sourceId + type` debe permitir idempotencia de proyecciones.

#### Task

| Campo | Uso |
| --- | --- |
| `type`, `title`, `description` | Acción. |
| `ownerId`, `priority`, `status` | Responsabilidad. |
| `dueAt`, `completedAt`, `reminderAt` | Ejecución/SLA. |
| referencias a lead/account/opportunity/meeting/conversation | Contexto. |
| `source`, `sourceId` | Manual, automatización o next best action. |

Estados: `open -> in_progress -> completed|cancelled`; `overdue` se deriva de fecha, no necesita transición persistida.

#### Opportunity, ampliación

Campos nuevos:

- `accountId`;
- `source`, `campaignId` y metadata de atribución;
- `stageEnteredAt`, `updatedAt`;
- `forecastCategory` (`pipeline`, `best_case`, `commit`, `omitted`);
- `actualCloseDate`;
- `lossReasonId`, `lossNotes`;
- `nextTaskId` o consulta de tarea abierta prioritaria;
- `createdById`, `updatedById`.

#### OpportunityStageHistory

| Campo | Uso |
| --- | --- |
| `opportunityId`, `orgId` | Relación. |
| `fromStage`, `toStage` | Transición. |
| `fromProbability`, `toProbability` | Cambio asociado. |
| `actorUserId`, `source` | Autor/manual/automatización. |
| `enteredAt`, `leftAt` | Aging. |
| `reason`, `metadata` | Cierre/pérdida/contexto. |

#### OpportunityContact

Relación entre oportunidad y lead/contacto con `role` (`champion`, `decision_maker`, `economic_buyer`, `influencer`, `blocker`) y `isPrimary`.

#### LeadScoreSnapshot y ScoreContribution

El snapshot guarda score, versión de reglas, fecha y explicación. Las contribuciones guardan categoría, regla, puntos y evidencia.

```text
score = firmografía + comportamiento + interacción - señales negativas
```

No se recalcula silenciosamente: cada cambio material crea snapshot o historial.

## 4. Modelo de Email Marketing

### 4.1 No duplicar el editor completo de Mautic

La app debe crear una capa de orquestación y seguridad. Mautic puede seguir editando el contenido avanzado y ejecutando campañas, pero el CRM debe saber qué activo pertenece a quién, a quién se envió y qué ocurrió.

### 4.2 Modelos

#### MauticContactBinding

`orgId`, `leadId`, `externalContactId`, `orgTag`, `syncStatus`, `lastSyncedAt`, `lastError`, `remoteUpdatedAt`.

Unique: `(orgId, leadId)` y `(orgId, externalContactId)`.

#### EmailTemplateBinding

`orgId`, `provider`, `externalTemplateId`, `name`, `subject`, `language`, `category`, `variablesSchema`, `status`, `lastSyncedAt`.

Solo los bindings de la organización se pueden listar/enviar.

#### MarketingAudience

`orgId`, `name`, `definition`, `exclusions`, `version`, `createdById`, `updatedAt`.

La definición es un AST validado, no SQL libre.

#### MarketingCampaign

| Campo | Uso |
| --- | --- |
| `provider`, `externalCampaignId` | Binding remoto. |
| `name`, `objective`, `status` | Identidad/lifecycle. |
| `audienceId`, `audienceSnapshot` | Audiencia y versión al publicar. |
| `timezone`, `scheduledStartAt`, `scheduledEndAt` | Calendario. |
| `sender`, `replyTo` | Identidad de envío. |
| `conversionDefinition`, `attributionWindowDays` | Medición. |
| `createdById`, `approvedById`, `publishedAt` | Gobernanza. |

Estados:

```text
draft -> validating -> ready -> scheduled -> running -> paused -> completed
                    └-------------------------------> error
```

#### CampaignVariant

`campaignId`, `templateBindingId`, `name`, `weight`, `subjectOverride`, `variables`, `status`.

#### EmailDelivery

| Campo | Uso |
| --- | --- |
| `orgId`, `campaignId`, `variantId`, `leadId` | Contexto. |
| `providerMessageId`, `idempotencyKey` | Trazabilidad/dedupe. |
| `toAddress`, `templateExternalId` | Entrega. |
| `status`, `queuedAt`, `acceptedAt`, `deliveredAt`, `failedAt` | Lifecycle. |
| `failureCode`, `failureDetail` | Diagnóstico. |

#### EmailEvent

`orgId`, `deliveryId`, `provider`, `externalEventId`, `type`, `url`, `occurredAt`, `receivedAt`, `metadata`.

Tipos: `delivered`, `open`, `click`, `soft_bounce`, `hard_bounce`, `unsubscribe`, `complaint`, `reply`.

#### EmailSuppression / ContactPreference

Supresión por address/lead, tipo, alcance global/categoría, fuente, evidencia, fecha y expiración opcional. Puede reutilizar `ContactConsent` para consentimiento y añadir una tabla especializada para supresiones del canal.

## 5. Modelo de Automatizaciones

### 5.1 Automation

Agregar:

- `description`;
- `status` (`draft`, `active`, `paused`, `archived`);
- `currentVersionId`;
- `createdById`, `updatedById`;
- `updatedAt`.

### 5.2 AutomationVersion

| Campo | Uso |
| --- | --- |
| `automationId`, `version` | Identidad inmutable. |
| `triggerType`, `triggerConfig` | Entrada. |
| `graph` | Nodos/edges tipados. |
| `validationResult` | Checklist al publicar. |
| `createdById`, `publishedById`, `publishedAt` | Gobernanza. |

Unique: `(automationId, version)`.

### 5.3 AutomationRun, ampliación

Agregar `automationVersionId`, `entityType`, `entityId`, `correlationId`, `blockedReason` y `cancelledAt`.

Estados:

```text
queued -> running -> waiting -> running -> succeeded
                   ├------------> blocked
                   ├------------> failed
                   └------------> cancelled
```

### 5.4 AutomationStepRun

| Campo | Uso |
| --- | --- |
| `runId`, `nodeKey`, `attempt` | Identidad idempotente. |
| `type`, `status` | Operación/resultado. |
| `input`, `output` | Payload redactado. |
| `idempotencyKey`, `providerReference` | Efecto externo. |
| `startedAt`, `finishedAt`, `nextRunAt` | Tiempos/espera. |
| `errorCode`, `errorDetail` | Diagnóstico. |

Unique recomendado: `(runId, nodeKey, attempt)` y una reserva lógica por `(runId, nodeKey)` para efectos no repetibles.

### 5.5 ScheduledTrigger

Materializa esperas o ventanas temporales:

`orgId`, `automationVersionId`, `entityType`, `entityId`, `ruleKey`, `dueAt`, `status`, `dedupeKey`, `payload`.

Si una reunión se reprograma o una oportunidad cambia de etapa, se cancelan/reemplazan triggers previos por `dedupeKey`.

## 6. Modelo de Reuniones

### Meeting, ampliación

- `timezone`;
- `provider`;
- `externalEventId`;
- `calendarConnectionId`;
- `locationType`, `locationUrl`;
- `organizerId`;
- `outcome`, `outcomeNotes`;
- `actualStartedAt`, `actualEndedAt`;
- `rescheduledFromId` o historial;
- `updatedAt`.

### CalendarConnection

`orgId`, `userId`, `provider`, `externalAccountId`, tokens cifrados, scopes, estado, expiración y última sincronización.

### MeetingAttendee

`meetingId`, `leadId` opcional, email, nombre, rol, RSVP, timestamps.

### MeetingReminder

`meetingId`, `channel`, `offsetMinutes`, `scheduledAt`, `status`, `deliveryId/messageId`, `cancelledAt`.

### MeetingHistory

Registra create, reschedule, cancel, complete, no-show y cambios externos con actor/origen.

## 7. Catálogo de eventos de dominio

Todo evento debe incluir:

```json
{
  "eventId": "string único",
  "eventType": "lead.created",
  "occurredAt": "ISO-8601 UTC",
  "orgId": "tenant",
  "actor": { "type": "user|system|provider", "id": "..." },
  "entity": { "type": "Lead", "id": "...", "version": 1 },
  "correlationId": "...",
  "payload": {}
}
```

Eventos mínimos:

| Dominio | Eventos |
| --- | --- |
| Lead | `lead.created`, `lead.updated`, `lead.lifecycle.changed`, `lead.owner.changed`, `lead.score.changed`, `lead.merged`. |
| Consent | `consent.granted`, `consent.revoked`, `email.suppressed`. |
| Oportunidad | `opportunity.created`, `opportunity.stage.changed`, `opportunity.owner.changed`, `opportunity.value.changed`, `opportunity.won`, `opportunity.lost`, `opportunity.reopened`, `opportunity.stale`. |
| Tarea | `task.created`, `task.due`, `task.overdue`, `task.completed`, `task.cancelled`. |
| Reunión | `meeting.created`, `meeting.rescheduled`, `meeting.reminder.due`, `meeting.started`, `meeting.completed`, `meeting.cancelled`, `meeting.no_show`. |
| Email | `email.queued`, `email.accepted`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.unsubscribed`, `email.replied`. |
| Conversación | `message.received`, `message.sent`, `conversation.assigned`, `conversation.closed`. |
| Llamada | `call.queued`, `call.started`, `call.completed`, `call.failed`. |

### Eventos temporales

No deben ser queries sin memoria ejecutadas repetidamente. El scheduler crea un `ScheduledTrigger` con `dedupeKey`, por ejemplo:

```text
opportunity.proposal.stale:<opportunityId>:<stageHistoryId>:P3D
meeting.reminder:<meetingId>:<meetingVersion>:PT24H
lead.inactive:<leadId>:<lastActivityVersion>:P7D
```

## 8. Invariantes de dominio

### 8.1 Tenant

- Todas las entidades relacionadas comparten `orgId`.
- El backend resuelve referencias; no acepta ownership implícito del navegador.
- Los adaptadores externos solo operan con bindings de la organización.

### 8.2 Email

- No se crea `EmailDelivery` si consentimiento/supresión lo bloquea; se registra intento bloqueado si hace falta auditoría.
- Una baja global gana sobre cualquier segmento o automatización.
- Un hard bounce suprime la dirección hasta corrección explícita.
- Publicar campaña congela audiencia/versión para auditoría, aunque la audiencia dinámica siga evolucionando para futuras entradas según el tipo de campaña.

### 8.3 Automatización

- Solo se ejecutan versiones publicadas.
- Cada paso externo tiene idempotency key.
- `skipped` y `blocked` no cuentan como `succeeded`.
- Un run no cambia de versión a mitad de ejecución.
- Reintentar requiere clasificar el error como retryable o intervención autorizada.

### 8.4 Oportunidad

- Cambiar etapa siempre crea `OpportunityStageHistory` en la misma transacción.
- `closed_lost` exige motivo.
- `closed_won` exige fecha y valor final no negativo.
- Reabrir requiere permiso y crea evento/historial.
- Una oportunidad abierta debe tener owner o una cola explícita y siguiente tarea según configuración.

### 8.5 Reunión

- Reprogramar conserva identidad e historial; no crea un duplicado silencioso.
- Cambiar fecha cancela/recrea recordatorios con la nueva versión.
- Cancelar sincroniza proveedor y recordatorios.
- Completar/no-show registra outcome y siguiente acción o una razón para no crearla.

## 9. Superficie API objetivo

### Leads/Ventas

```text
GET    /api/leads?search=&status=&ownerId=&scoreMin=&hasNextTask=&sort=&cursor=
POST   /api/leads
POST   /api/leads/imports
GET    /api/leads/imports/:id
POST   /api/leads/:id/merge
GET    /api/leads/:id/activities
GET    /api/leads/:id/tasks
POST   /api/leads/:id/tasks
GET    /api/leads/:id/score
PUT    /api/leads/:id/owner
```

### Oportunidades

```text
GET    /api/opportunities?stage=&ownerId=&closeFrom=&closeTo=&search=&cursor=
POST   /api/opportunities
PUT    /api/opportunities/:id
POST   /api/opportunities/:id/move-stage
POST   /api/opportunities/:id/mark-won
POST   /api/opportunities/:id/mark-lost
POST   /api/opportunities/:id/reopen
GET    /api/opportunities/:id/history
GET    /api/forecast?period=&ownerId=&category=&currency=
```

### Reuniones

```text
GET    /api/meetings?search=&status=&ownerId=&from=&to=&cursor=
POST   /api/meetings
POST   /api/meetings/:id/reschedule
POST   /api/meetings/:id/cancel
POST   /api/meetings/:id/complete
POST   /api/meetings/:id/no-show
GET    /api/calendar/free-busy
GET    /api/calendar/connections
POST   /api/calendar/connections/:provider
```

Email y Automatizaciones se detallan en:

- [01-email-marketing.md](./01-email-marketing.md#7-api-propuesta)
- [02-automatizaciones.md](./02-automatizaciones.md#8-api-propuesta)

## 10. Matriz mínima de pruebas

| Capa | Pruebas obligatorias |
| --- | --- |
| Unidad | Normalización, scoring, condiciones, transiciones, supresión, dedupe, fechas/timezone. |
| Servicio | Ingestión idempotente, stage history transaccional, step idempotency, recordatorios reprogramados. |
| API | Zod, 401/403/404/409, paginación, filtros, ownership cross-tenant. |
| DB | Constraints, índices, uniques e invariantes bajo concurrencia. |
| Contrato | Mautic y proveedor de calendario contra versión fijada. |
| Worker | Retry, dead-letter, caída después de proveedor, replay y lag. |
| Webhook | Firma/secreto, dedupe, orden fuera de secuencia, payload inválido y reintento. |
| E2E | Captura→tarea; oportunidad→cierre; reunión→recordatorio→outcome; campaña→entrega→clic→acción. |
| Seguridad | IDs ajenos, escalada de rol, exportación, archivos y PII en logs. |

## 11. Observabilidad

Métricas mínimas:

- outbox pending/oldest age/processed/failed;
- automation runs por estado y step failure rate;
- scheduler lag y triggers vencidos;
- Mautic request latency/error/rate limit;
- sync contacts pending/failed;
- email delivery, bounce, unsubscribe y complaint rate;
- calendar sync failures;
- lead first-response SLA;
- oportunidades sin next task;
- aging por etapa;
- reuniones no-show/cancelación.

Logs estructurados con `orgId` pseudonimizado cuando proceda, `correlationId`, `eventId`, `runId`, `stepRunId`, entidad y proveedor. Nunca incluir tokens, contenido sensible completo o secretos de webhook.

## 12. Plan de migración

### Paso 1 · Additive

- añadir tablas/campos nuevos sin retirar JSON/columnas actuales;
- backfill `updatedAt`, `stageEnteredAt`, account y activities;
- crear bindings Mautic a partir de `crmleadid` y tags;
- mantener lectura antigua como fallback temporal.

### Paso 2 · Dual write controlado

- servicios escriben modelo antiguo y nuevo;
- métricas comparan conteos y detectan divergencia;
- nuevos eventos salen solo del outbox para evitar duplicados.

### Paso 3 · Read switch

- activar nuevas lecturas por feature flag y organización piloto;
- reconciliar diferencias;
- ejecutar E2E con Mautic/calendario sandbox.

### Paso 4 · Retirada

- dejar de escribir `customFields.nextAction` y `mauticActivity`;
- migrar consumidores a Task/EmailEvent;
- retirar fallbacks y endpoints legacy tras ventana de compatibilidad;
- conservar proyecciones históricas necesarias para auditoría.

## 13. Resultado objetivo

Con esta arquitectura, Nutrición y Ventas comparten un mismo ciclo verificable:

```text
captura
  -> identidad y consentimiento
  -> score y siguiente acción
  -> conversación/campaña/automatización
  -> entrega e interacción
  -> tarea/reunión/oportunidad
  -> cambio de etapa
  -> cierre y atribución
```

Cada flecha produce un evento, cada efecto tiene estado, cada cifra se puede explicar y cada organización permanece aislada.
