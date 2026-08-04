import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import * as metricool from '../services/metricoolSync.service'
import { generateImageUrl, generateSocialContentPlan } from '../services/assetGenerator.service'
import { saveUploadedImage } from '../services/generatedMedia.service'
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

// 8 MB de imagen ≈ 11 M caracteres en base64.
const uploadImageSchema = z.object({
  data: z.string().trim().min(1).max(11_500_000),
}).strict()

const aiImageSchema = z.object({
  prompt: z.string().trim().min(3).max(2_000),
}).strict()

const aiPlanSchema = z.object({
  prompt: z.string().trim().min(3).max(4_000),
  channels: z.array(z.string().trim().min(1).max(48)).min(1).max(12),
  tone: z.string().trim().max(80).optional(),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional(),
}).strict()

/**
 * Devuelve `null` si puede pasar, o el cuerpo del 403 ya redactado.
 *
 * Son dos condiciones distintas y antes compartían mensaje: a una organización
 * en plan `completo` con la integración sin activar se le decía "no está
 * incluido en tu plan", así que el usuario se iba a mejorar un plan que ya era
 * el máximo. Los `code` coinciden con los de requireEntitlement para que el
 * frontend (src/lib/planGate.js) los reconozca sin casos especiales.
 */
async function planDenial(orgId: string): Promise<{ error: string; code: string } | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, metricoolEnabled: true } })
  if (org?.plan !== 'completo') {
    return { error: 'Redes sociales es una función del plan Completo. Mejora tu plan para activarla.', code: 'PLAN_CAPABILITY_REQUIRED' }
  }
  if (!org.metricoolEnabled) {
    return { error: 'Redes sociales no está habilitado en tu organización. Pide a tu administrador que lo active.', code: 'INTEGRATION_DISABLED' }
  }
  return null
}

export async function status(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const denied = await planDenial(orgId)
  if (denied) return reply.status(403).send(denied)
  const metadata = await metricool.connectionMetadata(orgId)
  const integrations = metadata.configured ? await metricool.listProfiles(orgId) : []
  return reply.send({ ...metadata, connected: integrations.length > 0, appUrl: metricool.appUrl(), integrations })
}

export async function connect(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const denied = await planDenial(orgId)
  if (denied) return reply.status(403).send(denied)
  // Configuración pendiente, no caída del proveedor: 409 accionable en vez de
  // 502 (que el frontend pinta como "servicio no disponible").
  if (!(await metricool.isConfiguredForOrg(orgId))) {
    return reply.status(409).send({
      error: 'Las redes sociales no están conectadas todavía. Pide a tu administrador que añada las credenciales de Metricool de tu organización.',
      code: 'METRICOOL_NOT_CONFIGURED',
    })
  }
  if (!(await metricool.listProfiles(orgId)).length) {
    return reply.status(409).send({
      error: 'La cuenta de Metricool conectada no tiene ninguna marca disponible. Revisa la conexión y la marca seleccionada.',
      code: 'METRICOOL_NO_BRAND',
    })
  }
  return reply.send({ provider: 'metricool', appUrl: metricool.appUrl() })
}

export async function analytics(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const denied = await planDenial(orgId)
  if (denied) return reply.status(403).send(denied)
  return reply.send(await metricool.getAnalytics(orgId))
}

export async function createPost(
  request: FastifyRequest<{ Body: { text: string; imageUrl?: string; platforms: string[]; campaignId: string; cta?: string; scheduledAt?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const denied = await planDenial(orgId)
  if (denied) return reply.status(403).send(denied)
  if (!(await metricool.isConfiguredForOrg(orgId))) {
    return reply.status(409).send({
      error: 'Las redes sociales no están conectadas todavía. Pide a tu administrador que añada las credenciales de Metricool de tu organización.',
      code: 'METRICOOL_NOT_CONFIGURED',
    })
  }
  const body = parseRequest(reply, postSchema, request.body)
  if (!body) return
  const { text, imageUrl, platforms, campaignId, cta, scheduledAt } = body
  if (!metricool.hasPublicFrontendUrl()) return reply.status(409).send({ error: 'Falta la dirección pública de la plataforma. Pide a tu administrador que la configure para poder publicar posts con enlace.', code: 'PUBLIC_URL_NOT_CONFIGURED' })

  let campaignSettings: Record<string, unknown> = {}
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId }, select: { id: true, landingSlug: true, settings: true } })
  if (!campaign) return reply.status(404).send({ error: 'La campaña no existe o no pertenece a tu organización' })
  if (!campaign.landingSlug) return reply.status(409).send({ error: 'La campaña necesita una landing publicada antes de crear el post' })
  const attribution: PostCampaignAttribution = { campaignId: campaign.id, landingSlug: campaign.landingSlug, cta }
  if (campaign.settings && typeof campaign.settings === 'object' && !Array.isArray(campaign.settings)) campaignSettings = campaign.settings as Record<string, unknown>

  const post = await metricool.createDraftPost({ text, imageUrl, platforms, attribution, scheduledAt }, orgId)
  // Fallo real de la API de Metricool (la credencial existe): sigue siendo 502.
  if (!post) return reply.status(502).send({ error: 'No se pudo crear el post orgánico en Metricool', code: 'METRICOOL_UPSTREAM_ERROR' })
  const previousChannels = Array.isArray(campaignSettings.captureChannels) ? campaignSettings.captureChannels.filter((value): value is string => typeof value === 'string') : []
  await prisma.campaign.updateMany({ where: { id: campaignId, orgId }, data: { settings: { ...campaignSettings, captureChannels: [...new Set([...previousChannels, 'organic_social'])] } as any } })
  return reply.status(201).send(post)
}

export async function generatePlan(
  request: FastifyRequest<{ Body: { prompt: string; channels: string[]; tone?: string; startDate?: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const denied = await planDenial(orgId)
  if (denied) return reply.status(403).send(denied)
  const body = parseRequest(reply, aiPlanSchema, request.body)
  if (!body) return
  const { prompt, channels, tone, startDate } = body
  return reply.send(await generateSocialContentPlan({ prompt, channels, tone, startDate }))
}

export async function uploadImage(
  request: FastifyRequest<{ Body: { data: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const denied = await planDenial(orgId)
  if (denied) return reply.status(403).send(denied)
  if (!process.env.PUBLIC_HOST) return reply.status(409).send({ error: 'Falta la dirección pública del servidor de imágenes. Pide a tu administrador que la configure para poder subir imágenes.', code: 'PUBLIC_HOST_NOT_CONFIGURED' })
  const body = parseRequest(reply, uploadImageSchema, request.body)
  if (!body) return
  // Acepta tanto base64 pelado como data URL del FileReader del navegador.
  const base64 = body.data.replace(/^data:[^;]+;base64,/, '')
  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return reply.status(400).send({ error: 'El archivo no es válido' })
  }
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) return reply.status(400).send({ error: 'La imagen debe pesar entre 1 byte y 8 MB' })
  const saved = await saveUploadedImage(buffer)
  if (!saved) return reply.status(400).send({ error: 'Formato no soportado: sube una imagen PNG, JPEG o WebP' })
  return reply.status(201).send({ imageUrl: saved.publicUrl })
}

export async function generateImage(
  request: FastifyRequest<{ Body: { prompt: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const denied = await planDenial(orgId)
  if (denied) return reply.status(403).send(denied)
  if (!process.env.OPENAI_API_KEY) return reply.status(409).send({ error: 'La generación de imágenes con IA no está activada. Pide a tu administrador que la configure.', code: 'IMAGE_GENERATION_NOT_CONFIGURED' })
  if (!process.env.PUBLIC_HOST) return reply.status(409).send({ error: 'Falta la dirección pública del servidor de imágenes. Pide a tu administrador que la configure para poder generar imágenes.', code: 'PUBLIC_HOST_NOT_CONFIGURED' })
  const body = parseRequest(reply, aiImageSchema, request.body)
  if (!body) return
  const imageUrl = await generateImageUrl(`Imagen para un post de redes sociales: ${body.prompt}. Fotografía profesional, sin texto sobreimpreso.`)
  // Fallo real del generador de imágenes, no configuración: se mantiene 502.
  if (!imageUrl) return reply.status(502).send({ error: 'No se pudo generar la imagen. Intenta de nuevo.', code: 'IMAGE_GENERATION_FAILED' })
  return reply.status(201).send({ imageUrl })
}
