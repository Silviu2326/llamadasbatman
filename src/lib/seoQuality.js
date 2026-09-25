// Réplica en el navegador de backend/src/services/seoQuality.ts para la vista
// previa de la fábrica de páginas. El backend es la fuente de verdad: la
// publicación responde 422 QUALITY_CHECKS_FAILED con sus propios `checks`.
export const SEO_TITLE_RANGE = { min: 50, max: 60 }
export const SEO_META_RANGE = { min: 120, max: 158 }
export const SEO_OUTLINE_MIN = 4

const text = (value) => (typeof value === 'string' ? value : '')

export function evaluateSeoArticleQuality(article = {}) {
  const title = text(article.title)
  const metaDescription = text(article.metaDescription)
  const h1 = text(article.h1)
  const outline = Array.isArray(article.outline) ? article.outline.filter((item) => typeof item === 'string' && item.trim()) : []
  const keyword = text(article.keyword).trim().toLowerCase()
  const audience = text(article.audience).trim()
  const cta = text(article.cta).trim()
  const combined = `${title} ${metaDescription} ${h1}`.toLowerCase()
  const checks = [
    { id: 'title', ok: title.length >= SEO_TITLE_RANGE.min && title.length <= SEO_TITLE_RANGE.max, value: `${title.length}/${SEO_TITLE_RANGE.max}` },
    { id: 'meta', ok: metaDescription.length >= SEO_META_RANGE.min && metaDescription.length <= SEO_META_RANGE.max, value: `${metaDescription.length}/${SEO_META_RANGE.max}` },
    { id: 'keyword', ok: Boolean(keyword && combined.includes(keyword)), value: keyword && combined.includes(keyword) ? 'detected' : 'pending' },
    { id: 'h1', ok: h1.trim().length > 0, value: h1.trim() ? 'ready' : 'pending' },
    { id: 'outline', ok: outline.length >= SEO_OUTLINE_MIN, value: String(outline.length) },
    { id: 'audience', ok: Boolean(audience), value: audience ? 'defined' : 'pending' },
    { id: 'cta', ok: Boolean(cta), value: cta ? 'ready' : 'pending' },
  ]
  return { passed: checks.every((check) => check.ok), checks }
}
