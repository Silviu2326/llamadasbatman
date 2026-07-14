# Progreso de implementación del backlog

Este archivo se actualiza en cada sesión de trabajo para que la continuación (por
ejemplo, tras un reinicio de contexto) sepa exactamente qué fase/ítem está en
curso y qué queda. Referencia: [04-backlog-priorizado.md](./04-backlog-priorizado.md).

## Fase 0 · Blindar y decir la verdad (P0-01 a P0-12)

| ID | Estado | Notas |
| --- | --- | --- |
| P0-01 Ownership en mutaciones | ✅ hecho | Leads/Pipeline/Meetings: `findFirst({id, orgId})` antes de crear/actualizar (leadId, assignedTo, callId, campaignId). Automatizaciones y Mautic quedan fuera de este ítem concreto (no crean relaciones por id ajeno del mismo tipo). |
| P0-02 Zod estricto + 404/409 | ✅ hecho | Leads/Pipeline/Meetings/Automations con `.strict()` + `parseRequest`; `updateMany.count===0` → 404 real en vez de `{ok:true}`. |
| P0-03 RBAC | ✅ hecho | `authorize(['admin','agent'])` en todas las mutaciones de Leads/Pipeline/Meetings/Automations/Mautic; lectura solo con `authenticate`. |
| P0-04 Mautic binding por orgId | ✅ hecho | `MauticAssetBinding`; `getEmailTemplates(orgId)` solo devuelve lo vinculado; `sendTestEmail`/`sendEmail` de lead verifican `isTemplateOwnedByOrg` → 404 si no. Backfill automático de bindings en el primer listado por org (migración progresiva). |
| P0-05 Consentimiento centralizado | ✅ hecho | `assertEmailSendAllowed` en `mautic.controller.ts` (send-test), `leads.controller.ts` (sendEmail) y `automations.service.ts` (acción `send_email_template`); 409 con `reason` si bloqueado. |
| P0-06 unsubscribe/bounce/complaint como cumplimiento | ✅ hecho | `mauticWebhooks.ts` llama `recordEmailComplianceEvent` (`revoked`/`bounced`) sobre `ContactConsent` de forma transaccional. |
| P0-07 Idempotencia por paso | ✅ hecho | `AutomationStepRun` (unique `runId+stepKey`); se reclama antes del efecto externo, se salta si ya `succeeded/skipped/blocked`. |
| P0-08 Scheduler triggers temporales | ✅ hecho | `jobs/temporalEventScheduler.ts` + `ScheduledTrigger` (dedupeKey); cubre los 4 triggers temporales del catálogo; registrado en `worker.ts` bajo `BACKGROUND_WORKERS_ENABLED`. |
| P0-09 Quitar fallbacks positivos UI | ✅ hecho (parcial) | `Leads.jsx`, `Pipeline.jsx`, `MeetingDetailPage.jsx` limpios de datos fijos (23 leads hot, rango 2024, "recordatorio enviado", sparklines inventados). Quedan por revisar `OpportunityDetailPage.jsx` y otras fichas (P1/P2, fuera de esta pasada). |
| P0-10 Worker health | ✅ hecho | `GET /api/automations/health` (admin): outbox pending/oldest-age/failing, runs 24h por estado, scheduler pending/overdue; `BACKGROUND_WORKERS_ENABLED`/`OUTBOX_POLL_MS`/`TEMPORAL_TRIGGER_POLL_MS` documentados en `.env.example`. |
| P0-11 Contrato Mautic fijado + tests | ⬜ pendiente | Requiere entorno Mautic real/sandbox, no verificable en este entorno. |
| P0-12 Audit log | ✅ hecho | `AuditLog` + `writeAuditLog` en create/update/delete de Lead, Opportunity, Meeting, Automation. |

Verificado: `npx tsc --noEmit` limpio en `backend/`, `npx vite build` limpio en frontend, schema aplicado a la DB real vía `prisma db push` (el `migrate dev` con shadow DB falla en este Neon por falta de migración baseline — limitación preexistente, no introducida aquí).

Pendiente real de Fase 0 antes de darla por cerrada: solo P0-11 (contrato Mautic, bloqueado por falta de entorno real/sandbox — no es alcanzable sin credenciales/instancia Mautic). Todo lo demás de P0 está implementado y verificado.

## Siguiente fase a atacar

Fase 1 (backlog 04, sección 3): FND-01..06, luego LE-101/102/103/106/107, AU-101..111 restante (versionado, condiciones/ramas, historial UI), OP-101/102/104/105 (stage history, kanban DnD, ganar/perder), RE-101/102/103/107.

### Fase 1 · FND-01..06

| ID | Estado | Notas |
| --- | --- | --- |
| FND-01 `updatedAt`/índices | ✅ hecho | `Lead.updatedAt`, `Opportunity.updatedAt`, `Meeting.updatedAt` + índices `(orgId, status/stage, updatedAt)`. |
| FND-02 `SalesActivity` | ✅ hecho (backend) | `lib/salesActivity.ts` (`logSalesActivity`, idempotente por `sourceId` vía upsert). Volcado desde: nota/archivo/cambio de estado de lead, llamada completada, reunión creada/cancelada, oportunidad creada/cambio de etapa. `GET /api/leads/:id/activities` expone el timeline paginado. **Falta**: wiring en email (mautic send) y UI que consuma el endpoint nuevo en vez de la timeline parcial actual (`getLeadTimeline`). |
| FND-03 `Task` | ✅ hecho (backend) | CRUD completo: `tasks.service.ts`/`tasks.controller.ts`/`routes/tasks.ts`, registrado en `/api/tasks` (list/get/create/update/complete/cancel), ownership+Zod+RBAC+audit log. **Falta**: UI (reemplazar `customFields.nextAction` en Leads.jsx/LeadDetailPage por tareas reales — es LE-105/106 en el backlog). |
| FND-04 `NextBestAction` → Task | ✅ hecho (backend) | `POST /api/conversations/:conversationId/next-actions/:id/accept` crea un `Task` real (`source='next_best_action'`) y guarda `convertedTaskId`; `.../dismiss` marca `dismissed`. No existían estos endpoints antes (verificado antes de crearlos). **Falta**: UI que los use (hoy Conversaciones probablemente no tiene botones aceptar/descartar conectados — revisar en la siguiente pasada). |
| FND-05 Ingestión unificada | ✅ hecho | `createLead()` e `importLeads()` (leads.service.ts) ahora llaman `syncContact()` + `orchestrateNewLead()` igual que `ingestLead()`; `orchestrateNewLead` es idempotente (upsert de conversación, outbox `lead.created` solo si es nueva), así que alta manual, CSV, Meta y landing producen los mismos efectos de dominio. `leadIngestion.service.ts` simplificado para no duplicar la orquestación. Pendiente conocido: `importLeads` sigue siendo secuencial por fila (LE-06/P1, no agravado aquí, requiere `ImportJob` async). |
| FND-06 Errores/correlationId | ⬜ pendiente | No abordado; requiere decidir un formato común de error y dónde vive `correlationId` (candidato: columna en `AutomationRun`/`OutboxEvent`, ya sugerida en `05-arquitectura-objetivo.md` pero no aplicada). |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios tras el schema push (`SalesActivity`, `Task`, `updatedAt`+índices, `NextBestAction.convertedTaskId`) y el refactor de ingestión.

Verificado tras esta pasada: `npx tsc --noEmit` y `npx vite build` limpios con Task CRUD + conversión de NextBestAction + volcado de SalesActivity integrados.

### Fase 1 · continuación (OP-101/102, LE-101, AU-08/09)

| ID | Estado | Notas |
| --- | --- | --- |
| OP-101 `OpportunityStageHistory` | ✅ hecho | Transaccional en `createOpportunity`/`moveStage`; `stageEnteredAt` real sustituye `createdAt` en la detección de "estancado". `closed_lost` exige `reason`. |
| OP-102 Kanban DnD | ✅ hecho | Drag-and-drop nativo (sin librerías) en `Pipeline.jsx`, `POST /api/pipeline/:id/move-stage` con rollback optimista si falla. `GET /api/pipeline/:id/history` expone el historial. |
| LE-101 Búsqueda server-side | ✅ hecho | `search`/`source`/`sort` en `listLeads` + querystring validada con Zod; `Leads.jsx` ya no filtra/ordena solo la página cargada. Quedan en cliente las facetas sin columna real (score heurístico, próxima acción, auditoría) — documentado en el propio código. |
| AU-08 Descripción perdida | ✅ hecho | `Automation.description` real; el modal ya no la mete en `trigger.description`. |
| AU-09 Estado draft (mínimo) | ✅ hecho | `status='draft'` si se crea sin acciones o con `isDraft:true`; no se puede activar un draft vacío. Versionado completo (`AutomationVersion`, diff, rollback) sigue pendiente — es AU-102, L/XL, distinto ítem. |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios con los tres cambios integrados.

### Fase 1 · continuación (OP-104, RE-101..104, AU-104)

| ID | Estado | Notas |
| --- | --- | --- |
| OP-104 Ganar/perder/reabrir | ✅ hecho | `markWon`/`markLost`/`reopen` sobre `moveStage`; `closed_lost` exige motivo, `closed_won` fija `actualCloseDate`/valor final, `reopen` solo `admin` y limpia `actualCloseDate`/`lossReason`. Botones en `OpportunityDetailPage.jsx`. |
| LE-07 (lado Oportunidad) | ✅ hecho | `NewOportunidadModal.jsx`: toggle crear nuevo / usar lead existente con búsqueda real (`GET /api/leads?search=`). |
| RE-101 Selector de lead existente | ✅ hecho | Mismo patrón en `NewReunionModal.jsx`. |
| RE-102 Reprogramar real | ✅ hecho | `POST /api/meetings/:id/reschedule` + historial vía `SalesActivity` (`meeting_rescheduled`); el botón "Reprogramar" (listado y ficha) ya no crea una reunión nueva ni pierde la referencia. |
| RE-103/RE-04 Búsqueda server-side | ✅ hecho | `listMeetings` con `search`/paginación; `Reuniones.jsx` conectado (antes buscador/filtros/paginación estaban inertes). Tabs de fecha siguen siendo client-side sobre la página cargada (documentado, igual que Leads). |
| AU-104 Historial de runs | ✅ hecho | `GET /:id/runs` (paginado, conteo de pasos por estado) y `GET /:id/runs/:runId` (detalle de `AutomationStepRun`); `AutomacionDetailPage.jsx` ya lista runs y su detalle en vez de solo el conteo total. |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios.

### Fase 1 · continuación (LE-106/107, OP-105, RE-107, AU-107/108)

| ID | Estado | Notas |
| --- | --- | --- |
| LE-106 Owner/SLA | ✅ hecho | `Lead.ownerId`/`firstRespondedAt`; SLA de 4h derivado (no almacenado); `PUT /api/leads/:id/owner`, filtro `ownerId` en listado. |
| LE-107 Timeline/consentimiento | ✅ hecho | `LeadDetailPage.jsx` consume `/api/leads/:id/activities` real; nueva pestaña Consentimiento vía `GET /api/leads/:id/consent`. |
| OP-105 Próximo paso obligatorio | ✅ hecho | `moveStage` crea automáticamente una `Task` de seguimiento si no hay ninguna abierta al entrar en qualified/proposal/negotiation (se decidió auto-crear en vez de bloquear, documentado en el código). |
| AU-107 Eventos de dominio | 🔶 parcial | Emitidos: `opportunity.created/stage.changed/won/lost/reopened`, `meeting.created/rescheduled/completed/cancelled/no_show`. **Falta**: `lead.updated`, `lead.owner.changed` (se audita pero no se emite a outbox), `lead.score.changed` (no aplica aún, no hay scoring real), `task.due/overdue`, `consent.changed`, `email.*`. |
| RE-107 Outcome de reunión | ✅ hecho | `POST /:id/complete` y `/:id/no-show`; crea tarea de seguimiento automática; UI en `MeetingDetailPage.jsx`. |
| AU-108 Acciones CRM | ✅ hecho | `create_task`, `set_owner`, `add_tag`, `update_field`, `create_opportunity`, `notify` añadidas a `AUTOMATION_ACTION_TYPES` con manejo `succeeded/skipped/blocked` igual que las acciones existentes. |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios.

### Fase 1 · continuación (LE-102/103, AU-102, FND-06)

| ID | Estado | Notas |
| --- | --- | --- |
| LE-103 Import asíncrono | ✅ hecho | `ImportJob` + `jobs/importJobRunner.ts` (patrón outbox: claim atómico, procesa por lotes, dedupe por email/teléfono dentro del archivo, reporte de errores por fila). `POST /api/leads/import` responde 202; `GET /api/leads/imports/:id` para polling. `ImportLeadsModal.jsx` muestra progreso real. |
| LE-102 Export asíncrono | ✅ hecho (sin job) | `GET /api/leads/export` aplica los mismos filtros que LE-101 sin paginar (tope de seguridad 10.000 filas documentado), devuelve CSV directo — se decidió no crear un job aparte por ser sobre-ingeniería para el volumen actual. |
| AU-102 Versionado inmutable | ✅ hecho (mínimo viable) | `AutomationVersion` + `publishAutomation()`; cada `AutomationRun` nuevo referencia la última versión publicada. Falta diff entre versiones y rollback (quedan como mejora futura, no bloquean uso). |
| FND-06 correlationId/errores | ✅ hecho (alcance acotado) | Hook HTTP asigna/propaga `x-correlation-id`; `AutomationRun.correlationId` siempre poblado; `OutboxEvent.lastErrorCode` clasificado con heurísticas simples. **No** se propagó correlationId a través de leads/pipeline/meetings todavía (alcance explícitamente acotado a HTTP+automation run+outbox). |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios.

**Con esto, el backlog P1 explícito de Fase 1 (`04-backlog-priorizado.md` sección "Orden recomendado de implementación → Fase 1") queda completo**: FND-01..06, LE-101/102/103/106/107, AU-101/102/103/104/107/108/109 (109 dead-letter sigue pendiente, ver abajo), OP-101/102/104/105, RE-101/102/103/107.

## Fase 2 · Nutrición medible (Email Marketing, EM-101..110)

| ID | Estado | Notas |
| --- | --- | --- |
| EM-101 Binding real de contacto | ✅ hecho | `MauticContactBinding`; `getContactIdForLead` prioriza el binding local sobre la búsqueda remota. |
| EM-102 EmailDelivery/EmailEvent | ✅ hecho | `createEmailDelivery` con `idempotencyKey`; webhook reescrito para crear `EmailEvent` deduplicado por `(provider, externalEventId)` en vez de `customFields.mauticActivity`. |
| EM-103 Cliente Mautic tipado | ✅ hecho | Timeout 10s + un retry con backoff solo en GET; interfaces tipadas para contactos/plantillas. |
| EM-104 Selector de plantillas | ✅ hecho | Reutiliza `MauticAssetBinding` (P0-04) ya filtrado por org; `EmailMarketingPage.jsx` lo usa en el editor de campaña. |
| EM-105 Campaña operable (MVP) | ✅ hecho | `MarketingCampaign` con estados draft→validating→ready→scheduled→running→paused→completed/error; editor con objetivo/audiencia/plantilla/remitente/calendario. Sin A/B testing (deliberadamente fuera de alcance, es GR-01/P2). |
| EM-106 Audiencia dinámica | ✅ hecho (básica) | Filtro plano (status/source/tags) con preview de conteo y muestra — no es un constructor de AST completo, decisión deliberada por ser suficiente para el volumen actual. |
| EM-107 Publicar/pausar con reconciliación | ✅ hecho | `reconcileCampaignStatus` lee el estado remoto real (`getCampaignStats`) en vez de asumir el optimista. |
| EM-108 Métricas correctas | ✅ hecho | `emailMetrics.service.ts`: entregados/aceptados/aperturas y clics únicos vs. totales/bajas/quejas con denominadores correctos (openRate=únicas/entregados, CTOR=clics únicos/aperturas únicas, CTR=clics únicos/entregados), nunca división por cero. |
| EM-109 Historial de email en lead | ✅ hecho | `GET /api/leads/:id/email-history`; visible en `LeadDetailPage.jsx`. |
| EM-110 Centro de preferencias | ✅ hecho (básico) | Reutiliza `ContactConsent` por categoría (`purpose`) en vez de un modelo nuevo; UI de toggles en la pestaña Consentimiento. |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios. Un conflicto de edición concurrente en `index.ts` (dos agentes registrando rutas nuevas a la vez) se resolvió correctamente sin pérdida de cambios (confirmado leyendo el archivo final).

**Siguiente paso concreto para continuar:**
1. Probar el flujo real de campaña contra una instancia Mautic (no verificado end-to-end en este entorno — sigue pendiente EM-03/P0-11, contrato Mautic fijado).
2. Pendientes menores de Fase 1 no bloqueantes: AU-109 (dead-letter), AU-105/106 (condiciones/ramas/esperas), eventos AU-107 restantes.
3. RE-104/105/106 (calendario externo — XL, bloqueado en decisión de proveedor OAuth).
4. Fase 3: Empresa/Contacto (`Account`/`Contact`), OP-108/109 (contactos/roles de compra, productos/líneas), OP-103/106/107 (vista lista, etapas configurables, forecast completo).
5. Fase 4 (P2/P3): A/B testing de email (GR-01), atribución (GR-03), segmentos guardados (GR-06), etc. — no empezar hasta que lo anterior esté estable.

## Fases siguientes (no iniciadas)

- Fase 1 · FND-01..06, LE-101/102/103/106/107, AU-101..111 (resto), OP-101/102/104/105, RE-101/102/103/107.
- Fase 2 · Email marketing completo (EM-101..110), automatizaciones avanzadas, recordatorios.
- Fase 3 · Calendario externo, forecast, Empresa/Contacto.
- Fase 4 · P2/P3.

## Cómo continuar

1. Leer este archivo y `04-backlog-priorizado.md`.
2. Continuar con la fase marcada 🔄 hasta cerrarla (criterios de aceptación en cada doc `0X-*.md`).
3. Actualizar esta tabla al terminar cada ítem.
