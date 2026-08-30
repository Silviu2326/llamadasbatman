import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowRightLine,
  RiCheckLine,
  RiCodeBoxLine,
  RiFileCopyLine,
  RiFileTextLine,
  RiFlashlightLine,
  RiLoader4Line,
  RiMagicLine,
  RiSendPlaneLine,
  RiShieldCheckLine,
} from 'react-icons/ri'
import './seo-components.css'
import { apiFetch } from '../../lib/api'

const MODE_COPY = {
  activa: {
    label: 'Activa',
    title: 'Captura demanda lista para comprar',
    helper: 'Servicios, páginas locales y comparativas con una llamada a la acción clara.',
    format: 'Página de servicio comercial',
    icon: RiFlashlightLine,
  },
  pasiva: {
    label: 'Pasiva',
    title: 'Gana visibilidad antes de la decisión',
    helper: 'Guías, preguntas frecuentes y contenidos educativos que construyen autoridad.',
    format: 'Guía informativa SEO',
    icon: RiFileTextLine,
  },
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

function qualityChecks({ preview, keyword, audience, cta, mode }) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  const title = preview.title ?? ''
  const metaDescription = preview.metaDescription ?? ''
  const h1 = preview.h1 ?? ''
  const outline = Array.isArray(preview.outline) ? preview.outline : []
  const combined = `${title} ${metaDescription} ${h1}`.toLowerCase()
  return [
    { id: 'title', label: 'SEO title dentro de 50–60 caracteres', ok: title.length >= 50 && title.length <= 60, value: `${title.length}/60` },
    { id: 'meta', label: 'Meta description dentro de 120–158 caracteres', ok: metaDescription.length >= 120 && metaDescription.length <= 158, value: `${metaDescription.length}/158` },
    { id: 'keyword', label: 'Keyword presente en los elementos principales', ok: Boolean(normalizedKeyword && combined.includes(normalizedKeyword)), value: normalizedKeyword ? 'Detectada' : 'Pendiente' },
    { id: 'h1', label: 'Una H1 clara y específica', ok: h1.trim().length > 0, value: h1 ? 'Lista' : 'Pendiente' },
    { id: 'outline', label: 'Esquema con al menos 4 bloques útiles', ok: outline.length >= 4, value: `${outline.length} bloques` },
    { id: 'audience', label: 'Audiencia definida para ajustar la intención', ok: Boolean(audience.trim()), value: audience.trim() ? 'Definida' : 'Pendiente' },
    { id: 'cta', label: mode === 'activa' ? 'CTA concreta y verificable' : 'Próximos pasos sin promesas', ok: Boolean(cta.trim()), value: cta.trim() ? 'Lista' : 'Pendiente' },
  ]
}

function PromptBlock({ value }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="seo-factory-prompt">
      <div className="seo-factory-prompt-head">
        <span><RiCodeBoxLine /> Prompt para DeepSeek</span>
        <button type="button" className="seo-button small" onClick={copy}>
          <RiFileCopyLine /> {copied ? 'Copiado' : 'Copiar prompt'}
        </button>
      </div>
      <pre>{value}</pre>
    </div>
  )
}

export default function SeoPageFactory({ report, form, onOpenAudit, preferredKeyword = '', preferredMode = 'activa' }) {
  const navigate = useNavigate()
  const initialKeyword = preferredKeyword || report?.keywords?.[0]?.keyword || ''
  const [mode, setMode] = useState(preferredMode)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [brief, setBrief] = useState('')
  const [audience, setAudience] = useState('')
  const [city, setCity] = useState(form.city ?? '')
  const [tone, setTone] = useState('Profesional y directo')
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

  const copy = MODE_COPY[mode]
  const Icon = copy.icon
  const draft = useMemo(() => buildDraft({ mode, keyword, brief, audience, city, tone, cta, business: form.business }), [mode, keyword, brief, audience, city, tone, cta, form.business])
  const preview = generated || draft
  const checks = useMemo(() => qualityChecks({ preview, keyword, audience, cta, mode }), [audience, cta, keyword, mode, preview])
  const failedChecks = checks.filter((check) => !check.ok)
  const prompt = useMemo(() => `Actúa como estratega y redactor SEO senior. Devuelve JSON válido en español con las claves: seoTitle, metaDescription, h1, slug, outline (array de strings), bodyMarkdown y schemaJsonLd.

Modo: ${copy.label} (${copy.format})
Keyword principal: ${keyword.trim() || '[obligatoria]'}
Negocio: ${form.business || '[pendiente]'}
Sector: ${form.sector || '[pendiente]'}
Ciudad o zona: ${city.trim() || '[sin ubicación]'}
Audiencia: ${audience.trim() || '[define una audiencia concreta]'}
Brief: ${brief.trim() || '[explica la oferta, diferenciadores y prueba disponible]'}
Tono: ${tone}
CTA: ${cta.trim() || '[define una llamada a la acción]'}

Reglas: ${mode === 'activa' ? 'prioriza intención comercial, objeciones, beneficios verificables, confianza y una CTA sin promesas absolutas.' : 'prioriza intención informacional, claridad, ejemplos prácticos, preguntas frecuentes y enlaces internos sugeridos.'} No inventes datos, clientes, cifras ni garantías. Usa la keyword de forma natural, crea una sola H1, títulos SEO de 50-60 caracteres y meta description de 120-158 caracteres.`, [audience, brief, city, copy.format, copy.label, cta, form.business, form.sector, keyword, mode, tone])

  function updateQueue(item) {
    setQueue((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 5))
  }

  async function generate() {
    setError('')
    setNotice('')
    setValidated(false)
    setPublished(false)
    if (!keyword.trim() || !brief.trim()) {
      setError('Añade una keyword principal y un brief: DeepSeek necesita ese contexto para generar una página útil.')
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
      if (!response.ok) throw new Error(body?.error || 'DeepSeek no pudo generar la página.')
      const data = body?.data ?? {}
      const result = { ...draft, ...data, mode, keyword: keyword.trim(), status: 'Borrador', generatedAt: new Date().toISOString() }
      setGenerated(result)
      updateQueue({ id: data.articleId || `${Date.now()}`, title: draft.title, keyword: keyword.trim(), mode, status: 'Borrador' })
      setNotice('Página generada y guardada como borrador en tu base de conocimiento.')
    } catch (generationError) {
      setError(generationError.message)
    } finally {
      setLoading(false)
    }
  }

  function validate() {
    setValidated(failedChecks.length === 0)
    setNotice(failedChecks.length ? `Revisión pendiente: ${failedChecks.slice(0, 3).map((check) => check.label.toLowerCase()).join('; ')}${failedChecks.length > 3 ? '; …' : '.'}` : 'Quality gate superado: title, meta, H1, intención y CTA listos.')
  }

  async function publish() {
    if (!generated?.articleId) return
    setError('')
    try {
      const response = await apiFetch(`/api/seo/content/${encodeURIComponent(generated.articleId)}/publish`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'No se pudo publicar el borrador.')
      setPublished(true)
      setGenerated((current) => ({ ...current, status: 'Publicada', publishedSlug: body?.data?.slug }))
      updateQueue({ id: generated.articleId, title: generated.title, keyword: generated.keyword, mode, status: 'Publicada' })
      setNotice('Página publicada en el blog indexable. Ya puedes enlazarla desde una landing.')
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
            <span className="seo-overline">Fábrica de páginas</span>
            <h2 id="seo-factory-title">Crea páginas que puedan posicionar</h2>
            <p>Brief → DeepSeek → validación SEO → publicación. La misma pantalla para contenido activo y pasivo.</p>
          </div>
        </div>
        {!report ? <button type="button" className="seo-button small" onClick={onOpenAudit}><RiArrowRightLine /> Auditar web primero</button> : null}
      </header>

      <div className="seo-factory-grid">
        <div className="seo-factory-builder">
          <div className="seo-factory-mode" role="tablist" aria-label="Modo de página">
            {Object.entries(MODE_COPY).map(([id, item]) => {
              const ModeIcon = item.icon
              return <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}><ModeIcon /> <span><b>{item.label}</b><small>{id === 'activa' ? 'Servicio / conversión' : 'Guía / autoridad'}</small></span></button>
            })}
          </div>
          <div className="seo-factory-mode-copy"><Icon /> <span><strong>{copy.title}</strong><small>{copy.helper}</small></span></div>
          <div className="seo-factory-form">
            <label className="full"><span>Keyword principal <i>*</i></span><input className="seo-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="ej. fisioterapia deportiva en Madrid" /></label>
            <label><span>Audiencia</span><input className="seo-input" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="ej. responsables de marketing" /></label>
            <label><span>Zona objetivo</span><input className="seo-input" value={city} onChange={(event) => setCity(event.target.value)} placeholder="España o ciudad" /></label>
            <label className="full"><span>Brief de página <i>*</i></span><textarea className="seo-textarea" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Qué ofreces, para quién, qué te diferencia y qué debe hacer la persona al terminar." /></label>
            <label><span>Tono</span><select className="seo-select" value={tone} onChange={(event) => setTone(event.target.value)}><option>Profesional y directo</option><option>Claro y cercano</option><option>Experto y didáctico</option></select></label>
            <label><span>CTA final</span><input className="seo-input" value={cta} onChange={(event) => setCta(event.target.value)} placeholder="solicita una valoración" /></label>
          </div>
          {error ? <p className="seo-inline-error"><RiShieldCheckLine /> {error}</p> : null}
          {notice ? <p className={`seo-inline-${validated || published ? 'ok' : 'notice'}`}><RiCheckLine /> {notice}</p> : null}
          <button type="button" className="seo-button primary seo-factory-generate" onClick={generate} disabled={loading}>
            {loading ? <><RiLoader4Line className="seo-spin" /> DeepSeek está redactando…</> : <><RiMagicLine /> Generar con DeepSeek</>}
          </button>
          <p className="seo-factory-note">Se guarda como borrador para revisarlo antes de publicar. No inventamos pruebas, cifras ni garantías.</p>
        </div>

        <div className="seo-factory-preview">
          <div className="seo-factory-preview-head"><div><span className="seo-overline">Vista previa</span><h3>{preview.title}</h3></div><span className={`seo-pill ${published ? 'tone-ok' : validated ? 'tone-cyan' : ''}`}>{generated?.status || 'Borrador'}</span></div>
          <div className="seo-factory-fields">
            <div><span>SEO title <b>{preview.title.length}/60</b></span><strong>{preview.title}</strong></div>
            <div><span>Meta description <b>{preview.metaDescription.length}/158</b></span><p>{preview.metaDescription}</p></div>
            <div><span>H1</span><strong>{preview.h1}</strong></div>
            <div><span>Slug</span><code>{preview.slug}</code></div>
          </div>
          <div className="seo-factory-outline"><div><span>Esquema de contenido</span><b>{copy.label}</b></div><ol>{preview.outline.map((item) => <li key={item}><span>H2</span>{item}</li>)}</ol></div>
          <div className="seo-factory-quality">
            <div className="seo-factory-quality-head"><span>Quality gate</span><b className={failedChecks.length ? 'is-pending' : 'is-ready'}>{checks.length - failedChecks.length}/{checks.length} listos</b></div>
            <div className="seo-factory-quality-list">{checks.map((check) => <div key={check.id} className={check.ok ? 'is-ready' : 'is-pending'}><span>{check.ok ? <RiCheckLine /> : <i />}</span><strong>{check.label}</strong><small>{check.value}</small></div>)}</div>
          </div>
          <div className="seo-factory-actions"><button type="button" className="seo-button small" onClick={validate}><RiShieldCheckLine /> Validar estructura</button>{generated?.articleId ? <><button type="button" className="seo-button small" onClick={() => navigate(`/knowledge-base/articulos/${generated.articleId}`)}><RiFileTextLine /> Ver contenido</button>{!published ? <button type="button" className="seo-button small" onClick={publish} disabled={!validated}><RiSendPlaneLine /> Publicar</button> : null}</> : null}</div>
          {prompt ? <PromptBlock value={prompt} /> : null}
        </div>
      </div>

      {queue.length ? <div className="seo-factory-queue"><div><span className="seo-overline">Cola de generación</span><strong>{queue.length} páginas en esta sesión</strong></div><div className="seo-factory-queue-list">{queue.map((item) => <span key={item.id}><i className={item.status === 'Publicada' ? 'is-live' : item.mode === 'activa' ? 'is-active' : 'is-passive'} />{item.title}<b>{item.status}</b></span>)}</div></div> : null}
    </section>
  )
}
