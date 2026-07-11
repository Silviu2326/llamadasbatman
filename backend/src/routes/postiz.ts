import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import * as ctrl from '../controllers/postiz.controller'

export async function postizRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', ctrl.status)
  app.post('/connect', ctrl.connect)
  app.get('/analytics', ctrl.analytics)
  app.post('/posts', ctrl.createPost)
}
