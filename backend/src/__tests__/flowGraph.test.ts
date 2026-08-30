// Tests offline del contrato de Flows (05-FLUJOS §3 y §6).
//
// Sin BD: igual que providerRouter.test.ts, se fija una DATABASE_URL de
// mentira antes de importar cualquier módulo de dominio (systemRecipes importa
// prisma transitvamente pero no ejecuta ninguna query al importar).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractCapabilityDependencies, flowGraph, validateFlowGraph } from '../flows/graph'
import { buildNodeInput, evaluateCondition, resolveValueRef } from '../flows/eval'
import { SYSTEM_RECIPES } from '../flows/systemRecipes'
import { FLOW_ACTION_TYPES, flowStepJobIdempotencyKey } from '../jobs/flowRunner'
import '../providers'

function graphWith(nodes: unknown[], edges: Array<{ from: string; to: string }> = []) {
  return flowGraph.parse({ variables: {}, nodes, edges, trigger: { type: 'manual' } })
}

test('validateFlowGraph detecta claves duplicadas', () => {
  const graph = graphWith([
    { key: 'a', type: 'action', action: 'notify', input: {} },
    { key: 'a', type: 'action', action: 'notify', input: {} },
  ])
  const problems = validateFlowGraph(graph)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /duplicada: a/)
})

test('validateFlowGraph detecta referencias rotas de condition, map y edges', () => {
  const graph = graphWith(
    [
      { key: 'decide', type: 'condition', left: { var: 'x' }, op: 'exists', ifTrue: 'no-existe', ifFalse: 'tampoco' },
      { key: 'fanout', type: 'map', items: { var: 'items' }, node: 'fantasma' },
    ],
    [{ from: 'decide', to: 'perdido' }],
  )
  const problems = validateFlowGraph(graph)
  assert.equal(problems.length, 4)
  assert.ok(problems.some(p => p.includes('no-existe')))
  assert.ok(problems.some(p => p.includes('tampoco')))
  assert.ok(problems.some(p => p.includes('fantasma')))
  assert.ok(problems.some(p => p.includes('perdido')))
})

test('validateFlowGraph rechaza ciclos, edges ambiguas, waits mal definidos y plantillas map no ejecutables', () => {
  const graph = flowGraph.parse({
    variables: {}, trigger: { type: 'manual' },
    nodes: [
      { key: 'a', type: 'action', action: 'notify', input: {} },
      { key: 'espera', type: 'wait', seconds: 10, eventTopic: 'x' },
      { key: 'cond', type: 'condition', left: true, op: 'eq', right: true, ifTrue: 'a' },
      { key: 'fanout', type: 'map', items: ['x'], node: 'espera' },
    ],
    edges: [{ from: 'a', to: 'cond' }, { from: 'a', to: 'fanout' }],
  })
  const problems = validateFlowGraph(graph)
  assert.ok(problems.some(problem => /una edge saliente/.test(problem)))
  assert.ok(problems.some(problem => /salto hacia atrás|ciclo/.test(problem)))
  assert.ok(problems.some(problem => /exactamente seconds o eventTopic/.test(problem)))
  assert.ok(problems.some(problem => /plantilla capability o action/.test(problem)))
})

test('extractCapabilityDependencies materializa capability y proveedor fijado', () => {
  const graph = graphWith([
    { key: 'gen', type: 'capability', capability: 'image.generate', input: {} },
    { key: 'up', type: 'capability', capability: 'image.upscale', providerId: 'magnific', input: {} },
    { key: 'aviso', type: 'action', action: 'notify', input: {} },
  ])
  assert.deepEqual(extractCapabilityDependencies(graph), [
    { capability: 'image.generate', pinnedProvider: null },
    { capability: 'image.upscale', pinnedProvider: 'magnific' },
  ])
})

test('extractCapabilityDependencies incluye las capabilities internas de una microapp sin duplicarlas', () => {
  const graph = graphWith([
    { key: 'research', type: 'microapp', microappId: 'company-research-360', input: {}, agentic: {
      enabled: true,
      strategy: 'closed_loop',
      rounds: 2,
      qualityThreshold: 85,
      maxAdditionalCostCents: 500,
      allowExternalReview: true,
    } },
    { key: 'research-again', type: 'microapp', microappId: 'company-research-360', input: {} },
  ])
  const dependencies = extractCapabilityDependencies(graph)
  assert.ok(dependencies.some(dep => dep.capability === 'web.search'))
  assert.ok(dependencies.some(dep => dep.capability === 'llm.generate'))
  assert.equal(dependencies.filter(dep => dep.capability === 'web.search').length, 1)
  assert.equal(dependencies.filter(dep => dep.capability === 'llm.generate').length, 1)
})

test('el runner usa idempotencia estable por run, nodo e iteración y consume la aprobación del map', () => {
  assert.equal(flowStepJobIdempotencyKey('run-1', 'generate'), 'flow:run-1:node:generate')
  assert.equal(flowStepJobIdempotencyKey('run-1', 'fanout', 0), 'flow:run-1:node:fanout:iteration:0')
  assert.notEqual(flowStepJobIdempotencyKey('run-1', 'fanout', 0), flowStepJobIdempotencyKey('run-1', 'fanout', 1))

  const source = readFileSync(resolve(process.cwd(), 'src/jobs/flowRunner.ts'), 'utf8')
  const wiredCallSites = source.match(/idempotencyKey: flowStepJobIdempotencyKey\(/g) ?? []
  assert.equal(wiredCallSites.length, 3, 'capability, microapp y map deben crear Jobs idempotentes')
  assert.match(source, /persistIterations\(state, node\.key, 'running', items, iterations, false, true\)/)
})

test('resolveValueRef resuelve literales, {var} con ruta y {from} con ruta', () => {
  const ctx = {
    variables: { event: { leadId: 'lead-1', valueCents: 5000 } },
    outputs: { gen: { assetIds: ['asset-a', 'asset-b'] } },
  }
  assert.equal(resolveValueRef('literal', ctx), 'literal')
  assert.equal(resolveValueRef(42, ctx), 42)
  assert.equal(resolveValueRef({ var: 'event.leadId' }, ctx), 'lead-1')
  assert.equal(resolveValueRef({ from: 'gen.assetIds.0' }, ctx), 'asset-a')
  assert.equal(resolveValueRef({ from: 'gen' }, ctx), ctx.outputs.gen)
  assert.equal(resolveValueRef({ var: 'no.existe' }, ctx), undefined)
})

test('buildNodeInput materializa un mapa de referencias', () => {
  const ctx = { variables: { prompt: 'hola' }, outputs: { previo: { text: 'salida' } } }
  assert.deepEqual(
    buildNodeInput({ a: { var: 'prompt' }, b: { from: 'previo.text' }, c: true }, ctx),
    { a: 'hola', b: 'salida', c: true },
  )
})

test('evaluateCondition compara con {var}/{from} y falla cerrado en tipos', () => {
  const ctx = {
    variables: { event: { valueCents: 5000, stage: 'won' } },
    outputs: { gen: { count: 2 } },
  }
  assert.equal(evaluateCondition({ left: { var: 'event.stage' }, op: 'eq', right: 'won' }, ctx), true)
  assert.equal(evaluateCondition({ left: { var: 'event.stage' }, op: 'neq', right: 'won' }, ctx), false)
  assert.equal(evaluateCondition({ left: { var: 'event.valueCents' }, op: 'gt', right: 1000 }, ctx), true)
  assert.equal(evaluateCondition({ left: { from: 'gen.count' }, op: 'lte', right: 2 }, ctx), true)
  // gt entre no-números es falso, no una coerción sorpresa.
  assert.equal(evaluateCondition({ left: { var: 'event.stage' }, op: 'gt', right: 1 }, ctx), false)
  assert.equal(evaluateCondition({ left: { var: 'event.missing' }, op: 'exists' }, ctx), false)
  assert.equal(evaluateCondition({ left: { var: 'event.missing' }, op: 'not_exists' }, ctx), true)
  assert.equal(evaluateCondition({ left: { var: 'event.stage' }, op: 'exists' }, ctx), true)
})

test('las 5 recetas de sistema parsean y validan contra flowGraph', () => {
  assert.equal(SYSTEM_RECIPES.length, 5)
  for (const recipe of SYSTEM_RECIPES) {
    const parsed = flowGraph.parse(recipe.graph)
    assert.deepEqual(validateFlowGraph(parsed), [], `receta ${recipe.slug} con problemas`)
    assert.ok(parsed.nodes.length >= 3, `receta ${recipe.slug} demasiado corta`)
  }
})

test('la receta por evento usa un topic real del outbox', () => {
  const recipe = SYSTEM_RECIPES.find(r => r.slug === 'oportunidad-ganada-a-caso-de-exito')
  assert.ok(recipe)
  const parsed = flowGraph.parse(recipe.graph)
  // pipeline.service.ts publica 'opportunity.won' al outbox desde la Fase 1.
  assert.deepEqual(parsed.trigger, { type: 'event', topic: 'opportunity.won' })
  const approvals = parsed.nodes.filter(node => node.type === 'approval')
  assert.equal(approvals.length, 2, 'el demo debe detenerse exactamente en dos decisiones humanas')
  for (const expected of ['content-multiplier', 'image.generate', 'image.upscale', 'publish_asset', 'landing.create_draft', 'ads.publish_paused', 'ads.activate', 'attribution_report']) {
    assert.ok(parsed.nodes.some(node => node.type === 'microapp' ? node.microappId === expected : node.type === 'capability' ? node.capability === expected : node.type === 'action' ? node.action === expected : false), `falta ${expected}`)
  }
  const unsupported = parsed.nodes.filter(node => node.type === 'action' && !(FLOW_ACTION_TYPES as readonly string[]).includes(node.action))
  assert.deepEqual(unsupported, [], 'dry-run no puede contener acciones que el runner real no soporte')
  assert.ok(parsed.nodes.findIndex(node => node.key === 'aprobar_activacion') < parsed.nodes.findIndex(node => node.key === 'publicar_ads_pausada'), 'la segunda aprobación debe preceder a cualquier llamada a Meta')
  const wait = parsed.nodes.find(node => node.type === 'wait')
  assert.ok(wait && wait.type === 'wait' && wait.seconds === 7 * 24 * 3600)
})

test('el map de la receta de storyboard referencia una plantilla capability existente', () => {
  const recipe = SYSTEM_RECIPES.find(r => r.slug === 'concepto-a-storyboard')
  assert.ok(recipe)
  const parsed = flowGraph.parse(recipe.graph)
  const mapNode = parsed.nodes.find(n => n.type === 'map')
  assert.ok(mapNode)
  if (mapNode.type !== 'map') throw new Error('el nodo encontrado no es un map')
  const template = parsed.nodes.find(n => n.key === mapNode.node)
  assert.ok(template)
  if (template.type !== 'capability') throw new Error('la plantilla del map no es una capability')
  assert.equal(template.capability, 'image.generate')
})
