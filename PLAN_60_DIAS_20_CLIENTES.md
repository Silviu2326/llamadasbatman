# 20 clientes en 60 días — productos A y C

Del 17 de agosto al 17 de octubre de 2026. Mercado: costa Este de EE. UU.
Con llamadas del agente encendidas.

---

## 0. Lo primero, porque cambia el reparto

**20 clientes del producto A no se pueden entregar en 60 días.** Cada web son
25-40 horas de producción; veinte son 600 horas en ocho semanas. Con una persona
salen 2-3 al mes ([ESCENARIOS §1](ESCENARIOS_INVERSION_SPRITMARK.md)), y con un
freelance a partir de la semana 4, seis en total. Vender veinte y entregar seis no
es ambición: es cómo se pierden los seis.

**Pero 20 clientes sí llegan**, porque el producto C no consume producción:

| | Producto | Clientes | Entrega por cliente | Al mes cada uno |
|---|---|---|---|---|
| **A** | Web + SEO + sistema | **6** | 🔴 25-40 h | 3.500 $ + 1.200 $/mes |
| **C** | Plataforma en marca blanca | **14** | 🟢 2 h de alta + 1,5 h/mes | 300-600 $/mes |
| | **Total** | **20** | | |

**A los 60 días:** 21.000 $ cobrados de altas y **~13.500 $/mes recurrentes**.

El seis del producto A no es una renuncia — es exactamente el techo de entrega.
Vender el séptimo solo significaría entregar tarde los seis primeros.

---

## 1. La asimetría que ordena todo el calendario

Esta es la razón de que el plan tenga la forma que tiene:

> **Las llamadas no necesitan calentamiento. El correo necesita tres semanas.**

Los buzones no se pueden usar en volumen hasta la semana 4, y ese plazo no se
acorta con dinero — es el único del plan que no se compra. Pero un número de
teléfono registrado llama el segundo día.

**Por eso el producto C va primero.** Se vende por teléfono a oficinas de agencias,
y produce clientes en las semanas 2-5 mientras el correo del producto A todavía se
está calentando. No es preferencia de producto: es la única forma de que las
primeras cuatro semanas no estén vacías.

Y hay una segunda razón, que es de ley y no de calendario:

> **Una agencia tiene fijo de oficina. Un techador usa el móvil.**

La prohibición federal de llamar con voz artificial sin permiso cubre móviles y
fijos residenciales — **no los fijos de empresa**
([MODOS_LEGALES §3](MODOS_LEGALES_AGENTE_VOZ.md)). Del techador medio americano no
se puede saber si el número de Google es su móvil, y casi siempre lo es. **Una
agencia de marketing tiene centralita.** Es el público al que sí se puede llamar
en frío, legalmente, desde el primer día.

⚠️ **Con un matiz que hay que resolver con el abogado:** `Lookup` devuelve tres
tipos. `mobile` se descarta siempre. `landline` entra. **`voip` es la zona gris** —
muchas agencias pequeñas usan RingCentral o similar, no es una línea residencial,
pero tampoco es un fijo clásico. **Que lo decida el abogado en la revisión**, porque
de esa respuesta depende que el universo llamable sea 1.200 o 2.500.

---

## 2. Las tres pistas, en paralelo

| Pista | Qué | Empieza | Produce clientes |
|---|---|---|---|
| **0 · Máquina** | Worker, horario, consentimiento, buzones, números | Día 1 | — |
| **C · Agencias** | Llamada en frío a fijos + correo | **Semana 2** | **Semanas 3-9** |
| **A · Techadores** | Correo → YES → llamada del agente | Semana 5 | Semanas 6-9 |

---

## 3. Semana a semana

### S1 · 17-23 ago — comprar el tiempo que no se puede comprar después

| | Qué | Por qué esta semana |
|---|---|---|
| 🔴 | **Comprar los 30 buzones y 10 dominios de golpe** | El calentamiento es en serie. Comprar 12 ahora y 18 en septiembre son **dos** esperas de tres semanas |
| 🔴 | Worker + Redis en Railway · verificar `/health/workers` | Sin esto `enqueueLeadCall` devuelve `false` en silencio |
| 🔴 | 15 números locales + **iniciar el registro de marca (CNAM)** | El verificado tarda días. Sin él sale "Spam Likely" |
| 🔴 | **Contratar al abogado TCPA** (800-2.000 $) | Tiene que contestar lo del `voip` antes de la S2 |
| 🔴 | Arreglar el horario a EE. UU. · `REQUIRE_VOICE_CONSENT=true` · emociones a `false` | Hoy llamaríamos a las 4 de la mañana |
| 🟠 | `Lookup` de tipo de línea (~10 líneas) | Es lo que hace legal toda la pista C |
| 🟠 | Credenciales: Twilio, Places, DeepSeek, Resend, Brave, PSI | — |
| 🟢 | **Sacar 5.000 agencias** de Places en 30 ciudades de la costa Este | 125 $. No necesita esperar a nada |

**Al cerrar la semana:** buzones calentándose, máquina en pie, lista C lista.

### S2 · 24-30 ago — primeras llamadas

- Verificar tipo de línea de las 5.000 → **~1.800 fijos de empresa** (40 $)
- Pasar la lista por limpieza de demandantes profesionales (50-150 $/mes)
- Cargar al agente el guion de la sección 5
- **Las 20 primeras llamadas, escuchadas una por una el mismo día**
- Ajustar guion. Volver a llamar.
- Auditar las webs de las agencias: *"tu propia web tarda 5 s"* abre muy bien
- 🟢 Bajar el **registro estatal de licencias de techadores** — gratis

⚠️ **Las 20 primeras llamadas no son para vender.** Son para oír cómo suena el
agente con gente real. Nadie escala un guion que no ha escuchado.

### S3 · 31 ago-6 sep — volumen en C

- **~600 llamadas/semana** a fijos verificados, 3 intentos por agencia
- Correo en paralelo a las 5.000 agencias (secuencia `ai_email`)
- **Primeras reuniones de C**
- 🎯 **Primer cliente C**
- Auditar las 7.500 webs de techadores · sacar correos y tipo de línea (265 $)

### S4 · 7-13 sep — el filtro que todos se saltan

- Volumen completo en C · **2-4 clientes C acumulados**
- 🔴 **Leer a mano 20 informes de techadores antes de mandar un solo correo.**
  Si el informe no impresiona a alguien que conoce el sector, no hay campaña que
  lo arregle. Es la tarea más aburrida del plan y la que más decide.
- **Contratar al freelance de webs** — antes de tener la primera venta de A, no
  después
- Buzones listos al final de la semana

### S5 · 14-20 sep — arranca A

- 🚀 **Primeros envíos a techadores** — ~500/día, secuencia de 6 pasos
- Sigue C a volumen completo · **5-7 clientes C**
- Primeros YES → **primeras llamadas del agente a techadores**
- Retargeting encendido sobre quien abre el informe

### S6 · 21-27 sep — los dos motores a la vez

- 🎯 **Primer cliente A.** El freelance empieza su web el mismo día
- **8-10 clientes C**
- Primeras grabaciones de llamadas reales → contenido (con permiso, anonimizado)

### S7 · 28 sep-4 oct

- **2-3 clientes A · 11-12 C**
- Se afina el mensaje con lo que se ha oído en 6 semanas de llamadas
- Marca blanca: pedir referencias a las agencias contentas. **Una agencia
  contenta trae otra agencia**

### S8 · 5-11 oct

- **4-5 A · 13 C**
- Segunda web en producción
- Revisar tasa de respuesta: si supera el 2 %, subir volumen de correo

### S9 · 12-17 oct — cierre

- 🎯 **6 A · 14 C = 20 clientes**
- 21.000 $ cobrados · **~13.500 $/mes recurrentes**

---

## 4. Los dos embudos, con números

### Pista C — agencias *(llamada primero)*

| | | Coste |
|---|---|---|
| Agencias extraídas de Places | 5.000 | 125 $ |
| Verificación de tipo de línea | 5.000 | 40 $ |
| **Fijos de empresa → llamables** | **~1.800** | |
| Llamadas (3 intentos) | 5.400 | **216 $** |
| Descuelgan (30 %) | ~540 | |
| **Reuniones** | **~50** | |
| **Clientes C (cierre ~28 %)** | **14** | |

**Coste de la pista C: 381 $** más la limpieza de listas. Deja ~6.300 $/mes.

### Pista A — techadores *(correo primero, llamada con permiso)*

| | | Coste |
|---|---|---|
| Techadores listos (registro gratis + Places) | 7.500 | 265 $ |
| Con correo, para escribir | ~4.800 | |
| Correos enviados (secuencia de 3 toques) | ~14.400 | incluido |
| Responden (2 %) | ~96 | |
| **Dan el YES → llamada del agente** | **~38** | 5 $ |
| **Reuniones** | **~26** | |
| Clientes posibles | ~6-8 | |
| **Clientes que se entregan** | **6** | |

**El número que manda en esta pista no es el 26 de reuniones: es el 6 de
entrega.** Todo lo que sobre por encima se vende como producto B (el sistema
suelto, 1.200 $/mes, cero entrega) o se pasa a otra agencia por comisión.

---

## 5. Qué dice el agente a una agencia

Es una llamada en frío a un fijo de empresa: **no hay consentimiento y no se puede
fingir que lo hay.** Se compensa siendo muy corto y con el mejor argumento que
existe — que la llamada es el producto.

> "Hi — this is **Alex, an AI assistant** calling on behalf of **SprintMarkt**.
> Thirty seconds and you decide.
>
> I'm calling **[Agency]** because you can **white-label me**. What you're hearing
> right now is what your clients would get: a system that calls their leads back
> in under a minute, twenty-four hours a day.
>
> You'd sell it at **twelve hundred a month**. You'd pay us **four-fifty**. No
> build, no hosting, no support — you keep the client and the margin.
>
> Want the numbers by email, or **fifteen minutes with Carlos** — Thursday 10 or
> Friday 2?"

**Por qué funciona con agencias mejor que con nadie:** un techador oye una llamada
buena. Un dueño de agencia oye **un producto que puede revender el viernes**, y
está haciendo la cuenta del margen antes de que termines la frase.

### Las objeciones que van a salir

| Dicen | Contesta |
|---|---|
| **"Are you an AI?"** | *"Yes. That's the pitch."* — **la mejor respuesta de todo el guion** |
| **"We build our own"** | *"Then you know what six weeks of build costs you. This is live in two days and it's yours to brand."* |
| **"Who's behind it?"** | *"SprintMarkt — we build the platform, you sell it. Your client never sees our name."* |
| **"How did you get my number?"** | *"It's your published business line. Want off the list? Done now."* → `OptOut` |
| **"Send me info"** | *"Doing it now — best address?"* → entra en la secuencia |
| **"What's the catch?"** | *"Onboarding's manual right now, so I can only take about a dozen agencies. That's the catch."* — **y es verdad** |

Esa última es cierta y conviene decirla: hoy no hay alta self-service
([§4.2](ESTADO_PRODUCTO.md)). La escasez es real, no un truco de venta.

---

## 6. La capacidad — quién hace qué

Lo que hay que hacer en 8 semanas, en horas:

| | Horas |
|---|---|
| 6 webs × 30 h | **180 h** |
| 14 altas de marca blanca × 2 h | 28 h |
| ~76 reuniones × 45 min con preparación | **57 h** |
| Operar la máquina, escuchar llamadas, afinar | 40 h |
| **Total** | **~305 h** |

Contra ~320 h útiles de una persona en ocho semanas. **No cabe**, y por eso:

- 🔴 **El freelance de webs entra en la S4**, antes de la primera venta de A. Si
  entra cuando ya hay tres webs vendidas, llega tarde y se entrega mal.
- 🔴 **Hay que decidir quién atiende las 76 reuniones**, entre las 15:00 y las
  23:00 hora española. Es unas 10 reuniones por semana. **Esta es la decisión que
  más condiciona el plan y no es de dinero.**
- 🟠 Las 14 altas de marca blanca son SQL a mano. **Construir el alta de
  organización (1-2 días) se paga solo a partir de la sexta cuenta.**

---

## 7. El dinero

| Gasto en 60 días | |
|---|---|
| Escenario A de captación, 2 meses | ~1.750 $ |
| Listas: agencias + techadores | 390 $ |
| Llamadas (C y A) | ~230 $ |
| Tipo de línea + limpieza de listas | ~240 $ |
| Números locales + registro de marca | 54 $ |
| **Abogado TCPA** | **800 – 2.000 $** |
| Freelance: 6 webs × 600 $ | 3.600 $ |
| **Total** | **~7.100 – 8.300 $** |

| Retorno a día 60 | |
|---|---|
| Altas cobradas (6 × 3.500 $) | **21.000 $** |
| **Recurrente mensual al salir** | **~13.500 $/mes** |
| Recurrente anualizado | **162.000 $/año** |

**Se cruza a positivo alrededor de la semana 6**, con el primer cliente A y ocho
de C. Desde la S4 el gasto sale de lo cobrado.

---

## 8. Si va más lento de lo previsto

| Señal, y cuándo | Qué se hace |
|---|---|
| **S3 sin reunión en C** | El problema es el guion, no el volumen. Se reescribe la apertura y se vuelve a escuchar. **No subir llamadas** |
| **S6 con menos del 1 % de respuesta en correo** | Se arregla el mensaje, nunca el volumen. Con 0,5 % ni el escenario C salva la campaña |
| **Sobran reuniones de A** | Se venden como **producto B** — el sistema suelto, 1.200 $/mes, cero entrega. Es lo más rentable que hay |
| **Faltan clientes en la S8** | Se empuja C, no A. C se entrega en dos horas; A no cabe |
| **El abogado dice que `voip` no vale** | El universo C baja de 1.800 a ~1.000. Se compensa con más ciudades, que son gratis |

**La regla:** cuando falte, se empuja la pista que no consume producción. Cuando
sobre, se sube el precio. Nunca al revés.

---

## 9. Lo que hay que decidir hoy

| Pregunta | Propuesta |
|---|---|
| **¿Quién atiende ~10 reuniones por semana, de 15:00 a 23:00?** | 🔴 **Decisión número uno.** Sin ella el resto del plan es teórico |
| ¿Se compran los 30 buzones hoy o 12 y luego más? | **Los 30 hoy.** El calentamiento es en serie y no se recupera |
| ¿Freelance de webs, cuándo? | **Semana 4**, antes de la primera venta de A |
| ¿Se construye el alta de organización? | **Sí, 1-2 días.** Se paga sola en la sexta cuenta de marca blanca |
| ¿Precio de la marca blanca? | **450 $/mes** por cuenta. Ellos cobran 1.200 $ y les queda 2,6× |
| ¿`voip` entra o no? | **Lo decide el abogado en la S1.** Es la diferencia entre 1.800 y 1.000 llamables |
| ¿Y si en la S9 hay 24 clientes? | **No se cogen.** Se suben los precios y se pasa el sobrante por comisión |

---

## 10. En una página

**6 del producto A y 14 del C.** El seis no es prudencia, es el techo de entrega
con un freelance; el catorce es posible porque una cuenta de marca blanca son dos
horas de alta.

**El orden lo decide el calentamiento.** Tres semanas para que el correo funcione,
cero para que funcione el teléfono. Así que las agencias —que tienen fijo de
oficina y a las que sí se puede llamar en frío— llenan las semanas 2 a 5, y los
techadores entran por correo en la 5.

**El argumento de venta es la propia llamada.** A un techador le impresiona; a un
dueño de agencia le hace la cuenta del margen mientras habla. Por eso la pregunta
*"¿esto es una IA?"* no es una objeción en esta campaña — **es el momento en que
se cierra**.

Y lo único que puede tumbar el plan no es el dinero, ni la ley, ni la tecnología:
son **diez reuniones a la semana entre las tres de la tarde y las once de la
noche**, y quién se sienta en ellas.
