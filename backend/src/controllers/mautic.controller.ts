import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import * as mauticSync from '../services/mauticSync.service'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import { assertEmailSendAllowed } from '../lib/emailCompliance'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(2_000).optional(),
}).strict()
const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict()
const testEmailSchema = z.object({
  emailId: z.coerce.string().trim().min(1).max(64),
  testLeadId: z.string().trim().min(1).max(128).optional(),
  testContactId: z.coerce.string().trim().min(1).max(64).optional(),
}).strict().refine(value => Boolean(value.testLeadId || value.testContactId), 'Selecciona un destinatario de prueba')
const scheduleSchema = z.object({
  publishUp: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/, 'Fecha inválida').optional(),
  publishDown: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/, 'Fecha inválida').optional(),
}).strict().refine(value => value.publishUp || value.publishDown, 'Indica al menos una fecha')

/**
 * Gating por plan (Plan Completo + `mauticEnabled`), igual en todos los
 * endpoints de este controller. Devuelve el orgId si está habilitado, o
 * `null` después de responder el 403 (el caller debe cortar en ese caso).
 */
async function assertEmailMarketingEnabled(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const { orgId } = request.user as JWTUser
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, mauticEnabled: true } })
  if (org?.plan !== 'completo' || !org.mauticEnabled) {
    reply.status(403).send({ error: 'Email marketing no está incluido en tu plan' })
    return null
  }
  return orgId
}

/** GET / — overview agregado para la página de Email marketing (Plan Completo). */
export async function overview(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await assertEmailMarketingEnabled(request, reply)
  if (!orgId) return
  return reply.send(await mauticSync.getOverview(orgId))
}

/** GET /campaigns — lista de campañas de Mautic. */
export async function listCampaigns(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await assertEmailMarketingEnabled(request, reply)
  if (!orgId) return
  const campaigns = await mauticSync.getCampaigns(orgId)
  return reply.send(campaigns ?? [])
}

/** POST /campaigns — crea una campaña nueva en Mautic. */
export async function createCampaign(
  request: FastifyRequest<{ Body: { name: string; description?: string } }>,
  reply: FastifyReply
) {
  const orgId = await assertEmailMarketingEnabled(request, reply)
  if (!orgId) return
  const body = parseRequest(reply, createCampaignSchema, request.body)
  if (!body) return
  const { name, description } = body
  const campaign = await mauticSync.createCampaign(orgId, name, description)
  if (!campaign) return reply.status(503).send({ error: 'No se pudo crear la campaña en Mautic' })
  return reply.status(201).send(campaign)
}

/** GET /templates — plantillas de email reutilizables de Mautic. */
export async function listTemplates(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await assertEmailMarketingEnabled(request, reply)
  if (!orgId) return
  const templates = await mauticSync.getEmailTemplates(orgId)
  return reply.send(templates ?? [])
}

/** POST /campaigns/:id/send-test — envía una plantilla puntual a un contacto de prueba. */
export async function sendTestEmail(
  request: FastifyRequest<{ Params: { id: string }; Body: { emailId: string; testContactId: string } }>,
  reply: FastifyReply
) {
  const orgId = await assertEmailMarketingEnabled(request, reply)
  if (!orgId) return
  const [params, body] = [
    parseRequest(reply, idParamsSchema, request.params),
    parseRequest(reply, testEmailSchema, request.body),
  ]
  if (!params || !body) return

  // P0-04/EM-01: nunca confiar en el emailId que manda el navegador — debe
  // estar vinculado a esta organización antes de poder usarse.
  if (!(await mauticSync.isTemplateOwnedByOrg(orgId, body.emailId))) {
    return reply.status(404).send({ error: 'Plantilla no encontrada' })
  }

  // P0-05/EM-02: barrera única de consentimiento antes de cualquier envío.
  // Solo se puede evaluar cuando el destinatario de prueba es un lead del
  // CRM (testLeadId); un contacto Mautic suelto (testContactId) no tiene
  // ContactConsent que consultar.
  if (body.testLeadId) {
    const decision = await assertEmailSendAllowed(orgId, body.testLeadId, 'contact')
    if (!decision.allowed) {
      return reply.status(409).send({ error: 'Envío bloqueado por cumplimiento', reason: decision.reason })
    }
  }

  const testContactId = body.testLeadId
    ? await mauticSync.getContactIdForLead(body.testLeadId, orgId)
    : await mauticSync.getOwnedTestContactId(orgId, body.testContactId!)
  if (!testContactId) return reply.status(404).send({ error: 'El lead de prueba todavía no está sincronizado en Mautic' })
  const ok = await mauticSync.sendTestEmail(body.emailId, String(testContactId))
  if (!ok) return reply.status(503).send({ error: 'No se pudo enviar el email de prueba' })
  return reply.send({ ok: true })
}

/** POST /campaigns/:id/schedule — fija publishUp/publishDown de la campaña. */
export async function scheduleCampaign(
  request: FastifyRequest<{ Params: { id: string }; Body: { publishUp?: string; publishDown?: string } }>,
  reply: FastifyReply
) {
  const orgId = await assertEmailMarketingEnabled(request, reply)
  if (!orgId) return
  const [params, body] = [
    parseRequest(reply, idParamsSchema, request.params),
    parseRequest(reply, scheduleSchema, request.body),
  ]
  if (!params || !body) return
  const campaign = await mauticSync.scheduleCampaign(orgId, params.id, body.publishUp, body.publishDown)
  if (!campaign) return reply.status(503).send({ error: 'No se pudo programar la campaña' })
  return reply.send(campaign)
}

/** POST /campaigns/:id/pause — despublica la campaña. */
export async function pauseCampaign(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const orgId = await assertEmailMarketingEnabled(request, reply)
  if (!orgId) return
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const ok = await mauticSync.pauseCampaign(orgId, params.id)
  if (!ok) return reply.status(503).send({ error: 'No se pudo pausar la campaña' })
  return reply.send({ ok: true })
}

/** GET /campaigns/:id/stats — detalle/estadísticas de la campaña. */
export async function getCampaignStats(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const orgId = await assertEmailMarketingEnabled(request, reply)
  if (!orgId) return
  const params = parseRequest(reply, idParamsSchema, request.params)
  if (!params) return
  const stats = await mauticSync.getCampaignStats(params.id, orgId)
  if (!stats) return reply.status(503).send({ error: 'No se pudo obtener el detalle de la campaña' })
  return reply.send(stats)
}
