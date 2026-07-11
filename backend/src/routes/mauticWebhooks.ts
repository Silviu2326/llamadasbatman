import { FastifyInstance } from 'fastify'
import { recordActivityByCrmLeadId } from '../services/mauticSync.service'

interface MauticContactEvent {
  contact?: { fields?: { all?: { crmleadid?: string } } }
  email?: { subject?: string }
  content?: { title?: string }
}

/**
 * Mautic no firma sus webhooks nativos como Meta — el secreto se pega en la
 * URL configurada dentro de Mautic (?secret=...), no en un header. Ver
 * PLAN_IMPLEMENTACION_POSTIZ_MAUTIC.md sección 4 punto 4.
 */
export async function mauticWebhooksRoutes(app: FastifyInstance) {
  app.post<{ Querystring: { secret?: string }; Body: Record<string, MauticContactEvent[]> }>(
    '/',
    async (req, reply) => {
      if (req.query.secret !== process.env.MAUTIC_WEBHOOK_SECRET) {
        return reply.status(403).send({ error: 'Invalid secret' })
      }

      const body = req.body ?? {}
      for (const [eventKey, events] of Object.entries(body)) {
        const type = eventKey.includes('page_on_hit') ? 'click' : eventKey.includes('email_on_open') ? 'open' : null
        if (!type || !Array.isArray(events)) continue

        for (const event of events) {
          const crmLeadId = event.contact?.fields?.all?.crmleadid
          if (!crmLeadId) continue
          const detail = event.email?.subject ?? event.content?.title
          await recordActivityByCrmLeadId(crmLeadId, type, detail).catch(() => {})
        }
      }

      return reply.status(200).send({ ok: true })
    }
  )
}
