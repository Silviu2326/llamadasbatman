import { useEffect, useId, useRef, useState } from 'react'
import {
  RiAdvertisementLine, RiAlertLine, RiArrowRightLine, RiBuilding2Line, RiCheckLine, RiCloseLine,
  RiEarthLine, RiFileCopyLine, RiFileTextLine, RiFlashlightLine, RiGlobalLine, RiLineChartLine,
  RiLoader4Line, RiMapPin2Line, RiRadarLine, RiSearchEyeLine, RiShareForwardLine, RiSpeedUpLine,
  RiSwordLine, RiToolsLine,
} from 'react-icons/ri'
import { createTranslator, getLocale, localeCode, useI18n } from '../../i18n'

/* ── Vocabulario ────────────────────────────────────────────────────────── */

const INTENT_KEYS = ['informacional', 'comercial', 'transaccional', 'local']
const DIFFICULTY_KEYS = ['baja', 'media', 'alta']
const INTENT_TONE = { transaccional: 'tone-ok', comercial: 'tone-cyan', local: 'tone-info', informacional: '' }
const DIFFICULTY_TONE = { baja: 'tone-ok', media: 'tone-warn', alta: 'tone-bad' }
const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'twitter']
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export const seoOnboardSteps = (t = createTranslator(getLocale())) => [1, 2, 3, 4].map(n => ({ title: t(`webSeo.panels.onboard.step${n}`), copy: t(`webSeo.panels.onboard.step${n}Copy`) }))

export function scoreColor(score) {
  return score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warn)' : 'var(--danger)'
}

export function formatDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(localeCode(getLocale()))
}

export function formatDateTime(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(localeCode(getLocale()))
}

export function Spinner() {
  return <RiLoader4Line className="gs-spin" />
}

/**
 * Lo que el informe SEO pide hacer primero, en el mismo formato que los
 * hallazgos de landings: así la cola del Resumen mezcla las dos fuentes sin
 * que una parezca más urgente solo por su diseño.
 */
export function buildSeoQueue({ report, searchConsole, stale, vitals }, t = createTranslator(getLocale())) {
  if (!report) return []
  const failed = (report.checklist ?? []).filter(item => !item.ok)
  const items = []
  if (failed.length) {
    items.push({ id: 'seo-technical', tone: 'danger', kind: t('webSeo.panels.queue.technicalKind'), title: t('webSeo.panels.queue.fix', { label: failed[0].label.toLowerCase() }), copy: failed[0].hint || t('webSeo.panels.queue.nextBlocker'), meta: failed.length === 1 ? t('webSeo.panels.queue.failure') : t('webSeo.panels.queue.failures', { n: failed.length }), cta: t('webSeo.panels.queue.seeTechnical'), target: { tab: 'seo' } })
  }
  if (vitals?.category === 'SLOW') {
    items.push({ id: 'seo-vitals', tone: 'warn', kind: t('webSeo.panels.queue.speedKind'), title: t('webSeo.panels.queue.slowTitle'), copy: t('webSeo.panels.queue.slowCopy'), meta: 'CrUX', cta: t('webSeo.panels.queue.seeVitals'), target: { tab: 'seo' } })
  }
  if (!searchConsole?.connected) {
    items.push({ id: 'seo-measurement', tone: 'info', kind: t('webSeo.panels.queue.measurementKind'), title: t('webSeo.panels.queue.connectSc'), copy: t('webSeo.panels.queue.scCopy'), meta: t('webSeo.panels.queue.noData'), cta: t('webSeo.panels.queue.connectOrganic'), target: { path: '/captacion/atraer/organico?tab=fuentes' } })
  } else if (report.keywords?.[0]) {
    items.push({ id: 'seo-page', tone: 'success', kind: t('webSeo.panels.queue.contentKind'), title: t('webSeo.panels.queue.createPage', { keyword: report.keywords[0].keyword }), copy: t('webSeo.panels.queue.createPageCopy'), meta: t('webSeo.panels.queue.mainKeyword'), cta: t('webSeo.panels.queue.openFactory'), target: { factory: { keyword: report.keywords[0].keyword, mode: 'activa' } } })
  }
  if (stale.length) {
    items.push({ id: 'seo-stale', tone: 'warn', kind: t('webSeo.panels.queue.maintenanceKind'), title: stale.length === 1 ? t('webSeo.panels.queue.refreshOne') : t('webSeo.panels.queue.refreshMany', { n: stale.length }), copy: t('webSeo.panels.queue.refreshCopy'), meta: t('webSeo.panels.queue.plus90'), cta: t('webSeo.panels.queue.seeContent'), target: { tab: 'contenidos' } })
  }
  return items.slice(0, 3)
}

export function SeoQueueCard({ item, onExecute }) {
  // Los textos ya vienen traducidos de buildSeoQueue.
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
  const { t } = useI18n()
  const width = 560
  const height = 88
  const step = points.length > 1 ? width / (points.length - 1) : 0
  const y = score => height - (score / 100) * (height - 12) - 6
  const coords = points.map((p, i) => [i * step, y(p.score)])
  const line = coords.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t('webSeo.panels.trendAria')}>
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
  const { t } = useI18n()
  const usable = points.filter(p => p.position != null)
  if (usable.length < 2) return <span className="gs-pill">{t('webSeo.panels.noSeries')}</span>
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
  const { t } = useI18n()
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
      <div className="wb-copy-head"><strong>{label}</strong><button type="button" className="gs-button small" onClick={copy}><RiFileCopyLine /> {copied ? t('webSeo.panels.copied') : t('webSeo.panels.copy')}</button></div>
      <pre>{value}</pre>
    </div>
  )
}

/* ── Diálogo de auditoría ───────────────────────────────────────────────── */

/** Cierra con Escape o clic fuera, atrapa el foco y lo devuelve al cerrarse. */
export function AuditModal({ seo, onClose, onSubmit, lockedUrl = false }) {
  const { t } = useI18n()
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
          <span className="gs-modal-eyebrow">{t('webSeo.panels.audit.eyebrow')}</span>
          <h2 id={titleId}><RiSearchEyeLine /> {t('webSeo.panels.audit.title')}</h2>
          <p>{t('webSeo.panels.audit.intro')}</p>
          <button type="button" className="gs-modal-close" onClick={onClose} aria-label={t('webSeo.panels.audit.close')}><RiCloseLine /></button>
        </header>
        <form id="wb-audit-form" className="gs-modal-body" onSubmit={event => { event.preventDefault(); onSubmit() }}>
          <div className="gs-form-grid">
            <label className="full"><span>{t('webSeo.panels.audit.url')} <i>*</i></span><input className="gs-input" type="text" value={seo.form.url} readOnly={lockedUrl} onChange={seo.setField('url')} placeholder="https://tunegocio.com" data-autofocus required /></label>
            <label><span>{t('webSeo.panels.audit.sector')}</span><input className="gs-input" type="text" value={seo.form.sector} onChange={seo.setField('sector')} placeholder={t('webSeo.panels.audit.sectorPlaceholder')} /></label>
            <label><span>{t('webSeo.panels.audit.city')}</span><input className="gs-input" type="text" value={seo.form.city} onChange={seo.setField('city')} placeholder={t('webSeo.panels.audit.cityPlaceholder')} /></label>
            <label className="full"><span>{t('webSeo.panels.audit.business')} <small>{t('webSeo.panels.audit.businessHint')}</small></span><textarea className="gs-textarea" value={seo.form.business} onChange={seo.setField('business')} placeholder={t('webSeo.panels.audit.businessPlaceholder')} /></label>
          </div>
          <div className="gs-modal-section">
            <h3><RiSwordLine /> {t('webSeo.panels.audit.competitors')}</h3>
            <p>{t('webSeo.panels.audit.competitorsHint')}</p>
            <div className="wb-competitor-fields">
              {seo.competitorUrls.map((value, index) => <input key={index} className="gs-input" type="text" value={value} placeholder={t('webSeo.panels.audit.competitorPlaceholder', { n: index + 1 })} onChange={event => seo.setCompetitorUrls(prev => prev.map((v, i) => (i === index ? event.target.value : v)))} />)}
            </div>
          </div>
          {seo.error ? <p className="gs-inline-error">{seo.error}</p> : null}
        </form>
        <footer className="gs-modal-foot">
          <p>{seo.loading ? t('webSeo.panels.audit.canClose') : t('webSeo.panels.audit.includes')}</p>
          <div className="gs-modal-actions">
            <button type="button" className="gs-button ghost" onClick={onClose}>{t('webSeo.panels.audit.cancel')}</button>
            <button type="submit" form="wb-audit-form" className="gs-button primary" disabled={seo.loading}>{seo.loading ? <><Spinner /> {t('webSeo.panels.audit.analyzing')}</> : <><RiSearchEyeLine /> {t('webSeo.panels.audit.analyze')}</>}</button>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ── Estado inicial ─────────────────────────────────────────────────────── */

export function SeoOnboard({ onAudit, onFactory, compact = false }) {
  const { t } = useI18n()
  return (
    <section className={`gs-onboard gs-rise${compact ? ' is-compact' : ''}`}>
      <span className="gs-onboard-icon"><RiSearchEyeLine /></span>
      <h2>{t('webSeo.panels.onboard.title')}</h2>
      <p>{t('webSeo.panels.onboard.intro')}</p>
      {!compact ? (
        <div className="gs-onboard-steps">
          {seoOnboardSteps(t).map((step, index) => <div key={step.title} className="gs-onboard-step"><span>{index + 1}</span><strong>{step.title}</strong><p>{step.copy}</p></div>)}
        </div>
      ) : null}
      <div className="gs-onboard-actions">
        <button type="button" className="gs-button primary" onClick={onAudit}><RiSearchEyeLine /> {t('webSeo.panels.audit.analyze')}</button>
        <button type="button" className="gs-button" onClick={onFactory}><RiFlashlightLine /> {t('webSeo.panels.onboard.createWithDeepseek')}</button>
      </div>
    </section>
  )
}

/* ── Diagnóstico ────────────────────────────────────────────────────────── */

export function SeoDiagnosisHero({ seo }) {
  const { t } = useI18n()
  const { report, form, failed, site, vitals, hostnameOf } = seo
  return (
    <section className="wb-hero gs-rise" style={{ '--gauge-color': scoreColor(report.score) }}>
      <div className="wb-diagnosis">
        <Gauge score={report.score} />
        <div className="wb-diagnosis-copy">
          <h3><span>{hostnameOf(report.url)}</span></h3>
          <p>{report.summary}</p>
          <div className="wb-diagnosis-meta">
            <span className={`gs-pill ${failed ? 'tone-warn' : 'tone-ok'}`}>{failed ? t('webSeo.panels.hero.failures', { n: failed }) : t('webSeo.panels.hero.noFailures')}</span>
            {vitals?.category ? <span className={`gs-pill ${vitals.category === 'FAST' ? 'tone-ok' : vitals.category === 'SLOW' ? 'tone-bad' : 'tone-warn'}`}>{t('webSeo.panels.hero.cwv', { category: vitals.category })}</span> : null}
            {form.sector ? <span className="gs-pill"><RiBuilding2Line />{form.sector}</span> : null}
            {form.city ? <span className="gs-pill"><RiMapPin2Line />{form.city}</span> : null}
            <span className="gs-muted">{report.model}</span>
          </div>
        </div>
        <div className="wb-hero-rail">
          <div><span>{t('webSeo.panels.hero.failuresLabel')}</span><strong style={{ color: failed ? 'var(--danger-faint)' : 'var(--success)' }}>{failed}</strong></div>
          <div><span>{t('webSeo.panels.hero.pages')}</span>{site ? <strong>{site.pagesAudited}</strong> : <strong className="is-muted">{t('webSeo.panels.hero.noCrawl')}</strong>}</div>
          <div><span>{t('webSeo.panels.hero.sitemap')}</span>{site?.sitemapFound ? <strong>{site.sitemapUrlCount}</strong> : <strong className="is-muted">{t('webSeo.panels.hero.notFound')}</strong>}</div>
        </div>
      </div>
    </section>
  )
}

export function TechnicalChecklist({ checklist }) {
  const { t } = useI18n()
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiToolsLine /></span>{t('webSeo.panels.checklist.title')}</h2><p>{t('webSeo.panels.checklist.intro')}</p></div></header>
      <div className="gs-panel-body">
        {checklist.length ? (
          <ul className="gs-list">
            {checklist.map(item => <li key={item.id} className={`gs-check ${item.ok ? 'is-ok' : 'is-bad'}`}><span className="gs-check-mark">{item.ok ? <RiCheckLine /> : <RiCloseLine />}</span><div><strong>{item.label}</strong>{!item.ok ? <p>{item.hint}</p> : null}</div></li>)}
          </ul>
        ) : <p className="gs-empty-inline">{t('webSeo.panels.checklist.empty')}</p>}
      </div>
    </section>
  )
}

export function PriorityFixes({ fixes }) {
  const { t } = useI18n()
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiFlashlightLine /></span>{t('webSeo.panels.fixes.title')}</h2><p>{t('webSeo.panels.fixes.intro')}</p></div></header>
      <div className="gs-panel-body">
        {fixes?.length ? fixes.map(fix => (
          <article key={fix.title} className={`wb-fix sev-${fix.severity}`}>
            <header><strong>{fix.title}</strong><span className={`gs-pill ${fix.severity === 'alta' ? 'tone-bad' : fix.severity === 'media' ? 'tone-warn' : ''}`}>{fix.severity}</span></header>
            <p>{fix.howTo}</p>
          </article>
        )) : <p className="gs-empty-inline is-ok">{t('webSeo.panels.fixes.empty')}</p>}
      </div>
    </section>
  )
}

export function LocalSeoPanel({ items }) {
  const { t } = useI18n()
  if (!items?.length) return null
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiMapPin2Line /></span>{t('webSeo.panels.local.title')}</h2><p>{t('webSeo.panels.local.intro')}</p></div></header>
      <div className="gs-panel-body"><ul className="gs-list">{items.map(action => <li key={action} className="gs-check is-plain"><span className="gs-check-mark"><RiMapPin2Line /></span><div><strong>{action}</strong></div></li>)}</ul></div>
    </section>
  )
}

export function ScoreHistory({ seo }) {
  const { t } = useI18n()
  const { history, reportId, openingReportId, openReport, scoreDelta } = seo
  if (history.length < 2) return null
  const last = history[history.length - 1]
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiLineChartLine /></span>{t('webSeo.panels.history.title')}</h2><p>{t('webSeo.panels.history.intro')}</p></div></header>
      <div className="gs-panel-body">
        <div className="wb-trend">
          <div className="wb-trend-chart"><ScoreTrend points={history} /></div>
          <div className="gs-minis">
            <div className="gs-mini"><span>{t('webSeo.panels.history.current')}</span><strong style={{ color: scoreColor(last.score) }}>{last.score}</strong></div>
            <div className="gs-mini"><span>{t('webSeo.panels.history.change')}</span><strong><Delta value={scoreDelta} /></strong></div>
            <div className="gs-mini"><span>{t('webSeo.panels.history.audits')}</span><strong>{history.length}</strong></div>
          </div>
        </div>
        <div className="wb-history-strip">
          {[...history].reverse().slice(0, 6).map(item => (
            <button key={item.id} type="button" className={`gs-button small${reportId === item.id ? ' accent' : ''}`} onClick={() => openReport(item.id)} disabled={openingReportId === item.id}>
              {openingReportId === item.id ? <Spinner /> : null}{formatDate(item.createdAt)} · {item.score}{item.auto ? t('webSeo.panels.history.auto') : ''}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Salud técnica ──────────────────────────────────────────────────────── */

export function SiteCrawlPanel({ site }) {
  const { t } = useI18n()
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiEarthLine /></span>{t('webSeo.panels.crawl.title')}</h2><p>{site ? t('webSeo.panels.crawl.intro', { n: site.pagesAudited }) : t('webSeo.panels.crawl.failed')}</p></div>
        {site ? (
          <div className="gs-panel-actions">
            <span className={`gs-pill ${site.robotsBlocksAll ? 'tone-bad' : site.robotsFound ? 'tone-ok' : 'tone-warn'}`}>{site.robotsBlocksAll ? t('webSeo.panels.crawl.robotsBlocks') : site.robotsFound ? t('webSeo.panels.crawl.robotsOk') : t('webSeo.panels.crawl.noRobots')}</span>
            <span className={`gs-pill ${site.sitemapFound ? 'tone-ok' : 'tone-warn'}`}>{site.sitemapFound ? t('webSeo.panels.crawl.sitemapUrls', { n: site.sitemapUrlCount }) : t('webSeo.panels.crawl.noSitemap')}</span>
          </div>
        ) : null}
      </header>
      <div className="gs-panel-body">
        {site ? (
          <>
            <div className="gs-stat-grid">
              <div className={`gs-stat ${site.missingTitle ? 'is-bad' : 'is-ok'}`}><span>{t('webSeo.panels.crawl.noTitle')}</span><strong>{site.missingTitle}</strong><small>{t('webSeo.panels.crawl.noTitleHint')}</small></div>
              <div className={`gs-stat ${site.missingMeta ? 'is-warn' : 'is-ok'}`}><span>{t('webSeo.panels.crawl.noMeta')}</span><strong>{site.missingMeta}</strong><small>{t('webSeo.panels.crawl.noMetaHint')}</small></div>
              <div className={`gs-stat ${site.missingH1 ? 'is-warn' : 'is-ok'}`}><span>{t('webSeo.panels.crawl.noH1')}</span><strong>{site.missingH1}</strong><small>{t('webSeo.panels.crawl.noH1Hint')}</small></div>
              <div className={`gs-stat ${site.duplicateTitles.length ? 'is-bad' : 'is-ok'}`}><span>{t('webSeo.panels.crawl.dupTitles')}</span><strong>{site.duplicateTitles.length}</strong><small>{t('webSeo.panels.crawl.dupTitlesHint')}</small></div>
              <div className={`gs-stat ${site.imgsWithoutAlt ? 'is-warn' : 'is-ok'}`}><span>{t('webSeo.panels.crawl.imgAlt')}</span><strong>{site.imgsWithoutAlt}</strong><small>{t('webSeo.panels.crawl.imgAltHint')}</small></div>
            </div>
            {site.duplicateTitles.length ? <p className="gs-note">{t('webSeo.panels.crawl.duplicates', { list: site.duplicateTitles.map(title => `«${title}»`).join(', ') })}</p> : null}
            {site.pages?.length ? (
              <details className="gs-details">
                <summary>{t('webSeo.panels.crawl.seePages', { n: site.pages.length })}</summary>
                <div className="gs-table-scroll">
                  <table className="gs-table">
                    <thead><tr><th>{t('webSeo.panels.crawl.colPage')}</th><th>{t('webSeo.panels.crawl.colTitle')}</th><th className="num">{t('webSeo.panels.crawl.colMeta')}</th><th className="num">{t('webSeo.panels.crawl.colH1')}</th><th className="num">{t('webSeo.panels.crawl.colImgAlt')}</th></tr></thead>
                    <tbody>{site.pages.map(page => <tr key={page.url}><td className="wb-break">{page.url}</td><td>{page.title || <em className="wb-missing">{t('webSeo.panels.crawl.missingTitle')}</em>}</td><td className="num">{page.hasMetaDescription ? '✓' : '✕'}</td><td className="num">{page.hasH1 ? '✓' : '✕'}</td><td className="num">{page.imgsWithoutAlt}</td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </>
        ) : <p className="gs-empty-inline">{t('webSeo.panels.crawl.empty')}</p>}
      </div>
    </section>
  )
}

export function WebVitalsPanel({ vitals }) {
  const { t } = useI18n()
  const has = vitals && (vitals.lcpMs != null || vitals.cls != null || vitals.inpMs != null)
  const grade = (value, good, avg) => (value == null ? '' : value <= good ? 'is-good' : value <= avg ? 'is-avg' : 'is-poor')
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiSpeedUpLine /></span>{t('webSeo.panels.vitals.title')}</h2><p>{t('webSeo.panels.vitals.intro')}</p></div></header>
      <div className="gs-panel-body">
        {has ? (
          <div className="wb-vitals">
            <div className={`wb-vital ${grade(vitals.lcpMs, 2500, 4000)}`}><header><b>LCP</b><span className="gs-pill">≤ 2,5 s</span></header><strong>{vitals.lcpMs != null ? `${(vitals.lcpMs / 1000).toFixed(1)} s` : '—'}</strong><div className="wb-vital-bar" style={{ '--threshold': '50%' }}><i style={{ width: `${Math.min(100, ((vitals.lcpMs ?? 0) / 5000) * 100)}%` }} /></div><p>{t('webSeo.panels.vitals.lcpHint')}</p></div>
            <div className={`wb-vital ${grade(vitals.cls, 0.1, 0.25)}`}><header><b>CLS</b><span className="gs-pill">≤ 0,1</span></header><strong>{vitals.cls != null ? vitals.cls.toFixed(2) : '—'}</strong><div className="wb-vital-bar" style={{ '--threshold': '20%' }}><i style={{ width: `${Math.min(100, ((vitals.cls ?? 0) / 0.5) * 100)}%` }} /></div><p>{t('webSeo.panels.vitals.clsHint')}</p></div>
            <div className={`wb-vital ${grade(vitals.inpMs, 200, 500)}`}><header><b>INP</b><span className="gs-pill">≤ 200 ms</span></header><strong>{vitals.inpMs != null ? `${vitals.inpMs} ms` : '—'}</strong><div className="wb-vital-bar" style={{ '--threshold': '25%' }}><i style={{ width: `${Math.min(100, ((vitals.inpMs ?? 0) / 800) * 100)}%` }} /></div><p>{t('webSeo.panels.vitals.inpHint')}</p></div>
          </div>
        ) : <p className="gs-empty-inline">{t('webSeo.panels.vitals.empty')}</p>}
      </div>
    </section>
  )
}

/** El puente entre las dos mitades de la página: el SEO aplicado a la landing con un clic. */
export function SnippetsPanel({ seo, landingCampaigns }) {
  const { t } = useI18n()
  const { snippets, landingApply, setLandingApply, applyToLanding, wordpress, setWordpress, applyToWordPress, git, setGit, applyToGit } = seo
  if (!snippets) return null
  const wpSites = wordpress?.connections ?? []
  const gitSites = git?.connections ?? []
  return (
    <section className="gs-panel is-accent">
      <header className="gs-panel-head"><div><span className="gs-overline">{t('webSeo.panels.snippets.overline')}</span><h2><span className="gs-panel-icon"><RiFileCopyLine /></span>{t('webSeo.panels.snippets.title')}</h2><p>{t('webSeo.panels.snippets.intro', { wp: wpSites.length ? t('webSeo.panels.snippets.orWordpress') : '' })}</p></div></header>
      <div className="gs-panel-body">
        <CopyBlock label={t('webSeo.panels.snippets.titleMeta')} value={snippets.html} />
        <CopyBlock label={t('webSeo.panels.snippets.structured')} value={snippets.jsonld} />
        {wpSites.length ? (
          <div className="wb-apply-row">
            <select className="gs-select" value={wordpress.connectionId} onChange={event => setWordpress(prev => ({ ...prev, connectionId: event.target.value, done: '', error: '' }))} aria-label={t('webSeo.panels.snippets.wpSite')}>
              <option value="">{t('webSeo.panels.snippets.chooseWp')}</option>
              {wpSites.map(site => <option key={site.id} value={site.id}>{site.domain}</option>)}
            </select>
            <select className="gs-select" value={wordpress.pageId} onChange={event => setWordpress(prev => ({ ...prev, pageId: event.target.value, done: '', error: '' }))} disabled={!wordpress.connectionId || wordpress.pagesLoading} aria-label={t('webSeo.panels.snippets.wpPage')}>
              <option value="">{wordpress.pagesLoading ? t('webSeo.panels.snippets.loadingPages') : t('webSeo.panels.snippets.choosePage')}</option>
              {wordpress.pages.map(page => <option key={page.id} value={page.id}>{page.title || page.slug || `#${page.id}`}</option>)}
            </select>
            <button type="button" className="gs-button" onClick={applyToWordPress} disabled={!wordpress.connectionId || !wordpress.pageId || wordpress.saving}>{wordpress.saving ? <><Spinner /> {t('webSeo.panels.snippets.applying')}</> : t('webSeo.panels.snippets.applyWp')}</button>
          </div>
        ) : null}
        {wordpress?.done ? <p className="gs-inline-ok">{wordpress.done}</p> : null}
        {wordpress?.error ? <p className="gs-inline-error">{wordpress.error}</p> : null}
        {gitSites.length ? (
          <div className="wb-apply-row">
            <select className="gs-select" value={git.connectionId} onChange={event => setGit(prev => ({ ...prev, connectionId: event.target.value, done: '', error: '' }))} aria-label={t('webSeo.panels.snippets.repo')}>
              <option value="">{t('webSeo.panels.snippets.chooseRepo')}</option>
              {gitSites.map(site => <option key={site.id} value={site.id}>{site.domain} · {site.connector.owner}/{site.connector.repo}</option>)}
            </select>
            <button type="button" className="gs-button" onClick={applyToGit} disabled={!git.connectionId || git.saving}>{git.saving ? <><Spinner /> {t('webSeo.panels.snippets.queueing')}</> : t('webSeo.panels.snippets.proposePr')}</button>
          </div>
        ) : null}
        {git?.done ? <p className="gs-inline-ok">{git.done}</p> : null}
        {git?.error ? <p className="gs-inline-error">{git.error}</p> : null}
        <div className="wb-apply-row">
          <select className="gs-select" value={landingApply.campaignId} onChange={event => setLandingApply(prev => ({ ...prev, campaignId: event.target.value, done: '', error: '' }))}>
            <option value="">{t('webSeo.panels.snippets.chooseLanding')}</option>
            {landingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name} (/l/{c.landingSlug})</option>)}
          </select>
          <button type="button" className="gs-button" onClick={applyToLanding} disabled={!landingApply.campaignId || landingApply.saving}>{landingApply.saving ? <><Spinner /> {t('webSeo.panels.snippets.applying')}</> : t('webSeo.panels.snippets.applyTitleMeta')}</button>
        </div>
        {landingCampaigns.length === 0 ? <p className="gs-note">{t('webSeo.panels.snippets.noLandings')}</p> : null}
        {landingApply.done ? <p className="gs-inline-ok">{landingApply.done}</p> : null}
        {landingApply.error ? <p className="gs-inline-error">{landingApply.error}</p> : null}
      </div>
    </section>
  )
}

/* ── Keywords ───────────────────────────────────────────────────────────── */

export function KeywordsPanel({ seo, onAds }) {
  const { t } = useI18n()
  const { report, adsState } = seo
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiSearchEyeLine /></span>{t('webSeo.panels.keywords.title')}</h2><p>{t('webSeo.panels.keywords.intro')}</p></div>
        <div className="gs-panel-actions"><button type="button" className="gs-button" onClick={onAds} disabled={adsState.saving}>{adsState.saving ? <><Spinner /> {t('webSeo.panels.keywords.preparing')}</> : <><RiAdvertisementLine /> {t('webSeo.panels.keywords.createAds')}</>}</button></div>
      </header>
      <div className="gs-panel-body">
        <div className="gs-table-scroll">
          <table className="gs-table">
            <thead><tr><th>{t('webSeo.panels.keywords.colKeyword')}</th><th>{t('webSeo.panels.keywords.colIntent')}</th><th>{t('webSeo.panels.keywords.colDifficulty')}</th><th>{t('webSeo.panels.keywords.colWhy')}</th></tr></thead>
            <tbody>{report.keywords.map(kw => <tr key={kw.keyword}><td><strong>{kw.keyword}</strong></td><td><span className={`gs-pill ${INTENT_TONE[kw.intent] ?? ''}`}>{INTENT_KEYS.includes(kw.intent) ? t(`webSeo.panels.intent.${kw.intent}`) : kw.intent}</span></td><td><span className={`gs-pill ${DIFFICULTY_TONE[kw.difficulty] ?? ''}`}>{DIFFICULTY_KEYS.includes(kw.difficulty) ? t(`webSeo.panels.difficulty.${kw.difficulty}`) : kw.difficulty}</span></td><td>{kw.rationale}</td></tr>)}</tbody>
          </table>
        </div>
        {adsState.error ? <p className="gs-inline-error">{adsState.error}</p> : null}
        <p className="gs-note">{t('webSeo.panels.keywords.note')}</p>
      </div>
    </section>
  )
}

export function SearchConsolePanel({ seo, onConnect }) {
  const { t } = useI18n()
  const { searchConsole, matchedRows } = seo
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiGlobalLine /></span>{t('webSeo.panels.sc.title')}</h2><p>{t('webSeo.panels.sc.intro')}</p></div></header>
      <div className="gs-panel-body">
        {!searchConsole ? <div className="gs-skeleton"><i /><i /><i /></div>
          : !searchConsole.connected ? <p className="gs-empty-inline">{searchConsole.siteMismatch ? t('webSeo.panels.sc.mismatch') : t('webSeo.panels.sc.notConnected')} <button type="button" className="gs-link" onClick={onConnect}>{t('webSeo.panels.sc.sourcesLink')}</button> {t('webSeo.panels.sc.toSee')}</p>
            : !searchConsole.totalQueries ? <p className="gs-empty-inline">{t('webSeo.panels.sc.noQueries')} <button type="button" className="gs-link" onClick={onConnect}>{t('webSeo.panels.sc.sourcesLink')}</button>.</p>
              : !matchedRows.length ? <p className="gs-empty-inline">{t('webSeo.panels.sc.noMatches')}</p>
                : (
                  <div className="gs-table-scroll">
                    <table className="gs-table">
                      <thead><tr><th>{t('webSeo.panels.sc.colPlanKeyword')}</th><th>{t('webSeo.panels.sc.colQuery')}</th><th className="num">{t('webSeo.panels.sc.colPosition')}</th><th className="num">{t('webSeo.panels.sc.colClicks')}</th><th className="num">{t('webSeo.panels.sc.colImpressions')}</th></tr></thead>
                      <tbody>{matchedRows.flatMap(m => m.rows.map((row, i) => <tr key={`${m.keyword}-${row.query}`}><td>{i === 0 ? <strong>{m.keyword}</strong> : ''}</td><td>{row.query}</td><td className="num">{row.position != null ? row.position.toFixed(1) : '—'}</td><td className="num">{row.clicks}</td><td className="num">{row.impressions}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
        {searchConsole?.topQueries?.length ? (
          <details className="gs-details">
            <summary>{t('webSeo.panels.sc.topQueries', { n: searchConsole.topQueries.length })}</summary>
            <div className="gs-table-scroll">
              <table className="gs-table">
                <thead><tr><th>{t('webSeo.panels.sc.colSearch')}</th><th className="num">{t('webSeo.panels.sc.colPosition')}</th><th className="num">{t('webSeo.panels.sc.colClicks')}</th><th className="num">{t('webSeo.panels.sc.colImpressions')}</th></tr></thead>
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
  const { t } = useI18n()
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiLineChartLine /></span>{t('webSeo.panels.ranks.title')}</h2><p>{t('webSeo.panels.ranks.intro')}</p></div></header>
      <div className="gs-panel-body">
        {ranks === null ? <div className="gs-skeleton"><i /><i /><i /></div>
          : !ranks.length ? <p className="gs-empty-inline">{t('webSeo.panels.ranks.empty')}</p>
            : (
              <div className="gs-table-scroll">
                <table className="gs-table">
                  <thead><tr><th>{t('webSeo.panels.ranks.colKeyword')}</th><th className="num">{t('webSeo.panels.ranks.colCurrent')}</th><th className="num">{t('webSeo.panels.ranks.colChange')}</th><th className="num">{t('webSeo.panels.ranks.colClicks')}</th><th>{t('webSeo.panels.ranks.colTrend')}</th><th className="num">{t('webSeo.panels.ranks.colCaptures')}</th></tr></thead>
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
  const { t } = useI18n()
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiAlertLine /></span>{t('webSeo.panels.cannibal.title')}</h2><p>{t('webSeo.panels.cannibal.intro')}</p></div>
        <div className="gs-panel-actions"><button type="button" className="gs-button" onClick={onRun} disabled={cannibal.loading}>{cannibal.loading ? <><Spinner /> {t('webSeo.panels.cannibal.checking')}</> : t('webSeo.panels.cannibal.detect')}</button></div>
      </header>
      <div className="gs-panel-body">
        {cannibal.error ? <p className="gs-inline-error">{cannibal.error}</p> : null}
        {cannibal.items === null && !cannibal.error ? <p className="gs-empty-inline">{t('webSeo.panels.cannibal.prompt')}</p> : null}
        {cannibal.items !== null && !cannibal.items.length ? <p className="gs-empty-inline is-ok">{t('webSeo.panels.cannibal.none')}</p> : null}
        {cannibal.items?.length ? (
          <div className="gs-table-scroll">
            <table className="gs-table">
              <thead><tr><th>{t('webSeo.panels.cannibal.colSearch')}</th><th>{t('webSeo.panels.cannibal.colPages')}</th></tr></thead>
              <tbody>{cannibal.items.map(row => <tr key={row.query}><td><strong>{row.query}</strong><small>{t('webSeo.panels.cannibal.pages', { n: row.pages.length })}</small></td><td>{row.pages.map(p => <div key={p.page} className="wb-break">{t('webSeo.panels.cannibal.row', { page: p.page, position: p.position != null ? p.position.toFixed(1) : '—', clicks: p.clicks })}</div>)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ── Contenidos ─────────────────────────────────────────────────────────── */

export function ContentPlanPanel({ seo, landingCampaigns, onOpenArticle }) {
  const { t } = useI18n()
  const { report, contentState, patchContent, writeArticle, publishArticle, shareArticle, blogSlug } = seo
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>{t('webSeo.panels.plan.title')}</h2><p>{t('webSeo.panels.plan.intro')}</p></div></header>
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
                      <div className="wb-content-meta"><span className="gs-pill">{item.format}</span><span>{t('webSeo.panels.plan.keyword')} <b>{item.keyword}</b></span>{state.publishedSlug ? <span className="gs-pill tone-ok">{t('webSeo.panels.plan.published')}</span> : null}{state.shared ? <span className="gs-pill tone-cyan">{t('webSeo.panels.plan.shareScheduled')}</span> : null}</div>
                      {state.publishedSlug && blogSlug ? <p className="gs-note">{t('webSeo.panels.plan.publicAt')} <a className="gs-link" href={`/l/${blogSlug}/blog/${state.publishedSlug}`} target="_blank" rel="noreferrer">/l/{blogSlug}/blog/{state.publishedSlug}</a></p> : null}
                    </div>
                    <div className="wb-content-actions">
                      {state.articleId ? (
                        <>
                          <button type="button" className="gs-button small" onClick={() => onOpenArticle(state.articleId)}>{t('webSeo.panels.plan.seeArticle')}</button>
                          {!state.publishedSlug ? <button type="button" className="gs-button small" disabled={state.publishing} onClick={() => publishArticle(index)}>{state.publishing ? <><Spinner /> {t('webSeo.panels.plan.publishing')}</> : <><RiEarthLine /> {t('webSeo.panels.plan.publishBlog')}</>}</button> : null}
                          <button type="button" className="gs-button small" onClick={() => patchContent(index, { shareOpen: !state.shareOpen, shareError: '' })}><RiShareForwardLine /> {state.shared ? t('webSeo.panels.plan.scheduled') : t('webSeo.panels.plan.share')}</button>
                        </>
                      ) : <button type="button" className="gs-button small" disabled={state.loading} onClick={() => writeArticle(index, item)}>{state.loading ? <><Spinner /> {t('webSeo.panels.plan.writing')}</> : t('webSeo.panels.plan.writeAi')}</button>}
                    </div>
                  </div>
                  {state.error ? <p className="gs-inline-error wb-indent">{state.error}</p> : null}
                  {state.shareOpen ? (
                    <div className="wb-share-box">
                      <select className="gs-select" value={state.shareCampaignId ?? ''} onChange={event => patchContent(index, { shareCampaignId: event.target.value })}>
                        <option value="">{t('webSeo.panels.plan.chooseCampaign')}</option>
                        {landingCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <div className="wb-platforms">
                        {SOCIAL_PLATFORMS.map(platform => (
                          <label key={platform}><input type="checkbox" checked={(state.platforms ?? []).includes(platform)} onChange={event => { const current = new Set(state.platforms ?? []); if (event.target.checked) current.add(platform); else current.delete(platform); patchContent(index, { platforms: [...current] }) }} />{platform}</label>
                        ))}
                      </div>
                      <button type="button" className="gs-button small" disabled={state.sharing} onClick={() => shareArticle(index)}>{state.sharing ? <><Spinner /> {t('webSeo.panels.plan.scheduling')}</> : t('webSeo.panels.plan.scheduleDraft')}</button>
                      {state.shareError ? <p className="gs-inline-error" style={{ width: '100%' }}>{state.shareError}</p> : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : <p className="gs-empty-inline">{report ? t('webSeo.panels.plan.noPlan') : t('webSeo.panels.plan.auditFirst')}</p>}
        {!blogSlug ? <p className="gs-note">{t('webSeo.panels.plan.needLanding')} <code>/l/&lt;slug&gt;/blog</code> {t('webSeo.panels.plan.needLandingTail')}</p> : null}
      </div>
    </section>
  )
}

export function StaleContentPanel({ stale, staleState, onRefresh }) {
  const { t } = useI18n()
  return (
    <section className="gs-panel">
      <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>{t('webSeo.panels.stale.title')}</h2><p>{t('webSeo.panels.stale.intro')}</p></div></header>
      <div className="gs-panel-body">
        {stale.length ? (
          <ul className="gs-list">
            {stale.map(item => {
              const state = staleState[item.id] ?? {}
              return (
                <li key={item.id} className="wb-content-item">
                  <div className="wb-content-main">
                    <span className="wb-content-icon is-warn"><RiFileTextLine /></span>
                    <div className="wb-content-copy"><strong>{item.name}</strong><div className="wb-content-meta"><span>{t('webSeo.panels.stale.lastUpdate', { date: formatDate(item.updatedAt) })}</span></div>{state.error ? <p className="gs-inline-error">{state.error}</p> : null}</div>
                    <div className="wb-content-actions"><button type="button" className="gs-button small" disabled={state.loading} onClick={() => onRefresh(item.id)}>{state.loading ? <><Spinner /> {t('webSeo.panels.stale.refreshing')}</> : t('webSeo.panels.stale.refreshAi')}</button></div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : <p className="gs-empty-inline is-ok">{t('webSeo.panels.stale.none')}</p>}
      </div>
    </section>
  )
}

/* ── Competencia ────────────────────────────────────────────────────────── */

export function CompetitorsPanel({ seo }) {
  const { t } = useI18n()
  const { competitorUrls, setCompetitorUrls, competitors, competitorsLoading, competitorsError, runCompare, report, passed, checklist, hostnameOf } = seo
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiSwordLine /></span>{t('webSeo.panels.competitors.title')}</h2><p>{t('webSeo.panels.competitors.intro')}</p></div>
        <div className="gs-panel-actions"><button type="button" className="gs-button" onClick={runCompare} disabled={competitorsLoading}>{competitorsLoading ? <><Spinner /> {t('webSeo.panels.competitors.auditing')}</> : t('webSeo.panels.competitors.compare')}</button></div>
      </header>
      <div className="gs-panel-body">
        <div className="wb-competitor-fields">
          {competitorUrls.map((value, index) => <input key={index} className="gs-input" type="text" value={value} placeholder={t('webSeo.panels.audit.competitorPlaceholder', { n: index + 1 })} onChange={event => setCompetitorUrls(prev => prev.map((v, i) => (i === index ? event.target.value : v)))} />)}
        </div>
        {competitorsError ? <p className="gs-inline-error">{competitorsError}</p> : null}
        {competitors ? (
          <div className="gs-table-scroll" style={{ marginTop: 16 }}>
            <table className="gs-table">
              <thead><tr><th>{t('webSeo.panels.competitors.colWeb')}</th><th className="num">{t('webSeo.panels.competitors.colScore')}</th><th className="num">{t('webSeo.panels.competitors.colChecks')}</th><th>{t('webSeo.panels.competitors.colWeak')}</th></tr></thead>
              <tbody>
                {report ? <tr className="is-self"><td><strong>{hostnameOf(report.url)}</strong><small>{t('webSeo.panels.competitors.you')}</small></td><td className="num"><strong style={{ color: scoreColor(report.score) }}>{report.score}</strong></td><td className="num">{passed}/{checklist.length}</td><td>{checklist.filter(c => !c.ok).map(c => c.label).slice(0, 4).join(' · ') || '—'}</td></tr> : null}
                {competitors.map(c => <tr key={c.url}><td><strong>{hostnameOf(c.url)}</strong></td><td className="num">{c.webAlive ? <strong style={{ color: scoreColor(c.score) }}>{c.score}</strong> : '—'}</td><td className="num">{c.webAlive ? `${c.passed}/${c.total}` : t('webSeo.panels.competitors.unreachable')}</td><td>{c.failedLabels.join(' · ') || '—'}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="gs-note">{t('webSeo.panels.competitors.note')}</p>}
      </div>
    </section>
  )
}

export function KeywordGapPanel({ gap, onRun }) {
  const { t } = useI18n()
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiRadarLine /></span>{t('webSeo.panels.gap.title')}</h2><p>{t('webSeo.panels.gap.intro')}</p></div>
        <div className="gs-panel-actions"><button type="button" className="gs-button" onClick={onRun} disabled={gap.loading}>{gap.loading ? <><Spinner /> {t('webSeo.panels.gap.analyzing')}</> : <><RiSearchEyeLine /> {t('webSeo.panels.gap.analyze')}</>}</button></div>
      </header>
      <div className="gs-panel-body">
        {gap.error ? <p className="gs-inline-error">{gap.error}</p> : null}
        {gap.items === null && !gap.error ? <p className="gs-empty-inline">{t('webSeo.panels.gap.prompt')}</p> : null}
        {gap.items !== null && !gap.items.length ? <p className="gs-empty-inline">{t('webSeo.panels.gap.none')}</p> : null}
        {gap.items?.length ? (
          <div className="gs-table-scroll">
            <table className="gs-table">
              <thead><tr><th>{t('webSeo.panels.gap.colKeyword')}</th><th>{t('webSeo.panels.gap.colWho')}</th><th>{t('webSeo.panels.gap.colOpportunity')}</th></tr></thead>
              <tbody>{gap.items.map(item => <tr key={`${item.keyword}-${item.competitor}`}><td><strong>{item.keyword}</strong></td><td>{item.competitor}</td><td>{item.rationale}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  )
}
