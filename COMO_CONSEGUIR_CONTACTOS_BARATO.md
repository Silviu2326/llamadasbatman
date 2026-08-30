# Spritmark — Cómo conseguir correos, teléfonos e información casi gratis

De dónde salen los datos de cada empresa, qué cuesta cada uno y en qué orden hay
que sacarlos.

---

## 1. Lo que cuesta cada dato

| Dato | De dónde sale | Coste por empresa |
|---|---|---|
| Nombre de la empresa | Registro mercantil del estado | **0 $** |
| Dirección | Registro mercantil | **0 $** |
| **Nombre del dueño** | Registro mercantil (aparecen los administradores) | **0 $** |
| Antigüedad del negocio | Registro mercantil (fecha de constitución) | **0 $** |
| Licencia del gremio y su fecha | Registro de licencias del estado | **0 $** |
| Teléfono | Google Places | 0,025 $ |
| Dirección de su web | Google Places | incluido |
| **Correo genérico** (`info@`) | **Nuestra propia auditoría** | **0 $** |
| Correo del dueño | Patrón + verificación | 0,002 $ |
| ¿El teléfono es fijo o móvil? | Twilio | 0,008 $ |
| Estado real de su web | Nuestra auditoría | ~0 $ |
| ¿Está trabajando mucho ahora? | Permisos de obra públicos | **0 $** |

> ### **Total: 0,035 $ por empresa con todo.**
> Apollo cobra 0,05 $ y te da menos. ZoomInfo, más de 0,50 $.

**Diez mil empresas completas: 350 $.**

---

## 2. La cadena, paso a paso

El orden importa: cada paso usa lo que sacó el anterior y descarta lo que no sirve
antes de gastar en el siguiente.

```
PASO 1 · Registro mercantil del estado          → GRATIS
   Nombre, dirección, dueño, fecha de alta
              ↓
PASO 2 · Registro de licencias del gremio       → GRATIS
   Confirma que es del sector y que está activa
              ↓
PASO 3 · Google Places                          → 0,025 $
   Teléfono y dirección de su web
              ↓
PASO 4 · Nuestra auditoría de su web            → ~0 $
   Nota de la web + el correo que tienen publicado
              ↓
   ⚠️ AQUÍ SE DESCARTA EL 30 %  (los que tienen buena web)
              ↓
PASO 5 · Adivinar el correo del dueño           → 0,002 $
   Nombre del paso 1 + dominio del paso 3
              ↓
PASO 6 · Comprobar si el teléfono es fijo       → 0,008 $
   Decide si se puede llamar en frío o hay que escribir primero
```

**La clave está en el paso 4.** Descartar antes de pagar los pasos 5 y 6 ahorra
un tercio del gasto, y esa auditoría ya la hacemos igualmente para el argumento de
venta.

---

## 3. Las fuentes gratis, una por una

### 3.1 · Registro mercantil del estado ⭐ la más infravalorada

**Todos los estados publican el registro completo de empresas**, y muchos dejan
descargarlo entero. Trae:

| Campo | Para qué nos sirve |
|---|---|
| Nombre legal y comercial | Identificarla |
| Dirección | Zona |
| **Nombres de los administradores** | **El correo del dueño se adivina a partir de aquí** |
| Fecha de constitución | Antigüedad = dinero |
| Estado (activa / disuelta) | Descartar muertas |

Algunos estados lo dan como descarga directa, otros piden una solicitud de acceso
a información pública, y unos pocos cobran entre 20 y 500 $ por el fichero
completo del estado. **Aun pagando, sale a 0,001 $ por empresa.**

> **Filtro que vale oro:** empresas constituidas **hace menos de 6 meses**.
> Todavía no tienen web, acaban de invertir en montar el negocio y necesitan
> clientes ya. Es la lista de clientes más fácil que existe y la publica el
> gobierno gratis, actualizada cada semana.

### 3.2 · Registros de licencias del gremio

Techadores, fontaneros, climatización, contratistas, dentistas y abogados están
obligados a colegiarse o a tener licencia estatal. Esas listas son públicas.

Añaden sobre el registro mercantil: **que están en activo de verdad** y **desde
cuándo ejercen**.

### 3.3 · Permisos de obra 🔥 el que nadie usa

Los ayuntamientos americanos publican los permisos de obra concedidos, con el
nombre del contratista que los pidió. Muchas ciudades los tienen en portales de
datos abiertos, descargables.

**Por qué esto es distinto a todo lo demás:** no es un dato de contacto, es un
dato de **dinero**. Un techador que ha pedido 40 permisos en los últimos 90 días
está desbordado de trabajo y tiene caja. Uno que ha pedido 2 está muerto.

| Permisos en 90 días | Qué es | ¿Le llamamos? |
|---|---|---|
| 30+ | Va a tope, tiene dinero | ✅ **Prioridad máxima** |
| 10 – 30 | Sano | ✅ Sí |
| 1 – 9 | Justo | 🟡 Después |
| 0 | Inactivo o retirado | ❌ Descartar |

Se cruza por nombre de contratista con las listas anteriores. **Convierte una
lista de 30.000 nombres en una lista de 3.000 que sabemos que están facturando.**

### 3.4 · Avisos de tormenta ⛈️ solo para techadores

El servicio meteorológico americano publica gratis los partes de granizo y viento
por condado.

**Cuando cae granizo en un condado, los techadores de ese condado se llenan de
trabajo durante 3-6 semanas.** Es exactamente el momento en que pierden llamadas
porque no dan abasto — y por tanto el momento en que el argumento de "la IA
contesta por ti en 60 segundos" se vende solo.

Es una alerta automática que dice a quién llamar **esta semana**. Gratis.

### 3.5 · El correo, de su propia web

Ya lo estamos haciendo y probablemente no lo sabías: la auditoría extrae el correo
publicado en la web mientras la analiza
([digitalAudit.service.ts:146](backend/src/services/digitalAudit.service.ts#L146),
[:517](backend/src/services/digitalAudit.service.ts#L517)).

**Cada auditoría devuelve un correo gratis.** Sale en el 60-75 % de las webs de
negocios pequeños. Coste: cero, porque la auditoría se hace de todas formas.

### 3.6 · Cámaras de comercio y asociaciones

Cada ciudad americana tiene su cámara de comercio con directorio de socios
público. Poco volumen, pero son negocios establecidos y con dinero. Bueno para
completar, no para llenar.

---

## 4. Adivinar el correo del dueño

Con el nombre del administrador (gratis, del registro mercantil) y el dominio
(gratis, de Places), se generan los cinco patrones habituales:

```
john@empresa.com          ← el más común en negocios pequeños
johnsmith@empresa.com
john.smith@empresa.com
jsmith@empresa.com
smith@empresa.com
```

Se comprueban los cinco con un verificador de correo (**0,0004 $ cada
comprobación**, así que 0,002 $ por empresa) y se queda el que existe.

**Acierta entre el 40 % y el 60 % de las veces.** Y escribir a "John" en vez de a
`info@` **duplica la tasa de respuesta**.

⚠️ **Verificar no es opcional.** Sin verificar, el rebote sube al 8-10 % y los
buzones se queman en dos semanas. Verificando se queda por debajo del 2 %. Cuesta
4 $ por cada 10.000 correos: es el gasto más rentable de toda la operación.

---

## 5. Las fuentes de pago, y cuándo merecen la pena

| Fuente | Coste | ¿Merece la pena? |
|---|---|---|
| **Google Places** | 0,025 $/empresa | ✅ **Sí.** El teléfono y la web no salen gratis en ningún otro sitio con esta cobertura |
| **Verificador de correo** | 0,0004 $/correo | ✅ **Sí, imprescindible** |
| **Twilio, tipo de línea** | 0,008 $/número | ✅ **Sí**, si vamos a llamar en frío |
| **Apollo** | ~0,05 $/contacto | 🟡 Solo si el paso 5 no da bastante. Su ventaja es el correo verificado del dueño ya hecho |
| **Data Axle / InfoUSA** | 0,03-0,10 $ | 🟡 Solo para volumen grande de golpe |
| **Clay** | 150-800 $/mes | ❌ Hace lo que ya hace nuestro programa |
| **ZoomInfo** | 0,50 $+/contacto | ❌ Está pensado para vender software a grandes empresas, no a fontaneros |
| **LinkedIn Sales Navigator** | 99 $/mes | ❌ Los techadores no están en LinkedIn |

---

## 6. Qué hace ya nuestro programa y qué falta

### ✅ Ya funciona

| Qué | Dónde |
|---|---|
| Buscar negocios por sector y ciudad en Places, sin repetidos, puntuados | `prospecting.service.ts` |
| Auditar la web y **sacar el correo publicado** | [digitalAudit.service.ts:146](backend/src/services/digitalAudit.service.ts#L146) |
| Investigar al negocio antes de escribirle | `prospectResearch.service.ts` + Brave |
| Escribir el correo personalizado | `emailCopy.service.ts` |
| Importar listas por CSV sin duplicados | `leads.service.ts` |

### ❌ Falta

| Qué falta | Trabajo | Ahorro o beneficio |
|---|---|---|
| **Verificador de correo** | Llamar a una API antes de enviar | Evita quemar buzones. **Lo más urgente** |
| **Adivinar el correo del dueño** | Cinco plantillas + la verificación de arriba | Duplica la respuesta |
| **Tipo de línea (fijo o móvil)** | Twilio Lookup, unas 10 líneas | Es lo que permite llamar en frío legalmente |
| **Carga masiva de listas** | El CSV va de 2.000 en 2.000 | Cargar 30.000 empresas son 15 importaciones |
| Cruce con permisos de obra | Un CSV y un cruce por nombre | Convierte 30.000 nombres en 3.000 con dinero |
| Alerta de tormentas | Consulta a la API del tiempo | Dice a quién llamar esta semana |

**Las tres primeras son las que hay que hacer.** Las dos últimas son mejoras que
pueden esperar a tener clientes.

---

## 7. Cuánto cuesta 10.000 empresas, según cómo lo hagas

| Vía | Contactos | Verificar correos | Tipo de línea | **Total** |
|---|---|---|---|---|
| **La nuestra** (registros + Places + auditoría) | 250 $ | 4 $ | 80 $ | **334 $** |
| Solo con registros públicos (sin teléfono fiable) | 0 $ | 4 $ | 80 $ | **84 $** |
| Comprando en Apollo | 500 $ | incluido | 80 $ | **580 $** |
| Comprando en ZoomInfo | 5.000 $ | incluido | 80 $ | **5.080 $** |

**334 $ por 10.000 empresas con teléfono, correo, nombre del dueño, nota de su web
y tipo de línea.** Tres céntimos y medio cada una.

---

## 8. El orden de trabajo, para el primer sector

Techadores en la costa Este, que es por donde empezamos:

| Paso | Qué | Coste | Tiempo |
|---|---|---|---|
| 1 | Bajar el registro de licencias de 6 estados | 0 $ | 1 día |
| 2 | Bajar los permisos de obra de las 20 ciudades grandes | 0 $ | 1 día |
| 3 | Cruzar: quedarnos con los que trabajan | 0 $ | 1 hora |
| 4 | Pasarlos por Places para teléfono y web | 190 $ | automático |
| 5 | Auditar las webs (y recoger los correos) | ~0 $ | automático |
| 6 | Adivinar y verificar el correo del dueño | 15 $ | automático |
| 7 | Comprobar cuáles tienen fijo | 60 $ | automático |
| **Total** | **~7.500 empresas listas** | **265 $** | **2 días** |

De ahí salen unas 2.700 con fijo para llamar en frío y unas 4.800 para escribir.
**Cuatro meses de trabajo por 265 $.**

---

## 9. Qué se puede extraer y qué no

| Fuente | Riesgo |
|---|---|
| Registros públicos del gobierno | 🟢 **Ninguno.** Son públicos por ley |
| La web de la propia empresa | 🟢 Muy bajo. Publican el correo para que les escriban |
| Google Places por su API oficial | 🟢 Ninguno, es lo que vendemos |
| Yelp, Angi, LinkedIn extrayendo a mano | 🔴 Sus condiciones lo prohíben. **No compensa** |

Dos avisos rápidos:

- **En el correo hay que poner cómo darse de baja y una dirección postal.** Es la
  ley federal de correo comercial y no cuesta nada cumplirla.
- **En California, el dato de contacto de un autónomo puede contar como dato
  personal.** En la práctica basta con atender rápido a quien pida que le borres.

---

## 10. Resumen

| | |
|---|---|
| Coste por empresa con **todos** los datos | **0,035 $** |
| 10.000 empresas completas | **334 $** |
| Datos que salen gratis | Nombre, dirección, **dueño**, antigüedad, licencia, actividad, correo publicado |
| Datos que hay que pagar | Teléfono (0,025 $), verificar correo (0,0004 $), tipo de línea (0,008 $) |
| Lo que hay que construir ya | **Verificador de correo**, adivinar correo del dueño, tipo de línea |
| Abrir el primer sector entero | **265 $ y 2 días** |

**Lo que hay que quedarse:** el gobierno americano publica gratis el nombre del
dueño, la antigüedad, la licencia y hasta cuánto está trabajando cada empresa. Lo
único que hay que pagar es el teléfono y dos comprobaciones que cuestan menos de
un céntimo. **Todo lo caro de este negocio ya lo hemos pagado — es el programa.**
