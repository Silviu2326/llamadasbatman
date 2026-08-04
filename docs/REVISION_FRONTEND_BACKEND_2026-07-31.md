# Revisión completa frontend + backend — 31/07/2026

Motivo: páginas de la aplicación que al entrar mostraban "servicio no disponible"
u otros estados de error, y la petición de revisar y arreglar todo el CRM.

Método: 4 auditorías en paralelo (contratos API, integridad del backend,
degradación/503, errores de ejecución del frontend) y después 7 tandas de
arreglo con propiedad de archivos disjunta, en 4 rondas. Todo verificado
ejecutando el backend de verdad y compilando, no solo por inspección.

**51 archivos tocados**: 37 de frontend (`src/`), 13 de backend (`backend/src/`),
1 de scripts. Dos archivos nuevos (`src/lib/planGate.js` y su test).

---

## 1. El diagnóstico, y en qué me equivoqué a mitad

La primera hipótesis de la auditoría fue que el culpable era el **gate de plan**:
el backend responde `403 PLAN_CAPABILITY_REQUIRED` cuando la organización no
tiene contratada esa capacidad, y el frontend lo pintaba como caída del servicio.

**Esa hipótesis era incorrecta para esta instalación.** Al consultar la base de
datos (solo lectura) la única organización resultó estar en plan **`completo`**,
que incluye todas las capacidades salvo `multiworkspace`. Así que el 403 de plan
casi nunca se dispara aquí.

Las causas reales, confirmadas contra el backend en ejecución, son dos:

1. **`GET /api/dashboard/actions` devolvía 503** y rompía el Centro de Acción del
   Dashboard. `materializeActionItems` hace hasta 150 `upsert` secuenciales dentro
   de un `$transaction` con el timeout por defecto de Prisma (5 s). Contra
   PostgreSQL remoto (Neon), cada ida y vuelta cuesta ~50-100 ms: 150 × 100 ms
   son 15 s. **El timeout se agotaba siempre.**
2. **Ninguna integración externa está configurada** en este entorno
   (`/health/integrations`: `meta_ads`, `google_search_console`, `metricool`,
   `mautic_email` y `twilio`, todas sin configurar). Las páginas que dependen de
   ellas devolvían 502/503/500 con mensajes internos en vez de "conecta X".

El arreglo del gate de plan se ha hecho igualmente: es correcto, y es lo que
protege a cualquier cliente que no esté en `completo`.

### Lo que NO estaba roto (verificado, no supuesto)

- **Integridad del backend**: cero imports rotos, los 42 plugins de rutas
  registrados, 301 rutas sin colisiones, los 74 accesores `prisma.X` existen en
  el esquema. El borrado de Postiz no dejó nada colgando fuera de las migraciones
  (que son historial y no se tocan) y una mención en documentación.
- **Contratos frontend↔backend**: cero rutas huérfanas, cero verbos HTTP
  equivocados, cero prefijos desalineados. El bug histórico de "array vs
  `{items}`" está cerrado en todos los selectores y listas.
- **Sitio público** (`vendrava-public`): `next build` limpio, sin cambios.
- Compilación de partida: `tsc` del backend y `vite build` del frontend ya
  pasaban antes de empezar. El problema era 100 % de ejecución.

---

## 2. Fontanería compartida (nueva)

| Archivo | Qué es y por qué |
|---|---|
| `src/lib/planGate.js` **(nuevo)** | `readPlanGate(response)` devuelve el bloqueo de plan o **`null` si es un fallo real**. `planGateMessage(gate, locale)` redacta el aviso. Existe para que cada página no invente su propia forma de distinguir "no está en tu plan" de "el servicio se ha caído" — que era exactamente el bug. |
| `src/lib/planGate.test.mjs` **(nuevo)** | Comprobación ejecutable sin framework (`node --test src/lib/planGate.test.mjs`). El caso que cubre de verdad: **un 503 real NO debe leerse como bloqueo de plan**, o el usuario dejaría de enterarse de las caídas. 5/5 pasan. |
| `src/components/ui/DataStatusBanner.jsx` | Se le añadió `status="plan"`. Se reutilizó el banner que ya existía en vez de crear otro componente. |
| `src/components/ui/data-status.css` | Estilo `.data-status-plan` (ámbar, candado). |
| `src/i18n/index.js` | Clave `status.plan` en español e inglés. Dos líneas. |

⚠️ **Detalle de uso**: `readPlanGate` hace `response.clone()`, así que hay que
llamarlo **antes** de consumir el cuerpo con `response.json()`.

---

## 3. Backend

| Archivo | Qué se hizo y por qué |
|---|---|
| `services/actionCenter.service.ts` | **Los dos arreglos que quitan el 503 del Dashboard.** (a) Timeout de la transacción a 30 s (`maxWait` 10 s): la causa raíz. (b) Si aun así falla la persistencia, se devuelven los items ya calculados en memoria con `degraded: true` en lugar de propagar el error — **una lectura no debe caerse por no poder escribir su caché**. Techo conocido anotado en el código: si se pasa de 150 items, toca agrupar en `createMany`/`updateMany` en vez de subir más el timeout. |
| `services/dashboard.service.ts` | Emite `newLeads` y `averageCallDuration`, que **Leads.jsx y Calls.jsx llevaban leyendo sin que nadie los emitiera** (dos tarjetas KPI vacías para siempre). `leadsThisWeek` ya se calculaba; la duración es un `_avg` nuevo, formateado `m:ss` porque la tarjeta lo pinta tal cual. |
| `controllers/revenueIntelligence.controller.ts` | Emite `canManagePolicies`, que la pantalla de Gobierno leía y **el backend nunca devolvía**: el botón "Editar con permisos" estaba muerto para todos los roles. Se calcula con el mismo permiso que guarda el `PUT`, porque es decisión del servidor. |
| `controllers/mautic.controller.ts` | `GET .../stats` devolvía 503 cuando Mautic no está configurado. Ahora `200 {configured:false, stats:null}`. **Los POST siguen fallando**: una escritura que no se ejecuta no puede responder 200. |
| `services/prospecting.service.ts` | Dos fugas de jerga a la pantalla: el mensaje citaba `GOOGLE_PLACES_API_KEY`, y el error del proveedor volcaba el cuerpo crudo de la API de Places. Ahora el detalle va al log y al usuario le llega un mensaje accionable. |
| `controllers/prospects.controller.ts` | "No configurado" → `409 PROSPECTING_NOT_CONFIGURED`; el fallo real del proveedor sigue en 503 con `PROSPECTING_UNAVAILABLE`. |
| `controllers/metaAccounts.controller.ts` | `oauth/start-url` dejaba escapar un `throw` y salía un **500 sin cuerpo** (no hay `setErrorHandler` global). Ahora `409 META_OAUTH_NOT_CONFIGURED`. |
| `controllers/metricool.controller.ts` | Usaba **502** para "falta credencial", que es configuración, no fallo del proveedor → `409` con código estable. Los 502 genuinos se conservan. Mensajes que citaban `APP_URL`, `PUBLIC_HOST` y `OPENAI_API_KEY` reescritos. |
| `access-control/entitlements.ts` | `'bÃ¡sico'` era una **clave** del mapa de alias de plan: el alias "básico" nunca funcionó y caía a `free`. Corregido a `'básico'`. |
| `controllers/ads.controller.ts`, `lib/tokenCrypto.ts`, `lib/integrationRuntime.ts`, `services/metaAdAccount.service.ts` | Resto del mojibake `Ã` en textos de cara al usuario. |
| `scripts/test-runtime.offline.test.mjs` | Test en rojo **de antes de empezar**: afirmaba un recuento exacto de ficheros de test (28) y ya había 32. Cambiado a cota inferior — lo que comprueba es que el descubrimiento recursivo funciona, no cuántos tests hay. |

---

## 4. Frontend

### 4.1 Páginas que se sustituían por una pantalla de error

Patrón corregido: la página **se renderiza igual**, con su cabecera y sus
acciones, y el aviso se **añade** arriba en vez de reemplazar el contenido.

- `pages/FunnelsPage.jsx`, `pages/AdsPage.jsx`, `pages/EnterpriseGovernancePage.jsx`
- `lib/organic/organicApi.js` + `pages/OrganicLeadsPage.jsx` — el 403 cae ahora en
  la rama de onboarding ya existente, así que **se sigue viendo el panel de
  integraciones**, que es justo lo que permite conectar la fuente que falta.
- `components/Pipeline.jsx` — `Promise.all` → `Promise.allSettled`. Solo
  `/api/pipeline` es esencial; `insights`, `prediction`, `actions` y `forecast`
  degradan a vacío. **Antes el tablero entero estaba roto de forma permanente
  para cualquier usuario con rol `sales_rep`**, porque esos tres endpoints exigen
  scope `org` y ese rol los tiene con scope `own`.

### 4.2 Fallos silenciosos: la página mentía

Peor que un error, porque presenta ceros inventados como datos reales.

- `components/Configuracion.jsx` — **el más grave**: si la carga fallaba, el
  formulario quedaba en blanco y pulsar "Guardar" **habría sobrescrito los datos
  reales de la organización con cadenas vacías**. Ahora el guardado está
  bloqueado hasta que la carga tenga éxito.
- `components/Playbooks.jsx` — no comprobaba `response.ok` en ningún sitio.
- `components/Campaigns.jsx` — tarjetas KPI a `—` en vez de `0`.
- `pages/MetaAccountPage.jsx` — un 5xx era indistinguible de "no hay cuenta
  conectada": invitaba a rehacer el OAuth durante una caída.
- `pages/VoiceTestPage.jsx` — desplegable de agentes vacío sin explicación.
- `components/dashboard/ActionCenter.jsx` — pinta el nuevo estado `degraded`
  del backend: las señales son válidas pero los cambios de estado no se guardan.

### 4.3 Excepciones que dejaban la pantalla en blanco

- `pages/VoiceTestPage.jsx` — `line.text.toLowerCase()` sobre `undefined`
  **tumbaba la página en mitad de una sesión de voz** cuando el motor emitía un
  error sin mensaje. Normalizado en origen y en la lectura.
- `pages/ArticleDetailPage.jsx` — `CONTENT_SECTIONS` **no está declarado en todo
  el proyecto**; 4 usos a la espera de un `ReferenceError`.
- `pages/GrowthHubPage.jsx` — editar un programa sin descripción y guardar
  lanzaba `TypeError` y congelaba el modal sin guardar.
- `pages/LeadDetailPage.jsx` — la ficha podía quedarse **congelada para siempre**
  en "Cargando…" porque `setLoading(false)` era la última línea de un handler que
  podía lanzar antes. Ahora va en un `.finally`.
- `pages/AgentDetailPage.jsx` — el fallo de un endpoint **secundario** hacía que
  la página dijera "Agente no encontrado" aunque el agente cargara bien.
- `components/Dashboard.jsx` — desreferencia de cuerpo crudo que ponía todo el
  dashboard en `disconnected` pese a una respuesta correcta. Era código muerto.
- `components/Leads.jsx`, `Calls.jsx`, `Reuniones.jsx`, `pages/LandingsPage.jsx` —
  la línea protegía el payload y la siguiente lo desreferenciaba sin proteger.

### 4.4 Armazón de la aplicación

- `components/ProtectedRoute.jsx` — **el cambio de mayor alcance**. Había un solo
  error boundary, y envolvía a *toda* la aplicación: un `throw` en el render de
  una página **desmontaba sidebar, router y sesión**, y su "Reintentar"
  remontaba la misma ruta rota en bucle. Ahora el `<Outlet />` va envuelto en su
  propio boundary con `key={location.pathname}`: un fallo deja la navegación
  viva y cambiar de ruta lo resetea. El boundary raíz se queda como último recurso.
- `App.jsx` + `lib/organicPage.js` — la guarda de `/organic` era código muerto
  (el resultado de `lazy()` siempre es truthy); movida dentro del factory.
- `pages/PublicLandingPage.jsx` — en `StrictMode`, un visitante **público** veía
  un parpadeo de "Landing no encontrada" antes de la landing real.

### 4.5 Mutaciones que fallaban en silencio

El usuario creía haber guardado y no había guardado.

- `pages/MeetingDetailPage.jsx` — cancelar una reunión navegaba a la lista
  incondicionalmente: con un 403/500 **la reunión seguía agendada**.
- `pages/OpportunityDetailPage.jsx` — quitar contacto o línea desaparecía de la
  interfaz y reaparecía al recargar, con los totales descuadrados.
- `pages/AgentDetailPage.jsx` — la insignia decía "Activo" con el agente pausado.
- `pages/CallDetailPage.jsx`, `pages/LeadDetailPage.jsx`, `pages/ArticleDetailPage.jsx`.

### 4.6 Higiene

- `components/Agentes.jsx` — **cada tecla** escrita en el Studio relanzaba hasta
  8 peticiones en paralelo. Dependencia cambiada a la identidad de la lista.
- `pages/ConversationsInboxPage.jsx` — carrera: una respuesta antigua podía pisar
  a la nueva y reapuntar el hilo abierto. Token de petición.
- `components/KnowledgeBase.jsx` — flag de cancelación, como el resto del repo.
- `pages/ConectarRedesPage.jsx` — eliminado el `<iframe>` embebido de Metricool:
  **ninguna respuesta del backend devuelve `embedUrl`**, la rama nunca se
  renderizó. Con su estado huérfano.

---

## 5. Verificación

| Comprobación | Resultado |
|---|---|
| `npm run build` (frontend) | ✅ exit 0 |
| `npx tsc --noEmit` (backend, `strict`) | ✅ 0 errores |
| **`npm test` (suite completa del backend)** | ✅ **106/106** |
| `npm run test:offline` (backend) | ✅ 4/4 |
| `node --test src/lib/planGate.test.mjs` | ✅ 5/5 |
| `next build` (`vendrava-public`) | ✅ exit 0 |
| `prisma migrate deploy` sobre base virgen | ✅ las 20 migraciones aplican limpias |
| **Recorrido autenticado de 49 rutas** | ✅ 47 × `200`, 2 × `403` correctos, **0 errores de servidor** |

---

## 5.bis Segunda ronda: verificación real (misma fecha)

La primera ronda dejó dos huecos: la suite nunca se había ejecutado y nada se
había probado con sesión. Ambos están cerrados, y cerrarlos destapó cuatro bugs
más.

### El BOM que impedía ejecutar los tests

`backend/.env` empezaba con un BOM UTF-8 (`EF BB BF`), así que `node --env-file`
leía la primera clave como `﻿DATABASE_URL` y **`process.env.DATABASE_URL`
era `undefined`**. Prisma no se enteraba porque carga el `.env` por su cuenta y sí
quita el BOM — pero el guard del `pretest` sí, y abortaba. **Por eso la suite no
se había ejecutado nunca.** BOM eliminado (contenido byte a byte idéntico por lo
demás, verificado con `cmp`).

### Entorno de pruebas montado

La máquina ya tenía PostgreSQL 18 nativo en el puerto 5433. Se creó la base
aislada `vozia_test` (sin tocar las de otros proyectos que conviven ahí) y se
añadió `TEST_DATABASE_URL` al `.env`, así que **`npm test` ya funciona sin
configurar nada**. Aplicar las 20 migraciones desde cero demostró que la cadena
es válida: el problema del despliegue es sólo el ledger de Neon.

### Tres tests que llevaban rotos sin que nadie lo supiera

Los tres fallaban en `HEAD`, ocultos por el BOM. Ninguno lo introdujo esta sesión.

- `plan-entitlements.contract.test.ts` — comprobaba el tope de cuota con `100_001`
  escrito a mano; cuando `agency` pasó a 1.000.000 de leads el test dejó de
  comprobar nada. Ahora deriva el valor de `snapshot.limits.leads + 1`.
- `entitlements.test.ts` — `applyWorkspaceContext` consulta prisma de verdad y la
  organización primaria no existía, así que cortaba con 404 antes de llegar a la
  comprobación de concesión que el test dice verificar. Ahora siembra `org-a` con
  plan `agency` y limpia al terminar.
- `accessControl.test.ts` — **el importante**: un rol fuera del catálogo recibía
  `401` en vez de `403`. Y `src/lib/api.js` trata el 401 borrando la sesión y
  redirigiendo a `/login`, así que ese usuario quedaba en **bucle de deslogueo**
  en lugar de leer "no tienes permiso". Corregido en `middlewares/authenticate.ts`:
  token y sesión válidos con claims que no autorizan es 403, no 401.

### Un cuarto bug, encontrado al recorrer la app con sesión

`/api/metricool` respondía *"Redes sociales no está incluido en tu plan"* a una
organización en plan `completo` — el máximo. La causa real era
`metricoolEnabled=false`. `requirePlan` (metricool) y `assertEmailMarketingEnabled`
(mautic, y su copia en `leads.controller.ts`) mezclaban **dos condiciones
distintas** bajo el mismo mensaje, así que se invitaba al usuario a comprar una
mejora que no habría cambiado nada. Ahora se distinguen, con los mismos `code`
que usa `requireEntitlement` para que `planGate.js` los reconozca sin casos
especiales:

- plan insuficiente → `PLAN_CAPABILITY_REQUIRED`, "Mejora tu plan"
- integración apagada → `INTEGRATION_DISABLED`, "Pide a tu administrador que lo active"

Verificado en caliente con los dos planes.

### Lo que sigue sin verificarse

- **Un `500` en `/api/dashboard/stats`, observado una vez y no reproducible**
  (`P1001`, "no se alcanza el servidor") en la primera petición tras arrancar,
  mientras la suite de tests golpeaba el mismo Postgres local — que además sirve
  a otros proyectos. 3/3 en verde al reintentarlo en frío. Se deja anotado sin
  arreglo inventado: `getStats` lanza ~25 consultas en un solo `Promise.all` y es
  el endpoint que primero sufriría un pool saturado.
- **Redis y las colas.** Docker Desktop arranca pero su motor Linux no funciona:
  **WSL no tiene ninguna distribución instalada**. Instalar una requiere permisos
  de administrador y probablemente reinicio. El servicio `redis` ya está añadido
  al `docker-compose.yml` y validado con `docker compose config`; sólo falta que
  Docker pueda ejecutarlo.
- **El navegador.** El recorrido de 49 rutas fue por API con sesión real, no
  pulsando botones en la interfaz.

---

## 6. Decisiones abiertas — resueltas

Las seis quedaron delegadas. Cuatro se han resuelto en código; dos no eran
decisiones sino secretos e infraestructura que no tengo.

### Resueltas en código

**3. CTAs bajo bloqueo de plan → deshabilitados.** Un botón que siempre devuelve
403 no es un gancho de venta, es una trampa: el usuario lo pulsa, falla, y vuelve
a leer "no se pudo". En `FunnelsPage.jsx` el botón "Nuevo funnel" se deshabilita
con el motivo en el `title`, y el estado vacío pasa a explicar el bloqueo en vez
de ofrecer "Crear funnel". Igual en `AdsPage.jsx` con "Nueva campaña" y `EmptyAds`.
El aviso de plan sigue visible arriba, así que el gancho de venta está — pero en
el banner, que sí puede explicarlo, no en un botón que solo sabe fallar.

**5. `GET /api/mautic/campaigns/:id/stats` → envoltura simétrica.** Ahora devuelve
siempre `{configured, stats}`, en los dos caminos. Tener dos formas distintas
según el resultado obliga al consumidor a adivinar cuál le toca, y ese es
exactamente el tipo de trampa que acaba pintando un "servicio no disponible"
por error. Como hoy no tiene consumidor, cambiarlo sale gratis; dentro de seis
meses no.

**2. Redis → añadido al `docker-compose.yml`.** No era solo "está apagado": el
compose **no declaraba ningún Redis**, pese a que el backend espera
`redis://localhost:6379`. Es decir, en local siempre arrancaba degradado y no
había forma documentada de evitarlo. Añadido el servicio `redis:7-alpine` con su
volumen. Se levanta solo con `docker compose up -d redis` (sin arrastrar Mautic,
que exige contraseñas por entorno). Validado con `docker compose config`. Queda
en tu mano arrancar Docker Desktop, que ahora mismo no está corriendo.

**6. Superficie de API sin interfaz → se conserva, decisión tomada.** Comprobé si
las consumían el arnés de staging o los tests: salvo `/api/whatsapp/send` y
`/api/calls/:id/evaluation`, no las usa nadie. Aun así **no se retiran**: no
producen ningún error al usuario, y borrar endpoints que compilan y pasan tipos
es un cambio más grande y más arriesgado que el problema que resuelve — podría
romper integraciones externas o trabajo en curso que no veo desde aquí. Lo que
no se debe hacer es dejarlo sin decidir: la decisión es conservarlas y revisarlas
cuando se aborde el alcance de la API, no ahora.

**4. Menú lateral sin filtro por plan → se queda como está.** Se filtra por rol,
no por plan. Con el aviso ya corregido en cada página, entrar en una sección
bloqueada ahora explica el motivo en vez de simular una caída, que era el bug
real. Ocultar entradas del menú es una elección de producto legítima en ambos
sentidos, y esconder lo que no está contratado destruye la vía natural de venta.
Decisión: no filtrar.

### No son decisiones mías

**1. Credenciales de las integraciones.** No las tengo y no puedo inventarlas.
Meta, Metricool, Mautic, Google Places y Twilio siguen sin configurar
(`/health/integrations` lo confirma). Las páginas ya no se rompen y explican qué
falta, pero esas secciones seguirán vacías hasta que se conecten. Es lo único
que separa a la aplicación de estar funcionalmente completa en este entorno.
