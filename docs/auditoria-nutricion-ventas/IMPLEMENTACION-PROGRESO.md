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
| FND-02 `SalesActivity` | 🔶 modelo listo, sin wiring | Modelo creado (lead/opportunity/meeting/conversation/actor, `source+sourceId+type` único para idempotencia). **Falta**: escribir filas desde los puntos de mutación reales (llamada, nota, archivo, email, cambio de estado/etapa, reunión) y exponer endpoint de timeline. Siguiente paso concreto. |
| FND-03 `Task` | 🔶 modelo listo, sin API/UI | Modelo creado (owner, prioridad, estado, vencimiento, recordatorio, relaciones a lead/opportunity/meeting/conversation). **Falta**: servicio CRUD, rutas `/api/leads/:id/tasks` (ver API objetivo en `05-arquitectura-objetivo.md`), UI de "próxima acción" real en vez de `customFields.nextAction`. |
| FND-04 `NextBestAction` → Task | 🔶 campo listo, sin lógica | Añadido `NextBestAction.convertedTaskId`. **Falta**: endpoint aceptar/descartar/ejecutar que cree el `Task` y enlace. |
| FND-05 Ingestión unificada | ✅ hecho | `createLead()` e `importLeads()` (leads.service.ts) ahora llaman `syncContact()` + `orchestrateNewLead()` igual que `ingestLead()`; `orchestrateNewLead` es idempotente (upsert de conversación, outbox `lead.created` solo si es nueva), así que alta manual, CSV, Meta y landing producen los mismos efectos de dominio. `leadIngestion.service.ts` simplificado para no duplicar la orquestación. Pendiente conocido: `importLeads` sigue siendo secuencial por fila (LE-06/P1, no agravado aquí, requiere `ImportJob` async). |
| FND-06 Errores/correlationId | ⬜ pendiente | No abordado; requiere decidir un formato común de error y dónde vive `correlationId` (candidato: columna en `AutomationRun`/`OutboxEvent`, ya sugerida en `05-arquitectura-objetivo.md` pero no aplicada). |

Verificado: `npx tsc --noEmit` y `npx vite build` limpios tras el schema push (`SalesActivity`, `Task`, `updatedAt`+índices, `NextBestAction.convertedTaskId`) y el refactor de ingestión.

**Siguiente paso concreto para continuar la Fase 1:** escribir `SalesActivity` desde los servicios existentes (calls, leads notes/files, meetings, pipeline stage changes, mautic email) y construir el CRUD de `Task` + su API, ya que LE-101..109 y OP-101..109 asumen que estos dos modelos ya emiten datos reales.

## Fases siguientes (no iniciadas)

- Fase 1 · FND-01..06, LE-101/102/103/106/107, AU-101..111 (resto), OP-101/102/104/105, RE-101/102/103/107.
- Fase 2 · Email marketing completo (EM-101..110), automatizaciones avanzadas, recordatorios.
- Fase 3 · Calendario externo, forecast, Empresa/Contacto.
- Fase 4 · P2/P3.

## Cómo continuar

1. Leer este archivo y `04-backlog-priorizado.md`.
2. Continuar con la fase marcada 🔄 hasta cerrarla (criterios de aceptación en cada doc `0X-*.md`).
3. Actualizar esta tabla al terminar cada ítem.
