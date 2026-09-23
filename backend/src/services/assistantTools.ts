import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { getAccessPrincipal } from '../access-control'
import { hasPermission } from '../access-control/permissions'
import type { Permission, PermissionScope } from '../access-control/catalog'
import { assistantUndoAvailable } from './assistantUndo'

const str = (max: number) => z.string().trim().min(1).max(max)
const id = str(128).regex(/^[a-zA-Z0-9_-]+$/)
const statuses = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const
type Field = { label: string; type?: string; required?: boolean; options?: readonly string[] }
type Tool = { label: string; description: string; permission: Permission; scope: PermissionScope; write?: boolean; screen?: boolean; schema: z.ZodTypeAny; fields: Record<string, Field>; method: 'GET' | 'POST' | 'PUT'; url: (args: any, userId: string) => string; payload?: (args: any, userId: string) => unknown; link: string }
const query = (base: string, values: Record<string, unknown>) => `${base}?${new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined).map(([key, value]): [string, string] => [key, String(value)]))}`
export const assistantTools: Record<string, Tool> = {
  prepare_workflow: { label: 'Preparar un objetivo completo', description: 'Prepara en el panel Objetivos un flujo de radar, revisión de duplicados, CRM y seguimiento. Usa esta herramienta para una petición de varios pasos relacionada con encontrar oportunidades. No ejecuta búsquedas ni cambios: el usuario revisa el objetivo, las fuentes y los límites en el panel.', permission: 'organization.read', scope: 'org', schema: z.object({ objective: str(1000), target: str(300).optional(), location: str(200).optional(), kind: z.enum(['clients', 'properties', 'suppliers', 'influencers', 'partners']).optional() }).strict(), fields: { objective: { label: 'Objetivo', type: 'textarea', required: true }, target: { label: 'A quién quieres encontrar' }, location: { label: 'Mercado' }, kind: { label: 'Tipo de oportunidad', options: ['clients', 'properties', 'suppliers', 'influencers', 'partners'] } }, method: 'GET', url: () => '', link: '/inteligencia' },
  open_section: { label: 'Abrir sección', description: 'Abre una sección de la aplicación en la pantalla del usuario. La interfaz confirma el resultado. No modifica datos.', permission: 'dashboard.read', scope: 'own', screen: true, schema: z.object({ section: z.enum(['dashboard', 'crm', 'calendar', 'intelligence', 'calls', 'agents', 'resources', 'plan', 'insights']) }).strict(), fields: { section: { label: 'Sección', required: true, options: ['dashboard', 'crm', 'calendar', 'intelligence', 'calls', 'agents', 'resources', 'plan', 'insights'] } }, method: 'GET', url: () => '', link: '/dashboard' },
  show_crm: { label: 'Filtrar el CRM en pantalla', description: 'Abre el CRM y aplica los filtros visibles de contactos: búsqueda por nombre, empresa, email o teléfono y estado. Omite filtros para limpiarlos.', permission: 'leads.read', scope: 'own', screen: true, schema: z.object({ search: str(200).optional(), status: z.enum(statuses).optional() }).strict(), fields: { search: { label: 'Buscar contacto' }, status: { label: 'Estado', options: statuses } }, method: 'GET', url: () => '', link: '/ventas' },
  open_contact: { label: 'Seleccionar contacto en pantalla', description: 'Abre el CRM y selecciona un contacto real, con su ficha lateral. Usa un ID consultado o el del contacto seleccionado en el contexto de pantalla.', permission: 'leads.read', scope: 'own', screen: true, schema: z.object({ leadId: id }).strict(), fields: { leadId: { label: 'Contacto', type: 'contact', required: true } }, method: 'GET', url: a => `/api/leads/${a.leadId}`, link: '/ventas' },
  fill_contact_form: { label: 'Rellenar formulario de contacto', description: 'Abre el formulario real de Nuevo contacto en el CRM y rellena solo los datos facilitados. No guarda ni llama; el usuario puede revisar y guardar en la pantalla.', permission: 'leads.write', scope: 'own', screen: true, schema: z.object({ name: str(160).optional(), email: str(254).email().optional(), phone: str(40).optional(), company: str(160).optional() }).strict(), fields: { name: { label: 'Nombre' }, email: { label: 'Email', type: 'email' }, phone: { label: 'Teléfono' }, company: { label: 'Empresa' } }, method: 'GET', url: () => '', link: '/ventas' },
  show_calendar: { label: 'Filtrar calendario en pantalla', description: 'Abre el calendario en vista agenda y aplica búsqueda, tipo y estado. No modifica reuniones ni tareas.', permission: 'tasks.read', scope: 'own', screen: true, schema: z.object({ search: str(200).optional(), type: z.enum(['all', 'meeting', 'task']).optional(), status: z.enum(['all', 'pending', 'completed', 'cancelled']).optional() }).strict(), fields: { search: { label: 'Buscar en calendario' }, type: { label: 'Tipo', options: ['all', 'meeting', 'task'] }, status: { label: 'Estado', options: ['all', 'pending', 'completed', 'cancelled'] } }, method: 'GET', url: () => '', link: '/calendario' },
  open_radar: { label: 'Abrir configuración del radar', description: 'Abre el asistente real de configuración de Inteligencia. Puede rellenar nombre y mercado del borrador. No lanza ni programa búsquedas.', permission: 'organization.read', scope: 'org', screen: true, schema: z.object({ name: str(100).optional(), location: str(200).optional() }).strict(), fields: { name: { label: 'Nombre del radar' }, location: { label: 'Mercado' } }, method: 'GET', url: () => '', link: '/inteligencia' },
  find_contacts: { label: 'Buscar contactos', description: 'Busca contactos reales en el CRM. Devuelve hasta 10 registros y sus identificadores; no inventes IDs.', permission: 'leads.read', scope: 'own', schema: z.object({ search: str(200).optional(), status: z.enum(statuses).optional() }).strict(), fields: { search: { label: 'Nombre, empresa, email o teléfono' }, status: { label: 'Estado', options: statuses } }, method: 'GET', url: a => query('/api/leads/', { ...a, limit: 10 }), link: '/ventas' },
  list_tasks: { label: 'Consultar mis tareas', description: 'Consulta las tareas asignadas al usuario actual. Hasta 10 resultados.', permission: 'tasks.read', scope: 'own', schema: z.object({ status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional() }).strict(), fields: { status: { label: 'Estado', options: ['open', 'in_progress', 'completed', 'cancelled'] } }, method: 'GET', url: (a, userId) => query('/api/tasks/', { status: a.status || 'open', ownerId: userId, limit: 10 }), link: '/calendario' },
  company_context: { label: 'Consultar mi empresa', description: 'Consulta el perfil real de la empresa, su actividad, oferta y cliente ideal.', permission: 'organization.read', scope: 'org', schema: z.object({}).strict(), fields: {}, method: 'GET', url: () => '/api/revenue-intelligence/business-context', link: '/inteligencia' },
  company_documents: { label: 'Consultar tarifas y documentos', description: 'Lee los servicios, precios y extractos de documentos guardados en el radar. Los extractos son parciales y no representan el documento completo.', permission: 'organization.read', scope: 'org', schema: z.object({}).strict(), fields: {}, method: 'GET', url: () => '/api/revenue-intelligence/radar-knowledge', link: '/inteligencia' },
  create_contact: { label: 'Crear contacto', description: 'Prepara el alta de un contacto. Solo se guarda cuando el usuario pulsa Ejecutar. No inventes datos de contacto.', permission: 'leads.write', scope: 'own', write: true, schema: z.object({ name: str(160), email: str(254).email().optional(), phone: str(40).regex(/^[0-9+()\-.\s]{3,40}$/).optional(), company: str(160).optional() }).strict(), fields: { name: { label: 'Nombre', required: true }, email: { label: 'Email', type: 'email' }, phone: { label: 'Teléfono' }, company: { label: 'Empresa' } }, method: 'POST', url: () => '/api/leads/', payload: a => ({ ...a, source: 'platform-assistant' }), link: '/ventas' },
  create_task: { label: 'Crear tarea', description: 'Prepara una tarea asignada al usuario actual. Consulta contactos antes de enlazar leadId. dueAt es ISO con zona horaria; pregunta si la fecha es ambigua. Se ejecuta desde la ficha.', permission: 'tasks.write', scope: 'own', write: true, schema: z.object({ title: str(200), description: str(2000).optional(), dueAt: str(100).datetime({ offset: true }).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(), leadId: id.optional() }).strict(), fields: { title: { label: 'Título', required: true }, description: { label: 'Descripción', type: 'textarea' }, dueAt: { label: 'Fecha y hora', type: 'datetime-local' }, priority: { label: 'Prioridad', options: ['low', 'normal', 'high', 'urgent'] }, leadId: { label: 'Contacto (opcional)', type: 'contact' } }, method: 'POST', url: () => '/api/tasks/', payload: (a, userId) => ({ ...a, ownerId: userId, source: 'platform-assistant' }), link: '/calendario' },
  update_contact_status: { label: 'Cambiar estado del contacto', description: 'Prepara un cambio de estado. Busca antes el contacto y usa su ID real. La ficha identifica el registro antes de ejecutar.', permission: 'leads.write', scope: 'own', write: true, schema: z.object({ leadId: id, status: z.enum(statuses) }).strict(), fields: { leadId: { label: 'Contacto', type: 'contact', required: true }, status: { label: 'Nuevo estado', required: true, options: statuses } }, method: 'PUT', url: a => `/api/leads/${a.leadId}`, payload: a => ({ status: a.status }), link: '/ventas' },
  add_contact_note: { label: 'Añadir nota al contacto', description: 'Prepara una nota interna para un contacto identificado. No envía mensajes al contacto.', permission: 'leads.write', scope: 'org', write: true, schema: z.object({ leadId: id, text: str(4000) }).strict(), fields: { leadId: { label: 'Contacto', type: 'contact', required: true }, text: { label: 'Nota', type: 'textarea', required: true } }, method: 'POST', url: a => `/api/leads/${a.leadId}/notes`, payload: a => ({ text: a.text }), link: '/ventas' },
  complete_task: { label: 'Completar tarea', description: 'Prepara marcar como completada una tarea; consulta antes las tareas para usar su ID real.', permission: 'tasks.write', scope: 'own', write: true, schema: z.object({ taskId: id }).strict(), fields: { taskId: { label: 'Tarea', type: 'task', required: true } }, method: 'POST', url: a => `/api/tasks/${a.taskId}/complete`, link: '/calendario' },
}
export const assistantToolRequest = z.object({ name: str(80), args: z.record(z.unknown()).default({}), requestId: z.string().uuid() }).strict()
const failure = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode })
function principal(request: FastifyRequest) {
  const actor = getAccessPrincipal(request)
  if (!actor) throw failure('No tienes acceso al asistente.', 403)
  return actor
}
function allowed(request: FastifyRequest, tool: Tool) {
  const actor = principal(request)
  return hasPermission(actor.role, tool.permission, tool.scope) && (tool.scope !== 'org' || actor.workspaceScope === 'org')
}
export function assistantCatalog(request: FastifyRequest) {
  return Object.entries(assistantTools).filter(([, tool]) => allowed(request, tool)).map(([name, tool]) => ({ name, label: tool.label, description: tool.description, write: !!tool.write, screen: !!tool.screen, fields: tool.fields }))
}
export function modelTools(request: FastifyRequest) {
  return assistantCatalog(request).map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: { type: 'object', properties: Object.fromEntries(Object.entries(tool.fields).map(([key, field]) => [key, { type: 'string', description: field.label, ...(field.options ? { enum: field.options } : {}) }])), required: Object.entries(tool.fields).filter(([, field]) => field.required).map(([key]) => key), additionalProperties: false } } }))
}
export async function delegateAssistantApi(app: FastifyInstance, request: FastifyRequest, method: Tool['method'], url: string, payload?: unknown) {
  // Only code-owned routes reach this function; never accept URLs or headers from the model.
  const headers: Record<string, string> = { 'x-workspace-id': principal(request).orgId }
  for (const key of ['authorization', 'cookie', 'x-api-key']) {
    const value = request.headers[key]; if (typeof value === 'string') headers[key] = value
  }
  const response = await app.inject({ method, url, headers, ...(payload ? { payload: payload as any } : {}) })
  let data: any
  try { data = response.json() } catch { throw failure('La operación no devolvió una respuesta válida.', 502) }
  if (response.statusCode >= 400) throw failure(typeof data.error === 'string' ? data.error : 'La operación no está disponible con tus permisos o tu plan.', response.statusCode)
  return data
}
function compact(data: any, depth = 0): any {
  if (depth > 5) return undefined
  if (typeof data === 'string') return data.slice(0, 2000)
  if (Array.isArray(data)) return data.slice(0, 10).map(value => compact(value, depth + 1))
  if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).filter(([key]) => !/token|secret|password|credential|apiKey/i.test(key)).slice(0, 35).map(([key, value]) => [key, compact(value, depth + 1)]))
  return data
}
const APP = 'platform-assistant'
type ActionData = { name: string; args: Record<string, unknown>; status: string; label: string; target?: string; createdBy: string; expiresAt: string; result?: unknown; error?: string }
function publicAction(row: { id: string; values: unknown }) {
  const data = row.values as ActionData
  return { id: row.id, ...data, undoAvailable: assistantUndoAvailable(data), undoLabel: 'Deshacer creación de tarea (cancelar)', status: data.status === 'pending' && Date.parse(data.expiresAt) < Date.now() ? 'expired' : data.status, link: assistantTools[data.name]?.link, fields: assistantTools[data.name]?.fields }
}
export async function runAssistantTool(app: FastifyInstance, request: FastifyRequest, input: z.infer<typeof assistantToolRequest>) {
  const tool = assistantTools[input.name]
  if (!tool || !allowed(request, tool)) throw failure('Acción no permitida.', 403)
  const parsed = tool.schema.safeParse(input.args)
  if (!parsed.success) throw failure(`Revisa los datos: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  const actor = principal(request), args = parsed.data
  if (input.name === 'prepare_workflow') return { kind: 'workflow', workflowDraft: args }
  if (tool.screen) {
    if (input.name === 'open_section') {
      const permissions: Record<string, Permission> = { dashboard: 'dashboard.read', crm: 'leads.read', calendar: 'meetings.read', intelligence: 'organization.read', calls: 'calls.read', agents: 'agents.read', resources: 'knowledge.read', plan: 'dashboard.read', insights: 'dashboard.read' }
      if (!hasPermission(actor.role, permissions[args.section], 'own')) throw failure('No tienes acceso a esa sección.', 403)
    }
    if (input.name === 'open_contact') await delegateAssistantApi(app, request, 'GET', tool.url(args, actor.userId))
    return { kind: 'screen', command: { name: input.name, args, label: tool.label }, pendingBrowser: true }
  }
  if (!tool.write) {
    let data = await delegateAssistantApi(app, request, tool.method, tool.url(args, actor.userId))
    if (input.name === 'company_context') data = { company: data.company, profile: data.profile }
    return { kind: 'result', label: tool.label, data: compact(data), link: tool.link, limited: true }
  }
  let target: string | undefined
  if (args.leadId || args.taskId) {
    const entity = await delegateAssistantApi(app, request, 'GET', args.leadId ? `/api/leads/${args.leadId}` : `/api/tasks/${args.taskId}`)
    target = entity.name || entity.title || entity.lead?.name
  }
  const key = createHash('sha256').update(JSON.stringify([input.requestId, input.name, args])).digest('hex')
  const values: ActionData = { name: input.name, args, status: 'pending', label: tool.label, target, createdBy: actor.userId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
  const cleanValues = JSON.parse(JSON.stringify(values))
  const row = await prisma.microappConfig.upsert({ where: { orgId_microappId_scope_scopeId: { orgId: actor.orgId, microappId: APP, scope: actor.userId, scopeId: key } }, update: {}, create: { orgId: actor.orgId, microappId: APP, scope: actor.userId, scopeId: key, values: cleanValues } })
  return { kind: 'action', action: publicAction(row) }
}
export async function getAssistantActions(request: FastifyRequest, actionId?: string) {
  const actor = principal(request)
  return (await prisma.microappConfig.findMany({ where: { orgId: actor.orgId, microappId: APP, scope: actor.userId, ...(actionId ? { id: actionId } : {}) }, orderBy: { createdAt: 'desc' }, take: 15 })).filter(row => { const tool = assistantTools[(row.values as unknown as ActionData).name]; return tool && allowed(request, tool) }).map(publicAction)
}
export async function executeAssistantAction(app: FastifyInstance, request: FastifyRequest, actionId: string, cancel = false) {
  const actor = principal(request)
  const where = { id: actionId, orgId: actor.orgId, microappId: APP, scope: actor.userId }
  const row = await prisma.microappConfig.findFirst({ where })
  if (!row) throw failure('Acción no encontrada.', 404)
  const values = row.values as unknown as ActionData
  const tool = assistantTools[values.name]
  if (!tool?.write || !allowed(request, tool)) throw failure('Ya no tienes permiso para esta acción.', 403)
  if (values.status !== 'pending') return publicAction(row)
  if (Date.parse(values.expiresAt) < Date.now()) throw failure('La propuesta ha caducado. Prepara una nueva con datos actualizados.', 409)
  const args = tool.schema.parse(values.args)
  const claimed = await prisma.microappConfig.updateMany({ where: { ...where, values: { path: ['status'], equals: 'pending' } }, data: { values: { ...values, status: cancel ? 'cancelled' : 'running' } as any } })
  if (!claimed.count) return (await getAssistantActions(request, actionId))[0]
  if (cancel) return publicAction({ id: actionId, values: { ...values, status: 'cancelled' } })
  let final: ActionData
  try {
    const result = await delegateAssistantApi(app, request, tool.method, tool.url(args, actor.userId), tool.payload?.(args, actor.userId))
    final = { ...values, status: 'completed', result: compact(result) }
  } catch (error) {
    const status = (error as any).statusCode
    // An uncertain write is never retried automatically: it may already exist in the CRM.
    final = { ...values, status: status && status < 500 ? 'failed' : 'uncertain', error: status && status < 500 ? (error as Error).message : 'No se pudo confirmar el resultado. Revisa el registro en la aplicación antes de repetir la operación.' }
  }
  const saved = await prisma.microappConfig.updateMany({ where, data: { values: JSON.parse(JSON.stringify(final)) } })
  if (!saved.count) throw failure('No se pudo registrar el resultado. Compruébalo en la aplicación.', 503)
  return publicAction({ id: actionId, values: final })
}
