import { z } from 'zod'
import { common, registerStructuredApp } from './growthSalesPack.shared'

const str = z.string().trim().min(1)
const url = z.string().trim().url().refine((value) => {
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
  } catch { return false }
}, 'La URL debe ser HTTP(S) y no incluir credenciales')
const missingLiteral = (corpus: string, excerpts: string[]) => excerpts.some(excerpt => !corpus.includes(excerpt.trim()))
const duplicateNormalized = (values: string[]) => new Set(values.map(value => value.trim().toLocaleLowerCase('es'))).size !== values.length
const listedValues = (value: string) => value.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean)
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
const hasPublicationConsent = (value: string) => {
  const text = normalized(value)
  if (/(?:no|sin|pendiente|denegad\w*)\s+(?:hay\s+)?(?:permiso|consentimiento|autorizacion)?\s*(?:public\w*|publicacion)/.test(text)) return false
  return /(?:permiso|consentimiento|autorizad\w*|aprobad\w*)[^.\n]{0,50}(?:public\w*|publicacion)|(?:public\w*|publicacion)[^.\n]{0,50}(?:autorizad\w*|aprobad\w*|con permiso)/.test(text)
}
const containsWholeName = (corpus: string, person: string) => {
  const escaped = normalized(person).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u').test(normalized(corpus))
}
const urlList = z.string().trim().min(1).max(2400).superRefine((value, ctx) => {
  const values = listedValues(value)
  if (values.length > 8) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Admite un máximo de 8 competidores' })
  if (duplicateNormalized(values)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Las URLs competidoras no pueden repetirse' })
  values.forEach((candidate, index) => {
    if (!url.safeParse(candidate).success) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: 'Cada competidor debe ser una URL HTTP(S) sin credenciales' })
  })
})

// 1 — Radar de señales de compra
registerStructuredApp({
  id: 'buying-signal-radar', name: 'Radar de señales de compra', category: 'research',
  promise: 'Señales de compra públicas priorizadas con fecha, fuente y siguiente acción',
  inputSchema: z.object({ company: str.max(200), accountId: z.string().trim().min(3).optional(), leadId: z.string().trim().min(3).optional(), website: url.optional(), products: str.max(1200), lookbackDays: z.coerce.number().int().min(7).max(365).default(90) }),
  outputSchema: z.object({ company: str, signals: z.array(z.object({ signal: str, observedAt: z.string().nullable(), category: z.enum(['contratacion', 'tecnologia', 'financiacion', 'expansion', 'liderazgo', 'problema', 'otro']), strength: common.score, sourceNumber: z.number().int().positive().nullable(), rationale: str, nextAction: str })).max(20), gaps: z.array(str), recommendedContactWindow: str }),
  uiSchema: [
    { key: 'company', label: 'Empresa', widget: 'text' }, { key: 'accountId', label: 'Cuenta CRM', widget: 'account' }, { key: 'leadId', label: 'Lead CRM', widget: 'lead' }, { key: 'website', label: 'Web', widget: 'url' },
    { key: 'products', label: 'Qué vendes', widget: 'textarea' }, { key: 'lookbackDays', label: 'Ventana en días', widget: 'number' },
  ],
  system: 'Eres analista de intención B2B y verificas temporalidad y relevancia antes de puntuar una señal.',
  instructions: 'Devuelve company, signals, gaps y recommendedContactWindow. Solo las señales con sourceNumber son hechos; si no hay señales devuelve [] y explica las lagunas.',
  researchQueries: (i) => [`"${i.company}" noticias`, `"${i.company}" contratación OR expansión`, `"${i.company}" tecnología OR proveedor`, `site:${i.website ? new URL(i.website).hostname : 'linkedin.com'} "${i.company}"`],
  validateResult: (data, input) => [
    ...(data.company.trim().toLocaleLowerCase('es') !== input.company.trim().toLocaleLowerCase('es') ? ['La empresa de salida debe copiar la empresa solicitada'] : []),
    ...(duplicateNormalized(data.signals.map((item: any) => item.signal)) ? ['Las señales de compra no pueden repetirse'] : []),
    ...(data.signals.length === 0 && data.gaps.length === 0 ? ['Sin señales se deben explicar las lagunas de investigación'] : []),
    ...(data.signals.some((item: any) => item.sourceNumber == null && item.strength > 50) ? ['Una señal sin fuente no puede superar fuerza 50'] : []),
  ],
  dataAccess: ['accounts.read', 'leads.read'],
  placements: [
    { surface: 'account', role: 'primary', trigger: 'manual', actionLabel: 'Ver señales de compra' },
    { surface: 'lead', role: 'secondary', trigger: 'manual', actionLabel: 'Ver señales de compra' },
  ],
  resultProjection: { kind: 'evidence', target: 'account', pin: true },
  followUps: [{ kind: 'create_task', label: 'Crear tarea de seguimiento' }, { kind: 'queue_call', label: 'Programar llamada' }],
})

// 2 — Autopsia de landing
registerStructuredApp({
  id: 'landing-autopsy', name: 'Autopsia de landing', category: 'sales',
  promise: 'Diagnóstico puntuado de conversión y un blueprint de landing corregida',
  inputSchema: z.object({ landingUrl: url, pageCopy: str.max(20000), targetAudience: str.max(1000), conversionGoal: str.max(300) }),
  outputSchema: z.object({ score: common.score, dimensions: z.object({ valueProposition: common.score, clarity: common.score, friction: common.score, trust: common.score, seo: common.score, messageMatch: common.score }), findings: z.array(z.object({ severity: common.risk, section: str, finding: str, evidenceExcerpt: str, fix: str })).min(1), rewrittenBlueprint: z.object({ hero: str, proof: z.array(str), sections: z.array(z.object({ heading: str, purpose: str, copy: str })).min(1), cta: str }), testPlan: z.array(z.object({ hypothesis: str, primaryMetric: str, variant: str, priority: common.priority })).min(1) }),
  uiSchema: [
    { key: 'landingUrl', label: 'URL de la landing', widget: 'url' }, { key: 'pageCopy', label: 'Texto actual', widget: 'textarea' },
    { key: 'targetAudience', label: 'Audiencia', widget: 'textarea' }, { key: 'conversionGoal', label: 'Conversión objetivo', widget: 'text' },
  ],
  system: 'Eres especialista CRO. Puntúas exclusivamente elementos observables y separas gusto personal de fricción demostrable.',
  instructions: 'Entrega score, seis dimensiones, findings con extracto literal, blueprint reescrito y un testPlan priorizado. No atribuyas rendimiento sin métricas.',
  validateResult: (data, input) => [
    ...(missingLiteral(input.pageCopy, data.findings.map((item: { evidenceExcerpt: string }) => item.evidenceExcerpt)) ? ['Un finding cita un fragmento que no aparece literalmente en pageCopy'] : []),
    ...(duplicateNormalized(data.findings.map((item: any) => `${item.section}:${item.finding}`)) ? ['Los hallazgos CRO no pueden repetirse'] : []),
  ],
  followUps: [{ kind: 'create_landing', label: 'Crear la landing corregida' }, { kind: 'create_experiment', label: 'Crear test A/B' }],
})

// 3 — Doctor de fatiga creativa
registerStructuredApp({
  id: 'creative-fatigue-doctor', name: 'Doctor de fatiga creativa', category: 'sales',
  promise: 'Diagnóstico de fatiga por anuncio con causas y variantes de renovación controlada',
  inputSchema: z.object({ campaignName: str.max(200), adsMetricsJson: str.max(30000), creativeDescriptions: str.max(12000), objective: str.max(300), comparisonWindow: str.max(200).default('últimos 14 días vs 14 anteriores') }),
  outputSchema: z.object({ diagnosis: z.enum(['fatiga_confirmada', 'fatiga_probable', 'sin_evidencia', 'datos_insuficientes']), confidence: common.confidence, metricChanges: z.array(z.object({ metric: str, current: z.number(), previous: z.number(), changePct: z.number(), interpretation: str })), exhaustedElements: z.array(z.object({ element: str, evidence: str, replacement: str })), variants: z.array(z.object({ hypothesis: str, changeOnly: str, hook: str, visualDirection: str, expectedSignal: str })).min(3), stopRules: z.array(str) }),
  uiSchema: [
    { key: 'campaignName', label: 'Campaña', widget: 'text' }, { key: 'adsMetricsJson', label: 'Métricas por anuncio', widget: 'textarea' },
    { key: 'creativeDescriptions', label: 'Creatividades actuales', widget: 'textarea' }, { key: 'objective', label: 'Objetivo', widget: 'text' },
    { key: 'comparisonWindow', label: 'Comparación', widget: 'text' },
  ],
  system: 'Eres analista de performance creative. No declaras fatiga sin cambio temporal y controlas variables en cada variante.',
  instructions: 'Devuelve diagnosis, confidence, metricChanges calculables, exhaustedElements, al menos 3 variants que cambien una sola dimensión y stopRules.',
  validateResult: (data) => {
    const errors: string[] = []
    for (const metric of data.metricChanges) {
      if (metric.previous === 0) { if (metric.changePct !== 0) errors.push(`changePct de ${metric.metric} debe ser 0 cuando no existe base comparable`) }
      else if (Math.abs(metric.changePct - ((metric.current - metric.previous) / Math.abs(metric.previous) * 100)) > 0.11) errors.push(`changePct de ${metric.metric} no coincide con current/previous`)
    }
    if (duplicateNormalized(data.variants.map((item: any) => item.changeOnly))) errors.push('Cada variante debe probar una dimensión distinta')
    if (['fatiga_confirmada', 'fatiga_probable'].includes(data.diagnosis) && data.metricChanges.length === 0) errors.push('No se puede diagnosticar fatiga sin comparación métrica')
    return errors
  },
  followUps: [{ kind: 'run_microapp', label: 'Generar campaña de reemplazo', params: { microappId: 'full-campaign-generator' } }],
})

// 4 — Planificador de cuenta ABM
registerStructuredApp({
  id: 'abm-account-planner', name: 'Planificador de cuenta ABM', category: 'sales',
  promise: 'Plan de cuenta de 30 días con personas, mensajes, canales y criterios de avance',
  inputSchema: z.object({ company: str.max(200), companyContext: str.max(10000), offer: str.max(2000), objective: str.max(500), knownContacts: z.string().max(6000).optional() }),
  outputSchema: z.object({ accountThesis: str, personas: z.array(z.object({ role: str, likelyGoals: z.array(str), likelyRisks: z.array(str), message: str, evidenceBasis: z.enum(['known', 'inferred']) })).min(2), plan30Days: z.array(z.object({ day: z.number().int().min(1).max(30), channel: z.enum(['email', 'linkedin', 'call', 'content', 'meeting']), targetRole: str, action: str, successCriterion: str })), assetsNeeded: z.array(str), exitCriteria: z.array(str) }),
  uiSchema: [
    { key: 'company', label: 'Cuenta objetivo', widget: 'text' }, { key: 'companyContext', label: 'Contexto e investigación', widget: 'textarea' },
    { key: 'offer', label: 'Oferta', widget: 'textarea' }, { key: 'objective', label: 'Objetivo ABM', widget: 'text' },
    { key: 'knownContacts', label: 'Contactos conocidos', widget: 'textarea', sensitive: true },
  ],
  system: 'Eres estratega ABM. No inventas personas; trabajas con roles cuando no existe un contacto verificado.',
  instructions: 'Produce accountThesis, personas, plan30Days, assetsNeeded y exitCriteria. Marca cada persona como known o inferred.',
  validateResult: (data) => {
    const roles = data.personas.map((item: any) => item.role)
    const days = data.plan30Days.map((item: any) => item.day)
    return [
      ...(duplicateNormalized(roles) ? ['Los roles ABM deben ser únicos'] : []),
      ...(new Set(days).size !== days.length || days.some((day: number, index: number) => index > 0 && day <= days[index - 1]) ? ['El plan ABM debe tener días únicos y ascendentes'] : []),
      ...(data.plan30Days.some((item: any) => !roles.some((role: string) => role.toLocaleLowerCase('es') === item.targetRole.trim().toLocaleLowerCase('es'))) ? ['Cada acción ABM debe apuntar a un rol del mapa'] : []),
    ]
  },
  followUps: [{ kind: 'create_campaign', label: 'Crear campaña ABM' }],
})

// 5 — Analizador de llamadas perdidas
registerStructuredApp({
  id: 'missed-call-analyzer', name: 'Analizador de llamadas perdidas', category: 'sales',
  promise: 'Patrones de pérdida por momento de llamada, objeción y conducta con guiones correctivos',
  inputSchema: z.object({ transcripts: str.max(50000), outcomes: str.max(12000), salesProcess: z.string().max(5000).optional(), language: z.enum(['es', 'en']).default('es') }),
  outputSchema: z.object({ callsAnalyzed: z.number().int().nonnegative(), lossPatterns: z.array(z.object({ pattern: str, frequency: z.number().int().nonnegative(), evidenceExcerpts: z.array(str), impact: common.risk, rootCause: str })), missedOpportunities: z.array(z.object({ moment: str, whatHappened: str, betterMove: str, exampleLine: str })), revisedPlaybook: z.array(z.object({ trigger: str, response: str, forbiddenMove: str })), measurementPlan: z.array(str) }),
  uiSchema: [
    { key: 'transcripts', label: 'Transcripciones', widget: 'textarea', sensitive: true }, { key: 'outcomes', label: 'Resultados', widget: 'textarea', sensitive: true },
    { key: 'salesProcess', label: 'Proceso comercial', widget: 'textarea' }, { key: 'language', label: 'Idioma', widget: 'select', options: [{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }] },
  ],
  dataAccess: [],
  system: 'Eres QA comercial. Solo citas frases presentes en las transcripciones y separas correlación de causa.',
  instructions: 'Cuenta las llamadas distinguibles, extrae lossPatterns con fragmentos literales, missedOpportunities, revisedPlaybook y measurementPlan.',
  validateResult: (data, input) => [
    ...(missingLiteral(input.transcripts, data.lossPatterns.flatMap((item: { evidenceExcerpts: string[] }) => item.evidenceExcerpts)) ? ['Un patrón de pérdida cita un fragmento ausente de las transcripciones'] : []),
    ...(data.lossPatterns.some((item: any) => item.frequency > data.callsAnalyzed) ? ['La frecuencia de un patrón no puede superar las llamadas analizadas'] : []),
    ...(duplicateNormalized(data.lossPatterns.map((item: any) => item.pattern)) ? ['Los patrones de pérdida no pueden repetirse'] : []),
  ],
  followUps: [{ kind: 'update_playbook', label: 'Proponer cambios al playbook' }],
})

// 6 — Constructor de oferta irresistible
registerStructuredApp({
  id: 'irresistible-offer-builder', name: 'Constructor de oferta irresistible', category: 'sales',
  promise: 'Arquitectura de oferta por paquetes, garantías, pruebas y objeciones sin claims inventados',
  inputSchema: z.object({ idealCustomer: str.max(3000), problem: str.max(2000), currentService: str.max(4000), evidenceAvailable: str.max(5000), priceConstraints: str.max(1000), competitors: z.string().max(3000).optional() }),
  outputSchema: z.object({ positioning: str, packages: z.array(z.object({ name: str, forWhom: str, outcome: str, scope: z.array(str), exclusions: z.array(str), priceLogic: str })).min(2).max(4), valueStack: z.array(z.object({ component: str, customerValue: str, proofAvailable: str })), guarantee: z.object({ wording: str, conditions: z.array(str), riskControl: str }), bonuses: z.array(z.object({ bonus: str, strategicReason: str })), objections: z.array(z.object({ objection: str, answer: str, evidenceNeeded: str })), unsupportedClaims: z.array(str) }),
  uiSchema: [
    { key: 'idealCustomer', label: 'Cliente ideal', widget: 'textarea' }, { key: 'problem', label: 'Problema', widget: 'textarea' },
    { key: 'currentService', label: 'Servicio actual', widget: 'textarea' }, { key: 'evidenceAvailable', label: 'Pruebas disponibles', widget: 'textarea' },
    { key: 'priceConstraints', label: 'Restricciones de precio', widget: 'textarea' }, { key: 'competitors', label: 'Competidores', widget: 'textarea' },
  ],
  system: 'Eres arquitecto de ofertas. Una garantía debe tener condiciones operables y ningún claim puede exceder la evidencia facilitada.',
  instructions: 'Entrega positioning, 2-4 packages, valueStack, guarantee, bonuses, objections y unsupportedClaims.',
  validateResult: (data) => [
    ...(duplicateNormalized(data.packages.map((item: any) => item.name)) ? ['Los paquetes deben tener nombres únicos'] : []),
    ...(data.guarantee.conditions.length === 0 ? ['La garantía necesita condiciones operables'] : []),
  ],
  followUps: [{ kind: 'run_microapp', label: 'Crear propuesta', params: { microappId: 'commercial-proposal-generator' } }],
})

// 7 — Generador de campaña completa
registerStructuredApp({
  id: 'full-campaign-generator', name: 'Generador de campaña completa', category: 'content',
  promise: 'Campaña coherente de anuncio a conversión con mensajes, activos, UTMs y medición',
  inputSchema: z.object({ objective: str.max(500), audience: str.max(2000), offer: str.max(3000), proof: str.max(3000), channels: str.max(800), budget: str.max(500), brandRules: z.string().max(3000).optional() }),
  outputSchema: z.object({ campaignIdea: str, messageArchitecture: z.object({ problem: str, promise: str, proof: str, mechanism: str, cta: str }), ads: z.array(z.object({ channel: str, hook: str, body: str, cta: str, creativeBrief: str })).min(3), landing: z.object({ headline: str, sections: z.array(z.object({ heading: str, copy: str })), cta: str }), emails: z.array(z.object({ delayDays: z.number().int().nonnegative(), subject: str, body: str, cta: str })), audiencePlan: z.array(str), utms: z.array(z.object({ asset: str, source: str, medium: str, campaign: str, content: str })), measurement: z.object({ primaryKpi: str, secondaryKpis: z.array(str), events: z.array(str), decisionRules: z.array(str) }) }),
  uiSchema: [
    { key: 'objective', label: 'Objetivo', widget: 'text' }, { key: 'audience', label: 'Audiencia', widget: 'textarea' },
    { key: 'offer', label: 'Oferta', widget: 'textarea' }, { key: 'proof', label: 'Pruebas', widget: 'textarea' },
    { key: 'channels', label: 'Canales', widget: 'text' }, { key: 'budget', label: 'Presupuesto', widget: 'text' },
    { key: 'brandRules', label: 'Reglas de marca', widget: 'textarea' },
  ],
  system: 'Eres director de growth. Mantienes message match desde anuncio hasta landing y defines medición antes de publicar.',
  instructions: 'Entrega campaignIdea, messageArchitecture, al menos 3 ads, landing, emails, audiencePlan, utms y measurement con reglas de decisión.',
  validateResult: (data, input) => {
    const channels = new Set(listedValues(input.channels).map(value => value.toLocaleLowerCase('es')))
    const ads = data.ads.map((item: any) => item.channel.trim().toLocaleLowerCase('es'))
    return [
      ...(duplicateNormalized(data.ads.map((item: any) => `${item.channel}:${item.hook}`)) ? ['Los anuncios de campaña no pueden repetirse'] : []),
      ...(ads.some((channel: string) => !channels.has(channel)) ? ['Un anuncio usa un canal no solicitado'] : []),
      ...(data.measurement.events.length === 0 || data.measurement.decisionRules.length === 0 ? ['La campaña necesita eventos y reglas de decisión'] : []),
      ...(duplicateNormalized(data.utms.map((item: any) => `${item.source}:${item.medium}:${item.campaign}:${item.content}`)) ? ['Las UTMs deben identificar cada activo de forma única'] : []),
    ]
  },
  followUps: [{ kind: 'create_campaign', label: 'Crear borrador de campaña' }, { kind: 'create_landing', label: 'Crear landing' }],
})

// 8 — Simulador de reunión comercial
registerStructuredApp({
  id: 'sales-meeting-simulator', name: 'Simulador de reunión comercial', category: 'sales',
  promise: 'Escenario realista de reunión con objeciones, respuestas modelo y rúbrica de evaluación',
  inputSchema: z.object({ prospectProfile: str.max(5000), meetingGoal: str.max(500), offer: str.max(3000), difficulty: z.enum(['normal', 'alta', 'hostil']).default('alta'), sellerApproach: str.max(8000) }),
  outputSchema: z.object({ prospectPersona: z.object({ role: str, priorities: z.array(str), hiddenConcern: str, communicationStyle: str }), dialogue: z.array(z.object({ speaker: z.enum(['prospect', 'seller']), message: str, coachingNote: str.nullable() })).min(6), objections: z.array(z.object({ objection: str, weakAnswer: str, strongAnswer: str, principle: str })), scorecard: z.object({ discovery: common.score, relevance: common.score, objectionHandling: common.score, nextStep: common.score, overall: common.score }), feedback: z.array(z.object({ moment: str, observed: str, improvement: str })) }),
  uiSchema: [
    { key: 'prospectProfile', label: 'Perfil del prospecto', widget: 'textarea' }, { key: 'meetingGoal', label: 'Objetivo', widget: 'text' },
    { key: 'offer', label: 'Oferta', widget: 'textarea' }, { key: 'difficulty', label: 'Dificultad', widget: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'alta', label: 'Alta' }, { value: 'hostil', label: 'Hostil' }] },
    { key: 'sellerApproach', label: 'Enfoque o respuestas del vendedor', widget: 'textarea' },
  ],
  system: 'Eres un simulador y coach de ventas. La persona es plausible pero se etiqueta como simulada; puntúas contra conductas observables.',
  instructions: 'Genera prospectPersona, diálogo alternado de al menos 6 turnos, objections, scorecard 0-100 y feedback ligado a momentos.',
  validateResult: (data) => {
    const scores = [data.scorecard.discovery, data.scorecard.relevance, data.scorecard.objectionHandling, data.scorecard.nextStep]
    return [
      ...(data.dialogue.some((item: any, index: number) => index > 0 && item.speaker === data.dialogue[index - 1].speaker) ? ['El diálogo simulado debe alternar prospecto y vendedor'] : []),
      ...(Math.abs(data.scorecard.overall - scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length) > 1 ? ['overall debe coincidir con el promedio de la rúbrica'] : []),
    ]
  },
})

// 9 — Analizador competitivo visual
registerStructuredApp({
  id: 'visual-competitive-analyzer', name: 'Analizador competitivo visual', category: 'research',
  promise: 'Matriz de mensajes y territorios visuales de competidores con espacios de diferenciación',
  inputSchema: z.object({ brand: str.max(200), brandPositioning: str.max(2000), competitorUrls: urlList, audience: str.max(1000) }),
  outputSchema: z.object({ competitors: z.array(z.object({ name: str, url: url, dominantPromise: str, visualCodes: z.array(str), emotionalTerritory: str, ctaPattern: str, sourceNumbers: z.array(z.number().int().positive()) })), categoryPatterns: z.array(z.object({ pattern: str, saturation: common.risk, evidence: z.array(z.number().int().positive()) })), whitespace: z.array(z.object({ opportunity: str, whyDistinctive: str, risk: str })), recommendedDirections: z.array(z.object({ name: str, visualSystem: str, message: str, avoid: z.array(str) })).min(2) }),
  uiSchema: [
    { key: 'brand', label: 'Marca', widget: 'text' }, { key: 'brandPositioning', label: 'Posicionamiento', widget: 'textarea' },
    { key: 'competitorUrls', label: 'URLs competidoras', widget: 'textarea', help: 'Una URL por línea, máximo 8.' }, { key: 'audience', label: 'Audiencia', widget: 'textarea' },
  ],
  system: 'Eres estratega de marca. No afirmas haber visto una imagen si solo tienes snippets; describes códigos visuales como inferencias cuando corresponda.',
  instructions: 'Entrega competitors, categoryPatterns, whitespace y al menos 2 recommendedDirections. Cada competidor debe conservar su URL y referencias de fuentes.',
  researchQueries: (i) => i.competitorUrls.split(/[\s,]+/).filter(Boolean).slice(0, 4).map((value: string) => {
    try { return `site:${new URL(value).hostname} marca producto campaña` } catch { return `"${value}" marca producto campaña` }
  }),
  validateResult: (data, input) => {
    const allowed = new Set(listedValues(input.competitorUrls).map(value => { try { return new URL(value).href } catch { return value } }))
    return [
      ...(duplicateNormalized(data.competitors.map((item: any) => item.url)) ? ['Cada competidor debe aparecer una sola vez'] : []),
      ...(data.competitors.some((item: any) => !allowed.has(new URL(item.url).href)) ? ['La salida incluye un competidor no aportado'] : []),
    ]
  },
})

// 10 — Cliente ganado en crecimiento
registerStructuredApp({
  id: 'won-customer-growth-engine', name: 'Cliente ganado → crecimiento', category: 'success',
  promise: 'Convierte una venta ganada en testimonio, caso, referral, expansión y contenidos',
  inputSchema: z.object({ customer: str.max(200), purchase: str.max(2000), achievedOutcome: str.max(3000), evidence: str.max(5000), permissions: str.max(1000), nextBestOffer: z.string().max(2000).optional() }),
  outputSchema: z.object({ proofInventory: z.array(z.object({ claim: str, supportedBy: str, publishable: z.boolean() })), testimonialRequest: z.object({ email: str, questions: z.array(str), consentLanguage: str }), caseStudy: z.object({ headline: str, situation: str, intervention: str, result: str, unverifiedClaims: z.array(str) }), referralCampaign: z.object({ ask: str, idealReferral: str, incentiveGuardrails: z.array(str) }), expansionPlan: z.array(z.object({ opportunity: str, timing: str, evidence: str, message: str })), contentAssets: z.array(z.object({ channel: str, concept: str, requiredApproval: str })) }),
  uiSchema: [
    { key: 'customer', label: 'Cliente', widget: 'text', sensitive: true }, { key: 'purchase', label: 'Compra', widget: 'textarea', sensitive: true },
    { key: 'achievedOutcome', label: 'Resultado conseguido', widget: 'textarea', sensitive: true }, { key: 'evidence', label: 'Pruebas', widget: 'textarea', sensitive: true },
    { key: 'permissions', label: 'Permisos de uso', widget: 'textarea', sensitive: true }, { key: 'nextBestOffer', label: 'Oferta siguiente', widget: 'textarea' },
  ],
  system: 'Eres responsable de customer marketing. No publicas un dato ni nombre sin permiso y separas resultado demostrado de claim pendiente.',
  instructions: 'Entrega proofInventory, solicitud de testimonio con consentimiento, caseStudy, referralCampaign, expansionPlan y contentAssets con aprobación.',
  validateResult: (data, input) => [
    ...(data.proofInventory.some((item: any) => item.publishable && !hasPublicationConsent(input.permissions)) ? ['No se puede marcar una prueba publicable sin permiso público explícito'] : []),
    ...(data.contentAssets.some((item: any) => !item.requiredApproval.trim()) ? ['Cada activo necesita una aprobación identificada'] : []),
  ],
  followUps: [{ kind: 'create_content', label: 'Crear activos aprobables' }],
})

// 11 — Mapa de decisores
registerStructuredApp({
  id: 'decision-maker-map', name: 'Mapa de decisores', category: 'sales',
  promise: 'Mapa de roles de compra y estrategia específica para cada participante',
  inputSchema: z.object({ company: str.max(200), purchase: str.max(2000), companySize: str.max(200), knownPeople: str.max(6000), buyingContext: str.max(4000) }),
  outputSchema: z.object({ roles: z.array(z.object({ role: str, person: z.string().nullable(), influence: common.score, stance: z.enum(['favorable', 'neutral', 'contraria', 'desconocida']), goals: z.array(str), concerns: z.array(str), message: str, evidenceBasis: z.enum(['known', 'inferred']) })).min(3), missingRoles: z.array(str), engagementOrder: z.array(z.object({ order: z.number().int().positive(), role: str, objective: str, proof: str })), consensusRisk: common.risk }),
  uiSchema: [
    { key: 'company', label: 'Empresa', widget: 'text' }, { key: 'purchase', label: 'Compra propuesta', widget: 'textarea' },
    { key: 'companySize', label: 'Tamaño', widget: 'text' }, { key: 'knownPeople', label: 'Personas conocidas', widget: 'textarea', sensitive: true },
    { key: 'buyingContext', label: 'Contexto de compra', widget: 'textarea', sensitive: true },
  ],
  system: 'Eres estratega de compras B2B. Nunca inventas nombres: cuando faltan personas defines roles y los marcas como inferred.',
  instructions: 'Entrega roles, missingRoles, engagementOrder y consensusRisk. Conserva nombres solo si están en knownPeople.',
  validateResult: (data, input) => {
    const roles = data.roles.map((item: any) => item.role)
    const order = data.engagementOrder.map((item: any) => item.order)
    return [
      ...(duplicateNormalized(roles) ? ['Los roles del mapa de decisión deben ser únicos'] : []),
      ...(data.roles.some((item: any) => item.person && !containsWholeName(input.knownPeople, item.person)) ? ['El mapa inventó una persona no presente en knownPeople'] : []),
      ...(order.some((value: number, index: number) => value !== index + 1) ? ['engagementOrder debe ser continuo desde 1'] : []),
      ...(data.engagementOrder.some((item: any) => !roles.some((role: string) => role.toLocaleLowerCase('es') === item.role.trim().toLocaleLowerCase('es'))) ? ['El orden de contacto referencia un rol inexistente'] : []),
    ]
  },
})

// 12 — Detector de eventos desencadenantes
registerStructuredApp({
  id: 'trigger-event-detector', name: 'Detector de eventos desencadenantes', category: 'research',
  promise: 'Eventos públicos recientes convertidos en razones legítimas y oportunas para contactar',
  inputSchema: z.object({ companies: str.max(4000), offer: str.max(2000), lookbackDays: z.coerce.number().int().min(7).max(365).default(60), regions: z.string().max(800).optional() }),
  outputSchema: z.object({ events: z.array(z.object({ company: str, event: str, eventType: z.enum(['financiacion', 'contratacion', 'apertura', 'liderazgo', 'lanzamiento', 'incidente', 'regulacion', 'otro']), date: z.string().nullable(), sourceNumber: z.number().int().positive(), relevance: common.score, contactReason: str, suggestedMessage: str })), noSignalCompanies: z.array(str), monitoringQueries: z.array(str) }),
  uiSchema: [
    { key: 'companies', label: 'Empresas', widget: 'textarea' }, { key: 'offer', label: 'Oferta', widget: 'textarea' },
    { key: 'lookbackDays', label: 'Ventana en días', widget: 'number' }, { key: 'regions', label: 'Regiones', widget: 'text' },
  ],
  system: 'Eres analista de trigger events. Un evento solo existe si tiene fuente y fecha compatible con la ventana solicitada.',
  instructions: 'Devuelve events únicamente con sourceNumber válido, noSignalCompanies y monitoringQueries. No fuerces relevancia comercial.',
  researchQueries: (i) => i.companies.split(/[\n,;]+/).map((company: string) => company.trim()).filter(Boolean).slice(0, 4).map((company: string) => `"${company}" financiación OR contratación OR apertura OR lanzamiento OR CEO noticias`),
  validateResult: (data, input) => {
    const companies = new Set(listedValues(input.companies).map(value => value.toLocaleLowerCase('es')))
    return [
      ...(data.events.some((item: any) => !companies.has(item.company.trim().toLocaleLowerCase('es'))) ? ['Un evento pertenece a una empresa no solicitada'] : []),
      ...(duplicateNormalized(data.events.map((item: any) => `${item.company}:${item.event}`)) ? ['Los eventos desencadenantes no pueden repetirse'] : []),
      ...(data.noSignalCompanies.some((company: string) => !companies.has(company.trim().toLocaleLowerCase('es'))) ? ['noSignalCompanies contiene una empresa no solicitada'] : []),
    ]
  },
})

// 13 — Scoring explicable de prospectos
registerStructuredApp({
  id: 'explainable-prospect-scoring', name: 'Scoring explicable de prospectos', category: 'sales',
  promise: 'Puntuación auditable por fit, intención, urgencia y accesibilidad con datos faltantes',
  inputSchema: z.object({ leadId: z.string().trim().min(3).optional(), opportunityId: z.string().trim().min(3).optional(), prospectData: str.max(20000), idealCustomerProfile: str.max(5000), scoringPolicy: z.string().max(3000).optional(), disqualifiers: str.max(2000) }),
  outputSchema: z.object({ totalScore: common.score, tier: z.enum(['A', 'B', 'C', 'D']), dimensions: z.array(z.object({ dimension: z.enum(['fit', 'intent', 'urgency', 'accessibility']), score: common.score, weight: z.number().min(0).max(1), reasons: z.array(str), evidence: z.array(str) })).length(4), disqualifiersTriggered: z.array(str), missingData: z.array(z.object({ field: str, impact: str, howToObtain: str })), nextAction: str, scoreWouldChangeIf: z.array(str) }),
  uiSchema: [
    { key: 'leadId', label: 'Lead CRM', widget: 'lead' }, { key: 'opportunityId', label: 'Oportunidad CRM', widget: 'opportunity' }, { key: 'prospectData', label: 'Datos del prospecto', widget: 'textarea', sensitive: true }, { key: 'idealCustomerProfile', label: 'ICP', widget: 'textarea' },
    { key: 'scoringPolicy', label: 'Política de scoring', widget: 'textarea' }, { key: 'disqualifiers', label: 'Descalificadores', widget: 'textarea' },
  ],
  system: 'Eres analista RevOps. La puntuación debe poder reconstruirse desde pesos, razones y evidencia proporcionada.',
  instructions: 'Entrega totalScore, tier, exactamente cuatro dimensions con pesos que sumen aproximadamente 1, disqualifiersTriggered, missingData, nextAction y sensibilidad.',
  validateResult: (data) => {
    const expected = new Set(['fit', 'intent', 'urgency', 'accessibility'])
    const dimensions = data.dimensions as Array<{ dimension: string; score: number; weight: number }>
    const errors: string[] = []
    if (new Set(dimensions.map(item => item.dimension)).size !== expected.size || dimensions.some(item => !expected.has(item.dimension))) errors.push('Las cuatro dimensiones deben aparecer exactamente una vez')
    const weight = dimensions.reduce((sum, item) => sum + item.weight, 0)
    if (Math.abs(weight - 1) > 0.001) errors.push('Los pesos de scoring deben sumar 1')
    const calculated = dimensions.reduce((sum, item) => sum + item.score * item.weight, 0)
    if (Math.abs(calculated - data.totalScore) > 1) errors.push('totalScore no coincide con la suma ponderada explicable')
    return errors
  },
  dataAccess: ['leads.read', 'accounts.read'],
  placements: [{ surface: 'lead', role: 'primary', trigger: 'after_create', actionLabel: 'Calcular score' }, { surface: 'lead', role: 'primary', trigger: 'manual', actionLabel: 'Calcular score' }, { surface: 'opportunity', role: 'secondary', trigger: 'manual', actionLabel: 'Puntuar prospecto' }],
  resultProjection: { kind: 'score', target: 'lead', pin: true },
  followUps: [{ kind: 'update_stage', label: 'Proponer avance de etapa' }, { kind: 'run_microapp', label: 'Preparar llamada', params: { microappId: 'call-prep' } }],
})

// 14 — Preparador de negociación
registerStructuredApp({
  id: 'negotiation-prep', name: 'Preparador de negociación', category: 'sales',
  promise: 'Guía de negociación con BATNA, límites, concesiones intercambiables y trampas probables',
  inputSchema: z.object({ accountContext: str.max(6000), proposal: str.max(6000), objectives: str.max(2000), hardLimits: str.max(2000), counterpartSignals: str.max(4000), alternatives: z.string().max(3000).optional() }),
  outputSchema: z.object({ objectives: z.array(z.object({ item: str, target: str, minimum: str })), batna: str, walkAwayConditions: z.array(str), concessionLadder: z.array(z.object({ give: str, receive: str, order: z.number().int().positive(), cost: common.risk })), questions: z.array(str), likelyTactics: z.array(z.object({ tactic: str, signal: str, response: str })), openingPosition: str, closingPaths: z.array(str), unknowns: z.array(str) }),
  uiSchema: [
    { key: 'accountContext', label: 'Contexto de cuenta', widget: 'textarea' }, { key: 'proposal', label: 'Propuesta', widget: 'textarea' },
    { key: 'objectives', label: 'Objetivos', widget: 'textarea' }, { key: 'hardLimits', label: 'Límites', widget: 'textarea', sensitive: true },
    { key: 'counterpartSignals', label: 'Señales de la contraparte', widget: 'textarea' }, { key: 'alternatives', label: 'Alternativas/BATNA', widget: 'textarea', sensitive: true },
  ],
  system: 'Eres estratega de negociación. No confundes tácticas posibles con intenciones reales y nunca recomienda superar límites.',
  instructions: 'Entrega objetivos con target/minimum, BATNA, walkAwayConditions, concessionLadder de intercambios, questions, likelyTactics, openingPosition, closingPaths y unknowns.',
  validateResult: (data) => [
    ...(data.concessionLadder.some((item: any, index: number) => item.order !== index + 1) ? ['La escalera de concesiones debe ser continua desde 1'] : []),
    ...(duplicateNormalized(data.concessionLadder.map((item: any) => `${item.give}:${item.receive}`)) ? ['Las concesiones no pueden repetirse'] : []),
    ...(data.walkAwayConditions.length === 0 ? ['La preparación necesita condiciones explícitas de retirada'] : []),
  ],
})

// 15 — Mapa político de la cuenta
registerStructuredApp({
  id: 'account-political-map', name: 'Mapa político de la cuenta', category: 'sales',
  promise: 'Clasificación de aliados, neutrales, bloqueadores y poder para construir consenso',
  inputSchema: z.object({ account: str.max(200), contactsAndInteractions: str.max(15000), opportunity: str.max(3000), orgContext: z.string().max(4000).optional() }),
  outputSchema: z.object({ stakeholders: z.array(z.object({ personOrRole: str, stance: z.enum(['champion', 'supporter', 'neutral', 'blocker', 'unknown']), influence: common.score, evidence: z.array(str), motivations: z.array(str), risk: str, nextMove: str })), powerGaps: z.array(str), consensusPlan: z.array(z.object({ sequence: z.number().int().positive(), stakeholder: str, goal: str, action: str, proofNeeded: str })), singleThreadRisk: common.risk, warnings: z.array(str) }),
  uiSchema: [
    { key: 'account', label: 'Cuenta', widget: 'text' }, { key: 'contactsAndInteractions', label: 'Contactos e interacciones', widget: 'textarea', sensitive: true },
    { key: 'opportunity', label: 'Oportunidad', widget: 'textarea' }, { key: 'orgContext', label: 'Organigrama conocido', widget: 'textarea' },
  ],
  system: 'Eres estratega de consenso B2B. Etiquetas unknown si no existe conducta que demuestre una postura y evitas psicología inventada.',
  instructions: 'Entrega stakeholders con evidencia, powerGaps, consensusPlan, singleThreadRisk y warnings. No clasifiques por intuición sin avisarlo.',
  validateResult: (data) => {
    const stakeholders = data.stakeholders.map((item: any) => item.personOrRole)
    return [
      ...(duplicateNormalized(stakeholders) ? ['Los stakeholders no pueden repetirse'] : []),
      ...(data.stakeholders.some((item: any) => item.stance !== 'unknown' && item.evidence.length === 0) ? ['Una postura no desconocida necesita evidencia'] : []),
      ...(data.consensusPlan.some((item: any, index: number) => item.sequence !== index + 1) ? ['El plan de consenso debe ser continuo desde 1'] : []),
      ...(data.consensusPlan.some((item: any) => !stakeholders.some((name: string) => name.toLocaleLowerCase('es') === item.stakeholder.trim().toLocaleLowerCase('es'))) ? ['El plan de consenso referencia un stakeholder inexistente'] : []),
    ]
  },
})

export const GROWTH_SALES_PACK_A_IDS = [
  'buying-signal-radar', 'landing-autopsy', 'creative-fatigue-doctor', 'abm-account-planner',
  'missed-call-analyzer', 'irresistible-offer-builder', 'full-campaign-generator', 'sales-meeting-simulator',
  'visual-competitive-analyzer', 'won-customer-growth-engine', 'decision-maker-map', 'trigger-event-detector',
  'explainable-prospect-scoring', 'negotiation-prep', 'account-political-map',
] as const
