import { FastifyInstance } from 'fastify'
import { MEDIA_CONTENT_TYPES, readGeneratedImage } from '../services/generatedMedia.service'

/**
 * Sirve las imágenes generadas con IA sin autenticación: Metricool y Meta las
 * descargan desde fuera. El nombre de archivo es un UUID aleatorio (no
 * enumerable) y se valida contra un patrón estricto antes de tocar disco.
 */
export async function publicMediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { file: string } }>('/:file', async (request, reply) => {
    const image = await readGeneratedImage(request.params.file)
    if (!image) return reply.status(404).send({ error: 'Recurso no encontrado' })
    const extension = request.params.file.split('.').pop() ?? 'png'
    return reply
      .type(MEDIA_CONTENT_TYPES[extension] ?? 'image/png')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(image)
  })
}
