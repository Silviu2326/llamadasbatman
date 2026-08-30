import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateMicroappEstimate, validateMicroappResultEnvelope } from '../microapps/quality'
import { microappJobInputMatches, prepareMicroappEstimate, resolveMicroappEstimate } from '../microapps/runtime'

function validAgenticResult(): any {
  const roles = [
    { id: 'domain', name: 'Dominio' },
    { id: 'evidence', name: 'Evidencia' },
    { id: 'risk', name: 'Riesgo' },
  ]
  const reviews = () => roles.map(role => ({
    roleId: role.id, roleName: role.name, verdict: 'pass' as const, score: 90,
    confidence: 'high' as const, strengths: ['Resultado útil'], findings: [], questions: [],
  }))
  return {
    strategy: 'closed_loop' as const,
    profile: { microappId: 'quality-test', roles },
    requestedRounds: 2,
    completedRounds: 2,
    qualityThreshold: 85,
    rounds: [1, 2].map(round => ({
      round, reviews: reviews(),
      synthesis: { consensus: 'Consenso verificable del consejo.', disagreements: [], requiredChanges: [], nextRoundFocus: [], score: 90, status: 'ready' as const },
    })),
    revisions: [],
    final: { status: 'ready' as const, score: 90, consensus: 'Consenso verificable del consejo.', requiredChanges: [], unresolvedDisagreements: [] },
  }
}

test('acepta estimaciones fraccionarias válidas y rechaza costes corruptos', () => {
  assert.deepEqual(validateMicroappEstimate('quality-test', { cents: 1.25 }), { cents: 1.25 })
  for (const cents of [Number.NaN, Number.POSITIVE_INFINITY, -1, 100_000_001, '1']) {
    assert.throws(
      () => validateMicroappEstimate('quality-test', { cents }),
      (error: unknown) => (error as { code?: string }).code === 'MICROAPP_ESTIMATE_INVALID',
    )
  }
})

test('acepta un resultado trazable y estructurado', () => {
  const result = {
    data: { recommendation: 'Revisar el paso' },
    evidence: [{ claim: 'Entrada validada de la ejecución', sourceRef: { kind: 'microapp-input', id: 'job-1' }, confidence: 'high' as const, fetchedAt: '2026-08-19T10:00:00.000Z' }],
    assets: ['asset-1'],
    suggestedActions: [{ kind: 'open_job', label: 'Abrir trabajo', params: { jobId: 'job-1' } }],
  }
  assert.equal(validateMicroappResultEnvelope('quality-test', result), result)
})

test('rechaza resultados sin evidencia trazable, assets válidos o acciones útiles', () => {
  const base = { data: {}, evidence: [{ claim: 'Entrada validada', sourceRef: { kind: 'input', id: 'job-1' }, confidence: 'medium' as const }] }
  assert.throws(() => validateMicroappResultEnvelope('quality-test', { data: {}, evidence: [] }), /evidencia trazable/)
  assert.throws(() => validateMicroappResultEnvelope('quality-test', { data: {}, evidence: [{ claim: 'Sin referencia', confidence: 'low' }] }), /no enlaza/)
  assert.throws(() => validateMicroappResultEnvelope('quality-test', { ...base, assets: ['asset-1', 'asset-1'] }), /duplicados/)
  assert.throws(() => validateMicroappResultEnvelope('quality-test', { ...base, suggestedActions: [{ kind: 'x', label: 'No' }] }), /kind/)
  assert.throws(() => validateMicroappResultEnvelope('quality-test', {
    data: {},
    evidence: [{ claim: 'Fuente con credenciales', sourceUrl: 'https://user:secret@example.com/report', confidence: 'high' }],
  }), /URL no válida/)
  assert.throws(() => validateMicroappResultEnvelope('quality-test', {
    data: {}, evidence: [base.evidence[0], base.evidence[0]],
  }), /duplicadas/)
  assert.throws(() => validateMicroappResultEnvelope('quality-test', {
    ...base, suggestedActions: [{ kind: 'open_job', label: 'Abrir trabajo', params: [] }],
  }), /params debe ser un objeto/)
  assert.throws(() => validateMicroappResultEnvelope('quality-test', {
    ...base,
    agentic: {
      profile: { microappId: 'otra-microapp', roles: [] }, requestedRounds: 2, completedRounds: 0,
      rounds: [], revisions: [], final: { status: 'ready', score: 120 },
    },
  }), /otra microapp/)
})

test('R6 la traza agentic debe ser matemáticamente autoconsistente', () => {
  const base = {
    data: {},
    evidence: [{ claim: 'Entrada validada', sourceRef: { kind: 'input', id: 'job-1' }, confidence: 'medium' as const }],
    agentic: validAgenticResult(),
  }
  assert.equal(validateMicroappResultEnvelope('quality-test', base), base)

  const wrongScore = structuredClone(base)
  wrongScore.agentic.rounds[1].synthesis.score = 99
  assert.throws(() => validateMicroappResultEnvelope('quality-test', wrongScore), /score de la ronda 2/)

  const falseReady = structuredClone(base)
  falseReady.agentic.rounds[1].reviews[0].verdict = 'block'
  falseReady.agentic.rounds[1].reviews[0].findings = [{ severity: 'critical', path: '$', observation: 'Riesgo crítico visible', recommendation: 'Bloquear publicación' }]
  assert.throws(() => validateMicroappResultEnvelope('quality-test', falseReady), /estado de la ronda 2/)

  const duplicateReviewer = structuredClone(base)
  duplicateReviewer.agentic.rounds[0].reviews[1].roleId = 'domain'
  assert.throws(() => validateMicroappResultEnvelope('quality-test', duplicateReviewer), /revisores ausentes o duplicados/)

  const fakeRevision = structuredClone(base)
  fakeRevision.agentic.revisions = [{ afterRound: 1, status: 'applied', beforeHash: 'a'.repeat(64), afterHash: 'a'.repeat(64), appliedChanges: ['Cambio declarado'], unresolvedChanges: [] }]
  assert.throws(() => validateMicroappResultEnvelope('quality-test', fakeRevision), /no demuestra un cambio real/)
})

test('R6 una clave idempotente solo representa el mismo payload, links y configuración', () => {
  const first = { microappId: 'app', payload: { b: 2, a: 1 }, links: { leadId: 'lead-1' }, agentic: { rounds: 2 } }
  assert.equal(microappJobInputMatches(first, { agentic: { rounds: 2 }, links: { leadId: 'lead-1' }, payload: { a: 1, b: 2 }, microappId: 'app' }), true)
  assert.equal(microappJobInputMatches(first, { ...first, payload: { a: 1, b: 3 } }), false)
  assert.equal(microappJobInputMatches(first, { ...first, links: { leadId: 'lead-2' } }), false)
  assert.equal(microappJobInputMatches(first, { ...first, agentic: { rounds: 3 } }), false)
})

test('R6 Flow puede reutilizar una única estimación validada y ligada al payload', async () => {
  let estimateCalls = 0
  const manifest = {
    id: 'prepared-test', version: '1.0.0', name: 'Prepared', promise: 'Prueba presupuesto preparado', category: 'data',
    inputSchema: null, outputSchema: null, uiSchema: [], capabilities: [], dataAccess: [], effects: 'local', followUps: [],
    async estimateCost() { estimateCalls += 1; return { cents: 7.5 } },
    async run() { throw new Error('no ejecuta') },
  } as any
  const input = { nested: { value: 1 } }
  const prepared = await prepareMicroappEstimate({ orgId: 'org-r6', manifest, input })
  assert.equal(prepared.cents, 7.5)
  assert.equal(estimateCalls, 1)
  assert.deepEqual(await resolveMicroappEstimate({ orgId: 'org-r6', manifest, input: { nested: { value: 1 } }, prepared }), prepared)
  assert.equal(estimateCalls, 1, 'resolver el Job no debe volver a consultar precios')
  await assert.rejects(
    () => resolveMicroappEstimate({ orgId: 'org-r6', manifest, input: { nested: { value: 2 } }, prepared }),
    (error: unknown) => (error as { code?: string }).code === 'MICROAPP_PREPARED_ESTIMATE_MISMATCH',
  )

  const broken = { ...manifest, id: 'prepared-broken', async estimateCost() { return { cents: Number.NaN } } }
  await assert.rejects(
    () => prepareMicroappEstimate({ orgId: 'org-r6', manifest: broken, input }),
    (error: unknown) => (error as { code?: string }).code === 'MICROAPP_ESTIMATE_INVALID',
  )
})
