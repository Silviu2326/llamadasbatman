import { agenticProfileFor } from './agentic'
import { agenticFlowTemplateFor } from './agenticFlowTemplate'
import type { MicroappManifest } from './types'

export interface MicroappPowerAudit {
  microappId: string
  score: number
  passed: number
  total: number
  issues: string[]
}

function unwrapSchema(schema: any): any {
  let current = schema
  const wrappers = new Set(['ZodEffects', 'ZodDefault', 'ZodOptional', 'ZodNullable', 'ZodBranded', 'ZodReadonly'])
  while (current?._def && wrappers.has(current._def.typeName)) {
    current = current._def.schema ?? current._def.innerType ?? current._def.type
  }
  return current
}

function objectKeys(schema: unknown): string[] {
  const unwrapped = unwrapSchema(schema)
  const shape = typeof unwrapped?.shape === 'function' ? unwrapped.shape() : unwrapped?.shape
  return shape && typeof shape === 'object' ? Object.keys(shape) : []
}

/**
 * Puerta explicable de potencia de producto. No intenta sustituir los tests
 * semánticos propios de cada receta: comprueba que toda microapp posee las
 * diez piezas comunes necesarias para funcionar como habilidad de humano,
 * Flow o agente, y devuelve exactamente qué pieza falta.
 */
export function auditMicroappPower(manifest: MicroappManifest): MicroappPowerAudit {
  const gates: Array<[boolean, string]> = []
  const inputKeys = objectKeys(manifest.inputSchema).sort()
  const outputKeys = objectKeys(manifest.outputSchema).sort()
  const uiKeys = manifest.uiSchema.map(field => field.key).sort()
  const profile = agenticProfileFor(manifest)
  const template = agenticFlowTemplateFor(manifest)
  const [major = 0, minor = 0] = manifest.version.split('.').map(Number)

  gates.push([/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id) && /^\d+\.\d+\.\d+$/.test(manifest.version) && (major > 1 || (major === 1 && minor >= 1)), 'identidad o versión sin endurecer'])
  gates.push([manifest.name.trim().length >= 5 && manifest.promise.trim().length >= 50, 'promesa de producto insuficiente'])
  gates.push([inputKeys.length >= 1 && outputKeys.length >= 3, 'contrato estructurado demasiado pobre'])
  gates.push([JSON.stringify(inputKeys) === JSON.stringify(uiKeys) && new Set(uiKeys).size === uiKeys.length, 'formulario divergente del inputSchema'])
  gates.push([manifest.uiSchema.every(field => field.label.trim().length >= 3 && Boolean(field.help?.trim() || field.placeholder?.trim() || field.options?.length)), 'campos sin guía operativa'])
  gates.push([Number.isInteger(manifest.freshnessDays) && (manifest.freshnessDays ?? 0) >= 1 && (manifest.freshnessDays ?? 0) <= 365 && manifest.followUps.length >= 1, 'sin vigencia o siguiente paso'])
  gates.push([new Set(manifest.capabilities).size === manifest.capabilities.length && new Set(manifest.dataAccess).size === manifest.dataAccess.length, 'capabilities o permisos duplicados'])
  gates.push([manifest.effects === 'local' || Boolean(manifest.approvalAction?.trim()), 'efecto externo sin aprobación humana'])
  gates.push([typeof manifest.run === 'function' && typeof manifest.estimateCost === 'function', 'ejecución o estimación ausente'])
  gates.push([
    profile.roles.length === 3
      && new Set(profile.roles.map(role => role.id)).size === 3
      && profile.requiresExplicitExternalReviewConsent
      && template.microappId === manifest.id
      && template.graph.nodes.some(node => node.type === 'microapp')
      && template.graph.nodes.some(node => node.type === 'approval'),
    'consejo o workflow agentic incompleto',
  ])

  const issues = gates.filter(([passes]) => !passes).map(([, issue]) => issue)
  const passed = gates.length - issues.length
  return { microappId: manifest.id, score: Math.round((passed / gates.length) * 100), passed, total: gates.length, issues }
}

