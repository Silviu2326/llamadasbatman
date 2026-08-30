import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allocateBudget,
  callOperations,
  channelForLead,
  consultantActions,
  evaluateChannel,
  goalPlan,
  overallVerdict,
  revenueUpside,
  pipelineHealth,
  responseSpeed,
  scoreAreas,
  type CallInput,
  type ChannelInput,
  type LeadInput,
  type OpportunityInput,
  type UpsideInput,
} from '../services/salesConsultant.service'
import type { PredictorSnapshot } from '../services/growthPredictor.service'

const NOW = new Date('2026-08-27T10:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

function snapshot(overrides: Partial<PredictorSnapshot> = {}): PredictorSnapshot {
  return {
    currency: 'EUR',
    windowDays: 90,
    history: { calls: 200, conversations: 80, qualified: 30, opportunities: 15, won: 6, revenue: 12_000, adSpend: 600 },
    rates: {
      contact: { value: 0.4, source: 'own', sample: 200 },
      qualify: { value: 0.375, source: 'own', sample: 80 },
      opportunity: { value: 0.5, source: 'own', sample: 30 },
      win: { value: 0.2, source: 'own', sample: 15 },
    },
    dealValue: { value: 2000, source: 'own', sample: 6 },
    costPerMinute: 0.06,
    minutesPerCall: 3,
    ...overrides,
  }
}

function channel(overrides: Partial<ChannelInput> = {}): ChannelInput {
  return {
    channel: 'ads',
    leads: 50,
    contacted: 20,
    qualified: 10,
    opportunities: 5,
    sales: 2,
    revenue: 4000,
    spend: 1000,
    voiceCost: 0,
    hours: null,
    ...overrides,
  }
}

// ── Atribución ──────────────────────────────────────────────────────────────

test('un lead con huella de pago es de Ads aunque después llegue por búsqueda', () => {
  const lead = { source: 'organic_search', metaAdId: null }
  const events = [
    { type: 'landing_view', source: 'meta', medium: 'paid_social' },
    { type: 'landing_lead', source: 'google', medium: 'organic' },
  ]
  assert.equal(channelForLead(lead, events), 'ads')
})

test('el origen que no se reconoce cae en «sin identificar», no en el más probable', () => {
  assert.equal(channelForLead({ source: 'feria_de_muestras', metaAdId: null }), 'unknown')
  assert.equal(channelForLead({ source: null, metaAdId: null }), 'unknown')
})

test('la prospección importada no se disfraza de orgánico', () => {
  const events = [{ type: 'prospect_import', source: 'direct', medium: null }]
  assert.equal(channelForLead({ source: null, metaAdId: null }, events), 'outbound')
})

// ── Canales ─────────────────────────────────────────────────────────────────

test('un canal que devuelve más de 3× se marca para escalar', () => {
  const result = evaluateChannel(channel({ revenue: 4000, spend: 1000 }), 100)
  assert.equal(result.verdict, 'escalar')
  assert.equal(result.roi, 4)
  assert.equal(result.costPerSale, 500)
  assert.equal(result.share, 50)
})

test('un canal que se come el presupuesto sin cerrar nada se corta', () => {
  const result = evaluateChannel(channel({ revenue: 0, sales: 0, opportunities: 0, spend: 900 }), 100)
  assert.equal(result.verdict, 'parar')
})

test('sin ventas pero con oportunidades vivas no se corta: se arregla', () => {
  const result = evaluateChannel(channel({ revenue: 0, sales: 0, opportunities: 3, spend: 900 }), 100)
  assert.equal(result.verdict, 'arreglar')
})

test('sin muestra el veredicto es medir, nunca un juicio', () => {
  const result = evaluateChannel(channel({ leads: 4, sales: 0, revenue: 0, opportunities: 0 }), 100)
  assert.equal(result.maturity, 'insufficient')
  assert.equal(result.verdict, 'medir')
})

test('un canal sin coste en dinero no inventa retorno', () => {
  const result = evaluateChannel(channel({ spend: 0, voiceCost: 0, hours: 12, revenue: 3000 }), 100)
  assert.equal(result.roi, null)
  assert.equal(result.costBasis, 'time')
  assert.equal(result.verdict, 'escalar')
})

// ── Reparto de presupuesto ──────────────────────────────────────────────────

test('el reparto deja fuera lo que ya se demostró que no devuelve', () => {
  const list = [
    evaluateChannel(channel({ channel: 'ads', revenue: 8000, spend: 1000 }), 200),
    evaluateChannel(channel({ channel: 'email', revenue: 0, sales: 0, opportunities: 0, spend: 800 }), 200),
  ]
  const allocation = allocateBudget(list, 1000)
  assert.ok(!allocation.items.some(item => item.channel === 'email'))
  assert.match(allocation.note, /Email marketing/)
})

test('ningún canal se lleva más del 60 % aunque sea el único con retorno', () => {
  const list = [
    evaluateChannel(channel({ channel: 'ads', revenue: 20_000, spend: 1000 }), 200),
    evaluateChannel(channel({ channel: 'search', revenue: 1600, spend: 1000, sales: 1 }), 200),
  ]
  const allocation = allocateBudget(list, 1000)
  const top = allocation.items[0]
  assert.ok(top.share <= 61, `el techo no se respetó: ${top.share}%`)
})

test('sin ningún canal con retorno, el presupuesto se concentra en vez de repartirse', () => {
  const list = [evaluateChannel(channel({ leads: 2, sales: 0, revenue: 0, opportunities: 0, spend: 0, voiceCost: 0 }), 2)]
  const allocation = allocateBudget(list, 500)
  assert.equal(allocation.items.length, 1)
  assert.equal(allocation.items[0].amount, 500)
})

// ── Llamadas ────────────────────────────────────────────────────────────────

function call(hourUtc: number, outcome: string, overrides: Partial<CallInput> = {}): CallInput {
  return {
    agentId: 'a1',
    outcome,
    durationSeconds: 180,
    createdAt: new Date(Date.UTC(2026, 7, 20, hourUtc, 0, 0)),
    startedAt: new Date(Date.UTC(2026, 7, 20, hourUtc, 0, 0)),
    sentiment: null,
    ...overrides,
  }
}

test('la mejor franja horaria sale en hora local y solo con muestra suficiente', () => {
  const calls: CallInput[] = [
    // 08:00 UTC = 10:00 en Madrid; diez llamadas, ocho contactadas.
    ...Array.from({ length: 8 }, () => call(8, 'meeting_scheduled')),
    ...Array.from({ length: 2 }, () => call(8, 'voicemail')),
    // 15:00 UTC = 17:00 en Madrid; solo tres llamadas: no es comparable.
    ...Array.from({ length: 3 }, () => call(15, 'meeting_scheduled')),
  ]
  const result = callOperations(calls, { a1: 'Vendrava' }, 'Europe/Madrid')
  assert.equal(result.bestHour?.hour, 10)
  assert.equal(result.bestHour?.contactRate, 0.8)
  assert.ok(result.byHour.find(hour => hour.hour === 17)?.reliable === false)
})

test('las llamadas a máquinas no cuentan como conversación', () => {
  const calls = [call(9, 'voicemail'), call(9, 'ivr'), call(9, 'meeting_scheduled'), call(9, 'not_interested')]
  const result = callOperations(calls, {}, 'UTC')
  assert.equal(result.contacted, 2)
  assert.equal(result.qualified, 1)
  assert.equal(result.machineRate, 0.5)
  assert.equal(result.rejectionRate, 0.5)
})

test('un agente sin 15 llamadas no se marca como comparable', () => {
  const calls = [
    ...Array.from({ length: 16 }, () => call(9, 'meeting_scheduled')),
    call(9, 'not_interested', { agentId: 'a2' }),
  ]
  const result = callOperations(calls, { a1: 'Uno', a2: 'Dos' }, 'UTC')
  assert.equal(result.byAgent.find(agent => agent.agentId === 'a1')?.reliable, true)
  assert.equal(result.byAgent.find(agent => agent.agentId === 'a2')?.reliable, false)
})

// ── Pipeline ────────────────────────────────────────────────────────────────

function opportunity(overrides: Partial<OpportunityInput> = {}): OpportunityInput {
  return {
    id: 'o1',
    name: 'Oportunidad',
    stage: 'proposal',
    value: 3000,
    probability: 50,
    createdAt: daysAgo(40),
    stageEnteredAt: daysAgo(3),
    actualCloseDate: null,
    lossReason: null,
    forecastCategory: null,
    ...overrides,
  }
}

test('una oportunidad está parada según lo que aguanta su etapa, no según su antigüedad', () => {
  const list = [
    // 20 días en Propuesta (aguanta 10): parada.
    opportunity({ id: 'vieja', stageEnteredAt: daysAgo(20) }),
    // Creada hace un año pero movida ayer: viva.
    opportunity({ id: 'movida', createdAt: daysAgo(365), stageEnteredAt: daysAgo(1) }),
  ]
  const health = pipelineHealth(list, NOW)
  assert.equal(health.stalled.length, 1)
  assert.equal(health.stalled[0].id, 'vieja')
  assert.equal(health.open, 2)
})

test('el forecast ponderado usa la probabilidad, no el importe entero', () => {
  const health = pipelineHealth([opportunity({ value: 10_000, probability: 30 })], NOW)
  assert.equal(health.openValue, 10_000)
  assert.equal(health.weightedValue, 3000)
})

test('el ciclo medio solo cuenta las ganadas con fecha de cierre', () => {
  const list = [
    opportunity({ id: 'g1', stage: 'closed_won', createdAt: daysAgo(30), actualCloseDate: daysAgo(10) }),
    opportunity({ id: 'g2', stage: 'closed_won', createdAt: daysAgo(60), actualCloseDate: null }),
  ]
  assert.equal(pipelineHealth(list, NOW).averageCycleDays, 20)
})

test('las pérdidas sin motivo se cuentan como tales en vez de desaparecer', () => {
  const list = [
    opportunity({ id: 'p1', stage: 'closed_lost', lossReason: null }),
    opportunity({ id: 'p2', stage: 'closed_lost', lossReason: '  ' }),
    opportunity({ id: 'p3', stage: 'closed_lost', lossReason: 'Precio' }),
  ]
  const health = pipelineHealth(list, NOW)
  assert.equal(health.lossReasons[0].reason, 'Sin motivo registrado')
  assert.equal(health.lossReasons[0].count, 2)
})

// ── Velocidad ───────────────────────────────────────────────────────────────

function lead(overrides: Partial<LeadInput> = {}): LeadInput {
  return {
    id: 'l1',
    status: 'new',
    createdAt: daysAgo(2),
    firstRespondedAt: null,
    lastAttemptAt: null,
    attempts: 0,
    ...overrides,
  }
}

test('la mediana de respuesta no la arrastra un caso extremo', () => {
  const leads = [
    lead({ id: '1', createdAt: daysAgo(5), firstRespondedAt: new Date(daysAgo(5).getTime() + 2 * 60_000), attempts: 1 }),
    lead({ id: '2', createdAt: daysAgo(5), firstRespondedAt: new Date(daysAgo(5).getTime() + 4 * 60_000), attempts: 1 }),
    lead({ id: '3', createdAt: daysAgo(5), firstRespondedAt: new Date(daysAgo(5).getTime() + 10_000 * 60_000), attempts: 1 }),
  ]
  const speed = responseSpeed(leads, NOW)
  assert.equal(speed.medianMinutes, 4)
  assert.equal(speed.withinFiveMinutes, 67)
})

test('un lead sin tocar solo cuenta a partir de 24 horas', () => {
  const speed = responseSpeed([
    lead({ id: 'reciente', createdAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) }),
    lead({ id: 'olvidado', createdAt: daysAgo(9) }),
  ], NOW)
  assert.equal(speed.untouched, 1)
  assert.equal(speed.untouchedOldestDays, 9)
})

// ── Notas y veredicto ───────────────────────────────────────────────────────

const emptyCalls = callOperations([], {}, 'UTC')

test('un área sin muestra devuelve «sin datos», no un cero', () => {
  const scores = scoreAreas({
    windowDays: 90,
    leadsThisWindow: 0,
    leadsPreviousWindow: 0,
    calls: emptyCalls,
    pipeline: pipelineHealth([], NOW),
    speed: responseSpeed([], NOW),
    revenue: 0,
    cost: 0,
    dealValue: 1500,
  })
  assert.ok(scores.every(area => area.score == null))
  assert.ok(scores.every(area => area.state === 'sin-datos'))
})

test('con pocas llamadas el veredicto es «todavía no hay nada que medir»', () => {
  const verdict = overallVerdict([], { calls: 4, revenue: 0, cost: 0 })
  assert.equal(verdict.stage, 'arranque')
  assert.equal(verdict.score, null)
})

test('perder dinero manda sobre cualquier nota media', () => {
  const scores = scoreAreas({
    windowDays: 90,
    leadsThisWindow: 120,
    leadsPreviousWindow: 100,
    calls: callOperations(Array.from({ length: 40 }, () => call(9, 'meeting_scheduled')), {}, 'UTC'),
    pipeline: pipelineHealth([opportunity({ stage: 'closed_won', actualCloseDate: daysAgo(2) })], NOW),
    speed: responseSpeed([], NOW),
    revenue: 500,
    cost: 3000,
    dealValue: 2000,
  })
  const verdict = overallVerdict(scores, { calls: 40, revenue: 500, cost: 3000 })
  assert.equal(verdict.stage, 'en-riesgo')
  assert.match(verdict.summary, /3000/)
})

// ── Plan de acción ──────────────────────────────────────────────────────────

test('sin muestra, la única acción es conseguir muestra', () => {
  const actions = consultantActions({
    snapshot: snapshot({ history: { calls: 6, conversations: 2, qualified: 0, opportunities: 0, won: 0, revenue: 0, adSpend: 0 } }),
    calls: emptyCalls,
    pipeline: pipelineHealth([], NOW),
    speed: responseSpeed([], NOW),
    channels: [],
    scores: [],
    monthlyCalls: 2,
  })
  assert.equal(actions[0].id, 'get-sample')
  assert.equal(actions[0].expectedGain, null)
})

test('cada acción propuesta lleva pasos concretos, no un titular suelto', () => {
  const actions = consultantActions({
    snapshot: snapshot(),
    calls: emptyCalls,
    pipeline: pipelineHealth([], NOW),
    speed: responseSpeed([lead({ id: 'x', createdAt: daysAgo(4) })], NOW),
    channels: [],
    scores: [],
    monthlyCalls: 100,
  })
  assert.ok(actions.length > 0)
  assert.ok(actions.every(action => action.steps.length >= 2))
})

test('los leads sin tocar se valoran con el ticket medio propio', () => {
  const actions = consultantActions({
    snapshot: snapshot(),
    calls: emptyCalls,
    pipeline: pipelineHealth([], NOW),
    speed: responseSpeed(Array.from({ length: 100 }, (_, index) => lead({ id: `l${index}`, createdAt: daysAgo(3) })), NOW),
    channels: [],
    scores: [],
    monthlyCalls: 100,
  })
  const untouched = actions.find(action => action.id === 'untouched-leads')
  // 100 × 0,4 × 0,375 × 0,5 × 0,2 = 1,5 ventas × 2000 = 3000
  assert.equal(untouched?.expectedGain, 3000)
})

// ── Objetivo ────────────────────────────────────────────────────────────────

test('la cuenta al revés encadena las mismas tasas que la proyección', () => {
  const plan = goalPlan(snapshot(), 20_000, 'completo')
  // 20.000 / 2.000 = 10 ventas; /0,2 = 50 oportunidades; /0,5 = 100 cualificados;
  // /0,375 = 267 conversaciones; /0,4 = 667 llamadas.
  assert.equal(plan.sales, 10)
  assert.equal(plan.opportunities, 50)
  assert.equal(plan.qualified, 100)
  assert.equal(plan.conversations, 267)
  assert.equal(plan.calls, 667)
  assert.equal(plan.feasibleWithPlan, true)
})

test('avisa cuando el objetivo no cabe en los minutos del plan', () => {
  const plan = goalPlan(snapshot(), 20_000, 'free')
  assert.equal(plan.feasibleWithPlan, false)
  assert.equal(plan.minutesAllowed, 60)
})

test('con ticket de referencia lo dice en vez de presentarlo como dato propio', () => {
  const plan = goalPlan(snapshot({ dealValue: { value: 1500, source: 'baseline', sample: 0 } }), 10_000)
  assert.match(plan.note, /referencia del sector/)
})

// ── Lo que puedes ganar ─────────────────────────────────────────────────────

function upsideInput(overrides: Partial<UpsideInput> = {}): UpsideInput {
  return {
    snapshot: snapshot(),
    calls: emptyCalls,
    speed: responseSpeed([], NOW),
    pipeline: pipelineHealth([], NOW),
    channels: [],
    windowDays: 90,
    windowRevenue: 12_000,
    ...overrides,
  }
}

// Con el embudo de `snapshot()`: 0,4 × 0,375 × 0,5 × 0,2 = 0,015 → un lead vale
// 30 y una conversación 75.
test('la unidad económica encadena el embudo entero, no una tasa suelta', () => {
  const { unit } = revenueUpside(upsideInput())
  assert.equal(unit.perLead, 30)
  assert.equal(unit.perConversation, 75)
  assert.equal(unit.perCall, 30)
  assert.equal(unit.perMinute, 10)
  assert.equal(unit.costPerCall, 0.18)
  assert.equal(unit.marginPerCall, 29.82)
  assert.equal(unit.callsPerSale, 67)
})

test('sin nada que arreglar no se inventa potencial', () => {
  const result = revenueUpside(upsideInput())
  assert.equal(result.levers.length, 0)
  assert.equal(result.monthlyUpside, 0)
  assert.equal(result.recoverable, 0)
  assert.equal(result.ceiling, result.current)
  assert.equal(result.twelveMonthGap, 0)
})

test('los leads sin tocar se valoran enteros y los abandonados a la mitad', () => {
  const untouched = Array.from({ length: 100 }, (_, index) => lead({ id: `u${index}`, createdAt: daysAgo(3) }))
  const stale = Array.from({ length: 10 }, (_, index) => lead({
    id: `s${index}`, createdAt: daysAgo(40), attempts: 2, lastAttemptAt: daysAgo(30), status: 'contacted',
  }))
  const result = revenueUpside(upsideInput({ speed: responseSpeed([...untouched, ...stale], NOW) }))

  assert.equal(result.levers.find(lever => lever.id === 'untouched-leads')?.amount, 3000)
  assert.equal(result.levers.find(lever => lever.id === 'stale-leads')?.amount, 150)
  // Los rescates son de una vez: no inflan el techo mensual.
  assert.equal(result.recoverable, 3150)
  assert.equal(result.monthlyUpside, 0)
  assert.equal(result.ceiling, result.current)
})

test('la mejor franja se valora con el volumen mensual y dentro del techo de contacto', () => {
  // La franja mala se llena con llamadas sin resultado, no con buzones: un
  // buzón dispararía además la palanca de «lista sucia» y el test dejaría de
  // medir solo lo que dice medir.
  const calls = [
    ...Array.from({ length: 20 }, () => call(9, 'meeting_scheduled')),
    ...Array.from({ length: 20 }, () => call(15, 'none')),
  ]
  const result = revenueUpside(upsideInput({ calls: callOperations(calls, {}, 'UTC') }))
  const lever = result.levers.find(item => item.id === 'call-window')
  // 13,3 llamadas al mes × 35 puntos (los 50 de diferencia, recortados al techo
  // del 85% de contacto) × 75 por conversación.
  assert.equal(lever?.amount, 350)
  assert.equal(lever?.kind, 'ingreso')
  assert.equal(result.ceiling, result.current + 350)
})

test('las mejoras de contacto no se suman: comparten techo y se recortan', () => {
  // Contacto del 20%: la mitad de las llamadas acaban en buzón (dispara «lista
  // sucia»), la mejor franja llega al 40% y se tarda un día en responder. Las
  // tres palancas empujan la misma tasa.
  const calls = [
    ...Array.from({ length: 16 }, () => call(9, 'meeting_scheduled')),
    ...Array.from({ length: 24 }, () => call(9, 'voicemail')),
    ...Array.from({ length: 40 }, () => call(15, 'voicemail')),
  ]
  const stats = callOperations(calls, {}, 'UTC')
  const slow = lead({ id: 'lento', createdAt: daysAgo(9), attempts: 1, firstRespondedAt: daysAgo(8) })
  const result = revenueUpside(upsideInput({ calls: stats, speed: responseSpeed([slow], NOW) }))

  const contactLevers = result.levers.filter(lever => ['call-window', 'bad-list', 'response-time'].includes(lever.id))
  assert.ok(contactLevers.length >= 2, 'deberían dispararse varias palancas de contacto')

  // Juntas no pueden pasar del techo: la mejor franja medida (40%) sobre el
  // 20% actual son 20 puntos, ni uno más, por mucho que cada una prometa lo suyo.
  const monthlyCalls = stats.total * (30 / 90)
  const headroom = (stats.bestHour?.contactRate ?? 0) - (stats.contactRate ?? 0)
  const cap = Math.round(monthlyCalls * headroom * 75)
  const sum = contactLevers.reduce((total, lever) => total + lever.amount, 0)
  assert.ok(sum <= cap + 2, `las palancas de contacto suman ${sum} y el techo es ${cap}`)
  assert.ok(contactLevers.every(lever => /Recortado porque esta mejora se pisa/.test(lever.basis)))
})

test('un canal sin presupuesto propio no se puede «escalar un 30%»', () => {
  // Su único coste es llamar a sus leads: el retorno se dispara al dividir por
  // cuatro llamadas y «subir un 30%» no significa nada, porque no hay dial.
  const organic = evaluateChannel(channel({ channel: 'social', spend: 0, voiceCost: 55, revenue: 4800, sales: 2, leads: 40 }), 100)
  assert.equal(organic.verdict, 'escalar')
  const result = revenueUpside(upsideInput({ channels: [organic] }))
  assert.equal(result.levers.find(lever => lever.id === 'scale-social'), undefined)
  assert.equal(result.monthlyUpside, 0)
})

test('cortar un canal que no devuelve es ahorro, no facturación', () => {
  const dead = evaluateChannel(channel({ channel: 'email', revenue: 0, sales: 0, opportunities: 0, spend: 900, leads: 40 }), 100)
  const result = revenueUpside(upsideInput({ channels: [dead] }))
  const lever = result.levers.find(item => item.id === 'stop-email')
  assert.equal(lever?.kind, 'ahorro')
  // 900 en 90 días = 300 al mes.
  assert.equal(lever?.amount, 300)
  assert.equal(result.monthlySavings, 300)
  assert.equal(result.monthlyUpside, 0)
  assert.equal(result.ceiling, result.current)
})

test('las oportunidades paradas se descuentan porque cierran peor que las vivas', () => {
  const stalled = [
    opportunity({ id: 'a', value: 10_000, stageEnteredAt: daysAgo(40) }),
    opportunity({ id: 'g', stage: 'closed_won', value: 2000, actualCloseDate: daysAgo(5) }),
    opportunity({ id: 'p', stage: 'closed_lost', value: 2000 }),
  ]
  const health = pipelineHealth(stalled, NOW)
  const result = revenueUpside(upsideInput({ pipeline: health }))
  // 10.000 parados × 50% de cierre medido × 0,7 de descuento.
  assert.equal(result.levers.find(lever => lever.id === 'stalled-pipeline')?.amount, 3500)
})

test('la trayectoria respeta la rampa y no repite el rescate cada mes', () => {
  // La franja mala se llena con llamadas sin resultado, no con buzones: un
  // buzón dispararía además la palanca de «lista sucia» y el test dejaría de
  // medir solo lo que dice medir.
  const calls = [
    ...Array.from({ length: 20 }, () => call(9, 'meeting_scheduled')),
    ...Array.from({ length: 20 }, () => call(15, 'none')),
  ]
  const untouched = Array.from({ length: 100 }, (_, index) => lead({ id: `u${index}`, createdAt: daysAgo(3) }))
  const result = revenueUpside(upsideInput({
    calls: callOperations(calls, {}, 'UTC'),
    speed: responseSpeed(untouched, NOW),
  }))

  assert.equal(result.trajectory.length, 12)
  // El rescate se reparte en tres meses; a partir del cuarto solo queda lo recurrente.
  assert.equal(result.trajectory[0].plan, result.current + 350 + 1000)
  assert.equal(result.trajectory[2].plan, result.current + 350 + 1000)
  assert.equal(result.trajectory[3].plan, result.current + 350)
  assert.equal(result.trajectory[0].base, result.current)
  // Doce meses de diferencia: 350 × 12 recurrentes + 3.000 de una vez.
  assert.equal(result.twelveMonthGap, 350 * 12 + 3000)
})

test('el coste de no hacer nada suma ingreso y ahorro, y se cuenta por semana', () => {
  // La franja mala se llena con llamadas sin resultado, no con buzones: un
  // buzón dispararía además la palanca de «lista sucia» y el test dejaría de
  // medir solo lo que dice medir.
  const calls = [
    ...Array.from({ length: 20 }, () => call(9, 'meeting_scheduled')),
    ...Array.from({ length: 20 }, () => call(15, 'none')),
  ]
  const dead = evaluateChannel(channel({ channel: 'email', revenue: 0, sales: 0, opportunities: 0, spend: 900, leads: 40 }), 100)
  const result = revenueUpside(upsideInput({ calls: callOperations(calls, {}, 'UTC'), channels: [dead] }))
  assert.equal(result.weeklyCostOfInaction, Math.round((350 + 300) * (7 / 30)))
})

test('con ticket de referencia la confianza baja y se dice, en vez de firmar la cifra', () => {
  const untouched = Array.from({ length: 20 }, (_, index) => lead({ id: `u${index}`, createdAt: daysAgo(3) }))
  const result = revenueUpside(upsideInput({
    snapshot: snapshot({ dealValue: { value: 1500, source: 'baseline', sample: 0 } }),
    speed: responseSpeed(untouched, NOW),
  }))
  assert.equal(result.confidence, 'baja')
  assert.match(result.confidenceNote, /referencia del sector/)
  // Ninguna palanca puede presumir de más confianza que sus propias tasas.
  assert.ok(result.levers.every(lever => lever.confidence === 'baja'))
})

test('el veredicto abre con dinero cuando hay dinero que abrir', () => {
  const verdict = overallVerdict([], { calls: 4, revenue: 0, cost: 0 }, { monthlyUpside: 900, recoverable: 3000, annualUpside: 10_800 })
  assert.match(verdict.money ?? '', /900/)
  assert.match(verdict.money ?? '', /3000/)
  assert.equal(overallVerdict([], { calls: 4, revenue: 0, cost: 0 }).money, null)
})
