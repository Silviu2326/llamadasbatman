import { FastifyInstance } from 'fastify'
import {
  getPublishedArticle,
  getSharedReport,
  listPublishedArticles,
  publicAuditForCampaign,
  UnsafeUrlError,
} from '../services/seoAgency.service'

/**
 * Superficie pública de SEO, sin JWT:
 * - GET  /report/:token — informe compartido de solo lectura (token opaco).
 * - POST /audit/:slug   — imán de leads: audita la web del visitante y crea
 *   el lead en la campaña dueña de la landing. Rate limit agresivo: cada
 *   petición lanza un fetch externo.
 */
export async function publicSeoRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>('/report/:token', async (request, reply) => {
    const report = await getSharedReport(request.params.token?.slice(0, 64) ?? '')
    if (!report) return reply.status(404).send({ error: 'Informe no encontrado' })
    return reply.send({ data: report })
  })

  app.post<{ Params: { slug: string }; Body: { url?: string; name?: string; email?: string; phone?: string } }>(
    '/audit/:slug',
    {
      preHandler: app.rateLimit({
        max: 6,
        timeWindow: '1 hour',
        keyGenerator: (request) => `seo-audit:${request.ip}`,
        errorResponseBuilder: () => ({ error: 'Has hecho demasiadas auditorías. Inténtalo más tarde.' }),
      }),
    },
    async (request, reply) => {
      const { url, name, email, phone, company } = (request.body ?? {}) as {
        url?: string; name?: string; email?: string; phone?: string; company?: string
      }
      // Honeypot: el campo "company" está oculto en el formulario — solo los
      // bots lo rellenan. Se responde 200 genérico para no darles señal.
      if (company?.trim()) {
        return reply.send({ data: null, message: 'Recibido' })
      }
      if (!url?.trim() || !name?.trim() || !(email?.trim() || phone?.trim())) {
        return reply.status(400).send({ error: 'Indica tu web, tu nombre y un email o teléfono de contacto.' })
      }
      try {
        const report = await publicAuditForCampaign(request.params.slug?.slice(0, 160) ?? '', {
          url: url.trim().slice(0, 300),
          name: name.trim().slice(0, 120),
          email: email?.trim().slice(0, 160),
          phone: phone?.trim().slice(0, 40),
        })
        if (!report) return reply.status(404).send({ error: 'Esta página de auditoría no está disponible.' })
        return reply.send({ data: report })
      } catch (error) {
        if (error instanceof UnsafeUrlError) {
          return reply.status(400).send({ error: error.message, code: error.code })
        }
        throw error
      }
    },
  )

  // Blog público de la landing: los artículos SEO publicados, indexables en
  // /l/:slug/blog/:articleSlug (el SPA los pinta; estos endpoints los sirven).
  app.get<{ Params: { slug: string } }>('/blog/:slug', async (request, reply) => {
    const articles = await listPublishedArticles(request.params.slug?.slice(0, 160) ?? '')
    if (!articles) return reply.status(404).send({ error: 'Blog no encontrado' })
    return reply.send({ data: articles })
  })

  app.get<{ Params: { slug: string; articleSlug: string } }>('/blog/:slug/:articleSlug', async (request, reply) => {
    const article = await getPublishedArticle(
      request.params.slug?.slice(0, 160) ?? '',
      request.params.articleSlug?.slice(0, 120) ?? '',
    )
    if (!article) return reply.status(404).send({ error: 'Artículo no encontrado' })
    return reply.send({ data: article })
  })
}
