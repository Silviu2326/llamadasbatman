import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { RiArrowRightLine, RiCheckLine, RiCloseLine, RiExternalLinkLine, RiRefreshLine, RiSearchLine } from 'react-icons/ri'
import { useAuth } from '../../contexts/AuthContext'
import { hasNavigationPermission } from '../../lib/navigationPermissions'
import { apiFetch } from '../../lib/api'
import { localeCode, useI18n } from '../../i18n'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
import { useLandings } from './useLandings'
import { useSeo } from './useSeo'
import { LandingDetail, LandingList, LandingModal } from './LandingPanels'
import { AuditModal, CompetitorsPanel, ContentPlanPanel, KeywordGapPanel, KeywordsPanel, RankEvolutionPanel, ScoreHistory, SearchConsolePanel, SnippetsPanel, TechnicalChecklist, WebVitalsPanel } from './SeoPanels'
import SeoPageFactory from '../../components/seo/SeoPageFactory'
import '../growth/growth-surface.css'
import './web.css'
import './website-workspace.css'

const TABS = ['resumen', 'paginas', 'resultados']
const LEGACY = { seo: 'resumen', landings: 'paginas', contenidos: 'paginas', keywords: 'resultados', competencia: 'resultados' }
const JOB_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'canceled']
const PROPOSAL_STATUSES = ['queued', 'running', 'proposed', 'merged', 'closed', 'failed', 'no_changes']
function pageIssues(page, duplicates = [], t) {
  return [!page.title && t('webSeo.page.issue.noTitle'), !page.hasMetaDescription && t('webSeo.page.issue.noDescription'), !page.hasH1 && t('webSeo.page.issue.noH1'), page.imgsWithoutAlt > 0 && t('webSeo.page.issue.imgAlt'), duplicates.includes(page.title) && t('webSeo.page.issue.duplicateTitle')].filter(Boolean)
}
function Detail({ title, children }) {
  return <details className="ws-detail"><summary>{title}</summary><div className="ws-detail-body">{children}</div></details>
}
export default function WebSeoPage() {
  const { t, locale } = useI18n()
  const date = value => value ? new Date(value).toLocaleString(localeCode(locale), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('webSeo.page.noAudit')
  const jobLabel = status => (JOB_STATUSES.includes(status) ? t(`webSeo.page.job.${status}`) : status)
  const proposalLabel = status => (PROPOSAL_STATUSES.includes(status) ? t(`webSeo.page.proposal.${status}`) : status)
  const issuesOf = page => pageIssues(page, site?.duplicateTitles, t)
  const navigate = useNavigate(), location = useLocation()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const canManage = hasNavigationPermission(user, ['integrations.manage'])
  const workspace = useWebsiteWorkspace(params.get('site'))
  const { connection, overview } = workspace
  const [notice, setNotice] = useState('')
  const [auditOpen, setAuditOpen] = useState(false)
  const [factory, setFactory] = useState(null)
  const [query, setQuery] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [selectedPage, setSelectedPage] = useState(null)
  const [proposal, setProposal] = useState('')
  const [proposalBusy, setProposalBusy] = useState(false)
  const [proposalError, setProposalError] = useState('')
  const [checkingProposal, setCheckingProposal] = useState('')
  const noticeTimer = useRef(), changeRef = useRef(null), pendingChange = useRef(false)
  const notify = useCallback(message => {
    setNotice(message); clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 6000)
  }, [])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  const landings = useLandings({ notify, initialLandingKey: params.get('landing') || '', initialCampaignId: params.get('campaign') || '' })
  const landingCampaigns = useMemo(() => landings.campaigns.filter(item => item.landingSlug), [landings.campaigns])
  const seo = useSeo({ landingCampaigns, targetUrl: connection?.websiteUrl || '', externalReport: overview?.report || null })
  const report = overview?.report || null, site = report?.site
  const current = params.get('tab') || 'resumen'
  const tab = LEGACY[current] || (TABS.includes(current) ? current : 'resumen')
  const selectTab = useCallback(value => setParams(previous => {
    const next = new URLSearchParams(previous); next.set('tab', LEGACY[value] || value); return next
  }, { replace: true }), [setParams])
  useEffect(() => {
    if (!location.state?.connectionSaved) return
    notify(t('webSeo.page.savedNotice'))
    navigate(location.pathname + location.search, { replace: true, state: null })
  }, [location, navigate, notify, t])
  useEffect(() => {
    setSelectedPage(null); setProposal(''); setProposalError(''); setQuery(''); setFactory(null)
  }, [connection?.id])
  useEffect(() => {
    if (params.get('from') !== 'organic' || !params.get('query')) return
    setFactory({ keyword: params.get('query'), mode: params.get('intent') === 'commercial' ? 'activa' : 'pasiva' })
    setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', 'paginas'); ['from','query','intent'].forEach(key => next.delete(key)); return next }, { replace: true })
  }, [params, setParams])
  const active = overview?.jobs?.find(job => ['pending','running','waiting_provider'].includes(job.status))
  const latestJob = overview?.jobs?.[0], monitor = overview?.monitoring
  const failedChecks = report?.checklist?.filter(item => !item.ok) || [], pages = site?.pages || []
  const pageMap = new Map(pages.map(page => [page.url, page]))
  const urls = site?.discoveredUrls || pages.map(page => page.url)
  const rows = urls.map(url => ({ url, page: pageMap.get(site?.redirects?.[url] || url) })).filter(({ url, page }) =>
    (url + ' ' + (page?.title || '')).toLowerCase().includes(query.toLowerCase()) && (!onlyIssues || (page && issuesOf(page).length)))
  const pendingProposals = overview?.proposals?.filter(item => item.status === 'proposed') || []
  const activity = [
    ...(overview?.jobs || []).map(job => ({ id: job.id, title: jobLabel(job.status), at: job.finishedAt || job.createdAt })),
    ...(overview?.proposals || []).map(item => ({ id: item.id, title: item.title, detail: proposalLabel(item.status), at: item.createdAt, url: item.prUrl })),
  ].sort((a,b) => new Date(b.at) - new Date(a.at)).slice(0,8)
  const manage = () => navigate('/conexiones/web?from=web-seo')
  function prepare(text) {
    pendingChange.current = true; setProposal(text); selectTab('resumen')

  }
  useEffect(() => {
    if (!pendingChange.current || tab !== 'resumen' || !changeRef.current) return
    pendingChange.current = false
    changeRef.current.open = true
    changeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    changeRef.current.querySelector('textarea')?.focus()
  }, [tab, proposal])
  async function submitProposal(event) {
    event.preventDefault()
    if (!canManage || proposalBusy || proposal.trim().length < 10) return
    setProposalBusy(true); setProposalError('')
    try {
      const response = await apiFetch('/api/web-connections/' + connection.id + '/git/proposals', { method: 'POST', body: JSON.stringify({ instructions: proposal.trim(), source: 'seo' }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || t('webSeo.page.proposalFailed'))
      setProposal(''); notify(t('webSeo.page.proposalQueued')); workspace.reload()
    } catch(err) { setProposalError(err.message) } finally { setProposalBusy(false) }
  }
  async function refreshProposal(id) {
    setCheckingProposal(id)
    try {
      const response = await apiFetch('/api/web-connections/' + connection.id + '/git/proposals/' + id + '?refresh=1')
      if (!response.ok) throw new Error(t('webSeo.page.proposalCheckFailed'))
      workspace.reload()
    } catch (err) { notify(err.message) } finally { setCheckingProposal('') }
  }
  const finishAudit = async () => { if (await seo.analyze({ url: connection.websiteUrl })) { setAuditOpen(false); workspace.reload(); notify(t('webSeo.page.analysisDone')) } }
  return <main className="gs-page wb-page ws-page"><div className="ws-shell">
    <header className="ws-heading"><div><h1>{t('webSeo.page.title')}</h1><p>{t('webSeo.page.subtitle')}</p></div><button className="ws-button" onClick={manage}>{connection ? t('webSeo.page.manageConnection') : t('webSeo.page.connectSite')} <RiArrowRightLine /></button></header>
    <nav className="ws-tabs" aria-label={t('webSeo.page.sectionsAria')}>{TABS.map(id => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => selectTab(id)}>{t(`webSeo.page.tabs.${id}`)}</button>)}</nav>
    {workspace.error ? <div className="ws-message is-error" role="alert">{workspace.error}<button className="ws-button" onClick={workspace.reload}>{t('webSeo.page.retry')}</button></div> : null}
    {workspace.loading ? <div className="ws-empty" role="status">{t('webSeo.page.loadingSite')}</div> : !connection ? <section className="ws-empty"><h2>{t('webSeo.page.startTitle')}</h2><p>{t('webSeo.page.startText')}</p><button className="ws-button primary" onClick={manage}>{t('webSeo.page.connectSite')}</button></section> : <>
      <section className="ws-site" aria-label={t('webSeo.page.siteStatusAria')}>
        <div className="ws-site-top"><div>{workspace.connections.length > 1 ? <select aria-label={t('webSeo.page.selectedSite')} value={connection.id} onChange={event => setParams(previous => { const next = new URLSearchParams(previous); next.set('site', event.target.value); return next })}>{workspace.connections.map(item => <option key={item.id} value={item.id}>{item.domain}</option>)}</select> : <h2>{connection.domain}</h2>}<span className={'ws-connection ' + (connection.status === 'connected' ? 'is-ok' : '')}>{connection.status === 'connected' ? t('webSeo.page.connActive') : connection.status === 'disconnected' ? t('webSeo.page.connDisconnected') : t('webSeo.page.connPending')}</span></div><button className="ws-button" disabled={!canManage || workspace.busy || Boolean(active) || connection.status === 'disconnected'} onClick={workspace.audit}><RiRefreshLine className={active ? 'gs-spin' : ''}/>{active ? (JOB_STATUSES.includes(active.status) ? jobLabel(active.status) : t('webSeo.page.reviewInProgress')) : t('webSeo.page.reviewNow')}</button></div>
        <dl className="ws-facts"><div><dt>{t('webSeo.page.lastReview')}</dt><dd>{!overview ? t('webSeo.page.checking') : date(report?.generatedAt)}</dd></div><div><dt>{t('webSeo.page.monitoring')}</dt><dd>{!overview ? t('webSeo.page.checking') : monitor?.status === 'active' ? t('webSeo.page.every24h') : monitor?.status === 'paused' ? t('webSeo.page.paused') : t('webSeo.page.noMonitoring')}</dd>{monitor?.nextRunAt ? <small>{t('webSeo.page.next', { date: date(monitor.nextRunAt) })}</small> : null}</div><div><dt>{t('webSeo.page.measurement7d')}</dt><dd>{connection.signals?.verified ? t('webSeo.page.viewsRecorded', { n: connection.signals.last7d?.page_view ?? 0 }) : t('webSeo.page.noVisitData')}</dd></div></dl>
      </section>
      {active ? <div className="ws-message" role="status"><RiRefreshLine className="gs-spin"/><div><strong>{active.status === 'pending' ? t('webSeo.page.reviewQueued') : t('webSeo.page.reviewingItems')}</strong><p>{monitor?.status !== 'active' ? t('webSeo.page.waitingService') : t('webSeo.page.canLeave')}</p></div></div> : latestJob?.status === 'failed' ? <div className="ws-message is-error" role="alert"><div><strong>{t('webSeo.page.lastReviewFailed')}</strong><p>{latestJob.error}</p></div><button className="ws-button" onClick={workspace.audit} disabled={!canManage || workspace.busy}>{t('webSeo.page.retryReview')}</button></div> : null}
      {tab === 'resumen' ? <>
        <div className="ws-columns"><div className="ws-main">
          <section><h2>{t('webSeo.page.needsAttention')}</h2>{!overview ? <p className="ws-empty">{t('webSeo.page.queryingDiagnosis')}</p> : !report ? <div className="ws-empty"><h3>{active ? t('webSeo.page.preparingFirst') : t('webSeo.page.firstPending')}</h3><p>{t('webSeo.page.willReview')}</p>{!active ? <button className="ws-button primary" onClick={workspace.audit} disabled={!canManage || workspace.busy}>{t('webSeo.page.startReview')}</button> : null}</div> : <>
            {!report.webAlive ? <div className="ws-message is-error">{t('webSeo.page.siteUnreadable')}</div> : null}
            {failedChecks.length ? <ul className="ws-actions">{failedChecks.slice(0,5).map(item => <li key={item.id}><span className="ws-dot"/><div><h3>{item.label}</h3><p>{item.hint}</p></div><button className="ws-link" onClick={() => prepare(t('webSeo.page.fixInstruction', { url: connection.websiteUrl, label: item.label, hint: item.hint }))}>{t('webSeo.page.prepareFix')} <RiArrowRightLine/></button></li>)}</ul> : report.webAlive ? <p className="ws-empty compact"><RiCheckLine/> {t('webSeo.page.noFailures', { n: site?.pagesAudited ?? 0 })}</p> : null}
            {pendingProposals.map(item => <div className="ws-proposal" key={item.id}><div><strong>{item.title}</strong><small>{t('webSeo.page.pendingYourReview')}</small></div><a className="ws-button" href={item.prUrl} target="_blank" rel="noreferrer">{t('webSeo.page.reviewChange')} <RiExternalLinkLine/></a><button className="ws-link" onClick={() => refreshProposal(item.id)} disabled={checkingProposal === item.id}>{checkingProposal === item.id ? t('webSeo.page.checkingStatus') : t('webSeo.page.checkStatus')}</button></div>)}
          </>}</section>
          <section><h2>{t('webSeo.page.opportunities')}</h2>{pages.some(page => issuesOf(page).length) ? <div className="ws-opportunity"><h3>{t('webSeo.page.improvePages')}</h3><p>{t('webSeo.page.pagesToReview', { n: pages.filter(page => issuesOf(page).length).length })}</p><button className="ws-link" onClick={() => { setOnlyIssues(true); selectTab('paginas') }}>{t('webSeo.page.seeAffected')} <RiArrowRightLine/></button></div> : <p className="ws-empty compact">{report ? t('webSeo.page.connectSearchConsole') : t('webSeo.page.proposalsAfterAnalysis')}</p>}{report ? <button className="ws-link" onClick={() => setAuditOpen(true)}>{t('webSeo.page.preparePlan')} <RiArrowRightLine/></button> : null}</section>
        </div><aside className="ws-activity"><h2>{t('webSeo.page.recentActivity')}</h2>{activity.length ? <ol>{activity.map(item => <li key={item.id}><time>{date(item.at)}</time><strong>{item.title}</strong>{item.detail ? <span>{item.detail}</span> : null}{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{t('webSeo.page.seeProposal')}</a> : null}</li>)}</ol> : <p>{t('webSeo.page.activityEmpty')}</p>}</aside></div>
        <Detail title={t('webSeo.page.technicalDiagnosis')}>{report ? <><TechnicalChecklist checklist={report.checklist || []}/><WebVitalsPanel vitals={report.webVitals}/><p className="ws-note">{t('webSeo.page.crawlOf', { n: site?.pagesAudited ?? 0 })} {site?.truncated ? t('webSeo.page.crawlLimited') : ''}</p></> : <p>{t('webSeo.page.noDiagnosis')}</p>}</Detail>
        <details className="ws-detail" ref={changeRef}><summary>{t('webSeo.page.prepareChanges')}</summary><div className="ws-detail-body">
          {connection.connector?.kind === 'git' && connection.connector.canPush ? <form className="ws-change-form" onSubmit={submitProposal}><label htmlFor="ws-proposal">{t('webSeo.page.describeChange')}</label><textarea id="ws-proposal" rows={4} maxLength={8000} value={proposal} onChange={event => setProposal(event.target.value)} placeholder={t('webSeo.page.changePlaceholder')}/><p>{t('webSeo.page.changeNote')}</p>{proposalError ? <p role="alert" className="ws-error">{proposalError}</p> : null}<button className="ws-button primary" disabled={!canManage || proposalBusy || proposal.trim().length < 10}>{proposalBusy ? t('webSeo.page.preparing') : t('webSeo.page.prepareProposal')}</button></form> : connection.connector?.kind === 'wordpress' && report ? <SnippetsPanel seo={seo} landingCampaigns={landingCampaigns}/> : <p>{t('webSeo.page.completeConnection')} <button className="ws-link" onClick={manage}>{t('webSeo.page.manageConnection')}</button></p>}
        </div></details>
      </> : null}
      {tab === 'paginas' ? <>
        <div className="ws-section-heading"><div><h2>{t('webSeo.page.yourPages')}</h2><p>{site ? t('webSeo.page.inventorySummary', { urls: site.sitemapUrlCount, pages: site.pagesAudited }) : t('webSeo.page.inventoryAfter')}</p></div><button className="ws-button" onClick={() => setFactory({ keyword: '', mode: 'activa' })}>{t('webSeo.page.createContent')}</button></div>
        {site ? <p className="ws-note">{t('webSeo.page.sitemapsRead', { n: site.sitemapCount ?? (site.sitemapFound ? 1 : 0) })} {site.truncated ? t('webSeo.page.partialCoverage', { n: site.crawlLimit || 50 }) : ''} {site.failedUrls?.length ? t('webSeo.page.failedUrls', { n: site.failedUrls.length }) : ''} {site.skippedByRobots ? t('webSeo.page.skippedRobots', { n: site.skippedByRobots }) : ''}</p> : null}
        <div className="ws-toolbar"><label className="ws-search"><RiSearchLine/><input aria-label={t('webSeo.page.searchPage')} placeholder={t('webSeo.page.searchPlaceholder')} value={query} onChange={event => setQuery(event.target.value)}/></label><label className="ws-check"><input type="checkbox" checked={onlyIssues} onChange={event => setOnlyIssues(event.target.checked)}/> {t('webSeo.page.onlyIssues')}</label></div>
        <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>{t('webSeo.page.colPage')}</th><th>{t('webSeo.page.colStatus')}</th><th>{t('webSeo.page.colFindings')}</th><th>{t('webSeo.page.colActions')}</th></tr></thead><tbody>{rows.map(({url,page}) => <tr key={url}><td><strong>{page?.title || url}</strong><a href={url} target="_blank" rel="noreferrer">{url} <RiExternalLinkLine/></a></td><td>{site?.redirects?.[url] ? t('webSeo.page.redirects') : page ? t('webSeo.page.reviewed') : site?.excludedUrls?.includes(url) ? t('webSeo.page.excludedRobots') : site?.failedUrls?.includes(url) ? t('webSeo.page.unreadable') : t('webSeo.page.pendingReview')}</td><td>{page ? issuesOf(page).join(' · ') || t('webSeo.page.noFindings') : t('webSeo.page.noDiagnosisShort')}</td><td><button className="ws-link" onClick={() => setSelectedPage({url,page})}>{t('webSeo.page.seeDetail')}</button></td></tr>)}</tbody></table>{!rows.length ? <p className="ws-empty compact">{query || onlyIssues ? t('webSeo.page.noMatch') : t('webSeo.page.noPages')}</p> : null}</div>
        {selectedPage ? <section className="ws-page-detail"><button className="ws-link" onClick={() => setSelectedPage(null)} aria-label={t('webSeo.page.closeDetail')}><RiCloseLine/></button><h3>{selectedPage.page?.title || selectedPage.url}</h3><p>{selectedPage.url}</p>{selectedPage.page ? <><ul>{issuesOf(selectedPage.page).map(issue => <li key={issue}>{issue}</li>)}</ul><button className="ws-button" onClick={() => prepare(t('webSeo.page.pageFixInstruction', { url: selectedPage.url, findings: issuesOf(selectedPage.page).join(', ') || t('webSeo.page.pageFixFallback') }))}>{t('webSeo.page.prepareFix')}</button></> : <p>{t('webSeo.page.urlNoDiagnosis')}</p>}</section> : null}
        {factory ? <section className="ws-factory"><button className="ws-link" onClick={() => setFactory(null)}>{t('webSeo.page.closeEditor')} <RiCloseLine/></button><SeoPageFactory report={report} form={seo.form} onOpenAudit={() => setAuditOpen(true)} preferredKeyword={factory.keyword} preferredMode={factory.mode}/></section> : null}
        {report?.provider === 'deepseek' ? <Detail title={t('webSeo.page.contentPlan')}><p className="ws-note">{t('webSeo.page.planPrepared', { date: date(report.planGeneratedAt || report.generatedAt) })}</p><ContentPlanPanel seo={seo} landingCampaigns={landingCampaigns} onOpenArticle={id => navigate('/knowledge-base/articulos/' + id)} onOpenFactory={keyword => setFactory({ keyword, mode:'activa' })}/></Detail> : null}
        <Detail title={t('webSeo.page.orgLandings')}><LandingList items={landings.allItems} externalCount={landings.externalWebs.length} loading={landings.loading} loadError={landings.loadError} onRetry={landings.reload} onOpen={landings.openItem} onEdit={landings.editItem} onCopy={landings.copyLink} onToggleStatus={landings.toggleStatus} onDetail={landings.openDetail} onCreate={landings.openCreate} onImport={landings.openImport}/></Detail>
      </> : null}
      {tab === 'resultados' ? <>
        <div className="ws-section-heading"><div><h2>{t('webSeo.page.whatsChanging')}</h2><p>{t('webSeo.page.resultsIntro')}</p></div></div>
        <div className="ws-results"><div><span>{t('webSeo.page.views7d')}</span><strong>{connection.signals?.verified ? connection.signals.last7d?.page_view ?? 0 : '—'}</strong></div><div><span>{t('webSeo.page.forms7d')}</span><strong>{connection.signals?.verified ? connection.signals.last7d?.form_submit ?? 0 : '—'}</strong></div><div><span>{t('webSeo.page.techChecks')}</span><strong>{report?.checklist?.length ? report.checklist.filter(item => item.ok).length + ' / ' + report.checklist.length : '—'}</strong></div><div><span>{t('webSeo.page.pagesReviewed')}</span><strong>{site?.pagesAudited ?? '—'}</strong></div></div>
        {!connection.signals?.verified ? <p className="ws-note">{t('webSeo.page.noEvents')}</p> : null}
        {seo.searchConsole?.property ? <p className="ws-note">{t('webSeo.page.scProperty', { property: seo.searchConsole.property })}</p> : null}<SearchConsolePanel seo={seo} onConnect={() => navigate('/captacion/atraer/organico?tab=fuentes')}/><ScoreHistory seo={{ ...seo, history: overview?.history || [] }}/><RankEvolutionPanel ranks={seo.ranks}/>
        <Detail title={t('webSeo.page.changesAndReviews')}><ul className="ws-actions">{overview?.history?.slice().reverse().map(item => <li key={item.id}><div><h3>{t('webSeo.page.technicalReview', { score: item.score })}</h3><p>{date(item.createdAt)} · {item.auto ? t('webSeo.page.automatic') : t('webSeo.page.requested')}</p></div></li>)}</ul>{!overview?.history?.length ? <p>{t('webSeo.page.noReviews')}</p> : null}</Detail>
        {report?.provider === 'deepseek' ? <Detail title={t('webSeo.page.searchesOpportunities')}><KeywordsPanel seo={seo} onAds={async () => { if (await seo.keywordsToAds()) navigate('/captacion/nueva') }}/></Detail> : null}
        <Detail title={t('webSeo.page.compareSites')}><CompetitorsPanel seo={seo}/><KeywordGapPanel gap={seo.gap} onRun={seo.runKeywordGap}/></Detail>
      </> : null}
    </>}
  </div>
  {auditOpen ? <AuditModal lockedUrl seo={seo} onClose={() => setAuditOpen(false)} onSubmit={finishAudit}/> : null}
  {landings.modal ? <LandingModal mode={landings.modal.mode} item={landings.modal.item} onClose={landings.closeModal} onSave={landings.saveLanding} saving={landings.saving}/> : null}
  {landings.detail || landings.detailLoading ? <LandingDetail detail={landings.detail} loading={landings.detailLoading} variants={landings.variants} experiment={landings.experiment} busy={landings.variantBusy} actions={landings.variantActions} autonomy={landings.autonomy} report={landings.report} onClose={landings.closeDetail}/> : null}
  {notice ? <div className="gs-toast" role="status">{notice}<button aria-label={t('webSeo.page.closeNotice')} onClick={() => setNotice('')}><RiCloseLine/></button></div> : null}
  </main>
}
