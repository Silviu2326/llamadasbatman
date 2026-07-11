# VozIA — Roadmap al 100%

*Auditoría de código real (no solo del documento) hecha el 2026-07-05. Corrige dos cosas que estaban desactualizadas: PLATAFORMA_EXPLICACION_GENERAL.md subestima cuánto avanzó Meta Ads, y la nota de que "el frontend es todo mock" ya no es cierta — casi todas las páginas de listado están conectadas a la API real.*

---

## Corrección importante antes del checklist

- **Meta Ads está completo de punta a punta (2026-07-05)**: backend y frontend verificados contra código real — `tsc --noEmit` sin errores y `vite build` sin errores. OAuth con Meta, wizard, publicación real de campañas vía Graph API, webhook de leads firmado, auto-llamada, sync de métricas, kill-switch de presupuesto/costo-por-lead, poll de revisión del anuncio, **landing pública (`/l/:slug`)**, generación real de imagen (OpenAI `gpt-image-1`) y **Conversions API** (`metaConversions.service.ts`, eventos `Lead`/`Schedule`) ya están construidos y wireados. Las 4 pantallas de frontend (conectar cuenta, playbooks admin, wizard, tab "Anuncio") también existen y navegan entre sí. Detalle histórico de la reconciliación en [`META_ADS_CIERRE_100.md`](./META_ADS_CIERRE_100.md) (documento desactualizado a partir de esta fecha — quedó todo lo que ahí figuraba como pendiente). Todo el trabajo está sin commitear todavía.
- **El frontend ya no es "solo login conectado"**: todas las pantallas principales, incluyendo Leads (ficha de detalle) y el detalle de Automatizaciones, ya usan la API real. Lo único que queda parcialmente decorativo es la sección de Integraciones en Configuración, y es una decisión de alcance a propósito (ver sección 4) — no hay ninguna integración real (HubSpot/Salesforce/Slack/etc.) que conectar todavía.

---

## 1. Llamadas con IA (VozIA) — el motor central — COMPLETO

Reconciliado y cerrado contra código real el 2026-07-05 (backend `tsc --noEmit` sin errores). Al implementar apareció un bug adicional que no estaba en el roadmap: la transferencia a humano se disparaba en el handler de `close`, es decir **después** de que la llamada ya había terminado — nunca podía funcionar aunque `transferRequested` se hubiera activado.

| Pieza | Estado | Archivo(s) |
|---|---|---|
| **Bug adicional (no estaba en el roadmap): transferencia disparaba después de cerrar la llamada** | HECHO | `mediaStream.ts` — `transferCall()` vivía en `connection.on('close')`, cuando la llamada ya terminó. Se movió a `onTranscript()` (en vivo, durante la llamada) |
| Lógica automática de transferencia a humano | HECHO | `voice/compliance.ts#detectTransferRequest` (frases explícitas) + contador `ctx.frustration` (3 turnos negativos seguidos) en `mediaStream.ts` — ambos disparan `transferCall` en vivo |
| Reconectar "Iniciar campaña" al motor de voz integrado | HECHO | `campaigns.service.ts#startCampaign` ahora encola cada lead "new" vía `enqueueLeadCall` (misma cola real `lead-call-dispatch` que ya usaba la llamada individual) en vez de `fetch` a un `VOICE_SERVICE_URL` muerto. `jobs/campaignDispatch.ts` era código 100% muerto (nada encolaba a esa cola) — se borró junto con su import en `worker.ts` |
| Guardar `recordingUrl` real de Twilio | HECHO | `recordingStatusCallback` en `twilioClient.ts#startOutboundCall` + nuevo webhook `POST /api/voice/webhook/recording` que escribe `Call.recordingUrl` |
| Reintentos de llamadas no contestadas + control de ritmo | HECHO | `Lead.attempts`/`lastAttemptAt` en Prisma, `statusCallback` de Twilio + `POST /api/voice/webhook/status` reencola con backoff (`scheduleRetry`, tope `MAX_CALL_ATTEMPTS=3`) si el estado final no fue `completed`. Ritmo: `limiter: { max: 20, duration: 60_000 }` en el Worker de `lead-call-dispatch` (built-in de BullMQ, sin dependencia nueva) |

Todo sin commitear. Falta correr `prisma migrate dev`/`db push` para aplicar `Lead.attempts`/`Lead.lastAttemptAt` contra una base real (mismo pendiente que los modelos de la sección 2).

## 2. Captación de leads — COMPLETO (salvo ingesta externa nueva)

Reconciliado y cerrado contra código real el 2026-07-05 — detalle de la investigación (incluyendo un bug crítico encontrado en el proceso) en [`LEAD_GEN_CIERRE_100.md`](./LEAD_GEN_CIERRE_100.md):

| Pieza | Estado | Archivo(s) |
|---|---|---|
| **Bug crítico (no estaba en el roadmap): crash en la ficha de lead** | HECHO | `LeadDetailPage.jsx` leía `lead.painPoints` sin default — con un lead real (`painPoints` no existía en el objeto) tiraba `TypeError` en render. Se extrajo el mapeo real a `src/lib/leadMapping.js` (compartido con `Leads.jsx`, antes duplicado) |
| Auto-llamada consistente en las 3 fuentes de creación de leads | HECHO | Checkbox "Llamar ahora" en `NewLeadModal.jsx`; toggle `autoCall` en `ProspectFinderPage.jsx` → `prospects.controller.ts`; UI de importación CSV nueva (`ImportLeadsModal.jsx`, el botón "Importar" estaba muerto) con su propio toggle → `leads.controller.ts#importCsv` |
| DNC persistente | HECHO | Modelo `OptOut` en Prisma, reemplaza el `Set` en memoria de `voice/compliance.ts` |
| Ficha de lead con datos reales | HECHO | Email/teléfono/pain points (desde la auditoría)/actividad (desde `calls`+`meetings`)/oportunidad ya no son random ni hardcodeados en `LeadDetailPage.jsx` |
| Notas de lead persistentes | HECHO | Modelo `LeadNote` + `GET/POST /api/leads/:id/notes` — antes vivían solo en estado de React y se perdían al recargar |
| Archivos de lead | HECHO | Modelo `LeadFile` + subida real a S3 (`lib/s3.ts`, ya existía el cliente pero sin `putObject`) vía `GET/POST /api/leads/:id/files` |
| Histórico de auditorías | HECHO | Modelo `LeadAudit` — cada corrida se guarda además de pisar `customFields.digitalAudit` |
| Auditoría en bloque para una campaña completa | HECHO | `POST /api/campaigns/:id/audit-bulk` (secuencial, tope 50 por corrida) + botón en el tab Audiencia de `CampaignDetailPage.jsx` |
| Ingesta externa desde formulario propio / Google Ads | **Sin construir, a propósito** | `ingestLead()` ya es genérico y reusable, pero no hay ninguna fuente concreta pedida todavía — construirlo ahora sería especulativo (YAGNI). Ver sección 7 de `LEAD_GEN_CIERRE_100.md` |

Todo sin commitear — falta correr `prisma migrate dev` (o `db push`) contra una base real para aplicar los 4 modelos nuevos (`OptOut`, `LeadNote`, `LeadAudit`, `LeadFile`); no hay carpeta `backend/prisma/migrations` en el repo.

## 3. Anuncios (Meta Ads) — COMPLETO

Ya no queda nada pendiente de esta lista. Todo verificado contra código real el 2026-07-05 (existe el archivo, está wireado, y el proyecto compila/buildea):

| Pieza | Estado | Archivo(s) |
|---|---|---|
| Landing pública (`/l/:slug`) | HECHO | `routes/landing.ts`, `controllers/landing.controller.ts` (reusa `leadIngestion.service.ts`) + `src/pages/PublicLandingPage.jsx`, ruta pública en `App.jsx` |
| Conectar cuenta de Meta (OAuth) | HECHO | `GET /api/meta/accounts/oauth/start-url` (evita el problema de JWT en navegación de página completa) + `src/pages/MetaAccountPage.jsx` en `/captacion/conectar` |
| Wizard de 3 preguntas | HECHO | `POST /api/ads/wizard` + `src/pages/AdsWizardPage.jsx` en `/captacion/nueva` |
| Recetas por vertical (admin) | HECHO | `AdPlaybooksAdminPage.jsx` en `/admin/ad-playbooks`, gateado con `AdminRoute.jsx` |
| Resultados/insights por campaña | HECHO | `GET /api/ads/campaigns/:id/insights` (`metaInsights.service.ts`) + tab "Anuncio" en `CampaignDetailPage.jsx` (gráfico con Recharts) |
| Kill-switch de costo por lead | HECHO | `PUT /api/ads/campaigns/:id/max-cpl`, editable desde el mismo tab "Anuncio" |
| Generación real de imágenes | HECHO | `assetGenerator.service.ts` llama OpenAI `gpt-image-1` si `OPENAI_API_KEY` está configurada (variable ya en `.env.example`) |
| Conversions API | HECHO | `metaConversions.service.ts` — `sendLeadEvent` (desde `leadIngestion.service.ts`) y `sendScheduleEvent` (desde `meetings.service.ts`), usa `metaPixelId` por cuenta (pantalla en `MetaAccountPage.jsx`) |

Nada de esto está commiteado todavía — son archivos nuevos/modificados en el working tree. Pendiente real fuera de esta lista: no hay carpeta `backend/prisma/migrations` (el repo nunca corrió `prisma migrate`), así que el paso a producción va a necesitar decidir cómo se aplica el schema (migración vs. `db push`).

## 4. Frontend general (fuera de Leads y Meta Ads) — COMPLETO

Reconciliado y cerrado contra código real el 2026-07-05 (`tsc --noEmit` y `vite build` sin errores). Igual que en las secciones 1 y 2, apareció un bug adicional no documentado en el roadmap: `AutomacionDetailPage.jsx` **crasheaba** con cualquier automatización real.

| Pieza | Estado | Archivo(s) |
|---|---|---|
| **Bug adicional (no estaba en el roadmap): crash en el detalle de una automatización** | HECHO | `<auto.Icon>`/`<auto.TriggerIcon>` se renderizaban con `undefined` (esos campos no existen en el modelo `Automation`, solo en el mock viejo) — React tira "Element type is invalid". Se extrajo `mapAutomation`/`stableIndex` a `src/lib/automationMapping.js` (compartido con `Automatizaciones.jsx`, antes duplicado), que ya asignaba ícono/color de forma determinística |
| Detalle de Automatizaciones con datos reales | HECHO | `AutomacionDetailPage.jsx` reescrito: KPIs reales (`runsCount`, `lastRunAt`, cantidad de acciones), sección "Acciones"/"Flujo" ahora lee el array real `Automation.actions` (antes texto fijo "Acción 1-4" igual para todas). El gráfico semanal y la lista de "ejecuciones recientes" eran 100% inventados (no existe un log de ejecuciones individuales en el schema) — se reemplazaron por un estado honesto en vez de fabricar historial falso. De paso se borró un panel lateral muerto en `Automatizaciones.jsx` (`{false && (...)}`, nunca se renderizaba y referenciaba variables inexistentes) y el array mock `AUTOMATIONS` sin uso |
| Configuración → Uso/cuotas | HECHO | "Créditos de voz" se sacó (no hay modelo de billing/créditos en el schema — inventar un número sería peor que no mostrarlo). "Usuarios" estaba mal cableado a `stats.totalLeads`; ahora usa `stats.userCount` real (`dashboard.service.ts` ahora cuenta `prisma.user.count`). "Tu plan actual" mostraba "Enterprise" fijo; ahora usa `Organization.plan` real (`stats.orgPlan`) |
| Configuración → Integraciones | **Decisión de alcance tomada: sin backend real, no inventar** | No existe ninguna integración real con HubSpot/Salesforce/Slack/Google Calendar/Make en el código — mostrar "Conectado" para las 5 era directamente falso. Se reemplazó por un estado vacío honesto ("Sin integraciones conectadas todavía") en vez de construir 5 integraciones OAuth sin que nadie las haya pedido (YAGNI) |

---

## Orden sugerido (mayor impacto / menor esfuerzo primero)

~~Landing pública, frontend de Meta Ads (conectar cuenta, playbooks admin, wizard, tab de resultados), endpoint de tope de CPL, generación de imágenes IA y Conversions API~~ — completos, ver sección 3.

~~Persistir DNC, auto-llamada consistente (manual/CSV/Prospect Finder), ficha de lead con datos reales, notas, archivos, histórico de auditorías, auditoría en bloque~~ — completos, ver sección 2.

~~Transferencia a humano, reconectar dispatch masivo de campaña, `recordingUrl` de Twilio, reintentos + control de ritmo~~ — completos, ver sección 1.

~~Detalle de Automatizaciones con datos reales, Configuración (Uso/cuotas real, Integraciones con estado honesto)~~ — completos, ver sección 4.

Las 4 secciones del roadmap están cerradas. Solo quedan 3 pendientes, ninguno bloqueante para operar la plataforma:

1. Decir el aviso de IA + consentimiento en el saludo (riesgo legal, esfuerzo bajo) — único pendiente de cumplimiento.
2. Fallback de LLM (si Cerebras/el proveedor principal falla en medio de una llamada).
3. Ingesta externa de leads (formulario propio/Google Ads) cuando haya una fuente concreta pedida — no antes (YAGNI).

Pendiente técnico transversal a todo lo demás: correr `prisma migrate dev` (o `db push`) contra una base real para aplicar los modelos/campos nuevos de las secciones 1 y 2 (`OptOut`, `LeadNote`, `LeadAudit`, `LeadFile`, `Lead.attempts`, `Lead.lastAttemptAt`) — no hay carpeta `backend/prisma/migrations` en el repo. Todo el trabajo de este documento sigue sin commitear.
