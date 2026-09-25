import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowRightLine,
  RiCheckLine,
  RiFileTextLine,
  RiFlashlightLine,
  RiLoader4Line,
  RiMagicLine,
  RiSendPlaneLine,
  RiShieldCheckLine,
} from 'react-icons/ri'
import './seo-components.css'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../i18n'
import { evaluateSeoArticleQuality } from '../../lib/seoQuality'

// `format` es el nombre del formato que recibe el backend (contenido, no UI):
// las etiquetas visibles se traducen por clave `webSeo.factory.mode.*`.
const MODE_META = {
  activa: { format: 'Página de servicio comercial', icon: RiFlashlightLine },
  pasiva: { format: 'Guía informativa SEO', icon: RiFileTextLine },
}
const modeCopy = (id, t) => ({ ...MODE_META[id], label: t(`webSeo.factory.mode.${id}`), title: t(`webSeo.factory.mode.${id}Title`), helper: t(`webSeo.factory.mode.${id}Helper`), sub: t(`webSeo.factory.mode.${id}Sub`) })

// Etiqueta y valor legibles de cada check del quality gate (mismos ids que el backend).
function describeCheck(check, mode, t) {
  const label = check.id === 'cta' ? t(mode === 'activa' ? 'webSeo.factory.checks.ctaActive' : 'webSeo.factory.checks.ctaPassive') : t(`webSeo.factory.checks.${check.id}`)
  const value = /^\d+\/\d+$/.test(check.value) ? check.value
    : check.id === 'outline' ? t('webSeo.factory.value.blocks', { n: check.value })
      : t(`webSeo.factory.value.${check.value}`)
  return { ...check, label, value }
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'pagina-seo'
}

function buildDraft({ mode, keyword, brief, audience, city, tone, cta, business }) {
  const cleanKeyword = keyword.trim() || 'tu servicio principal'
  const place = city.trim() ? ` en ${city.trim()}` : ''
  const businessName = business.trim() || 'tu negocio'
  const title = mode === 'activa'
    ? `${cleanKeyword}${place} | ${businessName}`
    : `Guía de ${cleanKeyword}: claves, consejos y próximos pasos`
  const metaDescription = mode === 'activa'
    ? `Descubre cómo ${cleanKeyword}${place} puede ayudarte. Conoce el proceso, ventajas y ${cta.trim().toLowerCase() || 'da el siguiente paso'}.`.slice(0, 158)
    : `Aprende todo lo necesario sobre ${cleanKeyword}: criterios, errores habituales y recomendaciones prácticas para ${audience.trim().toLowerCase() || 'tomar una buena decisión'}.`.slice(0, 158)
  const h1 = mode === 'activa'
    ? `${cleanKeyword}${place} para ${audience.trim().toLowerCase() || 'tu negocio'}`
    : `Todo lo que necesitas saber sobre ${cleanKeyword}`
  const outline = mode === 'activa'
    ? [`Qué incluye ${cleanKeyword}`, 'Cómo trabajamos y qué puedes esperar', 'Ventajas frente a hacerlo por tu cuenta', 'Preguntas frecuentes', cta.trim() || 'Solicita información']
    : [`Qué es ${cleanKeyword} y cuándo lo necesitas`, 'Cómo elegir la mejor opción', 'Errores frecuentes que conviene evitar', 'Preguntas frecuentes', 'Conclusión y próximos pasos']
  return { title, metaDescription, h1, slug: `/${slugify(title)}`, outline, businessName, brief, tone }
}

export default function SeoPageFactory({ report, form, onOpenAudit, preferredKeyword = '', preferredMode = 'activa' }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const initialKeyword = preferredKeyword || report?.keywords?.[0]?.keyword || ''
  const [mode, setMode] = useState(preferredMode)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [brief, setBrief] = useState('')
  const [audience, setAudience] = useState('')
  const [city, setCity] = useState(form.city ?? '')
  const [tone, setTone] = useState('Profesional y directo')
  // Checks calculados por el backend para el artículo generado (manda sobre el cálculo local).
  const [serverChecks, setServerChecks] = useState(null)
  const [cta, setCta] = useState('solicita una valoración')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [generated, setGenerated] = useState(null)
  const [validated, setValidated] = useState(false)
  const [published, setPublished] = useState(false)
  const [queue, setQueue] = useState([])

  useEffect(() => {
    if (initialKeyword) setKeyword(initialKeyword)
  }, [initialKeyword])

  useEffect(() => {
    if (preferredMode === 'activa' || preferredMode === 'pasiva') setMode(preferredMode)
  }, [preferredMode])

  useEffect(() => {
    if (!city && form.city) setCity(form.city)
  }, [city, form.city])

  const copy = modeCopy(mode, t)
  const Icon = copy.icon
  const draft = useMemo(() => buildDraft({ mode, keyword, brief, audience, city, tone, cta, business: form.business }), [mode, keyword, brief, audience, city, tone, cta, form.business])
  const preview = generated || draft
  // Contexto del gate que la base no guarda: viaja al backend en GET /quality y en el publish.
  const qualityContext = useMemo(() => ({ keyword: keyword.trim(), audience: audience.trim(), cta: cta.trim(), mode, metaDescription: preview.metaDescription ?? '', title: preview.title ?? '', h1: preview.h1 ?? '', outline: Array.isArray(preview.outline) ? preview.outline : [] }), [audience, cta, keyword, mode, preview])
  const localChecks = useMemo(() => evaluateSeoArticleQuality(qualityContext).checks, [qualityContext])
  const checks = useMemo(() => (serverChecks ?? localChecks).map((check) => describeCheck(check, mode, t)), [localChecks, mode, serverChecks, t])
  const failedChecks = checks.filter((check) => !check.ok)

  // Con artículo generado, el backend calcula los checks con la misma función: es la fuente de verdad.
  useEffect(() => {
    if (!generated?.articleId) { setServerChecks(null); return undefined }
    const controller = new AbortController()
    const params = new URLSearchParams({ keyword: qualityContext.keyword, audience: qualityContext.audience, cta: qualityContext.cta, mode: qualityContext.mode, metaDescription: qualityContext.metaDescription, title: qualityContext.title, h1: qualityContext.h1, outline: qualityContext.outline.join('|') })
    apiFetch(`/api/seo/content/${encodeURIComponent(generated.articleId)}/quality?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (Array.isArray(body?.data?.checks)) setServerChecks(body.data.checks) })
      .catch(() => {})
    return () => controller.abort()
  }, [generated?.articleId, qualityContext])

  function updateQueue(item) {
    setQueue((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 5))
  }

  async function generate() {
    setError('')
    setNotice('')
    setValidated(false)
    setPublished(false)
    if (!keyword.trim() || !brief.trim()) {
      setError(t('webSeo.factory.needKeywordBrief'))
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch('/api/seo/content', {
        method: 'POST',
        body: JSON.stringify({
          title: draft.title,
          keyword: keyword.trim(),
          format: copy.format,
          business: form.business,
          sector: form.sector,
          city: city.trim(),
          mode,
          brief: brief.trim(),
          audience: audience.trim(),
          tone,
          cta: cta.trim(),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || t('webSeo.factory.generateFailed'))
      const data = body?.data ?? {}
      const result = { ...draft, ...data, mode, keyword: keyword.trim(), status: 'draft', generatedAt: new Date().toISOString() }
      setGenerated(result)
      updateQueue({ id: data.articleId || `${Date.now()}`, title: draft.title, keyword: keyword.trim(), mode, status: 'draft' })
      setNotice(t('webSeo.factory.generated'))
    } catch (generationError) {
      setError(generationError.message)
    } finally {
      setLoading(false)
    }
  }

  function validate() {
    setValidated(failedChecks.length === 0)
    setNotice(failedChecks.length ? t('webSeo.factory.reviewPending', { items: `${failedChecks.slice(0, 3).map((check) => check.label.toLowerCase()).join('; ')}${failedChecks.length > 3 ? '; …' : '.'}` }) : t('webSeo.factory.gatePassed'))
  }

  async function publish() {
    if (!generated?.articleId) return
    setError('')
    try {
      const response = await apiFetch(`/api/seo/content/${encodeURIComponent(generated.articleId)}/publish`, { method: 'POST', body: JSON.stringify(qualityContext) })
      const body = await response.json().catch(() => ({}))
      // 422 QUALITY_CHECKS_FAILED: el backend devuelve sus checks y la UI los enseña tal cual.
      if (response.status === 422 && body?.code === 'QUALITY_CHECKS_FAILED' && Array.isArray(body.checks)) {
        setServerChecks(body.checks)
        setValidated(false)
        throw new Error(t('webSeo.factory.gateFailed'))
      }
      if (!response.ok) throw new Error(body?.error || t('webSeo.factory.publishFailed'))
      if (Array.isArray(body?.data?.checks)) setServerChecks(body.data.checks)
      setPublished(true)
      setGenerated((current) => ({ ...current, status: 'published', publishedSlug: body?.data?.slug }))
      updateQueue({ id: generated.articleId, title: generated.title, keyword: generated.keyword, mode, status: 'published' })
      setNotice(t('webSeo.factory.published'))
    } catch (publishError) {
      setError(publishError.message)
    }
  }

  return (
    <section className="seo-factory" aria-labelledby="seo-factory-title">
      <header className="seo-factory-head">
        <div className="seo-factory-title">
          <span className="seo-factory-icon"><RiMagicLine /></span>
          <div>
            <span className="seo-overline">{t('webSeo.factory.overline')}</span>
            <h2 id="seo-factory-title">{t('webSeo.factory.title')}</h2>
            <p>{t('webSeo.factory.intro')}</p>
          </div>
        </div>
        {!report ? <button type="button" className="seo-button small" onClick={onOpenAudit}><RiArrowRightLine /> {t('webSeo.factory.auditFirst')}</button> : null}
      </header>

      <div className="seo-factory-grid">
        <div className="seo-factory-builder">
          <div className="seo-factory-mode" role="tablist" aria-label={t('webSeo.factory.modeAria')}>
            {Object.keys(MODE_META).map((id) => {
              const item = modeCopy(id, t)
              const ModeIcon = item.icon
              return <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}><ModeIcon /> <span><b>{item.label}</b><small>{item.sub}</small></span></button>
            })}
          </div>
          <div className="seo-factory-mode-copy"><Icon /> <span><strong>{copy.title}</strong><small>{copy.helper}</small></span></div>
          <div className="seo-factory-form">
            <label className="full"><span>{t('webSeo.factory.keyword')} <i>*</i></span><input className="seo-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t('webSeo.factory.keywordPlaceholder')} /></label>
            <label><span>{t('webSeo.factory.audience')}</span><input className="seo-input" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder={t('webSeo.factory.audiencePlaceholder')} /></label>
            <label><span>{t('webSeo.factory.zone')}</span><input className="seo-input" value={city} onChange={(event) => setCity(event.target.value)} placeholder={t('webSeo.factory.zonePlaceholder')} /></label>
            <label className="full"><span>{t('webSeo.factory.brief')} <i>*</i></span><textarea className="seo-textarea" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder={t('webSeo.factory.briefPlaceholder')} /></label>
            {/* El valor del tono viaja al backend en español (contrato del prompt); solo la etiqueta se traduce. */}
            <label><span>{t('webSeo.factory.tone')}</span><select className="seo-select" value={tone} onChange={(event) => setTone(event.target.value)}><option value="Profesional y directo">{t('webSeo.factory.toneProfessional')}</option><option value="Claro y cercano">{t('webSeo.factory.toneClear')}</option><option value="Experto y didáctico">{t('webSeo.factory.toneExpert')}</option></select></label>
            <label><span>{t('webSeo.factory.cta')}</span><input className="seo-input" value={cta} onChange={(event) => setCta(event.target.value)} placeholder={t('webSeo.factory.ctaPlaceholder')} /></label>
          </div>
          {error ? <p className="seo-inline-error"><RiShieldCheckLine /> {error}</p> : null}
          {notice ? <p className={`seo-inline-${validated || published ? 'ok' : 'notice'}`}><RiCheckLine /> {notice}</p> : null}
          <button type="button" className="seo-button primary seo-factory-generate" onClick={generate} disabled={loading}>
            {loading ? <><RiLoader4Line className="seo-spin" /> {t('webSeo.factory.writing')}</> : <><RiMagicLine /> {t('webSeo.factory.generate')}</>}
          </button>
          <p className="seo-factory-note">{t('webSeo.factory.note')}</p>
        </div>

        <div className="seo-factory-preview">
          <div className="seo-factory-preview-head"><div><span className="seo-overline">{t('webSeo.factory.preview')}</span><h3>{preview.title}</h3></div><span className={`seo-pill ${published ? 'tone-ok' : validated ? 'tone-cyan' : ''}`}>{t(`webSeo.factory.status.${generated?.status || 'draft'}`)}</span></div>
          <div className="seo-factory-fields">
            <div><span>{t('webSeo.factory.seoTitle')} <b>{preview.title.length}/60</b></span><strong>{preview.title}</strong></div>
            <div><span>{t('webSeo.factory.metaDescription')} <b>{preview.metaDescription.length}/158</b></span><p>{preview.metaDescription}</p></div>
            <div><span>H1</span><strong>{preview.h1}</strong></div>
            <div><span>Slug</span><code>{preview.slug}</code></div>
          </div>
          <div className="seo-factory-outline"><div><span>{t('webSeo.factory.outline')}</span><b>{copy.label}</b></div><ol>{preview.outline.map((item) => <li key={item}><span>H2</span>{item}</li>)}</ol></div>
          <div className="seo-factory-quality">
            <div className="seo-factory-quality-head"><span>{t('webSeo.factory.qualityGate')}{serverChecks ? <small> · {t('webSeo.factory.backendChecks')}</small> : null}</span><b className={failedChecks.length ? 'is-pending' : 'is-ready'}>{t('webSeo.factory.ready', { done: checks.length - failedChecks.length, total: checks.length })}</b></div>
            <div className="seo-factory-quality-list">{checks.map((check) => <div key={check.id} className={check.ok ? 'is-ready' : 'is-pending'}><span>{check.ok ? <RiCheckLine /> : <i />}</span><strong>{check.label}</strong><small>{check.value}</small></div>)}</div>
          </div>
          <div className="seo-factory-actions"><button type="button" className="seo-button small" onClick={validate}><RiShieldCheckLine /> {t('webSeo.factory.validate')}</button>{generated?.articleId ? <><button type="button" className="seo-button small" onClick={() => navigate(`/knowledge-base/articulos/${generated.articleId}`)}><RiFileTextLine /> {t('webSeo.factory.seeContent')}</button>{!published ? <button type="button" className="seo-button small" onClick={publish} disabled={!validated}><RiSendPlaneLine /> {t('webSeo.factory.publish')}</button> : null}</> : null}</div>
        </div>
      </div>

      {queue.length ? <div className="seo-factory-queue"><div><span className="seo-overline">{t('webSeo.factory.queue')}</span><strong>{t('webSeo.factory.pagesSession', { n: queue.length })}</strong></div><div className="seo-factory-queue-list">{queue.map((item) => <span key={item.id}><i className={item.status === 'published' ? 'is-live' : item.mode === 'activa' ? 'is-active' : 'is-passive'} />{item.title}<b>{t(`webSeo.factory.status.${item.status}`)}</b></span>)}</div></div> : null}
    </section>
  )
}
