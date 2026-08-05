# Xarly — esta semana (5–9 agosto 2026)

Objetivo de la semana: **el Radar funcionando de verdad** — la pantalla
estrella con oportunidades reales extraídas de llamadas, CRM e inbox, y el
botón "Generar campaña" produciendo las tres piezas. Aprobación y atribución
quedan esbozadas, no completas.

## Día 1 — Detector de oportunidades (backend)

- [ ] Modelo `ContentOpportunity` en Prisma: `orgId`, `type` (objection |
      faq | competitor | pre_purchase | emotional | success_story), `title`,
      `summary`, `objective`, `evidenceCount`, `sourceRefs` (Json: ids de
      `Call`/`Conversation`), `status` (proposed | generated | dismissed),
      `weekOf`, timestamps. Migración.
- [ ] `contentOpportunity.service.ts`: job que toma las llamadas con
      `transcript` y los hilos de inbox de los últimos 7 días del `orgId`,
      **seudonimiza** (regex + lista de nombres de contactos → tokens) y pide
      al LLM las oportunidades con conteos y refs. Persiste máx. 7, mín. 3
      con evidencia real; si no llega, guarda menos.
- [ ] Test con transcripciones sintéticas: detecta una objeción repetida y
      no inventa evidencias (los `sourceRefs` deben existir).

## Día 2 — API + pantalla Radar (frontend)

- [ ] Rutas: `GET /api/content/opportunities` (semana actual + contadores
      de conversaciones analizadas), `POST /api/content/opportunities/refresh`,
      `POST /api/content/opportunities/:id/dismiss`.
- [ ] `ConectarRedesPage`: la vista inicial pasa a ser el Radar — cabecera
      "Vendrava ha analizado N conversaciones…" + tarjetas con la anatomía
      exacta de `README.md`. El generador libre queda como acción secundaria.
- [ ] Estado vacío honesto (sin datos → mensaje, nunca tarjetas de relleno).

## Día 3 — Voz del dueño + generación de las 3 piezas

- [ ] `ownerVoice.service.ts`: perfil de estilo por organización extraído de
      las intervenciones del lado "agente humano/dueño" en transcripciones
      (muletillas, longitud de frase, expresiones). Se guarda en
      `Organization.settings` y se regenera semanalmente.
- [ ] Ampliar `generateSocialContentPlan`: entrada = oportunidad (tipo,
      resumen, evidencias) + objetivo + perfil de voz + contexto de marca
      (Base de conocimiento). Salida estructurada: `post`, `carousel`
      (título + 5–7 slides), `reelScript` (hook/desarrollo/cta).
- [ ] Chequeo de especificidad (idea 27): lo genérico se marca y se
      sustituye por datos de la base de conocimiento; nada inventado.

## Día 4 — Estudio + sala de aprobación mínima

- [ ] Vista Estudio: al pulsar "Generar campaña" se generan y muestran las
      tres piezas con sus evidencias al pie; selector de objetivo y canales.
- [ ] Aprobación mínima: Aprobar / Editar / Rechazar con motivo por pieza.
      Persistir el feedback (`ContentPieceFeedback` o Json en la pieza) —
      aunque el aprendizaje se explote en fase 2, los datos se guardan desde
      el día uno.
- [ ] "Aprobar todo" → borradores en Metricool en lote (reutiliza
      `createDraftPost`), cada pieza con UTM propio.

## Día 5 — Métricas, privacidad y cierre

- [ ] Registro de métricas MVP: minutos ahorrados estimados por pieza
      aprobada, % aprobado / % sin editar, y visitas-leads por UTM
      (`AcquisitionEvent` ya captura la entrada por landing).
- [ ] Revisión de privacidad: verificar que ningún prompt al LLM contiene
      PII sin seudonimizar; que las tarjetas solo muestran agregados; que
      las citas literales exigen `ContactConsent`.
- [ ] Pasada de QA del circuito completo con la org demo y ajuste de copys.

## Fuera de esta semana

Locución/stories/email (atomización completa), niveles de piloto
automático, informe narrado, aprendizaje activo desde rechazos, y el panel
de resultados completo. Ver [`roadmap.md`](roadmap.md).
