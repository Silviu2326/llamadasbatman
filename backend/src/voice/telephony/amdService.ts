import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { validateVoiceResourceOwnership } from '../../services/calls.service'
import { AmdInput, classifyAmd } from './amd'

export async function persistAmdResult(
  context: { orgId: string; leadId: string; agentId: string; campaignId: string },
  input: AmdInput,
) {
  const owned = await validateVoiceResourceOwnership(context, { requireAll: true })
  if (!owned) throw new Error('INVALID_VOICE_CONTEXT')

  const result = classifyAmd(input)
  let call = null as Awaited<ReturnType<typeof prisma.call.findUnique>>

  // The external CallSid is added by the route as a non-public field. Keeping
  // the lookup below explicit avoids ever trusting arbitrary tenant IDs.
  const externalCallId = (input as AmdInput & { callSid?: string }).callSid?.trim()
  if (externalCallId) {
    call = await prisma.call.findUnique({
      where: { orgId_externalCallId: { orgId: context.orgId, externalCallId } },
    })
  }

  if (!call && ['VOICEMAIL', 'IVR', 'FAX_OR_NOISE', 'UNKNOWN'].includes(result.classification) && externalCallId) {
    try {
      call = await prisma.call.create({
        data: {
          orgId: context.orgId,
          externalCallId,
          leadId: context.leadId,
          agentId: context.agentId,
          campaignId: context.campaignId,
          status: 'no_answer',
          outcome: result.classification.toLowerCase(),
          contactClassification: result.classification,
          contactClassificationConfidence: result.confidence,
          amdResult: input as unknown as Prisma.InputJsonValue,
        },
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      call = await prisma.call.findUnique({ where: { orgId_externalCallId: { orgId: context.orgId, externalCallId } } })
    }
  } else if (call) {
    call = await prisma.call.update({
      where: { id: call.id },
      data: {
        contactClassification: result.classification,
        contactClassificationConfidence: result.confidence,
        amdResult: input as unknown as Prisma.InputJsonValue,
      },
    })
  }

  if (call) {
    const previous = await prisma.voiceCallEvent.findFirst({ where: { callId: call.id }, orderBy: { seq: 'desc' }, select: { seq: true } })
    await prisma.voiceCallEvent.create({
      data: {
        id: randomUUID(),
        orgId: context.orgId,
        callId: call.id,
        seq: (previous?.seq ?? -1) + 1,
        atMs: 0,
        type: 'amd.classified',
        role: 'system',
        payload: { ...result, raw: input },
        component: 'amd',
        provider: 'twilio',
      },
    }).catch(error => console.warn('[AMD] event persistence failed:', error))
  }

  return { result, callId: call?.id ?? null }
}
