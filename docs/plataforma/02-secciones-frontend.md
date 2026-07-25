# Secciones frontend y flujos de la plataforma

## Alcance y criterio de auditoría

Este documento describe exclusivamente el frontend visible bajo `src/`. La evidencia se ha leído en `src/App.jsx`, `src/pages`, `src/components`, `src/contexts` y `src/hooks`, junto con los helpers frontend directamente importados para autenticación, permisos y API.

Estados usados en este documento:

- **Implementado**: existe ruta, componente, estados de UI y una dependencia API o flujo local explícito.
- **Parcial**: el recorrido principal existe, pero contiene datos demo/fallback, acciones locales, paneles sin API o integración externa pendiente.
- **Pendiente**: la interfaz anuncia o deja preparado el flujo, pero no existe una operación real visible que lo complete.

No se infiere disponibilidad del backend únicamente por la presencia de una llamada `fetch`: la clasificación considera también si la pantalla conserva datos ficticios, silencia errores, deja acciones sin efecto o depende de una integración que aún no está configurada.

## 1. Shell de aplicación, sesión y permisos

### Entrada y restauración de sesión

`src/App.jsx:1-47` monta `AuthProvider` sobre `BrowserRouter`. `src/contexts/AuthContext.jsx:5-34` mantiene el token en memoria, restaura la sesión mediante `refreshAccessToken()` y expone `login`, `logout`, `token`, `user` e `isRestoring`.

`src/lib/api.js:1-28` centraliza las peticiones autenticadas mediante `apiFetch`: añade `Authorization`, usa credenciales same-origin, intenta renovar el token ante un `401` y redirige a `/login` si la renovación falla. El login usa directamente `POST /api/auth/login` (`src/pages/LoginPage.jsx:129-257`).

### Protección de rutas

`src/components/ProtectedRoute.jsx:1-82` protege todas las rutas anidadas bajo el `<Route element={<ProtectedRoute />}>` de `src/App.jsx:59-97`:

1. Mientras `isRestoring` muestra `Restaurando sesión…`.
2. Si no hay token, redirige a `/login`.
3. Si hay sesión, monta `Sidebar`, cabecera móvil y `Outlet`.
4. Cierra el menú lateral al cambiar de ruta y permite cerrarlo con `Escape`.

`src/components/AdminRoute.jsx:14-52` añade una segunda barrera para gobierno, control de accesos y recetas Ads. Con `permission` consulta `GET /api/access-control/catalog`; si no encuentra el permiso, falla cerrado y redirige a `/dashboard`. Sin `permission`, conserva el guard legado por rol `owner`/`admin`.

### Sidebar y navegación

`src/components/Sidebar.jsx:19-79` agrupa la navegación en:

| Sección | Rutas visibles |
| --- | --- |
| Captación | `/campanas`, `/ads`, `/redes-sociales`, `/prospectos`, `/landings`, `/funnels`, `/organic` |
| Conversación | `/conversacion/inbox`, `/llamadas`, `/agentes`, `/playbooks`, `/voz/test` |
| Nutrición | `/email-marketing`, `/automatizaciones` |
| Growth | `/growth` |
| Ventas | `/leads`, `/pipeline`, `/reuniones`, `/inteligencia-comercial` |
| Sistema | `/insights`, `/knowledge-base`, `/configuracion`, `/gobierno-empresarial`, `/access-control`, `/admin/ad-playbooks` |

El Dashboard está fuera de las secciones y usa `/dashboard`. `src/lib/navigationPermissions.js` filtra enlaces por permisos efectivos o por fallback de rol; esto solo oculta navegación. El servidor sigue siendo la autoridad para las APIs. Las rutas auxiliares `/captacion/conectar` y `/captacion/nueva` existen en `App.jsx`, pero no son entradas propias de la Sidebar: se alcanzan desde Ads, campañas o estados de conexión.

## 2. Rutas públicas y de acceso

| Ruta | Componente | Propósito y flujo | Carga / error / vacío | CRUD y APIs visibles | Estado |
| --- | --- | --- | --- | --- | --- |
| `/login` | `src/pages/LoginPage.jsx` | Formulario de correo y contraseña; al éxito llama `login()` y navega a `/dashboard`. El enlace “¿La olvidaste?” abre un panel de soporte que prepara un `mailto`, no envía correo desde la app. | `loading` deshabilita el submit; `error` muestra alerta inline. | `POST /api/auth/login`; restauración posterior por `/api/auth/refresh` desde `AuthContext`. | **Implementado** |
| `/l/:slug` | `src/pages/PublicLandingPage.jsx` | Landing pública con hero, beneficios, proceso, FAQ y formulario de lead. Genera `sessionId`, conserva UTM/gclid/fbclid y registra visita. `preview=1` o slug `preview` activa modo previsualización. | `loading` muestra “Preparando tu experiencia”; error muestra tarjeta de recarga; submit muestra error de validación/API y tarjeta de éxito. | `GET /api/public/landing/:slug`; `POST /api/public/landing/:slug/view`; `POST /api/public/landing/:slug/lead`. | **Parcial**: la previsualización usa `PREVIEW_LANDING` y una espera local simulada; las métricas de visita se envían solo fuera de preview. |
| `/campanas/compartir/:token` | `src/pages/PublicCampaignSharePage.jsx` | Vista de campaña compartida en solo lectura. Calcula localmente cobertura de contacto y conversión a partir de la respuesta. | `loading`; `not-found` para token inexistente; `error` para fallo de carga. | `GET /api/public/campaigns/:token`. No hay mutaciones. | **Implementado** |
| `/privacidad` | `src/pages/PrivacyPage.jsx` | Documento legal estático con enlace a términos y soporte. | No tiene carga ni error remoto. | Ninguna. | **Implementado** |
| `/terminos` | `src/pages/TermsPage.jsx` | Términos de uso estáticos con enlace a privacidad y soporte. | No tiene carga ni error remoto. | Ninguna. | **Implementado** |
| `*` | `src/pages/NotFoundPage.jsx` | Fallback 404 que muestra la ruta desconocida y vuelve a `/dashboard`. | Estado estático de no encontrado. | Ninguna. | **Implementado** |

## 3. Captación

### Campañas

**Ruta:** `/campanas` → `src/components/Campaigns.jsx`.

Es la bandeja de campañas con KPIs, búsqueda, filtro por estado, paginación y modal de alta. Cada fila navega a `/campanas/:id`; las acciones de activar/pausar se ejecutan desde la lista.

- **Carga/error/vacío:** `loading` muestra “Cargando campañas…”; `error` muestra mensaje y “Reintentar”; sin datos muestra “No hemos encontrado campañas” o “Sin campañas todavía” en el bloque de resumen.
- **CRUD visible:** alta desde `CreateCampaignModal`; actualización de estado desde la fila; navegación a detalle. No hay borrado visible.
- **API:** `GET /api/campaigns`, `GET /api/campaigns?page=1&limit=…`, `POST /api/campaigns`, `POST /api/campaigns/:id/:action`.
- **Evidencia:** `src/components/Campaigns.jsx:160-307`.
- **Estado:** **Implementado** en el recorrido principal; la operación final de publicación/Ads se completa en el detalle o en el wizard.

### Detalle de campaña

**Ruta:** `/campanas/:id` → `src/pages/CampaignDetailPage.jsx`.

Carga la campaña, su actividad y las señales Ads relacionadas. Permite editar datos de campaña, guardar `settings`, duplicar, crear enlace compartido y ejecutar acciones de ciclo de vida. El detalle admite pestaña de anuncio mediante `?tab=anuncio`.

- **Carga/error/vacío:** carga de campaña, actividad y Ads se mantienen en estados independientes; se muestran mensajes para actividad vacía o fallida y avisos toast para mutaciones.
- **CRUD visible:** lectura, `PUT` de campaña y settings, duplicado, enlace compartido y acciones de estado; lectura de status/insights de Ads.
- **API:** `GET /api/campaigns/:id`, `GET /api/campaigns/:id/activity`, `GET /api/ads/campaigns/:id/status`, `GET /api/ads/campaigns/:id/insights`, `POST /api/campaigns/:id/:action`, `PUT /api/campaigns/:id`, `PUT /api/campaigns/:id` para `settings`, `POST /api/campaigns/:id/duplicate`, `POST /api/campaigns/:id/share-link`, además de acciones Ads equivalentes.
- **Evidencia:** `src/pages/CampaignDetailPage.jsx:80-316`.
- **Estado:** **Implementado**; queda condicionado a que los conectores Ads existan para acciones remotas.

### Ads operativo

**Ruta:** `/ads` → `src/pages/AdsPage.jsx`.

Dashboard de rendimiento Meta Ads: conexión, KPIs, listado filtrable, campaña seleccionada, recomendación de CPL, histórico de snapshots y dirección creativa. Desde aquí se navega a `/captacion/conectar` o `/captacion/nueva`.

- **Carga/error/vacío:** `loading`; error con “Reintentar”; sin campañas se diferencia entre Meta conectado y no conectado; sin histórico se muestra “Sin histórico”.
- **CRUD/acciones:** actualizar límites de CPL, publicar borrador, activar, pausar y sincronizar estado remoto; no crea la campaña directamente, sino que delega en el wizard.
- **API:** `GET /api/ads/overview`, `PUT /api/ads/campaigns/:id/max-cpl`, `POST /api/ads/campaigns/:id/publish|activate|pause`, `GET /api/ads/campaigns/:id/remote-status`.
- **Evidencia:** `src/pages/AdsPage.jsx:60-155`.
- **Estado:** **Implementado** para el panel y acciones visibles; **parcial** para operación real si Meta no está conectada o no hay snapshots.

### Conexión de Meta Ads

**Ruta:** `/captacion/conectar` → `src/pages/MetaAccountPage.jsx`.

Muestra la cuenta publicitaria, inicia OAuth, configura presupuesto diario y Pixel ID, y permite desconectar la cuenta. Usa el query string `status=connected|error` para mostrar el resultado del callback.

- **Carga/error/vacío:** carga inicial; si no hay cuenta se muestra estado de conexión; cada guardado muestra aviso de éxito/error.
- **CRUD:** lectura de cuenta, actualización de presupuesto y Pixel ID, desconexión.
- **API:** `GET /api/meta/accounts`, `GET /api/meta/accounts/oauth/start-url`, `PUT /api/meta/accounts/:id/budget-cap`, `PUT /api/meta/accounts/:id/pixel-id`, `DELETE /api/meta/accounts/:id`.
- **Evidencia:** `src/pages/MetaAccountPage.jsx:10-100`.
- **Estado:** **Implementado** en frontend; OAuth y APIs externas requieren credenciales/configuración de Meta.

### Wizard de nueva campaña Ads

**Ruta:** `/captacion/nueva` → `src/pages/AdsWizardPage.jsx`.

Wizard de vertical, objetivo, presupuesto y audiencia. Restaura borrador desde `localStorage` y servidor, carga playbooks y estado Meta, genera estrategia IA, guarda borrador y crea la campaña.

- **Carga/error/vacío:** estado `metaState` (`loading`, `connected`, `pending`); `aiStatus` (`idle`, `running`, `ready`); mensajes inline para validación, IA, guardado y creación. No hay una pantalla de error global: el formulario conserva el contexto.
- **CRUD:** lectura y persistencia de borrador, generación de estrategia, creación de campaña.
- **API:** `GET /api/ad-playbooks`, `GET /api/meta/accounts`, `GET /api/ads/draft`, `PUT /api/ads/draft`, `POST /api/ads/strategy`, `POST /api/ads/wizard`.
- **Evidencia:** `src/pages/AdsWizardPage.jsx:258-490`.
- **Estado:** **Parcial**: la estrategia tiene fallback local cuando el backend IA falla; la previsión local no debe interpretarse como dato de rendimiento real.

### Redes sociales y posts orgánicos

**Ruta:** `/redes-sociales` → `src/pages/ConectarRedesPage.jsx`.

La página es una capa de conexión con Metricool, no un planificador social propio. Muestra estado/conexiones, abre el embed o proveedor, carga analítica, prepara un plan con IA y crea borradores asociados a una campaña con landing.

- **Carga/error/vacío:** carga general; gating 403 de Plan Completo; métricas con carga y vacío; avisos para conectar, generar y crear borradores.
- **CRUD/acciones:** conectar Metricool, generar plan, crear borrador de post. No hay edición ni calendario nativo de posts en este componente.
- **API:** `GET /api/metricool`, `GET /api/metricool/analytics`, `GET /api/campaigns?page=1&limit=100`, `POST /api/metricool/connect`, `POST /api/metricool/ai/generate`, `POST /api/metricool/posts`.
- **Dependencias:** `CaptureJourney` y el proveedor/embedded planner de Metricool.
- **Evidencia:** `src/pages/ConectarRedesPage.jsx:62-210`.
- **Estado:** **Parcial**: la gestión de posts se delega a Metricool; la analítica, IA y borradores dependen del conector activo.

### Prospect Finder

**Ruta:** `/prospectos` → `src/pages/ProspectFinderPage.jsx`.

Busca negocios por sector y ciudad, filtra por rating/reseñas/web/teléfono, selecciona resultados y los importa en una campaña. Puede solicitar enriquecimiento, auditoría y llamada automática.

- **Carga/error/vacío:** carga y error separados para campañas y búsqueda; vacío explícito cuando no hay resultados; mensajes para selección, campaña faltante e importación.
- **CRUD:** crea campaña outbound, busca e importa prospectos seleccionados; la selección y filtros son locales.
- **API:** `GET /api/campaigns?page=1&limit=100`, `POST /api/prospects/search`, `POST /api/campaigns`, `POST /api/prospects/import`.
- **Evidencia:** `src/pages/ProspectFinderPage.jsx:80-260`.
- **Estado:** **Implementado** para el flujo de búsqueda/importación; auditoría/enriquecimiento/auto-call dependen de flags y backend.

### Landings & webs

**Ruta:** `/landings` → `src/pages/LandingsPage.jsx`.

Agrega campañas como propiedades de landing, mezcla propiedades externas introducidas localmente, filtra por estado/plantilla, ordena, alterna lista/cuadrícula, copia enlace y abre edición/importación.

- **Carga/error/vacío:** loading de campañas, alerta de carga sin datos demo, vacío por error, por filtros o por ausencia de propiedades; tracking pendiente se muestra como tal.
- **CRUD:** crea landing vía campaña, actualiza landing/activos, cambia estado, importa URL como objeto local y copia enlace. La eliminación visible solo muestra que requiere confirmación desde configuración.
- **API:** `GET /api/campaigns?limit=100`, `GET /api/funnels/overview`, `POST /api/campaigns`, `PUT /api/campaigns/:id/landing`, `PUT /api/campaigns/:id` para estado.
- **Evidencia:** `src/pages/LandingsPage.jsx:206-334`.
- **Estado:** **Parcial**: las webs externas no tienen persistencia propia visible; el tracking depende de la campaña/landing.

### Funnels

**Ruta:** `/funnels` → `src/pages/FunnelsPage.jsx`.

Mide el recorrido landing → visitas → leads → reuniones, permite seleccionar un funnel y actualiza la URL con `?selected=`. El modal de alta indica que genera una landing genérica editable desde Landings.

- **Carga/error/vacío:** loading; error con reintento; sin funnels muestra CTA de creación; filtro sin coincidencias muestra vacío.
- **CRUD:** alta de funnel; lectura de overview; selección y filtros son locales. No hay edición/borrado visible.
- **API:** `GET /api/funnels/overview`, `POST /api/funnels`.
- **Evidencia:** `src/pages/FunnelsPage.jsx:127-225`.
- **Estado:** **Implementado** para alta/lectura; **parcial** por ausencia de edición/borrado desde esta sección.

### Organic Leads

**Ruta:** `/organic` → `OrganicLeadsPage` cargada desde `src/lib/organicPage.js` y definida en `src/pages/OrganicLeadsPage.jsx`.

La vista incluye navegación interna a Resumen, Oportunidades, Visibilidad local, Visibilidad IA, Contenido, Competidores y Leads orgánicos. También incluye el panel de Search Console, GA4 y Google Business Profile. El proyecto puede crearse/conectarse y los activos pueden convertirse en borradores.

- **Carga/error/setup/vacío:** `loading` prepara el mapa; `setup` pide crear proyecto; `error` permite reintentar; cada integración distingue no conectado, conectado, propiedad pendiente, sincronización y error; paneles sin datos muestran vacío sin inventar métricas.
- **CRUD/acciones:** crear proyecto, actualizar web, crear borrador de activo, iniciar OAuth, descubrir/sincronizar, seleccionar recurso y desconectar integración.
- **API:** `GET /api/organic/overview`, `POST /api/organic/project`, `PATCH /api/organic/project`, `POST /api/organic/assets`, `GET /api/organic/integrations`, `GET /api/organic/integrations/:provider/oauth/start-url`, `DELETE /api/organic/integrations/:provider`, `POST /api/organic/integrations/:provider/discover`, `PUT /api/organic/integrations/:provider/resource`, `POST /api/organic/integrations/search_console/sync`.
- **Evidencia:** `src/pages/OrganicLeadsPage.jsx:106-295` y `src/lib/organic/organicApi.js:90-188`.
- **Estado:** **Parcial**: el contrato frontend y OAuth están conectados, pero las secciones local/IA/competidores y las métricas dependen de fuentes configuradas y sincronizaciones reales; la navegación interna no son rutas independientes.

## 4. Conversación

### Inbox

**Ruta:** `/conversacion/inbox` → `src/pages/ConversationsInboxPage.jsx`.

Lista conversaciones, selecciona hilo, carga mensajes, permite takeover humano, cambia estado/canal, carga plantillas, envía mensajes y solicita sugerencia IA.

- **Carga/error/vacío:** listado con loading/error/empty; detalle usa `idle`, `loading`, `ready` y `error`; envío, takeover y sugerencia tienen estados ocupados.
- **CRUD/acciones:** lectura lista/detalle/plantillas, `PUT` de conversación, `POST` de mensajes, takeover y sugerencia.
- **API:** `GET /api/conversations`, `GET /api/conversations/:id`, `GET /api/conversations/templates`, `PUT /api/conversations/:id`, `POST /api/conversations/:id/messages`, `POST /api/conversations/:id/takeover`, `POST /api/conversations/:id/suggest`.
- **Evidencia:** `src/pages/ConversationsInboxPage.jsx:140-210`.
- **Estado:** **Implementado** en frontend; la calidad de sugerencias y canales depende de backend/proveedores.

### Llamadas

**Ruta:** `/llamadas` → `src/components/Calls.jsx`.

Lista paginada de llamadas con búsqueda, filtros por resultado/agente, vistas rápidas, selección múltiple, comandos, exportación CSV y navegación a detalle. “Nueva llamada” dirige al test de voz.

- **Carga/error/vacío:** loading; error con reintento; vacío por búsqueda; métricas muestran `—` si la API no entrega el valor.
- **CRUD/acciones:** lectura, exportación local CSV, acciones masivas `follow_up`/`priority`; no se crea una llamada desde la lista.
- **API:** `GET /api/calls?page=&limit=`, `GET /api/dashboard/stats`, `POST /api/calls/bulk-actions`.
- **Evidencia:** `src/components/Calls.jsx:67-157`.
- **Estado:** **Implementado** para lectura y bulk actions; **parcial** porque exportación es local y el comando depende de acciones ya disponibles.

### Detalle de llamada

**Ruta:** `/llamadas/:id` → `src/pages/CallDetailPage.jsx`.

Muestra resumen, audio, transcripción filtrable, notas y próximas acciones. Permite favorito, crear/borrar notas y marcar tareas.

- **Carga/error/vacío:** carga de llamada con error; pestañas muestran resumen ausente, transcripción sin coincidencias, notas vacías y tareas vacías.
- **CRUD:** favorito, notas `POST/DELETE`, tareas `PUT`; el audio solo se reproduce si existe `recordingUrl`.
- **API:** `GET /api/calls/:id`, `GET /api/calls/:id/notes`, `GET /api/calls/:id/tasks`, `POST /api/calls/:id/favorite`, `POST /api/calls/:id/notes`, `DELETE /api/calls/:id/notes/:noteId`, `PUT /api/calls/:id/tasks/:taskId`.
- **Evidencia:** `src/pages/CallDetailPage.jsx:40-72`.
- **Estado:** **Implementado**.

### Agentes IA

**Ruta:** `/agentes` → `src/components/Agentes.jsx`.

Lista filtrable/ordenable, selección de agente, studio por pasos (tipo, estrategia, configuración, mensajes y conocimiento), modal de nuevo agente y guardado de campos admitidos.

- **Carga/error/vacío:** loading, error con reintento, filtros sin coincidencias y vacío sin agentes; panel vacío invita a seleccionar/crear.
- **CRUD:** lectura de agentes, edición `PUT`; creación desde `NewAgenteModal` (`POST /api/agents`). Los paneles de escalado, voz, mensajes y asociación de Knowledge Base dejan avisos de disponibilidad futura.
- **API:** `GET /api/agents`, `PUT /api/agents/:id`; modal: `POST /api/agents`.
- **Evidencia:** `src/components/Agentes.jsx:131-232`; `src/modals/NewAgenteModal.jsx:12-40`.
- **Estado:** **Parcial**: identidad, rol, prompt e activo se pueden guardar; escalado, voz y fuentes asociadas aún no tienen API visible.

### Detalle de agente

**Ruta:** `/agentes/:id` → `src/pages/AgentDetailPage.jsx`.

Carga perfil, estadísticas y playbooks; muestra pestañas de resumen/configuración/rendimiento y permite activar/desactivar, guardar voz, personalidad, límites, horario y playbook activo.

- **Carga/error/vacío:** loading; “Agente no encontrado” si el detalle no responde; fallos de mutación revierten o se silencian en algunas acciones.
- **CRUD:** `PUT` de estado, configuración y playbook asociado.
- **API:** `GET /api/agents/:id`, `GET /api/agents/:id/stats`, `GET /api/playbooks`, `PUT /api/agents/:id`.
- **Evidencia:** `src/pages/AgentDetailPage.jsx:70-150`.
- **Estado:** **Parcial**: los campos guardados están implementados, pero varios indicadores muestran `—` y el manejo de error de guardado no es uniforme.

### Playbooks

**Ruta:** `/playbooks` → `src/components/Playbooks.jsx`.

Biblioteca de playbooks con estadísticas, tabs, búsqueda visual, cards, importación de archivo y creación mediante modal. Cada card abre el detalle.

- **Carga/error/vacío:** la lista falla a `[]` sin un estado de error visible; vacío muestra “Sin playbooks”; varias estadísticas se mantienen en `—` si no hay fuente.
- **CRUD:** lectura `GET /api/playbooks`; alta mediante `NewPlaybookModal` (`POST /api/playbooks`). El botón importar abre selector local, pero no se observa procesamiento/persistencia del archivo.
- **API:** `GET /api/dashboard/stats`, `GET /api/playbooks`; modal: `POST /api/playbooks`.
- **Evidencia:** `src/components/Playbooks.jsx:487-571`; `src/modals/NewPlaybookModal.jsx:12-35`.
- **Estado:** **Parcial**: alta y lectura existen; importación, búsqueda/filtros efectivos y métricas específicas no están completamente conectados.

### Detalle de playbook

**Ruta:** `/playbooks/:id` → `src/pages/PlaybookDetailPage.jsx`.

Carga un playbook, presenta resumen, incluye y rendimiento, permite volver, usarlo en campañas y descargar un TXT local.

- **Carga/error/vacío:** loading; “Playbook no encontrado”.
- **CRUD:** solo lectura; “Usar en campaña” navega a `/campanas`, no crea automáticamente; descarga local.
- **API:** `GET /api/playbooks/:id`.
- **Evidencia:** `src/pages/PlaybookDetailPage.jsx:29-120`.
- **Estado:** **Parcial**: la respuesta real aporta el playbook, pero parte de estadísticas, includes e ideal se define con constantes locales (`STATS`, `INCLUDES`, `IDEAL`).

### Test de voz

**Ruta:** `/voz/test` → `src/pages/VoiceTestPage.jsx`.

Interfaz de prueba de voz para seleccionar agente/voz, introducir texto y reproducir audio, con estados de grabación/reproducción y resultado. La implementación de la página no muestra una llamada `/api/` directa en el archivo auditado; depende de la lógica de voz embebida/importada y del navegador.

- **Carga/error/vacío:** estados locales de sesión, permisos de micrófono, generación/reproducción y mensaje de error; revisar backend de voz para confirmar persistencia.
- **CRUD/API visible:** no hay endpoint `/api/` explícito en `src/pages/VoiceTestPage.jsx`.
- **Estado:** **Parcial/Pendiente de verificación de integración**: la UX está presente, pero el contrato API no es visible en esta página.

## 5. Nutrición

### Email marketing

**Ruta:** `/email-marketing` → `src/pages/EmailMarketingPage.jsx`.

Centro Mautic con resumen de base, segmentos, actividad, campañas CRM, preview de audiencia, plantilla, remitente y calendario. El modal de gestión permite guardar, validar, publicar y pausar.

- **Carga/error/vacío:** loading; gating 403 de Plan Completo; campañas, segmentos, plantillas y actividad tienen vacíos explícitos; errores de guardado, validación, publicación y pausa aparecen en el modal.
- **CRUD:** crea borrador, edita configuración, previsualiza audiencia, valida, publica y pausa campañas.
- **API:** `GET /api/mautic`, `GET /api/mautic/templates`, `GET /api/marketing-campaigns`, `GET /api/marketing-campaigns/:id`, `POST /api/marketing-campaigns`, `PUT /api/marketing-campaigns/:id`, `POST /api/marketing-campaigns/:id/audience-preview`, `POST /api/marketing-campaigns/:id/validate`, `POST /api/marketing-campaigns/:id/publish`, `POST /api/marketing-campaigns/:id/pause`, `GET /api/marketing-campaigns/:id/reconcile`.
- **Evidencia:** `src/pages/EmailMarketingPage.jsx:140-430`.
- **Estado:** **Implementado** en el flujo CRM; **parcial** si Mautic está desconectado o no devuelve plantillas/actividad.

### Automatizaciones

**Ruta:** `/automatizaciones` → `src/components/Automatizaciones.jsx`.

Lista de flujos con métricas, filtro, búsqueda, orden, paginación, toggle activo/pausado, menú de eliminación y modal de creación.

- **Carga/error/vacío:** no hay `loading` dedicado; los errores de lectura se convierten en lista vacía; vacío distingue sin automatizaciones de filtros sin resultados.
- **CRUD:** lectura, creación vía modal, `PUT` de toggle, `DELETE` con confirmación. La selección navega a `/automatizaciones/:id`.
- **API:** `GET /api/dashboard/stats`, `GET /api/automations`, `PUT /api/automations/:id/toggle`, `DELETE /api/automations/:id`; modal: `POST /api/automations`.
- **Evidencia:** `src/components/Automatizaciones.jsx:34-91`.
- **Estado:** **Parcial** por ausencia de estado de carga/error explícito y porque la operación de toggle avisa si el backend no permite el cambio.

### Detalle de automatización

**Ruta:** `/automatizaciones/:id` → `src/pages/AutomacionDetailPage.jsx`.

Carga automatización, versiones y ejecuciones; permite publicar versión, activar/pausar, filtrar historial y abrir detalle de una ejecución.

- **Carga/error/vacío:** loading; “Automatización no encontrada”; error de publicación; historial puede estar vacío y las cargas de runs/detalle se muestran por estado.
- **CRUD/acciones:** lectura, publicar versión, toggle de estado y lectura paginada de runs.
- **API:** `GET /api/automations/:id`, `GET /api/automations/:id/versions`, `POST /api/automations/:id/publish`, `PUT /api/automations/:id/toggle`, `GET /api/automations/:id/runs`, `GET /api/automations/:id/runs/:runId`.
- **Evidencia:** `src/pages/AutomacionDetailPage.jsx:60-160`.
- **Estado:** **Implementado** para versionado/ejecuciones; algunos fallos de carga de historial se silencian.

## 6. Growth

### Growth Hub

**Ruta:** `/growth` → `src/pages/GrowthHubPage.jsx`.

Gestiona programas de growth por área y estado, con búsqueda, modal de creación/edición y activación/pausa. Las áreas visibles agrupan adquisición, conversación, ventas, nutrición y fidelización.

- **Carga/error/vacío:** loading; error de carga; filtros sin resultados; modal con error de guardado; aviso de éxito.
- **CRUD:** `POST` crear, `PUT` editar, `PUT` activar/pausar, `GET` listar.
- **API:** `GET /api/growth-programs`, `POST /api/growth-programs`, `PUT /api/growth-programs/:id`.
- **Evidencia:** `src/pages/GrowthHubPage.jsx:205-301`.
- **Estado:** **Implementado** en frontend.

## 7. Ventas

### Leads

**Ruta:** `/leads` → `src/components/Leads.jsx`.

Bandeja de leads con KPIs, radar comercial, embudo, tabla/Kanban, búsqueda con debounce, filtros, selección múltiple, importación, alta, auditoría web y exportación.

- **Carga/error/vacío:** carga con reintento, error de lista, vacío por filtros, columnas sin dato con `—`, Kanban vacío por etapa.
- **CRUD:** alta `NewLeadModal`, importación `ImportLeadsModal`, `PUT` masivo de estado, auditoría web, exportación server-side, llamada directa si existe teléfono y navegación a detalle.
- **API:** `GET /api/dashboard/stats`, `GET /api/leads`, `POST /api/leads/:id/audit`, `PUT /api/leads/:id`, `GET /api/leads/export`; modales: `POST /api/leads`, endpoints de importación y estado de job.
- **Evidencia:** `src/components/Leads.jsx:131-303`; `src/modals/NewLeadModal.jsx`, `src/modals/ImportLeadsModal.jsx`.
- **Estado:** **Implementado** en la operación principal; **parcial** en filtros de score/auditoría, que se aplican sobre la página cargada y usan campos derivados.

### Detalle de lead

**Ruta:** `/leads/:id` → `src/pages/LeadDetailPage.jsx`.

Ficha completa de lead con timeline, auditoría, notas, archivos, consentimiento, preferencias, owner, historial de email, cuenta y creación de reunión.

- **Carga/error/vacío:** varias fuentes se cargan en paralelo; cada colección puede quedar vacía; el detalle muestra estados de no encontrado/error y mensajes por mutación.
- **CRUD:** crear reunión, vincular cuenta, añadir nota, cambiar estado/owner, solicitar auditoría, actualizar preferencias, enviar email y subir archivo.
- **API:** `GET /api/leads/:id/timeline|audit|notes|files|activities|consent|email-history|preferences`, `GET /api/dashboard/stats`, `GET /api/leads/owners`, `GET /api/accounts/:id`, `GET /api/accounts?search=`, `POST /api/meetings`, `POST /api/accounts/leads/:id/assign`, `POST /api/leads/:id/notes`, `PUT /api/leads/:id`, `PUT /api/leads/:id/owner`, `POST /api/leads/:id/audit`, `PUT /api/leads/:id/preferences`, `POST /api/leads/:id/send-email`, `POST /api/leads/:id/files`.
- **Evidencia:** `src/pages/LeadDetailPage.jsx:145-320`.
- **Estado:** **Implementado**; hay dependencias externas para email, archivos y auditoría.

### Pipeline

**Ruta:** `/pipeline` → `src/components/Pipeline.jsx`.

Vista Kanban/lista de oportunidades, agrupación por etapa, KPIs, embudo, donut, insights, predicción, acciones, forecast, filtros server-side y drag-and-drop de etapa.

- **Carga/error/vacío:** la lista muestra `DataTable` con `Cargando…` o vacío por filtros; el Kanban y paneles empiezan en arrays/valores vacíos; el error de mover una oportunidad revierte el estado optimista.
- **CRUD:** alta desde `NewOportunidadModal`, lectura de pipeline/lista/forecast, mover etapa, navegación a detalle. No hay borrado desde la vista principal.
- **API:** `GET /api/pipeline`, `GET /api/pipeline/list`, `GET /api/pipeline/insights`, `GET /api/pipeline/prediction`, `GET /api/pipeline/actions`, `GET /api/pipeline/forecast`, `GET /api/leads/owners`, `POST /api/pipeline/:id/move-stage`; modal: búsqueda de leads y `POST /api/pipeline`.
- **Evidencia:** `src/components/Pipeline.jsx:405-700`.
- **Estado:** **Implementado** en lectura y movimiento; **parcial** porque no existe histórico real para algunos porcentajes/KPIs y se muestran `—` cuando falta fuente.

### Detalle de oportunidad

**Ruta:** `/pipeline/:id` → `src/pages/OpportunityDetailPage.jsx`.

Detalle de oportunidad con contactos, líneas de producto, forecast, edición, notas y transiciones ganado/perdido/reabierto.

- **Carga/error/vacío:** loading; bloques internos muestran carga y vacíos para contactos/líneas; errores específicos para cada formulario y transición.
- **CRUD:** actualizar oportunidad/notas/forecast, añadir/quitar contactos, añadir/quitar líneas, marcar ganada/perdida y reabrir.
- **API:** `GET /api/pipeline/:id`, `GET /api/tasks?opportunityId=`, `GET/POST/DELETE /api/pipeline/:id/contacts`, `GET/POST/DELETE /api/pipeline/:id/line-items`, `PUT /api/pipeline/:id/forecast-category`, `PUT /api/pipeline/:id`, `POST /api/pipeline/:id/mark-won`, `POST /api/pipeline/:id/mark-lost`, `POST /api/pipeline/:id/reopen`, además de `GET /api/leads?search=`.
- **Evidencia:** `src/pages/OpportunityDetailPage.jsx:80-410`.
- **Estado:** **Implementado**.

### Reuniones

**Ruta:** `/reuniones` → `src/components/Reuniones.jsx`.

Agenda/listado paginado con tabs temporales, filtros de estado/fecha, búsqueda debounce, exportación CSV, alta, reprogramación y cancelación.

- **Carga/error/vacío:** loading, error, tabla sin resultados por filtro, paginación y tabs sobre la página cargada.
- **CRUD:** crear y reprogramar desde `NewReunionModal`, cancelar con confirmación/estado local, abrir detalle y exportar.
- **API:** `GET /api/meetings`, `PUT /api/meetings/:id` para cancelar; modal: búsqueda de leads, `POST /api/meetings`, `PUT /api/meetings/:id/reschedule`.
- **Evidencia:** `src/components/Reuniones.jsx:240-320`; `src/modals/NewReunionModal.jsx:45-145`.
- **Estado:** **Implementado**; exportación y algunas métricas se calculan en cliente sobre la página actual.

### Detalle de reunión

**Ruta:** `/reuniones/:id` → `src/pages/MeetingDetailPage.jsx`.

Ficha de reunión con preparación, contexto del lead, reprogramación, completar, no-show y edición.

- **Carga/error/vacío:** estados de detalle/preparación, mensajes de error y bloques vacíos cuando falta preparación o recursos.
- **CRUD/acciones:** `PUT` de reunión, completar y marcar no-show.
- **API:** `GET /api/meetings/:id`, `GET /api/meetings/:id/prep`, `PUT /api/meetings/:id`, `POST /api/meetings/:id/complete`, `POST /api/meetings/:id/no-show`.
- **Evidencia:** `src/pages/MeetingDetailPage.jsx:99-210`.
- **Estado:** **Implementado**.

### Inteligencia comercial

**Ruta:** `/inteligencia-comercial` → `src/pages/RevenueIntelligencePage.jsx`.

Centro transversal de recomendaciones, experimentos y propuestas de memoria operativa. Permite marcar acciones hechas/descartadas, refrescar recomendaciones, iniciar/pausar experimentos, crear borradores y aprobar/descartar propuestas.

- **Carga/error/vacío:** `Promise.allSettled` permite cargar parcialmente; error identifica qué superficie falló; cada sección tiene vacío propio; modales y mutaciones tienen errores/estados busy.
- **CRUD:** lectura, `PATCH` de next actions, `POST` refresh, creación de experimentos, start/pause, revisión de propuestas.
- **API:** `GET /api/revenue-intelligence/next-actions`, `GET /api/revenue-intelligence/experiments`, `GET /api/revenue-intelligence/memory-proposals`, `POST /api/revenue-intelligence/next-actions/refresh`, `PATCH /api/revenue-intelligence/next-actions/:id`, `POST|PUT /api/revenue-intelligence/experiments`, `POST /api/revenue-intelligence/experiments/:id/start`, `PATCH /api/revenue-intelligence/experiments/:id`, `PATCH /api/revenue-intelligence/memory-proposals/:id/review`.
- **Evidencia:** `src/pages/RevenueIntelligencePage.jsx:25-455`.
- **Estado:** **Implementado** para el contrato visible; la evidencia y resultados de experimentos dependen de datos reales del servidor.

## 8. Sistema y administración

### Dashboard

**Ruta:** `/dashboard` → `src/components/Dashboard.jsx`.

Centro de operaciones con KPIs reordenables, widgets drag-and-drop, selector de fechas, comparación, exportación CSV y edición de layout persistida en `localStorage` mediante `useDashboardLayout`.

- **Carga/error/vacío:** `loading` controla el ciclo de petición; una respuesta sin métricas queda como `empty` y un fallo como `disconnected`. Los widgets sin series reales usan arrays vacíos y muestran `—`. `MOCK_STATS` y `MOCK_KPI` solo se habilitan con `VITE_DATA_MODE=demo|preview` o `VITE_ALLOW_DEMO_DATA=true`.
- **CRUD/local:** lectura de estadísticas; añadir/quitar/reordenar/restaurar widgets es configuración local, no CRUD de servidor. El selector de fechas/comparación cambia estado visual, pero no se ve en `GET /api/dashboard/stats`.
- **API:** `GET /api/dashboard/stats`; exportación CSV local.
- **Evidencia:** `src/components/Dashboard.jsx:75-160`, `src/components/dashboard/dashboardData.js`, `src/hooks/useDashboardLayout.js:1-113`.
- **Estado:** **Parcial**: la API real alimenta datos cuando responde y la demo es explícita; la fecha/comparación todavía no está conectada a parámetros API.

### Insights

**Ruta:** `/insights` → `src/components/Insights.jsx`.

Lectura ejecutiva de actividad, mezcla por campaña, embudo, ranking de agentes, sentimiento y valor por día.

- **Carga/error/vacío:** loading; un fallo muestra estado desconectado y reintento. `DEMO_STATS` solo aparece con modo demo explícito y lleva banner visible; cada gráfico tiene vacío honesto; filtros avanzados solo generan un aviso de disponibilidad futura.
- **API:** `GET /api/dashboard/stats`; período de gráfico es local.
- **Evidencia:** `src/components/Insights.jsx:50-84`.
- **Estado:** **Parcial** por filtros avanzados pendientes; el estado demo está separado del reporting real.

### Knowledge Base

**Ruta:** `/knowledge-base` → `src/components/KnowledgeBase.jsx`.

Biblioteca categorizada de artículos, búsqueda, pestañas, paginación, alta, subida múltiple, detalle, favoritos y reacciones.

- **Carga/error/vacío:** la lista queda vacía y marcada como desconectada si la API falla; `DEMO_RAW` solo aparece con modo demo explícito y aviso visible. La subida valida extensión/tamaño y marca cada archivo como pendiente, procesando, listo o error; las categorías/tabs sin backend se comportan localmente.
- **CRUD:** listar, crear artículo, importar documentos, borrar, editar desde detalle, favorito y reacción útil.
- **API:** `GET /api/knowledge`, `POST /api/knowledge`, `DELETE /api/knowledge/:id`; modales: `POST /api/knowledge`; detalle: `GET/PUT /api/knowledge/:id`, `POST /api/knowledge/:id/favorite`, `POST /api/knowledge/:id/reaction`.
- **Evidencia:** `src/components/KnowledgeBase.jsx:230-340`; `src/pages/ArticleDetailPage.jsx:70-145`.
- **Estado:** **Parcial**: la biblioteca principal está operativa, pero las tabs “Mis artículos/Favoritos” no representan filtros backend reales.

### Detalle de artículo

**Ruta:** `/knowledge-base/articulos/:id` → `src/pages/ArticleDetailPage.jsx`.

Lectura/edición de artículo, artículos relacionados por categoría, favorito, reacción útil y copia de enlace.

- **Carga/error/vacío:** loading; artículo no encontrado; relacionados vacíos son válidos; errores de favorito/reacción revierten el optimismo.
- **CRUD:** `PUT` de artículo, favoritos/reacciones, lectura de relacionados.
- **API:** `GET /api/knowledge/:id`, `GET /api/knowledge`, `POST /api/knowledge/:id/favorite`, `POST /api/knowledge/:id/reaction`, `PUT /api/knowledge/:id`.
- **Estado:** **Implementado**.

### Configuración

**Ruta:** `/configuracion` → `src/components/Configuracion.jsx`.

Configuración personal, seguridad, sesión, organización, zona horaria, moneda, preferencias regionales, integraciones activas y ayudas.

- **Carga/error/vacío:** varias cargas independientes; valores ausentes se muestran vacíos o por defecto; guardado y cambio de contraseña muestran mensajes de éxito/error; el rol lector deshabilita edición organizativa.
- **CRUD:** lectura/actualización de perfil, organización y locale; cambio de contraseña; lectura de integraciones.
- **API:** `GET /api/dashboard/stats`, `GET /api/agents`, `GET /api/settings/me`, `GET /api/settings/organization`, `GET /api/settings/integrations`, `PUT /api/settings/me`, `PUT /api/settings/organization`, `PUT /api/settings/password`.
- **Evidencia:** `src/components/Configuracion.jsx:175-275`.
- **Estado:** **Implementado** para los formularios visibles; algunos bloques de ayuda son informativos y no tienen navegación/CRUD.

### Gobierno empresarial

**Ruta:** `/gobierno-empresarial` → `AdminRoute permission="governance.read"` → `src/pages/EnterpriseGovernancePage.jsx`.

Muestra políticas aplicables, controles gobernados y auditoría reciente. Permite editar JSON de política solo si `overview.canManagePolicies` lo permite.

- **Carga/error/vacío:** loading, error con reintento, políticas vacías y auditoría vacía; validación JSON local antes de guardar; error separado de carga/guardado.
- **CRUD:** lectura de overview; `PUT` de cada política.
- **API:** `GET /api/revenue-intelligence/governance/overview`, `PUT /api/revenue-intelligence/governance/policies/:key`.
- **Evidencia:** `src/pages/EnterpriseGovernancePage.jsx:170-257`.
- **Estado:** **Implementado** con autorización de UI y servidor.

### Control de accesos

**Ruta:** `/access-control` → `AdminRoute permission="access_control.read"` → `src/pages/AccessControlPage.jsx`.

Consulta catálogo de roles/permisos, miembros y solicitudes; permite solicitar elevación, solicitar cambio de rol y decidir solicitudes con separación de funciones.

- **Carga/error/vacío:** loading por sección, error de catálogo o permisos, estados vacíos de roles/miembros/solicitudes/permisos, modal con error de solicitud y aviso de éxito.
- **CRUD:** lectura de catálogo/miembros/requests; crear solicitud; actualizar rol mediante solicitud; aprobar/rechazar solicitudes.
- **API:** `GET /api/access-control/catalog`, `GET /api/access-control/members`, `GET /api/access-control/requests`, `POST /api/access-control/requests`, `POST /api/access-control/requests/:id/approve|reject`.
- **Evidencia:** `src/pages/AccessControlPage.jsx:239-394`; guard en `src/components/AdminRoute.jsx`.
- **Estado:** **Implementado**; el contenido mostrado depende de la política real de la organización.

### Recetas Ads

**Ruta:** `/admin/ad-playbooks` → `AdminRoute` legado → `src/pages/AdPlaybooksAdminPage.jsx`.

Panel administrativo para listar, crear y editar playbooks/recetas Ads.

- **Carga/error/vacío:** estados de carga, error y lista vacía manejados en la página; modal/editor conserva error de guardado.
- **CRUD:** listar, crear, editar y guardar recetas.
- **API:** `GET /api/ad-playbooks`, `POST /api/ad-playbooks`, `PUT /api/ad-playbooks/:id`.
- **Evidencia:** `src/pages/AdPlaybooksAdminPage.jsx:35-110`.
- **Estado:** **Implementado**; el control de acceso sin permiso explícito usa el guard de rol legado.

## 9. Componentes y hooks transversales

### Modales de alta y formularios

Los componentes de sección delegan creación a modales especializados:

| Modal | Sección | Operación visible |
| --- | --- | --- |
| `NewLeadModal` | Leads | `POST /api/leads`; puede iniciar llamada con `/api/leads/:id/call-now`. |
| `ImportLeadsModal` | Leads | carga de importación, consulta de job y `POST /api/leads/import`. |
| `NewAgenteModal` | Agentes | `POST /api/agents`. |
| `NewReunionModal` | Reuniones | `GET /api/leads`, `POST /api/meetings`, `PUT /api/meetings/:id/reschedule`. |
| `NewOportunidadModal` | Pipeline | busca leads y `POST /api/pipeline`. |
| `NewAutomatizacionModal` | Automatizaciones | `POST /api/automations`. |
| `NewArticuloModal` | Knowledge Base | `POST /api/knowledge`. |
| `NewPlaybookModal` | Playbooks | `POST /api/playbooks`. |

`src/components/ui/FormModal.jsx` gestiona foco inicial, focus trap, `Escape`, restauración de foco y submit. `ActionModal.jsx` es un aviso simple cerrable. La cobertura de accesibilidad de estos modales es más completa que la de varios modales inline de las páginas.

### Filtros, fechas y exportación

- `src/components/ui/FilterDropdown.jsx` mantiene filtros seleccionados en el componente consumidor y cierra al hacer click fuera.
- `src/components/ui/DateRangePicker.jsx` mantiene fechas localmente, corrige automáticamente rangos invertidos y emite `{start,end}`; no llama APIs.
- `src/components/ui/ExportDropdown.jsx` solo implementa CSV mediante `downloadCSV`; Excel y PDF se muestran como “próximamente”.
- `src/hooks/useClickOutside.js` comparte el cierre de dropdowns y menús mediante listener `mousedown`.

### Dashboard personalizable

`src/hooks/useDashboardLayout.js` serializa layout, widgets activos y orden de KPIs en `localStorage`, valida versión y restablece `DEFAULT_LAYOUT` si la estructura guardada no coincide. No existe persistencia server-side del layout.

## 10. Matriz final de madurez

### Implementado

- Enrutamiento público/protegido y restauración de sesión.
- Filtros de navegación por permisos y guardas administrativas.
- Campañas, detalle de campaña, Ads operativo y conexión Meta a nivel de frontend.
- Prospect Finder, funnels, landings vinculadas a campañas.
- Inbox, llamadas, detalle de llamada, leads, detalle de lead, pipeline, detalle de oportunidad, reuniones y detalle de reunión.
- Email marketing con ciclo de borrador/validación/publicación/pausa.
- Growth Hub, gobierno empresarial, control de accesos y recetas Ads.
- OAuth y panel de integraciones de Organic Leads a nivel de contrato frontend.

### Parcial

- Dashboard: demo solo con flag explícito; fecha/comparación sin parámetros API.
- Insights: demo solo con flag explícito y filtros avanzados pendientes.
- Landings: importación de webs externas local y eliminación no conectada.
- Agentes: paneles de voz, escalado, mensajes y asociación de Knowledge Base sin API visible.
- Playbooks: importación de fichero sin persistencia visible y estadísticas constantes en parte del detalle.
- Knowledge Base: demo solo con flag explícito; tabs que aún no corresponden a filtros backend.
- Ads wizard: fallback local de estrategia si la IA remota falla.
- Redes sociales: Metricool es el proveedor de publicación/calendario; la app solo gestiona conexión, analítica, IA y borradores.
- Organic Leads: las tarjetas de visibilidad local/IA/competidores/leads quedan vacías hasta recibir datos reales; la navegación interna no crea rutas independientes.
- Llamadas, reuniones y pipeline: varias métricas/exports se calculan con la página cargada, no con series históricas completas.

### Pendiente o no verificable desde el frontend auditado

- Contrato API del Test de Voz: no aparece ninguna ruta `/api/` explícita en `VoiceTestPage.jsx`.
- Persistencia server-side del layout del Dashboard.
- Exportación XLSX/PDF en `ExportDropdown`.
- Gestión completa de webs externas y borrado de landings.
- Importación real de playbooks desde el botón de fichero.
- Superficies no implementadas dentro de algunos studios: escalado/voz de agentes, filtros avanzados de Insights y acciones de ayuda/configuración que solo muestran avisos.
- Métricas reales de Organic Leads hasta configurar OAuth, seleccionar propiedades y ejecutar sincronizaciones.

## Referencias principales

- `src/App.jsx:53-99`: mapa de rutas públicas, protegidas, detalle y administrativas.
- `src/components/Sidebar.jsx:19-79`: secciones y entradas de navegación.
- `src/components/ProtectedRoute.jsx:1-82`: shell autenticado y comportamiento móvil.
- `src/components/AdminRoute.jsx:14-52`: autorización administrativa.
- `src/contexts/AuthContext.jsx:5-34`: sesión y restauración.
- `src/lib/api.js:1-28`: cliente API autenticado y renovación de token.
- `src/lib/navigationPermissions.js`: permisos de navegación y fallback por rol.
- `src/hooks/useClickOutside.js` y `src/hooks/useDashboardLayout.js`: hooks transversales.
