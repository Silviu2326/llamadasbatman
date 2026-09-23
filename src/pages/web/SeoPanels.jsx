import { useEffect, useId, useRef, useState } from 'react'
import {
  RiAdvertisementLine, RiAlertLine, RiArrowRightLine, RiBuilding2Line, RiCheckLine, RiCloseLine,
  RiEarthLine, RiFileCopyLine, RiFileTextLine, RiFlashlightLine, RiGlobalLine, RiLineChartLine,
  RiLoader4Line, RiMapPin2Line, RiRadarLine, RiSearchEyeLine, RiShareForwardLine, RiSpeedUpLine,
  RiSwordLine, RiToolsLine,
} from 'react-icons/ri'

/* ── Vocabulario ────────────────────────────────────────────────────────── */

const INTENT_LABELS = { informacional: 'Informacional', comercial: 'Comercial', transaccional: 'Transaccional', local: 'Local' }
const INTENT_TONE = { transaccional: 'tone-ok', comercial: 'tone-cyan', local: 'tone-info', informacional: '' }
const DIFFICULTY_TONE = { baja: 'tone-ok', media: 'tone-warn', alta: 'tone-bad' }
const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'twitter']
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export const SEO_ONBOARD_STEPS = [
  { title: 'Auditamos', copy: 'Leemos tu web como Googlebot y puntuamos 12 comprobaciones técnicas.' },
  { title: 'Rastreamos', copy: 'Seguimos tu sitemap hasta 12 páginas y medimos Core Web Vitals reales.' },
  { title: 'Planificamos', copy: 'Estudio de keywords por intención y plan de contenidos que las ataca.' },
  { title: 'Vigilamos', copy: 'Cada día re-auditamos tu web y la de tus competidores, y avisamos si algo cae.' },
]

export function scoreColor(score) {
  return score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warn)' : 'var(--danger)'
}

export function formatDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

export function formatDateTime(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function Spinner() {
  return <RiLoader4Line className="gs-spin" />
}

/**
 * Lo que el informe SEO pide hacer primero, en el mismo formato que los
 * hallazgos de landings: así la cola del Resumen mezcla las dos fuentes sin
 * que una parezca más urgente solo por su diseño.
 */
export function buildSeoQueue({ report, searchConsole, stale, vitals }) {
  if (!report) return []
  const failed = (report.checklist ?? []).filter(item => !item.ok)
  const items = []
  if (failed.length) {
    items.push({ id: 'seo-technical', tone: 'danger', kind: 'SEO · técnico', title: `Corrige ${failed[0].label.toLowerCase()}`, copy: failed[0].hint || 'Es el siguiente bloqueo técnico que está restando visibilidad.', meta: `${failed.length} ${failed.length === 1 ? 'fallo' : 'fallos'}`, cta: 'Ver salud técnica', target: { tab: 'seo' } })
  }
  if (vitals?.category === 'SLOW') {
    items.push({ id: 'seo-vitals', tone: 'warn', kind: 'SEO · velocidad', title: 'La web carga despacio para usuarios reales', copy: 'Core Web Vitals en rojo: es factor de ranking directo y penaliza también la conversión de las landings.', meta: 'CrUX', cta: 'Ver Core Web Vitals', target: { tab: 'seo' } })
  }
  if (!searchConsole?.connected) {
    items.push({ id: 'seo-measurement', tone: 'info', kind: 'SEO · medición', title: 'Conecta Search Console', copy: 'Sin impresiones, clics y posiciones no sabrás qué contenido merece más inversión.', meta: 'sin datos', cta: 'Conectar en Orgánico', target: { path: '/captacion/atraer/organico?tab=fuentes' } })
  } else if (report.keywords?.[0]) {
    items.push({ id: 'seo-page', tone: 'success', kind: 'SEO · contenido', title: `Crea una página para “${report.keywords[0].keyword}”`, copy: 'La keyword principal ya está en tu plan: conviértela en una página activa con una CTA clara.', meta: 'keyword principal', cta: 'Abrir fábrica', target: { factory: { keyword: report.keywords[0].keyword, mode: 'activa' } } })
  }
  if (stale.length) {
    items.push({ id: 'seo-stale', tone: 'warn', kind: 'SEO · mantenimiento', title: `Refresca ${stale.length} contenido${stale.length === 1 ? '' : 's'}`, copy: 'Los artículos antiguos pierden precisión y oportunidades de enlazado interno.', meta: '+90 días', cta: 'Ver contenidos', target: { tab: 'contenidos' } })
  }
  return items.slice(0, 3)
}

export function SeoQueueCard({ item, onExecute }) {
  return (
    <article className={`gs-queue-card tone-${item.tone}`}>
      <header><span className="gs-queue-kind">{item.kind}</span><span className="gs-queue-meta">{item.meta}</span></header>
      <strong>{item.title}</strong>
      <p>{item.copy}</p>
      <footer><div><button type="button" className="gs-button small" onClick={() => onExecute(item.target)}>{item.cta} <RiArrowRightLine /></button></div></footer>
    </article>
  )
}

/* ── Gráficos ───────────────────────────────────────────────────────────── */

/** Arco SVG con extremo redondeado y llenado animado cuando cambia el informe. */
export function Gauge({ score }) {
  const color = scoreColor(score)
  const gradientId = `wb-gauge-${useId().replace(/:/g, '')}`
  const radius = 46
  const circumference = 2 * Math.PI * radius
  return (
    <div className="wb-gauge" style={{ '--gauge-color': color }}>
      <svg viewBox="0 0 108 108" aria-hidden="true">
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.5" /><stop offset="100%" stopColor={color} /></linearGradient></defs>
        <circle className="wb-gauge-track" cx="54" cy="54" r={radius} />
        <circle className="wb-gauge-value" cx="54" cy="54" r={radius} stroke={`url(#${gradientId})`} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, score)) / 100)} />
      </svg>
      <span className="wb-gauge-label"><b>{score}</b><small>/ 100</small></span>
    </div>
  )
}

/** Evolución del score: área + puntos; los grises son re-auditorías del worker. */
function ScoreTrend({ points }) {
  const width = 560
  const height = 88
  const step = points.length > 1 ? width / (points.length - 1) : 0
  const y = score => height - (score / 100) * (height - 12) - 6
  const coords = points.map((p, i) => [i * step, y(p.score)])
  const line = coords.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Evolución del score SEO">
      <defs><linearGradient id="wb-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {[0, 50, 100].map(level => <line key={level} x1="0" x2={width} y1={y(level)} y2={y(level)} stroke="var(--line)" strokeWidth="1" />)}
      <path d={area} fill="url(#wb-trend-fill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {coords.map(([px, py], i) => <circle key={points[i].id ?? i} cx={px} cy={py} r="3.2" fill={points[i].auto ? 'var(--dim)' : 'var(--accent)'} stroke="var(--surface)" strokeWidth="1.6" />)}
    </svg>
  )
}

/** Serie de posición de una keyword. Eje invertido: arriba = mejor posición. */
function RankSpark({ points }) {
  const usable = points.filter(p => p.position != null)
  if (usable.length < 2) return <span className="gs-pill">Sin serie</span>
  const width = 96
  const height = 26
  const values = usable.map(p => p.position)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (usable.length - 1)
  const path = usable.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(((p.position - min) / span) * (height - 6) + 3).toFixed(1)}`).join(' ')
  return <svg className="wb-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={path} fill="none" stroke="var(--cyan)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>
}

export function Delta({ value, invert = false }) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.05) return <span className="wb-delta is-flat">=</span>
  // En posiciones de Google bajar de número es mejorar: `invert` lo refleja.
  const improved = invert ? value < 0 : value > 0
  return <span className={`wb-delta ${improved ? 'is-up' : 'is-down'}`}>{value > 0 ? '+' : ''}{value.toFixed(1)}</span>
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
    <div className="wb-copy-block">
      <div className="wb-copy-head"><strong>{label}</strong><button type="button" className="gs-button small" onClick={copy}><RiFileCopyLine /> {copied ? 'Copiado' : 'Copiar'}</button></div>
      <pre>{value}</pre>
    </div>
  )
}

/* ── Diálogo de auditoría ───────────────────────────────────────────────── */

/** Cierra con Escape o clic fuera, atrapa el foco y lo devuelve al cerrarse. */
export function AuditModal({ seo, onClose, onSubmit, lockedUrl = false }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = `wb-audit-title-${useId().replace(/:/g, '')}`
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const preferred = dialog?.querySelector('[data-autofocus]')
      ;(preferred instanceof HTMLElement ? preferred : dialog)?.focus()
    })
    function handleKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current?.(); return }
      if (event.key !== 'Tab') return
      const controls = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKey)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  return (
    <div className="gs-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="gs-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <header className="gs-modal-head">
          <span className="gs-modal-eyebrow">Agencia SEO</span>
          <h2 id={titleId}><RiSearchEyeLine /> Nueva auditoría</h2>
          <p>Leemos tu web como lo haría Google, puntuamos lo que encontramos y redactamos el plan de keywords y contenidos que lo arregla.</p>
          <button type="button" className="gs-modal-close" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button>
        </header>
        <form id="wb-audit-form" className="gs-modal-body" onSubmit={event => { event.preventDefault(); onSubmit() }}>
          <div className="gs-form-grid">
            <label className="full"><span>URL de la web <i>*</i></span><input className="gs-input" type="text" value={seo.form.url} readOnly={lockedUrl} onChange={seo.setField('url')} placeholder="https://tunegocio.com" data-autofocus required /></label>
            <label><span>Sector</span><input className="gs-input" type="text" value={seo.form.sector} onChange={seo.setField('sector')} placeholder="clínica dental, restaurante…" /></label>
            <label><span>Ciudad</span><input className="gs-input" type="text" value={seo.form.city} onChange={seo.setField('city')} placeholder="Madrid" /></label>
            <label className="full"><span>Describe tu negocio <small>— cuanto más contexto, mejores keywords</small></span><textarea className="gs-textarea" value={seo.form.business} onChange={seo.setField('business')} placeholder="Qué vendes, a quién y qué te diferencia." /></label>
          </div>
          <div className="gs-modal-section">
            <h3><RiSwordLine /> Competidores de referencia</h3>
            <p>Se guardan en el proyecto para que puedas comparar sus diagnósticos desde Resultados.</p>
            <div className="wb-competitor-fields">
              {seo.competitorUrls.map((value, index) => <input key={index} className="gs-input" type="text" value={value} placeholder={`https://competidor-${index + 1}.com`} onChange={event => seo.setCompetitorUrls(prev => prev.map((v, i) => (i === index ? event.target.value : v)))} />)}
            </div>
          </div>
          {seo.error ? <p className="gs-inline-error">{seo.error}</p> : null}
        </form>
        <footer className="gs-modal-foot">
          <p>{seo.loading ? 'Puedes cerrar esta ventana: el análisis sigue y el informe aparecerá al terminar.' : 'Auditoría técnica + rastreo del sitio + Core Web Vitals + keywords y plan de contenidos.'}</p>
          <div className="gs-modal-actions">
            <button type="button" className="gs-button ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" form="wb-audit-form" className="gs-button primary" disabled={seo.loading}>{seo.loading ? <><Spinner /> Analizando…</> : <><RiSearchEyeLine /> Analizar mi web</>}</button>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ── Estado inicial ─────────────────────────────────────────────────────── */

export function SeoOnboard({ onAudit, onFactory, compact = false }) {
  return (
    <section className={`gs-onboard gs-rise${compact ? ' is-compact' : ''}`}>
      <span className="gs-onboard-icon"><RiSearchEyeLine /></span>
      <h2>Monta tu agencia SEO en un minuto</h2>
      <p>Analizamos tu web, te decimos exactamente qué la frena en Google y te dejamos el plan de keywords y contenidos listo para ejecutar desde aquí mismo.</p>
      {!compact ? (
        <div className="gs-onboard-steps">
          {SEO_ONBOARD_STEPS.map((step, index) => <div key={step.title} className="gs-onboard-step"><span>{index + 1}</span><strong>{step.title}</strong><p>{step.copy}</p></div>)}
        </div>
      ) : null}
      <div className="gs-onboard-actions">
        <button type="button" className="gs-button primary" onClick={onAudit}><RiSearchEyeLine /> Analizar mi web</button>
        <button type="button" className="gs-button" onClick={onFactory}><RiFlashlightLine /> Crear una página con DeepSeek</button>
      </div>
    </section>
  )
}

/* ── Diagnóstico ────────────────────────────────────────────────────────── */

export function SeoDiagnosisHero({ seo }) {
  const { report, form, failed, site, vitals, hostnameOf } = seo
  return (
    <section className="wb-hero gs-rise" style={{ '--gauge-color': scoreColor(report.score) }}>
      <div className="wb-diagnosis">
        <Gauge score={report.score} />
        <div className="wb-diagnosis-copy">
          <h3><span>{hostnameOf(report.url)}</span></h3>
          <p>{report.summary}</p>
          <div className="wb-diagnosis-meta">
            <span className={`gs-pill ${failed ? 'tone-warn' : 'tone-ok'}`}>{failed ? `${failed} fallos técnicos` : 'Sin fallos técnicos'}</span>
            {vitals?.category ? <span className={`gs-pill ${vitals.category === 'FAST' ? 'tone-ok' : vitals.category === 'SLOW' ? 'tone-bad' : 'tone-warn'}`}>Core Web Vitals: {vitals.category}</span> : null}
            {form.sector ? <span className="gs-pill"><RiBuilding2Line />{form.sector}</span> : null}
            {form.city ? <span className="gs-pill"><RiMapPin2Line />{form.city}</span> : null}
            <span className="gs-muted">{report.model}</span>
          </div>
        </div>
        <div className="wb-hero-rail">
          <div><span>Fallos</span><strong style={{ color: failed ? 'var(--danger-faint)' : 'var(--success)' }}>{failed}</strong></div>
          <div><span>Páginas</span>{site ? <strong>{site.pagesAudited}</strong> : <strong className="is-muted">sin rastreo</strong>}</div>
          <div><span>Sitemap</span>{site?.sitemapFound ? <strong>{site.sitemapUrlCount}</strong> : <strong className="is-muted">no encontrado</strong>}</div>
        </div>
      </div>
    </section>
  )
}

export function TechnicalChecklist({ checklist }) {
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiToolsLine /></span>Auditoría técnica</h2><p>Lo que Google comprueba al entrar en tu web. Cada fallo resta score.</p></div></header>
      <div className="gs-panel-body">
        {checklist.length ? (
          <ul className="gs-list">
            {checklist.map(item => <li key={item.id} className={`gs-check ${item.ok ? 'is-ok' : 'is-bad'}`}><span className="gs-check-mark">{item.ok ? <RiCheckLine /> : <RiCloseLine />}</span><div><strong>{item.label}</strong>{!item.ok ? <p>{item.hint}</p> : null}</div></li>)}
          </ul>
        ) : <p className="gs-empty-inline">No se pudo leer la web, así que no hay comprobaciones técnicas que mostrar.</p>}
      </div>
    </section>
  )
}

export function PriorityFixes({ fixes }) {
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiFlashlightLine /></span>Arreglos prioritarios</h2><p>Ordenados por lo que más te está costando ahora mismo.</p></div></header>
      <div className="gs-panel-body">
        {fixes?.length ? fixes.map(fix => (
          <article key={fix.title} className={`wb-fix sev-${fix.severity}`}>
            <header><strong>{fix.title}</strong><span className={`gs-pill ${fix.severity === 'alta' ? 'tone-bad' : fix.severity === 'media' ? 'tone-warn' : ''}`}>{fix.severity}</span></header>
            <p>{fix.howTo}</p>
          </article>
        )) : <p className="gs-empty-inline is-ok">No hay arreglos técnicos pendientes.</p>}
      </div>
    </section>
  )
}

export function LocalSeoPanel({ items }) {
  if (!items?.length) return null
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiMapPin2Line /></span>SEO local</h2><p>Acciones para aparecer en el mapa y en las búsquedas «cerca de mí».</p></div></header>
      <div className="gs-panel-body"><ul className="gs-list">{items.map(action => <li key={action} className="gs-check is-plain"><span className="gs-check-mark"><RiMapPin2Line /></span><div><strong>{action}</strong></div></li>)}</ul></div>
    </section>
  )
}

export function ScoreHistory({ seo }) {
  const { history, reportId, openingReportId, openReport, scoreDelta } = seo
  if (history.length < 2) return null
  const last = history[history.length - 1]
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiLineChartLine /></span>Evolución del score</h2><p>Cada análisis queda guardado. Los puntos grises son las re-auditorías automáticas diarias.</p></div></header>
      <div className="gs-panel-body">
        <div className="wb-trend">
          <div className="wb-trend-chart"><ScoreTrend points={history} /></div>
          <div className="gs-minis">
            <div className="gs-mini"><span>Actual</span><strong style={{ color: scoreColor(last.score) }}>{last.score}</strong></div>
            <div className="gs-mini"><span>Variación</span><strong><Delta value={scoreDelta} /></strong></div>
            <div className="gs-mini"><span>Auditorías</span><strong>{history.length}</strong></div>
          </div>
        </div>
        <div className="wb-history-strip">
          {[...history].reverse().slice(0, 6).map(item => (
            <button key={item.id} type="button" className={`gs-button small${reportId === item.id ? ' accent' : ''}`} onClick={() => openReport(item.id)} disabled={openingReportId === item.id}>
              {openingReportId === item.id ? <Spinner /> : null}{formatDate(item.createdAt)} · {item.score}{item.auto ? ' · auto' : ''}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Salud técnica ──────────────────────────────────────────────────────── */

export function SiteCrawlPanel({ site }) {
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiEarthLine /></span>Rastreo del sitio</h2><p>{site ? `Rastreamos ${site.pagesAudited} páginas siguiendo tu sitemap, igual que haría Googlebot.` : 'El rastreo no se pudo completar en esta auditoría.'}</p></div>
        {site ? (
          <div className="gs-panel-actions">
            <span className={`gs-pill ${site.robotsBlocksAll ? 'tone-bad' : site.robotsFound ? 'tone-ok' : 'tone-warn'}`}>{site.robotsBlocksAll ? 'robots.txt bloquea todo' : site.robotsFound ? 'robots.txt correcto' : 'sin robots.txt'}</span>
            <span className={`gs-pill ${site.sitemapFound ? 'tone-ok' : 'tone-warn'}`}>{site.sitemapFound ? `sitemap · ${site.sitemapUrlCount} URLs` : 'sin sitemap.xml'}</span>
          </div>
        ) : null}
      </header>
      <div className="gs-panel-body">
        {site ? (
          <>
            <div className="gs-stat-grid">
              <div className={`gs-stat ${site.missingTitle ? 'is-bad' : 'is-ok'}`}><span>Sin title</span><strong>{site.missingTitle}</strong><small>páginas invisibles en resultados</small></div>
              <div className={`gs-stat ${site.missingMeta ? 'is-warn' : 'is-ok'}`}><span>Sin meta description</span><strong>{site.missingMeta}</strong><small>Google se inventa el texto</small></div>
              <div className={`gs-stat ${site.missingH1 ? 'is-warn' : 'is-ok'}`}><span>Sin H1</span><strong>{site.missingH1}</strong><small>sin titular que jerarquice</small></div>
              <div className={`gs-stat ${site.duplicateTitles.length ? 'is-bad' : 'is-ok'}`}><span>Titles duplicados</span><strong>{site.duplicateTitles.length}</strong><small>tus páginas compiten entre sí</small></div>
              <div className={`gs-stat ${site.imgsWithoutAlt ? 'is-warn' : 'is-ok'}`}><span>Imágenes sin alt</span><strong>{site.imgsWithoutAlt}</strong><small>fuera de Google Imágenes</small></div>
            </div>
            {site.duplicateTitles.length ? <p className="gs-note">Duplicados: {site.duplicateTitles.map(t => `«${t}»`).join(', ')}</p> : null}
            {site.pages?.length ? (
              <details className="gs-details">
                <summary>Ver las {site.pages.length} páginas rastreadas</summary>
                <div className="gs-table-scroll">
                  <table className="gs-table">
                    <thead><tr><th>Página</th><th>Title</th><th className="num">Meta</th><th className="num">H1</th><th className="num">Img sin alt</th></tr></thead>
                    <tbody>{site.pages.map(page => <tr key={page.url}><td className="wb-break">{page.url}</td><td>{page.title || <em className="wb-missing">sin title</em>}</td><td className="num">{page.hasMetaDescription ? '✓' : '✕'}</td><td className="num">{page.hasH1 ? '✓' : '✕'}</td><td className="num">{page.imgsWithoutAlt}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </>
        ) : <p className="gs-empty-inline">No hay datos de rastreo en este informe: la web no respondió o bloqueó el análisis.</p>}
      </div>
    </section>
  )
}

export function WebVitalsPanel({ vitals }) {
  const has = vitals && (vitals.lcpMs != null || vitals.cls != null || vitals.inpMs != null)
  const grade = (value, good, avg) => (value == null ? '' : value <= good ? 'is-good' : value <= avg ? 'is-avg' : 'is-poor')
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiSpeedUpLine /></span>Core Web Vitals</h2><p>Datos reales de usuarios de Chrome (CrUX). Son factor de ranking directo. La marca en la barra es el umbral de «bueno».</p></div></header>
      <div className="gs-panel-body">
        {has ? (
          <div className="wb-vitals">
            <div className={`wb-vital ${grade(vitals.lcpMs, 2500, 4000)}`}><header><b>LCP</b><span className="gs-pill">≤ 2,5 s</span></header><strong>{vitals.lcpMs != null ? `${(vitals.lcpMs / 1000).toFixed(1)} s` : '—'}</strong><div className="wb-vital-bar" style={{ '--threshold': '50%' }}><i style={{ width: `${Math.min(100, ((vitals.lcpMs ?? 0) / 5000) * 100)}%` }} /></div><p>Cuánto tarda en pintarse el elemento principal.</p></div>
            <div className={`wb-vital ${grade(vitals.cls, 0.1, 0.25)}`}><header><b>CLS</b><span className="gs-pill">≤ 0,1</span></header><strong>{vitals.cls != null ? vitals.cls.toFixed(2) : '—'}</strong><div className="wb-vital-bar" style={{ '--threshold': '20%' }}><i style={{ width: `${Math.min(100, ((vitals.cls ?? 0) / 0.5) * 100)}%` }} /></div><p>Cuánto se mueve el contenido mientras carga.</p></div>
            <div className={`wb-vital ${grade(vitals.inpMs, 200, 500)}`}><header><b>INP</b><span className="gs-pill">≤ 200 ms</span></header><strong>{vitals.inpMs != null ? `${vitals.inpMs} ms` : '—'}</strong><div className="wb-vital-bar" style={{ '--threshold': '25%' }}><i style={{ width: `${Math.min(100, ((vitals.inpMs ?? 0) / 800) * 100)}%` }} /></div><p>Cuánto tarda la web en responder a un clic.</p></div>
          </div>
        ) : <p className="gs-empty-inline">Google no publica métricas de campo para esta web: necesita tráfico suficiente en Chrome para agregarlas. Vuelve a mirar cuando crezcan las visitas.</p>}
      </div>
    </section>
  )
}

/** El puente entre las dos mitades de la página: el SEO aplicado a la landing con un clic. */
export function SnippetsPanel({ seo, landingCampaigns }) {
  const { snippets, landingApply, setLandingApply, applyToLanding, wordpress, setWordpress, applyToWordPress, git, setGit, applyToGit } = seo
  if (!snippets) return null
  const wpSites = wordpress?.connections ?? []
  const gitSites = git?.connections ?? []
  return (
    <section className="gs-panel is-accent">
      <header className="gs-panel-head"><div><span className="gs-overline">Landing ↔ SEO</span><h2><span className="gs-panel-icon"><RiFileCopyLine /></span>Aplicar los arreglos</h2><p>Snippets listos para pegar en cualquier web — y aplicación con un clic en tus landings de Vendrava{wpSites.length ? ' o en tu WordPress conectado' : ''}.</p></div></header>
      <div className="gs-panel-body">
        <CopyBlock label="Title + meta description" value={snippets.html} />
        <CopyBlock label="Datos estructurados (Schema.org)" value={snippets.jsonld} />
        {wpSites.length ? (
          <div className="wb-apply-row">
            <select className="gs-select" value={wordpress.connectionId} onChange={event => setWordpress(prev => ({ ...prev, connectionId: event.target.value, done: '', error: '' }))} aria-label="Web WordPress">
              <option value="">Elige una web WordPress…</option>
              {wpSites.map(site => <option key={site.id} value={site.id}>{site.domain}</option>)}
            </select>
            <select className="gs-select" value={wordpress.pageId} onChange={event => setWordpress(prev => ({ ...prev, pageId: event.target.value, done: '', error: '' }))} disabled={!wordpress.connectionId || wordpress.pagesLoading} aria-label="Página de WordPress">
              <option value="">{wordpress.pagesLoading ? 'Cargando páginas…' : 'Elige la página…'}</option>
              {wordpress.pages.map(page => <option key={page.id} value={page.id}>{page.title || page.slug || `#${page.id}`}</option>)}
            </select>
            <button type="button" className="gs-button" onClick={applyToWordPress} disabled={!wordpress.connectionId || !wordpress.pageId || wordpress.saving}>{wordpress.saving ? <><Spinner /> Aplicando…</> : 'Aplicar en WordPress'}</button>
          </div>
        ) : null}
        {wordpress?.done ? <p className="gs-inline-ok">{wordpress.done}</p> : null}
        {wordpress?.error ? <p className="gs-inline-error">{wordpress.error}</p> : null}
        {gitSites.length ? (
          <div className="wb-apply-row">
            <select className="gs-select" value={git.connectionId} onChange={event => setGit(prev => ({ ...prev, connectionId: event.target.value, done: '', error: '' }))} aria-label="Repositorio conectado">
              <option value="">Elige una web con repositorio…</option>
              {gitSites.map(site => <option key={site.id} value={site.id}>{site.domain} · {site.connector.owner}/{site.connector.repo}</option>)}
            </select>
            <button type="button" className="gs-button" onClick={applyToGit} disabled={!git.connectionId || git.saving}>{git.saving ? <><Spinner /> Encolando…</> : 'Proponer pull request'}</button>
          </div>
        ) : null}
        {git?.done ? <p className="gs-inline-ok">{git.done}</p> : null}
        {git?.error ? <p className="gs-inline-error">{git.error}</p> : null}
        <div className="wb-apply-row">
          <select className="gs-select" value={landingApply.campaignId} onChange={event => setLandingApply(prev => ({ ...prev, campaignId: event.target.value, done: '', error: '' }))}>
            <option value="">Elige una landing de Vendrava…</option>
            {landingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name} (/l/{c.landingSlug})</option>)}
          </select>
          <button type="button" className="gs-button" onClick={applyToLanding} disabled={!landingApply.campaignId || landingApply.saving}>{landingApply.saving ? <><Spinner /> Aplicando…</> : 'Aplicar título y meta'}</button>
        </div>
        {landingCampaigns.length === 0 ? <p className="gs-note">No tienes landings publicadas todavía. Crea una en la pestaña Landings.</p> : null}
        {landingApply.done ? <p className="gs-inline-ok">{landingApply.done}</p> : null}
        {landingApply.error ? <p className="gs-inline-error">{landingApply.error}</p> : null}
      </div>
    </section>
  )
}

/* ── Keywords ───────────────────────────────────────────────────────────── */

export function KeywordsPanel({ seo, onAds }) {
  const { report, adsState } = seo
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiSearchEyeLine /></span>Keywords recomendadas</h2><p>Las búsquedas por las que merece la pena pelear, con su intención y dificultad.</p></div>
        <div className="gs-panel-actions"><button type="button" className="gs-button" onClick={onAds} disabled={adsState.saving}>{adsState.saving ? <><Spinner /> Preparando…</> : <><RiAdvertisementLine /> Crear campaña de Ads</>}</button></div>
      </header>
      <div className="gs-panel-body">
        <div className="gs-table-scroll">
          <table className="gs-table">
            <thead><tr><th>Keyword</th><th>Intención</th><th>Dificultad</th><th>Por qué</th></tr></thead>
            <tbody>{report.keywords.map(kw => <tr key={kw.keyword}><td><strong>{kw.keyword}</strong></td><td><span className={`gs-pill ${INTENT_TONE[kw.intent] ?? ''}`}>{INTENT_LABELS[kw.intent] || kw.intent}</span></td><td><span className={`gs-pill ${DIFFICULTY_TONE[kw.difficulty] ?? ''}`}>{kw.difficulty}</span></td><td>{kw.rationale}</td></tr>)}</tbody>
          </table>
        </div>
        {adsState.error ? <p className="gs-inline-error">{adsState.error}</p> : null}
        <p className="gs-note">Cubre con publicidad las búsquedas transaccionales mientras el orgánico crece: el botón rellena el asistente de Ads con estas keywords.</p>
      </div>
    </section>
  )
}

export function SearchConsolePanel({ seo, onConnect }) {
  const { searchConsole, matchedRows } = seo
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiGlobalLine /></span>Posicionamiento real (Search Console)</h2><p>Búsquedas, clics e impresiones sincronizados desde tu propiedad de Google.</p></div></header>
      <div className="gs-panel-body">
        {!searchConsole ? <div className="gs-skeleton"><i /><i /><i /></div>
          : !searchConsole.connected ? <p className="gs-empty-inline">{searchConsole.siteMismatch ? 'La propiedad conectada pertenece a otra web. Configura la propiedad de esta web en' : 'Google Search Console no está conectado. Conéctalo y sincroniza en'} <button type="button" className="gs-link" onClick={onConnect}>Orgánico y social → Fuentes</button> para ver posiciones, clics e impresiones reales aquí.</p>
            : !searchConsole.totalQueries ? <p className="gs-empty-inline">Search Console está conectado pero aún no hay búsquedas sincronizadas. Lanza una sincronización desde <button type="button" className="gs-link" onClick={onConnect}>Orgánico y social → Fuentes</button>.</p>
              : !matchedRows.length ? <p className="gs-empty-inline">No hay coincidencias con el plan de contenido. Puedes consultar las búsquedas registradas más abajo.</p>
                : (
                  <div className="gs-table-scroll">
                    <table className="gs-table">
                      <thead><tr><th>Keyword del plan</th><th>Búsqueda real</th><th className="num">Posición</th><th className="num">Clics</th><th className="num">Impresiones</th></tr></thead>
                      <tbody>{matchedRows.flatMap(m => m.rows.map((row, i) => <tr key={`${m.keyword}-${row.query}`}><td>{i === 0 ? <strong>{m.keyword}</strong> : ''}</td><td>{row.query}</td><td className="num">{row.position != null ? row.position.toFixed(1) : '—'}</td><td className="num">{row.clicks}</td><td className="num">{row.impressions}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
        {searchConsole?.topQueries?.length ? (
          <details className="gs-details">
            <summary>Top {searchConsole.topQueries.length} búsquedas que ya te traen tráfico</summary>
            <div className="gs-table-scroll">
              <table className="gs-table">
                <thead><tr><th>Búsqueda</th><th className="num">Posición</th><th className="num">Clics</th><th className="num">Impresiones</th></tr></thead>
                <tbody>{searchConsole.topQueries.map(q => <tr key={q.query}><td><strong>{q.query}</strong></td><td className="num">{q.position != null ? q.position.toFixed(1) : '—'}</td><td className="num">{q.clicks}</td><td className="num">{q.impressions}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        ) : null}
      </div>
    </section>
  )
}

export function RankEvolutionPanel({ ranks }) {
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiLineChartLine /></span>Evolución de posiciones</h2><p>La vigilancia captura cada semana la posición de las keywords del plan en Search Console.</p></div></header>
      <div className="gs-panel-body">
        {ranks === null ? <div className="gs-skeleton"><i /><i /><i /></div>
          : !ranks.length ? <p className="gs-empty-inline">Todavía no hay serie histórica. Se captura una vez por semana desde que existe un informe y Search Console está conectado: la primera comparación aparecerá dentro de unos días.</p>
            : (
              <div className="gs-table-scroll">
                <table className="gs-table">
                  <thead><tr><th>Keyword</th><th className="num">Posición actual</th><th className="num">Cambio</th><th className="num">Clics</th><th>Tendencia</th><th className="num">Capturas</th></tr></thead>
                  <tbody>
                    {ranks.map(row => {
                      const withPosition = row.points.filter(p => p.position != null)
                      const last = withPosition[withPosition.length - 1]
                      const first = withPosition[0]
                      const change = last && first && withPosition.length > 1 ? last.position - first.position : null
                      return <tr key={row.keyword}><td><strong>{row.keyword}</strong></td><td className="num">{last?.position != null ? last.position.toFixed(1) : '—'}</td><td className="num"><Delta value={change} invert /></td><td className="num">{row.points[row.points.length - 1]?.clicks ?? 0}</td><td><RankSpark points={row.points} /></td><td className="num">{row.points.length}</td></tr>
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </section>
  )
}

export function CannibalizationPanel({ cannibal, onRun }) {
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiAlertLine /></span>Canibalización de keywords</h2><p>Búsquedas donde dos o más páginas tuyas compiten entre sí y se restan posiciones (últimos 28 días).</p></div>
        <div className="gs-panel-actions"><button type="button" className="gs-button" onClick={onRun} disabled={cannibal.loading}>{cannibal.loading ? <><Spinner /> Consultando…</> : 'Detectar canibalización'}</button></div>
      </header>
      <div className="gs-panel-body">
        {cannibal.error ? <p className="gs-inline-error">{cannibal.error}</p> : null}
        {cannibal.items === null && !cannibal.error ? <p className="gs-empty-inline">Lanza la detección para cruzar tus páginas con las búsquedas de Search Console.</p> : null}
        {cannibal.items !== null && !cannibal.items.length ? <p className="gs-empty-inline is-ok">Sin canibalización detectada: cada búsqueda tiene una página clara.</p> : null}
        {cannibal.items?.length ? (
          <div className="gs-table-scroll">
            <table className="gs-table">
              <thead><tr><th>Búsqueda</th><th>Páginas que compiten</th></tr></thead>
              <tbody>{cannibal.items.map(row => <tr key={row.query}><td><strong>{row.query}</strong><small>{row.pages.length} páginas</small></td><td>{row.pages.map(p => <div key={p.page} className="wb-break">{p.page} · pos. {p.position != null ? p.position.toFixed(1) : '—'} · {p.clicks} clics</div>)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ── Contenidos ─────────────────────────────────────────────────────────── */

export function ContentPlanPanel({ seo, landingCampaigns, onOpenArticle }) {
  const { report, contentState, patchContent, writeArticle, publishArticle, shareArticle, blogSlug } = seo
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>Plan de contenidos</h2><p>Redactar con IA → publicar en tu blog indexable → difundir en redes. Las tres cosas, sin salir de aquí.</p></div></header>
      <div className="gs-panel-body">
        {report?.contentPlan?.length ? (
          <ul className="gs-list">
            {report.contentPlan.map((item, index) => {
              const state = contentState[index] ?? {}
              return (
                <li key={item.title} className="wb-content-item">
                  <div className="wb-content-main">
                    <span className="wb-content-icon"><RiFileTextLine /></span>
                    <div className="wb-content-copy">
                      <strong>{item.title}</strong>
                      <div className="wb-content-meta"><span className="gs-pill">{item.format}</span><span>keyword: <b>{item.keyword}</b></span>{state.publishedSlug ? <span className="gs-pill tone-ok">Publicado</span> : null}{state.shared ? <span className="gs-pill tone-cyan">Difusión programada</span> : null}</div>
                      {state.publishedSlug && blogSlug ? <p className="gs-note">Público en <a className="gs-link" href={`/l/${blogSlug}/blog/${state.publishedSlug}`} target="_blank" rel="noreferrer">/l/{blogSlug}/blog/{state.publishedSlug}</a></p> : null}
                    </div>
                    <div className="wb-content-actions">
                      {state.articleId ? (
                        <>
                          <button type="button" className="gs-button small" onClick={() => onOpenArticle(state.articleId)}>Ver artículo</button>
                          {!state.publishedSlug ? <button type="button" className="gs-button small" disabled={state.publishing} onClick={() => publishArticle(index)}>{state.publishing ? <><Spinner /> Publicando…</> : <><RiEarthLine /> Publicar en el blog</>}</button> : null}
                          <button type="button" className="gs-button small" onClick={() => patchContent(index, { shareOpen: !state.shareOpen, shareError: '' })}><RiShareForwardLine /> {state.shared ? 'Programado' : 'Difundir'}</button>
                        </>
                      ) : <button type="button" className="gs-button small" disabled={state.loading} onClick={() => writeArticle(index, item)}>{state.loading ? <><Spinner /> Redactando…</> : 'Redactar con IA'}</button>}
                    </div>
                  </div>
                  {state.error ? <p className="gs-inline-error wb-indent">{state.error}</p> : null}
                  {state.shareOpen ? (
                    <div className="wb-share-box">
                      <select className="gs-select" value={state.shareCampaignId ?? ''} onChange={event => patchContent(index, { shareCampaignId: event.target.value })}>
                        <option value="">Campaña con landing para el enlace…</option>
                        {landingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <div className="wb-platforms">
                        {SOCIAL_PLATFORMS.map(platform => (
                          <label key={platform}><input type="checkbox" checked={(state.platforms ?? []).includes(platform)} onChange={event => { const current = new Set(state.platforms ?? []); if (event.target.checked) current.add(platform); else current.delete(platform); patchContent(index, { platforms: [...current] }) }} />{platform}</label>
                        ))}
                      </div>
                      <button type="button" className="gs-button small" disabled={state.sharing} onClick={() => shareArticle(index)}>{state.sharing ? <><Spinner /> Programando…</> : 'Programar borrador'}</button>
                      {state.shareError ? <p className="gs-inline-error" style={{ width: '100%' }}>{state.shareError}</p> : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : <p className="gs-empty-inline">{report ? 'Este informe no trae plan de contenidos.' : 'Audita tu web para tener un plan de contenidos por keyword.'}</p>}
        {!blogSlug ? <p className="gs-note">Para publicar en el blog necesitas una landing publicada: el blog vive en <code>/l/&lt;slug&gt;/blog</code> y cuelga de ella.</p> : null}
      </div>
    </section>
  )
}

export function StaleContentPanel({ stale, staleState, onRefresh }) {
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>Contenido a refrescar</h2><p>Artículos SEO sin tocar en más de 90 días: Google premia la frescura. La IA los actualiza conservando keyword y tono.</p></div></header>
      <div className="gs-panel-body">
        {stale.length ? (
          <ul className="gs-list">
            {stale.map(item => {
              const state = staleState[item.id] ?? {}
              return (
                <li key={item.id} className="wb-content-item">
                  <div className="wb-content-main">
                    <span className="wb-content-icon is-warn"><RiFileTextLine /></span>
                    <div className="wb-content-copy"><strong>{item.name}</strong><div className="wb-content-meta"><span>Última actualización: {formatDate(item.updatedAt)}</span></div>{state.error ? <p className="gs-inline-error">{state.error}</p> : null}</div>
                    <div className="wb-content-actions"><button type="button" className="gs-button small" disabled={state.loading} onClick={() => onRefresh(item.id)}>{state.loading ? <><Spinner /> Refrescando…</> : 'Refrescar con IA'}</button></div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : <p className="gs-empty-inline is-ok">Ningún artículo lleva más de 90 días sin actualizarse.</p>}
      </div>
    </section>
  )
}

/* ── Competencia ────────────────────────────────────────────────────────── */

export function CompetitorsPanel({ seo }) {
  const { competitorUrls, setCompetitorUrls, competitors, competitorsLoading, competitorsError, runCompare, report, passed, checklist, hostnameOf } = seo
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiSwordLine /></span>Competidores</h2><p>Audita hasta 3 webs rivales con el mismo motor y compara tu score con el suyo. Se guardan en el proyecto: la vigilancia diaria también los audita.</p></div>
        <div className="gs-panel-actions"><button type="button" className="gs-button" onClick={runCompare} disabled={competitorsLoading}>{competitorsLoading ? <><Spinner /> Auditando…</> : 'Comparar ahora'}</button></div>
      </header>
      <div className="gs-panel-body">
        <div className="wb-competitor-fields">
          {competitorUrls.map((value, index) => <input key={index} className="gs-input" type="text" value={value} placeholder={`https://competidor-${index + 1}.com`} onChange={event => setCompetitorUrls(prev => prev.map((v, i) => (i === index ? event.target.value : v)))} />)}
        </div>
        {competitorsError ? <p className="gs-inline-error">{competitorsError}</p> : null}
        {competitors ? (
          <div className="gs-table-scroll" style={{ marginTop: 16 }}>
            <table className="gs-table">
              <thead><tr><th>Web</th><th className="num">Score</th><th className="num">Checks</th><th>Puntos débiles</th></tr></thead>
              <tbody>
                {report ? <tr className="is-self"><td><strong>{hostnameOf(report.url)}</strong><small>tu web</small></td><td className="num"><strong style={{ color: scoreColor(report.score) }}>{report.score}</strong></td><td className="num">{passed}/{checklist.length}</td><td>{checklist.filter(c => !c.ok).map(c => c.label).slice(0, 4).join(' · ') || '—'}</td></tr> : null}
                {competitors.map(c => <tr key={c.url}><td><strong>{hostnameOf(c.url)}</strong></td><td className="num">{c.webAlive ? <strong style={{ color: scoreColor(c.score) }}>{c.score}</strong> : '—'}</td><td className="num">{c.webAlive ? `${c.passed}/${c.total}` : 'No accesible'}</td><td>{c.failedLabels.join(' · ') || '—'}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="gs-note">Los competidores que guardes aquí se vuelven a auditar cada día junto a tu web, así que la comparación no se queda congelada en el momento en que la lanzaste.</p>}
      </div>
    </section>
  )
}

export function KeywordGapPanel({ gap, onRun }) {
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiRadarLine /></span>Keyword gap</h2><p>Temas y búsquedas que atacan ellos y tú no estás cubriendo.</p></div>
        <div className="gs-panel-actions"><button type="button" className="gs-button" onClick={onRun} disabled={gap.loading}>{gap.loading ? <><Spinner /> Analizando…</> : <><RiSearchEyeLine /> Analizar gap con IA</>}</button></div>
      </header>
      <div className="gs-panel-body">
        {gap.error ? <p className="gs-inline-error">{gap.error}</p> : null}
        {gap.items === null && !gap.error ? <p className="gs-empty-inline">Escribe arriba las webs rivales y lanza el análisis.</p> : null}
        {gap.items !== null && !gap.items.length ? <p className="gs-empty-inline">No se detectaron keywords nuevas en las webs analizadas.</p> : null}
        {gap.items?.length ? (
          <div className="gs-table-scroll">
            <table className="gs-table">
              <thead><tr><th>Keyword / tema</th><th>Lo ataca</th><th>Oportunidad</th></tr></thead>
              <tbody>{gap.items.map(item => <tr key={`${item.keyword}-${item.competitor}`}><td><strong>{item.keyword}</strong></td><td>{item.competitor}</td><td>{item.rationale}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  )
}
