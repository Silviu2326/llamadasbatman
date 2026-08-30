process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import '../providers/adapters/deepseek'
import { PERMISSIONS } from '../access-control/catalog'
import '../microapps/apps/revenueAgencyPackA'
import '../microapps/apps/revenueAgencyPackB'
import { REVENUE_AGENCY_INPUT_FIXTURES, REVENUE_AGENCY_MICROAPP_IDS } from '../microapps/apps/revenueAgencyPack.catalog'
import { getMicroapp } from '../microapps/registry'
import { validateMicroappResultEnvelope } from '../microapps/quality'
import { registerCoreCapabilityContracts } from '../providers/capabilities'
import { getCapabilityContract } from '../providers/registry'
import { prisma } from '../lib/prisma'
import type { MicroappCtx } from '../microapps/types'

registerCoreCapabilityContracts()
type RevenueAgencyId = (typeof REVENUE_AGENCY_MICROAPP_IDS)[keyof typeof REVENUE_AGENCY_MICROAPP_IDS]
const IDS = Object.values(REVENUE_AGENCY_MICROAPP_IDS) as RevenueAgencyId[]

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  return schema
}

function example(schema: ZodTypeAny, key = 'value'): unknown {
  if (schema instanceof z.ZodNullable) return null
  const current = unwrap(schema)
  if (current instanceof z.ZodObject) return Object.fromEntries(Object.entries(current.shape as Record<string, ZodTypeAny>).map(([field, child]) => [field, example(child, field)]))
  if (current instanceof z.ZodArray) {
    const def = current._def as { minLength?: { value: number }; exactLength?: { value: number }; type: ZodTypeAny }
    return Array.from({ length: Math.max(1, def.exactLength?.value ?? def.minLength?.value ?? 1) }, (_, index) => example(def.type, `${key}_${index}`))
  }
  if (current instanceof z.ZodEnum) return current.options[0]
  if (current instanceof z.ZodLiteral) return current.value
  if (current instanceof z.ZodBoolean) return true
  if (current instanceof z.ZodNumber) {
    const checks = (current._def as { checks?: Array<{ kind: string; value?: number }> }).checks ?? []
    const min = checks.find(check => check.kind === 'min')?.value ?? 1
    const max = checks.find(check => check.kind === 'max')?.value
    return max == null ? Math.max(1, min) : Math.min(max, Math.max(1, min))
  }
  if (current instanceof z.ZodString) return `${key} de ejemplo`
  throw new Error(`Tipo sin fixture: ${(current._def as { typeName?: string }).typeName}`)
}

function inputKeys(schema: ZodTypeAny): string[] {
  const current = unwrap(schema)
  assert.ok(current instanceof z.ZodObject)
  return Object.keys(current.shape).sort()
}

const decimal = (value: number) => ({ toString: () => String(value), valueOf: () => value })
const sampleOpportunity = {
  id: 'opp-1', name: 'Acme Expansion', stage: 'proposal', value: decimal(100000), currency: 'EUR', probability: 60,
  expectedCloseDate: new Date('2026-10-30'), stageEnteredAt: new Date('2026-08-01'), notes: 'DPA pendiente', forecastCategory: 'best_case',
  createdAt: new Date('2026-06-01'), updatedAt: new Date('2026-08-10'), assignedTo: 'user-1', accountId: 'acc-1',
  lead: { id: 'lead-1', name: 'Ana', company: 'Acme', email: 'ana@example.com', status: 'qualified', lastAttemptAt: new Date(), updatedAt: new Date() },
  account: { id: 'acc-1', name: 'Acme', domain: 'acme.test', industry: 'SaaS', sizeBand: '200-500', lifecycleStatus: 'customer', lastActivityAt: new Date() },
  contacts: [{ role: 'economic_buyer', isPrimary: true, lead: { id: 'lead-1', name: 'Ana', company: 'Acme', email: 'ana@example.com' } }],
  tasks: [{ id: 'task-1', title: 'Revisar DPA', status: 'open', priority: 'high', dueAt: new Date(), ownerId: 'user-1' }],
  stageHistory: [{ fromStage: 'qualified', toStage: 'proposal', reason: 'Demo completada', enteredAt: new Date('2026-08-01'), leftAt: null }],
  lineItems: [{ name: 'Plan', quantity: 1, unitPrice: decimal(100000), currency: 'EUR' }],
  salesActivities: [{ id: 'act-1', type: 'meeting', subject: 'Demo', body: 'Validación', occurredAt: new Date() }],
}
const sampleAccount = {
  id: 'acc-1', name: 'Acme', domain: 'acme.test', industry: 'SaaS', sizeBand: '200-500', lifecycleStatus: 'customer', source: 'inbound', customFields: {}, lastActivityAt: new Date(), createdAt: new Date('2026-01-01'), updatedAt: new Date(), ownerId: 'user-1',
  leads: [{ id: 'lead-1', name: 'Ana', status: 'qualified', source: 'inbound', updatedAt: new Date(), calls: [{ id: 'call-1', status: 'completed', durationSeconds: 300, sentiment: 'positive', sentimentScore: 0.7, outcome: 'meeting', summary: 'Interés', createdAt: new Date() }], meetings: [{ id: 'meet-1', status: 'completed', outcome: 'success', agreements: 'POC', scheduledAt: new Date(), updatedAt: new Date() }] }],
  opportunities: [{ id: 'opp-1', name: 'Acme Expansion', stage: 'proposal', value: decimal(100000), currency: 'EUR', probability: 60, expectedCloseDate: new Date(), actualCloseDate: null, lossReason: null, updatedAt: new Date() }],
}

const capturedWhere: Array<Record<string, unknown>> = []
const db = prisma as any
db.opportunity.findFirst = async (args: any) => { capturedWhere.push(args.where); return sampleOpportunity }
db.opportunity.findMany = async (args: any) => { capturedWhere.push(args.where); return [sampleOpportunity] }
db.account.findFirst = async (args: any) => { capturedWhere.push(args.where); return { ...sampleAccount } }
db.account.findMany = async (args: any) => { capturedWhere.push(args.where); return [{ ...sampleAccount }] }
db.usageRecord.findMany = async (args: any) => {
  capturedWhere.push(args.where)
  return [
    { provider: 'deepseek', capability: 'llm.generate', costCents: decimal(20), priceCents: decimal(35), meta: { accountId: 'acc-1' }, createdAt: new Date() },
    { provider: 'deepseek', capability: 'llm.generate', costCents: decimal(50), priceCents: decimal(80), meta: {}, createdAt: new Date() },
  ]
}

test('el mapa estable cubre exactamente 1–20 y registra contratos completos', () => {
  assert.deepEqual(Object.keys(REVENUE_AGENCY_MICROAPP_IDS).map(Number), Array.from({ length: 20 }, (_, index) => index + 1))
  assert.equal(new Set(IDS).size, 20)
  const signatures = new Set<string>()
  for (const id of IDS) {
    const app = getMicroapp(id)
    assert.ok(app, `falta ${id}`)
    assert.match(app.version, /^\d+\.\d+\.\d+$/)
    const unchanged12 = new Set(['roi-calculator'])
    const unchanged11 = new Set(['crm-completeness-inspector'])
    const upgraded14 = new Set(['opportunity-close-plan','mutual-action-plan','churn-risk-detector','client-onboarding-copilot','qbr-prep','client-approval-center','monthly-client-report'])
    assert.equal(app.version, upgraded14.has(id) ? '1.4.0' : unchanged12.has(id) ? '1.2.0' : unchanged11.has(id) ? '1.1.0' : '1.3.0', `${id}: versión no refleja su contrato vigente`)
    assert.ok(app.promise.length > 30)
    assert.equal(app.effects, 'local')
    assert.ok(app.freshnessDays && app.freshnessDays > 0)
    assert.ok(app.followUps.length > 0, `${id}: sin ruta de continuación`)
    assert.ok(app.uiSchema.some(field => field.help?.trim() || field.placeholder?.trim() || field.options?.length), `${id}: formulario sin guía útil`)
    assert.equal(new Set(app.dataAccess).size, app.dataAccess.length, `${id}: permisos duplicados`)
    assert.equal(new Set(app.capabilities).size, app.capabilities.length, `${id}: capabilities duplicadas`)
    assert.deepEqual(app.uiSchema.map(field => field.key).sort(), inputKeys(app.inputSchema), `${id}: UI incompleta`)
    for (const field of app.uiSchema) if (field.widget === 'select') assert.ok(field.options?.length, `${id}.${field.key}: select sin opciones`)
    for (const permission of app.dataAccess) assert.ok(PERMISSIONS.includes(permission as any), `${id}: permiso desconocido ${permission}`)
    for (const capability of app.capabilities) assert.ok(getCapabilityContract(capability), `${id}: capability desconocida ${capability}`)
    assert.ok(app.inputSchema.safeParse(REVENUE_AGENCY_INPUT_FIXTURES[id]).success, `${id}: fixture input inválido`)
    const output = example(app.outputSchema)
    assert.ok(app.outputSchema.safeParse(output).success, `${id}: schema output no admite fixture estructural`)
    const shape = unwrap(app.outputSchema) as z.ZodObject<any>
    signatures.add(Object.keys(shape.shape).sort().join('|'))
  }
  assert.ok(signatures.size >= 19, `contratos demasiado repetidos: ${signatures.size}`)
})

test('los 20 estimates son finitos, no negativos y los cálculos locales cuestan cero', async () => {
  for (const id of IDS) {
    const { cents } = await getMicroapp(id)!.estimateCost(REVENUE_AGENCY_INPUT_FIXTURES[id])
    assert.ok(Number.isFinite(cents) && cents >= 0, `${id}: coste ${cents}`)
  }
  for (const id of ['client-margin-auditor', 'crm-completeness-inspector', 'roi-calculator', 'client-approval-center', 'next-microapp-recommender', 'client-profitability-calculator'] as const) {
    assert.equal((await getMicroapp(id)!.estimateCost(REVENUE_AGENCY_INPUT_FIXTURES[id])).cents, 0, id)
  }
})

test('los 20 handlers ejecutan, validan su salida y siempre entregan evidencia', async () => {
  for (const id of IDS) {
    const app = getMicroapp(id)!
    const out = example(app.outputSchema) as any
    if (id === 'personalized-demo-builder') { out.agenda[0].minuteStart = 0; out.agenda[0].minuteEnd = 5 }
    if (id === 'mutual-action-plan') { out.milestones[0].id = 'm1'; out.milestones[0].dueDate = '2026-11-01'; out.milestones[0].dependencies = [] }
    const ctx: MicroappCtx = {
      orgId: 'org-test', jobId: `job-${id}`,
      async capability(name, capabilityInput, preferences) {
        assert.equal(name, 'llm.generate')
        if (id === 'prompt-model-lab') {
          assert.equal(preferences?.providerId, 'deepseek')
          return { text: 'access' }
        }
        assert.match(String((capabilityInput as { system?: unknown }).system ?? ''), /DATOS NO CONFIABLES/, `${id}: falta defensa contra prompt injection`)
        return { text: JSON.stringify(out) }
      },
      log() {},
    }
    const result = await app.run(ctx, REVENUE_AGENCY_INPUT_FIXTURES[id])
    validateMicroappResultEnvelope(app.id, result)
    assert.ok(app.outputSchema.safeParse(result.data).success, `${id}: handler output inválido`)
    assert.ok(result.evidence.length > 0, `${id}: sin evidencia`)
    assert.ok(result.evidence.every(item => item.confidence && (item.sourceRef || item.sourceUrl) && item.fetchedAt), `${id}: evidencia sin procedencia/confianza/vigencia`)
    assert.ok(result.suggestedActions !== undefined, `${id}: sin acciones sugeridas explícitas`)
    assert.ok(result.suggestedActions!.every(item => item.kind.trim() && item.label.trim()), `${id}: acción no enrutable`)
  }
})

test('toda lectura CRM/ledger ejecutada por el pack aplica orgId', () => {
  assert.ok(capturedWhere.length >= 10)
  for (const where of capturedWhere) assert.equal(where.orgId, 'org-test', `consulta sin aislamiento: ${JSON.stringify(where)}`)
})

test('margen histórico no reparte los costes organizativos sin meta.accountId', async () => {
  const app = getMicroapp('client-margin-auditor')!
  const result = await app.run({ orgId: 'org-test', jobId: 'job-margin', capability: async () => { throw new Error('no LLM') }, log() {} }, REVENUE_AGENCY_INPUT_FIXTURES['client-margin-auditor'])
  const data = app.outputSchema.parse(result.data) as any
  assert.equal(data.observedUsage.scopedRecords, 1)
  assert.equal(data.observedUsage.unallocatedOrgRecords, 1)
  assert.equal(data.observedUsage.providerCostCents, 20)
  assert.equal(data.margin.directCostCents, 105020)
})

test('ROI y rentabilidad son reproducibles y distinguen histórico de prospectivo', async () => {
  const ctx: MicroappCtx = { orgId: 'org-test', jobId: 'job-calc', capability: async () => { throw new Error('no LLM') }, log() {} }
  const roi = getMicroapp('roi-calculator')!
  const roiData = roi.outputSchema.parse((await roi.run(ctx, REVENUE_AGENCY_INPUT_FIXTURES['roi-calculator'])).data) as any
  assert.equal(roiData.totals.investmentCents, 720000)
  assert.equal(roiData.cashflow.length, 12)
  const profitability = getMicroapp('client-profitability-calculator')!
  const profitData = profitability.outputSchema.parse((await profitability.run(ctx, REVENUE_AGENCY_INPUT_FIXTURES['client-profitability-calculator'])).data) as any
  assert.equal(profitData.base.laborCostCents, 105000)
  assert.equal(profitData.base.totalCostCents, 170500)
  assert.match(profitData.assumptions.join(' '), /prospectivo/i)
})

test('ROI no declara payback inmediato cuando no hay coste inicial pero el flujo mensual pierde dinero', async () => {
  const app = getMicroapp('roi-calculator')!
  const ctx: MicroappCtx = { orgId: 'org-test', jobId: 'job-roi-loss', capability: async () => { throw new Error('no LLM') }, log() {} }
  const result = await app.run(ctx, { currency: 'EUR', horizonMonths: 12, oneTimeCostCents: 0, recurringMonthlyCostCents: 10_000, monthlyBenefitCents: 1_000, rampMonths: 0, confidencePct: 100 })
  validateMicroappResultEnvelope(app.id, result)
  const data = app.outputSchema.parse(result.data) as any
  assert.equal(data.totals.paybackMonth, null)
  assert.ok(data.cashflow.every((row: any) => row.cumulativeNetCents < 0))
})

test('el centro de aprobación es local, determinista y nunca publica', async () => {
  const app = getMicroapp('client-approval-center')!
  const ctx: MicroappCtx = { orgId: 'org-test', jobId: 'job-approval', capability: async () => { throw new Error('no capability') }, log() {} }
  const first = app.outputSchema.parse((await app.run(ctx, REVENUE_AGENCY_INPUT_FIXTURES['client-approval-center'])).data) as any
  const second = app.outputSchema.parse((await app.run(ctx, REVENUE_AGENCY_INPUT_FIXTURES['client-approval-center'])).data) as any
  assert.equal(first.status, 'local_draft')
  assert.equal(first.publication.performed, false)
  assert.equal(first.checksum, second.checksum)
  assert.equal(app.effects, 'local')
  assert.equal(app.capabilities.length, 0)
})

test('el recomendador usa el registro vivo y no ejecuta la microapp elegida', async () => {
  const app = getMicroapp('next-microapp-recommender')!
  const result = await app.run({ orgId: 'org-test', jobId: 'job-rec', capability: async () => { throw new Error('no capability') }, log() {} }, REVENUE_AGENCY_INPUT_FIXTURES['next-microapp-recommender'])
  const data = app.outputSchema.parse(result.data) as any
  assert.ok(data.considered >= 19)
  assert.ok(data.recommendations.length > 0)
  assert.ok(data.recommendations.every((item: any) => item.microappId !== 'next-microapp-recommender'))
})

test('R4 ancla campos autoritativos y bloquea ambigüedad en contratos Revenue', async () => {
  const runStructured = async (id: string, output: any) => getMicroapp(id)!.run({ orgId:'org-test',jobId:`r4-${id}`,log(){},capability:async()=>({text:JSON.stringify(output)}) }, REVENUE_AGENCY_INPUT_FIXTURES[id as RevenueAgencyId])

  const churnApp=getMicroapp('churn-risk-detector')!; const churn=example(churnApp.outputSchema) as any
  churn.accountId='otro-tenant'; churn.riskScore=85; churn.riskBand='low'
  const churnData=churnApp.outputSchema.parse((await runStructured('churn-risk-detector',churn)).data) as any
  assert.equal(churnData.accountId,'acc-1'); assert.equal(churnData.riskBand,'critical')

  const monthlyApp=getMicroapp('monthly-client-report')!; const monthly=example(monthlyApp.outputSchema) as any
  monthly.month='1999-01'; monthly.spend={attributedUsageRecords:999,providerCostCents:999,customerPriceCents:999,caveat:'inventado'}
  const monthlyData=monthlyApp.outputSchema.parse((await runStructured('monthly-client-report',monthly)).data) as any
  assert.equal(monthlyData.month,'2026-07'); assert.deepEqual(monthlyData.spend,{attributedUsageRecords:1,providerCostCents:20,customerPriceCents:35,caveat:'1 registros organizativos no están atribuidos a esta cuenta.'})

  const approval=getMicroapp('client-approval-center')!; const approvalInput=structuredClone(REVENUE_AGENCY_INPUT_FIXTURES['client-approval-center']) as any
  approvalInput.items.push({...approvalInput.items[0]})
  assert.equal(approval.inputSchema.safeParse(approvalInput).success,false)
  const lab=getMicroapp('prompt-model-lab')!; const labInput=structuredClone(REVENUE_AGENCY_INPUT_FIXTURES['prompt-model-lab']) as any
  labInput.testCases.push({...labInput.testCases[0]}); assert.equal(lab.inputSchema.safeParse(labInput).success,false)
})

test('R5 rechaza fechas inexistentes, meses imposibles y planes con dependencias o vencimientos falsos', async () => {
  const invalidDateCases: Array<[string, Record<string, unknown>, string]> = [
    ['opportunity-close-plan', { ...REVENUE_AGENCY_INPUT_FIXTURES['opportunity-close-plan'] as object, targetCloseDate: '2026-02-31' }, 'fecha inexistente'],
    ['mutual-action-plan', { ...REVENUE_AGENCY_INPUT_FIXTURES['mutual-action-plan'] as object, targetGoLiveDate: '2026-13-01' }, 'mes inexistente'],
    ['qbr-prep', { ...REVENUE_AGENCY_INPUT_FIXTURES['qbr-prep'] as object, periodEnd: '2026-04-31' }, 'día inexistente'],
    ['client-approval-center', { ...REVENUE_AGENCY_INPUT_FIXTURES['client-approval-center'] as object, approvalDeadline: '2026-00-10' }, 'mes cero'],
    ['monthly-client-report', { ...REVENUE_AGENCY_INPUT_FIXTURES['monthly-client-report'] as object, month: '2026-13' }, 'mes 13'],
  ]
  for (const [id, input, label] of invalidDateCases) assert.equal(getMicroapp(id)!.inputSchema.safeParse(input).success, false, `${id} aceptó ${label}`)

  const app = getMicroapp('mutual-action-plan')!
  const output = example(app.outputSchema) as any
  output.milestones = [
    { id: 'm1', milestone: 'Legal', buyerOwner: 'buyer', sellerOwner: 'seller', dueDate: '2026-11-01', dependencies: ['m2'], evidenceRequired: 'DPA', status: 'not_started' },
    { id: 'm2', milestone: 'Firma', buyerOwner: 'buyer', sellerOwner: 'seller', dueDate: '2026-11-10', dependencies: ['m1'], evidenceRequired: 'Contrato', status: 'not_started' },
  ]
  assert.ok(app.outputSchema.safeParse(output).success, 'el caso debe sobrevivir Zod para probar la guarda de ciclo')
  const ctx: MicroappCtx = { orgId: 'org-test', jobId: 'r5-map-cycle', log() {}, capability: async () => ({ text: JSON.stringify(output) }) }
  await assert.rejects(() => app.run(ctx, REVENUE_AGENCY_INPUT_FIXTURES['mutual-action-plan']), /dependencia cíclica/)
  output.milestones[1].dependencies = []
  output.milestones[0].dueDate = '2026-12-31'
  await assert.rejects(() => app.run(ctx, REVENUE_AGENCY_INPUT_FIXTURES['mutual-action-plan']), /posterior al go-live/)
  assert.deepEqual(getMicroapp('client-approval-center')!.dataAccess, [], 'el centro local no debe pedir permisos que no usa')
})
