process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import '../providers'
import { listMicroapps } from '../microapps/registry'
import type { MicroappCtx, MicroappManifest } from '../microapps/types'
import {
  agenticExecutionConfigSchema,
  agenticCallCount,
  agenticProfileFor,
  runAgenticCouncil,
} from '../microapps/agentic'
import { agenticFlowTemplateFor } from '../microapps/agenticFlowTemplate'
import { extractCapabilityDependencies, validateFlowGraph } from '../flows/graph'
import { resolveValueRef } from '../flows/eval'
import { materializeMicroappStepOutput } from '../jobs/flowRunner'

test('las 147 microapps exponen un consejo especializado y un workflow agentic instalable', () => {
  const apps = listMicroapps()
  assert.equal(apps.length, 147)
  const slugs = new Set<string>()
  for (const app of apps) {
    const profile = agenticProfileFor(app)
    assert.equal(profile.roles.length, 3, `${app.id}: consejo incompleto`)
    assert.equal(new Set(profile.roles.map(role => role.id)).size, 3, `${app.id}: roles duplicados`)
    assert.equal(profile.defaultRounds, 2)
    assert.equal(profile.maxRounds, 3)
    assert.equal(profile.requiresExplicitExternalReviewConsent, true)

    const template = agenticFlowTemplateFor(app)
    assert.equal(template.microappId, app.id)
    assert.equal(template.microappVersion, app.version)
    assert.ok(!slugs.has(template.slug), `${app.id}: slug agentic duplicado`)
    slugs.add(template.slug)
    assert.deepEqual(validateFlowGraph(template.graph), [], `${app.id}: template inválido`)

    const execute = template.graph.nodes.find(node => node.key === 'execute_with_council')
    assert.ok(execute && execute.type === 'microapp')
    if (execute.type !== 'microapp') throw new Error('nodo agentic ausente')
    assert.equal(execute.microappId, app.id)
    assert.equal(execute.agentic?.strategy, 'closed_loop')
    assert.equal(execute.agentic?.rounds, 2)
    assert.deepEqual(Object.keys(execute.input).sort(), app.uiSchema.map(field => field.key).sort(), `${app.id}: input del workflow divergente`)
    assert.ok(extractCapabilityDependencies(template.graph).some(dep => dep.capability === 'llm.generate'), `${app.id}: falta dependencia del consejo`)
    assert.ok(template.graph.nodes.some(node => node.type === 'approval' && node.action === 'agentic_accept'), `${app.id}: falta revisión humana fail-closed`)
  }
  assert.equal(slugs.size, 147)
})

test('la configuración exige consentimiento explícito y limita rondas, umbral y presupuesto', () => {
  assert.equal(agenticExecutionConfigSchema.safeParse({ enabled: true, allowExternalReview: false }).success, false)
  assert.equal(agenticExecutionConfigSchema.safeParse({ enabled: true, allowExternalReview: true, rounds: 4 }).success, false)
  assert.equal(agenticExecutionConfigSchema.safeParse({ enabled: true, allowExternalReview: true, qualityThreshold: 59 }).success, false)
  assert.equal(agenticExecutionConfigSchema.safeParse({ enabled: true, allowExternalReview: true, maxAdditionalCostCents: 0 }).success, false)
  const parsed = agenticExecutionConfigSchema.parse({ enabled: true, allowExternalReview: true })
  assert.deepEqual(parsed, {
    enabled: true,
    strategy: 'closed_loop',
    rounds: 2,
    qualityThreshold: 85,
    maxAdditionalCostCents: 500,
    allowExternalReview: true,
  })
  assert.equal(agenticCallCount(parsed, 3), 9, '2 rondas cerradas = 6 revisiones + 2 síntesis + 1 edición')
  assert.equal(agenticCallCount({ ...parsed, strategy: 'council' }, 3), 8)
  assert.equal(agenticCallCount({ ...parsed, rounds: 3 }, 3), 14)
})

test('el consejo reparte revisores entre proveedores y modelos realmente disponibles', async () => {
  const manifest: MicroappManifest = {
    id: 'agentic-diversity', version: '1.0.0', name: 'Consejo diverso',
    promise: 'Contrasta un resultado con modelos independientes', category: 'research',
    inputSchema: z.object({ topic: z.string() }), outputSchema: z.object({ answer: z.string() }),
    uiSchema: [{ key: 'topic', label: 'Tema', widget: 'text' }], capabilities: ['llm.generate'],
    dataAccess: [], effects: 'local', followUps: [], estimateCost: async () => ({ cents: 1 }),
    run: async () => ({ data: { answer: 'original' }, evidence: [] }),
  }
  const calls: Array<{ providerId?: string; model?: string }> = []
  const ctx: MicroappCtx = {
    orgId: 'org-diverse', jobId: 'job-diverse',
    async planCapability() {
      return {
        chosen: { providerId: 'deepseek', estimateCents: 1, models: ['deepseek-chat', 'deepseek-reasoner'] },
        alternatives: [{ providerId: 'openai-chat', estimateCents: 1, models: [] }],
      }
    },
    async capability(_name, input, preferences) {
      const request = input as { system?: string; model?: string }
      calls.push({ providerId: preferences?.providerId, model: request.model })
      if (request.system?.includes('presidente neutral')) {
        return { text: JSON.stringify({ consensus: 'Los revisores coinciden en que la salida es verificable.', disagreements: [], requiredChanges: [], nextRoundFocus: [] }) }
      }
      return { text: JSON.stringify({ verdict: 'pass', score: 92, confidence: 'high', strengths: ['Evidencia clara'], findings: [], questions: [] }) }
    },
    log() {},
  }
  const council = await runAgenticCouncil({
    ctx, manifest, input: { topic: 'hoteles' },
    result: { data: { answer: 'resultado con fuentes' }, evidence: [] },
    config: agenticExecutionConfigSchema.parse({ enabled: true, strategy: 'council', rounds: 2, allowExternalReview: true }),
  })

  assert.equal(council.profile.modelDiversity.mode, 'multi_model')
  assert.deepEqual(council.profile.modelDiversity.providerIds.sort(), ['deepseek', 'openai-chat'])
  assert.ok(council.profile.modelDiversity.modelIds.includes('deepseek-chat'))
  assert.ok(council.profile.modelDiversity.modelIds.includes('deepseek-reasoner'))
  assert.ok(calls.some(call => call.providerId === 'deepseek' && call.model === 'deepseek-chat'))
  assert.ok(calls.some(call => call.providerId === 'deepseek' && call.model === 'deepseek-reasoner'))
  assert.ok(calls.some(call => call.providerId === 'openai-chat' && call.model === undefined))
  assert.equal(new Set(council.profile.roles.map(role => `${role.providerId}:${role.model || 'configured'}`)).size, 3)
})

test('el Flow materializa el resultado completo y el quality gate puede leer el veredicto del consejo', () => {
  const output = materializeMicroappStepOutput(
    { microappId: 'agentic-test', evidenceCount: 1 },
    {
      id: 'run-1',
      staleAt: new Date('2030-01-01T00:00:00.000Z'),
      result: {
        data: { answer: 'resultado encadenable' },
        evidence: [],
        agentic: { final: { status: 'ready', score: 91 } },
      },
    },
  ) as Record<string, unknown>
  const ctx = { variables: {}, outputs: { execute_with_council: output } }
  assert.equal(resolveValueRef({ from: 'execute_with_council.result.data.answer' }, ctx), 'resultado encadenable')
  assert.equal(resolveValueRef({ from: 'execute_with_council.result.agentic.final.status' }, ctx), 'ready')
  assert.equal(resolveValueRef({ from: 'execute_with_council.microappRunId' }, ctx), 'run-1')
})

test('el circuito ejecuta varias rondas, redacta sensibles y calcula el score sin confiar en el presidente', async () => {
  const manifest: MicroappManifest = {
    id: 'agentic-test', version: '1.1.0', name: 'Prueba agentic',
    promise: 'Comprueba un entregable estructurado mediante deliberación independiente y trazable',
    category: 'research',
    inputSchema: z.object({ topic: z.string(), secret: z.string(), config: z.object({ password: z.string() }) }),
    outputSchema: z.object({ answer: z.string(), privateNote: z.string() }),
    uiSchema: [
      { key: 'topic', label: 'Tema', widget: 'text' },
      { key: 'secret', label: 'Secreto', widget: 'textarea', sensitive: true },
    ],
    capabilities: ['llm.generate'], dataAccess: [], effects: 'local', freshnessDays: 1, followUps: [],
    estimateCost: async () => ({ cents: 1 }),
    run: async () => ({ data: { answer: 'ok', privateNote: 'secreto-no-debe-salir' }, evidence: [] }),
  }
  const prompts: string[] = []
  let reviewerIndex = 0
  const ctx: MicroappCtx = {
    orgId: 'org-1', jobId: 'job-1',
    async capability(_name, input) {
      const request = input as { system?: string; prompt: string }
      prompts.push(request.prompt)
      if (request.system?.includes('presidente neutral')) {
        return { text: JSON.stringify({ consensus: 'Consenso verificable del consejo de agentes.', disagreements: [], requiredChanges: [], nextRoundFocus: ['Verificar de nuevo la evidencia'] }) }
      }
      if (request.system?.includes('editor de entregables estructurados')) {
        return { text: JSON.stringify({
          data: { answer: 'respuesta revisada y verificable', privateNote: '[REDACTADO POR POLÍTICA]' },
          appliedChanges: ['Se añadió el contexto solicitado por el consejo'],
          unresolvedChanges: [],
        }) }
      }
      const secondRound = reviewerIndex >= 3
      const firstScores = [70, 80, 90]
      const score = secondRound ? 90 : firstScores[reviewerIndex]
      reviewerIndex += 1
      return { text: JSON.stringify({ verdict: secondRound ? 'pass' : 'revise', score, confidence: 'high', strengths: ['Salida estructurada'], findings: secondRound ? [] : [{ severity: 'medium', path: '$.answer', observation: 'Falta contexto adicional', recommendation: 'Añadir contexto verificable' }], questions: [] }) }
    },
    log() {},
  }
  const council = await runAgenticCouncil({
    ctx,
    manifest,
    input: {
      topic: 'mercado jane@example.com +34600111222 sk-1234567890abcdef',
      secret: 'secreto-no-debe-salir',
      config: { password: 'nested-hunter2-no-debe-salir' },
    },
    result: { data: { answer: 'respuesta', privateNote: 'secreto-no-debe-salir' }, evidence: [{ claim: 'Dato aportado', sourceRef: { kind: 'input', id: 'job-1' }, confidence: 'high' }] },
    config: agenticExecutionConfigSchema.parse({ enabled: true, allowExternalReview: true }),
  })
  assert.equal(council.completedRounds, 2)
  assert.equal(council.rounds[0].synthesis.score, 80)
  assert.equal(council.rounds[0].synthesis.status, 'revise')
  assert.equal(council.rounds[1].synthesis.score, 90)
  assert.equal(council.final.status, 'ready')
  assert.equal(council.revisions.length, 1)
  assert.equal(council.revisions[0].status, 'applied')
  assert.deepEqual(council.revisedData, { answer: 'respuesta revisada y verificable', privateNote: 'secreto-no-debe-salir' })
  assert.notEqual(council.revisions[0].beforeHash, council.revisions[0].afterHash)
  assert.equal(prompts.some(prompt => prompt.includes('secreto-no-debe-salir')), false)
  assert.equal(prompts.some(prompt => prompt.includes('nested-hunter2-no-debe-salir')), false)
  assert.equal(prompts.some(prompt => prompt.includes('jane@example.com') || prompt.includes('+34600111222') || prompt.includes('sk-1234567890abcdef')), false)
  assert.ok(prompts.some(prompt => prompt.includes('REDACTADO POR POLÍTICA')))
  assert.ok(prompts.some(prompt => prompt.includes('EMAIL REDACTADO') && prompt.includes('TELÉFONO REDACTADO') && prompt.includes('CREDENCIAL REDACTADA')))
})

test('el editor no puede reordenar, borrar ni reasociar registros autoritativos', async () => {
  const item = z.object({ id: z.string(), costCents: z.number(), narrative: z.string() })
  const manifest: MicroappManifest = {
    id: 'agentic-ledger', version: '1.0.0', name: 'Ledger agentic',
    promise: 'Mejora la narrativa sin alterar identidad ni costes', category: 'data',
    inputSchema: z.object({ context: z.string() }), outputSchema: z.object({ items: z.array(item) }),
    uiSchema: [{ key: 'context', label: 'Contexto', widget: 'text' }], capabilities: ['llm.generate'],
    dataAccess: [], effects: 'local', followUps: [], estimateCost: async () => ({ cents: 1 }),
    run: async () => ({ data: { items: [] }, evidence: [] }),
  }
  let reviewers = 0
  const ctx: MicroappCtx = {
    orgId: 'org-1', jobId: 'job-ledger',
    async capability(_name, input) {
      const request = input as { system?: string }
      if (request.system?.includes('presidente neutral')) {
        return { text: JSON.stringify({ consensus: 'Mejorar claridad.', disagreements: [], requiredChanges: [], nextRoundFocus: [] }) }
      }
      if (request.system?.includes('editor de entregables estructurados')) {
        return { text: JSON.stringify({
          data: { items: [
            { id: 'b', costCents: 999, narrative: 'texto de B reasociado a A' },
            { id: 'a', costCents: 999, narrative: 'texto de A reasociado a B' },
          ] },
          appliedChanges: ['Reordenados registros y costes'], unresolvedChanges: [],
        }) }
      }
      reviewers += 1
      return { text: JSON.stringify({ verdict: reviewers <= 3 ? 'revise' : 'pass', score: reviewers <= 3 ? 70 : 90, confidence: 'high', strengths: [], findings: [], questions: [] }) }
    },
    log() {},
  }
  const original = { items: [
    { id: 'a', costCents: 10, narrative: 'original A' },
    { id: 'b', costCents: 20, narrative: 'original B' },
  ] }
  const council = await runAgenticCouncil({
    ctx, manifest, input: { context: 'Contexto suficiente para revisar' }, result: { data: original, evidence: [] },
    config: agenticExecutionConfigSchema.parse({ enabled: true, allowExternalReview: true }),
  })
  assert.equal(council.revisions[0].status, 'rejected')
  assert.equal(council.revisedData, undefined)
  assert.equal(council.final.status, 'human_review')
})

test('el editor no puede alterar métricas autoritativas con unidad o sufijo', async () => {
  const manifest: MicroappManifest = {
    id: 'agentic-metrics', version: '1.0.0', name: 'Métricas agentic',
    promise: 'Mejora la explicación sin recalcular cifras observadas', category: 'data',
    inputSchema: z.object({ context: z.string() }),
    outputSchema: z.object({
      providerCostCents: z.number(),
      weightedScore: z.number(),
      durationS: z.number(),
      renewalDate: z.string(),
      narrative: z.string(),
    }),
    uiSchema: [{ key: 'context', label: 'Contexto', widget: 'text' }], capabilities: ['llm.generate'],
    dataAccess: [], effects: 'local', followUps: [], estimateCost: async () => ({ cents: 1 }),
    run: async () => ({ data: {}, evidence: [] }),
  }
  let reviewers = 0
  const ctx: MicroappCtx = {
    orgId: 'org-1', jobId: 'job-metrics',
    async capability(_name, input) {
      const request = input as { system?: string }
      if (request.system?.includes('presidente neutral')) {
        return { text: JSON.stringify({ consensus: 'Aclarar narrativa.', disagreements: [], requiredChanges: ['Aclarar narrativa'], nextRoundFocus: ['Claridad'] }) }
      }
      if (request.system?.includes('editor de entregables estructurados')) {
        return { text: JSON.stringify({
          data: {
            providerCostCents: 1,
            weightedScore: 99,
            durationS: 1,
            renewalDate: '2099-01-01',
            narrative: 'texto mejorado',
          },
          appliedChanges: ['Aclarada narrativa y recalculadas métricas'], unresolvedChanges: [],
        }) }
      }
      reviewers += 1
      return { text: JSON.stringify({ verdict: reviewers <= 3 ? 'revise' : 'pass', score: reviewers <= 3 ? 70 : 90, confidence: 'high', strengths: [], findings: [], questions: [] }) }
    },
    log() {},
  }
  const council = await runAgenticCouncil({
    ctx, manifest, input: { context: 'Contexto suficiente' },
    result: { data: { providerCostCents: 450, weightedScore: 72, durationS: 30, renewalDate: '2026-12-01', narrative: 'original' }, evidence: [] },
    config: agenticExecutionConfigSchema.parse({ enabled: true, allowExternalReview: true }),
  })
  assert.equal(council.revisions[0].status, 'rejected')
  assert.equal(council.revisedData, undefined)
  assert.equal(council.final.status, 'human_review')
})

test('una revisión agentic incompatible se rechaza y nunca sustituye la salida válida', async () => {
  const manifest: MicroappManifest = {
    id: 'agentic-fail-closed', version: '1.0.0', name: 'Prueba fail closed',
    promise: 'Conserva el resultado canónico cuando una revisión incumple el contrato', category: 'data',
    inputSchema: z.object({ value: z.string() }), outputSchema: z.object({ answer: z.string() }),
    uiSchema: [{ key: 'value', label: 'Valor', widget: 'text' }], capabilities: ['llm.generate'],
    dataAccess: [], effects: 'local', followUps: [], estimateCost: async () => ({ cents: 1 }),
    run: async () => ({ data: { answer: 'original' }, evidence: [] }),
  }
  let reviewers = 0
  const ctx: MicroappCtx = {
    orgId: 'org-1', jobId: 'job-2',
    async capability(_name, input) {
      const request = input as { system?: string }
      if (request.system?.includes('presidente neutral')) {
        return { text: JSON.stringify({ consensus: 'Se requiere una corrección antes de aceptar.', disagreements: [], requiredChanges: ['Completar respuesta'], nextRoundFocus: ['Contrato'] }) }
      }
      if (request.system?.includes('editor de entregables estructurados')) {
        return { text: JSON.stringify({ data: { wrong: true }, appliedChanges: ['Cambio incompatible'], unresolvedChanges: [] }) }
      }
      reviewers += 1
      return { text: JSON.stringify({ verdict: reviewers <= 3 ? 'revise' : 'pass', score: reviewers <= 3 ? 70 : 90, confidence: 'high', strengths: [], findings: [], questions: [] }) }
    },
    log() {},
  }
  const council = await runAgenticCouncil({
    ctx, manifest, input: { value: 'aportado' },
    result: { data: { answer: 'original' }, evidence: [{ claim: 'Valor aportado por el usuario', sourceRef: { kind: 'input', id: 'job-2' }, confidence: 'high' }] },
    config: agenticExecutionConfigSchema.parse({ enabled: true, allowExternalReview: true }),
  })
  assert.equal(council.revisions[0].status, 'rejected')
  assert.equal(council.revisedData, undefined)
  assert.equal(council.final.status, 'human_review')
})
