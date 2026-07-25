import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as pipelineService from '../services/pipeline.service'
import {
  OwnershipError, OpportunityNotFoundError, PipelineValidationError, PipelineStateError,
  OpportunityContactNotFoundError, LineItemNotFoundError, ProductNotFoundError,
  FORECAST_CATEGORIES, OPPORTUNITY_CONTACT_ROLES,
} from '../services/pipeline.service'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const OPPORTUNITY_STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const
// OP-104: reopen() vuelve la oportunidad a una etapa activa; no tiene
// sentido "reabrir" directamente hacia closed_won/closed_lost (para eso
// están mark-won/mark-lost).
const REOPEN_STAGES = ['lead', 'qualified', 'proposal', 'negotiation'] as const
// Monedas soportadas por el formulario de oportunidad (ver OpportunityDetailPage.jsx).
const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN'] as const

// OP-103: campos/direcciones de orden permitidos vía querystring (?sort=campo:direccion).
const OPPORTUNITY_SORT_OPTIONS = [
  'createdAt:asc', 'createdAt:desc',
  'updatedAt:asc', 'updatedAt:desc',
  'expectedCloseDate:asc', 'expectedCloseDate:desc',
  'value:asc', 'value:desc',
  'name:asc', 'name:desc',
] as const

const listQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  ownerId: z.string().trim().min(1).max(128).optional(),
  closeFrom: z.string().trim().min(1).optional(),
  closeTo: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(OPPORTUNITY_SORT_OPTIONS).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

const forecastQuerySchema = z.object({
  ownerId: z.string().trim().min(1).max(128).optional(),
  category: z.enum(FORECAST_CATEGORIES).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  closeFrom: z.string().trim().min(1).optional(),
  closeTo: z.string().trim().min(1).optional(),
}).strict()

const forecastCategorySchema = z.object({
  forecastCategory: z.enum(FORECAST_CATEGORIES),
}).strict()

const addContactSchema = z.object({
  leadId: z.string().trim().min(1, 'leadId es requerido'),
  role: z.enum(OPPORTUNITY_CONTACT_ROLES),
  isPrimary: z.boolean().optional(),
}).strict()

const addLineItemSchema = z.object({
  productId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, 'name es requerido').max(200),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
}).strict()

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'name es requerido').max(200),
  sku: z.string().trim().min(1).max(100).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
}).strict()

const expectedCloseDateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'expectedCloseDate no es una fecha válida' })

const createOpportunitySchema = z
  .object({
    leadId: z.string().trim().min(1, 'leadId es requerido'),
    assignedTo: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1, 'name es requerido').max(200),
    stage: z.enum(OPPORTUNITY_STAGES).optional(),
    value: z.coerce.number().min(0).optional(),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    expectedCloseDate: expectedCloseDateSchema.optional(),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict()

const updateOpportunitySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    value: z.coerce.number().min(0).optional(),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    expectedCloseDate: expectedCloseDateSchema.optional(),
    notes: z.string().trim().max(5000).optional(),
    assignedTo: z.string().trim().min(1).optional(),
  })
  .strict()

const moveStageSchema = z
  .object({
    toStage: z.enum(OPPORTUNITY_STAGES),
    reason: z.string().trim().max(500).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
  })
  .strict()

const markWonSchema = z
  .object({
    actualCloseDate: expectedCloseDateSchema.optional(),
    finalValue: z.coerce.number().min(0).optional(),
  })
  .strict()

const markLostSchema = z
  .object({
    reason: z.string().trim().min(1, 'reason es requerido').max(500),
    lossNotes: z.string().trim().max(2000).optional(),
  })
  .strict()

const reopenSchema = z
  .object({
    toStage: z.enum(REOPEN_STAGES).optional(),
  })
  .strict()

export async function get(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const opp = await pipelineService.getOpportunity(orgId, { userId, role }, request.params.id)
  if (!opp) return reply.status(404).send({ error: 'Not found' })
  return reply.send(opp)
}

export async function listByStage(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, userId, role } = request.user as JWTUser
  const result = await pipelineService.listByStage(orgId, { userId, role })
  return reply.send(result)
}

export async function create(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const data = parseRequest(reply, createOpportunitySchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.createOpportunity(orgId, userId, role, data)
    return reply.status(201).send(opp)
  } catch (err) {
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}

export async function insights(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelineInsights(orgId))
}

export async function prediction(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelinePrediction(orgId))
}

export async function actions(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.getPipelineActions(orgId))
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const data = parseRequest(reply, updateOpportunitySchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.updateOpportunity(orgId, userId, role, request.params.id, data)
    return reply.send(opp)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}

export async function moveStage(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const data = parseRequest(reply, moveStageSchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.moveStage(
      orgId,
      userId,
      role,
      request.params.id,
      data.toStage,
      data.reason,
      data.probability
    )
    return reply.send(opp)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    if (err instanceof PipelineValidationError) {
      return reply.status(400).send({ error: err.message })
    }
    throw err
  }
}

export async function markWon(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const data = parseRequest(reply, markWonSchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.markWon(orgId, userId, role, request.params.id, data)
    return reply.send(opp)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof PipelineStateError || err instanceof PipelineValidationError) {
      return reply.status(400).send({ error: err.message })
    }
    throw err
  }
}

export async function markLost(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const data = parseRequest(reply, markLostSchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.markLost(orgId, userId, role, request.params.id, data)
    return reply.send(opp)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof PipelineStateError || err instanceof PipelineValidationError) {
      return reply.status(400).send({ error: err.message })
    }
    throw err
  }
}

export async function reopen(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const data = parseRequest(reply, reopenSchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.reopen(orgId, userId, role, request.params.id, data)
    return reply.send(opp)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof PipelineStateError || err instanceof PipelineValidationError) {
      return reply.status(400).send({ error: err.message })
    }
    throw err
  }
}

export async function history(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  try {
    const rows = await pipelineService.getStageHistory(orgId, { userId, role }, request.params.id)
    return reply.send(rows)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}

// ─── OP-103: vista de lista ─────────────────────────────────────────────────

export async function list(
  request: FastifyRequest<{
    Querystring: {
      search?: string
      stage?: string
      ownerId?: string
      closeFrom?: string
      closeTo?: string
      source?: string
      sort?: string
      page?: string
      limit?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const query = parseRequest(reply, listQuerySchema, request.query)
  if (!query) return
  const result = await pipelineService.listOpportunities(orgId, { userId, role }, query)
  return reply.send(result)
}

// ─── OP-107: forecast ───────────────────────────────────────────────────────

export async function forecast(
  request: FastifyRequest<{
    Querystring: {
      ownerId?: string
      category?: string
      currency?: string
      closeFrom?: string
      closeTo?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const query = parseRequest(reply, forecastQuerySchema, request.query)
  if (!query) return
  const result = await pipelineService.getForecast(orgId, { userId, role }, query)
  return reply.send(result)
}

export async function updateForecastCategory(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId, role } = request.user as JWTUser
  const data = parseRequest(reply, forecastCategorySchema, request.body)
  if (!data) return

  try {
    const opp = await pipelineService.updateForecastCategory(orgId, userId, role, request.params.id, data.forecastCategory)
    return reply.send(opp)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}

// ─── OP-108: contactos / roles de compra ────────────────────────────────────

export async function listContacts(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  try {
    const rows = await pipelineService.listOpportunityContacts(orgId, request.params.id)
    return reply.send(rows)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}

export async function addContact(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, addContactSchema, request.body)
  if (!data) return

  try {
    const contact = await pipelineService.addOpportunityContact(orgId, userId, request.params.id, data)
    return reply.status(201).send(contact)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    if (err instanceof OwnershipError) {
      return reply.status(404).send({ error: `${err.field} no encontrado` })
    }
    throw err
  }
}

export async function removeContact(
  request: FastifyRequest<{ Params: { id: string; leadId: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  try {
    await pipelineService.removeOpportunityContact(orgId, request.params.id, request.params.leadId)
    return reply.status(204).send()
  } catch (err) {
    if (err instanceof OpportunityNotFoundError || err instanceof OpportunityContactNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}

// ─── OP-109: productos / líneas de producto ─────────────────────────────────

export async function listProducts(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send(await pipelineService.listProducts(orgId))
}

export async function createProduct(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, createProductSchema, request.body)
  if (!data) return
  const product = await pipelineService.createProduct(orgId, userId, data)
  return reply.status(201).send(product)
}

export async function listLineItems(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  try {
    const rows = await pipelineService.listLineItems(orgId, request.params.id)
    return reply.send(rows)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}

export async function addLineItem(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const data = parseRequest(reply, addLineItemSchema, request.body)
  if (!data) return

  try {
    const lineItem = await pipelineService.addLineItem(orgId, userId, request.params.id, data)
    return reply.status(201).send(lineItem)
  } catch (err) {
    if (err instanceof OpportunityNotFoundError || err instanceof ProductNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}

export async function removeLineItem(
  request: FastifyRequest<{ Params: { id: string; lineItemId: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  try {
    await pipelineService.removeLineItem(orgId, request.params.id, request.params.lineItemId)
    return reply.status(204).send()
  } catch (err) {
    if (err instanceof OpportunityNotFoundError || err instanceof LineItemNotFoundError) {
      return reply.status(404).send({ error: 'Not found' })
    }
    throw err
  }
}
