import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine,
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiCloseLine,
  RiCompass3Line,
  RiComputerLine,
  RiFileTextLine,
  RiFocus3Line,
  RiGlobalLine,
  RiLeafLine,
  RiLightbulbFlashLine,
  RiLinkM,
  RiMapPin2Line,
  RiRefreshLine,
  RiSearchEyeLine,
  RiShieldKeyholeLine,
  RiSparkling2Line,
  RiTeamLine,
  RiUserSearchLine,
} from 'react-icons/ri'
import {
  approveOrganicAutonomyDecision,
  connectOrganicWeb,
  configureOrganicIntegration,
  createOrganicDraft,
  createOrganicProject,
  demoteOrganicAutonomyKind,
  disconnectOrganicIntegration,
  dismissOrganicRecommendation,
  dispatchOrganicRecommendation,
  fetchOrganicAutonomy,
  fetchOrganicIntegrations,
  fetchOrganicOverview,
  fetchOrganicRecommendations,
  promoteOrganicAutonomyKind,
  refreshOrganicRecommendations,
  rejectOrganicAutonomyDecision,
  runOrganicAutonomyPass,
  startOrganicOAuth,
  syncOrganicIntegration,
  updateOrganicAutonomy,
} from '../lib/organic/organicApi'
import { DEMO_MODE } from '../lib/dataMode'
import { planGateMessage } from '../lib/planGate'
import { getLocale, localeCode, useI18n } from '../i18n'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import OrganicAutonomy from '../components/organic/OrganicAutonomy'
import OrganicDataIntegrity from '../components/organic/OrganicDataIntegrity'
import OrganicOnboarding from '../components/organic/OrganicOnboarding'
import './organic-leads.css'

const PERIODS = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: '12m', label: 'Últimos 12 meses' },
]

// Las cuatro tarjetas de organico.md §5.2. Las anteriores pedían
// `potentialCustomers`, `estimatedValue` y `missedOpportunities`, que ningún
// endpoint envió nunca: se renderizaban vacías para siempre.
const ORGANIC_KPIS = [
  { key: 'organicLeads', group: 'fast', label: 'Leads orgánicos', description: 'Contactos llegados por búsqueda, redes, ficha de Google o prospección.', icon: RiUserSearchLine },
  { key: 'qualified', group: 'mature', label: 'Cualificados', description: 'De esos leads, los que tuvieron un resultado de llamada válido.', icon: RiTeamLine },
  { key: 'sales', group: 'mature', label: 'Ventas atribuidas', description: 'Oportunidades ganadas que nacieron de un canal orgánico.', icon: RiFocus3Line },
  { key: 'hoursPerQualified', group: 'mature', label: 'Horas por cualificado', description: 'El gasto del orgánico es tiempo: estimado desde las piezas publicadas.', icon: RiLeafLine },
]

// Cifras que el backend ya calculaba y la pantalla tiraba: `presence`,
// `opportunities` y `hoursInvested` venían medidas en cada respuesta y no se
// pintaban en ninguna parte. `visits` llega null mientras GA4 no esté conectado
// —«sin medición», no cero— y así se dice.
const ORGANIC_SECONDARY = [
  { key: 'visits', group: 'fast', label: 'Visitas orgánicas', hint: 'Sesiones sin pagar por el clic. Requiere Analytics conectado.' },
  { key: 'presence', group: 'fast', label: 'Presencia', hint: 'Sitios donde el negocio aparece sin pagar.' },
  { key: 'opportunities', group: 'mature', label: 'Oportunidades', hint: 'Leads orgánicos que llegaron a oportunidad abierta.' },
  { key: 'hoursInvested', group: 'mature', label: 'Horas invertidas', hint: 'Tiempo estimado de producción de las piezas del período.' },
]

const SIGNAL_LABEL = {
  visit: 'visita', lead: 'lead', qualified_lead: 'lead cualificado',
  opportunity: 'oportunidad', sale: 'venta',
}

const ACTION_ICONS = [RiFileTextLine, RiMapPin2Line, RiLeafLine, RiLinkM, RiSparkling2Line]

// La navegación interna eran cuatro anclas para trece paneles: el resto de la
// página no aparecía en ningún índice y solo se encontraba haciendo scroll.
// Pestañas, como en el resto del producto.
const ORGANIC_TABS = [
  { id: 'resumen', label: 'Resumen', icon: RiCompass3Line },
  { id: 'canales', label: 'Canales y piezas', icon: RiBarChartBoxLine },
  { id: 'acciones', label: 'Qué hacer', icon: RiLightbulbFlashLine },
  { id: 'fuentes', label: 'Fuentes de datos', icon: RiLinkM },
  { id: 'autonomia', label: 'Autonomía', icon: RiShieldKeyholeLine },
]

const INTEGRATION_META = {
  search_console: { label: 'Google Search Console', description: 'Consultas, impresiones y páginas que reciben demanda orgánica.', icon: RiSearchEyeLine },
  ga4: { label: 'Google Analytics 4', description: 'Sesiones y conversiones atribuidas cuando la propiedad está seleccionada.', icon: RiComputerLine },
  google_business_profile: { label: 'Google Business Profile', description: 'Visibilidad local, ubicaciones y acciones de tu ficha.', icon: RiMapPin2Line },
}

const CONNECTED_INTEGRATION_STATUSES = new Set(['connected', 'active', 'ready', 'synced'])

function integrationPresentation(integration) {
  const status = integration?.status || 'not_connected'
  const connected = CONNECTED_INTEGRATION_STATUSES.has(status)
  const hasProperty = Boolean(integration?.externalPropertyId)
  if (status === 'error' || integration?.lastError) return { label: 'Revisar conexión', tone: 'error', connected, hasProperty }
  if (connected && !hasProperty) return { label: 'Propiedad pendiente', tone: 'pending', connected, hasProperty }
  if (connected) return { label: 'Conectado', tone: 'connected', connected, hasProperty }
  if (status === 'syncing') return { label: 'Sincronizando', tone: 'pending', connected: false, hasProperty }
  return { label: 'No conectado', tone: 'idle', connected: false, hasProperty }
}

function displayNumber(value, options = {}) {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'number') return new Intl.NumberFormat(localeCode(getLocale()), options).format(value)
  return String(value)
}

function hasOrganicSignals(data) {
  if (!data) return false
  const kpis = data.kpis || {}
  return Object.values(kpis).some(value => Number(value) > 0)
    || Boolean(data.opportunity?.score || data.opportunity?.summary)
    || [data.demand?.points, data.demand?.opportunities, data.actions, data.local?.areas, data.ai?.items, data.assets, data.leads, data.competitorGap?.items]
      .some(items => Array.isArray(items) && items.length > 0)
}

function KpiCard({ item, value }) {
  const Icon = item.icon
  // `null` significa "no se ha medido"; `0` significa "se midió y salió cero".
  // Pintarlos igual borra la diferencia entre no tener datos y no tener leads.
  const missing = value === null || value === undefined
  return <article className={`organic-kpi${missing ? ' is-missing' : ''}`}>
    <span className="organic-kpi-icon"><Icon aria-hidden="true" /></span>
    <div>
      <small>{item.label}</small>
      <strong>{missing ? 'Sin medición' : displayNumber(value)}</strong>
      <p>{item.description}</p>
    </div>
  </article>
}

/**
 * Lo que el centro de mando todavía no puede mostrar, y en qué fase llega.
 *
 * Sustituye a los paneles de demanda, visibilidad local, visibilidad IA y
 * hueco competitivo, que pintaban tablas vacías y un mapa con coordenadas
 * inventadas (`left: 25 + index * 11%`). Decir "esto llega en la fase 2" es
 * información; un panel vacío es ruido que parece un fallo.
 */
/** Embudo unificado e informe del período — organico.md §5.3. */
function OrganicFunnel({ funnel, narrative }) {
  if (!funnel?.length) return null
  const measured = funnel.filter(step => step.value != null)
  const max = measured.length ? Math.max(...measured.map(step => step.value)) : 0
  return <>
    <section className="organic-panel">
      <header className="organic-panel-header">
        <div><h2><span className="organic-panel-icon"><RiFocus3Line /></span>Embudo orgánico</h2><p>De la presencia al comprador, sin pagar por el tráfico.</p></div>
      </header>
      <div className="organic-funnel">
        {funnel.map(step => (
          <div className="organic-funnel-step" key={step.key}>
            <span>{step.label}</span>
            <div><i style={{ width: step.value != null && max > 0 ? `${Math.max(5, (step.value / max) * 100)}%` : '0%' }} /></div>
            <strong className={step.value == null ? 'is-missing' : ''}>{step.value == null ? 'Sin medición' : step.value.toLocaleString('es-ES')}</strong>
            <em>{step.conversionPct != null ? `${step.conversionPct} %` : ''}</em>
          </div>
        ))}
      </div>
    </section>

    {narrative && (
      <section className="organic-panel">
        <header className="organic-panel-header">
          <div><h2><span className="organic-panel-icon"><RiFileTextLine /></span>Informe del período</h2><p>{narrative.headline}</p></div>
        </header>
        <div className="organic-narrative">
          {narrative.sections.map(section => (
            <article key={section.key}><h3>{section.title}</h3><p>{section.body}</p></article>
          ))}
        </div>
      </section>
    )}
  </>
}

/** Ranking por canal — organico.md §5.4. */
function OrganicChannels({ channels }) {
  if (!channels?.length) return null
  return <section className="organic-panel">
    <header className="organic-panel-header">
      <div><h2><span className="organic-panel-icon"><RiBarChartBoxLine /></span>Por canal</h2><p>Más tráfico no es mejor canal: lo que cuenta es quién trae compradores.</p></div>
    </header>
    <div className="organic-channel-table">
      <div className="organic-channel-head"><span>Canal</span><span>Leads</span><span>Cualificados</span><span>Ventas</span><span>Horas</span><span>Señal</span></div>
      {channels.map(channel => (
        <div className="organic-channel-row" key={channel.channel}>
          <strong>{channel.label}<small>{channel.cohortStatus === 'mature' ? 'cohorte madura' : channel.cohortStatus === 'maturing' ? 'cohorte madurando' : 'sin cohorte suficiente'}</small></strong>
          <span>{channel.leads ?? '—'}</span>
          <span>{channel.qualified ?? '—'}{channel.qualificationPct != null ? ` · ${channel.qualificationPct} %` : ''}</span>
          <span>{channel.sales ?? '—'}</span>
          {/* `null` es "sin piezas publicadas", no "cero horas": el canal
              pudo traer leads sin que se registrara esfuerzo. */}
          <span className={channel.hoursInvested == null ? 'is-missing' : ''}>
            {channel.hoursInvested == null ? 'sin registrar' : `${channel.hoursInvested} h`}
            {channel.hoursPerQualified != null && <small>{channel.hoursPerQualified} h/cualif</small>}
          </span>
          <em>{SIGNAL_LABEL[channel.deepestEligibleSignal] ?? channel.deepestEligibleSignal}</em>
        </div>
      ))}
    </div>
  </section>
}

const STREAM_LABEL = { channel_signal: 'Señal de canal', vendrava_hunt: 'Caza de Vendrava', vertical_event: 'Acontecimiento' }
const ARM_LABEL = { seo: 'SEO', social: 'Redes sociales', prospecting: 'Prospectos', landings: 'Landings', ads: 'Ads' }

/**
 * Cola priorizada de organico.md §5.5. Las tres corrientes —señales de canal,
 * caza de Vendrava y acontecimientos verticales— en la misma lista, ordenadas por
 * valor económico: impacto × confianza ÷ esfuerzo.
 *
 * El botón NO ejecuta: abre el brazo correspondiente con el contexto cargado.
 * El centro de mando decide y prioriza; ejecutar es de los brazos (§1).
 */
function OrganicRecommendations({ items, onDispatch, onDismiss, onRefresh, refreshing, busyId }) {
  const [dismissing, setDismissing] = useState('')
  const [reason, setReason] = useState('')
  // Antes el panel entero desaparecía sin recomendaciones, y con él el único
  // sitio desde el que volver a pasar el diagnóstico: la cola se quedaba
  // congelada para siempre.
  return <section className="organic-panel">
    <header className="organic-panel-header">
      <div><h2><span className="organic-panel-icon"><RiLightbulbFlashLine /></span>Qué recomienda Vendrava</h2><p>Ordenado por valor económico: impacto estimado × confianza ÷ horas de esfuerzo.</p></div>
      <button type="button" className="organic-button secondary" onClick={onRefresh} disabled={refreshing}>
        <RiRefreshLine /> {refreshing ? 'Recalculando…' : 'Recalcular'}
      </button>
    </header>
    {!items?.length ? (
      <p className="organic-empty-inline">
        No hay recomendaciones pendientes. Tras sincronizar una fuente o publicar contenido,
        pulsa «Recalcular» para volver a pasar el diagnóstico.
      </p>
    ) : null}
    <div className="organic-recs">
      {(items ?? []).map(item => (
        <article key={item.id} className={`organic-rec is-${item.severity}`}>
          <header>
            <span className="organic-rec-stream">{STREAM_LABEL[item.stream] ?? item.stream}</span>
            <span className="organic-rec-priority">prioridad {item.priorityScore}</span>
          </header>
          <strong>{item.title}</strong>
          <p>{item.explanation}</p>
          <p className="organic-rec-action"><b>Recomendación:</b> {item.recommendation}</p>
          <dl>
            <div><dt>Confianza</dt><dd>{item.confidence}</dd></div>
            <div><dt>Esfuerzo</dt><dd>{item.estimatedHours} h</dd></div>
            <div><dt>Se ejecuta en</dt><dd>{ARM_LABEL[item.dispatchArm] ?? item.dispatchArm}</dd></div>
          </dl>
          <small className="organic-rec-why">{item.confidenceReason}</small>
          {dismissing === item.id ? (
            <form className="organic-rec-dismiss" onSubmit={e => { e.preventDefault(); if (reason.trim().length >= 3) { onDismiss(item.id, reason.trim()); setDismissing(''); setReason('') } }}>
              <label htmlFor={`dismiss-${item.id}`}>¿Por qué la descartas?</label>
              <textarea id={`dismiss-${item.id}`} rows="2" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej.: ya lo cubrimos con otra pieza" />
              <div>
                <button type="button" className="organic-link" onClick={() => setDismissing('')}>Cancelar</button>
                <button type="submit" className="organic-button secondary" disabled={reason.trim().length < 3}>Confirmar</button>
              </div>
            </form>
          ) : (
            <div className="organic-rec-actions">
              <button type="button" className="organic-button primary" disabled={busyId === item.id} onClick={() => onDispatch(item.id, item.dispatchArm)}>
                Abrir en {ARM_LABEL[item.dispatchArm] ?? item.dispatchArm} <RiArrowRightLine />
              </button>
              {item.stream === 'channel_signal' && (
                <button type="button" className="organic-link" onClick={() => setDismissing(item.id)}>Descartar</button>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  </section>
}

/**
 * Ranking por pieza — organico.md §5.4. Demuestra que mas publicaciones no es
 * mejor contenido: lo que cuenta es cual trajo cualificados y a que coste en
 * tiempo. El enganche es el UTM propio de cada pieza.
 */
function OrganicPieces({ pieces }) {
  if (!pieces?.length) return null
  return <section className="organic-panel">
    <header className="organic-panel-header">
      <div><h2><span className="organic-panel-icon"><RiFileTextLine /></span>Por pieza</h2><p>Qué publicación concreta trajo leads y cuánto tiempo costó producirla.</p></div>
      <span className="organic-panel-note">Horas estimadas por formato, no cronometradas</span>
    </header>
    <div className="organic-piece-table">
      <div className="organic-piece-head"><span>Pieza</span><span>Canal</span><span>Horas</span><span>Leads</span><span>Cualificados</span><span>Coste en tiempo</span></div>
      {pieces.map(piece => (
        <div className="organic-piece-row" key={piece.pieceId}>
          <strong>{piece.format}<small>{piece.publishedAt ? new Date(piece.publishedAt).toLocaleDateString('es-ES') : 'sin fecha'}</small></strong>
          <span>{piece.channel}</span>
          <span>{piece.hoursInvested} h</span>
          <span>{piece.leads}</span>
          <span>{piece.qualified}</span>
          <em className={piece.hoursPerQualified == null ? 'is-missing' : ''}>
            {piece.hoursPerQualified == null ? 'sin cualificados' : `${piece.hoursPerQualified} h/cualif`}
          </em>
        </div>
      ))}
    </div>
  </section>
}

/**
 * A qué páginas llega el tráfico orgánico. Sale de la ingesta de GA4: antes el
 * embudo solo sabía cuántas impresiones había en búsqueda, no dónde aterrizaba
 * la gente ni cuánta de esa visita se quedaba.
 */
function OrganicPages({ pages }) {
  if (!pages?.length) return null
  return <section className="organic-panel">
    <header className="organic-panel-header">
      <div><h2><span className="organic-panel-icon"><RiGlobalLine /></span>Por página</h2><p>Dónde aterriza el tráfico orgánico, según Analytics.</p></div>
      <span className="organic-panel-note">Sesiones del período, sin tráfico de pago</span>
    </header>
    <div className="organic-piece-table">
      <div className="organic-piece-head"><span>Página</span><span>Canal</span><span>Sesiones</span><span>Con interacción</span></div>
      {pages.map(page => (
        <div className="organic-page-row" key={`${page.channel}-${page.page}`}>
          <strong>{page.page}</strong>
          <span>{page.channel}</span>
          <span>{page.sessions.toLocaleString('es-ES')}</span>
          <em>{page.engagedSessions.toLocaleString('es-ES')}</em>
        </div>
      ))}
    </div>
  </section>
}

function OrganicUpcoming() {
  // Solo lo que de verdad falta. Cuando una fila se construye, se retira: una
  // lista que sigue prometiendo lo que ya existe deja de leerse.
  const items = [
    ['Alcance de redes', 'Metricool tiene el alcance de cada publicación; Vendrava todavía no lo lee, así que redes no tiene presencia medida.', 'Pendiente'],
    ['Reprogramar un post solo', 'Está en la lista delegable de §9, pero falta la llamada de actualización de Metricool.', 'Fase 4'],
    ['Responder reseñas con plantilla', 'Las reseñas ya se leen; responderlas exige escribir en la API restringida de Google y plantillas aprobadas.', 'Fase 4'],
  ]
  return <section className="organic-panel organic-upcoming">
    <header className="organic-panel-header">
      <div><h2><span className="organic-panel-icon"><RiCompass3Line /></span>Todavía no medido</h2><p>Lo que falta para cerrar el circuito, y cuándo llega.</p></div>
    </header>
    <div className="organic-upcoming-list">
      {items.map(([title, detail, phase]) => (
        <div key={title}>
          <strong>{title}</strong>
          <span>{phase}</span>
          <p>{detail}</p>
        </div>
      ))}
    </div>
  </section>
}

function OrganicTabs({ active, counts, onChange }) {
  return <nav className="organic-tabs" aria-label="Secciones de Organic Leads">
    {ORGANIC_TABS.map(tab => (
      <button
        key={tab.id}
        type="button"
        className={active === tab.id ? 'active' : ''}
        aria-current={active === tab.id ? 'page' : undefined}
        onClick={() => onChange(tab.id)}
      >
        <tab.icon aria-hidden="true" /> {tab.label}
        {counts[tab.id] ? <b>{counts[tab.id]}</b> : null}
      </button>
    ))}
  </nav>
}

/** Las cifras medidas que no caben en las cuatro tarjetas grandes. */
function OrganicSecondary({ summary }) {
  const signal = summary?.deepestEligibleSignal
  return <section className="organic-secondary">
    {ORGANIC_SECONDARY.map(item => {
      const value = summary?.[item.group]?.[item.key]
      const missing = value === null || value === undefined
      return <div key={item.key} className={missing ? 'is-missing' : ''} title={item.hint}>
        <span>{item.label}</span>
        <strong>{missing ? 'Sin medición' : displayNumber(value)}</strong>
      </div>
    })}
    {signal ? <div className="organic-secondary-signal">
      <span>Señal más profunda con cohorte válida</span>
      <strong>{SIGNAL_LABEL[signal] ?? signal}</strong>
    </div> : null}
  </section>
}

function IntegrationCard({ integration, projectId, busy, onAction }) {
  const meta = INTEGRATION_META[integration.provider] || { label: integration.provider, description: 'Fuente externa de datos orgánicos.', icon: RiGlobalLine }
  const Icon = meta.icon
  const presentation = integrationPresentation(integration)
  const propertyLabel = integration.externalPropertyName || integration.externalPropertyId
  // Las tres fuentes ingieren de verdad, y las tres necesitan su recurso
  // elegido: sin propiedad ni ubicación no se sabe de dónde leer.
  const canSync = presentation.connected && !busy && presentation.hasProperty
  const properties = integration.properties || []
  return <article className="organic-integration-card">
    <div className="organic-integration-heading"><span className="organic-integration-icon"><Icon aria-hidden="true" /></span><div><h3>{meta.label}</h3><span className={`organic-integration-status ${presentation.tone}`}>{presentation.label}</span></div></div>
    <p>{meta.description}</p>
    <p className="organic-integration-property">{propertyLabel ? `Propiedad: ${propertyLabel}` : 'Propiedad: pendiente de selección'}</p>
    {presentation.connected && properties.length ? <label className="organic-integration-selector"> <span>Seleccionar propiedad</span><select value={integration.externalPropertyId || ''} onChange={event => onAction(integration.provider, 'configure', event.target.value)} disabled={busy}><option value="">Selecciona una propiedad</option>{properties.map(property => <option key={property.id} value={property.id}>{property.label || property.id}</option>)}</select></label> : null}
    {integration.lastError ? <p className="organic-integration-error" role="alert">{integration.lastError}</p> : null}
    {integration.lastSyncedAt ? <p className="organic-integration-sync">Última sincronización: {new Intl.DateTimeFormat(localeCode(getLocale()), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(integration.lastSyncedAt))}</p> : null}
    <div className="organic-integration-actions">
      {presentation.connected ? <>
        <button type="button" className="organic-button secondary" onClick={() => onAction(integration.provider, 'sync')} disabled={!canSync} title={!presentation.hasProperty ? 'Selecciona una propiedad antes de sincronizar.' : undefined}><RiRefreshLine /> {busy ? 'Sincronizando…' : 'Sincronizar'}</button>
        <button type="button" className="organic-button ghost" onClick={() => onAction(integration.provider, 'disconnect')} disabled={busy}><RiCloseLine /> Desconectar</button>
      </> : <button type="button" className="organic-button primary" onClick={() => onAction(integration.provider, 'connect')} disabled={busy || !projectId}><RiLinkM /> {busy ? 'Iniciando…' : 'Iniciar OAuth'}</button>}
    </div>
  </article>
}

function OrganicIntegrationsPanel({ state, projectId, onAction, onRefresh }) {
  const items = state.integrations || []
  const status = state.status === 'error' ? 'error' : state.status === 'unavailable' ? 'disconnected' : state.status === 'setup' ? 'empty' : state.status === 'loading' ? 'loading' : 'live'
  const statusMessage = state.status === 'error' || state.status === 'unavailable' ? state.error : state.status === 'setup' ? 'Crea primero un proyecto Organic Leads para autorizar y seleccionar propiedades.' : undefined
  return <section id="organic-integrations" className="organic-panel organic-integrations-panel" aria-labelledby="organic-integrations-title">
    <DataStatusBanner status={status} message={statusMessage} onRetry={status === 'error' || status === 'disconnected' ? onRefresh : undefined} />
    <header className="organic-panel-header"><div><h2 id="organic-integrations-title"><span className="organic-panel-icon"><RiLinkM /></span>Integraciones de datos</h2><p>Conecta fuentes verificables para habilitar señales reales de búsqueda, analítica y presencia local.</p></div><button type="button" className="organic-icon-button" onClick={onRefresh} disabled={state.status === 'loading'} aria-label="Actualizar estados de integraciones"><RiRefreshLine /></button></header>
    {state.status === 'loading' ? <div className="organic-integration-message"><div className="organic-spinner" />Consultando estados de conexión…</div> : null}
    {state.status === 'unavailable' ? <p className="organic-integration-message" role="status">{state.error} Las tarjetas quedan en estado no conectado hasta que el backend exponga el contrato OAuth.</p> : null}
    {state.status === 'setup' ? <p className="organic-integration-message" role="status">Crea primero un proyecto Organic Leads para poder autorizar y seleccionar propiedades.</p> : null}
    {state.status === 'ready' ? <div className="organic-integration-grid">{items.map(integration => <IntegrationCard key={integration.provider} integration={integration} projectId={projectId} busy={state.busyProvider === integration.provider} onAction={onAction} />)}</div> : null}
    {state.message ? <p className="organic-integration-message organic-integration-message--notice" role="status">{state.message}</p> : null}
  </section>
}

function SetupState({ kind, onConfigure, onRetry, error }) {
  const isError = kind === 'error'
  return <section className="organic-state" aria-live="polite"><div className="organic-state-box"><span className="organic-state-icon">{isError ? <RiRefreshLine /> : <RiCompass3Line />}</span><h2>{isError ? 'No pudimos cargar Organic Leads' : 'Conecta tu negocio para empezar'}</h2><p>{isError ? error : 'Organic Leads necesita una web o un proyecto conectado para descubrir oportunidades reales. Configúralo y volveremos con datos de búsquedas, leads y valor comercial.'}</p><button type="button" className="organic-button primary" onClick={isError ? onRetry : onConfigure}>{isError ? <><RiRefreshLine /> Reintentar</> : <><RiLinkM /> Configurar Organic Leads</>}</button></div></section>
}



function ActionPanel({ actions, onAction }) {
  const items = actions.slice(0, 5)
  return <section className="organic-panel organic-action-panel"><header className="organic-panel-header"><div><h2><span className="organic-panel-icon"><RiSparkling2Line /></span>Qué hará Vendrava por ti</h2><p>Acciones ordenadas para mover la demanda hacia ventas.</p></div></header>{items.length ? items.map((action, index) => { const Icon = ACTION_ICONS[index] || RiLightbulbFlashLine; return <div className="organic-action-row" key={action.id || `${action.title}-${index}`}><span className="organic-action-index">{index + 1}</span><div className="organic-action-copy"><strong>{action.title || action.name || 'Siguiente acción'}</strong><p>{action.description || action.detail || 'Una recomendación conectada con tu oportunidad comercial.'}</p><span className={`organic-impact ${action.impact === 'medium' ? 'medium' : ''}`}>{action.impactLabel || (action.impact === 'medium' ? 'Impacto medio' : 'Impacto alto')}</span></div><button type="button" className="organic-button primary" onClick={() => onAction(action, 'draft')}><Icon aria-hidden="true" /> <span>{action.cta || 'Preparar'}</span></button></div> }) : <div className="organic-state"><p>Cuando haya una oportunidad, Vendrava te propondrá qué crear o mejorar primero.</p></div>}</section>
}



function AssetsPanel({ data, onAction }) {
  return <section id="organic-content" className="organic-panel organic-small-panel"><header className="organic-panel-header"><div><h2><span className="organic-panel-icon"><RiFileTextLine /></span>Activos que generan clientes</h2><p>Piezas comerciales conectadas al CRM.</p></div></header><div className="organic-asset-list">{data.assets.length ? data.assets.slice(0, 4).map((asset, index) => <div className="organic-asset-item" key={asset.id || index}><span className="organic-asset-icon"><RiFileTextLine /></span><div><strong>{asset.name || asset.title || 'Activo comercial'}</strong><p>{asset.description || asset.type || 'Borrador conectado a una oportunidad.'}</p></div><button type="button" className="organic-button secondary" onClick={() => onAction(asset, 'draft')}>{asset.cta || 'Crear'}</button></div>) : <p className="organic-muted-copy">Cuando descubras una oportunidad, aquí aparecerán páginas, guías y landings capaces de convertirla.</p>}</div></section>
}



function OrganicModal({ type, target, action = 'draft', onClose, onSubmit, submitting, message }) {
  const isSetup = type === 'setup'
  const isProject = action === 'project'
  const isConnect = action === 'connect'
  const isDraft = type === 'draft' || type === 'opportunity'
  const title = isConnect ? 'Editar proyecto' : isProject ? 'Configura Organic Leads' : isDraft ? 'Preparar activo comercial' : 'Explorar Organic Leads'
  // Al editar se parte de lo que ya hay guardado: el formulario salía en blanco
  // y, como el PATCH solo envía los campos rellenados, parecía que borraba.
  const [form, setForm] = useState({
    name: isConnect || isProject ? (target?.name || '') : (target?.query || target?.title || ''),
    website: (isConnect || isProject) ? (target?.website || '') : '',
    location: (isConnect || isProject) ? (target?.locations?.[0] || target?.location || '') : '',
    notes: target?.description || '',
  })
  function update(field, value) { setForm(current => ({ ...current, [field]: value })) }
  function submit(event) { event.preventDefault(); onSubmit(form) }
  return <div className="organic-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}><form className="organic-modal" role="dialog" aria-modal="true" aria-labelledby="organic-modal-title" onSubmit={submit}><header className="organic-modal-header"><div><h2 id="organic-modal-title">{title}</h2><p>{isSetup ? 'El nombre, la web y la zona con los que Vendrava interpreta tus datos orgánicos.' : 'La acción se guardará como borrador para que puedas revisarla antes de publicarla.'}</p></div><button type="button" className="organic-icon-button" onClick={onClose} aria-label="Cerrar" disabled={submitting}><RiCloseLine /></button></header><div className="organic-modal-body">{isDraft ? <label className="organic-field">Oportunidad o activo<input value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Página de servicio para una zona" required /></label> : <><label className="organic-field">Nombre del proyecto<input value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Clínica Dental Valencia" required /></label><label className="organic-field">Web del negocio<input type="url" value={form.website} onChange={event => update('website', event.target.value)} placeholder="https://tuweb.com" required /></label><label className="organic-field">Ciudad o zona<input value={form.location} onChange={event => update('location', event.target.value)} placeholder="Ej. Valencia y Campanar" /></label></>}<label className="organic-field">Contexto para Vendrava<textarea value={form.notes} onChange={event => update('notes', event.target.value)} placeholder="Servicios, oferta, conversión principal o cualquier contexto comercial." /></label></div>{message ? <p className="organic-modal-message" role="status">{message}</p> : null}<footer className="organic-modal-footer"><button type="button" className="organic-button secondary" onClick={onClose} disabled={submitting}>Cerrar</button><button type="submit" className="organic-button primary" disabled={submitting}>{submitting ? 'Guardando…' : isConnect ? 'Guardar proyecto' : isProject ? 'Crear proyecto' : 'Crear borrador'}</button></footer></form></div>
}

export default function OrganicLeadsPage() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  const [tab, setTab] = useState('resumen')
  const [recommendations, setRecommendations] = useState([])
  const [refreshingRecs, setRefreshingRecs] = useState(false)
  const [autonomy, setAutonomy] = useState(null)
  const [autonomyBusy, setAutonomyBusy] = useState(false)
  const [autonomyMessage, setAutonomyMessage] = useState('')
  const [dispatching, setDispatching] = useState('')
  const [projectId, setProjectId] = useState('')
  const [view, setView] = useState({ status: 'loading', data: null, error: '' })
  const [integrationState, setIntegrationState] = useState({ status: 'loading', integrations: [], error: '', message: '', busyProvider: '' })
  const [modal, setModal] = useState(null)
  const [modalMessage, setModalMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadAutonomy() {
    // La sala no puede tumbar la página: si falla, se queda sin panel y el
    // resto del centro de mando sigue en pie.
    const state = await fetchOrganicAutonomy().catch(() => null)
    setAutonomy(state)
  }

  async function loadOverview() {
    setView(current => ({ ...current, status: 'loading', error: '' }))
    try {
      fetchOrganicRecommendations().then(setRecommendations).catch(() => setRecommendations([]))
      loadAutonomy()
      const result = await fetchOrganicOverview({ projectId, period })
      const status = result.status === 'ready' && !hasOrganicSignals(result.data) ? 'empty' : result.status
      setView({ status, data: result.data, error: '', gate: result.gate || null })
    } catch (error) {
      setView({ status: 'error', data: null, gate: null, error: DEMO_MODE
        ? 'El modo demo está habilitado, pero Organic Leads no usa datos simulados: conecta las fuentes reales para continuar.'
        : error.message || 'Error inesperado.' })
    }
  }

  async function loadIntegrations() {
    setIntegrationState(current => ({ ...current, status: 'loading', error: '', message: '' }))
    try {
      const result = await fetchOrganicIntegrations()
      setIntegrationState(current => ({ ...current, ...result, error: result.error || '', message: '' }))
    } catch (error) {
      setIntegrationState(current => ({ ...current, status: 'error', error: error.message || 'No pudimos cargar los estados de integración.', message: '' }))
    }
  }

  useEffect(() => { loadOverview() }, [projectId, period])
  useEffect(() => { loadIntegrations() }, [projectId])

  function openModal(type, target = null, action = 'draft') { setModal({ type, target, action }); setModalMessage('') }

  function handleAction(target, type) {
    if (type === 'draft' || type === 'opportunity') openModal(type, target)
  }

  async function handleIntegrationAction(provider, action, value) {
    setIntegrationState(current => ({ ...current, busyProvider: provider, message: '' }))
    try {
      if (action === 'connect') {
        const result = await startOrganicOAuth(provider)
        const authorizationUrl = result?.authorizationUrl || result?.url || result?.redirectUrl
        if (authorizationUrl) {
          window.location.assign(authorizationUrl)
          return
        }
        setIntegrationState(current => ({ ...current, message: 'El backend aceptó el inicio OAuth, pero no devolvió una URL de autorización.' }))
      } else if (action === 'disconnect') {
        await disconnectOrganicIntegration(provider)
        await loadIntegrations()
      } else if (action === 'configure') {
        if (!value) return
        await configureOrganicIntegration(provider, value)
        await loadIntegrations()
      } else if (action === 'sync') {
        await syncOrganicIntegration(provider)
        await Promise.all([loadIntegrations(), loadOverview()])
      }
    } catch (error) {
      setIntegrationState(current => ({ ...current, message: error.message || 'No pudimos completar la operación de integración.' }))
    } finally {
      setIntegrationState(current => ({ ...current, busyProvider: '' }))
    }
  }

  async function submitModal(form) {
    setSubmitting(true); setModalMessage('')
    try {
      if (modal?.action === 'project') await createOrganicProject(form)
      else if (modal?.action === 'connect') await connectOrganicWeb(form)
      else await createOrganicDraft({ ...form, projectId: data?.project?.id, opportunityId: modal?.target?.id || null, type: modal?.target?.type || 'service_page' })
      await loadOverview()
      setModal(null)
    } catch (error) {
      setModalMessage(error.message || 'No pudimos preparar la acción.')
    } finally { setSubmitting(false) }
  }

  const data = view.data
  const projects = useMemo(() => data?.project ? [data.project] : [], [data])

  if (view.status === 'loading') return <main className="organic-page"><div className="organic-shell"><div className="organic-state"><div><div className="organic-spinner" /><p>{locale === 'en' ? 'Preparing your opportunity map…' : 'Preparando tu mapa de oportunidades…'}</p></div></div></div></main>
  // El error va PRIMERO. Iba detrás de `!data`, y como el estado de error deja
  // `data` en null, cualquier fallo del backend caía en la rama del onboarding:
  // un 500 se presentaba como «completa la configuración», el asistente salía
  // ya terminado y su botón recargaba para volver a fallar. Callejón sin salida
  // que además escondía el error real.
  if (view.status === 'error') return <main className="organic-page"><div className="organic-shell"><SetupState kind="error" error={view.error} onRetry={loadOverview} onConfigure={() => openModal('setup', null, 'project')} /></div>{modal ? <OrganicModal {...modal} onClose={() => setModal(null)} onSubmit={submitModal} submitting={submitting} message={modalMessage} /> : null}</main>
  if (view.status === 'setup' || !data) return <main className="organic-page"><div className="organic-shell">{view.gate ? <DataStatusBanner status="plan" message={planGateMessage(view.gate, locale)} /> : null}<OrganicOnboarding onComplete={loadOverview} /></div>{modal ? <OrganicModal {...modal} onClose={() => setModal(null)} onSubmit={submitModal} submitting={submitting} message={modalMessage} /> : null}</main>

  // Despachar no ejecuta: navega al brazo con el contexto en la query.
  async function dispatchRecommendation(id) {
    setDispatching(id)
    try {
      const body = await dispatchOrganicRecommendation(id)
      navigate(body.url)
    } catch {
      setDispatching('')
    }
  }

  async function dismissRecommendation(id, reason) {
    await dismissOrganicRecommendation(id, reason).catch(() => {})
    setRecommendations(current => current.filter(item => item.id !== id))
  }

  /** Vuelve a pasar el diagnóstico y recarga la cola con lo que salga. */
  async function refreshRecommendations() {
    setRefreshingRecs(true)
    try {
      await refreshOrganicRecommendations()
      setRecommendations(await fetchOrganicRecommendations())
    } catch {
      // El endpoint ya explica el motivo en su respuesta; la cola se queda como
      // estaba en vez de vaciarse por un fallo de red.
    } finally {
      setRefreshingRecs(false)
    }
  }

  /**
   * Toda acción de gobierno recarga el estado: el nivel efectivo depende de la
   * calidad de los datos y del freno compartido, así que el valor que se acaba
   * de enviar no es necesariamente el que quedó guardado.
   */
  async function withAutonomy(operation) {
    setAutonomyBusy(true)
    setAutonomyMessage('')
    try {
      await operation()
    } catch (error) {
      setAutonomyMessage(error.message || 'No pudimos completar la operación de autonomía.')
    } finally {
      await loadAutonomy()
      setAutonomyBusy(false)
    }
  }

  const tabCounts = {
    canales: data.channels?.length || null,
    acciones: (recommendations?.length || 0) + (data.actions?.length || 0) || null,
    fuentes: integrationState.integrations?.filter(item => integrationPresentation(item).connected).length || null,
    autonomia: autonomy?.decisions?.filter(item => ['advisory', 'pending_approval', 'shadow'].includes(item.status)).length || null,
  }

  return <main className="organic-page">
    <div className="organic-shell">
      <header className="organic-topbar">
        <div className="organic-heading">
          <span className="organic-brand-icon"><RiLeafLine aria-hidden="true" /></span>
          <div>
            <h1>Organic Leads</h1>
            <p>El centro de mando de todo lo que trae clientes sin pagar por el clic: búsqueda, redes, ficha de Google y prospección, medido hasta la venta.</p>
          </div>
        </div>
        <div className="organic-header-actions">
          <div className="organic-selects">
            {projects.length ? <label><span className="organic-screen-reader">Proyecto</span><select className="organic-control" value={projectId || projects[0]?.id || ''} onChange={event => setProjectId(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.name || project.location || 'Proyecto orgánico'}</option>)}</select></label> : null}
            <label><span className="organic-screen-reader">Periodo</span><select className="organic-control" value={period} onChange={event => setPeriod(event.target.value)}>{PERIODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
          <button type="button" className="organic-button secondary" onClick={() => openModal('setup', data.project, 'connect')}><RiLinkM /> Editar proyecto</button>
          <button type="button" className="organic-button primary" onClick={() => openModal('draft')}><RiAddLine /> Crear campaña orgánica</button>
        </div>
      </header>

      {view.status === 'empty' ? <DataStatusBanner status="empty" message="Aún no hay señales orgánicas en este periodo. Conecta las integraciones y sincroniza para ver datos reales." /> : null}

      {/* La banda de integridad manda sobre todo lo demás: los números de abajo
          valen lo que valgan sus fuentes, así que va fuera de las pestañas. */}
      <OrganicDataIntegrity dataQuality={data.dataQuality} onConnect={() => openModal('setup', data.project, 'connect')} />

      <OrganicTabs active={tab} counts={tabCounts} onChange={setTab} />

      {tab === 'resumen' ? <>
        <section className="organic-kpi-grid">{ORGANIC_KPIS.map(item => <KpiCard key={item.key} item={item} value={data.summary?.[item.group]?.[item.key]} />)}</section>
        <OrganicSecondary summary={data.summary} />
        <OrganicFunnel funnel={data.funnel} narrative={data.weeklyNarrative} />
      </> : null}

      {tab === 'canales' ? <>
        <OrganicChannels channels={data.channels} />
        <OrganicPieces pieces={data.pieces} />
        <OrganicPages pages={data.pages} />
      </> : null}

      {tab === 'acciones' ? <>
        <OrganicRecommendations
          items={recommendations}
          onDispatch={dispatchRecommendation}
          onDismiss={dismissRecommendation}
          onRefresh={refreshRecommendations}
          refreshing={refreshingRecs}
          busyId={dispatching}
        />
        <div className="organic-main-grid">
          <ActionPanel actions={data.actions} onAction={handleAction} />
          <AssetsPanel data={data} onAction={handleAction} />
        </div>
      </> : null}

      {tab === 'fuentes' ? <>
        <OrganicIntegrationsPanel state={integrationState} projectId={data.project?.id || projectId} onAction={handleIntegrationAction} onRefresh={loadIntegrations} />
        <OrganicUpcoming />
      </> : null}

      {tab === 'autonomia' ? (autonomy ? <>
        <OrganicAutonomy
          state={autonomy}
          busy={autonomyBusy}
          onChangeLevel={level => withAutonomy(() => updateOrganicAutonomy({ level }))}
          onToggleShadow={shadowMode => withAutonomy(() => updateOrganicAutonomy({ shadowMode }))}
          onRun={() => withAutonomy(runOrganicAutonomyPass)}
          onApprove={id => withAutonomy(() => approveOrganicAutonomyDecision(id))}
          onReject={(id, reason) => withAutonomy(() => rejectOrganicAutonomyDecision(id, reason))}
          onPromote={kind => withAutonomy(() => promoteOrganicAutonomyKind(kind))}
          onDemote={kind => withAutonomy(() => demoteOrganicAutonomyKind(kind, 'Permiso retirado desde el centro de mando'))}
        />
        {autonomyMessage ? <p className="organic-autonomy-message" role="alert">{autonomyMessage}</p> : null}
      </> : <section className="organic-panel"><div className="organic-panel-header"><div><h2>Sala de autonomía</h2><p>No pudimos leer el estado de gobierno. El resto del centro de mando sigue en pie.</p></div></div></section>) : null}
    </div>
    {modal ? <OrganicModal {...modal} onClose={() => setModal(null)} onSubmit={submitModal} submitting={submitting} message={modalMessage} /> : null}
  </main>
}
