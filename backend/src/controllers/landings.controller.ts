import { FastifyReply, FastifyRequest } from 'fastify'
import * as landingPerformance from '../services/landingPerformance.service'
import { diagnoseOrganization } from '../services/landingDiagnostics.service'
import { computeBaseline } from '../services/landingBaseline.service'
import * as variants from '../services/landingVariants.service'
import * as experiments from '../services/landingExperiments.service'
import * as socialProof from '../services/landingSocialProof.service'
import * as autonomy from '../services/landingAutonomy.service'
import * as landingReport from '../services/landingReport.service'
import { VariantError } from '../services/landingVariants.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

/**
 * Lectura de la página `/landings` (docs/xarly/landings.md §5). Devuelve
 * snapshots ya calculados por el job: la página no reconstruye el embudo desde
 * eventos brutos en cada carga.
 *
 * El orden en que responde es el de §5: primero si se puede confiar en los
 * datos, después dónde actuar, y solo entonces los números.
 */
export async function overview(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const [performance, attention] = await Promise.all([
    landingPerformance.getLandingsOverview(orgId),
    diagnoseOrganization(orgId),
  ])
  return reply.send({ ...performance, attention })
}

/** Detalle de una landing (§5.3), con su diagnóstico activo y su línea base. */
export async function detail(
  request: FastifyRequest<{ Params: { landingKey: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const { landingKey } = request.params

  const landing = await landingPerformance.getLandingDetail(orgId, landingKey)
  if (!landing) return reply.status(404).send({ error: 'Landing no encontrada' })

  const [diagnoses, baseline] = await Promise.all([
    diagnoseOrganization(orgId),
    computeBaseline(landingKey),
  ])

  return reply.send({
    ...landing,
    baseline,
    diagnoses: diagnoses.filter(diagnosis => diagnosis.landingKey === landingKey),
  })
}

/**
 * Recalcula agregados y snapshots de la organización. Existe para no depender
 * del ciclo de seis horas del worker cuando alguien acaba de publicar una
 * landing y quiere ver su telemetría.
 */
export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await landingPerformance.refreshLandingPerformance(orgId))
}

/** Traduce los errores de negocio de variantes a 409, no a 500. */
async function guard<T>(reply: FastifyReply, run: () => Promise<T>) {
  try {
    return reply.send(await run())
  } catch (error) {
    if (error instanceof VariantError) return reply.status(409).send({ error: error.message })
    throw error
  }
}

export async function listVariants(
  request: FastifyRequest<{ Querystring: { landingKey?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  return reply.send({ items: await variants.listVariants(orgId, request.query?.landingKey) })
}

export async function generateVariant(
  request: FastifyRequest<{ Body: { landingKey?: string; diagnosisType?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const landingKey = request.body?.landingKey
  if (!landingKey) return reply.status(400).send({ error: 'landingKey es obligatorio' })
  return guard(reply, () => variants.generateVariant(orgId, userId, landingKey, request.body?.diagnosisType))
}

export async function requestApproval(
  request: FastifyRequest<{ Params: { variantId: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => variants.requestVariantApproval(orgId, userId, request.params.variantId))
}

export async function discardVariant(
  request: FastifyRequest<{ Params: { variantId: string }; Body: { reason?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => variants.discardVariant(orgId, userId, request.params.variantId, request.body?.reason))
}

export async function startExperiment(
  request: FastifyRequest<{ Params: { variantId: string }; Body: { durationDays?: number; primaryMetric?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => experiments.startLandingExperiment(orgId, userId, request.params.variantId, request.body ?? {}))
}

export async function experimentResults(
  request: FastifyRequest<{ Params: { experimentId: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  return guard(reply, () => experiments.evaluateExperiment(orgId, request.params.experimentId))
}

export async function autonomyState(
  request: FastifyRequest<{ Querystring: { landingKey?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const [config, decisions] = await Promise.all([
    autonomy.autonomyConfig(orgId),
    autonomy.listDecisions(orgId, request.query?.landingKey),
  ])
  return reply.send({ config, decisions, policyVersion: autonomy.AUTONOMY_POLICY_VERSION })
}

/**
 * Cambiar el nivel de autonomía o apagar el modo sombra permite que el sistema
 * modifique landings sin intervención: es administrativo por diseño.
 */
export async function updateAutonomy(
  request: FastifyRequest<{ Body: Record<string, unknown> }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => autonomy.setAutonomyConfig(orgId, userId, request.body ?? {}))
}

/** Ejecuta la pasada de autonomía ahora, sin esperar al ciclo diario. */
export async function runAutonomy(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return guard(reply, () => autonomy.runAutonomyPass(orgId))
}

export async function report(
  request: FastifyRequest<{ Params: { landingKey: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  const built = await landingReport.buildReport(orgId, request.params.landingKey)
  if (!built) return reply.status(404).send({ error: 'Landing no encontrada' })
  return reply.send({ ...built, narrative: landingReport.narrateReport(built) })
}

export async function socialProofCandidates(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ items: await socialProof.listCandidates(orgId) })
}

export async function requestSocialProof(
  request: FastifyRequest<{ Body: { leadId?: string; quote?: string; attribution?: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  const { leadId, quote } = request.body ?? {}
  if (!leadId || !quote) return reply.status(400).send({ error: 'leadId y quote son obligatorios' })
  return guard(reply, () => socialProof.requestPublication(orgId, userId, { leadId, quote, attribution: request.body?.attribution }))
}

/** Cierre del experimento: N2, un clic de una persona, registrado en AuditLog. */
export async function concludeExperiment(
  request: FastifyRequest<{ Params: { experimentId: string } }>,
  reply: FastifyReply,
) {
  const { orgId, userId } = request.user as JWTUser
  return guard(reply, () => experiments.concludeExperiment(orgId, userId, request.params.experimentId))
}
