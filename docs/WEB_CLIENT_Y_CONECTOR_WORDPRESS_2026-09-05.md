# Script universal y conector de WordPress (2026-09-05)

Hasta hoy Vendrava solo podía **leer** la web de un cliente (auditoría SEO, importación del perfil). La página Conexiones → Web ofrecía modos de conexión y capacidades que no tenían código detrás: elegir «plugin» marcaba «Cambiar contenido» como disponible sin que nada lo hiciera, y el snippet apuntaba a un `web-client.js` en un CDN que no existía.

Este cambio deja dos vías reales para actuar sobre webs de clientes.

## 1. Script universal (`web-client.js`)

- **Fuente única:** `backend/public/web-client.js`. Lo sirve el backend en `GET /web-client.js` (`routes/webClient.ts`) con caché de una hora y ETag. La copia antigua en `public/` del frontend se ha eliminado.
- **URL por defecto:** `${PUBLIC_HOST}/web-client.js`. `VENDRAVA_WEB_CLIENT_URL` queda vacía en `.env.example` y solo se rellena si se publica en un CDN.
- **Señales que envía:** `page_view` (incluida navegación SPA por `pushState`/`popstate`), `form_submit`, `click_phone`, `click_email`, `click_outbound` y cualquier `data-vendrava-event="…"` en el elemento clicado o en el formulario. API pública: `window.VendravaWeb.track('nombre')` y cola `window.vendravaq`.
- **Lo que nunca envía:** valores de formularios, cookies ni identificadores de persona. Solo `siteKey`, nombre de evento, ruta y referrer, por GET con una imagen (sin CORS, sin cuerpo).

## 2. Verificación real de la instalación

- `WebsiteConnection.lastEventAt` (migración `20260905160000_website_connection_last_event`).
- `recordWebsiteEvent` marca la conexión como `connected` con la primera señal y refresca `lastEventAt` como mucho una vez por minuto.
- `GET /api/web-connections` devuelve `signals` por conexión: eventos de los últimos 7 días por nombre, total, última señal y `verified`. La UI muestra «Recibiendo señales» o «Sin señales todavía».

## 3. Conector de WordPress

Dos niveles, según lo que tenga el cliente instalado:

| Nivel | Requiere | Permite |
|---|---|---|
| API REST nativa (`wp/v2`) | Usuario Editor/Admin + contraseña de aplicación (WP ≥ 5.6, HTTPS) | Listar y editar título, contenido y extracto de páginas y entradas |
| Plugin **Vendrava Connect** (`vendrava/v1`) | Instalar `integrations/wordpress/vendrava-connect/` | Además: título SEO y meta description por página, e instalar el script universal sin tocar el tema |

- **Servicio:** `backend/src/services/wordpressConnector.service.ts`. Cliente REST con la misma barrera anti-SSRF que la auditoría (redes privadas bloqueadas salvo `ALLOW_PRIVATE_INTEGRATION_NETWORKS=true`), sin seguir redirecciones con credenciales, con timeout y límite de cuerpo.
- **Credenciales:** cifradas en `OrganizationIntegrationCredential` con `provider = wordpress` y **un slot por conexión web**. No aparecen en el catálogo de proveedores BYOK.
- **Estado del conector:** `WebsiteConnection.detection.connector` (`canEdit`, `plugin`, `pluginVersion`, `seoPlugin`, `username`, `scriptInstalled`, `verifiedAt`). Las capacidades de la tarjeta ahora se calculan de este estado, no del modo elegido.
- **Auditoría:** cada conexión, desconexión, instalación del script y edición de página escribe en `AuditLog` con antes y después (`web_connection.wordpress.*`).

### Endpoints (`/api/web-connections/:id/wordpress/…`)

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| POST | `/connect` | `integrations.manage` | Verifica usuario + contraseña de aplicación, detecta el plugin, guarda la credencial |
| POST | `/verify` | `integrations.manage` | Vuelve a comprobar; si la credencial falla, la conexión pasa a `degraded` |
| DELETE | `/` | `integrations.manage` | Revoca la credencial y vuelve al modo script |
| POST | `/install-script` | `integrations.manage` | Con plugin: escribe siteKey, endpoint y URL del script en WordPress |
| GET | `/pages?type=pages\|posts&search=` | `integrations.read` | Lista hasta 100 páginas o entradas con su SEO (si hay plugin) |
| GET | `/pages/:pageId` | `integrations.read` | Una página con contenido |
| PUT | `/pages/:pageId` | `integrations.manage` | `title`, `content`, `excerpt`, `seoTitle`, `metaDescription` |

### Plugin Vendrava Connect

- Un solo archivo PHP (`vendrava-connect.php`) más `readme.txt`. Se instala comprimiendo la carpeta o copiándola a `wp-content/plugins/`.
- Autenticación: contraseñas de aplicación nativas de WordPress. No crea tokens ni usuarios.
- Metadatos SEO: escribe donde los lee el plugin SEO activo (Yoast: `_yoast_wpseo_*`; Rank Math: `rank_math_*`; All in One SEO: tabla `aioseo_posts`). Sin plugin SEO, guarda claves propias y las imprime en el `<head>`.
- Página de ajustes en Ajustes → Vendrava Connect (normalmente no hay que tocarla: Vendrava envía los valores al instalar el script).

## 4. Frontend

- **Conexiones → Web:** bloque de señales por conexión; panel «Conector WordPress» con formulario de conexión, estado de API/plugin/script, botones de instalar script, comprobar, desconectar y editor de páginas (título, título SEO, meta description). Las capacidades y los pasos de instalación reflejan lo que existe; git, SFTP y edge dicen que aún no tienen conector.
- **Captación → Convertir → SEO → «Aplicar los arreglos»:** además de aplicar el título y la meta a una landing de Vendrava, se puede aplicar a una página del WordPress conectado (solo webs con plugin).

## Pruebas

`backend/src/__tests__/wordpressConnector.test.ts`: cabecera Basic auth, rutas sin permalinks, bloqueo de redirecciones y redes privadas, descubrimiento de la raíz REST y cálculo de capacidades. Se ejecutan con el runner habitual (`npm test` en `backend/`).

## Pendiente

- Los modos git, SFTP y edge siguen sin conector. Shopify, Webflow y Wix solo tienen el script universal.
- Los eventos recibidos se agregan para la tarjeta de conexión, pero todavía no alimentan la telemetría de landings ni los informes.
- Un `vite build` del frontend falla hoy por un trabajo en curso ajeno a este cambio: `src/pages/backoffice/BackOfficePage.jsx` importa un `backoffice.css` que no existe en el repositorio.

---

# Conector Git con pull request (2026-09-05, misma tarde)

Responde a la pregunta «si la web es de código, que podamos programar». Para webs de código propio (Next.js, Astro, HTML estático, o cualquier proyecto en GitHub) el cliente conecta su repositorio y Vendrava propone cambios como **pull requests**. Vendrava nunca escribe en la rama principal: publicar es aprobar y fusionar el PR con el despliegue que el cliente ya tenga (Vercel, Netlify, su servidor).

## Cómo funciona

1. **Conectar.** El cliente crea un token fine-grained de GitHub limitado al repositorio, con Contents y Pull requests en escritura, y lo introduce en Conexiones → Web. Vendrava comprueba que el token puede escribir y guarda el token cifrado con un slot por conexión (`provider = github`).
2. **Proponer.** Alguien describe el cambio en lenguaje natural (o lo dispara la pestaña SEO). Se crea una fila `WebsiteChangeProposal` y un `Job` de tipo `web.git.proposal` que ejecuta el worker.
3. **El agente** (`gitConnector.service.ts`, sin clonar nada, solo API de GitHub):
   - lee el árbol del repositorio y descarta dependencias, binarios, lockfiles, secretos y la carpeta de CI;
   - pide al modelo qué archivos leer (máximo 8) y los descarga;
   - pide al modelo el contenido completo de los archivos a cambiar;
   - valida: rutas seguras, solo archivos leídos completos (un archivo grande se muestra recortado y es de solo lectura), tamaño acotado, sin cambios vacíos;
   - crea la rama `vendrava/<slug>-<id>`, un único commit (blobs + tree + commit por la Git Data API) y abre el PR con resumen, petición original y lista de archivos.
4. **Seguir y cerrar.** La tarjeta muestra estado, checks de CI (check-runs y status combinado del commit), enlace al PR, y permite cerrarlo sin fusionar (borra la rama).

Las builds y los tests los ejecuta la CI del propio repositorio sobre el PR. Vendrava no ejecuta código del cliente.

## Endpoints (`/api/web-connections/:id/git/…`)

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| POST | `/connect` | `integrations.manage` | Verifica token y repositorio, guarda la credencial |
| POST | `/verify` | `integrations.manage` | Revalida; si el token ya no sirve, la conexión pasa a `degraded` |
| DELETE | `/` | `integrations.manage` | Revoca el token y vuelve al modo script |
| GET | `/proposals` | `integrations.read` | Últimas propuestas |
| POST | `/proposals` | `integrations.manage` + `costs.request` | Encola una propuesta (`instructions`, `title?`, `source?`) |
| GET | `/proposals/:proposalId?refresh=1` | `integrations.read` | Estado; con `refresh` sincroniza PR y checks desde GitHub |
| POST | `/proposals/:proposalId/close` | `integrations.manage` | Cierra el PR sin fusionar |

Máximo dos propuestas en curso por web. Un fallo no se reintenta solo (reintentar abriría un segundo PR).

## Datos y configuración

- Modelo `WebsiteChangeProposal` (migración `20260905180000_website_change_proposals`): estado `queued|running|proposed|no_changes|failed|merged|closed`, rama, número y URL del PR, resumen, archivos con líneas añadidas y quitadas, estado de checks y error legible.
- `ConnectorState` ahora es una unión: `wordpress` o `git`. `capabilitiesFor` marca contenido, SEO y publicación como disponibles solo si el token puede hacer push.
- Variables nuevas en `.env.example`: `WEB_GIT_AGENT_PROVIDER_ID` (proveedor LLM del agente; por defecto el de la importación web u `openai-chat`) y `GITHUB_API_URL` (solo GitHub Enterprise).
- El modo `git` se ofrece también a webs WordPress y de tecnología desconocida.

## Frontend

- Conexiones → Web: panel «Repositorio y pull requests» con formulario de conexión, estado del acceso, caja para describir un cambio, y lista de propuestas con estado, CI, enlace a GitHub, actualizar y cerrar. La lista se refresca sola mientras el agente trabaja.
- Captación → Convertir → SEO → «Aplicar los arreglos»: botón «Proponer pull request» que encola una propuesta con el título y la meta description sugeridos.

## Pruebas

`backend/src/__tests__/gitConnector.test.ts`: parseo de repositorios, cabeceras de la API, filtrado del árbol (dependencias, binarios, secretos, CI), rutas seguras, validación de cambios del modelo y capacidades.

## Límites conocidos

- Solo GitHub. GitLab y Bitbucket tendrían la misma forma con otra API.
- Un solo pase del agente: no itera sobre el resultado de la CI. Si el PR sale en rojo, se cierra y se vuelve a pedir con más detalle.
- El agente no puede editar archivos de más de 40 KB ni tocar más de 10 archivos por propuesta.
