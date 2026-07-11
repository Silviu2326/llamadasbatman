# Lead Generation + Auditoría SEO — Implementación

Registro de lo que se construyó a partir del análisis en `LEAD_GEN_AUDITORIA_SEO.md`
(traído de `sprintmarkt-crm`) y adaptado al stack de VozIA (Fastify + Prisma/Postgres + React).

## Backend

### `backend/src/services/digitalAudit.service.ts`
Puerto directo de `digital_audit.py`. Dado `{ name, website?, sector? }`:
- Hace `fetch` del HTML público (con `AbortController` + timeout, User-Agent de navegador
  para evitar 403 de Cloudflare/anti-bot).
- Extrae señales SEO por regex: title, meta description, viewport, canonical, schema.org,
  Analytics/GTM, Meta Pixel.
- Detecta redes sociales (IG/FB/LinkedIn/TikTok/YouTube/X/WhatsApp) por regex sobre el HTML.
- Detecta tecnología operativa: booking, ecommerce, pago, chat, constructor DIY (Wix/Squarespace).
- Calcula dos scores 0-100: `publicScore` (presencia pública) y `opsScore` (madurez operativa),
  y `opportunity` = mayor de los dos huecos → `tier` (`HOT`/`WARM`/`COLD`).
- Devuelve `opportunities[]` con severidad + producto sugerido (web/seo/marketing/ia/software) + pitch.
- Sin dependencias nuevas (usa `fetch` nativo de Node), sin cola (`fetch` + regex, <10s).

### `backend/src/services/prospecting.service.ts`
Sustituye a ScrapMarkt: llama a **Google Places API (Text Search, v1)** con
`textQuery: "{sector} en {city}"` y normaliza cada resultado a `Prospect`
(`placeId, name, address, phone, website, rating, userRatingCount, mapsUri`).

### Rutas nuevas (registradas en `backend/src/index.ts`)
| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/leads/:id/audit` | Audita `website` (del body o de `lead.customFields.website`), guarda el resultado en `lead.customFields.digitalAudit` |
| `GET` | `/api/leads/:id/audit` | Devuelve el último audit guardado (o `null`) |
| `POST` | `/api/prospects/search` | `{ sector, city, country? }` → candidatos de Google Places, sin guardar |
| `POST` | `/api/prospects/import` | `{ campaignId?, items[] }` → crea leads reales vía `leadsService.createLead` con `source: "prospecting"` |

Todas protegidas por el mismo hook `authenticate` que el resto de rutas del CRM.

### Modelo de datos
**Sin migraciones de Prisma.** `Lead.customFields` (ya `Json?`) guarda tanto el audit
(`digitalAudit`) como los metadatos de prospección (`website, address, rating, placeId`, ...).
`Lead.source` es `String?` libre, así que `"prospecting"` no requiere tocar el enum.

### Config
`GOOGLE_PLACES_API_KEY` añadida a `backend/.env.example`. Requiere habilitar **"Places API (New)"**
en Google Cloud (no la Places API legacy) + facturación activa, y restringir la key **por IP**
(no por HTTP referrer, porque la llamada es servidor-a-servidor).

## Frontend

### `src/pages/ProspectFinderPage.jsx` (página nueva)
- Formulario sector + ciudad → `POST /api/prospects/search`.
- Tabla de resultados con selección múltiple, checkbox "seleccionar todos".
- Selector de campaña (opcional, carga `GET /api/campaigns`).
- Botón "Importar seleccionados" → `POST /api/prospects/import`, quita de la lista los ya importados.
- Añadida al router (`/prospectos` en `src/App.jsx`) y al sidebar ("Prospect Finder").

### `src/pages/LeadDetailPage.jsx` (card nueva: `DigitalAuditCard`)
- Carga el audit guardado al abrir la ficha (`GET /api/leads/:id/audit`).
- Input de web + botón "Auditar ahora" / "Re-auditar" → `POST /api/leads/:id/audit`.
- Muestra `publicScore`, `opsScore`, badge de `tier` (HOT/WARM/COLD) y lista de oportunidades
  con punto de color por severidad.

## Verificación realizada
- `tsc --noEmit` limpio en `backend/`.
- `vite build` limpio en frontend.
- Backend arrancado en real: las rutas nuevas responden `401` sin token (confirma que están
  registradas y protegidas, no un 404 de ruta inexistente).
- **No verificado:** el flujo completo en navegador (login → abrir lead real → auditar → ver
  resultado pintado; buscar prospectos reales con una key de Places válida). Pendiente de
  probar con Chrome cuando haya `GOOGLE_PLACES_API_KEY` real.

## Descartado deliberadamente (ver análisis original)
- Servicio ScrapMarkt en Python aparte — Places API cubre lo mismo sin runtime adicional.
- Lighthouse / auditoría de performance real — el heurístico ya basta para el pitch comercial.
- Tabla `Audit` dedicada en Prisma — sin caso de uso de histórico hoy, `customFields` alcanza.

---

## Mejoras posibles

### Auditoría SEO
- **Caché/expiración**: hoy cada click en "Auditar ahora" repite el fetch aunque la web no haya
  cambiado. Guardar `auditedAt` y avisar/bloquear re-auditar si es menor a, digamos, 24h.
- **Enriquecimiento GBP**: el score contempla `gbpRating`/`gbpReviews` pero hoy nunca se pasan —
  conectar con Google Places Details (ya se tiene la key de Places) para rellenarlos automáticamente
  cuando el lead viene de `source: "prospecting"` (el `placeId` ya se guarda en `customFields`).
- **Bulk audit**: auditar todos los leads de una campaña de una vez. Aquí sí tendría sentido un
  worker BullMQ (`auditRunner.ts`, calcado de `automationRunner.ts`) en vez de golpear la API
  secuencialmente desde el frontend.
- **Falsos negativos anti-bot**: si el sitio bloquea el fetch (Cloudflare, etc.), hoy se marca
  `webReachable` con severidad baja "revisar manualmente" — podría integrarse un fallback con
  un servicio de rendering (p. ej. un headless browser) solo para ese caso, si el volumen lo justifica.
- **Historial de score**: guardar cada audit en un array dentro de `customFields` (o tabla aparte
  si el reporting lo pide) para poder mostrar evolución del score a lo largo del tiempo.

### Prospección
- **Paginación / más de 20 resultados**: Text Search v1 limita a 20 por página; si se necesita más
  volumen por búsqueda, usar `pageToken` y encadenar peticiones (ahí sí un job async con progreso).
- **Deduplicación**: `prospects/import` no comprueba si un `placeId`/teléfono ya existe como lead
  en la organización — se pueden crear duplicados si se busca la misma zona dos veces.
- **Email**: Google Places no da emails; si se necesita ese dato, habría que combinarlo con otra
  fuente (scraping del propio `website`, o un enrichment API de terceros).
- **Rate limiting propio**: cada búsqueda es una llamada de pago a Google — vale la pena un límite
  por usuario/día en `prospects/search` para evitar facturas sorpresa.

### Frontend
- **Auditoría en bulk desde `Leads.jsx`**: hoy solo se audita desde la ficha individual; un botón
  "Auditar seleccionados" en la tabla de leads sería el complemento natural del Prospect Finder.
- **Persistir campaña por defecto**: recordar la última campaña usada en el Prospect Finder
  (localStorage) para no tener que reseleccionarla en cada búsqueda.
- **Loading states más finos**: el audit y la búsqueda de prospectos son operaciones de red con
  latencia variable (Places puede tardar, el fetch de audit depende de la web del lead) — un
  spinner con timeout visible ayudaría a que no parezca colgado en webs lentas.
