import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requirePermission } from '../access-control'
import { getPersonalStudio, updatePersonalStudio, chatPersonalStudio } from '../services/personalStudio.service'
import { studioConfigSchema } from '../services/personalStudioConfig'
import { exportPersonalVideo } from '../services/personalStudioVideo'
import { STUDIO_PRESETS } from '../services/personalStudioPipeline'

type User = { orgId: string; userId: string }
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const chatSchema = z.object({ revision, message: z.string().trim().min(1).max(2000) }).strict()
const updateSchema = z.object({ revision, config: studioConfigSchema, action: z.enum(['edit', 'preset', 'undo']).default('edit') }).strict()
const videoSchema = z.object({ start: z.coerce.number().min(0).max(86400), end: z.coerce.number().min(0.1).max(86400), mute: z.enum(['true', 'false']).default('false') }).strict().refine(value => value.end - value.start >= 0.1 && value.end - value.start <= 600)
const activeExports = new Set<string>()

// Mounted under authenticated /api/assets. Preferences belong to the JWT user
// in the active organization; neither identity can be supplied by the client.
export async function personalStudioRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePermission('assets.read', { scope: 'org' }))
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 100 * 1024 * 1024 }, (_request, body, done) => done(null, body))
  app.post('/studio/video/export', { bodyLimit: 100 * 1024 * 1024, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = videoSchema.safeParse(request.query)
    if (!parsed.success || !Buffer.isBuffer(request.body) || !request.body.length) return reply.code(400).send({ error: 'Elige un vídeo y un recorte de entre 0,1 segundos y 10 minutos (máximo 100 MB).' })
    const { orgId, userId } = request.user as User
    const key = `${orgId}:${userId}`
    if (activeExports.has(key)) return reply.code(409).send({ error: 'Ya tienes una exportación de vídeo en curso.' })
    activeExports.add(key)
    try {
      const body = await exportPersonalVideo(request.body, { ...parsed.data, mute: parsed.data.mute === 'true' })
      return reply.header('Cache-Control', 'no-store').header('Content-Disposition', 'attachment; filename="video-editado.mp4"').type('video/mp4').send(body)
    } catch (error) {
      request.log.warn({ error }, 'Personal studio video export failed')
      return reply.code(422).send({ error: 'No se pudo exportar el vídeo. Revisa el archivo y el recorte; el servidor necesita FFmpeg disponible.' })
    } finally { activeExports.delete(key) }
  })
  app.get('/studio/presets', async () => ({ presets: STUDIO_PRESETS }))
  app.get('/studio/config', async request => {
    const { orgId, userId } = request.user as User
    return getPersonalStudio(orgId, userId)
  })
  app.put('/studio/config', async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'La configuración del estudio no es válida.' })
    const { orgId, userId } = request.user as User
    return updatePersonalStudio(orgId, userId, parsed.data.revision, parsed.data.config, parsed.data.action)
  })
  app.post('/studio/chat', {
    preHandler: [requirePermission('costs.request', { scope: 'org' })],
    config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Escribe un mensaje de hasta 2000 caracteres.' })
    const { orgId, userId } = request.user as User
    return chatPersonalStudio(orgId, userId, parsed.data.revision, parsed.data.message)
  })
}
