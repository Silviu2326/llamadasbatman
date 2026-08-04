# Backend API y superficie de plataforma

> Inventario derivado del código actual. La fuente de verdad operativa son los plugins de Fastify, sus controladores/servicios y `backend/prisma/schema.prisma`; esta página no sustituye los esquemas Zod ni los tipos de cada handler.

## 1. Resumen ejecutivo

El backend es una API Fastify sobre PostgreSQL/Prisma, con JWT de acceso, sesiones persistidas, RBAC con alcances `own`/`team`/`org`, integraciones externas y un proceso separado de workers. La API HTTP se registra desde [backend/src/index.ts](../../backend/src/index.ts), que monta todos los plugins bajo `/api/*`, expone `/health` y configura CORS, JWT, rate limiting, parsing de formularios y `x-correlation-id`.

La frontera de datos es la organización del JWT (`orgId`). Los controladores extraen el tenant del principal autenticado y los servicios deben volver a filtrar por `orgId`; no se acepta que el cliente elija el tenant mediante el body. Las superficies públicas están deliberadamente limitadas a landing pages, enlaces compartidos y webhooks firmados/secretos.

## 2. Registro de plugins y transporte

### 2.1 Inicialización HTTP

`build()` en [backend/src/index.ts](../../backend/src/index.ts) configura:

- Fastify con `logger: true`, límite JSON de 15 MiB y `trustProxy` solo si `TRUST_PROXY=true`.
- `@fastify/cors` con allowlist explícita desde `CORS_ORIGINS` o `APP_URL`; no admite comodines.
- `@fastify/jwt` con `JWT_SECRET` fuerte.
- `@fastify/rate-limit` global: 100 solicitudes por minuto.
- Parser `application/x-www-form-urlencoded` para Twilio.
- Hook `onRequest` que genera/propaga `x-correlation-id`.
- Validación al arrancar de `JWT_SECRET` y `OAUTH_STATE_SECRET`; secretos menores de 32 caracteres o valores conocidos inseguros hacen fallar el proceso.

### 2.2 Prefijos registrados

| Plugin | Prefijo HTTP | Dominio | Fuente |
|---|---|---|---|
| `authRoutes` | `/api/auth` | Sesiones | [routes/auth.ts](../../backend/src/routes/auth.ts) |
| `agentsRoutes` | `/api/agents` | Agentes de voz | [routes/agents.ts](../../backend/src/routes/agents.ts) |
| `callsRoutes` | `/api/calls` | Llamadas | [routes/calls.ts](../../backend/src/routes/calls.ts) |
| `leadsRoutes` | `/api/leads` | Leads e importaciones | [routes/leads.ts](../../backend/src/routes/leads.ts) |
| `accountsRoutes` | `/api/accounts` | Empresas/cuentas | [routes/accounts.ts](../../backend/src/routes/accounts.ts) |
| `prospectsRoutes` | `/api/prospects` | Prospección | [routes/prospects.ts](../../backend/src/routes/prospects.ts) |
| `campaignsRoutes` | `/api/campaigns` | Campañas | [routes/campaigns.ts](../../backend/src/routes/campaigns.ts) |
| `meetingsRoutes` | `/api/meetings` | Reuniones | [routes/meetings.ts](../../backend/src/routes/meetings.ts) |
| `pipelineRoutes` | `/api/pipeline` | Oportunidades/pipeline | [routes/pipeline.ts](../../backend/src/routes/pipeline.ts) |
| `tasksRoutes` | `/api/tasks` | Tareas | [routes/tasks.ts](../../backend/src/routes/tasks.ts) |
| `playbooksRoutes` | `/api/playbooks` | Playbooks de organización | [routes/playbooks.ts](../../backend/src/routes/playbooks.ts) |
| `adPlaybooksRoutes` | `/api/ad-playbooks` | Biblioteca global de anuncios | [routes/adPlaybooks.ts](../../backend/src/routes/adPlaybooks.ts) |
| `adsRoutes` | `/api/ads` | Ads y Meta | [routes/ads.ts](../../backend/src/routes/ads.ts) |
| `funnelsRoutes` | `/api/funnels` | Funnels | [routes/funnels.ts](../../backend/src/routes/funnels.ts) |
| `metaAccountsRoutes` | `/api/meta/accounts` | OAuth/cuentas Meta | [routes/metaAccounts.ts](../../backend/src/routes/metaAccounts.ts) |
| `metaWebhooksRoutes` | `/api/meta/webhooks` | Lead Ads webhook | [routes/metaWebhooks.ts](../../backend/src/routes/metaWebhooks.ts) |
| `mauticWebhooksRoutes` | `/api/webhooks/mautic` | Eventos Mautic | [routes/mauticWebhooks.ts](../../backend/src/routes/mauticWebhooks.ts) |
| `mauticRoutes` | `/api/mautic` | Email marketing Mautic | [routes/mautic.ts](../../backend/src/routes/mautic.ts) |
| `metricoolRoutes` | `/api/metricool` | Redes sociales vía Metricool | [routes/metricool.ts](../../backend/src/routes/metricool.ts) |
| `automationsRoutes` | `/api/automations` | Automatizaciones | [routes/automations.ts](../../backend/src/routes/automations.ts) |
| `knowledgeRoutes` | `/api/knowledge` | Base de conocimiento | [routes/knowledge.ts](../../backend/src/routes/knowledge.ts) |
| `dashboardRoutes` | `/api/dashboard` | Resumen y actividad | [routes/dashboard.ts](../../backend/src/routes/dashboard.ts) |
| `voiceRoutes` | `/api/voice` | Telefonía/Twilio | [routes/voice.ts](../../backend/src/routes/voice.ts) |
| `landingRoutes` | `/api/public/landing` | Landing pública | [routes/landing.ts](../../backend/src/routes/landing.ts) |
| `campaignShareRoutes` | `/api/public/campaigns` | Enlace público de campaña | [routes/campaignShare.ts](../../backend/src/routes/campaignShare.ts) |
| `settingsRoutes` | `/api/settings` | Usuario, organización e integraciones | [routes/settings.ts](../../backend/src/routes/settings.ts) |
| `conversationsRoutes` | `/api/conversations` | Conversaciones omnicanal | [routes/conversations.ts](../../backend/src/routes/conversations.ts) |
| `whatsappRoutes` | `/api/whatsapp` | Webhooks/envío WhatsApp | [routes/whatsapp.ts](../../backend/src/routes/whatsapp.ts) |
| `emailMetricsRoutes` | `/api/email` | Métricas de email | [routes/emailMetrics.ts](../../backend/src/routes/emailMetrics.ts) |
| `marketingCampaignsRoutes` | `/api/marketing-campaigns` | Campañas de email | [routes/marketingCampaigns.ts](../../backend/src/routes/marketingCampaigns.ts) |
| `growthProgramsRoutes` | `/api/growth-programs` | Programas de growth | [routes/growthPrograms.ts](../../backend/src/routes/growthPrograms.ts) |
| `revenueIntelligenceRoutes` | `/api/revenue-intelligence` | Acciones, experimentos y gobierno | [routes/revenueIntelligence.ts](../../backend/src/routes/revenueIntelligence.ts) |
| `accessControlRoutes` | `/api/access-control` | RBAC y solicitudes | [routes/accessControl.ts](../../backend/src/routes/accessControl.ts) |
| `organicRoutes` | `/api/organic` | Organic Leads/Google | [routes/organic.ts](../../backend/src/routes/organic.ts) |

Además, el servidor HTTP maneja WebSocket en `/media` y `/voice-sim/live`, y delega el resto de upgrades a Socket.IO mediante [websockets/index.ts](../../backend/src/websockets/index.ts). `/health` devuelve `{ status: "ok", ts }` y no exige sesión.

## 3. Convenciones de autenticación y autorización

### 3.1 Sesión de usuario

- `POST /api/auth/login` recibe `{ email, password }`, normaliza el email y devuelve un JWT de acceso de 15 minutos. También establece la cookie HttpOnly `vozia_refresh` con TTL de 30 días y `Path=/api/auth`.
- `POST /api/auth/refresh` rota la sesión de refresh de forma atómica. El token anterior queda revocado; el replay devuelve 401.
- `POST /api/auth/logout` exige JWT, revoca la sesión asociada y limpia la cookie.
- El JWT contiene `userId`, `orgId`, `role`, `email`, `tokenType: "access"` y `sessionId`.
- [middlewares/authenticate.ts](../../backend/src/middlewares/authenticate.ts) verifica firma, tipo, identidad y, fuera de tests, que `AuthSession` siga vigente y no revocada.
- Contraseñas: bcrypt mediante [services/auth.service.ts](../../backend/src/services/auth.service.ts).

Los endpoints protegidos responden normalmente `401 { error: "Unauthorized" }` ante sesión ausente/inválida y `403 { error: "Forbidden" }` ante principal incompleto o permiso insuficiente.

### 3.2 RBAC y alcances

El catálogo está en [access-control/catalog.ts](../../backend/src/access-control/catalog.ts). Roles actuales: `owner`, `admin`, `revenue_ops`, `sales_manager`, `sales_rep`, `marketing_growth`, `analyst`, `compliance`, `finance_controller`, `guest`, más `agent` y `viewer` legacy.

Los permisos son capacidades del backend, no simples flags de UI. Los principales dominios son `dashboard`, `leads`, `accounts`, `calls`, `conversations`, `campaigns`, `ads`, `social`, `funnels`, `agents`, `playbooks`, `automations`, `knowledge`, `meetings`, `pipeline`, `tasks`, `growth`, `organic`, `experiments`, `memory`, `governance`, `integrations`, `organization`, `users`, `roles`, `audit`, `costs`, `data.export_sensitive` y `access_control`.

`requirePermission()` y `requireAnyPermission()` en [access-control/requirePermission.ts](../../backend/src/access-control/requirePermission.ts) validan el principal del JWT, el permiso, el alcance solicitado y, cuando se proporciona, la coincidencia de `resourceOrgId`. `dataScope.ts` reduce `team` a `own` hasta que exista un modelo de equipo; los servicios siguen siendo responsables del filtro final.

Los guardas de coste (`costs.request`) se combinan con mutaciones que pueden llamar a IA o proveedores de pago. Los guardas de aprobación (`*.approve`, `governance.*`, `access_request.*`) implementan separación de funciones.

### 3.3 Integraciones y secretos

- Meta: OAuth con estado y tokens cifrados en [services/metaAdAccount.service.ts](../../backend/src/services/metaAdAccount.service.ts), callback público.
- Organic/Google: OAuth server-side, PKCE, state opaco de un solo uso, discovery y tokens AES-256-GCM en [services/organicGoogleIntegration.service.ts](../../backend/src/services/organicGoogleIntegration.service.ts) y [lib/organicTokenCrypto.ts](../../backend/src/lib/organicTokenCrypto.ts).
- Twilio: firma de webhook; voz usa además `x-voice-service-secret` para el servicio interno.
- Mautic: secreto por header `X-Mautic-Webhook-Secret`, Bearer o query legacy.
- Meta Lead Ads: `X-Hub-Signature-256` sobre el body crudo y token de verificación para GET.
- WhatsApp: firma Twilio en inbound/status; el envío es sesión + permisos + coste.

## 4. Validación, formato y observabilidad

La validación centralizada disponible es [lib/validation.ts](../../backend/src/lib/validation.ts): `parseRequest(reply, zodSchema, payload)` responde 400 con:

```json
{
  "error": "Datos de entrada no válidos",
  "fields": { "campo": ["mensaje"] }
}
```

Organic, Metricool, Meta OAuth, revenue intelligence, marketing campaigns y varios controladores usan Zod estricto. Otros handlers mantienen tipos Fastify o validación manual y algunos están tipados como `any`; por ello el contrato exacto debe comprobarse en el controlador enlazado.

Convenciones adicionales:

- Body JSON máximo: 15 MiB.
- Content type form-urlencoded disponible para Twilio.
- Error de dominio frecuente: `404` para recurso no encontrado, `409` para estado/conflicto de ownership, `403` para permisos/compliance/plan, `502/503` para proveedor no disponible.
- No hay un error-handler JSON global propio en `index.ts`; errores no capturados dependen del comportamiento de Fastify y del logger.
- `x-correlation-id` se genera o propaga por petición y se reutiliza en auditoría, outbox y ejecuciones de automatización.
- CORS requiere origen explícito; requests server-to-server sin `Origin` no reciben cabeceras CORS compartibles.
- Rate limits especiales: login 10/15 min por IP; landing view 120/min; landing lead 8/h por IP y 1/24 h por teléfono+slug.

## 5. Inventario HTTP por dominio

La notación `auth` significa JWT + permiso indicado. `public` significa sin JWT, pero puede exigir firma, secreto o rate limit. En rutas con `/:id`, la posición de las rutas estáticas se registra antes del parámetro cuando el plugin lo requiere.

### 5.1 Identidad, configuración y control de acceso

| Método y ruta | Acceso | Función |
|---|---|---|
| `POST /api/auth/login` | pública + rate limit | Login y creación de sesión |
| `POST /api/auth/refresh` | cookie refresh | Rotación de refresh |
| `POST /api/auth/logout` | auth | Revocación de sesión |
| `GET /api/settings/me` | auth | Perfil/preferencias |
| `PUT /api/settings/me` | auth | Actualizar perfil/preferencias |
| `PUT /api/settings/password` | auth | Cambiar contraseña |
| `GET /api/settings/organization` | `organization.read:org` | Leer organización |
| `PUT /api/settings/organization` | `organization.manage:org` | Actualizar organización |
| `GET /api/settings/integrations` | `integrations.read:org` | Estado de integraciones |
| `GET /api/access-control/catalog` | `access_control.read` | Catálogo de roles/permisos |
| `GET /api/access-control/members` | `access_control.read` | Miembros de la organización |
| `GET /api/access-control/requests` | cualquiera de lectura/solicitud/aprobación | Solicitudes de acceso |
| `POST /api/access-control/requests` | `access_request.create` | Crear solicitud |
| `POST /api/access-control/requests/:id/approve` | permiso de aprobación correspondiente | Aprobar |
| `POST /api/access-control/requests/:id/reject` | permiso de aprobación correspondiente | Rechazar |
| `PATCH/PUT /api/access-control/members/:userId/role` | `access_control.manage` | Asignar rol |

Fuentes: [settings.controller.ts](../../backend/src/controllers/settings.controller.ts), [accessControl.controller.ts](../../backend/src/controllers/accessControl.controller.ts), [services/accessControl.service.ts](../../backend/src/services/accessControl.service.ts).

### 5.2 CRM, leads y actividad comercial

| Prefijo | Endpoints |
|---|---|
| `/api/leads` | `GET /`, `GET /owners`, `GET /export`, `GET /imports`, `GET /imports/:id`, `GET /:id`, `GET /:id/timeline`, `GET /:id/activities`, `GET /:id/consent`, `GET /:id/audit`, `GET /:id/audit-history`, `GET /:id/notes`, `GET /:id/files`, `GET /:id/email-history`, `GET /:id/preferences`; `POST /`, `POST /import`, `PUT /:id`, `PUT /:id/owner`, `POST /:id/call-now`, `POST /:id/audit`, `POST /:id/notes`, `POST /:id/files`, `POST /:id/send-email`, `PUT /:id/preferences`. |
| `/api/accounts` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `POST /leads/:leadId/assign`. |
| `/api/prospects` | `POST /search`, `POST /import`; ambos requieren `leads.write` y `costs.request`. |
| `/api/calls` | `GET /`, `GET /live`, `GET /:id`, `POST /bulk-actions`, `POST /:id/notes`, `PUT /:id/notes/:noteId`, `DELETE /:id/notes/:noteId`, `POST /:id/favorite`, `GET /:id/tasks`, `POST /:id/tasks`, `PUT /:id/tasks/:taskId`; `POST /ingest` usa `authenticateVoiceService`. |
| `/api/meetings` | `GET /`, `POST /`, `GET /:id`, `GET /:id/prep`, `PUT /:id`, `POST /:id/reschedule`, `POST /:id/complete`, `POST /:id/no-show`. |
| `/api/tasks` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `POST /:id/complete`, `POST /:id/cancel`. |
| `/api/pipeline` | `GET /`, `POST /`, `GET /insights`, `GET /prediction`, `GET /actions`, `GET /list`, `GET /forecast`, `GET /products`, `POST /products`, `GET /:id`, `PUT /:id`, `POST /:id/move-stage`, `POST /:id/mark-won`, `POST /:id/mark-lost`, `POST /:id/reopen`, `GET /:id/history`, `PUT /:id/forecast-category`, `GET/POST /:id/contacts`, `DELETE /:id/contacts/:leadId`, `GET/POST /:id/line-items`, `DELETE /:id/line-items/:lineItemId`. |
| `/api/dashboard` | `GET /stats`, `GET /activity`, ambos `dashboard.read:org`. |

Los listados propios usan `own`, los managers pueden tener `team` y las operaciones de organización explícitas usan `org`. El ownership se refuerza en [services/leads.service.ts](../../backend/src/services/leads.service.ts), [services/pipeline.service.ts](../../backend/src/services/pipeline.service.ts), [services/tasks.service.ts](../../backend/src/services/tasks.service.ts) y [services/meetings.service.ts](../../backend/src/services/meetings.service.ts).

### 5.3 Campañas, anuncios y funnels

| Prefijo | Endpoints |
|---|---|
| `/api/campaigns` | `GET/POST /`, `GET/PUT /:id`, `PUT /:id/landing`, `POST /:id/start`, `POST /:id/pause`, `GET /:id/stats`, `POST /:id/audit-bulk`, `POST /:id/duplicate`, `GET /:id/activity`, `POST /:id/share-link`. |
| `/api/ads` | `POST /strategy`, `GET /overview`, `GET/PUT /draft`, `POST /wizard`, `GET /campaigns/:id/status`, `GET /campaigns/:id/insights`, `GET /campaigns/:id/remote-status`, `POST /campaigns/:id/publish`, `POST /campaigns/:id/activate`, `POST /campaigns/:id/pause`, `PUT /campaigns/:id/max-cpl`. Las operaciones con IA/proveedor requieren `ads.write` + `costs.request`. |
| `/api/ad-playbooks` | `GET /` con `playbooks.read`; `POST /`, `PUT /:id` con `playbooks.manage_global`. Es una biblioteca global sin `orgId`. |
| `/api/funnels` | `GET /overview`, `POST /`. |
| `/api/meta/accounts` | `GET /oauth/start-url`, `GET /oauth/start`, `GET /oauth/callback` público por redirección, `GET /`, `PUT /:id/budget-cap`, `PUT /:id/pixel-id`, `DELETE /:id`. |
| `/api/meta/webhooks` | `GET /leadgen` verificación Meta; `POST /leadgen` evento firmado `X-Hub-Signature-256`. |

El flujo de anuncios persiste campañas, assets/configuración y snapshots de insights. [ads.controller.ts](../../backend/src/controllers/ads.controller.ts), [adsOverview.service.ts](../../backend/src/services/adsOverview.service.ts), [adsStrategy.service.ts](../../backend/src/services/adsStrategy.service.ts), [metaCampaignBuilder.service.ts](../../backend/src/services/metaCampaignBuilder.service.ts) y [metaInsights.service.ts](../../backend/src/services/metaInsights.service.ts) contienen la lógica de proveedor.

### 5.4 Automatización, conocimiento y revenue intelligence

| Prefijo | Endpoints |
|---|---|
| `/api/automations` | `GET /`, `GET /health`, `POST /`, `GET /:id`, `GET /:id/runs`, `GET /:id/runs/:runId`, `GET /:id/versions`, `POST /:id/publish`, `PUT /:id/toggle`, `DELETE /:id`. |
| `/api/knowledge` | `GET/POST /`, `GET/PUT/DELETE /:id`, `POST /:id/favorite`, `POST /:id/reaction`. |
| `/api/revenue-intelligence/next-actions` | `GET /`, `POST /refresh`, `PATCH /:id`. Lectura con `leads.read:org`; mutación con `tasks.write:org`. |
| `/api/revenue-intelligence/experiments` | `GET/POST /`, `GET/PATCH /:id`, `POST /:id/start`, `POST /:id/assign`, `POST /:id/conversions`. |
| `/api/revenue-intelligence/memory-proposals` | `GET /`, `POST /`, `PATCH /:id/review`. |
| `/api/revenue-intelligence/governance` | `GET /overview`, `GET /policies`, `GET /policies/:key`, `PUT /policies/:key`. |
| `/api/growth-programs` | `GET /overview`, `GET/POST /`, `GET /:id`, `PATCH/PUT /:id`, `POST /:id/archive`. |

Los cambios de memoria, gobierno, experimentos y publicaciones tienen controles de permisos/estado y se registran con auditoría cuando el servicio los considera sensibles. Fuentes: [automations.controller.ts](../../backend/src/controllers/automations.controller.ts), [automations.service.ts](../../backend/src/services/automations.service.ts), [revenueIntelligence.controller.ts](../../backend/src/controllers/revenueIntelligence.controller.ts), [revenueIntelligence.service.ts](../../backend/src/services/revenueIntelligence.service.ts) y [growthPrograms.service.ts](../../backend/src/services/growthPrograms.service.ts).

### 5.5 Social orgánico, email y conversaciones

| Prefijo | Endpoints |
|---|---|
| `/api/metricool` | `GET /`, `POST /connect`, `GET /analytics`, `POST /posts`, `POST /ai/generate`. Requiere plan completo con `metricoolEnabled`; los posts exigen Metricool configurado, URL pública y landing publicada. |
| `/api/mautic` | `GET /`, `GET /campaigns`, `POST /campaigns`, `GET /templates`, `GET /templates/unclaimed`, `POST /templates/:id/claim`, `POST /campaigns/:id/send-test`, `POST /campaigns/:id/schedule`, `POST /campaigns/:id/pause`, `GET /campaigns/:id/stats`. |
| `/api/marketing-campaigns` | `GET/POST /`, `GET/PUT /:id`, `POST /:id/validate`, `POST /:id/audience-preview`, `POST /:id/publish`, `POST /:id/pause`, `GET /:id/reconcile`. `reconcile` muta estado local aunque sea GET. |
| `/api/email` | `GET /overview`, `GET /campaigns/:campaignId/metrics`. |
| `/api/conversations` | `GET /`, `GET /templates`, `GET /:id`, `POST /:id/messages`, `PUT /:id`, `POST /:id/takeover`, `POST /:id/suggest`, `POST /:conversationId/next-actions/:id/accept`, `POST /:conversationId/next-actions/:id/dismiss`. Mensajería/IA de pago exige `costs.request`. |
| `/api/whatsapp` | `POST /inbound` y `POST /status` públicos con firma Twilio; `POST /send` autenticado, con permisos de conversación y coste. |

Fuentes: [metricool.controller.ts](../../backend/src/controllers/metricool.controller.ts), [metricoolSync.service.ts](../../backend/src/services/metricoolSync.service.ts), [mautic.controller.ts](../../backend/src/controllers/mautic.controller.ts), [marketingCampaigns.service.ts](../../backend/src/services/marketingCampaigns.service.ts), [conversations.service.ts](../../backend/src/services/conversations.service.ts) y [whatsapp.controller.ts](../../backend/src/controllers/whatsapp.controller.ts).

### 5.6 Organic Leads y Google

| Método y ruta | Acceso | Resultado |
|---|---|---|
| `GET /api/organic/overview` | `organic.read:org` | Proyecto, KPIs, oportunidades, activos, acciones e integraciones |
| `GET /api/organic/project` | `organic.read:org` | Proyecto de la organización |
| `GET /api/organic/integrations` | `organic.integrations.read:org` | Estado seguro de Search Console, GA4 y GBP |
| `GET /api/organic/integrations/:provider/status` | `organic.integrations.read:org` | Estado de un proveedor |
| `GET /api/organic/integrations/:provider/oauth/start-url` | `organic.integrations.manage:org` | URL OAuth |
| `GET /api/organic/integrations/:provider/oauth/start` | `organic.integrations.manage:org` | Redirección OAuth |
| `GET /api/organic/integrations/:provider/oauth/callback` | pública; state de un solo uso | Intercambio OAuth y redirección a frontend |
| `POST /api/organic/integrations/:provider/discover` | `organic.integrations.read:org` | Discovery real de recursos |
| `PUT /api/organic/integrations/:provider/resource` | `organic.integrations.manage:org` | Seleccionar `externalPropertyId` descubierto |
| `DELETE /api/organic/integrations/:provider` | `organic.integrations.manage:org` | Revocar y limpiar conexión |
| `POST /api/organic/integrations/search_console/sync` | `organic.integrations.manage:org` | Sincronizar queries reales con fechas y límite |
| `POST /api/organic/project` | `organic.manage:org` | Crear proyecto único por organización |
| `PATCH /api/organic/project` | `organic.manage:org` | Actualizar proyecto |
| `POST /api/organic/assets` | `organic.manage:org` | Crear borrador de activo |
| `POST /api/organic/opportunities/:opportunityId/actions` | `organic.manage:org` | Crear acción sobre oportunidad |

Providers permitidos: `search_console`, `ga4`, `google_business_profile`. La validación es estricta: ids acotados, objetos JSON de hasta 200 KB, fechas `YYYY-MM-DD`, `rowLimit` entre 1 y 25.000 y recurso únicamente procedente del discovery. El servicio no devuelve tokens; solo estado, scopes, discovery y timestamps. Fuentes: [organic.controller.ts](../../backend/src/controllers/organic.controller.ts), [organic.service.ts](../../backend/src/services/organic.service.ts), [organicGoogleIntegration.service.ts](../../backend/src/services/organicGoogleIntegration.service.ts).

### 5.7 Voz, landings y superficies públicas

| Método y ruta | Acceso | Función |
|---|---|---|
| `GET /api/voice/config/:agentId` | `x-voice-service-secret` | Configuración del agente, exige `orgId` y ownership conjunto |
| `POST /api/voice/webhook/voice` | firma Twilio | Devuelve TwiML para inbound |
| `POST /api/voice/webhook/recording` | firma Twilio | Persiste grabación validando contexto |
| `POST /api/voice/webhook/status` | firma Twilio | Reintentos de llamadas fallidas |
| `POST /api/voice/webhook/amd` | firma Twilio | ACK de AMD |
| `POST /api/voice/outbound` | `x-voice-service-secret` | Inicia llamada; valida E.164, ownership y compliance |
| `GET /api/public/landing/:slug` | pública | Render/datos de landing |
| `POST /api/public/landing/:slug/view` | pública + rate limit | Tracking de visita |
| `POST /api/public/landing/:slug/lead` | pública + rate limits | Captura lead, con límite por IP y teléfono |
| `GET /api/public/campaigns/:token` | pública | Consulta estado compartido por token |

Las rutas de voz usan [voice/telephony](../../backend/src/voice/telephony) y [calls.service.ts](../../backend/src/services/calls.service.ts). Las rutas públicas de landing y share no aceptan `orgId` arbitrario: lo resuelven por slug/token persistido.

## 6. Servicios y responsabilidades por dominio

El patrón habitual es `route -> controller -> service -> Prisma/provider`. Los controladores hacen extracción del JWT, validación de entrada y traducción de errores; los servicios hacen ownership, transacciones, side effects, auditoría y llamadas externas.

- Identidad: [auth.controller.ts](../../backend/src/controllers/auth.controller.ts) + [auth.service.ts](../../backend/src/services/auth.service.ts).
- CRM: controladores y servicios de `leads`, `accounts`, `calls`, `meetings`, `pipeline`, `tasks`, `campaigns`.
- Ads: `adsOverview`, `adsStrategy`, `adsWizard`, `metaAdAccount`, `metaCampaignBuilder`, `metaConversions`, `metaInsights`, `adOptimizer`.
- Integraciones: `metricoolSync`, `mauticSync`, `meta*`, `organicGoogleIntegration`, `whatsapp`.
- Plataforma: `accessControl`, `settings`, `dashboard`, `revenueIntelligence`, `growthPrograms`, `automations`.
- Seguridad transversal: [lib/audit.ts](../../backend/src/lib/audit.ts), [lib/correlationId.ts](../../backend/src/lib/correlationId.ts), [lib/dataScope.ts](../../backend/src/lib/dataScope.ts), [lib/securityConfig.ts](../../backend/src/lib/securityConfig.ts), [lib/validation.ts](../../backend/src/lib/validation.ts).

## 7. Multi-tenant, ownership y auditoría

### 7.1 Regla de tenant

`Organization` es la raíz. Casi todos los modelos operativos tienen `orgId` y una relación a `Organization`; los servicios usan `findFirst/findMany/updateMany` con `{ id, orgId }` o filtros equivalentes. Los modelos compartidos son excepcionales y están explícitos, por ejemplo `AdPlaybook.vertical` global.

El tenant se obtiene exclusivamente del JWT o del recurso público resuelto. Las rutas que reciben ids no deben confiar en ids relacionados del cliente; los servicios de `leads`, `accounts`, `pipeline`, `tasks`, `meetings`, `calls` y Organic comprueban pertenencia antes de leer o mutar.

### 7.2 Ownership y scopes

El rango de permisos es `own < team < org`. `scopedOwnerId()` devuelve `undefined` para org, el usuario para own/team y un id imposible cuando falta el permiso. La separación `team` aún no tiene modelo de equipo y colapsa a own deliberadamente.

Casos especialmente sensibles:

- leads/calls/meetings/tasks/pipeline tienen rutas own/team/org distintas;
- exportaciones sensibles requieren `leads.export` y, en algunos workflows, `data.export_sensitive`;
- llamadas, mensajes, IA, prospección y anuncios con coste requieren `costs.request`;
- cambios de rol y aprobaciones se persisten en `AccessControlRequest`, evitando autoaprobaciones;
- mutaciones importantes llaman a `writeAuditLog()`, que nunca bloquea el negocio si el log falla, pero registra el fallo.

## 8. Modelos Prisma principales

La fuente completa es [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma). PostgreSQL es el datasource y Prisma genera el cliente.

| Área | Modelos y función |
|---|---|
| Organización/identidad | `Organization`, `User`, `AuthSession`, `UserPreference`, `MetaOAuthState`. Organización y usuario son la raíz del tenant; sesiones guardan hash de refresh, expiración y revocación. |
| Voz/CRM | `Agent`, `Campaign`, `Lead`, `Call`, `CallTask`, `Meeting`, `Opportunity`, `OpportunityStageHistory`, `Account`, `OpportunityContact`, `Product`, `OpportunityLineItem`, `Task`, `SalesActivity`. |
| Atribución | `AcquisitionEvent` enlaza organización, campaña y opcionalmente lead con source/medium/content/session/externalKey; tiene constraints de idempotencia. |
| Ads | `Playbook`, `AdPlaybook` global, `MetaAdAccount` con token cifrado, `AdWizardDraft`, `AdInsightSnapshot`. |
| Conversación/canales | `ChannelIdentity`, `Conversation`, `MessageTemplate`, `Message`, `DeliveryAttempt`, `ContactConsent`, `WebhookEvent`. |
| Email/Mautic | `MauticAssetBinding`, `MauticContactBinding`, `EmailDelivery`, `EmailEvent`, `MarketingCampaign`. EmailEvent es idempotente por provider/externalEventId. |
| Automatización | `Automation`, `AutomationVersion`, `AutomationRun`, `AutomationStepRun`, `OutboxEvent`, `ScheduledTrigger`, `ImportJob`. Incluye leases/estados para recuperación. |
| Conocimiento/crecimiento | `KnowledgeBase`, `KnowledgeFavorite`, `GrowthProgram`, `NextBestAction`, `RevenueExperiment`, `RevenueExperimentVariant`, `RevenueExperimentAssignment`. |
| Gobierno | `OperationalMemoryProposal`, `GovernancePolicy`, `AccessControlRequest`, `AuditLog`, `OptOut`. |
| Organic Leads | `OrganicProject` (uno por org), `OrganicOpportunity`, `OrganicAsset`, `OrganicAction`, `OrganicIntegration`, `OrganicOAuthState`. |

Enums relevantes: `UserRole`, `CampaignStatus`, `LeadStatus`, `CallStatus`, `MeetingStatus`, `OpportunityStage`, `TaskStatus`, `TaskPriority`, `MauticAssetType`, `GrowthProgramType`, `AccessRequestType` y `AccessRequestStatus`.

Modelos Organic relevantes:

- `OrganicProject.orgId` es único; contiene website, servicios, ubicaciones, valor medio de lead y configuración.
- `OrganicOpportunity` puede enlazar lead/campaña y usa `source + sourceKey` para upsert de proveedores.
- `OrganicAsset` y `OrganicAction` son borradores/acciones con estado, contenido JSON y relación opcional a oportunidad.
- `OrganicIntegration` persiste estado, scopes, discovery y referencias públicas; los tokens solo se guardan cifrados.
- `OrganicOAuthState` almacena hash del state y PKCE cifrado, nunca credenciales.

## 9. Jobs, colas, workers y webhooks

### 9.1 Proceso worker

`npm run worker` ejecuta [worker.ts](../../backend/src/worker.ts), activa `BACKGROUND_WORKERS_ENABLED=true` y carga:

| Componente | Cola o mecanismo | Responsabilidad |
|---|---|---|
| `automationRunner` | BullMQ/Redis `automation-runner` | Ejecutar automatizaciones por evento; concurrency 10; dedupe por job id. |
| `leadCallDispatch` | BullMQ/Redis | Encolar llamadas, rate limit de 20/min, compliance y reintentos. |
| `adReviewPoll` | BullMQ/Redis `ad-review-poll` | Consultar estado de revisión Meta hasta 20 intentos con retraso de 60 s. |
| `adInsightsSync` | BullMQ repeatable `ad-insights-sync` | Cada 2 h obtiene insights y evalúa campañas activas. |
| `outboxDispatcher` | polling persistido | Reclama `OutboxEvent` con lease, ejecuta automatizaciones, backoff y DLQ. |
| `temporalEventScheduler` | polling persistido | Materializa triggers `lead.inactive.7d`, `lead.inactive.30d`, `meeting.scheduled.24h`, `opportunity.proposal.3d`. |
| `importJobRunner` | polling persistido | Procesa importaciones CSV por lotes de 20, leases, reintentos y dedupe por fila. |
| `campaignSendRunner` | polling persistido | Entrega EmailDelivery locales, activa campañas programadas y cierra campañas cuando la cola termina. |

Redis es opcional para algunas colas mediante [lib/optionalRedis.ts](../../backend/src/lib/optionalRedis.ts), pero sin Redis los productores pueden devolver `false` y los consumidores no se inician. Los jobs persistidos usan lease/workerId para recuperación después de caída y evitan duplicados con constraints idempotentes.

### 9.2 Webhooks y eventos externos

- Meta Lead Ads: challenge GET y POST firmado; [metaLeadWebhook.service.ts](../../backend/src/services/metaLeadWebhook.service.ts) recupera el lead y lo ingesta con `orgId` resuelto.
- Mautic: normaliza delivered/open/click/bounce/unsubscribe, correlaciona `EmailDelivery`, actualiza `EmailEvent` de forma idempotente y consentimiento.
- Twilio Voice: valida firma sobre URL pública y body, guarda recording/status y programa retry.
- Twilio WhatsApp: valida firma, guarda `WebhookEvent` idempotente y actualiza `Message`/identidad.
- Google OAuth: callback público autenticado por state opaco; tras completar redirige a `/captacion/conectar`.
- Landing pública: eventos view/lead se limitan por IP/teléfono y disparan ingestión/automatización.

## 10. Migraciones y configuración operativa

Las migraciones están en [backend/prisma/migrations](../../backend/prisma/migrations). Las más recientes cubren workers/leases, access control, revenue intelligence y Organic:

- `20260722120000_add_organic_leads_mvp`
- `20260722153000_add_organic_google_oauth`

Scripts backend: `npm run db:migrate`, `npm run db:push`, `npm run db:generate`, `npm run db:seed`, `npm test`, `npm run build`.

Variables críticas observadas en el código: `DATABASE_URL`, `JWT_SECRET`, `OAUTH_STATE_SECRET`, `CORS_ORIGINS`/`APP_URL`, `PUBLIC_HOST`, `META_*`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_BASE_URL`, `ORGANIC_TOKEN_ENCRYPTION_KEY`, `REDIS_URL`, `BACKGROUND_WORKERS_ENABLED`, `VOICE_SERVICE_SECRET`, `TWILIO_*`, `MAUTIC_*`, `METRICOOL_*` y `FRONTEND_URL`. Producción debe usar HTTPS para callbacks/orígenes y secretos aleatorios de al menos 32 caracteres.

## 11. Errores, cobertura y build conocidos

### 11.1 Errores de build actuales

La verificación `npm.cmd run build` en `backend/` falla actualmente en código/pruebas existentes con estos diagnósticos:

- `src/__tests__/multiTenant.test.ts`: varias llamadas con 3 argumentos donde se esperan 4.
- `src/services/automations.service.ts`: se pasa `null` a un actor requerido.
- `src/services/conversations.service.ts`: actor `string | null | undefined` incompatible.
- `src/services/meetings.service.ts`: se pasa `string` donde se espera un actor.
- `src/services/pipeline.service.ts`: propiedad `actorRole` no existe en `AuditLogInput` y una llamada tiene un argumento menos.
- `src/services/revenueIntelligence.service.ts`: se pasa `string` donde se espera un actor.

No se modificaron esos errores al generar esta documentación. Prisma se ha validado/generado en las fases Organic anteriores; la migración debe aplicarse antes de usar sus endpoints.

### 11.2 Riesgos/limitaciones de contrato

- No existe un OpenAPI/JSON Schema único generado para toda la API; el inventario está distribuido entre rutas, tipos Fastify, Zod, controladores y servicios.
- Algunos controladores usan `as any` y validación manual, por lo que el contrato de payload debe leerse junto al controlador.
- No hay handler global de errores que normalice todos los 500.
- El alcance `team` aún no representa equipos reales.
- GA4 y GBP hacen discovery en Organic, pero la sincronización de métricas no está implementada en los endpoints actuales; Search Console sí sincroniza queries.
- Los callbacks OAuth públicos dependen de `APP_URL` y secretos/configuración correctos.
- Las pruebas completas requieren `TEST_DATABASE_URL` apuntando a una base aislada; los tests no deben ejecutarse contra producción.

### 11.3 Referencias de pruebas

Pruebas relevantes en [backend/src/__tests__](../../backend/src/__tests__): `accessControl.test.ts`, `accessControlServicePolicy.test.ts`, `authorizationRoutes.test.ts`, `multiTenant.test.ts`, `organic.test.ts`, `organicGoogle.test.ts`, `automationIdempotency.test.ts`, `automationMauticBinding.test.ts` y `emailCompliance.test.ts`.

## 12. Checklist de despliegue de API

- [ ] Aplicar migraciones Prisma en staging y producción.
- [ ] Configurar secretos fuertes y no reutilizar valores de desarrollo.
- [ ] Configurar CORS/orígenes y callbacks OAuth HTTPS.
- [ ] Asegurar Redis y arrancar el worker separado.
- [ ] Verificar firmas/secrets de Meta, Mautic, Twilio y WhatsApp.
- [ ] Probar login, refresh rotation, logout y revocación de sesión.
- [ ] Ejecutar pruebas con `TEST_DATABASE_URL` aislada.
- [ ] Resolver los errores TypeScript listados antes de marcar el build backend como verde.
- [ ] Supervisar `x-correlation-id`, colas, leases, DLQ y `AutomationHealth`.
