import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { prisma } from '../lib/prisma'
import { newSensitiveClaims } from '../lib/sensitiveContent'
import {
  AUTONOMOUS_KINDS,
  HUMAN_ONLY_KINDS,
  attributionCoverage,
  decide,
  getAutonomyConfig,
  getAutonomyState,
  listKinds,
  renderConfirmedEventPiece,
  ruleKeyForKind,
  rejectDecision,
  runAutonomyPass,
  setAutonomyConfig,
} from '../services/organicAutonomy.service'
import { enforceAutonomyGuardrails } from '../services/adRuleAutonomy.service'
import { setKillSwitch } from '../services/adPolicy.service'
import { cleanupOrgs, createTestOrg, createTestUser } from './testHelpers'

/**
 * Fase 4 de `docs/xarly/organico.md`: autonomía limitada.
 *
 * Estas pruebas existen para que aflojar la frontera de §9 sea un acto
 * consciente y visible en el diff. Lo que protegen: que N3 no publique
 * contenido nuevo por su cuenta, que el freno de emergencia detenga de verdad,
 * que ninguna acción se ejecute con los guardarraíles en rojo y que una regla
 * se degrade sola cuando los datos dejan de sostenerla.
 */

const orgIds: string[] = []

afterEach(async () => {
  if (!orgIds.length) return
  const where = { orgId: { in: orgIds } }
  await prisma.adActionResult.deleteMany({ where })
  await prisma.adAction.deleteMany({ where })
  await prisma.adDecision.deleteMany({ where })
  await prisma.adRuleAutonomy.deleteMany({ where })
  await prisma.adOptimizationPolicy.deleteMany({ where })
  await prisma.governancePolicy.deleteMany({ where })
  await prisma.organicChannelSnapshot.deleteMany({ where })
  await prisma.organicIntegration.deleteMany({ where })
  await prisma.organicAsset.deleteMany({ where })
  await prisma.organicAction.deleteMany({ where })
  await prisma.organicOpportunity.deleteMany({ where })
  await prisma.organicProject.deleteMany({ where })
  await prisma.acquisitionEvent.deleteMany({ where })
  await cleanupOrgs(orgIds.splice(0))
})

/**
 * Organización con proyecto y una fuente que sí mide, para que la integridad de
 * datos no sea `unreliable` y los guardarraíles puedan evaluarse de verdad.
 *
 * Search Console con propiedad elegida y sincronización reciente es la única
 * fuente que llega a `ready` sin depender de credenciales externas.
 */
async function organizationWithOrganicSignal(syncedHoursAgo = 1) {
  const org = await createTestOrg()
  orgIds.push(org.id)
  const user = await createTestUser(org.id, 'admin')
  const project = await prisma.organicProject.create({
    data: { orgId: org.id, name: 'Proyecto de prueba', website: 'https://example.com' },
  })
  await prisma.organicIntegration.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      provider: 'search_console',
      status: 'connected',
      externalPropertyId: 'sc-property',
      lastSyncedAt: new Date(Date.now() - syncedHoursAgo * 3_600_000),
    },
  })
  return { org, user, project }
}

// ─── Frontera de §9 ──────────────────────────────────────────────────────────

test('las dos listas de §9 no se solapan', () => {
  const autonomous = new Set<string>(Object.values(AUTONOMOUS_KINDS))
  for (const forbidden of Object.values(HUMAN_ONLY_KINDS)) {
    assert.equal(autonomous.has(forbidden), false, `${forbidden} no puede estar en ambas listas`)
  }
})

test('la lista delegable es exactamente la de §9', () => {
  assert.deepEqual(
    Object.values(AUTONOMOUS_KINDS).sort(),
    ['reaudit_seo', 'refresh_article', 'reply_review', 'reschedule_post', 'resync_source', 'vertical_event_piece'],
  )
})

test('el catálogo declara qué no se puede ejecutar todavía y por qué', () => {
  const kinds = listKinds()
  // Un tipo sin ejecución tiene que decirlo: un hueco silencioso se lee como
  // "esto ya funciona".
  for (const kind of kinds) {
    if (!kind.executable) {
      assert.ok(kind.unavailableReason && kind.unavailableReason.length > 20, `${kind.kind} no explica por qué no se puede ejecutar`)
    }
  }
  assert.equal(kinds.length, Object.values(AUTONOMOUS_KINDS).length)
})

test('la pieza de un acontecimiento solo reordena los datos recibidos', () => {
  const text = renderConfirmedEventPiece('Partido finalizado: Club A vs Club B', {
    payload: { marcador: '6-3 / 7-5', jornada: 4, confirmado: true, extra: { anidado: 'se ignora' } },
  })
  assert.ok(text.includes('6-3 / 7-5'))
  assert.ok(text.includes('jornada: 4'))
  // Nada que no viniera en el payload: si esto falla, la pieza está inventando.
  assert.equal(text.includes('anidado'), false)
  assert.equal(text.split('\n').length, 4)
})

test('un refresco que introduce una afirmación nueva se detecta', () => {
  const before = 'Cómo elegir una bicicleta urbana para la ciudad.'
  const after = 'Cómo elegir una bicicleta urbana. Desde 299 € con garantía de devolución.'
  const added = newSensitiveClaims(before, after)
  assert.deepEqual(added.sort(), ['incluye una garantía', 'menciona precios o promociones'])
  // Y una reescritura que no toca las afirmaciones no añade nada.
  assert.deepEqual(newSensitiveClaims(before, 'Guía para elegir bicicleta urbana en ciudad.'), [])
})

// ─── Estado por defecto ──────────────────────────────────────────────────────

test('por defecto la organización está en N1 y en modo sombra', async () => {
  const { org } = await organizationWithOrganicSignal()
  const config = await getAutonomyConfig(org.id)
  assert.equal(config.level, 'N1')
  assert.equal(config.shadowMode, true)

  const state = await getAutonomyState(org.id)
  assert.equal(state.killSwitch.enabled, false)
  assert.equal(state.killSwitch.sharedWith, 'ads')
  // Todos los tipos empiezan en N1: la autonomía se concede, no se hereda.
  assert.ok(state.kinds.every(kind => kind.effectiveLevel === 'N1'))
})

test('en N1 una acción se registra como observación y no ejecuta nada', async () => {
  const { org } = await organizationWithOrganicSignal()
  await decide(org.id, {
    kind: AUTONOMOUS_KINDS.RESYNC_SOURCE,
    title: 'Re-sincronizar Search Console',
    summary: 'Los datos de búsqueda tienen 60 h.',
    scope: 'search_console',
    target: 'sc-property',
    payload: { property: 'sc-property' },
    evidence: {},
  })

  const decision = await prisma.adDecision.findFirst({ where: { orgId: org.id, diagnosis: 'autonomy:resync_source' } })
  assert.ok(decision)
  assert.equal(decision.status, 'advisory')
  assert.equal(decision.mode, 'shadow')
  assert.equal(decision.autonomyLevel, 'N1')
  assert.equal(await prisma.adAction.count({ where: { orgId: org.id } }), 0)
})

// ─── Guardarraíles ───────────────────────────────────────────────────────────

test('un tipo sin ejecución implementada se bloquea con su motivo', async () => {
  const { org } = await organizationWithOrganicSignal()
  await decide(org.id, {
    kind: AUTONOMOUS_KINDS.REPLY_REVIEW,
    title: 'Responder reseña',
    summary: 'Hay una reseña sin responder.',
    scope: 'review',
    target: 'review-1',
    payload: {},
    evidence: {},
  })
  const decision = await prisma.adDecision.findFirst({ where: { orgId: org.id, diagnosis: 'autonomy:reply_review' } })
  assert.equal(decision?.status, 'blocked')
  assert.match(decision?.decisionNote ?? '', /sin ingesta|reseñas/i)
})

test('el contenido sensible bloquea aunque el tipo esté en la lista blanca', async () => {
  const { org } = await organizationWithOrganicSignal()
  await decide(org.id, {
    kind: AUTONOMOUS_KINDS.VERTICAL_EVENT_PIECE,
    title: 'Generar post de la promoción',
    summary: 'Nueva oferta: matrícula gratis este mes.',
    scope: 'opportunity',
    target: 'opp-1',
    payload: { format: 'post' },
    evidence: {},
  })
  const decision = await prisma.adDecision.findFirst({ where: { orgId: org.id, diagnosis: 'autonomy:vertical_event_piece' } })
  assert.equal(decision?.status, 'blocked')
  assert.match(decision?.decisionNote ?? '', /precios o promociones/)
})

test('el freno de emergencia compartido con Ads bloquea la ejecución y la subida de nivel', async () => {
  const { org, user } = await organizationWithOrganicSignal()
  await setAutonomyConfig(org.id, user.id, { level: 'N3', shadowMode: true })
  await setKillSwitch(org.id, user.id, true, 'Prueba de parada')

  await assert.rejects(
    () => setAutonomyConfig(org.id, user.id, { level: 'N3', shadowMode: false }),
    /parada|Reanúdala/i,
  )

  await decide(org.id, {
    kind: AUTONOMOUS_KINDS.RESYNC_SOURCE,
    title: 'Re-sincronizar Search Console',
    summary: 'Los datos de búsqueda tienen 60 h.',
    scope: 'search_console',
    target: 'sc-property',
    payload: {},
    evidence: {},
  })
  const decision = await prisma.adDecision.findFirst({ where: { orgId: org.id, diagnosis: 'autonomy:resync_source' } })
  assert.equal(decision?.status, 'blocked')
  assert.match(decision?.decisionNote ?? '', /parada/i)
  assert.equal(await prisma.adAction.count({ where: { orgId: org.id } }), 0)

  // Y el overview lo refleja: con el freno echado la política vuelve a N1.
  const state = await getAutonomyState(org.id)
  assert.equal(state.killSwitch.enabled, true)
})

test('el cooldown y el techo diario cuentan solo acciones orgánicas', async () => {
  const { org, user } = await organizationWithOrganicSignal()
  await setAutonomyConfig(org.id, user.id, { level: 'N3', maxActionsPerDay: 1, cooldownMinutes: 600 })

  // Una acción orgánica reciente, creada a mano para no depender de la red.
  const decision = await prisma.adDecision.create({
    data: {
      orgId: org.id,
      diagnosis: 'autonomy:resync_source',
      channel: 'search',
      ruleKey: ruleKeyForKind(AUTONOMOUS_KINDS.RESYNC_SOURCE),
      dedupeKey: `manual-${Date.now()}`,
      confidence: 'medium',
      confidenceReason: 'prueba',
      title: 'Re-sincronizar',
      explanation: 'prueba',
      recommendation: 'prueba',
      evidence: {},
      status: 'executed',
    },
  })
  await prisma.adAction.create({
    data: { orgId: org.id, decisionId: decision.id, kind: AUTONOMOUS_KINDS.RESYNC_SOURCE, scope: 'search_console', payload: {}, status: 'executed' },
  })

  await decide(org.id, {
    kind: AUTONOMOUS_KINDS.RESYNC_SOURCE,
    title: 'Re-sincronizar Search Console',
    summary: 'Otra vez.',
    scope: 'search_console',
    target: 'otra-propiedad',
    payload: {},
    evidence: {},
  })
  const blocked = await prisma.adDecision.findFirst({
    where: { orgId: org.id, diagnosis: 'autonomy:resync_source', id: { not: decision.id } },
  })
  assert.equal(blocked?.status, 'blocked')
  assert.match(blocked?.decisionNote ?? '', /límite es 1|mínimo es 600/)
})

// ─── Cobertura y degradación ────────────────────────────────────────────────

test('la cobertura de atribución sale de los snapshots y no reparte lo desconocido', async () => {
  const { org, project } = await organizationWithOrganicSignal()
  const base = { orgId: org.id, projectId: project.id, periodKey: '30d', periodDays: 30, periodStart: new Date() }
  await prisma.organicChannelSnapshot.createMany({
    data: [
      { ...base, channel: 'search', leads: 6 },
      { ...base, channel: 'social', leads: 2 },
      { ...base, channel: 'unattributed', leads: 2 },
    ],
  })
  assert.equal(await attributionCoverage(org.id, project.id), 80)
})

test('una regla orgánica en N3 se degrada sola cuando las fuentes no son fiables', async () => {
  const org = await createTestOrg()
  orgIds.push(org.id)
  // Sin proyecto orgánico la integridad es `unreliable`: es el peor caso y el
  // que tiene que degradar sin que nadie lo pida.
  const ruleKey = ruleKeyForKind(AUTONOMOUS_KINDS.VERTICAL_EVENT_PIECE)
  await prisma.adRuleAutonomy.create({ data: { orgId: org.id, ruleKey, autonomyLevel: 'N3' } })

  const result = await enforceAutonomyGuardrails(org.id)
  assert.equal(result.degraded, 1)
  const rule = await prisma.adRuleAutonomy.findUnique({ where: { orgId_ruleKey: { orgId: org.id, ruleKey } } })
  assert.equal(rule?.autonomyLevel, 'N1')
  assert.match(rule?.degradedReason ?? '', /orgánicas|insuficiente/i)
})

test('la re-sincronización no se degrada por datos obsoletos: es la que los arregla', async () => {
  // Sincronización de hace cinco días: la integridad global pasa a `stale`.
  const { org } = await organizationWithOrganicSignal(5 * 24)
  const repairKey = ruleKeyForKind(AUTONOMOUS_KINDS.RESYNC_SOURCE)
  const otherKey = ruleKeyForKind(AUTONOMOUS_KINDS.VERTICAL_EVENT_PIECE)
  await prisma.adRuleAutonomy.createMany({
    data: [
      { orgId: org.id, ruleKey: repairKey, autonomyLevel: 'N3' },
      { orgId: org.id, ruleKey: otherKey, autonomyLevel: 'N3' },
    ],
  })

  await enforceAutonomyGuardrails(org.id)
  const repair = await prisma.adRuleAutonomy.findUnique({ where: { orgId_ruleKey: { orgId: org.id, ruleKey: repairKey } } })
  const other = await prisma.adRuleAutonomy.findUnique({ where: { orgId_ruleKey: { orgId: org.id, ruleKey: otherKey } } })
  assert.equal(repair?.autonomyLevel, 'N3', 'la reparación no se degrada por la avería que repara')
  assert.equal(other?.autonomyLevel, 'N1')
  assert.match(other?.degradedReason ?? '', /obsoletas/i)
})

// ─── Pasada completa ─────────────────────────────────────────────────────────

test('la pasada propone la re-sincronización cuando los datos envejecen y no la repite', async () => {
  const { org } = await organizationWithOrganicSignal(5 * 24)

  const first = await runAutonomyPass(org.id)
  assert.equal(first.level, 'N1')
  assert.equal(first.shadowMode, true)
  assert.ok(first.proposed >= 1)
  assert.equal(first.decided >= 1, true)

  // La segunda pasada no vuelve a plantear el mismo asunto: duplicar la cola es
  // la forma más rápida de que nadie la lea.
  const second = await runAutonomyPass(org.id)
  assert.equal(second.decided, 0)
  assert.ok(second.skipped >= 1)
  assert.equal(await prisma.adDecision.count({ where: { orgId: org.id, diagnosis: 'autonomy:resync_source' } }), 1)
  // Y en N1 nada se ha ejecutado.
  assert.equal(await prisma.adAction.count({ where: { orgId: org.id } }), 0)
})

test('una acción de la lista negra no llega ni a decidirse', async () => {
  const { org } = await organizationWithOrganicSignal()
  await assert.rejects(
    () => decide(org.id, {
      kind: HUMAN_ONLY_KINDS.IMPORT_PROSPECTS,
      title: 'Importar prospectos',
      summary: 'Hay 40 negocios sin importar.',
      scope: 'prospecting',
      target: null,
      payload: {},
      evidence: {},
    }),
    /desconocido/i,
  )
  assert.equal(await prisma.adDecision.count({ where: { orgId: org.id } }), 0)
})

test('la pieza de un conector no se propone si el formato no acumula aprobaciones', async () => {
  const { org, project } = await organizationWithOrganicSignal()
  const connector = await prisma.verticalConnector.create({
    data: { orgId: org.id, projectId: project.id, moduleKey: 'deporte', name: 'API de prueba', status: 'active' },
  })
  await prisma.organicContentRule.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      moduleKey: 'deporte',
      eventKey: 'match_finished',
      label: 'Partido finalizado',
      formats: ['post'],
      approvalPolicy: 'auto',
      isActive: true,
    },
  })
  await prisma.organicOpportunity.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      title: 'Partido finalizado: Club A vs Club B',
      source: 'vertical_connector',
      sourceKind: 'vertical_event',
      channel: 'social',
      connectorId: connector.id,
      status: 'open',
      metadata: { eventKey: 'match_finished', approvalPolicy: 'auto', payload: { marcador: '6-3' } },
    },
  })

  const withoutHistory = await runAutonomyPass(org.id)
  assert.equal(
    withoutHistory.proposed,
    0,
    'sin aprobaciones previas del formato, la pieza sigue pasando por la sala de aprobación',
  )

  // Con tres piezas del formato aprobadas por personas, ya se puede proponer.
  await prisma.contentPiece.createMany({
    data: [1, 2, 3].map(index => ({ orgId: org.id, format: 'post', body: { text: `pieza ${index}` }, status: 'approved' })),
  })
  const withHistory = await runAutonomyPass(org.id)
  assert.equal(withHistory.proposed, 1)

  await prisma.contentPiece.deleteMany({ where: { orgId: org.id } })
  await prisma.organicContentRule.deleteMany({ where: { orgId: org.id } })
  await prisma.verticalEvent.deleteMany({ where: { orgId: org.id } })
  await prisma.verticalConnector.deleteMany({ where: { orgId: org.id } })
})

test('en N3 sin sombra la pieza se genera sola, con su acción y su resultado', async () => {
  const { org, user, project } = await organizationWithOrganicSignal()
  const kind = AUTONOMOUS_KINDS.VERTICAL_EVENT_PIECE
  await setAutonomyConfig(org.id, user.id, { level: 'N3', shadowMode: false })
  // El nivel de la organización es el techo; el tipo tiene que habérselo ganado
  // aparte. Aquí se simula el historial que da la promoción.
  await prisma.adRuleAutonomy.create({ data: { orgId: org.id, ruleKey: ruleKeyForKind(kind), autonomyLevel: 'N3' } })
  await prisma.contentPiece.createMany({
    data: [1, 2, 3].map(index => ({ orgId: org.id, format: 'post', body: { text: `pieza ${index}` }, status: 'approved' })),
  })

  const connector = await prisma.verticalConnector.create({
    data: { orgId: org.id, projectId: project.id, moduleKey: 'deporte', name: 'API de prueba', status: 'active' },
  })
  await prisma.organicContentRule.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      moduleKey: 'deporte',
      eventKey: 'match_finished',
      label: 'Partido finalizado',
      formats: ['post'],
      approvalPolicy: 'auto',
      isActive: true,
    },
  })
  const opportunity = await prisma.organicOpportunity.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      title: 'Partido finalizado: Club A vs Club B',
      source: 'vertical_connector',
      sourceKind: 'vertical_event',
      channel: 'social',
      connectorId: connector.id,
      status: 'open',
      metadata: { eventKey: 'match_finished', approvalPolicy: 'auto', payload: { marcador: '6-3 / 7-5', jornada: 4 } },
    },
  })

  const pass = await runAutonomyPass(org.id)
  assert.equal(pass.executed, 1)

  const asset = await prisma.organicAsset.findFirst({ where: { orgId: org.id, opportunityId: opportunity.id } })
  assert.ok(asset, 'la pieza tiene que existir')
  assert.equal(asset.status, 'draft', 'N3 genera la pieza, pero publicarla sigue siendo de una persona')
  assert.match(JSON.stringify(asset.content), /6-3/)

  const action = await prisma.adAction.findFirst({ where: { orgId: org.id, kind } })
  assert.equal(action?.status, 'executed')
  assert.equal(action?.mode, 'live')
  // El examen completo queda guardado, no solo el veredicto.
  assert.ok(Array.isArray(action?.guardrailChecks) && (action.guardrailChecks as unknown[]).length >= 8)
  const result = await prisma.adActionResult.findFirst({ where: { orgId: org.id, actionId: action!.id } })
  assert.equal(result?.outcome, 'ok')
  const decision = await prisma.adDecision.findFirst({ where: { orgId: org.id, diagnosis: `autonomy:${kind}` } })
  assert.equal(decision?.status, 'executed')
  assert.equal(decision?.autonomyLevel, 'N3')

  await prisma.contentPiece.deleteMany({ where: { orgId: org.id } })
  await prisma.organicContentRule.deleteMany({ where: { orgId: org.id } })
  await prisma.verticalEvent.deleteMany({ where: { orgId: org.id } })
  await prisma.verticalConnector.deleteMany({ where: { orgId: org.id } })
})

test('un asunto rechazado hace poco no se vuelve a decidir ni se le reescribe el motivo', async () => {
  const { org, user } = await organizationWithOrganicSignal()
  const proposal = {
    kind: AUTONOMOUS_KINDS.RESYNC_SOURCE,
    title: 'Re-sincronizar Search Console',
    summary: 'Los datos de búsqueda tienen 60 h.',
    scope: 'search_console',
    target: 'sc-property',
    payload: {},
    evidence: {},
  }
  const first = await decide(org.id, proposal)
  assert.ok(first)
  const firstId = first.decision?.id
  assert.ok(firstId)
  await rejectDecision(org.id, user.id, firstId, 'La propiedad elegida es la equivocada')

  // Mismo asunto otra vez: la ventana de silencio devuelve el rechazo anterior
  // sin crear una decisión nueva ni pisar el motivo que escribió la persona.
  const second = await decide(org.id, proposal)
  assert.ok(second)
  assert.equal(second.decision?.id, firstId)
  assert.equal(second.decision?.status, 'rejected')
  assert.equal(await prisma.adDecision.count({ where: { orgId: org.id, diagnosis: 'autonomy:resync_source' } }), 1)
  const stored = await prisma.adDecision.findUnique({ where: { id: firstId } })
  assert.equal(stored?.decisionNote, 'La propiedad elegida es la equivocada')
})
