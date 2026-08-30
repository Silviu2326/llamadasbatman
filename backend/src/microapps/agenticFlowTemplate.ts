import type { MicroappManifest } from './types'
import { flowGraph, type FlowGraph } from '../flows/graph'

export interface AgenticFlowTemplate {
  slug: string
  name: string
  description: string
  microappId: string
  microappVersion: string
  graph: FlowGraph
}

/**
 * Envuelve cualquier microapp en el mismo circuito gobernado:
 * ejecutar una sola vez → consejo de tres roles → síntesis → quality gate →
 * revisión humana si no alcanza el umbral → cierre trazable.
 *
 * Se genera desde uiSchema, por lo que las 147 tienen un workflow instalable
 * sin mantener 147 grafos copiados que diverjan del contrato real.
 */
export function agenticFlowTemplateFor(manifest: MicroappManifest): AgenticFlowTemplate {
  const input = Object.fromEntries(manifest.uiSchema.map(field => [field.key, { var: `input.${field.key}` }]))
  const graph = flowGraph.parse({
    variables: { input: {} },
    trigger: { type: 'manual' },
    nodes: [
      {
        key: 'execute_with_council',
        type: 'microapp',
        microappId: manifest.id,
        input,
        agentic: {
          enabled: true,
          strategy: 'closed_loop',
          rounds: 2,
          qualityThreshold: 85,
          maxAdditionalCostCents: 500,
          allowExternalReview: true,
        },
      },
      {
        key: 'quality_gate',
        type: 'condition',
        left: { from: 'execute_with_council.result.agentic.final.status' },
        op: 'eq',
        right: 'ready',
        ifTrue: 'completed',
        ifFalse: 'human_review',
      },
      {
        key: 'human_review',
        type: 'approval',
        action: 'agentic_accept',
        reason: 'El consejo no alcanzó el umbral: una persona debe revisar el resultado, los desacuerdos y los cambios requeridos.',
      },
      {
        key: 'completed',
        type: 'action',
        action: 'notify',
        input: { message: `Workflow agentic completado: ${manifest.name}` },
      },
    ],
    edges: [],
  })
  return {
    slug: `agentic-${manifest.id}`,
    name: `${manifest.name} · Consejo de agentes`,
    description: `Ejecuta ${manifest.name} v${manifest.version}, delibera con tres especialistas en circuito cerrado y exige revisión humana si no alcanza 85/100.`,
    microappId: manifest.id,
    microappVersion: manifest.version,
    graph,
  }
}

export function stableAgenticTemplateJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableAgenticTemplateJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableAgenticTemplateJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
