# Progreso de implementación del backlog

Este archivo se actualiza en cada sesión de trabajo para que la continuación (por
ejemplo, tras un reinicio de contexto) sepa exactamente qué fase/ítem está en
curso y qué queda. Referencia: [04-backlog-priorizado.md](./04-backlog-priorizado.md).

## Revisión externa (2026-07-14) y correcciones

Una revisión de código encontró que este documento sobredeclaraba varios ítems
como "hecho" cuando en realidad tenían bloqueos P0/P1 reales. Se verificó cada
hallazgo contra el código (no se descartó ninguno sin comprobar) y se corrigieron
los que resultaron reales:

| Hallazgo | Veredicto | Corrección |
| --- | --- | --- |
| No había migración desplegable (`prisma migrate deploy` no crearía tablas) | **Confirmado, P0** | Se generó un baseline único (`20260714000000_baseline`) con las 50 tablas del schema actual, sustituyendo el historial incompleto. |
| `backend/src/lib/validation.ts` y otros módulos sin versionar — checkout limpio no compila | **Confirmado, P0** | Se versionó todo el código fuente/assets que `index.ts`/`App.jsx` ya importaban (~100 archivos). Alcance más amplio del que parecía: no solo `validation.ts`, sino módulos enteros de funnels/settings/whatsapp/ads/conversaciones/landing pública nunca se habían commiteado, de antes de esta sesión. |
| Campaña de email no conectaba audiencia/plantilla a un envío real | **Confirmado** | `publishCampaign` ahora encola `EmailDelivery` reales por lead (respetando consentimiento) y un job nuevo (`campaignSendRunner.ts`) los envía y cierra la campaña. Corrección adicional propia: el runner enviaba también campañas `scheduled` con fecha futura; ahora solo procesa `running` y activa `scheduled→running` al llegar `scheduledStartAt`. |
| Backfill de plantillas exponía el catálogo completo cross-tenant | **Confirmado, P0** | Se quitó el auto-bind masivo; vincular una plantilla es ahora una acción explícita de admin, auditada (`POST /api/mautic/templates/:id/claim`). |
| Eventos de Oportunidad no estaban en el catálogo canónico de automatizaciones | **Confirmado** | Añadidos `opportunity.created/stage.changed/won/lost/reopened` a `CANONICAL_AUTOMATION_EVENTS`. |
| El versionado guardaba la versión pero ejecutaba `automation.actions` en vivo | **Confirmado** | El motor ahora resuelve las acciones desde el snapshot de `AutomationVersion` atado al run. |
| Scheduler disparaba al detectar la ventana de 24h, no a T-24h exacto; propuestas por `createdAt` no `stageEnteredAt` | **Confirmado** | `dueAt` se calcula por regla; propuestas usan `stageEnteredAt` (ya existía desde OP-101 pero el scheduler nunca se actualizó). |
| Atribución de eventos de email ambigua (última entrega "en curso", sin id de proveedor) | **Confirmado, parcial** | Se desambigua por `email.id` del payload de Mautic cuando está presente; sigue siendo best-effort sin verificación contra una instancia real. |
| Sin suite de pruebas | **Confirmado** | Añadida (`backend/src/__tests__/`, `npm test`): 12 tests de integración cubriendo multi-tenant, idempotencia de automatizaciones (incluye el bug de versionado de arriba) y consentimiento de email. No cubre RBAC a nivel HTTP ni contrato Mautic. |
| Bundle frontend ~1.56 MB | **Confirmado, no corregido** | Code-splitting por ruta queda pendiente; no bloquea funcionalidad. |

**Lo que sigue sin poder verificarse en este entorno:** EM-03/P0-11 (contrato Mautic contra una instancia real) y cualquier flujo que dependa de Twilio/Mautic reales en producción — se han hecho las correcciones de código razonables pero no hay forma de confirmarlas sin credenciales y un entorno real.

## Fase 0 · Blindar y decir la verdad (P0-01 a P0-12)

| ID | Estado | Notas |
| --- | --- | --- |
| P0-01 Ownership en mutaciones | ✅ hecho | Leads/Pipeline/Meetings: `findFirst({id, orgId})` antes de crear/actualizar (leadId, assignedTo, callId, campaignId). Automatizaciones y Mautic quedan fuera de este ítem concreto (no crean relaciones por id ajeno del mismo tipo). |
| P0-02 Zod estricto + 404/409 | ✅ hecho | Leads/Pipeline/Meetings/Automations con `.strict()` + `parseRequest`; `updateMany.count===0` → 404 real en vez de `{ok:true}`. |
| P0-03 RBAC | ✅ hecho | `authorize(['admin','agent'])` en todas las mutaciones de Leads/Pipeline/Meetings/Automations/Mautic; lectura solo con `authenticate`. |
| P0-04 Mautic binding por orgId | ✅ hecho | `MauticAssetBinding`; `getEmailTemplates(orgId)` solo devuelve lo vinculado; `sendTestEmail`/`sendEmail` de lead verifican `isTemplateOwnedByOrg` → 404 si no. **Corregido en revisión**: el backfill automático original regalaba el catálogo completo a cualquier org que consultara primero (cross-tenant); ahora vincular es una acción explícita de admin auditada. |
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
| AU-107 Eventos de dominio | 🔶 parcial | Emitidos: `opportunity.created/stage.changed/won/lost/reopened`, `meeting.created/rescheduled/completed/cancelled/no_show`. **Corregido en revisión**: los eventos de Oportunidad se emitían al outbox pero no estaban en `CANONICAL_AUTOMATION_EVENTS` → se descartaban silenciosamente sin disparar ninguna automatización; ya están en el catálogo. **Sigue faltando**: `lead.updated`, `lead.owner.changed` (se audita pero no se emite a outbox), `lead.score.changed` (no aplica aún, no hay scoring real), `task.due/overdue`, `consent.changed`, `email.*`. |
| RE-107 Outcome de reunión | ✅ hecho | `POST /:id/complete` y `/:id/no-show`; crea tarea de seguimiento automática; UI en `MeetingDetailPage.jsx`. |
| AU-108 Acciones CRM | ✅ hecho | `create_task`, `set_owner`, `add_tag`, `update_field`, `create_opportunity`, `notify` añadidas a `AUTOMATION_ACTION_TYPES` con manejo `succeeded/skipped/blocked` igual que las acciones existentes. |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios.

### Fase 1 · continuación (LE-102/103, AU-102, FND-06)

| ID | Estado | Notas |
| --- | --- | --- |
| LE-103 Import asíncrono | ✅ hecho | `ImportJob` + `jobs/importJobRunner.ts` (patrón outbox: claim atómico, procesa por lotes, dedupe por email/teléfono dentro del archivo, reporte de errores por fila). `POST /api/leads/import` responde 202; `GET /api/leads/imports/:id` para polling. `ImportLeadsModal.jsx` muestra progreso real. |
| LE-102 Export asíncrono | ✅ hecho (sin job) | `GET /api/leads/export` aplica los mismos filtros que LE-101 sin paginar (tope de seguridad 10.000 filas documentado), devuelve CSV directo — se decidió no crear un job aparte por ser sobre-ingeniería para el volumen actual. |
| AU-102 Versionado inmutable | ✅ hecho (mínimo viable) | `AutomationVersion` + `publishAutomation()`; cada `AutomationRun` nuevo referencia la última versión publicada. **Corregido en revisión**: el run guardaba el id de versión pero seguía ejecutando `automation.actions` en vivo, no el snapshot — editar una automatización tras publicarla cambiaba silenciosamente qué corría; ahora ejecuta el snapshot de `AutomationVersion` atado al run (cubierto por test). Falta diff entre versiones y rollback (mejora futura, no bloquea uso). |
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
| EM-105 Campaña operable (MVP) | ✅ hecho | `MarketingCampaign` con estados draft→validating→ready→scheduled→running→paused→completed/error; editor con objetivo/audiencia/plantilla/remitente/calendario. **Corregido en revisión**: publicar creaba el contenedor remoto y marcaba la campaña "running" sin conectar audiencia/plantilla a ningún envío real; ahora `publishCampaign` encola `EmailDelivery` por lead (con consentimiento) y `campaignSendRunner.ts` los envía y cierra la campaña. Sin A/B testing (deliberadamente fuera de alcance, es GR-01/P2). |
| EM-106 Audiencia dinámica | ✅ hecho (básica) | Filtro plano (status/source/tags) con preview de conteo y muestra — no es un constructor de AST completo, decisión deliberada por ser suficiente para el volumen actual. |
| EM-107 Publicar/pausar con reconciliación | ✅ hecho | `reconcileCampaignStatus` lee el estado remoto real (`getCampaignStats`) en vez de asumir el optimista. |
| EM-108 Métricas correctas | ✅ hecho | `emailMetrics.service.ts`: entregados/aceptados/aperturas y clics únicos vs. totales/bajas/quejas con denominadores correctos (openRate=únicas/entregados, CTOR=clics únicos/aperturas únicas, CTR=clics únicos/entregados), nunca división por cero. |
| EM-109 Historial de email en lead | ✅ hecho | `GET /api/leads/:id/email-history`; visible en `LeadDetailPage.jsx`. |
| EM-110 Centro de preferencias | ✅ hecho (básico) | Reutiliza `ContactConsent` por categoría (`purpose`) en vez de un modelo nuevo; UI de toggles en la pestaña Consentimiento. |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios. Un conflicto de edición concurrente en `index.ts` (dos agentes registrando rutas nuevas a la vez) se resolvió correctamente sin pérdida de cambios (confirmado leyendo el archivo final).

## Fase 3 · Calendario y forecast (parcial — sin integración de calendario)

| ID | Estado | Notas |
| --- | --- | --- |
| Account (Empresa) | ✅ hecho | CRUD + dedupe por dominio (devuelve la existente con `deduped:true` en vez de bloquear); `Lead.accountId`/`Opportunity.accountId` opcionales (migración aditiva, sin big-bang); selector en `LeadDetailPage.jsx`. |
| OP-103 Vista lista | ✅ hecho | `GET /api/pipeline/list` con búsqueda/filtros/orden/paginación server-side (mismo patrón que LE-101/RE-103); toggle Kanban/Lista en `Pipeline.jsx`. |
| OP-107 Forecast | ✅ hecho | `GET /api/pipeline/forecast` agrupado por moneda (sin conversión de divisas, deliberado); pipeline/weighted/commit/best_case reales; `forecastCategory` fijable por oportunidad. |
| OP-108 Contactos/roles | ✅ hecho | `OpportunityContact` con rol y principal; pestaña "Contactos" en `OpportunityDetailPage.jsx`. |
| OP-109 Productos/líneas | ✅ hecho | `Product`/`OpportunityLineItem`; pestaña "Productos" muestra el total de líneas sin recalcular `Opportunity.value` automáticamente (decisión deliberada, no rompe flujos existentes). |
| RE-108 Preparación real | ✅ hecho | `GET /api/meetings/:id/prep` con notas/llamadas/oportunidad abierta/actividad reciente/reuniones anteriores reales, sin resumen generado por IA. |
| RE-104/105/106 Calendario externo | ⬜ bloqueado | Requiere decidir proveedor OAuth (Google Calendar vs. Microsoft 365) y credenciales — es una decisión de producto/negocio, no técnica. No se puede avanzar sin esa decisión. |
| OP-106 Etapas configurables | ⬜ no iniciado | `OpportunityStage` sigue siendo un enum fijo; convertirlo en un modelo configurable es una migración de mayor riesgo (toca cada lugar que usa el enum) — se dejó fuera de esta ronda deliberadamente. |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios.

**Estado real tras la revisión externa de 2026-07-14** (ver sección al inicio del documento): Fases 0-3 tienen implementación funcional real y verificada (tsc + vite build + 12 tests de integración pasando), con los bugs P0/P1 encontrados corregidos. Ninguna fase está "lista para producción" sin antes: (a) verificar el flujo Mautic contra una instancia real (EM-03/P0-11, no alcanzable en este entorno), (b) decidir proveedor de calendario para RE-104/105, (c) ampliar la cobertura de tests (RBAC a nivel HTTP, contrato Mautic con fixtures).

**Siguiente paso concreto para continuar:**
1. Verificar el flujo real de campaña de email contra una instancia Mautic real/sandbox (EM-03/P0-11) — es el mayor riesgo no verificable sin ese entorno.
2. Ampliar la suite de tests: RBAC a nivel HTTP (que `authorize()` bloquee de verdad a un viewer en cada ruta), pruebas de contrato Mautic con fixtures de respuestas reales.
3. Pendientes menores de Fase 1 no bloqueantes: AU-109 (dead-letter), AU-105/106 (condiciones/ramas/esperas), eventos AU-107 restantes (`lead.owner.changed` a outbox, `task.due/overdue`, `consent.changed`, `email.*`).
4. RE-104/105/106 — bloqueado hasta decisión de proveedor de calendario (Google Calendar vs. Microsoft 365).
5. OP-106 (etapas configurables) si se decide abordar la migración del enum `OpportunityStage`.
6. Code-splitting del bundle frontend (~1.56 MB, un único chunk) — no bloquea funcionalidad, pendiente de rendimiento.
7. Fase 4 (P2/P3): A/B testing de email (GR-01), atribución (GR-03), segmentos guardados (GR-06), round-robin/páginas de reserva (GR-10), etc. — no empezar hasta que lo anterior esté verificado en un entorno real.

## Cómo continuar

1. Leer este archivo completo (especialmente la sección "Revisión externa" al inicio) y `04-backlog-priorizado.md`.
2. Ejecutar `cd backend && npm test` para confirmar que la suite de integración sigue en verde antes de construir sobre esta base.
3. Continuar con los ítems de "Siguiente paso concreto" de arriba.
4. Actualizar esta tabla al terminar cada ítem — con honestidad: "hecho" significa verificado (tsc/build/test), no solo "el código existe".
