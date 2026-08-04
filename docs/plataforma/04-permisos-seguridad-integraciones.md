# Permisos, seguridad e integraciones de la plataforma

**Estado:** auditoría documental del código existente  
**Fecha de revisión:** 22 de julio de 2026  
**Alcance:** backend de autenticación, autorización, sesiones, aislamiento multi-tenant, auditoría, rutas de proveedores, navegación frontend y `backend/.env.example`.

Este documento describe el comportamiento implementado en el repositorio. La existencia de una ruta o una variable de entorno no significa que el proveedor esté operativo: las integraciones externas requieren credenciales, APIs habilitadas, callbacks registrados y migraciones aplicadas.

## 1. Mapa de secciones de la plataforma

La navegación principal está definida en `src/components/Sidebar.jsx` y se filtra mediante `src/lib/navigationPermissions.js`. El servidor sigue siendo la fuente de verdad: el filtrado de la sidebar solo oculta enlaces y nunca sustituye los `preHandler` del backend.

| Área | Secciones visibles | Ruta principal | Capacidad de lectura habitual |
|---|---|---|---|
| General | Dashboard | `/dashboard` | `dashboard.read` |
| Captación | Campañas, Ads, Redes sociales, Prospect Finder, Landings & webs, Funnels, Organic Leads | `/campanas`, `/ads`, `/redes-sociales`, `/prospectos`, `/landings`, `/funnels`, `/organic` | `campaigns.read`, `ads.read`, `social.read`, `leads.read/write`, `funnels.read`, `organic.read` |
| Conversación | Inbox, Llamadas, Agentes IA, Playbooks, Test de Voz | `/conversacion/inbox`, `/llamadas`, `/agentes`, `/playbooks`, `/voz/test` | `conversations.read`, `calls.read`, `agents.read`, `playbooks.read` |
| Nutrición | Email marketing, Automatizaciones | `/email-marketing`, `/automatizaciones` | `campaigns.read`, `automations.read` |
| Growth | Growth Hub | `/growth` | `growth.read` |
| Ventas | Leads, Pipeline, Reuniones, Inteligencia comercial | `/leads`, `/pipeline`, `/reuniones`, `/inteligencia-comercial` | `leads.read`, `pipeline.read`, `meetings.read`, o cualquiera de `leads.read`, `experiments.read`, `memory.read` |
| Sistema | Insights, Knowledge Base, Configuración, Gobierno empresarial, Control de accesos, Recetas Ads | `/insights`, `/knowledge-base`, `/configuracion`, `/gobierno-empresarial`, `/access-control`, `/admin/ad-playbooks` | `dashboard.read`, `knowledge.read`, `organization.read`, `governance.read`, `access_control.read`, `playbooks.manage_global` |

También existen rutas protegidas de detalle, por ejemplo `/leads/:id`, `/pipeline/:id`, `/campanas/:id`, `/llamadas/:id`, `/reuniones/:id`, `/automatizaciones/:id`, `/knowledge-base/articulos/:id` y `/playbooks/:id`.

Rutas públicas intencionadas: `/login`, `/l/:slug`, `/campanas/compartir/:token`, `/privacidad` y `/terminos`. Los callbacks OAuth y webhooks de proveedores son públicos a nivel de JWT, pero disponen de controles propios de `state`, firma o secreto.

## 2. Modelo de identidad y autenticación

### Login, tokens y cookies

- `POST /api/auth/login` valida email y contraseña, con límite de 10 intentos por IP en 15 minutos.
- Las contraseñas se verifican con bcrypt; el hash se genera con coste 10.
- El access token es un JWT de 15 minutos y contiene `userId`, `orgId`, `role`, `email`, `tokenType=access` y `sessionId`.
- El refresh token es opaco, aleatorio y se entrega en la cookie HttpOnly `vozia_refresh`, con `Path=/api/auth`, `SameSite=Lax` y `Secure` en producción.
- La base de datos conserva únicamente el hash SHA-256 del refresh token, nunca el secreto en claro.
- `POST /api/auth/refresh` rota la sesión atómicamente: revoca el token anterior y crea uno nuevo. El reuso de un token ya consumido falla.
- `POST /api/auth/logout` revoca la sesión asociada y limpia la cookie.
- En frontend, el access token vive solo en memoria (`src/lib/authSession.js`); no se guarda en `localStorage`.

### Middleware de autenticación

`backend/src/middlewares/authenticate.ts` exige:

1. JWT válido.
2. `tokenType=access`.
3. `userId` y `sessionId` presentes.
4. En desarrollo y producción, sesión existente, no revocada y no expirada en `AuthSession`.

El bypass de consulta de sesión con `NODE_ENV=test` está limitado al arnés de pruebas. Debe mantenerse fuera de cualquier despliegue accesible.

### Principal de acceso

`getAccessPrincipal()` extrae exclusivamente `userId`, `orgId` y `role` del JWT verificado. Roles o permisos desconocidos se deniegan. El backend no confía en el rol, `orgId` ni el scope enviados en el body del navegador.

## 3. Roles y capacidades

El catálogo canónico está en `backend/src/access-control/catalog.ts`. Los permisos nuevos quedan denegados hasta que se añaden explícitamente a `ROLE_GRANTS`.

| Rol | Perfil | Capacidades principales | Alcance predominante |
|---|---|---|---|
| `owner` | Propietario | Todas las capacidades del catálogo, incluidas gobierno, accesos, costes e integraciones | `org` |
| `admin` | Administrador | Operación completa, usuarios, roles, organización, auditoría, integraciones y Organic; no debe aprobar su propia elevación | `org` |
| `revenue_ops` | Operaciones de revenue | Leads, campañas, automatización, experimentos, integraciones, costes solicitables, Organic y exportación sensible | `org` |
| `sales_manager` | Responsable de ventas | Lectura y gestión comercial del equipo, pipeline, tareas y aprobaciones de playbooks | Mixto: `team` para ventas; `org` para lecturas permitidas |
| `sales_rep` | Comercial | Leads, cuentas, llamadas, conversaciones, reuniones, pipeline y tareas de su cartera | `own` |
| `marketing_growth` | Marketing / Growth | Campañas, Ads, redes sociales, funnels, automatizaciones, Growth, experimentos y Organic | `org` |
| `analyst` | Analista | Lectura agregada de dashboard, campañas, Ads, social, funnels, pipeline, Growth, experimentos y Organic | `org` |
| `compliance` | Cumplimiento | Lectura, gobierno, auditoría, exportación sensible, aprobaciones de Organic e integraciones en lectura | `org` |
| `finance_controller` | Control financiero | Costes, auditoría, Ads/Growth/experimentos en lectura y aprobación de gasto | `org` |
| `guest` | Invitado | Solo resumen/dashboard | `own` |
| `agent` | Legacy | Compatibilidad operativa amplia, sin aprobaciones de gasto, playbooks globales ni elevación privilegiada | `org` |
| `viewer` | Legacy | Lectura de negocio y Organic | `org` |

### Permisos de alto nivel

El catálogo incluye, entre otros:

- Negocio: `dashboard`, `leads`, `accounts`, `calls`, `conversations`, `campaigns`, `ads`, `social`, `funnels`, `agents`, `playbooks`, `automations`, `knowledge`, `meetings`, `pipeline`, `tasks`, `growth`.
- Organic: `organic.read`, `organic.manage`, `organic.publish`, `organic.approve`, `organic.integrations.read`, `organic.integrations.manage`.
- Experimentación y memoria: `experiments.*`, `memory.*`.
- Gobierno: `governance.*`, `audit.read`, `organization.*`, `users.*`, `roles.*`.
- Integraciones y costes: `integrations.read`, `integrations.manage`, `costs.read`, `costs.request`, `costs.approve`.
- Accesos: `access_control.read`, `access_control.manage` y permisos específicos de solicitudes de elevación, experimentos pagados y cambios de playbook.
- Datos: `leads.export` y `data.export_sensitive`.

### Scopes `own`, `team` y `org`

`hasPermission()` compara la jerarquía `own < team < org`. Una concesión de alcance superior satisface una operación que pide un alcance inferior; una concesión inferior nunca satisface una operación de organización.

| Scope | Significado | Ejemplos observados |
|---|---|---|
| `own` | Registros propios o asignados al usuario | `sales_rep` en leads, pipeline, reuniones y tareas |
| `team` | Registros del equipo comercial | `sales_manager` en leads, cuentas, llamadas, conversaciones y tareas |
| `org` | Toda la organización/tenant | Integraciones, Ads, campañas, Organic, auditoría, gobierno y configuración |

El scope del permiso es solo el primer control. Los servicios deben filtrar además por `orgId` y, cuando corresponde, por propietario, asignación o equipo. Las rutas de leads, pipeline, meetings y tasks exponen guards separados para `own` y `org`.

## 4. Matriz resumida por dominio

| Dominio | Lectura | Escritura/gestión | Publicación/aprobación/coste |
|---|---|---|---|
| Leads | `leads.read` | `leads.write`, `leads.contact` | `leads.export`, `audit.read`, `costs.request` según operación |
| Campañas | `campaigns.read` | `campaigns.write` | `campaigns.publish` |
| Ads | `ads.read` | `ads.write` | `costs.request` para acciones de coste |
| Social / posts | `social.read` | `social.write` | `costs.request` para generación IA |
| Organic Leads | `organic.read` | `organic.manage` | `organic.publish`, `organic.approve` |
| Integraciones | `integrations.read` | `integrations.manage` | `costs.request` cuando la operación tiene coste |
| Email / Mautic | `campaigns.read/write` | Plantillas con `integrations.manage` | Publicación/test con `campaigns.publish` y, para test, `costs.request` |
| Automatizaciones | `automations.read` | `automations.write` | `automations.publish` |
| Experimentos | `experiments.read` | `experiments.write` | `experiments.start`, más costes cuando aplique |
| Gobierno | `governance.read` | `governance.write` | `audit.read`, consentimiento y políticas |
| Control de accesos | `access_control.read` | `access_control.manage` | Permisos específicos de aprobación de solicitudes |

## 5. Autorización de rutas

`requirePermission()` y `requireAnyPermission()` son los guards preferidos. Verifican el principal JWT, el permiso, el scope requerido y, si la ruta lo expone, que el `resourceOrgId` coincida con el `orgId` del token.

Los principales prefijos están registrados en `backend/src/index.ts`:

| Prefijo | Área | Protección destacada |
|---|---|---|
| `/api/auth` | Sesiones | Login limitado; refresh público con cookie; logout autenticado |
| `/api/dashboard` | Dashboard | `dashboard.read` org |
| `/api/leads` | Leads | Lectura/escritura/exportación own u org; auditoría y costes según endpoint |
| `/api/campaigns`, `/api/marketing-campaigns` | Campañas | `campaigns.read/write/publish` |
| `/api/ads` | Ads | `ads.read/write` y `costs.request` |
| `/api/meta/accounts` | Meta Ads | `integrations.read/manage`; presupuesto con `costs.request` |
| `/api/metricool` | Redes sociales | `integrations.read/manage`, `social.read/write`, generación IA con `costs.request` |
| `/api/mautic` | Email marketing | Campañas y plantillas con `campaigns.*` e `integrations.*` |
| `/api/webhooks/mautic` | Webhook Mautic | Secreto de webhook, sin JWT |
| `/api/meta/webhooks` | Webhook Meta | Verify token y firma `X-Hub-Signature-256`, sin JWT |
| `/api/organic` | Organic Leads | `organic.read/manage` e integraciones separadas |
| `/api/access-control` | RBAC | `access_control.*` y permisos de aprobación |
| `/api/settings` | Configuración | `organization.read/manage` e `integrations.read` |

Hay un middleware legacy `authorize.ts` con `MUTATING_ROLES = ['admin', 'agent']`. La matriz moderna usa capacidades y scopes; debe evitarse introducir nuevas rutas basadas solo en roles.

## 6. Aislamiento multi-tenant

El tenant es la organización identificada por `orgId` en el JWT. El patrón esperado en controllers y servicios es:

1. Autenticar el JWT.
2. Obtener `orgId` del principal verificado.
3. Aplicar permiso y scope.
4. Consultar o mutar con `where: { ..., orgId }`.
5. Auditar la mutación con `orgId` y actor.

Controles específicos observados:

- Leads, cuentas, campañas, pipeline, reuniones, tareas, Organic y recursos de proveedores incluyen `orgId` en las consultas.
- Meta usa una clave única por organización y cuenta publicitaria: `orgId_metaAdAccountId`.
- Organic tiene proyecto único por organización e integraciones únicas por `orgId`, proyecto y proveedor.
- Mautic es una instancia compartida: los contactos llevan el tag `org-<orgId>`, las campañas el prefijo `[org:<orgId>]` y los bindings locales exigen `orgId`.
- La correlación Mautic usa `crmleadid` y evita asociar eventos por email o por el último envío.
- Las plantillas Mautic se reclaman explícitamente mediante `MauticAssetBinding`; el envío comprueba que la plantilla pertenece al tenant.
- OAuth state de Meta y Google guarda `orgId`, proyecto/proveedor cuando aplica, estado hashado, expiración y consumo único.

Riesgo residual: el aislamiento depende de que cada nuevo servicio conserve el filtro `orgId`; el compilador no lo impone automáticamente. Las pruebas multi-tenant y de autorización deben mantenerse como requisito de cada nueva ruta.

## 7. Auditoría y trazabilidad

`backend/src/lib/audit.ts` escribe `AuditLog` con:

- `orgId`.
- Actor (`actorUserId` y `actorType=user|system`).
- Acción.
- Tipo e ID de entidad.
- Estado anterior y posterior cuando están disponibles.
- `correlationId` opcional.
- Fecha de creación e índices por organización/entidad y organización/fecha.

Se usa en mutaciones sensibles de cuentas, leads, campañas, pipeline, reuniones, tareas, automatizaciones, Growth, Revenue Intelligence, Organic, OAuth Google y reclamación de plantillas Mautic. El control de accesos registra decisiones y cambios en transacciones propias.

La auditoría general es **best effort**: si falla, registra el error en servidor y no bloquea la mutación. Esto evita perder operaciones por una incidencia de logging, pero es un riesgo de cumplimiento para acciones que deberían ser no repudiables. Las decisiones futuras de seguridad deben separar eventos críticos, cuya auditoría debería ser transaccional, de eventos operativos.

La auditoría no sustituye `AcquisitionEvent`, `AutomationRun`, entregas de email ni eventos de webhook: esos registros pertenecen al dominio funcional y a la atribución.

## 8. Gestión de secretos y configuración

### Variables generales

| Variable | Uso | Requisito |
|---|---|---|
| `DATABASE_URL` | PostgreSQL de la aplicación | Obligatoria |
| `TEST_DATABASE_URL` | Base aislada de pruebas | Obligatoria para tests de integración |
| `REDIS_URL` | Redis | Necesaria si el proceso la utiliza |
| `JWT_SECRET` | Firma JWT | Secreto aleatorio >=32 caracteres |
| `OAUTH_STATE_SECRET` | Cifrado/verificación de estados OAuth de Meta | Distinto de JWT y >=32 caracteres |
| `CORS_ORIGINS` | Allowlist de orígenes | Lista explícita separada por comas; sin comodines |
| `APP_URL` | URL pública de aplicación y redirecciones | Obligatoria en producción |
| `PORT` / `TRUST_PROXY` | Escucha y proxy | Revisar según infraestructura |
| `REDIS_URL`, `S3_*` | Cache y almacenamiento | Condicionales por módulo |
| `OPENAI_API_KEY`, `CLAUDE_API_KEY` | Generación IA | Condicionales; no deben exponerse al frontend |

### Voz y archivos

`VOICE_SERVICE_URL`, `VOICE_SERVICE_SECRET`, `VOICE_STREAM_SECRET`, límites de concurrencia/duración y `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT` controlan voz, Media Streams y almacenamiento. `VOICE_STREAM_SECRET` puede caer al token de Twilio si se omite, pero en producción se recomienda un secreto independiente y rotado.

### Meta

| Variable | Uso |
|---|---|
| `META_APP_ID`, `META_APP_SECRET` | App OAuth de Meta |
| `META_OAUTH_REDIRECT_URI` | Callback exacto `/api/meta/accounts/oauth/callback` |
| `META_GRAPH_API_VERSION` | Versión Graph; por defecto `v23.0` |
| `META_TOKEN_ENCRYPTION_KEY` | Cifrado AES-256-GCM del token Meta |
| `META_WEBHOOK_VERIFY_TOKEN` | Verificación inicial del webhook Lead Ads |

La URL de callback exige HTTPS en producción. El estado OAuth de Meta es opaco, hashado, de un solo uso y expira a los 10 minutos; el verifier PKCE se cifra usando `OAUTH_STATE_SECRET`.

### Organic / Google

| Variable | Uso |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Credenciales OAuth Web de Google |
| `GOOGLE_OAUTH_REDIRECT_BASE_URL` | Origen público del backend para callbacks por proveedor |
| `ORGANIC_TOKEN_ENCRYPTION_KEY` | Cifrado independiente de access/refresh tokens y verifier PKCE |

Las claves Organic no deben reutilizar `JWT_SECRET`, `OAUTH_STATE_SECRET` ni `META_TOKEN_ENCRYPTION_KEY`. El backend cifra tokens con AES-256-GCM, conserva scopes/expiración, renueva access tokens y revoca refresh tokens al desconectar.

### Mautic y Metricool

| Proveedor | Variables | Modelo de credencial |
|---|---|---|
| Mautic | `MAUTIC_BASE_URL`, `MAUTIC_CLIENT_ID`, `MAUTIC_CLIENT_SECRET`, `MAUTIC_WEBHOOK_SECRET` | Client credentials; access token cacheado en memoria; webhook con header Bearer/header dedicado o query legacy |
| Metricool | `METRICOOL_BASE_URL`, `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID`, `METRICOOL_TIMEZONE`, `METRICOOL_APP_URL` | Token de usuario y marca configurados en entorno; API avanzada/custom |

Nunca deben registrarse tokens, client secrets, cookies, cabeceras de autorización ni cuerpos con secretos en logs o `AuditLog`.

## 9. Integraciones configuradas

### Meta Ads y Lead Ads

**Rutas:** `/api/meta/accounts` y `/api/meta/webhooks`.

- OAuth server-side con PKCE, estado de un solo uso y token long-lived.
- Scopes solicitados: `ads_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `leads_retrieval` y `business_management`.
- Tras OAuth se selecciona automáticamente la primera cuenta publicitaria y la primera página disponibles.
- El token se cifra en `MetaAdAccount.systemUserTokenEnc` mediante AES-256-GCM.
- Hay estado, desconexión, pixel ID y límite de presupuesto diario.
- El presupuesto exige `costs.request`; las operaciones de integración exigen `integrations.manage`.
- El webhook Lead Ads valida el verify token en GET y `X-Hub-Signature-256` en POST usando el cuerpo crudo.

**Pendientes/riesgos:** la selección automática de la primera cuenta/página no ofrece todavía selección explícita; el nombre `systemUserTokenEnc` puede inducir a pensar que es un System User aunque el flujo actual usa un token long-lived de usuario; la revocación marca la cuenta como `revoked`, pero debe verificarse la revocación remota del token.

### Metricool: redes sociales

**Rutas:** `/api/metricool`.

- `GET /` devuelve estado y perfiles.
- `POST /connect` valida configuración y que Metricool devuelva perfiles.
- `GET /analytics` consulta analítica por red.
- `POST /posts` crea borradores por plataforma, con landing atribuida y UTM `organic_social`.
- `POST /ai/generate` genera planes con `social.write` y `costs.request`.
- Requiere plan completo y `organization.metricoolEnabled`.
- La API utiliza `X-Mc-Auth`, `userId` y `blogId`; no hay OAuth por tenant.

**Pendientes/riesgos:** las credenciales son globales de entorno, no un secreto/token por organización; el endpoint de la API avanzada/custom debe verificarse contra el contrato de la cuenta; `METRICOOL_BLOG_ID` identifica una marca fija.

### Mautic: email marketing

**Rutas:** `/api/mautic` y `/api/webhooks/mautic`.

- Requiere plan completo y `mauticEnabled`.
- Usa OAuth client credentials contra `/oauth/v2/token`, con timeout de 10 segundos y un retry solo para lecturas.
- Sincroniza contactos CRM a Mautic mediante `crmleadid` y tag `org-<orgId>`.
- Prefija campañas con `[org:<orgId>]` para distinguir recursos.
- Permite listar/crear campañas, listar plantillas, reclamar plantillas, enviar test, programar, pausar y consultar estadísticas.
- Reclamar plantillas genera `AuditLog` y evita vincular una plantilla que pertenezca a otra organización.
- El envío de prueba pasa por consentimiento y bloquea unsubscribe/bounce mediante `ContactConsent`.
- El webhook acepta `X-Mautic-Webhook-Secret`, Bearer o query `secret` legacy, y registra eventos idempotentes.

**Pendientes/riesgos:** el secreto por query puede terminar en historial, proxies y logs; debe retirarse después de migrar clientes. El token se cachea globalmente en memoria, adecuado para una instancia Mautic compartida pero no para credenciales distintas por tenant. Hay que monitorizar expiración, rotación y errores de sincronización.

### Organic Leads: Search Console, GA4 y Google Business Profile

**Rutas:** `/api/organic`.

- Proyecto y datos: `GET /overview`, `GET /project`, `POST /project`, `PATCH /project`, `POST /assets`, acciones por oportunidad.
- Integraciones: estado, inicio OAuth, callback, discovery, selección de recurso, desconexión y sincronización Search Console.
- Proveedores soportados: `search_console`, `ga4`, `google_business_profile`.
- Scopes Google:
  - Search Console: `https://www.googleapis.com/auth/webmasters.readonly`.
  - GA4: `https://www.googleapis.com/auth/analytics.readonly`.
  - GBP: `https://www.googleapis.com/auth/business.manage`.
- El callback se autentica por estado hashado de un solo uso y PKCE; no necesita JWT porque llega redirigido desde Google.
- Search Console descubre propiedades reales y sincroniza queries con fechas y límite validado.
- GA4 y GBP hacen discovery de cuentas/propiedades/ubicaciones; no deben presentar métricas hasta implementar sincronización real.
- Los recursos descubiertos se guardan para que la selección posterior solo acepte IDs procedentes del discovery.
- Las mutaciones de proyecto, activos, acciones, conexión, selección, desconexión y sync escriben auditoría.

**Permisos:** lectura del módulo con `organic.read`; gestión de proyecto/activos con `organic.manage`; publicación/aprobación separadas; lectura de integraciones con `organic.integrations.read`; OAuth, selección, desconexión y sync con `organic.integrations.manage`.

**Pendientes:** aplicar las migraciones Organic; configurar Google Cloud y callbacks por proveedor; conectar el frontend a selección de propiedad y endpoints de discovery/resource; implementar sincronización de GA4 y GBP; definir retención y borrado de datos importados.

## 10. Seguridad de webhooks y callbacks

| Entrada | JWT | Control alternativo |
|---|---|---|
| Meta OAuth callback | No | `state` hashado, PKCE, expiración y consumo único |
| Organic Google callback | No | `state` hashado, PKCE, expiración y consumo único |
| Meta Lead Ads webhook | No | verify token + firma HMAC `X-Hub-Signature-256` sobre cuerpo crudo |
| Mautic webhook | No | secreto constante en tiempo y tag/ownership del lead |
| Resto de API privada | Sí | JWT + sesión activa + permiso/scope |

Se debe mantener la regla de que los callbacks públicos no busquen la organización por parámetros confiados del navegador: el tenant debe salir del estado persistido y validado o del recurso asociado.

## 11. Riesgos y pendientes priorizados

### P0 — antes de producción

1. Configurar secretos reales y distintos; eliminar valores de ejemplo y revisar que `backend/.env` no entre en control de versiones.
2. Aplicar y verificar todas las migraciones de sesiones, Meta y Organic en staging.
3. Ejecutar pruebas de aislamiento cross-tenant para cada proveedor, especialmente Mautic compartido.
4. Confirmar HTTPS, CORS allowlist, `APP_URL`, `PUBLIC_HOST` y todos los callbacks OAuth.
5. Verificar firmas de webhook con cuerpos reales y protección contra replay/idempotencia.
6. Definir qué eventos requieren auditoría transaccional; actualmente el logger general no bloquea la mutación si falla.

### P1 — endurecimiento y operación

1. Sustituir `authorize()` legacy por permisos/capacidades en cualquier ruta que aún lo use.
2. Alinear fallbacks de `src/lib/navigationPermissions.js` con `ROLE_GRANTS`; la UI puede mostrar una sección distinta del backend cuando el usuario no trae permisos explícitos.
3. Implementar selección explícita de cuenta/página Meta en lugar de escoger la primera.
4. Eliminar el secreto Mautic por query y usar exclusivamente header/Bearer.
5. Añadir rotación, versionado y procedimiento de recuperación para claves de cifrado.
6. Añadir límites, timeouts, circuit breaker y métricas por proveedor, organización y endpoint.

### P2 — producto y gobernanza

1. Completar sincronización de GA4 y GBP y documentar el modelo de frescura de datos.
2. Definir retención, exportación y borrado de tokens, discovery, queries y eventos importados.
3. Exponer en Control de accesos los scopes efectivos, no solo el rol nominal.
4. Añadir alertas de refresh token fallido, webhook inválido, discovery vacío y drift de permisos.
5. Ejecutar tests de integración con `TEST_DATABASE_URL` y pruebas contra sandbox/staging de cada proveedor.

## 12. Fuentes revisadas

- `backend/src/access-control/catalog.ts`, `permissions.ts`, `requirePermission.ts` e `index.ts`.
- `backend/src/middlewares/authenticate.ts`, `authorize.ts` y `src/lib/authSession.js`.
- `backend/src/routes/auth.ts`, `metaAccounts.ts`, `metaWebhooks.ts`, `metricool.ts`, `mautic.ts`, `mauticWebhooks.ts`, `organic.ts` y `accessControl.ts`.
- Controllers y servicios de Meta, Metricool, Mautic y Organic Google.
- `backend/src/lib/audit.ts`, `securityConfig.ts`, `tokenCrypto.ts`, `organicTokenCrypto.ts`.
- `src/lib/navigationPermissions.js`, `src/components/Sidebar.jsx`, `src/App.jsx`.
- `backend/.env.example` y modelos relevantes de `backend/prisma/schema.prisma`.

