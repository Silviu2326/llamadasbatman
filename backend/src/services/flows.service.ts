// Servicio de Flows (docs/plataforma-abierta/05-FLUJOS.md).
//
// Publica versiones inmutables (patrón AutomationVersion), materializa las
// dependencias de capabilities al publicar (FlowCapabilityDependency, anotación
// de revisión de 05-FLUJOS §4) y arranca/resuelve runs. El avance de los runs
// vive en src/jobs/flowRunner.ts; aquí solo transiciones síncronas.
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import {
  approvalRule,
  assertCanApproveSensitiveAction,
  canApproveSensitiveAction,
  ApprovalPolicyError,
  hasPermission,
} from '../access-control'
import { hasCapability } from '../access-control/entitlements'
import { bindingsFor, getCapabilityContract, getProvider } from '../providers/registry'
import { getMicroapp } from '../microapps/registry'
import { cancelJob } from './jobs.service'
import { flowGraph, validateFlowGraph, extractCapabilityDependencies, type FlowGraph } from '../flows/graph'

export class FlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'FlowError'
  }
}

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (!input || typeof input !== 'object') return input
    return Object.fromEntries(Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]))
  }
  return JSON.stringify(normalize(value))
}

/** Parsea y valida un grafo; rechaza con la lista completa de problemas. */
export function parseFlowGraphStrict(graph: unknown): FlowGraph {
  const parsed = flowGraph.safeParse(graph)
  if (!parsed.success) {
    throw new FlowError('El grafo del flujo no cumple el contrato', 'FLOW_GRAPH_INVALID', 400, parsed.error.flatten())
  }
  const problems = validateFlowGraph(parsed.data)
  if (problems.length) {
    throw new FlowError('El grafo del flujo tiene referencias inválidas', 'FLOW_GRAPH_INVALID', 400, { problems })
  }
  const unavailable: string[] = []
  for (const node of parsed.data.nodes) {
    if (node.type === 'capability') {
      if (!getCapabilityContract(node.capability)) {
        unavailable.push(`${node.key}: capability desconocida ${node.capability}`)
        continue
      }
      const candidates = bindingsFor(node.capability).filter(({ binding }) => binding.routable !== false)
      if (node.providerId) {
        if (!candidates.some(({ provider }) => provider.id === node.providerId)) {
          unavailable.push(`${node.key}: ${node.providerId} no es enrutable para ${node.capability}`)
        }
      } else if (!candidates.length) {
        unavailable.push(`${node.key}: ${node.capability} no tiene proveedor enrutable`)
      }
    }
    if (node.type === 'microapp' && !getMicroapp(node.microappId)) {
      unavailable.push(`${node.key}: microapp desconocida ${node.microappId}`)
    }
    if (node.type === 'microapp' && node.agentic) {
      if (!getCapabilityContract('llm.generate')) {
        unavailable.push(`${node.key}: el consejo requiere llm.generate y su contrato no está registrado`)
      } else if (!bindingsFor('llm.generate').some(({ binding }) => binding.routable !== false)) {
        unavailable.push(`${node.key}: el consejo requiere un proveedor enrutable para llm.generate`)
      }
    }
  }
  if (unavailable.length) {
    throw new FlowError('El flujo tiene dependencias no resolubles en este despliegue', 'FLOW_DEPENDENCY_UNAVAILABLE', 422, { problems: unavailable })
  }
  return parsed.data
}

export interface PublishFlowParams {
  // null = receta de sistema (plantilla de plataforma, visible para todas las orgs).
  orgId: string | null
  slug: string
  name: string
  description?: string
  graph: unknown
  createdById?: string
}

function microappNodes(graph: FlowGraph) {
  return graph.nodes.filter((node): node is Extract<FlowGraph['nodes'][number], { type: 'microapp' }> => node.type === 'microapp')
}

async function assertMicroappEntitlement(orgId: string, graph: FlowGraph) {
  if (!microappNodes(graph).length) return
  const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } })
  if (!organization || !hasCapability(organization.plan, 'microapps')) {
    throw new FlowError(
      'El plan de la organización no incluye microapps, necesarias para este flujo',
      'FLOW_MICROAPPS_ENTITLEMENT_REQUIRED',
      403,
    )
  }
}

async function assertFlowActorAccess(orgId: string, createdById: string, graph: FlowGraph) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { userId: createdById, orgId, status: 'active' },
    select: { role: true },
  })
  if (!membership) throw new FlowError('El ejecutor no pertenece a la organización', 'FLOW_EXECUTOR_NOT_FOUND', 403)
  const missing = microappNodes(graph).flatMap(node => {
    const manifest = getMicroapp(node.microappId)
    return manifest?.dataAccess
      .filter(permission => !hasPermission(membership.role, permission))
      .map(permission => `${node.key}:${permission}`) ?? []
  })
  if (missing.length) {
    throw new FlowError(
      'El ejecutor no tiene los permisos de datos requeridos por las microapps del flujo',
      'FLOW_DATA_ACCESS_DENIED',
      403,
      { missing },
    )
  }
}

/**
 * Crea (si no existe) el Flow y publica una nueva FlowVersion inmutable.
 * Materializa FlowCapabilityDependency con extractCapabilityDependencies para
 * que el Centro de conexiones pregunte "¿qué se rompe si desconecto X?" sin
 * bucear en JSON en caliente.
 *
 * Nota: el índice único [orgId, slug] no deduplica orgId NULL en Postgres, así
 * que la identidad de las recetas de sistema se resuelve por findFirst.
 */
export async function publishFlowVersion(params: PublishFlowParams) {
  const slug = params.slug.trim()
  if (!slug) throw new FlowError('El slug es obligatorio', 'FLOW_SLUG_REQUIRED')
  const name = params.name.trim()
  if (!name) throw new FlowError('El nombre es obligatorio', 'FLOW_NAME_REQUIRED')
  const graph = parseFlowGraphStrict(params.graph)
  const dependencies = extractCapabilityDependencies(graph)

  // Una receta de sistema (orgId=null) forma parte del código de la plataforma.
  // Un flujo tenant, en cambio, siempre queda anclado a un principal real: su
  // identidad se reutiliza al despachar eventos y se vuelve a validar en cada
  // ejecución. Así una revocación de membresía falla cerrada.
  if (params.orgId !== null) {
    if (!params.createdById) {
      throw new FlowError('Los flujos de organización requieren un creador identificable', 'FLOW_CREATOR_REQUIRED', 403)
    }
    await assertMicroappEntitlement(params.orgId, graph)
    await assertFlowActorAccess(params.orgId, params.createdById, graph)
  }

  return prisma.$transaction(async tx => {
    let flow = await tx.flow.findFirst({ where: { orgId: params.orgId, slug } })
    if (!flow) {
      flow = await tx.flow.create({
        data: { orgId: params.orgId, slug, name, description: params.description ?? null },
      })
    } else if (flow.name !== name || (params.description !== undefined && flow.description !== params.description)) {
      flow = await tx.flow.update({
        where: { id: flow.id },
        data: { name, ...(params.description !== undefined ? { description: params.description } : {}) },
      })
    }

    const last = await tx.flowVersion.findFirst({ where: { flowId: flow.id }, orderBy: { version: 'desc' } })
    const version = await tx.flowVersion.create({
      data: {
        flowId: flow.id,
        version: (last?.version ?? 0) + 1,
        graph: inputJson(graph),
        createdById: params.createdById ?? null,
      },
    })
    if (dependencies.length) {
      await tx.flowCapabilityDependency.createMany({
        data: dependencies.map(dep => ({
          flowVersionId: version.id,
          capability: dep.capability,
          pinnedProvider: dep.pinnedProvider,
        })),
      })
    }
    const updated = await tx.flow.update({ where: { id: flow.id }, data: { currentVersionId: version.id } })
    return { flow: updated, version }
  })
}

/** Crear y publicar son la misma operación en v1 (recetas, no borradores). */
export async function createFlow(params: PublishFlowParams) {
  return publishFlowVersion(params)
}

async function currentVersionsFor(flows: Array<{ currentVersionId: string | null }>) {
  const ids = flows.map(f => f.currentVersionId).filter((id): id is string => Boolean(id))
  if (!ids.length) return new Map<string, Prisma.FlowVersionGetPayload<{ include: { dependencies: true } }>>()
  const versions = await prisma.flowVersion.findMany({ where: { id: { in: ids } }, include: { dependencies: true } })
  return new Map(versions.map(v => [v.id, v]))
}

/** Flujos propios de la organización + recetas de sistema (orgId null). */
export async function listFlows(orgId: string) {
  const flows = await prisma.flow.findMany({
    where: { OR: [{ orgId }, { orgId: null }] },
    orderBy: [{ orgId: 'asc' }, { createdAt: 'desc' }],
  })
  const versions = await currentVersionsFor(flows)
  return flows.map(flow => {
    const version = flow.currentVersionId ? versions.get(flow.currentVersionId) ?? null : null
    return {
      id: flow.id,
      slug: flow.slug,
      name: flow.name,
      description: flow.description,
      isSystem: flow.orgId === null,
      createdAt: flow.createdAt,
      currentVersion: version
        ? { id: version.id, version: version.version, graph: version.graph, createdAt: version.createdAt }
        : null,
      dependencies: version?.dependencies.map(d => ({ capability: d.capability, pinnedProvider: d.pinnedProvider })) ?? [],
    }
  })
}

export async function getFlow(orgId: string, flowId: string) {
  const flow = await prisma.flow.findFirst({ where: { id: flowId, OR: [{ orgId }, { orgId: null }] } })
  if (!flow) throw new FlowError('Flujo no encontrado', 'FLOW_NOT_FOUND', 404)
  const versions = await currentVersionsFor([flow])
  const version = flow.currentVersionId ? versions.get(flow.currentVersionId) ?? null : null
  return {
    id: flow.id,
    slug: flow.slug,
    name: flow.name,
    description: flow.description,
    isSystem: flow.orgId === null,
    createdAt: flow.createdAt,
    currentVersion: version
      ? { id: version.id, version: version.version, graph: version.graph, createdAt: version.createdAt }
      : null,
    dependencies: version?.dependencies.map(d => ({ capability: d.capability, pinnedProvider: d.pinnedProvider })) ?? [],
  }
}

export interface StartFlowRunParams {
  orgId: string
  flowId: string
  variables?: Record<string, unknown>
  budgetCents?: number
  dryRun?: boolean
  createdById?: string
  idempotencyKey?: string
  // manual | event(topic) | scheduled — el arranque manual es el default.
  trigger?: Record<string, unknown>
}

/**
 * Crea el FlowRun en 'running' con las variables del grafo como defaults y las
 * del arranque encima. El flowRunner lo reclama por lease y lo avanza.
 */
export async function startFlowRun(params: StartFlowRunParams) {
  const flow = await prisma.flow.findFirst({ where: { id: params.flowId, OR: [{ orgId: params.orgId }, { orgId: null }] } })
  if (!flow) throw new FlowError('Flujo no encontrado', 'FLOW_NOT_FOUND', 404)
  if (!flow.currentVersionId) throw new FlowError('El flujo no tiene versión publicada', 'FLOW_NOT_PUBLISHED', 409)
  const version = await prisma.flowVersion.findUnique({ where: { id: flow.currentVersionId } })
  if (!version) throw new FlowError('La versión publicada no existe', 'FLOW_VERSION_MISSING', 409)
  const graph = parseFlowGraphStrict(version.graph)

  await assertMicroappEntitlement(params.orgId, graph)
  // Para flujos propios, el creador de la versión es el principal estable de
  // los disparos event-driven. No se permite degradar a "sistema" por omitir
  // createdById. Las recetas oficiales sí pueden ejecutarse como sistema.
  const executorId = params.createdById ?? (flow.orgId !== null ? version.createdById ?? undefined : undefined)
  if (flow.orgId !== null && !executorId) {
    throw new FlowError('El flujo no conserva un ejecutor identificable', 'FLOW_EXECUTOR_REQUIRED', 403)
  }
  if (executorId) await assertFlowActorAccess(params.orgId, executorId, graph)

  if (params.budgetCents !== undefined && (!Number.isInteger(params.budgetCents) || params.budgetCents < 0)) {
    throw new FlowError('budgetCents debe ser un entero no negativo', 'FLOW_BUDGET_INVALID')
  }
  const idempotencyKey = params.idempotencyKey?.trim() || undefined
  if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 180)) {
    throw new FlowError('La clave de idempotencia debe tener entre 8 y 180 caracteres', 'FLOW_IDEMPOTENCY_KEY_INVALID')
  }

  const variables = { ...graph.variables, ...(params.variables ?? {}) }
  const trigger = {
    ...(params.trigger ?? { type: 'manual' }),
    ...(executorId ? { createdById: executorId } : {}),
  }

  try {
    return await prisma.flowRun.create({
      data: {
        orgId: params.orgId,
        flowId: flow.id,
        flowVersionId: version.id,
        idempotencyKey,
        status: 'running',
        trigger: inputJson(trigger),
        variables: inputJson(variables),
        budgetCents: params.budgetCents ?? null,
        dryRun: params.dryRun === true,
      },
    })
  } catch (error) {
    // El índice compuesto arbitra la carrera: solo el primer request crea;
    // los concurrentes recuperan exactamente el mismo snapshot/version.
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.flowRun.findUnique({
        where: {
          orgId_flowId_idempotencyKey: { orgId: params.orgId, flowId: flow.id, idempotencyKey },
        },
      })
      if (existing) {
        const sameRequest = existing.flowVersionId === version.id
          && existing.budgetCents === (params.budgetCents ?? null)
          && existing.dryRun === (params.dryRun === true)
          && canonicalJson(existing.variables) === canonicalJson(variables)
          && canonicalJson(existing.trigger) === canonicalJson(trigger)
        if (!sameRequest) {
          throw new FlowError(
            'La clave de idempotencia ya se utilizó con una ejecución diferente',
            'FLOW_IDEMPOTENCY_KEY_REUSED',
            409,
          )
        }
        return existing
      }
    }
    throw error
  }
}

export function flowEventIdempotencyKey(topic: string, eventId: string): string {
  const digest = createHash('sha256').update(`${topic}\0${eventId}`).digest('hex')
  return `event:${digest}`
}

export async function listFlowRuns(orgId: string, filters: { flowId?: string; limit?: number } = {}) {
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 25
  return prisma.flowRun.findMany({
    where: { orgId, ...(filters.flowId ? { flowId: filters.flowId } : {}) },
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: { flow: { select: { slug: true, name: true } } },
  })
}

/** Timeline de un run: pasos en el orden del grafo, no el de escritura. */
export async function getFlowRun(orgId: string, flowRunId: string) {
  const run = await prisma.flowRun.findFirst({
    where: { id: flowRunId, orgId },
    include: { steps: true, flow: { select: { slug: true, name: true } }, version: { select: { version: true, graph: true } } },
  })
  if (!run) throw new FlowError('Ejecución no encontrada', 'FLOW_RUN_NOT_FOUND', 404)
  const parsed = flowGraph.safeParse(run.version.graph)
  const order = new Map<string, number>()
  if (parsed.success) parsed.data.nodes.forEach((node, index) => order.set(node.key, index))
  const steps = [...run.steps].sort((a, b) => (order.get(a.nodeKey) ?? 999) - (order.get(b.nodeKey) ?? 999))
  return { ...run, steps }
}

export interface ResolveApprovalParams {
  orgId: string
  flowRunId: string
  nodeKey: string
  approvedById: string
  approve: boolean
  comment?: string
}

/**
 * Resuelve un paso 'awaiting_approval'. Dos orígenes posibles:
 *  - nodo approval del grafo → aprobar lo marca 'succeeded'; rechazar lo deja
 *    'blocked' y el run 'failed' (nunca se reintenta un rechazo en silencio);
 *  - retención por presupuesto sobre un nodo capability/microapp/map → aprobar
 *    lo devuelve a 'pending' con budgetApproved para que el runner lo ejecute
 *    saltando el tope (el paso aún no corrió, marcarlo succeeded lo perdería).
 *
 * Separación de funciones: si la acción del nodo está en approvalPolicy
 * (spend, campaign_publish, ...) se aplica la política real — quien aprueba
 * necesita el permiso de aprobación y no puede ser quien lanzó el run.
 */
export async function resolveApproval(params: ResolveApprovalParams) {
  const run = await prisma.flowRun.findFirst({ where: { id: params.flowRunId, orgId: params.orgId } })
  if (!run) throw new FlowError('Ejecución no encontrada', 'FLOW_RUN_NOT_FOUND', 404)
  if (run.status !== 'awaiting_approval' && run.status !== 'running') {
    throw new FlowError('La ejecución no está esperando aprobación', 'FLOW_RUN_NOT_AWAITING', 409)
  }
  const step = await prisma.flowStepRun.findUnique({
    where: { flowRunId_nodeKey: { flowRunId: run.id, nodeKey: params.nodeKey } },
  })
  if (!step || step.status !== 'awaiting_approval') {
    throw new FlowError('El paso no está esperando aprobación', 'FLOW_STEP_NOT_AWAITING', 409)
  }

  const version = await prisma.flowVersion.findUnique({ where: { id: run.flowVersionId } })
  const graph = version ? flowGraph.safeParse(version.graph) : null
  const node = graph?.success ? graph.data.nodes.find(n => n.key === params.nodeKey) : undefined
  const stepInput = asObject(step.input)
  const isBudgetHold = stepInput.reason === 'presupuesto'
  // Una retención de presupuesto siempre es la acción sensible 'spend'; un
  // nodo approval declara la suya en el grafo.
  const sensitiveAction = isBudgetHold ? 'spend' : node?.type === 'approval' ? node.action : null

  const trigger = asObject(run.trigger)
  const approvalRequest = step.approvalRequestId
    ? await prisma.sensitiveApprovalRequest.findFirst({ where: { id: step.approvalRequestId, orgId: params.orgId } })
    : null
  const requesterUserId = approvalRequest?.requesterUserId
    ?? (typeof trigger.createdById === 'string' ? trigger.createdById : null)

  const approver = await prisma.organizationMembership.findFirst({
    where: { userId: params.approvedById, orgId: params.orgId, status: 'active' },
    select: { userId: true, role: true },
  })
  if (!approver) throw new FlowError('El aprobador no pertenece a la organización', 'APPROVER_NOT_FOUND', 403)

  const rule = approvalRule(sensitiveAction)
  if (rule) {
    if (requesterUserId) {
      // Lanza ApprovalPolicyError (autoaprobación o rol sin permiso).
      assertCanApproveSensitiveAction({ userId: approver.userId, role: approver.role }, sensitiveAction, requesterUserId)
    } else if (!canApproveSensitiveAction(approver.role, sensitiveAction)) {
      // Run lanzado por evento (sin humano solicitante): no hay autoaprobación
      // posible, pero el permiso de aprobación sigue siendo obligatorio.
      throw new ApprovalPolicyError('El rol no puede aprobar esta operación', 'FORBIDDEN')
    }
  }

  if (approvalRequest && approvalRequest.status === 'pending') {
    await prisma.sensitiveApprovalRequest.updateMany({
      where: { id: approvalRequest.id, status: 'pending' },
      data: {
        status: params.approve ? 'approved' : 'rejected',
        decidedByUserId: approver.userId,
        decidedAt: new Date(),
        decisionComment: params.comment ?? null,
      },
    })
  }

  const now = new Date()
  if (params.approve) {
    const data = isBudgetHold
      ? {
          // Vuelve a la cola del runner con el tope levantado para este paso.
          status: 'pending',
          input: inputJson({ ...stepInput, budgetApproved: true, approvedById: approver.userId }),
          finishedAt: null,
        }
      : {
          status: 'succeeded',
          output: inputJson({ approved: true, approvedById: approver.userId, comment: params.comment ?? null }),
          finishedAt: now,
        }
    const changed = await prisma.flowStepRun.updateMany({
      where: { id: step.id, status: 'awaiting_approval' },
      data,
    })
    if (changed.count !== 1) throw new FlowError('El paso fue decidido por otro usuario', 'CONCURRENT_DECISION', 409)
    await prisma.flowRun.updateMany({
      where: { id: run.id, status: 'awaiting_approval' },
      data: { status: 'running', leaseExpiresAt: null, workerId: null },
    })
  } else {
    const changed = await prisma.flowStepRun.updateMany({
      where: { id: step.id, status: 'awaiting_approval' },
      data: {
        status: 'blocked',
        error: inputJson({ code: 'APPROVAL_REJECTED', message: params.comment ?? 'Rechazado en aprobación humana' }),
        finishedAt: now,
      },
    })
    if (changed.count !== 1) throw new FlowError('El paso fue decidido por otro usuario', 'CONCURRENT_DECISION', 409)
    await prisma.flowRun.updateMany({
      where: { id: run.id, status: { in: ['awaiting_approval', 'running'] } },
      data: {
        status: 'failed',
        error: inputJson({ code: 'APPROVAL_REJECTED', nodeKey: params.nodeKey }),
        finishedAt: now,
        leaseExpiresAt: null,
        workerId: null,
      },
    })
  }

  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: approver.userId,
    action: params.approve ? 'flow.step.approve' : 'flow.step.reject',
    entityType: 'FlowRun',
    entityId: run.id,
    after: { nodeKey: params.nodeKey, approve: params.approve, sensitiveAction },
  })

  return getFlowRun(params.orgId, run.id)
}

/**
 * Cancelación best effort: el run deja de avanzar; los jobs de pasos en curso
 * se intentan cancelar con la misma semántica de cancelJob (lo ya enviado a un
 * proveedor externo no se aborta remotamente).
 */
export async function cancelFlowRun(orgId: string, flowRunId: string) {
  const canceled = await prisma.flowRun.updateMany({
    where: { id: flowRunId, orgId, status: { in: ['running', 'awaiting_approval'] } },
    data: { status: 'canceled', finishedAt: new Date(), leaseExpiresAt: null, workerId: null },
  })
  if (canceled.count !== 1) throw new FlowError('La ejecución no se puede cancelar', 'FLOW_RUN_NOT_CANCELABLE', 409)
  const steps = await prisma.flowStepRun.findMany({ where: { flowRunId, orgId, status: 'running', jobId: { not: null } } })
  for (const step of steps) {
    if (step.jobId) await cancelJob(orgId, step.jobId).catch(() => null)
  }
  return prisma.flowRun.findUnique({ where: { id: flowRunId } })
}

/**
 * Centro de conexiones: qué flujos dejarían de funcionar si se desconecta un
 * proveedor. Cuenta tanto los nodos que lo fijan explícitamente
 * (pinnedProvider) como las capabilities que ese proveedor sirve cuando el
 * nodo delega en el router. Solo mira versiones publicadas (currentVersionId).
 */
export async function flowsUsingProvider(providerId: string, orgId: string) {
  const provider = getProvider(providerId)
  const providerCapabilities = new Set(provider?.capabilities.map(b => b.capability) ?? [])

  const flows = await prisma.flow.findMany({
    where: { OR: [{ orgId }, { orgId: null }], currentVersionId: { not: null } },
  })
  const versionIds = flows.map(f => f.currentVersionId).filter((id): id is string => Boolean(id))
  if (!versionIds.length) return []
  const deps = await prisma.flowCapabilityDependency.findMany({ where: { flowVersionId: { in: versionIds } } })

  const byVersion = new Map<string, Array<{ capability: string; pinned: boolean }>>()
  for (const dep of deps) {
    const pinned = dep.pinnedProvider === providerId
    const routed = dep.pinnedProvider === null && providerCapabilities.has(dep.capability)
    if (!pinned && !routed) continue
    const list = byVersion.get(dep.flowVersionId) ?? []
    list.push({ capability: dep.capability, pinned })
    byVersion.set(dep.flowVersionId, list)
  }

  return flows
    .filter(flow => flow.currentVersionId && byVersion.has(flow.currentVersionId))
    .map(flow => ({
      flowId: flow.id,
      slug: flow.slug,
      name: flow.name,
      isSystem: flow.orgId === null,
      capabilities: byVersion.get(flow.currentVersionId as string) ?? [],
    }))
}

/**
 * Despacho por evento del outbox (05-FLUJOS §4): arranca los Flows activos
 * cuyo trigger declara este topic y despierta los pasos 'wait' suscritos.
 * Nunca lanza — un flujo mal configurado no puede provocar el reintento (y la
 * duplicación) del resto del procesamiento del evento, igual que
 * deliverWebhooks.
 */
export async function dispatchFlowTriggers(
  orgId: string,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const flows = await prisma.flow.findMany({
      where: { OR: [{ orgId }, { orgId: null }], currentVersionId: { not: null } },
    })
    const versionIds = flows.map(f => f.currentVersionId).filter((id): id is string => Boolean(id))
    const versions = versionIds.length
      ? await prisma.flowVersion.findMany({ where: { id: { in: versionIds } } })
      : []
    const versionById = new Map(versions.map(v => [v.id, v]))
    const eventId = typeof payload.eventId === 'string' ? payload.eventId : null

    for (const flow of flows) {
      const version = flow.currentVersionId ? versionById.get(flow.currentVersionId) : undefined
      if (!version) continue
      const parsed = flowGraph.safeParse(version.graph)
      if (!parsed.success) continue
      const trigger = parsed.data.trigger
      if (trigger.type !== 'event' || trigger.topic !== topic) continue

      await startFlowRun({
        orgId,
        flowId: flow.id,
        variables: { event: payload },
        // Las versiones tenant se publican con un principal estable. Se vuelve
        // a validar aquí para que bajas/cambios de rol detengan futuros eventos.
        createdById: flow.orgId !== null ? version.createdById ?? undefined : undefined,
        trigger: { type: 'event', topic, ...(eventId ? { eventId } : {}) },
        idempotencyKey: eventId ? flowEventIdempotencyKey(topic, eventId) : undefined,
      }).catch(error => {
        console.warn(`[Flows] no se pudo arrancar el flujo ${flow.slug} por ${topic}:`, (error as Error).message)
      })
    }

    // Despierta los pasos wait(eventTopic) de runs vivos de esta organización.
    const waiting = await prisma.flowStepRun.findMany({
      where: {
        orgId,
        status: 'running',
        jobId: null,
        input: { path: ['eventTopic'], equals: topic },
        flowRun: { status: 'running' },
      },
      select: { id: true },
    })
    for (const step of waiting) {
      await prisma.flowStepRun.updateMany({
        where: { id: step.id, status: 'running' },
        data: { status: 'succeeded', output: inputJson({ event: payload, topic }), finishedAt: new Date() },
      })
    }
  } catch (error) {
    console.warn(`[Flows] despacho de triggers falló (${topic}):`, (error as Error).message)
  }
}
