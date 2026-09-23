import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate'
import { assistantCatalog, assistantToolRequest, runAssistantTool, executeAssistantAction, getAssistantActions } from '../services/assistantTools'
import { runAssistantAgent } from '../services/assistantAgent'
import { undoAssistantAction } from '../services/assistantUndo'

export const assistantRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }).strict()).min(1).max(12),
  page: z.string().max(160).optional(), locale: z.enum(['es', 'en']).default('es'),
  timeZone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }).optional(),
  requestId: z.string().uuid().default(() => randomUUID()),
  screenContext: z.object({ route: z.string().max(300), selected: z.object({ type: z.enum(['lead', 'task', 'account', 'opportunity']), id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), label: z.string().max(200).optional() }).strict().optional(), filters: z.record(z.string().max(200)).refine(value => Object.keys(value).length <= 8).optional() }).strict().optional(),
}).strict().refine(body => body.messages.at(-1)?.role === 'user', { message: 'The last message must be from the user' })

export async function platformAssistantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const handle = (schema: z.ZodTypeAny, fn: (request: any, input: any) => Promise<unknown>) => async (request: any, reply: any) => {
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Revisa los datos de la solicitud.', code: 'ASSISTANT_INVALID_INPUT' })
    try { return await fn(request, parsed.data) }
    catch (error) { const e = error as any; return reply.status(e.statusCode || 503).send({ error: e.statusCode ? e.message : 'No se pudo completar la operación. Revisa Acciones antes de repetirla.', code: e.code || 'ASSISTANT_OPERATION_FAILED' }) }
  }
  app.get('/capabilities', async request => ({ tools: assistantCatalog(request) }))
  app.get('/actions', async request => ({ actions: await getAssistantActions(request) }))
  app.post('/chat', { bodyLimit: 40_000, config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, handle(assistantRequestSchema, (request, input) => runAssistantAgent(app, request, input)))
  app.post('/tools', { bodyLimit: 20_000, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, handle(assistantToolRequest, (request, input) => runAssistantTool(app, request, input)))
  app.post('/actions/execute', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, handle(z.object({ id: z.string().min(1).max(128), cancel: z.boolean().optional() }).strict(), (request, input) => executeAssistantAction(app, request, input.id, input.cancel)))
  app.post<{ Params: { id: string } }>('/actions/:id/undo', handle(z.object({}).strict(), request => undoAssistantAction(request, request.params.id)))
}
