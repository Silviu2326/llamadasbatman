import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { getPlatformActor } from '../access-control'
import { ROLE_KEYS, PLAN_KEYS } from '../access-control'
import { ACCESS_TOKEN_TTL } from '../services/auth.service'
import { getWorkspaceGrantsForUserAsync } from '../services/workspaceAccess.service'
import { brandForOrg } from '../services/whiteLabel.service'
import * as service from '../services/backOffice.service'

const id = z.string().trim().min(1).max(128)
/**
 * Toda mutación exige un motivo escrito. No es burocracia: la auditoría de un
 * back office solo sirve si dentro de seis meses explica POR QUÉ se cambió
 * algo, y el único momento en que alguien lo sabe es al hacerlo.
 */
const reason = z.string().trim().min(8).max(1_000)
const role = z.enum(ROLE_KEYS)
const plan = z.enum(PLAN_KEYS)

const pageQuery = { page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }
const booleanFlag = z.enum(['true', 'false']).transform(value => value === 'true').optional()

const orgListQuery = z.object({ ...pageQuery, q: z.string().trim().max(200).optional(), plan: z.string().trim().max(40).optional() }).strict()
const userListQuery = z.object({
  ...pageQuery,
  q: z.string().trim().max(200).optional(),
  role: role.optional(),
  orgId: id.optional(),
  platformAdminsOnly: booleanFlag,
}).strict()
const sessionListQuery = z.object({
  ...pageQuery,
  userId: id.optional(),
  orgId: id.optional(),
  activeOnly: booleanFlag,
  impersonatedOnly: booleanFlag,
}).strict()
const apiKeyListQuery = z.object({ ...pageQuery, orgId: id.optional(), activeOnly: booleanFlag }).strict()
const auditListQuery = z.object({
  ...pageQuery,
  action: z.string().trim().max(120).optional(),
  orgId: id.optional(),
  actorUserId: id.optional(),
  entityId: id.optional(),
}).strict()

const idParams = z.object({ id }).strict()
const membershipBody = z.object({ userId: id, orgId: id, role, reason }).strict()
const membershipStatusBody = z.object({ userId: id, orgId: id, status: z.enum(service.MEMBERSHIP_STATUSES), reason }).strict()
const membershipRemoveBody = z.object({ userId: id, orgId: id, reason }).strict()
const userPatchBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(320).optional(),
  reason,
}).strict().refine(value => value.name !== undefined || value.email !== undefined, {
  message: 'Indica al menos un campo a modificar',
})
const reasonBody = z.object({ reason }).strict()
const orgPatchBody = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  plan: plan.optional(),
  email: z.string().trim().email().max(320).optional(),
  website: z.string().trim().url().max(500).optional(),
  phone: z.string().trim().max(40).optional(),
  industry: z.string().trim().max(120).optional(),
  timezone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(300).optional(),
  currency: z.string().trim().length(3).optional(),
  mauticEnabled: z.boolean().optional(),
  metricoolEnabled: z.boolean().optional(),
  reason,
}).strict()
const orgCreateBody = z.object({
  name: z.string().trim().min(2).max(160),
  plan: plan.default('free'),
  email: z.string().trim().email().max(320).optional(),
  ownerUserId: id.optional(),
  reason,
}).strict()
const walletBody = z.object({
  amountCents: z.number().int().refine(value => value !== 0, 'El ajuste no puede ser cero').refine(
    value => Math.abs(value) <= 1_000_000_00,
    'Un ajuste manual no puede superar 1.000.000 en una sola operación',
  ),
  reason,
}).strict()
const impersonateBody = z.object({ userId: id, orgId: id.optional(), reason }).strict()

function actor(request: FastifyRequest) {
  return getPlatformActor(request)
}

async function respond(reply: FastifyReply, operation: () => Promise<unknown> | unknown) {
  try {
    return reply.send(await operation())
  } catch (error) {
    if (error instanceof service.BackOfficeError) {
      return reply.status(error.statusCode).send({ error: error.message, code: error.code })
    }
    throw error
  }
}

// --- Lectura ---------------------------------------------------------------

export async function overview(_request: FastifyRequest, reply: FastifyReply) {
  return respond(reply, () => service.getOverview())
}

export async function permissions(_request: FastifyRequest, reply: FastifyReply) {
  return respond(reply, () => service.getPermissionMatrix())
}

export async function organizations(request: FastifyRequest, reply: FastifyReply) {
  const query = parseRequest(reply, orgListQuery, request.query)
  if (!query) return
  return respond(reply, () => service.listOrganizations(query))
}

export async function organization(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  if (!params) return
  return respond(reply, () => service.getOrganization(params.id))
}

export async function users(request: FastifyRequest, reply: FastifyReply) {
  const query = parseRequest(reply, userListQuery, request.query)
  if (!query) return
  return respond(reply, () => service.listUsers(query))
}

export async function user(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  if (!params) return
  return respond(reply, () => service.getUser(params.id))
}

export async function sessions(request: FastifyRequest, reply: FastifyReply) {
  const query = parseRequest(reply, sessionListQuery, request.query)
  if (!query) return
  return respond(reply, () => service.listSessions(query))
}

export async function apiKeys(request: FastifyRequest, reply: FastifyReply) {
  const query = parseRequest(reply, apiKeyListQuery, request.query)
  if (!query) return
  return respond(reply, () => service.listApiKeys(query))
}

export async function audit(request: FastifyRequest, reply: FastifyReply) {
  const query = parseRequest(reply, auditListQuery, request.query)
  if (!query) return
  return respond(reply, () => service.listAudit(query))
}

// --- Escritura -------------------------------------------------------------

export async function setMembershipRole(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, membershipBody, request.body)
  if (!body) return
  return respond(reply, async () => ({ ok: true, ...(await service.setMembershipRole(actor(request), body)) }))
}

export async function setMembershipStatus(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, membershipStatusBody, request.body)
  if (!body) return
  return respond(reply, async () => ({ ok: true, ...(await service.setMembershipStatus(actor(request), body)) }))
}

export async function addMembership(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, membershipBody, request.body)
  if (!body) return
  return respond(reply, async () => ({ ok: true, ...(await service.addMembership(actor(request), body)) }))
}

export async function removeMembership(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, membershipRemoveBody, request.body)
  if (!body) return
  return respond(reply, async () => ({ ok: true, ...(await service.removeMembership(actor(request), body)) }))
}

export async function updateUser(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  const body = parseRequest(reply, userPatchBody, request.body)
  if (!params || !body) return
  return respond(reply, async () => ({ ok: true, ...(await service.updateUser(actor(request), params.id, body)) }))
}

export async function resetPassword(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  const body = parseRequest(reply, reasonBody, request.body)
  if (!params || !body) return
  return respond(reply, async () => ({ ok: true, ...(await service.resetUserPassword(actor(request), params.id, body)) }))
}

export async function revokeUserSessions(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  const body = parseRequest(reply, reasonBody, request.body)
  if (!params || !body) return
  return respond(reply, async () => ({ ok: true, ...(await service.revokeAllUserSessions(actor(request), params.id, body.reason)) }))
}

export async function createOrganization(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, orgCreateBody, request.body)
  if (!body) return
  return respond(reply, async () => {
    const created = await service.createOrganization(actor(request), body)
    return reply.status(201).send({ ok: true, ...created })
  })
}

export async function updateOrganization(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  const body = parseRequest(reply, orgPatchBody, request.body)
  if (!params || !body) return
  const { reason: why, ...patch } = body
  return respond(reply, async () => ({ ok: true, ...(await service.updateOrganization(actor(request), params.id, patch, why)) }))
}

export async function adjustWallet(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  const body = parseRequest(reply, walletBody, request.body)
  if (!params || !body) return
  return respond(reply, async () => ({ ok: true, ...(await service.adjustWallet(actor(request), params.id, body)) }))
}

export async function revokeSession(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  const body = parseRequest(reply, reasonBody, request.body)
  if (!params || !body) return
  return respond(reply, async () => ({ ok: true, ...(await service.revokeSession(actor(request), params.id, body.reason)) }))
}

export async function revokeApiKey(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  const body = parseRequest(reply, reasonBody, request.body)
  if (!params || !body) return
  return respond(reply, async () => ({ ok: true, ...(await service.revokeApiKey(actor(request), params.id, body.reason)) }))
}

// --- Suplantación ----------------------------------------------------------

export async function impersonate(request: FastifyRequest, reply: FastifyReply) {
  const body = parseRequest(reply, impersonateBody, request.body)
  if (!body) return
  return respond(reply, async () => {
    const started = await service.startImpersonation(actor(request), body)
    const grants = await getWorkspaceGrantsForUserAsync({
      userId: started.identity.id,
      email: started.identity.email,
      orgId: started.identity.orgId,
      role: started.identity.role,
    })
    // Mismos claims que un login normal más la marca de suplantación, que
    // `requirePlatformAdmin` usa para cerrar la puerta del back office.
    const token = request.server.jwt.sign(
      {
        userId: started.identity.id,
        orgId: started.identity.orgId,
        role: started.identity.role,
        email: started.identity.email,
        tokenType: 'access',
        sessionId: started.session.id,
        workspaceScope: 'org',
        workspaceGrants: grants,
        impersonated: true,
        impersonatorUserId: actor(request).userId,
      },
      { expiresIn: ACCESS_TOKEN_TTL },
    )
    return {
      ok: true,
      token,
      sessionId: started.session.id,
      expiresAt: started.expiresAt,
      ttlMinutes: service.IMPERSONATION_TTL_MINUTES,
      user: {
        id: started.identity.id,
        name: started.identity.name,
        email: started.identity.email,
        role: started.identity.role,
        orgId: started.identity.orgId,
        workspaces: grants.map(grant => ({ id: grant.workspaceId, role: grant.role, scope: grant.scope, primary: grant.source === 'primary' })),
      },
      organization: started.organization,
      brand: await brandForOrg(started.identity.orgId),
    }
  })
}

export async function stopImpersonation(request: FastifyRequest, reply: FastifyReply) {
  const params = parseRequest(reply, idParams, request.params)
  if (!params) return
  return respond(reply, async () => ({ ok: true, ...(await service.stopImpersonation(actor(request), params.id)) }))
}
