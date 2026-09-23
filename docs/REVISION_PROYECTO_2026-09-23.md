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
