# Spritmark: 20 clientes en EEUU y Canadá con 800 €

Qué vendes: **web + posicionamiento en Google + el sistema que les trae clientes**, todo en inglés.
Presupuesto: **800 €** (unos 870 $). Objetivo: **20 clientes**.

**La buena noticia del cambio de mercado:** el problema que tenías —que tu
agente de voz solo habla inglés— desaparece. En EEUU eso ya no es un fallo, es
el producto.

**La mala:** tu módulo de cumplimiento legal está hecho para México y hay que
tocarlo antes de la primera llamada. Punto 3.

---

## 1. Por qué EEUU cambia toda la cuenta

Lo mismo que vendes, allí vale entre 3 y 5 veces más:

| | España | EEUU / Canadá |
|---|---|---|
| Web para un negocio local | 700 – 1.500 € | **3.000 – 8.000 $** |
| Posicionamiento mensual | 250 – 500 €/mes | **1.000 – 3.000 $/mes** |
| El sistema de captación montado | — | **500 – 1.500 $/mes** |
| **Un cliente al año** | ~3.000 € | **20.000 – 40.000 $** |

**Qué significa esto:** si un cliente te deja 25.000 $ al año, puedes gastarte
**1.000-2.000 $ en conseguirlo** y sigue siendo un negocio buenísimo. En España
tenías 200 €. Ahora tienes margen de sobra.

**20 clientes a 1.500 $/mes = 360.000 $ al año.** Ese es el tamaño real de lo que
estás montando. Los 800 € son para arrancar los tres primeros; a partir de ahí se
paga solo.

---

## 2. Qué vendes exactamente (la oferta)

No vendas "web y SEO". Eso lo vende cualquiera y allí hay 50.000 agencias. Vende
esto:

> **"We build your site, get you ranking on Google, and hand you the machine that
> fills it: when someone fills your form, our AI calls them back in 60 seconds —
> before your competitor does."**

Las tres partes:

| Parte | Precio | Qué es |
|---|---|---|
| **Setup** | 3.000 – 5.000 $ una vez | Web nueva + Google Business + medición |
| **Ranking** | incluido en el mensual | Contenido y posicionamiento |
| **Speed-to-lead** | 500 – 1.500 $/mes | Tu agente de voz llama al que rellena el formulario en 60 segundos |

**El "speed-to-lead" es tu arma.** En EEUU hay estudios de sobra que dicen que
llamar a un contacto en el primer minuto multiplica el cierre por 8 respecto a
llamar a la hora. Los negocios locales americanos lo saben, lo sufren, y pagan
mucho por resolverlo. Y tu programa lo hace **hoy, en inglés, sin tocar nada**.

Además es **legalmente limpio**: la persona ha rellenado un formulario pidiendo
que la llamen. No es una llamada en frío. Esto importa mucho, ver punto 3.

### A quién se lo vendes

Negocios locales americanos con dinero y con webs malas:

- **Techadores (roofing)** — presupuestos de 15.000-30.000 $, se pelean por cada contacto
- **Aire acondicionado y fontanería (HVAC, plumbing)** — urgencias, el que llama primero se lo lleva
- **Clínicas estéticas (med spa)** y **dentistas**
- **Abogados de accidentes** — pagan 200-500 $ por contacto, los que más
- **Reformas y ventanas (remodeling)**

Todos tienen tres cosas en común: mucho dinero por cliente, web horrible, y
obsesión con responder rápido a los contactos.

### En qué zona, y por qué importa

Estás en España. Su horario de oficina cae así:

| Zona | Su horario | Tu hora en Madrid |
|---|---|---|
| **Este** (Nueva York, Miami, Atlanta, Toronto) | 9-17 | **15:00 – 23:00** ✓ |
| **Centro** (Chicago, Dallas, Houston) | 9-17 | 16:00 – 00:00 ⚠️ |
| **Oeste** (Los Ángeles, Seattle, Vancouver) | 9-17 | 18:00 – 02:00 ✗ |

**Empieza solo por la costa Este.** Es además el mercado más denso y con más
dinero. El Oeste te destroza la vida y no lo necesitas.

**Canadá: espera al mes 2.** Su ley de correo comercial (CASL) es mucho más dura
que la americana — hace falta consentimiento *antes* de escribir, y las multas
llegan a millones. Se puede hacer bien (solo direcciones publicadas en su propia
web y mensajes relevantes a su cargo), pero no es sitio para aprender. Arranca en
EEUU, que es permisivo con el correo B2B, y añade Canadá cuando ya sepas qué
funciona.

---

## 3. 🔴 Lo legal: léelo antes de hacer una sola llamada

Esto no es burocracia. En EEUU hay abogados que viven de esto, la multa es **por
llamada** (500-1.500 $ cada una) y una campaña de 1.000 llamadas mal hecha te
cierra el negocio.

### La regla que lo decide todo

Desde febrero de 2024, la agencia de telecomunicaciones americana (FCC) considera
que **una voz generada por IA es una "voz artificial"**. Eso significa que para
llamar a un móvil o a un particular hace falta **consentimiento por escrito
previo**. Y en EEUU muchísimos negocios pequeños usan un móvil como teléfono de
empresa: desde fuera no puedes distinguirlo.

**Conclusión práctica:**

| ❌ No hagas | ✅ Haz |
|---|---|
| Llamar en frío con el agente de IA a listas de negocios | Escribir primero por correo. El que contesta o rellena el formulario, **ya te ha dado permiso** → ahí sí llama |
| Llamar a números sacados de Google Maps sin más | Llamar solo a quien está en tu formulario con la casilla de consentimiento marcada |

Y no pierdes nada: **llamar a alguien que acaba de levantar la mano convierte 10
veces más que llamar a un desconocido.** La vía legal es también la que más
vende. Las dos cosas apuntan al mismo sitio.

### Lo que hay que cambiar en tu código

Tu módulo `backend/src/voice/compliance.ts` está construido para México y hoy
**calcularía mal la hora legal en EEUU**:

| Qué pasa | Dónde | Qué hacer |
|---|---|---|
| El mapa de prefijos → zona horaria es de México (55 = CDMX, 664 = Tijuana) | [compliance.ts:3-9](backend/src/voice/compliance.ts#L3-L9) | EEUU tiene 6 husos horarios. **No intentes adivinar por el prefijo**: guarda la zona horaria del negocio cuando el buscador lo importa (Google Places ya te la da) y úsala |
| Todos los números que no son de México caen en una zona horaria única | [compliance.ts:56-59](backend/src/voice/compliance.ts#L56-L59) | Con lo anterior arreglado, esto se resuelve solo |
| El país por defecto es México (`52`) | [compliance.ts:47](backend/src/voice/compliance.ts#L47) | Poner `DEFAULT_PHONE_COUNTRY_CODE=1` |
| La ventana horaria por defecto es 9:00-20:00 | [compliance.ts:35-36](backend/src/voice/compliance.ts#L35-L36) | La ley americana permite 8:00-21:00 **hora del que recibe**. Pon `CALL_HOUR_START=9` y `CALL_HOUR_END=18` — más estrecho a propósito, para no acercarte al límite |
| El consentimiento de voz es opcional | [compliance.ts:80](backend/src/voice/compliance.ts#L80) | **`REQUIRE_VOICE_CONSENT=true`. Innegociable.** Con esto, si un contacto no tiene consentimiento registrado, el sistema se niega a llamarle |
| El agente se presenta como "Vendrava" | [compliance.ts:141](backend/src/voice/compliance.ts#L141) | Cambiar a Spritmark |
| Aviso de que es una IA | [compliance.ts:106-111](backend/src/voice/compliance.ts#L106-L111) | Ya lo tienes y funciona. **Nunca lo apagues** (`DISCLOSE_AI`): en California y Utah es obligatorio por ley |

Lo que **sí** tienes bien montado y te va a servir tal cual: la lista de "no me
llames" por organización, la detección de que alguien pide que no le llamen, el
paso a un humano cuando lo piden, y el permiso de grabación (obligatorio en
California, Florida, Illinois, Pensilvania y Washington).

### Lo mínimo que hay que poner en el formulario

Una casilla, sin marcar por defecto, con este texto:

> *"By submitting, I agree to receive calls and texts from Spritmark at the number
> provided, including by automated means. Consent is not a condition of purchase.
> Msg & data rates may apply."*

Y guardas la fecha, la hora y la IP. Tu tabla `ContactConsent` ya está para eso.

---

## 4. Encender la máquina: qué cuesta

| Qué | Para qué | 3 meses |
|---|---|---|
| Motor de fondo (worker + Redis) | Sin esto las llamadas **no salen y no avisa** | 30 € |
| DeepSeek (el cerebro de textos) | Correos, contenido, respuestas | 20 € |
| Google Places | Buscar negocios por sector + ciudad | ~0 € |
| PageSpeed | Auditar su web de verdad | Gratis |
| Twilio: número americano + minutos | El agente llama con número local | 30 € |
| Brave Search | Investigar al negocio antes de escribirle | Gratis |
| OpenAI (imágenes) | Creatividades | 10 € |
| **Total** | | **~90 €** |

Y para el correo en frío, que es tu canal principal:

| Qué | 3 meses |
|---|---|
| 4 dominios parecidos al tuyo (para no quemar el bueno) | 40 € |
| 12 buzones de correo | 160 € |
| Dirección postal en EEUU (obligatoria en el pie del correo por la ley CAN-SPAM) | 45 € |
| **Total** | **~245 €** |

> **Por qué 12 buzones:** cada uno aguanta 30-40 correos al día sin que le marquen
> como spam. 12 × 35 = **420 correos al día**. Ese es el volumen que necesitas.
> Y hay que "calentarlos" tres semanas antes de enviar nada en serio. Empieza ya.

---

## 5. Las 4 vías, con números reales de EEUU

### Vía 1 — Correo frío con auditoría real adjunta ⭐ **la principal**
**Coste: 245 €** · **Clientes: 9 – 14** · **Tu tiempo: 1 h al día**

Es legal en EEUU para B2B (ley CAN-SPAM): basta con no engañar en el asunto,
poner tu dirección postal y quitar de la lista a quien lo pida en 10 días.

Cómo lo hace tu programa, de punta a punta:

```
1. Le pides 500 negocios: "roofing contractors, Tampa FL"
2. Audita las 500 webs solo: velocidad real, certificado, si Google
   las lee bien
3. Te quedas con las 300 peores → esos son tus clientes
4. Investiga cada una y escribe el correo: 3 versiones, las juzga,
   manda la mejor
5. Adjunta el informe de SU web con un enlace público
6. El que contesta entra en tu bandeja y en tu embudo
7. Marcas la casilla de consentimiento → y ahora sí, el agente
   de voz le llama en inglés
```

**Esto es lo que ninguna otra agencia hace.** El 99% manda un "Hi, I noticed your
website...". Tú mandas *"your site takes 6.4 seconds to load, Google flags it as
failing, and you're on page 3 for 'roof repair Tampa'. Here's the full report."*
Con datos reales, sacados automáticamente, a 400 al día.

**Números:** 8.000 correos al mes → 2-3% contestan (200) → 40 interesados de
verdad → 15 reuniones → **3-5 clientes al mes**.

⚠️ Tres semanas de calentar buzones antes. Si empiezas a 400/día desde el primer
día, acabas en spam y quemas los dominios.

---

### Vía 2 — Vídeo-auditoría para los que ya picaron
**Coste: 0 €** · **Clientes: 3 – 5** · **Tu tiempo: 10 min por vídeo**

Cuando alguien abre tu informe dos veces pero no contesta, grábale un vídeo de 2
minutos: compartes pantalla, entras en su web, señalas los tres problemas y le
enseñas cómo lo arreglarías. Se lo mandas sin que lo pida.

En EEUU esto tiene tasas de respuesta del 10-20%. No escala —10 al día como
mucho— pero se usa solo con los que ya han mostrado interés, así que no hace
falta que escale.

Herramienta: Loom, gratis.

---

### Vía 3 — Demostración del agente de voz llamándoles a ellos
**Coste: incluido** · **Clientes: 3 – 5** · **Tu tiempo: 5 min por demo**

En el correo pones: *"Want to hear it? Put your number here and our AI will call
you in 60 seconds."*

El que pone su número **te está dando el consentimiento** (legal ✓) y en 60
segundos recibe una llamada de una IA en inglés que suena bien y le explica qué
hace. Nadie olvida esa demostración.

Es la venta y el producto en el mismo movimiento: le enseñas exactamente lo que
le vas a montar, funcionando, con él dentro.

**Monta esto en la tercera semana**, cuando el correo ya esté rodando. Es lo que
convierte "interesado" en "cliente".

---

### Vía 4 — Perseguir a los que te visitaron (retargeting)
**Coste: 120 €** · **Clientes: 1 – 2** · **Tu tiempo: medio día**

⚠️ **Google Ads en frío en EEUU no te lo puedes pagar.** Un clic para "seo agency"
o "web design services" cuesta **15-40 $**. Con 800 € tendrías 30 clics en total.
Cero clientes. **Ni lo enciendas.**

Lo que sí sale a cuenta: enseñarle anuncios **solo a quien ya ha entrado en tu
web o ha abierto tu informe**. Ahí el clic baja a 2-5 $ y la gente ya sabe quién
eres. Con 120 € persigues a unos cuantos cientos durante dos meses.

Tu programa monta las campañas de Meta solo y las deja en pausa para que las
revises.

---

## 6. Cómo repartir los 800 €

| Dónde | Cuánto |
|---|---|
| Dominios, buzones y dirección postal (el canal principal) | 245 € |
| Encender el programa | 90 € |
| Retargeting | 120 € |
| **Reserva** | **345 €** |
| **Total** | **800 €** |

**La reserva es grande a propósito.** Estás entrando en un mercado que no
conoces. En la semana 4 sabrás qué está funcionando de verdad, y ahí es donde
quieres tener dinero disponible: para poner más buzones si el correo va bien, o
para grabar más vídeos, o para lo que sea que esté cerrando.

**Y date cuenta:** en cuanto cierres **un solo cliente** (3.000-5.000 $ de
entrada), has recuperado los 800 € cuatro veces. El presupuesto real de este plan
no son 800 €, son 800 € **hasta el primer cliente**.

---

## 7. Los 20 clientes, de dónde salen

| De dónde | Clientes | Cuándo |
|---|---|---|
| Correo frío con auditoría | 9 – 14 | Mes 1-4 |
| Vídeo-auditoría a los tibios | 3 – 5 | Mes 2-4 |
| Demo del agente de voz | 3 – 5 | Mes 2-5 |
| Retargeting | 1 – 2 | Mes 3-5 |
| **Total** | **16 – 26** | **4 – 6 meses** |

Un mes más que en el plan español, porque hay tres semanas de calentar buzones
antes de poder enviar en serio. Pero cada cliente vale 5 veces más.

---

## 8. Plan de las primeras 4 semanas

**Semana 1 — comprar dominios y arreglar lo legal**
- Compra los 4 dominios y los 12 buzones. **Empieza a calentarlos hoy**: es lo
  único que no se puede acelerar con dinero.
- Arregla el punto 3: zona horaria por negocio, país `1`, ventana 9-18,
  `REQUIRE_VOICE_CONSENT=true`, nombre Spritmark.
- Arranca el motor de fondo y comprueba con una llamada real a tu propio móvil.
- Elige **un sector y tres ciudades de la costa Este**. Solo uno.

**Semana 2 — construir la lista y la oferta**
- Saca 500 negocios de ese sector con el buscador.
- Deja que audite las 500 webs.
- Monta la landing en inglés con el formulario y la casilla de consentimiento.
- Escribe la secuencia de 4 correos. Que el programa te dé 3 versiones de cada uno.
- Contrata la dirección postal americana y ponla en el pie.

**Semana 3 — empezar a enviar**
- Arranca a 100 correos al día y sube 50 cada dos días hasta 400.
- Contesta **en el mismo día**. En EEUU la respuesta rápida es la mitad de la venta.
- Monta la demo del agente de voz ("call me in 60 seconds").
- Graba los primeros vídeos para los que abrieron dos veces.

**Semana 4 — mirar los números y decidir dónde va la reserva**
- ¿Cuántos abren, cuántos contestan, cuántos son interesados de verdad?
- Si contestan menos del 1%, **el problema es el mensaje, no el volumen.**
  No subas envíos, cambia el correo.
- Si contestan más del 3%, mete la reserva en más buzones.
- Enciende el retargeting con lo que hayas aprendido.

---

## 9. Errores que en EEUU cuestan mucho más caro

1. **Llamar en frío con el agente de IA.** 500-1.500 $ por llamada. Correo
   primero, llamada después del consentimiento. Siempre.
2. **Confiar en la hora legal sin arreglar las zonas horarias.** Hoy tu código
   llamaría a California de madrugada.
3. **Apagar el aviso de que es una IA.** Es obligatorio en varios estados y
   además no perjudica: la gente lo agradece.
4. **Encender Google Ads en frío.** 30 clics y 800 € fuera.
5. **Enviar 400 correos el primer día.** Dominios quemados y hay que empezar de
   cero tres semanas después.
6. **Ir a la costa Oeste.** Trabajarás hasta las 2 de la mañana para nada.
7. **Empezar por Canadá.** Su ley de correo pide permiso antes de escribir. Mes 2
   y con cuidado.
8. **Cobrar precios españoles.** Si pides 800 $ por una web en EEUU no te compran
   *porque es barato*: piensan que es una estafa o que eres un aficionado. **3.000 $
   mínimo.**
9. **Sonar a extranjero.** Número americano, dirección americana, inglés sin
   traducciones raras, precios en dólares. Nadie pregunta dónde estás si todo
   encaja — y si preguntan, no pasa nada: media agencia americana subcontrata fuera.

---

## 10. Si solo pudieras hacer una cosa esta semana

**Compra los 4 dominios y los 12 buzones y ponlos a calentar hoy.**

Cuesta 200 € y no requiere que nada más esté listo. Son 3 semanas de espera
obligatoria que corren en paralelo mientras arreglas lo legal, montas la landing
y construyes la lista. Si lo dejas para la semana 3, tu primer cliente llega un
mes más tarde.

Todo lo demás de este plan se puede hacer en cualquier orden. Esto no.
