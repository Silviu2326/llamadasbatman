import { prisma } from '../lib/prisma'

/** A short-lived request from the owner is separate from a voice-owner consent. */
export async function requestedInternalVoiceTest(orgId: string, leadId: string, agentId: string, phone: string, voiceId?: string | null) {
  const number = await prisma.voiceTestNumber.findFirst({
    where: { orgId, leadId, phone, revokedAt: null },
    include: { lead: { select: { phone: true, source: true, campaignId: true } } },
  })
  if (!number || number.lead.phone !== phone || number.lead.source !== 'internal_test' || number.lead.campaignId) return null
  const consent = await prisma.contactConsent.findFirst({
    where: { orgId, leadId, channel: 'voice', purpose: { in: ['contact', 'marketing'] } },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  })
  const now = Date.now()
  if (!consent || consent.status !== 'granted' || (consent.expiresAt && consent.expiresAt.getTime() <= now)) return null
  const meta = consent.metadata as Record<string, any> | null
  const request = meta?.internalVoiceTest
  if (!request || request.agentId !== agentId || request.phone !== phone || request.recording !== true
    || typeof request.evidence !== 'string' || !request.evidence.trim()
    || typeof request.voiceId !== 'string' || typeof request.requestedAt !== 'string' || typeof request.expiresAt !== 'string') return null
  const requestedAt = Date.parse(request.requestedAt)
  const expiresAt = Date.parse(request.expiresAt)
  if (!Number.isFinite(requestedAt) || !Number.isFinite(expiresAt) || requestedAt > now || expiresAt <= now || expiresAt - requestedAt > 3600_000) return null
  if (voiceId && request.voiceId !== voiceId) return null
  return request as { allowOutsideHours: boolean; catalogVoice: boolean; voiceId: string }
}

/** Verify provider evidence live; a public community clone is not sufficient. */
export async function isLicensedFishOfficialVoice(voiceId: string) {
  if (!/^[a-f0-9]{32}$/.test(voiceId) || !process.env.FISH_API_KEY) return false
  try {
    const response = await fetch(`https://api.fish.audio/model/${voiceId}`, {
      headers: { Authorization: `Bearer ${process.env.FISH_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return false
    const voice = await response.json() as any
    return voice._id === voiceId && voice.licensed === true && voice.visibility === 'public'
      && voice.type === 'tts' && voice.state === 'trained' && !voice.dmca_taken_down
      && voice.author?._id === 'd8b0991f96b44e489422ca2ddf0bd31d'
  } catch { return false }
}
