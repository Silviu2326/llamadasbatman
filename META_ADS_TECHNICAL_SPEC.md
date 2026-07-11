# Meta Ads Automation — spec técnica de implementación

Este documento asume ya leídos `META_ADS_API.md` (qué puede hacer la API de Meta) y `META_ADS_AUTOMATION.md` (diseño de producto: wizard de 3 preguntas, playbooks por vertical, SLA de llamada, trazabilidad). Acá se baja a: qué modelos de Prisma se agregan, qué archivos de backend se crean, qué rutas expone la API, qué páginas nuevas necesita el frontend, y en qué orden se construye — todo referenciado contra el código real del repo, no genérico.

## 0. Encaje con la arquitectura existente (confirmado en código)

- **Dos servicios separados**: este backend (Fastify + Prisma + Postgres, en `backend/`) es el CRM/API; existe un **servicio de voz externo** aparte (`VOICE_SERVICE_URL`) que maneja Twilio/STT/TTS/IA en tiempo real. `campaigns.service.ts#startCampaign` ya hace `fetch(voiceUrl + '/campaigns/start')`. Todo lo nuevo de Meta Ads vive en **este backend**, no en el servicio de voz — el único punto de contacto con el servicio de voz sigue siendo "avisale que hay un lead nuevo para llamar", igual que hoy.
- **Patrón de carpetas**: `routes/*.ts` (registra plugin Fastify + hook `authenticate`) → `controllers/*.controller.ts` (extrae `orgId` de `request.user`, llama al service) → `services/*.service.ts` (Prisma, siempre `where: { orgId }`). Todo lo nuevo sigue este mismo patrón, sin inventar una capa distinta.
- **Tenant = `Organization`** (campo `orgId` en cada modelo), no existe concepto de "Cliente" separado. Cada organización de SilxarCRM es la que conecta su propia cuenta de Meta.
- **BullMQ ya está en el proyecto pero no está corriendo**: `backend/src/jobs/campaignDispatch.ts` y `automationRunner.ts` definen `Worker`s, pero **ningún archivo los importa** — ni `index.ts` ni ningún otro módulo. Hoy son código muerto. Esto es un prerequisito a arreglar antes de poder construir cualquier cola nueva (ver Fase 0 más abajo).
- **`Playbook` ya existe como modelo** — pero es el guion de llamada del agente de voz (`steps: Json`, referenciado por `Campaign.playbookId`), **no** el playbook de vertical de anuncios que describe `META_ADS_AUTOMATION.md`. Nombre en colisión: el nuevo modelo se llama **`AdPlaybook`** para no pisar el existente, y `Campaign` suma un campo nuevo `adPlaybookId` (además del `playbookId` que ya tiene).
- **La cadena de trazabilidad ya existe en el schema casi completa**: `Lead.campaignId` → `Call.leadId/campaignId` → `Meeting.leadId/callId` (la "Cita") → `Opportunity.leadId` (la "Venta", vía `stage: closed_won` + `value`). Solo falta un eslabón: `Campaign.adPlaybookId` para conectar `Vertical → AdPlaybook → Campaña`. No hace falta rediseñar nada del CRM existente.

## 1. Modelos de Prisma — qué se agrega

Todo en `backend/prisma/schema.prisma`, mismo estilo que los modelos existentes (`@id @default(cuid())`, `orgId` + relation, `createdAt`).

```prisma
model MetaAdAccount {
  id                 String   @id @default(cuid())
  orgId              String
  metaAdAccountId    String   // "act_123456789"
  metaPageId         String?
  metaBusinessId     String?
  systemUserTokenEnc String   // access token cifrado (ver sección Seguridad)
  status             String   @default("connected") // connected | revoked | error
  dailyBudgetCapCents Int?    // kill switch configurado por el cliente
  connectedAt        DateTime @default(now())

  org       Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId, metaAdAccountId])
}

model AdPlaybook {
  id                String   @id @default(cuid())
  vertical          String   // "gimnasio", "peluqueria_canina", ...
  offer             String   // "Prueba gratuita 7 días"
  leadMagnet        String?  // "Guía de entrenamiento"
  adCopy            String
  landingTemplateId String
  imagePrompt       String
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())

  campaigns Campaign[]

  @@unique([vertical])
}

model AdInsightSnapshot {
  id              String   @id @default(cuid())
  orgId           String
  campaignId      String
  metaAdSetId     String?
  capturedAt      DateTime @default(now())
  spendCents      Int
  impressions     Int
  clicks          Int
  leadsCount      Int
  costPerLeadCents Int?

  org      Organization @relation(fields: [orgId], references: [id])
  campaign Campaign     @relation(fields: [campaignId], references: [id])
}
```

Campos nuevos en modelos existentes:

```prisma
model Campaign {
  // ...campos existentes sin cambios...
  adPlaybookId   String?
  metaCampaignId String?   // ID de la Campaign de Meta
  metaAdSetId    String?
  metaAdId       String?
  landingSlug    String?   // para la landing pública, ver sección Frontend
  adStatus       String?   // draft | pending_review | active | disapproved | paused

  adPlaybook       AdPlaybook?         @relation(fields: [adPlaybookId], references: [id])
  adInsightSnapshots AdInsightSnapshot[]
}

model Lead {
  // ...campos existentes sin cambios...
  externalLeadId String?  // leadgen_id de Meta, para idempotencia del webhook

  @@unique([orgId, externalLeadId])
}
```

`Lead.source` ya existe (`String?`, sin constraint) — se usa con valores libres: `'meta_lead_ad'`, `'landing_ads'`, `'prospect_finder'` (ya usado hoy), `'manual'`. No hace falta un enum nuevo; es justo el campo que `META_ADS_AUTOMATION.md` pedía para la fuente intercambiable, y ya está en producción.

`Lead.customFields` (`Json?`, ya existe) guarda el snapshot de rubro/oferta/presupuesto que vino del wizard — necesario para la sección de datos de `META_ADS_AUTOMATION.md`, sin agregar columnas nuevas.

No se toca `Playbook` (guion de voz), `Meeting` ni `Opportunity` — se reusan tal cual.

## 2. Backend — servicios nuevos (`backend/src/services/`)

| Archivo | Responsabilidad |
|---|---|
| `metaAdAccount.service.ts` | Intercambio OAuth (`code` → `access_token`), guarda `MetaAdAccount` cifrado, revocación |
| `adPlaybook.service.ts` | CRUD de `AdPlaybook` + `findByVertical(vertical)` con normalización simple del texto (lowercase/trim) para el match del wizard |
| `assetGenerator.service.ts` | Fallback cuando no hay playbook: genera lead magnet (LLM) + prompt de imagen + copy. Reusa el cliente LLM ya existente en `backend/src/voice/intelligence/llm/cerebras.ts` (o Claude) — no se agrega un proveedor nuevo |
| `metaCampaignBuilder.service.ts` | Arma Campaign → Ad Set → Ad → Creative vía Graph API (`fetch` directo, mismo patrón que `campaigns.service.ts` usa para llamar al servicio de voz — no hace falta un SDK) |
| `metaAdReview.service.ts` | Consulta `effective_status` de una Ad, usado por el job de polling |
| `metaInsights.service.ts` | Pull de `/insights` por ad set, escribe `AdInsightSnapshot` |
| `adOptimizer.service.ts` | Reglas de `META_ADS_AUTOMATION.md` (kill switch, pausar por CPL, reasignar presupuesto, rotar por fatiga) leyendo `AdInsightSnapshot` |
| `metaLeadWebhook.service.ts` | Valida firma `X-Hub-Signature-256`, resuelve `leadgen_id` → `GET /{leadgen_id}`, llama a `leadIngestion.service.ts` |
| `metaConversions.service.ts` | Envía eventos (`Lead`, `Schedule`, custom) a la Conversions API |
| `leadIngestion.service.ts` | `ingestLead(orgId, source, raw)` — punto único de entrada para cualquier fuente (Meta, landing propia, futuras); normaliza a `Lead`, encola la llamada de alta prioridad |

Ninguno de estos requiere una librería nueva: Graph API es HTTP simple (`fetch`, ya usado en el proyecto), el cifrado del token usa `crypto` de Node (stdlib), el LLM ya está instalado.

## 3. Backend — rutas nuevas (`backend/src/routes/`)

Mismo formato de tabla que `BACKEND_SPEC.md`:

### Meta Ad Accounts `/api/meta/accounts`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/oauth/start` | Redirige a Facebook Login for Business |
| GET | `/oauth/callback` | Recibe `code`, intercambia token, guarda `MetaAdAccount` |
| GET | `/` | Estado de la cuenta conectada de la org |
| PUT | `/:id/budget-cap` | Configura el kill switch de gasto diario |
| DELETE | `/:id` | Desconectar cuenta |

### Ad Playbooks `/api/ad-playbooks`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Lista playbooks por vertical (admin) |
| POST | `/` | Crear playbook (admin) |
| PUT | `/:id` | Editar oferta/copy/landing/prompt (admin) |

Estas rutas usan `authorize(['admin'])` (middleware ya existe en `middlewares/authorize.ts` pero hoy no está enganchado en ninguna ruta — acá es el primer uso real).

### Ads Wizard `/api/ads`
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/wizard` | Recibe `{ vertical, objetivo, presupuestoMensual }`, busca playbook o genera fallback, crea `Campaign` en estado `draft`, dispara `metaCampaignBuilder` |
| GET | `/campaigns/:id/status` | Estado de publicación (draft/pending_review/active/disapproved) + métricas resumidas |

### Meta Webhooks `/api/meta/webhooks` (público, sin `authenticate`)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/leadgen` | Verificación de challenge de Meta (`hub.challenge`) |
| POST | `/leadgen` | Notificación de nuevo lead; valida firma, llama `metaLeadWebhook.service.ts` |

Sigue el mismo patrón que `routes/voice.ts` ya usa para el webhook de Twilio: ruta pública + validación propia (ahí es HMAC de Twilio; acá es `X-Hub-Signature-256` de Meta) en vez del hook `authenticate` de JWT.

### Public Landing `/api/public/landing` (público)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/:slug` | Devuelve los datos de la landing (oferta, lead magnet, copy) para renderizar |
| POST | `/:slug/lead` | Submit del formulario → `leadIngestion.service.ts` con `source: 'landing_ads'` |

### Extensión de `routes/campaigns.ts` (existente)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/:id/ad-insights` | Serie histórica de `AdInsightSnapshot` para el detalle de campaña |

## 4. Backend — jobs (BullMQ)

**Prerequisito (Fase 0, no específico de Meta):** hoy `jobs/campaignDispatch.ts` y `automationRunner.ts` no corren porque nada los importa. Hace falta un entrypoint que los arranque — la forma estándar con BullMQ es un proceso separado, no meterlo dentro del proceso HTTP de Fastify: `backend/src/worker.ts` que importe y arranque todos los `Worker`s, corrido con `node --import=tsx src/worker.ts` (un segundo `script` en `package.json`, ej. `"worker": "tsx watch src/worker.ts"`). Sin esto, ninguna cola nueva (incluida la de llamada prioritaria) va a ejecutar nada.

| Queue | Trigger | Qué hace |
|---|---|---|
| `lead-call-dispatch` | `leadIngestion.service.ts` encola apenas se crea el `Lead` | Prioridad máxima, sin batching — dispara la llamada vía el servicio de voz. Es una cola **nueva y separada** de `campaign-dispatch` (que hace envío en lote al iniciar campaña) porque tienen SLA distinto: esta es "ahora", esa es "cuando el usuario aprieta activar" |
| `ad-review-poll` | `metaCampaignBuilder` la encola tras crear el Ad | Reintenta cada ~1-5 min hasta `ACTIVE`/`DISAPPROVED` |
| `ad-insights-sync` | Cron (ej. cada 2hs) por cada `MetaAdAccount` activo | Llama `metaInsights.service.ts`, guarda `AdInsightSnapshot` |
| `ad-optimizer` | Cron (ej. cada 4hs), corre después de `ad-insights-sync` | Aplica las reglas de `adOptimizer.service.ts` |

## 5. Frontend — páginas nuevas

Convención existente confirmada: React Router clásico en `src/App.jsx`, páginas en `src/pages/*.jsx` usando `apiFetch` de `src/lib/api.js`, iconos `react-icons/ri`, estilos Tailwind + `dashboard.css`. El precedente más cercano a "una fuente de leads nueva con formulario + resultado" es `ProspectFinderPage.jsx` (`/prospectos`) — mismo esqueleto sirve de base para la del wizard.

| Página nueva | Ruta | Qué hace | Precedente a copiar |
|---|---|---|---|
| `AdsWizardPage.jsx` | `/captacion/nueva` | Las 3 preguntas + botón "Generar campaña"; llama `POST /api/ads/wizard`, muestra estado (buscando playbook / generando assets / esperando revisión de Meta) | `ProspectFinderPage.jsx` (form + `apiFetch` + estado de resultado) |
| `MetaAccountPage.jsx` | dentro de `Configuracion` o página propia `/captacion/conectar` | Botón "Conectar tu cuenta de Meta" (redirige a `/api/meta/accounts/oauth/start`), muestra estado conectado + input del tope de gasto diario (kill switch) | — (flujo OAuth nuevo, no hay precedente directo) |
| `AdPlaybooksAdminPage.jsx` | `/admin/ad-playbooks` (solo rol admin) | CRUD de playbooks por vertical | `Playbooks.jsx` / `PlaybookDetailPage.jsx` como maqueta visual (misma idea de lista+detalle), pero apuntando al nuevo endpoint `/api/ad-playbooks`, no al de guiones de voz |
| Tab "Ads" en `CampaignDetailPage.jsx` (existente, se extiende) | `/campaigns/:id` | Estado del anuncio (draft/pending/active/disapproved), spend, CPL, leads generados — consume `GET /:id/ad-insights` | — (se agrega como tab nuevo al detalle existente) |
| `PublicLandingPage.jsx` | `/l/:slug` — **fuera** de `<ProtectedRoute>`, sin JWT | Landing pública del cliente final: oferta + lead magnet + formulario de contacto | Página nueva, sin precedente — es la única página del proyecto sin autenticación |

Cambios adicionales: entrada nueva en `src/components/Sidebar.jsx` para "Captación" (wizard + estado de cuenta Meta); el rol admin ya existe en el JWT (`UserRole.admin`) para gatear `AdPlaybooksAdminPage`.

## 6. Variables de entorno nuevas

```env
META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v23.0
META_WEBHOOK_VERIFY_TOKEN=       # para el challenge GET /leadgen
META_TOKEN_ENCRYPTION_KEY=       # clave para cifrar systemUserTokenEnc (AES, via crypto de Node)
OPENAI_API_KEY=                  # openai ya es dependencia del backend, pero no hay key configurada en .env todavía — confirmar/agregar
```

`REDIS_URL` ya existe (lo necesitan las colas nuevas). `VOICE_SERVICE_URL`/`VOICE_SERVICE_SECRET` ya existen y se reusan tal cual para disparar la llamada — no hay variable nueva ahí.

## 7. Seguridad — puntos concretos

- `systemUserTokenEnc` se guarda cifrado (AES-256-GCM con `META_TOKEN_ENCRYPTION_KEY`), nunca en texto plano ni se expone al frontend — mismo criterio que ya aplica `BACKEND_SPEC.md` a las API keys del servicio de voz.
- El webhook `POST /api/meta/webhooks/leadgen` valida `X-Hub-Signature-256` (HMAC-SHA256 con `META_APP_SECRET`) antes de procesar — sin esto, cualquiera podría inyectar leads falsos.
- `Lead.externalLeadId` con `@@unique([orgId, externalLeadId])` evita duplicar el lead si Meta reintenta la notificación del webhook (hace reintentos si no devolvés 200 rápido).
- Las rutas de `AdPlaybook` son cross-org (no tienen `orgId`) — deben quedar detrás de `authorize(['admin'])`, no del `authenticate` genérico, para que un usuario `agent` de una org no pueda editar la biblioteca compartida.

## 8. Orden de construcción sugerido

1. **Arrancar BullMQ de verdad** (`worker.ts` + wiring) — sin esto no funciona nada de lo que sigue. No depende de Meta, se puede hacer y probar ya.
2. **Cola `lead-call-dispatch` + `leadIngestion.service.ts`** — entrega el SLA <30s usando leads que ya existen hoy (manuales o de Prospect Finder), antes de tocar Meta. Es la pieza de mayor impacto y la más independiente.
3. **`AdPlaybook` + CRUD admin** — cargar 2-3 verticales a mano.
4. **OAuth de Meta (`MetaAdAccount`)** — conectar una cuenta de prueba.
5. **Wizard + `assetGenerator` fallback** — funciona ya con datos de prueba aunque la campaña real de Meta todavía no se cree.
6. **`metaCampaignBuilder` + `ad-review-poll`** — primera campaña real publicada.
7. **Webhook de leadgen** → conecta con el `leadIngestion.service.ts` del paso 2.
8. **`ad-insights-sync` + `adOptimizer`**.
9. **`metaConversions.service.ts`**.
10. **Landing pública** (`/l/:slug` + endpoints públicos) — es la pieza más aislada, puede ir en paralelo con cualquiera de las anteriores desde el paso 3.

Cada paso es funcional y demostrable por separado — no hace falta terminar todo el spec para tener algo corriendo.
