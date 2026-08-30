import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { authenticateVoiceService } from '../middlewares/authenticateVoiceService'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/calls.controller'

export async function callsRoutes(app: FastifyInstance) {
  const canRead = { preHandler: [authenticate, requirePermission('calls.read', { scope: 'org' })] }
  const canMutate = { preHandler: [authenticate, requirePermission('calls.write', { scope: 'org' })] }

  app.get('/', canRead, ctrl.list as any)
  app.get('/live', canRead, ctrl.live as any)
  app.get('/voice-metrics', canRead, ctrl.voiceMetrics as any)
  app.post('/tts-latency-demo', canMutate, ctrl.ttsLatencyDemo as any)
  app.post('/bulk-actions', canMutate, ctrl.bulkActions as any)
  app.get('/:id/trace', canRead, ctrl.trace as any)
  app.get('/:id/metrics', canRead, ctrl.metrics as any)
  app.get('/:id/evaluation', canRead, ctrl.evaluation as any)
  app.get('/:id', canRead, ctrl.get as any)
  app.post('/ingest', { preHandler: authenticateVoiceService }, ctrl.ingest as any)
  app.get('/:id/notes', canRead, ctrl.listNotes as any)
  app.post('/:id/notes', canMutate, ctrl.createNote as any)
  app.put('/:id/notes/:noteId', canMutate, ctrl.updateNote as any)
  app.delete('/:id/notes/:noteId', canMutate, ctrl.deleteNote as any)
  app.post('/:id/favorite', canMutate, ctrl.favorite as any)
  app.get('/:id/tasks', {
    preHandler: [
      authenticate,
      requirePermission('calls.read', { scope: 'org' }),
      requirePermission('tasks.read', { scope: 'org' }),
    ],
  }, ctrl.listTasks as any)
  const canMutateCallTask = {
    preHandler: [
      authenticate,
      requirePermission('calls.write', { scope: 'org' }),
      requirePermission('tasks.write', { scope: 'org' }),
    ],
  }
  app.post('/:id/tasks', canMutateCallTask, ctrl.createTask as any)
  app.put('/:id/tasks/:taskId', canMutateCallTask, ctrl.updateTask as any)
}
