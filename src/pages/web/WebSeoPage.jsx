import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  RiAddLine, RiAlarmWarningLine, RiAlertLine, RiBarChartGroupedLine, RiCheckLine, RiCloseLine,
  RiCompass3Line, RiEyeLine, RiFileTextLine, RiFlashlightLine, RiGlobalLine, RiLayoutGridLine,
  RiRadarLine, RiRefreshLine, RiSearchEyeLine, RiShareForwardLine, RiSwordLine, RiTeamLine,
} from 'react-icons/ri'
import SeoActionCenter from '../../components/seo/SeoActionCenter'
import SeoOpportunityRadar from '../../components/seo/SeoOpportunityRadar'
import SeoPageFactory from '../../components/seo/SeoPageFactory'
import ProductPageHeader from '../../components/ui/ProductPageHeader'
import { useI18n } from '../../i18n'
import { useLandings } from './useLandings'
import { useSeo } from './useSeo'
import { formatNumber, formatPercent, landingsIntegrityCopy } from './landingModel'
import { EconomicRanking, FeaturedLanding, LandingDetail, LandingDiagnosisCard, LandingList, LandingModal, LeadMagnetPanel } from './LandingPanels'
import {
  AuditModal, CannibalizationPanel, CompetitorsPanel, ContentPlanPanel, KeywordGapPanel, KeywordsPanel,
  LocalSeoPanel, PriorityFixes, RankEvolutionPanel, ScoreHistory, SearchConsolePanel, SeoDiagnosisHero,
  SeoOnboard, SeoQueueCard, SiteCrawlPanel, SnippetsPanel, StaleContentPanel, TechnicalChecklist,
  buildSeoQueue, formatDate, scoreColor,
} from './SeoPanels'
import '../growth/growth-surface.css'
import './web.css'
import '../growth-visual-standard.css'

/**
 * Web y SEO — la presencia web del negocio en una sola página: las landings
 * que convierten y el posicionamiento que las hace visibles.
 *
 * Nace de fundir «Landings y webs» (listado, telemetría, diagnóstico, variantes
 * y autonomía por landing) con «SEO» (auditoría, keywords, contenidos,
 * competencia). Lo que las une no es cosmético: el SEO se aplica a una landing
 * con un clic, el plan de contenidos se publica en el blog que cuelga de una
 * landing, el imán de leads es una landing pública y los hallazgos de ambas
 * caen en la misma cola de «atención requerida», ordenados igual.
 *
 * Reglas:
 * - Una banda de integridad en dos mitades: telemetría de landings y frescura
 *   del informe SEO, cada una con su estado. Ningún número se pinta sin decir
 *   antes si se puede creer.
 * - La pestaña vive en la URL (`?tab=`). Los enlaces profundos que ya
 *   existían (`landing`, `campaign`) siguen abriendo el detalle; el brazo SEO
 *   del orgánico (`from=organic&query=`) abre la fábrica con la keyword.
 */

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: RiCompass3Line },
  { id: 'landings', label: 'Landings', icon: RiLayoutGridLine },
  { id: 'seo', label: 'SEO', icon: RiRadarLine },
  { id: 'keywords', label: 'Keywords', icon: RiSearchEyeLine },
  { id: 'contenidos', label: 'Contenidos', icon: RiFileTextLine },
  { id: 'competencia', label: 'Competencia', icon: RiSwordLine },
]
const TAB_IDS = new Set(TABS.map(tab => tab.id))

function scrollTo(selector) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }))
}

export default function WebSeoPage() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(() => (TAB_IDS.has(searchParams.get('tab')) ? searchParams.get('tab') : 'resumen'))
  const [notice, setNotice] = useState('')
  const [auditOpen, setAuditOpen] = useState(false)
  const [factory, setFactory] = useState({ open: false, keyword: '', mode: 'activa' })
  const noticeTimer = useRef(null)
  const initialParams = useRef({ landing: searchParams.get('landing') || '', campaign: searchParams.get('campaign') || '' })

  const notify = useCallback(message => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3600)
  }, [])
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const landings = useLandings({ notify, initialLandingKey: initialParams.current.landing, initialCampaignId: initialParams.current.campaign })
  const landingCampaigns = useMemo(() => landings.campaigns.filter(c => c.landingSlug), [landings.campaigns])
  const seo = useSeo({ landingCampaigns })

  const selectTab = useCallback(id => {
    setTab(id)
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.set('tab', id)
      return next
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    const requested = searchParams.get('tab')
    if (requested && TAB_IDS.has(requested) && requested !== tab) setTab(requested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const openFactory = useCallback((keyword = '', mode = 'activa') => {
    setFactory({ open: true, keyword, mode })
    selectTab('contenidos')
    scrollTo('#wb-factory')
  }, [selectTab])

  // Brazo SEO del orgánico: llega con la consulta y su intención.
  useEffect(() => {
    if (searchParams.get('from') !== 'organic' || !searchParams.get('query')) return
    openFactory(searchParams.get('query'), searchParams.get('intent') === 'commercial' ? 'activa' : 'pasiva')
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      ;['from', 'query', 'intent', 'formats', 'opportunityId', 'decisionId'].forEach(key => next.delete(key))
      return next
    }, { replace: true })
    // Solo al montar con el parámetro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runAudit() {
    const ok = await seo.analyze()
    if (ok) {
      setAuditOpen(false)
      selectTab('seo')
      notify('Auditoría completada')
    }
  }

  async function keywordsToAds() {
    if (await seo.keywordsToAds()) navigate('/captacion/nueva')
  }

  function executeQueueTarget(target) {
    if (target.path) navigate(target.path)
    else if (target.factory) openFactory(target.factory.keyword, target.factory.mode)
    else if (target.tab) selectTab(target.tab)
  }

  const { metrics } = landings
  const report = seo.report
  const landingBand = landingsIntegrityCopy(landings.telemetryRead ? landings.integrity : null)
  const seoQueue = useMemo(() => buildSeoQueue({ report, searchConsole: seo.searchConsole, stale: seo.stale, vitals: seo.vitals }), [report, seo.searchConsole, seo.stale, seo.vitals])
  const attention = landings.attention.slice(0, 4)
  const queueCount = attention.length + seoQueue.length

  const tabCounts = {
    landings: landings.allItems.length || null,
    seo: seo.failed || null,
    keywords: report?.keywords?.length ?? null,
    contenidos: (report?.contentPlan?.length ?? 0) + seo.stale.length || null,
    competencia: seo.competitors?.length ?? null,
  }
  const tabIssues = { resumen: queueCount > 0, seo: seo.failed > 0 }

  const seoOnboard = <SeoOnboard onAudit={() => setAuditOpen(true)} onFactory={() => openFactory()} />

  return (
    <main className={`gs-page wb-page${auditOpen ? ' is-locked' : ''}`}>
      {/* `inert` booleano: React 19 ignora la cadena vacía. */}
      <div className="gs-shell" inert={auditOpen ? true : undefined}>
        <ProductPageHeader Icon={RiGlobalLine} title={locale === 'en' ? 'Web & SEO' : 'Web y SEO'} description="Landings que convierten el interés en oportunidades medibles y SEO que las hace visibles en Google, gestionados en un mismo lugar." actions={<div className="gs-header-actions">
            {seo.projects.length > 1 ? (
              <select className="gs-select" value={seo.reportUrl} onChange={event => seo.switchProject(event.target.value)} aria-label="Proyecto vigilado">
                {seo.projects.map(project => <option key={project.id} value={project.url}>{seo.hostnameOf(project.url)}</option>)}
              </select>
            ) : null}
            {report ? <button type="button" className="gs-button ghost" onClick={seo.shareReport} disabled={seo.share.loading || !seo.reportId}>{seo.share.loading ? <><RiRefreshLine className="gs-spin" /> Creando enlace…</> : <><RiShareForwardLine /> Compartir informe</>}</button> : null}
            <button type="button" className="gs-button accent" onClick={() => { seo.setError(''); setAuditOpen(true) }} disabled={seo.loading}>{seo.loading ? <><RiRefreshLine className="gs-spin" /> Analizando…</> : <><RiSearchEyeLine /> {report ? 'Nueva auditoría' : 'Analizar mi web'}</>}</button>
            <button type="button" className="gs-button primary" onClick={landings.openCreate}><RiAddLine /> Nueva landing</button>
          </div>} />


        {/* Dos fuentes de verdad, dos estados: la telemetría de las landings y
            la frescura del informe SEO no se pueden resumir en un solo color. */}
        <section className="gs-band is-split" role="status">
          <div className={`gs-band-seg state-${landings.loading ? 'loading' : landingBand.state}`}>
            <span className="gs-band-dot" />
            <div>
              <strong>{landings.loading ? 'Leyendo la telemetría de tus landings…' : landingBand.label}</strong>
              <p>{landings.loading ? 'Conectando campañas, webs y métricas.' : landingBand.detail}</p>
              {landingBand.coverage && !landings.loading ? <small>{landingBand.coverage}</small> : null}
            </div>
          </div>
          <div className={`gs-band-seg state-${seo.band.state}`}>
            <span className="gs-band-dot" />
            <div>
              <strong>{seo.band.label}</strong>
              <p>{seo.band.message}</p>
              {report ? <small>Auditada el {formatDate(report.generatedAt)} · {report.provider === 'deepseek' ? 'plan con IA' : 'plan determinista'}</small> : null}
            </div>
            {report ? <span className="gs-pill" style={{ color: scoreColor(report.score) }}>Score {report.score}</span> : null}
          </div>
        </section>

        {seo.share.url ? <div className="gs-alert is-ok"><RiCheckLine /><span>Enlace público copiado al portapapeles: <code>{seo.share.url}</code></span></div> : null}
        {seo.share.error ? <div className="gs-alert is-error"><RiAlertLine /><span>{seo.share.error}</span></div> : null}
        {seo.alerts.map(alert => <div key={alert.type} className="gs-alert"><RiAlertLine /><span>{alert.message} <em>· {formatDate(alert.at)}</em></span></div>)}
        {seo.error && !auditOpen ? <div className="gs-alert is-error"><RiAlertLine /><span>{seo.error}</span></div> : null}
        {landings.loadError ? <div className="gs-alert is-error" role="alert"><RiAlertLine /><span><strong>No se han podido cargar las campañas.</strong> No se muestran datos de referencia ni métricas simuladas.</span><button type="button" className="gs-button small" onClick={landings.reload}>Reintentar</button></div> : null}

        <nav className="gs-tabs" aria-label="Secciones de Web y SEO">
          {TABS.map(item => (
            <button key={item.id} type="button" className={`${tab === item.id ? 'active' : ''}${tabIssues[item.id] ? ' has-issue' : ''}`} aria-current={tab === item.id ? 'page' : undefined} onClick={() => selectTab(item.id)}>
              <item.icon aria-hidden="true" /> {item.label}
              {tabCounts[item.id] ? <b>{tabCounts[item.id]}</b> : null}
            </button>
          ))}
        </nav>

        {/* ── Resumen ───────────────────────────────────────────────────── */}
        {tab === 'resumen' ? (
          <div className="gs-stack">
            <section className="gs-kpis gs-rise" aria-label="Resumen de web y SEO">
              <article className="gs-kpi" style={{ '--kpi-color': 'var(--violet)' }}><span className="gs-kpi-icon"><RiLayoutGridLine /></span><div><span>Landings activas</span><strong>{landings.loadError ? '—' : metrics.published}</strong><small>publicadas ahora · {metrics.landingCount} con URL</small></div></article>
              <article className={`gs-kpi${!metrics.trackedCount ? ' is-missing' : ''}`} style={{ '--kpi-color': 'var(--cyan)' }}><span className="gs-kpi-icon"><RiEyeLine /></span><div><span>Visitas medidas</span><strong>{landings.loadError || !metrics.trackedCount ? 'Sin medir' : formatNumber(metrics.visits)}</strong><small>{metrics.trackedCount ? `${metrics.trackedCount} landings con tracking` : 'tracking pendiente'}</small></div></article>
              <article className="gs-kpi" style={{ '--kpi-color': 'var(--success)' }}><span className="gs-kpi-icon"><RiTeamLine /></span><div><span>Leads de campaña</span><strong>{landings.loadError ? '—' : formatNumber(metrics.leads)}</strong><small>{metrics.meetings ? `${formatNumber(metrics.meetings)} reuniones registradas` : 'registrados en campañas vinculadas'}</small></div></article>
              <article className={`gs-kpi${metrics.conversion === null ? ' is-missing' : ''}`} style={{ '--kpi-color': 'var(--pink)' }}><span className="gs-kpi-icon"><RiBarChartGroupedLine /></span><div><span>Conversión medida</span><strong>{landings.loadError ? '—' : metrics.conversion === null ? 'Sin medir' : formatPercent(metrics.conversion)}</strong><small>solo donde hay visitas</small></div></article>
              <article className={`gs-kpi${!report ? ' is-missing' : ''}`} style={{ '--kpi-color': report ? scoreColor(report.score) : 'var(--dim)' }}><span className="gs-kpi-icon"><RiRadarLine /></span><div><span>Score SEO</span><strong>{report ? <>{report.score}<u> /100</u></> : 'Sin auditar'}</strong><small>{report ? `${seo.passed}/${seo.checklist.length} comprobaciones${seo.scoreDelta != null && seo.scoreDelta !== 0 ? ` · ${seo.scoreDelta > 0 ? '+' : ''}${seo.scoreDelta} vs anterior` : ''}` : 'lanza la primera auditoría'}</small></div></article>
              <article className={`gs-kpi${!seo.searchConsole?.connected ? ' is-missing' : ''}`} style={{ '--kpi-color': 'var(--cyan)' }}><span className="gs-kpi-icon"><RiGlobalLine /></span><div><span>Keywords posicionando</span><strong>{seo.searchConsole?.connected ? <>{seo.positioned}<u> /{report?.keywords?.length ?? 0}</u></> : 'Sin medir'}</strong><small>{seo.searchConsole?.connected ? (seo.avgPosition != null ? `posición media ${seo.avgPosition.toFixed(1)}` : 'aún no apareces por keywords del plan') : 'conecta Search Console para medirlo'}</small></div></article>
            </section>

            <section className="gs-panel" aria-label="Atención requerida">
              <header className="gs-panel-head">
                <div><h2><span className="gs-panel-icon"><RiAlarmWarningLine /></span>Atención requerida</h2><p>Hallazgos de landings y de SEO en la misma cola: los de landings vienen ordenados por impacto económico; los de SEO, por lo que más visibilidad resta.</p></div>
                {queueCount ? <span className="gs-pill tone-warn">{queueCount} {queueCount === 1 ? 'hallazgo' : 'hallazgos'}</span> : null}
              </header>
              <div className="gs-panel-body">
                {landings.loading && seo.reportLoading ? <div className="gs-skeleton"><i /><i /><i /></div> : queueCount ? (
                  <div className="gs-queue">
                    {attention.map(diagnosis => <LandingDiagnosisCard key={diagnosis.id} diagnosis={diagnosis} onOpen={landings.openDetail} />)}
                    {seoQueue.map(item => <SeoQueueCard key={item.id} item={item} onExecute={executeQueueTarget} />)}
                  </div>
                ) : (
                  <p className="gs-empty-inline is-ok">{report ? 'Nada urgente: las landings medidas no tienen hallazgos y la auditoría no deja fallos técnicos abiertos.' : 'Las landings medidas no tienen hallazgos. Audita tu web para sumar el diagnóstico SEO a esta cola.'}</p>
                )}
              </div>
            </section>

            <div className="gs-cols">
              <EconomicRanking items={landings.performance} onOpen={landings.openDetail} />
              {report ? (
                <section className="gs-panel">
                  <header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiRadarLine /></span>Diagnóstico SEO</h2><p>{seo.hostnameOf(report.url)} · {report.model}</p></div><button type="button" className="gs-button small" onClick={() => selectTab('seo')}>Ver diagnóstico</button></header>
                  <div className="gs-panel-body wb-summary-seo">
                    <div className="wb-summary-score" style={{ '--gauge-color': scoreColor(report.score) }}><b>{report.score}</b><small>/ 100</small></div>
                    <div>
                      <p>{report.summary}</p>
                      <div className="wb-diagnosis-meta">
                        <span className={`gs-pill ${seo.failed ? 'tone-warn' : 'tone-ok'}`}>{seo.failed ? `${seo.failed} fallos técnicos` : 'Sin fallos técnicos'}</span>
                        {seo.vitals?.category ? <span className={`gs-pill ${seo.vitals.category === 'FAST' ? 'tone-ok' : seo.vitals.category === 'SLOW' ? 'tone-bad' : 'tone-warn'}`}>CWV: {seo.vitals.category}</span> : null}
                        <span className="gs-pill">{report.keywords?.length ?? 0} keywords</span>
                        <span className="gs-pill">{report.contentPlan?.length ?? 0} contenidos planificados</span>
                      </div>
                    </div>
                  </div>
                </section>
              ) : seo.reportLoading ? (
                <section className="gs-panel"><div className="gs-panel-body"><div className="gs-skeleton"><i /><i /><i /></div></div></section>
              ) : (
                <section className="gs-panel">
                  <div className="gs-empty">
                    <span><RiSearchEyeLine /></span>
                    <h3>Ninguna web auditada todavía</h3>
                    <p>La auditoría te dice qué frena tu web en Google y deja el plan de keywords y contenidos listo. Lo que arregle se aplica a tus landings con un clic.</p>
                    <div className="gs-empty-actions"><button type="button" className="gs-button primary" onClick={() => setAuditOpen(true)}><RiSearchEyeLine /> Analizar mi web</button></div>
                  </div>
                </section>
              )}
            </div>
            <ScoreHistory seo={seo} />
          </div>
        ) : null}

        {/* ── Landings ──────────────────────────────────────────────────── */}
        {tab === 'landings' ? (
          <div className="gs-stack">
            {!landings.loading ? <FeaturedLanding item={landings.featured} onOpen={landings.openItem} onEdit={landings.editItem} onCopy={landings.copyLink} onDetail={landings.openDetail} /> : null}
            <LandingList
              items={landings.allItems}
              externalCount={landings.externalWebs.length}
              loading={landings.loading}
              loadError={landings.loadError}
              onRetry={landings.reload}
              onOpen={landings.openItem}
              onEdit={landings.editItem}
              onCopy={landings.copyLink}
              onToggleStatus={landings.toggleStatus}
              onDetail={landings.openDetail}
              onCreate={landings.openCreate}
              onImport={landings.openImport}
            />
            <LeadMagnetPanel landingCampaigns={landingCampaigns} campaignId={seo.magnetCampaignId} onSelect={seo.setMagnetCampaignId} magnetUrl={seo.magnetUrl} notify={notify} />
          </div>
        ) : null}

        {/* ── SEO ───────────────────────────────────────────────────────── */}
        {tab === 'seo' ? (
          <div className="gs-stack">
            {seo.reportLoading ? <section className="gs-panel"><div className="gs-panel-body"><div className="gs-skeleton"><i /><i /><i /></div></div></section> : !report ? seoOnboard : (
              <>
                <SeoDiagnosisHero seo={seo} />
                <SeoActionCenter report={report} searchConsole={seo.searchConsole} stale={seo.stale} onOpenFactory={openFactory} onOpenTab={id => selectTab(id === 'tecnico' ? 'seo' : id)} />
                <div className="gs-cols">
                  <TechnicalChecklist checklist={seo.checklist} />
                  <PriorityFixes fixes={report.technicalFixes} />
                </div>
                <SiteCrawlPanel site={seo.site} />
                <WebVitalsPanel vitals={seo.vitals} />
                <SnippetsPanel seo={seo} landingCampaigns={landingCampaigns} />
                <LocalSeoPanel items={report.localSeo} />
                <ScoreHistory seo={seo} />
              </>
            )}
          </div>
        ) : null}

        {/* ── Keywords ──────────────────────────────────────────────────── */}
        {tab === 'keywords' ? (
          <div className="gs-stack">
            {!report ? seoOnboard : (
              <>
                <KeywordsPanel seo={seo} onAds={keywordsToAds} />
                <SearchConsolePanel seo={seo} onConnect={() => navigate('/captacion/atraer/organico?tab=fuentes')} />
                <SeoOpportunityRadar report={report} searchConsole={seo.searchConsole} onOpenFactory={openFactory} onOpenTab={selectTab} />
                <RankEvolutionPanel ranks={seo.ranks} />
                <CannibalizationPanel cannibal={seo.cannibal} onRun={seo.runCannibalization} />
              </>
            )}
          </div>
        ) : null}

        {/* ── Contenidos ────────────────────────────────────────────────── */}
        {tab === 'contenidos' ? (
          <div className="gs-stack">
            <div className="wb-factory-bar" id="wb-factory">
              <div><strong>Fábrica de páginas</strong><span>Brief → DeepSeek → validación SEO → publicación en el blog de tu landing.</span></div>
              <button type="button" className="gs-button accent" onClick={() => (factory.open ? setFactory(current => ({ ...current, open: false })) : openFactory())} aria-expanded={factory.open}><RiFlashlightLine /> {factory.open ? 'Cerrar fábrica' : 'Nueva página'}</button>
            </div>
            {factory.open ? <SeoPageFactory report={report} form={seo.form} onOpenAudit={() => setAuditOpen(true)} preferredKeyword={factory.keyword} preferredMode={factory.mode} /> : null}
            <ContentPlanPanel seo={seo} landingCampaigns={landingCampaigns} onOpenArticle={id => navigate(`/knowledge-base/articulos/${id}`)} />
            <StaleContentPanel stale={seo.stale} staleState={seo.staleState} onRefresh={seo.refreshStale} />
          </div>
        ) : null}

        {/* ── Competencia ───────────────────────────────────────────────── */}
        {tab === 'competencia' ? (
          <div className="gs-stack">
            {!report ? <div className="gs-alert is-info"><RiAlertLine /><span>Puedes comparar webs rivales sin informe propio, pero la fila «tu web» solo aparece cuando has auditado la tuya.</span></div> : null}
            <CompetitorsPanel seo={seo} />
            <KeywordGapPanel gap={seo.gap} onRun={seo.runKeywordGap} />
          </div>
        ) : null}
      </div>

      {auditOpen ? <AuditModal seo={seo} onClose={() => setAuditOpen(false)} onSubmit={runAudit} /> : null}
      {landings.modal ? <LandingModal mode={landings.modal.mode} item={landings.modal.item} onClose={landings.closeModal} onSave={landings.saveLanding} saving={landings.saving} /> : null}
      {landings.detail || landings.detailLoading ? (
        <LandingDetail detail={landings.detail} loading={landings.detailLoading} variants={landings.variants} experiment={landings.experiment} busy={landings.variantBusy} actions={landings.variantActions} autonomy={landings.autonomy} report={landings.report} onClose={landings.closeDetail} />
      ) : null}
      {notice ? <div className="gs-toast" role="status"><RiCheckLine /> {notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><RiCloseLine /></button></div> : null}
    </main>
  )
}
