import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

/**
 * Sirve el script universal (`backend/public/web-client.js`) desde el propio
 * backend para que el snippet funcione sin CDN: la URL por defecto es
 * `${PUBLIC_HOST}/web-client.js`. Se lee una vez al arrancar; es un archivo
 * estático pequeño y cambiarlo exige desplegar.
 */
export async function webClientRoutes(app: FastifyInstance) {
  const file = path.resolve(__dirname, '../../public/web-client.js')
  let body = ''
  try {
    body = readFileSync(file, 'utf8')
  } catch (error) {
    app.log.warn({ file }, 'web-client.js no encontrado: el snippet universal devolverá 404')
  }
  const etag = body ? `"${createHash('sha256').update(body).digest('hex').slice(0, 20)}"` : ''

  app.get('/web-client.js', { config: { rateLimit: false } }, async (request, reply) => {
    if (!body) return reply.status(404).send('web-client.js no disponible')
    if (request.headers['if-none-match'] === etag) return reply.status(304).send()
    return reply
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
      .header('etag', etag)
      // El script se carga desde cualquier web de cliente: sin credenciales,
      // sin origen concreto que proteger.
      .header('access-control-allow-origin', '*')
      .header('x-content-type-options', 'nosniff')
      .send(body)
  })
}
