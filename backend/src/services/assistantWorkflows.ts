import { randomUUID, createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { getAccessPrincipal, hasPermission, assertCapability } from '../access-control'
import { scopedOwnerId, type DataActor } from '../lib/dataScope'
import { getBusinessIntelligenceContext } from './businessIntelligence.service'
import { getRadarKnowledge } from './radarKnowledge.service'
import { radarQueries, radarSearchSchema, type RadarSearch } from './opportunityRadar'
import { startRadarSearch } from './radarSchedules.service'
import { runAssistantTool, executeAssistantAction } from './assistantTools'
import { assistantUndoAvailable } from './assistantUndo'

export const workflowInputSchema = z.object({
  objective: z.string().trim().min(3).max(600), target: z.string().trim().min(2).max(300), location: z.string().trim().min(2).max(200),
  kind: z.enum(['clients', 'properties', 'suppliers', 'influencers', 'partners']), source: z.enum(['saved', 'web']),
  maxResults: z.number().int().min(1).max(20), maxSearches: z.number().int().min(1).max(20), followUp: z.boolean(), allowExternalReview: z.boolean(), requestId: z.string().uuid(),
}).strict()
export type WorkflowInput = z.infer<typeof workflowInputSchema>
export type WorkflowActor = { orgId: string; userId: string; role?: string; workspaceScope?: string }
type Candidate = { id: string; name: string; company?: string; email?: string; phone?: string; kind: WorkflowInput['kind']; location?: string | null; sourceUrl: string; sourceTitle: string; sourceSnippet: string; rationale: string; duplicateLeadId?: string; duplicateReason?: string; duplicateAmbiguous?: boolean; selected: boolean; taskTitle?: string; dueAt?: string; [key: string]: any }
type Run = { id: string; status: string; objective: string; input: WorkflowInput; revision: number; steps: Array<{ id: string; label: string; status: string; detail?: string }>; context: any; candidates: Candidate[]; events: Array<{ at: string; message: string }>; error?: string; jobId?: string; actionIds?: string[]; createdAt: string; updatedAt: string; leaseUntil?: string; leaseToken?: string; [key: string]: any }
const APP = 'assistant-workflow'
const fail = (message: string, statusCode = 400, code?: string) => Object.assign(new Error(message), { statusCode, code })
const clean = (v: unknown, n = 1000) => typeof v === 'string' ? v.trim().slice(0, n) : undefined
const key = (actor: WorkflowActor, id?: string) => ({ orgId: actor.orgId, microappId: APP, scope: actor.userId, ...(id ? { scopeId: id } : {}) })
const now = () => new Date().toISOString()
function actorFrom(request: FastifyRequest): WorkflowActor { const actor = getAccessPrincipal(request); if (!actor) throw fail('No tienes acceso al asistente.', 403); return actor }
export async function assertWorkflowActor(actor: WorkflowActor, write = false) {
  if (!actor.role || !hasPermission(actor.role, 'organization.read', 'org') || (actor.workspaceScope && actor.workspaceScope !== 'org')) throw fail('Tu rol no permite consultar el contexto completo de empresa.', 403)
  const member = await prisma.organizationMembership.findUnique({ where: { orgId_userId: { orgId: actor.orgId, userId: actor.userId } }, select: { role: true, status: true } })
  if (!member || member.status !== 'active' || !hasPermission(member.role, 'organization.read', 'org') || !hasPermission(member.role, 'leads.read', 'own')) throw fail('Tu acceso al objetivo ha cambiado.', 403)
  if (write && (!hasPermission(member.role, 'leads.write', 'own') || !hasPermission(actor.role, 'leads.write', 'own'))) throw fail('No tienes permiso para guardar contactos.', 403)
  await assertCapability(actor.orgId, 'revenue_intelligence')
  await assertCapability(actor.orgId, 'crm')
  return { ...actor, role: member.role, workspaceScope: actor.workspaceScope || 'org' } as WorkflowActor & DataActor
}
function parseRow(row: any): Run { return { ...row.values, id: row.scopeId, createdAt: row.values.createdAt, updatedAt: row.values.updatedAt } }
async function rowFor(actor: WorkflowActor, id: string) {
  const row = await prisma.microappConfig.findFirst({ where: key(actor, id) })
  if (!row) throw fail('Ejecución no encontrada.', 404)
  return row
}
async function save(actor: WorkflowActor, run: Run, expected?: number) {
  const values = JSON.parse(JSON.stringify({ ...run, events: run.events.slice(-80), updatedAt: now() }))
  const result = await prisma.microappConfig.updateMany({ where: { ...key(actor, run.id), ...(expected === undefined ? {} : { values: { path: ['revision'], equals: expected } }) }, data: { values } })
  if (!result.count) throw fail('La ejecución ha cambiado. Actualiza antes de continuar.', 409, 'WORKFLOW_STALE_REVISION')
  return values as Run
}
function blankRun(id: string, input: WorkflowInput): Run {
  return { id, status: 'running', objective: input.objective, input, revision: 1, steps: [{ id: 'context', label: 'Contexto de empresa', status: 'pending' }, { id: 'research', label: 'Buscar oportunidades', status: 'pending' }, { id: 'dedupe', label: 'Comprobar duplicados', status: 'pending' }, { id: 'review', label: 'Revisión y guardado', status: 'pending' }], context: {}, candidates: [], events: [{ at: now(), message: 'Objetivo creado. Los cambios en el CRM requieren revisión.' }], createdAt: now(), updatedAt: now() }
}
const normalized = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function candidateFrom(raw: any, input: WorkflowInput, _i: number): Candidate | null {
  const name = clean(raw?.name, 160), sourceUrl = clean(raw?.sourceUrl, 1000)
  if (!name || !sourceUrl || raw.kind !== input.kind) return null
  try { const url = new URL(sourceUrl); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null } catch { return null }
  const id = createHash('sha256').update(`${input.kind}:${sourceUrl}:${normalized(name)}`).digest('hex').slice(0, 32)
  return { id, name, ...(clean(raw.company, 160) ? { company: clean(raw.company, 160) } : {}), ...(z.string().email().max(254).safeParse(raw.email).success ? { email: raw.email } : {}), ...(typeof raw.phone === 'string' && /^[0-9+()\-.\s]{3,40}$/.test(raw.phone) ? { phone: raw.phone } : {}), kind: input.kind, location: clean(raw.location, 200) || null, sourceUrl, sourceTitle: clean(raw.sourceTitle, 300) || '', sourceSnippet: clean(raw.sourceSnippet, 1200) || '', rationale: clean(raw.rationale, 900) || 'Candidato de una investigación guardada; valida el encaje.', selected: false, ...(input.followUp ? { taskTitle: `Validar oportunidad: ${name}`.slice(0, 200) } : {}) }
}
async function dedupe(actor: WorkflowActor, candidates: Candidate[]) {
  const scope = scopedOwnerId(actor as DataActor, 'leads.read')
  const output: Candidate[] = []
  for (const candidate of candidates) {
    const { duplicateLeadId: _, duplicateReason: __, duplicateAmbiguous: ___, ...c } = candidate
    const alternatives: any[] = [{ name: { equals: c.name, mode: 'insensitive' } }]
    if (c.email) alternatives.push({ email: { equals: c.email, mode: 'insensitive' } })
    if (c.phone) alternatives.push({ phone: c.phone })
    const hits = await prisma.lead.findMany({ where: { orgId: actor.orgId, ownerId: scope, OR: alternatives }, select: { id: true, name: true, company: true, email: true, phone: true }, take: 2 })
    output.push(hits.length === 1 ? { ...c, duplicateLeadId: hits[0].id, duplicateReason: 'Coincidencia de nombre o datos de contacto. Revisa antes de reutilizar el contacto.' } : hits.length > 1 ? { ...c, duplicateAmbiguous: true, duplicateReason: 'Hay varios contactos similares. Resuelve la coincidencia en el CRM antes de seleccionar este resultado.', selected: false } : c)
  }
  return output
}
async function savedCandidates(actor: WorkflowActor, input: WorkflowInput) {
  const rows = await prisma.microappRun.findMany({ where: { orgId: actor.orgId, microappId: 'business-opportunity-radar' }, orderBy: { createdAt: 'desc' }, take: 30, select: { result: true, input: true } })
  const stop = new Set(['empresas', 'negocios', 'para', 'con', 'del', 'las', 'los', 'que', 'una', 'unos', 'unas'])
  const terms = normalized(input.target).split(/\W+/).filter(t => t.length > 2 && !stop.has(t)).map(t => t.length > 4 ? t.replace(/s$/, '') : t)
  const out: Candidate[] = [], seen = new Set<string>()
  for (const row of rows) {
    const result: any = row.result, stored: any = result?.data || result, config: any = row.input
    for (const raw of Array.isArray(stored?.candidates) ? stored.candidates : []) {
      const evidence = normalized(`${raw.name} ${raw.sourceTitle} ${raw.sourceSnippet} ${config?.radar?.target || ''}`)
      if (terms.length && !terms.some(t => evidence.includes(t))) continue
      const locationEvidence = normalized(raw.location || `${raw.sourceTitle} ${raw.sourceSnippet} ${config?.radar?.location || ''}`)
      if (!locationEvidence.includes(normalized(input.location))) continue
      const candidate = candidateFrom(raw, input, out.length)
      if (candidate && !seen.has(candidate.id)) { seen.add(candidate.id); out.push(candidate) }
      if (out.length >= input.maxResults) return out
    }
  }
  return out
}
export async function createAssistantRun(actor: WorkflowActor, input: WorkflowInput) {
  actor = await assertWorkflowActor(actor)
  const parsed = workflowInputSchema.parse(input)
  if (parsed.source === 'web' && (!parsed.allowExternalReview || !hasPermission(actor.role!, 'costs.request', 'org'))) throw fail('Autoriza la búsqueda externa y comprueba los permisos de consumo antes de comenzar.', 403)
  const run = blankRun(parsed.requestId, parsed)
  const row = await prisma.microappConfig.upsert({ where: { orgId_microappId_scope_scopeId: key(actor, run.id) as any }, update: {}, create: { ...key(actor, run.id), scopeId: run.id, values: run as any } })
  if (!isDeepStrictEqual((row.values as any).input, parsed)) throw fail('Este identificador ya corresponde a otro objetivo. Inicia una nueva solicitud.', 409)
  return parseRow(row)
}
export async function getAssistantRun(actor: WorkflowActor, id: string) {
  await assertWorkflowActor(actor)
  const run = parseRow(await rowFor(actor, id))
  if (run.actionIds?.length) {
    const rows = await prisma.microappConfig.findMany({ where: { orgId: actor.orgId, microappId: 'platform-assistant', scope: actor.userId, id: { in: run.actionIds } } })
    run.actions = run.actionIds.flatMap(actionId => {
      const row = rows.find(item => item.id === actionId)
      return row ? [{ ...(run.actions || []).find((item: any) => item.id === actionId), ...(row.values as any), id: actionId, undoAvailable: assistantUndoAvailable(row.values), undoLabel: 'Deshacer creación de tarea (cancelar)' }] : []
    })
  }
  return run
}
export async function listAssistantRuns(actor: WorkflowActor) { await assertWorkflowActor(actor); return (await prisma.microappConfig.findMany({ where: key(actor), orderBy: { createdAt: 'desc' }, take: 50 })).map(parseRow) }
export async function advanceAssistantRun(actor: WorkflowActor, id: string) {
  actor = await assertWorkflowActor(actor)
  let run = parseRow(await rowFor(actor, id))
  if (!['running', 'waiting'].includes(run.status) || run.leaseUntil && Date.parse(run.leaseUntil) > Date.now()) return run
  const original = run.revision
  run = { ...run, revision: original + 1, leaseUntil: new Date(Date.now() + 90_000).toISOString(), leaseToken: randomUUID() }
  try { run = await save(actor, run, original) } catch (error) { if ((error as any).code === 'WORKFLOW_STALE_REVISION') return getAssistantRun(actor, id); throw error }
  const expected = run.revision
  const finish = async (message?: string) => save(actor, { ...run, leaseUntil: undefined, leaseToken: undefined, revision: expected + 1, ...(message ? { events: [...run.events, { at: now(), message }] } : {}) }, expected)
  try {
    if (run.steps[0].status !== 'completed') {
      const [context, knowledge] = await Promise.all([getBusinessIntelligenceContext(actor.orgId), getRadarKnowledge(actor.orgId)])
      if (!context) throw fail('Completa el perfil de empresa antes de investigar.', 409)
      if (run.input.kind === 'properties' && context.radarSetup.suggestedType !== 'real_estate') throw fail('La captación de inmuebles solo está disponible para un negocio inmobiliario.', 400)
      run.context = { companyName: context.company.name, summary: context.profile.description, idealCustomer: context.profile.idealCustomer, valueProposition: context.profile.valueProposition, businessType: context.radarSetup.suggestedType, services: [...context.profile.offers.filter(o => o.active), ...(knowledge.profile?.services || [])], documents: knowledge.sources.map(s => ({ id: s.id, name: s.name, preview: s.preview })), notes: knowledge.profile?.notes || '', capturedAt: now() }
      run.steps[0] = { ...run.steps[0], status: 'completed', detail: 'Perfil, servicios, tarifas y extractos de documentos.' }
      return await finish('Contexto de empresa consultado. Los precios son los declarados por tu empresa.')
    }
    if (run.steps[1].status === 'pending') {
      if (run.input.source === 'saved') {
        run.candidates = await savedCandidates(actor, run.input)
        run.steps[1] = { ...run.steps[1], status: 'completed', detail: `${run.candidates.length} candidatos en las 30 investigaciones guardadas más recientes. Filtro por segmento, tipo y mercado.` }
        return await finish('Resultados guardados consultados; no se han realizado búsquedas externas.')
      }
      if (!run.input.allowExternalReview || !hasPermission(actor.role!, 'costs.request', 'org')) throw fail('No tienes autorización para búsquedas externas.', 403)
      const [context, knowledge] = await Promise.all([getBusinessIntelligenceContext(actor.orgId), getRadarKnowledge(actor.orgId)])
      const search = radarSearchSchema.parse({ kind: run.input.kind, target: run.input.target, location: run.input.location, criteria: run.input.objective, businessType: context?.radarSetup.suggestedType, ...(knowledge.profile ? { companyKnowledge: knowledge.profile } : {}) })
      const queries = radarQueries(search)
      if (queries.length > run.input.maxSearches) throw fail(`Este objetivo requiere ${queries.length} búsquedas; el límite es ${run.input.maxSearches}.`, 400)
      const live = parseRow(await rowFor(actor, id)); if (live.revision !== expected || live.status !== 'running') return live
      const result = await startRadarSearch(actor.orgId, actor.userId, search, `assistant-workflow:${actor.userId}:${run.id}`)
      run.jobId = result.jobId; run.status = 'waiting'
      run.steps[1] = { ...run.steps[1], status: 'running', detail: `${queries.length} búsquedas como máximo; síntesis del radar sujeta al saldo de la organización.` }
      return await finish('Búsqueda enviada al radar. Puedes detener los siguientes pasos; una consulta enviada puede continuar en el proveedor.')
    }
    if (run.steps[1].status === 'running' && run.jobId) {
      const job = await prisma.job.findFirst({ where: { id: run.jobId, orgId: actor.orgId }, select: { status: true } })
      if (!job) throw fail('El trabajo de búsqueda ya no está disponible.', 404)
      if (!['succeeded', 'failed', 'canceled'].includes(job.status)) return await finish()
      if (job.status !== 'succeeded') throw fail('La búsqueda terminó con error o se canceló. Revisa el trabajo del radar.', 409)
      const record = await prisma.microappRun.findFirst({ where: { jobId: run.jobId, orgId: actor.orgId }, select: { result: true } })
      if (!record) throw fail('El radar no dejó resultados verificables.', 409)
      const data: any = record.result, candidates = data?.data?.candidates || data?.candidates || []
      run.candidates = candidates.map((value: any, i: number) => candidateFrom(value, run.input, i)).filter(Boolean).slice(0, run.input.maxResults)
      run.steps[1] = { ...run.steps[1], status: 'completed' }; run.status = 'running'
      return await finish('Resultados y fuentes del radar recuperados.')
    }
    run.candidates = await dedupe(actor, run.candidates)
    run.status = 'review'; run.steps[2] = { ...run.steps[2], status: 'completed' }; run.steps[3] = { ...run.steps[3], status: 'pending', detail: 'Selecciona y revisa los cambios antes de guardarlos.' }
    return await finish(run.candidates.length ? 'Resultados listos para revisar. Las coincidencias en el CRM se muestran junto a cada candidato.' : 'No hay resultados verificables para estos filtros. Puedes revisar el objetivo o consultar otras investigaciones.')
  } catch (error) {
    if ((error as any).code === 'WORKFLOW_STALE_REVISION') return getAssistantRun(actor, id)
    run.status = 'failed'; run.error = (error as any).statusCode ? (error as Error).message.slice(0, 500) : 'No se pudo completar este paso. Revisa el estado y la configuración antes de repetirlo.'
    try { return await finish(run.error) } catch (conflict) { if ((conflict as any).code === 'WORKFLOW_STALE_REVISION') return getAssistantRun(actor, id); throw conflict }
  }
}
export async function controlAssistantRun(actor: WorkflowActor, id: string, control: { action: 'pause' | 'resume' | 'cancel'; revision?: number; objective?: string; target?: string; location?: string }) {
  await assertWorkflowActor(actor)
  let run = parseRow(await rowFor(actor, id)); const expected = run.revision
  if (control.revision !== undefined && control.revision !== expected) throw fail('La ejecución ha cambiado. Actualiza antes de continuar.', 409)
  if (['applying', 'completed', 'cancelled', 'failed'].includes(run.status)) throw fail('Esta ejecución ya no admite cambios. Crea un nuevo objetivo.', 409)
  if (control.action === 'pause') {
    if (!['running', 'waiting'].includes(run.status)) throw fail('No hay una ejecución activa para pausar.', 409)
    run.status = 'paused'
  } else if (control.action === 'cancel') run.status = 'cancelled'
  else {
    if (run.status !== 'paused') throw fail('Primero pausa la ejecución.', 409)
    const changed = ['objective', 'target', 'location'].some(k => (control as any)[k] !== undefined && (control as any)[k] !== (run.input as any)[k])
    if (changed && (run.jobId || run.steps[1].status !== 'pending')) throw fail('La investigación ya comenzó. Crea otro objetivo para cambiar el alcance.', 409)
    run.input = workflowInputSchema.parse({ ...run.input, ...Object.fromEntries(Object.entries(control).filter(([k]) => ['objective', 'target', 'location'].includes(k))) })
    run.objective = run.input.objective; run.status = run.jobId ? 'waiting' : 'running'
  }
  run = { ...run, leaseUntil: undefined, leaseToken: undefined, revision: expected + 1, events: [...run.events, { at: now(), message: control.action === 'pause' ? 'Pasos siguientes pausados. Una búsqueda ya enviada puede seguir en el proveedor.' : control.action === 'cancel' ? 'Objetivo cancelado; no se aplicarán cambios al CRM.' : 'Objetivo reanudado.' }] }
  return save(actor, run, expected)
}

export const workflowReviewSchema = z.object({
  revision: z.number().int().positive(),
  items: z.array(z.object({ candidateId: z.string().min(1).max(128), selected: z.boolean(), name: z.string().trim().min(1).max(160), company: z.string().trim().max(160).optional(), email: z.union([z.literal(''), z.string().email().max(254)]).optional(), phone: z.string().trim().max(40).refine(v => !v || /^[0-9+()\-.\s]{3,40}$/.test(v)).optional(), taskTitle: z.string().trim().max(200).optional(), dueAt: z.union([z.literal(''), z.string().datetime({ offset: true })]).optional() }).strict()).max(20),
}).strict()
export async function reviewAssistantRun(actor: WorkflowActor, id: string, input: z.infer<typeof workflowReviewSchema>) {
  actor = await assertWorkflowActor(actor)
  const parsed = workflowReviewSchema.parse(input)
  let run = parseRow(await rowFor(actor, id))
  if (parsed.revision !== run.revision) throw fail('La revisión está desactualizada.', 409, 'WORKFLOW_STALE_REVISION')
  if (run.status !== 'review') throw fail('El objetivo todavía no admite revisión.', 409)
  if (new Set(parsed.items.map(item => item.candidateId)).size !== parsed.items.length || parsed.items.some(item => !run.candidates.some(c => c.id === item.candidateId))) throw fail('La selección contiene candidatos desconocidos o repetidos.', 400)
  const edits = new Map(parsed.items.map(item => [item.candidateId, item]))
  const candidates = run.candidates.map(candidate => {
    const edit = edits.get(candidate.id)
    if (!edit) return { ...candidate, selected: false }
    return { ...candidate, name: edit.name, selected: edit.selected, company: edit.company || undefined, email: edit.email || undefined, phone: edit.phone || undefined, taskTitle: edit.taskTitle || undefined, dueAt: edit.dueAt || undefined }
  })
  const checked = await dedupe(actor, candidates)
  if (checked.some(c => c.selected && run.input.followUp && !c.taskTitle)) throw fail('Indica el título del seguimiento para cada resultado seleccionado.', 400)
  run = { ...run, candidates: checked, reviewed: true, revision: run.revision + 1, events: [...run.events, { at: now(), message: 'Revisión guardada y coincidencias del CRM actualizadas. Comprueba la selección antes de aplicar.' }] }
  return save(actor, run, parsed.revision)
}
function actionRequestId(runId: string, candidateId: string, step: string) {
  const hex = createHash('sha256').update(`${runId}:${candidateId}:${step}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
export async function applyAssistantRun(app: FastifyInstance, request: FastifyRequest, actor: WorkflowActor, id: string, revision: number) {
  actor = await assertWorkflowActor(actor, true)
  let run = parseRow(await rowFor(actor, id))
  if (run.status === 'completed' || run.status === 'failed' && run.actionIds?.length) return { run, actions: run.actions || [], partial: run.status !== 'completed' }
  if (run.status === 'applying') throw fail('Este guardado está en curso o pendiente de comprobar. Consulta las acciones; no vuelvas a crear los registros.', 409)
  if (run.status !== 'review' || !run.reviewed || run.revision !== revision) throw fail('Guarda y revisa la versión actual antes de aplicar los cambios.', 409)
  const selected = run.candidates.filter(c => c.selected)
  if (!selected.length) throw fail('Selecciona al menos un candidato.', 400)
  if (selected.some(c => c.duplicateAmbiguous)) throw fail('Resuelve los contactos ambiguos antes de guardar.', 409)
  if (run.input.followUp && !hasPermission(actor.role!, 'tasks.write', 'own')) throw fail('No tienes permiso para crear seguimientos.', 403)
  const checked = await dedupe(actor, selected)
  if (checked.some((c, i) => c.duplicateLeadId !== selected[i].duplicateLeadId || c.duplicateAmbiguous)) throw fail('Hay nuevas coincidencias en el CRM. Guarda la revisión para comprobarlas antes de aplicar.', 409)
  run = await save(actor, { ...run, status: 'applying', revision: revision + 1, actions: [], actionIds: [], events: [...run.events, { at: now(), message: 'Guardando los cambios seleccionados.' }] }, revision)
  const checkpoint = async () => { run = await save(actor, { ...run, revision: run.revision + 1 }, run.revision) }
  const execute = async (candidate: Candidate, name: string, args: Record<string, unknown>) => {
    const prepared: any = await runAssistantTool(app, request, { name, args, requestId: actionRequestId(run.id, candidate.id, name) })
    if (!prepared.action?.id) throw fail('No se pudo preparar la acción.', 503)
    run.actionIds = [...(run.actionIds || []), prepared.action.id]
    await checkpoint()
    const completed: any = await executeAssistantAction(app, request, prepared.action.id)
    run.actions = [...(run.actions || []), completed]
    await checkpoint()
    if (completed.status !== 'completed') throw fail(completed.error || 'Una acción no pudo confirmarse. Revisa las acciones antes de continuar.', 409)
    return completed
  }
  try {
    for (const candidate of selected) {
      let leadId = candidate.duplicateLeadId
      if (!leadId) {
        const action = await execute(candidate, 'create_contact', { name: candidate.name, ...(candidate.company ? { company: candidate.company } : {}), ...(candidate.email ? { email: candidate.email } : {}), ...(candidate.phone ? { phone: candidate.phone } : {}) })
        leadId = action.result?.id || action.result?.lead?.id
        if (!leadId) throw fail('Se creó el contacto, pero no se pudo recuperar su identificador. Comprueba el CRM.', 409)
      }
      if (run.input.followUp) await execute(candidate, 'create_task', { title: candidate.taskTitle!, leadId, ...(candidate.dueAt ? { dueAt: candidate.dueAt } : {}), description: `Objetivo: ${run.objective}\nFuente: ${candidate.sourceTitle} — ${candidate.sourceUrl}\nEncaje por validar: ${candidate.rationale}`.slice(0, 2000) })
    }
    run.status = 'completed'; run.steps = run.steps.map(s => ({ ...s, status: 'completed' })); run.events.push({ at: now(), message: `${run.actions.length} acciones guardadas. Los contactos coincidentes se han reutilizado.` })
    await checkpoint()
    return { run, actions: run.actions }
  } catch (error) {
    run.status = 'failed'; run.error = (error as any).statusCode ? (error as Error).message : 'El guardado quedó incompleto. Comprueba las acciones antes de repetirlo.'
    run.events.push({ at: now(), message: run.error! })
    await checkpoint()
    return { run, actions: run.actions || [], partial: true, error: run.error }
  }
}
export { actorFrom }
