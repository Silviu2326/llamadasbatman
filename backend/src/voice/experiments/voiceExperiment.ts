import { assignExperimentVariant } from '../../services/revenueIntelligence.service'
import { prisma } from '../../lib/prisma'

export type VoiceExperimentSnapshot = {
  experimentId: string
  name: string
  variantId: string
  variantKey: string
  payload: unknown
}

function stableBucket(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 10_000
}

export async function resolveVoiceExperiment(orgId: string, leadId: string, campaignId: string): Promise<VoiceExperimentSnapshot | null> {
  const requestedId = process.env.VOICE_EXPERIMENT_ID?.trim()
  const canaryPercent = Math.max(0, Math.min(100, Number.parseInt(process.env.VOICE_CANARY_PERCENT ?? '100', 10) || 100))
  if (stableBucket(`canary:${campaignId}:${leadId}`) >= canaryPercent * 100) return null
  const experiment = requestedId
    ? await prisma.revenueExperiment.findFirst({ where: { id: requestedId, orgId, surface: 'voice', status: 'running' }, include: { variants: true } })
    : await prisma.revenueExperiment.findFirst({ where: { orgId, surface: 'voice', status: 'running', OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, include: { variants: true }, orderBy: { createdAt: 'asc' } })
  if (!experiment || experiment.variants.length === 0) return null

  const assignment = await assignExperimentVariant(
    orgId,
    experiment.id,
    `voice:${campaignId}:${leadId}`,
    leadId,
    { surface: 'voice', campaignId },
  )
  return {
    experimentId: experiment.id,
    name: experiment.name,
    variantId: assignment.variant.id,
    variantKey: assignment.variant.key,
    payload: assignment.variant.payload,
  }
}

export async function recordVoiceExperimentOutcome(
  orgId: string,
  experiment: VoiceExperimentSnapshot,
  leadId: string,
  campaignId: string,
  outcome: string,
): Promise<void> {
  const converted = ['meeting_scheduled', 'qualified', 'callback_requested'].includes(outcome)
  if (!converted) return
  await prisma.revenueExperimentAssignment.updateMany({
    where: {
      orgId,
      experimentId: experiment.experimentId,
      subjectKey: `voice:${campaignId}:${leadId}`,
      convertedAt: null,
    },
    data: { convertedAt: new Date(), conversionType: outcome, metadata: { surface: 'voice', campaignId, variantKey: experiment.variantKey } },
  })
}
