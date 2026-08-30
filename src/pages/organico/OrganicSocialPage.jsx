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
  { id: 'resumen', label: 'Resumen', icon: RiCompass3Line },
  { id: 'acciones', label: 'Qué hacer', icon: RiLightbulbFlashLine },
  { id: 'contenido', label: 'Estudio', icon: RiSparkling2Line },
  { id: 'rendimiento', label: 'Rendimiento', icon: RiBarChartBoxLine },
  { id: 'fuentes', label: 'Fuentes y marca', icon: RiLinkM },
  { id: 'autonomia', label: 'Autonomía', icon: RiShieldKeyholeLine },
]
const TAB_IDS = new Set(TABS.map(tab => tab.id))

const PERIODS = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: '12m', label: 'Últimos 12 meses' },
]

const PROVIDER_LABEL = { search_console: 'Search Console', ga4: 'Google Analytics', google_business_profile: 'Google Business Profile' }

function scrollTo(selector) {
  // Dos frames: el primero pinta la pestaña nueva, el segundo ya tiene el nodo.
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }))
}

export default function OrganicSocialPage() {
  const { locale } = useI18n()
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
    notify(failed ? `No se pudo completar la conexión con ${PROVIDER_LABEL[provider] ?? provider}.` : `${PROVIDER_LABEL[provider] ?? provider} conectado. Selecciona la propiedad y sincroniza.`)
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
    else notify('La oportunidad despachada ya no está en el radar: vuelve a analizar las conversaciones.')
  }, [content.radar.data, openStudio, notify])

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
        live: 'Metricool conectado: tus redes están listas para operar.',
        disconnected: 'Metricool está desconectado; conecta una cuenta para publicar.',
        demo: 'Modo demo explícito: no se publicará contenido real.',
        empty: 'Metricool está disponible, pero todavía no hay canales conectados.',
      })}
      onRetry={content.connection.status === 'error' ? content.connection.reload : undefined}
      onAction={content.connection.status === 'disconnected' ? content.connection.connect : undefined}
      actionLabel="Conectar Metricool"
    />
  )

  return (
    <main className="gs-page og-page">
      <div className="gs-shell">
        <ProductPageHeader Icon={RiLeafLine} title={locale === 'en' ? 'Organic & social' : 'Orgánico y social'} description="Todo lo que trae clientes sin pagar por el clic: búsqueda, redes, ficha de Google y contenido medido hasta la venta." actions={<div className="gs-header-actions">
            {command.projects.length ? (
              <select className="gs-select" aria-label="Proyecto" value={command.projectId || command.projects[0]?.id || ''} onChange={event => command.setProjectId(event.target.value)}>
                {command.projects.map(project => <option key={project.id} value={project.id}>{project.name || project.location || 'Proyecto orgánico'}</option>)}
              </select>
            ) : null}
            <select className="gs-select" aria-label="Periodo" value={command.period} onChange={event => command.setPeriod(event.target.value)}>
              {PERIODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            {command.hasProject ? <button type="button" className="gs-button ghost" onClick={() => command.openModal('setup', data.project, 'connect')}><RiLinkM /> Editar proyecto</button> : null}
            <button type="button" className="gs-button primary" onClick={goToCopilot}><RiAddLine /> Crear contenido</button>
          </div>} />


        {/* La integridad de las fuentes manda sobre todo lo demás: los números
            valen lo que valgan sus fuentes, así que va fuera de las pestañas. */}
        {data?.dataQuality ? <OrganicDataIntegrity dataQuality={data.dataQuality} onConnect={() => selectTab('fuentes')} /> : null}

        <nav className="gs-tabs" aria-label="Secciones de Orgánico y social">
          {TABS.map(item => (
            <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => selectTab(item.id)}>
              <item.icon aria-hidden="true" /> {item.label}
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
                <section className="gs-alert is-info"><RiLeafLine /><span>Para medir el circuito orgánico Vendrava necesita conocer el negocio. El estudio de contenido ya funciona: puedes ir a «Qué hacer» o «Estudio» mientras completas esto.</span></section>
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
                {organicState === 'empty' ? <DataStatusBanner status="empty" message="Aún no hay señales orgánicas en este periodo. Conecta las fuentes y sincroniza para ver datos reales." /> : null}
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
              disabledReason={organicState === 'setup' ? 'Las recomendaciones salen del circuito medido: configura el proyecto orgánico en el Resumen para activarlas.' : ''}
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
              ? <section className="gs-alert is-info"><RiCloseLine /><span>Redes sociales es una función del Plan Completo: puedes generar y aprobar piezas, pero no crear borradores en Metricool. Habla con tu administrador para activarla.</span></section>
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
                {!data.channels?.length && !data.pieces?.length && !data.pages?.length ? <p className="gs-empty-inline">Todavía no hay canales ni piezas medidas en este periodo. Sincroniza las fuentes y publica contenido para verlos aquí.</p> : null}
              </>
            ) : organicState === 'loading' ? <section className="gs-panel"><div className="gs-panel-body"><div className="gs-skeleton"><i /><i /><i /></div></div></section> : setupPrompt('comparar canales y piezas')}
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
            ) : organicState === 'setup' ? setupPrompt('gobernar qué puede hacer Vendrava solo') : (
              <section className="gs-panel"><header className="gs-panel-head"><div><h2><span className="gs-panel-icon"><RiShieldKeyholeLine /></span>Sala de autonomía</h2><p>No pudimos leer el estado de gobierno. El resto de la página sigue en pie.</p></div></header></section>
            )}
          </div>
        ) : null}
      </div>

      {command.modal ? <OrganicModal {...command.modal} onClose={command.closeModal} onSubmit={command.submitModal} submitting={command.submitting} message={command.modalMessage} /> : null}
      {notice ? <div className="gs-toast" role="status"><RiCheckLine /> {notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><RiCloseLine /></button></div> : null}
    </main>
  )
}

/** Lo que el estudio tiene entre manos, visible desde el Resumen sin cambiar de pestaña. */
function ContentPulse({ radarCount, pending, results, onOpen }) {
  const items = [
    { label: 'Oportunidades en el radar', value: radarCount, hint: 'desde conversaciones reales', tab: 'acciones' },
    { label: 'Piezas esperando decisión', value: pending, hint: 'en la sala de aprobación', tab: 'contenido' },
    { label: 'Minutos ahorrados', value: results?.minutesSaved ?? null, hint: 'solo piezas aprobadas', tab: 'rendimiento' },
    { label: 'Leads atribuidos al contenido', value: results?.leadsAttributed ?? null, hint: `${results?.published ?? 0} piezas publicadas`, tab: 'rendimiento' },
  ]
  return (
    <section className="gs-minis og-pulse" aria-label="Pulso del estudio">
      {items.map(item => (
        <button type="button" key={item.label} className={`gs-mini${item.value == null ? ' is-missing' : ''}`} onClick={() => onOpen(item.tab)}>
          <span>{item.label}</span>
          <strong>{item.value == null ? 'Sin medición' : item.value}</strong>
          <em>{item.hint}</em>
        </button>
      ))}
    </section>
  )
}
