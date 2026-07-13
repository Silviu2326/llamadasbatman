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

**Siguiente paso concreto para continuar:**
1. FND-06 (correlationId/errores normalizados) — pendiente desde el inicio de Fase 1.
2. LE-102 (export asíncrono completo, hoy solo exporta la página visible con aviso explícito), LE-103 (ImportJob asíncrono — importLeads sigue siendo secuencial por fila).
3. OP-104 (comandos ganar/perder/reabrir con invariantes completos — hoy `moveStage` cubre el motivo de pérdida pero no fecha/valor final de cierre ganado ni el control de reabrir).
4. AU-102..109 (versionado inmutable, condiciones/ramas, historial UI, dead-letter) — es el bloque más grande que queda de Automatizaciones.
5. RE-101..108 (Reuniones) y EM-101..110 (Email marketing completo) siguen sin empezar — son Fase 2/3 del plan.

## Fases siguientes (no iniciadas)

- Fase 1 · FND-01..06, LE-101/102/103/106/107, AU-101..111 (resto), OP-101/102/104/105, RE-101/102/103/107.
- Fase 2 · Email marketing completo (EM-101..110), automatizaciones avanzadas, recordatorios.
- Fase 3 · Calendario externo, forecast, Empresa/Contacto.
- Fase 4 · P2/P3.

## Cómo continuar

1. Leer este archivo y `04-backlog-priorizado.md`.
2. Continuar con la fase marcada 🔄 hasta cerrarla (criterios de aceptación en cada doc `0X-*.md`).
3. Actualizar esta tabla al terminar cada ítem.
