/**
 * Quality gate de la fábrica de páginas SEO. Función pura: la UI la replica
 * en `src/lib/seoQuality.js` para la vista previa, pero la publicación
 * (`POST /api/seo/content/:id/publish`) solo pasa si esta versión la aprueba.
 * Los `value` son tokens neutros (números o `detected`/`pending`/`ready`)
 * para que cada cliente los traduzca.
 */
export interface SeoArticleForQuality {
  title?: string | null
  metaDescription?: string | null
  h1?: string | null
  outline?: string[] | null
  keyword?: string | null
  audience?: string | null
  cta?: string | null
  mode?: 'activa' | 'pasiva' | string | null
}

export interface SeoQualityCheck {
  id: 'title' | 'meta' | 'keyword' | 'h1' | 'outline' | 'audience' | 'cta'
  ok: boolean
  value: string
}

export interface SeoQualityResult {
  passed: boolean
  checks: SeoQualityCheck[]
}

export const SEO_TITLE_RANGE = { min: 50, max: 60 } as const
export const SEO_META_RANGE = { min: 120, max: 158 } as const
export const SEO_OUTLINE_MIN = 4

const text = (value: unknown) => (typeof value === 'string' ? value : '')

export function evaluateSeoArticleQuality(article: SeoArticleForQuality): SeoQualityResult {
  const title = text(article.title)
  const metaDescription = text(article.metaDescription)
  const h1 = text(article.h1)
  const outline = Array.isArray(article.outline) ? article.outline.filter((item) => typeof item === 'string' && item.trim()) : []
  const keyword = text(article.keyword).trim().toLowerCase()
  const audience = text(article.audience).trim()
  const cta = text(article.cta).trim()
  const combined = `${title} ${metaDescription} ${h1}`.toLowerCase()

  const checks: SeoQualityCheck[] = [
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

/**
 * Extrae del Markdown guardado lo que el gate necesita: la H1 (primer `# `)
 * y el esquema (`## `). Lo que la base no guarda (meta, keyword, audiencia,
 * CTA, modo) lo aporta el cliente como contexto de la petición.
 */
export function articleFromMarkdown(name: string, content: string | null | undefined, context: Partial<SeoArticleForQuality> = {}): SeoArticleForQuality {
  const lines = (content ?? '').split('\n').map((line) => line.trim())
  const h1 = lines.find((line) => /^#\s+\S/.test(line))?.replace(/^#\s+/, '') ?? null
  const outline = lines.filter((line) => /^##\s+\S/.test(line)).map((line) => line.replace(/^##\s+/, ''))
  const firstParagraph = lines.find((line) => line && !line.startsWith('#') && !line.startsWith('META:')) ?? ''
  return {
    title: context.title ?? name,
    metaDescription: context.metaDescription ?? firstParagraph.slice(0, SEO_META_RANGE.max),
    h1: context.h1 ?? h1 ?? name,
    outline: context.outline?.length ? context.outline : outline,
    keyword: context.keyword ?? null,
    audience: context.audience ?? null,
    cta: context.cta ?? null,
    mode: context.mode ?? null,
  }
}
