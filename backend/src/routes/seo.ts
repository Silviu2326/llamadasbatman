import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import {
  applySeoToLanding,
  compareCompetitors,
  computeAlerts,
  createShareToken,
  detectCannibalization,
  generateSeoArticle,
  generateSeoReport,
  keywordGap,
  latestReport,
  listHistory,
  listProjects,
  listStaleArticles,
  publishArticle,
  rankHistory,
  refreshArticle,
  reportById,
  saveReport,
  searchConsolePerformance,
  SeoAiUnavailable,
  upsertProject,
} from '../services/seoAgency.service'
import { OrganicGoogleIntegrationError } from '../services/organicGoogleIntegration.service'
import { createDraftPost } from '../services/metricoolSync.service'
import { getKnowledgeBase } from '../services/knowledge.service'
import { prisma } from '../lib/prisma'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function seoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  // Análisis/redacción lanzan fetch externo + LLM: misma barrera de coste que
  // prospecting. Leer historial o Search Console ya sincronizado es gratis.
  const canAnalyze = { preHandler: [requirePermission('costs.request', { scope: 'org' })] }
  const canEditCampaign = { preHandler: [requirePermission('campaigns.write', { scope: 'org' })] }

  app.post('/analyze', canAnalyze, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { url, business, sector, city, competitors } = (request.body ?? {}) as {
      url?: string; business?: string; sector?: string; city?: string; competitors?: string[]
    }
    if (!url?.trim()) {
      return reply.status(400).send({ error: 'url es obligatoria' })
    }
    const input = {
      url: url.trim(),
      business: business?.trim() || undefined,
      sector: sector?.trim() || undefined,
      city: city?.trim() || undefined,
    }
    const report = await generateSeoReport(input)
    const [saved] = await Promise.all([
      saveReport(orgId, report).catch((error) => {
        console.warn('[Seo] no se pudo guardar el historial:', (error as Error).message)
        return null
      }),
      // El análisis define/actualiza el proyecto: es lo que vigila el worker.
      upsertProject(orgId, { ...input, competitors: Array.isArray(competitors) ? competitors : undefined })
        .catch((error) => console.warn('[Seo] no se pudo guardar el proyecto:', (error as Error).message)),
    ])
    return reply.send({ data: { ...report, reportId: saved?.id ?? null } })
  })

  app.get('/projects', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    return reply.send({ data: await listProjects(orgId) })
  })

  app.get('/rank-history', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { url } = (request.query ?? {}) as { url?: string }
    if (!url?.trim()) return reply.status(400).send({ error: 'url es obligatoria' })
    return reply.send({ data: await rankHistory(orgId, url.trim()) })
  })

  app.post<{ Params: { id: string } }>('/content/:id/publish', canEditCampaign, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const result = await publishArticle(orgId, request.params.id)
    if (!result) return reply.status(404).send({ error: 'Artículo no encontrado' })
    return reply.send({ data: result })
  })

  app.get('/history', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { url } = (request.query ?? {}) as { url?: string }
    const cleanUrl = url?.trim() || undefined
    const [items, alerts] = await Promise.all([
      listHistory(orgId, cleanUrl),
      computeAlerts(orgId, cleanUrl),
    ])
    return reply.send({ data: items, alerts })
  })

  // El informe vivía en `localStorage` del navegador: se perdía al cambiar de
  // equipo y dos personas del mismo negocio veían cosas distintas. Se lee de
  // `SeoReport`, que es donde ya se guardaba (`organico.md` fase 0).
  app.get('/reports/latest', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { url } = (request.query ?? {}) as { url?: string }
    return reply.send({ data: await latestReport(orgId, url?.trim() || undefined) })
  })

  app.get<{ Params: { id: string } }>('/reports/:id', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const report = await reportById(orgId, request.params.id)
    if (!report) return reply.status(404).send({ error: 'Informe no encontrado' })
    return reply.send({ data: report })
  })

  app.post<{ Params: { id: string } }>('/reports/:id/share', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const token = await createShareToken(orgId, request.params.id)
    if (!token) return reply.status(404).send({ error: 'Informe no encontrado' })
    return reply.send({ data: { token } })
  })

  app.post('/keyword-gap', canAnalyze, async (request, reply) => {
    const { urls, keywords } = (request.body ?? {}) as { urls?: string[]; keywords?: string[] }
    if (!Array.isArray(urls) || !urls.length) {
      return reply.status(400).send({ error: 'urls es obligatorio (máximo 3)' })
    }
    try {
      const result = await keywordGap(Array.isArray(keywords) ? keywords.slice(0, 30) : [], urls)
      return reply.send({ data: result })
    } catch (error) {
      if (error instanceof SeoAiUnavailable) {
        return reply.status(409).send({ error: error.message, code: error.code })
      }
      throw error
    }
  })

  app.get('/cannibalization', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    try {
      return reply.send({ data: await detectCannibalization(orgId) })
    } catch (error) {
      if (error instanceof OrganicGoogleIntegrationError) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code })
      }
      throw error
    }
  })

  app.get('/content/stale', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    return reply.send({ data: await listStaleArticles(orgId) })
  })

  app.post<{ Params: { id: string } }>('/content/:id/refresh', canAnalyze, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    try {
      const result = await refreshArticle(orgId, request.params.id)
      if (!result) return reply.status(404).send({ error: 'Artículo no encontrado' })
      return reply.send({ data: result })
    } catch (error) {
      if (error instanceof SeoAiUnavailable) {
        return reply.status(409).send({ error: error.message, code: error.code })
      }
      throw error
    }
  })

  app.post('/compare', canAnalyze, async (request, reply) => {
    const { urls } = (request.body ?? {}) as { urls?: string[] }
    if (!Array.isArray(urls) || !urls.length) {
      return reply.status(400).send({ error: 'urls es obligatorio (máximo 3)' })
    }
    return reply.send({ data: await compareCompetitors(urls) })
  })

  app.get('/search-console', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { keywords } = (request.query ?? {}) as { keywords?: string }
    const list = (keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 30)
    return reply.send({ data: await searchConsolePerformance(orgId, list) })
  })

  app.post('/content', canAnalyze, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { title, keyword, format, business, sector, city } = (request.body ?? {}) as Record<string, string | undefined>
    if (!title?.trim() || !keyword?.trim()) {
      return reply.status(400).send({ error: 'title y keyword son obligatorios' })
    }
    try {
      const article = await generateSeoArticle(orgId, {
        title: title.trim(),
        keyword: keyword.trim(),
        format: format?.trim() || undefined,
        business: business?.trim() || undefined,
        sector: sector?.trim() || undefined,
        city: city?.trim() || undefined,
      })
      return reply.send({ data: article })
    } catch (error) {
      if (error instanceof SeoAiUnavailable) {
        return reply.status(409).send({ error: error.message, code: error.code })
      }
      throw error
    }
  })

  app.post('/apply-landing', canEditCampaign, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { campaignId, title, metaDescription } = (request.body ?? {}) as Record<string, string | undefined>
    if (!campaignId?.trim() || !title?.trim() || !metaDescription?.trim()) {
      return reply.status(400).send({ error: 'campaignId, title y metaDescription son obligatorios' })
    }
    const result = await applySeoToLanding(orgId, {
      campaignId: campaignId.trim(),
      title: title.trim(),
      metaDescription: metaDescription.trim(),
    })
    if (!result) {
      return reply.status(404).send({ error: 'La campaña no existe, no es tuya o no tiene landing publicada' })
    }
    return reply.send({ data: result })
  })

  // Difusión del artículo en redes vía Metricool. El post lleva el enlace
  // atribuido a una landing de campaña (utm) — es el patrón de todo el CRM.
  app.post('/social', canAnalyze, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { articleId, campaignId, platforms, scheduledAt } = (request.body ?? {}) as {
      articleId?: string; campaignId?: string; platforms?: string[]; scheduledAt?: string
    }
    if (!articleId?.trim() || !campaignId?.trim() || !Array.isArray(platforms) || !platforms.length) {
      return reply.status(400).send({ error: 'articleId, campaignId y platforms son obligatorios' })
    }
    const article = await getKnowledgeBase(orgId, articleId.trim())
    if (!article?.content) {
      return reply.status(404).send({ error: 'Artículo no encontrado' })
    }
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId.trim(), orgId, landingSlug: { not: null } },
      select: { id: true, landingSlug: true },
    })
    if (!campaign?.landingSlug) {
      return reply.status(404).send({ error: 'La campaña no tiene landing publicada para atribuir el enlace' })
    }
    // Extracto: primer párrafo real del artículo (sin cabeceras Markdown).
    const excerpt = article.content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .slice(0, 2)
      .join(' ')
      .slice(0, 400)
    const post = await createDraftPost({
      text: `${article.name}\n\n${excerpt}`,
      platforms: platforms.slice(0, 5),
      attribution: { campaignId: campaign.id, landingSlug: campaign.landingSlug, cta: 'Lee más y da el siguiente paso' },
      scheduledAt: scheduledAt || undefined,
    }, orgId)
    if (!post) {
      return reply.status(409).send({
        error: 'Metricool no está configurado o rechazó el post. Revisa la conexión en Redes sociales.',
        code: 'METRICOOL_UNAVAILABLE',
      })
    }
    return reply.send({ data: { scheduled: true } })
  })
}
