import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAdvertisementLine, RiCheckLine, RiCloseLine, RiFileCopyLine, RiFileTextLine,
  RiGlobalLine, RiLineChartLine, RiLoader4Line, RiMapPin2Line, RiSearchEyeLine,
  RiShareForwardLine, RiSwordLine, RiToolsLine, RiUserAddLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'

// El informe vivía en `localStorage` del navegador. Eso significaba que el
// mismo negocio veía cosas distintas en dos ordenadores, que el trabajo se
// perdía al limpiar el almacenamiento y que el centro de mando orgánico no
// podía leer lo que la pantalla estaba enseñando. Se persistía en `SeoReport`
// desde el primer día: ahora se lee de ahí (`organico.md` fase 0 y §7.3).

async function readJson(response, fallbackError) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error || fallbackError)
  return body
}

const INTENT_LABELS = {
  informacional: 'Informacional',
  comercial: 'Comercial',
  transaccional: 'Transaccional',
  local: 'Local',
}

const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'twitter']

const SEVERITY_COLORS = { alta: 'var(--danger)', media: 'var(--warn)', baja: 'var(--muted)' }

function scoreColor(score) {
  return score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warn)' : 'var(--danger)'
}

function hostnameOf(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Card({ icon: Icon, title, subtitle, children }) {
  return (
    <section style={styles.card}>
      <h2 style={styles.cardTitle}><Icon style={{ width: 18, height: 18, color: 'var(--accent)' }} /> {title}</h2>
      {subtitle ? <p style={{ ...styles.hint, margin: '-8px 0 14px' }}>{subtitle}</p> : null}
      {children}
    </section>
  )
}

function CopyBlock({ label, value }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // El usuario puede seleccionar el texto manualmente.
    }
  }
  return (
    <div style={styles.copyBlock}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</strong>
        <button type="button" onClick={copy} style={styles.smallButton}>
          <RiFileCopyLine style={{ width: 13, height: 13 }} /> {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre style={styles.pre}>{value}</pre>
    </div>
  )
}

function Sparkline({ points }) {
  if (points.length < 2) return null
  const width = 420
  const height = 64
  const max = 100
  const step = width / (points.length - 1)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (p.score / max) * height).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: 420, height: 64, display: 'block' }} aria-hidden="true">
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={(i * step).toFixed(1)} cy={(height - (p.score / max) * height).toFixed(1)} r="3.5" fill={p.auto ? 'var(--muted)' : 'var(--accent)'} />
      ))}
    </svg>
  )
}

export default function SeoPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ url: '', business: '', sector: '', city: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  // `null` mientras se pregunta al backend: sin esto la pantalla enseñaría el
  // estado vacío durante un instante y parecería que no hay ningún informe.
  const [reportLoading, setReportLoading] = useState(true)
  const [openingReportId, setOpeningReportId] = useState('')

  const [history, setHistory] = useState([])
  const [searchConsole, setSearchConsole] = useState(null)
  const [campaigns, setCampaigns] = useState([])

  const [competitorUrls, setCompetitorUrls] = useState(['', '', ''])
  const [competitors, setCompetitors] = useState(null)
  const [competitorsLoading, setCompetitorsLoading] = useState(false)
  const [competitorsError, setCompetitorsError] = useState('')

  const [contentState, setContentState] = useState({})
  const [landingApply, setLandingApply] = useState({ campaignId: '', saving: false, done: '', error: '' })
  const [adsSaving, setAdsSaving] = useState(false)

  const [alerts, setAlerts] = useState([])
  const [share, setShare] = useState({ loading: false, url: '', error: '' })
  const [magnetCampaignId, setMagnetCampaignId] = useState('')
  const [magnetCopied, setMagnetCopied] = useState(false)
  const [gap, setGap] = useState({ loading: false, items: null, error: '' })
  const [cannibal, setCannibal] = useState({ loading: false, items: null, error: '' })
  const [stale, setStale] = useState([])
  const [staleState, setStaleState] = useState({})

  const landingCampaigns = useMemo(() => campaigns.filter((c) => c.landingSlug), [campaigns])

  const reportUrl = report?.url ?? ''

  // El último informe guardado es el estado inicial de la pantalla.
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/seo/reports/latest', { signal: controller.signal })
      .then((response) => readJson(response, 'No se pudo cargar el último informe'))
      .then((body) => {
        if (body?.data) {
          setReport(body.data)
          setForm((prev) => ({
            ...prev,
            url: prev.url || body.data.url || '',
            business: prev.business || body.data.business || '',
            sector: prev.sector || body.data.sector || '',
            city: prev.city || body.data.city || '',
          }))
        }
      })
      .catch(() => {})
      .finally(() => setReportLoading(false))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`/api/seo/history${reportUrl ? `?url=${encodeURIComponent(reportUrl)}` : ''}`, { signal: controller.signal })
      .then((response) => readJson(response, 'No se pudo cargar el historial'))
      .then((body) => {
        setHistory(Array.isArray(body.data) ? body.data : [])
        setAlerts(Array.isArray(body.alerts) ? body.alerts : [])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [reportUrl])

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/seo/content/stale', { signal: controller.signal })
      .then((response) => readJson(response, 'No se pudo cargar el contenido caducado'))
      .then((body) => setStale(Array.isArray(body.data) ? body.data : []))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!report?.keywords?.length) return undefined
    const controller = new AbortController()
    const keywords = report.keywords.map((k) => k.keyword).join(',')
    apiFetch(`/api/seo/search-console?keywords=${encodeURIComponent(keywords)}`, { signal: controller.signal })
      .then((response) => readJson(response, 'No se pudo consultar Search Console'))
      .then((body) => setSearchConsole(body.data))
      .catch(() => {})
    return () => controller.abort()
  }, [report])

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/campaigns?page=1&limit=100', { signal: controller.signal })
      .then((response) => readJson(response, 'No se pudieron cargar las campañas'))
      .then((body) => {
        const items = Array.isArray(body) ? body : body.items
        setCampaigns(Array.isArray(items) ? items : [])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  function setField(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  /** Vuelve a un informe del historial. Solo lee: no re-audita nada. */
  async function openReport(id) {
    setOpeningReportId(id)
    setError('')
    try {
      const response = await apiFetch(`/api/seo/reports/${encodeURIComponent(id)}`)
      const body = await readJson(response, 'No se pudo abrir ese informe.')
      setReport(body.data)
      setContentState({})
    } catch (openError) {
      setError(openError.message)
    } finally {
      setOpeningReportId('')
    }
  }

  async function analyze(event) {
    event.preventDefault()
    if (!form.url.trim()) {
      setError('Indica la URL de la web a analizar.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await apiFetch('/api/seo/analyze', { method: 'POST', body: JSON.stringify(form) })
      const body = await readJson(response, 'No se pudo generar el informe SEO.')
      // No hace falta guardarlo en el navegador: `/api/seo/analyze` ya lo
      // persiste en `SeoReport` antes de responder.
      setReport(body.data)
      setContentState({})
    } catch (analyzeError) {
      setError(analyzeError.message)
    } finally {
      setLoading(false)
    }
  }

  async function runCompare() {
    const urls = competitorUrls.map((u) => u.trim()).filter(Boolean)
    if (!urls.length) {
      setCompetitorsError('Añade al menos una web de la competencia.')
      return
    }
    setCompetitorsLoading(true)
    setCompetitorsError('')
    try {
      const response = await apiFetch('/api/seo/compare', { method: 'POST', body: JSON.stringify({ urls }) })
      const body = await readJson(response, 'No se pudo comparar con la competencia.')
      setCompetitors(body.data)
    } catch (compareError) {
      setCompetitorsError(compareError.message)
    } finally {
      setCompetitorsLoading(false)
    }
  }

  function patchContent(index, patch) {
    setContentState((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }))
  }

  async function writeArticle(index, item) {
    patchContent(index, { loading: true, error: '' })
    try {
      const response = await apiFetch('/api/seo/content', {
        method: 'POST',
        body: JSON.stringify({
          title: item.title,
          keyword: item.keyword,
          format: item.format,
          business: form.business,
          sector: form.sector,
          city: form.city,
        }),
      })
      const body = await readJson(response, 'No se pudo redactar el artículo.')
      patchContent(index, { loading: false, articleId: body.data.articleId })
    } catch (writeError) {
      patchContent(index, { loading: false, error: writeError.message })
    }
  }

  async function shareArticle(index) {
    const state = contentState[index] ?? {}
    const platforms = state.platforms ?? []
    if (!state.articleId || !state.shareCampaignId || !platforms.length) {
      patchContent(index, { shareError: 'Elige campaña con landing y al menos una red.' })
      return
    }
    patchContent(index, { sharing: true, shareError: '' })
    try {
      const response = await apiFetch('/api/seo/social', {
        method: 'POST',
        body: JSON.stringify({ articleId: state.articleId, campaignId: state.shareCampaignId, platforms }),
      })
      await readJson(response, 'No se pudo programar la publicación.')
      patchContent(index, { sharing: false, shared: true, shareOpen: false })
    } catch (shareError) {
      patchContent(index, { sharing: false, shareError: shareError.message })
    }
  }

  const snippets = useMemo(() => {
    if (!report) return null
    const businessName = form.business.trim() || hostnameOf(report.url)
    const mainKeyword = report.keywords?.[0]?.keyword ?? ''
    const title = `${mainKeyword.charAt(0).toUpperCase()}${mainKeyword.slice(1)} | ${businessName}`.slice(0, 70)
    const metaDescription = (report.summary ?? '').replace(/\s+/g, ' ').slice(0, 155)
    const jsonld = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: businessName,
      url: /^https?:\/\//i.test(report.url) ? report.url : `https://${report.url}`,
      ...(form.city.trim() ? { address: { '@type': 'PostalAddress', addressLocality: form.city.trim() } } : {}),
    }, null, 2)
    return {
      title,
      metaDescription,
      html: `<title>${title}</title>\n<meta name="description" content="${metaDescription}">`,
      jsonld: `<script type="application/ld+json">\n${jsonld}\n</script>`,
    }
  }, [report, form.business, form.city])

  async function applyToLanding() {
    if (!landingApply.campaignId || !snippets) return
    setLandingApply((prev) => ({ ...prev, saving: true, error: '', done: '' }))
    try {
      const response = await apiFetch('/api/seo/apply-landing', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: landingApply.campaignId,
          title: snippets.title,
          metaDescription: snippets.metaDescription,
        }),
      })
      const body = await readJson(response, 'No se pudo aplicar el SEO a la landing.')
      setLandingApply((prev) => ({ ...prev, saving: false, done: `Aplicado a /l/${body.data.landingSlug}` }))
    } catch (applyError) {
      setLandingApply((prev) => ({ ...prev, saving: false, error: applyError.message }))
    }
  }

  async function keywordsToAds() {
    if (!report?.keywords?.length) return
    setAdsSaving(true)
    try {
      const selected = report.keywords
        .filter((k) => k.intent === 'transaccional' || k.intent === 'comercial')
        .slice(0, 6)
        .map((k) => k.keyword)
      await apiFetch('/api/ads/draft', {
        method: 'PUT',
        body: JSON.stringify({
          vertical: form.sector.trim() || hostnameOf(report.url),
          objetivo: `Captar demanda de búsqueda: ${selected.join(', ')}`,
          audience: form.city.trim() ? `Personas que buscan estos servicios en ${form.city.trim()}` : '',
        }),
      })
      navigate('/captacion/nueva')
    } finally {
      setAdsSaving(false)
    }
  }

  const shareReportId = report?.reportId ?? (history.length ? history[history.length - 1].id : null)

  async function shareReport() {
    if (!shareReportId) return
    setShare({ loading: true, url: '', error: '' })
    try {
      const response = await apiFetch(`/api/seo/reports/${shareReportId}/share`, { method: 'POST' })
      const body = await readJson(response, 'No se pudo crear el enlace del informe.')
      const url = `${window.location.origin}/seo-informe/${body.data.token}`
      await navigator.clipboard.writeText(url).catch(() => {})
      setShare({ loading: false, url, error: '' })
    } catch (shareError) {
      setShare({ loading: false, url: '', error: shareError.message })
    }
  }

  async function runKeywordGap() {
    const urls = competitorUrls.map((u) => u.trim()).filter(Boolean)
    if (!urls.length) {
      setGap({ loading: false, items: null, error: 'Añade al menos una web de la competencia.' })
      return
    }
    setGap({ loading: true, items: null, error: '' })
    try {
      const response = await apiFetch('/api/seo/keyword-gap', {
        method: 'POST',
        body: JSON.stringify({ urls, keywords: (report?.keywords ?? []).map((k) => k.keyword) }),
      })
      const body = await readJson(response, 'No se pudo analizar el keyword gap.')
      setGap({ loading: false, items: body.data.gaps ?? [], error: '' })
    } catch (gapError) {
      setGap({ loading: false, items: null, error: gapError.message })
    }
  }

  async function runCannibalization() {
    setCannibal({ loading: true, items: null, error: '' })
    try {
      const response = await apiFetch('/api/seo/cannibalization')
      const body = await readJson(response, 'No se pudo consultar la canibalización.')
      setCannibal({ loading: false, items: body.data ?? [], error: '' })
    } catch (cannibalError) {
      setCannibal({ loading: false, items: null, error: cannibalError.message })
    }
  }

  async function refreshStale(id) {
    setStaleState((prev) => ({ ...prev, [id]: { loading: true, error: '' } }))
    try {
      const response = await apiFetch(`/api/seo/content/${id}/refresh`, { method: 'POST' })
      await readJson(response, 'No se pudo refrescar el artículo.')
      setStaleState((prev) => ({ ...prev, [id]: { loading: false, done: true } }))
      setStale((prev) => prev.filter((item) => item.id !== id))
    } catch (refreshError) {
      setStaleState((prev) => ({ ...prev, [id]: { loading: false, error: refreshError.message } }))
    }
  }

  const magnetUrl = useMemo(() => {
    const campaign = landingCampaigns.find((c) => c.id === magnetCampaignId)
    return campaign ? `${window.location.origin}/audita/${campaign.landingSlug}` : ''
  }, [landingCampaigns, magnetCampaignId])

  async function copyMagnetUrl() {
    if (!magnetUrl) return
    try {
      await navigator.clipboard.writeText(magnetUrl)
      setMagnetCopied(true)
      setTimeout(() => setMagnetCopied(false), 1500)
    } catch {
      // El usuario puede copiar el texto mostrado manualmente.
    }
  }

  return (
    <div style={styles.page}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={styles.title}>SEO</h1>
        <p style={styles.subtitle}>
          Tu agencia SEO integrada: auditoría técnica, keywords, contenidos redactados y publicados,
          vigilancia de competidores y datos reales de Google en un solo sitio.
        </p>
      </header>

      {alerts.map((alert) => (
        <div key={alert.type} style={styles.warnBanner}>
          ⚠ {alert.message} ({new Date(alert.at).toLocaleDateString()})
        </div>
      ))}

      <form onSubmit={analyze} style={styles.card}>
        <div style={styles.formGrid}>
          <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
            <span style={styles.label}>URL de la web *</span>
            <input style={styles.input} type="text" value={form.url} onChange={setField('url')} placeholder="https://tunegocio.com" required />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Sector</span>
            <input style={styles.input} type="text" value={form.sector} onChange={setField('sector')} placeholder="clínica dental, restaurante…" />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Ciudad</span>
            <input style={styles.input} type="text" value={form.city} onChange={setField('city')} placeholder="Madrid" />
          </label>
          <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
            <span style={styles.label}>Describe tu negocio (opcional)</span>
            <textarea
              style={{ ...styles.input, minHeight: 64, resize: 'vertical' }}
              value={form.business}
              onChange={setField('business')}
              placeholder="Qué vendes, a quién y qué te diferencia. Cuanto más contexto, mejores keywords."
            />
          </label>
        </div>
        {error ? <p style={styles.error}>{error}</p> : null}
        <button type="submit" disabled={loading} style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}>
          {loading
            ? <><RiLoader4Line className="spin" style={{ width: 16, height: 16 }} /> Analizando tu web…</>
            : <><RiSearchEyeLine style={{ width: 16, height: 16 }} /> Analizar mi web</>}
        </button>
        {loading ? <p style={{ ...styles.subtitle, marginTop: 10 }}>Auditamos la web y redactamos el plan. Suele tardar menos de un minuto.</p> : null}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {history.length >= 2 ? (
          <Card icon={RiLineChartLine} title="Evolución del score" subtitle="Cada análisis queda guardado. Los puntos grises son re-auditorías automáticas semanales.">
            <Sparkline points={history} />
            <p style={styles.hint}>
              {history.length} auditorías · última: {new Date(history[history.length - 1].createdAt).toLocaleString()} ({history[history.length - 1].score}/100)
            </p>
            {/* Los informes están en el servidor, así que se puede volver a
                uno anterior en vez de solo ver su punto en la gráfica. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {[...history].reverse().slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openReport(item.id)}
                  disabled={openingReportId === item.id}
                  style={{ ...styles.secondaryButton, opacity: openingReportId === item.id ? 0.6 : 1 }}
                >
                  {new Date(item.createdAt).toLocaleDateString()} · {item.score}/100{item.auto ? ' (auto)' : ''}
                </button>
              ))}
            </div>
          </Card>
        ) : null}

        {reportLoading && !report ? (
          <Card icon={RiSearchEyeLine} title="Buscando tu último informe">
            <p style={styles.hint}>Leyendo el informe guardado en tu cuenta…</p>
          </Card>
        ) : null}

        {report ? (
          <>
            <section style={{ ...styles.card, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ ...styles.scoreCircle, borderColor: scoreColor(report.score) }}>
                <strong style={{ fontSize: 28, color: scoreColor(report.score) }}>{report.score}</strong>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>/ 100</span>
              </div>
              <div style={{ flex: 1, minWidth: 260 }}>
                <h2 style={{ ...styles.cardTitle, marginBottom: 6 }}>Diagnóstico de {report.url}</h2>
                {!report.webAlive ? (
                  <p style={styles.error}>No pudimos leer la web (caída o protegida contra bots): el plan se basa solo en los datos del formulario.</p>
                ) : null}
                <p style={{ margin: 0, color: 'var(--text)', fontSize: 14, lineHeight: 1.6 }}>{report.summary}</p>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--dim)' }}>
                  {report.provider === 'claude' ? 'Plan generado con IA' : 'Plan básico (IA no disponible)'} · {new Date(report.generatedAt).toLocaleString()}
                </p>
                {shareReportId ? (
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" onClick={shareReport} disabled={share.loading} style={styles.secondaryButton}>
                      <RiShareForwardLine style={{ width: 14, height: 14 }} />
                      {share.loading ? 'Creando enlace…' : 'Compartir informe con el cliente'}
                    </button>
                    {share.url ? <span style={{ ...styles.hint, wordBreak: 'break-all' }}>Enlace copiado: {share.url}</span> : null}
                    {share.error ? <span style={styles.error}>{share.error}</span> : null}
                  </div>
                ) : null}
              </div>
            </section>

            {report.checklist.length ? (
              <Card icon={RiToolsLine} title="Auditoría técnica">
                <ul style={styles.list}>
                  {report.checklist.map((item) => (
                    <li key={item.id} style={styles.checkItem}>
                      {item.ok
                        ? <RiCheckLine style={{ width: 18, height: 18, color: 'var(--success)', flexShrink: 0 }} />
                        : <RiCloseLine style={{ width: 18, height: 18, color: 'var(--danger)', flexShrink: 0 }} />}
                      <div>
                        <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>{item.label}</strong>
                        {!item.ok ? <p style={styles.hint}>{item.hint}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card icon={RiSearchEyeLine} title="Keywords recomendadas">
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Keyword</th>
                      <th style={styles.th}>Intención</th>
                      <th style={styles.th}>Dificultad</th>
                      <th style={styles.th}>Por qué</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.keywords.map((kw) => (
                      <tr key={kw.keyword}>
                        <td style={{ ...styles.td, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{kw.keyword}</td>
                        <td style={styles.td}>{INTENT_LABELS[kw.intent] || kw.intent}</td>
                        <td style={{ ...styles.td, textTransform: 'capitalize' }}>{kw.difficulty}</td>
                        <td style={styles.td}>{kw.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={keywordsToAds} disabled={adsSaving} style={{ ...styles.secondaryButton, marginTop: 14 }}>
                <RiAdvertisementLine style={{ width: 15, height: 15 }} />
                {adsSaving ? 'Preparando campaña…' : 'Crear campaña de Ads con estas keywords'}
              </button>
              <p style={styles.hint}>Cubre con publicidad las búsquedas transaccionales mientras el orgánico crece: rellena el asistente de Ads con estas keywords.</p>
            </Card>

            <Card
              icon={RiGlobalLine}
              title="Posicionamiento real (Search Console)"
              subtitle="Cruce de las keywords recomendadas con las búsquedas por las que Google ya te muestra."
            >
              {!searchConsole ? (
                <p style={styles.hint}>Consultando datos…</p>
              ) : !searchConsole.connected ? (
                <p style={styles.hint}>
                  Google Search Console no está conectado. Conéctalo y sincroniza en{' '}
                  <button type="button" style={styles.linkButton} onClick={() => navigate('/organic')}>Captación orgánica</button>{' '}
                  para ver posiciones, clics e impresiones reales aquí.
                </p>
              ) : !searchConsole.totalQueries ? (
                <p style={styles.hint}>
                  Search Console está conectado pero aún no hay búsquedas sincronizadas. Lanza una sincronización desde{' '}
                  <button type="button" style={styles.linkButton} onClick={() => navigate('/organic')}>Captación orgánica</button>.
                </p>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Keyword del plan</th>
                          <th style={styles.th}>Búsqueda real</th>
                          <th style={styles.th}>Posición</th>
                          <th style={styles.th}>Clics</th>
                          <th style={styles.th}>Impresiones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchConsole.matched.filter((m) => m.rows.length).flatMap((m) =>
                          m.rows.map((row, i) => (
                            <tr key={`${m.keyword}-${row.query}`}>
                              <td style={{ ...styles.td, fontWeight: 600, color: 'var(--text-strong)' }}>{i === 0 ? m.keyword : ''}</td>
                              <td style={styles.td}>{row.query}</td>
                              <td style={styles.td}>{row.position != null ? row.position.toFixed(1) : '—'}</td>
                              <td style={styles.td}>{row.clicks}</td>
                              <td style={styles.td}>{row.impressions}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {!searchConsole.matched.some((m) => m.rows.length) ? (
                    <p style={styles.hint}>Todavía no apareces en Google por ninguna keyword del plan: son territorio por conquistar con el plan de contenidos.</p>
                  ) : null}
                  {searchConsole.topQueries.length ? (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Top 10 búsquedas que ya te traen tráfico</summary>
                      <ul style={{ ...styles.list, marginTop: 10 }}>
                        {searchConsole.topQueries.map((q) => (
                          <li key={q.query} style={{ fontSize: 13, color: 'var(--text)' }}>
                            <strong>{q.query}</strong> — pos. {q.position != null ? q.position.toFixed(1) : '—'}, {q.clicks} clics, {q.impressions} impresiones
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div style={{ marginTop: 14 }}>
                    <button type="button" onClick={runCannibalization} disabled={cannibal.loading} style={styles.secondaryButton}>
                      {cannibal.loading ? <><RiLoader4Line className="spin" style={{ width: 14, height: 14 }} /> Consultando…</> : 'Detectar canibalización de keywords'}
                    </button>
                    <p style={styles.hint}>Detecta búsquedas donde dos o más páginas tuyas compiten entre sí y se restan posiciones (últimos 28 días).</p>
                    {cannibal.error ? <p style={styles.error}>{cannibal.error}</p> : null}
                    {cannibal.items !== null && !cannibal.items.length ? (
                      <p style={{ ...styles.hint, color: 'var(--success)' }}>Sin canibalización detectada: cada búsqueda tiene una página clara.</p>
                    ) : null}
                    {cannibal.items?.length ? (
                      <ul style={{ ...styles.list, marginTop: 10 }}>
                        {cannibal.items.map((row) => (
                          <li key={row.query} style={{ fontSize: 13, color: 'var(--text)' }}>
                            <strong style={{ color: 'var(--text-strong)' }}>{row.query}</strong> — {row.pages.length} páginas compitiendo:
                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                              {row.pages.map((p) => (
                                <li key={p.page} style={{ fontSize: 12.5, color: 'var(--muted)', wordBreak: 'break-all' }}>
                                  {p.page} · pos. {p.position != null ? p.position.toFixed(1) : '—'} · {p.clicks} clics
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </>
              )}
            </Card>

            {report.technicalFixes.length ? (
              <Card icon={RiToolsLine} title="Arreglos técnicos prioritarios">
                <ul style={styles.list}>
                  {report.technicalFixes.map((fix) => (
                    <li key={fix.title} style={styles.checkItem}>
                      <span style={{ ...styles.severityDot, background: SEVERITY_COLORS[fix.severity] || 'var(--muted)' }} />
                      <div>
                        <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>{fix.title}</strong>
                        <p style={styles.hint}>{fix.howTo}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {snippets ? (
              <Card
                icon={RiFileCopyLine}
                title="Aplicar los arreglos"
                subtitle="Snippets listos para pegar en cualquier web — y aplicación con un clic en tus landings de Vendrava."
              >
                <CopyBlock label="Title + meta description" value={snippets.html} />
                <CopyBlock label="Datos estructurados (Schema.org)" value={snippets.jsonld} />
                <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    style={{ ...styles.input, minWidth: 220 }}
                    value={landingApply.campaignId}
                    onChange={(e) => setLandingApply((prev) => ({ ...prev, campaignId: e.target.value, done: '', error: '' }))}
                  >
                    <option value="">Elige una landing de Vendrava…</option>
                    {landingCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} (/l/{c.landingSlug})</option>
                    ))}
                  </select>
                  <button type="button" onClick={applyToLanding} disabled={!landingApply.campaignId || landingApply.saving} style={styles.secondaryButton}>
                    {landingApply.saving ? 'Aplicando…' : 'Aplicar título y meta a la landing'}
                  </button>
                </div>
                {landingCampaigns.length === 0 ? <p style={styles.hint}>No tienes landings publicadas todavía. Crea una en Landings y webs.</p> : null}
                {landingApply.done ? <p style={{ ...styles.hint, color: 'var(--success)' }}>{landingApply.done}</p> : null}
                {landingApply.error ? <p style={styles.error}>{landingApply.error}</p> : null}
              </Card>
            ) : null}

            <Card
              icon={RiFileTextLine}
              title="Plan de contenidos"
              subtitle="Cada pieza puede redactarse con IA, guardarse en tu Knowledge Base y difundirse en redes."
            >
              <ul style={styles.list}>
                {report.contentPlan.map((item, index) => {
                  const state = contentState[index] ?? {}
                  return (
                    <li key={item.title} style={{ ...styles.checkItem, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <RiFileTextLine style={{ width: 16, height: 16, color: 'var(--violet)', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                          <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>{item.title}</strong>
                          <p style={styles.hint}>{item.format} · keyword: {item.keyword}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {state.articleId ? (
                            <>
                              <button type="button" style={styles.secondaryButton} onClick={() => navigate(`/knowledge-base/articulos/${state.articleId}`)}>
                                Ver artículo
                              </button>
                              <button
                                type="button"
                                style={styles.secondaryButton}
                                onClick={() => patchContent(index, { shareOpen: !state.shareOpen, shareError: '' })}
                              >
                                <RiShareForwardLine style={{ width: 14, height: 14 }} /> {state.shared ? 'Programado ✓' : 'Difundir en redes'}
                              </button>
                            </>
                          ) : (
                            <button type="button" style={styles.secondaryButton} disabled={state.loading} onClick={() => writeArticle(index, item)}>
                              {state.loading ? <><RiLoader4Line className="spin" style={{ width: 14, height: 14 }} /> Redactando…</> : 'Redactar con IA'}
                            </button>
                          )}
                        </div>
                      </div>
                      {state.error ? <p style={styles.error}>{state.error}</p> : null}
                      {state.shareOpen ? (
                        <div style={styles.shareBox}>
                          <select
                            style={{ ...styles.input, minWidth: 200 }}
                            value={state.shareCampaignId ?? ''}
                            onChange={(e) => patchContent(index, { shareCampaignId: e.target.value })}
                          >
                            <option value="">Campaña con landing para el enlace…</option>
                            {landingCampaigns.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          {SOCIAL_PLATFORMS.map((platform) => (
                            <label key={platform} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text)' }}>
                              <input
                                type="checkbox"
                                checked={(state.platforms ?? []).includes(platform)}
                                onChange={(e) => {
                                  const current = new Set(state.platforms ?? [])
                                  if (e.target.checked) current.add(platform)
                                  else current.delete(platform)
                                  patchContent(index, { platforms: [...current] })
                                }}
                              />
                              {platform}
                            </label>
                          ))}
                          <button type="button" style={styles.secondaryButton} disabled={state.sharing} onClick={() => shareArticle(index)}>
                            {state.sharing ? 'Programando…' : 'Programar borrador'}
                          </button>
                          {state.shareError ? <p style={styles.error}>{state.shareError}</p> : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </Card>

            {report.localSeo.length ? (
              <Card icon={RiMapPin2Line} title="SEO local">
                <ul style={styles.list}>
                  {report.localSeo.map((action) => (
                    <li key={action} style={styles.checkItem}>
                      <RiMapPin2Line style={{ width: 16, height: 16, color: 'var(--cyan)', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{action}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        ) : null}

        <Card
          icon={RiSwordLine}
          title="Competidores"
          subtitle="Audita hasta 3 webs rivales con el mismo motor y compara tu score con el suyo."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {competitorUrls.map((value, index) => (
              <input
                key={index}
                style={styles.input}
                type="text"
                value={value}
                placeholder={`https://competidor-${index + 1}.com`}
                onChange={(e) => setCompetitorUrls((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))}
              />
            ))}
          </div>
          {competitorsError ? <p style={styles.error}>{competitorsError}</p> : null}
          <button type="button" onClick={runCompare} disabled={competitorsLoading} style={{ ...styles.secondaryButton, marginTop: 12 }}>
            {competitorsLoading ? <><RiLoader4Line className="spin" style={{ width: 14, height: 14 }} /> Auditando competencia…</> : 'Comparar'}
          </button>
          {competitors ? (
            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Web</th>
                    <th style={styles.th}>Score</th>
                    <th style={styles.th}>Checks</th>
                    <th style={styles.th}>Puntos débiles</th>
                  </tr>
                </thead>
                <tbody>
                  {report ? (
                    <tr>
                      <td style={{ ...styles.td, fontWeight: 700, color: 'var(--text-strong)' }}>{hostnameOf(report.url)} (tú)</td>
                      <td style={{ ...styles.td, fontWeight: 700, color: scoreColor(report.score) }}>{report.score}</td>
                      <td style={styles.td}>{report.checklist.filter((c) => c.ok).length}/{report.checklist.length}</td>
                      <td style={styles.td}>—</td>
                    </tr>
                  ) : null}
                  {competitors.map((c) => (
                    <tr key={c.url}>
                      <td style={styles.td}>{hostnameOf(c.url)}</td>
                      <td style={{ ...styles.td, fontWeight: 600, color: scoreColor(c.score) }}>{c.webAlive ? c.score : '—'}</td>
                      <td style={styles.td}>{c.webAlive ? `${c.passed}/${c.total}` : 'No accesible'}</td>
                      <td style={styles.td}>{c.failedLabels.join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div style={{ marginTop: 14 }}>
            <button type="button" onClick={runKeywordGap} disabled={gap.loading} style={styles.secondaryButton}>
              {gap.loading ? <><RiLoader4Line className="spin" style={{ width: 14, height: 14 }} /> Analizando gap…</> : 'Keyword gap: qué atacan ellos y tú no (IA)'}
            </button>
            {gap.error ? <p style={styles.error}>{gap.error}</p> : null}
            {gap.items !== null && !gap.items.length ? (
              <p style={{ ...styles.hint, marginTop: 8 }}>No se detectaron keywords nuevas en las webs analizadas.</p>
            ) : null}
            {gap.items?.length ? (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Keyword / tema</th>
                      <th style={styles.th}>Lo ataca</th>
                      <th style={styles.th}>Oportunidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gap.items.map((item) => (
                      <tr key={`${item.keyword}-${item.competitor}`}>
                        <td style={{ ...styles.td, fontWeight: 600, color: 'var(--text-strong)' }}>{item.keyword}</td>
                        <td style={styles.td}>{item.competitor}</td>
                        <td style={styles.td}>{item.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </Card>

        {stale.length ? (
          <Card
            icon={RiFileTextLine}
            title="Contenido a refrescar"
            subtitle="Artículos SEO sin tocar en más de 90 días: Google premia la frescura. La IA los actualiza conservando keyword y tono."
          >
            <ul style={styles.list}>
              {stale.map((item) => {
                const state = staleState[item.id] ?? {}
                return (
                  <li key={item.id} style={{ ...styles.checkItem, alignItems: 'center' }}>
                    <RiFileTextLine style={{ width: 16, height: 16, color: 'var(--warn)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: 13.5, color: 'var(--text-strong)' }}>{item.name}</strong>
                      <p style={styles.hint}>Última actualización: {new Date(item.updatedAt).toLocaleDateString()}</p>
                      {state.error ? <p style={styles.error}>{state.error}</p> : null}
                    </div>
                    <button type="button" style={styles.secondaryButton} disabled={state.loading} onClick={() => refreshStale(item.id)}>
                      {state.loading ? <><RiLoader4Line className="spin" style={{ width: 14, height: 14 }} /> Refrescando…</> : 'Refrescar con IA'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        ) : null}

        <Card
          icon={RiUserAddLine}
          title="Imán de leads: auditoría gratuita"
          subtitle="Comparte una página pública donde cualquier negocio audita su web dejando su contacto — y entra como lead en tu campaña con el informe adjunto."
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              style={{ ...styles.input, minWidth: 220 }}
              value={magnetCampaignId}
              onChange={(e) => setMagnetCampaignId(e.target.value)}
            >
              <option value="">Campaña que recibirá los leads…</option>
              {landingCampaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {magnetUrl ? (
              <>
                <code style={{ ...styles.hint, fontSize: 13, wordBreak: 'break-all' }}>{magnetUrl}</code>
                <button type="button" onClick={copyMagnetUrl} style={styles.smallButton}>
                  <RiFileCopyLine style={{ width: 13, height: 13 }} /> {magnetCopied ? 'Copiado' : 'Copiar enlace'}
                </button>
              </>
            ) : null}
          </div>
          {landingCampaigns.length === 0 ? (
            <p style={styles.hint}>Necesitas una campaña con landing publicada (la auditoría pública se ata a ella para atribuir los leads).</p>
          ) : (
            <p style={styles.hint}>Difúndelo en redes, firma de email o anuncios: cada auditoría completada crea un lead con fuente «seo_audit», su score y el informe completo.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '28px 32px', maxWidth: 960, margin: '0 auto' },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -0.5 },
  subtitle: { margin: '6px 0 0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 16,
    padding: 20,
  },
  cardTitle: {
    display: 'flex', alignItems: 'center', gap: 8,
    margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)',
  },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' },
  input: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    background: 'var(--bg)',
    color: 'var(--text-strong)',
    fontSize: 14,
    fontFamily: 'inherit',
  },
  button: {
    marginTop: 16,
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 18px',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14, fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, var(--accent-deep) 0%, var(--violet-deep) 100%)',
  },
  secondaryButton: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
    color: 'var(--text-strong)',
    background: 'var(--bg)',
  },
  smallButton: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid var(--line)',
    cursor: 'pointer',
    fontSize: 12,
    color: 'var(--text)',
    background: 'var(--bg)',
  },
  linkButton: {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--accent)', fontSize: 'inherit', fontFamily: 'inherit', textDecoration: 'underline',
  },
  error: { margin: '10px 0 0', fontSize: 13, color: 'var(--danger)' },
  warnBanner: {
    marginBottom: 16,
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
    background: 'color-mix(in srgb, var(--warn) 10%, transparent)',
    color: 'var(--text-strong)',
    fontSize: 13.5,
  },
  scoreCircle: {
    width: 96, height: 96,
    borderRadius: '50%',
    border: '4px solid',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  checkItem: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  hint: { margin: '2px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 },
  severityDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 5 },
  copyBlock: { marginBottom: 12 },
  pre: {
    margin: 0,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 12,
    lineHeight: 1.5,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  shareBox: {
    display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px dashed var(--line)',
    marginLeft: 26,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '8px 10px',
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--dim)', borderBottom: '1px solid var(--line)',
  },
  td: { padding: '10px', color: 'var(--text)', borderBottom: '1px solid var(--line)', verticalAlign: 'top', lineHeight: 1.5 },
}
