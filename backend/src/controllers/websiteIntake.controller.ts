import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { writeAuditLog } from '../lib/audit'
import {
  INTAKE_SCOPES,
  IntakeError,
  getWebsiteIntake,
  listWebsiteIntakes,
  startWebsiteIntake,
} from '../services/websiteIntake.service'
import { applyWebsiteIntake } from '../services/websiteIntakeApply.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const startSchema = z.object({
  website: z.string().trim().min(4).max(2_048),
  scopes: z.array(z.enum(INTAKE_SCOPES)).min(1).max(INTAKE_SCOPES.length).optional(),
}).strict()

const nullableText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).transform(value => (value ? value : null))

const offerSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().max(160),
  description: z.string().trim().max(2_000),
  priceCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  billingPeriod: z.enum(['one_time', 'monthly', 'quarterly', 'yearly', 'custom']),
  includes: z.array(z.string().trim().min(1).max(300)).max(20),
  conditions: z.string().trim().max(2_000),
  active: z.boolean(),
}).strict()

/**
 * El perfil se envía COMPLETO, no como parche: updateBusinessProfile
 * sobrescribe la ficha entera, así que la pantalla manda el estado final que
 * el revisor está viendo (lo que ya había + lo que aceptó de la propuesta).
 * Mismo esquema que PUT /settings/business-profile, a propósito.
 */
const profileSchema = z.object({
  company: z.object({
    name: z.string().trim().min(1).max(160),
    email: z.union([z.string().trim().email().max(254), z.literal(''), z.null()]).transform(value => value || null),
    website: z.union([z.string().trim().url().max(2_048), z.literal(''), z.null()]).transform(value => value || null),
    phone: nullableText(40),
    industry: nullableText(120),
    address: nullableText(500),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
  }).strict(),
  description: z.string().trim().max(4_000),
  idealCustomer: z.string().trim().max(4_000),
  valueProposition: z.string().trim().max(4_000),
  differentiators: z.array(z.string().trim().min(1).max(500)).max(20),
  offers: z.array(offerSchema).max(50),
  commercialGuardrails: z.object({
    discountPolicy: z.string().trim().max(4_000),
    paymentTerms: z.string().trim().max(4_000),
    guarantees: z.string().trim().max(4_000),
    forbiddenClaims: z.string().trim().max(4_000),
  }).strict(),
}).strict()

const applySchema = z.object({
  profile: profileSchema.optional(),
  team: z.array(z.object({
    email: z.string().trim().email().max(320),
    role: z.string().trim().min(1).max(40),
  }).strict()).max(25).optional(),
  knowledge: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    content: z.string().trim().min(20).max(20_000),
  }).strict()).max(20).optional(),
  crm: z.object({
    account: z.object({
      name: z.string().trim().min(1).max(160),
      website: nullableText(2_048).optional(),
      domain: nullableText(255).optional(),
      industry: nullableText(120).optional(),
      sizeBand: nullableText(40).optional(),
      phone: nullableText(40).optional(),
      address: nullableText(500).optional(),
    }).strict().optional(),
    contacts: z.array(z.object({
      name: z.string().trim().min(1).max(160),
      email: z.union([z.string().trim().email().max(320), z.null()]).optional(),
      phone: nullableText(40).optional(),
      title: nullableText(160).optional(),
    }).strict()).max(25).optional(),
  }).strict().optional(),
}).strict().refine(
  value => Boolean(value.profile || value.team?.length || value.knowledge?.length || value.crm),
  { message: 'No hay nada seleccionado que aplicar' },
)

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof IntakeError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code })
  }
  throw error
}

/** POST / — encola el análisis de una web y devuelve el job que lo ejecuta. */
export async function start(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, startSchema, request.body ?? {})
  if (!body) return
  try {
    const { jobId } = await startWebsiteIntake({
      orgId,
      website: body.website,
      scopes: body.scopes ?? [...INTAKE_SCOPES],
      createdById: userId,
    })
    return reply.status(202).send({ jobId })
  } catch (error) {
    return fail(reply, error)
  }
}

/** GET / — últimos análisis de la organización. */
export async function list(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ runs: await listWebsiteIntakes(orgId) })
}

/** GET /:jobId — estado y, si terminó, la propuesta completa. */
export async function get(request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const run = await getWebsiteIntake(orgId, request.params.jobId)
  if (!run) return reply.status(404).send({ error: 'Análisis no encontrado' })
  return reply.send(run)
}

/** POST /:jobId/apply — escribe lo que el revisor aceptó. */
export async function apply(
  request: FastifyRequest<{ Params: { jobId: string }; Body: unknown }>,
  reply: FastifyReply,
) {
  const { orgId, userId, role } = request.user as JWTUser
  const run = await getWebsiteIntake(orgId, request.params.jobId)
  if (!run) return reply.status(404).send({ error: 'Análisis no encontrado' })
  if (run.status !== 'succeeded') {
    return reply.status(409).send({ error: `El análisis no ha terminado (estado: ${run.status})`, code: 'INTAKE_NOT_READY' })
  }
  const body = parseRequest(reply, applySchema, request.body ?? {})
  if (!body) return

  const report = await applyWebsiteIntake({
    orgId,
    actor: { userId, role },
    jobId: run.jobId,
    selection: body,
  })
  await writeAuditLog({
    orgId,
    actorUserId: userId,
    action: 'website_intake.reviewed',
    entityType: 'Job',
    entityId: run.jobId,
    after: { website: run.website, sections: Object.keys(body) },
  })
  return reply.send({ report })
}
