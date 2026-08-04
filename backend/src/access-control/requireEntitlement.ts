import type { FastifyReply, FastifyRequest } from 'fastify'
import { getAccessPrincipal } from './requirePermission'
import { assertCapability, assertUsageLimit, type Capability, type EntitlementSnapshot, type LimitResource } from './entitlements'

declare module 'fastify' {
  interface FastifyRequest {
    entitlementSnapshot?: EntitlementSnapshot
    workspaceId?: string
  }
}

export type EntitlementOptions = Readonly<{
  integration?: 'mautic' | 'metricool'
  limit?: { resource: LimitResource; increment?: number }
}>

/**
 * Plan gate to be composed after `authenticate` and role permission guards.
 * It deliberately returns structured errors so the API client can distinguish
 * a missing capability from an exhausted quota or disabled integration.
 */
export function requireEntitlement(capability: Capability, options: EntitlementOptions = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const principal = getAccessPrincipal(request)
    if (!principal) return reply.status(401).send({ error: 'Autenticación requerida', code: 'AUTHENTICATION_REQUIRED' })
    try {
      const snapshot = await assertCapability(principal.orgId, capability, {
        integration: options.integration,
        snapshot: request.entitlementSnapshot,
      })
      request.entitlementSnapshot = snapshot
      if (options.limit) {
        await assertUsageLimit(principal.orgId, options.limit.resource, options.limit.increment ?? 1, snapshot)
      }
    } catch (error) {
      const candidate = error as { statusCode?: number; code?: string; message?: string; details?: Record<string, unknown> }
      if (candidate.code && candidate.statusCode && candidate.message) {
        return reply.status(candidate.statusCode).send({ error: candidate.message, code: candidate.code, ...candidate.details })
      }
      throw error
    }
  }
}

