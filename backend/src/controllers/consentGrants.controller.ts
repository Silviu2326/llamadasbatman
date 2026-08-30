import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as consentService from '../services/consent.service'
import { CONSENT_KINDS, CONSENT_STATUSES } from '../services/consent.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const isoDateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'no es una fecha válida' })

// Alcance del consentimiento (08 §2): listas vacías = sin restricción.
const scopeSchema = z
  .object({
    channels: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    regions: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    purposes: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    exclusions: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  })
  .strict()

const createGrantSchema = z
  .object({
    subjectName: z.string().trim().min(1, 'subjectName es requerido').max(200),
    subjectContact: z.string().trim().min(1).max(200).optional(),
    kind: z.enum(CONSENT_KINDS),
    scope: scopeSchema.optional(),
    evidenceAssetId: z.string().trim().min(1).optional(),
    grantedAt: isoDateSchema.optional(),
    expiresAt: isoDateSchema.optional(),
  })
  .strict()

const listGrantsQuerySchema = z
  .object({
    kind: z.enum(CONSENT_KINDS).optional(),
    status: z.enum(CONSENT_STATUSES).optional(),
  })
  .strict()

export async function list(
  request: FastifyRequest<{ Querystring: { kind?: string; status?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listGrantsQuerySchema, request.query)
  if (!query) return
  const grants = await consentService.listConsentGrants({ orgId, kind: query.kind, status: query.status })
  return reply.send({ grants })
}

export async function create(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, createGrantSchema, request.body)
  if (!data) return

  const grant = await consentService.createConsentGrant({
    orgId,
    subjectName: data.subjectName,
    subjectContact: data.subjectContact,
    kind: data.kind,
    scope: data.scope,
    evidenceAssetId: data.evidenceAssetId,
    grantedAt: data.grantedAt ? new Date(data.grantedAt) : undefined,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    createdById: userId,
  })
  return reply.status(201).send(grant)
}

/** GET /:id — el grant con los assets que lo usan (qué afectaría revocarlo). */
export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const grant = await consentService.getConsentGrant({ orgId, id: request.params.id })
  if (!grant) return reply.status(404).send({ error: 'Not found' })
  const assets = await consentService.listAssetsUsingGrant({ orgId, consentGrantId: grant.id })
  return reply.send({ ...grant, assets })
}

/** POST /:id/revoke — marca revokedAt/status y emite `consent.revoked` al outbox. */
export async function revoke(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const revoked = await consentService.revokeConsentGrant({ orgId, id: request.params.id, revokedById: userId })
  if (!revoked) return reply.status(404).send({ error: 'Not found' })
  // Qué queda afectado por la revocación, para que la respuesta sea accionable.
  const assets = await consentService.listAssetsUsingGrant({ orgId, consentGrantId: revoked.id })
  return reply.send({ ...revoked, assets })
}
