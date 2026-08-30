# Bloqueantes — diagnóstico y plan de resolución

Fecha: 11 de agosto de 2026. Desarrolla la sección 4 de
[ESTADO_PRODUCTO.md](../ESTADO_PRODUCTO.md), donde están resumidos.

Cada bloqueante lleva: qué se ve, por qué pasa, qué cuesta en negocio, las
opciones cuando hay decisión que tomar, el plan con ficheros concretos, el
esfuerzo, el riesgo y el criterio para darlo por cerrado.

Los esfuerzos son rangos honestos de trabajo enfocado, no compromisos.

| # | Bloqueante | Gravedad | Estado a 11/08/2026 |
|---|---|---|---|
| 1 | El agente de voz ignora el CRM | 🔴 | **Cerrado.** Opción A hecha; el 11/08/2026 se decide inglés y la B se descarta |
| 2 | Sin alta de organizaciones ni reseteo | 🔴 | **Reseteo hecho. Alta por script hecha.** Falta registro público (decisión) |
| 3 | Worker y Redis fallan en silencio | 🟠 | **Hecho.** El backend ya lo detectaba; faltaba enseñarlo |
| 4 | Credenciales vacías | 🟠 | Pendiente: es configuración, no código |
| 5 | Mautic no desplegado | 🟠 | Pendiente: es infraestructura, no código |
| 6 | Sin calendario ni salas reales | 🟡 | **Opción A hecha.** B (.ics) y C (OAuth) pendientes |
| 7 | Secuencias de venta sin interfaz | 🟡 | **Hecho** |
| 8 | Restos de maqueta | 🟡 | **Hecho** |
| 9 | Sin cuotas de consumo | 🟡 | **Hecho** |
| 10 | Endurecimiento y vestigios | 🟡 | **Hecho** |

Lo programado el 11/08/2026 está detallado al final, en §11. Las secciones que
siguen conservan el diagnóstico original: sirven para entender por qué se hizo
lo que se hizo, y qué queda de cada uno.

---

## 1. 🔴 El agente de voz ignora la configuración del CRM

### Qué se ve
Un cliente crea un agente, le escribe su guion y su idioma, lo asigna a una
campaña. El agente llama y dice: *"Hi—this is Carlos from Vendrava. I'll be quick:
how's your day going?"* En inglés, con el guion de otro. Siempre.

### Por qué pasa
`vendravaVoice.ts` recibe `systemPrompt` en el constructor y **lo descarta**: el
parámetro está nombrado `_systemPrompt` y el prompt real es una constante en el
propio fichero. Fue una decisión consciente del 10/08/2026: Cartesia Ink-2 con
turnos automáticos solo soporta inglés, y meter un guion en español en un STT y
un TTS ingleses degrada las dos puntas a la vez.

El dato que cambia el análisis: el CRM **ya guarda por agente** lo que hace falta.
`loadAgentConfig` mapea `agent.systemPrompt` → `playbook.scripts.base_prompt` y
`agent.language` → `identity.agentAccent`, y `compliance.isEnglish()` ya sabe
distinguir un agente en inglés. No falta el dato: falta usarlo.

### Qué cuesta
- No se puede llamar en español, que es el mercado que reflejan el resto del
  producto (AMD con frases en español, prompts del simulador en español).
- Vender "agentes de IA personalizables" es hoy falso.
- Daño colateral del mismo día: `callJudge` puntúa tres de sus seis dimensiones
  leyendo eventos (`turn.interruption`, `sales_action.selected`) que emitían
  `turnManager` y `salesBrain`, ya borrados. Esas dimensiones devuelven su valor
  base — una nota inventada. Y `postCallAnalysis` quedó huérfano apuntando a un
  proveedor retirado.

### Decisión tomada (11/08/2026)

**El producto de voz es solo en inglés.** Se descarta la opción B: no se
sustituye Ink-2 ni se reimplementa la máquina de turnos semánticos. El
laboratorio ya funcionaba así y es lo que sostiene los 650 ms.

Consecuencias asumidas: no se pueden vender llamadas en español, y un agente
configurado en otro idioma no llama —falla con un motivo legible— en vez de
llamar en el idioma equivocado. La interfaz del CRM sigue siendo bilingüe ES/EN:
la decisión es sobre las llamadas, no sobre el producto entero.

Alineado en consecuencia: el andamiaje del prompt (`promptContext.ts`), el guion
de respaldo de la cabina, el idioma por defecto de un agente nuevo, el texto de
disclosure, y las frases de detección de recepción e IVR del AMD, que solo
existían en español.

### Opciones que se evaluaron

**A · Personalizar en inglés (0,5 días). ← elegida.** Usar el prompt del CRM cuando el
agente esté configurado en inglés, y rechazar la llamada con un error claro
cuando no lo esté. No resuelve el español, pero convierte "el producto miente" en
"el producto tiene un idioma". Es la base de las otras dos: hazla igualmente.

**B · Español con otro STT (5 – 10 días).** Ink-2 aporta dos cosas: transcripción
y **detección semántica de turno** (`turn.eager_end` / `turn.resume`), que es lo
que sostiene la especulación y los 650 ms. Sustituirlo obliga a reimplementar esa
máquina de turnos contra otro proveedor. Candidatos a evaluar: Deepgram Flux
(tenía justo esos eventos y ya estuvo integrado aquí), o un VAD semántico propio
sobre un STT en streaming. MiniMax y Cerebras se quedan como están: ambos hablan
español sin problema.

**C · Bilingüe por agente (B + 1 día).** El pipeline elige STT según
`agentConfig.identity.agentAccent`. Solo tiene sentido después de B.

### Plan (opción A, que es requisito de todas)
1. En `vendravaVoice.ts`, componer el prompt: instrucciones de formato de voz
   (turnos cortos, sin markdown, admitir que es IA) + `playbook.scripts.base_prompt`
   del agente. Mantener la constante actual solo como respaldo cuando el agente
   no traiga guion.
2. Guardia de idioma: si `isEnglish(ctx.agentConfig.identity.agentAccent)` es
   falso, no arrancar la llamada y devolver un error explícito
   (`voice_language_unsupported`), en vez de llamar en el idioma equivocado.
3. Propagar el mismo criterio en `simStream.ts` para que la cabina avise igual.
4. `callJudge`: reemplazar las tres dimensiones huérfanas por eventos que el
   pipeline sí emite (`response.cancelled` con motivo `barge-in` para turn-taking,
   `latency.update`/`turn.metrics` para naturalidad) **o** marcarlas como
   `unavailable` y dejar de promediarlas en la nota global. Lo que no puede
   quedarse es una nota fija disfrazada de medición.
5. `postCallAnalysis`: o se engancha a `mediaStream` con un proveedor vigente, o
   se borra. Hoy es código muerto que aparenta capacidad.

### Riesgo
Bajo en A: es un cambio local y el respaldo actual sigue existiendo. Alto en B:
toca el corazón del turno, que es donde vive la latencia. Si se hace B, medir
antes y después con el gráfico de la cabina, que ya pinta P50 y P95 por turno.

### Hecho cuando
Un agente con guion propio en inglés llama y usa **su** guion; un agente en
español devuelve un error legible en vez de llamar en inglés; y ninguna dimensión
de `callJudge` devuelve un número que no haya medido.

---

## 2. 🔴 No hay alta de organizaciones ni reseteo de contraseña

### Qué se ve
`routes/auth.ts` expone exactamente tres rutas: `login`, `refresh`, `logout`. No
hay registro, no hay "he olvidado mi contraseña", y no existe ningún
`organization.create` en todo el backend. Cada cliente nuevo se crea por seed o
SQL a mano, y sus credenciales por organización se cargan una a una.

### Qué cuesta
- Vender self-service es imposible. Vender con onboarding asistido, sí.
- Un cliente que se bloquea la cuenta depende de que alguien le toque la base de
  datos. En un producto de pago eso es soporte manual indefinido.

### Lo que ya existe y ayuda
- Stripe funciona de punta a punta, con webhook firmado que ya actualiza
  `Organization.plan`.
- `transactionalEmail.service.ts` (Resend) ya está montado, con
  `isEmailConfigured()` para degradar con elegancia.
- El modelo de datos ya soporta multi-organización; RBAC y entitlements ya
  deciden qué ve cada plan.

### Opciones
**A · Onboarding asistido (1 día).** Un script `npm run org:create` que crea
organización, usuario admin y una contraseña temporal, más un runbook. Honesto y
suficiente si vendes tú, uno a uno.

**B · Self-service completo (3 – 5 días).** Registro con verificación de email,
alta de organización, invitación de usuarios, reseteo de contraseña, y enganche
con el checkout de Stripe que ya existe.

### Plan (B)
1. `POST /auth/register`: crea `Organization` + `User` admin en una transacción,
   plan `free`, y manda email de verificación. Rate limit como el de login.
2. `POST /auth/forgot-password` y `POST /auth/reset-password`: token de un solo
   uso con caducidad, almacenado hasheado. Reutilizar el patrón de
   `contentApprovalLink.service.ts:41`, que ya hace exactamente esto con SHA-256
   y TTL.
3. Invitación de usuarios a una organización existente, con rol del catálogo RBAC.
4. Pantalla de registro y de reseteo en el frontend.
5. Alta de credenciales por organización desde la interfaz, en vez de por API a
   mano, para que el cliente conecte su Twilio y su Meta él solo.

### Riesgo
Medio. Toca autenticación, que es la superficie más sensible del producto. Todo
lo nuevo debe pasar por el rate limit y por el catálogo de roles existente; no
inventar un camino paralelo de autorización.

### Hecho cuando
Alguien sin acceso a la base de datos puede crear su cuenta, verificar su email,
pagar, invitar a un compañero y recuperar su contraseña sin hablar contigo.

---

## 3. 🟠 El worker y Redis fallan en silencio

### Qué se ve
La API responde `200` en `/health`, la interfaz va fina, y **nada se ejecuta**:
los leads no reciben llamadas, las automatizaciones no disparan, el radar
semanal de contenido no corre, las campañas de email no salen.

### Por qué pasa
Dos causas que se suman:
1. El worker es un **proceso aparte** (`npm run worker`, `backend/src/worker.ts`)
   que arranca 15 jobs con polling propio. Si no está desplegado, la API no lo
   sabe ni lo dice.
2. `leadCallDispatch` y `automationRunner` usan **BullMQ sobre Redis**, mientras
   el resto de jobs usa el outbox sobre Postgres. Sin `REDIS_URL`,
   `connectOptionalRedis` devuelve `null` y `enqueueLeadCall` devuelve `false`
   **sin lanzar error**: el paso se marca `blocked/PROVIDER_UNAVAILABLE` y la
   llamada nunca ocurre.

`scripts/production-gate.mjs` ya valida las dos cosas, pero es un script manual
que no está enganchado a ningún despliegue.

### Plan
1. **Hacer ruidoso el fallo.** Que `/health/ready` falle si
   `BACKGROUND_WORKERS_ENABLED` está activo y el heartbeat del worker
   (`observability/workerHeartbeat.ts`, que ya existe) lleva más de N minutos
   sin latir. Un backend sin worker no está "listo".
2. **Avisar en la interfaz.** El dashboard ya tiene `DataStatusBanner`: añadir un
   estado "las tareas automáticas están detenidas" leyendo `/health/workers`.
3. **Desplegar el worker** como servicio separado en Railway con `REDIS_URL`
   compartido, y documentarlo en el runbook.
4. **Cerrar la inconsistencia** (opcional, 1 día extra): migrar
   `leadCallDispatch` y `automationRunner` al outbox de Postgres, y quitar Redis
   de la ruta crítica. Es la deuda AU-14 que el propio repo ya tenía anotada.

### Riesgo
Bajo. El paso 1 puede tumbar un despliegue que hoy pasa por sano — que es
justamente el objetivo, pero conviene desplegarlo cuando el worker ya esté arriba.

### Hecho cuando
Apagar el worker pone `/health/ready` en rojo y saca un aviso en el dashboard en
menos de cinco minutos.

---

## 4. 🟠 Credenciales vacías

### Qué se ve
Módulos que responden 409 o 503 con un mensaje correcto pero que no hacen nada.
No es un fallo de código: el código está y falla bien.

### Inventario y a qué desbloquea cada una

| Variable | Desbloquea | Prioridad |
|---|---|---|
| `CARTESIA_API_KEY`, `MINIMAX_API_KEY`, `CEREBRAS_API_KEY` | Todo el motor de voz | ya puestas (10/08) |
| Twilio por organización + `TWILIO_WEBHOOK_BASE_URL` público | Llamadas y WhatsApp | 1 |
| `GOOGLE_PLACES_API_KEY` | Prospect Finder | 1 |
| `DEEPSEEK_API_KEY` | Radar de contenido (sin fallback), copy de email, sugerencias en la bandeja, SEO con IA | 1 |
| `RESEND_API_KEY` + `EMAIL_FROM` | Email frío, avisos internos, y el reseteo de contraseña del bloqueante 2 | 2 |
| `META_APP_ID` / `META_APP_SECRET` + `APP_URL` pública | Meta Ads y webhook de Lead Ads | 2 |
| `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` | Organic Leads (Search Console, GA4, GBP) | 3 |
| `BRAVE_SEARCH_API_KEY` | Investigación del prospecto en el email frío | 3 |
| `OPENAI_API_KEY` | Imágenes de anuncios | 3 |
| `PSI_API_KEY` | Core Web Vitals en la auditoría (funciona sin ella, con cuota menor) | 4 |
| `METRICOOL_*`, `MAUTIC_*` | Redes y email marketing — ver bloqueante 5 | 2 |

### Trampa conocida
Además de la credencial hay **flags por organización**: `metricoolEnabled` y
`mauticEnabled`. Poner la clave y no activar el flag deja el módulo apagado sin
mensaje claro. Debe entrar en la lista de comprobación de alta de cliente.

### Hecho cuando
`/health/integrations` devuelve `true` en todo lo que el plan del cliente incluye.

---

## 5. 🟠 Mautic no está desplegado

### Qué se ve
Las campañas de email quedan en estado `error` con un mensaje explícito.

### Por qué pasa
`mauticSync.service.ts` (1.297 líneas, OAuth2 client-credentials real y webhook
con HMAC) necesita tres cosas: una instancia de Mautic accesible,
`MAUTIC_CLIENT_ID`/`SECRET`, y **un campo personalizado `crmleadid` creado a mano
en la configuración de Mautic** — está documentado en el propio servicio, línea 24.
Ese último paso es el que se olvida y hace que la sincronización falle en silencio.

### Plan
1. Levantar Mautic con el `docker-compose.yml` que ya está en el repo (servicios
   `mautic` y `mautic-db`, puerto 8100).
2. Crear la API OAuth2 en Mautic y volcar `MAUTIC_CLIENT_ID`/`SECRET`.
3. Crear el campo personalizado `crmleadid`. Sin él, nada casa.
4. Activar `mauticEnabled` en la organización.
5. Configurar el webhook de Mautic hacia el backend con
   `X-Mautic-Webhook-Secret` (en producción se rechaza el secreto por query).
6. Verificar con un envío de prueba a una audiencia de un solo contacto.

### Riesgo
Bajo técnicamente, medio en operación: Mautic self-hosted es una pieza más que
mantener (base de datos propia, actualizaciones, entregabilidad). Alternativa a
considerar si pesa demasiado: mover el email marketing a Resend con listas
propias, reaprovechando `emailAudience` y `emailMetrics`, que ya son tuyos.

### Hecho cuando
Una campaña llega a `sent` y sus métricas de apertura vuelven al CRM.

---

## 6. 🟡 Sin calendario ni salas de reunión reales

### Qué se ve
`Meeting` es una tabla en Postgres. El botón "Unirse" cae a un
`https://meet.google.com` genérico cuando no hay URL, la plataforma se adivina
mirando si el texto contiene `"zoom"`, y **el modal de creación ni siquiera tiene
campo para pegar el enlace**, pese a que `Meeting.meetingUrl` existe en el
esquema. No hay dependencia de Google Calendar, Outlook, Zoom ni `.ics` en todo
el repo.

### Opciones
**A · Honestidad inmediata (0,5 días).** Añadir el campo `meetingUrl` al modal,
quitar el enlace genérico a `meet.google.com` y deshabilitar "Unirse" cuando no
haya URL. El agente pega su enlace de Meet o Zoom a mano. Deja de mentir hoy.

**B · Exportar a calendario (1 día).** Generar un `.ics` por reunión y adjuntarlo
al aviso. Sin OAuth, sin sincronización: el evento entra en el calendario del
comercial y del cliente. Cubre el 80 % del dolor real.

**C · Google Calendar bidireccional (4 – 6 días).** OAuth, creación de evento con
sala de Meet automática, sincronización de cambios y webhook de cancelaciones.
Se apoya en que ya tienes OAuth de Google montado para Organic Leads.

Recomendación: A ahora, B en cuanto haya un hueco, C solo si un cliente lo pide.

### Nota sobre recordatorios
El aviso T-24h **sí es real** (`jobs/temporalEventScheduler.ts:114-144`, con
`ScheduledTrigger` en base de datos), pero solo actúa si el usuario ha creado una
automatización que consuma ese evento. Debería venir una automatización por
defecto en el alta, o el recordatorio no existe para quien no lo configure.

### Hecho cuando
Ningún botón lleva a una sala que no es la de la reunión.

---

## 7. 🟡 El motor de secuencias de venta no tiene interfaz

### Qué se ve
El backend está completo y testeado: matricular, pausar, reanudar, detener, con
pasos idempotentes, reintentos, y respeto de consentimiento y compliance
(`salesSequence.service.ts:126-465`, tests en `salesSequence.test.ts`). Pero el
formulario de Growth Hub solo envía `{name, description, status, type}`. Una
secuencia creada desde la interfaz **nace sin pasos** y al matricular falla con
`SEQUENCE_STEPS_INVALID`.

### Qué falta exactamente
El backend espera en `program.config`:
```
{ leadIds: string[], steps: [{ type, delayDays, purpose, ... }] }
```
con `type` en `email | ai_email | task | meeting | call | whatsapp`. La interfaz
no construye ni `steps` ni `leadIds`, y no llama a `/enroll`, `/enrollments`,
`/pause`, `/resume` ni `/stop`, que ya existen.

### Plan
1. Editor de pasos: lista ordenable con tipo, retraso en días y plantilla.
2. Selector de leads reutilizando los filtros de la pantalla de Leads.
3. Botones de matricular, pausar, reanudar y detener contra las rutas existentes.
4. Vista de matriculados con el estado de cada paso (`SalesSequenceStepRun` ya lo
   guarda).

Es trabajo de frontend contra una API que ya funciona: sin riesgo de backend.

### Hecho cuando
Se puede crear una secuencia de 3 pasos, matricular 10 leads y ver correr el
primer paso, todo desde la interfaz.

---

## 8. 🟡 Restos de maqueta

Datos falsos en pantallas que por lo demás son reales. Es el tipo de detalle que
mata una demo.

| Dónde | Qué está inventado | Arreglo |
|---|---|---|
| `OpportunityDetailPage.jsx:824-827` | La pestaña "Actividad" es un array fijo con fechas relativas falsas | `SalesActivity` ya tiene `opportunityId`: exponer un endpoint de timeline y consumirlo |
| `OpportunityDetailPage.jsx:622` | "Próximas acciones recomendadas" son 3 frases fijas | Reutilizar `NextBestAction` de Revenue Intelligence, que ya calcula esto de verdad |
| `OpportunityDetailPage.jsx:148` | `city` clavado a `'—'` | Traerlo del lead o quitar el campo |
| `Playbooks.jsx:251-252` | "Usados en campañas" y "Tasa de éxito" siempre `'—'` | Agregar por campaña y por resultado de llamada, o quitar las tarjetas |
| `MeetingDetailPage.jsx:557` | Pestaña "Historial" con texto estático | Misma fuente que la actividad de oportunidad |
| `KnowledgeBase.jsx` | "Visitas" y "Útiles" siempre nulos | Existe `KnowledgeFavorite`; o se cuenta, o se quitan las columnas |
| `pipeline.service.ts:665-739` | Los paneles se llaman "Insights IA" y son heurística estadística | Renombrar a "Señales del pipeline". El cálculo es correcto; el nombre miente |

Criterio: **cada uno se arregla o se borra.** Ninguno se queda a medias.

### Hecho cuando
Se puede recorrer la aplicación entera delante de un cliente sin evitar pestañas.

---

## 9. 🟡 Sin cuotas de consumo

### Corrección al informe anterior
Los límites de plan **sí se aplican**: `assertUsageLimit` está enganchado a la
creación de agentes, leads, campañas, automatizaciones y anuncios vía
`requireEntitlement(..., { limit: { resource } })`, y hay tests de contrato que lo
cubren. Mi afirmación anterior de que "no hay límites" era falsa.

### Lo que sí falta
Los límites cuentan **entidades**, no **consumo**. No hay techo para lo que
cuesta dinero de verdad: minutos de llamada, tokens de LLM, envíos de email,
imágenes generadas. Un cliente de plan `free` puede dejar corriendo llamadas toda
la noche y la factura de Cartesia, Cerebras, MiniMax y Twilio es tuya.

Con los números de [COSTES_VOZ_INGLES.md](../COSTES_VOZ_INGLES.md), 1.000
llamadas de 3 minutos son 181 $. No hace falta mala fe para hacer daño.

### Plan
1. Añadir recursos de consumo al catálogo: `call_minutes`, `llm_tokens`,
   `emails_sent`, por periodo de facturación.
2. Contadores por organización en base de datos, incrementados donde ya se sabe
   el gasto: cierre de llamada en `mediaStream`, envío en `outboundEmail`,
   respuesta del LLM.
3. Comprobación antes de empezar una llamada (`canCall` ya es el sitio natural) y
   antes de un envío masivo.
4. Aviso al 80 % y corte al 100 %, con mensaje que ofrezca subir de plan.

### Hecho cuando
Una organización que agota su cuota deja de gastar dinero automáticamente y se
entera antes de que pase.

---

## 10. 🟡 Endurecimiento y vestigios

### Consultas sin `orgId` explícito
`mauticSync.service.ts:1284` (`recordActivityByCrmLeadId`) y
`metaConversions.service.ts:164` (`deliverConversionSignal`) resuelven por id sin
filtrar por organización. Son flujos internos disparados por webhook u outbox, no
endpoints autenticados, así que el riesgo hoy es bajo — pero es la única parte
del código que no sigue la disciplina del resto. Añadir el filtro es de minutos y
elimina la excepción.

### Vestigios del motor de voz anterior
`elevenLabsVoiceId` sigue en `AgentConfig` y en el esquema, y `agent.voiceId` se
sigue rellenando desde `ELEVENLABS_VOICE_ID`. No rompe nada: confunde a quien
configure un agente y sugiere una capacidad que ya no existe. Cuando se resuelva
el bloqueante 1, ese campo debería pasar a ser el `voice_id` de MiniMax, que es
el que de verdad manda hoy.

### Hecho cuando
No queda ninguna consulta que resuelva por id sin ámbito de organización, y
ningún campo de configuración nombra un proveedor que no se usa.

---

## 11. Lo programado el 11/08/2026

Ocho de los diez bloqueantes quedan cerrados o con su parte de código hecha.
Verificado con `tsc --noEmit` limpio, `npm test` en **300/300** y build del
frontend correcto.

### Voz (§1, opción A)
- `vendravaVoice.ts` usa el prompt que llega del CRM —agente, playbook y
  contexto del lead ya compuestos por `buildIntelligentPrompt`— y añade al final
  `VOICE_DELIVERY_RULES`, que fija el formato hablado y el idioma. El guion de
  laboratorio queda solo como respaldo cuando la llamada no trae agente.
- La voz de MiniMax sale de `agentConfig.voice.ttsVoiceId`: cada agente puede
  tener la suya.
- El saludo usa el nombre y la empresa del agente vía `openingGreeting`, con el
  disclosure de IA y el consentimiento de grabación que ya exigía compliance.
- Guardia de idioma en tres sitios (`factory`, `simStream`, el propio motor):
  un agente que no esté en inglés no llama, y el error dice por qué.
- `callJudge` ya no inventa notas: cada dimensión sin señal vale `null` y no
  entra en la media. Turn-taking sale de `barge_in.detected` frente a turnos,
  naturalidad de cuántos turnos respetaron los 650 ms, y descubrimiento de las
  preguntas del agente en el transcripto.
- `postCallAnalysis` borrado: estaba huérfano y apuntaba a un proveedor retirado.

### Alta y contraseñas (§2)
- `POST /api/auth/forgot-password` y `/reset-password`, con el mismo rate limit
  que el login. El token es un HMAC sobre id + hash actual + caducidad de una
  hora: **sin tabla nueva y sin migración**, y al cambiar la contraseña todos
  los enlaces emitidos dejan de valer. Cambiar la contraseña cierra las sesiones.
- Página `/reset-password` y el panel de recuperación del login, que antes solo
  abría un correo a soporte, ahora piden el enlace de verdad.
- `npm run org:create "Cliente" admin@cliente.com [plan]` da de alta organización
  y propietario con contraseña aleatoria de un solo uso.

### Resto
- **§3**: `WorkerStatusBanner` en el dashboard, que consulta `/health/ready` cada
  minuto y avisa cuando las tareas de fondo están paradas.
- **§6**: campo *Enlace de la reunión* en el modal y fuera el `meet.google.com`
  genérico. El botón "Unirse" ya solo aparece con enlace real.
- **§7**: editor de pasos (`SequenceStepsEditor`) que escribe `config.steps`, y
  panel de matriculación con búsqueda de leads y botones de pausar, reanudar y
  detener contra las rutas que ya existían.
- **§8**: la pestaña Actividad de la oportunidad sale de `SalesActivity` por un
  endpoint nuevo (`GET /api/pipeline/:id/activity`); "Próximas acciones" es
  ahora la tarea real abierta; la ciudad viene del lead; el historial de reunión
  usa `previousMeetings` y `recentActivity`, que ya venían en el prep; Playbooks
  cuenta campañas de verdad y se retira la tarjeta de tasa de éxito; Knowledge
  Base pierde las columnas que nunca se midieron; y los paneles "IA" del
  pipeline se llaman ahora "Señales del pipeline" y "Acciones recomendadas".
- **§9**: `access-control/consumption.ts` con techo mensual por plan de minutos
  de llamada y envíos de email, contados de `Call` y `EmailDelivery` sin tabla
  nueva. Enganchado en `canCall()` y en el envío de outbound, con aviso en el
  log al 80 % y `GET /api/billing/usage` para verlo.
- **§10**: `recordActivityByCrmLeadId` y `deliverConversionSignal` resuelven ya
  por organización; `elevenLabsVoiceId` pasa a `ttsVoiceId`.

### Correcciones al diagnóstico
Programar reveló tres cosas que la auditoría contaba peor de lo que estaban:

1. **Los límites de plan sí se aplicaban** (`assertUsageLimit` en creación de
   agentes, leads, campañas, automatizaciones y anuncios). Lo que faltaba eran
   cuotas de consumo, no de entidades.
2. **`/health/ready` ya devolvía 503** cuando el worker no late y los workers
   están activos: la alerta `WORKER_HEARTBEAT_MISSING` es crítica desde antes.
   Lo que "siempre decía ok" era `/health`, que es la sonda de liveness y debe
   comportarse así. Lo que faltaba era enseñarlo en la interfaz.
3. **El enlace genérico a `meet.google.com` era inalcanzable**: el botón
   "Unirse" ya exigía `meetingUrl`. El agujero real era que no había forma de
   guardar ese enlace.

### Nota de entorno
La base de pruebas `vozia_test` tenía nueve migraciones sin aplicar desde el
trabajo de variantes de email (09/08), lo que hacía fallar 58 tests por columnas
inexistentes. Se aplicó `prisma migrate deploy` contra ella —base aislada, la
que protege `scripts/test-database-guard.mjs`— y la suite pasó de 247/305 a
**300/300**. La base de producción sigue sin tocar.

---

## Orden sugerido

**Semana 1 — que deje de mentir.** Bloqueante 1 opción A, bloqueante 3 (salud del
worker), bloqueante 8 (restos de maqueta), bloqueante 10. Son cambios pequeños
que quitan del producto todo lo que aparenta algo que no es.

**Semana 2 — que funcione.** Bloqueante 4 (credenciales), 5 (Mautic), 6 opción A.
Aquí el producto pasa a hacer trabajo real para un cliente.

**Semana 3 y 4 — que se pueda vender.** Bloqueante 2 (alta y reseteo), 9 (cuotas),
7 (interfaz de secuencias).

**Cuando haya decisión de idioma.** Bloqueante 1 opción B, que es el proyecto
grande y el que define si el producto se vende en español o en inglés.
