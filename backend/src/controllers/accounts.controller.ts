import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as accountsService from '../services/accounts.service'
import { OwnershipError, AccountNotFoundError, LeadNotFoundError } from '../services/accounts.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict()
const leadIdParamsSchema = z.object({ leadId: z.string().trim().min(1).max(128) }).strict()

const phoneSchema = z.string().trim().regex(/^[0-9+()\-.\s]{3,40}$/, 'Teléfono inválido').max(40)
const customFieldsSchema = z.record(z.unknown())

const listQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  ownerId: z.string().trim().min(1).max(128).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'name es requerido').max(160),
  domain: z.string().trim().max(255).optional(),
  industry: z.string().trim().max(120).optional(),
  sizeBand: z.string().trim().max(60).optional(),
  website: z.string().trim().max(2_048).optional(),
  phone: phoneSchema.optional(),
  address: z.string().trim().max(255).optional(),
  ownerId: z.string().trim().min(1).max(128).optional(),
  source: z.string().trim().max(80).optional(),
  lifecycleStatus: z.string().trim().max(60).optional(),
  customFields: customFieldsSchema.optional(),
}).strict()

const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  domain: z.string().trim().max(255).optional(),
  industry: z.string().trim().max(120).optional(),
  sizeBand: z.string().trim().max(60).optional(),
  website: z.string().trim().max(2_048).optional(),
  phone: phoneSchema.optional(),
  address: z.string().trim().max(255).optional(),
  ownerId: z.string().trim().min(1).max(128).optional().nullable(),
  source: z.string().trim().max(80).optional(),
  lifecycleStatus: z.string().trim().max(60).optional(),
  customFields: customFieldsSchema.optional(),
}).strict().refine((value) => Object.values(value).some((item) => item !== undefined), 'Incluye al menos un campo para actualizar')

const assignLeadSchema = z.object({ accountId: z.string().trim().min(1).max(128).nullable() }).strict()

function ownershipStatus(err: unknown) {
  if (err instanceof OwnershipError) return { status: 404 as const, body: { error: `${err.field} no encontrado` } }
  return null
}

export async function list(
  request: FastifyRequest<{ Querystring: { search?: string; ownerId?: string; page?: string; limit?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const query = parseRequest(reply, listQuerySchema, request.query)
  if (!query) return
  const result = await accountsService.listAccounts(orgId, query)
  return reply.send(result)
}

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const account = await accountsService.getAccount(orgId, params.id)
  if (!account) return reply.status(404).send({ error: 'Not found' })
  return reply.send(account)
}

export async function create(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, createAccountSchema, request.body)
  if (!body) return
  try {
    const account = await accountsService.createAccount(orgId, userId, body)
    return reply.status(account.deduped ? 200 : 201).send(account)
  } catch (err) {
    const mapped = ownershipStatus(err)
    if (mapped) return reply.status(mapped.status).send(mapped.body)
    throw err
  }
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, idParamsSchema, request.params)
  const body = parseRequest(reply, updateAccountSchema, request.body)
  if (!params || !body) return
  try {
    const account = await accountsService.updateAccount(orgId, userId, params.id, body)
    return reply.send(account)
  } catch (err) {
    if (err instanceof AccountNotFoundError) return reply.status(404).send({ error: 'Not found' })
    const mapped = ownershipStatus(err)
    if (mapped) return reply.status(mapped.status).send(mapped.body)
    throw err
  }
}

/** POST /api/accounts/leads/:leadId/assign — vincula (o desvincula con accountId=null) un lead a una empresa. */
export async function assignLead(
  request: FastifyRequest<{ Params: { leadId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const params = parseRequest(reply, leadIdParamsSchema, request.params)
  const body = parseRequest(reply, assignLeadSchema, request.body)
  if (!params || !body) return
  try {
    const lead = await accountsService.assignLeadToAccount(orgId, userId, params.leadId, body.accountId)
    return reply.send(lead)
  } catch (err) {
    if (err instanceof LeadNotFoundError) return reply.status(404).send({ error: 'Lead not found' })
    const mapped = ownershipStatus(err)
    if (mapped) return reply.status(mapped.status).send(mapped.body)
    throw err
  }
}
