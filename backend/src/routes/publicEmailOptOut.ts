import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { verifyUnsubscribeToken } from '../services/outboundEmail.service'
import { stopSalesSequenceForLead } from '../services/salesSequence.service'

/**
 * Baja pública de un email frío. Sin sesión a propósito: quien recibe el
 * correo no tiene cuenta, y obligarle a crearse una para dejar de recibirlos
 * es la manera educada de no dejarle irse.
 *
 * Un clic basta. No hay pantalla de confirmación ni encuesta de despedida: el
 * cliente de correo puede pre-cargar el enlace, así que el GET es idempotente
 * y no destruye nada — revoca un consentimiento y para las secuencias vivas.
 */
export async function publicEmailOptOutRoutes(app: FastifyInstance) {
  app.get<{ Params: { leadId: string; token: string } }>('/unsubscribe/:leadId/:token', async (request, reply) => {
    const { leadId, token } = request.params
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, orgId: true } })

    // Mismo cuerpo y mismo código para lead inexistente y token inválido: la
    // página de baja no es un oráculo con el que averiguar qué ids existen.
    if (!lead || !verifyUnsubscribeToken(leadId, token)) {
      return reply.status(404).type('text/html; charset=utf-8').send(page('Este enlace ya no vale', 'Puede que sea antiguo. Responde al correo y te damos de baja a mano.'))
    }

    await prisma.contactConsent.upsert({
      where: { orgId_leadId_channel_purpose: { orgId: lead.orgId, leadId, channel: 'email', purpose: 'marketing' } },
      create: { orgId: lead.orgId, leadId, channel: 'email', purpose: 'marketing', status: 'revoked', source: 'unsubscribe_link', evidence: 'Baja desde el enlace del correo' },
      update: { status: 'revoked', source: 'unsubscribe_link', evidence: 'Baja desde el enlace del correo', occurredAt: new Date() },
    })
    // La baja también corta lo que ya estaba programado. Dar de baja y que
    // mañana salga el paso 3 de la secuencia es no haber dado de baja.
    await stopSalesSequenceForLead(lead.orgId, leadId, 'unsubscribe').catch(() => 0)

    return reply.type('text/html; charset=utf-8').send(page('Hecho, no te escribimos más', 'Hemos dado de baja tu dirección. No hace falta que hagas nada más.'))
  })
}

function page(title: string, body: string) {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title></head><body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f7f9;color:#111"><main style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:21px;margin:0 0 10px">${escape(title)}</h1><p style="margin:0;font-size:15px;line-height:1.6;color:#555">${escape(body)}</p></main></body></html>`
}
