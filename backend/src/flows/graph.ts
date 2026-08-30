// Contrato del grafo de un Flow (docs/plataforma-abierta/05-FLUJOS.md §3).
//
// JSON declarativo y validado: el runner nunca interpreta nada que no pase
// por aquí. Las expresiones de condición son deliberadamente pobres (comparar
// una variable con un literal): un mini-lenguaje evaluado con seguridad, no
// JavaScript arbitrario.
import { z } from 'zod'
import { agenticExecutionConfigSchema } from '../microapps/agentic'
import { getMicroapp } from '../microapps/registry'

// Referencia a un valor en tiempo de ejecución: literal, variable del run o
// salida de un nodo anterior ({ from: 'nodo.campo' }).
const valueRef = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  // Listas literales de escalares (p.ej. channels de una receta). Las listas
  // dinámicas llegan por {var}/{from}.
  z.array(z.union([z.string(), z.number(), z.boolean()])),
  z.object({ var: z.string() }),
  z.object({ from: z.string() }),
])

const inputMap = z.record(valueRef)

const capabilityNode = z.object({
  key: z.string().min(1),
  type: z.literal('capability'),
  capability: z.string(),
  input: inputMap,
  tier: z.enum(['draft', 'standard', 'premium']).optional(),
  providerId: z.string().optional(),
  maxCostCents: z.number().int().positive().optional(),
})

const microappNode = z.object({
  key: z.string().min(1),
  type: z.literal('microapp'),
  microappId: z.string(),
  input: inputMap,
  // Opt-in por nodo: la microapp se ejecuta una vez y su resultado pasa por
  // consejo, síntesis y circuito de revisión sin repetir efectos del negocio.
  agentic: agenticExecutionConfigSchema.optional(),
})

// Acción interna del catálogo declarativo (update_lead, create_task...).
const actionNode = z.object({
  key: z.string().min(1),
  type: z.literal('action'),
  action: z.string(),
  input: inputMap,
})

// Pausa hasta aprobación humana. La separación de funciones la aporta el
// sistema de aprobaciones existente; aquí solo se declara qué se aprueba.
const approvalNode = z.object({
  key: z.string().min(1),
  type: z.literal('approval'),
  action: z.string(),
  reason: z.string().max(500).optional(),
})

const conditionNode = z.object({
  key: z.string().min(1),
  type: z.literal('condition'),
  left: valueRef,
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists']),
  right: valueRef.optional(),
  ifTrue: z.string(),
  ifFalse: z.string().optional(),
})

const mapNode = z.object({
  key: z.string().min(1),
  type: z.literal('map'),
  items: valueRef,
  node: z.string(),
  concurrency: z.number().int().min(1).max(5).default(1),
})

const waitNode = z.object({
  key: z.string().min(1),
  type: z.literal('wait'),
  // Espera temporal (segundos) o de evento del outbox.
  seconds: z.number().int().positive().max(90 * 24 * 3600).optional(),
  eventTopic: z.string().optional(),
})

export const flowNode = z.discriminatedUnion('type', [
  capabilityNode,
  microappNode,
  actionNode,
  approvalNode,
  conditionNode,
  mapNode,
  waitNode,
])

export const flowGraph = z.object({
  // Variables declaradas con defaults; el arranque del run puede
  // sobrescribirlas.
  variables: z.record(z.unknown()).default({}),
  nodes: z.array(flowNode).min(1).max(100),
  // Aristas lineales por defecto: cada nodo pasa al siguiente salvo que una
  // condición salte. edges explícitas para grafos no lineales.
  edges: z.array(z.object({ from: z.string(), to: z.string() })).max(200).default([]),
  trigger: z.discriminatedUnion('type', [
    z.object({ type: z.literal('manual') }),
    z.object({ type: z.literal('event'), topic: z.string() }),
    z.object({ type: z.literal('scheduled'), cron: z.string() }),
  ]),
})

export type FlowGraph = z.infer<typeof flowGraph>
export type FlowNode = z.infer<typeof flowNode>

// Dependencias materializadas al publicar (FlowCapabilityDependency): qué
// capabilities usa el grafo y qué proveedores fija. Sin bucear en el JSON en
// caliente.
export function extractCapabilityDependencies(graph: FlowGraph): Array<{ capability: string; pinnedProvider: string | null }> {
  const out: Array<{ capability: string; pinnedProvider: string | null }> = []
  for (const node of graph.nodes) {
    if (node.type === 'capability') {
      out.push({ capability: node.capability, pinnedProvider: node.providerId ?? null })
    }
    if (node.type === 'microapp' && node.agentic) {
      out.push({ capability: 'llm.generate', pinnedProvider: null })
    }
    if (node.type === 'microapp') {
      const manifest = getMicroapp(node.microappId)
      for (const capability of manifest?.capabilities ?? []) {
        out.push({ capability, pinnedProvider: null })
      }
    }
  }
  // Varios nodos pueden compartir dependencia; la tabla materializada debe
  // describir impacto, no inflar contadores por ocurrencia.
  return [...new Map(out.map(dep => [`${dep.capability}\u0000${dep.pinnedProvider ?? ''}`, dep])).values()]
}

// Validación estructural adicional a zod: claves únicas y referencias de
// aristas/condiciones/map a nodos existentes.
export function validateFlowGraph(graph: FlowGraph): string[] {
  const problems: string[] = []
  const keys = new Set<string>()
  for (const node of graph.nodes) {
    if (keys.has(node.key)) problems.push(`Clave de nodo duplicada: ${node.key}`)
    keys.add(node.key)
  }
  const mustExist = (key: string, where: string) => {
    if (!keys.has(key)) problems.push(`${where} referencia un nodo inexistente: ${key}`)
  }
  for (const node of graph.nodes) {
    if (node.type === 'condition') {
      mustExist(node.ifTrue, `condition ${node.key}`)
      if (node.ifFalse) mustExist(node.ifFalse, `condition ${node.key}`)
    }
    if (node.type === 'map') {
      mustExist(node.node, `map ${node.key}`)
      const template = graph.nodes.find(candidate => candidate.key === node.node)
      if (template && template.type !== 'capability' && template.type !== 'action') {
        problems.push(`map ${node.key} solo admite plantilla capability o action`)
      }
    }
    if (node.type === 'wait') {
      const modes = Number(node.seconds !== undefined) + Number(node.eventTopic !== undefined)
      if (modes !== 1) problems.push(`wait ${node.key} debe declarar exactamente seconds o eventTopic`)
    }
  }
  const order = new Map(graph.nodes.map((node, index) => [node.key, index]))
  const edgeFrom = new Set<string>()
  for (const edge of graph.edges) {
    mustExist(edge.from, 'edge')
    mustExist(edge.to, 'edge')
    if (edgeFrom.has(edge.from)) problems.push(`Solo se admite una edge saliente por nodo: ${edge.from}`)
    edgeFrom.add(edge.from)
    const from = order.get(edge.from)
    const to = order.get(edge.to)
    if (from !== undefined && to !== undefined && to <= from) {
      problems.push(`edge ${edge.from} → ${edge.to} crea un salto hacia atrás/ciclo`)
    }
  }
  for (const node of graph.nodes) {
    if (node.type !== 'condition') continue
    const from = order.get(node.key) ?? -1
    for (const target of [node.ifTrue, node.ifFalse].filter((item): item is string => Boolean(item))) {
      const to = order.get(target)
      if (to !== undefined && to <= from) problems.push(`condition ${node.key} → ${target} crea un salto hacia atrás/ciclo`)
    }
  }
  return problems
}
