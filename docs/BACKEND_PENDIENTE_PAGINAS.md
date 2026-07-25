# Backend pendiente para las páginas sin conexión real

Documento de trabajo para conectar las páginas que todavía usan datos demo, estado local o una conexión parcial con el backend.

## Estado general

La aplicación ya cuenta con API, autenticación JWT, Prisma/PostgreSQL y varias rutas funcionales. El problema principal no es la ausencia total de backend, sino que algunas páginas no consumen las rutas existentes o solo persisten los cambios en memoria/localStorage.

### Prioridad alta

| Página | Ruta | Estado actual | Trabajo principal |
| --- | --- | --- | --- |
| Campañas | `/campanas` | Sin backend real | Conectar listado, creación, filtros, activación y métricas con `/api/campaigns`. |
| Redes sociales | `/redes-sociales` | Sin backend real | Conectar cuentas, calendario, publicaciones, Postiz y generación IA. |
| Configuración | `/configuracion` | Solo lectura parcial | Crear persistencia de perfil, organización, preferencias e integraciones. |

### Prioridad media

| Página | Ruta | Estado actual | Trabajo principal |
| --- | --- | --- | --- |
| Detalle de campaña | `/campanas/:id` | Lectura parcial | Eliminar datos demo y persistir edición, estado, tareas y acciones. |
| Detalle de llamada | `/llamadas/:id` | Lectura real con fallback demo | Persistir notas, favoritos, tareas, seguimiento e insights reales. |
| Detalle de agente | `/agentes/:id` | Lectura real, edición local | Conectar configuración y playbooks al `PUT /api/agents/:id`. |
| Email marketing | `/email-marketing` | Solo overview de Mautic | Añadir campañas, plantillas, envíos y programación. |
| Detalle de oportunidad | `/pipeline/:id` | Solo lectura | Conectar edición de etapa, valor, probabilidad y propietario. |
| Artículo de conocimiento | `/knowledge-base/articulos/:id` | Lectura real, interacción local | Añadir edición, favoritos y reacciones persistentes. |

## 1. Campañas

Archivo frontend: `src/components/Campaigns.jsx`

### Problema actual

- La pantalla inicial usa `INITIAL_CAMPAIGNS` con IDs `demo-*`.
- Crear campaña solo añade un objeto al estado React.
- Activar/pausar solo modifica el estado local.
- Las métricas, actividad, funnel y recomendaciones son estáticas.
- El backend ya tiene rutas en `backend/src/routes/campaigns.ts`, pero esta página no las consume.

### Backend a conectar

Reutilizar las rutas existentes:

- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/campaigns/:id`
- `PUT /api/campaigns/:id`
- `POST /api/campaigns/:id/start`
- `POST /api/campaigns/:id/pause`
- `GET /api/campaigns/:id/stats`

Ampliar el listado con filtros de servidor:

```text
GET /api/campaigns?page=1&limit=24&status=active&type=ads&ownerId=...&search=...
```

El backend debe devolver datos normalizados para la UI:

```json
{
  "items": [],
  "page": 1,
  "limit": 24,
  "total": 0,
  "totalPages": 0
}
```

Añadir, si se quieren conservar las tarjetas actuales:

- `GET /api/campaigns/summary`
- `GET /api/campaigns/activity`
- `GET /api/campaigns/:id/actions`
- `POST /api/campaigns/:id/actions`

Las métricas del hero no deben estar hardcodeadas. Deben calcularse a partir de `Campaign`, `Lead`, `Call`, `Meeting` y `AdInsightSnapshot`.

## 2. Redes sociales

Archivo frontend: `src/pages/ConectarRedesPage.jsx`

### Problema actual

- Usa `DEMO_ACCOUNTS` y `DEMO_EVENTS`.
- Cuentas y publicaciones se guardan en `localStorage`.
- El copiloto genera planes de contenido dentro del navegador.
- El backend tiene rutas de Postiz, pero la página no las utiliza.

### Modelos recomendados

Si Postiz es la fuente principal, guardar únicamente la relación con el workspace externo:

```text
SocialConnection
- id
- orgId
- platform
- externalAccountId
- accountName
- handle
- status
- accessTokenEncrypted
- refreshTokenEncrypted
- tokenExpiresAt
- createdAt
- updatedAt
```

Para el calendario editorial y borradores internos:

```text
SocialPost
- id
- orgId
- connectionId
- title
- body
- mediaUrls Json?
- platform
- status: draft | scheduled | published | failed
- scheduledAt
- externalPostId
- errorMessage
- createdAt
- updatedAt
```

Los tokens deben almacenarse cifrados, nunca en texto plano ni en el navegador.

### Endpoints necesarios

Conectar los existentes:

- `GET /api/postiz`
- `POST /api/postiz/connect`
- `GET /api/postiz/analytics`
- `POST /api/postiz/posts`

Añadir rutas para la experiencia de calendario:

- `GET /api/social/connections`
- `DELETE /api/social/connections/:id`
- `GET /api/social/posts?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/social/posts`
- `PUT /api/social/posts/:id`
- `DELETE /api/social/posts/:id`
- `POST /api/social/posts/:id/publish`

### IA de contenido

Crear un endpoint backend para reemplazar `createAiPlan()` del frontend:

```text
POST /api/social/ai/generate
```

Entrada:

```json
{
  "mode": "campaign",
  "prompt": "Presenta el nuevo servicio",
  "channels": ["instagram", "linkedin"],
  "tone": "cercano",
  "startDate": "2026-07-13"
}
```

Salida:

```json
{
  "title": "Campaña de contenido",
  "summary": "...",
  "posts": []
}
```

La generación debe ejecutarse en backend para proteger las claves de IA y permitir auditoría, límites de uso y reintentos.

## 3. Configuración

Archivo frontend: `src/components/Configuracion.jsx`

### Problema actual

La página consulta estadísticas y cantidad de agentes, pero los toggles, preferencias y formularios no tienen persistencia real.

### Modelos recomendados

Añadir preferencias por usuario:

```text
UserPreference
- id
- userId unique
- locale
- timezone
- emailNotifications
- desktopNotifications
- weeklyDigest
- theme
- createdAt
- updatedAt
```

Los datos de organización pueden vivir en `Organization` o en un modelo separado `OrganizationSetting`.

### Endpoints necesarios

- `GET /api/settings/me`
- `PUT /api/settings/me`
- `PUT /api/settings/password`
- `GET /api/settings/organization`
- `PUT /api/settings/organization`
- `GET /api/settings/integrations`

Validar permisos: un `viewer` no debe modificar organización, integraciones ni credenciales.

## 4. Detalle de campaña

Archivo frontend: `src/pages/CampaignDetailPage.jsx`

### Problema actual

- Para IDs `demo-*` evita la llamada al backend.
- Editar, pausar, duplicar, compartir y cambiar toggles son acciones locales.
- La pantalla principal crea campañas con IDs `local-*`, por lo que no se pueden consultar después desde backend.

### Trabajo requerido

- Eliminar `DEMO_DETAILS` como fuente de producción.
- Después de crear una campaña, usar el ID real devuelto por `POST /api/campaigns`.
- Conectar edición con `PUT /api/campaigns/:id`.
- Conectar activar/pausar con `/start` y `/pause`.
- Añadir:

```text
POST /api/campaigns/:id/duplicate
GET  /api/campaigns/:id/activity
POST /api/campaigns/:id/share-link
```

Los toggles de configuración deben guardarse en `Campaign.settings Json` o en un modelo `CampaignSetting`.

## 5. Detalle de llamada

Archivo frontend: `src/pages/CallDetailPage.jsx`

### Conectado actualmente

La llamada se consulta mediante `GET /api/calls/:id`.

### Pendiente

- El fallback `DEMO_CALLS` debe usarse solo en desarrollo.
- Insights, momentos clave, sentimiento y resumen deben salir de `Call.summary`, `Call.sentiment`, `Call.sentimentScore` y datos derivados de la transcripción.
- Las notas se guardan ahora en localStorage.
- Favoritos y tareas también son locales.

Endpoints recomendados:

- `GET /api/calls/:id/insights`
- `GET /api/calls/:id/notes`
- `POST /api/calls/:id/notes`
- `PUT /api/calls/:id/notes/:noteId`
- `DELETE /api/calls/:id/notes/:noteId`
- `POST /api/calls/:id/favorite`
- `GET /api/calls/:id/tasks`
- `POST /api/calls/:id/tasks`
- `PUT /api/calls/:id/tasks/:taskId`

Se puede reutilizar `LeadNote` si las notas deben pertenecer al lead, pero la API debe exponerlas desde el contexto de la llamada.

## 6. Detalle de agente

Archivo frontend: `src/pages/AgentDetailPage.jsx`

### Conectado actualmente

- `GET /api/agents/:id`
- `GET /api/agents/:id/stats`

### Pendiente

- Conectar el toggle activo/inactivo con `PUT /api/agents/:id` o `DELETE /api/agents/:id`.
- Persistir personalidad, idioma, prompt, voz y configuración del agente.
- Cargar playbooks reales desde `/api/playbooks` en lugar de arrays estáticos.
- Guardar la selección de playbook y versión activa.

## 7. Email marketing

Archivo frontend: `src/pages/EmailMarketingPage.jsx`

### Conectado actualmente

`GET /api/mautic` devuelve el overview de contactos, aperturas, clics y actividad.

### Pendiente

El botón “Nueva campaña” todavía muestra un aviso local. Para completar la página:

- `GET /api/mautic/campaigns`
- `POST /api/mautic/campaigns`
- `GET /api/mautic/templates`
- `POST /api/mautic/campaigns/:id/send-test`
- `POST /api/mautic/campaigns/:id/schedule`
- `POST /api/mautic/campaigns/:id/pause`
- `GET /api/mautic/campaigns/:id/stats`

El envío real debe ir a una cola BullMQ para evitar bloquear la petición HTTP. Los webhooks de Mautic deben actualizar el estado de entregas, aperturas y clics.

## 8. Pipeline y oportunidades

Archivo frontend: `src/pages/OpportunityDetailPage.jsx`

### Conectado actualmente

La página lee mediante `GET /api/pipeline/:id`.

### Pendiente

Conectar los cambios de la interfaz con:

- `PUT /api/pipeline/:id`

Campos mínimos:

```json
{
  "name": "Nueva oportunidad",
  "stage": "qualified",
  "value": 12000,
  "probability": 60,
  "assignedTo": "user-id",
  "notes": "..."
}
```

## 9. Base de conocimiento

Archivo frontend: `src/pages/ArticleDetailPage.jsx`

### Conectado actualmente

La página consulta el artículo mediante `GET /api/knowledge/:id`.

### Pendiente

- Añadir `PUT /api/knowledge/:id` para editar contenido.
- Añadir `POST /api/knowledge/:id/favorite` si los favoritos deben compartirse por usuario.
- Añadir `POST /api/knowledge/:id/reaction` si se quieren persistir likes o feedback.
- Sustituir acciones locales de favorito/like por estos endpoints.

## 10. Dashboard, Insights y llamadas

Estas páginas sí tienen conexión principal, pero muestran bloques estáticos en algunas zonas:

- `Dashboard.jsx` consume `/api/dashboard/stats`, pero algunos gráficos y tarjetas deben derivarse completamente del backend.
- `Insights.jsx` usa estadísticas y fallback demo cuando falla la API.
- `Calls.jsx` consume el listado real, pero el panel lateral, acciones masivas y algunas señales son locales.
- `Playbooks.jsx` y `Automatizaciones.jsx` tienen conexión principal, aunque deben eliminar fallbacks demo en producción.

Endpoints agregados recomendados:

- `GET /api/dashboard/charts?range=30d`
- `GET /api/dashboard/activity?limit=20`
- `GET /api/calls/insights?range=30d`
- `POST /api/calls/bulk-actions`

## 11. Voz

`/voz/test` sí conecta con backend mediante WebSocket:

```text
/voice-sim/live
```

No debe considerarse una página sin backend. Sí queda pendiente validar que la URL de desarrollo y producción se configuren mediante variables de entorno y que las sesiones se persistan si se necesita historial.

## Reglas técnicas comunes

Todas las nuevas rutas deben cumplir:

1. Autenticación JWT mediante `authenticate`.
2. Aislamiento por `orgId` obtenido del token, nunca enviado por el cliente.
3. Validación con Zod o schemas Fastify.
4. Paginación para listados.
5. Índices para campos consultados por `orgId`, `status`, `createdAt` y relaciones.
6. Errores HTTP consistentes: `400` validación, `401` sesión, `403` permisos, `404` recurso inexistente.
7. No devolver tokens, secretos ni credenciales de proveedores.
8. No usar datos `DEMO_*` como fallback en producción salvo que se muestre explícitamente un estado de demo.
9. Registrar errores de proveedores externos sin incluir datos sensibles.
10. Cubrir cada endpoint con al menos una prueba de autorización, validación y aislamiento entre organizaciones.

## Orden recomendado de implementación

### Fase 1 — núcleo comercial

1. Conectar `/campanas` a `Campaign` real.
2. Corregir `/campanas/:id` para no saltarse la API en IDs demo.
3. Persistir estados, configuración y acciones de campaña.

### Fase 2 — redes y contenido

1. Modelar conexiones sociales.
2. Conectar Postiz.
3. Persistir calendario editorial.
4. Mover el copiloto social al backend.

### Fase 3 — operación y configuración

1. Crear settings de usuario y organización.
2. Completar detalle de llamadas y agentes.
3. Persistir pipeline, favoritos, tareas y notas.

### Fase 4 — email y analítica

1. Completar campañas Mautic.
2. Añadir colas de envío.
3. Reemplazar gráficos estáticos por agregaciones reales.

## Criterios de finalización

Una página se considera conectada cuando:

- Carga sus datos desde API autenticada.
- No necesita arrays `DEMO_*` para funcionar.
- Crear, editar, eliminar y cambiar estados persiste en base de datos.
- Al recargar la página se conserva el estado.
- Los datos pertenecen únicamente a la organización del usuario.
- Los errores de API muestran estados de error y reintento, no datos demo silenciosos.
- Existe una prueba mínima del flujo principal.

---

## Estado de implementación (2026-07-12)

Antes de repartir trabajo se auditó el estado real del código contra este documento (algunas partes estaban desactualizadas: `Pipeline` ya tenía `PUT` funcionando, y la sección 2 recomendaba modelos propios `SocialConnection`/`SocialPost` que contradicen la arquitectura ya decidida en `PLAN_IMPLEMENTACION_POSTIZ_MAUTIC.md` — instancia Postiz/Mautic self-hosted embebida vía iframe, sin tokens propios). Lo que sigue documenta lo que se implementó realmente, no lo que este doc pedía originalmente cuando difiere.

### Cambios de schema (Prisma, aplicados con `prisma db push` + `generate` contra Neon)

Archivo: `backend/prisma/schema.prisma`

- `Organization`: + `email`, `website`, `phone`, `industry`, `timezone`, `address`, `currency`.
- `Campaign`: + `budgetCents`, `goal`, `settings Json?`, `shareToken String? @unique`.
- `Call`: + `isFavorite Boolean`, relaciones inversas `notes`/`tasks`.
- `Agent`: + `settings Json?` (límites operativos, horario, playbook activo).
- `LeadNote`: + `callId String?` opcional (reusado para notas de llamada, en vez de un modelo `CallNote` nuevo).
- Modelo nuevo `UserPreference` (1:1 con `User`: locale, timezone, notificaciones, tema).
- Modelo nuevo `CallTask` (checklist de seguimiento por llamada).
- Modelo nuevo `KnowledgeFavorite` (favorito/"útil" por usuario y artículo, `type: 'favorite'|'helpful'`).
- **Descartado a propósito:** `SocialConnection`/`SocialPost` — contradice la arquitectura de Postiz ya implementada.

### 1–4. Campañas y detalle de campaña

Archivos tocados:
- `src/components/Campaigns.jsx`, `src/pages/CampaignDetailPage.jsx`
- `backend/src/services/campaigns.service.ts`, `backend/src/controllers/campaigns.controller.ts`, `backend/src/routes/campaigns.ts`
- Nuevo: `backend/src/routes/campaignShare.ts` (público, sin `authenticate`)

Hecho: `DEMO_DETAILS`/`INITIAL_CAMPAIGNS` eliminados por completo; listado con paginación/filtros de servidor (`?page&limit&status&search`); creación/activar/pausar reales; `POST /:id/duplicate`, `GET /:id/activity`, `POST /:id/share-link` + `GET /api/public/campaigns/:token` (registrado en `index.ts`); toggles de configuración persisten en `Campaign.settings`; presupuesto/objetivo en `budgetCents`/`goal`.

Omitido/oculto (sin dato real que lo respalde, no inventado): tipo de campaña (heurística desde `adPlaybookId`/`metaCampaignId`), avatares de "owner" falsos, tarjetas de ROI/tendencias/funnel que no derivaban de nada real, tabs Audiencia/Conversaciones/Contenido/Automatización del detalle (marcadas como preview, sin endpoint pedido). Tareas de campaña siguen locales (`// ponytail:`, no pedidas para esta sección).

### 2. Redes sociales

Archivos tocados: `src/pages/ConectarRedesPage.jsx`, `src/pages/social.css`, `backend/src/services/assetGenerator.service.ts`, `backend/src/controllers/postiz.controller.ts`, `backend/src/routes/postiz.ts`.

Hecho: página reescrita sobre los endpoints reales de Postiz (`GET /`, `POST /connect`, `GET /analytics`, `POST /posts`) con el mismo patrón de gating por plan que `EmailMarketingPage`; calendario propio y `localStorage` eliminados (Postiz aporta su propio calendario vía iframe embebido); nuevo `POST /api/postiz/ai/generate` (copiloto de contenido movido al backend, mismo patrón LLM que `generateFallbackAssets`).

### 3 y 8. Configuración y Pipeline (detalle de oportunidad)

Archivos nuevos: `backend/src/routes/settings.ts`, `backend/src/controllers/settings.controller.ts`, `backend/src/services/settings.service.ts` (registrado en `index.ts` bajo `/api/settings`).
Archivos tocados: `src/components/Configuracion.jsx`, `src/pages/OpportunityDetailPage.jsx`.

Hecho: `GET/PUT /api/settings/me`, `PUT /api/settings/password`, `GET/PUT /api/settings/organization` (403 para `viewer`), `GET /api/settings/integrations`; formulario de Configuración totalmente controlado y conectado. Pipeline: el backend (`PUT /api/pipeline/:id`) ya existía — se conectó el frontend (modal de edición real, con el mapeo inverso español→enum `OpportunityStage`).

### 5–6. Detalle de llamada y detalle de agente

Archivos tocados: `backend/src/routes/calls.ts`, `backend/src/controllers/calls.controller.ts`, `backend/src/services/calls.service.ts`, `src/pages/CallDetailPage.jsx`, `src/pages/AgentDetailPage.jsx`.

Hecho: notas (`GET/POST/PUT/DELETE /:id/notes*`, reusando `LeadNote`), favorito (`POST /:id/favorite`), tareas (`GET/POST/PUT /:id/tasks*`), `POST /api/calls/bulk-actions` (`follow_up`/`priority`); agente: toggle activo, configuración (personalidad/idioma/prompt/voz + límites/horario en `Agent.settings`) y playbooks reales (`GET /api/playbooks`) conectados a `PUT /api/agents/:id`.

Omitido a propósito: segmentación de `Call.transcript` en "momentos clave" reales (requiere NLP, fuera de alcance — comentario `// ponytail:` dejado en el código).

### 7. Email marketing

Archivos tocados: `backend/src/services/mauticSync.service.ts`, `backend/src/controllers/mautic.controller.ts`, `backend/src/routes/mautic.ts`, `src/pages/EmailMarketingPage.jsx`, `src/pages/email.css`.

Hecho: `GET/POST /api/mautic/campaigns`, `GET /api/mautic/templates`, `POST /api/mautic/campaigns/:id/send-test|schedule|pause`, `GET /api/mautic/campaigns/:id/stats` (proxies a la API de Mautic, mismo patrón defensivo que el resto del código); "Nueva campaña" ahora crea de verdad. Nota: paths exactos de Mautic sin verificar contra un despliegue real (mismo disclaimer que ya existía para Postiz).

### 9–10. Base de conocimiento, Dashboard y Calls

Archivos tocados: `backend/src/routes/knowledge.ts`, `backend/src/controllers/knowledge.controller.ts`, `backend/src/services/knowledge.service.ts`, `backend/src/services/dashboard.service.ts`, `src/pages/ArticleDetailPage.jsx`, `src/components/Dashboard.jsx`, `src/components/Calls.jsx`.

Hecho: `PUT /api/knowledge/:id`, `POST /:id/favorite`, `POST /:id/reaction`; "artículos relacionados" filtrando `GET /api/knowledge` en cliente (sin endpoint nuevo); ROI real en `dashboard.service.ts` (`closedWonValue / adSpend`, `null` si no hay gasto, ya no hardcodeado `4,8x`); `Calls.jsx` conectado a `bulk-actions`. De regalo: se corrigió un crash preexistente en `ArticleDetailPage.jsx` (`IconEl` no definido al cargar un artículo real).

Omitido a propósito: panel "Rendimiento de hoy"/"Próximas acciones" de `Calls.jsx` (ilustrativo, sin fuente de datos barata — comentario `// ponytail:` dejado en el código).

### 11. Voz

Sin cambios — ya conectaba de verdad por WebSocket, según lo confirmado en la auditoría inicial.

### Integración final

- `backend/src/index.ts`: registradas las dos rutas nuevas — `campaignShareRoutes` (`/api/public/campaigns`) y `settingsRoutes` (`/api/settings`).
- Verificado: `npx tsc --noEmit` (backend) y `npx vite build` (frontend) limpios tras integrar los 6 frentes de trabajo en paralelo.

### Pendiente real (no bloqueante)

- No hay página frontend para abrir el link público de campaña compartida (el endpoint `GET /api/public/campaigns/:token` existe, falta la ruta de React que lo consuma).
- No se añadió ningún framework de tests: no había ninguno configurado en `backend/package.json` antes de este trabajo, y montar uno para toda la superficie nueva excedía el alcance de esta pasada.

### Complemento implementado (2026-07-12)

- **Enlace público de campaña:** añadido `src/pages/PublicCampaignSharePage.jsx` y la ruta abierta `/campanas/compartir/:token`. Consume `GET /api/public/campaigns/:token`, muestra solo nombre, objetivo, estado y métricas agregadas, y tiene estados de carga, enlace inválido y error. No requiere sesión ni expone datos de contactos.
- **Operación completa de Email en UI:** cada campaña de `EmailMarketingPage` puede abrir el panel **Gestionar**, que carga en paralelo plantillas de Mautic, leads con email del CRM y las estadísticas de la campaña. Desde él se envía una prueba a un lead interno ya sincronizado con Mautic y se programa la publicación.
- **Prueba de Email utilizable:** `POST /api/mautic/campaigns/:id/send-test` acepta ahora `testLeadId`; el backend resuelve el ID de contacto de Mautic sin enviarlo al navegador. Se conserva `testContactId` para compatibilidad con consumidores existentes.
- **Validación de entrada:** los controladores de campañas, configuración, Postiz y Mautic validan cuerpos, parámetros y filtros con Zod mediante `backend/src/lib/validation.ts`, rechazando campos inesperados y formatos inválidos antes de llegar a Prisma o a integraciones externas.
- **Verificación:** `npm.cmd run build` pasa tanto en `backend/` como en el frontend. La verificación visual con el navegador integrado no pudo alcanzar el servidor local de Vite desde su entorno aislado (`ERR_CONNECTION_REFUSED`); no se sustituyó por un navegador externo.

### Pendiente operativo

- Aún no hay una suite automatizada de API/E2E. La funcionalidad fue validada mediante compilación estática; conviene añadir pruebas para las rutas de campañas, configuración y Mautic antes de un despliegue de producción.
- Los endpoints específicos de Mautic deben contrastarse con la versión de Mautic desplegada antes de activar envíos reales en producción. El envío de prueba requiere que el lead esté previamente sincronizado en Mautic.

### Funnels (2026-07-12)

- Nueva pagina protegida `/funnels`, enlazada desde **Captacion**, para analizar el recorrido landing -> lead -> contacto -> reunion por campana.
- Nuevo backend autenticado: `GET /api/funnels/overview` y `POST /api/funnels`. Los funnels se construyen a partir de las campanas de la organizacion que tienen `landingSlug`; la creacion genera una landing publica generica y un slug unico.
- Las conversiones se calculan desde los contadores reales de campana. Las visitas solo se exponen cuando existen en `adAssets.visits`; en caso contrario la interfaz marca el tracking como pendiente y no calcula porcentajes ficticios.

### Centro de operaciones Ads (2026-07-12)

- Nueva página protegida `/ads`, separada de `/captacion/nueva` (laboratorio de creación) y enlazada desde **Captación**.
- Nuevo `GET /api/ads/overview`: agrega por organización campañas de Ads, último snapshot de Meta, serie diaria reducida, cuenta conectada y recomendación de límite CPL. Nunca retorna tokens de Meta.
- La pantalla no inventa métricas: sin snapshots muestra estados vacíos explícitos. El filtro y la selección son locales; **Aplicar límite recomendado** persiste mediante `PUT /api/ads/campaigns/:id/max-cpl`.

### Captación unificada: “Te traemos clientes” (2026-07-13)

- Las seis superficies de Captación comparten ahora un recorrido operativo único: **Planificar** (`/campanas`) → **Atraer** (`/ads`, `/redes-sociales`, `/prospectos`) → **Convertir** (`/landings`) → **Cerrar** (`/funnels`). Campañas funciona como centro de mando y deja de presentar cada canal como una herramienta aislada.
- Nuevo modelo Prisma `AcquisitionEvent`, con claves idempotentes e índices por organización, campaña, lead y fecha. La migración `20260713120000_add_acquisition_events` fue aplicada sobre la base de datos Neon configurada en `backend/.env`.
- Nuevo endpoint público `POST /api/public/landing/:slug/view`. La landing pública envía una sesión estable, UTM, `gclid`, `fbclid`, referrer y ruta; el envío del formulario conserva la misma atribución y genera un evento `landing_lead`.
- Funnels usa `AcquisitionEvent(type = landing_view)` como fuente de visitas y mantiene `adAssets.visits` solo como compatibilidad para campañas históricas. Incluye también campañas outbound sin landing y calcula sus ratios lead → contacto → reunión sin inventar visitas.
- Redes sociales exige una campaña con landing para crear contenido atribuido. Postiz recibe una URL con UTM por plataforma y el backend registra `organic_social` en `Campaign.settings.captureChannels` tras crear el borrador correctamente.
- Prospect Finder exige una campaña real, permite crearla en línea y asocia cada lead importado. Cada importación genera un evento idempotente `prospect_import` y registra `outbound_prospecting` en `Campaign.settings.captureChannels`.
- Landings corrigió el contrato real de `GET /api/campaigns`, eliminó campañas y métricas demo, y muestra estados de carga, error, vacío y tracking pendiente de forma explícita.
- El panel de Campañas deriva su mezcla de canales únicamente de campos reales (`adPlaybookId`, `metaCampaignId` y `settings.captureChannels`), incluyendo campañas multicanal.

#### Validación operativa

- `prisma validate`, build del backend y build de Vite pasan tras la integración.
- Se validó el endpoint de vista contra una landing real: dos peticiones con la misma sesión devolvieron `201` y produjeron un único registro en base de datos. El registro de QA fue eliminado al terminar.

#### Pendiente real

- Las “webs externas” añadidas manualmente en Landings siguen almacenadas en `localStorage` y están identificadas como locales. Para compartirlas entre usuarios hace falta un modelo `ExternalWeb` y CRUD autenticado.
- La creación real en Postiz depende de que el workspace y la API self-hosted estén operativos en el entorno de despliegue; la atribución se persiste solo después de que Postiz confirme el borrador.
- Antes de publicar en Meta o Postiz es obligatorio configurar `APP_URL` o `FRONTEND_URL` con una URL pública; el backend bloquea la operación si falta o apunta a localhost. Prospect Finder requiere además `GOOGLE_PLACES_API_KEY`, todavía ausente en el entorno revisado.
- Falta una suite E2E autenticada para recorrer Campaña → canal → Landing → Lead → Funnel de extremo a extremo.

## Conversaciones omnicanal (2026-07-13)

### Implementado

- Nueva página protegida `/conversacion/inbox`, enlazada desde la sección **Conversación**. La interfaz usa una cola, un hilo mixto y contexto comercial real; no incluye conversaciones, métricas ni transcripciones de demostración.
- Persistencia Prisma para `ChannelIdentity`, `Conversation`, `MessageTemplate`, `Message`, `DeliveryAttempt`, `ContactConsent`, `WebhookEvent`, `AutomationRun`, `OutboxEvent` y `NextBestAction`.
- API autenticada bajo `/api/conversations`: listado y filtros, detalle, plantillas, cambio de estado/asignación, toma de control humano, envío por canal y sugerencia de respuesta con Claude usando únicamente el contexto real del hilo.
- WhatsApp real con Twilio bajo `/api/whatsapp`: entrada, estados y envío. Incluye validación `X-Twilio-Signature`, ventana de 24 horas, plantillas `contentSid`, idempotencia de webhooks y estados enviado/entregado/leído/fallido.
- Voz: callbacks Twilio firmados, E.164, AMD, estados completos y persistencia idempotente de la llamada en el hilo. El cierre del stream y los callbacks ya no incrementan métricas dos veces para el mismo `CallSid`.
- Email: sincronización con Mautic aislada por organización, webhooks de apertura, clic, rebote y baja, y registro del envío en el hilo.
- Captación: el alta de una landing registra consentimiento, crea el hilo y dispara el evento `lead.created`. Las respuestas automáticas solo se ejecutan para canales con consentimiento concedido y configuración válida.
- Automatizaciones: eventos canónicos, `AutomationRun` idempotente y outbox persistente con reintentos. Los eventos `lead.created`, `call.completed` y `message.received` comparten claves deterministas entre Redis y outbox para impedir ejecuciones duplicadas. El editor permite configurar respuesta de WhatsApp con IA, plantilla aprobada de WhatsApp, llamada automática o plantilla de email; cada acción comprueba el consentimiento del canal y reanuda desde el último paso completado si el flujo falla.

### Configuración operativa

Variables necesarias, sin incluir sus valores: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WEBHOOK_BASE_URL`, `TWILIO_WHATSAPP_WELCOME_CONTENT_SID`, `MAUTIC_WELCOME_EMAIL_ID`, credenciales existentes de Mautic, `CLAUDE_API_KEY`, `CLAUDE_MODEL` y `BACKGROUND_WORKERS_ENABLED=true`. Twilio debe apuntar a `/api/whatsapp/inbound`, `/api/whatsapp/status` y los callbacks de voz ya definidos en `/api/voice`. En producción hay que ejecutar tanto `npm start` como `npm run start:worker`; el segundo procesa llamadas, automatizaciones y el outbox durable.

La migración `backend/prisma/migrations/20260713183000_add_omnichannel_conversations/migration.sql` ya fue aplicada correctamente en Neon. `prisma format`, `prisma validate`, la generación del cliente, el build TypeScript del backend y el build Vite pasan. `prisma migrate status` confirma que la base está actualizada y una lectura segura confirma que las tablas nuevas existen.

### Pendiente de validación externa

- Prueba E2E con números y plantillas reales de Twilio, una campaña real de Mautic y las URLs públicas definitivas de callbacks.
- Verificación legal del texto de consentimiento y ventanas/horarios de contacto para los países donde se vaya a operar.
- La revisión visual integrada no pudo tomar control de la pestaña local por pérdida de la sesión del navegador. El concepto de referencia está en `docs/design/conversations-inbox-concept.png`; queda pendiente una captura final autenticada cuando el navegador vuelva a estar disponible.
