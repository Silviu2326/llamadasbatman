# Meta Ads — Plan de cierre al 100%

*Reconciliación de `META_ADS_TECHNICAL_SPEC.md` (el plan original) contra el código real del repo, leído el 2026-07-05. El spec describía 10 pasos de construcción; esta versión marca cuáles ya están hechos, cuáles a medias, y detalla exactamente lo que falta con contrato de API y precedente de archivo a copiar.*

---

## 0. Resumen ejecutivo — qué cambió respecto al spec original

El spec asumía que había que arrancar de cero (BullMQ muerto, sin modelos, sin servicios). La realidad hoy:

| Fase del spec original | Estado real |
|---|---|
| 0. Arrancar BullMQ de verdad (`worker.ts`) | **HECHO.** `backend/src/worker.ts` existe, importa y arranca `adInsightsSync` + `adReviewPoll`; `npm run worker` está en `package.json`. |
| 1. Modelos Prisma | **HECHO**, y con un extra: `Campaign.maxCostPerLeadCents` ya está en el schema (el spec no lo pedía explícitamente, pero `adOptimizer.service.ts` ya lo usa). |
| 2. Cola `lead-call-dispatch` + `leadIngestion.service.ts` | **HECHO** — ver `leadCallDispatch.ts`, `leadIngestion.service.ts`. |
| 3. `AdPlaybook` + CRUD admin | **HECHO** en backend (`adPlaybooks.ts`, `authorize(['admin'])` ya enganchado). **Sin UI** — nadie puede cargar playbooks salvo escribiendo directo en la base de datos. |
| 4. OAuth de Meta (`MetaAdAccount`) | **HECHO** en backend. **Sin UI.** |
| 5. Wizard + `assetGenerator` fallback | **HECHO** en backend (texto/copy vía Claude). **Imagen real: no implementada** (solo se genera un `imagePrompt` de texto, no hay proveedor de imágenes conectado pese a que `openai` ya es dependencia del paquete). **Sin UI.** |
| 6. `metaCampaignBuilder` + `ad-review-poll` | **HECHO** — publica Campaign→AdSet→Creative→Ad real en Meta, polling de `effective_status` con backoff. |
| 7. Webhook de leadgen → `leadIngestion` | **HECHO** — firma HMAC verificada, idempotente, dispara auto-llamada. |
| 8. `ad-insights-sync` + `adOptimizer` | **HECHO** — cron cada 2h, kill-switch por gasto diario y por costo-por-lead. |
| 9. `metaConversions.service.ts` (Conversions API) | **NO CONSTRUIDO.** No hay ningún archivo ni referencia a Conversions API. Ver sección 6. |
| 10. Landing pública (`/l/:slug`) | **NO CONSTRUIDO — y es urgente.** El anuncio real que arma `metaCampaignBuilder.service.ts:69` apunta literalmente a `${APP_URL}/l/${campaign.landingSlug}`. Si se activa una campaña hoy, el link del anuncio en Meta lleva a una página que no existe (ni ruta de frontend, ni endpoint público de backend). Ver sección 5. |

**En una frase: el backend de Meta Ads está terminado en un ~85% (falta Conversions API e imagen real). Lo que falta para que el módulo sea usable de punta a punta es: la landing pública a la que apunta el anuncio (crítico, sin esto un anuncio activado no sirve para nada), y las 4 pantallas de frontend (conectar cuenta, wizard, playbooks admin, tab de resultados) — cero de las cinco existen hoy.**

---

## 1. Modelos de Prisma

Sin cambios respecto al spec — confirmado 1:1 contra `backend/prisma/schema.prisma`: `MetaAdAccount`, `AdPlaybook`, `AdInsightSnapshot`, más los campos nuevos en `Campaign` (incluye `maxCostPerLeadCents`, que el spec no detalló pero ya está) y `Lead.externalLeadId` con `@@unique([orgId, externalLeadId])`. No hace falta ninguna migración nueva para lo que sigue en este documento — **excepto** si se decide guardar el submit de la landing pública en un modelo propio (ver sección 5; se puede resolver reusando `leadIngestion.service.ts` sin modelo nuevo).

## 2. Servicios backend — estado archivo por archivo

| Archivo (spec) | Estado | Nota |
|---|---|---|
| `metaAdAccount.service.ts` | HECHO | OAuth, cifrado AES-256-GCM del token (`lib/tokenCrypto.ts`), `getAccount`, `setBudgetCap`, `disconnect`. |
| `adPlaybook.service.ts` | HECHO | `findByVertical` normaliza texto para el match del wizard. |
| `assetGenerator.service.ts` | PARCIAL | Genera oferta/copy/`imagePrompt` con Claude (`@anthropic-ai/sdk`), con fallback estático si falla. **No genera la imagen en sí** — comentario explícito en el código: "requiere OPENAI_API_KEY, no configurada todavía". |
| `metaCampaignBuilder.service.ts` | HECHO | `publishCampaign` + `activateCampaign`, ambos con llamadas reales a Graph API. Usa un anuncio de link simple a la landing propia (decisión consciente, no bug — el Lead Form nativo de Meta queda para cuando haya una Página real para probar). |
| `metaAdReview.service.ts` (spec) | HECHO, pero fusionado dentro de `jobs/adReviewPoll.ts` en vez de un archivo de servicio separado | Diferencia solo organizativa, no funcional — la lógica de polling + backoff (`MAX_ATTEMPTS=20`, 60s) está completa. |
| `metaInsights.service.ts` | HECHO | `fetchAndStoreInsights` — pull de `/insights` (`spend,impressions,clicks,actions`), calcula `costPerLeadCents`. |
| `adOptimizer.service.ts` | HECHO | `evaluateCampaign` — pausa real en Meta (Graph API) si se supera `dailyBudgetCapCents` o `maxCostPerLeadCents`. |
| `metaLeadWebhook.service.ts` | HECHO | Verificación HMAC-SHA256 con `timingSafeEqual`, fetch de `leadgen_id`, llama `leadIngestion.service.ts`. |
| `metaConversions.service.ts` | **NO EXISTE** | Ver sección 6 — sin esto, Meta no recibe señal de qué leads realmente se convirtieron en reunión/venta, así que su algoritmo de optimización de audiencia (`LEAD_GENERATION` optimization goal) nunca aprende de la calidad real del lead, solo de que "hubo un submit". Impacto: campañas más caras con el tiempo de lo que serían con Conversions API. |
| `leadIngestion.service.ts` | HECHO | `ingestLead` — idempotente por `externalLeadId`, encola `enqueueLeadCall`. |

## 3. Rutas — estado y lo que falta

### Ya construidas y registradas en `index.ts`

- `GET/PUT/DELETE /api/meta/accounts/*` — completo (sección OAuth + budget-cap + disconnect).
- `POST /api/ads/wizard`, `GET /api/ads/campaigns/:id/status` — completo.
- `GET/POST/PUT /api/ad-playbooks/*` — completo, con `authorize(['admin'])`.
- `GET/POST /api/meta/webhooks/leadgen` — completo, público, con verificación de firma.

### Faltan (necesarias para las pantallas de la sección 5)

```
GET /api/ads/campaigns/:id/insights
```
Lee el histórico de `AdInsightSnapshot` (hoy se escribe pero nadie lo lee por API). Agregar en `ads.controller.ts` + `ads.ts`; servicio: `metaInsights.service.ts` → `listInsights(orgId, campaignId)` → `prisma.adInsightSnapshot.findMany({ where: { orgId, campaignId }, orderBy: { capturedAt: 'asc' } })`.

```
PUT /api/ads/campaigns/:id/max-cpl
Body: { maxCostPerLeadCents: number }
```
Sin esto, el kill-switch de costo-por-lead de `adOptimizer.service.ts` solo se puede activar escribiendo directo en la base de datos.

```
GET  /api/public/landing/:slug
POST /api/public/landing/:slug/lead
```
**Crítico** — ver sección 5. Rutas públicas (sin `authenticate`), mismo patrón que ya usa `routes/voice.ts` para el webhook de Twilio (ruta pública + validación propia en vez del hook JWT). `GET` devuelve `{ offer, leadMagnet, adCopy }` buscando la `Campaign` por `landingSlug`; `POST` recibe `{ name, phone, email }` y llama `leadIngestion.service.ts#ingestLead(campaign.orgId, { source: 'landing_ads', campaignId: campaign.id, ... })` — reusa la misma pieza que ya usa el webhook de Meta, cero servicio nuevo.

## 4. Jobs (BullMQ) — estado

Confirmado en `backend/src/worker.ts`: arranca `adInsightsSync` (repeatable cada 2h vía `jobId` fijo, evita duplicar si corre en más de un proceso) y `adReviewPoll` (encolado por `activateCampaign`, backoff de 60s hasta 20 intentos). `adOptimizer.evaluateCampaign` corre **dentro** del mismo worker de `adInsightsSync`, no como cola separada — funcionalmente igual a lo que pedía el spec, solo un job menos de los que se habían planeado.

Lo único pendiente en esta capa es indirecto: si se agrega Conversions API (sección 6), conviene mandar el evento `Lead` desde `leadIngestion.service.ts` (submit real) y el evento `Schedule`/custom desde donde se crea la `Meeting` — no hace falta una cola nueva, puede ser una llamada `fetch` directa igual que el resto de la integración con Graph API.

## 5. Landing pública — el gap crítico que el spec ya preveía y no se construyó

Esto es lo más urgente del documento: **hoy, activar una campaña real en Meta publica un anuncio cuyo único call-to-action lleva a una URL que no responde nada.**

### Backend

- `GET /api/public/landing/:slug` y `POST /api/public/landing/:slug/lead` (contrato arriba). Sin JWT — es la única superficie pública nueva del proyecto además del webhook de Meta.
- Reusa `leadIngestion.service.ts` tal cual — cero servicio nuevo, solo dos rutas finas.

### Frontend

| Página nueva | Ruta | Detalle |
|---|---|---|
| `PublicLandingPage.jsx` | `/l/:slug` — **fuera** de `<ProtectedRoute>` en `src/App.jsx` (es la única página del proyecto sin JWT; revisar cómo `App.jsx` separa rutas públicas de `/login` para replicar el mismo patrón de "ruta pública" en vez de meterla dentro del layout autenticado) | `GET /api/public/landing/:slug` al montar → si 404, mostrar estado vacío; si existe, renderizar oferta + lead magnet + copy + formulario (`name`, `phone`, `email`) → `POST /api/public/landing/:slug/lead` → pantalla de "gracias, te llamamos en breve" (coherente con el SLA de <30s del resto del sistema). |

Sin backend ni frontend, no tiene sentido activar ninguna campaña real todavía — **esto debería ir antes que las pantallas de conectar cuenta/wizard en el orden de construcción**, aunque técnicamente no bloquea usar el wizard en modo `draft` sin publicar.

## 6. Conversions API — gap real, prioridad menor

`metaConversions.service.ts` del spec no se construyó. Sin esto:
- Meta solo sabe que hubo un "submit" en el link ad; no sabe si ese lead después agendó una reunión o compró.
- El algoritmo de optimización de Meta (`optimization_goal: LEAD_GENERATION`) no puede aprender a traer leads de mejor calidad, solo leads baratos — con el tiempo esto sube el costo por lead *bueno* aunque el costo por lead *bruto* se mantenga.

Para construirlo: un servicio que haga `POST /{pixel_id}/events` a Graph API con eventos `Lead` (al hacer `ingestLead` desde la landing) y un evento custom (ej. `Schedule`) al crear una `Meeting` ligada a esa campaña. Requiere un Pixel de Meta configurado por organización (campo nuevo en `MetaAdAccount`, ej. `metaPixelId`) — no bloquea nada de lo anterior, se puede dejar para después de que la landing y el wizard estén funcionando de punta a punta.

## 7. Frontend — las 4 pantallas que faltan (ninguna existe hoy)

Convención confirmada: `apiFetch` de `src/lib/api.js`, rutas en `src/App.jsx`, entrada en `src/components/Sidebar.jsx`, iconos `react-icons/ri`, estilos Tailwind + `dashboard.css`.

### 7.1 — `MetaAccountPage.jsx` → `/captacion/conectar`

Es la página que el propio backend ya espera (`oauthCallback` en `metaAccounts.controller.ts:19,24,29,32` redirige acá con `?status=connected|error`).

- Al montar: `GET /api/meta/accounts` → si `null`, botón "Conectar cuenta de Meta".
- **Punto a resolver antes de codear**: `GET /api/meta/accounts/oauth/start` requiere `authenticate` (JWT), pero es una navegación de página completa (redirect a Facebook), no un `fetch`. Un `<a href>` o `window.location.href` normal no manda el header `Authorization`. Dos salidas: (a) que `authenticate` acepte el JWT también por cookie adjunta en el login (cambiaría cómo se guarda el token hoy, que es `localStorage`), o (b) exponer un endpoint que `apiFetch` sí pueda llamar (`GET /api/meta/accounts/oauth/start-url`) y que devuelva `{ url }` ya armada por `buildOAuthStartUrl(orgId)`, y el frontend hace `window.location.href = url` con la URL de Facebook directamente — más simple, no toca el esquema de auth existente. Recomendado: (b).
- Si la cuenta existe: `metaAdAccountId`, `metaPageId`, `status`, campo editable de `dailyBudgetCapCents` (→ `PUT /:id/budget-cap`), botón "Desconectar" (→ `DELETE /:id`).
- Leer `?status=connected|error` de la query al cargar para el toast de confirmación.

### 7.2 — `AdsWizardPage.jsx` → `/captacion/nueva`

- Precedente a copiar: `src/pages/ProspectFinderPage.jsx` (form simple + `apiFetch` + estado de resultado) — mismo esqueleto.
- Formulario: `vertical` (dropdown poblado con `GET /api/ad-playbooks` para mostrar qué verticales ya tienen receta lista, con opción de texto libre si no hay receta), `objetivo`, `presupuestoMensual`.
- Submit → `POST /api/ads/wizard` → si `adStatus` viene `draft` sin cuenta Meta conectada, avisar con link a 7.1.
- Al terminar, navegar a `/campaigns/:id` con el tab "Anuncio" (7.4) abierto.

### 7.3 — `AdPlaybooksAdminPage.jsx` → `/admin/ad-playbooks` (rol `admin`)

- Precedente visual: `Playbooks.jsx`/`PlaybookDetailPage.jsx` (lista+detalle), pero apuntando a `/api/ad-playbooks`, no al de guiones de voz — son modelos distintos (`AdPlaybook` vs `Playbook`), no reusar el mismo componente de datos, solo el layout.
- CRUD: listar (`GET`), crear (`POST`, solo admin), editar oferta/copy/landing/prompt (`PUT`, solo admin). El rol admin ya está en el JWT (`UserRole.admin`), solo hace falta gatear la ruta en el router del frontend.
- Sin esta pantalla, cargar una receta por vertical requiere escribir SQL a mano — bloquea que el wizard use playbooks reales en vez de siempre caer al fallback generado por IA.

### 7.4 — Tab "Anuncio" en `CampaignDetailPage.jsx` (existente, se extiende — no se crea de cero)

`src/pages/CampaignDetailPage.jsx:33` ya tiene `const DETAIL_TABS = ['Resumen', 'Audiencia', 'Conversaciones', 'Configuración']` con un `useState('Resumen')` para el tab activo (línea 57). Agregar `'Anuncio'` al array y su bloque de render condicional, mismo patrón que los otros tabs:

- `GET /api/ads/campaigns/:id/status` → badge de `adStatus` (borrador/en revisión/activo/rechazado), `totalLeads`, `meetingsScheduled`, link a la landing (`landingSlug` → `/l/:slug`).
- `GET /api/ads/campaigns/:id/insights` (la ruta nueva de la sección 3) → gráfico de gasto/costo-por-lead en el tiempo — reusar `Recharts`, mismo patrón que `src/components/Insights.jsx`.
- Campo editable de `maxCostPerLeadCents` (→ `PUT /campaigns/:id/max-cpl`, la otra ruta nueva de la sección 3).

## 8. Variables de entorno

Ya presentes en `.env.example`: `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, `META_WEBHOOK_VERIFY_TOKEN`, `META_TOKEN_ENCRYPTION_KEY`. **Falta**: `OPENAI_API_KEY` (o el proveedor de imagen que se elija) si se quiere cerrar la generación real de imagen del punto 2; y, si se construye Conversions API (sección 6), un `metaPixelId` por cuenta (campo de datos, no env var).

## 9. Seguridad — ya cumplido, sin acción pendiente

- Token de Meta cifrado (AES-256-GCM), nunca en texto plano ni expuesto al frontend (`getAccount` omite `systemUserTokenEnc` explícitamente).
- Webhook valida `X-Hub-Signature-256` con comparación de tiempo constante (`timingSafeEqual`) antes de procesar.
- `Lead.externalLeadId` con `@@unique([orgId, externalLeadId])` evita duplicar leads si Meta reintenta la notificación.
- `AdPlaybook` (cross-org) protegido con `authorize(['admin'])`, no el `authenticate` genérico.
- Único punto nuevo a cuidar: las rutas públicas de la landing (sección 5) no deben poder leer/mutar nada fuera de la `Campaign` resuelta por `slug` — usar siempre `findFirst({ where: { landingSlug: slug } })` y nunca aceptar un `campaignId`/`orgId` del body.

---

## Orden de construcción sugerido (reemplaza el orden del spec original, que ya está mayormente ejecutado)

1. **Landing pública** (backend + frontend, sección 5) — sin esto, ninguna campaña activada sirve de nada. Es la pieza más aislada y no depende de ninguna pantalla nueva.
2. **Las 2 rutas backend chicas** (`insights` history + `max-cpl`, sección 3) — desbloquean el tab de resultados.
3. **`MetaAccountPage.jsx`** (7.1) — prerequisito de todo el flujo real con Meta (sin cuenta conectada, el wizard solo deja campañas en `draft`).
4. **`AdPlaybooksAdminPage.jsx`** (7.3) — para poder cargar 2-3 verticales de prueba antes de probar el wizard.
5. **`AdsWizardPage.jsx`** (7.2).
6. **Tab "Anuncio" en `CampaignDetailPage.jsx`** (7.4).
7. **Generación real de imagen** (proveedor de imagen + `OPENAI_API_KEY`) — no bloquea nada de lo anterior, la campaña se publica igual con el `imagePrompt` como texto de referencia mientras tanto.
8. **Conversions API** (sección 6) — optimización a mediano plazo, no bloquea el flujo end-to-end inicial.
