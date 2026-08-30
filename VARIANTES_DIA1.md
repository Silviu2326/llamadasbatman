# Las 20 llamadas como experimento — cuatro estructuras

Complementa `MANANA_PRIMERAS_20_LLAMADAS.md`. Cambia una cosa del plan: en vez
de veinte llamadas con un guion, son **cuatro estructuras de cinco llamadas**.

**La premisa, que es tuya y conviene dejarla escrita:** la voz se va a notar que
es IA en los primeros cinco segundos. No se disimula. Se compensa con contenido
que merezca la pena oír. Lo que este día mide es si eso es cierto.

---

## 1 · Por qué cuatro y no una

Con un solo guion, veinte llamadas miden una sola cosa: si ese guion funciona.
Y si sale mal no sabrás si el problema era el guion, la voz o la lista.

Con cuatro estructuras que comparten **el mismo argumento y las mismas reglas de
pensamiento**, lo único que varía es la forma de entrar y de sostener la
conversación. Cinco llamadas de cada una no dan significación estadística —ni
falta— pero sí dan algo que escuchado en serie se oye perfectamente: cuál de las
cuatro hace que el otro hable.

El agente cuelga de la campaña (`leadCallDispatch.ts:91` toma
`lead.campaign.agent`), así que cada variante es una campaña con su agente y su
estrategia. No hay código nuevo: el sistema ya trae ocho estrategias de llamada
intercambiables en `src/voice/callStrategies.ts`.

---

## 2 · Las cuatro

| | Variante | Estrategia | Qué pone a prueba |
|---|---|---|---|
| **A** | Dato y silencio | `permission_diagnosis` | El guion de la casa. **Es el control**: las otras tres se miden contra esta |
| **B** | Tesis discutible | `objection_to_evidence` | Si el contenido puede más que la voz, algo que dé ganas de rebatir debería retener más que un dato |
| **C** | Treinta segundos honestos | `fast_qualification` | El suelo: si basta con ser breve y brutalmente honesto, sobra artesanía |
| **D** | Pide el veredicto | `permission_diagnosis` | Convertir la voz de IA en el motivo para seguir escuchando |

### A · Dato y silencio

Permiso a los 15 segundos, **un** dato medido de su web, callarse, dos preguntas,
dos huecos concretos. Es el guion de `GUION_LLAMADAS_SPRINTMARKT.md` adaptado a
agencias. Sin esta variante no hay contra qué comparar.

### B · Tesis discutible

Abre afirmando algo con lo que pueden no estar de acuerdo —*una agencia de vuestro
tamaño no pierde trabajo por precio, lo pierde por plazo de entrega, y este
trimestre habéis rechazado o alargado algo porque no teníais manos*— y acto
seguido pide que le digan por qué se equivoca.

Lo que la hace distinta no es la tesis, es lo que viene después: **no defiende a
la primera**. Pregunta qué es exactamente lo que objetan, reformula la objeción
más fuerte de lo que se la han puesto, concede lo que sea cierto, y solo entonces
da **una** contra. Si tienen razón, lo dice y para.

Esta es la que prueba tu teoría de frente: rebatir y debatir de verdad.

### C · Treinta segundos honestos

*Soy una IA, de SprintMarkt, esto es una llamada en frío, te robo treinta
segundos y luego decides.* Una pregunta binaria: ¿habéis rechazado o retrasado
trabajo en los últimos tres meses por falta de horas? Si dicen que no, se
despide y cuelga — **sin segundo intento**. Si dicen que sí, dos frases y un
hueco.

Toda la llamada por debajo de noventa segundos, y una sola rebatida en total.
Está para marcar el suelo: si esta aguanta el tipo, buena parte del trabajo de
guion es decorado.

### D · Pide el veredicto

Le dice la verdad: que llama a agencias y no a fontaneros precisamente porque
ellos van a detectar cada línea floja, y que quiere cuarenta segundos y su
**veredicto profesional**. Suelta el argumento a su mejor nivel y luego pregunta
qué fue lo más flojo de lo que acaban de oír. No discute la crítica.

Es la única de las cuatro que **saca material aunque falle**: un profesional del
oficio diciéndote por qué tu llamada no funciona vale más que la reunión.

---

## 3 · Lo que comparten las cuatro

Está en el bloque común del prompt (`backend/scripts/setup-dia1-variantes.mjs`),
y es donde vive lo que pediste. Las reglas están escritas como prohibiciones
concretas y no como adjetivos, porque *"sé convincente"* no produce nada:

- **Las dos primeras frases tienen que contener algo cierto, específico y no obvio.** Si una frase valdría para cualquier empresa del mundo, se corta.
- **Conceder antes de rebatir.** Reformular la objeción más fuerte de como se la han puesto, y responder a esa versión. Si la objeción es correcta, decirlo y dejar de empujar.
- **Una rebatida cada vez.** Nunca dos seguidas. Quien oye tres argumentos seguidos no oye ninguno.
- **Discrepar en voz alta y con el motivo.** Nada de suavizar un desacuerdo hasta convertirlo en un sí.
- **Preguntar solo lo que cambiaría lo siguiente que va a decir.** Si la respuesta no cambia nada, no se pregunta.
- **Su número, nunca el tuyo.** Jamás decir cuánto están perdiendo.
- **No saber se dice.** Y se dice qué haría falta para averiguarlo.
- **No llenar el silencio.** Después de lo interesante, callarse.
- **Contar la limitación sin que la pregunten:** alta manual, sin autoservicio, techo de 10-12 cuentas. Es lo más creíble que puede decir en toda la llamada.

Y sobre lo de la voz, literal en el prompt: *asume que la voz juega en tu contra
y que lo único que le mantiene al teléfono es si la siguiente frase merece la
pena.* Si le dicen «eres un robot», lo admite en cuatro palabras y sigue con algo
sustantivo. Ni se defiende ni hace la broma.

---

## 4 · El orden del día, corregido

El plan original decía 3 llamadas → escuchar → 17 en tandas de 5. Con cuatro
variantes cambia:

1. **Una de cada variante. Cuatro llamadas.** Escúchalas seguidas antes de nada más.
2. Si alguna estructura es un desastre evidente, **córtala ahí** y reparte sus cuatro restantes entre las que aguanten.
3. **Las dieciséis que quedan**, en tandas de cuatro (una por variante), escuchando entre tandas.
4. Al final, **escucha por variante, no por orden cronológico**. Las cinco de A seguidas, luego las cinco de B. Los patrones de una estructura solo se ven en bloque.

Los ficheros ya están repartidos, 8 por variante — 5 para llamar y 3 de reserva—,
y cada uno cubre las cuatro ciudades para que ciudad y variante no se confundan:

| | Fichero | Campaña | Primeras cinco |
|---|---|---|---|
| A | `prospects-dia1-A.json` | `cmsyuy24j0001d28evnggpjdu` | OnWired · Crimson Park · Torx Media · Bryant Digital · Think Designs |
| B | `prospects-dia1-B.json` | `cmsyuy2ol0005d28e4p0zd4nf` | TheeDigital · The Branding Agency · J Drake · COSTA Designs · Big Red Dog |
| C | `prospects-dia1-C.json` | `cmsyuy3150009d28essvcfjw0` | Instinctive Branding · Breeez · Baylyn Media · Commonwealth Creative · BTB |
| D | `prospects-dia1-D.json` | `cmsyuy3du000dd28e23krssw5` | Unita Marketing · Web Symphonies · KNOWN · Eyepinch · Go Fish Digital |

Cada fichero lleva dentro su `campaignId`. Se importan por separado, con
`autoAudit: true` y **sin `state` en el cuerpo**.

---

## 5 · La ficha de escucha

La del plan original cuenta llamadas. Esta mide pensamiento, que es lo que
quieres saber. Una línea por llamada:

| # | Var | Empresa | ¿Descolgó? | Seg. hasta que habló el otro | ¿Notó que era IA? ¿en qué segundo? | ¿Dijo algo NO obvio? | ¿Concedió antes de rebatir? | ¿Apiló rebatidas? | ¿Se inventó algo? | Frase que chirrió |
|---|---|---|---|---|---|---|---|---|---|---|

**La columna que decide el experimento es "¿dijo algo no obvio?".** Si sale «no»
en las veinte, la teoría no se sostiene con este prompt y hay que reescribir el
argumento, no la estructura. Si sale «sí» y aun así cuelgan, entonces sí es la
voz.

**"Segundos hasta que habló el otro"** es el mejor indicador de retención que
tienes sin métricas: una llamada donde el prospecto no habla hasta el segundo 40
está perdida aunque dure tres minutos.

Y las dos preguntas al final de cada escucha:

- **¿Esto lo habría dicho un comercial bueno?**
- **¿Habría seguido escuchando yo, sabiendo que es una máquina?**

---

## 6 · Cuándo parar en seco

Lo del §6 del plan sigue igual, con una adición propia del experimento:

| Señal | Qué hacer |
|---|---|
| **El agente se inventa un dato** | 🔴 Parar todo. Es lo único que no se negocia |
| **Dice una marca que no es SprintMarkt** | 🔴 Parar. Revisar el prompt |
| **Una variante encadena tres llamadas colgadas antes de los 10 segundos** | Cortar esa variante y repartir sus restantes |
| **Todas las variantes fallan en el mismo punto** | No es la estructura, es el argumento. Parar y reescribir el bloque común |

Esa última fila es el hallazgo más valioso que puede dar el día, y solo se ve
teniendo cuatro estructuras. Con una sola habrías culpado al guion.
