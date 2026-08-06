# Vendrava — mapa de pantallas del MVP

Todo vive en la página actual de Redes sociales (`/redes-sociales`,
`ConectarRedesPage.jsx`), reorganizada en cuatro vistas. No se crean rutas
nuevas hasta que el circuito funcione.

---

## 0. Estado

**Las cuatro vistas están construidas**, con motor y con interfaz, y el
circuito se recorre entero: Radar → Generar campaña → Estudio → Enviar a
aprobación → Sala → Resultados.

Decisiones de implementación que conviene no perder:

- **La seudonimización se construyó primero** (`lib/pseudonymize.ts`), porque
  el `README.md` la marca como bloqueante. Ninguna transcripción sale hacia el
  modelo sin tokenizar, y si la red de seguridad detecta PII superviviente se
  **descarta esa conversación** en vez de analizarla.
- **Toda oportunidad se verifica contra sus fuentes.** Los ids que el modelo
  no pueda respaldar se caen, y si al hacerlo baja del mínimo de 3
  conversaciones, la oportunidad se cae entera. Una tarjeta con "8 menciones"
  que no se pueden abrir es peor que no tener tarjeta.
- **La voz del dueño se calcula de forma determinista.** Lo que pide
  `semana.md` —muletillas, longitud de frase, expresiones— es medible;
  pedírselo a un modelo costaría dinero, haría el perfil irreproducible y lo
  dejaría sin funcionar cuando falta la clave. El modelo escribe *con* el
  perfil, no lo deduce.
- **Cada pieza nace con su propio `utmContent`.** El UTM anterior era
  `${plataforma}_metricool` para todas, así que dos piezas de la misma campaña
  y canal eran indistinguibles y "leads por pieza" (§4) era imposible.
- **La imagen es de la pieza, no de la campaña.** Se fija en `ContentPiece` y
  viaja sola hasta `createDraftPost`; el copiloto antiguo la guardaba en el
  estado del navegador y se perdía al recargar.
- **Los canales de una pieza son una lista** (`ContentPiece.channels`), porque
  el mismo post sale a Instagram y a LinkedIn a la vez y Metricool crea un
  borrador por canal, cada uno con su `utm_source` y el `utm_content` de la
  pieza. La columna singular se copió a la lista antes de eliminarla: aunque el
  Estudio no tenía selector, había piezas con canal escrito.
- **§4 cuenta con la misma regla que el embudo orgánico.** La atribución por
  pieza reutiliza `isOrganicEvent` (`organicChannels.service.ts`): dos formas de
  contar leads en el mismo producto serían dos verdades, y la que se enseña en
  Resultados tiene que ser la misma que la de `organico.md` §5.4.
- **El editor adversario corre en un orden que no es casual** (fase 2, idea 21):
  PII primero y bloqueante —es el único fallo irreversible una vez publicado—,
  especificidad después, y crítica del modelo al final. **La reescritura del
  crítico vuelve a pasar los dos primeros pasos**: un editor que arregla el
  estilo y reintroduce un dato inventado es peor que no tener editor.
- **La locución es una pieza, no un adjunto del Reel.** Se aprueba y se descarga
  por separado, pero no se publica sola: acompaña al Reel, cuyo borrador ya
  lleva el guion.
- **Las slides de marca se componen después de revisar**, no antes: maquetar un
  texto que el editor va a reescribir es trabajo tirado.

### Lo que queda

| Qué | Estado | Detalle |
|---|---|---|
| **`CLAUDE_API_KEY`** | Configuración | Sin ella el Radar no analiza y las piezas salen del respaldo determinista —usable pero más plano—. Perfil de voz, evidencias, aprobación, métricas y los dos pasos deterministas del editor adversario (PII y especificidad) funcionan sin clave. |
| **Migraciones de contenido** | Configuración — aplicar en cada entorno | `20260806100000_content_piece_channels` (canal → lista, copiando lo que hubiera), `20260806110000_content_atomization_and_approval_room` (`audioUrl`, `reviewReport`, `ContentPieceEvent`, `ContentApprovalLink`) y `20260806120000_content_piece_specificity` (`specificity`). Aplicadas en local con `prisma migrate deploy`. |
| **Locución del Reel** (§2) | **Hecho, sin motor arrancado** | `contentVoiceover.service.ts` locuta el guion con Chatterbox local y, si no responde, con ElevenLabs. El PCM de Chatterbox se envuelve en WAV —sin cabecera son muestras que ningún navegador reproduce—. Sin ningún motor, la pieza existe con el guion y el motivo de por qué no suena. |
| **Email a Mautic** (§2) | **Construido, sin cuenta conectada** | Al aprobarlo se crea la plantilla **despublicada y vinculada a la organización en el mismo paso**: crearla sin binding la dejaría huérfana y reclamable por otra organización desde el listado de no vinculadas. |
| **Stories a Instagram** (§2) | **Construido, con una suposición declarada** | Salen por el mismo endpoint de Metricool con `instagramData.type: 'STORY'`. Ese valor **no está verificado** contra la API real; si la cuenta lo rechaza, la pieza se queda aprobada sin publicar con el motivo de Metricool, que es el camino degradado ya cubierto. |
| **Enlace público de aprobación** (§3) | **Hecho** | `/aprobar/:token`, plan Agency. En la base solo vive el hash del token; caduca siempre (90 días por defecto) y se puede revocar. Con él se ve la cola, se comenta, se aprueba y se rechaza — y nada más: **aprobar desde fuera no publica**, deja la pieza aprobada para que la agencia cree el borrador. Un token inexistente, caducado o revocado devuelven el mismo 404. |
| **Cadencia de los lunes** (§1) | **Hecho** | `jobs/contentWeeklyRefresh.ts`, cron `0 7 * * 1`. Con patrón cron y no con "cada 7 días", que caería en el día en que se desplegó el worker. Una pasada por organización y semana, marcada en `settings.contentCadence`. |
| **"Aprobar todo" → borradores en Metricool** (§3) | Construido, sin poder probarse contra Metricool real | Aprueba en lote y crea el borrador de cada pieza con **su propio UTM**. Aprobar y publicar son pasos separados: si el borrador falla, la pieza sigue aprobada y se reintenta sin volver a decidir. Verificado en los dos caminos degradados —sin campaña con landing, y con Metricool desconectado—, que devuelven el motivo concreto por pieza. Falta probarlo con una cuenta de Metricool conectada. |
| **Imagen por pieza** (§2) | **Hecho** | `PUT /api/content/pieces/:id/image` fija la imagen de la pieza, y `imageUrl: null` la quita —quitarla es una decisión tan legítima como ponerla, y no merecía endpoint aparte—. El Estudio trae los dos botones reutilizando el flujo del copiloto: `POST /api/metricool/media` para subir y `POST /api/metricool/ai/image` para generar. **Conseguir la URL y decidir qué pieza la lleva son dos pasos**: si el PUT falla no hay que volver a subir el archivo. La URL se valida como http(s) descargable, no solo como URL —`javascript:` y `data:` pasan el `.url()` de zod y no son nada que Metricool pueda descargar—. Una pieza publicada ya no cambia de imagen: su borrador salió con la que tenía. Subir exige `PUBLIC_HOST` y generar exige `OPENAI_API_KEY`; sin ellas los endpoints de medios responden 409 diciendo cuál falta. |
| **El motivo de rechazo actualiza las preferencias** (§3) | **Hecho** | Rechazar recalcula `Organization.settings.contentPreferences`, y el Estudio las aplica al escribir. Se aprende por conteo, no con un modelo: **tres rechazos por el mismo motivo son una preferencia; uno es una opinión sobre una pieza concreta**. El umbral vive en `MIN_REJECTIONS_TO_LEARN`. |
| **Objetivo y canales en el Estudio** (§2) | **Hecho** | El Estudio se abre con el resumen de la oportunidad, el **objetivo** preseleccionado según su tipo y el selector de canales; generar es un segundo clic a propósito, porque cuesta una llamada al modelo y el objetivo cambia lo que se escribe. Los objetivos son un vocabulario cerrado (`PIECE_OBJECTIVES`): con texto libre no se podrían preseleccionar por tipo ni agregar después qué objetivo funciona. Los canales inválidos se caen en el backend en vez de fallar dentro de Metricool, donde el usuario ya no puede corregirlos. |
| **Euros por pieza** (§4) | **Hecho** | El cruce llega hasta el dinero: de los leads atribuidos se leen sus oportunidades del CRM y se enseñan **ganado y abierto por separado**. No se suman —lo abierto es expectativa, no ingreso— y lo perdido no cuenta en ninguna de las dos columnas: un lead con una venta perdida no aparece como "0 €", aparece como lo que es, un lead sin resultado económico atribuible. |
| **Leads y estado en pipeline por pieza** (§4) | **Hecho, con un límite declarado** | La tabla enseña visitas → leads → estado en pipeline por pieza. Antes contaba *todos* los eventos del UTM, así que sumaba las conversiones a las visitas: una pieza con 10 visitas y 2 leads enseñaba 12. Ahora la visita es solo `landing_view`, los leads se cuentan por `leadId` distinto y el tráfico pagado se descarta. **«Asistidos» no se puede medir**: el evento de conversión se identifica por huella de contacto y no conserva la sesión que vio la pieza, así que un lead que la vio y convirtió por otro camino no se puede reconstruir. Se cuenta lo directo y la pantalla lo dice en sus avisos. |
| **Dataset real** | Riesgo | El Radar se validó con `prisma/seed-radar-dev.ts` (señales plantadas y contadas). En producción hacen falta llamadas con transcripción: hoy la organización local tenía 108 llamadas y **cero** transcripciones. |

---

## 1. Radar (vista inicial — la pantalla estrella)

Sustituye al formulario de prompt actual como primera vista.

- **Cabecera:** "Vendrava ha analizado {N} conversaciones y ha encontrado
  {M} oportunidades de contenido esta semana." N = llamadas + hilos de inbox
  del período; M = oportunidades activas.
- **Tarjetas de oportunidad** (máx. 7), cada una con:
  - Tipo: objeción / pregunta frecuente / comparación con competidor /
    señal pre-compra / frase emocional / historia de éxito.
  - Titular de la oportunidad. *(Sin "formato sugerido": el Estudio genera
    siempre las seis piezas, así que sugerir un formato no tendría quién lo
    consumiera.)*
  - Objetivo (chip): el modo objetivo con el que se abrirá el Estudio, y que
    ahí se puede cambiar. El objetivo en texto libre que propone el análisis
    no es el chip; viaja al Estudio como "enfoque sugerido".
  - Evidencias: "8 menciones en 12 llamadas" + enlace "ver" que abre el
    detalle (conteos y paráfrasis; nunca transcripción cruda).
  - Acción primaria: **Generar campaña**.
- **Estado vacío honesto:** "Esta semana no hay suficientes señales para
  proponer contenido con evidencia. Conecta más llamadas o vuelve el lunes."
  (idea 26: nunca rellenar con genéricas).
- El generador libre actual (prompt manual) queda como acción secundaria
  "Crear desde una idea propia", en la cabecera del Radar: lleva al copiloto,
  que sigue viviendo al final de la página.

## 2. Estudio (generación de la campaña)

Se abre al pulsar "Generar campaña" en una tarjeta.

- Resumen de la oportunidad + selector de **objetivo** (preseleccionado
  según el tipo) y canales. Los objetivos son seis: educar, resolver la
  objeción, diferenciarnos, convertir, conectar, demostrar. Generar es un
  segundo clic: el objetivo y los canales cambian lo que se escribe, y la
  llamada al modelo cuesta.
- Genera las **seis piezas** de la oportunidad: post, carrusel (slides de texto
  *y* maquetadas con la plantilla de marca), guion de Reel (hook 3 s +
  desarrollo + CTA), **3 stories** —gancho, desarrollo y cierre, cada una con
  su interacción sugerida—, **email** (asunto, preheader y cuerpo en texto
  plano) y **locución** del guion de Reel.
- Cada pieza se muestra con la **voz del dueño** aplicada (perfil de estilo
  extraído de sus transcripciones), las evidencias que la justifican al pie y
  lo que vio el editor adversario: la PII que eliminó, si la hubo, y sus pegas.
- Imagen por pieza: subir o generar. Se guarda en la pieza —no en el
  navegador— y viaja con ella hasta el borrador.
- Los colores y el logo de las slides se editan en **Marca y aprobación
  externa**, al final de la página. Sin ellos la plantilla usa unos colores
  neutros por defecto y lo dice, en vez de inventarse los de la marca.
- **Editar la locución no la vuelve a grabar.** El audio se sintetiza al
  generar; si alguien edita ese texto en la Sala, la pieza avisa de que lo que
  suena ya no es lo que se lee y hay que volver a generar. Se dice antes de
  aprobar, que es cuando sirve.

## 3. Sala de aprobación

Sustituye al botón suelto "crear borrador" por pieza.

- Cola de piezas pendientes con tres acciones: **Aprobar · Editar · Rechazar**.
- Rechazar exige motivo (un clic entre opciones + texto libre opcional);
  el motivo actualiza automáticamente las preferencias del negocio.
- **Comentarios e historial por pieza**: quién la envió, quién la editó, quién
  la aprobó y qué comentó cada uno, en una sola lista por orden. El historial
  se pide al abrirlo, no con la cola: son hasta 200 líneas por pieza.
- "Aprobar todo" crea el borrador de cada pieza **por su camino**: post,
  carrusel y stories van a Metricool; el email se crea como plantilla en
  Mautic; la locución no se publica sola.
- Cada pieza aprobada lleva UTM propio hacia la landing de la campaña.
- **Enlace de solo-aprobación para clientes** (plan Agency): una URL con token,
  sin login y sin CRM. Ve la cola, comenta, aprueba y rechaza con motivo — y
  ahí acaba: aprobar desde fuera no publica, porque publicar consume la
  integración del negocio y es decisión suya.

## 4. Resultados

Sección propia dentro de la página, con las métricas del circuito de contenido.
Las métricas que reporta Metricool siguen en su sección, aparte: miden alcance
de la cuenta, no el rendimiento de estas piezas.

- Las tres métricas del MVP: tiempo ahorrado, % aprobado (y sin editar),
  leads atribuidos por pieza. **"Asistidos" se queda fuera y se dice**: el
  evento de conversión se identifica por huella de contacto y no conserva la
  sesión que vio la pieza, así que un lead que la vio y convirtió por otro
  camino no se puede reconstruir sin inventárselo.
- Por pieza publicada: visitas de su UTM → leads → estado en pipeline → euros.
  Visita es solo `landing_view`; los leads se cuentan por lead distinto, no
  por formularios enviados; el tráfico pagado se descarta, porque una pieza
  orgánica no se apunta los leads que trajo un anuncio a la misma landing.
- **Euros ganados y euros abiertos, en columnas distintas y sin sumarse.** Lo
  ganado existe; lo abierto es expectativa, y sumarlos daría una cifra que no
  es ninguna de las dos. Lo perdido no cuenta en ninguna. Sin oportunidades en
  el CRM para esos leads se dice que no hay nada que medir, en vez de enseñar
  un 0 que se leería como "el contenido no vendió".

## Navegación

`Radar → (Generar campaña) → Estudio → (Enviar a aprobación) → Sala → (Publicar) → Resultados`

Cada vista es una sección/pestaña dentro de la página; el estado de conexión
con Metricool se mantiene como banner superior, como hoy.
