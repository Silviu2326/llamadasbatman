import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAdvertisementLine, RiAlertLine, RiArrowRightLine, RiBarChartBoxLine,
  RiBuilding2Line, RiCheckLine, RiCloseLine, RiEarthLine, RiFileCopyLine,
  RiFileTextLine, RiFlashlightLine, RiGlobalLine, RiLineChartLine,
  RiLoader4Line, RiMapPin2Line, RiRadarLine, RiSearchEyeLine,
  RiShareForwardLine, RiSpeedUpLine, RiSwordLine, RiToolsLine, RiUserAddLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import './seo.css'

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

const INTENT_TONE = {
  transaccional: 'tone-ok',
  comercial: 'tone-cyan',
  local: 'tone-info',
  informacional: '',
}

const DIFFICULTY_TONE = { baja: 'tone-ok', media: 'tone-warn', alta: 'tone-bad' }

const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'twitter']

const TABS = [
  { id: 'resumen', label: 'Diagnóstico', icon: RiRadarLine },
  { id: 'tecnico', label: 'Salud técnica', icon: RiToolsLine },
  { id: 'keywords', label: 'Keywords y posiciones', icon: RiSearchEyeLine },
  { id: 'contenidos', label: 'Contenidos', icon: RiFileTextLine },
  { id: 'competencia', label: 'Competencia', icon: RiSwordLine },
  { id: 'captacion', label: 'Captación', icon: RiUserAddLine },
]

const ONBOARD_STEPS = [
  { title: 'Auditamos', copy: 'Leemos tu web como Googlebot y puntuamos 12 comprobaciones técnicas.' },
  { title: 'Rastreamos', copy: 'Seguimos tu sitemap hasta 12 páginas y medimos Core Web Vitals reales.' },
  { title: 'Planificamos', copy: 'Estudio de keywords por intención y plan de contenidos que las ataca.' },
  { title: 'Vigilamos', copy: 'Cada día re-auditamos tu web y la de tus competidores, y avisamos si algo cae.' },
]

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

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

function daysSince(iso) {
  const at = new Date(iso).getTime()
  if (!Number.isFinite(at)) return null
  return Math.floor((Date.now() - at) / 86_400_000)
}

function formatDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

function formatDateTime(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function Panel({ icon: Icon, title, subtitle, actions, footer, children }) {
  return (
    <section className="seo-panel">
      <header className="seo-panel-head">
        <div>
          <h2>{Icon ? <span className="seo-panel-icon"><Icon /></span> : null} {title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="seo-panel-actions">{actions}</div> : null}
      </header>
      <div className="seo-panel-body">{children}</div>
      {footer ? <footer className="seo-panel-foot">{footer}</footer> : null}
    </section>
  )
}

function Spinner() {
  return <RiLoader4Line className="seo-spin" />
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
    <div className="seo-copy-block">
      <div className="seo-copy-head">
        <strong>{label}</strong>
        <button type="button" className="seo-button small" onClick={copy}>
          <RiFileCopyLine /> {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre>{value}</pre>
    </div>
  )
}

/** Marcador del score. Arco SVG en vez de conic-gradient: extremo redondeado,
 *  degradado y animación de llenado cuando cambia el informe. */
function Gauge({ score }) {
  const color = scoreColor(score)
  const gradientId = `seo-gauge-${useId().replace(/:/g, '')}`
  const radius = 46
  const circumference = 2 * Math.PI * radius
  return (
    <div className="seo-gauge" style={{ '--gauge-color': color }}>
      <svg viewBox="0 0 108 108" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle className="seo-gauge-track" cx="54" cy="54" r={radius} />
        <circle
          className="seo-gauge-value"
          cx="54"
          cy="54"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, score)) / 100)}
        />
      </svg>
      <span className="seo-gauge-label">
        <b>{score}</b>
        <small>/ 100</small>
      </span>
    </div>
  )
}

/** Evolución del score. Área + puntos; los grises son re-auditorías del worker. */
function ScoreTrend({ points }) {
  const width = 560
  const height = 88
  const step = points.length > 1 ? width / (points.length - 1) : 0
  const y = (score) => height - (score / 100) * (height - 12) - 6
  const coords = points.map((p, i) => [i * step, y(p.score)])
  const line = coords.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Evolución del score SEO">
      <defs>
        <linearGradient id="seo-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((level) => (
        <line key={level} x1="0" x2={width} y1={y(level)} y2={y(level)} stroke="var(--line)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#seo-trend-fill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {coords.map(([px, py], i) => (
        <circle key={points[i].id ?? i} cx={px} cy={py} r="3.2" fill={points[i].auto ? 'var(--dim)' : 'var(--accent)'} stroke="var(--surface)" strokeWidth="1.6" />
      ))}
    </svg>
  )
}

/** Serie de posición de una keyword. Eje invertido: arriba = mejor posición. */
function RankSpark({ points }) {
  const usable = points.filter((p) => p.position != null)
  if (usable.length < 2) return <span className="seo-pill">Sin serie</span>
  const width = 96
  const height = 26
  const values = usable.map((p) => p.position)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (usable.length - 1)
  const path = usable
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(((p.position - min) / span) * (height - 6) + 3).toFixed(1)}`)
    .join(' ')
  return (
    <svg className="seo-rank-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke="var(--cyan)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Delta({ value, invert = false }) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.05) {
    return <span className="seo-delta flat">=</span>
  }
  // En posiciones de Google bajar de número es mejorar: `invert` lo refleja.
  const improved = invert ? value < 0 : value > 0
  return (
    <span className={`seo-delta ${improved ? 'up' : 'down'}`}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

/**
 * Diálogo de nueva auditoría. Antes era un panel que empujaba media pantalla
 * hacia abajo. Como diálogo: cierra con Escape o clic fuera, atrapa el foco
 * mientras está abierto y lo devuelve al botón que lo abrió al cerrarse.
 */
function AuditModal({ form, setField, competitorUrls, setCompetitorUrls, loading, error, onSubmit, onClose }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = `seo-audit-title-${useId().replace(/:/g, '')}`

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const preferred = dialog?.querySelector('[data-autofocus]')
      ;(preferred instanceof HTMLElement ? preferred : dialog)?.focus()
    })

    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const controls = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKey)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  return (
    <div
      className="seo-modal-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="seo-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <header className="seo-modal-head">
          <span className="seo-modal-eyebrow">Agencia SEO</span>
          <h2 id={titleId}><RiSearchEyeLine /> Nueva auditoría</h2>
          <p>
            Leemos tu web como lo haría Google, puntuamos lo que encontramos y redactamos el plan de
            keywords y contenidos que lo arregla.
          </p>
          <button type="button" className="seo-modal-close" onClick={onClose} aria-label="Cerrar">
            <RiCloseLine />
          </button>
        </header>

        <form id="seo-audit-form" className="seo-modal-body" onSubmit={onSubmit}>
          <div className="seo-form-grid">
            <label className="full">
              <span>URL de la web <i>*</i></span>
              <input
                className="seo-input"
                type="text"
                value={form.url}
                onChange={setField('url')}
                placeholder="https://tunegocio.com"
                data-autofocus
                required
              />
            </label>
            <label>
              <span>Sector</span>
              <input className="seo-input" type="text" value={form.sector} onChange={setField('sector')} placeholder="clínica dental, restaurante…" />
            </label>
            <label>
              <span>Ciudad</span>
              <input className="seo-input" type="text" value={form.city} onChange={setField('city')} placeholder="Madrid" />
            </label>
            <label className="full">
              <span>Describe tu negocio <small>— cuanto más contexto, mejores keywords</small></span>
              <textarea
                className="seo-textarea"
                value={form.business}
                onChange={setField('business')}
                placeholder="Qué vendes, a quién y qué te diferencia."
              />
            </label>
          </div>

          <div className="seo-modal-section">
            <h3><RiSwordLine /> Competidores a vigilar</h3>
            <p>Se guardan en el proyecto: la vigilancia diaria los audita junto a tu web y podrás comparar scores.</p>
            <div className="seo-competitor-fields">
              {competitorUrls.map((value, index) => (
                <input
                  key={index}
                  className="seo-input"
                  type="text"
                  value={value}
                  placeholder={`https://competidor-${index + 1}.com`}
                  onChange={(e) => setCompetitorUrls((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))}
                />
              ))}
            </div>
          </div>

          {error ? <p className="seo-inline-error">{error}</p> : null}
        </form>

        <footer className="seo-modal-foot">
          <p>
            {loading
              ? 'Puedes cerrar esta ventana: el análisis sigue y el informe aparecerá al terminar.'
              : 'Auditoría técnica + rastreo del sitio + Core Web Vitals + keywords y plan de contenidos.'}
          </p>
          <div className="seo-modal-actions">
            <button type="button" className="seo-button ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" form="seo-audit-form" className="seo-button primary" disabled={loading}>
              {loading ? <><Spinner /> Analizando…</> : <><RiSearchEyeLine /> Analizar mi web</>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default function SeoPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState({ url: '', business: '', sector: '', city: '' })
  const [competitorUrls, setCompetitorUrls] = useState(['', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [report, setReport] = useState(null)
  const [reportId, setReportId] = useState('')
  // `null` mientras se pregunta al backend: sin esto la pantalla enseñaría el
  // estado vacío durante un instante y parecería que no hay ningún informe.
  const [reportLoading, setReportLoading] = useState(true)
  const [openingReportId, setOpeningReportId] = useState('')

  const [projects, setProjects] = useState([])
  const [tab, setTab] = useState('resumen')
  const [modalOpen, setModalOpen] = useState(false)

  const [history, setHistory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [searchConsole, setSearchConsole] = useState(null)
  const [ranks, setRanks] = useState(null)
  const [campaigns, setCampaigns] = useState([])

  const [competitors, setCompetitors] = useState(null)
  const [competitorsLoading, setCompetitorsLoading] = useState(false)
  const [competitorsError, setCompetitorsError] = useState('')

  const [contentState, setContentState] = useState({})
  const [landingApply, setLandingApply] = useState({ campaignId: '', saving: false, done: '', error: '' })
  const [adsState, setAdsState] = useState({ saving: false, error: '' })

  const [share, setShare] = useState({ loading: false, url: '', error: '' })
  const [magnetCampaignId, setMagnetCampaignId] = useState('')
  const [magnetCopied, setMagnetCopied] = useState(false)
  const [gap, setGap] = useState({ loading: false, items: null, error: '' })
  const [cannibal, setCannibal] = useState({ loading: false, items: null, error: '' })
  const [stale, setStale] = useState([])
  const [staleState, setStaleState] = useState({})

  const landingCampaigns = useMemo(() => campaigns.filter((c) => c.landingSlug), [campaigns])
  const reportUrl = report?.url ?? ''

  const applyReport = useCallback((data, id) => {
    setReport(data)
    setReportId(id ?? data?.reportId ?? '')
    setContentState({})
    setForm((prev) => ({ ...prev, url: data?.url || prev.url }))
  }, [])

  // El último informe guardado es el estado inicial de la pantalla.
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/seo/reports/latest', { signal: controller.signal })
      .then((response) => readJson(response, 'No se pudo cargar el último informe'))
      .then((body) => {
        if (body?.data) applyReport(body.data, body.data.reportId)
      })
      .catch(() => {})
      .finally(() => setReportLoading(false))
    return () => controller.abort()
  }, [applyReport])

  // Los proyectos vigilados por el worker diario: permiten cambiar de web sin
  // volver a auditar. Antes la pantalla solo entendía una web, la última.
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/seo/projects', { signal: controller.signal })
      .then((response) => readJson(response, 'No se pudieron cargar los proyectos'))
      .then((body) => setProjects(Array.isArray(body.data) ? body.data : []))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // El contexto del negocio (sector, ciudad, descripción) vive en `SeoProject`,
  // no dentro del JSON del informe. Al recargar la página se perdía, y de él
  // dependen los snippets, el schema y el prompt con el que se redactan los
  // artículos: sin esto volvías a una pantalla que ya no sabía a qué te dedicas.
  useEffect(() => {
    if (!projects.length) return
    const project = projects.find((p) => p.url === reportUrl) ?? (reportUrl ? null : projects[0])
    if (!project) return
    setForm((prev) => ({
      url: prev.url || project.url,
      business: prev.business || project.business || '',
      sector: prev.sector || project.sector || '',
      city: prev.city || project.city || '',
    }))
    setCompetitorUrls((prev) => (prev.some(Boolean) ? prev : [...(project.competitors ?? []), '', '', ''].slice(0, 3)))
  }, [projects, reportUrl])

  // El historial se pide SIEMPRE acotado a una URL. Sin el filtro devolvía
  // también los informes automáticos de los competidores (el worker los guarda
  // en la misma tabla) y la gráfica mezclaba tu score con el suyo.
  useEffect(() => {
    if (!reportUrl) {
      setHistory([])
      setAlerts([])
      return undefined
    }
    const controller = new AbortController()
    apiFetch(`/api/seo/history?url=${encodeURIComponent(reportUrl)}`, { signal: controller.signal })
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

  // Serie semanal de posiciones que captura el worker. Existía en el backend
  // desde el primer día y ninguna pantalla la leía.
  useEffect(() => {
    if (!reportUrl) {
      setRanks(null)
      return undefined
    }
    const controller = new AbortController()
    apiFetch(`/api/seo/rank-history?url=${encodeURIComponent(reportUrl)}`, { signal: controller.signal })
      .then((response) => readJson(response, 'No se pudo cargar la evolución de posiciones'))
      .then((body) => setRanks(Array.isArray(body.data) ? body.data : []))
      .catch(() => setRanks([]))
    return () => controller.abort()
  }, [reportUrl])

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

  function openAuditModal() {
    setError('')
    setModalOpen(true)
  }

  /** Vuelve a un informe del historial. Solo lee: no re-audita nada. */
  async function openReport(id) {
    setOpeningReportId(id)
    setError('')
    try {
      const response = await apiFetch(`/api/seo/reports/${encodeURIComponent(id)}`)
      const body = await readJson(response, 'No se pudo abrir ese informe.')
      // El id se guarda aparte: `reportById` devuelve el JSON del informe, que
      // no lo lleva dentro. Sin esto, «compartir» generaba el enlace del
      // informe MÁS RECIENTE en lugar del que estabas viendo.
      applyReport(body.data, id)
    } catch (openError) {
      setError(openError.message)
    } finally {
      setOpeningReportId('')
    }
  }

  /** Cambia de proyecto vigilado sin gastar una auditoría nueva. */
  async function switchProject(url) {
    if (!url) return
    const project = projects.find((p) => p.url === url)
    setReportLoading(true)
    setError('')
    setSearchConsole(null)
    setCompetitors(null)
    try {
      const response = await apiFetch(`/api/seo/reports/latest?url=${encodeURIComponent(url)}`)
      const body = await readJson(response, 'No se pudo abrir ese proyecto.')
      if (body?.data) {
        applyReport(body.data, body.data.reportId)
      } else {
        setReport(null)
        setReportId('')
      }
      setForm({
        url,
        business: project?.business || '',
        sector: project?.sector || '',
        city: project?.city || '',
      })
      setCompetitorUrls([...(project?.competitors ?? []), '', '', ''].slice(0, 3))
    } catch (switchError) {
      setError(switchError.message)
    } finally {
      setReportLoading(false)
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
      // Los competidores viajan con el análisis: el worker diario los audita
      // junto a tu web. Antes se escribían aquí y no se guardaban en ningún
      // sitio, así que la vigilancia automática nunca los miraba.
      const response = await apiFetch('/api/seo/analyze', {
        method: 'POST',
        body: JSON.stringify({ ...form, competitors: competitorUrls.map((u) => u.trim()).filter(Boolean) }),
      })
      const body = await readJson(response, 'No se pudo generar el informe SEO.')
      // No hace falta guardarlo en el navegador: `/api/seo/analyze` ya lo
      // persiste en `SeoReport` antes de responder.
      applyReport(body.data, body.data?.reportId)
      setModalOpen(false)
      setTab('resumen')
      apiFetch('/api/seo/projects')
        .then((r) => readJson(r, ''))
        .then((b) => setProjects(Array.isArray(b.data) ? b.data : []))
        .catch(() => {})
    } catch (analyzeError) {
      setError(analyzeError.message)
      setModalOpen(true)
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

  /**
   * Publica el artículo en el blog público de la landing. Sin este paso el
   * contenido se queda en la Knowledge Base y no posiciona: el endpoint
   * existía y ninguna pantalla lo llamaba, así que el ciclo
   * plan → artículo → web indexable quedaba a medias.
   */
  async function publishArticle(index) {
    const state = contentState[index] ?? {}
    if (!state.articleId) return
    patchContent(index, { publishing: true, error: '' })
    try {
      const response = await apiFetch(`/api/seo/content/${encodeURIComponent(state.articleId)}/publish`, { method: 'POST' })
      const body = await readJson(response, 'No se pudo publicar el artículo.')
      patchContent(index, { publishing: false, publishedSlug: body.data.slug })
    } catch (publishError) {
      patchContent(index, { publishing: false, error: publishError.message })
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
    setAdsState({ saving: true, error: '' })
    try {
      const selected = report.keywords
        .filter((k) => k.intent === 'transaccional' || k.intent === 'comercial')
        .slice(0, 6)
        .map((k) => k.keyword)
      const response = await apiFetch('/api/ads/draft', {
        method: 'PUT',
        body: JSON.stringify({
          vertical: form.sector.trim() || hostnameOf(report.url),
          objetivo: `Captar demanda de búsqueda: ${selected.join(', ')}`,
          audience: form.city.trim() ? `Personas que buscan estos servicios en ${form.city.trim()}` : '',
        }),
      })
      // Antes se navegaba pasara lo que pasara: si el borrador fallaba,
      // el asistente de Ads se abría vacío y sin decir por qué.
      await readJson(response, 'No se pudo preparar el borrador de la campaña.')
      navigate('/captacion/nueva')
    } catch (adsError) {
      setAdsState({ saving: false, error: adsError.message })
      return
    }
    setAdsState({ saving: false, error: '' })
  }

  async function shareReport() {
    if (!reportId) return
    setShare({ loading: true, url: '', error: '' })
    try {
      const response = await apiFetch(`/api/seo/reports/${reportId}/share`, { method: 'POST' })
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

  // ── Derivados de presentación ─────────────────────────────────────────────

  const checklist = report?.checklist ?? []
  const passed = checklist.filter((c) => c.ok).length
  const failed = checklist.length - passed
  const site = report?.site ?? null
  const vitals = report?.webVitals ?? null

  const crawlIssues = site
    ? site.missingTitle + site.missingMeta + site.missingH1 + site.duplicateTitles.length + (site.imgsWithoutAlt > 0 ? 1 : 0)
    : 0

  const matchedRows = useMemo(
    () => (searchConsole?.matched ?? []).filter((m) => m.rows.length),
    [searchConsole],
  )

  const positioned = matchedRows.length
  const avgPosition = useMemo(() => {
    const values = matchedRows.flatMap((m) => m.rows.map((r) => r.position)).filter((p) => p != null)
    return values.length ? values.reduce((sum, p) => sum + p, 0) / values.length : null
  }, [matchedRows])

  const scoreDelta = useMemo(() => {
    if (history.length < 2) return null
    return history[history.length - 1].score - history[history.length - 2].score
  }, [history])

  const publishedCount = Object.values(contentState).filter((s) => s.publishedSlug).length
  const writtenCount = Object.values(contentState).filter((s) => s.articleId).length

  const blogSlug = landingCampaigns[0]?.landingSlug ?? ''

  const reportAgeDays = report ? daysSince(report.generatedAt) : null
  const bandState = !report
    ? 'unknown'
    : !report.webAlive || report.provider !== 'claude' || (reportAgeDays != null && reportAgeDays > 7)
      ? 'partial'
      : 'ready'

  const bandMessage = !report
    ? 'Todavía no has auditado ninguna web. Lanza el primer análisis para tener diagnóstico, keywords y plan de contenidos.'
    : !report.webAlive
      ? 'No pudimos leer la web (caída o protegida contra bots): el plan se basa solo en los datos del formulario, no en la web real.'
      : report.provider !== 'claude'
        ? 'Plan generado sin IA (Claude no disponible): las keywords y el plan de contenidos son la plantilla determinista por sector.'
        : reportAgeDays != null && reportAgeDays > 7
          ? `El informe tiene ${reportAgeDays} días. La vigilancia diaria sigue midiendo la salud técnica, pero el plan puede haberse quedado corto.`
          : 'Auditoría reciente sobre la web real, plan redactado con IA y vigilancia diaria activa.'

  const tabCounts = {
    resumen: failed || null,
    tecnico: crawlIssues || null,
    keywords: report?.keywords?.length ?? null,
    contenidos: report?.contentPlan?.length ?? null,
    competencia: competitors?.length ?? null,
    captacion: null,
  }
  const tabIssues = { resumen: failed > 0, tecnico: crawlIssues > 0 }

  return (
    <div className={`seo-page${modalOpen ? ' is-locked' : ''}`}>
      {/* `inert` booleano: React 19 ignora la cadena vacía y el fondo se
          quedaba enfocable con el diálogo abierto. */}
      <div className="seo-shell" inert={modalOpen ? true : undefined}>
        <header className="seo-header">
          <div className="seo-heading">
            <span className="seo-brand-icon"><RiLineChartLine /></span>
            <div>
              <h1>SEO</h1>
              <p>
                Tu agencia SEO integrada: auditoría técnica, rastreo del sitio, keywords, contenidos
                redactados y publicados, vigilancia de competidores y datos reales de Google.
              </p>
            </div>
          </div>
          <div className="seo-header-actions">
            {projects.length > 1 ? (
              <select
                className="seo-select"
                value={reportUrl}
                onChange={(e) => switchProject(e.target.value)}
                aria-label="Proyecto vigilado"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.url}>{hostnameOf(project.url)}</option>
                ))}
              </select>
            ) : null}
            {report ? (
              <button type="button" className="seo-button" onClick={shareReport} disabled={share.loading || !reportId}>
                {share.loading ? <><Spinner /> Creando enlace…</> : <><RiShareForwardLine /> Compartir informe</>}
              </button>
            ) : null}
            <button type="button" className="seo-button primary" onClick={openAuditModal} disabled={loading}>
              {loading ? <><Spinner /> Analizando…</> : <><RiSearchEyeLine /> {report ? 'Nueva auditoría' : 'Analizar mi web'}</>}
            </button>
          </div>
        </header>

        {report || reportLoading ? (
          <div className={`seo-band state-${bandState}`}>
            <span className="seo-band-dot" />
            <div>
              <strong>
                {report
                  ? `${hostnameOf(report.url)} · auditada el ${formatDateTime(report.generatedAt)}`
                  : 'Buscando tu último informe…'}
              </strong>
              <p>{report ? bandMessage : 'Leyendo el informe guardado en tu cuenta.'}</p>
            </div>
            {report ? (
              <span className={`seo-pill ${report.provider === 'claude' ? 'tone-info' : ''}`}>
                {report.provider === 'claude' ? 'Plan con IA' : 'Plan determinista'}
              </span>
            ) : null}
          </div>
        ) : null}

        {share.url ? (
          <div className="seo-alert is-ok">
            <RiCheckLine />
            <span>Enlace público copiado al portapapeles: <code>{share.url}</code></span>
          </div>
        ) : null}
        {share.error ? <div className="seo-alert is-error"><RiAlertLine /><span>{share.error}</span></div> : null}

        {alerts.map((alert) => (
          <div key={alert.type} className="seo-alert">
            <RiAlertLine />
            <span>{alert.message} <em>· {formatDate(alert.at)}</em></span>
          </div>
        ))}

        {error && !modalOpen ? <div className="seo-alert is-error"><RiAlertLine /><span>{error}</span></div> : null}

        {!report && reportLoading ? (
          <Panel icon={RiSearchEyeLine} title="Cargando">
            <div className="seo-skeleton"><i /><i /><i /></div>
          </Panel>
        ) : null}

        {!report && !reportLoading ? (
          <section className="seo-onboard seo-rise">
            <span className="seo-onboard-icon"><RiSearchEyeLine /></span>
            <h2>Monta tu agencia SEO en un minuto</h2>
            <p>
              Analizamos tu web, te decimos exactamente qué la frena en Google y te dejamos el plan
              de keywords y contenidos listo para ejecutar desde aquí mismo.
            </p>
            <div className="seo-onboard-steps">
              {ONBOARD_STEPS.map((step, index) => (
                <div key={step.title} className="seo-onboard-step">
                  <span>{index + 1}</span>
                  <strong>{step.title}</strong>
                  <p>{step.copy}</p>
                </div>
              ))}
            </div>
            <button type="button" className="seo-button primary" onClick={openAuditModal}>
              <RiSearchEyeLine /> Analizar mi web
            </button>
          </section>
        ) : null}

        {report ? (
          <>
            <div className="seo-kpi-row seo-rise">
              <div className="seo-kpi" style={{ '--kpi-color': scoreColor(report.score) }}>
                <span className="seo-kpi-icon"><RiRadarLine /></span>
                <div>
                  <span>Score SEO</span>
                  <strong>{report.score}<u> /100</u></strong>
                  <small>
                    {passed}/{checklist.length} comprobaciones
                    {scoreDelta != null && scoreDelta !== 0 ? ` · ${scoreDelta > 0 ? '+' : ''}${scoreDelta} vs anterior` : ''}
                  </small>
                </div>
              </div>
              <div className={`seo-kpi${searchConsole?.connected ? '' : ' is-missing'}`} style={{ '--kpi-color': 'var(--cyan)' }}>
                <span className="seo-kpi-icon"><RiGlobalLine /></span>
                <div>
                  <span>Keywords posicionando</span>
                  <strong>{searchConsole?.connected ? <>{positioned}<u> /{report.keywords?.length ?? 0}</u></> : 'Sin medir'}</strong>
                  <small>{searchConsole?.connected ? 'del plan, con datos de Search Console' : 'Conecta Search Console para medirlo'}</small>
                </div>
              </div>
              <div className={`seo-kpi${avgPosition == null ? ' is-missing' : ''}`} style={{ '--kpi-color': 'var(--violet)' }}>
                <span className="seo-kpi-icon"><RiBarChartBoxLine /></span>
                <div>
                  <span>Posición media</span>
                  <strong>{avgPosition != null ? avgPosition.toFixed(1) : 'Sin datos'}</strong>
                  <small>{avgPosition != null ? 'en las búsquedas del plan' : 'aún no apareces por keywords del plan'}</small>
                </div>
              </div>
              <div className="seo-kpi" style={{ '--kpi-color': 'var(--success)' }}>
                <span className="seo-kpi-icon"><RiFileTextLine /></span>
                <div>
                  <span>Contenidos</span>
                  <strong>{writtenCount}<u> /{report.contentPlan?.length ?? 0}</u></strong>
                  <small>{publishedCount} publicados en el blog · {stale.length} por refrescar</small>
                </div>
              </div>
            </div>

            <nav className="seo-tabs" aria-label="Secciones de SEO">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${tab === item.id ? 'active' : ''}${tabIssues[item.id] ? ' has-issue' : ''}`}
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id ? 'page' : undefined}
                >
                  <item.icon /> {item.label}
                  {tabCounts[item.id] ? <b>{tabCounts[item.id]}</b> : null}
                </button>
              ))}
            </nav>

            {/* ── Diagnóstico ──────────────────────────────────────────── */}
            {tab === 'resumen' ? (
              <div className="seo-stack">
                <section className="seo-hero seo-rise" style={{ '--gauge-color': scoreColor(report.score) }}>
                  <div className="seo-diagnosis">
                    <Gauge score={report.score} />
                    <div className="seo-diagnosis-copy">
                      <h3><span>{hostnameOf(report.url)}</span></h3>
                      <p>{report.summary}</p>
                      <div className="seo-diagnosis-meta">
                        <span className={`seo-pill ${failed ? 'tone-warn' : 'tone-ok'}`}>
                          {failed ? `${failed} fallos técnicos` : 'Sin fallos técnicos'}
                        </span>
                        {vitals?.category ? (
                          <span className={`seo-pill ${vitals.category === 'FAST' ? 'tone-ok' : vitals.category === 'SLOW' ? 'tone-bad' : 'tone-warn'}`}>
                            Core Web Vitals: {vitals.category}
                          </span>
                        ) : null}
                        {form.sector ? <span className="seo-pill"><RiBuilding2Line />{form.sector}</span> : null}
                        {form.city ? <span className="seo-pill"><RiMapPin2Line />{form.city}</span> : null}
                        <span>{report.model}</span>
                      </div>
                    </div>
                    <div className="seo-hero-rail">
                      <div>
                        <span>Fallos</span>
                        <strong style={{ color: failed ? 'var(--danger-faint)' : 'var(--success)' }}>{failed}</strong>
                      </div>
                      <div>
                        <span>Páginas</span>
                        {site ? <strong>{site.pagesAudited}</strong> : <strong className="is-muted">sin rastreo</strong>}
                      </div>
                      <div>
                        <span>Sitemap</span>
                        {site?.sitemapFound ? <strong>{site.sitemapUrlCount}</strong> : <strong className="is-muted">no encontrado</strong>}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="seo-cols">
                  <Panel icon={RiToolsLine} title="Auditoría técnica" subtitle="Lo que Google comprueba al entrar en tu web. Cada fallo resta score.">
                    {checklist.length ? (
                      <ul className="seo-list">
                        {checklist.map((item) => (
                          <li key={item.id} className={`seo-check ${item.ok ? 'is-ok' : 'is-bad'}`}>
                            <span className="seo-check-mark">{item.ok ? <RiCheckLine /> : <RiCloseLine />}</span>
                            <div>
                              <strong>{item.label}</strong>
                              {!item.ok ? <p>{item.hint}</p> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="seo-empty-inline">
                        No se pudo leer la web, así que no hay comprobaciones técnicas que mostrar.
                      </p>
                    )}
                  </Panel>

                  <Panel
                    icon={RiFlashlightLine}
                    title="Arreglos prioritarios"
                    subtitle="Ordenados por lo que más te está costando ahora mismo."
                  >
                    {report.technicalFixes?.length ? (
                      <div>
                        {report.technicalFixes.map((fix) => (
                          <article key={fix.title} className={`seo-fix sev-${fix.severity}`}>
                            <header>
                              <strong>{fix.title}</strong>
                              <span className={`seo-pill ${fix.severity === 'alta' ? 'tone-bad' : fix.severity === 'media' ? 'tone-warn' : ''}`}>
                                {fix.severity}
                              </span>
                            </header>
                            <p>{fix.howTo}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="seo-empty-inline is-ok">No hay arreglos técnicos pendientes.</p>
                    )}
                  </Panel>
                </div>

                {report.localSeo?.length ? (
                  <Panel icon={RiMapPin2Line} title="SEO local" subtitle="Acciones para aparecer en el mapa y en las búsquedas «cerca de mí».">
                    <ul className="seo-list">
                      {report.localSeo.map((action) => (
                        <li key={action} className="seo-check is-plain">
                          <span className="seo-check-mark"><RiMapPin2Line /></span>
                          <div><strong>{action}</strong></div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ) : null}

                {history.length >= 2 ? (
                  <Panel
                    icon={RiLineChartLine}
                    title="Evolución del score"
                    subtitle="Cada análisis queda guardado. Los puntos grises son las re-auditorías automáticas diarias."
                  >
                    <div className="seo-trend">
                      <div className="seo-trend-chart"><ScoreTrend points={history} /></div>
                      <div className="seo-trend-stats">
                        <div>
                          <span>Actual</span>
                          <strong style={{ color: scoreColor(history[history.length - 1].score) }}>{history[history.length - 1].score}</strong>
                        </div>
                        <div>
                          <span>Variación</span>
                          <strong><Delta value={scoreDelta} /></strong>
                        </div>
                        <div>
                          <span>Auditorías</span>
                          <strong>{history.length}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="seo-history-strip">
                      {[...history].reverse().slice(0, 6).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`seo-button small${reportId === item.id ? ' active' : ''}`}
                          onClick={() => openReport(item.id)}
                          disabled={openingReportId === item.id}
                        >
                          {openingReportId === item.id ? <Spinner /> : null}
                          {formatDate(item.createdAt)} · {item.score}{item.auto ? ' · auto' : ''}
                        </button>
                      ))}
                    </div>
                  </Panel>
                ) : null}
              </div>
            ) : null}

            {/* ── Salud técnica ────────────────────────────────────────── */}
            {tab === 'tecnico' ? (
              <div className="seo-stack">
                <Panel
                  icon={RiEarthLine}
                  title="Rastreo del sitio"
                  subtitle={site
                    ? `Rastreamos ${site.pagesAudited} páginas siguiendo tu sitemap, igual que haría Googlebot.`
                    : 'El rastreo no se pudo completar en esta auditoría.'}
                  actions={site ? (
                    <>
                      <span className={`seo-pill ${site.robotsBlocksAll ? 'tone-bad' : site.robotsFound ? 'tone-ok' : 'tone-warn'}`}>
                        {site.robotsBlocksAll ? 'robots.txt bloquea todo' : site.robotsFound ? 'robots.txt correcto' : 'sin robots.txt'}
                      </span>
                      <span className={`seo-pill ${site.sitemapFound ? 'tone-ok' : 'tone-warn'}`}>
                        {site.sitemapFound ? `sitemap · ${site.sitemapUrlCount} URLs` : 'sin sitemap.xml'}
                      </span>
                    </>
                  ) : null}
                >
                  {site ? (
                    <>
                      <div className="seo-stat-grid">
                        <div className={`seo-stat ${site.missingTitle ? 'is-bad' : 'is-ok'}`}>
                          <span>Sin title</span>
                          <strong>{site.missingTitle}</strong>
                          <small>páginas invisibles en resultados</small>
                        </div>
                        <div className={`seo-stat ${site.missingMeta ? 'is-warn' : 'is-ok'}`}>
                          <span>Sin meta description</span>
                          <strong>{site.missingMeta}</strong>
                          <small>Google se inventa el texto</small>
                        </div>
                        <div className={`seo-stat ${site.missingH1 ? 'is-warn' : 'is-ok'}`}>
                          <span>Sin H1</span>
                          <strong>{site.missingH1}</strong>
                          <small>sin titular que jerarquice</small>
                        </div>
                        <div className={`seo-stat ${site.duplicateTitles.length ? 'is-bad' : 'is-ok'}`}>
                          <span>Titles duplicados</span>
                          <strong>{site.duplicateTitles.length}</strong>
                          <small>tus páginas compiten entre sí</small>
                        </div>
                        <div className={`seo-stat ${site.imgsWithoutAlt ? 'is-warn' : 'is-ok'}`}>
                          <span>Imágenes sin alt</span>
                          <strong>{site.imgsWithoutAlt}</strong>
                          <small>fuera de Google Imágenes</small>
                        </div>
                      </div>
                      {site.duplicateTitles.length ? (
                        <p className="seo-note">
                          Duplicados: {site.duplicateTitles.map((t) => `«${t}»`).join(', ')}
                        </p>
                      ) : null}
                      {site.pages?.length ? (
                        <details className="seo-details">
                          <summary>Ver las {site.pages.length} páginas rastreadas</summary>
                          <div className="seo-table-scroll">
                            <table className="seo-table">
                              <thead>
                                <tr>
                                  <th>Página</th>
                                  <th>Title</th>
                                  <th className="num">Meta</th>
                                  <th className="num">H1</th>
                                  <th className="num">Img sin alt</th>
                                </tr>
                              </thead>
                              <tbody>
                                {site.pages.map((page) => (
                                  <tr key={page.url}>
                                    <td style={{ wordBreak: 'break-all', maxWidth: 260 }}>{page.url}</td>
                                    <td>{page.title || <em style={{ color: 'var(--danger-faint)' }}>sin title</em>}</td>
                                    <td className="num">{page.hasMetaDescription ? '✓' : '✕'}</td>
                                    <td className="num">{page.hasH1 ? '✓' : '✕'}</td>
                                    <td className="num">{page.imgsWithoutAlt}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ) : null}
                    </>
                  ) : (
                    <p className="seo-empty-inline">
                      No hay datos de rastreo en este informe: la web no respondió o bloqueó el análisis.
                    </p>
                  )}
                </Panel>

                <Panel
                  icon={RiSpeedUpLine}
                  title="Core Web Vitals"
                  subtitle="Datos reales de usuarios de Chrome (CrUX). Son factor de ranking directo. La marca en la barra es el umbral de «bueno»."
                >
                  {vitals && (vitals.lcpMs != null || vitals.cls != null || vitals.inpMs != null) ? (
                    <div className="seo-vitals">
                      <div className={`seo-vital ${vitals.lcpMs == null ? '' : vitals.lcpMs <= 2500 ? 'is-good' : vitals.lcpMs <= 4000 ? 'is-avg' : 'is-poor'}`}>
                        <header><b>LCP</b><span className="seo-pill">≤ 2,5 s</span></header>
                        <strong>{vitals.lcpMs != null ? `${(vitals.lcpMs / 1000).toFixed(1)} s` : '—'}</strong>
                        <div className="seo-vital-bar" style={{ '--threshold': '50%' }}>
                          <i style={{ width: `${Math.min(100, ((vitals.lcpMs ?? 0) / 5000) * 100)}%` }} />
                        </div>
                        <p>Cuánto tarda en pintarse el elemento principal.</p>
                      </div>
                      <div className={`seo-vital ${vitals.cls == null ? '' : vitals.cls <= 0.1 ? 'is-good' : vitals.cls <= 0.25 ? 'is-avg' : 'is-poor'}`}>
                        <header><b>CLS</b><span className="seo-pill">≤ 0,1</span></header>
                        <strong>{vitals.cls != null ? vitals.cls.toFixed(2) : '—'}</strong>
                        <div className="seo-vital-bar" style={{ '--threshold': '20%' }}>
                          <i style={{ width: `${Math.min(100, ((vitals.cls ?? 0) / 0.5) * 100)}%` }} />
                        </div>
                        <p>Cuánto se mueve el contenido mientras carga.</p>
                      </div>
                      <div className={`seo-vital ${vitals.inpMs == null ? '' : vitals.inpMs <= 200 ? 'is-good' : vitals.inpMs <= 500 ? 'is-avg' : 'is-poor'}`}>
                        <header><b>INP</b><span className="seo-pill">≤ 200 ms</span></header>
                        <strong>{vitals.inpMs != null ? `${vitals.inpMs} ms` : '—'}</strong>
                        <div className="seo-vital-bar" style={{ '--threshold': '25%' }}>
                          <i style={{ width: `${Math.min(100, ((vitals.inpMs ?? 0) / 800) * 100)}%` }} />
                        </div>
                        <p>Cuánto tarda la web en responder a un clic.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="seo-empty-inline">
                      Google no publica métricas de campo para esta web: necesita tráfico suficiente en Chrome
                      para agregarlas. Vuelve a mirar cuando crezcan las visitas.
                    </p>
                  )}
                </Panel>

                {snippets ? (
                  <Panel
                    icon={RiFileCopyLine}
                    title="Aplicar los arreglos"
                    subtitle="Snippets listos para pegar en cualquier web — y aplicación con un clic en tus landings de Vendrava."
                  >
                    <CopyBlock label="Title + meta description" value={snippets.html} />
                    <CopyBlock label="Datos estructurados (Schema.org)" value={snippets.jsonld} />
                    <div className="seo-apply-row">
                      <select
                        className="seo-select"
                        value={landingApply.campaignId}
                        onChange={(e) => setLandingApply((prev) => ({ ...prev, campaignId: e.target.value, done: '', error: '' }))}
                      >
                        <option value="">Elige una landing de Vendrava…</option>
                        {landingCampaigns.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} (/l/{c.landingSlug})</option>
                        ))}
                      </select>
                      <button type="button" className="seo-button" onClick={applyToLanding} disabled={!landingApply.campaignId || landingApply.saving}>
                        {landingApply.saving ? <><Spinner /> Aplicando…</> : 'Aplicar título y meta'}
                      </button>
                    </div>
                    {landingCampaigns.length === 0 ? (
                      <p className="seo-note">No tienes landings publicadas todavía. Crea una en Landings y webs.</p>
                    ) : null}
                    {landingApply.done ? <p className="seo-inline-ok">{landingApply.done}</p> : null}
                    {landingApply.error ? <p className="seo-inline-error">{landingApply.error}</p> : null}
                  </Panel>
                ) : null}
              </div>
            ) : null}

            {/* ── Keywords y posiciones ────────────────────────────────── */}
            {tab === 'keywords' ? (
              <div className="seo-stack">
                <Panel
                  icon={RiSearchEyeLine}
                  title="Keywords recomendadas"
                  subtitle="Las búsquedas por las que merece la pena pelear, con su intención y dificultad."
                  actions={
                    <button type="button" className="seo-button" onClick={keywordsToAds} disabled={adsState.saving}>
                      {adsState.saving ? <><Spinner /> Preparando…</> : <><RiAdvertisementLine /> Crear campaña de Ads</>}
                    </button>
                  }
                >
                  <div className="seo-table-scroll">
                    <table className="seo-table">
                      <thead>
                        <tr>
                          <th>Keyword</th>
                          <th>Intención</th>
                          <th>Dificultad</th>
                          <th>Por qué</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.keywords.map((kw) => (
                          <tr key={kw.keyword}>
                            <td><strong>{kw.keyword}</strong></td>
                            <td><span className={`seo-pill ${INTENT_TONE[kw.intent] ?? ''}`}>{INTENT_LABELS[kw.intent] || kw.intent}</span></td>
                            <td><span className={`seo-pill ${DIFFICULTY_TONE[kw.difficulty] ?? ''}`}>{kw.difficulty}</span></td>
                            <td>{kw.rationale}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {adsState.error ? <p className="seo-inline-error">{adsState.error}</p> : null}
                  <p className="seo-note">
                    Cubre con publicidad las búsquedas transaccionales mientras el orgánico crece: el botón
                    rellena el asistente de Ads con estas keywords.
                  </p>
                </Panel>

                <Panel
                  icon={RiGlobalLine}
                  title="Posicionamiento real (Search Console)"
                  subtitle="Cruce de las keywords recomendadas con las búsquedas por las que Google ya te muestra."
                >
                  {!searchConsole ? (
                    <div className="seo-skeleton"><i /><i /><i /></div>
                  ) : !searchConsole.connected ? (
                    <p className="seo-empty-inline">
                      Google Search Console no está conectado. Conéctalo y sincroniza en{' '}
                      <button type="button" className="seo-link" onClick={() => navigate('/organic')}>Captación orgánica</button>{' '}
                      para ver posiciones, clics e impresiones reales aquí.
                    </p>
                  ) : !searchConsole.totalQueries ? (
                    <p className="seo-empty-inline">
                      Search Console está conectado pero aún no hay búsquedas sincronizadas. Lanza una sincronización desde{' '}
                      <button type="button" className="seo-link" onClick={() => navigate('/organic')}>Captación orgánica</button>.
                    </p>
                  ) : !matchedRows.length ? (
                    <p className="seo-empty-inline">
                      Todavía no apareces en Google por ninguna keyword del plan: son territorio por conquistar
                      con el plan de contenidos.
                    </p>
                  ) : (
                    <div className="seo-table-scroll">
                      <table className="seo-table">
                        <thead>
                          <tr>
                            <th>Keyword del plan</th>
                            <th>Búsqueda real</th>
                            <th className="num">Posición</th>
                            <th className="num">Clics</th>
                            <th className="num">Impresiones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchedRows.flatMap((m) =>
                            m.rows.map((row, i) => (
                              <tr key={`${m.keyword}-${row.query}`}>
                                <td>{i === 0 ? <strong>{m.keyword}</strong> : ''}</td>
                                <td>{row.query}</td>
                                <td className="num">{row.position != null ? row.position.toFixed(1) : '—'}</td>
                                <td className="num">{row.clicks}</td>
                                <td className="num">{row.impressions}</td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {searchConsole?.topQueries?.length ? (
                    <details className="seo-details">
                      <summary>Top {searchConsole.topQueries.length} búsquedas que ya te traen tráfico</summary>
                      <div className="seo-table-scroll">
                        <table className="seo-table">
                          <thead>
                            <tr>
                              <th>Búsqueda</th>
                              <th className="num">Posición</th>
                              <th className="num">Clics</th>
                              <th className="num">Impresiones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {searchConsole.topQueries.map((q) => (
                              <tr key={q.query}>
                                <td><strong>{q.query}</strong></td>
                                <td className="num">{q.position != null ? q.position.toFixed(1) : '—'}</td>
                                <td className="num">{q.clicks}</td>
                                <td className="num">{q.impressions}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ) : null}
                </Panel>

                <Panel
                  icon={RiLineChartLine}
                  title="Evolución de posiciones"
                  subtitle="La vigilancia captura cada semana la posición de las keywords del plan en Search Console."
                >
                  {ranks === null ? (
                    <div className="seo-skeleton"><i /><i /><i /></div>
                  ) : !ranks.length ? (
                    <p className="seo-empty-inline">
                      Todavía no hay serie histórica. Se captura una vez por semana desde que existe un informe
                      y Search Console está conectado: la primera comparación aparecerá dentro de unos días.
                    </p>
                  ) : (
                    <div className="seo-table-scroll">
                      <table className="seo-table">
                        <thead>
                          <tr>
                            <th>Keyword</th>
                            <th className="num">Posición actual</th>
                            <th className="num">Cambio</th>
                            <th className="num">Clics</th>
                            <th>Tendencia</th>
                            <th className="num">Capturas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranks.map((row) => {
                            const withPosition = row.points.filter((p) => p.position != null)
                            const last = withPosition[withPosition.length - 1]
                            const first = withPosition[0]
                            const change = last && first && withPosition.length > 1 ? last.position - first.position : null
                            return (
                              <tr key={row.keyword}>
                                <td><strong>{row.keyword}</strong></td>
                                <td className="num">{last?.position != null ? last.position.toFixed(1) : '—'}</td>
                                <td className="num"><Delta value={change} invert /></td>
                                <td className="num">{row.points[row.points.length - 1]?.clicks ?? 0}</td>
                                <td><RankSpark points={row.points} /></td>
                                <td className="num">{row.points.length}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>

                <Panel
                  icon={RiAlertLine}
                  title="Canibalización de keywords"
                  subtitle="Búsquedas donde dos o más páginas tuyas compiten entre sí y se restan posiciones (últimos 28 días)."
                  actions={
                    <button type="button" className="seo-button" onClick={runCannibalization} disabled={cannibal.loading}>
                      {cannibal.loading ? <><Spinner /> Consultando…</> : 'Detectar canibalización'}
                    </button>
                  }
                >
                  {cannibal.error ? <p className="seo-inline-error">{cannibal.error}</p> : null}
                  {cannibal.items === null && !cannibal.error ? (
                    <p className="seo-empty-inline">Lanza la detección para cruzar tus páginas con las búsquedas de Search Console.</p>
                  ) : null}
                  {cannibal.items !== null && !cannibal.items.length ? (
                    <p className="seo-empty-inline is-ok">Sin canibalización detectada: cada búsqueda tiene una página clara.</p>
                  ) : null}
                  {cannibal.items?.length ? (
                    <div className="seo-table-scroll">
                      <table className="seo-table">
                        <thead>
                          <tr>
                            <th>Búsqueda</th>
                            <th>Páginas que compiten</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cannibal.items.map((row) => (
                            <tr key={row.query}>
                              <td><strong>{row.query}</strong><small>{row.pages.length} páginas</small></td>
                              <td>
                                {row.pages.map((p) => (
                                  <div key={p.page} style={{ wordBreak: 'break-all', marginBottom: 3 }}>
                                    {p.page} · pos. {p.position != null ? p.position.toFixed(1) : '—'} · {p.clicks} clics
                                  </div>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </Panel>
              </div>
            ) : null}

            {/* ── Contenidos ───────────────────────────────────────────── */}
            {tab === 'contenidos' ? (
              <div className="seo-stack">
                <Panel
                  icon={RiFileTextLine}
                  title="Plan de contenidos"
                  subtitle="Redactar con IA → publicar en tu blog indexable → difundir en redes. Las tres cosas, sin salir de aquí."
                >
                  {report.contentPlan?.length ? (
                    <ul className="seo-list">
                      {report.contentPlan.map((item, index) => {
                        const state = contentState[index] ?? {}
                        return (
                          <li key={item.title} className="seo-content-item">
                            <div className="seo-content-main">
                              <span className="seo-content-icon"><RiFileTextLine /></span>
                              <div className="seo-content-copy">
                                <strong>{item.title}</strong>
                                <div className="seo-content-meta">
                                  <span className="seo-pill">{item.format}</span>
                                  <span>keyword: <b>{item.keyword}</b></span>
                                  {state.publishedSlug ? <span className="seo-pill tone-ok">Publicado</span> : null}
                                  {state.shared ? <span className="seo-pill tone-cyan">Difusión programada</span> : null}
                                </div>
                                {state.publishedSlug && blogSlug ? (
                                  <p className="seo-note">
                                    Público en <a className="seo-link" href={`/l/${blogSlug}/blog/${state.publishedSlug}`} target="_blank" rel="noreferrer">/l/{blogSlug}/blog/{state.publishedSlug}</a>
                                  </p>
                                ) : null}
                              </div>
                              <div className="seo-content-actions">
                                {state.articleId ? (
                                  <>
                                    <button type="button" className="seo-button small" onClick={() => navigate(`/knowledge-base/articulos/${state.articleId}`)}>
                                      Ver artículo
                                    </button>
                                    {!state.publishedSlug ? (
                                      <button type="button" className="seo-button small" disabled={state.publishing} onClick={() => publishArticle(index)}>
                                        {state.publishing ? <><Spinner /> Publicando…</> : <><RiEarthLine /> Publicar en el blog</>}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="seo-button small"
                                      onClick={() => patchContent(index, { shareOpen: !state.shareOpen, shareError: '' })}
                                    >
                                      <RiShareForwardLine /> {state.shared ? 'Programado' : 'Difundir'}
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" className="seo-button small" disabled={state.loading} onClick={() => writeArticle(index, item)}>
                                    {state.loading ? <><Spinner /> Redactando…</> : 'Redactar con IA'}
                                  </button>
                                )}
                              </div>
                            </div>
                            {state.error ? <p className="seo-inline-error" style={{ marginLeft: 42 }}>{state.error}</p> : null}
                            {state.shareOpen ? (
                              <div className="seo-share-box">
                                <select
                                  className="seo-select"
                                  value={state.shareCampaignId ?? ''}
                                  onChange={(e) => patchContent(index, { shareCampaignId: e.target.value })}
                                >
                                  <option value="">Campaña con landing para el enlace…</option>
                                  {landingCampaigns.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                                <div className="seo-platforms">
                                  {SOCIAL_PLATFORMS.map((platform) => (
                                    <label key={platform}>
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
                                </div>
                                <button type="button" className="seo-button small" disabled={state.sharing} onClick={() => shareArticle(index)}>
                                  {state.sharing ? <><Spinner /> Programando…</> : 'Programar borrador'}
                                </button>
                                {state.shareError ? <p className="seo-inline-error" style={{ width: '100%' }}>{state.shareError}</p> : null}
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="seo-empty-inline">Este informe no trae plan de contenidos.</p>
                  )}
                  {!blogSlug ? (
                    <p className="seo-note">
                      Para publicar en el blog necesitas una landing publicada: el blog vive en
                      {' '}<code>/l/&lt;slug&gt;/blog</code> y cuelga de ella.
                    </p>
                  ) : null}
                </Panel>

                <Panel
                  icon={RiFileTextLine}
                  title="Contenido a refrescar"
                  subtitle="Artículos SEO sin tocar en más de 90 días: Google premia la frescura. La IA los actualiza conservando keyword y tono."
                >
                  {stale.length ? (
                    <ul className="seo-list">
                      {stale.map((item) => {
                        const state = staleState[item.id] ?? {}
                        return (
                          <li key={item.id} className="seo-content-item">
                            <div className="seo-content-main">
                              <span className="seo-content-icon" style={{ color: 'var(--warn)', borderColor: 'color-mix(in srgb, var(--warn) 26%, transparent)', background: 'color-mix(in srgb, var(--warn) 11%, transparent)' }}>
                                <RiFileTextLine />
                              </span>
                              <div className="seo-content-copy">
                                <strong>{item.name}</strong>
                                <div className="seo-content-meta">
                                  <span>Última actualización: {formatDate(item.updatedAt)}</span>
                                </div>
                                {state.error ? <p className="seo-inline-error">{state.error}</p> : null}
                              </div>
                              <div className="seo-content-actions">
                                <button type="button" className="seo-button small" disabled={state.loading} onClick={() => refreshStale(item.id)}>
                                  {state.loading ? <><Spinner /> Refrescando…</> : 'Refrescar con IA'}
                                </button>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="seo-empty-inline is-ok">Ningún artículo lleva más de 90 días sin actualizarse.</p>
                  )}
                </Panel>
              </div>
            ) : null}

            {/* ── Competencia ──────────────────────────────────────────── */}
            {tab === 'competencia' ? (
              <div className="seo-stack">
                <Panel
                  icon={RiSwordLine}
                  title="Competidores"
                  subtitle="Audita hasta 3 webs rivales con el mismo motor y compara tu score con el suyo. Se guardan en el proyecto: la vigilancia diaria también los audita."
                  actions={
                    <button type="button" className="seo-button" onClick={runCompare} disabled={competitorsLoading}>
                      {competitorsLoading ? <><Spinner /> Auditando…</> : 'Comparar ahora'}
                    </button>
                  }
                >
                  <div className="seo-competitor-fields">
                    {competitorUrls.map((value, index) => (
                      <input
                        key={index}
                        className="seo-input"
                        type="text"
                        value={value}
                        placeholder={`https://competidor-${index + 1}.com`}
                        onChange={(e) => setCompetitorUrls((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))}
                      />
                    ))}
                  </div>
                  {competitorsError ? <p className="seo-inline-error">{competitorsError}</p> : null}
                  {competitors ? (
                    <div className="seo-table-scroll" style={{ marginTop: 16 }}>
                      <table className="seo-table">
                        <thead>
                          <tr>
                            <th>Web</th>
                            <th className="num">Score</th>
                            <th className="num">Checks</th>
                            <th>Puntos débiles</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="is-self">
                            <td><strong>{hostnameOf(report.url)}</strong><small>tu web</small></td>
                            <td className="num"><strong style={{ color: scoreColor(report.score) }}>{report.score}</strong></td>
                            <td className="num">{passed}/{checklist.length}</td>
                            <td>{checklist.filter((c) => !c.ok).map((c) => c.label).slice(0, 4).join(' · ') || '—'}</td>
                          </tr>
                          {competitors.map((c) => (
                            <tr key={c.url}>
                              <td><strong>{hostnameOf(c.url)}</strong></td>
                              <td className="num">
                                {c.webAlive ? <strong style={{ color: scoreColor(c.score) }}>{c.score}</strong> : '—'}
                              </td>
                              <td className="num">{c.webAlive ? `${c.passed}/${c.total}` : 'No accesible'}</td>
                              <td>{c.failedLabels.join(' · ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="seo-note">
                      Los competidores que guardes aquí se vuelven a auditar cada día junto a tu web, así que
                      la comparación no se queda congelada en el momento en que la lanzaste.
                    </p>
                  )}
                </Panel>

                <Panel
                  icon={RiRadarLine}
                  title="Keyword gap"
                  subtitle="Temas y búsquedas que atacan ellos y tú no estás cubriendo."
                  actions={
                    <button type="button" className="seo-button" onClick={runKeywordGap} disabled={gap.loading}>
                      {gap.loading ? <><Spinner /> Analizando…</> : <><RiSearchEyeLine /> Analizar gap con IA</>}
                    </button>
                  }
                >
                  {gap.error ? <p className="seo-inline-error">{gap.error}</p> : null}
                  {gap.items === null && !gap.error ? (
                    <p className="seo-empty-inline">Escribe arriba las webs rivales y lanza el análisis.</p>
                  ) : null}
                  {gap.items !== null && !gap.items.length ? (
                    <p className="seo-empty-inline">No se detectaron keywords nuevas en las webs analizadas.</p>
                  ) : null}
                  {gap.items?.length ? (
                    <div className="seo-table-scroll">
                      <table className="seo-table">
                        <thead>
                          <tr>
                            <th>Keyword / tema</th>
                            <th>Lo ataca</th>
                            <th>Oportunidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gap.items.map((item) => (
                            <tr key={`${item.keyword}-${item.competitor}`}>
                              <td><strong>{item.keyword}</strong></td>
                              <td>{item.competitor}</td>
                              <td>{item.rationale}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </Panel>
              </div>
            ) : null}

            {/* ── Captación ────────────────────────────────────────────── */}
            {tab === 'captacion' ? (
              <div className="seo-stack">
                <Panel
                  icon={RiUserAddLine}
                  title="Imán de leads: auditoría gratuita"
                  subtitle="Una página pública donde cualquier negocio audita su web dejando su contacto — y entra como lead en tu campaña con el informe adjunto."
                >
                  <div className="seo-magnet-row">
                    <select className="seo-select" value={magnetCampaignId} onChange={(e) => setMagnetCampaignId(e.target.value)}>
                      <option value="">Campaña que recibirá los leads…</option>
                      {landingCampaigns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {magnetUrl ? (
                      <>
                        <code className="seo-magnet-url">{magnetUrl}</code>
                        <button type="button" className="seo-button small" onClick={copyMagnetUrl}>
                          <RiFileCopyLine /> {magnetCopied ? 'Copiado' : 'Copiar enlace'}
                        </button>
                        <a className="seo-button small" href={magnetUrl} target="_blank" rel="noreferrer">
                          <RiArrowRightLine /> Abrir
                        </a>
                      </>
                    ) : null}
                  </div>
                  {landingCampaigns.length === 0 ? (
                    <p className="seo-note">
                      Necesitas una campaña con landing publicada (la auditoría pública se ata a ella para
                      atribuir los leads).
                    </p>
                  ) : (
                    <p className="seo-note">
                      Difúndelo en redes, firma de email o anuncios: cada auditoría completada crea un lead con
                      fuente «seo_audit», su score y el informe completo.
                    </p>
                  )}
                </Panel>

                <Panel
                  icon={RiShareForwardLine}
                  title="Informe para el cliente"
                  subtitle="Un enlace público de solo lectura con el informe que estás viendo. No caduca y no expone tu cuenta."
                  actions={
                    <button type="button" className="seo-button" onClick={shareReport} disabled={share.loading || !reportId}>
                      {share.loading ? <><Spinner /> Creando enlace…</> : <><RiShareForwardLine /> Crear y copiar enlace</>}
                    </button>
                  }
                >
                  {share.url ? (
                    <code className="seo-magnet-url">{share.url}</code>
                  ) : (
                    <p className="seo-empty-inline">
                      {reportId
                        ? `Compartirá el informe de ${hostnameOf(report.url)} del ${formatDate(report.generatedAt)}.`
                        : 'Abre un informe del historial para poder compartirlo.'}
                    </p>
                  )}
                  {share.error ? <p className="seo-inline-error">{share.error}</p> : null}
                </Panel>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {modalOpen ? (
        <AuditModal
          form={form}
          setField={setField}
          competitorUrls={competitorUrls}
          setCompetitorUrls={setCompetitorUrls}
          loading={loading}
          error={error}
          onSubmit={analyze}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </div>
  )
}
