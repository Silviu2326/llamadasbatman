import { FastifyInstance } from 'fastify'
import { MEDIA_CONTENT_TYPES, readGeneratedImage } from '../services/generatedMedia.service'

/**
 * Sirve las imágenes generadas con IA sin autenticación: Metricool y Meta las
 * descargan desde fuera. El nombre de archivo es un UUID aleatorio (no
 * enumerable) y se valida contra un patrón estricto antes de tocar disco.
 *
 * Desde la fase 2 sirve también las slides SVG de los carruseles con plantilla
 * de marca y las locuciones de los Reels. El SVG sale con
 * `content-security-policy: default-src 'none'`: aunque el texto se escape al
 * componerlo, un SVG es un documento que el navegador ejecuta, y servirlo desde
 * el dominio del backend sin esa cabecera sería fiarlo todo al escapado.
 */
export async function publicMediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { file: string } }>('/:file', async (request, reply) => {
    const image = await readGeneratedImage(request.params.file)
    if (!image) return reply.status(404).send({ error: 'Recurso no encontrado' })
    const extension = request.params.file.split('.').pop() ?? 'png'
    const response = reply
      .type(MEDIA_CONTENT_TYPES[extension] ?? 'image/png')
      .header('cache-control', 'public, max-age=31536000, immutable')
    if (extension === 'svg') {
      response.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
    }
    return response.send(image)
  })
}
