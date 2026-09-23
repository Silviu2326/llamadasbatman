# Estado del producto — Vendrava / VozIA

> **Documento histórico (11 de agosto de 2026).** Su inventario de integraciones y su estado de email preceden a cambios posteriores. Mautic se retiró del runtime, configuración y despliegue; Vendrava usa borradores y campañas locales con Resend. Para el estado actual consulta [docs/EMAIL_MARKETING_ACTIVACION.md](docs/EMAIL_MARKETING_ACTIVACION.md).

Fecha: 11 de agosto de 2026. Rama `agent/actualizar-plataforma`.

Auditoría de código real, no de documentación: cinco investigaciones en paralelo
(voz, captación, marketing, CRM, plataforma) más seis sondeos específicos, cada
hallazgo con su fichero y su línea. Lo que no se pudo verificar leyendo el
código está marcado como tal.

> Este documento caduca. Describe el estado en una fecha concreta, no el diseño
> del sistema. Para cómo funciona el motor de voz, ver
> [docs/ARQUITECTURA_VOZ.md](docs/ARQUITECTURA_VOZ.md).

---

## 1. Veredicto

El producto está más terminado de lo habitual: casi todas las pantallas leen de
la base de datos real, las integraciones son de verdad (Twilio, Meta Graph con
webhooks firmados, Google OAuth, Stripe, Metricool, Mautic) y el patrón dominante
es fallar con un error accionable en vez de simular éxito. No hay decorado.

Lo que falta no es código, son tres cosas: **credenciales**, un **proceso worker
con Redis** y el **alta de organizaciones**. Más un agujero abierto el 10/08/2026
al reescribir el motor de voz (§4.1).

**Se puede usar hoy** para operar la propia agencia con alta manual de clientes.
**No se puede vender hoy** como SaaS self-service.

---

## 2. Qué hace por una agencia de webs y aplicaciones

### 2.1 Captar clientes

| Capacidad | Evidencia | Estado |
|---|---|---|
| Prospect Finder: busca negocios por sector+ciudad en Google Places, deduplica por placeId/teléfono, puntúa y los importa a campaña | `services/prospecting.service.ts:63`, `controllers/prospects.controller.ts:20-211` | Funciona · falta `GOOGLE_PLACES_API_KEY` |
| Auditoría web automática del prospecto: SSL, robots, sitemap, Core Web Vitals reales vía PageSpeed Insights | `services/seoAgency.service.ts:405-431`, `digitalAudit.service.ts` | Funciona · mejora con `PSI_API_KEY` |
| Informe SEO compartible por link público | `PublicSeoAuditPage.jsx`, `PublicSeoReportPage.jsx` | Funciona |
| Llamada automática al prospecto con agente de IA | `voice/pipelines/vendravaVoice.ts` | Funciona con reservas graves · ver §4.1 |
| Email frío: investiga al prospecto (Brave + su web), escribe 3 versiones, las juzga y pule la ganadora | `services/emailCopy.service.ts`, `outboundEmail.service.ts:337-415` | Funciona · falta `RESEND_API_KEY`, `DEEPSEEK_API_KEY` |
| Meta Ads: crea campaña + adset + creatividad + anuncio reales, siempre en PAUSED | `services/metaCampaignBuilder.service.ts:43-140` | Funciona · falta `META_APP_ID/SECRET` y `APP_URL` pública |
| Webhook de Meta Lead Ads con firma HMAC verificada, idempotente | `services/metaLeadWebhook.service.ts:9-16`, `leadIngestion.service.ts:42-53` | Funciona |
| Organic Leads: Search Console, GA4 y Google Business Profile por OAuth PKCE | `services/organicGoogleIntegration.service.ts:1-150` | Funciona · solo recomienda, nunca ejecuta (diseño N1) |

### 2.2 Vender

| Capacidad | Evidencia | Estado |
|---|---|---|
| CRM de leads: ciclo new→contacted→qualified→converted, SLA de primera respuesta 4h automático | `services/leads.service.ts:23-29,403-409` | Funciona |
| Importación CSV asíncrona con deduplicación y job en background (máx 2.000 filas) | `leads.service.ts:313-367`, `controllers/leads.controller.ts:169-207` | Funciona |
| Filtros y export CSV server-side (máx 10.000 filas) | `leads.service.ts:82-157` | Funciona · los filtros de score y auditoría son solo client-side sobre la página cargada |
| Pipeline kanban con drag&drop, historial de etapas y outbox por movimiento | `services/pipeline.service.ts:150-175,350-472` | Funciona |
| Previsión de ingresos: pipeline, ponderado, best case y commit | `pipeline.service.ts:805-861` | Funciona · no convierte divisas (limitación documentada) |
| Predicción de cierre a 5 semanas ponderada por probabilidad | `pipeline.service.ts:694-713` | Funciona |
| Bandeja omnicanal: WhatsApp, email, voz y notas en un hilo, con estados de entrega reales | `services/conversations.service.ts:24-113`, `whatsapp.service.ts:122-223` | Funciona · requiere Twilio por organización |
| Sugerencia de respuesta con IA en el composer | `services/conversationAi.service.ts:4-48` | Funciona · 503 explícito sin `DEEPSEEK_API_KEY` |
| Revenue Intelligence: puntúa leads y recomienda siguiente acción, heurística explicable | `services/revenueIntelligence.service.ts:143-258` | Funciona · no está enlazado a la pantalla de oportunidad |
| Reuniones: creación, preparación con contexto real, completar/no-show/reprogramar | `services/meetings.service.ts:46-234` | Funciona · sin calendario externo, ver §4.6 |

### 2.3 Entregar el trabajo al cliente

| Capacidad | Evidencia | Estado |
|---|---|---|
| Radar de oportunidades de contenido | `services/contentOpportunity.service.ts:251` | Funciona · exige `DEEPSEEK_API_KEY`, sin fallback |
| Borrador + crítica en cuatro lentes, con enmascarado de datos personales siempre activo | `contentStudio.service.ts:299`, `contentCritic.service.ts:303` | Funciona · degrada a plantilla determinista sin IA |
| Aprobación del cliente por link público con token SHA-256 y caducidad | `contentApprovalLink.service.ts:41`, `PublicContentApprovalPage.jsx` | Funciona |
| Aprendizaje tras 3+ rechazos del cliente | `contentApproval.service.ts:264` | Funciona |
| Publicación en redes vía Metricool | `metricoolSync.service.ts:141-252` | Funciona · faltan credenciales por organización |
| Cadencia semanal automática (lunes 07:00 Madrid) | `jobs/contentWeeklyRefresh.ts` | Condicionado al worker · ver §4.3 |
| Landings y funnels con variantes IA y test A/B, publicadas en URL pública | `services/landingVariants.service.ts:172-304` | Funciona |
| Email marketing sobre Mautic: audiencias, campañas, A/B con z-test real, métricas | `mauticSync.service.ts`, `emailMetrics.service.ts`, `jobs/campaignSendRunner.ts` | Bloqueado sin Mautic desplegado · §4.5 |
| Blog público por cliente y knowledge base | `PublicBlogPage.jsx`, `KnowledgeBase.jsx:311-340` | Funciona |
| Generación de imágenes con `gpt-image-1` | `services/assetGenerator.service.ts:30` | Funciona · sin `OPENAI_API_KEY` devuelve vacío sin romper |
| Locución de contenido (Chatterbox local, ElevenLabs de respaldo) | `services/contentVoiceover.service.ts:128` | A medias · el servidor Chatterbox local ya no está en el repo |

### 2.3bis Planificar (nuevo, 12/08/2026)

| Capacidad | Evidencia | Estado |
|---|---|---|
| **Plan de crecimiento** en `/plan`: proyecta qué consigues invirtiendo X al mes, con el embudo real de la organización | `services/growthPredictor.service.ts`, `src/pages/GrowthPlanPage.jsx` | Funciona |
| Distingue tasas propias de referencias del sector, y lo dice en pantalla | `growthPredictor.service.ts` (`MIN_SAMPLE`, `FunnelRate.source`) | Funciona |
| Presupuesto mínimo para cerrar una venta, calculado del propio embudo | `budgetForOneSale` | Funciona |
| Recomendaciones ordenadas por impacto, señalando la etapa débil del embudo | `recommendations()` | Funciona |
| Avisa si el volumen proyectado no cabe en el plan contratado | `project()` con `CONSUMPTION_LIMITS` | Funciona |

### 2.4 Cobrar y operar

| Capacidad | Evidencia | Estado |
|---|---|---|
| Stripe: checkout, portal de cliente, webhook con HMAC y ventana anti-replay de 300s | `services/billing.service.ts:84-101` | Funciona · un solo plan de pago (`STRIPE_PRICE_PRO`) |
| Multi-tenant: filtro por `orgId` aplicado consistentemente, sesión revalidada contra BD en cada request | `middlewares/authenticate.ts:31-44` | Funciona |
| RBAC: 10 roles, ~40 permisos, entitlements por plan | `access-control/catalog.ts`, `entitlements.ts` | Funciona |
| Credenciales de integraciones cifradas AES-256-GCM | `lib/organizationCredentialsCrypto.ts`, `tokenCrypto.ts` | Funciona |
| Autenticación: JWT 15 min + refresh opaco rotado con revocación, cookie HttpOnly/Secure, rate limit 10/15min | `services/auth.service.ts:62-131`, `routes/auth.ts:6-13` | Funciona |
| Automatizaciones: motor de eventos, outbox durable sobre Postgres, backoff, dead-letter a 8 intentos | `jobs/outboxDispatcher.ts:169-212` | Funciona con worker vivo |
| Orquestador de planes con aprobación obligatoria y rollback compensatorio | `services/orchestration.runtime.ts:141-298` | Funciona con worker vivo |
| Observabilidad: `/health`, `/health/workers|queues|metrics` con token dedicado, heartbeat de worker, políticas de alerta | `observability/`, `index.ts:215-218` | Funciona |
| Interfaz en español e inglés | `src/i18n/index.js` | Funciona |

---

## 3. Cómo está desplegado hoy

> **12/08/2026:** ya hay `backend/Dockerfile`, `backend/railway.json` y una guía
> paso a paso en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md). El despliegue ya es
> reproducible desde el repositorio. La imagen **no se ha podido construir aquí**
> (el demonio de Docker no arranca en esta máquina): se han verificado por
> separado los pasos que ejecuta —`prisma generate` y `tsc`—, no la imagen final.

- Frontend en Vercel (`vercel.json`), apuntando a un backend en Railway
  (`llamadasspidermanback-production.up.railway.app`).
- **No hay Dockerfile ni `railway.json` en el repo**: la configuración de
  despliegue del backend vive fuera de git y no es reproducible desde aquí.
- `docker-compose.yml` solo levanta Redis y Mautic, no la aplicación.
- La API y el worker son **dos procesos distintos**: `npm start` y `npm run worker`.
- `npm run ops:production-gate` valida `REDIS_URL` y `BACKGROUND_WORKERS_ENABLED`,
  pero es un script manual que no está enganchado a ningún hook de despliegue.
- `npm test` exige una base PostgreSQL aislada (`TEST_DATABASE_URL`), con guard
  que aborta si apunta a desarrollo o producción. Hay 44 ficheros de test.

---

## 4. Bloqueantes, por gravedad

Resumidos aquí. Cada uno está desarrollado —causa, opciones, plan con ficheros,
esfuerzo, riesgo y criterio de cierre— en [docs/BLOQUEANTES.md](docs/BLOQUEANTES.md).

> **Actualización del 11/08/2026:** ocho de los diez están programados. Siguen
> abiertos el §4 (credenciales) y el §5 (Mautic), que son configuración e
> infraestructura, y las partes de §1 y §2 que dependen de decisiones tuyas
> —idioma del producto y registro público—. El detalle de lo hecho está en la
> sección 11 de BLOQUEANTES.md, incluidas tres correcciones a este informe.

### 4.1 🔴 El agente de voz ignora la configuración del CRM

El pipeline reescrito el 10/08/2026 tiene el prompt de sistema **hardcodeado y en
inglés** (`voice/pipelines/vendravaVoice.ts:33-40`): *"You are Carlos, an AI voice
assistant calling on behalf of Vendrava"*. El agente, el playbook y el guion que
un cliente configure en la interfaz **no llegan a la llamada**; el parámetro
`systemPrompt` se recibe y se descarta a propósito.

Causa: Cartesia Ink-2 con turnos automáticos solo soporta inglés, y mezclar un
prompt en español con STT y TTS en inglés rompe las dos puntas a la vez.

Consecuencias:
- No se puede llamar en español, que es el mercado que reflejan compliance y AMD.
- Si el producto se vende como "agentes de IA personalizables", hoy no lo es.
- `voice/evaluation/callJudge.ts` puntúa tres de sus seis dimensiones leyendo
  eventos (`turn.interruption`, `sales_action.selected`) que emitían módulos
  borrados ese día; esas dimensiones quedan clavadas en su valor base.
- `voice/analysis/postCallAnalysis.ts` quedó huérfano: solo lo invoca la cabina
  de navegador, nunca las llamadas reales, y apunta a un proveedor ya retirado.

**Resuelto el 11/08/2026.** Decisión: **el producto de voz es solo en inglés**.
El prompt del CRM ya llega al motor, un agente en otro idioma no llama, y el
resto del andamiaje (directivas del prompt, guion de respaldo, idioma por
defecto del agente, disclosure y frases de AMD) se ha traducido en consecuencia.
La interfaz del CRM sigue siendo bilingüe: la decisión afecta a las llamadas.

### 4.2 🔴 No hay alta de organizaciones ni recuperación de contraseña

`routes/auth.ts` solo expone login, refresh y logout. No existe `/register`,
`/forgot-password` ni `/reset-password`, y no hay ningún `organization.create`
en el código: cada cliente nuevo se da de alta a mano por seed o SQL directo, y
sus credenciales por organización se cargan una a una.

Vender self-service es imposible hoy. Vender con onboarding manual, sí.

### 4.3 🟠 Sin worker y sin Redis, el producto miente

El worker es un proceso aparte (`npm run worker`) que arranca 15 jobs con
polling propio. Si no está desplegado, o si falta `REDIS_URL`:

- No se despachan llamadas a leads (`enqueueLeadCall` devuelve `false` en
  silencio, `jobs/leadCallDispatch.ts:27-40`).
- No corren las automatizaciones basadas en BullMQ.
- No se dispara el radar semanal de contenido ni el runner de campañas de email.
- **La API sigue respondiendo que está sana.**

Inconsistencia de arquitectura conocida: `leadCallDispatch` y `automationRunner`
usan BullMQ/Redis mientras el resto de jobs usa el outbox sobre Postgres, que no
necesita Redis. Los primeros no tienen fallback.

### 4.4 🟠 Credenciales vacías

Sin cada una, su módulo responde con error honesto pero no hace nada:
`GOOGLE_PLACES_API_KEY`, `META_APP_ID`/`META_APP_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`/`SECRET`,
`DEEPSEEK_API_KEY`, `RESEND_API_KEY`/`EMAIL_FROM`, `BRAVE_SEARCH_API_KEY`,
`OPENAI_API_KEY`, `PSI_API_KEY`, `METRICOOL_USER_TOKEN`/`USER_ID`/`BLOG_ID`,
`MAUTIC_CLIENT_ID`/`SECRET`, y las de Twilio por organización.

Además hay **flags por organización** (`metricoolEnabled`, `mauticEnabled`) que
hay que activar aparte de las credenciales: fácil de olvidar en un alta.

### 4.5 🟠 Mautic no está desplegado

Todo el email marketing depende de una instancia real de Mautic más un campo
custom `crmleadid` creado a mano en su configuración (`mauticSync.service.ts:24-26`).
Sin eso, las campañas quedan en estado `error` explícito.

### 4.6 🟡 No hay integración de calendario

Las reuniones son una tabla en Postgres. No existe Google Calendar, Outlook,
Zoom ni `.ics` en ninguna dependencia. El botón "Unirse" cae a un
`https://meet.google.com` genérico cuando no hay URL (`Reuniones.jsx:360`), y el
modal de creación **ni siquiera expone un campo** para introducirla. La
"plataforma" de la reunión se infiere mirando si la URL contiene `"zoom"`.

Los recordatorios T-24h sí son reales (`jobs/temporalEventScheduler.ts:114-144`),
pero solo actúan si el usuario ha creado una automatización que los consuma.

### 4.7 🟡 El motor de secuencias de venta no tiene interfaz

El backend está completo y cubierto por tests (`services/salesSequence.service.ts:126-465`),
pero el formulario de Growth Hub solo envía nombre, descripción, estado y tipo
(`GrowthHubPage.jsx:174-178`): no hay editor de pasos ni selector de leads, y no
se llama a `/enroll`, `/pause`, `/resume` ni `/stop`. Una secuencia creada desde
la interfaz nace sin pasos y falla al matricular con `SEQUENCE_STEPS_INVALID`.

### 4.8 🟡 Restos de maqueta visibles

- `OpportunityDetailPage.jsx:622` — "Próximas acciones recomendadas" es un array fijo.
- `OpportunityDetailPage.jsx:824-827` — la pestaña "Actividad" es un array fijo
  con fechas relativas falsas, existiendo ya `SalesActivity` en el esquema.
- `OpportunityDetailPage.jsx:148` — `city` fijo a `'—'`.
- `Playbooks.jsx:251-252` — "Usados en campañas" y "Tasa de éxito" siempre `'—'`.
- `MeetingDetailPage.jsx:557` — pestaña "Historial" con texto estático.
- `KnowledgeBase.jsx` — "Visitas" y "Útiles" siempre nulos pese a existir `KnowledgeFavorite`.
- Los paneles etiquetados "Insights IA" del pipeline son heurística estadística,
  no un modelo (`pipeline.service.ts:665-739`). El nombre engaña.

### 4.9 🟡 Sin cuotas de consumo

Los límites por plan **sí se aplican**: `assertUsageLimit` está enganchado a la
creación de agentes, leads, campañas, automatizaciones y anuncios vía
`requireEntitlement(..., { limit: { resource } })`, con tests de contrato.

Lo que falta es techo para lo que cuesta dinero: minutos de llamada, tokens de
LLM, envíos de email, imágenes. Un cliente en plan `free` puede dejar llamadas
corriendo toda la noche y la factura de los proveedores es tuya.

### 4.10 🟡 Endurecimiento pendiente

`mauticSync.service.ts:1284` y `metaConversions.service.ts:164` resuelven por id
sin filtro de `orgId` explícito. Son flujos internos disparados por webhook u
outbox, no endpoints autenticados, así que el riesgo actual es bajo — pero les
falta defensa en profundidad.

Vestigios inertes del motor de voz anterior: `elevenLabsVoiceId` sigue en
`agentConfig.ts` y en el esquema. No rompe nada, confunde a quien configure un agente.

---

## 5. Camino más corto a estar operativo

1. **Decidir el idioma del producto** (§4.1). Bloquea todo lo demás en voz.
2. Arrancar `worker` + Redis en Railway y verificar con `/health/workers`.
3. Rellenar credenciales por prioridad: Twilio → Places → DeepSeek → Resend → Meta.
4. Desplegar Mautic con el `docker-compose` que ya está en el repo.
5. Añadir registro y reseteo de contraseña, o escribir el runbook de alta manual.
6. Limpiar los restos de maqueta de §4.8 para que ninguna demo enseñe datos falsos.
7. Versionar el Dockerfile del backend y enganchar `ops:production-gate` al despliegue.

---

## 6. Lo que no existe y quizá se espera que exista

- Calendario externo, salas de videollamada reales.
- Registro self-service, prueba gratuita, recuperación de contraseña.
- Cuotas de uso por plan.
- Meta Lead Forms nativos: los anuncios llevan a una landing propia, no a un
  formulario nativo de Meta (documentado en `metaCampaignBuilder.service.ts:38-41`).
- Ejecución automática en Organic Leads: recomienda, no actúa (diseño N1 explícito).
- Condiciones, ramas y lógica AND/OR en el motor de automatizaciones: hoy es una
  lista lineal de acciones por paso.
- Vista de calendario mensual o semanal: Reuniones es una tabla filtrable.

---

## 7. Método

Auditoría por agentes en paralelo sobre el árbol de código, sin ejecutar la
aplicación. No se verificaron: el estado real del `.env` de producción, si las
migraciones de Prisma están aplicadas en el entorno objetivo, ni el
comportamiento en vivo de ninguna integración externa. Todo lo demás sale de
leer el código citado.


