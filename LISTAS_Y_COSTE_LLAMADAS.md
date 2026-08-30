# Spritmark — Listas por sector, coste por llamada y de dónde salen los contactos

Cuántas empresas hay en cada sector, qué cuesta cada llamada de verdad, qué
cuesta llamarlos a todos y cómo se consiguen los teléfonos.

Zona: costa Este de EE. UU. Cambio: 1 € = 1,09 $.

---

## 1. Resumen

| | |
|---|---|
| **Coste de una llamada de 3 minutos** | **0,09 $** |
| **Coste medio por intento** (contando los que no descuelgan) | **0,04 $** |
| Empresas llamables en frío, todos los sectores | **29.000** |
| Llamarlas a todas, 3 intentos cada una | **3.500 $** |
| Conseguir los teléfonos de las 115.000 abordables | **1.900 – 9.200 $** según la fuente |
| **Coste total de trabajar el mercado entero** | **6.300 $** haciéndolo bien |

Con **6.300 $** se puede llamar tres veces a **todas** las empresas viables de la
costa Este. El mercado entero cuesta menos que dos clientes.

---

## 2. La lista, sector por sector

De cada 100 empresas de un sector, nos sirven **31**: el 70 % tiene la web mala o
no tiene, y de esas el 45 % tiene tamaño para pagarnos. Y de las que nos sirven,
**una de cada cuatro** tiene fijo de empresa, que es a la única que se puede
llamar en frío ([por qué](MODOS_LEGALES_AGENTE_VOZ.md)).

| Sector | En la zona | Nos sirven | **Llamables en frío** | Meses que da de trabajo* |
|---|---|---|---|---|
| Reformas y contratistas | 96.000 | 30.240 | **7.560** | 11 |
| Talleres de coches | 74.000 | 23.310 | **5.828** | 9 |
| Clínicas dentales | 59.000 | 18.585 | **4.646** | 7 |
| Climatización (HVAC) | 42.000 | 13.230 | **3.308** | 5 |
| Fontanería | 42.000 | 13.230 | **3.308** | 5 |
| Techadores | 35.000 | 11.025 | **2.756** | 4 |
| Abogados de accidentes | 16.000 | 5.040 | **1.260** | 2 |
| Clínicas estéticas | 3.500 | 1.103 | **276** | 0,5 |
| **Total** | **367.500** | **115.763** | **28.942** | **43** |

\* A 2.000 llamadas al mes, con 3 intentos por empresa.

**Un solo sector da entre 4 y 11 meses de trabajo.** No hace falta abrir varios a
la vez, y de hecho conviene no hacerlo: cuanto más estrecho el sector, mejor el
mensaje.

---

## 3. Qué cuesta una llamada, de verdad

### Lo que se paga por minuto

| Concepto | $/minuto |
|---|---|
| Twilio, llamada saliente a EE. UU. | 0,0140 |
| Twilio, transporte del audio en directo | 0,0040 |
| Cartesia — el **oído** del agente | 0,0022 |
| Cerebras — el **cerebro** | 0,0007 |
| MiniMax — la **voz** | 0,0100 |
| **Total** | **0,031 $/minuto** |

### Lo que cuesta cada tipo de llamada

| Qué pasa | Coste |
|---|---|
| No descuelgan | **0,008 $** (solo la detección de contestador) |
| Salta el contestador y colgamos | 0,02 $ |
| **Conversación normal de 3 minutos** | **0,09 $** |
| Conversación larga de 6 minutos (una buena) | 0,19 $ |
| Identificarnos como "Spritmark" en su pantalla | +0,005 $ |

### El número que importa

Solo descuelga el 30 %. Así que el coste real por **intento**, mezclando los que
descuelgan y los que no:

> **0,04 $ por intento.** · **1.000 llamadas = 40 $.**

### Los costes fijos al mes

| Concepto | $/mes | Por qué |
|---|---|---|
| 15 números locales | 17 | Llamar a Tampa desde un número de Tampa **sube el 25 % de descuelgues**. Es la mejora más barata que existe |
| Registro de marca en la llamada | 10 | Que salga "Spritmark" y no "Spam Likely". **Sin esto el descuelgue se hunde** |
| **Total fijo** | **27 $/mes** | |

⚠️ **El registro de marca no es opcional.** Un número americano sin registrar
acaba marcado como spam en pocas semanas y entonces da igual lo bueno que sea el
guion: nadie coge el teléfono.

---

## 4. Qué cuesta llamar a un sector entero

Tres intentos por empresa, a 0,04 $ el intento:

| Sector | Llamables | Llamadas totales | **Coste** |
|---|---|---|---|
| Reformas | 7.560 | 22.680 | **907 $** |
| Talleres | 5.828 | 17.484 | **699 $** |
| Dentistas | 4.646 | 13.938 | **558 $** |
| Climatización | 3.308 | 9.924 | **397 $** |
| Fontanería | 3.308 | 9.924 | **397 $** |
| Techadores | 2.756 | 8.268 | **331 $** |
| Abogados | 1.260 | 3.780 | **151 $** |
| Estéticas | 276 | 828 | **33 $** |
| **Total** | **28.942** | **86.826** | **3.473 $** |

**Llamar tres veces a las 29.000 empresas cuesta 3.473 $.** Un solo cliente paga
eso al firmar, y sobra.

---

## 5. Cómo conseguir los contactos

Cuatro fuentes. La segunda es la buena y casi nadie la usa.

### Fuente 1 · Google Places (nuestro buscador)

| | |
|---|---|
| Coste | **0,025 $ por empresa** con teléfono y web |
| Qué da | Nombre, teléfono, web, dirección, valoraciones, horarios |
| Ventaja | Está dentro del programa. Una consulta y listo |
| Pega | A 100.000 empresas se nota: 2.500 $ |

Hay una cuota gratuita cada mes, así que repartiendo la extracción por meses sale
bastante más barato de lo que parece.

### Fuente 2 · Registros públicos de licencias ⭐ **gratis**

Esta es la que cambia los números.

**En Estados Unidos, techadores, fontaneros, climatización y contratistas están
obligados a tener licencia estatal, y esos registros son públicos.** Cada estado
publica la lista: nombre de la empresa, dirección, teléfono, número de licencia y
fecha de alta.

Lo mismo pasa con:

| Sector | Dónde está la lista | Coste |
|---|---|---|
| Techadores, fontanería, climatización, reformas | Registro de contratistas de cada estado | **0 $** |
| Clínicas dentales | Colegio de dentistas de cada estado | **0 $** |
| Abogados de accidentes | Colegio de abogados de cada estado | **0 $** |
| Talleres | No hay registro útil → Places | 1.850 $ |
| Clínicas estéticas | No hay registro útil → Places | 88 $ |

**Seis de los ocho sectores tienen la lista gratis y pública.** Y son datos
mejores que los de Google: te dan la **fecha de alta de la licencia**, así que
puedes filtrar por empresas que llevan más de 5 años (tienen dinero) o por las que
acaban de darse de alta (necesitan web urgentemente y no tienen ninguna).

> **El truco del sector:** un contratista que sacó la licencia hace 3 meses **no
> tiene web todavía**. Es el cliente más fácil que existe y está identificado con
> nombre y teléfono en una lista pública gratuita que se actualiza sola.

### Fuente 3 · Listas compradas

| | |
|---|---|
| Coste | 0,03 – 0,15 $ por contacto |
| Proveedores | Apollo, Data Axle, ZoomInfo |
| Qué añade | **El nombre y el correo del dueño**, y datos de facturación |
| Cuándo usarla | Solo para el correo, cuando quieras llegar al dueño y no al `info@` |

No hace falta para llamar —el teléfono de la empresa lo tienes gratis—, pero
**duplica la respuesta del correo** porque escribes a una persona con nombre.

### Fuente 4 · Directorios y asociaciones gremiales

Yelp, Yellow Pages, Angi, la Better Business Bureau y los directorios de socios de
las asociaciones del gremio. Gratis, pero hay que extraerlos y sus condiciones de
uso no siempre lo permiten. **Úsalo solo para completar datos**, no como fuente
principal.

---

## 6. El coste total, sector por sector

Todo incluido: conseguir los teléfonos, comprobar cuáles son fijos de empresa
(0,008 $ cada uno) y llamar tres veces.

| Sector | Contactos | Verificar | Llamar | **TOTAL** |
|---|---|---|---|---|
| Reformas | **0 $** *(registro)* | 242 $ | 907 $ | **1.149 $** |
| Talleres | 1.850 $ *(Places)* | 186 $ | 699 $ | **2.735 $** |
| Dentistas | **0 $** *(colegio)* | 149 $ | 558 $ | **707 $** |
| Climatización | **0 $** *(registro)* | 106 $ | 397 $ | **503 $** |
| Fontanería | **0 $** *(registro)* | 106 $ | 397 $ | **503 $** |
| Techadores | **0 $** *(registro)* | 88 $ | 331 $ | **419 $** |
| Abogados | **0 $** *(colegio)* | 40 $ | 151 $ | **191 $** |
| Estéticas | 88 $ *(Places)* | 9 $ | 33 $ | **130 $** |
| **TOTAL** | **1.938 $** | **926 $** | **3.473 $** | **6.337 $** |

**Si se sacara todo de Google Places en vez de los registros públicos: 13.600 $.**
Usar los registros ahorra **7.250 $**.

### Y lo que sale de ahí

Con la conversión de la llamada en frío (un cliente por cada 1.000 llamadas):

| | |
|---|---|
| Llamadas totales | 86.826 |
| **Clientes** | **~87** |
| Coste por cliente | **73 $** |
| Lo que deja cada uno el primer año | 17.900 $ |

Evidentemente no vamos a cerrar 87 clientes —no podríamos entregarlos—, pero el
número enseña dónde está el límite: **no en el dinero.**

---

## 7. Por dónde empezar

| Sector | Ticket | Web mala | Urgencia de responder rápido | Lista gratis | **Orden** |
|---|---|---|---|---|---|
| **Techadores** | 🟢 Altísimo | 🟢 Pésimas | 🟢 Máxima (granizadas) | ✅ | **1º** |
| **Climatización** | 🟢 Alto | 🟢 Malas | 🟢 Máxima (urgencias) | ✅ | **2º** |
| **Clínicas estéticas** | 🟢 Alto | 🟡 Regulares | 🟡 Media | ❌ | **3º** |
| Fontanería | 🟡 Medio | 🟢 Malas | 🟢 Máxima | ✅ | 4º |
| Abogados accidentes | 🟢 Altísimo | 🟡 Regulares | 🟢 Máxima | ✅ | 5º |
| Dentistas | 🟡 Medio | 🟡 Regulares | 🟡 Media | ✅ | 6º |
| Reformas | 🟡 Variable | 🟢 Malas | 🟡 Media | ✅ | 7º |
| Talleres | 🔴 Bajo | 🟢 Malas | 🟡 Media | ❌ | 8º |

**Empezar por techadores.** Un tejado son 15.000-30.000 $, así que un contacto
perdido les duele de verdad; sus webs son de las peores del país; la demanda llega
a ráfagas después de cada tormenta y quien contesta primero se lleva el trabajo; y
la lista es pública y gratis.

**Abrir el sector entero cuesta 419 $** y da 4 meses de trabajo.

Cuando el mensaje esté afinado con techadores, pasarlo a climatización es cambiar
cuatro palabras: el problema es idéntico.

---

## 8. Y si lo vendieras por llamada

Merece la pena mirar el margen desde este lado, porque es donde está la otra
oportunidad.

| | |
|---|---|
| Lo que nos cuesta un intento | **0,04 $** |
| Lo que nos cuesta una conversación real | **0,09 $** |
| Lo que paga un techador americano por **un contacto cualificado** | **50 – 150 $** |
| Lo que paga un abogado de accidentes | **200 – 500 $** |

De cada 100 llamadas a fijos verificados salen 2-3 contactos cualificados. Coste:
4 $. Valor de mercado: 100-450 $.

**Es un margen de 25 a 100 veces.** Y explica por qué el sistema de llamadas se
puede vender suelto a 1.200 $ al mes sin despeinarse: para el cliente sigue siendo
barato comparado con lo que paga hoy por sus contactos.

---

## 9. Resumen

| | |
|---|---|
| Coste por intento de llamada | **0,04 $** |
| Coste de una conversación de 3 min | **0,09 $** |
| Costes fijos al mes (números + marca) | **27 $** |
| Empresas llamables en frío | **28.942** |
| Llamarlas 3 veces a todas | **3.473 $** |
| Conseguir todos los contactos | **1.938 $** *(6 de 8 sectores, gratis)* |
| Verificar qué números son fijos | **926 $** |
| **Trabajar el mercado entero, todo incluido** | **6.337 $** |
| Sector por el que empezar | **Techadores — 419 $ y 4 meses de trabajo** |

**Lo que hay que quedarse:** los teléfonos de seis de los ocho sectores son
públicos y gratuitos, llamar cuesta cuatro céntimos de dólar por intento, y abrir
el primer sector cuesta **menos de lo que cobramos por medio día de trabajo**.
