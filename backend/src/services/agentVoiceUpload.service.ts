import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { createPrivateVoice, decodeVoiceAudio, findPrivateVoice, voiceUploadConfigured, VoiceUploadError } from './voiceUploadProvider'

const KIND = 'agent.voice.create'
type Input = { name: string; subjectName: string; audioBase64: string; confirmed: true }
const remoteTitle = (job: any) => `Vendrava ${job.id}`
const pending = (job: any) => ({ status: 'processing', requestId: job.id, name: job.input.name })

async function ownedAgent(orgId: string, agentId: string) {
  if (!await prisma.agent.findFirst({ where: { orgId, id: agentId }, select: { id: true } })) throw new VoiceUploadError('No se encontró este agente.', 404)
}

async function finish(job: any, model: any) {
  if (model.dmca_taken_down || ['failed', 'error'].includes(model.state)) {
    await prisma.job.updateMany({ where: { id: job.id, orgId: job.orgId, status: 'running' }, data: { status: 'failed', error: { message: 'No se pudo preparar esta voz. Prueba otra grabación.' } } })
    throw new VoiceUploadError('No se pudo preparar esta voz. Prueba otra grabación.', 422)
  }
  if (model.state !== 'trained') {
    await prisma.job.updateMany({ where: { id: job.id, orgId: job.orgId, status: 'running' }, data: { providerJobId: model._id } })
    return pending(job)
  }
  const voice = { id: model._id, name: job.input.name }
  // Claim completion and record consent together, including concurrent status checks.
  const consentRegistered = await prisma.$transaction(async tx => {
    const updated = await tx.job.updateMany({ where: { id: job.id, orgId: job.orgId, status: 'running' }, data: { status: 'succeeded', providerJobId: model._id, output: voice, finishedAt: new Date() } })
    if (updated.count) await tx.consentGrant.create({ data: {
      orgId: job.orgId, subjectName: job.input.subjectName, kind: 'voice',
      scope: { channels: ['voice'], purposes: ['voice_cloning', 'agent_calls'], voiceIds: [model._id], requestId: job.id },
      grantedAt: new Date(job.input.confirmedAt), createdById: job.createdById,
    } })
    return updated.count > 0
  })
  return { status: 'ready', requestId: job.id, voice: { ...voice, consentRegistered } }
}

async function reconcile(job: any) {
  if (job.status === 'succeeded') return { status: 'ready', requestId: job.id, voice: job.output }
  if (job.status === 'failed') throw new VoiceUploadError(job.error?.message || 'No se pudo crear esta voz.', 422)
  if (job.status !== 'running') throw new VoiceUploadError('Esta creación se ha cancelado.', 409)
  // An active upload gets time to return before consulting the provider.
  if (!job.providerJobId && Date.now() - new Date(job.startedAt).getTime() < 125_000) return pending(job)
  const model = await findPrivateVoice(remoteTitle(job), job.providerJobId)
  return model ? finish(job, model) : pending(job)
}

export async function getVoiceUpload(orgId: string, agentId: string, requestId: string) {
  await ownedAgent(orgId, agentId)
  const job = await prisma.job.findFirst({ where: { id: requestId, orgId, kind: KIND } })
  if (!job || (job.input as any)?.agentId !== agentId) throw new VoiceUploadError('No se encontró esta voz.', 404)
  return reconcile(job)
}

export async function listVoiceUploads(orgId: string, agentId: string) {
  await ownedAgent(orgId, agentId)
  const jobs = await prisma.job.findMany({ where: { orgId, kind: KIND, input: { path: ['agentId'], equals: agentId }, status: { in: ['running', 'succeeded'] } }, orderBy: { createdAt: 'desc' }, take: 30 })
  return jobs.map(job => job.status === 'succeeded' ? { status: 'ready', requestId: job.id, voice: job.output } : pending(job))
}

export async function uploadAgentVoice(orgId: string, agentId: string, userId: string, input: Input) {
  await ownedAgent(orgId, agentId)
  if (input.confirmed !== true || !input.subjectName.trim()) throw new VoiceUploadError('Confirma la autorización para crear y utilizar esta voz.', 400)
  const file = decodeVoiceAudio(input.audioBase64)
  voiceUploadConfigured()
  const idempotencyKey = createHash('sha256').update(agentId).update(file.audio).update(JSON.stringify([input.name, input.subjectName])).digest('hex')
  const where = { orgId_kind_idempotencyKey: { orgId, kind: KIND, idempotencyKey } }
  let job = await prisma.job.findUnique({ where })
  if (job?.status === 'failed') {
    if (job.providerJobId) return reconcile(job)
    const claim = await prisma.job.updateMany({ where: { id: job.id, orgId, status: 'failed' }, data: { status: 'running', startedAt: new Date() } })
    if (!claim.count) return reconcile((await prisma.job.findUnique({ where }))!)
  } else if (job) return reconcile(job)
  else {
    try {
      // No audio is persisted in JSON or logs. Only the private provider keeps it.
      // This synchronous flow has no worker lease and is never enqueued for retry.
      job = await prisma.job.create({ data: { orgId, kind: KIND, status: 'running', provider: 'fish-audio', createdById: userId, idempotencyKey, startedAt: new Date(), maxAttempts: 1,
        input: { agentId, name: input.name, subjectName: input.subjectName, confirmedAt: new Date().toISOString() },
      } })
    } catch (error) {
      if ((error as any)?.code !== 'P2002') throw error
      return reconcile((await prisma.job.findUnique({ where }))!)
    }
  }
  let model: any
  try { model = await createPrivateVoice(remoteTitle(job), file) }
  catch (error) {
    if (error instanceof VoiceUploadError && !error.uncertain) {
      await prisma.job.updateMany({ where: { id: job!.id, orgId, status: 'running' }, data: { status: 'failed', error: { message: error.message } } })
      throw error
    }
    return pending(job)
  }
  // Save the remote ID before finalization so a failed DB transaction is recoverable.
  await prisma.job.updateMany({ where: { id: job!.id, orgId, status: 'running' }, data: { providerJobId: model._id } })
  return finish(job, model)
}
