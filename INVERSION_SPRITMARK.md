# Spritmark: en qué se gasta cada euro y cuánto vuelve

Documento de dinero. El plan de captación está en
[CAPTACION_CLIENTES_SPRITMARK.md](CAPTACION_CLIENTES_SPRITMARK.md); aquí solo
están los números.

Mercado: EEUU (costa Este) y Canadá. Todo en inglés.
Cambio usado: **1 € = 1,09 $**. Precios de agosto de 2026 — confírmalos antes de
pagar, algunos suben cada año.

---

## 1. Las tres reglas del dinero

**Regla 1 — Los 800 € no son el presupuesto. Son el puente hasta el primer cliente.**
Un cliente americano paga 3.500 $ solo por empezar. Eso son 4 veces los 800 €.
En cuanto entra el primero, el dinero deja de ser el problema.

**Regla 2 — De todo lo que entre: 20 % vuelve a captar, 30 % a poder entregarlo, 50 % para ti.**
El 30 % de entrega no es opcional. Es el error que hunde a las agencias: venden
más de lo que pueden hacer, entregan tarde y mal, y los clientes se van al tercer
mes. Ver punto 7.

**Regla 3 — No se sube el gasto de captación hasta que el anterior demuestre que funciona.**
Cada aumento tiene una condición escrita en el punto 6. Si no se cumple, no se
gasta. Gastar más en un mensaje que no funciona solo hace que falle más rápido.

---

## 2. Los 800 € iniciales, línea por línea

### Bloque A — El canal principal: correo frío · **258 €**

| Qué | Proveedor típico | Precio | 3 meses |
|---|---|---|---|
| 4 dominios `.com` parecidos al tuyo | Cloudflare, Namecheap | 11 $/año cada uno | 44 $ · **40 €** |
| 12 buzones de correo con calentamiento incluido | Mailreef, Maildoso, Zapmail | 2,50 $/buzón/mes | 90 $ · **83 €** |
| Secuenciador con rotación de buzones | Smartlead plan básico | 37 $/mes | 111 $ · **102 €** |
| Dirección postal en EEUU | Anytime Mailbox | 12 $/mes | 36 $ · **33 €** |
| | | | **281 $ · 258 €** |

**Dos formas de recortar aquí si quieres empezar más barato:**

- **El secuenciador (102 €) te lo puedes ahorrar.** Tu programa ya escribe y
  manda los correos; lo único que le falta es repartir los envíos entre los 12
  buzones y respetar los topes diarios. Son un par de días de trabajo tuyo.
  Págalo el primer mes y prográmalo mientras, o prográmalo ya y ahorra los 102 €.
- **La dirección de EEUU (33 €) puede esperar.** La ley solo exige *una* dirección
  postal válida en el pie del correo — tu dirección española cumple. La americana
  es cuestión de confianza, no de legalidad. Cómprala cuando cierres el primero.

Si haces las dos cosas, el Bloque A se queda en **123 €** y te sobran 135 € para
más buzones.

### Bloque B — Encender el programa · **236 €**

| Qué | Para qué | Precio | 3 meses |
|---|---|---|---|
| Railway (servidor + motor de fondo + Redis) | Que las llamadas y los correos se disparen solos | ~15 $/mes | 45 $ · **41 €** |
| DeepSeek | Investiga cada negocio y escribe los correos | ~11 $/mes | 33 $ · **30 €** |
| Google Places | El buscador de negocios por sector y ciudad | ~10 $/mes | 30 $ · **28 €** |
| Brave Search | Investigación previa a cada correo | 5 $/mes | 15 $ · **14 €** |
| Cartesia | El **oído** del agente (entiende lo que le dicen) | pago por uso | 30 $ · **28 €** |
| Cerebras | El **cerebro** del agente durante la llamada | pago por uso | 15 $ · **14 €** |
| MiniMax | La **voz** del agente | pago por uso | 20 $ · **18 €** |
| Twilio | Número americano + minutos de llamada | 1,15 $/mes + 0,018 $/min | 35 $ · **32 €** |
| OpenAI | Imágenes para los anuncios | pago por uso | 15 $ · **14 €** |
| PageSpeed (Google) | La auditoría real de velocidad | gratis | 0 € |
| | | | **~238 $ · 236 €** |

⚠️ **Cartesia tiene un plan de pago de 49 $/mes.** Con 150 llamadas al mes te vale
el pago por uso. Si pasas de 500 llamadas al mes, el plan sale más barato — pero
eso es un problema del mes 4, no de ahora.

> **Lo barato que sale tu propia máquina:** las herramientas comerciales que hacen
> esto mismo (Apollo para listas, Semrush para auditar, Instantly para enviar,
> Bland o Air para llamar) cuestan entre **400 y 700 $ al mes**. Tú lo tienes todo
> por 80 $/mes porque el programa es tuyo. **Eso es 1.500-2.000 $ ahorrados en los
> 3 primeros meses**, y es la razón por la que 800 € te dan para esto.

### Bloque C — Anuncios de perseguimiento · **120 €**

Solo a quien ya ha entrado en tu web o ha abierto tu informe. 2-5 $ por clic en
vez de los 15-40 $ que cuesta en frío.

**No lo enciendas hasta la semana 4**, cuando ya haya gente a la que perseguir.

### Bloque D — Reserva · **186 €**

No es dinero sobrante. Es dinero **con una decisión pendiente**: en la semana 4
sabrás qué está funcionando y ahí lo metes. Ver punto 6.

### Resumen

| Bloque | € |
|---|---|
| A · Correo frío | 258 € |
| B · Encender el programa | 236 € |
| C · Retargeting | 120 € |
| D · Reserva | 186 € |
| **Total** | **800 €** |

---

## 3. Lo que cuesta *servir* a un cliente (el gasto que nadie cuenta)

Captarlo es la mitad. Luego hay que hacerle la web y mantenerle el servicio.

| Concepto | Cuándo | Coste |
|---|---|---|
| Hacerle la web | Una vez, al firmar | **500 – 800 $** si lo subcontratas · 0 $ + 2 días si la haces tú |
| Alojamiento de su web | Cada mes | 10 $ |
| Contenido SEO mensual | Cada mes | 2 $ de IA + 1 h tuya de revisión |
| El sistema de llamadas funcionando | Cada mes | 20 – 30 $ (minutos + voz) |
| **Total por cliente** | | **~600 $ una vez + ~40 $/mes** |

**El margen:**

| | Cobras | Cuesta | Te queda |
|---|---|---|---|
| Entrada | 3.500 $ | 600 $ | **2.900 $** |
| Cada mes | 1.200 $ | 40 $ | **1.160 $** (97 %) |

Ese 97 % de margen mensual es lo que hace que este negocio funcione, y viene
directamente de que la máquina es tuya y no pagas licencias a nadie.

---

## 4. Mes a mes: qué entra, qué sale, qué queda

**Supuestos** (conservadores tirando a optimistas, escenarios peores en el punto 8):

- Precio medio: **3.500 $ de entrada + 1.200 $/mes**
- El mensual empieza **al mes siguiente** de firmar
- Mes 1 sin ingresos: son las 3 semanas de calentar buzones + montarlo todo
- Bajas: 5 % al mes a partir del mes 4 (ya descontado)

| Mes | Clientes nuevos | Clientes activos | **Entra** | Captación | Entrega | **Te queda** |
|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 0 $ | *(los 800 € iniciales)* | 0 $ | –870 $ |
| 2 | 2 | 2 | **7.000 $** | 1.400 $ | 1.200 $ | **4.400 $** |
| 3 | 3 | 5 | **12.900 $** | 2.580 $ | 1.880 $ | **8.440 $** |
| 4 | 4 | 9 | **20.000 $** | 4.000 $ | 2.600 $ | **13.400 $** |
| 5 | 5 | 14 | **28.300 $** | 5.660 $ | 5.160 $ | **17.480 $** |
| 6 | 6 | 20 | **37.800 $** | 7.560 $ | 5.960 $ | **24.280 $** |
| **Total** | **20** | | **106.000 $** | **21.200 $** | **16.800 $** | **68.000 $** |

**Y lo importante no es el total, es cómo sales del mes 6:**

> 20 clientes × 1.200 $/mes = **24.000 $ al mes recurrentes**
> = **288.000 $ al año** que se repiten sin volver a vender nada.

**Cuándo recuperas los 800 €:** con el **primer cliente**, previsiblemente en el
mes 2. 3.500 $ de entrada contra 870 $ invertidos. A partir de ahí todo lo demás
es beneficio o reinversión.

---

## 5. La regla de reinversión, en números

De cada 100 $ que entren:

| | % | Para qué |
|---|---|---|
| **Captar** | 20 $ | Más buzones, más listas, quien conteste los correos |
| **Entregar** | 30 $ | Quien haga las webs y lleve a los clientes |
| **Para ti** | 50 $ | Tu sueldo, impuestos y colchón |

Aplicado a los 6 meses: **21.200 $ a captar, 16.800 $ a entregar, 68.000 $ para ti.**

⚠️ **Del 50 % tuyo, aparta un tercio para impuestos.** No es tu dinero todavía.

---

## 6. En qué gastar cuando entre dinero, por orden estricto

Cada punto tiene una **condición**. Si no se cumple, no se gasta y se pasa al
siguiente. Esto evita el error clásico: subir el volumen de un mensaje que no
convence a nadie.

### 1️⃣ Más buzones: de 12 a 30 · **+230 $/mes** · *desde el mes 2*
**Condición: que más del 2 % de los correos reciban respuesta.**
Pasas de 420 a 1.000 correos al día. Si respondes al 2 %, son 20 respuestas
diarias. **Es la palanca más rentable de toda la lista** — el mismo mensaje,
tres veces más gente. Pero solo si el mensaje ya funciona; si no, triplicas el
silencio.

### 2️⃣ Alguien que conteste los correos · **1.500 – 2.500 $/mes** · *mes 3-4*
**Condición: más de 30 respuestas al mes que no puedes atender el mismo día.**
Un *appointment setter* con inglés nativo o casi (Filipinas, Sudáfrica,
Latinoamérica). Contesta, califica y te llena la agenda; tú solo apareces en la
reunión. También se puede pagar a comisión: 100-200 $ por reunión celebrada, que
es mejor al principio porque solo pagas si trae.

**Por qué es el segundo gasto y no el quinto:** en EEUU responder en menos de 1
hora duplica el cierre. Si contestas al día siguiente porque estabas en otra
cosa, pierdes la mitad de lo que ya has pagado por conseguir.

### 3️⃣ Quien haga las webs · **600 – 800 $ por web**, luego **2.500 $/mes** · *mes 3-4*
**Condición: más de 2 webs al mes.**
Empieza pagando por web a un freelance. Cuando pases de 4 al mes, sale más
barato tener a alguien fijo. Este es el gasto que **evita que se te caiga el
negocio por detrás** mientras vendes por delante.

### 4️⃣ Vídeo-auditorías a destajo · **500 – 800 $/mes** · *mes 4*
**Condición: que los vídeos que hiciste tú convirtieran por encima del 10 %.**
Un asistente que grabe 10 vídeos al día siguiendo tu guion, para los que abrieron
el informe dos veces y no contestaron.

### 5️⃣ Mejores datos de contacto · **100 – 300 $/mes** · *mes 4-5*
**Condición: que se te hayan acabado los sectores y ciudades buenos.**
Apollo, Clay o similar, para llegar al dueño directamente en vez de al
`info@`. No lo necesitas antes: entre techadores, HVAC, dentistas y clínicas
estéticas de la costa Este tienes decenas de miles de negocios.

### 6️⃣ Google Ads en frío · **1.000 – 2.000 $/mes** · *mes 5-6*
**Condición: saber ya cuánto vale un cliente y que aguante 400 $ de coste de captación.**
Ahora sí se puede: pagando 25 $ por clic y cerrando 1 de cada 20 contactos, un
cliente te sale por 400-600 $ — que contra 3.500 $ de entrada es un negocio
redondo. **Pero no antes**, porque hasta que no tengas 10 clientes no sabes de
verdad tu tasa de cierre y estarías apostando a ciegas.

### 7️⃣ Sociedad americana (LLC) · **600 – 1.000 $ una vez** · *mes 5-6*
**Condición: pasar de 10 clientes.**
Facilita el cobro, la confianza y los impuestos. Antes de 10 clientes es
papeleo que no te compra nada — Stripe cobra perfectamente desde España.

---

## 7. El cuello de botella real no es captar. Es entregar.

Mira otra vez la tabla del punto 4. En el mes 5 tienes que hacer **5 webs nuevas**
y mantener **14 clientes** a la vez. Tú solo, eso son 70 horas a la semana y la
calidad se hunde.

**Lo que pasa si no lo resuelves:** entregas tarde, el cliente se queja, se va al
tercer mes, y en vez de 288.000 $ recurrentes tienes una rueda de hámster donde
cada cliente nuevo sustituye a uno que se fue.

| Mes | Clientes | Qué necesitas |
|---|---|---|
| 1-2 | 0-2 | Tú solo. Sin problema |
| 3-4 | 5-9 | **Freelance de webs pagado por trabajo.** Ya no llegas |
| 5-6 | 14-20 | **Media jornada** que lleve clientes y revise el contenido (1.800 $/mes) |
| 7+ | 20+ | Jornada completa, o dos medias |

**El límite realista de una persona sola es 8-10 clientes.** Los 800 € de este
plan te llevan a los 20 — pero para pasar de 10 hay que gastar en gente. Está en
el 30 % de la regla 2 y ya está contado en la tabla.

---

## 8. Los tres escenarios

### 🟢 El del punto 4 — todo sale bien
20 clientes en 6 meses. **106.000 $** facturados, **68.000 $** para ti, y sales
con 24.000 $/mes recurrentes.

### 🟡 La mitad de bien — el más probable
10 clientes en 6 meses. Cierras 1 de cada 2 de lo previsto.

| | |
|---|---|
| Facturado en 6 meses | **~53.000 $** |
| Para ti | **~34.000 $** |
| Recurrente al salir | **12.000 $/mes = 144.000 $/año** |

**Sigue siendo un negocio excelente.** Y con menos clientes puedes llevarlo casi
solo, así que el gasto en gente baja mucho.

### 🔴 Sale mal — el correo frío no arranca
Cierras 4 clientes en 6 meses.

| | |
|---|---|
| Facturado | **~26.000 $** |
| Invertido | 870 $ + unos 5.000 $ reinvertidos |
| Resultado | **20.000 $ para ti** y 4.800 $/mes recurrentes |

Incluso aquí has multiplicado por 30 los 800 € iniciales.

### ⚫ El desastre total — 0 clientes en 3 meses
Has perdido **800 €** y has aprendido que ese sector, esa ciudad o ese mensaje no
funcionan. Cambias de sector con los mismos buzones y vuelves a probar: la
segunda vuelta cuesta **50 €**, porque toda la infraestructura ya está pagada.

**Ese es el verdadero riesgo máximo de este plan: 800 €.** No hay forma de perder
más, porque todo lo demás se gasta con dinero que ya ha entrado.

---

## 9. En qué NO gastar (y cuánto te ahorras)

| No gastes en | Ahorro | Por qué |
|---|---|---|
| Logo, marca, tu propia web bonita | 1.000 – 3.000 € | A un techador de Florida le da exactamente igual tu logo. Le importa el informe de su web |
| Oficina o coworking | 300 €/mes | Trabajas desde casa |
| LinkedIn Sales Navigator | 99 $/mes | Tus clientes son fontaneros y dentistas. No están en LinkedIn |
| Herramientas "todo en uno" de CRM y marketing | 300 – 800 $/mes | **Ya tienes el programa.** Ese es el punto entero |
| Google Ads en frío antes del mes 5 | 1.500 $ tirados | 25 $ el clic sin saber tu tasa de cierre |
| Ferias y eventos del sector | 2.000 – 4.000 € | Estás en España vendiendo a EEUU |
| Publicidad "de marca" | todo | Nadie conoce a Spritmark y no hace falta que lo conozcan |

**Total que te ahorras respecto a montar esto "como se supone": entre 8.000 y 15.000 € en 6 meses.**

---

## 10. Los números en una línea

| | |
|---|---|
| Se invierte al arrancar | **800 €** (870 $) |
| Riesgo máximo | **800 €** |
| Se recupera con | **el primer cliente**, mes 2 |
| Se reinvierte en 6 meses | **38.000 $** (de dinero ya cobrado) |
| Se factura en 6 meses | **106.000 $** |
| Queda para ti en 6 meses | **68.000 $** |
| Con lo que sales | **24.000 $/mes recurrentes** |
| Escenario probable (mitad) | 53.000 $ facturados · 34.000 $ para ti |

---

## 11. Lo que hay que comprar el lunes

| Orden | Qué | Cuánto | Por qué ya |
|---|---|---|---|
| 1 | 4 dominios + 12 buzones | **123 €** | **Son 3 semanas de calentamiento que no se pueden acelerar con dinero.** Cada día que esperas es un día que el primer cliente llega más tarde |
| 2 | Railway con el motor de fondo activo | **41 €** | Sin esto, las llamadas no salen y el sistema no avisa |
| 3 | DeepSeek + Places + Brave | **72 €** | Sin esto no hay listas ni correos |
| 4 | Twilio: número americano | **32 €** | Hay que reservarlo y registrarlo para que no salga como "Spam Likely" |
| | **Total del lunes** | **268 €** | |

Los otros 532 € se quedan quietos hasta la semana 4, cuando ya sepas qué está
funcionando y en qué merece la pena meterlos.
