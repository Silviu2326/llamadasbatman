// Ejecución de microapps sobre el contrato universal de Job.
//
// Cada ejecución es un Job(kind 'microapp.run'): hereda cola, lease, coste,
// cancelación y Centro de trabajos. Este módulo registra el ejecutor y expone
// el arranque de una ejecución; el gating (RBAC, entitlements, aprobación) es
// del endpoint, no de aquí.
import { prisma } from '../lib/prisma'
import { createHash } from 'node:crypto'
import { ROLE_KEYS, hasPermission } from '../access-control'
import { route } from '../providers/router'
import { bindingsFor, getCapabilityContract, getProvider } from '../providers/registry'
import { resolveProviderCredential } from '../providers/credentials'
import { runCapability } from '../providers/runCapability'
import { createJob, registerJobExecutor } from '../services/jobs.service'
import { getMicroapp } from './registry'
import type { MicroappContext, MicroappCtx, MicroappResult } from './types'
import { validateMicroappEstimate, validateMicroappResultEnvelope } from './quality'
import {
  agenticExecutionConfigSchema,
  estimateAgenticCouncilCost,
  runAgenticCouncil,
  type AgenticExecutionConfig,
} from './agentic'

interface MicroappJobInput {
  microappId: string
  payload: unknown
  links?: { leadId?: string; accountId?: string; productionId?: string; callId?: string; opportunityId?: string; conversationId?: string; meetingId?: string }
  agentic?: AgenticExecutionConfig
}

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize)
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]))
    }
    return item
  }
  return JSON.stringify(normalize(value))
}

/** La misma clave idempotente solo puede representar la misma operación. */
export function microappJobInputMatches(existing: unknown, requested: unknown): boolean {
  return canonicalJson(existing) === canonicalJson(requested)
}

export interface PreparedMicroappEstimate {
  cents: number
  requestHash: string
}

/**
 * Congela la frontera RBAC del manifiesto ejecutado. Guardamos tanto los
 * permisos declarados como los roles que podían satisfacerlos en ese
 * instante: una relajación posterior del manifiesto o de su catálogo no debe
 * volver legible un resultado histórico sensible.
 */
export function microappAccessSnapshots(manifest: NonNullable<ReturnType<typeof getMicroapp>>) {
  const dataAccessSnapshot = [...manifest.dataAccess]
  const accessRolesSnapshot = ROLE_KEYS.filter(role => dataAccessSnapshot.every(permission => hasPermission(role, permission)))
  return { dataAccessSnapshot, accessRolesSnapshot }
}

function estimateRequestHash(microappId: string, input: unknown, agentic?: AgenticExecutionConfig): string {
  return createHash('sha256').update(canonicalJson({ microappId, input, agentic: agentic ?? null })).digest('hex')
}

export async function prepareMicroappEstimate(params: {
  orgId: string
  manifest: NonNullable<ReturnType<typeof getMicroapp>>
  input: unknown
  agentic?: AgenticExecutionConfig
}): Promise<PreparedMicroappEstimate> {
  const base = validateMicroappEstimate(params.manifest.id, await params.manifest.estimateCost(params.input))
  const council = params.agentic
    ? await estimateAgenticCouncilCost({ orgId: params.orgId, manifest: params.manifest, input: params.input, config: params.agentic })
    : 0
  const total = validateMicroappEstimate(params.manifest.id, { cents: base.cents + council })
  return { cents: total.cents, requestHash: estimateRequestHash(params.manifest.id, params.input, params.agentic) }
}

export async function resolveMicroappEstimate(params: {
  orgId: string
  manifest: NonNullable<ReturnType<typeof getMicroapp>>
  input: unknown
  agentic?: AgenticExecutionConfig
  prepared?: PreparedMicroappEstimate
}): Promise<PreparedMicroappEstimate> {
  if (!params.prepared) return prepareMicroappEstimate(params)
  validateMicroappEstimate(params.manifest.id, params.prepared)
  if (params.prepared.requestHash !== estimateRequestHash(params.manifest.id, params.input, params.agentic)) {
    throw Object.assign(new Error('La estimación preparada no corresponde a esta entrada o configuración'), {
      code: 'MICROAPP_PREPARED_ESTIMATE_MISMATCH',
      statusCode: 400,
    })
  }
  return params.prepared
}

export async function startMicroappRun(params: {
  orgId: string
  microappId: string
  input: unknown
  createdById?: string
  links?: { leadId?: string; accountId?: string; productionId?: string; callId?: string; opportunityId?: string; conversationId?: string; meetingId?: string }
  agentic?: AgenticExecutionConfig
  idempotencyKey?: string
  preparedEstimate?: PreparedMicroappEstimate
}): Promise<{ jobId: string }> {
  const manifest = getMicroapp(params.microappId)
  if (!manifest) throw Object.assign(new Error(`Microapp desconocida: ${params.microappId}`), { statusCode: 404, code: 'MICROAPP_UNKNOWN' })

  const configuredInput = await resolveConfiguredInput(params.orgId, manifest, params.input, params.createdById)
  const contextualInput = await enrichContextualInput(params.orgId, manifest, configuredInput, params.links)
  const parsed = manifest.inputSchema.safeParse(contextualInput)
  if (!parsed.success) {
    throw Object.assign(new Error('Entrada inválida para la microapp'), {
      statusCode: 400,
      code: 'MICROAPP_INPUT_INVALID',
      details: parsed.error.flatten(),
    })
  }

  const agentic = params.agentic ? agenticExecutionConfigSchema.parse(params.agentic) : undefined
  const estimate = await resolveMicroappEstimate({
    orgId: params.orgId,
    manifest,
    input: parsed.data,
    agentic,
    prepared: params.preparedEstimate,
  })
  const jobInput = {
    microappId: params.microappId,
    payload: parsed.data,
    links: params.links ?? {},
    ...(agentic ? { agentic } : {}),
  } satisfies MicroappJobInput
  const job = await createJob({
    orgId: params.orgId,
    kind: 'microapp.run',
    createdById: params.createdById,
    microappId: params.microappId,
    costEstimateCents: estimate.cents,
    input: jobInput as never,
    idempotencyKey: params.idempotencyKey ? `microapp:${params.microappId}:${params.idempotencyKey}` : undefined,
  })
  if (params.idempotencyKey && (
    !microappJobInputMatches(job.input, jobInput)
    || (job.createdById ?? undefined) !== params.createdById
  )) {
    throw Object.assign(new Error('La clave idempotente ya se usó con otra entrada o configuración'), {
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    })
  }
  return { jobId: job.id }
}

export async function resolveConfiguredInput(
  orgId: string,
  manifest: NonNullable<ReturnType<typeof getMicroapp>>,
  input: unknown,
  userId?: string,
): Promise<unknown> {
  const rows = await prisma.microappConfig.findMany({ where: { orgId, microappId: manifest.id } })
  const merged: Record<string, unknown> = {}
  const rank: Record<string, number> = { organization: 1, team: 2, user: 3 }
  for (const row of rows.sort((a, b) => (rank[a.scope] ?? 0) - (rank[b.scope] ?? 0))) {
    if (row.scope === 'user' && row.scopeId !== userId) continue
    if (row.scope === 'team') continue
    if (row.values && typeof row.values === 'object' && !Array.isArray(row.values)) Object.assign(merged, row.values)
  }
  if (input && typeof input === 'object' && !Array.isArray(input)) Object.assign(merged, input)
  return merged
}

/**
 * Los lanzadores contextuales pasan ids, no copias de datos CRM. Para las
 * recetas que históricamente pedían el nombre en texto, completamos ese
 * campo desde el registro ya validado dentro del tenant.
 */
async function enrichContextualInput(
  orgId: string,
  manifest: NonNullable<ReturnType<typeof getMicroapp>>,
  input: unknown,
  links?: MicroappJobInput['links'],
): Promise<unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const result = { ...(input as Record<string, unknown>) }
  const context = await resolveMicroappContext(orgId, links)
  const entity = context.account ?? context.lead
  const entityRecord = entity && typeof entity === 'object' ? entity as Record<string, unknown> : null
  const entityName = entityRecord
    ? [entityRecord.name, entityRecord.company, entityRecord.companyName].find(value => typeof value === 'string' && value.trim().length >= 3) as string | undefined
    : undefined
  const entityWebsite = entityRecord
    ? [entityRecord.website, entityRecord.domain].find(value => typeof value === 'string' && value.trim()) as string | undefined
    : undefined

  if (manifest.id === 'company-research-360' && !result.companyName && entityName) {
    result.companyName = entityName
    if (!result.website && entityWebsite && /^https?:\/\//i.test(entityWebsite)) result.website = entityWebsite
  }
  if (manifest.id === 'buying-signal-radar' && !result.company && entityName) {
    result.company = entityName
    if (!result.website && entityWebsite && /^https?:\/\//i.test(entityWebsite)) result.website = entityWebsite
  }
  if (manifest.id === 'explainable-prospect-scoring' && !result.prospectData && entityRecord) {
    result.prospectData = JSON.stringify(entityRecord)
  }
  return result
}

async function resolveMicroappContext(orgId: string, links: MicroappJobInput['links']): Promise<MicroappContext> {
  const [lead, account, call, opportunity, conversation, meeting] = await Promise.all([
    links?.leadId ? prisma.lead.findFirst({ where: { id: links.leadId, orgId }, include: { account: true } }) : null,
    links?.accountId ? prisma.account.findFirst({ where: { id: links.accountId, orgId } }) : null,
    links?.callId ? prisma.call.findFirst({ where: { id: links.callId, orgId }, include: { lead: { include: { account: true } } } }) : null,
    links?.opportunityId ? prisma.opportunity.findFirst({ where: { id: links.opportunityId, orgId }, include: { lead: { include: { account: true } } } }) : null,
    links?.conversationId ? prisma.conversation.findFirst({ where: { id: links.conversationId, orgId } }) : null,
    links?.meetingId ? prisma.meeting.findFirst({ where: { id: links.meetingId, orgId } }) : null,
  ])
  return {
    lead: lead ? lead as unknown as Record<string, unknown> : opportunity?.lead ? opportunity.lead as unknown as Record<string, unknown> : undefined,
    account: account ? account as unknown as Record<string, unknown> : undefined,
    call: call ? call as unknown as Record<string, unknown> : undefined,
    opportunity: opportunity ? opportunity as unknown as Record<string, unknown> : undefined,
    conversation: conversation ? conversation as unknown as Record<string, unknown> : undefined,
    meeting: meeting ? meeting as unknown as Record<string, unknown> : undefined,
    limitations: [],
  }
}

// ctx.capability ejecuta en proceso: route + execute bajo el job de la
// microapp. Un resultado 'pending' (proveedor asíncrono) no es invocable
// desde una microapp en v1 — eso se orquesta como paso de Flow.
function buildCtx(
  orgId: string,
  jobId: string,
  routingDecisions: unknown[],
  createdById?: string,
  context?: MicroappContext,
): MicroappCtx {
  return {
    orgId,
    jobId,
    createdById,
    context,
    async capability(name, input, preferences) {
      const { decision, binding } = await route({ orgId, capability: name, input, preferences })
      routingDecisions.push(decision)
      const credential = await resolveProviderCredential(orgId, decision.providerId)
      const provider = getProvider(decision.providerId)
      if (!provider) throw new Error(`Proveedor desaparecido del registro: ${decision.providerId}`)
      const contract = getCapabilityContract(name)
      if (!contract) throw new Error(`Capability sin contrato: ${name}`)
      const normalizedInput = contract.input.parse(input)
      const result = await binding.execute(
        { orgId, jobId, billingMode: decision.billingMode, secret: credential?.secret ?? null },
        normalizedInput,
      )
      if ('pending' in result && result.pending) {
        throw Object.assign(
          new Error(`La capability ${name} es asíncrona en el proveedor y no puede usarse dentro de una microapp; usa un Flow.`),
          { code: 'CAPABILITY_ASYNC_IN_MICROAPP' },
        )
      }
      const output = (result as { output: unknown }).output
      return contract.output.parse(output)
    },
    async planCapability(name, input, preferences) {
      const { decision, binding } = await route({ orgId, capability: name, input, preferences })
      return {
        chosen: { providerId: decision.providerId, estimateCents: decision.estimateCents, models: binding.models ?? [] },
        alternatives: decision.alternatives.map(item => {
          const alternative = bindingsFor(name).find(candidate => candidate.provider.id === item.providerId)
          return { providerId: item.providerId, estimateCents: item.estimateCents, models: alternative?.binding.models ?? [] }
        }),
      }
    },
    async enqueueCapability(name, input, preferences) {
      return runCapability({
        orgId,
        capability: name,
        input,
        preferences,
        createdById,
        parentJobId: jobId,
      })
    },
    log(message, meta) {
      console.log(`[microapp] ${message}`, meta ?? '')
    },
  }
}

let registered = false

export function registerMicroappExecutor(): void {
  if (registered) return
  registered = true
  registerJobExecutor('microapp.run', async (job) => {
    const input = job.input as unknown as MicroappJobInput
    const manifest = getMicroapp(input.microappId)
    if (!manifest) {
      // Deploy desincronizado: el kind existe pero la receta no está en este
      // proceso. Error no reintenable con mensaje accionable.
      throw Object.assign(new Error(`Microapp no registrada en este proceso: ${input.microappId}`), { code: 'MICROAPP_UNKNOWN' })
    }
    const routingDecisions: unknown[] = []
    const ctx = buildCtx(job.orgId, job.id, routingDecisions, job.createdById ?? undefined, await resolveMicroappContext(job.orgId, input.links))
    const result: MicroappResult = validateMicroappResultEnvelope(
      manifest.id,
      await manifest.run(ctx, input.payload),
    )

    const outParsed = manifest.outputSchema.safeParse(result.data)
    if (!outParsed.success) {
      throw Object.assign(new Error('La microapp produjo una salida que no cumple su propio contrato'), {
        code: 'MICROAPP_OUTPUT_INVALID',
        details: outParsed.error.flatten(),
      })
    }
    // Persistir la proyección canónica de Zod: evita que claves desconocidas
    // devueltas por un handler sobrevivan la frontera y se encadenen en Flow.
    result.data = outParsed.data

    if (input.agentic) {
      const councilExecution = await runAgenticCouncil({
        ctx,
        manifest,
        input: input.payload,
        result,
        config: input.agentic,
      })
      const { revisedData, ...council } = councilExecution
      if (revisedData !== undefined) {
        // La revisión ya fue validada contra outputSchema dentro del circuito.
        // Parseamos de nuevo en la frontera antes de sustituir el resultado
        // canónico que se persistirá y podrá encadenar un Flow.
        result.data = manifest.outputSchema.parse(revisedData)
      }
      result.agentic = council
      result.evidence.push({
        claim: `Consejo de ${result.agentic.profile.roles.length} agentes completado en ${result.agentic.completedRounds} ronda(s); score final ${result.agentic.final.score}`,
        sourceRef: { kind: 'agentic_council', id: job.id },
        confidence: result.agentic.final.status === 'ready' ? 'high' : 'medium',
        fetchedAt: new Date().toISOString(),
      })
      validateMicroappResultEnvelope(manifest.id, result)
    }

    const staleAt = manifest.freshnessDays
      ? new Date(Date.now() + manifest.freshnessDays * 24 * 3600 * 1000)
      : null
    const accessSnapshots = microappAccessSnapshots(manifest)

    await prisma.microappRun.upsert({
      where: { jobId: job.id },
      create: {
        orgId: job.orgId,
        microappId: manifest.id,
        version: manifest.version,
        jobId: job.id,
        input: input.payload as never,
        result: result as never,
        dataAccessSnapshot: accessSnapshots.dataAccessSnapshot,
        accessRolesSnapshot: accessSnapshots.accessRolesSnapshot,
        staleAt,
        leadId: input.links?.leadId ?? null,
        accountId: input.links?.accountId ?? null,
        productionId: input.links?.productionId ?? null,
        callId: input.links?.callId ?? null,
        opportunityId: input.links?.opportunityId ?? null,
        conversationId: input.links?.conversationId ?? null,
        createdById: job.createdById ?? null,
      },
      update: { result: result as never, staleAt },
    })
    if (manifest.resultProjection) {
      const contextEntity = ctx.context?.[manifest.resultProjection.target as keyof MicroappContext]
      const targetId = input.links?.[`${manifest.resultProjection.target}Id` as keyof NonNullable<MicroappJobInput['links']>]
        ?? (manifest.resultProjection.target === 'client' ? job.orgId : undefined)
        ?? (contextEntity && typeof contextEntity === 'object' && !Array.isArray(contextEntity) && typeof (contextEntity as Record<string, unknown>).id === 'string'
          ? (contextEntity as Record<string, unknown>).id as string
          : undefined)
      if (typeof targetId === 'string' && targetId) {
        const run = await prisma.microappRun.findUnique({ where: { jobId: job.id }, select: { id: true } })
        if (run) await prisma.microappProjection.upsert({
          where: { runId: run.id },
          create: { orgId: job.orgId, runId: run.id, kind: manifest.resultProjection.kind, surface: manifest.resultProjection.target, entityId: targetId, payload: result.data as never, pinned: manifest.resultProjection.pin ?? true, staleAt },
          update: { payload: result.data as never, pinned: manifest.resultProjection.pin ?? true, staleAt },
        })
      }
    }
    return {
      output: {
        microappId: manifest.id,
        evidenceCount: result.evidence.length,
        assets: result.assets ?? [],
        routingDecisions,
      },
    }
  })
}
