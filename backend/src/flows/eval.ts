// Evaluador puro de referencias y condiciones del grafo de un Flow
// (docs/plataforma-abierta/05-FLUJOS.md §3).
//
// Sin dependencias de BD ni de proveedores a propósito: el runner lo usa en
// caliente y los tests lo ejecutan offline. Las expresiones son un
// mini-lenguaje seguro (comparar una referencia con otra), nunca JavaScript.
import type { FlowNode } from './graph'

export interface FlowEvalContext {
  // Variables del run (defaults del grafo + overrides del arranque + `event`).
  variables: Record<string, unknown>
  // Salidas de nodos ya terminados, por clave de nodo.
  outputs: Record<string, unknown>
}

type ConditionNode = Extract<FlowNode, { type: 'condition' }>

/** Acceso por ruta con puntos ('a.b.0.c') sin evaluar nada dinámico. */
export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      current = Number.isInteger(index) ? current[index] : undefined
      continue
    }
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Resuelve un valueRef del grafo: literal tal cual, { var } contra las
 * variables del run o { from: 'nodo.campo' } contra la salida de un nodo.
 */
export function resolveValueRef(ref: unknown, ctx: FlowEvalContext): unknown {
  if (ref !== null && typeof ref === 'object' && !Array.isArray(ref)) {
    const candidate = ref as Record<string, unknown>
    if (typeof candidate.var === 'string') return getPath(ctx.variables, candidate.var)
    if (typeof candidate.from === 'string') {
      const [nodeKey, ...rest] = candidate.from.split('.')
      const output = ctx.outputs[nodeKey]
      return rest.length ? getPath(output, rest.join('.')) : output
    }
  }
  return ref
}

/** Materializa el input de un nodo resolviendo cada referencia del mapa. */
export function buildNodeInput(
  input: Record<string, unknown>,
  ctx: FlowEvalContext,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, ref] of Object.entries(input)) {
    resolved[key] = resolveValueRef(ref, ctx)
  }
  return resolved
}

function asComparableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * Evalúa un nodo condition. Igualdad estricta para eq/neq (sin coerción de
 * tipos salvo números representados como texto en gt/gte/lt/lte, donde ambos
 * lados deben ser numéricos o la comparación es falsa — fallar cerrado).
 */
export function evaluateCondition(
  node: Pick<ConditionNode, 'left' | 'op' | 'right'>,
  ctx: FlowEvalContext,
): boolean {
  const left = resolveValueRef(node.left, ctx)
  if (node.op === 'exists') return left !== undefined && left !== null
  if (node.op === 'not_exists') return left === undefined || left === null

  const right = node.right === undefined ? undefined : resolveValueRef(node.right, ctx)
  switch (node.op) {
    case 'eq':
      return left === right
    case 'neq':
      return left !== right
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const l = asComparableNumber(left)
      const r = asComparableNumber(right)
      if (l === null || r === null) return false
      if (node.op === 'gt') return l > r
      if (node.op === 'gte') return l >= r
      if (node.op === 'lt') return l < r
      return l <= r
    }
  }
}
