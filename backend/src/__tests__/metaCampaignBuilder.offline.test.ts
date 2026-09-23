import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildObjective,
  buildPublishPlan,
  buildTargeting,
  classifyPublishError,
  computeDailyBudgetCents,
  executePublishPlan,
  mapCallToAction,
  MetaPublishError,
  META_HTTP_TIMEOUT_MS,
  type PublishPlanInput,
} from '../services/metaCampaignBuilder.service'

// Pruebas sin red ni base de datos: fetch se sustituye por un Graph simulado
// y las funciones puras reciben el plan ya cargado.

const originalFetch = globalThis.fetch
const originalTimeout = AbortSignal.timeout

afterEach(() => {
  globalThis.fetch = originalFetch
  AbortSignal.timeout = originalTimeout
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function baseInput(overrides: Partial<PublishPlanInput> = {}): PublishPlanInput {
  return {
    publicBaseUrl: 'https://app.vendrava.test',
    campaign: {
      id: 'c1',
      name: 'Pádel — Reservas',
      landingSlug: 'padel-1234',
      budgetCents: 60_000,
      adAssets: { adCopy: 'Reserva tu pista', presupuestoMensual: 600 },
    },
    metaAccount: { metaAdAccountId: 'act_111', metaPageId: 'page_1', metaPixelId: null, dailyBudgetCapCents: null },
    ...overrides,
  }
}

type GraphCall = { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> | null }

function mockGraph(handler: (call: GraphCall, index: number) => Response | Promise<Response>) {
  const calls: GraphCall[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: GraphCall = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    }
    calls.push(call)
    return handler(call, calls.length - 1)
  }) as typeof fetch
  return calls
}

test('objetivo: con píxel usa OUTCOME_LEADS + OFFSITE_CONVERSIONS con promoted_object', () => {
  const objective = buildObjective({ pixelId: 'px_9', conversionEvent: 'Schedule' })
  assert.equal(objective.campaignObjective, 'OUTCOME_LEADS')
  assert.equal(objective.optimizationGoal, 'OFFSITE_CONVERSIONS')
  assert.deepEqual(objective.promotedObject, { pixel_id: 'px_9', custom_event_type: 'SCHEDULE' })
  assert.equal(buildObjective({ pixelId: 'px_9' }).promotedObject?.custom_event_type, 'LEAD')
})

test('objetivo: sin píxel usa OUTCOME_TRAFFIC + LINK_CLICKS, nunca LEAD_GENERATION', () => {
  const objective = buildObjective({ pixelId: null })
  assert.equal(objective.campaignObjective, 'OUTCOME_TRAFFIC')
  assert.equal(objective.optimizationGoal, 'LINK_CLICKS')
  assert.equal(objective.billingEvent, 'IMPRESSIONS')
  assert.equal(objective.promotedObject, undefined)
  // La activación puede pedir tráfico aunque haya píxel.
  assert.equal(buildObjective({ pixelId: 'px', activationObjective: 'Tráfico a la web' }).mode, 'traffic')
})

test('segmentación: países y edad desde la audiencia del plan', () => {
  const result = buildTargeting({ location: 'Portugal, España, Madrid', ageRange: '25-54', customAudiences: ['1234567890', 'clientes CRM'] })
  const geo = result.targeting.geo_locations as { countries: string[] }
  assert.deepEqual(geo.countries, ['PT', 'ES'])
  assert.equal(result.targeting.age_min, 25)
  assert.equal(result.targeting.age_max, 54)
  assert.deepEqual(result.targeting.custom_audiences, [{ id: '1234567890' }])
  assert.equal(result.source, 'audience')
  assert.ok(result.warnings.some(w => w.includes('Madrid')))
  assert.ok(result.warnings.some(w => w.includes('audiencias propias')))
})

test('segmentación: España como respaldo explícito y edad acotada a 18–65', () => {
  const empty = buildTargeting(null)
  assert.deepEqual((empty.targeting.geo_locations as { countries: string[] }).countries, ['ES'])
  assert.equal(empty.source, 'default')
  const clamped = buildTargeting({ location: 'FR', ageRange: '16 a 80' })
  assert.equal(clamped.targeting.age_min, 18)
  assert.equal(clamped.targeting.age_max, 65)
  assert.equal(buildTargeting({ ageRange: '30+' }).targeting.age_min, 30)
})

test('CTA y presupuesto diario', () => {
  assert.equal(mapCallToAction('Reserva ahora'), 'BOOK_NOW')
  assert.equal(mapCallToAction('SIGN_UP'), 'SIGN_UP')
  assert.equal(mapCallToAction(null), 'LEARN_MORE')
  assert.equal(computeDailyBudgetCents({ wizardMonthlyBudget: 600 }), 2000)
  assert.equal(
    computeDailyBudgetCents({ activationBudgetCents: 10_000, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-11'), wizardMonthlyBudget: 600 }),
    1000,
  )
  assert.equal(computeDailyBudgetCents({}), null)
})

test('plan: creatividades aprobadas mandan sobre adAssets y exigen imagen publicada', () => {
  const plan = buildPublishPlan(baseInput({
    creatives: [{ id: 'cr1', headline: 'Pista en 2 clics', primaryText: 'Juega hoy', description: null, cta: 'Reservar', assetId: 'a1', destination: null }],
    assetUrls: { a1: 'https://cdn.test/a1.png' },
    audience: { location: 'Portugal', ageRange: '30-45' },
  }))
  assert.equal(plan.creativeSource, 'plan')
  assert.equal(plan.ads[0].linkData.message, 'Juega hoy')
  assert.equal(plan.ads[0].linkData.picture, 'https://cdn.test/a1.png')
  assert.deepEqual(plan.ads[0].linkData.call_to_action, { type: 'BOOK_NOW' })
  assert.deepEqual(plan.consentAssetIds, ['a1'])
  assert.deepEqual((plan.targeting.targeting.geo_locations as { countries: string[] }).countries, ['PT'])

  assert.throws(
    () => buildPublishPlan(baseInput({
      creatives: [{ id: 'cr1', headline: 'x', primaryText: 'y', description: null, cta: null, assetId: 'a2', destination: null }],
      assetUrls: {},
    })),
    (error: unknown) => error instanceof MetaPublishError && error.code === 'CREATIVE_ASSET_NOT_PUBLISHED' && error.statusCode === 422,
  )
})

test('plan: la variante elegida en el asistente es el respaldo', () => {
  const plan = buildPublishPlan(baseInput({
    campaign: {
      ...baseInput().campaign,
      adAssets: { adCopy: 'copy antiguo', presupuestoMensual: 600, creative: { label: 'ROI', title: 'Más reservas', body: 'Llena tus pistas', cta: 'Empezar ahora' } },
    },
  }))
  assert.equal(plan.creativeSource, 'wizard')
  assert.equal(plan.ads[0].linkData.message, 'Llena tus pistas')
  assert.equal(plan.ads[0].linkData.name, 'Más reservas')
  assert.equal(plan.ads[0].linkData.link, 'https://app.vendrava.test/l/padel-1234')
})

test('errores previos a Meta son 4xx con código propio', () => {
  const expectCode = (input: PublishPlanInput, code: string, status: number) => assert.throws(
    () => buildPublishPlan(input),
    (error: unknown) => {
      const classified = classifyPublishError(error)
      return classified.code === code && classified.status === status
    },
  )
  expectCode(baseInput({ publicBaseUrl: undefined }), 'APP_URL_MISSING', 422)
  expectCode(baseInput({ publicBaseUrl: 'http://localhost:5173' }), 'APP_URL_NOT_PUBLIC', 422)
  expectCode(baseInput({ metaAccount: null }), 'META_NOT_CONNECTED', 409)
  expectCode(baseInput({ metaAccount: { metaAdAccountId: 'act_1', metaPageId: null, metaPixelId: null, dailyBudgetCapCents: null } }), 'META_PAGE_MISSING', 409)
  expectCode(baseInput({ campaign: { ...baseInput().campaign, adAssets: null } }), 'NO_CREATIVE', 422)
  expectCode(baseInput({ metaAccount: { metaAdAccountId: 'act_1', metaPageId: 'p', metaPixelId: null, dailyBudgetCapCents: 500 } }), 'BUDGET_ABOVE_CAP', 422)
  // Error heredado de consentimiento y errores desconocidos.
  assert.equal(classifyPublishError(Object.assign(new Error('x'), { code: 'ASSET_CONSENT_INVALID' })).status, 422)
  const unknown = classifyPublishError(new Error('Graph API failed: 400: {"secret":"token"}'))
  assert.equal(unknown.status, 502)
  assert.ok(!unknown.message.includes('secret'))
})

test('Graph: token en cabecera Bearer, AbortSignal con plazo y objetivo según píxel', async () => {
  let timeoutMs = 0
  AbortSignal.timeout = ((ms: number) => { timeoutMs = ms; return originalTimeout.call(AbortSignal, ms) }) as typeof AbortSignal.timeout
  const calls = mockGraph((_call, index) => jsonResponse({ id: `obj_${index}` }))
  const plan = buildPublishPlan(baseInput({
    metaAccount: { metaAdAccountId: 'act_111', metaPageId: 'page_1', metaPixelId: 'px_1', dailyBudgetCapCents: null },
    audience: { location: 'España', ageRange: '25-54' },
  }))
  const result = await executePublishPlan(plan, 'tok-secret')

  assert.equal(timeoutMs, META_HTTP_TIMEOUT_MS)
  assert.equal(calls.length, 4)
  for (const call of calls) {
    assert.ok(!call.url.includes('tok-secret'), 'el token no viaja en la URL')
    assert.equal(call.headers.Authorization, 'Bearer tok-secret')
  }
  assert.equal(calls[0].body?.objective, 'OUTCOME_LEADS')
  assert.equal(calls[1].body?.optimization_goal, 'OFFSITE_CONVERSIONS')
  assert.deepEqual(calls[1].body?.promoted_object, { pixel_id: 'px_1', custom_event_type: 'LEAD' })
  assert.equal((calls[1].body?.targeting as Record<string, unknown>).age_min, 25)
  assert.equal(result.metaCampaignId, 'obj_0')
  assert.equal(result.metaAdId, 'obj_3')
})

test('Graph: fallo a mitad borra lo creado y no filtra el cuerpo del proveedor', async () => {
  const calls = mockGraph((call, index) => {
    if (call.method === 'DELETE') return jsonResponse({ success: true })
    if (index === 2) return jsonResponse({ error: { message: 'token=abc123 invalid', code: 100, error_subcode: 1487 } }, 400)
    return jsonResponse({ id: `obj_${index}` })
  })
  const plan = buildPublishPlan(baseInput())
  await assert.rejects(executePublishPlan(plan, 'tok'), (error: unknown) => {
    assert.ok(error instanceof MetaPublishError)
    assert.equal(error.code, 'META_PROVIDER')
    assert.equal(error.statusCode, 502)
    assert.ok(!error.message.includes('abc123'))
    assert.equal(error.details?.metaErrorCode, 100)
    assert.deepEqual((error.details?.rollback as { deleted: string[] }).deleted, ['obj_1', 'obj_0'])
    return true
  })
  const deletes = calls.filter(c => c.method === 'DELETE').map(c => c.url)
  assert.equal(deletes.length, 2)
  assert.ok(deletes[0].endsWith('/obj_1') && deletes[1].endsWith('/obj_0'), 'se borra en orden inverso')
})

test('Graph: un timeout se clasifica como META_TIMEOUT (504)', async () => {
  AbortSignal.timeout = (() => AbortSignal.abort(new DOMException('timeout', 'TimeoutError'))) as typeof AbortSignal.timeout
  mockGraph((call) => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    if (call.method === 'POST') throw error
    return jsonResponse({})
  })
  await assert.rejects(executePublishPlan(buildPublishPlan(baseInput()), 'tok'), (error: unknown) => {
    const classified = classifyPublishError(error)
    return classified.code === 'META_TIMEOUT' && classified.status === 504
  })
})
