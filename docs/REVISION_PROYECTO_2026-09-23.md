# Revisión del proyecto — 23 de septiembre de 2026

Revisión de solo lectura de Vendrava/VozIA (frontend React + Vite y backend
Fastify + Prisma). No se tocó el VPS, no se hizo ninguna llamada y no se
imprimieron secretos. En la revisión solo se corrigió una prueba offline
desactualizada (ver §1); después se corrigieron las páginas de Growth por debajo
de 7 (ver §7).

Los hallazgos marcados con ✔ se comprobaron leyendo el código a mano; el resto
proceden de revisiones automatizadas que siguieron cada flujo hasta el backend y
citan `archivo:línea`. Las rutas son relativas a la raíz del repositorio.

---

## 1. Compilación y pruebas

| Comprobación | Resultado |
|---|---|
| `npm run build` (raíz) | ✅ OK. Aviso: el chunk `index` pesa 591 kB (>500 kB) |
| `npm run build` (backend, tras `prisma generate`) | ✅ OK |
| `npm run test:offline` (backend) | ✅ 4/4 tras la corrección |
| `src/__tests__/*.offline.test.ts` (backend) | ✅ 48/48 |
| `npm run zombies:test` | ✅ 14/14 |
| `npm run check:styles` | ✅ OK (76 entradas lazy, 363 ficheros) |

No se ejecutaron las pruebas de integración (`npm test`) porque requieren una base
de datos de pruebas.

**Corrección aplicada:** `backend/scripts/test-runtime.offline.test.mjs` exigía el
literal `url: databaseUrl`, pero `backend/src/lib/prisma.ts:42` ahora usa
`url: withColdStartTolerance(databaseUrl)`. La aserción acepta ambas formas. Era
el fallo previo que ya mencionaba `CLAUDE.md`.

---

## 2. Seguridad

### 2.1 🔴 Crítico — secretos reales en el historial de Git ✔

El commit `9ca9d1b` añadió `backend/.env` con valores reales. Se retiró del árbol
en `c4f3cad`, pero sigue en el historial de `origin/main`. Variables afectadas:

- `DATABASE_URL` (Neon, con usuario y contraseña)
- `JWT_SECRET`
- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY`
- `CEREBRAS_API_KEY`

**Acción:** rotar las cinco credenciales (incluida la contraseña del rol de Neon).
Purgar el historial es opcional y no sustituye a la rotación, porque cualquier
clon anterior ya las contiene. En el árbol actual no hay secretos reales; los de
la documentación son marcadores.

### 2.2 Resto de hallazgos de seguridad

| Severidad | Hallazgo | Ubicación |
|---|---|---|
| Alta ✔ | `PUT /agents/:id` acepta `lifecycleStatus: 'active'` e `isActive`, lo que salta la publicación (consentimiento de voz y evaluación ≥75) | `backend/src/controllers/agents.controller.ts:80`, `services/agents.service.ts:80` |
| Alta | `restoreAgentVersion` restaura `lifecycleStatus`, `isActive` y `voiceId`: reactiva un agente pausado por revocar consentimiento | `services/agents.service.ts:96,186` |
| Media-alta | `voiceId` no se valida contra la organización: otra organización podría usar una voz clonada privada conociendo su ID | `controllers/agents.controller.ts:69`, `voice/tts/fishAudioTts.ts:107` |
| Media | `/health/integrations*` es público, expone el estado de los workers y con `probe=true` llama a Twilio y Metricool con credenciales del servidor | `routes/integrationHealth.ts:6,9` |
| Media | Sin `TRUST_PROXY=true`, el rate limit por IP es compartido por todos los clientes tras el proxy; un atacante puede bloquear el login | `backend/src/index.ts:121,141-154` |
| Media-baja | WebSockets (`/voice-sim/live`, Socket.IO) no comprueban revocación de sesión ni pertenencia | `index.ts:381`, `websockets/index.ts:65` |
| Baja | Verificación de Meta acepta token vacío si falta `META_WEBHOOK_VERIFY_TOKEN` | `routes/metaWebhooks.ts:22` |
| Baja | `NODE_ENV=test` omite la comprobación de sesión | `middlewares/authenticate.ts:77` |

**Revisado y correcto:** JWT con secreto ≥32 caracteres, `tokenType`, revocación y
pertenencia; CORS con lista explícita; todos los webhooks verifican firma en tiempo
constante (Meta, Stripe, Resend/Svix, Twilio, WhatsApp, Magnific, pasarela
Zadarma); sin inyección SQL (el único `$executeRawUnsafe` está parametrizado); en la
muestra revisada, todas las mutaciones por `id` van precedidas de un
`findFirst({ id, orgId })`.

---

## 3. Flujo de llamadas (Zadarma)

| Severidad | Hallazgo | Ubicación |
|---|---|---|
| Alta ✔ | El `tick()` de la cola PostgreSQL no evita solapamientos: cada 5 s reclama otro trabajo aunque la pasarela solo admite una llamada. La pasarela responde 409, pero `attempts` ya se incrementó; tras 3 rechazos el lead se descarta en silencio y el trabajo queda `completed` | `backend/src/lib/databaseQueue.ts:113-127`, `jobs/leadCallDispatch.ts:31,50` |
| Alta ✔ | `requestId: randomUUID()` en cada intento anula la idempotencia de la pasarela: un timeout ambiguo (fetch 60 s) puede causar una segunda llamada al mismo contacto | `voice/telephony/outbound.ts:33` |
| Alta ✔ | `phoneNumber: data.phoneNumber \|\| null` borra el número de salida en cualquier PUT parcial; las campañas dejan de llamar sin aviso | `controllers/agents.controller.ts:186` |
| Alta | El consentimiento de voz solo se comprueba en la ruta de prueba, no al marcar campañas: si caduca, se sigue usando la voz clonada | `jobs/leadCallDispatch.ts:39`, `zadarma/runtime.ts:42-45` |
| Alta | El evaluador puede aprobar (~80/100) una llamada en la que solo habla el agente: Zadarma no emite `turn.user_finished` ni `compliance.opt_out` y el rol `prospecto` no se reconoce. `latestEvaluation` no filtra por `isTest` ni por la voz actual | `callJudge.ts:65,74,80`, `agents.service.ts:112,123` |
| Media | Leads descartados sin reprogramar (fuera de horario, sin cuota, agente inactivo); sin reintentos por no contestar en Zadarma | `jobs/leadCallDispatch.ts:31-48` |
| Media | Llamadas contestadas sin fila `Call` si falla `claim` o `ingestCall`; se pierde la transcripción | `audioServer.ts:57,77,92`, `runtime.ts:139` |
| Media | La detección de opt-out no reconoce el tuteo ("no me llames", "déjame en paz", "no me vuelvas a llamar") | `compliance.ts:17-24` |
| Media | Si el worker genérico usa la cola postgres, puede reclamar trabajos de `ZADARMA_ORG_ID` y desviarlos a Twilio; si la API usa Redis, el worker del VPS no los ve. Revisar `WORKER_QUEUE_BACKEND` | `jobs/leadCallDispatch.ts:112-120`, `queueBackend.ts:12` |
| Baja | Todo +34 usa `Europe/Madrid`: en Canarias la franja 9-20 empieza a las 8:00 locales. Teléfonos en claro en logs | `compliance.ts:75,148,281` |

**Revisado y correcto:** autenticación Bearer de la pasarela en tiempo constante y
solo en loopback; rutas de grabación protegidas (UUID, `realpath`, marcador
`.ready`, cabecera RIFF, propiedad por organización); sin inyección AMI; parser de
AudioSocket acotado; reclamación atómica de trabajos; aviso de grabación emitido.

---

## 4. Higiene del repositorio

- `CLAUDE.md` (versionado) contiene un móvil personal, la IP del VPS con el
  procedimiento de acceso root y el ID de la voz privada (relacionado con §2.2).
- `prospects-*.json` en la raíz contienen datos de negocios de Google Places
  (posibles datos personales según el RGPD).
- Ficheros sobrantes versionados: `backend/_tmp_test_optimizer.ts` (hace un upsert
  en la base configurada), `schema_old.prisma`, `migration_new.sql` (vacío),
  experimentos de voz en Python (`backend/blind_ab.py`,
  `backend/compara_qwen_vs_chatterbox.py`, `backend/ab_qwen_vs_chatterbox/`,
  `backend/banco_qwen/`), `dist-zombies/` (salida de compilación) e
  `importaciones/`.
- No hay CI (`.github/` no existe).

---

## 5. Sección Growth — nota por página

**Escala:** 0–2 maqueta · 3–4 UI parcial o simulada · 5–6 flujo principal con
backend real pero faltan piezas clave · 7–8 usable de verdad con huecos menores ·
9–10 completa, robusta y con tests.

**Media: 6,3 / 10.** Ninguna página es una maqueta: todas usan endpoints reales con
Prisma y proveedores reales.

> **Actualización:** las seis páginas por debajo de 7 se corrigieron el mismo día.
> La media pasa a **7,1 / 10** y ninguna página queda por debajo de 7. Los
> detalles están en la §7; las fichas de esta sección describen el estado
> **anterior** a esas correcciones.

| Página | Ruta | Nota |
|---|---|---|
| Captación (portada) | `/captacion` | **7** |
| Atraer · Orgánico y social | `/captacion/atraer/organico` | **7** |
| Atraer · Prospectos | `/captacion/atraer/prospectos` | **7** |
| Convertir · Web y SEO | `/captacion/convertir` | **7** |
| Conectar Meta | `/captacion/conectar` | **7** |
| Email marketing | `/email-marketing` | **7** |
| Resumen Growth | `/growth` | **6** |
| Planificar · Campañas | `/captacion/planificar` | **6** |
| Atraer · Ads | `/captacion/atraer/ads` | **6** |
| Cerrar · Funnels | `/captacion/cerrar` | **6** |
| Asistente de nueva campaña de Ads | `/captacion/nueva` | **5** |
| Operaciones Growth | `/operaciones-growth` | **5** (Trabajos 8 · Automatizaciones 6 · Centro de acciones 3) |

### 5.1 Resumen Growth — 6/10
- **Funciona:** CRUD real de `/api/growth-programs` con zod y Prisma
  (`src/pages/GrowthHubPage.jsx:235,278,302`; `backend/src/services/growthPrograms.service.ts:102-201`);
  estados de carga, error, vacío y vacío por filtro; editor de pasos de secuencias
  (`src/pages/growth/SequenceSteps.jsx:75-146`); responsive.
- **Falta:** archivar (el endpoint `POST /:id/archive` existe y la UI no lo usa); el
  filtro arranca en `'acquisition'` (`:222`) y oculta programas de otras áreas; un
  fallo al activar/pausar sustituye toda la lista por el panel de error (`:310`);
  el cliente acepta nombres de 1 carácter y el backend exige 2; i18n casi nula; sin
  tests del CRUD.
- **Siguiente paso:** filtro inicial `'all'`, archivar con confirmación y separar
  el error de acción del error de carga.

### 5.2 Captación (portada) — 7/10
- **Funciona:** 6 lecturas reales en paralelo y tolerantes a fallos
  (`src/pages/captacion/CaptacionOverview.jsx:45-55`); muestra «Sin medición» en vez
  de 0; siguiente acción por etapa calculada con datos reales; barra de etapas con
  permisos, i18n y ARIA.
- **Falta:** no distingue «no disponible en tu plan», «error» y «sin datos»
  (`:25-42`); las cifras de campañas suman solo la primera página de 100 (`:47`);
  sin botón de refrescar; código muerto (`:171,179,186`); i18n parcial; sin tests.
- **Siguiente paso:** usar `readPlanGate` para distinguir estados y un endpoint
  agregado para los totales de campañas.

### 5.3 Planificar · Campañas — 6/10
- **Funciona:** listado real paginado con filtro y búsqueda
  (`src/components/Campaigns.jsx:188-214`); crear, activar (encola llamadas reales)
  y pausar; métricas de contadores reales; control de plan.
- **Falta:** `if (loading) return <PageLoadingState/>` (`:295`) desmonta la página
  al paginar o buscar y el buscador pierde el foco; «Iniciar» encola llamadas sin
  confirmación y con un toast genérico (`:132,260-272`); sin editar, duplicar ni
  borrar (PUT y duplicate existen; DELETE no); modal sin Escape ni
  `role="dialog"`; el embudo muestra 0 cuando hay error o bloqueo de plan
  (`:84-120`); i18n parcial.
- **Siguiente paso:** carga a página completa solo la primera vez y diálogo de
  confirmación antes de `start` con el número de leads a encolar.

### 5.4 Atraer · Ads — 6/10
- **Funciona:** datos reales de overview, acciones, reglas y experimentos
  (`src/pages/ads/useAdsOverview.js:54-75`); CRUD del plan (activaciones,
  audiencias, briefs, creatividades); publicación real a Graph API en `PAUSED`
  (`backend/src/services/metaCampaignBuilder.service.ts:46-205`).
- **Falta:** Google Ads es solo un aviso (`panels/MedicionPanel.jsx:86`);
  `publishCampaign` ignora el plan (usa `campaign.adAssets`) y fija la
  segmentación en España (`:105`); `OUTCOME_LEADS` + `LEAD_GENERATION` sin
  `promoted_object` probablemente lo rechaza Meta (`:92,103`); todos los fallos
  acaban en un 502 genérico (`ads.controller.ts:192-195`); llamadas a Graph sin
  timeout y con el token en la query (`:10-24`); publicación no atómica;
  experimentos solo se listan; sin tests.
- **Siguiente paso:** construir la campaña desde el plan aprobado, con errores
  tipados visibles en la UI y un test con Graph simulado.

### 5.5 Asistente de nueva campaña de Ads — 5/10
- **Funciona:** crea una `Campaign` real (`POST /api/ads/wizard`, zod); intenta
  publicar en pausa si hay cuenta Meta; borrador en `localStorage` y servidor;
  contexto real (playbooks, cuenta, organización, orgánico).
- **Falta:** las previsiones (leads, CPL, alcance) salen de constantes por sector
  (`backend/src/services/adsStrategy.service.ts:95-161`) y se presentan como
  «Estimación IA» (`src/pages/AdsWizardPage.jsx:914-920`); `provider: 'claude'`
  aunque el motor es DeepSeek (`:168,215`); creatividades fijas en código
  (`:94-111`) y la elegida no se envía (`:573-588`); `knownAudience ||
  audience.trim()` sobrescribe lo que escribe el usuario (`:487,579`); el fallo de
  publicación en Meta solo va al log (`adsWizard.service.ts:72-74`); una
  recomendación no hace nada (`:555-561`).
- **Siguiente paso:** etiquetar el pronóstico como referencia genérica, guardar la
  creatividad, corregir la audiencia y mostrar el resultado de publicar.

### 5.6 Conectar Meta — 7/10
- **Funciona:** OAuth robusto (estado de un solo uso, PKCE S256, verificador
  cifrado, token de larga duración, permisos comprobados, token cifrado) y
  revocación al desconectar (`backend/src/services/metaAdAccount.service.ts:143-340`);
  estados «no conectada», «error» y «plan bloqueado»; límite de presupuesto, píxel
  y diagnóstico reales; 4 tests del servicio.
- **Falta:** sin selector de cuenta publicitaria ni página (toma la primera,
  `:242-256`); sin validación de `budget-cap` ni `pixel-id` en backend
  (`controllers/metaAccounts.controller.ts:58-74`); no se puede quitar el límite
  (`src/pages/MetaAccountPage.jsx:131`); se pierde el mensaje del 409
  `META_OAUTH_NOT_CONFIGURED`; el color de error depende del texto «No se pudo»
  (`:198-203`); sin aviso de caducidad del token.
- **Siguiente paso:** selector de cuenta y página tras el OAuth, más validación zod.

### 5.7 Atraer · Orgánico y social — 7/10
- **Funciona:** 6 pestañas con estado en la URL; unas 45 llamadas con endpoint real
  (Metricool, Search Console, GA4, Business Profile); ciclo completo de contenido
  (radar, generación, imagen, aprobación, borrador en Metricool, autonomía); unas
  70 pruebas de backend.
- **Falta:** huecos declarados en la UI (`src/pages/organico/OrganicPanels.jsx:423-429`):
  alcance de redes sin leer de Metricool, sin reprogramar posts, sin responder
  reseñas; sin fecha/hora por post ni calendario; `STORY` de Instagram sin probar
  (`backend/src/services/metricoolSync.service.ts:203-209`); `generatedBy` dice
  «IA» aunque se use el respaldo sin modelo (`contentStudio.service.ts:444`);
  i18n casi nula; sin tests de frontend.
- **Siguiente paso:** leer alcance y métricas por post de Metricool, y añadir
  fecha y hora editables por post.

### 5.8 Atraer · Prospectos — 7/10
- **Funciona:** búsqueda real en Google Places con puntuación
  (`backend/src/services/prospecting.service.ts:91-147`); errores 409/503
  diferenciados; importación con deduplicación, enriquecimiento, auditoría, cola de
  llamadas y email frío (`controllers/prospects.controller.ts:79-220`); filtros,
  selección masiva, CSV y campaña outbound en línea; sin datos simulados.
- **Falta:** importación síncrona y en serie dentro de la petición HTTP (riesgo de
  timeout); `items` sin esquema ni límite (`:71`); techo de 20 resultados; la UI no
  expone `sequenceId` ni `state`/`country`; pocos tests.
- **Siguiente paso:** importar mediante un trabajo en cola con progreso, esquema zod
  y tests de `importProspects`.

### 5.9 Convertir · Web y SEO — 7/10
- **Funciona:** auditoría real encolada con idempotencia (rastreo, robots,
  sitemaps, hasta 50 páginas, Core Web Vitals, SSL) y vigilancia cada 24 h
  (`backend/src/services/websiteSeo.service.ts:23-67`,
  `seoAgency.service.ts:369-393`); propuestas como pull request; generador y
  publicación de páginas; estados completos; 13 pruebas offline.
- **Falta:** la validación de calidad antes de publicar solo existe en el navegador
  (`src/components/seo/SeoPageFactory.jsx:199-202`); vista previa en plantilla
  antes de generar (`:45-60`); cola de generación solo en memoria; se muestra el
  prompt interno (`:98-117`); dos componentes muertos (`SeoActionCenter.jsx`,
  `SeoOpportunityRadar.jsx`); landings ocultas en un `<details>` cerrado
  (`WebSeoPage.jsx:149`); sin i18n; no hay unidad systemd del worker de SEO en el
  repositorio.
- **Siguiente paso:** validar la calidad en `POST /api/seo/content/:id/publish` y
  quitar el borrador en plantilla y el prompt visible.

### 5.10 Cerrar · Funnels — 6/10
- **Funciona:** overview real con tasas `null` cuando falta el dato y cuello de
  botella calculado (`backend/src/services/funnels.service.ts:51-148`); crear funnel
  con zod; estados completos.
- **Falta:** solo leer y crear (sin editar, pausar ni archivar); cualquier campaña
  cuenta como funnel, también las outbound; `contacted` solo se incrementa en
  llamadas; error genérico al crear (`src/pages/FunnelsPage.jsx:152`); el botón no
  comprueba `funnels.write` (`:230`); imágenes fijas; sin tests del servicio.
- **Siguiente paso:** acciones de ciclo de vida con permiso y pruebas offline de
  `getFunnelsOverview`.

### 5.11 Email marketing — 7/10
- **Funciona:** CRUD, validación, audiencia, publicación, pausa y reconciliación
  (`backend/src/routes/marketingCampaigns.ts:12-21`); envío real con reparto A/B y
  consentimiento, worker con lease y Resend (`jobs/campaignSendRunner.ts:21-85`);
  resultados A/B con prueba z; newsletter con autoguardado y vista previa aislada.
- **Falta:** **una campaña pausada no se puede reanudar** (solo existe `/pause` y
  `validateCampaign` no sale de `paused`, `marketingCampaigns.service.ts:130`); sin
  borrar, archivar ni duplicar; sin «enviar prueba»; lista sin métricas por fila;
  `/api/email/overview` se pide dos veces; i18n casi nula; sin tests de
  publicación ni del runner.
- **Siguiente paso:** «Reanudar» y «Archivar» en backend y UI, con un test de
  publicación + un ciclo del runner.

### 5.12 Operaciones Growth — 5/10
Contenedor de pestañas con `?tab=` (`src/pages/GrowthOperationsPage.jsx:11-40`); las
rutas antiguas redirigen bien.

- **Centro de acciones — 3/10 ✔.** El modo real no funciona desde la interfaz: la
  página llama a `requestOrchestrationPlan(form, { mode })` sin `actions`
  (`src/pages/OrchestrationPage.jsx:301`), el cliente solo las envía si se pasan
  (`src/lib/orchestration.js:305`) y el backend rechaza el plan con 422
  `EXECUTABLE_ACTIONS_REQUIRED` (`backend/src/services/orchestration.service.ts:191`).
  La UI no consulta `/api/orchestration/actions/catalog`. Solo funciona la demo
  simulada. Tampoco se pueden listar planes anteriores.
- **Trabajos — 8/10.** Listado, detalle, cancelar y reintentar reales con permisos
  y refresco cada 10 s. Falta paginación real («Cargar más» tope de 100) y tests.
- **Automatizaciones — 6/10.** Listar, crear, activar/pausar, borrar y ejecutar de
  verdad (email, llamada, WhatsApp, tareas). No se pueden editar (no hay
  `PUT /api/automations/:id`); el interruptor del detalle ignora errores
  (`AutomacionDetailPage.jsx:155-157`); plantillas de inicio vacías; «Motor
  operativo listo» es texto fijo; un error de red se muestra como «no encontrada».
- **Siguiente paso:** cargar el catálogo de acciones y enviarlas con el plan;
  después, edición de automatizaciones.

### 5.13 Problemas transversales de Growth
- **i18n:** casi todo el texto está en español fijo; solo cabeceras y algún botón
  dependen de `locale`.
- **Tests:** ninguna página tiene tests de frontend; en backend predominan los de
  permisos, no los de flujo.
- **Borrar/archivar:** falta en campañas, programas, funnels y emails, aunque a veces
  el endpoint ya existe.

---

## 6. Prioridades recomendadas

1. **Rotar** las cinco credenciales del commit `9ca9d1b`.
2. **Agentes:** quitar `lifecycleStatus`/`isActive` del PUT y del restaurado de
   versiones; corregir `phoneNumber || null`; validar la propiedad de `voiceId`.
3. **Cola de llamadas:** evitar ticks solapados, no gastar intentos en rechazos por
   capacidad y reutilizar `requestId` entre reintentos.
4. **Cumplimiento:** comprobar consentimiento de voz al marcar, ampliar opt-out al
   tuteo y corregir la evaluación para exigir intervención del interlocutor.
5. **Growth:** modo real del Centro de acciones; confirmación y carga en Campañas;
   previsiones y audiencia del asistente de Ads; reanudar campañas de email;
   publicación en Meta desde el plan.
6. **Infraestructura:** proteger `/health/integrations*`, revisar `TRUST_PROXY`,
   limpiar ficheros sobrantes y datos personales versionados y añadir CI.

---

## 7. Correcciones aplicadas en Growth (23-09-2026)

Objetivo: llevar a al menos 7/10 todas las páginas que estaban por debajo. Se
cumplió en las seis. Rama `claude/project-review-f33u1t`.

| Página | Antes | Después | Commit |
|---|---|---|---|
| Planificar · Campañas | 6 | **7,5** | `5d96ca0` |
| Atraer · Ads | 6 | **7,5** | `23e7236` |
| Resumen Growth | 6 | **7** | `2a46da5` |
| Cerrar · Funnels | 6 | **7** | `2a46da5` |
| Asistente de nueva campaña de Ads | 5 | **7** | `23e7236` |
| Operaciones Growth | 5 | **7** (Centro de acciones 3→7 · Trabajos 8 · Automatizaciones 6→7-8) | `feat(operaciones)` (último commit de la rama) |

**Nueva media de la sección Growth: 7,1 / 10** (antes 6,3).

### 7.1 Validación

| Comprobación | Resultado |
|---|---|
| `npm run build` (raíz y backend) | ✅ OK |
| `npm run test:offline` (backend) | ✅ 4/4 |
| `backend/src/__tests__/*.offline.test.ts` + contratos de orquestación y entitlements | ✅ 84/84 (antes 48; +36 nuevas) |
| `node --test src/lib/*.test.mjs` | ✅ 84/85. El único fallo (`salesRendering.test.mjs`, reunión desde CRM) es previo y ajeno a Growth |

No se ejecutaron las pruebas de integración con base de datos. En particular,
queda por comprobar con BD el 403 de viewer para `PATCH /funnels/:id/status`
(añadido a `authorizationRoutes.test.ts`) y una creación/aprobación real de un
plan de orquestación.

### 7.2 Endpoints nuevos o cambiados

| Endpoint | Cambio |
|---|---|
| `GET /api/campaigns/:id/start-preview` | **Nuevo**, solo lectura. Cuenta las llamadas que encolaría `start` (misma condición `START_LEAD_WHERE`). Mismos permisos que `start` |
| `PATCH /api/funnels/:id/status` | **Nuevo**. `active \| paused \| done`, filtrado por `orgId`, `funnels.write`, auditoría `funnel.status`. Nunca encola llamadas y no activa campañas con agente de voz (se derivan a Campañas) |
| `POST /api/ads/campaigns/:id/{publish,activate,pause,remote-status}` | Errores tipados `{error, code, details?}` con 4xx/502/504. `publish` devuelve `adsCreated`, `objective`, `creativeSource`, `targetingSource`, `warnings` |
| `POST /api/ads/wizard` | Acepta `creative` opcional; responde `published` y `publishError` |
| `POST /api/ads/strategy` | `provider` pasa a `deepseek \| heuristic`; añade `forecastSource: 'sector_benchmark'` y `forecastNote` |
| `POST /api/ads/experiments/:id/start` | **Nuevo** (`ads.write`). `startExperiment` ahora filtra por `orgId` (antes no) |
| `GET /api/orchestration/plans` | **Nuevo**. Listado paginado de planes, filtrado por `orgId` |
| `GET /api/orchestration/actions/catalog` | Incluye `fields` y `resolvesWith` por acción |
| `PUT /api/automations/:id` | **Nuevo**. Edita nombre, descripción, disparador y acciones; zod estricto, `automations.write`, auditoría |

### 7.3 Cambios por página

**Planificar · Campañas (6 → 7,5)**
- La carga a pantalla completa solo aparece la primera vez; buscar, filtrar y
  paginar atenúan la tabla sin desmontarla (el buscador conserva el foco).
- «Iniciar» abre una confirmación con el número de llamadas que se encolarán,
  los leads sin teléfono y avisos si no hay agente o no está publicado.
- Editar (PUT existente) y duplicar desde la lista; errores reales del backend.
- Modal accesible (Escape, `role="dialog"`) con validación de presupuesto.
- Embudo y mezcla muestran «—» / «Sin medición» en vez de 0.
- Lógica en `src/lib/campaignsView.js` con 6 tests; test offline del endpoint.
- **Pendiente:** `/campanas/:id` sigue iniciando sin confirmación; los totales
  siguen limitados a 100 campañas; en móvil, editar/duplicar solo desde el detalle.

**Resumen Growth (6 → 7)**
- Filtro inicial «todas las áreas»; un programa recién creado siempre aparece.
- Archivar con confirmación usando el endpoint existente.
- Los errores de activar/pausar/archivar son un aviso y no sustituyen la lista.
- Las secuencias usan `/pause` y `/resume`, así sus matrículas quedan alineadas.
- Validación del nombre igual que el backend; «Detener» secuencia con confirmación.
- Lógica en `src/lib/growthPrograms.js` con 6 tests.
- **Pendiente:** control de permisos `growth.write` en la UI y restaurar archivados.

**Cerrar · Funnels (6 → 7)**
- Acciones Activar / Pausar / Finalizar (Finalizar = `done`, terminal) con
  confirmación, mediante el nuevo `PATCH /api/funnels/:id/status`.
- Botones y acciones respetan `funnels.write`; errores del backend visibles.
- Los funnels finalizados no generan recomendación; filtros nuevos (En curso,
  Activos, Pausados, Borradores, Sin tracking, Finalizados).
- Lógica pura extraída de `funnels.service.ts` con 8 pruebas offline.
- **Pendiente:** la réplica local de roles con `funnels.write` en `FunnelsPage`
  debería sustituirse por los permisos de sesión; no se puede reabrir un funnel
  finalizado.

**Atraer · Ads (6 → 7,5)**
- `publishCampaign` construye la campaña desde el plan: activación Meta
  (objetivo, evento, presupuesto, fechas), audiencia del brief o de la campaña y
  hasta 5 creatividades aprobadas con consentimiento comprobado. `adAssets`
  queda como respaldo y España solo como respaldo explícito.
- Objetivo coherente con Meta: con píxel, `OUTCOME_LEADS` + `OFFSITE_CONVERSIONS`
  + `promoted_object`; sin píxel, `OUTCOME_TRAFFIC` + `LINK_CLICKS`.
- Graph con timeout de 15 s y token en cabecera `Authorization`; los errores
  solo propagan códigos numéricos de Meta, nunca el cuerpo.
- Errores tipados que la UI muestra; si la publicación falla a mitad, se borran
  en orden inverso los objetos creados (best-effort, resultado en `details.rollback`).
- Experimentos: crear, arrancar y concluir desde el panel.
- 11 pruebas offline con Graph simulado.
- **Pendiente:** ciudades e intereses en texto libre no se traducen a ids de Meta
  (se devuelven como `warnings`); sin formulario nativo de leads; `AdAudience` no
  tiene flujo de aprobación formal.

**Asistente de nueva campaña de Ads (5 → 7)**
- El pronóstico se etiqueta como «Referencia orientativa del sector», no como
  predicción de IA; el proveedor mostrado es el real.
- La variante creativa elegida se envía, se valida y se usa al publicar.
- Lo que escribe el usuario en audiencia tiene prioridad sobre el perfil orgánico.
- La recomendación «objetivo» funciona; el borrador guarda margen y %.
- Si Meta no publica, el motivo se muestra antes de navegar.
- Lógica en `src/lib/adsWizard.js` con 7 tests.
- **Pendiente:** las variantes creativas son plantillas deterministas, no generadas
  por IA.

**Operaciones Growth (5 → 7)**
- *Centro de acciones (3 → 7):* el modo live funciona. Se carga el catálogo, un
  selector permite elegir y ordenar acciones con sus campos (con sugerencia según
  el objetivo), las acciones se envían con el plan y los 422 se explican. Nuevo
  panel «Planes recientes» para reabrir planes. La demo queda etiquetada como
  simulación.
- *Automatizaciones (6 → 7-8):* edición real (formulario de nombre, disparador y
  acciones) con `PUT /api/automations/:id`. Se respeta el versionado: el motor usa
  el disparador **y** las acciones de la última versión publicada (las que nunca
  se publicaron siguen usando su configuración actual). El interruptor ya no es
  optimista, el estado del motor sale de `/api/automations/health`, se distingue
  404 de error de red, la paginación muestra una ventana de 5 páginas y las
  plantillas abren el modal prerrellenado. La lista ya no muestra los registros
  internos `[orchestration] …`.
- *Trabajos (8):* paginación real (`page`/`limit=25`) en lugar del tope de 100.
- *Presupuesto de Ads en la orquestación:* el adaptador pasa el importe aprobado a
  `publishCampaign`; si no coincide con el que se publicaría, se bloquea con
  `BUDGET_APPROVAL_MISMATCH` (409) antes de llamar a Meta.
- 9 pruebas offline de backend y 7 de `src/lib/orchestration.js`.
- **Pendiente:** las acciones que necesitan un ID (agente, lead, campaña de email)
  se rellenan a mano, sin buscador; el editor de automatizaciones no tiene
  condiciones ni ramas.

### 7.4 Cambios de comportamiento a tener en cuenta

- **Automatizaciones:** tras editar una automatización ya publicada, los cambios
  no se ejecutan hasta volver a publicarla (la UI lo avisa).
- **Ads:** una publicación puede crear hasta 5 anuncios (uno por creatividad
  aprobada) y usa el presupuesto de la activación Meta del plan si existe.
- **Funnels:** no se pueden activar desde Funnels las campañas con agente de voz;
  eso se hace en Campañas, con confirmación.
- **Estrategia de Ads:** `provider` ya no devuelve `claude` ni `fallback`; la UI
  sigue aceptando esos valores en borradores antiguos.

---

## 8. Flujo de llamadas de punta a punta (revisión del 23-09-2026)

Revisión de solo lectura del recorrido completo: crear un agente → añadirle
documentos, guiones y la web → importar leads → llamar → resultado en el CRM.
Cuatro revisiones automatizadas siguieron cada tramo hasta el backend; los puntos
marcados con ✔ se comprobaron a mano. Misma escala que la §5. No repite los
hallazgos de la §3 (cola solapada, `requestId` nuevo, consentimiento no
comprobado al marcar, evaluador que aprueba monólogos…), salvo donde este tramo
añade impacto.

**Media: 5 / 10.** Cada tramo funciona por separado con backend real, pero **el
flujo entero no se puede completar hoy desde la interfaz**: un usuario nuevo en
España no consigue que el agente llame a un lead importado.

| Tramo | Nota | Lo que lo frena |
|---|---|---|
| 8.1 Crear y configurar el agente | **6** | Checklist ficticio, número de salida sin validar, campos decorativos |
| 8.2 Documentos, guiones y web → agente | **5** | Los PDF nunca llegan al agente; conocimiento elegido por fecha |
| 8.3 Importar leads y dejarlos llamables | **4** | Importación inalcanzable; consentimiento imposible de registrar |
| 8.4 La llamada y su resultado en el CRM | **5** | Sin buzón ni «no contesta»; el resultado casi siempre es `none` |

### 8.0 Los cinco bloqueos que impiden el objetivo (50 llamadas/día)

En orden: cada uno impide llegar al siguiente.

1. **El modal de importar CSV no está montado en ninguna página.** ✔ Solo lo usa
   `src/components/Leads.jsx`, y ese componente no lo carga nadie (`App.jsx` no
   lo importa). El CRM actual (`SalesCRMPage.jsx`) solo ofrece `NewLeadModal`, de
   uno en uno y sin campaña. Los leads solo entran en masa por Prospectos o por
   API.
2. **Ningún lead español importado será llamable.** ✔ `voice/compliance.ts:193`
   exige `ContactConsent(channel='voice')` concedido para todo `+34`. Ni el CSV
   (`jobs/importJobRunner.ts:124-132`), ni el alta manual, ni Prospectos, ni Meta
   pasan `consent` a `createLead`, y no hay endpoint ni pantalla para registrarlo
   a mano (`LeadDetailPage.jsx:580` es solo lectura). Solo lo registran la
   landing propia y `grantVoiceConsent()` desde respuestas de WhatsApp/email.
   Resultado: 100 leads importados → campaña activa → 100 trabajos descartados
   con `missing_voice_consent` en un `console.warn`.
3. **El rechazo es invisible.** `jobs/leadCallDispatch.ts:31-48` sale con `return`
   sin escribir en `Lead`, `Call`, `SalesActivity` ni `AuditLog`. El usuario ve
   «Activar y llamar (N)», después «en cola», y nunca pasa nada. Las secuencias sí
   marcan `CALL_MISSING_VOICE_CONSENT` (`salesSequence.service.ts:393`); las
   campañas no.
4. **Los teléfonos no se normalizan al importar** (`leads.service.ts:253`,
   `importJobRunner.ts:124`) y el país por defecto es **México (`52`)** en
   `compliance.ts:51` y **EE. UU. (`1`)** en `.env.example:217`. ✔ Un CSV español
   sin `+34` da `invalid_phone` salvo que el despliegue fije
   `DEFAULT_PHONE_COUNTRY_CODE=34`. La deduplicación del CSV compara cadenas
   crudas y solo dentro del fichero (`dedupeImportRows`, `leads.service.ts:313-340`):
   importar el mismo CSV dos veces produce dos llamadas al mismo número.
5. **La línea única quema los intentos.** Con `maxConcurrent=1`
   (`zadarma/config.ts:32`), `startCampaign` encola todos los leads de golpe
   (`campaigns.service.ts:196-199`); cada trabajo que coincide con una llamada en
   curso recibe 409 `ZADARMA_CAPACITY_REACHED`, pero `attempts` ya se incrementó
   (`leadCallDispatch.ts:50`). A la tercera coincidencia el lead queda descartado
   para siempre, sin `Call` y sin haber sonado.

### 8.1 Crear y configurar el agente — 6/10

**Flujo real:** `NewAgenteModal.jsx:72-153` (4 pasos) → `POST /api/agents` con zod
estricto y versión v1 (`agents.service.ts:20-54`) → ficha `AgentDetailPage.jsx`
(vista sencilla de 6 pasos o profesional) → voz de catálogo Fish
(`agentVoices.service.ts:20-38`) o clonada con subida, consentimiento atómico y
job idempotente (`agentVoiceUpload.service.ts:82-154`) → guion en `systemPrompt`,
mensajes clave, escalado, estrategia, playbook activo → número E.164 → prueba en
cabina (`/voz/cabina`, sin `Call`) o real (`POST /agents/:id/test-numbers` +
`/test-calls`, `voiceTestCall.service.ts:110-273`) con evaluación al colgar →
readiness de 5 checks (`agents.service.ts:107-166`) → `POST /agents/:id/publish`
con 422 y `blockers` si falta algo.

| Sev. | Hallazgo | Ubicación |
|---|---|---|
| Alta | El checklist «Listo para operar» de la vista profesional lee campos que no existen (`testPassed`, `lastTestStatus`): «Prueba de llamada» siempre pendiente aunque haya evaluación 90/100; exige «fuentes o playbook» (el backend no) y omite el consentimiento (el backend sí). Su CTA abre la cabina, que no cuenta | `src/components/agents/AgentReadinessChecklist.jsx:199-233` |
| Alta | El número de salida acepta cualquier E.164, pero la pasarela exige que coincida con `ZADARMA_CALLER_ID` (`runtime.ts:66`). Todos los errores de preparación se colapsan en 409 `ZADARMA_CALL_BLOCKED_OR_FAILED` (`gateway.ts:76-79`): la prueba «falla» sin causa | `agents.service.ts:128`, `AgentGovernancePanel.jsx:65` |
| Alta | Runtime BYOK (Groq, DeepSeek, MiniMax, Cartesia) sin comprobación: las credenciales se leen de `process.env` (`runtimeConfig.ts:82-99`), readiness no las verifica; el agente publica y cada llamada falla con `ZADARMA_VOICE_RUNTIME_UNAVAILABLE` | `AgentDetailPage.jsx:56-70`, `runtime.ts:75` |
| Alta | Un agente recién creado aparece «Activo» (`isActive` por defecto `true`, `lifecycleStatus` `draft`); lista y hero usan solo `isActive`. Pausarlo desde ahí impide hacer pruebas (`voiceTestCall.service.ts:127`) | `AgentsTeam.jsx:87`, `AgentDetailPage.jsx:361,608-630` |
| Media | Guardar envía `speechSpeed: ''` si el agente no lo tiene (p. ej. clonado, `agents.service.ts:224`) → 400 de zod → «No se pudieron guardar los cambios» sin detalle | `AgentDetailPage.jsx:441,479` |
| Media | Ocho campos que nada consume: `personality`, máx. llamadas/día, tiempo máx., reintentos, días activos, horario, zona horaria, `monthlyMinuteLimit` | `AgentDetailPage.jsx:329-345,442-452` |
| Media | Simulador y «prompt compilado» con respuestas enlatadas y un prompt que no es el de `buildIntelligentPrompt` | `AgentSimulatorPanel.jsx:15-121`, `AgentPromptDebugger.jsx:210-233` |
| Media | La evaluación que desbloquea publish no queda ligada a la versión evaluada: cambiar voz, guion o estrategia después no la invalida | `agents.service.ts:123-130` |
| Media | Sin tests de `agents.service` (readiness, publish, consent, restore, clone) | `backend/src/__tests__` |
| Baja | «Archivar» y «Eliminar» sin confirmación; `NewAgenteModal` pide `voiceId` como texto libre | `AgentGovernancePanel.jsx:206`, `NewAgenteModal.jsx:260` |

**Bien:** puerta de prueba real (lista blanca `VoiceTestNumber`, lead interno,
consentimiento, tope diario, `isTest`, evaluación automática); subida de voz
clonada robusta; readiness del backend real y explicado; versionado con diff y
auditoría; el prompt final usa de verdad instrucciones, mensajes clave, escalado,
estrategia, playbook, perfil de empresa y base de conocimiento.

### 8.2 Documentos, guiones y web → agente — 5/10

**Flujo real:** `/recursos-ia` → `KnowledgeBaseRedesigned.jsx:42-62` acepta PDF,
DOC, DOCX, TXT, MD, CSV y JSON ≤10 MB → `POST /api/knowledge` guarda `content` y
`fileUrl` tal cual (`knowledge.service.ts:52-67`; modelo `KnowledgeBase` sin
relación con `Agent`) → en la llamada `promptContext.ts:185-198` toma las 6
fichas más recientes de la organización, 400 caracteres cada una, y las inyecta
en el system prompt una sola vez antes del primer turno. Playbooks: `settings.
activePlaybookId` → `agentConfig.ts:90-113` (caché de 5 min). Web:
`POST /api/intake/website` → rastreo de home + 7 páginas (`websiteIntake.crawler.ts`)
→ LLM con JSON validado y datos duros solo con cita literal → perfil de empresa
en `Organization.settings.businessProfile` + hasta 12 fichas → `promptContext.ts:209-232`
como «AUTHORITATIVE COMPANY PROFILE».

| Sev. | Hallazgo | Ubicación |
|---|---|---|
| Alta ✔ | **Un PDF o DOCX llega al agente solo como la frase «Archivo importado: nombre (tamaño).»** No hay extracción de texto; `pdf-parse` y `mammoth` solo se usan en el radar (`radarDocument.ts:38-47`) | `KnowledgeBaseRedesigned.jsx:58`, `promptContext.ts:194` |
| Alta | Los artículos de tipo URL guardan la URL como `content`, sin rastrearla | `NewArticuloModal.jsx:37` |
| Alta ✔ | Selección de conocimiento por fecha: 6 fichas × 400 caracteres, sin relación con el agente ni con la conversación. El rastreo web crea hasta 12 fichas: las primeras quedan fuera para siempre | `promptContext.ts:13-14,186-190` |
| Alta | Los `steps` del playbook no se pueden crear ni editar desde la UI; el «guion» real es nombre + descripción + tags | `NewPlaybookModal.jsx:27-31`, `PlaybookDetailPage.jsx` |
| Media | Data-URL de hasta 10 MB en `fileUrl`, devuelta entera en cada listado (`findMany` sin `select`); sin validación de tamaño en backend | `knowledge.service.ts:45-50`, `knowledge.controller.ts:21-35` |
| Media | Sin validación zod en knowledge ni playbooks (`name` vacío, `type` libre, `steps` cualquier JSON) | `knowledge.controller.ts:21-35`, `playbooks.controller.ts:102-116` |
| Media | La caché de 5 min de `loadAgentConfig` no se invalida al editar un playbook | `agentConfig.ts:24`, `playbooks.service.ts:156` |
| Media | Sin presupuesto global de prompt ni poda del historial de turnos | `vendravaVoice.ts:181,540,766` |
| Media ✔ | El panel «Documentos de entrenamiento» del agente está vacío por diseño (`docs: [], extraDocs: 0`) | `AgentDetailPage.jsx:344` |
| Baja | Los playbooks de tipo mandan usar «BUSINESS KNOWLEDGE», pero las secciones se llaman «AUTHORITATIVE COMPANY PROFILE» y «SUPPLEMENTARY KNOWLEDGE BASE» | `agentPlaybooks.ts:55,73,125` |

**Bien:** el perfil de empresa rastreado sí llega al prompt con precios exactos y
reglas anti-invención (con test); intake web sólido (URL pública validada, job
asíncrono, contenido tratado como dato, permisos por sección, auditoría);
extracción de documentos del radar robusta y reutilizable; aislamiento por
`orgId`; estados de carga/error/vacío en la UI de documentos e intake.

### 8.3 Importar leads y dejarlos llamables — 4/10

**Flujo real:** cinco orígenes, todos por `createLead()` (`leads.service.ts:230-280`):
CSV `POST /api/leads/import?campaignId=&autoCall=` (cabeceras literales
`name,phone,email,company`, 25 000 filas, 202 + `ImportJob` procesado por
`jobs/importJobRunner.ts` con lease atómica, lotes de 20, idempotencia por fila,
reintentos y dead-letter); alta manual; Prospectos (deduplica contra la
organización); webhook de Meta; landing propia (única que pasa `consent`).
Lead→campaña por `campaignId` (sin UI para cambiarlo); campaña→agente por
`PUT /api/agents/:id/campaigns`. `startCampaign` encola `status='new'` con
teléfono; `leadCallDispatch` exige además campaña `active`, agente `active` con
voz, prompt y número, cuota y `canCall` (E.164, minutos, opt-out, horario,
consentimiento para `+34`).

| Sev. | Hallazgo | Ubicación |
|---|---|---|
| Crítica ✔ | Importación CSV inalcanzable desde la UI (bloqueo 1) | `src/components/Leads.jsx:315` |
| Crítica ✔ | Sin forma de registrar consentimiento de voz para leads importados (bloqueo 2) | `compliance.ts:193`, `conversations.service.ts:165` |
| Crítica | Rechazo de llamada invisible (bloqueo 3) | `leadCallDispatch.ts:31-48` |
| Alta ✔ | Teléfonos sin normalizar; país por defecto `52`/`1` (bloqueo 4) | `compliance.ts:51`, `.env.example:217` |
| Alta | Sin deduplicación contra la base en CSV ni alta manual | `leads.service.ts:313-340` |
| Alta | La lista de opt-out solo se consulta al llamar, no al importar: un lead excluido cuenta en «Activar y llamar (N)» | `compliance.ts:190` |
| Alta | `startCampaign` activa aunque el agente no esté publicado; reactivar tras pausar reencola todos los `new` sin `dedupeKey` | `campaigns.service.ts:183-203` |
| Media | `createCampaign`/`updateCampaign` aceptan `agentId` sin comprobar que sea de la organización | `campaigns.service.ts:50,77-98` |
| Media | Las importaciones las procesa `worker.ts` con `BACKGROUND_WORKERS_ENABLED=true`, que no está desplegado en el VPS: un `ImportJob` quedaría en «Importando…» para siempre (polling sin timeout) | `importJobRunner.ts:271`, `ImportLeadsModal.jsx:32-41` |
| Media | Mapeo CSV rígido (sin `Nombre`/`Teléfono`, sin `;`, sin XLSX ni pegar) | `leads.controller.ts:180-186` |
| Media | Sin tests de `ImportJob`, `createImportJob`, `dedupeImportRows` ni `importJobRunner` | `backend/src/__tests__` |

**Bien:** el backend de importación es sólido (por sí solo sería un 7);
`createLead` como único punto de creación; aislamiento por `orgId`; `canCall`
cubre lo esencial y la pasarela lo re-verifica; el confirm de activación dice
cuántas llamadas reales se encolarán.

### 8.4 La llamada y su resultado en el CRM — 5/10

**Flujo real:** cola `lead-call-dispatch` → `callWorker` → `processLeadCallJob` →
`POST /calls` a la pasarela → `prepareSipCall` (doble validación) →
`registry.reserve` (`maxConcurrent=1`) → `Originate` AMI síncrono de 45 s →
Asterisk `MixMonitor` + `AudioSocket` → Deepgram Flux → Cerebras → Fish, con
saludo que incluye aviso de IA y de grabación, barge-in, generación especulativa
y reglas de opt-out/transferencia en cada turno (`runtime.ts:115-130`) → fin por
colgado, opt-out, error, 15 s sin entrada o 20 min → `ingestCall` con
transcripción plana, `outcome`, consumo a 6 c/min, `SalesActivity`, outbox,
lead `new→contacted` → `/llamadas` y `CallDetailPage` con reproductor privado.

| Sev. | Hallazgo | Ubicación |
|---|---|---|
| Alta | La capacidad de la pasarela consume intentos sin que suene el teléfono (bloqueo 5) | `registry.ts:15`, `leadCallDispatch.ts:50` |
| Alta | Sin detección de buzón ni de «no contesta» en Zadarma (`classifyAmd` solo en Twilio). Buzón → saludo, `outcome='none'`, lead `contacted`, minutos facturados. No contesta → 409 sin `Call`, sin `no_answer`, reintento por la cola (1-2 min) en vez de `scheduleRetry` (15 min, solo Twilio) | `ami.ts:24`, `mediaStream.ts:260-264`, `routes/voice.ts:157-162` |
| Alta ✔ | **El `outcome` es casi siempre `none`**: solo se mapean opt-out y «llámame después». `meeting_scheduled`/`interested` son inalcanzables desde voz, así que `ensureAutoMeeting`, `highIntent` y la señal a Ads nunca se disparan. **No se puede corregir a mano**: `routes/calls.ts` no tiene `PATCH` de `outcome` | `runtime.ts:144`, `calls.service.ts:519-550`, `routes/calls.ts` |
| Alta | La cola de reproducción admite 15 s de audio; una respuesta más larga lanza `AUDIO_PLAYBACK_BACKLOG` y cuelga (`output_backlog`). El saludo obligatorio ya ronda 10 s. **Verificar en real** | `audioSocket.ts:81-84`, `audioServer.ts:83-84` |
| Media | Si falla `ingestCall` (BD caída), la transcripción y la traza se pierden (solo en memoria) y el WAV queda huérfano e inaccesible (`ownsRecording` exige la fila `Call`); sin reconciliación | `runtime.ts:112-113`, `audioServer.ts:53-57` |
| Media | Sin timeout de silencio ni despedida: un teléfono descolgado sigue hasta los 20 min a 6 c/min | `vendravaVoice.ts`, `config.ts:33` |
| Media ✔ | Transcripción guardada como texto plano `"agente: …"` sin tiempos; la UI la convierte en **una sola burbuja del contacto**, así que se pierde quién dijo qué. El detalle no muestra evaluación y `call.metrics` siempre es `{}` | `runtime.ts:143`, `CallDetailPage.jsx:25,60,84` |
| Media | `ensureAutoMeeting` crea «mañana a las 10:00» sin hora real ni confirmación; el lead solo cambia `new→contacted` | `calls.service.ts:520-540,470-473` |
| Media | El juez no recibe en Zadarma los eventos que espera (`turn.user_finished`, `compliance.opt_out`, rol `agente`) y solo se evalúan las pruebas, no las campañas | `callJudge.ts:73-82`, `runtime.ts:109-113,151` |
| Baja | Coste plano de 6 c/min sin desglose por proveedor ni CDR | `calls.service.ts:16-19` |
| Baja | Sin resumen ni sentimiento en Zadarma: el mensaje en la conversación es siempre «Llamada completada» | `runtime.ts:139-146`, `calls.service.ts:386-388` |

**Bien:** la ruta es real y probada (microprueba del 19-09); cola con lease
atómico y aislamiento por organización; pasarela con doble validación,
idempotencia por `requestId` y AMI saneado; grabación completa, privada, servida
solo con WAV cerrado y `RIFF` correcto, sin JWT en URL; streaming con turno
semántico, especulación y barge-in; cumplimiento en el saludo y en cada turno;
ingesta idempotente con vocabulario cerrado de `outcome`; tests offline de
audio, grabaciones, pasarela, juez y worker.

### 8.5 Qué hacer, por orden

1. **Desbloquear el flujo en la interfaz** (~1 día): montar `ImportLeadsModal` en
   el CRM; base legal en el CSV y control de consentimiento de voz en la ficha
   del lead (endpoint sobre `grantVoiceConsent`); normalizar a E.164 con
   `DEFAULT_PHONE_COUNTRY_CODE=34` explícito; deduplicar contra la base; consultar
   opt-out al importar; persistir el motivo de cada rechazo y exponer
   `callability { eligible, reasons[] }` en `GET /api/leads/:id`.
2. **Que las llamadas dejen resultado**: no incrementar `attempts` hasta que la
   pasarela confirme el marcado (reencolar sin coste ante
   `ZADARMA_CAPACITY_REACHED`); escalonar el encolado según `maxConcurrent`;
   crear `Call` con `no_answer`/`busy` ante timeout de `Originate`; detectar
   buzón por el primer audio; clasificar el `outcome` al colgar (ver §9);
   `PATCH /api/calls/:id` (outcome, summary, callbackAt) y selector en el detalle.
3. **Que los documentos lleguen al agente**: extraer texto en el servidor con
   `extractRadarDocument`, rastrear URLs con `collectIntakePages`, guardar el
   binario como asset y excluir `fileUrl` del listado; `knowledgeIds` por agente
   y selección por relevancia; editor de `steps` e invalidación de caché.
4. **Sincerar la ficha del agente**: derivar el checklist de `workspace.readiness`;
   mostrar `lifecycleStatus`; validar el número contra la línea y las
   credenciales del runtime en readiness; devolver los códigos de bloqueo de la
   pasarela; quitar o conectar los campos y paneles decorativos; ligar la
   evaluación a la versión evaluada; tests de `agents.service`.
5. **Robustez de la llamada**: transcripción como JSON con rol y `atMs` y vista
   por turnos; timeout de silencio y cierre de conversación; persistencia
   diferida y reconciliación de grabaciones si falla la ingesta; comprobar el
   límite de 15 s de reproducción con una respuesta larga real.

---

## 9. Integración de Jev (TypeSafe AI) en los agentes de voz

### 9.1 Qué es

Jev es un «System One model» de TypeSafe AI, en acceso anticipado desde el
15-09-2026. No genera texto: recibe un **estado** (los datos de la situación) y
**preguntas tipadas**, y devuelve **valores tipados con probabilidad y
confianza**: booleanos (`Noul`), elección entre opciones (`Choice`) y
puntuaciones (`Score`). Latencia anunciada de 70–500 ms, $0,042 por millón de
tokens de entrada, SDK `@typesafe-ai/sdk` para TypeScript (solo servidor).

Encaja en Vendrava porque el flujo de voz tiene decisiones rápidas y
estructuradas **en el camino crítico de latencia de la llamada**, donde un LLM de
1-2 s no cabe, y hoy se resuelven con expresiones regulares, heurísticas o no se
resuelven (§8.4).

### 9.2 Puntos de integración, por impacto

| # | Decisión | Hoy | Con Jev |
|---|---|---|---|
| 1 | **Resultado de la llamada** (`outcome`) | `runtime.ts:144`: solo opt-out y callback; todo lo demás `none` | Al colgar, estado = transcripción + lead; `Choice(interested / not_interested / callback / meeting_scheduled / voicemail / wrong_number)` + `Score(intención)` + `Noul("¿acordaron fecha?")`. Activa `ensureAutoMeeting`, `highIntent` y la señal a Ads |
| 2 | **Opt-out** | `compliance.ts:103`: lista fija sin tuteo | `Noul("¿pide que no le llamen más?")` por turno, **en OR con la regex** (la regex se mantiene como red determinista) |
| 3 | **Petición de humano** | `compliance.ts:108`, regex | `Noul("¿pide hablar con una persona?")` |
| 4 | **Buzón / IVR** | Inexistente en Zadarma (`classifyAmd` solo Twilio) | `Choice(humano / buzón / IVR / ruido)` sobre los primeros 3 s de transcripción; colgar antes del discurso |
| 5 | **Fin de turno** | `vendravaVoice.ts:451`: `turn.eager_end` de Deepgram y cancelación de la especulación | `Noul("¿ha terminado de hablar?")` con la probabilidad como umbral para especular o esperar |
| 6 | **Consentimiento de voz por respuesta** | `compliance.ts:229`: frases en inglés | `Noul("¿acepta que le llame un agente de voz?")` en español |
| 7 | **Evaluación** (`callJudge`) | Reglas que aprueban monólogos | `Score` por dimensión + `Noul("¿habló el interlocutor?")` |
| 8 | **Puntuación de leads y prospectos** | Heurística en `prospecting.service.ts` | `Score` sobre el estado del negocio, barato para lotes de 25 000 |

### 9.3 Diseño propuesto

1. **Un adaptador único** `backend/src/voice/intelligence/decisions.ts` con
   funciones tipadas (`classifyOutcome`, `isOptOut`, `isVoicemail`,
   `turnEnded`…). Cada una llama a Jev con timeout de ~400 ms; si falla, agota el
   tiempo o falta la clave, **devuelve el resultado del método actual**. Jev nunca
   puede tumbar una llamada.
2. **Proveedor en `runtimeConfig.ts`**: nuevo slot
   `decisionModel: { provider: 'typesafe', model: 'jev' }` junto a `primaryLlm`,
   `transcriptionStt` y `tts`; `TYPESAFE_API_KEY` en `runtimeCredentialName` y en
   el check de readiness. Sin configurar, todo sigue igual.
3. **Umbrales por decisión**: opt-out ≥ 0,7 (mejor un falso positivo), buzón
   ≥ 0,85, `meeting_scheduled` ≥ 0,8 y si no, `callback` con revisión manual.
4. **Traza**: cada decisión como evento `decision.*` en `VoiceCallEvent` con
   probabilidad y confianza, para calibrar umbrales con datos reales.
5. **Pruebas offline** con cliente simulado, como `metaCampaignBuilder.offline.test.ts`.

### 9.4 Cautelas

- **Español:** ninguna fuente consultada confirma soporte. Probar con
  transcripciones reales antes de ponerlo en el opt-out.
- **Acceso anticipado:** no usarlo como única vía de nada; el diseño mantiene
  siempre el respaldo actual.
- **Cumplimiento:** opt-out y aviso de grabación conservan su camino
  determinista; Jev amplía la detección, no la sustituye.
- **Coste:** irrelevante (una llamada de 5 min con una decisión por turno cuesta
  una fracción de céntimo).
- **Red del entorno:** `jevtypesafeai.com`, `typesafe.ai`, `dev.to` y
  `developers.cloudflare.com` están bloqueados por la política de red de esta
  sesión; la forma exacta del SDK queda por leer.

Fuentes: Wikipedia «Jev (AI model)», blog de TypeSafe AI «Introducing System One
Models & Jev», Tom's Hardware, OpenRouter «Jev SDK for TypeScript and Python»,
Vercel KB «classify, route, and score with Jev», LangChain «What Is Jev?»,
MarkTechPost (19-09-2026).

---

## 10. Cierre del módulo de contacto con clientes (24-09-2026)

Objetivo: dejar terminado el módulo que contacta y habla con clientes (agentes
IA, leads, campañas, llamadas y su resultado en el CRM, conocimiento del
agente). Se corrigieron los hallazgos de las secciones 2.2, 3 y 8 en cinco
tramos paralelos, una revisión de integración del diff completo (15 hallazgos,
todos corregidos) y un recorrido de usuario nuevo. Rama
`claude/project-review-f33u1t`.

| Commit | Tramo |
|---|---|
| `26915fa` | Despacho: cola sin solapes, intentos solo tras marcar, capacidad sin coste, códigos tipados |
| `c83c547` | Leads: importación en el CRM, consentimiento, E.164, deduplicación, elegibilidad |
| `88d1816` | Conocimiento: extracción de PDF/DOCX/URL en servidor, documentos por agente, guiones con pasos |
| `edb634f` | Agentes: cierre del `PUT`, readiness real, límites operativos, estado real en la UI |
| `93e9bce` | Llamada y CRM: resultado clasificado, transcripción por turnos, buzón, silencio, reconciliación |
| `bb55cbe` | Correcciones de integración (§10.3) |

### 10.1 Notas finales

| Tramo | Antes (§8) | Ahora | Para llegar a 9 |
|---|---|---|---|
| 8.1 Crear y configurar el agente | 6 | **8** | Subida del documento de evidencia del consentimiento; readiness de credenciales depende del entorno del API; tests del flujo de UI |
| 8.2 Documentos, guiones y web | 5 | **8** | Recuperación por turno (hoy el ranking se hace una vez antes del primer turno); prueba con PDF real |
| 8.3 Importar leads | 4 | **7,5** | Worker de importaciones desplegado; retro-normalizar teléfonos antiguos |
| 8.4 Llamada y resultado en el CRM | 5 | **7,5** | Verificación con llamada real (AMD, silencio, clasificador); causa real de `Originate` (AMI con `read=call`); coste por proveedor |

**Media del flujo: 7,75 / 10** (antes 5). Los cinco bloqueos de §8.0 están
cerrados en código, con prueba offline cada uno:

| Bloqueo | Estado | Prueba |
|---|---|---|
| 1. Importación inalcanzable | Cerrado | `src/lib/leadImport.test.mjs`; `SalesCRMPage.jsx` monta `ImportLeadsModal` |
| 2. Consentimiento imposible de registrar | Cerrado | `leadImportDedupe.offline.test.ts`, `consentEnqueue.offline.test.ts` |
| 3. Rechazo invisible | Cerrado | `leadCallDispatch.offline.test.ts`, `leadCallability.offline.test.ts` |
| 4. Teléfonos sin normalizar / país 52 | Cerrado en código y en `.env.example` | `leadImportDedupe.offline.test.ts` |
| 5. Línea única quema intentos | Cerrado (sin verificar con línea real) | `leadCallDispatch.offline.test.ts`, `callWorker.offline.test.ts`, `zadarmaRemote.offline.test.ts` |

### 10.2 Validación final

| Comprobación | Resultado |
|---|---|
| `npm run build` (raíz y backend) | ✅ OK |
| `npm run check:styles` | ✅ OK |
| `npm run test:offline` | ✅ 4/4 |
| Suite offline de backend (`*.offline.test.ts` + judge, autorización, contratos, AMD, outcome, voz) | ✅ 290/290 (antes de este trabajo: 48) |
| `node --test src/lib/*.test.mjs` | ✅ 93/94; el único fallo (`salesRendering`, reunión desde el CRM) es previo y ajeno |

No se ejecutaron pruebas con base de datos ni se hizo ninguna llamada.
`authorizationRoutes.test.ts` nunca pasaba sin base de datos (503 por
`applyWorkspaceContext`); ahora corre offline con stubs mínimos.

### 10.3 Correcciones de integración (`bb55cbe`)

De la revisión del diff completo salieron 15 hallazgos; los más relevantes:

- **Un error de dialplan o permisos en `Originate`** contaba como intento y
  habría quemado los tres intentos de toda la campaña en 45 min. Ahora
  `ORIGINATE_INVALID` bloquea sin gastar intento; solo «Originate failed» se
  considera marcado.
- **Un buzón podía acabar como «no interesado»**: el saludo del contestador
  entraba como turno del prospecto y el clasificador decidía. Ahora el buzón
  detectado gana siempre y esos turnos no cuentan.
- **El detector de buzón podía colgar a una recepcionista** («¿para hablar con
  quién?», «no está disponible»). Ahora exige una frase inequívoca o dos
  señales débiles.
- Reanudar una campaña no duplica llamadas a leads con reintento pendiente.
- El consentimiento registrado al importar solo encola si la campaña está
  activa con agente publicado, y con la misma clave que `autoCall`.
- Guardar la ficha del agente ya no pisa los documentos elegidos.
- Corregir el resultado de una llamada antigua no revierte el estado actual
  del lead.
- El backpressure de audio es real: el productor espera al drenaje.
- Nuevo resultado `human_requested` («pidió hablar con una persona»),
  separado de `callback_requested` («llámame después»).
- Reintento automático tras buzón o IVR.
- El consumidor genérico de llamadas de `worker.ts` no arranca sin
  `LEAD_CALL_DISPATCH_IN_WORKER=true` y excluye `ZADARMA_ORG_ID` (cierra la
  fuga de aislamiento de §3).

### 10.4 Contratos y endpoints nuevos del módulo

| Endpoint | Descripción |
|---|---|
| `POST /api/leads/import` | CSV (`text/plain`) o JSON `{fileName, contentBase64}` (XLSX); query `campaignId`, `autoCall`, `consentVoice`, `consentSource`, `consentEvidence`, `attachExisting`; 202 con `mapping` y `unmappedHeaders` |
| `POST /api/leads/:id/consent` | `{ action: grant\|revoke, source, evidence, expiresAt? }` → consentimiento de voz auditado |
| `GET /api/leads/:id` | añade `callability { eligible, reasons[], warnings[], lastCallBlock }` |
| `POST /api/leads/:id/call-now` | 422 `lead_not_callable` con motivos |
| `GET /api/campaigns/:id/start-preview` | `breakdown { eligible, withoutPhone, invalidPhone, optOut, missingConsent, maxAttempts }`, `canStart` |
| `POST /api/campaigns/:id/start` | 409 `AGENT_NOT_PUBLISHED`/`AGENT_MISSING`; encola solo elegibles con `dedupeKey`; `breakdown.alreadyQueued` |
| `PATCH /api/calls/:id` | `{ outcome?, summary?, callbackAt?, meetingAt?, notes? }`; reaplica efectos; auditoría |
| `GET /api/calls/:id` | añade `transcriptTurns`, `evaluation`, `metrics` |
| `POST /api/knowledge/upload` | PDF/DOCX ≤10 MB, extracción en servidor, asset archivado |
| `GET/PUT /api/knowledge/agent-links` | documentos asignados a un agente (`settings.knowledgeIds`) |
| `GET /api/knowledge/prompt-preview?agentId=` | prompt real del agente con fuentes |
| `DELETE /api/playbooks/:id` | borrado lógico; `PUT` con `steps` validados |
| `PUT /api/agents/:id` | ya no acepta `lifecycleStatus`, `isActive` ni `settings.knowledgeIds`; `phoneNumber` solo si viene |
| `POST /api/agents/:id/pause` · `/resume` | cambio de estado explícito |
| `GET /api/agents/outbound-numbers` | líneas de salida del entorno |
| Pasarela `POST /calls` (error) | `{ error, code, retryable, dialed, retryAfterMs?, cause? }`; 429 capacidad, 422 preparación, 409 `ORIGINATE_*`, 503 `AMI_UNAVAILABLE` |

Vocabulario de `outcome` ampliado: `no_answer`, `busy`, `voicemail`, `ivr`,
`wrong_number`, `human_requested`, `callback_requested`, `interested`,
`not_interested`, `meeting_scheduled`.

### 10.5 Qué hay que desplegar para que funcione en producción

Nada de esto se ha ejecutado desde aquí. Orden recomendado:

1. **Neon:** aplicar la migración aditiva
   `backend/prisma/migrations/20260924090000_call_outcome_details`
   (`Call.meetingAt`, `Call.transcriptTurns`) **antes** de arrancar el runtime
   nuevo; si no, `ingestCall` fallará y las llamadas irán a `pending.json`.
2. **VPS (pasarela + call-worker):** `prisma generate`, copiar `dist` y
   reiniciar solo `vendrava-zadarma.service` y `vendrava-call-worker.service`
   (procedimiento de `integrations/zadarma/deploy/`). Desplegar los dos a la
   vez: un worker nuevo con pasarela vieja degrada a `gateway_rejected`. No
   tocar Asterisk, nginx ni Sprintmarkt. Recomendado fijar
   `DEFAULT_PHONE_COUNTRY_CODE=34` en `/etc/vendrava/zadarma.env`.
3. **API (Railway):** desplegar HEAD y definir `ZADARMA_CALLER_ID` (para que el
   check de número de salida sea real), `CEREBRAS_API_KEY`, `DEEPGRAM_API_KEY`,
   `FISH_API_KEY` (readiness de credenciales) y `DEFAULT_PHONE_COUNTRY_CODE=34`.
   Para las importaciones hace falta **un proceso `node dist/worker.js` con
   `BACKGROUND_WORKERS_ENABLED=true`**; no arrancará el consumidor de llamadas
   salvo `LEAD_CALL_DISPATCH_IN_WORKER=true`.
4. **Frontend (Vercel):** desplegar HEAD.

Variables nuevas, todas opcionales con valor por defecto: `ZADARMA_AMD_WINDOW_MS`
(10000), `VOICE_SILENCE_REPROMPT_MS` (12000), `VOICE_SILENCE_HANGUP_MS` (25000),
`VOICE_FAREWELL_GRACE_MS` (4000), `VOICE_HISTORY_CHAR_BUDGET` (16000),
`PROMPT_CHAR_BUDGET` (24000), `WORKER_QUEUE_CONCURRENCY`, `REQUIRE_VOICE_CONSENT`,
`LEAD_CALL_DISPATCH_IN_WORKER`.

### 10.6 Lo que solo se puede comprobar con una llamada real

- Detección de buzón por el primer audio y sus falsos positivos.
- Tiempos de silencio, repregunta y despedida.
- Calidad del clasificador de resultado y de la extracción de `meetingAt`.
- Inferencia de `no_answer`/`busy` por tiempo de timbre (el usuario AMI del
  VPS tiene `read=none`; con `read=call` llegaría la causa real).
- Backpressure con una respuesta larga.
- Reconciliación con los permisos reales del directorio de grabaciones.
- Opt-out con transcripción en streaming.
- Puntuación del evaluador en una conversación bidireccional.

La microprueba del 19-09 es anterior a todo este trabajo. La siguiente prueba
debe hacerse con `POST /agents/:id/test-calls` sobre el número autorizado,
tras el despliegue, y solo entonces publicar el agente.

### 10.7 Pendiente fuera del módulo

- Rotar las cinco credenciales del commit `9ca9d1b` (§2.1).
- `/health/integrations*`, `TRUST_PROXY`, WebSockets sin revocación (§2.2).
- Datos personales y ficheros sobrantes versionados (§4).
- Integración de Jev (§9), pendiente de acceso a su documentación.
