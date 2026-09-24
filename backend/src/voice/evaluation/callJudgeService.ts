import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { scoreCall } from './callJudge'

export async function evaluateVoiceCall(orgId: string, callId: string) {
  const call = await prisma.call.findFirst({ where: { id: callId, orgId }, select: { id: true, outcome: true, transcript: true, transcriptTurns: true } })
  if (!call) return null
  const events = await prisma.voiceCallEvent.findMany({ where: { callId, orgId }, orderBy: { seq: 'asc' }, select: { type: true, atMs: true, role: true, payload: true } })

  const result = scoreCall(
    events.map(event => ({ type: event.type, atMs: event.atMs, role: event.role ?? undefined, payload: event.payload as Record<string, unknown> })),
    { outcome: call.outcome, transcript: call.transcript, transcriptTurns: call.transcriptTurns },
  )
  return prisma.voiceCallEvaluation.upsert({
    where: { callId },
    create: {
      id: randomUUID(),
      orgId,
      callId,
      status: 'completed',
      overall: result.overall,
      rubricVersion: process.env.VOICE_JUDGE_RUBRIC_VERSION?.trim() || '1',
      judgeProvider: 'heuristic',
      judgeModel: 'voice-rubric-v1',
      dimensions: result.dimensions as unknown as Prisma.InputJsonValue,
      criticalErrors: result.criticalErrors as unknown as Prisma.InputJsonValue,
      evidence: result.evidence as unknown as Prisma.InputJsonValue,
      trainingTag: result.trainingTag,
    },
    update: {
      status: 'completed',
      overall: result.overall,
      dimensions: result.dimensions as unknown as Prisma.InputJsonValue,
      criticalErrors: result.criticalErrors as unknown as Prisma.InputJsonValue,
      evidence: result.evidence as unknown as Prisma.InputJsonValue,
      trainingTag: result.trainingTag,
      errorMessage: null,
    },
  })
}
