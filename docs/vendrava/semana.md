# Vendrava — esta semana (5–9 agosto 2026)

Objetivo de la semana: **el Radar funcionando de verdad** — la pantalla
estrella con oportunidades reales extraídas de llamadas, CRM e inbox, y el
botón "Generar campaña" produciendo las tres piezas. Aprobación y atribución
quedan esbozadas, no completas.

Este documento es el registro de **esa** semana y se lee así: las casillas
dicen lo que se construyó del 5 al 9 de agosto. Lo que vino después —de tres
piezas a seis, la sala completa, la atribución hasta euros— está en
[`roadmap.md`](roadmap.md), y aquí solo se menciona cuando cambia lo que
significa una casilla.

## Estado

Los cinco días están hechos. Las marcas de arriba dicen "se construyó"; estas
salvedades dicen **con qué límites**, que es lo que evita descubrirlos por
sorpresa:

- **La cadencia automática ya existe** (`jobs/contentWeeklyRefresh.ts`, fase 3):
  cron los lunes a las 7:00 que recalcula oportunidades y perfil de voz y avisa.
  El refresco manual de la página sigue estando, para no tener que esperar al
  lunes.
- **La generación no amplió `generateSocialContentPlan`**, sino que vive en
  `contentStudio.service.ts`. La salida del día 3 eran tres piezas; con la
  fase 2 son seis —se suman 3 stories, email y locución—. El generador libre
  antiguo sigue intacto para el prompt manual.
- **El perfil de voz es determinista**, no sale de un LLM: muletillas, longitud
  de frase y trato son medibles, y así funciona sin clave y es reproducible.
- **El chequeo de especificidad sustituye solo lo que queda bien escrito.** De
  la base de conocimiento no se pega la frase entera, sino la parte que encaja
  en el hueco ("amplia experiencia" → "experiencia desde 2019"). Las vaguedades
  sin una forma limpia de sustituirse —"líderes del sector", "soluciones a
  medida"— se marcan y las resuelve quien revisa: con la base de conocimiento
  vacía, el chequeo solo puede marcar, y lo dice en pantalla.
- **Sin `CLAUDE_API_KEY` el detector no analiza** y las piezas salen de un
  respaldo determinista. Todo lo demás funciona sin clave, incluidos los dos
  pasos deterministas del editor adversario —PII y especificidad—, que son los
  que protegen; lo único que no corre sin clave es la crítica.
- **Nadie cita a un cliente, y no porque el prompt lo pida.** El README exige
  `ContactConsent` y aprobación expresa para usar una cita literal; como no
  existe forma de dar ese consentimiento por pieza, la regla implementada es la
  mitad que se sostiene sola: **no se cita nunca**. Lo que devuelve el modelo se
  compara palabra a palabra contra el material del que salió
  (`findLiteralQuote`); si el título o el resumen copian a alguien, la
  oportunidad entera se cae, y si lo copia la evidencia, se cae solo ella. El
  corte está en el detector porque es el único punto donde el texto crudo toca
  al modelo: las piezas se escriben desde la oportunidad, sin ver la
  transcripción.
- La pasada de QA se hizo sobre `prisma/seed-radar-dev.ts` (señales plantadas y
  contadas), no sobre conversaciones reales: la organización local tenía 108
  llamadas y **cero transcripciones**. El circuito completo sí se recorrió
  después a mano —Radar → Estudio → Sala → Resultados— sobre la organización
  demo; lo que sigue sin probarse contra un modelo real es todo lo que necesita
  `CLAUDE_API_KEY`, que está vacía: detector, redacción y crítica del editor
  adversario solo han corrido en modo determinista.

## Día 1 — Detector de oportunidades (backend)

- [x] Modelo `ContentOpportunity` en Prisma: `orgId`, `type` (objection |
      faq | competitor | pre_purchase | emotional | success_story), `title`,
      `summary`, `objective`, `evidenceCount`, `sourceRefs` (Json: ids de
      `Call`/`Conversation`), `status` (proposed | generated | dismissed),
      `weekOf`, timestamps. Migración.
- [x] `contentOpportunity.service.ts`: job que toma las llamadas con
      `transcript` y los hilos de inbox de los últimos 7 días del `orgId`,
      **seudonimiza** (regex + lista de nombres de contactos → tokens) y pide
      al LLM las oportunidades con conteos y refs. Persiste máx. 7, mín. 3
      con evidencia real; si no llega, guarda menos.
- [x] Test con transcripciones sintéticas: detecta una objeción repetida y
      no inventa evidencias (los `sourceRefs` deben existir).

## Día 2 — API + pantalla Radar (frontend)

- [x] Rutas: `GET /api/content/opportunities` (semana actual + contadores
      de conversaciones analizadas), `POST /api/content/opportunities/refresh`,
      `POST /api/content/opportunities/:id/dismiss`.
- [x] `ConectarRedesPage`: la vista inicial pasa a ser el Radar — cabecera
      "Vendrava ha analizado N conversaciones…" + tarjetas con la anatomía
      exacta de `README.md`. El generador libre queda como acción secundaria.
- [x] Estado vacío honesto (sin datos → mensaje, nunca tarjetas de relleno).

## Día 3 — Voz del dueño + generación de las 3 piezas

- [x] `ownerVoice.service.ts`: perfil de estilo por organización extraído de
      las intervenciones del lado "agente humano/dueño" en transcripciones
      (muletillas, longitud de frase, expresiones). Se guarda en
      `Organization.settings` y se regenera semanalmente.
- [x] Ampliar `generateSocialContentPlan`: entrada = oportunidad (tipo,
      resumen, evidencias) + objetivo + perfil de voz + contexto de marca
      (Base de conocimiento). Salida estructurada: `post`, `carousel`
      (título + 5–7 slides), `reelScript` (hook/desarrollo/cta).
- [x] Chequeo de especificidad (idea 27): lo genérico se marca y se
      sustituye por datos de la base de conocimiento; nada inventado.
      `contentSpecificity.service.ts` — determinista y citable: cada
      sustitución guarda de qué documento sale. Los datos verificados entran
      además en el prompt antes de escribir.

## Día 4 — Estudio + sala de aprobación mínima

- [x] Vista Estudio: al pulsar "Generar campaña" se generan y muestran las
      tres piezas con sus evidencias al pie; selector de objetivo y canales.
      Desde la fase 2 son seis y el botón lo dice ("Generar la campaña (6
      piezas)"): la vista es la misma, la tanda es mayor.
- [x] Aprobación mínima: Aprobar / Editar / Rechazar con motivo por pieza.
      Persistir el feedback (`ContentPieceFeedback` o Json en la pieza) —
      aunque el aprendizaje se explote en fase 2, los datos se guardan desde
      el día uno. De las dos vías se tomó la segunda: `rejectionReason` en la
      pieza y, con la fase 3, `ContentPieceEvent` para comentarios e historial.
      No hay tabla `ContentPieceFeedback`.
- [x] "Aprobar todo" → borradores en Metricool en lote (reutiliza
      `createDraftPost`), cada pieza con UTM propio.

## Día 5 — Métricas, privacidad y cierre

- [x] Registro de métricas MVP: minutos ahorrados estimados por pieza
      aprobada, % aprobado / % sin editar, y visitas-leads por UTM
      (`AcquisitionEvent` ya captura la entrada por landing).
- [x] Revisión de privacidad: verificar que ningún prompt al LLM contiene
      PII sin seudonimizar; que las tarjetas solo muestran agregados; que
      las citas literales exigen `ContactConsent`. Las dos primeras se
      comprueban en el código (seudonimización bloqueante con red de seguridad
      `findResidualPii`, y evidencias que devuelven referencias y conteos, nunca
      texto de la llamada). La tercera se cerró por el lado seguro: no hay
      manera de registrar el consentimiento por pieza, así que **no se cita**, y
      el detector lo verifica en vez de confiarlo al prompt.
- [x] Pasada de QA del circuito completo con la org demo y ajuste de copys.

## Fuera de esta semana

Quedaron fuera locución, stories y email (atomización completa), los niveles
de piloto automático, el informe narrado, el aprendizaje desde rechazos y el
panel de resultados completo.

De esa lista **ya solo siguen fuera el piloto automático y el informe
narrado**: la atomización llegó con la fase 2, y el aprendizaje desde rechazos
y el panel completo con las fases 3 y 4. El estado real por fases, con sus
límites, está en [`roadmap.md`](roadmap.md).
