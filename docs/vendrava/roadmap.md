# Vendrava — roadmap técnico por fases

Orden acordado: **11 + 13 + 23 + 27 → 8 → 16 → 19**. Cada fase termina con
algo usable por la organización demo; ninguna fase depende de una posterior.

## Estado por fases

| Fase | Estado |
|---|---|
| **1 — Conocimiento real** | **Hecha.** Detector, seudonimización, voz del dueño, Radar y chequeo de especificidad (idea 27) construidos y probados. La sustitución es determinista y cita el documento del que sale cada dato; lo que no tiene dato se marca en vez de rellenarse. |
| **2 — Producción completa** | **Hecha.** De una oportunidad salen seis piezas —post, carrusel, guion de Reel, 3 stories, email y locución—; todas pasan por el editor adversario (idea 21) y el carrusel se maqueta con la plantilla de marca (idea 7). |
| **3 — Aprobación y aprendizaje** | **Hecha.** Cola con edición, aprobación y rechazo con motivo que actualiza las preferencias, más comentarios, historial, enlace público de solo-aprobación (plan Agency) y el cron de los lunes. |
| **4 — Demostración económica** | **Hecha.** UTM por pieza y el cruce completo: visitas → leads → etapa de pipeline → euros ganados y abiertos, separados y nunca sumados. |

Lo que queda no es una fase: es lo que no se puede comprobar sin producción
—cuentas reales de Metricool y Mautic, motor de voz arrancado— y está en
[Límites declarados](#límites-declarados).

Detalle de pantallas en [`pantallas.md`](pantallas.md) §0; día a día en
[`semana.md`](semana.md).

## Fase 1 — Conocimiento real (ideas 11, 13, 23, 27)

Detector de oportunidades sobre llamadas + inbox + CRM, voz del dueño,
especificidad verificada y la pantalla Radar. Detalle en
[`semana.md`](semana.md).

**Infraestructura que ya existe y se reutiliza:**

| Necesidad | Ya existe |
|---|---|
| Transcripciones | `Call.transcript`, `transcriptWords` |
| Inbox | `Conversation`, `Message` |
| CRM | `Lead`, `Opportunity`, `OpportunityStageHistory` |
| Consentimiento | `ContactConsent` |
| Contexto de marca | `KnowledgeBase`, `Organization` |
| Publicación | `metricoolSync.service` (`createDraftPost`), `/api/metricool/*` |
| Atribución de entrada | `AcquisitionEvent`, landings con slug por campaña |

## Fase 2 — Producción completa (ideas 8, 21, 7)

- **Atomización total**: de una oportunidad salen seis piezas. Las cinco
  escritas las genera el modelo en una sola llamada; la **locución**
  (`contentVoiceover.service.ts`) es el guion de Reel ya revisado pasado por el
  stack TTS propio —Chatterbox local primero, ElevenLabs si no responde—, y el
  **email** se crea como plantilla despublicada en Mautic al aprobarlo,
  vinculada a la organización en el mismo paso para que no quede huérfana.
- **Editor adversario** (`contentCritic.service.ts`): ninguna pieza se enseña
  sin pasar por tres pasos, en este orden. (1) PII, bloqueante y siempre, con
  clave o sin ella; el teléfono del propio negocio no se enmascara, que es una
  llamada a la acción y no una fuga. (2) Especificidad. (3) Crítica y
  reescritura, y **la reescritura vuelve a pasar los dos pasos anteriores**: si
  introduce PII o queda más genérica que el original, se descarta y se conserva
  la versión anterior.
- **Carruseles con plantilla de marca** (`brandCarousel.service.ts`): SVG de
  1080×1080 con los colores y el logo de `Organization.settings.brand`. El logo
  se empotra en base64 porque un `<image href>` externo no se carga al
  rasterizar el SVG en un canvas, que es justo lo que hace el Estudio para
  convertirlo en el PNG que Metricool descarga.

## Fase 3 — Aprobación y aprendizaje (idea 16)

- **Sala completa**: cola por estado, comentarios e historial por pieza
  (`ContentPieceEvent`, una sola tabla para los dos porque se leen juntos) y
  enlace público de solo-aprobación para clientes de agencias (plan Agency).
  Del enlace se guarda solo el hash, caduca siempre y se puede revocar; con él
  se puede ver, comentar, aprobar y rechazar, y nada más.
- **Los motivos de rechazo actualizan las preferencias del negocio** por
  conteo: tres rechazos por el mismo motivo son una preferencia, uno es una
  opinión sobre una pieza. Sin promesas de "reentrenar la IA".
- **Cadencia semanal** (`jobs/contentWeeklyRefresh.ts`): cron los lunes a las
  7:00 que regenera oportunidades y perfil de voz por organización y notifica
  ("7 oportunidades nuevas esta semana"). Una vez por semana y organización,
  marcado en `Organization.settings.contentCadence`: un reintento del job no
  vuelve a pagar la llamada al modelo. Si la semana no da oportunidades, no se
  manda correo — un aviso semanal de "cero" enseña a ignorar los avisos.

## Fase 4 — Demostración económica (idea 19)

- UTM por pieza emitido en fase 1; aquí se cierra el cruce completo:
  visita UTM → lead (`AcquisitionEvent`) → llamada → etapa de pipeline → euros.
- Panel Resultados: por pieza, visitas → leads → estado en pipeline →
  **ganado / abierto**. Las dos cifras de euros se enseñan separadas y no se
  suman nunca: lo abierto es expectativa, no ingreso, y lo perdido no cuenta en
  ninguna de las dos.
- Métricas del MVP visibles para el negocio: tiempo ahorrado acumulado,
  % aprobado, % sin editar, leads atribuidos y euros.

## Límites declarados

Lo que está construido y **no se ha podido probar contra el sistema real**, que
no es lo mismo que estar sin hacer:

- **Metricool y Mautic**: los borradores de post, de story y la plantilla de
  email se crean con los caminos degradados verificados (sin conexión, sin
  campaña con landing), pero no contra una cuenta conectada. El tipo `STORY` de
  Instagram sigue la nomenclatura del resto del payload y **no está verificado**
  contra la API.
- **Locución**: sin el servidor Chatterbox arrancado (`CHATTERBOX_URL`) ni
  `ELEVENLABS_API_KEY`, la pieza existe con el guion y el motivo de por qué
  todavía no suena.
- **Carruseles**: el backend compone el SVG; el PNG que Metricool necesita lo
  rasteriza el navegador. Sin `PUBLIC_HOST` las slides se componen pero no se
  pueden servir.
- **Enlace de aprobación**: la URL se compone con `PUBLIC_APP_URL` (o
  `PUBLIC_HOST`); sin ninguna de las dos el token se crea igual, pero la URL
  sale sin dominio.

## Después (backlog priorizado)

1. Piloto automático por niveles de confianza (idea 15).
2. Casos de éxito automáticos al ganar un lead (idea 12).
3. El dato de la semana (idea 14) e informe mensual narrado (idea 17).
4. Director creativo IA con onboarding por voz (idea 1) y obra maestra
   mensual (idea 30).
5. Aplazadas conscientemente: 9, 10, 18, 25, 28, 29 (ver
   [`../ideas-agencia-contenido.md`](../ideas-agencia-contenido.md)).

## Riesgos conocidos

- **Calidad de transcripción**: si las llamadas de la org demo tienen poco
  transcript, el Radar queda vacío — preparar dataset sintético de demo.
  **Confirmado, y peor de lo previsto:** la organización local tenía 108
  llamadas y **cero** transcripciones. El dataset sintético existe
  (`prisma/seed-radar-dev.ts`) con señales plantadas y contadas —plazo ×8,
  pago ×5, competidor ×3, ruido ×4 y financiación ausente a propósito— para
  poder comprobar tanto que encuentra lo que hay como que no inventa lo que no
  está. En producción sigue haciendo falta que las llamadas se transcriban.
- **Coste LLM**: el análisis semanal es batch (1 pasada por org/semana), y
  generar una campaña son 1 llamada de redacción + 5 de crítica, lanzadas en
  paralelo. Cachear el perfil de voz.
- **Privacidad**: la seudonimización es bloqueante antes del LLM, y el editor
  adversario enmascara la PII que se cuele en el sentido contrario —de la pieza
  hacia fuera—, que es el único fallo irreversible una vez publicado.
