import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import * as postiz from '../services/postizSync.service'
import { generateSocialContentPlan } from '../services/assetGenerator.service'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const postSchema = z.object({
  text: z.string().trim().min(1).max(5_000),
  imageUrl: z.string().trim().url().max(2_048).optional(),
  platforms: z.array(z.string().trim().min(1).max(48)).min(1).max(12),
  campaignId: z.string().trim().min(1).max(128),
  cta: z.string().trim().min(1).max(160).optional(),
}).strict()

const aiPlanSchema = z.object({
  prompt: z.string().trim().min(3).max(4_000),
  channels: z.array(z.string().trim().min(1).max(48)).min(1).max(12),
  tone: z.string().trim().max(80).optional(),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional(),
}).strict()

async function requirePlan(orgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, postizEnabled: true } })
  return org?.plan === 'completo' && org.postizEnabled
}

/** GET / — status based on the official integrations endpoint. */
export async function status(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const metadata = await postiz.connectionMetadata(orgId)
  const integrations = await postiz.listIntegrations(undefined, orgId)
  return reply.send({ ...metadata, connected: metadata.configured, embedUrl: null, integrations })
}

/** POST /connect — validates credentials and lists Postiz channels. */
export async function connect(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const metadata = await postiz.connectionMetadata(orgId)
  const integrations = await postiz.listIntegrations(undefined, orgId)
  return reply.send({ ...metadata, connected: metadata.configured, embedUrl: null, integrations })
}

export async function analytics(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const integrations = await postiz.listIntegrations(undefined, orgId)
  const analytics = await Promise.all(integrations.map(integration => postiz.getAnalytics(integration.id, orgId)))
  return reply.send(analytics)
}

/** POST /posts — creates an official Postiz Public API draft. */
export async function createPost(
  request: FastifyRequest<{ Body: { text: string; imageUrl?: string; platforms: string[]; campaignId: string; cta?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const body = parseRequest(reply, postSchema, request.body)
  if (!body) return
  const { text, imageUrl, platforms, campaignId, cta } = body
  if (!postiz.hasPublicFrontendUrl()) {
    return reply.status(409).send({ error: 'Configura APP_URL o FRONTEND_URL con la URL pública antes de crear posts' })
  }

  let campaignSettings: Record<string, unknown> = {}
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: { id: true, landingSlug: true, settings: true },
  })
  if (!campaign) return reply.status(404).send({ error: 'La campaña no existe o no pertenece a tu organización' })
  if (!campaign.landingSlug) return reply.status(409).send({ error: 'La campaña necesita una landing publicada antes de crear el post' })
  const attribution: postiz.PostCampaignAttribution = { campaignId: campaign.id, landingSlug: campaign.landingSlug, cta }
  if (campaign.settings && typeof campaign.settings === 'object' && !Array.isArray(campaign.settings)) {
    campaignSettings = campaign.settings as Record<string, unknown>
  }

  const post = await postiz.createDraftPost(undefined, { text, imageUrl, platforms, attribution }, orgId)
  if (!post) return reply.status(502).send({ error: 'No se pudo crear el borrador en Postiz' })
  const previousChannels = Array.isArray(campaignSettings.captureChannels)
    ? campaignSettings.captureChannels.filter((value): value is string => typeof value === 'string')
    : []
  await prisma.campaign.updateMany({
    where: { id: campaignId, orgId },
    data: { settings: { ...campaignSettings, captureChannels: [...new Set([...previousChannels, 'organic_social'])] } as any },
  })
  return reply.status(201).send(post)
}

export async function generatePlan(
  request: FastifyRequest<{ Body: { prompt: string; channels: string[]; tone?: string; startDate?: string } }>,
  reply: FastifyReply,
) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })

  const body = parseRequest(reply, aiPlanSchema, request.body)
  if (!body) return
  const { prompt, channels, tone, startDate } = body
  return reply.send(await generateSocialContentPlan({ prompt, channels, tone, startDate }))
}

