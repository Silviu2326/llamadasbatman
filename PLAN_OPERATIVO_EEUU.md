# EE. UU. — Cómo lo vamos a hacer, paso a paso

El plan operativo: qué vende la máquina, a quién, con qué servicio del repo se
hace cada paso, qué cuesta y en qué orden se enciende.

Fecha: 17 de agosto de 2026. Mercado: costa Este. Idioma: inglés.

> **Por qué EE. UU. sí y España no.** El agente de voz solo habla inglés
> ([vendravaVoice.ts:206](backend/src/voice/pipelines/vendravaVoice.ts#L206)). En
> Valencia eso era el bloqueo; aquí es el producto. Todo lo que sigue existe
> **porque llamamos en inglés**.

---

## 1. El hallazgo que cambia el plan de arranque

Antes de nada, porque afecta a todo lo demás y no estaba en ningún documento:

**`salesSequence.service.ts` ya es la máquina entera.** No hay que orquestar
nada a mano. Una secuencia admite pasos de tipo `ai_email`, `call`, `task`,
`meeting`, `whatsapp` y `email` (línea 25), y los ejecuta el worker con
`processSalesSequenceTick`. Los pasos de `call` **reutilizan la cola de voz**
(`enqueueLeadCall`) con la puerta de consentimiento `canCall` delante (líneas
9-10). Y la secuencia se **para sola** si el lead responde, se da de baja, rebota
o se queja (`stopSalesSequenceForLead`, línea 260).

Y el detalle que desbloquea el arranque:

| Tipo de paso | Necesita | ¿Podemos usarlo hoy? |
|---|---|---|
| `email` | `templateExternalId` = plantilla de **Mautic** | ❌ Mautic no está desplegado |
| **`ai_email`** | **Nada** — escribe y envía por Resend | ✅ **Sí** |
| `call` | Consentimiento válido | ✅ Sí |

> **Traducción: Mautic deja de ser un bloqueante para arrancar.** Estaba marcado
> como 🟠 en [ESTADO_PRODUCTO §4.5](ESTADO_PRODUCTO.md) porque bloquea el email
> marketing. Pero la secuencia de captación se monta entera con pasos `ai_email`,
> que no tocan Mautic. **Mautic pasa a fase 2.**

Lo que sí falta es la interfaz: el formulario de Growth Hub no envía pasos, así
que una secuencia creada desde pantalla nace vacía y falla con
`SEQUENCE_STEPS_INVALID` ([§4.7](ESTADO_PRODUCTO.md)). **Se crea por API.** El
JSON está en la sección 4.

---

## 2. Qué vendemos, y a quién

Tres productos. No son alternativas: son tres públicos distintos con la misma
máquina detrás.

| | Producto | A quién | Precio | Coste de entrega |
|---|---|---|---|---|
| **A** | **Web + posicionamiento + el sistema** | Negocio local americano | 3.500 $ + **1.200 $/mes** | 🔴 25-40 h de alta |
| **B** | **Solo el sistema** (speed-to-lead) | El mismo, o el que ya tiene web | **1.200 $/mes** | 🟢 **Casi cero** |
| **C** | **La plataforma en marca blanca** | Agencias americanas pequeñas | 300-600 $/mes por cuenta | 🟢 1-2 h/mes |

### Con cuál se lidera

**Con el B, y es importante que sea el B.**

El A es lo que dicen los documentos y es lo que más factura por cliente, pero
cada uno se lleva 25-40 horas de producción. Con una persona haciendo webs, el
techo es de 2-3 al mes ([ESCENARIOS §1](ESCENARIOS_INVERSION_SPRITMARK.md)) — y
la máquina genera muchas más reuniones que eso desde el primer mes.

El B **no tiene coste de entrega**: se conecta a su formulario y funciona. Es el
punto 3 de la sección 9 de ESCENARIOS: *"podrías vender 100 y no trabajar ni una
hora más"*.

**Así que la regla de reparto de las reuniones es esta:**

- Al que tiene web decente y pierde contactos → **B**. Se cierra rápido y no
  consume producción.
- Al que tiene la web rota **y** dinero → **A**, y solo hasta 3 al mes.
- A partir de la cuarta web del mes → **se sube el precio o se pasa al B**.

### Y el C, que es el que nadie mira

Una agencia americana pequeña tarda seis semanas en entregar una web. Nosotros
días. Venderles el motor y que ellos pongan la cara **no cuesta un euro de
captación** y una sola agencia trae 3-8 cuentas de golpe.

🔴 **Con un techo duro:** no existe alta self-service, ni `/register`, ni
recuperación de contraseña ([§4.2](ESTADO_PRODUCTO.md)). Cada cuenta se crea a
mano. **Máximo 10-12 cuentas** hasta que eso se construya. Se vende como marca
blanca gestionada, no como SaaS.

---

## 3. La máquina, de punta a punta

Cada paso, con lo que lo hace y lo que cuesta. Por cada **1.000 negocios**:

```
1 · LISTA
    Registro estatal de licencias de techadores       → 0 $     GRATIS
    + Google Places (teléfono y web)                  → 25 $    prospecting.service.ts
              ↓
2 · AUDITORÍA de cada web
    SSL, sitemap, schema, Core Web Vitals de PSI,     → ~0 $    digitalAudit.service.ts
    reseñas vs. media del sector, y su email               seoAgency.service.ts
              ↓
    ⚠️ SE DESCARTA EL 30 % — los que tienen la web bien no compran
              ↓
3 · CORREO DEL DUEÑO
    5 patrones + verificación                         → 2 $     ❌ FALTA CONSTRUIR
              ↓
4 · TIPO DE LÍNEA
    Fijo de empresa o móvil                           → 8 $     ❌ FALTA CONSTRUIR
    Decide si se puede llamar en frío o hay que escribir primero
              ↓
5 · SECUENCIA (sección 4)
    ai_email → ai_email → call → ai_email → call      salesSequence.service.ts
              ↓
6 · LLAMADA del agente
    0,04 $ por intento · 0,09 $ por conversación      voice/pipelines/vendravaVoice.ts
              ↓
7 · REUNIÓN en el CRM, con transcript y sentimiento
              ↓
8 · RETARGETING a todo el que abrió el informe        metaCampaignBuilder.service.ts
```

**Coste total de los 1.000: unos 35 $.** El paso 1 es gratis en seis de los ocho
sectores porque los registros de licencias son públicos
([LISTAS_Y_COSTE_LLAMADAS §5](LISTAS_Y_COSTE_LLAMADAS.md)).

### El primer sector, con números reales

Techadores de la costa Este, de [COMO_CONSEGUIR_CONTACTOS §8](COMO_CONSEGUIR_CONTACTOS_BARATO.md):

| | |
|---|---|
| Empresas listas con todo | **~7.500** |
| Coste | **265 $** |
| Tiempo | **2 días** |
| De ahí, con fijo de empresa → **llamables en frío** | ~2.700 |
| De ahí, para escribir primero | ~4.800 |
| Trabajo que da | **4 meses** |

---

## 4. La secuencia, configurada de verdad

Esto es el "cómo" en una sola cosa. Se crea por API sobre `growthProgram` con
`type: 'sales_sequence'`. Máximo 20 pasos y 1.000 leads por matriculación.

```json
{
  "leadIds": ["..."],
  "steps": [
    { "key": "t1-report",  "type": "ai_email", "delayDays": 0,
      "purpose": "Send the free website audit report. Lead with the single worst
                  measured number. Include the public report link. Close with:
                  reply YES and our AI assistant calls you in 60 seconds." },

    { "key": "t2-bump",    "type": "ai_email", "delayDays": 3,
      "purpose": "Three-line follow-up on the same thread. One new data point
                  from the audit. Same YES call-to-action." },

    { "key": "t3-call",    "type": "call",     "delayDays": 1,
      "purpose": "Only fires if consent exists — canCall blocks it otherwise." },

    { "key": "t4-case",    "type": "ai_email", "delayDays": 4,
      "purpose": "Roofer case study. What changed in booked jobs, not in design." },

    { "key": "t5-call",    "type": "call",     "delayDays": 2 },

    { "key": "t6-breakup", "type": "ai_email", "delayDays": 5,
      "purpose": "Breakup email. Highest reply rate of the whole sequence." }
  ]
}
```

**Cuatro cosas que hace sola y conviene saber:**

1. **Se para en cuanto responden.** `stopSalesSequenceForLead` la corta al primer
   `reply`, `unsubscribe`, `bounce` o `complaint`. Nadie recibe el paso 4 después
   de haber contestado al 2.
2. **El paso `call` no llama si no hay permiso.** `canCall` es la puerta. Si el
   lead no ha dado consentimiento, el paso se salta sin romper la secuencia.
3. **Los `ai_email` los escribe `emailCopy.service.ts`**: investiga el negocio con
   Brave y su propia web, escribe tres versiones, las juzga y pule la ganadora.
   El `purpose` es la instrucción, no la plantilla.
4. **Los `delayDays` son acumulativos** (`nextRunAtForStep`, línea 121). La
   secuencia de arriba dura 15 días.

### La pieza que lo convierte todo en legal

El **"reply YES"** del paso 1 no es un truco de copy. Es el motor entero:

> Una respuesta por correo diciendo "sí, llamadme" **es consentimiento por
> escrito** — la ley americana de firma electrónica (E-SIGN) equipara el correo a
> un documento firmado. Queda guardado en el hilo, con fecha y remitente.

Sin eso, el agente solo puede llamar a quien rellene un formulario. Con eso,
**cada campaña de correo alimenta al agente de voz**. Es el modo 2 de
[MODOS_LEGALES §3](MODOS_LEGALES_AGENTE_VOZ.md).

⚠️ Y con un límite estricto: *"Interesting, tell me more"* **no es
consentimiento**. Solo vale una respuesta que acepte la llamada. Si contestan
otra cosa, se responde por correo pidiendo el YES.

---

## 5. Qué dice el agente

### 5.1 · Modo 2 — contestó YES *(el 90 % de las llamadas)*

Las cuatro obligaciones van en los primeros 15 segundos, antes de vender nada.

> "Hi — this is **Alex, an AI assistant** ① *(aviso de IA)*
> from **SprintMarkt**. ② *(quién llama)*
> **Is it okay if I record this call** for quality? ③ *(permiso de grabación)*
> You **replied to our email asking to hear what this sounds like**, ④ *(por qué hay permiso)*
> so — this is it. You're talking to it right now. Got sixty seconds?"

**Y ahí está el truco entero de esta campaña:** la llamada **es** la demostración.
No se describe el producto, se está usando. Nadie olvida esa llamada.

El desarrollo:

> "What you're hearing is the same system that would call **your** leads about
> thirty seconds after they fill out your form — instead of two hours later, when
> they've already hired someone else.
>
> Quick one: when someone requests a quote on your site right now, **how long
> until somebody actually calls them back?**"

Casi siempre contestan "a few hours" o "next day". Ahí está la venta.

> "That's the normal answer, and it's what this fixes. Last thing — I'd rather
> not sell you anything over the phone. **Fifteen minutes with Carlos**, he shows
> you your audit and what he'd do. **Thursday 10am or Friday 2pm?**"

### 5.2 · Modo 3 — fijo de empresa verificado, en frío

Aquí **no hay consentimiento y no se puede fingir que lo hay.** Se quita el punto
④ y se compensa siendo mucho más corto.

> "Hi — this is **Alex, an AI assistant** calling on behalf of **SprintMarkt**.
> I'll be quick, thirty seconds and you decide.
> I ran a check on **[Company]**'s website this morning. **It takes 6.4 seconds
> to load on a phone, and there's no way to call you from it without typing the
> number by hand.** For a roofer, that's the whole game.
> Want me to email you the full check? It's free either way."

**El objetivo del modo 3 no es la reunión: es el permiso.** Consigue el correo,
manda el informe, y a partir de ahí ya está en la secuencia normal.

🟡 Solo se marca a números **verificados como fijo de empresa**. Es lo único que
lo hace legal, y hoy esa verificación no está construida (sección 6).

### 5.3 · Las objeciones, en inglés

| Dicen | Contesta |
|---|---|
| **"Not interested"** | *"Understood. One thing and I'll let you go: your site shows 'Not secure' on mobile. Want the free check by email?"* |
| **"Are you a robot?"** | *"Yes — I'm an AI assistant. Want me to put a human on?"* → transfiere |
| **"How did you get my number?"** | *"It's the number published on your website and Google listing. Want me to take you off the list? Done right now."* → `OptOut` |
| **"Just email me"** | *"Doing that now. What's the best address?"* → cierra y sigue la secuencia |
| **"We already have a guy"** | *"Good. Then this is for him — send him the check. If it's all clean you lost two minutes."* |
| **"How much?"** | *"Setup's thirty-five hundred, twelve hundred a month for the system. If that's out of range tell me now and I'll stop wasting your time."* |
| **"Take me off your list"** | Se registra en `OptOut` en el acto. **Sin excepciones** |

El motor ya detecta en inglés el "no me llames" y el "pásame con una persona"
(`voice/compliance.ts:13-33`), y transfiere solo cuando detecta frustración.

---

## 6. Lo que hay que construir antes de la primera llamada

Ordenado. Del 1 al 4 no hay atajo — sin ellos, no hay campaña.

| | Qué | Sin esto pasa | Trabajo |
|---|---|---|---|
| 🔴 **1** | **Worker + Redis** | `enqueueLeadCall` devuelve `false` **en silencio** y la API dice que está sana. No se llama a nadie y nadie se entera | Despliegue |
| 🔴 **2** | **Horario legal de EE. UU.** | El mapa de zonas horarias es de México. Llamaríamos a las 4 de la mañana. La franja legal es 8-21 h **hora del que recibe** | Guardar el `timezone` que Places ya devuelve |
| 🔴 **3** | **`REQUIRE_VOICE_CONSENT=true`** + rellenar `evidence` | Se llamaría sin permiso registrado. 500 $ por llamada | Una variable + un campo que ya existe |
| 🔴 **4** | **Verificador de correo** | Rebote del 8-10 % y los buzones se queman en dos semanas. **4 $ por cada 10.000** | Una llamada a API |
| 🟠 5 | **Credenciales**: Twilio, Places, DeepSeek, Resend, Brave, PSI | Cada módulo devuelve error honesto y no hace nada | Configuración |
| 🟠 6 | **Registro de marca del número (CNAM)** | Sale "Spam Likely" y no descuelga nadie. **10 $/mes** | Alta en Twilio |
| 🟠 7 | **`VOICE_EMOTION_RECOGNITION_ENABLED=false`** | Illinois (BIPA): 1.000-5.000 $ por persona, en demanda colectiva | Una variable |
| 🟠 8 | **Correo del dueño** (5 patrones + verificación) | Escribes al `info@`. **Duplica la respuesta** escribir al dueño | Plantillas + el punto 4 |
| 🟡 9 | **Tipo de línea (Twilio Lookup)** | Sin esto **no existe el modo 3**. ~10 líneas | 0,008 $/número |
| 🟡 10 | Abogado TCPA americano | — | 800-2.000 $, una vez |

**El 1 es el que más engaña.** Todo lo demás falla con un error visible; ese
falla en silencio mientras `/health` responde que todo va bien.

---

## 7. Las ocho semanas

El único plazo que no se acelera con dinero: **los buzones necesitan tres semanas
de calentamiento**. Si se salta, todo va a spam y se empieza de cero. Así que esas
tres semanas se usan para lo demás.

| Semana | Máquina | Manual |
|---|---|---|
| **1** | Comprar 12 buzones + 4 dominios → **empieza el calentamiento** | Worker + Redis + credenciales · números locales + CNAM |
| **2** | Calentando | Horario EE. UU. · consentimiento · verificador de correo |
| **3** | Calentando · **bajar el registro de licencias de techadores** (gratis) | Crear la secuencia por API · cargar los guiones al agente |
| **4** | **Auditar 7.500 webs** · sacar correos y tipo de línea | Revisar 20 informes a mano. Si dan pena, se arregla el prompt antes de mandar nada |
| **5** | 🚀 **Primeros envíos** — 420/día, 200 leads en secuencia | Escuchar **todas** las llamadas del primer día |
| **6** | Primeros YES → **primeras llamadas del agente** | Atender las reuniones · retargeting encendido |
| **7** | Volumen completo · anuncios de retargeting | **Primer cliente** |
| **8** | Se decide: subir a escenario A, o afinar el mensaje | Revisión de números |

⚠️ **La semana 4 es la que todo el mundo se salta y la que decide la campaña.**
Veinte informes leídos a mano antes de mandar 8.800 correos. Si el informe no
impresiona a alguien que conoce el sector, no hay campaña que lo arregle.

---

## 8. Los números al mes

Escenario 0 — el de arranque, **180 €/mes**:

| Partida | $/mes |
|---|---|
| 12 buzones + 4 dominios | 34 |
| Secuenciador | 39 |
| Servidores + IA | 80 |
| **15 números locales + registro de marca** | **27** |
| Anuncios de retargeting | 43 |
| **Llamadas** (~180 intentos) | **7** |

Lo que produce, con los ratios de [ESCENARIOS §3](ESCENARIOS_INVERSION_SPRITMARK.md):

| | |
|---|---|
| Correos enviados | 8.800 |
| Los abren | 3.240 |
| Contestan | 176 |
| **Dan el YES → llamada del agente** | **~64** |
| Descuelgan | ~42 |
| **Reuniones** | **26** |
| **Clientes (en teoría)** | **6** |
| **Clientes que se pueden atender** | **3** |

**Y ahí está el problema real, que no es de dinero.** Se generan 26 reuniones al
mes y hay que estar en ellas, entre las 15:00 y las 23:00 hora española. La
máquina no tiene techo; la agenda sí. Antes de subir a escenario A hay que
resolver **quién atiende las reuniones**, no cuánto se invierte.

**Coste por cliente: unos 33 €.** Cada uno deja 17.900 $ el primer año.

---

## 9. Los anuncios y el contenido — la otra mitad

No compiten con lo de arriba: se encienden en paralelo y con poco dinero.

### 9.1 · Anuncios: retargeting primero, siempre

| Con 100 $ | Clics |
|---|---|
| **Retargeting a quien ya visitó** | **125** |
| Meta en frío | 40 |
| Google búsqueda en frío | **4** |

Treinta veces más barato impactar a quien ya te conoce. **Se enciende el
retargeting el primer día y Google búsqueda no entra hasta tener 15-20 clientes
de historial.**

El público de retargeting sale gratis de la propia máquina: **todo el que abre el
informe público**. Ya está identificado y ya te conoce.

`metaCampaignBuilder.service.ts` crea campaña, adset, creatividad y anuncio
reales, **siempre en PAUSED** — una persona aprueba antes de que gaste. Y
`metaConversions` devuelve a Meta las reuniones celebradas, no los formularios
rellenados, para que el algoritmo aprenda a traer gente que cierra.

### 9.2 · Contenido: el material que no tiene nadie

`contentStudio` + `contentCritic` (cuatro lentes, con enmascarado de datos
personales) y publicación por Metricool. Qué grabar, por orden:

1. **Llamadas reales del agente**, con permiso y anonimizadas. **Es lo más
   potente que hay y nadie ha oído esto todavía.** Y sale gratis: cada llamada
   queda grabada y transcrita.
2. Antes y después de una web, con las llamadas que entraron después.
3. *"Three things wrong with almost every roofer's website"* — esto se lo
   reenvían entre ellos.

Lo que no funciona: vídeos de consejos de marketing. Hay diez mil.

### 9.3 · SEO programático

`agency-for-[oficio]-in-[ciudad]` — el propio sistema genera las páginas. Tarda
4-6 meses y **es la demostración del producto**: la página por la que llegó el
cliente la hizo el sistema que le estamos vendiendo.

⚠️ Con una condición: páginas realmente distintas. 5.000 clonadas cambiando la
ciudad es exactamente lo que Google penaliza desde 2024.

---

## 10. Lo legal, en modo configuración

No teoría — lo que hay que dejar puesto:

| | |
|---|---|
| `REQUIRE_VOICE_CONSENT` | `true` |
| `VOICE_EMOTION_RECOGNITION_ENABLED` | `false` *(Illinois, BIPA)* |
| Zona horaria por lead | La que devuelve Places. Franja 8-21 h **local del que recibe** |
| `ContactConsent.evidence` | Texto exacto, versión, fecha, hora e IP |
| Estados fuera los 3 primeros meses | **Florida y Oklahoma** — los que más pleitos generan |
| Pie de cada correo | Dirección postal + baja en un clic *(CAN-SPAM)* |
| Modo 3 | Solo a números **verificados como fijo de empresa** |
| Antes de la primera campaña | Abogado TCPA, 800-2.000 $, una vez |

> *No es asesoramiento legal, y la normativa federal de voz IA tiene una
> propuesta abierta desde 2024. Revisar cada seis meses.*

---

## 11. Lo que hay que decidir

| Pregunta | Propuesta |
|---|---|
| **¿Quién atiende las 26 reuniones al mes?** | 🔴 **La decisión más importante y no es de dinero.** Sin respuesta, subir la inversión no sirve de nada |
| ¿Con qué producto se lidera? | **El B**, el sistema suelto a 1.200 $/mes. Cero entrega. El A solo hasta 3 webs al mes |
| ¿Sector y estados? | **Techadores**, costa Este **sin Florida ni Oklahoma**. 265 $ y da 4 meses |
| ¿Modo 3 (llamada en frío a fijos) desde el principio? | **No.** Modo 2 los dos primeros meses. El 3 cuando el guion esté rodado y `Lookup` construido |
| ¿Mautic ahora? | **No.** La secuencia va con `ai_email`. Mautic a fase 2 |
| ¿Marca blanca a agencias? | **Sí, desde la semana 1.** No cuesta captación. Techo de 10-12 cuentas |
| ¿Cuánto se pone? | **180 €/mes** ocho semanas. Se sube a 800 € cuando el correo pase del 2 % de respuesta |

---

## 12. Lo que hay que quedarse

La máquina ya existe entera y el orquestador es `salesSequence`: dos correos
escritos por IA, una llamada del agente, otro correo, otra llamada — y se para
sola en cuanto contestan. **Con pasos `ai_email`, que no necesitan Mautic.**

El permiso para llamar sale del propio correo: **"reply YES and our AI calls you
in sixty seconds"**. Esa frase es a la vez el consentimiento por escrito que
exige la ley y la mejor demostración de producto que existe — porque la llamada
que reciben **es** el producto funcionando, con ellos dentro.

Falta poco y todo es corto: arrancar el worker, arreglar el horario a EE. UU.,
activar el consentimiento y añadir el verificador de correo. Cuatro cosas, ninguna
de más de un día.

Y el freno no va a ser el presupuesto ni la tecnología. Van a ser **las 26
reuniones al mes de las que solo se pueden atender unas cuantas**, entre las
15:00 y las 23:00. Decidir eso vale más que la diferencia entre poner 180 € o
5.000 €.
