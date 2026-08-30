import { z } from 'zod'
import { common, registerStructuredApp } from './growthSalesPack.shared'

const str = z.string().trim().min(1)
const url = z.string().trim().url()
const missingLiteral = (corpus: string, excerpts: string[]) => excerpts.some(excerpt => !corpus.includes(excerpt.trim()))
const duplicateNormalized = (values: string[]) => new Set(values.map(value => value.trim().toLocaleLowerCase('es'))).size !== values.length
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
const containsDeclaredTool = (corpus: string, tool: string) => {
  const escaped = normalized(tool).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_-])${escaped}(?:$|[^\\p{L}\\p{N}_-])`, 'u').test(normalized(corpus))
}
const hasPositiveConsentEvidence = (value: string | undefined) => {
  if (!value?.trim()) return false
  const text = normalized(value)
  if (/(?:no|sin|ausente|falta|pendiente|revocad\w*|denegad\w*)[^.\n]{0,45}(?:consentimiento|permiso|autorizacion)/.test(text)) return false
  return /(?:consentimiento|permiso|autorizacion)[^.\n]{0,60}(?:expres\w*|otorgad\w*|registrad\w*|documentad\w*|aceptad\w*)|(?:aceptad\w*|otorgad\w*)[^.\n]{0,45}(?:consentimiento|permiso|autorizacion)/.test(text)
}

// 16 — Generador de propuesta comercial
registerStructuredApp({
  id: 'commercial-proposal-generator', name: 'Generador de propuesta comercial', category: 'sales',
  promise: 'Propuesta comercial personalizada con alcance, inversión, ROI trazable y próximos pasos',
  inputSchema: z.object({ customer: str.max(200), discoveryNotes: str.max(12000), offer: str.max(6000), pricing: str.max(3000), proof: str.max(4000), terms: z.string().max(3000).optional() }),
  outputSchema: z.object({ executiveSummary: str, understoodSituation: z.object({ goals: z.array(str), problems: z.array(str), constraints: z.array(str), unknowns: z.array(str) }), proposedSolution: z.array(z.object({ phase: str, deliverables: z.array(str), customerResponsibilities: z.array(str), acceptanceCriteria: z.array(str) })), timeline: z.array(z.object({ milestone: str, timing: str, dependency: str })), investment: z.array(z.object({ item: str, amount: str, assumptions: z.array(str) })), roiCase: z.object({ formula: str, inputs: z.array(z.object({ name: str, value: z.string().nullable(), source: str })), result: z.string().nullable(), caveats: z.array(str) }), objections: z.array(z.object({ objection: str, response: str, evidence: str })), nextSteps: z.array(str), legalReviewFlags: z.array(str) }),
  uiSchema: [
    { key: 'customer', label: 'Cliente', widget: 'text' }, { key: 'discoveryNotes', label: 'Notas de descubrimiento', widget: 'textarea', sensitive: true },
    { key: 'offer', label: 'Oferta', widget: 'textarea' }, { key: 'pricing', label: 'Precios', widget: 'textarea', sensitive: true },
    { key: 'proof', label: 'Pruebas', widget: 'textarea' }, { key: 'terms', label: 'Condiciones', widget: 'textarea' },
  ],
  system: 'Eres consultor de preventa. El ROI usa fórmulas visibles, deja en null los datos ausentes y no presenta estimaciones como garantía.',
  instructions: 'Entrega executiveSummary, understoodSituation, proposedSolution por fases, timeline, investment, roiCase trazable, objections, nextSteps y legalReviewFlags.',
  validateResult: (data) => [
    ...(duplicateNormalized(data.proposedSolution.map((item: any) => item.phase)) ? ['Las fases de la propuesta deben ser únicas'] : []),
    ...(data.roiCase.result != null && data.roiCase.inputs.some((item: any) => item.value == null) ? ['No puede calcularse ROI con inputs sin valor'] : []),
    ...(data.proposedSolution.some((item: any) => item.acceptanceCriteria.length === 0) ? ['Cada fase necesita criterios de aceptación'] : []),
  ],
  followUps: [{ kind: 'create_document', label: 'Crear documento de propuesta' }],
})

// 17 — Detector de oportunidades de expansión
registerStructuredApp({
  id: 'expansion-opportunity-detector', name: 'Detector de oportunidades de expansión', category: 'success',
  promise: 'Upsell, cross-sell y renovación priorizados desde uso, resultados y señales de cuenta',
  inputSchema: z.object({ customer: str.max(200), currentProducts: str.max(5000), usageAndResults: str.max(12000), catalog: str.max(8000), relationshipSignals: str.max(5000), renewalDate: z.string().max(80).optional() }),
  outputSchema: z.object({ accountHealth: z.object({ score: common.score, status: z.enum(['healthy', 'watch', 'at_risk']), reasons: z.array(str) }), opportunities: z.array(z.object({ type: z.enum(['upsell', 'cross_sell', 'renewal', 'adoption']), product: str, evidence: z.array(str), customerValue: str, confidence: common.confidence, timing: str, message: str, risk: str })).max(12), noFitProducts: z.array(z.object({ product: str, reason: str })), renewalRisks: z.array(z.object({ risk: str, earlySignal: str, mitigation: str })), nextBestActions: z.array(str) }),
  uiSchema: [
    { key: 'customer', label: 'Cliente', widget: 'text' }, { key: 'currentProducts', label: 'Productos actuales', widget: 'textarea' },
    { key: 'usageAndResults', label: 'Uso y resultados', widget: 'textarea', sensitive: true }, { key: 'catalog', label: 'Catálogo disponible', widget: 'textarea' },
    { key: 'relationshipSignals', label: 'Señales de relación', widget: 'textarea', sensitive: true }, { key: 'renewalDate', label: 'Fecha de renovación', widget: 'text' },
  ],
  system: 'Eres Customer Success orientado a valor. No recomienda un producto sin evidencia de necesidad y trata el riesgo de churn antes del upsell.',
  instructions: 'Entrega accountHealth, opportunities tipadas con evidencia/confianza, noFitProducts, renewalRisks y nextBestActions.',
  validateResult: (data) => [
    ...(duplicateNormalized(data.opportunities.map((item: any) => `${item.type}:${item.product}`)) ? ['Las oportunidades de expansión no pueden repetirse'] : []),
    ...(data.opportunities.some((item: any) => item.evidence.length === 0 && item.confidence !== 'baja') ? ['Una oportunidad sin evidencia debe tener confianza baja'] : []),
    ...(data.accountHealth.status === 'at_risk' && data.renewalRisks.length === 0 ? ['Una cuenta at_risk necesita riesgos de renovación explícitos'] : []),
  ],
  followUps: [{ kind: 'create_task', label: 'Crear tareas de expansión' }],
})

// 18 — Rescatador de oportunidades estancadas
registerStructuredApp({
  id: 'stalled-deal-rescuer', name: 'Rescatador de oportunidades estancadas', category: 'sales',
  promise: 'Diagnóstico del bloqueo y secuencia de reactivación multihilo sin presión vacía',
  inputSchema: z.object({ account: str.max(200), dealHistory: str.max(16000), lastContact: str.max(6000), stage: str.max(200), value: str.max(200), knownStakeholders: z.string().max(5000).optional() }),
  outputSchema: z.object({ stallDiagnosis: z.array(z.object({ hypothesis: str, evidence: z.array(str), confidence: common.confidence, disconfirmingQuestion: str })), primaryBlocker: str, missingCommitments: z.array(str), rescueSequence: z.array(z.object({ day: z.number().int().nonnegative(), channel: z.enum(['email', 'call', 'linkedin', 'meeting']), stakeholder: str, purpose: str, message: str, stopCondition: str })).min(2), giveGetOptions: z.array(z.object({ give: str, ask: str })), closeLostCriteria: z.array(str) }),
  uiSchema: [
    { key: 'account', label: 'Cuenta', widget: 'text' }, { key: 'dealHistory', label: 'Historial', widget: 'textarea', sensitive: true },
    { key: 'lastContact', label: 'Último contacto', widget: 'textarea', sensitive: true }, { key: 'stage', label: 'Etapa', widget: 'text' },
    { key: 'value', label: 'Valor', widget: 'text' }, { key: 'knownStakeholders', label: 'Stakeholders', widget: 'textarea' },
  ],
  system: 'Eres coach de deals. Un silencio no demuestra su causa: formula hipótesis falsables y protege la relación con condiciones de parada.',
  instructions: 'Entrega stallDiagnosis con evidencia y pregunta de falsación, primaryBlocker, missingCommitments, rescueSequence, giveGetOptions y closeLostCriteria.',
  validateResult: (data) => [
    ...(data.rescueSequence.some((item: any, index: number) => index > 0 && item.day <= data.rescueSequence[index - 1].day) ? ['La secuencia de rescate debe avanzar en días estrictamente crecientes'] : []),
    ...(data.rescueSequence.some((item: any) => !item.stopCondition.trim()) ? ['Cada contacto necesita una condición de parada'] : []),
    ...(data.stallDiagnosis.some((item: any) => item.evidence.length === 0 && item.confidence !== 'baja') ? ['Una hipótesis sin evidencia debe tener confianza baja'] : []),
  ],
  followUps: [{ kind: 'create_tasks', label: 'Programar secuencia de rescate' }],
})

// 19 — Investigador de objeciones del sector
registerStructuredApp({
  id: 'sector-objection-researcher', name: 'Investigador de objeciones del sector', category: 'research',
  promise: 'Biblioteca sectorial de objeciones con evidencia pública, respuesta y prueba necesaria',
  inputSchema: z.object({ sector: str.max(200), offer: str.max(3000), market: str.max(300), knownObjections: z.string().max(8000).optional(), competitors: z.string().max(2000).optional() }),
  outputSchema: z.object({ objections: z.array(z.object({ objection: str, category: z.enum(['precio', 'riesgo', 'prioridad', 'confianza', 'cambio', 'legal', 'tecnica', 'otra']), prevalence: z.enum(['frecuente', 'posible', 'no_determinada']), sourceNumbers: z.array(z.number().int().positive()), underlyingConcern: str, response: str, proofNeeded: str, qualifyingQuestion: str })), unsupportedAssumptions: z.array(str), evidencePlan: z.array(z.object({ missingProof: str, howToCreate: str })), playbookSummary: z.array(str) }),
  uiSchema: [
    { key: 'sector', label: 'Sector', widget: 'text' }, { key: 'offer', label: 'Oferta', widget: 'textarea' },
    { key: 'market', label: 'Mercado/país', widget: 'text' }, { key: 'knownObjections', label: 'Objeciones conocidas', widget: 'textarea' },
    { key: 'competitors', label: 'Competidores', widget: 'textarea' },
  ],
  system: 'Eres investigador de ventas. Frecuencia solo puede afirmarse si la evidencia lo permite; de lo contrario usa no_determinada.',
  instructions: 'Entrega objections con sourceNumbers (puede ser [] para objeciones aportadas por usuario), unsupportedAssumptions, evidencePlan y playbookSummary.',
  researchQueries: (i) => [`${i.sector} ${i.market} problemas compradores`, `${i.sector} software complaints OR challenges`, `${i.sector} procurement objections ${i.offer.slice(0, 80)}`],
  validateResult: (data) => [
    ...(duplicateNormalized(data.objections.map((item: any) => item.objection)) ? ['Las objeciones sectoriales no pueden repetirse'] : []),
    ...(data.objections.some((item: any) => item.sourceNumbers.length === 0 && item.prevalence !== 'no_determinada') ? ['Sin fuentes no puede afirmarse prevalencia'] : []),
  ],
})

// 20 — Coach de vendedor
registerStructuredApp({
  id: 'seller-coach', name: 'Coach de vendedor', category: 'sales',
  promise: 'Coaching por vendedor basado en fragmentos, métricas observables y práctica semanal',
  inputSchema: z.object({ seller: str.max(200), callTranscripts: str.max(50000), outcomes: str.max(10000), rubric: z.string().max(5000).optional(), period: str.max(200) }),
  outputSchema: z.object({ callsReviewed: z.number().int().nonnegative(), scorecard: z.object({ opening: common.score, discovery: common.score, listening: common.score, relevance: common.score, objections: common.score, nextStep: common.score }), strengths: z.array(z.object({ behavior: str, evidenceExcerpts: z.array(str), impact: str })), coachingPriorities: z.array(z.object({ priority: z.number().int().positive(), behavior: str, evidenceExcerpts: z.array(str), replacementBehavior: str, drill: str, successMetric: str })).min(1).max(5), weeklyPlan: z.array(z.object({ day: str, exercise: str, artifact: str })), caveats: z.array(str) }),
  uiSchema: [
    { key: 'seller', label: 'Vendedor', widget: 'text' }, { key: 'callTranscripts', label: 'Transcripciones', widget: 'textarea', sensitive: true },
    { key: 'outcomes', label: 'Resultados', widget: 'textarea', sensitive: true }, { key: 'rubric', label: 'Rúbrica', widget: 'textarea' },
    { key: 'period', label: 'Periodo', widget: 'text' },
  ],
  system: 'Eres coach de ventas. Cada feedback cita conducta observable; no infieres personalidad, motivación ni intención.',
  instructions: 'Entrega callsReviewed, scorecard, strengths, 1-5 coachingPriorities con fragmentos literales, weeklyPlan y caveats.',
  validateResult: (data, input) => [
    ...(missingLiteral(input.callTranscripts, [...data.strengths, ...data.coachingPriorities].flatMap((item: { evidenceExcerpts: string[] }) => item.evidenceExcerpts)) ? ['El coaching cita un fragmento ausente de las transcripciones'] : []),
    ...(data.coachingPriorities.some((item: any, index: number) => item.priority !== index + 1) ? ['Las prioridades de coaching deben ser continuas desde 1'] : []),
    ...(duplicateNormalized(data.coachingPriorities.map((item: any) => item.behavior)) ? ['Las prioridades de coaching no pueden repetirse'] : []),
  ],
})

// 21 — Generador de preguntas de descubrimiento
registerStructuredApp({
  id: 'discovery-question-generator', name: 'Generador de preguntas de descubrimiento', category: 'sales',
  promise: 'Preguntas de descubrimiento adaptadas a cuenta, persona y madurez con propósito y follow-up',
  inputSchema: z.object({ companyContext: str.max(6000), persona: str.max(1500), offer: str.max(3000), meetingGoal: str.max(500), knownFacts: str.max(5000), doNotAsk: z.string().max(3000).optional() }),
  outputSchema: z.object({ opening: str, questions: z.array(z.object({ order: z.number().int().positive(), category: z.enum(['situacion', 'problema', 'impacto', 'prioridad', 'decision', 'riesgo', 'siguiente_paso']), question: str, whyAsk: str, listenFor: z.array(str), followUp: str, avoidedAssumption: str })).min(8).max(18), branching: z.array(z.object({ ifAnswer: str, thenAsk: str })), questionsAvoided: z.array(z.object({ question: str, reason: str })), close: str }),
  uiSchema: [
    { key: 'companyContext', label: 'Contexto de empresa', widget: 'textarea' }, { key: 'persona', label: 'Persona', widget: 'textarea' },
    { key: 'offer', label: 'Oferta', widget: 'textarea' }, { key: 'meetingGoal', label: 'Objetivo', widget: 'text' },
    { key: 'knownFacts', label: 'Hechos conocidos', widget: 'textarea' }, { key: 'doNotAsk', label: 'No preguntar', widget: 'textarea' },
  ],
  system: 'Eres especialista en discovery. No pregunta lo ya conocido, evita interrogatorio y explica qué decisión habilita cada pregunta.',
  instructions: 'Entrega opening, 8-18 questions ordenadas con propósito/listenFor/followUp, branching, questionsAvoided y close.',
  validateResult: (data, input) => {
    const orders = data.questions.map((item: { order: number }) => item.order)
    const questions = data.questions.map((item: { question: string }) => item.question)
    const forbidden = (input.doNotAsk ?? '').split(/[\n;]+/).map((item: string) => item.trim().toLocaleLowerCase('es')).filter(Boolean)
    return [...(orders.some((order: number, index: number) => order !== index + 1) ? ['Las preguntas deben estar ordenadas de 1 a N sin huecos'] : []), ...(duplicateNormalized(questions) ? ['Las preguntas de discovery no pueden repetirse'] : []), ...(questions.some((question: string) => forbidden.some((item: string) => question.toLocaleLowerCase('es').includes(item))) ? ['La salida incluye una pregunta expresamente prohibida'] : [])]
  },
})

// 22 — Detector de competidor en oportunidad
registerStructuredApp({
  id: 'deal-competitor-detector', name: 'Detector de competidor en una oportunidad', category: 'sales',
  promise: 'Competidores explícitos e implícitos con evidencia, riesgo y battlecard contextual',
  inputSchema: z.object({ account: str.max(200), conversationsAndNotes: str.max(30000), offer: str.max(3000), knownCompetitors: z.string().max(3000).optional() }),
  outputSchema: z.object({ competitors: z.array(z.object({ nameOrType: str, detection: z.enum(['explicit', 'implicit', 'status_quo']), evidenceExcerpts: z.array(str), confidence: common.confidence, strengthsInThisDeal: z.array(str), weaknessesInThisDeal: z.array(str), risk: common.risk })), statusQuoCost: str, battlecard: z.array(z.object({ competitor: str, position: str, proof: str, trapToAvoid: str, discoveryQuestion: str })), missingIntelligence: z.array(str), nextActions: z.array(str) }),
  uiSchema: [
    { key: 'account', label: 'Cuenta', widget: 'text' }, { key: 'conversationsAndNotes', label: 'Conversaciones y notas', widget: 'textarea', sensitive: true },
    { key: 'offer', label: 'Oferta', widget: 'textarea' }, { key: 'knownCompetitors', label: 'Competidores conocidos', widget: 'textarea' },
  ],
  system: 'Eres estratega competitivo. Solo una mención textual es explicit; una inferencia debe mostrar fragmentos y conservar baja/media confianza.',
  instructions: 'Entrega competitors, statusQuoCost, battlecard contextual, missingIntelligence y nextActions. Incluye status quo si es el rival real.',
  validateResult: (data, input) => [
    ...(missingLiteral(input.conversationsAndNotes, data.competitors.flatMap((item: { evidenceExcerpts: string[] }) => item.evidenceExcerpts)) ? ['La detección competitiva cita un fragmento ausente de conversaciones y notas'] : []),
    ...(duplicateNormalized(data.competitors.map((item: any) => item.nameOrType)) ? ['Los competidores detectados no pueden repetirse'] : []),
    ...(data.competitors.some((item: any) => item.detection === 'explicit' && (item.evidenceExcerpts.length === 0 || item.confidence === 'baja')) ? ['Un competidor explícito necesita evidencia y confianza media/alta'] : []),
  ],
})

// 23 — Diseñador de agente de voz
registerStructuredApp({
  id: 'voice-agent-designer', name: 'Diseñador de agente de voz', category: 'sales',
  version: '1.3.0',
  promise: 'Especificación publicable de agente de voz con personalidad, ramas, herramientas y guardrails',
  inputSchema: z.object({ useCase: str.max(3000), audience: str.max(2000), objective: str.max(800), brandVoice: str.max(3000), availableTools: str.max(3000), complianceRequirements: str.max(5000), transferRules: str.max(3000) }),
  outputSchema: z.object({ identity: z.object({ name: str, role: str, disclosure: str, tone: str, speakingRules: z.array(str) }), systemPrompt: str, conversationStates: z.array(z.object({ id: str, goal: str, entryCondition: str, instructions: z.array(str), allowedTools: z.array(str), exits: z.array(z.object({ condition: str, nextState: str })) })).min(3), objectionBranches: z.array(z.object({ trigger: str, acknowledge: str, response: str, escalation: str })), toolPolicy: z.array(z.object({ tool: str, useWhen: str, requiredInputs: z.array(str), forbiddenWhen: z.array(str) })), complianceGuards: z.array(z.object({ rule: str, detection: str, action: str })), handoff: z.object({ conditions: z.array(str), summaryTemplate: str }), testScenarios: z.array(str) }),
  uiSchema: [
    { key: 'useCase', label: 'Caso de uso', widget: 'textarea' }, { key: 'audience', label: 'Audiencia', widget: 'textarea' },
    { key: 'objective', label: 'Objetivo', widget: 'text' }, { key: 'brandVoice', label: 'Voz de marca', widget: 'textarea' },
    { key: 'availableTools', label: 'Herramientas disponibles', widget: 'textarea' }, { key: 'complianceRequirements', label: 'Requisitos de cumplimiento', widget: 'textarea' },
    { key: 'transferRules', label: 'Reglas de transferencia', widget: 'textarea' },
  ],
  system: 'Eres arquitecto conversacional. Diseñas una máquina de estados auditable, mínima divulgación necesaria y fail-closed en cumplimiento.',
  instructions: 'Entrega identity, systemPrompt, conversationStates con transiciones, objectionBranches, toolPolicy, complianceGuards, handoff y testScenarios.',
  validateResult: (data, input) => {
    const stateIds = data.conversationStates.map((item: any) => item.id)
    const tools = new Set(data.toolPolicy.map((item: any) => item.tool))
    return [
      ...(duplicateNormalized(stateIds) ? ['Los estados conversacionales necesitan IDs únicos'] : []),
      ...(data.conversationStates.some((state: any) => state.exits.some((exit: any) => !stateIds.includes(exit.nextState))) ? ['Una transición apunta a un estado inexistente'] : []),
      ...(data.conversationStates.some((state: any) => state.allowedTools.some((tool: string) => !tools.has(tool))) ? ['Un estado usa una herramienta sin política'] : []),
      ...(duplicateNormalized(data.toolPolicy.map((item: any) => item.tool)) ? ['La política de herramientas contiene duplicados'] : []),
      ...(data.toolPolicy.some((item: any) => !containsDeclaredTool(input.availableTools, item.tool)) ? ['La salida declara una herramienta no incluida en availableTools'] : []),
    ]
  },
  followUps: [{ kind: 'create_agent', label: 'Crear borrador de agente' }, { kind: 'run_microapp', label: 'Ejecutar QA', params: { microappId: 'voice-agent-qa' } }],
})

// 24 — Inspector de cumplimiento de llamadas
registerStructuredApp({
  id: 'call-compliance-inspector', name: 'Inspector de cumplimiento de llamadas', category: 'sales',
  version: '1.3.0',
  promise: 'Incidencias de consentimiento, divulgación, opt-out y claims por timecode',
  inputSchema: z.object({ transcript: str.max(50000), eventLog: z.string().max(30000).optional(), jurisdiction: str.max(300), policy: str.max(10000), consentEvidence: z.string().max(5000).optional() }),
  outputSchema: z.object({ verdict: z.enum(['pass', 'review', 'fail']), checks: z.array(z.object({ requirement: str, status: z.enum(['pass', 'fail', 'not_observable', 'not_applicable']), evidenceExcerpt: z.string().nullable(), timecode: z.string().nullable(), rationale: str })), incidents: z.array(z.object({ severity: z.enum(['critical', 'major', 'minor']), rule: str, timecode: z.string().nullable(), excerpt: str, remediation: str })), consentAssessment: z.object({ status: z.enum(['documented', 'missing', 'ambiguous', 'not_required']), evidence: str }), optOutAssessment: z.object({ detected: z.boolean(), respected: z.boolean().nullable(), evidence: str }), claimsToVerify: z.array(str), disclaimer: str }),
  uiSchema: [
    { key: 'transcript', label: 'Transcripción', widget: 'textarea', sensitive: true }, { key: 'eventLog', label: 'Eventos/timecodes', widget: 'textarea', sensitive: true },
    { key: 'jurisdiction', label: 'Jurisdicción', widget: 'text' }, { key: 'policy', label: 'Política aplicable', widget: 'textarea' },
    { key: 'consentEvidence', label: 'Prueba de consentimiento', widget: 'textarea', sensitive: true },
  ],
  system: 'Eres auditor de cumplimiento, no abogado. Evalúas contra la política proporcionada; si falta contexto usas not_observable y no declaras legalidad.',
  instructions: 'Entrega verdict, checks por requisito, incidents por timecode, consentAssessment, optOutAssessment, claimsToVerify y disclaimer obligatorio.',
  validateResult: (data, input) => {
    const excerpts = [...data.checks.flatMap((item: { evidenceExcerpt: string | null }) => item.evidenceExcerpt ? [item.evidenceExcerpt] : []), ...data.incidents.map((item: { excerpt: string }) => item.excerpt)]
    const errors = missingLiteral(input.transcript, excerpts) ? ['La auditoría cita un fragmento ausente de la transcripción'] : []
    if (data.consentAssessment.status === 'documented' && !hasPositiveConsentEvidence(input.consentEvidence)) errors.push('No puede marcar consentimiento documentado sin evidencia positiva y explícita')
    if (data.incidents.some((item: { severity: string }) => item.severity === 'critical') && data.verdict === 'pass') errors.push('Un incidente crítico no puede producir verdict=pass')
    if (data.checks.some((item: { status: string }) => item.status === 'fail') && data.verdict === 'pass') errors.push('Un check fallido no puede producir verdict=pass')
    if (data.optOutAssessment.detected && data.optOutAssessment.respected === false && data.verdict !== 'fail') errors.push('Un opt-out ignorado exige verdict=fail')
    return errors
  },
  followUps: [{ kind: 'create_compliance_issue', label: 'Crear incidencias para revisión' }],
})

// 25 — Optimizador de apertura de llamada
registerStructuredApp({
  id: 'call-opening-optimizer', name: 'Optimizador de apertura de llamada', category: 'sales',
  promise: 'Compara aperturas por resultado y propone variantes medibles por segmento',
  inputSchema: z.object({ openingSamples: str.max(30000), outcomes: str.max(12000), audience: str.max(2000), objective: str.max(500), complianceDisclosure: str.max(2000) }),
  outputSchema: z.object({ sampleAnalysis: z.array(z.object({ openingId: str, outcomeRate: z.number().min(0).max(1).nullable(), strengths: z.array(str), friction: z.array(str), evidence: z.array(str) })), winningPatterns: z.array(z.object({ pattern: str, evidence: str, confidence: common.confidence })), variants: z.array(z.object({ id: str, segment: str, opening: str, hypothesis: str, singleChangedVariable: str, complianceIncluded: z.boolean() })).min(3), experiment: z.object({ primaryMetric: str, guardrails: z.array(str), allocation: str, minimumSampleWarning: str, stopRules: z.array(str) }) }),
  uiSchema: [
    { key: 'openingSamples', label: 'Aperturas', widget: 'textarea', sensitive: true }, { key: 'outcomes', label: 'Resultados', widget: 'textarea', sensitive: true },
    { key: 'audience', label: 'Audiencia', widget: 'textarea' }, { key: 'objective', label: 'Objetivo', widget: 'text' },
    { key: 'complianceDisclosure', label: 'Divulgación obligatoria', widget: 'textarea' },
  ],
  system: 'Eres CRO de llamadas. No declara ganadores con muestra insuficiente y cada variante cambia una sola dimensión conservando compliance.',
  instructions: 'Entrega sampleAnalysis, winningPatterns con confianza, al menos 3 variants y experiment con métrica/guardrails/stopRules.',
  validateResult: (data, input) => [
    ...(duplicateNormalized(data.variants.map((item: any) => item.id)) ? ['Los IDs de variantes deben ser únicos'] : []),
    ...(duplicateNormalized(data.variants.map((item: any) => item.singleChangedVariable)) ? ['Cada variante debe aislar una variable distinta'] : []),
    ...(data.variants.some((item: any) => !item.complianceIncluded || !item.opening.includes(input.complianceDisclosure.trim())) ? ['Cada apertura debe conservar literalmente la divulgación obligatoria'] : []),
    ...(data.experiment.stopRules.length === 0 ? ['El experimento necesita reglas de parada'] : []),
  ],
})

// 26 — Laboratorio de objeciones
registerStructuredApp({
  id: 'objection-lab', name: 'Laboratorio de objeciones', category: 'sales',
  promise: 'Batería de casos adversos para probar respuestas, cobertura y fallos de un agente',
  inputSchema: z.object({ offer: str.max(4000), audience: str.max(3000), agentInstructions: str.max(12000), knownObjections: str.max(6000), scenarioCount: z.coerce.number().int().min(10).max(100).default(30) }),
  outputSchema: z.object({ scenariosGenerated: z.number().int().positive(), coverage: z.array(z.object({ category: z.enum(['precio', 'confianza', 'prioridad', 'competencia', 'autoridad', 'legal', 'tecnica', 'hostilidad', 'otro']), count: z.number().int().nonnegative(), covered: z.boolean() })), scenarios: z.array(z.object({ id: str, persona: str, objection: str, hiddenConstraint: str, expectedBehavior: z.array(str), unsafeBehavior: z.array(str), difficulty: z.enum(['normal', 'alta', 'extrema']) })).min(10), failureModes: z.array(z.object({ failure: str, affectedScenarioIds: z.array(str), severity: common.risk, fix: str })), recommendedPromptChanges: z.array(z.object({ change: str, reason: str, regressionRisk: str })) }),
  uiSchema: [
    { key: 'offer', label: 'Oferta', widget: 'textarea' }, { key: 'audience', label: 'Audiencia', widget: 'textarea' },
    { key: 'agentInstructions', label: 'Instrucciones del agente', widget: 'textarea', sensitive: true }, { key: 'knownObjections', label: 'Objeciones conocidas', widget: 'textarea' },
    { key: 'scenarioCount', label: 'Número de escenarios', widget: 'number' },
  ],
  system: 'Eres red team conversacional. Generas casos diversos y extremos, pero no afirmas haberlos ejecutado: produces un banco de pruebas y criterios.',
  instructions: 'Entrega scenariosGenerated coherente, coverage, al menos 10 scenarios, failureModes observables y recommendedPromptChanges con riesgo de regresión.',
  validateResult: (data, input) => {
    const ids = data.scenarios.map((item: { id: string }) => item.id)
    const affected = data.failureModes.flatMap((item: any) => item.affectedScenarioIds)
    return [...(data.scenarios.length !== input.scenarioCount || data.scenariosGenerated !== input.scenarioCount ? ['scenariosGenerated y scenarios deben coincidir con scenarioCount'] : []), ...(duplicateNormalized(ids) ? ['Los IDs de escenario deben ser únicos'] : []), ...(affected.some((id: string) => !ids.includes(id)) ? ['Un failureMode referencia un escenario inexistente'] : []), ...(data.coverage.some((item: any) => item.covered !== (item.count > 0)) ? ['La cobertura debe derivarse del conteo de escenarios'] : [])]
  },
  followUps: [{ kind: 'create_agent_tests', label: 'Crear suite de pruebas del agente' }],
})

// 27 — Analizador de emoción y fricción
registerStructuredApp({
  id: 'call-emotion-friction-analyzer', name: 'Analizador de emoción y fricción', category: 'sales',
  promise: 'Línea temporal de interés, confusión, tensión y fricción anclada en lenguaje observable',
  inputSchema: z.object({ transcript: str.max(50000), timecodedEvents: z.string().max(30000).optional(), outcome: str.max(1000), context: z.string().max(4000).optional() }),
  outputSchema: z.object({ timeline: z.array(z.object({ timecode: z.string().nullable(), speaker: z.enum(['agent', 'prospect', 'unknown']), observableSignal: str, state: z.enum(['interest', 'confusion', 'tension', 'trust', 'friction', 'neutral']), confidence: common.confidence, excerpt: str })), frictionPoints: z.array(z.object({ trigger: str, response: str, impact: str, betterMove: str })), momentumMoments: z.array(z.object({ moment: str, evidence: str, howToBuildOn: str })), overallTrajectory: z.enum(['improving', 'stable', 'declining', 'mixed', 'not_measurable']), recommendations: z.array(str), caveat: str }),
  uiSchema: [
    { key: 'transcript', label: 'Transcripción', widget: 'textarea', sensitive: true }, { key: 'timecodedEvents', label: 'Eventos con tiempo', widget: 'textarea', sensitive: true },
    { key: 'outcome', label: 'Resultado', widget: 'text' }, { key: 'context', label: 'Contexto', widget: 'textarea' },
  ],
  system: 'Eres analista conversacional. No diagnosticas emociones internas: etiquetas estados como inferencias desde palabras, pausas o interrupciones observables.',
  instructions: 'Entrega timeline con fragmentos y confianza, frictionPoints, momentumMoments, overallTrajectory, recommendations y caveat metodológico.',
  validateResult: (data, input) => [
    ...(missingLiteral(input.transcript, data.timeline.map((item: { excerpt: string }) => item.excerpt)) ? ['La línea temporal cita un fragmento ausente de la transcripción'] : []),
    ...(data.timeline.length === 0 && data.overallTrajectory !== 'not_measurable' ? ['Sin señales observables la trayectoria debe ser not_measurable'] : []),
  ],
})

// 28 — Creador de follow-up posllamada
registerStructuredApp({
  id: 'post-call-followup-generator', name: 'Creador de follow-up posllamada', category: 'sales',
  promise: 'Convierte una llamada en resumen, mensajes, tareas y actualización CRM sin inventar compromisos',
  inputSchema: z.object({ callId: z.string().trim().min(3), communicationChannels: str.max(500).default('email'), brandTone: z.string().max(2000).default('profesional y claro') }),
  outputSchema: z.object({ summary: z.object({ situation: str, needs: z.array(str), decisions: z.array(str), openQuestions: z.array(str), exactCommitments: z.array(z.object({ owner: str, commitment: str, dueDate: z.string().nullable(), evidenceExcerpt: str })) }), email: z.object({ subject: str, body: str }), whatsapp: z.object({ body: str, appropriate: z.boolean(), reason: str }), tasks: z.array(z.object({ owner: str, task: str, dueDate: z.string().nullable(), source: str })), crmUpdate: z.object({ suggestedStage: str, stageReason: str, fields: z.array(z.object({ field: str, value: str, evidence: str })), note: str }), proposalInputs: z.array(z.object({ item: str, value: str, confidence: common.confidence })), missingInformation: z.array(str) }),
  uiSchema: [
    { key: 'callId', label: 'Llamada CRM', widget: 'call', help: 'La transcripción, participantes y etapa se leen de la llamada.' },
    { key: 'communicationChannels', label: 'Canales permitidos', widget: 'text' }, { key: 'brandTone', label: 'Tono de marca', widget: 'textarea' },
  ],
  system: 'Eres sales ops. Un compromiso solo se registra si existe fragmento literal; una fecha ausente queda null y ninguna salida se envía automáticamente.',
  instructions: 'Entrega summary con exactCommitments y evidencia, email, whatsapp con adecuación, tasks, crmUpdate sugerida, proposalInputs y missingInformation.',
  validateResult: (data) => data.summary.exactCommitments.some((item: any) => !item.evidenceExcerpt?.trim()) ? ['Cada compromiso necesita evidencia de la llamada'] : [],
  dataAccess: ['calls.read', 'leads.read'],
  placements: [{ surface: 'call', role: 'primary', trigger: 'after_call', actionLabel: 'Preparar follow-up' }],
  resultProjection: { kind: 'sequence', target: 'call', pin: true },
  followUps: [{ kind: 'send_email_draft', label: 'Crear borrador de email' }, { kind: 'create_task', label: 'Crear tareas' }, { kind: 'update_lead_field', label: 'Proponer actualización del lead' }],
})

// 29 — QA automático de agentes
registerStructuredApp({
  id: 'voice-agent-qa', name: 'QA automático de agentes', category: 'sales',
  promise: 'Suite de regresión, seguridad y comportamiento con decisión de publicación explicable',
  inputSchema: z.object({ agentPrompt: str.max(30000), toolDefinitions: str.max(10000), policy: str.max(12000), targetScenarios: str.max(8000), previousVersionFindings: z.string().max(6000).optional() }),
  outputSchema: z.object({ releaseDecision: z.enum(['pass', 'conditional', 'block']), score: common.score, testPlan: z.array(z.object({ id: str, category: z.enum(['happy_path', 'edge_case', 'compliance', 'security', 'tool_use', 'handoff', 'regression']), scenario: str, expected: z.array(str), forbidden: z.array(str), severityIfFailed: common.risk })).min(12), staticFindings: z.array(z.object({ severity: z.enum(['critical', 'major', 'minor']), location: str, finding: str, exploitOrFailure: str, fix: str })), coverageGaps: z.array(str), regressionChecks: z.array(z.object({ previousFinding: str, check: str })), publicationGates: z.array(z.object({ gate: str, status: z.enum(['pass', 'fail', 'not_tested']), evidence: str })), disclaimer: str }),
  uiSchema: [
    { key: 'agentPrompt', label: 'Prompt del agente', widget: 'textarea', sensitive: true }, { key: 'toolDefinitions', label: 'Herramientas', widget: 'textarea', sensitive: true },
    { key: 'policy', label: 'Política y guardrails', widget: 'textarea' }, { key: 'targetScenarios', label: 'Escenarios objetivo', widget: 'textarea' },
    { key: 'previousVersionFindings', label: 'Hallazgos anteriores', widget: 'textarea' },
  ],
  system: 'Eres QA y red team de agentes. Una revisión estática no equivale a ejecutar pruebas: marca not_tested y bloquea si faltan gates críticos.',
  instructions: 'Entrega releaseDecision, score, al menos 12 casos en testPlan, staticFindings, coverageGaps, regressionChecks, publicationGates y disclaimer que distinga diseño de ejecución.',
  validateResult: (data) => {
    const ids = data.testPlan.map((item: { id: string }) => item.id)
    const errors = duplicateNormalized(ids) ? ['Los IDs de prueba deben ser únicos'] : []
    if (data.releaseDecision === 'pass' && data.publicationGates.some((gate: { status: string }) => gate.status !== 'pass')) errors.push('releaseDecision=pass exige todos los publicationGates en pass')
    if (data.releaseDecision === 'pass' && data.publicationGates.length === 0) errors.push('releaseDecision=pass exige publicationGates ejecutados')
    if (data.releaseDecision === 'pass' && data.staticFindings.some((finding: { severity: string }) => finding.severity === 'critical') ) errors.push('Un hallazgo crítico impide releaseDecision=pass')
    return errors
  },
  followUps: [{ kind: 'create_agent_tests', label: 'Materializar suite QA' }, { kind: 'request_approval', label: 'Solicitar revisión humana' }],
})

export const GROWTH_SALES_PACK_B_IDS = [
  'commercial-proposal-generator', 'expansion-opportunity-detector', 'stalled-deal-rescuer',
  'sector-objection-researcher', 'seller-coach', 'discovery-question-generator', 'deal-competitor-detector',
  'voice-agent-designer', 'call-compliance-inspector', 'call-opening-optimizer', 'objection-lab',
  'call-emotion-friction-analyzer', 'post-call-followup-generator', 'voice-agent-qa',
] as const
