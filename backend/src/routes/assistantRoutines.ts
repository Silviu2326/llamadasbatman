import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate'
import { assistantSchedulerEnabled } from '../jobs/assistantScheduler'
import { getAccessPrincipal } from '../access-control'
import { routineSchema, listAssistantRoutines, createAssistantRoutine, setAssistantRoutineActive, runAssistantRoutine, listAssistantNotifications, readAssistantNotification } from '../services/assistantRoutines'
const actor = (request: any) => { const value = getAccessPrincipal(request); if (!value) throw Object.assign(new Error('No autorizado.'), { statusCode: 403 }); return value }
const handle = (fn: (request: any) => Promise<unknown>) => async (request: any, reply: any) => { try { return await fn(request) } catch (e) { const error = e as any; return reply.status(error instanceof z.ZodError ? 400 : error.statusCode || 503).send({ error: error instanceof z.ZodError ? 'Revisa los datos de la rutina.' : error.statusCode ? error.message : 'No se pudo completar la operación.' }) } }
const id = (request: any) => z.string().min(1).max(180).regex(/^[a-zA-Z0-9_:-]+$/).parse(request.params.id)
export async function assistantRoutinesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.get('/routines', handle(async request => ({ routines: await listAssistantRoutines(actor(request)), workerEnabled: assistantSchedulerEnabled() })))
  app.post('/routines', handle(request => createAssistantRoutine(actor(request), routineSchema.parse(request.body))))
  app.patch('/routines/:id', handle(request => setAssistantRoutineActive(actor(request), id(request), z.object({ active: z.boolean() }).strict().parse(request.body).active)))
  app.post('/routines/:id/run', handle(request => runAssistantRoutine(actor(request), id(request), z.object({ requestId: z.string().uuid() }).strict().parse(request.body).requestId)))
  app.get('/notifications', handle(async request => ({ notifications: await listAssistantNotifications(actor(request)) })))
  app.post('/notifications/:id/read', handle(request => readAssistantNotification(actor(request), id(request))))
}
