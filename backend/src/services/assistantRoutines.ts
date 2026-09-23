import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { hasPermission } from '../access-control'
import { workflowInputSchema, assertWorkflowActor, createAssistantRun, advanceAssistantRun, getAssistantRun, controlAssistantRun, type WorkflowInput, type WorkflowActor } from './assistantWorkflows'
export { workflowInputSchema }
export const ASSISTANT_ROUTINE_RULE = 'assistant-routine.schedule'
export type Actor = WorkflowActor
export const routineSchema = z.object({ name: z.string().trim().min(1).max(160), input: workflowInputSchema, intervalHours: z.union([z.literal(24), z.literal(168)]), startsAt: z.string().datetime({ offset: true }), maxRuns: z.number().int().min(1).max(100), requestId: z.string().uuid() }).strict()
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode })
const json = (value: any) => JSON.parse(JSON.stringify(value))
export function nextRoutineRun(slot: Date, intervalHours: number, now = new Date()) { const interval = intervalHours * 3600000; return new Date(slot.getTime() + Math.max(1, Math.floor((now.getTime() - slot.getTime()) / interval) + 1) * interval) }
export function routineSlotRequestId(id: string, slot: Date | string) { const h = createHash('sha256').update(`${id}:${slot instanceof Date ? slot.toISOString() : slot}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
export function newCandidateKeys(candidates: Array<{ sourceUrl?: string; id?: string }>, seen: string[]) { return [...new Set(candidates.map(c => c.sourceUrl || c.id).filter((key): key is string => !!key && !seen.includes(key)))] }
export function shouldNotifyRun(run: any) { return ['completed', 'failed', 'review'].includes(run.status) && !run.notificationSentAt }
async function member(actor: Actor) { const current = await assertWorkflowActor(actor); if (!hasPermission(current.role, 'costs.request', 'org') || !hasPermission(actor.role!, 'costs.request', 'org')) throw fail('No tienes permiso para programar consumo.', 403); return current }
function publicRoutine(row: any) { const value = row.payload; return { id: row.id, name: value.name, status: row.status.replace('assistant_', ''), nextRunAt: value.nextRunAt, intervalHours: value.intervalHours, lastRunId: value.lastRunId, lastError: value.lastError, maxRuns: value.maxRuns, runCount: value.runCount, input: value.input } }
async function owned(actor: Actor, id: string) { const row = await prisma.scheduledTrigger.findFirst({ where: { id, orgId: actor.orgId, ruleKey: ASSISTANT_ROUTINE_RULE, payload: { path: ['ownerId'], equals: actor.userId } } }); if (!row) throw fail('Rutina no encontrada.', 404); return row }
async function update(row: any, status: string, payload: any, dueAt = row.dueAt) {
  const result = await prisma.scheduledTrigger.updateMany({ where: { id: row.id, orgId: row.orgId, ruleKey: ASSISTANT_ROUTINE_RULE, status: row.status, dueAt: row.dueAt, payload: { equals: row.payload } }, data: { status, payload: json(payload), dueAt } })
  if (!result.count) throw fail('La rutina cambió en otra ejecución. Actualiza su estado.', 409)
  return { ...row, status, payload: json(payload), dueAt }
}
export async function listAssistantRoutines(actor: Actor) { await assertWorkflowActor(actor); return (await prisma.scheduledTrigger.findMany({ where: { orgId: actor.orgId, ruleKey: ASSISTANT_ROUTINE_RULE, payload: { path: ['ownerId'], equals: actor.userId } }, orderBy: { createdAt: 'desc' }, take: 100 })).map(publicRoutine) }
export async function createAssistantRoutine(actor: Actor, raw: z.infer<typeof routineSchema>) {
  actor = await member(actor); const input = routineSchema.parse(raw)
  if (new Date(input.startsAt) <= new Date()) throw fail('La primera ejecución debe estar en el futuro.', 400)
  if (input.input.source === 'web' && !input.input.allowExternalReview) throw fail('Autoriza las búsquedas externas para esta rutina.', 400)
  const payload = { ownerId: actor.userId, name: input.name, input: input.input, intervalHours: input.intervalHours, maxRuns: input.maxRuns, runCount: 0, nextRunAt: input.startsAt, requestId: input.requestId }
  const row = await prisma.scheduledTrigger.upsert({ where: { dedupeKey: `${ASSISTANT_ROUTINE_RULE}:${actor.orgId}:${actor.userId}:${input.requestId}` }, update: {}, create: { orgId: actor.orgId, ruleKey: ASSISTANT_ROUTINE_RULE, entityType: 'assistant_routine', entityId: input.requestId, dedupeKey: `${ASSISTANT_ROUTINE_RULE}:${actor.orgId}:${actor.userId}:${input.requestId}`, dueAt: new Date(input.startsAt), status: 'assistant_paused', payload } })
  return publicRoutine(row)
}
export async function setAssistantRoutineActive(actor: Actor, id: string, active: boolean) {
  actor = await member(actor); let row = await owned(actor, id); const value: any = row.payload
  if (active && value.runCount >= value.maxRuns && !value.currentRun) throw fail('Se ha alcanzado el límite de ejecuciones. Crea otra rutina para ampliarlo.', 409)
  if (value.currentRun && value.lastRunId) {
    const run = await getAssistantRun(actor, value.lastRunId)
    if (!active && ['running', 'waiting'].includes(run.status)) await controlAssistantRun(actor, run.id, { action: 'pause', revision: run.revision })
    if (active && run.status === 'paused') await controlAssistantRun(actor, run.id, { action: 'resume', revision: run.revision })
  }
  const next = new Date(value.nextRunAt) > new Date() ? new Date(value.nextRunAt) : nextRoutineRun(new Date(value.nextRunAt), value.intervalHours)
  row = await update(row, active ? value.currentRun ? 'assistant_running' : 'assistant_pending' : 'assistant_paused', { ...value, lastError: undefined, nextRunAt: next.toISOString() }, active && value.currentRun ? new Date() : next)
  return publicRoutine(row)
}
export async function runAssistantRoutine(actor: Actor, id: string, requestId: string) {
  actor = await member(actor); z.string().uuid().parse(requestId)
  const row = await owned(actor, id), value: any = row.payload
  if (value.lastManualRequestId === requestId && value.lastRunId) return { run: await getAssistantRun(actor, value.lastRunId) }
  if (value.currentRun) throw fail('La rutina tiene una ejecución pendiente. Continúa o cancela ese objetivo.', 409)
  return begin(row, actor, new Date(), requestId)
}
async function begin(row: any, actor: Actor, time: Date, manualId?: string) {
  const value: any = row.payload
  if (value.runCount >= value.maxRuns) throw fail('Se ha alcanzado el límite de ejecuciones.', 409)
  const slot = manualId || row.dueAt.toISOString(), runId = routineSlotRequestId(row.id, slot)
  const nextRunAt = manualId && new Date(value.nextRunAt) > time ? value.nextRunAt : nextRoutineRun(row.dueAt, value.intervalHours, time).toISOString()
  const claimed = await update(row, 'assistant_running', { ...value, runCount: value.runCount + 1, lastRunId: runId, currentRun: true, slot, ...(manualId ? { lastManualRequestId: manualId } : {}), returnPaused: row.status === 'assistant_paused', nextRunAt }, new Date(time.getTime() + 60_000))
  try {
    const run = await createAssistantRun(actor, { ...value.input, requestId: runId })
    return { run }
  } catch (error) {
    await finishError(claimed, (error as Error).message, runId)
    throw error
  }
}
async function notify(row: any, run: any) {
  const actor = { orgId: row.orgId, userId: row.payload.ownerId }
  const where = { orgId: actor.orgId, microappId: 'assistant-notification', scope: actor.userId }
  const history = await prisma.microappConfig.findMany({ where, take: 200, orderBy: { createdAt: 'desc' } })
  const keys = newCandidateKeys(run.candidates || [], history.flatMap(n => (n.values as any).canonicalKeys || []))
  if (run.status !== 'failed' && !keys.length) return
  const scopeId = `${row.id}:${run.id}`
  const value = { id: scopeId, title: run.status === 'failed' ? 'La rutina requiere atención' : 'Nuevas oportunidades para revisar', message: run.status === 'failed' ? String(run.error || 'La ejecución no pudo completarse.').slice(0, 500) : `${keys.length} nuevas fuentes de oportunidades. Revisa los candidatos antes de guardar cambios.`, runId: run.id, read: false, createdAt: new Date().toISOString(), canonicalKeys: keys }
  await prisma.microappConfig.upsert({ where: { orgId_microappId_scope_scopeId: { ...where, scopeId } }, update: {}, create: { ...where, scopeId, values: value } })
}
async function finishError(row: any, message: string, runId: string) {
  const value = { ...(row.payload as any), currentRun: false, lastError: message.slice(0, 500) }
  try { const saved = await update(row, 'assistant_error', value); await notify(saved, { id: runId, status: 'failed', error: value.lastError }) } catch (error) { if ((error as any).statusCode !== 409) throw error }
}
export async function listAssistantNotifications(actor: Actor) { await assertWorkflowActor(actor); return (await prisma.microappConfig.findMany({ where: { orgId: actor.orgId, microappId: 'assistant-notification', scope: actor.userId }, orderBy: { createdAt: 'desc' }, take: 100 })).map(row => row.values) }
export async function readAssistantNotification(actor: Actor, id: string) {
  await assertWorkflowActor(actor)
  const where = { orgId: actor.orgId, microappId: 'assistant-notification', scope: actor.userId, scopeId: id }
  const row = await prisma.microappConfig.findFirst({ where }); if (!row) throw fail('Aviso no encontrado.', 404)
  const values = { ...(row.values as any), read: true }; await prisma.microappConfig.updateMany({ where, data: { values } }); return values
}
export async function dispatchAssistantRoutines(time = new Date(), advance: typeof advanceAssistantRun = advanceAssistantRun) {
  const rows = await prisma.scheduledTrigger.findMany({ where: { ruleKey: ASSISTANT_ROUTINE_RULE, status: { in: ['assistant_pending', 'assistant_running'] }, dueAt: { lte: time } }, orderBy: { dueAt: 'asc' }, take: 20 })
  for (let row of rows) {
    const value: any = row.payload
    try {
      const membership = await prisma.organizationMembership.findUnique({ where: { orgId_userId: { orgId: row.orgId, userId: value.ownerId } }, select: { role: true, status: true } })
      const actor = await member({ orgId: row.orgId, userId: value.ownerId, role: membership?.status === 'active' ? membership.role : undefined, workspaceScope: 'org' })
      if (!value.currentRun) {
        if (value.runCount >= value.maxRuns) { await update(row, 'assistant_completed', value); continue }
        await begin(row, actor, time); continue
      }
      row = await update(row, 'assistant_running', value, new Date(time.getTime() + 60_000))
      // The run id is persisted before creation. Recovering a lease reuses the exact same request.
      const run = await getAssistantRun(actor, value.lastRunId).catch(error => {
        if (error?.statusCode !== 404) throw error
        return createAssistantRun(actor, { ...value.input, requestId: value.lastRunId })
      })
      const result = ['running', 'waiting'].includes(run.status) ? await advance(actor, run.id) : run
      if (['review', 'completed', 'failed', 'cancelled'].includes(result.status)) {
        await notify(row, result)
        const status = result.status === 'failed' ? 'assistant_error' : value.runCount >= value.maxRuns ? 'assistant_completed' : value.returnPaused ? 'assistant_paused' : 'assistant_pending'
        await update(row, status, { ...value, currentRun: false, lastError: result.error || undefined }, new Date(value.nextRunAt))
      } else if (result.status === 'paused') await update(row, 'assistant_paused', value)
    } catch (error) {
      if ((error as any).statusCode === 409 && /cambió/.test((error as Error).message)) continue
      await finishError(row, (error as Error).message, value.lastRunId || routineSlotRequestId(row.id, row.dueAt))
    }
  }
}
