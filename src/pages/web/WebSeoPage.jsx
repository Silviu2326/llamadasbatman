import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { RiArrowRightLine, RiCheckLine, RiCloseLine, RiExternalLinkLine, RiRefreshLine, RiSearchLine } from 'react-icons/ri'
import { useAuth } from '../../contexts/AuthContext'
import { hasNavigationPermission } from '../../lib/navigationPermissions'
import { apiFetch } from '../../lib/api'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
import { useLandings } from './useLandings'
import { useSeo } from './useSeo'
import { LandingDetail, LandingList, LandingModal } from './LandingPanels'
import { AuditModal, CompetitorsPanel, ContentPlanPanel, KeywordGapPanel, KeywordsPanel, RankEvolutionPanel, ScoreHistory, SearchConsolePanel, SnippetsPanel, TechnicalChecklist, WebVitalsPanel } from './SeoPanels'
import SeoPageFactory from '../../components/seo/SeoPageFactory'
import '../growth/growth-surface.css'
import './web.css'
import './website-workspace.css'

const TABS = [{ id: 'resumen', label: 'Mi web' }, { id: 'paginas', label: 'Páginas' }, { id: 'resultados', label: 'Resultados' }]
const LEGACY = { seo: 'resumen', landings: 'paginas', contenidos: 'paginas', keywords: 'resultados', competencia: 'resultados' }
const JOB_LABELS = { pending: 'En cola', running: 'Revisando la web', succeeded: 'Revisión completada', failed: 'Revisión fallida', canceled: 'Revisión cancelada' }
const PROPOSAL_LABELS = { queued: 'Preparando cambio', running: 'Preparando cambio', proposed: 'Pendiente de revisión', merged: 'Fusionado en el repositorio', closed: 'Cerrado', failed: 'No se pudo preparar', no_changes: 'Sin cambios' }
const date = value => value ? new Date(value).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin auditoría'
function pageIssues(page, duplicates = []) {
  return [!page.title && 'Sin título', !page.hasMetaDescription && 'Sin descripción', !page.hasH1 && 'Sin H1', page.imgsWithoutAlt > 0 && 'Imágenes sin texto alternativo', duplicates.includes(page.title) && 'Título duplicado'].filter(Boolean)
}
function Detail({ title, children }) {
  return <details className="ws-detail"><summary>{title}</summary><div className="ws-detail-body">{children}</div></details>
}
export default function WebSeoPage() {
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
  const tab = LEGACY[current] || (TABS.some(item => item.id === current) ? current : 'resumen')
  const selectTab = useCallback(value => setParams(previous => {
    const next = new URLSearchParams(previous); next.set('tab', LEGACY[value] || value); return next
  }, { replace: true }), [setParams])
  useEffect(() => {
    if (!location.state?.connectionSaved) return
    notify('Web guardada. La revisión inicial continuará en el servidor.')
    navigate(location.pathname + location.search, { replace: true, state: null })
  }, [location, navigate, notify])
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
    (url + ' ' + (page?.title || '')).toLowerCase().includes(query.toLowerCase()) && (!onlyIssues || (page && pageIssues(page, site?.duplicateTitles).length)))
  const pendingProposals = overview?.proposals?.filter(item => item.status === 'proposed') || []
  const activity = [
    ...(overview?.jobs || []).map(job => ({ id: job.id, title: JOB_LABELS[job.status] || job.status, at: job.finishedAt || job.createdAt })),
    ...(overview?.proposals || []).map(item => ({ id: item.id, title: item.title, detail: PROPOSAL_LABELS[item.status], at: item.createdAt, url: item.prUrl })),
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
      if (!response.ok) throw new Error(body.error || 'No se pudo preparar el cambio.')
      setProposal(''); notify('Cambio en preparación. Aparecerá aquí cuando esté listo para revisar.'); workspace.reload()
    } catch(err) { setProposalError(err.message) } finally { setProposalBusy(false) }
  }
  async function refreshProposal(id) {
    setCheckingProposal(id)
    try {
      const response = await apiFetch('/api/web-connections/' + connection.id + '/git/proposals/' + id + '?refresh=1')
      if (!response.ok) throw new Error('No se pudo comprobar el estado del cambio.')
      workspace.reload()
    } catch (err) { notify(err.message) } finally { setCheckingProposal('') }
  }
  const finishAudit = async () => { if (await seo.analyze({ url: connection.websiteUrl })) { setAuditOpen(false); workspace.reload(); notify('Análisis completado y guardado.') } }
  return <main className="gs-page wb-page ws-page"><div className="ws-shell">
    <header className="ws-heading"><div><h1>Web y SEO</h1><p>Tu web, revisada y en mejora continua.</p></div><button className="ws-button" onClick={manage}>{connection ? 'Gestionar conexión' : 'Conectar mi web'} <RiArrowRightLine /></button></header>
    <nav className="ws-tabs" aria-label="Secciones de Web y SEO">{TABS.map(item => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => selectTab(item.id)}>{item.label}</button>)}</nav>
    {workspace.error ? <div className="ws-message is-error" role="alert">{workspace.error}<button className="ws-button" onClick={workspace.reload}>Reintentar</button></div> : null}
    {workspace.loading ? <div className="ws-empty" role="status">Cargando tu web…</div> : !connection ? <section className="ws-empty"><h2>Empecemos por tu web</h2><p>Conéctala para descubrir sus páginas, revisar su estado y preparar mejoras.</p><button className="ws-button primary" onClick={manage}>Conectar mi web</button></section> : <>
      <section className="ws-site" aria-label="Estado de tu web">
        <div className="ws-site-top"><div>{workspace.connections.length > 1 ? <select aria-label="Web seleccionada" value={connection.id} onChange={event => setParams(previous => { const next = new URLSearchParams(previous); next.set('site', event.target.value); return next })}>{workspace.connections.map(item => <option key={item.id} value={item.id}>{item.domain}</option>)}</select> : <h2>{connection.domain}</h2>}<span className={'ws-connection ' + (connection.status === 'connected' ? 'is-ok' : '')}>{connection.status === 'connected' ? 'Conexión activa' : connection.status === 'disconnected' ? 'Desconectada' : 'Configuración pendiente'}</span></div><button className="ws-button" disabled={!canManage || workspace.busy || Boolean(active) || connection.status === 'disconnected'} onClick={workspace.audit}><RiRefreshLine className={active ? 'gs-spin' : ''}/>{active ? JOB_LABELS[active.status] || 'Revisión en curso' : 'Revisar ahora'}</button></div>
        <dl className="ws-facts"><div><dt>Última revisión</dt><dd>{!overview ? 'Comprobando…' : date(report?.generatedAt)}</dd></div><div><dt>Vigilancia</dt><dd>{!overview ? 'Comprobando…' : monitor?.status === 'active' ? 'Revisión cada 24 horas' : monitor?.status === 'paused' ? 'En pausa' : 'Sin servicio de vigilancia'}</dd>{monitor?.nextRunAt ? <small>Próxima: {date(monitor.nextRunAt)}</small> : null}</div><div><dt>Medición · últimos 7 días</dt><dd>{connection.signals?.verified ? (connection.signals.last7d?.page_view ?? 0) + ' vistas registradas' : 'Sin datos de visitas'}</dd></div></dl>
      </section>
      {active ? <div className="ws-message" role="status"><RiRefreshLine className="gs-spin"/><div><strong>{active.status === 'pending' ? 'Revisión en cola' : 'Revisando robots.txt, sitemap y páginas'}</strong><p>{monitor?.status !== 'active' ? 'Esperando al servicio de revisión. El trabajo está guardado.' : 'Puedes salir de esta pantalla. El resultado se guardará al terminar.'}</p></div></div> : latestJob?.status === 'failed' ? <div className="ws-message is-error" role="alert"><div><strong>La última revisión no se completó</strong><p>{latestJob.error}</p></div><button className="ws-button" onClick={workspace.audit} disabled={!canManage || workspace.busy}>Reintentar revisión</button></div> : null}
      {tab === 'resumen' ? <>
        <div className="ws-columns"><div className="ws-main">
          <section><h2>Necesita tu atención</h2>{!overview ? <p className="ws-empty">Consultando el diagnóstico…</p> : !report ? <div className="ws-empty"><h3>{active ? 'Estamos preparando tu primer diagnóstico' : 'La primera revisión está pendiente'}</h3><p>Revisaremos robots.txt, sitemap y las páginas de tu web.</p>{!active ? <button className="ws-button primary" onClick={workspace.audit} disabled={!canManage || workspace.busy}>Iniciar revisión</button> : null}</div> : <>
            {!report.webAlive ? <div className="ws-message is-error">No pudimos leer la web. Comprueba si responde o bloquea el rastreo.</div> : null}
            {failedChecks.length ? <ul className="ws-actions">{failedChecks.slice(0,5).map(item => <li key={item.id}><span className="ws-dot"/><div><h3>{item.label}</h3><p>{item.hint}</p></div><button className="ws-link" onClick={() => prepare('Revisa y corrige este hallazgo en ' + connection.websiteUrl + ': ' + item.label + '. ' + item.hint)}>Preparar mejora <RiArrowRightLine/></button></li>)}</ul> : report.webAlive ? <p className="ws-empty compact"><RiCheckLine/> Sin fallos en las comprobaciones realizadas. {site?.pagesAudited ?? 0} páginas revisadas.</p> : null}
            {pendingProposals.map(item => <div className="ws-proposal" key={item.id}><div><strong>{item.title}</strong><small>Pendiente de tu revisión</small></div><a className="ws-button" href={item.prUrl} target="_blank" rel="noreferrer">Revisar cambio <RiExternalLinkLine/></a><button className="ws-link" onClick={() => refreshProposal(item.id)} disabled={checkingProposal === item.id}>{checkingProposal === item.id ? 'Comprobando…' : 'Comprobar estado'}</button></div>)}
          </>}</section>
          <section><h2>Oportunidades de mejora</h2>{pages.some(page => pageIssues(page, site?.duplicateTitles).length) ? <div className="ws-opportunity"><h3>Mejora la información de tus páginas</h3><p>Hay {pages.filter(page => pageIssues(page, site?.duplicateTitles).length).length} páginas con títulos, descripciones o contenido que revisar.</p><button className="ws-link" onClick={() => { setOnlyIssues(true); selectTab('paginas') }}>Ver páginas afectadas <RiArrowRightLine/></button></div> : <p className="ws-empty compact">{report ? 'Consulta las páginas revisadas y conecta Search Console para descubrir oportunidades con datos de búsquedas.' : 'Las propuestas aparecerán después de analizar tu web.'}</p>}{report ? <button className="ws-link" onClick={() => setAuditOpen(true)}>Preparar un plan de contenido con contexto del negocio <RiArrowRightLine/></button> : null}</section>
        </div><aside className="ws-activity"><h2>Actividad reciente</h2>{activity.length ? <ol>{activity.map(item => <li key={item.id}><time>{date(item.at)}</time><strong>{item.title}</strong>{item.detail ? <span>{item.detail}</span> : null}{item.url ? <a href={item.url} target="_blank" rel="noreferrer">Ver propuesta</a> : null}</li>)}</ol> : <p>Aquí verás las revisiones y los cambios de tu web.</p>}</aside></div>
        <Detail title="Diagnóstico técnico">{report ? <><TechnicalChecklist checklist={report.checklist || []}/><WebVitalsPanel vitals={report.webVitals}/><p className="ws-note">Rastreo de {site?.pagesAudited ?? 0} páginas. {site?.truncated ? 'La revisión tiene un límite; consulta la cobertura en Páginas.' : ''}</p></> : <p>Aún no hay un diagnóstico guardado.</p>}</Detail>
        <details className="ws-detail" ref={changeRef}><summary>Preparar cambios</summary><div className="ws-detail-body">
          {connection.connector?.kind === 'git' && connection.connector.canPush ? <form className="ws-change-form" onSubmit={submitProposal}><label htmlFor="ws-proposal">Describe la mejora que quieres preparar</label><textarea id="ws-proposal" rows={4} maxLength={8000} value={proposal} onChange={event => setProposal(event.target.value)} placeholder="Indica qué página quieres mejorar y qué debe cambiar."/><p>Se preparará una rama y un pull request. Podrás revisar el cambio antes de fusionarlo y desplegarlo.</p>{proposalError ? <p role="alert" className="ws-error">{proposalError}</p> : null}<button className="ws-button primary" disabled={!canManage || proposalBusy || proposal.trim().length < 10}>{proposalBusy ? 'Preparando…' : 'Preparar propuesta'}</button></form> : connection.connector?.kind === 'wordpress' && report ? <SnippetsPanel seo={seo} landingCampaigns={landingCampaigns}/> : <p>Completa la conexión de edición para preparar cambios. <button className="ws-link" onClick={manage}>Gestionar conexión</button></p>}
        </div></details>
      </> : null}
      {tab === 'paginas' ? <>
        <div className="ws-section-heading"><div><h2>Las páginas de tu web</h2><p>{site ? site.sitemapUrlCount + ' URLs en sitemap · ' + site.pagesAudited + ' páginas revisadas' : 'El inventario aparecerá tras la primera revisión.'}</p></div><button className="ws-button" onClick={() => setFactory({ keyword: '', mode: 'activa' })}>Crear contenido</button></div>
        {site ? <p className="ws-note">{site.sitemapCount ?? (site.sitemapFound ? 1 : 0)} sitemaps leídos. {site.truncated ? 'Cobertura parcial: hasta ' + (site.crawlLimit || 50) + ' páginas por revisión y 20 sitemaps.' : ''} {site.failedUrls?.length ? site.failedUrls.length + ' páginas no pudieron leerse.' : ''} {site.skippedByRobots ? site.skippedByRobots + ' URLs excluidas por robots.txt.' : ''}</p> : null}
        <div className="ws-toolbar"><label className="ws-search"><RiSearchLine/><input aria-label="Buscar página" placeholder="Buscar por título o URL…" value={query} onChange={event => setQuery(event.target.value)}/></label><label className="ws-check"><input type="checkbox" checked={onlyIssues} onChange={event => setOnlyIssues(event.target.checked)}/> Solo con incidencias</label></div>
        <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>Página</th><th>Estado</th><th>Hallazgos</th><th>Acciones</th></tr></thead><tbody>{rows.map(({url,page}) => <tr key={url}><td><strong>{page?.title || url}</strong><a href={url} target="_blank" rel="noreferrer">{url} <RiExternalLinkLine/></a></td><td>{site?.redirects?.[url] ? 'Redirige a otra URL' : page ? 'Revisada' : site?.excludedUrls?.includes(url) ? 'Excluida por robots.txt' : site?.failedUrls?.includes(url) ? 'No se pudo leer' : 'Pendiente de revisar'}</td><td>{page ? pageIssues(page, site?.duplicateTitles).join(' · ') || 'Sin hallazgos' : 'Sin diagnóstico'}</td><td><button className="ws-link" onClick={() => setSelectedPage({url,page})}>Ver detalle</button></td></tr>)}</tbody></table>{!rows.length ? <p className="ws-empty compact">{query || onlyIssues ? 'No hay páginas que coincidan con los filtros.' : 'Aún no hay páginas descubiertas.'}</p> : null}</div>
        {selectedPage ? <section className="ws-page-detail"><button className="ws-link" onClick={() => setSelectedPage(null)} aria-label="Cerrar detalle"><RiCloseLine/></button><h3>{selectedPage.page?.title || selectedPage.url}</h3><p>{selectedPage.url}</p>{selectedPage.page ? <><ul>{pageIssues(selectedPage.page, site?.duplicateTitles).map(issue => <li key={issue}>{issue}</li>)}</ul><button className="ws-button" onClick={() => prepare('Revisa y mejora los metadatos y la estructura de ' + selectedPage.url + '. Hallazgos: ' + (pageIssues(selectedPage.page, site?.duplicateTitles).join(', ') || 'Revisar oportunidades sin cambiar contenido no relacionado'))}>Preparar mejora</button></> : <p>Esta URL se ha descubierto pero no tiene diagnóstico.</p>}</section> : null}
        {factory ? <section className="ws-factory"><button className="ws-link" onClick={() => setFactory(null)}>Cerrar editor <RiCloseLine/></button><SeoPageFactory report={report} form={seo.form} onOpenAudit={() => setAuditOpen(true)} preferredKeyword={factory.keyword} preferredMode={factory.mode}/></section> : null}
        {report?.provider === 'deepseek' ? <Detail title="Plan de contenido"><p className="ws-note">Plan preparado el {date(report.planGeneratedAt || report.generatedAt)}. Las revisiones técnicas no lo reescriben.</p><ContentPlanPanel seo={seo} landingCampaigns={landingCampaigns} onOpenArticle={id => navigate('/knowledge-base/articulos/' + id)} onOpenFactory={keyword => setFactory({ keyword, mode:'activa' })}/></Detail> : null}
        <Detail title="Landings de la organización"><LandingList items={landings.allItems} externalCount={landings.externalWebs.length} loading={landings.loading} loadError={landings.loadError} onRetry={landings.reload} onOpen={landings.openItem} onEdit={landings.editItem} onCopy={landings.copyLink} onToggleStatus={landings.toggleStatus} onDetail={landings.openDetail} onCreate={landings.openCreate} onImport={landings.openImport}/></Detail>
      </> : null}
      {tab === 'resultados' ? <>
        <div className="ws-section-heading"><div><h2>Qué está cambiando</h2><p>Revisiones técnicas y señales registradas. Los resultados de búsqueda requieren Search Console.</p></div></div>
        <div className="ws-results"><div><span>Vistas · 7 días</span><strong>{connection.signals?.verified ? connection.signals.last7d?.page_view ?? 0 : '—'}</strong></div><div><span>Formularios enviados · 7 días</span><strong>{connection.signals?.verified ? connection.signals.last7d?.form_submit ?? 0 : '—'}</strong></div><div><span>Comprobaciones técnicas</span><strong>{report?.checklist?.length ? report.checklist.filter(item => item.ok).length + ' / ' + report.checklist.length : '—'}</strong></div><div><span>Páginas revisadas</span><strong>{site?.pagesAudited ?? '—'}</strong></div></div>
        {!connection.signals?.verified ? <p className="ws-note">Todavía no recibimos eventos de esta web. Conectar Git permite preparar cambios; la medición requiere instalar el seguimiento.</p> : null}
        {seo.searchConsole?.property ? <p className="ws-note">Propiedad de Search Console: {seo.searchConsole.property}</p> : null}<SearchConsolePanel seo={seo} onConnect={() => navigate('/captacion/atraer/organico?tab=fuentes')}/><ScoreHistory seo={{ ...seo, history: overview?.history || [] }}/><RankEvolutionPanel ranks={seo.ranks}/>
        <Detail title="Cambios y revisiones"><ul className="ws-actions">{overview?.history?.slice().reverse().map(item => <li key={item.id}><div><h3>Revisión técnica · {item.score}/100</h3><p>{date(item.createdAt)} · {item.auto ? 'Automática' : 'Solicitada'}</p></div></li>)}</ul>{!overview?.history?.length ? <p>Aún no hay revisiones guardadas.</p> : null}</Detail>
        {report?.provider === 'deepseek' ? <Detail title="Búsquedas y oportunidades"><KeywordsPanel seo={seo} onAds={async () => { if (await seo.keywordsToAds()) navigate('/captacion/nueva') }}/></Detail> : null}
        <Detail title="Comparar con otras webs"><CompetitorsPanel seo={seo}/><KeywordGapPanel gap={seo.gap} onRun={seo.runKeywordGap}/></Detail>
      </> : null}
    </>}
  </div>
  {auditOpen ? <AuditModal lockedUrl seo={seo} onClose={() => setAuditOpen(false)} onSubmit={finishAudit}/> : null}
  {landings.modal ? <LandingModal mode={landings.modal.mode} item={landings.modal.item} onClose={landings.closeModal} onSave={landings.saveLanding} saving={landings.saving}/> : null}
  {landings.detail || landings.detailLoading ? <LandingDetail detail={landings.detail} loading={landings.detailLoading} variants={landings.variants} experiment={landings.experiment} busy={landings.variantBusy} actions={landings.variantActions} autonomy={landings.autonomy} report={landings.report} onClose={landings.closeDetail}/> : null}
  {notice ? <div className="gs-toast" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice('')}><RiCloseLine/></button></div> : null}
  </main>
}
