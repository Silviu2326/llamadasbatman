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
import { articleFromMarkdown, evaluateSeoArticleQuality, SeoArticleForQuality } from '../services/seoQuality'
import { createDraftPost } from '../services/metricoolSync.service'
import { getKnowledgeBase } from '../services/knowledge.service'
import { prisma } from '../lib/prisma'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

/** Contexto del quality gate que llega en query (GET) o body (POST), acotado. */
export function qualityContext(raw: unknown): Partial<SeoArticleForQuality> {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const str = (key: string, max = 400) => (typeof source[key] === 'string' ? (source[key] as string).slice(0, max) : undefined)
  const outline = Array.isArray(source.outline) ? (source.outline as unknown[]).filter((item): item is string => typeof item === 'string').slice(0, 40)
    : typeof source.outline === 'string' ? source.outline.split('|').map((item) => item.trim()).filter(Boolean).slice(0, 40) : undefined
  const mode = source.mode === 'activa' || source.mode === 'pasiva' ? source.mode : undefined
  return { title: str('title'), metaDescription: str('metaDescription'), h1: str('h1'), outline, keyword: str('keyword', 200), audience: str('audience'), cta: str('cta'), mode }
}

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

  // Quality gate del artículo: la misma función pura que la vista previa,
  // pero es esta la que manda. `context` es lo que la base no guarda
  // (meta, keyword, audiencia, CTA, modo) y llega del cliente.
  app.get<{ Params: { id: string } }>('/content/:id/quality', async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const article = await prisma.knowledgeBase.findFirst({
      where: { id: request.params.id, orgId, type: 'seo-article', isActive: true },
      select: { name: true, content: true },
    })
    if (!article) return reply.status(404).send({ error: 'Artículo no encontrado' })
    return reply.send({ data: evaluateSeoArticleQuality(articleFromMarkdown(article.name, article.content, qualityContext(request.query))) })
  })

  app.post<{ Params: { id: string } }>('/content/:id/publish', canEditCampaign, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const article = await prisma.knowledgeBase.findFirst({
      where: { id: request.params.id, orgId, type: 'seo-article', isActive: true },
      select: { name: true, content: true },
    })
    if (!article) return reply.status(404).send({ error: 'Artículo no encontrado' })
    const quality = evaluateSeoArticleQuality(articleFromMarkdown(article.name, article.content, qualityContext(request.body)))
    if (!quality.passed) {
      return reply.status(422).send({ error: 'El artículo no supera el quality gate SEO', code: 'QUALITY_CHECKS_FAILED', checks: quality.checks })
    }
    const result = await publishArticle(orgId, request.params.id)
    if (!result) return reply.status(404).send({ error: 'Artículo no encontrado' })
    return reply.send({ data: { ...result, checks: quality.checks } })
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
    const { keywords, url } = (request.query ?? {}) as { keywords?: string; url?: string }
    const list = (keywords ?? '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 30)
    return reply.send({ data: await searchConsolePerformance(orgId, list, url) })
  })

  app.post('/content', canAnalyze, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const { title, keyword, format, business, sector, city, mode, brief, audience, tone, cta } = (request.body ?? {}) as Record<string, string | undefined>
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
        mode: mode === 'activa' || mode === 'pasiva' ? mode : undefined,
        brief: brief?.trim() || undefined,
        audience: audience?.trim() || undefined,
        tone: tone?.trim() || undefined,
        cta: cta?.trim() || undefined,
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
