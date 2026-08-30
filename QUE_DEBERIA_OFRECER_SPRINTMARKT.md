# SprintMarkt — Qué debería ofrecer, teniendo Vendrava detrás

Investigación cruzada entre lo que la agencia vende hoy en `sprintmarkt.com` y lo
que la plataforma es capaz de hacer hoy según el código.

Fecha: 17 de agosto de 2026. Cambio: 1 € = 1,09 $.

> **Cómo leer esto.** Hay dos niveles distintos y no hay que mezclarlos:
> lo que sale de la **web pública** es "lo que decimos que vendemos", y lo que
> sale del **código** es "lo que se puede entregar mañana". Cada afirmación de
> este documento está marcada con su origen. Las verificadas contra código
> remiten a [ESTADO_PRODUCTO.md](ESTADO_PRODUCTO.md), que es la auditoría real.

> **Nota de nombre.** En [ESCENARIOS_INVERSION_SPRITMARK.md](ESCENARIOS_INVERSION_SPRITMARK.md),
> [LISTAS_Y_COSTE_LLAMADAS.md](LISTAS_Y_COSTE_LLAMADAS.md) y el resto de documentos
> de captación la marca aparece como **"Spritmark"**. La marca real, la del
> dominio, la web y el registro de llamada, es **"SprintMarkt"**. Hay que unificarlo
> antes de imprimir una sola propuesta o registrar el CNAM del número americano —
> un nombre mal escrito en la pantalla del que recibe la llamada es una llamada
> perdida.

---

## 1. El diagnóstico en una tabla

Esto es todo el documento resumido. Lo demás es el detalle.

| | Lo que vende SprintMarkt hoy | Lo que puede entregar Vendrava hoy |
|---|---|---|
| Webs y tiendas | ✅ Es el grueso del catálogo | ✅ Landings y funnels con variantes y A/B |
| Apps móviles, ERP, LLM propio | ✅ En el catálogo, desde 12.000 € | ❌ No tiene nada que ver con la plataforma |
| Chatbots y RAG | ✅ Desde 4.500 € | 🟡 Sugerencia de respuesta en bandeja, no RAG |
| Marketing mensual | ✅ 500 – 900 €/mes | ✅ Contenido, redes, email, anuncios, informes |
| **Agente de voz al teléfono** | ❌ **No aparece en ninguna página** | ✅ **Construido y probado, en inglés** |
| **Respuesta en 60 segundos al formulario** | ❌ No se menciona | ✅ Es el núcleo del producto |
| **Prospección B2B por sector y ciudad** | ❌ No se vende | ✅ Prospect Finder con puntuación |
| **Auditoría web automática con informe público** | 🟡 Herramienta gratuita suelta | ✅ Motor completo + link compartible |
| **Correo frío investigado y personalizado** | ❌ No se vende | ✅ Investiga, escribe 3, juzga y pule |
| **Campañas de Meta creadas y publicadas solas** | 🟡 Se vende como gestión manual | ✅ Campaña + adset + creatividad + anuncio |
| **CRM, pipeline, bandeja omnicanal** | ❌ No se vende | ✅ Funciona, multi-tenant, con RBAC |

**La conclusión que sale de mirar la columna de la derecha:** las siete filas en
negrita son capacidades construidas, pagadas y funcionando **que no aparecen en
ninguna página de la web**. No hay que construir un producto nuevo. Hay que
ponerle precio a lo que ya existe.

Y la de mirar la columna de la izquierda: el catálogo actual es casi todo
**trabajo por proyecto**. Se cobra una vez, se entrega con horas, y el mes
siguiente se empieza de cero.

---

## 2. Qué vende SprintMarkt hoy, exactamente

*Fuente: `sprintmarkt.com/en/`, sus páginas de servicios, portfolio y "about",
consultadas el 17/08/2026.*

### 2.1 · El catálogo y sus precios

| Servicio | Precio publicado |
|---|---|
| Landing page | 1.200 – 1.800 € |
| Web corporativa | ~3.000 € |
| Comercio electrónico | 6.000 – 6.500 € |
| Aplicación web | 10.000 €+ |
| App móvil | 12.000 €+ |
| Chatbot con IA | 3.000 €+ |
| RAG / base de conocimiento | 4.500 €+ |
| Automatización con IA | 6.000 €+ |
| Entrenamiento de LLM propio | 12.000 €+ |
| Sesión de diagnóstico (3 h) | 750 € |
| **SEO básico** | **500 €/mes** |
| **Estrategia multicanal completa** | **900 €/mes** |

### 2.2 · Los números que publica

14 proyectos completados (11 en producción) · 10+ clientes activos · desde 2019 ·
25+ tecnologías · fundador único (Carlos Zamudio) con colaboradores por proyecto ·
Valencia, España · mercado declarado: España y Latinoamérica.

### 2.3 · Los tres problemas estructurales

**1. Solo dos líneas del catálogo son recurrentes**, y son las dos más baratas.
Todo lo demás se cobra una vez. Con 10 clientes activos y el mensual más común
en torno a 500-900 €, el suelo recurrente está en el entorno de los **5.000-9.000 €
al mes**, y el resto de la facturación hay que volver a venderla cada mes.

**2. El catálogo está ordenado por tecnología, no por problema.** "RAG desde
4.500 €" le dice algo a un CTO y nada a un dueño de taller. La página de IA lista
ocho tecnologías; ninguna dice qué gana el negocio que la compra.

**3. La plataforma propia no aparece por ningún lado.** La web presenta como
productos propios *Zona de Ligas* y *Derechgo*. Vendrava — que es el único
producto que puede sostener una línea recurrente de verdad — no se menciona.
Se está vendiendo la agencia sin enseñar el activo.

> **El detalle que más duele:** la web ya tiene un *website analyzer* entre sus
> herramientas gratuitas. Detrás hay un motor de auditoría real
> (`seoAgency.service.ts`, `digitalAudit.service.ts`, con Core Web Vitals de
> PageSpeed y correo extraído de la propia web del negocio). Ese motor es
> exactamente la máquina de captación que describen los documentos de inversión —
> y hoy está puesta en la web como juguete gratuito que no lleva a ningún sitio.

---

## 3. La decisión que va antes que el catálogo: qué mercado

Los tres documentos de inversión están escritos al 100 % para la **costa Este de
Estados Unidos**. La web está escrita para **España y Latinoamérica**. Son dos
negocios distintos con dos catálogos distintos, y hay que decidir si se hacen los
dos o uno.

| | España / LatAm | EE. UU. costa Este |
|---|---|---|
| Marca y prueba social | ✅ Ya existe, 7 años, casos reales | ❌ Cero prueba local |
| Precio de una web | 700 – 1.500 € | **3.000 – 8.000 $** |
| Mensual de posicionamiento | 250 – 500 € | **1.000 – 3.000 $** |
| **Agente de voz** | 🔴 **No se puede vender** | ✅ **Se puede vender mañana** |
| Listas de contactos | Sin registros públicos equivalentes | 6 de 8 sectores, **gratis** |
| Horario de trabajo | El tuyo | 15:00 – 23:00 hora española |
| Cumplimiento | RGPD + LGT 66.1.b + **Reglamento IA art. 50** | TCPA + estatales |

**El punto rojo es el que decide.** El 11/08/2026 se cerró que **el producto de
voz es solo en inglés** ([ESTADO_PRODUCTO.md §4.1](ESTADO_PRODUCTO.md)): Cartesia
Ink-2 con turnos automáticos no soporta español, y el prompt del CRM ya llega al
motor con esa premisa. Eso significa, sin rodeos:

> En España, hoy, **no se puede vender el agente de voz**. Ni con un cliente
> comprensivo. Es la mitad del argumento de venta y no existe en el idioma del
> mercado local.

Eso no invalida el mercado español — invalida **una** oferta dentro de él. En
España queda todo lo demás: respuesta instantánea por WhatsApp y correo,
prospección, auditoría, anuncios, contenido, CRM. Simplemente el "te llamamos en
60 segundos" se convierte en "te escribimos en 60 segundos", que vende menos pero
vende.

### La recomendación sobre mercado

**Los dos, pero con catálogos separados y sin mezclar la web.**

- **España/LatAm** — es donde está la marca, los clientes y el flujo actual. Se
  monetiza convirtiendo los 10 clientes actuales de proyecto a recurrente. No
  requiere inversión nueva.
- **EE. UU. costa Este** — es donde el mismo trabajo vale 3-5 veces más y donde
  el agente de voz sí es producto. Es el plan de
  [PROPUESTA_DUENO_SPRITMARK.md](PROPUESTA_DUENO_SPRITMARK.md) y se sostiene con
  800 €.

⚠️ **Lo que no puede pasar es que un techador de Georgia aterrice en
`sprintmarkt.com/en/`.** Hoy esa página dice "AI agency Valencia", enseña una
dirección en la avenida General Avilés y un portfolio de una cervecería
valenciana, una pastelería y un pub crawl. Para el mercado local es prueba
social; para un contratista americano es exactamente la señal de "esto no es para
mí". **La oferta americana necesita su propia página de aterrizaje**, con casos
del sector, precios en dólares y un número americano — no la home traducida.

---

## 4. El catálogo que debería ofrecer

Seis ofertas. Están ordenadas por **horas de entrega que consumen**, de menos a
más, y esa es la razón del orden.

### 4.0 · Por qué ese orden y no otro

[ESCENARIOS_INVERSION_SPRITMARK.md §1](ESCENARIOS_INVERSION_SPRITMARK.md) lo dice
en su primera línea y es la conclusión más importante de los tres documentos:
**el freno no es el presupuesto, es la capacidad de entrega.** Una persona sola
saca 2-3 webs al mes y sostiene 8-10 clientes activos.

Pero ese techo solo aplica a las ofertas que se entregan con horas. Las que se
entregan con software no tienen techo:

| Oferta | Horas de entrega al mes, por cliente | Techo con 160 h útiles |
|---|---|---|
| Marca blanca de la plataforma | 1 – 2 h | **~80 cuentas** |
| Motor de respuesta (speed-to-lead) | 0,5 – 1 h | **~60 clientes** |
| Captación gestionada | 4 – 8 h | ~20 clientes |
| Web + SEO mensual | 6 – 10 h *(+30 h de alta)* | **~10 clientes** |
| Proyecto de IA a medida | 60 – 120 h, una vez | 1 – 2 al mes |
| App móvil / ERP | 150 – 300 h, una vez | **Bloquea el mes entero** |

Léase de abajo arriba: **cada app móvil de 12.000 € cuesta un mes de no montar la
máquina.** No es que sea mala venta — es que es la venta que impide construir el
negocio recurrente. Ese es el argumento entero de esta sección.

---

### 4.1 · Motor de respuesta — la oferta insignia

**Qué es:** cuando alguien rellena el formulario del cliente, el sistema le
contesta en menos de 60 segundos. En EE. UU., con una llamada de voz real. En
España, con WhatsApp y correo, y aviso al comercial.

**Por qué esta va primera:** no tiene coste de entrega. Se conecta a su
formulario y funciona. Es literalmente el punto 3 de la sección 9 de
[ESCENARIOS_INVERSION_SPRITMARK.md](ESCENARIOS_INVERSION_SPRITMARK.md): *"puedes
vender 100 y no trabajar ni una hora más"*.

| | España | EE. UU. |
|---|---|---|
| Alta | 900 € | 1.500 $ |
| Mensual | **390 €** | **1.200 $** |
| Coste real de servir | ~10 €/mes | ~40 $/mes |
| Canal | WhatsApp + correo + ficha en CRM | **Llamada de voz** + los anteriores |

**El argumento de venta, que ya está probado:** llamar en el primer minuto
multiplica por 8 el cierre frente a llamar a la hora. El negocio local lo sufre
todos los días y sabe cuánto le cuesta.

**Y el remate que ninguna agencia puede copiar:** en el propio correo de venta se
ofrece *"¿quieres oírlo? deja tu número y nuestra IA te llama en un minuto"*. El
prospecto recibe la demostración con él dentro. Eso no se explica en una reunión,
se vive.

⚠️ Requiere el worker y Redis corriendo. Sin ellos, `enqueueLeadCall` devuelve
`false` **en silencio** y la API sigue diciendo que todo está sano
([ESTADO_PRODUCTO.md §4.3](ESTADO_PRODUCTO.md)). Es la primera cosa a arreglar de
la sección 6.

---

### 4.2 · Marca blanca para otras agencias

**Qué es:** otra agencia pequeña vende, y SprintMarkt pone el motor por detrás.
Ellos ponen la cara y el cliente; nosotros la plataforma.

**Por qué es la segunda:** coste de captación **cero** hasta que venden, y no
tiene techo de reuniones ([ESCENARIOS §2.6](ESCENARIOS_INVERSION_SPRITMARK.md)).
Una agencia que revende trae 3-8 cuentas de golpe, no una.

| | |
|---|---|
| Precio | **300 – 600 €/mes por cuenta**, o 20 % de lo que facturen |
| A quién | Agencias de 1-5 personas que hoy tardan 6 semanas en entregar una web |
| Qué les vendes | Que entreguen en días lo que hoy les cuesta seis semanas |
| Coste de entrega | 1-2 h/mes de soporte por cuenta |

🔴 **El límite real, y hay que decirlo:** no existe alta self-service. No hay
`/register`, ni recuperación de contraseña, ni creación de organización por
código ([ESTADO_PRODUCTO.md §4.2](ESTADO_PRODUCTO.md)). Cada cuenta se da de alta
a mano por SQL, y sus credenciales se cargan una a una. **Se puede vender marca
blanca gestionada; no se puede vender un SaaS.** Techo práctico hasta que eso se
construya: **10-12 cuentas**.

---

### 4.3 · Auditoría digital — el imán, y el primer cobro

**Qué es:** la auditoría automática de la web de un negocio (SSL, robots,
sitemap, Core Web Vitals reales de PageSpeed, posición, redes) que termina en un
informe compartible por link público.

**Cómo se usa, que es lo que hoy no se hace:**

```
1. La herramienta gratuita de la web genera el informe          → 0 €
2. El informe se entrega por link público, no por PDF           → mide quién lo abre
3. Quien lo abre recibe el correo de seguimiento con sus datos  → 0,004 $
4. Quien contesta, entra en la agenda                           → oferta 4.4 o 4.5
```

Hoy el *website analyzer* está en la web como juguete y no lleva a ninguna parte.
Debería ser la **puerta de entrada de todo el embudo**.

**Y encima se cobra:** la "sesión de diagnóstico" de 750 € que ya está en el
catálogo es exactamente esto con una hora de conversación encima. Hay que
renombrarla a lo que es —*auditoría + hoja de ruta*— y colocarla como el escalón
de pago más barato, el que convierte a un curioso en cliente que ya ha pagado.

---

### 4.4 · Captación gestionada — el producto que nadie más vende

**Qué es:** SprintMarkt no le hace la web al cliente. Le **llena la agenda**. Se
ejecuta la máquina entera para él: Prospect Finder por su sector y su ciudad,
auditoría de cada prospecto, correo frío investigado y personalizado con los
datos reales de la web de cada uno, anuncios, y la llamada al que levanta la mano.

**Por qué es diferenciada de verdad:** el 99 % de las agencias manda *"he visto
vuestra web y creo que podría mejorar"*. Aquí se manda *"vuestra web tarda 6,4
segundos en cargar, Google la marca como deficiente, y estáis en la página 3 para
'reparación de tejados en Tampa'; adjunto el informe"*. A 400 negocios al día.
**Eso no se hace a mano**, y es la razón por la que funciona.

| | |
|---|---|
| Precio | **900 – 1.500 €/mes** + 50-100 € por reunión celebrada |
| Coste real | 0,004 $ por correo · 0,04 $ por intento de llamada |
| Margen | El de [LISTAS_Y_COSTE_LLAMADAS §8](LISTAS_Y_COSTE_LLAMADAS.md): un contacto cualificado cuesta 4 $ y el mercado lo paga a 50-150 $ |
| Riesgo | 🟡 El único con carga legal de verdad. Ver sección 5 |

**A quién vendérselo primero:** a quien ya paga por contactos. Un abogado de
accidentes americano paga 200-500 $ por cada contacto cualificado. Un techador,
50-150 $. Frente a eso, 1.500 $/mes por un flujo constante no es caro — es
barato, y ese es todo el argumento.

---

### 4.5 · Web + posicionamiento + medición — el ticket de entrada

**Qué es:** lo que ya se hace hoy. **Lo que cambia es su papel:** deja de ser el
producto y pasa a ser la puerta por la que entra el cliente al 4.1.

| | España | EE. UU. |
|---|---|---|
| Alta | 2.500 € | **3.500 $** |
| Mensual (SEO, contenido, medición) | 390 € | incluido en los 1.200 $ |

**No bajar de esos suelos.** En EE. UU., cobrar 800 $ por una web no gana el
cliente: hace parecer aficionado o estafa. **3.500 $ es el suelo**, y por debajo
se pierden ventas en vez de ganarlas.

**La regla de oro de esta línea:** ninguna web se vende sin el mensual del 4.1
pegado. Una web sin la máquina detrás es una web más, se compite por precio
contra 50.000 agencias y no deja recurrente. Con la máquina, el mismo trabajo
deja 390-1.200 al mes durante años.

---

### 4.6 · Proyectos de IA a medida — se mantiene, pero se reescribe

**Qué es:** los chatbots, RAG y automatizaciones que ya están en el catálogo, de
3.000 a 12.000 €.

**Por qué se mantiene:** es lo que paga las facturas mientras se construye el
recurrente. No se toca el precio y no se retira.

**Qué hay que cambiar — dos cosas:**

**1. Reescribirlo por problema, no por tecnología.** Nadie compra "RAG desde
4.500 €". Se compra "tu equipo deja de buscar en 400 PDF para contestar a un
cliente". Mismo producto, mismo precio, otra frase.

**2. Retirar "entrenamiento de LLM propio, 12.000 €+" de la portada.** Una
estructura de un fundador con colaboradores no debería encabezar su catálogo con
la línea más difícil de entregar del sector. Que exista bajo demanda, sí. Que sea
argumento de venta público, no — expone a un compromiso que bloquea trimestres.

---

### 4.7 · Y lo que hay que aparcar

| Qué | Por qué |
|---|---|
| **App móvil, 12.000 €+** | 150-300 h. Un proyecto bloquea el mes entero y no deja recurrente |
| **ERP a medida** | Igual, y con soporte eterno detrás |
| **Aplicación web, 10.000 €+** | Solo si el cliente ya existe y paga por adelantado |
| **Entrenamiento de LLM** | Ver 4.6 |

**Esto no es "rechazar dinero".** Es la respuesta de
[ESCENARIOS §9](ESCENARIOS_INVERSION_SPRITMARK.md) a lo que pasa cuando sobra
demanda: *"quédate con las mejores y sube el precio"*. Aceptar un proyecto de 300
horas cuando hay demanda recurrente esperando no es facturar más — es cambiar
recurrente por puntual al peor cambio posible.

---

## 5. Lo legal, que en Europa cambió hace dos semanas

Los tres documentos cubren muy bien EE. UU. (TCPA, FCC, estados). **No cubren
Europa**, y en Europa acaba de moverse el suelo.

### 5.1 · Reglamento de IA, artículo 50 — desde el 2 de agosto de 2026

El artículo 50 del Reglamento (UE) 2024/1689 es **aplicable desde el 2 de agosto
de 2026** — hace quince días. Obliga a que **todo sistema de IA que interactúe
directamente con personas lo comunique**, salvo que sea evidente. Cubre chatbots,
asistentes de voz y agentes. Las sanciones llegan a **15 M € o el 3 % de la
facturación mundial**.

**Esto afecta a SprintMarkt por partida doble:**

🔴 **Como riesgo.** Cada chatbot vendido a un cliente español —y hay una línea
entera del catálogo dedicada a eso— es un sistema en el ámbito del artículo 50.
Si no avisa de que es IA, el problema es del cliente, pero la llamada de teléfono
enfadada es para quien se lo vendió.

🟢 **Como oportunidad, y es de las mejores que hay en este documento.** Es la
excusa perfecta para llamar **a los 10+ clientes activos y a todos los que
alguna vez compraron un chatbot**, con un motivo real y con fecha: *"desde el 2
de agosto tu asistente tiene que declarar que es IA; te lo dejamos conforme".*
Es una revisión de conformidad de 300-600 € por cliente, dos horas de trabajo,
sobre una base que ya confía. **Y es la puerta natural para colocar el 4.1**, que
es de lo que se trata.

El motor ya tiene la pieza construida: el aviso de IA está en
`voice/compliance.ts:106` y la frase completa de apertura en `:134`.

### 5.2 · Llamadas comerciales en España

El artículo 66.1.b) de la Ley 11/2022 General de Telecomunicaciones, aplicable
desde el 29 de junio de 2023, reconoce el derecho a **no recibir llamadas
comerciales no solicitadas**, salvo consentimiento previo u otra base de
legitimación del RGPD (la AEPD lo desarrolla en su Circular 1/2023). Las
sanciones llegan a 100.000 €.

Traducido a producto: **en España la llamada en frío no es el canal**, ni con
voz humana. Un motivo más por el que el catálogo español se apoya en el 4.1 por
WhatsApp y correo, y no en la llamada.

### 5.3 · Lo que hay que arreglar en el código antes de llamar a nadie en EE. UU.

De [MODOS_LEGALES_AGENTE_VOZ.md §4](MODOS_LEGALES_AGENTE_VOZ.md), por orden:

| | Qué | Trabajo |
|---|---|---|
| 1 | **Horario legal de EE. UU.** — el mapa de zonas horarias es de México; hoy se llamaría a California de madrugada | Guardar la zona horaria que ya devuelve Places |
| 2 | `REQUIRE_VOICE_CONSENT=true` | Una variable de entorno |
| 3 | Rellenar el campo `evidence` de `ContactConsent` (texto exacto, versión, fecha, hora, IP) | Rellenar un campo que ya existe |
| 4 | `VOICE_EMOTION_RECOGNITION_ENABLED=false` | Illinois (BIPA): 1.000-5.000 $ por persona, en colectiva |
| 5 | Abogado TCPA americano, una vez | 800 – 2.000 $ |

> *Nada de esto es asesoramiento legal. La normativa de voz IA se mueve cada
> pocos meses en las dos orillas; conviene revisarlo cada seis.*

---

## 6. Qué hay que construir antes de vender nada de esto

No es una lista de deseos. Son las cosas sin las cuales alguna de las seis
ofertas de arriba **no se puede entregar**.

| | Qué | Bloquea a | Fuente |
|---|---|---|---|
| 🔴 1 | **Worker + Redis en producción** | 4.1 entero — sin esto no se despacha ni una llamada, y la API dice que está sana | [ESTADO_PRODUCTO §4.3](ESTADO_PRODUCTO.md) |
| 🔴 2 | **Credenciales**: Twilio → Places → DeepSeek → Resend → Meta | 4.3, 4.4 y 4.5 | [§4.4](ESTADO_PRODUCTO.md) |
| 🔴 3 | **Verificador de correo** | 4.4 — sin él el rebote sube al 8-10 % y los buzones se queman en dos semanas. **4 $ por cada 10.000 correos** | [COMO_CONSEGUIR_CONTACTOS §6](COMO_CONSEGUIR_CONTACTOS_BARATO.md) |
| 🟠 4 | **Horario legal EE. UU. + consentimiento** (5.3) | 4.1 y 4.4 en EE. UU. | [MODOS_LEGALES §4](MODOS_LEGALES_AGENTE_VOZ.md) |
| 🟠 5 | **Limpiar los restos de maqueta** | Todo — hay pantallas con arrays fijos y fechas falsas. No se puede demostrar un producto que enseña datos inventados | [§4.8](ESTADO_PRODUCTO.md) |
| 🟠 6 | **Adivinar el correo del dueño** (5 patrones + verificación) | 4.4 — duplica la tasa de respuesta. 0,002 $ por empresa | [COMO_CONSEGUIR §4](COMO_CONSEGUIR_CONTACTOS_BARATO.md) |
| 🟡 7 | **Tipo de línea (Twilio Lookup)** | Solo el modo 3 de llamada en frío. ~10 líneas de código | [MODOS_LEGALES §3](MODOS_LEGALES_AGENTE_VOZ.md) |
| 🟡 8 | **Alta de organizaciones** | 4.2 por encima de 10-12 cuentas | [§4.2](ESTADO_PRODUCTO.md) |
| 🟡 9 | **Cuotas de consumo** (minutos, tokens, envíos) | 4.2 — hoy un cliente puede dejar llamadas toda la noche y la factura es tuya | [§4.9](ESTADO_PRODUCTO.md) |

**Del 1 al 3 no hay atajo.** Son tres cosas de configuración y una llamada a una
API, y sin ellas no hay ninguna de las seis ofertas. Todo lo demás del código
está construido.

---

## 7. Cómo queda la mezcla de ingresos

Esto es lo que cambia de verdad si se hace lo de arriba.

| | Hoy (estimado de su web) | Objetivo a 12 meses |
|---|---|---|
| Proyectos puntuales | ~80 % | 30 % |
| Recurrente | ~20 % | **70 %** |
| Clientes que consumen horas | Casi todos | ~10 |
| Clientes que no consumen horas | 0 | **30 – 50** |

La aritmética de por qué esto funciona, con el mismo tiempo:

| Escenario | Clientes | Horas/mes | Recurrente/mes |
|---|---|---|---|
| Hoy: 10 clientes de web + mensual | 10 | ~130 h | ~6.500 € |
| **Objetivo: 8 de web + 25 de motor de respuesta + 6 de marca blanca** | **39** | **~125 h** | **~15.000 €** |

Mismas horas. **El doble largo de recurrente.** La diferencia entera está en que
25 de esos clientes se entregan con software y no con horas.

Y añadiendo el frente americano de [PROPUESTA_DUENO_SPRITMARK.md](PROPUESTA_DUENO_SPRITMARK.md)
—20 clientes × 1.200 $ = 24.000 $/mes al salir del mes 6— la cuenta se va a otro
sitio. Pero **primero hay que hacer que funcione con los clientes que ya existen**,
porque ahí no hay que captar a nadie.

---

## 8. Los primeros 30 días

| Semana | Qué | Por qué esa y no otra |
|---|---|---|
| **1** | Worker + Redis + credenciales. Verificar con `/health/workers` | Sin esto no hay producto que vender |
| **1** | Unificar el nombre: **SprintMarkt**, en todo | Antes de imprimir una propuesta |
| **2** | Llamar a los **10 clientes actuales** con la excusa del art. 50 | Ingreso inmediato sobre base que ya confía, y la puerta al motor de respuesta |
| **2** | Reescribir la página de servicios por problema, no por tecnología | No cuesta dinero y cambia quién pide presupuesto |
| **3** | Conectar el *website analyzer* al embudo: informe público → correo → agenda | Convierte un juguete en la puerta de entrada |
| **3** | Verificador de correo + adivinar correo del dueño | Lo más urgente de los tres documentos de contactos |
| **4** | Publicar la oferta **4.1** con precio en la web, España y EE. UU. | Es la oferta insignia y hoy no existe en ninguna página |
| **4** | Página de aterrizaje **separada** para la oferta americana | La home de Valencia no vende a un techador de Georgia |

Nada de esta lista cuesta más de lo que ya está pagado, salvo el abogado TCPA
(800-2.000 $, una vez) y solo si se enciende el frente americano.

---

## 9. Lo que hay que decidir

| Pregunta | Nuestra propuesta |
|---|---|
| ¿España, EE. UU., o los dos? | **Los dos, con catálogos y páginas separadas.** España monetiza lo que ya hay; EE. UU. es donde el mismo trabajo vale 3-5 veces más |
| ¿Cuál es el producto insignia? | **El motor de respuesta (4.1).** Cero coste de entrega, sin techo, y es la única cosa del catálogo que nadie más puede copiar |
| ¿Se siguen vendiendo apps y ERP? | **No como catálogo público.** Bajo demanda y con el precio subido, nunca en portada |
| ¿Se vende Vendrava como SaaS? | **No todavía.** Marca blanca gestionada, techo de 10-12 cuentas, hasta que exista alta self-service |
| ¿Qué se hace con el *website analyzer*? | **Dejar de regalarlo suelto.** Es la boca del embudo, no una curiosidad |
| ¿Qué se hace esta semana con los 10 clientes? | **Llamarlos por el artículo 50.** Motivo real, con fecha, y abre la venta del 4.1 |
| ¿Cuánto dinero hace falta? | **Cero para España.** 800 € para encender EE. UU., más 800-2.000 $ de abogado antes de la primera llamada |

---

## 10. Lo que hay que quedarse

**SprintMarkt vende hoy horas de una persona, y es dueña de una máquina que
puede vender resultados sin horas.** El catálogo no menciona el agente de voz, ni
la respuesta en 60 segundos, ni la prospección, ni las campañas que se publican
solas — siete capacidades construidas, probadas y pagadas que no aparecen en
ninguna página.

No hay que construir un producto. Hay que **arrancar el worker, rellenar cinco
credenciales, ponerle precio a lo que ya existe y dejar de aceptar proyectos de
300 horas que bloquean el mes**.

Y el orden importa: primero los clientes que ya se tienen —con el artículo 50
como excusa real y con fecha—, después la máquina de captación, y solo entonces
el frente americano. Al revés se gasta dinero en generar demanda que no se puede
atender, que es exactamente contra lo que avisa
[ESCENARIOS_INVERSION_SPRITMARK.md](ESCENARIOS_INVERSION_SPRITMARK.md) en su
primera página.
