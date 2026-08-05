# Xarly — roadmap técnico por fases

Orden acordado: **11 + 13 + 23 + 27 → 8 → 16 → 19**. Cada fase termina con
algo usable por la organización demo; ninguna fase depende de una posterior.

## Fase 1 — Conocimiento real (ideas 11, 13, 23, 27) · esta semana

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

## Fase 2 — Producción completa (idea 8) · semana 2

- Atomización total: de una oportunidad, además de post/carrusel/reel —
  locución (stack TTS propio), 3 stories y email (integración Mautic ya
  existente en Email marketing).
- Editor adversario (idea 21): toda pieza pasa por crítica + reescritura
  antes de mostrarse; incluye el chequeo de PII y el de especificidad.
- Carruseles con plantilla de marca (idea 7): plantillas SVG con logo y
  colores de la organización; la IA solo rellena textos.

## Fase 3 — Aprobación y aprendizaje (idea 16) · semana 3

- Sala de aprobación completa: cola por estado, comentarios por pieza,
  historial, y enlace público de solo-aprobación para clientes de agencias
  (plan Agency).
- Los motivos de rechazo actualizan automáticamente las preferencias del
  negocio (se añaden al perfil de voz y al brand book; sin promesas de
  "reentrenar la IA").
- Cadencia semanal automática: cron que regenera oportunidades cada lunes y
  notifica ("7 oportunidades nuevas esta semana").

## Fase 4 — Demostración económica (idea 19) · semana 4

- UTM por pieza ya emitido en fase 1; aquí se cierra el cruce completo:
  visita UTM → lead (`AcquisitionEvent`) → llamada → etapa de pipeline.
- Panel Resultados: por pieza, "X visitas, Y leads, Z ventas atribuidas o
  asistidas". Siempre lenguaje de atribución prudente.
- Métricas del MVP visibles para el negocio: tiempo ahorrado acumulado,
  % aprobado, euros asistidos por el contenido.

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
- **Coste LLM**: el análisis semanal es batch (1 pasada por org/semana),
  no por petición; cachear el perfil de voz.
- **Privacidad**: la seudonimización es bloqueante para salir de fase 1; sin
  ella no se envía ninguna transcripción al LLM.
