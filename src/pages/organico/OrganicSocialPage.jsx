import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  RiAddLine, RiBarChartBoxLine, RiCheckLine, RiCloseLine, RiCompass3Line, RiLeafLine,
  RiLightbulbFlashLine, RiLinkM, RiShieldKeyholeLine, RiSparkling2Line,
} from 'react-icons/ri'
import DataStatusBanner from '../../components/ui/DataStatusBanner'
import ProductPageHeader from '../../components/ui/ProductPageHeader'
import OrganicAutonomy from '../../components/organic/OrganicAutonomy'
import OrganicDataIntegrity from '../../components/organic/OrganicDataIntegrity'
import OrganicOnboarding from '../../components/organic/OrganicOnboarding'
import { statusMessage } from '../../lib/dataStatus'
import { planGateMessage } from '../../lib/planGate'
import { useI18n } from '../../i18n'
import { useOrganicCommand } from './useOrganicCommand'
import { useContentStudio } from './useContentStudio'
import {
  ActionPanel, AssetsPanel, OrganicChannels, OrganicErrorState, OrganicFunnel, OrganicIntegrationsPanel,
  OrganicKpis, OrganicModal, OrganicNarrative, OrganicPages, OrganicPieces, OrganicRecommendations,
  OrganicSecondary, OrganicSetupPrompt, OrganicUpcoming,
} from './OrganicPanels'
import { ApprovalQueue, BrandAndSharing, CopilotPanel, MetricoolPanel, RadarPanel, ResultsPanel, StudioPanel } from './ContentPanels'
import '../growth/growth-surface.css'
import './organico.css'
import '../growth-visual-standard.css'

/**
 * Orgánico y social — una sola página para todo lo que trae clientes sin
 * pagar por el clic.
 *
 * Nace de fundir dos pantallas: el centro de mando orgánico (medir el
 * circuito búsqueda → redes → ficha → prospección hasta la venta, recomendar y
 * gobernar la autonomía) y Redes sociales (radar de oportunidades desde las
 * conversaciones, estudio de piezas, sala de aprobación y Metricool). Juntas
 * cierran el bucle que antes exigía saltar de página: la medición dice qué
 * canal trae compradores, la cola de recomendaciones dice qué pieza falta y
 * el estudio la produce sin salir de aquí.
 *
 * Reglas que manda la página:
 * - El estudio funciona sin proyecto orgánico; la medición no. Sin proyecto,
 *   el Resumen es el onboarding y las demás pestañas siguen operativas.
 * - Ninguna carga bloquea el resto: cada panel trae su estado.
 * - La pestaña vive en la URL (`?tab=`): los brazos que despachan aquí
 *   (recomendación social → Estudio) y el retorno OAuth aterrizan en la suya.
 */

const TABS = [
  { id: 'resumen', icon: RiCompass3Line },
  { id: 'acciones', icon: RiLightbulbFlashLine },
  { id: 'contenido', icon: RiSparkling2Line },
  { id: 'rendimiento', icon: RiBarChartBoxLine },
  { id: 'fuentes', icon: RiLinkM },
  { id: 'autonomia', icon: RiShieldKeyholeLine },
]
const TAB_IDS = new Set(TABS.map(tab => tab.id))

const PERIODS = ['30d', '90d', '12m']

const PROVIDER_LABEL = { search_console: 'Search Console', ga4: 'Google Analytics', google_business_profile: 'Google Business Profile' }

function scrollTo(selector) {
  // Dos frames: el primero pinta la pestaña nueva, el segundo ya tiene el nodo.
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }))
}

export default function OrganicSocialPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(() => (TAB_IDS.has(searchParams.get('tab')) ? searchParams.get('tab') : 'resumen'))
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(null)
  const pendingOpportunity = useRef(null)

  const notify = useCallback(message => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3600)
  }, [])
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const command = useOrganicCommand({ notify })
  const content = useContentStudio({ notify })

  const selectTab = useCallback(id => {
    setTab(id)
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.set('tab', id)
      return next
    }, { replace: true })
  }, [setSearchParams])

  // La pestaña en la URL manda: un brazo que despacha aquí o el retorno de
  // OAuth cambian los parámetros sin desmontar la página.
  useEffect(() => {
    const requested = searchParams.get('tab')
    if (requested && TAB_IDS.has(requested) && requested !== tab) setTab(requested)
    // Solo cuando cambian los parámetros: `tab` local no debe reabrir esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Retorno del OAuth de Google: aterriza en Fuentes con el resultado dicho.
  useEffect(() => {
    const provider = searchParams.get('organic_provider')
    if (!provider) return
    const failed = searchParams.get('status') === 'error'
    notify(t(failed ? 'organic.page.oauthFailed' : 'organic.page.oauthConnected', { provider: PROVIDER_LABEL[provider] ?? provider }))
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.delete('organic_provider')
      next.delete('status')
      next.set('tab', 'fuentes')
      return next
    }, { replace: true })
    if (!failed) command.loadIntegrations()
    // Solo al montar con el parámetro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recomendación despachada al brazo social: abre el estudio con esa
  // oportunidad en cuanto el radar la tenga cargada.
  useEffect(() => {
    if (searchParams.get('from') === 'organic' && searchParams.get('opportunityId')) {
      pendingOpportunity.current = searchParams.get('opportunityId')
    }
  }, [searchParams])

  const openStudio = useCallback(opportunity => {
    content.studio.open(opportunity)
    selectTab('contenido')
    scrollTo('#og-studio')
  }, [content.studio, selectTab])

  useEffect(() => {
    const wanted = pendingOpportunity.current
    if (!wanted || !content.radar.data) return
    const match = content.radar.data.opportunities?.find(item => item.id === wanted)
    pendingOpportunity.current = null
    if (match) openStudio(match)
    else notify(t('organic.page.opportunityGone'))
  }, [content.radar.data, openStudio, notify, t])

  function goToCopilot() {
    selectTab('contenido')
    scrollTo('#og-copilot')
  }

  async function handleDispatch(id) {
    const url = await command.dispatchRecommendation(id)
    if (url) navigate(url)
  }

  const data = command.data
  const view = command.view
  const organicState = view.status === 'error' ? 'error'
    : view.status === 'loading' && !data ? 'loading'
      : view.status === 'setup' || !data ? 'setup'
        : view.status
  const setupPrompt = what => <OrganicSetupPrompt what={what} onGoToSetup={() => selectTab('resumen')} />

  const radarCount = content.radar.data?.opportunities?.length || 0
  const tabCounts = useMemo(() => ({
    acciones: (command.recommendations?.length || 0) + radarCount + (data?.actions?.length || 0) || null,
    contenido: content.approval.pendingCount || null,
    rendimiento: data?.channels?.length || null,
    fuentes: (command.connectedSources + (content.connection.connected ? 1 : 0)) || null,
    autonomia: command.pendingDecisions || null,
  }), [command.recommendations, radarCount, data, content.approval.pendingCount, command.connectedSources, content.connection.connected, command.pendingDecisions])

  const metricoolBanner = content.connection.gated ? null : (
    <DataStatusBanner
      status={content.connection.status}
      message={content.connection.error || statusMessage(content.connection.status, {
        live: t('organic.page.metricoolLive'),
        disconnected: t('organic.page.metricoolDisconnected'),
        demo: t('organic.page.metricoolDemo'),
        empty: t('organic.page.metricoolEmpty'),
      })}
      onRetry={content.connection.status === 'error' ? content.connection.reload : undefined}
      onAction={content.connection.status === 'disconnected' ? content.connection.connect : undefined}
      actionLabel={t('organic.page.connectMetricool')}
    />
  )

  return (
    <main className="gs-page og-page">
      <div className="gs-shell">
        <ProductPageHeader Icon={RiLeafLine} title={t('organic.page.title')} description={t('organic.page.description')} actions={<div className="gs-header-actions">
            {command.projects.length ? (
              <select className="gs-select" aria-label={t('organic.page.project')} value={command.projectId || command.projects[0]?.id || ''} onChange={event => command.setProjectId(event.target.value)}>
                {command.projects.map(project => <option key={project.id} value={project.id}>{project.name || project.location || t('organic.page.organicProject')}</option>)}
              </select>
            ) : null}
            <select className="gs-select" aria-label={t('organic.page.period')} value={command.period} onChange={event => command.setPeriod(event.target.value)}>
              {PERIODS.map(value => <option key={value} value={value}>{t(`organic.page.periods.${value}`)}</option>)}
            </select>
            {command.hasProject ? <button type="button" className="gs-button ghost" onClick={() => command.openModal('setup', data.project, 'connect')}><RiLinkM /> {t('organic.page.editProject')}</button> : null}
            <button type="button" className="gs-button primary" onClick={goToCopilot}><RiAddLine /> {t('organic.page.createContent')}</button>
          </div>} />


        {/* La integridad de las fuentes manda sobre todo lo demás: los números
            valen lo que valgan sus fuentes, así que va fuera de las pestañas. */}
        {data?.dataQuality ? <OrganicDataIntegrity dataQuality={data.dataQuality} onConnect={() => selectTab('fuentes')} /> : null}

        <nav className="gs-tabs" aria-label={t('organic.page.sectionsAria')}>
          {TABS.map(item => (
            <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => selectTab(item.id)}>
              <item.icon aria-hidden="true" /> {t(`organic.page.tabs.${item.id}`)}
              {tabCounts[item.id] ? <b>{tabCounts[item.id]}</b> : null}
            </button>
          ))}
        </nav>

        {/* ── Resumen ───────────────────────────────────────────────────── */}
        {tab === 'resumen' ? (
          <div className="gs-stack">
            {organicState === 'error' ? <OrganicErrorState error={view.error} onRetry={command.reload} onConfigure={() => command.openModal('setup', null, 'project')} /> : null}
            {organicState === 'setup' ? (
              <>
                {view.gate ? <DataStatusBanner status="plan" message={planGateMessage(view.gate, locale)} /> : null}
                <section className="gs-alert is-info"><RiLeafLine /><span>{t('organic.page.setupInfo')}</span></section>
                <OrganicOnboarding onComplete={command.reload} />
              </>
            ) : null}
            {organicState === 'loading' ? (
              <>
                <OrganicKpis summary={null} loading />
                <section className="gs-panel"><div className="gs-panel-body"><div className="gs-skeleton"><i /><i /><i /></div></div></section>
              </>
            ) : null}
            {organicState === 'ready' || organicState === 'empty' ? (
              <>
                {organicState === 'empty' ? <DataStatusBanner status="empty" message={t('organic.page.emptySignals')} /> : null}
                <OrganicKpis summary={data.summary} />
                <OrganicSecondary summary={data.summary} />
                <ContentPulse radarCount={radarCount} pending={content.approval.pendingCount} results={content.results} onOpen={selectTab} />
                <div className="gs-cols">
                  <OrganicFunnel funnel={data.funnel} />
                  <OrganicNarrative narrative={data.weeklyNarrative} />
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {/* ── Qué hacer ─────────────────────────────────────────────────── */}
        {tab === 'acciones' ? (
          <div className="gs-stack">
            <OrganicRecommendations
              items={command.recommendations}
              onDispatch={handleDispatch}
              onDismiss={command.dismissRecommendation}
              onRefresh={command.refreshRecommendations}
              refreshing={command.refreshingRecs}
              busyId={command.dispatching}
              disabledReason={organicState === 'setup' ? t('organic.page.recsDisabled') : ''}
            />
            <RadarPanel radar={content.radar} onGenerate={openStudio} onOwnIdea={goToCopilot} />
            {data ? (
              <div className="gs-cols">
                <ActionPanel actions={data.actions} onAction={target => command.openModal('draft', target)} />
                <AssetsPanel assets={data.assets} onAction={target => command.openModal('draft', target)} />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── Estudio ───────────────────────────────────────────────────── */}
        {tab === 'contenido' ? (
          <div className="gs-stack">
            {content.connection.gated
              ? <section className="gs-alert is-info"><RiCloseLine /><span>{t('organic.page.gatedStudio')}</span></section>
              : metricoolBanner}
            <StudioPanel studio={content.studio} />
            <ApprovalQueue approval={content.approval} />
            <CopilotPanel copilot={content.copilot} campaignLink={content.campaignLink} gated={content.connection.gated} />
          </div>
        ) : null}

        {/* ── Rendimiento ───────────────────────────────────────────────── */}
        {tab === 'rendimiento' ? (
          <div className="gs-stack">
            <ResultsPanel results={content.results} />
            {data ? (
              <>
                <OrganicChannels channels={data.channels} />
                <OrganicPieces pieces={data.pieces} />
                <OrganicPages pages={data.pages} />
                {!data.channels?.length && !data.pieces?.length && !data.pages?.length ? <p className="gs-empty-inline">{t('organic.page.noPerformance')}</p> : null}
              </>
            ) : organicState === 'loading' ? <section className="gs-panel"><div className="gs-panel-body"><div className="gs-skeleton"><i /><i /><i /></div></div></section> : setupPrompt(t('organic.page.setupCompare'))}
          </div>
        ) : null}

        {/* ── Fuentes y marca ───────────────────────────────────────────── */}
        {tab === 'fuentes' ? (
          <div className="gs-stack">
            <OrganicIntegrationsPanel state={command.integrationState} projectId={data?.project?.id || command.projectId} onAction={command.handleIntegrationAction} onRefresh={command.loadIntegrations} />
            <MetricoolPanel connection={content.connection} analytics={content.analytics} gated={content.connection.gated} />
            <BrandAndSharing brand={content.brand} />
            <OrganicUpcoming />
          </div>
        ) : null}

        {/* ── Autonomía ─────────────────────────────────────────────────── */}
        {tab === 'autonomia' ? (
          <div className="gs-stack">
            {command.autonomy ? (
              <>
                <OrganicAutonomy state={command.autonomy} busy={command.autonomyBusy} {...command.autonomyActions} />
                {command.autonomyMessage ? <p className="gs-inline-error" role="alert">{command.autonomyMessage}</p> : null}
              </>
            ) : organicState === 'setup' ? setupPrompt(t('organic.page.setupGovern')) : (
              <section className="gs-panel"><header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiShieldKeyholeLine /></span>{t('organic.page.autonomyTitle')}</h2><p>{t('organic.page.autonomyUnavailable')}</p></div></header></section>
            )}
          </div>
        ) : null}
      </div>

      {command.modal ? <OrganicModal {...command.modal} onClose={command.closeModal} onSubmit={command.submitModal} submitting={command.submitting} message={command.modalMessage} /> : null}
      {notice ? <div className="gs-toast" role="status"><RiCheckLine /> {notice}<button type="button" aria-label={t('organic.page.closeNotice')} onClick={() => setNotice('')}><RiCloseLine /></button></div> : null}
    </main>
  )
}

/** Lo que el estudio tiene entre manos, visible desde el Resumen sin cambiar de pestaña. */
function ContentPulse({ radarCount, pending, results, onOpen }) {
  const { t } = useI18n()
  const items = [
    { label: t('organic.page.pulse.radar'), value: radarCount, hint: t('organic.page.pulse.radarHint'), tab: 'acciones' },
    { label: t('organic.page.pulse.pending'), value: pending, hint: t('organic.page.pulse.pendingHint'), tab: 'contenido' },
    { label: t('organic.page.pulse.minutes'), value: results?.minutesSaved ?? null, hint: t('organic.page.pulse.minutesHint'), tab: 'rendimiento' },
    { label: t('organic.page.pulse.leads'), value: results?.leadsAttributed ?? null, hint: t('organic.page.pulse.leadsHint', { n: results?.published ?? 0 }), tab: 'rendimiento' },
  ]
  return (
    <section className="gs-minis og-pulse" aria-label={t('organic.page.pulse.aria')}>
      {items.map(item => (
        <button type="button" key={item.label} className={`gs-mini${item.value == null ? ' is-missing' : ''}`} onClick={() => onOpen(item.tab)}>
          <span>{item.label}</span>
          <strong>{item.value == null ? t('organic.page.pulse.noMeasure') : item.value}</strong>
          <em>{item.hint}</em>
        </button>
      ))}
    </section>
  )
}
