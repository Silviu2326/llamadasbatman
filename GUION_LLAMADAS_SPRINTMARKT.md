# Vender SprintMarkt por teléfono — a quién, qué y cómo

SprintMarkt es el cliente. Nosotros le llenamos la agenda: sacamos la lista,
auditamos, mandamos el informe, llamamos y le entregamos la reunión.

Fecha: 17 de agosto de 2026. Mercado: Valencia y área metropolitana.

---

## 0. Lo primero, porque condiciona todo: quién marca

**El agente de voz no puede hacer estas llamadas.** Si el idioma del agente no es
inglés, la llamada se rechaza con `voice_language_unsupported`
([vendravaVoice.ts:206](backend/src/voice/pipelines/vendravaVoice.ts#L206)). No es
un fallo a esquivar: es la decisión que se tomó el 11/08
([ESTADO_PRODUCTO.md §4.1](ESTADO_PRODUCTO.md)).

Así que el reparto, hoy, es este:

| Paso | Quién |
|---|---|
| Sacar la lista por sector y ciudad | 🤖 Prospect Finder |
| Auditar las webs y sacar el correo | 🤖 `digitalAudit` |
| Escribir el correo personalizado y mandarlo | 🤖 `emailCopy` + Resend |
| Ver quién abre el informe | 🤖 Link público con seguimiento |
| **Llamar** | 🧑 **Tú** |
| Registrar, seguir y recordar | 🤖 CRM |

**Esto no es una limitación grave, es el orden correcto para empezar.** Las
primeras 200 llamadas hay que hacerlas a mano de todas formas: son las que
enseñan qué frase funciona. Ese guion afinado es después lo que se le carga al
agente el día que hable español. Nadie automatiza un guion que no ha probado.

---

## 1. ¿A quién llamamos?

### 1.1 · La regla que ahorra el 80 % de las llamadas

**No se llama a una lista. Se llama a quien ya ha abierto tu informe.**

El orden es siempre: auditoría → correo con el informe → **llamada solo después**.
Eso convierte una llamada a puerta fría en un seguimiento, y cambia la primera
frase de *"le llamo de una agencia"* a *"te mandé el informe de tu web el martes"*.

Tres círculos, por orden de facilidad:

| | Quién | Qué tasa esperar | Cuántos |
|---|---|---|---|
| **1** | **Abrieron el informe** y no contestaron | 🟢 La mejor con diferencia | ~30 por cada 500 auditados |
| **2** | Auditados con problema grave, no abrieron | 🟡 Normal | ~170 por cada 500 |
| **3** | **Clientes actuales de SprintMarkt** | 🟢 La más alta de todas | 10 |

> **El círculo 3 es dinero que ya está sobre la mesa y nadie lo ha recogido.** Son
> diez negocios que ya pagaron, ya confían y ya tienen el teléfono de Carlos. El
> motivo de llamada existe y tiene fecha: el artículo 50 del Reglamento de IA es
> aplicable desde el 2 de agosto. **Empieza por ahí el lunes**, antes de gastar un
> euro en captar a nadie.

### 1.2 · Qué sectores, y por qué esos

El criterio no es "quién tiene dinero". Es **de qué sector tiene SprintMarkt un
caso que enseñar**, porque en la llamada eso vale más que cualquier argumento.

| Sector | Caso que enseñar | Por qué funciona | Orden |
|---|---|---|---|
| **Concesionarios y compraventa** | **ForzAuto** | Dejaron de pagar comisiones a los portales. **Es un ahorro medible, no una opinión de diseño** | **1º** |
| **Reformas y construcción** | Hestia Construcciones | Ticket alto, webs pésimas, todo entra por móvil | **2º** |
| **Interiorismo y arquitectura** | Tessel·les | Venden por imagen y tienen webs lentas llenas de fotos sin comprimir | 3º |
| **Hostelería con reserva** | El Barrio, MrCoolCat | La auditoría detecta sola si tienen TheFork o CoverManager | 4º |
| **Rotulación e industria local** | Rotulemos | Pasaron de local a vender online | 5º |

**Empezar por concesionarios.** Un concesionario mediano de Valencia paga entre
300 y 1.500 € al mes a coches.net o Autocasión. Ese número lo conoce, le duele
todos los meses, y hay un caso real de alguien que dejó de pagarlo. Es la única
conversación de esta lista que empieza con el prospecto haciendo una resta.

### 1.3 · Cómo se filtra la lista, con lo que la auditoría ya devuelve

`digitalAudit.service.ts` no da una nota y ya. Devuelve señales concretas, y cada
una **ya viene etiquetada con el producto de SprintMarkt que la resuelve**
(`product: 'web' | 'seo' | 'marketing' | 'ia' | 'software'`, línea 49).

Se llama a quien tenga **al menos una de estas**:

| Señal detectada | Qué significa en la llamada |
|---|---|
| `diyBuilder` — Wix, GoDaddy, Squarespace, Jimdo | **La mejor señal de todas.** Pagan por tener web, les importa, y es mala |
| `isHttps` falso | Chrome enseña "No es seguro" antes de que entren |
| Web caída o más de 5 s de carga | Dato duro, medido, indiscutible |
| Sin formulario, sin `tel:`, sin CTA de WhatsApp | Entran desde el móvil y no tienen cómo contactar |
| Sin sitemap, sin schema, sin meta descripción | No los encuentra nadie |
| Sin Analytics ni Pixel | No miden nada, así que no saben lo que pierden |
| Reseñas por debajo de la media de su sector | `benchmark.ratingDiffPct` lo calcula solo |
| Sector con reservas y sin sistema de reservas | Pierden reservas fuera de horario |

Y se **descarta** a quien tenga la web bien. No por honestidad: porque no compra.

### 1.4 · El embudo, por cada 500 negocios

| | |
|---|---|
| Extraídos de Places | 500 · **12,50 $** |
| Con web viva | ~350 |
| **Con problema real → nos sirven** | **~200** |
| Con correo sacado de su propia web | ~140 |
| Abren el informe | ~30 |
| **Llamadas a hacer** (los 200, empezando por los 30) | **200** |
| Descuelgan | ~60 |
| **Reuniones** | **8 – 12** |
| **Cierres** | **2 – 3** |

Coste de esos 500: **menos de 20 €** entre Places y los correos. Trabajo: dos
tardes de llamadas.

---

## 2. ¿Qué ofrecemos?

### 2.1 · La regla de oro

**La llamada no vende una web. La llamada vende veinte minutos.**

Intentar cerrar 2.500 € por teléfono a alguien que no te conoce no funciona, y
además quema el contacto: si dice que no al proyecto, ya no puedes ofrecerle la
reunión. Un solo objetivo por llamada.

### 2.2 · La escalera

| | Qué | Precio | Dónde se vende |
|---|---|---|---|
| 0 | El informe de su web | **0 €** | Ya se lo mandaste. Es la excusa, no la oferta |
| 1 | **Revisión de 20 minutos** | **0 €** | 🎯 **Esto y solo esto se pide en la llamada** |
| 2 | Auditoría + hoja de ruta | **750 €** | En la reunión. Se descuenta si contrata |
| 3 | Web + posicionamiento + medición | 2.500 € | En la reunión |
| 4 | **Mantenimiento, SEO y contenido** | **390 – 500 €/mes** | 🎯 **Aquí está el negocio de verdad** |

El escalón 2 ya existe en su catálogo como *"sesión de diagnóstico, 750 €, 3 h"*.
Solo hay que llamarlo por lo que es y ponerlo detrás de la llamada.

**El escalón 4 es el único que importa a doce meses.** Un proyecto de 2.500 € se
cobra una vez; 390 € al mes durante tres años son 14.000 €. Ninguna llamada
debería terminar sin haber mencionado que hay una parte mensual.

### 2.3 · Qué ofrecer según lo que salió en la auditoría

La máquina ya elige. Cada oportunidad viene con su `product`:

| Lo que detectó | Lo que se ofrece | Frase para la llamada |
|---|---|---|
| Wix/GoDaddy + sin HTTPS | Web nueva | "está montada en una plantilla que Google no lee bien" |
| Sin sitemap, sin schema, mal posicionado | **SEO mensual** | "no apareces cuando alguien busca lo que vendes" |
| Reseñas bajo la media del sector | Reseñas, dentro del mensual | "tienes 31 y la media de tu sector aquí es 118" |
| Sin formulario ni botón de llamar | Web + captación | "quien entra desde el móvil no tiene forma de contactarte" |
| Sector con reservas y sin reservas online | Reservas | "fuera de horario no te pueden reservar y ahí se pierde" |
| Sin Analytics ni Pixel | Medición + campañas | "no hay forma de saber si algo funciona" |
| Vende y no tiene pago online | Tienda | — |

### 2.4 · Lo que NO se ofrece por teléfono

App móvil, ERP, entrenamiento de modelo propio, RAG. Tickets de 10.000 € o más
que convierten la llamada en una conversación técnica que el dueño no puede
evaluar, y que además bloquean semanas de entrega. Si el prospecto lo pide, se
lleva a la reunión y lo cotiza Carlos.

---

## 3. ¿Cómo transcurre la conversación?

Duración objetivo: **2 minutos y medio.** Si pasa de cuatro, o has cerrado la
reunión o estás vendiendo por teléfono, que es lo que no hay que hacer.

### 3.1 · Apertura — 15 segundos

> — Buenos días, ¿hablo con **[Nombre]**?
> — Soy **[tu nombre]**, de **SprintMarkt**, aquí en Valencia. Te llamo por algo
> concreto, son cuarenta segundos y luego decides tú. **¿Te pillo bien?**

Cuatro cosas, y las cuatro hacen falta: **nombre propio** (no "le llamo de la
empresa"), **ciudad** (local, no un call center), **"algo concreto"** (no una
oferta), y **pedir permiso**. Pedir permiso al principio sube el resto de la
llamada más que cualquier otra frase del guion.

### 3.2 · El gancho — 30 segundos

> — El martes te mandé al correo un informe de la web de **[Empresa]**. Igual no
> te llegó, pasa mucho. Te lo resumo en dos datos:
> **[dato duro] · [dato de comparación]**

Ejemplos reales, todos salidos de la auditoría:

- *"vuestra web tarda 6,4 segundos en abrir en el móvil; Google la marca en rojo a partir de 2,5"*
- *"no tiene certificado de seguridad, y Chrome enseña 'No es seguro' antes de que llegue a entrar"*
- *"está montada en Wix, y por eso no se puede tocar el posicionamiento a fondo"*
- *"tenéis 31 reseñas y un 4,2; la media de reformas en Valencia son 118 y un 4,6"*
- *"no hay formulario ni botón de llamar: el 70 % entra desde el móvil y no tiene cómo contactaros"*

**Y ahora te callas.** El silencio después del dato es lo que hace que hable el
otro. Quien lo llena vendiendo, pierde la llamada.

### 3.3 · Las dos preguntas — 45 segundos

**La primera abre:**

> — ¿Cuánta gente te entra hoy por la web? Presupuestos, llamadas...

Casi siempre contestan *"poca"* o *"nada, todo me viene por recomendación"*. Esa
frase es la venta entera: acaban de decirte que la web no les sirve para nada.

**La segunda hace la cuenta, y la hace con SU número:**

> — ¿Y cuánto vale para ti un cliente nuevo? Un trabajo medio.

Te dirán 300, 2.000 u 8.000 €. Entonces:

> — Vale. Entonces con que de aquí salgan **dos clientes al año**, esto está
> pagado varias veces. Eso es lo que quiero enseñarte.

🔴 **Nunca digas tú una cifra de lo que están perdiendo.** *"Estás perdiendo
4.000 € al mes"* es un número inventado, y el dueño —que sí conoce sus números—
lo sabe en el momento. Se pregunta, no se afirma. Su número siempre convence más
que el tuyo.

### 3.4 · El caso, si lo hay — 20 segundos

Solo si es de su sector. Si no, sáltalo.

> **Concesionario:** — Trabajamos con **ForzAuto**. Dejaron de pagar comisiones a
> los portales porque los presupuestos les entran directos. **¿Tú cuánto pagas hoy
> a coches.net?**
>
> **Reformas:** — Lo mismo hicimos con **Hestia Construcciones**, aquí al lado.
>
> **Hostelería:** — Con **El Barrio** y con la cervecería **MrCoolCat**.

La pregunta del concesionario es la mejor de todo el guion: le hace decir en voz
alta una cifra que ya le molesta.

### 3.5 · El cierre — 20 segundos

> — Te propongo una cosa: **veinte minutos**, comparto pantalla, te enseño el
> informe entero y qué haría yo en tu caso — **te lo digo aunque no trabajes con
> nosotros**. ¿Te va mejor **mañana a las 10** o **el jueves a las 16**?

Dos huecos concretos. Nunca *"¿cuándo te viene bien?"*, que obliga al otro a
trabajar y termina en *"llámame la semana que viene"*.

Y al cerrar:

> — Perfecto. ¿Te mando la invitación al correo o al WhatsApp?

Con eso te llevas el canal bueno, que muchas veces no es el correo del `info@`.

---

## 4. Las ramas — lo que va a pasar de verdad

### "No me interesa" *(en los primeros 10 segundos)*

No es una decisión, es un reflejo. No insistas con la oferta:

> — Lo entiendo, y no te llamo para venderte nada hoy. Una sola cosa y te dejo:
> ¿sabías que tu web sale como **"No es segura"** cuando alguien entra desde el
> móvil? Te mando el informe y lo miras cuando puedas. ¿Te lo mando a **[correo]**?

Has convertido una negativa en un correo aceptado y en un contacto vivo en el CRM.

### "Mándame información"

Suele significar "cuelga". Se contesta al revés:

> — Te la mando, pero son doce páginas y no vas a leerlas — no las leería yo
> tampoco. Al revés: **veinte minutos y te lo cuento en cinco.** ¿Mañana a las 10?

Si insiste, se manda **y se agenda el seguimiento a 3 días en el CRM**. Nunca se
manda y se olvida.

### "Ya tengo a alguien" / "me la lleva mi sobrino"

**Jamás ataques al proveedor actual.** Estás insultando a su familia o a su
criterio. Se hace lo contrario:

> — Genial, entonces esto le sirve a él. ¿Le has pedido alguna vez el informe de
> velocidad y de posición? Te lo mando y se lo pasas. Si está todo bien, has
> perdido dos minutos; y si no, ya sabes qué pedirle.

Le regalas munición. Un tercio de esos vuelven solos en unas semanas.

### "¿Cuánto cuesta?" *(en el primer minuto)*

Muy buena señal. **Se dice el precio**, siempre:

> — Depende de lo que haga falta y no te voy a mentir sin ver tu caso. El rango:
> una web con posicionamiento, entre **2.500 y 3.000**; y el mantenimiento mensual
> **desde 390**. Si eso se te va del presupuesto dímelo ahora y no te hago perder
> el tiempo.

Esa última frase filtra, y además es lo que más credibilidad da de toda la llamada.

### "¿De dónde has sacado mi teléfono?"

> — Del que tenéis publicado en vuestra web y en Google. Si prefieres que no
> volvamos a llamar, te doy de baja ahora mismo y no vuelves a saber de nosotros.

Y se hace de verdad, en el momento, en `OptOut`. Sin excepciones.

### "¿Esto es un robot?"

Hoy no lo es, así que se dice: *"No, soy [nombre], estoy en Valencia."* El día que
llame el agente, **hay que decirlo de entrada** — artículo 50, sección 5.

### "Ahora no puedo"

> — Sin problema. ¿Te llamo mañana a esta hora, o prefieres que te mande el
> informe y me dices tú?

---

## 5. Lo que no se dice nunca

| ❌ | Por qué |
|---|---|
| "Somos una agencia de marketing digital" | Cuelgan. Reciben cinco de estas al mes |
| "Queremos mejorar vuestra presencia online" | No significa nada |
| "Vuestra web está muy mal" | La hizo él, o su sobrino. Se dice **qué** falla, no que sea mala |
| "Estás perdiendo X euros al mes" | Cifra inventada, y él lo sabe |
| "¿Cómo estás?" al descolgar | Marca de telemarketing en el segundo uno |
| "Core Web Vitals", "schema", "RAG" | Todo se traduce a consecuencia: *"tarda mucho y Google lo penaliza"* |
| Hablar más de 30 segundos seguidos | Si no ha hablado el otro, no hay llamada |

---

## 6. Cuándo llamar

| Sector | Mejor franja | Por qué |
|---|---|---|
| Concesionarios | 10:00 – 13:00 y 16:30 – 19:00 | Fuera de la hora punta de visitas |
| **Reformas y obra** | **8:00 – 9:00** y **18:00 – 19:30** | Durante el día están en obra y no cogen |
| Hostelería | **10:00 – 12:00** | Nunca en servicio de comidas ni cenas |
| Interiorismo, rotulación | 10:00 – 13:30 y 16:00 – 18:00 | Horario de oficina normal |

Martes, miércoles y jueves. **Nunca lunes por la mañana ni viernes por la tarde.**
Tres intentos por negocio, en días y franjas distintas, y después se archiva.

---

## 7. Lo legal, en dos párrafos

**Se puede llamar.** El artículo 66.1.b) de la Ley 11/2022 exige consentimiento
**u otra base del RGPD**, y la [Circular 1/2023 de la AEPD](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-15071)
reconoce el **interés legítimo** como base válida. Además establece una presunción
de licitud, por el artículo 19 de la LOPDGDD, cuando se llama a **personas de
contacto de una empresa, a autónomos y a profesionales** en su actividad
profesional. Es exactamente nuestro caso: teléfono publicado por la propia empresa
en su web, contactada como empresa, con una oferta pertinente a su actividad.

**Lo que hay que cumplir, y es poco:** identificarse y decir en nombre de quién se
llama desde el primer segundo; decir de dónde salió el teléfono si lo preguntan;
atender la oposición **en el acto** y dejarla registrada en `OptOut`; contrastar
contra la Lista Robinson; y guardar el registro de cada llamada. Todo eso ya lo
hace la plataforma salvo el cruce con Robinson.

🔴 **Y desde el 2 de agosto de 2026**, cuando llame el agente, hay que decir que
es una IA — artículo 50 del Reglamento (UE) 2024/1689. Ya está construido
(`voice/compliance.ts:106` y `:134`), pero en inglés.

> *Esto no es asesoramiento legal. Antes de subir el volumen, que lo mire un
> abogado de protección de datos: es barato y se hace una vez.*

---

## 8. Qué preparar antes de la primera llamada

| | Qué | Tiempo |
|---|---|---|
| 1 | Sacar 500 concesionarios y reformas de Valencia con Prospect Finder | automático |
| 2 | Auditarlos y quedarse con los ~200 con problema real | automático |
| 3 | Mandar el informe por correo a los ~140 con email | automático |
| 4 | **Esperar 48 h** y ordenar la lista: primero los que abrieron | — |
| 5 | Llamar a los 10 clientes actuales por el artículo 50 | 1 tarde |
| 6 | Imprimir la sección 3 y tenerla delante | 5 min |
| 7 | Grabarte las 10 primeras llamadas y escucharlas | 1 h |

El punto 7 es el que más rinde de la lista y el que todo el mundo se salta.

---

## 9. Lo que hay que quedarse

**A quién:** a los que ya abrieron tu informe, de concesionarios y reformas de
Valencia, con un problema que la auditoría ha medido. Y el lunes, a los diez
clientes que SprintMarkt ya tiene.

**Qué:** veinte minutos. Nada más. La web y el mensual se venden en la reunión, y
el mensual de 390 € es el que construye el negocio, no el proyecto de 2.500 €.

**Cómo:** permiso en el segundo diez, un dato medido de **su** web en el treinta,
silencio, dos preguntas —la segunda hace la cuenta con **su** cifra—, y dos huecos
concretos de agenda. Dos minutos y medio.

Y lo único que hay que hacer bien desde el primer día: **grabarse y escucharse.**
El guion de arriba es un punto de partida decente; el bueno lo escriben las
primeras cincuenta llamadas.
