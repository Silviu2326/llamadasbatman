# Plan de acción detallado — 20 clientes en 60 días

Del 17 de agosto al 17 de octubre de 2026. Productos **A** (web + SEO + sistema) y
**C** (plataforma en marca blanca). Costa Este de EE. UU., en inglés.

Este documento es para ejecutar, no para decidir. Lo que había que decidir está en
[PLAN_60_DIAS_20_CLIENTES.md](PLAN_60_DIAS_20_CLIENTES.md).

---

## 0. Cuatro correcciones al plan anterior

Al bajar al código para escribir el detalle, resulta que **cuatro de los
bloqueantes que daban por pendientes los documentos ya están construidos**. Esto
cambia el calendario a mejor y hay que decirlo antes de nada.

| Lo que decían los documentos | Lo que dice el código |
|---|---|
| ❌ "Falta la consulta de tipo de línea" | ✅ **`lookupLineType()` está construido** — Twilio Lookup v2 con `line_type_intelligence` ([compliance.ts:106](backend/src/voice/compliance.ts#L106)) |
| ❌ "El horario legal es el mapa de México" | ✅ **`STATE_TZ` + `timeZoneForState()`** por estado americano ([leadEnrichment.ts:61](backend/src/jobs/leadEnrichment.ts#L61)) |
| ❌ "Falta el verificador de correo" | ✅ **`emailDiscovery.service.ts` construido** — solo falta la clave, y avisa por consola si no está |
| ❌ "Marca blanca: alta manual por SQL, techo de 10-12 cuentas" | ✅ **`createClient()` crea organización y usuario admin en una transacción**, con precio de venta, coste mayorista y cuotas ([whiteLabel.service.ts:271](backend/src/services/whiteLabel.service.ts#L271)). **Hay pantalla**: `AgencyWhiteLabelPage.jsx` |

**Consecuencia directa: el techo de 14 cuentas de marca blanca desaparece.** No hay
alta manual. El límite del producto C pasa a ser cuántas reuniones se pueden
atender, no cuántas cuentas se pueden dar de alta.

Y una quinta, que decide algo que había dejado abierto:

> **La pregunta del `voip` ya está contestada por el código.** `canCall` solo
> permite la llamada en frío cuando `lineType === 'landline'`
> ([compliance.ts:183](backend/src/voice/compliance.ts#L183)). El `voip` queda
> fuera. Es la opción conservadora, es la correcta, y significa que el universo
> llamable es más pequeño pero **no hay decisión pendiente del abogado para
> arrancar**.

También existe ya `jobs/leadEnrichment.ts`, que encadena solo: descarta al que
tiene buena web, consulta el tipo de línea, calcula la zona horaria por estado,
descubre el correo y **etiqueta cada lead con `route:call` o `route:email`**
(`routeLead()`: `landline → call`, todo lo demás → `email`). Con tests.

**La máquina está más terminada de lo que creíamos. Lo que falta es encenderla.**

---

## 1. El objetivo y el reparto

| | Producto | Clientes | Precio | Entrega |
|---|---|---|---|---|
| **A** | Web + SEO + sistema | **6** | 3.500 $ + 1.200 $/mes | 🔴 25-40 h cada uno |
| **C** | Marca blanca para agencias | **14** | **450 $/mes** *(ellos cobran 1.200 $)* | 🟢 2 h de alta |
| | | **20** | | |

**A día 60:** 21.000 $ de altas cobradas y **~13.500 $/mes recurrentes**.

El 6 del producto A es el techo de entrega con un freelance desde la semana 4. El
14 del C es conservador: ahora que el alta es por API, el límite real son las
reuniones que se puedan atender.

---

## 2. La configuración exacta

Todo esto es `.env` del backend. Los nombres son los reales del repositorio.

### 2.1 · Lo que hay que cambiar sí o sí

| Variable | Hoy | Ponerlo en | Por qué |
|---|---|---|---|
| `DEFAULT_PHONE_COUNTRY_CODE` | `52` | **`1`** | Está en México |
| `REQUIRE_VOICE_CONSENT` | `false` | **`true`** | Sin esto se llama sin permiso registrado |
| `ALLOW_COLD_CALL_BUSINESS_LANDLINE` | `false` | **`true`** | Enciende el modo 3. Solo afecta a `landline` |
| `BRAVE_SEARCH_COUNTRY` | `ES` | **`US`** | La investigación previa al correo busca en España |
| `CALL_HOUR_START` / `CALL_HOUR_END` | `9` / `20` | **`9` / `19`** | Margen sobre la franja legal 8-21 h |
| `VOICE_EMOTION_RECOGNITION_ENABLED` | `false` | **`false`** ✅ | Illinois, BIPA. Ya está bien |
| `DISCLOSE_AI` | `true` | **`true`** ✅ | Ya está bien |
| `BACKGROUND_WORKERS_ENABLED` | `true` | **`true`** ✅ | Pero hay que arrancar el proceso |

### 2.2 · Claves que hay que conseguir

| Variable | Para qué | Prioridad |
|---|---|---|
| `REDIS_URL` | **Sin esto no se llama a nadie** | 🔴 1 |
| `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` / `FROM_NUMBER` | Llamadas y `Lookup` | 🔴 1 |
| `GOOGLE_PLACES_API_KEY` | Listas | 🔴 1 |
| `EMAIL_VERIFIER_API_KEY` | **Evita quemar los buzones** | 🔴 1 |
| `RESEND_API_KEY` / `EMAIL_FROM` | Envío de correo | 🔴 1 |
| `DEEPSEEK_API_KEY` | Escribe los correos y los guiones | 🔴 1 |
| `CARTESIA_API_KEY` / `CEREBRAS_API_KEY` / `MINIMAX_API_KEY` | Oído, cerebro y voz del agente | 🔴 1 |
| `HUMAN_TRANSFER_NUMBER` | Transferencia a persona | 🟠 2 |
| `BRAVE_SEARCH_API_KEY` | Investiga cada negocio | 🟠 2 |
| `PSI_API_KEY` | Core Web Vitals reales | 🟠 2 |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PRO` | Cobrar | 🟠 2 |
| `OPENAI_API_KEY` | Imágenes de anuncios | 🟡 3 |
| `METRICOOL_*` | Publicar contenido | 🟡 3 |
| `MAUTIC_*` | **No hace falta** — la secuencia usa `ai_email` | ⬜ |

✅ **Corrección sobre Stripe.** Dije que faltaba soporte para varios precios y no
es así: `priceIdForPlan()` resuelve `STRIPE_PRICE_<PLAN>` de forma dinámica
([billing.service.ts:12](backend/src/services/billing.service.ts#L12)), así que
añadir un plan es **añadir su variable, sin tocar código**. Hacen falta dos:

- `STRIPE_PRICE_PRO` → mensual del producto A (1.200 $)
- `STRIPE_PRICE_AGENCY` → mensual del producto C (450 $) · el plan `agency` ya
  existe y es el que trae el entitlement `multiworkspace`

El alta de 3.500 $ del producto A **no es un plan**: es un cobro único, así que va
por enlace de pago o factura, no por suscripción.

*Ambas variables ya están documentadas en `backend/.env.example`.*

### 2.3 · La comprobación de que está vivo

```bash
npm run preflight:usa           # entorno, credenciales, agentes, leads
npm run preflight:usa -- <orgId>  # además: plan, secuencias y reparto de leads
```

Comprueba todo lo automatizable de la sección 12 y **sale con código 1 si hay
bloqueantes**. Lo que no puede ver es el heartbeat, que vive en Redis:

```
GET /health/workers    → heartbeat reciente
GET /health/queues     → colas vivas
```

⚠️ `npm run ops:production-gate`, que citaba
[ESTADO_PRODUCTO §3](ESTADO_PRODUCTO.md), **ya no existe** en `package.json`.
`preflight:usa` ocupa su sitio y comprueba bastante más.

**Si `/health/workers` no responde, no sigas con nada más del plan.** Es el fallo
que no se ve: la API contesta que todo está sano mientras `enqueueLeadCall`
devuelve `false` en silencio.

### 2.4 · La trampa del idioma del agente

`Agent.language` viene por defecto en **`es`**
([schema.prisma:437](backend/prisma/schema.prisma#L437)), y el motor rechaza con
`voice_language_unsupported` cualquier agente que no sea inglés
(`isEnglish()` = `/^en\b/i`).

**Todo agente creado desde la interfaz nace mudo para esta campaña.** No falla de
forma visible: simplemente no llama. `preflight:usa` lo detecta y lista por
nombre los agentes activos que no estén en inglés.

---

## 3. La semana 1, día a día

### Día 1 — lunes 18 ago · el reloj que no se recupera

| | Tarea | Tiempo |
|---|---|---|
| 1 | **Comprar 30 buzones y 10 dominios. Empieza el calentamiento** | 1 h |
| 2 | Arrancar worker + Redis en Railway · comprobar `/health/workers` | 2 h |
| 3 | Comprar 15 números locales de la costa Este en Twilio | 30 min |
| 4 | **Iniciar el registro de marca / CNAM** (tarda días, por eso hoy) | 1 h |
| 5 | Escribir al abogado TCPA y reservar la revisión | 30 min |
| 6 | Aplicar el bloque 2.1 del `.env` y reiniciar | 30 min |

> **Los 30 buzones se compran hoy, no 12 hoy y 18 en septiembre.** El calentamiento
> son tres semanas y es en serie: dos compras son dos esperas. Ese error cuesta
> quince días de los sesenta.

### Día 2 — martes · las claves y la alerta

- Dar de alta y pegar todas las claves de prioridad 1 del bloque 2.2
- Crear los dos precios en Stripe (`STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`)
- Probar una llamada de punta a punta a tu propio móvil desde el panel
- Probar un envío de correo a ti mismo y mirar dónde cae
- 🔴 **Poner la alerta en cron**, hoy y no en la semana 6:

```bash
*/5 * * * *  cd /app && npm run check:alerts --silent
```

Sale con código 1 si hay alguna crítica, así que lo consume cualquier monitor.
Con `ALERT_WEBHOOK_URL` además avisa a Slack, Discord o donde mires.

### Día 3 — miércoles · la lista C

```bash
npm run prospect:usa -- agencies          # enseña el plan y el coste
npm run prospect:usa -- agencies --run    # lo ejecuta y guarda el JSON
```

- Importar el JSON con `POST /api/prospects/import` (deduplica, audita y puede
  matricular en la secuencia de una vez)
- Lanzar `leadEnrichment` → tipo de línea, zona horaria, correo
- **Contar cuántas salen con `route:call`** — son las llamables en frío
- Repetir por barrios las ciudades que el script marque como saturadas

**Ciudades de la costa Este, por densidad y sin los dos estados que hay que
evitar:**

> New York NY · Brooklyn NY · Newark NJ · Jersey City NJ · Philadelphia PA ·
> Pittsburgh PA · Boston MA · Worcester MA · Providence RI · Hartford CT ·
> Stamford CT · Baltimore MD · Washington DC · Richmond VA · Virginia Beach VA ·
> Raleigh NC · Charlotte NC · Greensboro NC · Durham NC · Columbia SC ·
> Charleston SC · Atlanta GA · Savannah GA · Augusta GA · Wilmington DE ·
> Portland ME · Manchester NH · Burlington VT · Albany NY · Syracuse NY

🔴 **Fuera Florida y Oklahoma los tres primeros meses.** Son los estados donde más
demandas TCPA se generan y la costa Este da de sobra sin ellos.

### Día 4 — jueves · el agente

- Cargar en el agente el guion de la sección 6 (producto C)
- Configurar la frase de apertura y comprobar que dice las cuatro obligaciones
- 10 llamadas de prueba a números propios y de conocidos
- Ajustar velocidad, tono y pausas

### Día 5 — viernes · la secuencia y la lista A

```bash
npm run sequence:create -- <orgId>        # crea A y C en estado draft
npm run preflight:usa -- <orgId>          # y comprueba que todo está en pie
```

- Bajar los registros de licencias de contratistas (sección 4)
- Revisar con el abogado: guion, consentimiento, estados, `landline`

Las secuencias nacen en `draft` y **no envían nada hasta la primera
matriculación**, que es la que las activa
([salesSequence.service.ts:210](backend/src/services/salesSequence.service.ts#L210)).
Se matricula con `POST /api/growth-programs/:id/enroll`. **Empieza con 10 leads.**

### Fin de semana

Nada. La máquina calienta buzones sola.

---

## 4. Las listas — de dónde sale cada una

### 4.1 · Producto C — agencias

**Fuente única: Google Places.** No hay registro público de agencias.

🔴 **Corrección al volumen.** El plan decía 5.000 agencias. No salen: Places Text
Search **no pagina** en este servicio y devuelve **20 resultados por consulta como
máximo**. Con los 5 términos y las 30 ciudades:

```
5 términos × 30 ciudades = 150 consultas × 20 = 3.000 máximo teórico
```

Y eso es *antes* de quitar duplicados —los cinco términos se solapan mucho—, así
que lo realista son **1.800-2.400 agencias únicas**, no 5.000. Coste: **4,80 $**,
mucho menos de los 125 $ presupuestados.

**Qué hacer con eso**, por orden:

1. `npm run prospect:usa -- agencies` avisa de **qué consultas tocaron el techo**
   de 20. Ahí hay negocios que no estamos viendo.
2. Esas ciudades se repiten **por barrios o códigos postales** — Manhattan,
   Queens, The Bronx en vez de "New York".
3. Si aun así falta, se añaden términos (`branding agency`, `creative agency`)
   y ciudades de segundo nivel. Cada consulta cuesta 3 céntimos.

Ventaja que compensa: **una agencia tiene centralita**. La proporción de
`landline` es mucho mayor que en un gremio manual, y `landline` es lo único que
`canCall` deja llamar en frío.

### 4.2 · Producto A — techadores

Aquí hay una corrección importante a
[LISTAS_Y_COSTE_LLAMADAS §5](LISTAS_Y_COSTE_LLAMADAS.md), que da por hecho que
todos los estados publican registro de techadores. **No es así:**

| Estado | ¿Registro público de techadores? | De dónde sacamos la lista |
|---|---|---|
| **Virginia** | ✅ DPOR, licencia estatal de roofing | Registro |
| **Nueva Jersey** | ✅ Home Improvement Contractor | Registro |
| **Massachusetts** | ✅ HIC en OCABR | Registro |
| **Carolina del Norte** | 🟡 Solo obras de más de 30.000 $ | Registro + Places |
| **Georgia** | ❌ **No licencia el roofing a nivel estatal** | **Places** |
| **Nueva York** | ❌ Es municipal, no estatal | **Places** |

**Plan real:** registro donde lo hay (gratis), Places donde no. El coste sube algo
respecto a los 265 $ del documento, pero sigue por debajo de **400 $ por 7.500
empresas**.

### 4.3 · El filtro, que lo hace la máquina

`leadEnrichment` hace la cadena entera y **descarta al que tiene la web bien**
antes de gastar en verificar correo y tipo de línea. Cada lead sale etiquetado:

- `route:call` → tiene fijo de empresa. **Llamada en frío legal**
- `route:email` → móvil, VoIP o desconocido. **Correo primero, llamada tras el YES**

---

## 5. Las dos secuencias, en JSON

Se crean por API sobre `growthProgram` con `type: 'sales_sequence'`. La matrícula
es `POST /growth-programs/:id/enroll` con `leadIds`. Prospect Finder también puede
matricular directamente al importar
([prospects.controller.ts:197](backend/src/controllers/prospects.controller.ts#L197)).

### 5.1 · Secuencia A — techadores *(15 días)*

```json
{ "steps": [
  { "key": "a1-report",  "type": "ai_email", "delayDays": 0,
    "purpose": "Send the free website audit. Open with the single worst measured
                number from the audit — no greeting, no 'I hope this finds you
                well'. Include the public report link. Close with: reply YES and
                our AI assistant calls you within the minute. Max 90 words." },
  { "key": "a2-bump",    "type": "ai_email", "delayDays": 3,
    "purpose": "Same thread. Three lines. One NEW finding from the audit. Same
                YES call to action. Max 40 words." },
  { "key": "a3-call",    "type": "call",     "delayDays": 1 },
  { "key": "a4-case",    "type": "ai_email", "delayDays": 4,
    "purpose": "Roofer case study. Talk about booked jobs, never about design." },
  { "key": "a5-call",    "type": "call",     "delayDays": 2 },
  { "key": "a6-breakup", "type": "ai_email", "delayDays": 5,
    "purpose": "Breakup. Give the report away with no strings. Highest reply
                rate of the whole sequence." }
] }
```

### 5.2 · Secuencia C — agencias *(11 días, la llamada va primero)*

```json
{ "steps": [
  { "key": "c1-call",    "type": "call",     "delayDays": 0 },
  { "key": "c2-numbers", "type": "ai_email", "delayDays": 1,
    "purpose": "Follow the call. Subject is the margin: they sell at 1200, they
                pay 450. No build, no hosting, no support. Link to the demo
                line they can call themselves." },
  { "key": "c3-call",    "type": "call",     "delayDays": 3 },
  { "key": "c4-proof",   "type": "ai_email", "delayDays": 3,
    "purpose": "What their client gets: lead calls back in under a minute, 24/7,
                under the agency's own brand. Mention onboarding is two hours." },
  { "key": "c5-breakup", "type": "ai_email", "delayDays": 4,
    "purpose": "Breakup. Offer the demo line one last time." }
] }
```

**Lo que hacen solas y conviene no olvidar:**

- Se paran al primer `reply`, `unsubscribe`, `bounce` o `complaint`
  (`stopSalesSequenceForLead`)
- Los pasos `call` **no llaman si `canCall` dice que no**. Se saltan sin romper nada
- Los `delayDays` son acumulativos
- Máximo 20 pasos y 1.000 leads por matrícula

---

## 6. Los guiones de llamada

### 6.1 · Agencias — llamada en frío a fijo verificado

> "Hi — this is **Alex, an AI assistant** calling on behalf of **SprintMarkt**.
> Thirty seconds and you decide.
>
> I'm calling **[Agency]** because you can **white-label me**. What you're hearing
> right now is what your clients would get — a system that calls their leads back
> in under a minute, twenty-four seven, under **your** brand.
>
> You'd sell it at **twelve hundred a month**. You'd pay us **four-fifty**. No
> build, no hosting, no support tickets.
>
> Want the numbers by email, or **fifteen minutes with Carlos** — Thursday ten or
> Friday two?"

| Dicen | Contesta |
|---|---|
| **"Are you an AI?"** | *"Yes. That's the pitch."* |
| "We build our own" | *"Then you know what six weeks of build costs. This is live in two days and it's yours to brand."* |
| "What do I actually get?" | *"Your own panel, your logo, your clients inside it, your pricing. They never see our name."* |
| "How did you get my number?" | *"Your published business line. Want off the list? Done right now."* |
| "Send me info" | *"Doing it now — best address?"* |
| "Too expensive" | *"You're not paying it — your client is. You keep seven-fifty a month per client."* |
| "I need to think" | *"Of course. Fifteen minutes with Carlos costs you nothing and you'll know. Thursday ten?"* |

### 6.2 · Techadores — solo tras el YES

> "Hi — this is **Alex, an AI assistant** from **SprintMarkt**. Is it okay if I
> record this call for quality? You **replied to our email asking to hear what
> this sounds like** — so, this is it. You're talking to it. Got sixty seconds?
>
> What you're hearing is what would call **your** leads about thirty seconds after
> they fill out your form — instead of two hours later, when they've already
> hired someone else.
>
> Quick one: right now, when someone asks for a quote on your site, **how long
> until somebody actually calls them?**
>
> *(escucha)*
>
> That's the normal answer, and it's the whole thing this fixes. I'd rather not
> sell you anything on the phone — **fifteen minutes with Carlos**, he walks you
> through your own audit. **Thursday ten or Friday two?**"

### 6.3 · Reglas para los dos

- **Objetivo único: la reunión.** Nunca cerrar la venta por teléfono
- Si piden persona → transferir. El motor lo detecta solo
- Si dicen "take me off your list" → `OptOut` en el acto, sin negociar
- Tres intentos por empresa, en días y franjas distintas
- Franja: **9:00-19:00 hora del que recibe**, que la calcula `timeZoneForState`

---

## 7. La reunión de 15 minutos

Aquí es donde se cierra el dinero, y es lo que faltaba en el plan anterior.

| Min | Qué | Cómo |
|---|---|---|
| **0-2** | Que repita el problema con sus palabras | *"Before I show you anything — what happens today when a lead comes in?"* |
| **2-6** | Compartir pantalla, el informe. **Máximo 3 hallazgos** | El peor primero. Consecuencia, nunca tecnología |
| **6-9** | 🎯 **La demostración en vivo** | *"What's your cell? I'll have it call you right now."* Se dispara desde el panel y le suena el teléfono en la reunión |
| **9-12** | El precio, de frente | A: *"Thirty-five hundred to build, twelve hundred a month."* · C: *"Four-fifty a month per client, you sell at twelve."* |
| **12-15** | El siguiente paso concreto | A: 50 % por adelantado y fecha de arranque · C: alta hoy mismo, en dos horas está |

**El minuto 6 es la reunión entera.** Que el teléfono le suene mientras habla
contigo no se argumenta ni se compara con nadie. Todo lo demás del guion está para
llegar a ese momento.

Si no cierra: **no se persigue.** Se le mete en la secuencia de nutrición y se
sigue. Perseguir a un indeciso cuesta el tiempo de dos reuniones nuevas.

---

## 8. Qué pasa cuando dicen que sí

### 8.1 · Producto A — 10 días hábiles

| Día | Qué | Quién |
|---|---|---|
| 0 | Cobro del 50 % · cuestionario de marca (10 preguntas) | Tú |
| 1 | Alta de organización · Twilio del cliente · agente configurado | Tú |
| 1 | 🎯 **Encender el sistema de llamadas ya** | Tú |
| 2-7 | Web: estructura, textos, fotos, ficha de Google | Freelance |
| 8 | Revisión con el cliente · una ronda de cambios | Tú |
| 9 | Publicación · medición · formulario conectado al agente | Freelance |
| 10 | Cobro del 50 % restante · arranca el mensual | — |

🎯 **El sistema se enciende el día 1, no el día 10.** Es lo que justifica el
mensual y lo que hace que el cliente vea resultado antes de que la web exista. Si
se entrega todo junto al final, los primeros diez días el cliente solo ve una
factura.

### 8.2 · Producto C — 2 horas

| | Qué | Dónde |
|---|---|---|
| 1 | `POST /white-label/clients` con precio de venta y coste mayorista | `AgencyWhiteLabelPage` |
| 2 | Su marca: logo, colores, dominio | `PUT /white-label/brand` |
| 3 | Rotar la clave del widget y dársela | `/clients/:id/widget-key/rotate` |
| 4 | Entrenar con su web y sus documentos | `/clients/:id/training` |
| 5 | Cuotas: minutos de voz y mensajes al mes | En el alta |
| 6 | 45 min de formación en vídeo, grabada | — |

**Grábala la primera vez y reutilízala.** Con catorce agencias son diez horas de
diferencia.

---

## 9. El ritmo diario

| Cuándo | Qué | Tiempo |
|---|---|---|
| **09:00** | `npm run check:alerts` · rebotes · bajas · cola de aprobación de anuncios | 15 min |
| **09:15** | **Escuchar 3 llamadas de ayer.** Una buena, una mala, una a medias | 20 min |
| **09:35** | Responder los YES y los correos de la noche americana | 25 min |
| **10:00-14:00** | 🔨 **Entrega**: webs, altas de marca blanca, contenido | 4 h |
| **15:00-19:00** | 📞 **Reuniones** y llamadas en directo | 4 h |
| **19:00-20:00** | CRM al día · preparar mañana | 1 h |

**Viernes 17:00 — la media hora de números.** El cuadro de la sección 10, escrito.
Es media hora y es lo que evita descubrir en la semana 7 que algo llevaba roto
desde la 4.

---

## 10. El cuadro de mando

Se mira **cada viernes**. Cada fila tiene un umbral y qué hacer si no se cumple.

| Métrica | Objetivo | Si está por debajo |
|---|---|---|
| **Rebote de correo** | **< 2 %** | 🔴 Para el envío. Falta `EMAIL_VERIFIER_API_KEY` o está sin verificar |
| Aperturas | > 35 % | El asunto. Nunca el cuerpo |
| **Respuestas** | **> 2 %** | 🔴 El mensaje. **Nunca subir volumen para compensar** |
| Consienten (YES / respuestas) | > 35 % | La frase del YES no es clara |
| **Descuelgan** | **> 25 %** | 🔴 Casi siempre es el CNAM o números no locales |
| Llamada → reunión | > 8 % | Los primeros 15 segundos del guion |
| **Asisten a la reunión** | **> 70 %** | Recordatorio 24 h y 1 h antes |
| Reunión → cierre | > 25 % | El precio, o no estás haciendo la demo en vivo |
| **Coste por cliente** | **< 150 $** | Revisar el reparto entre pistas |

**La fila que hay que mirar primero siempre es el rebote.** Es la única que, si va
mal, no se arregla después: quema los buzones y son otras tres semanas de
calentamiento.

---

## 11. Riesgos, con disparador y respuesta

| Riesgo | Se detecta cuando | Qué se hace |
|---|---|---|
| **Los buzones se queman** | Rebote > 5 % o aperturas < 20 % | Parar. Verificar la lista entera. Recalentar. **Tres semanas perdidas** |
| **El número sale como spam** | Descuelgue < 15 % | Comprobar CNAM. Rotar números. Bajar llamadas por número y día |
| **`/health/workers` en silencio** | ✅ Lo canta `check:alerts` en cinco minutos | Reiniciar worker. **La alerta se pone el día 2, no en la semana 6** |
| **Reclamación TCPA** | Un correo de abogado | Congelar llamadas. Sacar el registro de consentimiento. Por eso se rellena `evidence` |
| **No hay quien atienda las reuniones** | Semana 3 con huecos sin cubrir | 🔴 Es el riesgo real. Bajar volumen de C antes de acumular reuniones que nadie atiende |
| **El freelance no llega** | Semana 6 con dos webs a medias | Parar de vender A. Vender producto B, que no se entrega |
| **Sobran reuniones de A** | Más de 3 cierres al mes | Subir precio o vender B. **No aceptar la cuarta web** |
| **`landline` da muy pocos** | Día 3, al contar `route:call` | Ampliar ciudades — son gratis. **No tocar la regla del `voip`** |

---

## 12. La lista maestra

> **Casi todo lo de este primer bloque lo comprueba `npm run preflight:usa`.**
> Ejecútalo en vez de ir marcando casillas a mano: sale con código 1 mientras
> quede un bloqueante.

### Antes de la primera llamada

- [ ] `npm run preflight:usa -- <orgId>` en verde
- [ ] Worker + Redis arrancados y `/health/workers` respondiendo
- [ ] `npm run check:alerts` en cron cada 5 minutos
- [ ] **Los agentes activos, con `language` en inglés** *(el defecto es `es`)*
- [ ] 30 buzones + 10 dominios comprados y **calentando**
- [ ] 15 números locales + **CNAM registrado**
- [ ] `DEFAULT_PHONE_COUNTRY_CODE=1`
- [ ] `REQUIRE_VOICE_CONSENT=true`
- [ ] `ALLOW_COLD_CALL_BUSINESS_LANDLINE=true`
- [ ] `BRAVE_SEARCH_COUNTRY=US`
- [ ] `VOICE_EMOTION_RECOGNITION_ENABLED=false`
- [ ] Claves de prioridad 1 puestas
- [ ] Tres precios creados en Stripe
- [ ] Abogado TCPA con el guion y el flujo revisados
- [ ] Florida y Oklahoma fuera de todas las listas
- [ ] Pie de correo con dirección postal y baja en un clic
- [ ] Una llamada de prueba completa, escuchada entera

### Antes del primer envío masivo

- [ ] Lista verificada con `EMAIL_VERIFIER_API_KEY` activa
- [ ] **20 informes leídos a mano**
- [ ] Los buzones llevan 21 días calentando
- [ ] Las dos secuencias creadas (`npm run sequence:create`) y probadas con 10 leads
- [ ] `STRIPE_PRICE_PRO` y `STRIPE_PRICE_AGENCY` con precio real
- [ ] Página de aterrizaje americana publicada, **no la home de Valencia**

### Antes de vender la primera marca blanca

- [ ] Entitlement `multiworkspace` activo en el plan
- [ ] Un alta completa hecha de prueba, de principio a fin
- [ ] Vídeo de formación grabado
- [ ] Precio de venta y coste mayorista fijados en el alta

---

## 13. En una página

**Cuatro de los bloqueantes ya no existen:** tipo de línea, zona horaria por
estado, verificador de correo y alta de marca blanca están construidos. Lo que
queda es encender el worker, poner las claves y cambiar ocho variables de entorno.

**El calendario lo manda el calentamiento.** Tres semanas para que el correo
funcione, cero para el teléfono. Por eso las agencias —fijo de oficina, llamables
en frío— llenan las semanas 2 a 5, y los techadores entran por correo en la 5.

**La reunión se gana en el minuto 6**, cuando le suena el móvil delante de ti. Todo
lo demás del guion existe para llegar a ese momento.

**Y lo único que puede tumbar esto no es el dinero, ni la ley, ni el código.** Son
diez reuniones a la semana entre las tres de la tarde y las once de la noche. Si
esa pregunta no tiene respuesta el lunes, el resto del plan es teoría bien
ordenada.
