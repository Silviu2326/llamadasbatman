import { prisma } from '../lib/prisma'

/**
 * Qué cuenta como autorización vigente para usar una voz. Vive aparte de
 * `agents.service.ts` porque lo comparten la ficha del agente y la ruta de
 * llamadas de prueba: una prueba usa la misma voz que una llamada real, así que
 * exige la misma autorización, y "vigente" debe significar lo mismo en los dos
 * sitios.
 */

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function scopeIncludesAgent(scope: unknown, agentId: string, voiceId?: string | null) {
  const value = jsonRecord(scope)
  const agents = Array.isArray(value.agentIds) ? value.agentIds : []
  const voices = Array.isArray(value.voiceIds) ? value.voiceIds : []
  return (!agents.length && !voices.length) || agents.includes(agentId) || Boolean(voiceId && voices.includes(voiceId))
}

export function consentIsCurrent(grant: { status: string; revokedAt: Date | null; expiresAt: Date | null }, now: Date) {
  return grant.status === 'active' && !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now)
}

export async function findActiveVoiceConsent(orgId: string, agentId: string, voiceId?: string | null, now = new Date()) {
  const consents = await prisma.consentGrant.findMany({ where: { orgId, kind: 'voice' }, orderBy: { createdAt: 'desc' } })
  return consents.find(item => scopeIncludesAgent(item.scope, agentId, voiceId) && consentIsCurrent(item, now)) ?? null
}
