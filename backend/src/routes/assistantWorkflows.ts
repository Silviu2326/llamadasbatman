import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/authenticate'
import { actorFrom, applyAssistantRun, advanceAssistantRun, controlAssistantRun, createAssistantRun, getAssistantRun, listAssistantRuns, reviewAssistantRun, workflowInputSchema, workflowReviewSchema } from '../services/assistantWorkflows'

const idSchema = z.object({ id: z.string().uuid() }).strict()
const controlSchema = z.object({ action: z.enum(['pause', 'resume', 'cancel']), revision: z.number().int().positive().optional(), objective: z.string().trim().min(3).max(600).optional(), target: z.string().trim().min(2).max(300).optional(), location: z.string().trim().min(2).max(200).optional() }).strict()
const reviewSchema = workflowReviewSchema
const fail = (reply: any, error: any) => reply.status(error instanceof z.ZodError ? 400 : error?.statusCode || 503).send({ error: error instanceof z.ZodError ? 'Revisa los datos de la solicitud.' : error?.statusCode ? error.message : 'No se pudo completar la operación.', code: error instanceof z.ZodError ? 'ASSISTANT_WORKFLOW_INVALID_INPUT' : error?.code || 'ASSISTANT_WORKFLOW_FAILED' })

export async function assistantWorkflowRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.get('/runs', async (request, reply) => { try { return { runs: await listAssistantRuns(actorFrom(request)) } } catch (e) { return fail(reply, e) } })
  app.post('/runs', async (request, reply) => { const parsed = workflowInputSchema.safeParse(request.body); if (!parsed.success) return reply.status(400).send({ error: 'Revisa los datos de la solicitud.', code: 'ASSISTANT_WORKFLOW_INVALID_INPUT' }); try { return { run: await createAssistantRun(actorFrom(request), parsed.data) } } catch (e) { return fail(reply, e) } })
  app.get('/runs/:id', async (request, reply) => { const p = idSchema.safeParse(request.params); if (!p.success) return reply.status(400).send({ error: 'Identificador inválido.' }); try { return { run: await getAssistantRun(actorFrom(request), p.data.id) } } catch (e) { return fail(reply, e) } })
  app.post('/runs/:id/advance', async (request, reply) => { const p = idSchema.safeParse(request.params); if (!p.success) return reply.status(400).send({ error: 'Identificador inválido.' }); try { return { run: await advanceAssistantRun(actorFrom(request), p.data.id) } } catch (e) { return fail(reply, e) } })
  app.post('/runs/:id/control', async (request, reply) => { const p = idSchema.safeParse(request.params); const body = controlSchema.safeParse(request.body); if (!p.success || !body.success) return reply.status(400).send({ error: 'Revisa los datos de la solicitud.', code: 'ASSISTANT_WORKFLOW_INVALID_INPUT' }); try { return { run: await controlAssistantRun(actorFrom(request), p.data.id, body.data) } } catch (e) { return fail(reply, e) } })
  app.post('/runs/:id/review', async (request, reply) => { const p = idSchema.safeParse(request.params); const body = reviewSchema.safeParse(request.body); if (!p.success || !body.success) return reply.status(400).send({ error: 'Revisa los datos de la solicitud.', code: 'ASSISTANT_WORKFLOW_INVALID_INPUT' }); try { return { run: await reviewAssistantRun(actorFrom(request), p.data.id, body.data) } } catch (e) { return fail(reply, e) } })
  app.post('/runs/:id/apply', async (request, reply) => { const p = idSchema.safeParse(request.params); if (!p.success) return reply.status(400).send({ error: 'Identificador inválido.' }); try { const body = z.object({ revision: z.number().int().positive() }).strict().parse(request.body); const actor = actorFrom(request); return await applyAssistantRun(app, request, actor, p.data.id, body.revision) } catch (e) { return fail(reply, e) } })
}
