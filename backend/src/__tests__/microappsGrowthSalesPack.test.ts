process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import '../providers/adapters/deepseek'
import '../providers/adapters/brave'
import { PERMISSIONS } from '../access-control/catalog'
import { GROWTH_SALES_PACK_A_IDS } from '../microapps/apps/growthSalesPackA'
import { GROWTH_SALES_PACK_B_IDS } from '../microapps/apps/growthSalesPackB'
import { GROWTH_SALES_ID_BY_NUMBER } from '../microapps/apps/growthSalesPack.catalog'
import { getMicroapp } from '../microapps/registry'
import { bindingsFor, getCapabilityContract } from '../providers/registry'
import { registerCoreCapabilityContracts } from '../providers/capabilities'
import type { MicroappCtx } from '../microapps/types'
import { validateMicroappResultEnvelope } from '../microapps/quality'

const IDS = [...GROWTH_SALES_PACK_A_IDS, ...GROWTH_SALES_PACK_B_IDS]
registerCoreCapabilityContracts()

const BASE = 'Texto de ejemplo suficientemente concreto y verificable.'
const INPUTS: Record<(typeof IDS)[number], unknown> = {
  'buying-signal-radar': { company: 'Acme', products: 'Automatización comercial' },
  'landing-autopsy': { landingUrl: 'https://example.com/landing', pageCopy: BASE, targetAudience: 'Pymes B2B', conversionGoal: 'Reservar demo' },
  'creative-fatigue-doctor': { campaignName: 'Q3', adsMetricsJson: '{"ctr":1.2}', creativeDescriptions: BASE, objective: 'Leads' },
  'abm-account-planner': { company: 'Acme', companyContext: BASE, offer: BASE, objective: 'Conseguir reunión' },
  'missed-call-analyzer': { transcripts: `Agente: Hola\nProspecto: Ahora no.`, outcomes: 'No interesado' },
  'irresistible-offer-builder': { idealCustomer: BASE, problem: BASE, currentService: BASE, evidenceAvailable: BASE, priceConstraints: BASE },
  'full-campaign-generator': { objective: 'Leads', audience: BASE, offer: BASE, proof: BASE, channels: 'Meta,email', budget: '2000 EUR' },
  'sales-meeting-simulator': { prospectProfile: BASE, meetingGoal: 'Descubrir', offer: BASE, sellerApproach: BASE },
  'visual-competitive-analyzer': { brand: 'Acme', brandPositioning: BASE, competitorUrls: 'https://example.com', audience: BASE },
  'won-customer-growth-engine': { customer: 'Cliente', purchase: BASE, achievedOutcome: BASE, evidence: BASE, permissions: 'Uso interno' },
  'decision-maker-map': { company: 'Acme', purchase: BASE, companySize: '200', knownPeople: BASE, buyingContext: BASE },
  'trigger-event-detector': { companies: 'Acme', offer: BASE },
  'explainable-prospect-scoring': { prospectData: BASE, idealCustomerProfile: BASE, disqualifiers: BASE },
  'negotiation-prep': { accountContext: BASE, proposal: BASE, objectives: BASE, hardLimits: BASE, counterpartSignals: BASE },
  'account-political-map': { account: 'Acme', contactsAndInteractions: BASE, opportunity: BASE },
  'commercial-proposal-generator': { customer: 'Acme', discoveryNotes: BASE, offer: BASE, pricing: BASE, proof: BASE },
  'expansion-opportunity-detector': { customer: 'Acme', currentProducts: BASE, usageAndResults: BASE, catalog: BASE, relationshipSignals: BASE },
  'stalled-deal-rescuer': { account: 'Acme', dealHistory: BASE, lastContact: BASE, stage: 'Propuesta', value: '10000 EUR' },
  'sector-objection-researcher': { sector: 'Logística', offer: BASE, market: 'España' },
  'seller-coach': { seller: 'Ana', callTranscripts: BASE, outcomes: BASE, period: 'Q3' },
  'discovery-question-generator': { companyContext: BASE, persona: BASE, offer: BASE, meetingGoal: BASE, knownFacts: BASE },
  'deal-competitor-detector': { account: 'Acme', conversationsAndNotes: BASE, offer: BASE },
  'voice-agent-designer': { useCase: BASE, audience: BASE, objective: BASE, brandVoice: BASE, availableTools: 'tool-1', complianceRequirements: BASE, transferRules: BASE },
  'call-compliance-inspector': { transcript: BASE, jurisdiction: 'España', policy: BASE },
  'call-opening-optimizer': { openingSamples: BASE, outcomes: BASE, audience: BASE, objective: BASE, complianceDisclosure: BASE },
  'objection-lab': { offer: BASE, audience: BASE, agentInstructions: BASE, knownObjections: BASE, scenarioCount: 10 },
  'call-emotion-friction-analyzer': { transcript: BASE, outcome: 'Sin decisión' },
  'post-call-followup-generator': { transcript: BASE, participants: BASE, callObjective: BASE, crmStage: 'Discovery', communicationChannels: 'email' },
  'voice-agent-qa': { agentPrompt: BASE, toolDefinitions: BASE, policy: BASE, targetScenarios: BASE },
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  return schema
}

/** Construye fixtures estructurales completos: cada uno se valida y luego se usa como salida LLM del handler real. */
function outputExample(schema: ZodTypeAny, key = 'value'): unknown {
  if (schema instanceof z.ZodNullable) return null
  const current = unwrap(schema)
  if (current instanceof z.ZodObject) {
    return Object.fromEntries(Object.entries(current.shape as Record<string, ZodTypeAny>).map(([field, child]) => [field, outputExample(child, field)]))
  }
  if (current instanceof z.ZodArray) {
    const def = current._def as { minLength?: { value: number }; exactLength?: { value: number }; type: ZodTypeAny }
    const count = def.exactLength?.value ?? def.minLength?.value ?? 1
    return Array.from({ length: Math.max(1, count) }, (_, index) => outputExample(def.type, `${key}_${index + 1}`))
  }
  if (current instanceof z.ZodEnum) return current.options[0]
  if (current instanceof z.ZodLiteral) return current.value
  if (current instanceof z.ZodBoolean) return true
  if (current instanceof z.ZodNumber) {
    const checks = (current._def as { checks?: Array<{ kind: string; value?: number }> }).checks ?? []
    const min = checks.find((check) => check.kind === 'min')?.value ?? 1
    const max = checks.find((check) => check.kind === 'max')?.value
    return max === undefined ? Math.max(1, min) : Math.min(max, Math.max(1, min))
  }
  if (current instanceof z.ZodString) {
    const checks = (current._def as { checks?: Array<{ kind: string }> }).checks ?? []
    return checks.some((check) => check.kind === 'url') ? 'https://example.com/evidence' : `${key} de ejemplo`
  }
  throw new Error(`Tipo Zod sin generador de ejemplo: ${(current._def as { typeName?: string }).typeName}`)
}

function executableOutput(id: (typeof IDS)[number], schema: ZodTypeAny): any {
  const output = outputExample(schema) as any
  if (id === 'landing-autopsy') output.findings.forEach((item: any) => { item.evidenceExcerpt = BASE })
  if (id === 'missed-call-analyzer') output.lossPatterns.forEach((item: any) => { item.evidenceExcerpts = ['Agente: Hola'] })
  if (id === 'explainable-prospect-scoring') {
    const names = ['fit', 'intent', 'urgency', 'accessibility']
    output.dimensions.forEach((item: any, index: number) => { item.dimension = names[index]; item.score = 50; item.weight = 0.25 })
    output.totalScore = 50
  }
  if (id === 'seller-coach') [...output.strengths, ...output.coachingPriorities].forEach((item: any) => { item.evidenceExcerpts = [BASE] })
  if (id === 'discovery-question-generator') output.questions.forEach((item: any, index: number) => { item.order = index + 1; item.question = `Pregunta distinta ${index + 1}` })
  if (id === 'deal-competitor-detector') output.competitors.forEach((item: any) => { item.evidenceExcerpts = [BASE] })
  if (id === 'call-compliance-inspector') {
    output.verdict = 'fail'; output.consentAssessment.status = 'missing'
    output.checks.forEach((item: any) => { item.evidenceExcerpt = null })
    output.incidents.forEach((item: any) => { item.excerpt = BASE })
  }
  if (id === 'objection-lab') {
    const template = output.scenarios[0]
    output.scenarios = Array.from({ length: 30 }, (_, index) => ({ ...template, id: `scenario-${index + 1}` }))
    output.scenariosGenerated = 30
  }
  if (id === 'call-emotion-friction-analyzer') output.timeline.forEach((item: any) => { item.excerpt = BASE })
  if (id === 'post-call-followup-generator') output.summary.exactCommitments.forEach((item: any) => { item.evidenceExcerpt = BASE })
  if (id === 'voice-agent-qa') {
    output.releaseDecision = 'conditional'
    output.testPlan.forEach((item: any, index: number) => { item.id = `test-${index + 1}` })
  }
  return output
}

function inputKeys(schema: ZodTypeAny): string[] {
  const current = unwrap(schema)
  assert.ok(current instanceof z.ZodObject)
  return Object.keys(current.shape).sort()
}

function inputShape(schema: ZodTypeAny): Record<string, ZodTypeAny> {
  const current = unwrap(schema)
  assert.ok(current instanceof z.ZodObject)
  return current.shape as Record<string, ZodTypeAny>
}

/** Ajusta el fixture estructural a invariantes semánticas ligadas a la entrada. */
function semanticOutputExample(id: string, example: any): any {
  const corpusById: Record<string, string> = {
    'landing-autopsy': BASE,
    'missed-call-analyzer': 'Agente: Hola',
    'seller-coach': BASE,
    'deal-competitor-detector': BASE,
    'call-emotion-friction-analyzer': BASE,
    'post-call-followup-generator': BASE,
  }
  const literal = corpusById[id]
  if (literal) {
    if (id === 'landing-autopsy') for (const item of example.findings) item.evidenceExcerpt = literal
    if (id === 'missed-call-analyzer') for (const item of example.lossPatterns) item.evidenceExcerpts = item.evidenceExcerpts.map(() => literal)
    if (id === 'seller-coach') for (const item of [...example.strengths, ...example.coachingPriorities]) item.evidenceExcerpts = item.evidenceExcerpts.map(() => literal)
    if (id === 'deal-competitor-detector') for (const item of example.competitors) item.evidenceExcerpts = item.evidenceExcerpts.map(() => literal)
    if (id === 'call-emotion-friction-analyzer') for (const item of example.timeline) item.excerpt = literal
    if (id === 'post-call-followup-generator') for (const item of example.summary.exactCommitments) item.evidenceExcerpt = literal
  }

  if (id === 'explainable-prospect-scoring') {
    const names = ['fit', 'intent', 'urgency', 'accessibility']
    example.dimensions.forEach((item: any, index: number) => { item.dimension = names[index]; item.score = 40; item.weight = 0.25 })
    example.totalScore = 40
  }
  if (id === 'buying-signal-radar') example.company = 'Acme'
  if (id === 'creative-fatigue-doctor') { for (const metric of example.metricChanges) { metric.current = 1; metric.previous = 1; metric.changePct = 0 }; example.variants.forEach((item: any, index: number) => { item.changeOnly = `Dimensión ${index + 1}` }) }
  if (id === 'abm-account-planner') {
    example.personas.forEach((item: any, index: number) => { item.role = `Rol ABM ${index + 1}` })
    example.plan30Days.forEach((item: any, index: number) => { item.day = index + 1; item.targetRole = example.personas[index % example.personas.length].role })
  }
  if (id === 'irresistible-offer-builder') example.packages.forEach((item: any, index: number) => { item.name = `Paquete ${index + 1}` })
  if (id === 'full-campaign-generator') {
    example.ads.forEach((item: any, index: number) => { item.channel = index % 2 ? 'email' : 'Meta'; item.hook = `Hook de campaña ${index + 1}` })
    example.utms.forEach((item: any, index: number) => { item.content = `asset-${index + 1}` })
  }
  if (id === 'sales-meeting-simulator') {
    example.dialogue.forEach((item: any, index: number) => { item.speaker = index % 2 ? 'seller' : 'prospect' })
    const scores = [example.scorecard.discovery, example.scorecard.relevance, example.scorecard.objectionHandling, example.scorecard.nextStep]
    example.scorecard.overall = scores.reduce((sum: number, value: number) => sum + value, 0) / scores.length
  }
  if (id === 'visual-competitive-analyzer') example.competitors.forEach((item: any) => { item.url = 'https://example.com' })
  if (id === 'won-customer-growth-engine') example.proofInventory.forEach((item: any) => { item.publishable = false })
  if (id === 'decision-maker-map') {
    example.roles.forEach((item: any, index: number) => { item.role = `Rol de compra ${index + 1}`; item.person = null })
    example.engagementOrder.forEach((item: any, index: number) => { item.order = index + 1; item.role = example.roles[index % example.roles.length].role })
  }
  if (id === 'trigger-event-detector') { example.events.forEach((item: any) => { item.company = 'Acme' }); example.noSignalCompanies = [] }
  if (id === 'negotiation-prep') example.concessionLadder.forEach((item: any, index: number) => { item.order = index + 1 })
  if (id === 'account-political-map') {
    example.stakeholders.forEach((item: any, index: number) => { item.personOrRole = `Stakeholder ${index + 1}` })
    example.consensusPlan.forEach((item: any, index: number) => { item.sequence = index + 1; item.stakeholder = example.stakeholders[index % example.stakeholders.length].personOrRole })
  }
  if (id === 'commercial-proposal-generator') { example.roiCase.result = null; example.proposedSolution.forEach((item: any, index: number) => { item.phase = `Fase ${index + 1}` }) }
  if (id === 'stalled-deal-rescuer') example.rescueSequence.forEach((item: any, index: number) => { item.day = index + 1 })
  if (id === 'seller-coach') example.coachingPriorities.forEach((item: any, index: number) => { item.priority = index + 1; item.behavior = `Conducta ${index + 1}` })
  if (id === 'discovery-question-generator') {
    example.questions.forEach((item: any, index: number) => { item.order = index + 1; item.question = `Pregunta de discovery ${index + 1}` })
  }
  if (id === 'voice-agent-designer') {
    example.toolPolicy.forEach((item: any, index: number) => { item.tool = `tool-${index + 1}` })
    example.conversationStates.forEach((item: any, index: number) => { item.id = `state-${index + 1}`; item.allowedTools = [example.toolPolicy[0].tool] })
    example.conversationStates.forEach((item: any, index: number) => item.exits.forEach((exit: any) => { exit.nextState = example.conversationStates[(index + 1) % example.conversationStates.length].id }))
  }
  if (id === 'call-compliance-inspector') {
    example.verdict = 'review'
    example.consentAssessment.status = 'missing'
    for (const item of example.incidents ?? []) item.excerpt = BASE
  }
  if (id === 'call-opening-optimizer') example.variants.forEach((item: any, index: number) => { item.id = `opening-${index + 1}`; item.singleChangedVariable = `variable-${index + 1}`; item.complianceIncluded = true; item.opening = `${BASE} Apertura ${index + 1}` })
  if (id === 'objection-lab') {
    const template = example.scenarios[0]
    example.scenarios = Array.from({ length: 10 }, (_, index) => ({ ...template, id: `scenario-${index + 1}` }))
    example.scenariosGenerated = 10
    for (const failure of example.failureModes) failure.affectedScenarioIds = ['scenario-1']
    for (const coverage of example.coverage) coverage.covered = coverage.count > 0
  }
  if (id === 'voice-agent-qa') {
    example.releaseDecision = 'conditional'
    example.testPlan.forEach((item: any, index: number) => { item.id = `test-${index + 1}` })
  }
  if (id === 'post-call-followup-generator') {
    for (const task of example.tasks) task.source = BASE
    for (const field of example.crmUpdate.fields) field.evidence = BASE
  }
  return example
}

test('las 29 microapps están registradas, tienen contrato específico y formulario completo', () => {
  assert.equal(IDS.length, 29)
  assert.equal(new Set(IDS).size, 29)
  assert.deepEqual(Object.values(GROWTH_SALES_ID_BY_NUMBER), IDS)
  const outputSignatures = new Set<string>()
  for (const id of IDS) {
    const app = getMicroapp(id)
    assert.ok(app, `falta ${id}`)
    assert.equal(app.id, id)
    assert.equal(app.version, ['voice-agent-designer', 'call-compliance-inspector'].includes(id) ? '1.3.0' : '1.2.0', `${id}: los contratos mejorados deben quedar versionados`)
    assert.ok(app.promise.length > 20)
    assert.ok(app.capabilities.includes('llm.generate'))
    for (const capability of app.capabilities) {
      assert.ok(getCapabilityContract(capability), `${id}: capability sin contrato: ${capability}`)
      assert.ok(bindingsFor(capability).some(({ binding }) => binding.routable !== false), `${id}: capability sin proveedor enrutable: ${capability}`)
    }
    for (const permission of app.dataAccess) {
      assert.ok(PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number]), `${id}: permiso desconocido: ${permission}`)
    }
    assert.equal(app.effects, 'local')
    assert.ok(app.freshnessDays && app.freshnessDays > 0)
    assert.deepEqual(app.uiSchema.map((field) => field.key).sort(), inputKeys(app.inputSchema), `uiSchema incompleto en ${id}`)
    for (const field of app.uiSchema) {
      if (field.widget === 'select') assert.ok(field.options?.length, `select sin opciones: ${id}.${field.key}`)
      assert.ok(!(field.widget === 'select' && unwrap(inputShape(app.inputSchema)[field.key]) instanceof z.ZodArray), `${id}.${field.key}: un select simple no puede editar una lista`)
    }
    assert.ok(app.inputSchema.safeParse(INPUTS[id]).success, `input de ejemplo inválido: ${id}`)
    const example = executableOutput(id, app.outputSchema)
    assert.ok(app.outputSchema.safeParse(example).success, `output de ejemplo inválido: ${id}`)
    const shape = unwrap(app.outputSchema) as z.ZodObject<any>
    outputSignatures.add(Object.keys(shape.shape).sort().join('|'))
  }
  // Los productos no son aliases de una única respuesta genérica: casi cada
  // receta publica una forma superior única (las coincidencias accidentales
  // siguen diferenciándose en subestructuras y prompts).
  assert.ok(outputSignatures.size >= 27, `solo hay ${outputSignatures.size} contratos superiores distintos`)
})

test('estimateCost es finito y positivo para las 29 recetas', async () => {
  for (const id of IDS) {
    const { cents } = await getMicroapp(id)!.estimateCost(INPUTS[id])
    assert.ok(Number.isFinite(cents) && cents > 0, `${id}: coste ${cents}`)
  }
})

test('las 29 recetas rechazan briefs de relleno aunque conserven su estructura', () => {
  for (const id of IDS) {
    const app = getMicroapp(id)!
    const poor = { ...(INPUTS[id] as Record<string, unknown>) }
    for (const field of app.uiSchema) {
      if (field.widget === 'text' || field.widget === 'textarea') poor[field.key] = 'x'
    }
    assert.equal(app.inputSchema.safeParse(poor).success, false, `${id} aceptó un brief sin contexto`)
  }
})

test('los 29 handlers ejecutan routing LLM, validan output y generan evidencia', async () => {
  for (const id of IDS) {
    const app = getMicroapp(id)!
    const calls: string[] = []
    const example = semanticOutputExample(id, outputExample(app.outputSchema))
    const ctx: MicroappCtx = {
      orgId: 'org-test', jobId: `job-${id}`,
      async capability(name, payload) {
        calls.push(name)
        if (name === 'web.search') return { results: [{ title: 'Fuente de prueba', url: 'https://source.example/item', snippet: 'Dato verificable.' }] }
        if (name === 'llm.generate') {
          assert.match(String((payload as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/, `${id}: falta defensa contra prompt injection`)
          return { text: JSON.stringify(example) }
        }
        throw new Error(`capability inesperada: ${name}`)
      },
      log() {},
    }
    const result = await app.run(ctx, INPUTS[id])
    validateMicroappResultEnvelope(id, result)
    assert.ok(app.outputSchema.safeParse(result.data).success, `handler produjo output inválido: ${id}`)
    assert.ok(calls.includes('llm.generate'), `${id} no ejecutó el router LLM`)
    if (app.capabilities.includes('web.search')) assert.ok(calls.includes('web.search'), `${id} no investigó fuentes`)
    assert.ok(result.evidence.length >= 1, `${id} no generó evidencia`)
    assert.equal(result.evidence.at(-1)?.sourceRef?.id, `job-${id}`)
    assert.equal(result.evidence.at(-1)?.confidence, 'medium', `${id}: la entrada del usuario no puede tratarse como hecho verificado`)
    assert.ok(result.suggestedActions?.length, `${id}: falta una acción siguiente`)
    for (const action of result.suggestedActions ?? []) {
      assert.equal(action.params?.sourceJobId, `job-${id}`, `${id}: follow-up sin trazabilidad al job`)
      assert.equal(action.params?.sourceMicroappId, id, `${id}: follow-up sin trazabilidad a la receta`)
    }
  }
})

test('investigación pública conserva URLs como evidencia y las entrega al modelo', async () => {
  const app = getMicroapp('buying-signal-radar')!
  let prompt = ''
  const example = outputExample(app.outputSchema)
  ;(example as any).company = 'Acme'
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-source',
    async capability(name, input) {
      if (name === 'web.search') return { results: [{ title: 'Acme abre una planta', url: 'https://news.example/acme', snippet: 'La apertura crea 80 empleos.' }] }
      prompt = String((input as { prompt?: unknown }).prompt ?? '')
      return { text: JSON.stringify(example) }
    },
    log() {},
  }
  const result = await app.run(ctx, INPUTS['buying-signal-radar'])
  assert.ok(result.evidence.some((item) => item.sourceUrl === 'https://news.example/acme'))
  assert.match(prompt, /Acme abre una planta/)
  assert.match(prompt, /https:\/\/news\.example\/acme/)
})

test('una receta de investigación rechaza referencias a fuentes inexistentes', async () => {
  const app = getMicroapp('trigger-event-detector')!
  const invalid = outputExample(app.outputSchema) as { events: Array<{ sourceNumber: number }> }
  ;(invalid.events[0] as any).company = 'Acme'
  ;(invalid as any).noSignalCompanies = []
  invalid.events[0].sourceNumber = 99
  const ctx: MicroappCtx = {
    orgId: 'org-test', jobId: 'job-bad-source',
    async capability(name) {
      if (name === 'web.search') return { results: [{ title: 'Única fuente', url: 'https://source.example/1', snippet: 'Dato.' }] }
      return { text: JSON.stringify(invalid) }
    },
    log() {},
  }
  await assert.rejects(
    () => app.run(ctx, INPUTS['trigger-event-detector']),
    (error: unknown) => (error as { code?: string }).code === 'MICROAPP_SOURCE_REFERENCE_INVALID',
  )
})

test('R5 el diseñador de voz rechaza herramientas no declaradas aunque el grafo sea válido', async () => {
  const app = getMicroapp('voice-agent-designer')!
  const output = semanticOutputExample('voice-agent-designer', outputExample(app.outputSchema))
  output.toolPolicy[0].tool = 'wire_money'
  output.conversationStates.forEach((state: any) => { state.allowedTools = ['wire_money'] })
  const ctx: MicroappCtx = {
    orgId: 'org-r5', jobId: 'job-r5-tool', log() {},
    capability: async () => ({ text: JSON.stringify(output) }),
  }
  await assert.rejects(
    () => app.run(ctx, INPUTS['voice-agent-designer']),
    (error: unknown) => (error as { code?: string; details?: { issues?: string[] } }).code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID'
      && Boolean((error as { details?: { issues?: string[] } }).details?.issues?.some(issue => issue.includes('no incluida en availableTools'))),
  )
})

test('R5 una nota que niega consentimiento no puede convertirse en consentimiento documentado', async () => {
  const app = getMicroapp('call-compliance-inspector')!
  const output = semanticOutputExample('call-compliance-inspector', outputExample(app.outputSchema))
  output.consentAssessment.status = 'documented'
  const ctx: MicroappCtx = {
    orgId: 'org-r5', jobId: 'job-r5-consent', log() {},
    capability: async () => ({ text: JSON.stringify(output) }),
  }
  await assert.rejects(
    () => app.run(ctx, { ...INPUTS['call-compliance-inspector'] as object, consentEvidence: 'No consta consentimiento explícito; está pendiente de autorización.' }),
    (error: unknown) => (error as { code?: string; details?: { issues?: string[] } }).code === 'MICROAPP_OUTPUT_SEMANTIC_INVALID'
      && Boolean((error as { details?: { issues?: string[] } }).details?.issues?.some(issue => issue.includes('evidencia positiva'))),
  )
})
