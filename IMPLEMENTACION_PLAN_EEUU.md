# Implementación del plan de EE. UU. — qué se ha hecho

Registro de la primera tanda de implementación de
[PLAN_ACCION_60_DIAS_DETALLADO.md](PLAN_ACCION_60_DIAS_DETALLADO.md).

Fecha: 17 de agosto de 2026.

> **Alcance.** El plan es en su mayor parte operativo —comprar buzones, contratar
> números, hablar con un abogado— y eso no es código. Esta tanda cubre las dos
> piezas que sí lo eran y que bloqueaban la semana 1: **crear las secuencias**
> (hoy imposible desde la interfaz) y **comprobar el entorno antes de marcar un
> número**.
>
> **No se ha tocado `backend/src/`.** El comportamiento de la aplicación en marcha
> no cambia: son dos scripts nuevos, dos alias de npm y documentación de entorno.

---

## 1. Lo que se ha creado

### 1.1 · `scripts/create-sales-sequence.mjs`

Crea las dos secuencias del plan como registros `GrowthProgram` de tipo
`sales_sequence`.

**Por qué hace falta:** el formulario de Growth Hub envía solo nombre,
descripción, estado y tipo ([ESTADO_PRODUCTO §4.7](ESTADO_PRODUCTO.md)). Una
secuencia creada desde pantalla nace sin pasos y falla al matricular con
`SEQUENCE_STEPS_INVALID`. Hasta que exista el editor de pasos, se crean aquí.

```bash
npm run sequence:create -- <orgId>              # crea A y C
npm run sequence:create -- <orgId> a            # solo techadores
npm run sequence:create -- <orgId> c --force    # otra copia de agencias
```

**Qué crea:**

| | Secuencia | Pasos | Duración |
|---|---|---|---|
| **A** | `USA · Roofers — audit to booked call` | `ai_email` → `ai_email` → **`call`** → `ai_email` → **`call`** → `ai_email` | 15 días |
| **C** | `USA · Agencies — white-label` | **`call`** → `ai_email` → **`call`** → `ai_email` → `ai_email` | 11 días |

**Decisiones que lleva dentro:**

- **Pasos `ai_email`, no `email`.** Los de tipo `email` exigen
  `templateExternalId`, que es un id de plantilla de Mautic — y Mautic no está
  desplegado. `ai_email` escribe el correo con `emailCopy` y envía por Resend.
  **Mautic deja de bloquear el arranque.**
- **Nacen en `draft`.** No se envía nada hasta la primera matriculación, que es
  la que las activa ([salesSequence.service.ts:210](backend/src/services/salesSequence.service.ts#L210)).
- **Valida antes de escribir en la base.** Réplica de las reglas de `readConfig()`
  —tipos permitidos, `delayDays` entero de 0 a 365, máximo 20 pasos, claves sin
  repetir— para fallar en el comando y no dentro del worker con la secuencia ya
  publicada.
- **Idempotente.** Si ya existe una secuencia con ese nombre sin archivar, la
  salta. `--force` crea otra.
- **`leadIds` vacío a propósito:** quién entra lo decide la matriculación.

Matricular después:

```
POST /api/growth-programs/:id/enroll   { "leadIds": [...] }
```

Empezar con **10 leads**, no con la lista entera.

### 1.2 · `scripts/preflight-usa.mjs`

Comprueba todo lo automatizable de la sección 12 del plan y **sale con código 1
si queda algún bloqueante**.

```bash
npm run preflight:usa               # entorno, credenciales, agentes
npm run preflight:usa -- <orgId>    # además: plan, secuencias y reparto de leads
```

**Qué mira:**

| Bloque | Comprueba |
|---|---|
| **Entorno** | `DEFAULT_PHONE_COUNTRY_CODE`, `REQUIRE_VOICE_CONSENT`, `VOICE_EMOTION_RECOGNITION_ENABLED`, `DISCLOSE_AI`, `ALLOW_COLD_CALL_BUSINESS_LANDLINE`, `BRAVE_SEARCH_COUNTRY`, y que la franja de llamada caiga dentro de la legal |
| **Credenciales** | Las 11 de prioridad 1 y las 4 de prioridad 2, cada una con qué se rompe sin ella |
| **Cobro** | Qué planes tienen precio de Stripe, y avisa si falta `pro` o `agency` |
| **Worker** | `BACKGROUND_WORKERS_ENABLED` |
| **Base de datos** | Conexión real con un `SELECT 1` |
| **Agentes** | 🔴 **Agentes activos cuyo idioma no sea inglés**, listados por nombre |
| **Organización** | Que exista, y si el plan es `agency` para la marca blanca |
| **Secuencias** | Que haya alguna creada |
| **Leads** | Cuántos hay, cuántos `route:call` y cuántos `route:email` |

Cada fallo lleva **por qué importa**, no solo qué falta: *"Illinois trata la
huella de voz como dato biométrico: 1.000-5.000 $ por persona"* en vez de
*"variable no definida"*.

**Lo que no puede ver:** el heartbeat del worker, que vive en Redis. Eso sigue
siendo `GET /health/workers` con el token de observabilidad, y el script lo
recuerda al terminar.

---

## 2. Lo que se ha modificado

| Fichero | Cambio |
|---|---|
| `backend/package.json` | Dos alias: `sequence:create` y `preflight:usa` |
| `backend/.env.example` | `DEFAULT_PHONE_COUNTRY_CODE` **52 → 1** · `BRAVE_SEARCH_COUNTRY` **ES → US** · nueva `STRIPE_PRICE_AGENCY` con su comentario |
| `PLAN_ACCION_60_DIAS_DETALLADO.md` | Corrección de Stripe · §2.3 reescrita con `preflight:usa` · **§2.4 nueva** con la trampa del idioma · comandos en el día 5 · casillas nuevas |

**Lo que deliberadamente no se ha cambiado:** `REQUIRE_VOICE_CONSENT=false` y
`ALLOW_COLD_CALL_BUSINESS_LANDLINE=false` siguen apagados en `.env.example`. Son
los valores seguros para una plantilla; encenderlos es una decisión de campaña,
con el flujo ya revisado por el abogado. Un ejemplo que viniera de fábrica
autorizando la llamada en frío sería un mal ejemplo.

---

## 3. Lo que se ha descubierto al implementar

### 3.1 · 🔴 `Agent.language` viene por defecto en `es`

El hallazgo con más consecuencias de esta tanda.

`Agent.language` tiene `@default("es")`
([schema.prisma:437](backend/prisma/schema.prisma#L437)), y el motor de voz
rechaza con `voice_language_unsupported` cualquier agente que no pase
`isEnglish()`, que es `/^en\b/i`
([compliance.ts:264](backend/src/voice/compliance.ts#L264)).

**Todo agente creado desde la interfaz nace mudo para esta campaña**, y no falla
de forma visible: simplemente no llama. Se descubriría contando cero llamadas al
final del día.

`preflight:usa` lo detecta y lista por nombre los agentes activos afectados.

### 3.2 · Stripe no necesitaba código

En el plan escribí que hacían falta tres precios y soporte para varios planes.
Era inexacto: `priceIdForPlan()` resuelve `STRIPE_PRICE_<PLAN>` de forma dinámica
([billing.service.ts:12](backend/src/services/billing.service.ts#L12)), así que
añadir un plan es **añadir su variable**.

Hacen falta dos, no tres: `STRIPE_PRICE_PRO` (mensual de A) y
`STRIPE_PRICE_AGENCY` (mensual de C). El alta de 3.500 $ no es un plan — es un
cobro único, va por enlace de pago o factura.

### 3.3 · `ops:production-gate` ya no existe

[ESTADO_PRODUCTO §3](ESTADO_PRODUCTO.md) lo cita como el validador de `REDIS_URL`
y `BACKGROUND_WORKERS_ENABLED`. No está en `package.json`. `preflight:usa` ocupa
su sitio y comprueba bastante más.

### 3.4 · Un fallo propio, corregido

La primera versión del preflight marcaba `VOICE_EMOTION_RECOGNITION_ENABLED` sin
definir como bloqueante. Es falsa alarma: el código activa con `=== 'true'`
([compliance.ts:282](backend/src/voice/compliance.ts#L282)), así que su ausencia
**ya es el estado seguro**. Igual con `DISCLOSE_AI`, que solo calla con un
`'false'` explícito.

Ahora ambas se marcan como correctas cuando no están definidas, indicando a qué
equivalen. La distinción importa: `DEFAULT_PHONE_COUNTRY_CODE` sin definir **sí**
es un bloqueante real, porque el código cae a `'52'`
([compliance.ts:49](backend/src/voice/compliance.ts#L49)).

---

## 4. Estado real del entorno, al ejecutarlo

Primera ejecución contra el `.env` y la base de datos actuales:

```
11 correctos · 6 avisos · 9 bloqueantes
```

| | |
|---|---|
| ✅ Ya está | `REDIS_URL`, `DISCLOSE_AI`, franja 9-20 h, conexión a base de datos, **1 agente activo en inglés**, Cartesia, Cerebras, MiniMax, `HUMAN_TRANSFER_NUMBER` |
| 🔴 Falta | `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN`, `GOOGLE_PLACES_API_KEY`, `EMAIL_VERIFIER_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `DEEPSEEK_API_KEY`, `DEFAULT_PHONE_COUNTRY_CODE`, `REQUIRE_VOICE_CONSENT` |
| 🟠 Aviso | `ALLOW_COLD_CALL_BUSINESS_LANDLINE`, `BRAVE_SEARCH_COUNTRY`, `BRAVE_SEARCH_API_KEY`, `PSI_API_KEY`, `STRIPE_SECRET_KEY` |

Los bloqueantes son exactamente las credenciales del **día 2** del plan más las
dos variables del **día 1**. Nada inesperado.

---

## 5. Cómo se ha comprobado

| | |
|---|---|
| Sintaxis de los dos scripts | `node --check` ✅ |
| Guardas de argumentos | Sin argumentos y con secuencia inválida ✅ |
| Preflight de punta a punta | Ejecutado contra base de datos real ✅ |
| `package.json` | JSON válido ✅ |

No se han ejecutado los tests del backend: **no se ha modificado nada bajo
`backend/src/`**, así que no hay superficie que puedan cubrir. Los dos scripts son
independientes y no los importa la aplicación.

---

## 6. Segunda tanda — la prospección (día 3)

### 6.1 · 🔴 El fallo que dejaba la campaña sin llamadas

El hallazgo más importante de las dos tandas, y estaba a un campo de distancia.

`leadEnrichment` calcula la zona horaria del lead con
`timeZoneForState(fields.state)`, y `canCall` **se niega a marcar un +1 sin zona
horaria conocida** — está escrito en el propio código
([compliance.ts:163](backend/src/voice/compliance.ts#L163)):

> *"A +1 number with no stored timezone lands here: we cannot prove the local
> hour, so we do not dial."*

Pero **nada escribía `customFields.state`**. La importación de Prospect Finder
guardaba `website`, `address`, `rating`, `sector`, `city`… y no el estado.

**Consecuencia:** todo lead importado en EE. UU. se creaba bien, se auditaba
bien, se enriquecía bien — y quedaba rechazado con `outside_hours` en cada
intento de llamada. Sin error visible, sin alerta, sin nada que mirar. La
campaña entera habría hecho cero llamadas y el motivo habría costado días.

**Arreglado:**

| Dónde | Qué |
|---|---|
| `prospecting.service.ts` | Nueva `stateFromAddress()`: saca el estado del `formattedAddress` de Places y lo contrasta con los 50 códigos reales + DC |
| `prospects.controller.ts` | La importación acepta `state` explícito y, si no llega, lo deduce de la dirección |
| `leadEnrichment.test.ts` | Dos tests nuevos: las tres formas de dirección estadounidense, y que una dirección extranjera no invente estado |

La validación contra el listado de códigos no es celo: `"221B Baker Street,
London, UK"` también acaba en coma y dos mayúsculas. Sin ella se habría guardado
`state: 'UK'`. Lo descubrió el test al escribirlo.

### 6.2 · Places no pagina — 20 por consulta

`searchProspects` pide `maxResultCount` y **no gestiona `nextPageToken`**: 20
resultados por consulta es el techo real.

Eso corrige el plan: las 5.000 agencias del día 3 **no salen**. Con 5 términos ×
30 ciudades el máximo teórico son 3.000, y descontando el solape entre términos
lo realista son **1.800-2.400 únicas**. Coste: 4,80 $ en vez de los 125 $
presupuestados.

### 6.3 · La consulta iba en español

`textQuery` se construía como `` `${sector} en ${city}` `` — con el conector
castellano fijo. En una búsqueda estadounidense, *"marketing agency **en** New
York"* mezcla dos idiomas y degrada el resultado. El parámetro `country` ya
existía en la firma **y no se usaba**; ahora elige el conector, y sin país se
mantiene el comportamiento de siempre para la operación en España.

### 6.4 · `scripts/prospect-usa.ts`

Recorre la matriz sector × ciudad, deduplica por `placeId` y deja el payload
listo para `POST /api/prospects/import`.

```bash
npm run prospect:usa -- agencies          # enseña el plan y el coste, no llama
npm run prospect:usa -- agencies --run    # lo ejecuta
npm run prospect:usa -- roofers --run --out techadores.json
```

**Por defecto no llama a Places.** Enseña cuántas consultas serían y cuánto
costarían, y hay que confirmar con `--run`: un barrido son 150 peticiones de pago
y no debería dispararse por un tecleo.

Lo que aporta más allá de ahorrar trabajo: **avisa de qué consultas tocaron el
techo de 20**. Una ciudad que devuelve 20 de 20 tiene más negocios que no estamos
viendo, y hay que partirla por barrios. Sin ese aviso, el barrido parece completo
y no lo está.

Las 30 ciudades llevan su estado al lado —no dentro del nombre— porque el estado
es lo que fija la zona horaria. Sin Florida ni Oklahoma.

---

## 7. Tercera tanda — cerrado lo que quedaba

### 7.1 · `scripts/check-alerts.mjs` — el vigilante

`evaluateOperationalAlerts` ya calculaba las alertas, incluidas
`WORKER_HEARTBEAT_MISSING` y `WORKER_HEARTBEAT_STALE`. Lo que faltaba era **algo
que preguntara**: hasta ahora solo se evaluaban cuando un humano abría
`/health/workers`.

```bash
npm run check:alerts
node scripts/check-alerts.mjs --url https://api.ejemplo.com --quiet
```

- **Sale con código 1 si hay alguna alerta crítica**, así que sirve tal cual para
  cron, para un monitor externo o para el healthcheck del proveedor. Es la alerta
  que el plan pide para el día 2.
- Un fallo de red se trata **como alerta, no como excepción**: que la API no
  responda es exactamente el caso que hay que detectar.
- Con `ALERT_WEBHOOK_URL` manda un JSON en cada crítica. Si el aviso falla, no
  cambia el diagnóstico: el código de salida sigue reflejando el estado real.

### 7.2 · `scripts/enroll-leads.ts` — matriculación por filtro

```bash
npm run enroll:leads -- <orgId> <programId> --route call            # vista previa
npm run enroll:leads -- <orgId> <programId> --route email --limit 10 --run
```

Selecciona por las etiquetas que pone `leadEnrichment` (`route:call` es fijo de
empresa verificado; `route:email` todo lo demás), y admite `--campaign`, `--tag`
y `--limit`.

**No matricula por defecto.** Enseña a quién cogería, cuántos van sin correo y
qué pasos tiene la secuencia. Excluye de la consulta a los ya matriculados y —si
la secuencia tiene paso de llamada— a los que no tienen teléfono, para que el
número que enseña sea el real y no prometa de más.

### 7.3 · Barrido por barrios

`prospect-usa.ts` ahora **escribe las zonas saturadas** en
`<salida>.saturadas.json` y acepta `--areas <fichero>` para volver a barrer con
ellas:

```bash
npm run prospect:usa -- agencies --run
# → 12 zonas saturadas, guardadas en prospects-agencies.saturadas.json
# se abre, "New York" se cambia por "Manhattan", "Queens", "Brooklyn"…
npm run prospect:usa -- agencies --areas prospects-agencies.saturadas.json --run
```

Es la respuesta al techo de 20: la segunda pasada se vuelve mecánica en vez de
depender de que alguien se acuerde de qué ciudades se quedaron cortas.

### 7.4 · ✅ El editor de pasos ya existía

[ESTADO_PRODUCTO §4.7](ESTADO_PRODUCTO.md) dice que Growth Hub no puede definir
pasos y que toda secuencia creada desde la interfaz falla con
`SEQUENCE_STEPS_INVALID`. **Está obsoleto:** `src/pages/growth/SequenceSteps.jsx`
tiene `SequenceStepsEditor` con los seis tipos de paso —`ai_email` incluido— y
`GrowthHubPage` lo guarda en `config.steps`.

`sequence:create` sigue valiendo la pena por otra razón: deja las dos secuencias
de la campaña **versionadas en el repositorio**, iguales en cada entorno y
repetibles, en vez de tecleadas en un formulario.

El panel `SequenceEnrollPanel` sí matricula desde la interfaz, pero **buscando
por nombre de uno en uno** (mínimo 2 caracteres, 8 resultados). Para meter 200
leads por etiqueta no sirve, y por eso `enroll-leads.ts` no sobra.

---

## 8. El inventario de comandos

| Comando | Cuándo |
|---|---|
| `npm run preflight:usa -- <orgId>` | Antes de nada, y cada vez que algo raro |
| `npm run org:create` | Alta de un cliente del producto A |
| `npm run sequence:create -- <orgId>` | Día 5 · crea las secuencias A y C |
| `npm run prospect:usa -- agencies` | Día 3 · barrido de listas *(sin `--run` solo enseña el plan)* |
| `npm run enroll:leads -- <orgId> <programId> --route call` | Meter la lista en la secuencia |
| `npm run check:alerts` | En cron, cada pocos minutos, siempre |

**Los cuatro que tocan dinero o envían algo no actúan sin `--run`.** Un barrido
son 150 peticiones de pago y una matriculación son cientos de correos: ninguna
de las dos debería dispararse por un tecleo.

---

## 9. Lo que queda, y ya no es código

Nada de la lista de implementación. Lo que falta es operativo:

| | Bloquea |
|---|---|
| 30 buzones + 10 dominios | 🔴 **Tres semanas de calentamiento, en serie.** Es el único plazo que no se compra |
| Worker + Redis en producción | 🔴 Sin ellos no se llama a nadie, y en silencio |
| 15 números locales + CNAM | 🔴 El verificado tarda días |
| Las 7 credenciales que faltan | 🔴 Las canta `preflight:usa` |
| `DEFAULT_PHONE_COUNTRY_CODE=1` · `REQUIRE_VOICE_CONSENT=true` | 🔴 Cinco minutos |
| Abogado TCPA | 🟠 Antes de la primera campaña |
| Registros de licencias VA · NJ · MA | 🟠 Día 5 |
| Página de aterrizaje americana | 🟠 No la home de Valencia |
| **Quién atiende ~10 reuniones/semana de 15:00 a 23:00** | 🔴 **La que decide el plan, y no la desbloquea ningún script** |

---

## 10. En corto

Cinco scripts, seis alias, la configuración de EE. UU. documentada y **un fallo de
producción arreglado**.

De lo que se ha encontrado, lo que hay que recordar:

1. **Sin `state` no hay llamada.** La importación no lo guardaba y `canCall`
   rechaza cada +1 sin zona horaria. Habría dado cero llamadas en silencio.
2. **El idioma por defecto de los agentes es `es`**, y el motor solo habla
   inglés. Todo agente creado desde pantalla nace mudo para esta campaña.
3. **Places tope a 20 por consulta.** El día 3 del plan estaba mal
   dimensionado por un factor de dos.

Ninguna de las tres se ve desde fuera. Las tres se descubren contando cero al
final del día, que es exactamente lo que `preflight:usa` existe para evitar.
