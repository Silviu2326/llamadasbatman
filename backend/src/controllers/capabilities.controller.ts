import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { bindingsFor, getCapabilityContract, listProviders } from '../providers/registry'
import { route } from '../providers/router'
import { runCapability } from '../providers/runCapability'
import { getAsset } from '../services/assets.service'
import { replyWithRunError } from './microapps.controller'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

/**
 * GET / — capabilities disponibles: las que tienen contrato registrado Y al
 * menos un proveedor que las declara. Se enumeran desde los bindings de los
 * proveedores porque el registro de contratos no expone listado (a propósito:
 * un contrato sin proveedor no es invocable y no debe aparecer en el catálogo).
 */
export async function list(_request: FastifyRequest, reply: FastifyReply) {
  const names = new Set<string>()
  for (const provider of listProviders()) {
    for (const binding of provider.capabilities) names.add(binding.capability)
  }

  const capabilities = [...names]
    .filter((name) => getCapabilityContract(name) !== undefined)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      capability: name,
      providers: bindingsFor(name).map(({ provider, binding }) => ({
        providerId: provider.id,
        displayName: provider.displayName,
        qualityTier: binding.qualityTier,
        authModes: provider.auth.modes,
      })),
    }))

  return reply.send({ capabilities })
}

const preferencesSchema = z.object({
  providerId: z.string().trim().min(1).max(120).optional(),
  tier: z.enum(['draft', 'standard', 'premium']).optional(),
  maxCostCents: z.number().int().positive().optional(),
  maxLatencyMs: z.number().int().positive().optional(),
}).strict()

const runBodySchema = z.object({
  capability: z.string().trim().min(1).max(120),
  input: z.unknown().optional(),
  preferences: preferencesSchema.optional(),
}).strict()

/** POST /run — encola la capability como Job y devuelve su id. */
export async function run(
  request: FastifyRequest<{ Body: { capability?: string; input?: unknown; preferences?: unknown } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, runBodySchema, request.body ?? {})
  if (!body) return

  try {
    const { jobId } = await runCapability({
      orgId,
      capability: body.capability,
      input: body.input ?? {},
      preferences: body.preferences,
      createdById: userId,
    })
    return reply.send({ jobId })
  } catch (error) {
    return replyWithRunError(reply, error)
  }
}

/**
 * POST /estimate — solo enruta y devuelve la RouteDecision entera SIN crear
 * job: elegido, coste estimado, alternativas y exclusiones con motivo. Es la
 * transparencia del plan (04-ROUTER): el usuario ve qué pasaría antes de pagar.
 */
export async function estimate(
  request: FastifyRequest<{ Body: { capability?: string; input?: unknown; preferences?: unknown } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, runBodySchema, request.body ?? {})
  if (!body) return

  try {
    const { decision } = await route({
      orgId,
      capability: body.capability,
      input: body.input ?? {},
      preferences: body.preferences,
    })
    return reply.send(decision)
  } catch (error) {
    return replyWithRunError(reply, error)
  }
}

const upscaleBodySchema = z.object({
  mode: z.enum(['faithful', 'creative', 'relight', 'restore']).optional(),
  scale: z.number().int().min(2).max(16).optional(),
}).strict()

/**
 * POST /assets/:id/upscale — conveniencia sobre `image.upscale`: valida que el
 * asset existe, es de la org y es imagen, y encola la capability con defaults
 * razonables (modo fiel, x2). El router decide proveedor como siempre.
 */
export async function upscaleAsset(
  request: FastifyRequest<{ Params: { id: string }; Body: { mode?: string; scale?: number } }>,
  reply: FastifyReply
) {
  const { orgId, userId } = request.user as JWTUser
  const body = parseRequest(reply, upscaleBodySchema, request.body ?? {})
  if (!body) return

  // Filtrado por orgId dentro del servicio: un asset de otra org es inexistente.
  const asset = await getAsset({ orgId, id: request.params.id })
  if (!asset) return reply.status(404).send({ error: 'Asset no encontrado' })
  if (asset.kind !== 'image') {
    return reply.status(400).send({
      error: `Solo se puede mejorar una imagen (este asset es ${asset.kind})`,
      code: 'ASSET_KIND_INVALID',
    })
  }

  try {
    const { jobId } = await runCapability({
      orgId,
      capability: 'image.upscale',
      input: { assetId: asset.id, mode: body.mode ?? 'faithful', scale: body.scale ?? 2 },
      createdById: userId,
    })
    return reply.send({ jobId })
  } catch (error) {
    return replyWithRunError(reply, error)
  }
}
