import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import * as metricool from '../services/metricoolSync.service'
import { generateSocialContentPlan } from '../services/assetGenerator.service'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import type { PostCampaignAttribution } from '../services/socialTypes'

type JWTUser = { orgId: string }

const postSchema = z.object({
  text: z.string().trim().min(1).max(5_000),
  imageUrl: z.string().trim().url().max(2_048).optional(),
  platforms: z.array(z.string().trim().min(1).max(12)).min(1).max(12),
  campaignId: z.string().trim().min(1).max(128),
  cta: z.string().trim().min(1).max(160).optional(),
  scheduledAt: z.string().trim().max(80).optional(),
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

export async function status(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })
  const metadata = await metricool.connectionMetadata(orgId)
  const integrations = metadata.configured ? await metricool.listProfiles(orgId) : []
  return reply.send({ ...metadata, connected: integrations.length > 0, appUrl: metricool.appUrl(), integrations })
}

export async function connect(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })
  if (!(await metricool.isConfiguredForOrg(orgId))) return reply.status(502).send({ error: 'Metricool no disponible: configura la credencial cifrada de esta organización' })
  if (!(await metricool.listProfiles(orgId)).length) return reply.status(502).send({ error: 'Metricool no devolvió ninguna marca. Revisa las credenciales y el identificador de marca' })
  return reply.send({ provider: 'metricool', appUrl: metricool.appUrl() })
}

export async function analytics(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })
  return reply.send(await metricool.getAnalytics(orgId))
}

export async function createPost(
  request: FastifyRequest<{ Body: { text: string; imageUrl?: string; platforms: string[]; campaignId: string; cta?: string; scheduledAt?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })
  if (!(await metricool.isConfiguredForOrg(orgId))) return reply.status(400).send({ error: 'Configura Metricool antes de crear posts orgánicos' })
  const body = parseRequest(reply, postSchema, request.body)
  if (!body) return
  const { text, imageUrl, platforms, campaignId, cta, scheduledAt } = body
  if (!metricool.hasPublicFrontendUrl()) return reply.status(409).send({ error: 'Configura APP_URL o FRONTEND_URL con la URL pública antes de crear posts' })

  let campaignSettings: Record<string, unknown> = {}
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId }, select: { id: true, landingSlug: true, settings: true } })
  if (!campaign) return reply.status(404).send({ error: 'La campaña no existe o no pertenece a tu organización' })
  if (!campaign.landingSlug) return reply.status(409).send({ error: 'La campaña necesita una landing publicada antes de crear el post' })
  const attribution: PostCampaignAttribution = { campaignId: campaign.id, landingSlug: campaign.landingSlug, cta }
  if (campaign.settings && typeof campaign.settings === 'object' && !Array.isArray(campaign.settings)) campaignSettings = campaign.settings as Record<string, unknown>

  const post = await metricool.createDraftPost({ text, imageUrl, platforms, attribution, scheduledAt }, orgId)
  if (!post) return reply.status(502).send({ error: 'No se pudo crear el post orgánico en Metricool' })
  const previousChannels = Array.isArray(campaignSettings.captureChannels) ? campaignSettings.captureChannels.filter((value): value is string => typeof value === 'string') : []
  await prisma.campaign.updateMany({ where: { id: campaignId, orgId }, data: { settings: { ...campaignSettings, captureChannels: [...new Set([...previousChannels, 'organic_social'])] } as any } })
  return reply.status(201).send(post)
}

export async function generatePlan(
  request: FastifyRequest<{ Body: { prompt: string; channels: string[]; tone?: string; startDate?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  if (!(await requirePlan(orgId))) return reply.status(403).send({ error: 'Redes sociales no está incluido en tu plan' })
  const body = parseRequest(reply, aiPlanSchema, request.body)
  if (!body) return
  const { prompt, channels, tone, startDate } = body
  return reply.send(await generateSocialContentPlan({ prompt, channels, tone, startDate }))
}
