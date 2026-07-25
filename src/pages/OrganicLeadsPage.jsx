import { useEffect, useMemo, useState } from 'react'
import {
  RiAddLine,
  RiArrowRightLine,
  RiCloseLine,
  RiCompass3Line,
  RiComputerLine,
  RiEarthLine,
  RiFileTextLine,
  RiFocus3Line,
  RiGlobalLine,
  RiLeafLine,
  RiLightbulbFlashLine,
  RiLinkM,
  RiMapPin2Line,
  RiRefreshLine,
  RiSearchEyeLine,
  RiSparkling2Line,
  RiTeamLine,
  RiUserSearchLine,
} from 'react-icons/ri'
import {
  connectOrganicWeb,
  configureOrganicIntegration,
  createOrganicDraft,
  createOrganicProject,
  disconnectOrganicIntegration,
  fetchOrganicIntegrations,
  fetchOrganicOverview,
  startOrganicOAuth,
  syncOrganicIntegration,
} from '../lib/organic/organicApi'
import { DEMO_MODE } from '../lib/dataMode'
import { getLocale, localeCode, useI18n } from '../i18n'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import './organic-leads.css'

const PERIODS = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: '12m', label: 'Últimos 12 meses' },
]

const EMPTY_KPI = [
  { key: 'potentialCustomers', label: 'Clientes potenciales encontrados', description: 'Personas estimadas que buscan servicios como los tuyos en tu zona.', icon: RiTeamLine },
  { key: 'organicLeads', label: 'Leads orgánicos', description: 'Contactos, llamadas, formularios o WhatsApps originados desde búsquedas.', icon: RiUserSearchLine },
  { key: 'estimatedValue', label: 'Valor estimado', description: 'Valor comercial potencial de los leads orgánicos.', icon: RiFocus3Line },
  { key: 'missedOpportunities', label: 'Oportunidades sin aprovechar', description: 'Búsquedas donde podrías captar clientes pero falta un camino de conversión.', icon: RiFocus3Line },
]

const ACTION_ICONS = [RiFileTextLine, RiMapPin2Line, RiLeafLine, RiLinkM, RiSparkling2Line]

const ORGANIC_NAV_ITEMS = [
  ['organic-summary', 'Resumen'],
  ['organic-opportunities', 'Oportunidades'],
  ['organic-local', 'Visibilidad local'],
  ['organic-ai', 'Visibilidad IA'],
  ['organic-content', 'Contenido'],
  ['organic-competitors', 'Competidores'],
  ['organic-leads', 'Leads orgánicos'],
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

function displayCurrency(value, currency = 'EUR') {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value !== 'number') return String(value)
  return new Intl.NumberFormat(localeCode(getLocale()), { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

function initials(value) {
  return String(value || 'Lead').split(/\s+/).map(item => item[0]).join('').slice(0, 2).toUpperCase()
}

function hasOrganicSignals(data) {
  if (!data) return false
  const kpis = data.kpis || {}
  return Object.values(kpis).some(value => Number(value) > 0)
    || Boolean(data.opportunity?.score || data.opportunity?.summary)
    || [data.demand?.points, data.demand?.opportunities, data.actions, data.local?.areas, data.ai?.items, data.assets, data.leads, data.competitorGap?.items]
      .some(items => Array.isArray(items) && items.length > 0)
}

function Sparkline({ tone = 'purple' }) {
  const stroke = tone === 'green' ? '#29a85b' : tone === 'amber' ? '#f0a51a' : tone === 'red' ? '#ef5c74' : '#7b50df'
  return <svg className="organic-sparkline" viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 31 C18 29 21 30 33 24 S59 26 71 20 S97 24 110 16 S134 22 147 12 S176 18 191 9 S221 15 240 8" fill="none" stroke={stroke} strokeWidth="1.5" /><path d="M0 31 C18 29 21 30 33 24 S59 26 71 20 S97 24 110 16 S134 22 147 12 S176 18 191 9 S221 15 240 8 L240 40 L0 40Z" fill={stroke} opacity=".08" /></svg>
}

function KpiCard({ item, value, currency, index }) {
  const Icon = item.icon
  const renderedValue = item.key === 'estimatedValue' ? displayCurrency(value, currency) : displayNumber(value)
  return <article className="organic-kpi"><div className="organic-kpi-head"><span className="organic-kpi-icon"><Icon aria-hidden="true" /></span><span>{item.label}</span></div><strong className="organic-kpi-value">{renderedValue}</strong><p className="organic-kpi-copy">{item.description}</p><Sparkline tone={['purple', 'green', 'amber', 'red'][index]} /></article>
}

function OrganicInternalNav() {
  return <nav className="organic-internal-nav" aria-label="Navegación interna de Organic Leads">
    {ORGANIC_NAV_ITEMS.map(([id, label]) => <a key={id} href={`#${id}`} className="organic-internal-link">{label}</a>)}
  </nav>
}

function IntegrationCard({ integration, projectId, busy, onAction }) {
  const meta = INTEGRATION_META[integration.provider] || { label: integration.provider, description: 'Fuente externa de datos orgánicos.', icon: RiGlobalLine }
  const Icon = meta.icon
  const presentation = integrationPresentation(integration)
  const propertyLabel = integration.externalPropertyName || integration.externalPropertyId
  const canSync = presentation.connected && !busy && (integration.provider !== 'search_console' || presentation.hasProperty)
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
        <button type="button" className="organic-button secondary" onClick={() => onAction(integration.provider, 'sync')} disabled={!canSync} title={!presentation.hasProperty ? 'Selecciona una propiedad antes de sincronizar.' : undefined}><RiRefreshLine /> {busy ? 'Actualizando…' : integration.provider === 'search_console' ? 'Sincronizar' : 'Actualizar recursos'}</button>
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
    <header className="organic-panel-header"><div><h2 id="organic-integrations-title">Integraciones de datos</h2><p>Conecta fuentes verificables para habilitar señales reales de búsqueda, analítica y presencia local.</p></div><button type="button" className="organic-icon-button" onClick={onRefresh} disabled={state.status === 'loading'} aria-label="Actualizar estados de integraciones"><RiRefreshLine /></button></header>
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

function MapSurface({ points }) {
  return <div className="organic-map" aria-label="Superficie de demanda por zona" role="img">
    <span className="organic-map-city">{points?.[0]?.city || 'Tu zona'}</span>
    {points?.length ? points.slice(0, 7).map((point, index) => <span key={`${point.label || point.query || 'point'}-${index}`} className={`organic-map-dot ${point.tone === 'hot' ? 'is-hot' : point.tone === 'warm' ? 'is-warm' : ''}`} style={{ left: `${point.x ?? 25 + index * 11}%`, top: `${point.y ?? 26 + (index % 3) * 21}%` }} title={point.label || point.query || 'Oportunidad'} />) : <div className="organic-map-empty"><span>Cuando conectes tu proyecto, aquí verás dónde existe demanda comercial cerca de tu negocio.</span></div>}
    {points?.slice(0, 5).map((point, index) => point.label || point.query ? <span key={`label-${index}`} className="organic-map-label" style={{ left: `${point.labelX ?? 8 + (index % 3) * 30}%`, top: `${point.labelY ?? 8 + (index % 2) * 42}%` }}>{point.label || point.query}</span> : null)}
  </div>
}

function OpportunitiesPanel({ data, onAction }) {
  const rows = data.demand.opportunities
  const best = data.demand.best || rows[0]
  return <section id="organic-opportunities" className="organic-panel"><header className="organic-panel-header"><div><h2>Dónde están tus próximos clientes</h2><p>Demanda comercial encontrada alrededor de tu negocio.</p></div><button type="button" className="organic-link" onClick={() => onAction(best, 'opportunity')}>Ver análisis completo <RiArrowRightLine /></button></header><div className="organic-demand-layout"><MapSurface points={data.demand.points} /><div className="organic-opportunity-table"><div className="organic-table-head"><span>Búsqueda</span><span>Demanda</span><span>Competencia</span><span>Valor por lead</span><span>Acción</span></div>{rows.length ? rows.slice(0, 5).map((row, index) => <div className="organic-table-row" key={row.id || `${row.query || row.label}-${index}`}><strong>{row.query || row.label || 'Oportunidad sin nombre'}</strong><span className={`organic-pill ${row.demandTone || String(row.demand || '').toLowerCase()}`}>{row.demand || '—'}</span><span className="organic-intent">{row.competition || '—'}</span><span>{displayCurrency(row.valuePerLead ?? row.estimatedValue, data.project?.currency || 'EUR')}</span><button type="button" className={`organic-table-action ${index === 1 ? 'primary' : ''}`} onClick={() => onAction(row, 'opportunity')}>{row.actionLabel || 'Ver oportunidad'}</button></div>) : <div className="organic-state"><p>Aquí aparecerán las búsquedas que pueden convertirse en clientes.</p></div>} {best ? <div className="organic-opportunity-best"><p><strong>Mejor oportunidad:</strong> {best.query || best.label || 'Pendiente de análisis'}{best.description ? ` · ${best.description}` : ''}</p><button type="button" className="organic-button primary" onClick={() => onAction(best, 'opportunity')}>Aprovechar oportunidad</button></div> : null}</div></div></section>
}

function ActionPanel({ actions, onAction }) {
  const items = actions.slice(0, 5)
  return <section className="organic-panel organic-action-panel"><header className="organic-panel-header"><div><h2>Qué hará Vendrava por ti</h2><p>Acciones ordenadas para mover la demanda hacia ventas.</p></div></header>{items.length ? items.map((action, index) => { const Icon = ACTION_ICONS[index] || RiLightbulbFlashLine; return <div className="organic-action-row" key={action.id || `${action.title}-${index}`}><span className="organic-action-index">{index + 1}</span><div className="organic-action-copy"><strong>{action.title || action.name || 'Siguiente acción'}</strong><p>{action.description || action.detail || 'Una recomendación conectada con tu oportunidad comercial.'}</p><span className={`organic-impact ${action.impact === 'medium' ? 'medium' : ''}`}>{action.impactLabel || (action.impact === 'medium' ? 'Impacto medio' : 'Impacto alto')}</span></div><button type="button" className="organic-button primary" onClick={() => onAction(action, 'draft')}><Icon aria-hidden="true" /> <span>{action.cta || 'Preparar'}</span></button></div> }) : <div className="organic-state"><p>Cuando haya una oportunidad, Vendrava te propondrá qué crear o mejorar primero.</p></div>}<div className="organic-panel-footer"><button type="button" className="organic-link" onClick={() => onAction(null, 'all-actions')}>Ver todas las acciones <RiArrowRightLine /></button></div></section>
}

function LocalPanel({ data, onAction }) {
  return <section id="organic-local" className="organic-panel organic-small-panel"><header className="organic-panel-header"><div><h2>Presencia local</h2><p>Qué tan visible eres en las zonas que importan.</p></div><RiMapPin2Line aria-hidden="true" /></header><div className="organic-map-mini" aria-hidden="true" /><div className="organic-local-copy"><p className="organic-local-query">{data.local.query || 'Consulta local pendiente'}</p>{data.local.areas.length ? data.local.areas.slice(0, 4).map((area, index) => <div className="organic-local-row" key={area.name || area.label || index}><span>{area.name || area.label || 'Zona'}</span><strong>{area.position ?? area.rank ?? '—'}</strong></div>) : <p className="organic-muted-copy">Conecta tu presencia local para ver posiciones por zona y recomendaciones accionables.</p>}<button type="button" className="organic-button secondary" onClick={() => onAction(null, 'local')}>Ver informe local completo <RiArrowRightLine /></button></div></section>
}

function AiPanel({ data, onAction }) {
  return <section id="organic-ai" className="organic-panel organic-small-panel"><header className="organic-panel-header"><div><h2>Visibilidad en IA</h2><p>Si los asistentes recomiendan tu negocio.</p></div><span className="organic-pill">Nuevo</span></header><div className="organic-ai-list">{data.ai.items.length ? data.ai.items.slice(0, 3).map((item, index) => <div className="organic-ai-item" key={item.id || index}><span className={`organic-status ${item.statusTone || (item.appears === 'partial' ? 'partial' : item.appears ? 'present' : 'missing')}`}>{item.statusLabel || (item.appears === 'partial' ? 'Parcialmente' : item.appears ? 'Aparece' : 'No aparece')}</span><strong>{item.query || item.prompt || 'Consulta sin título'}</strong><p>{item.reason || item.description || 'Sin explicación disponible todavía.'}</p></div>) : <p className="organic-muted-copy">Conecta tu web para comprobar si las respuestas de IA entienden qué vendes y dónde lo haces.</p>}</div><div className="organic-panel-footer"><button type="button" className="organic-button secondary" onClick={() => onAction(null, 'ai')}>Mejorar visibilidad en IA</button></div></section>
}

function AssetsPanel({ data, onAction }) {
  return <section id="organic-content" className="organic-panel organic-small-panel"><header className="organic-panel-header"><div><h2>Activos que generan clientes</h2><p>Piezas comerciales conectadas al CRM.</p></div></header><div className="organic-asset-list">{data.assets.length ? data.assets.slice(0, 4).map((asset, index) => <div className="organic-asset-item" key={asset.id || index}><span className="organic-asset-icon"><RiFileTextLine /></span><div><strong>{asset.name || asset.title || 'Activo comercial'}</strong><p>{asset.description || asset.type || 'Borrador conectado a una oportunidad.'}</p></div><button type="button" className="organic-button secondary" onClick={() => onAction(asset, 'draft')}>{asset.cta || 'Crear'}</button></div>) : <p className="organic-muted-copy">Cuando descubras una oportunidad, aquí aparecerán páginas, guías y landings capaces de convertirla.</p>}</div><div className="organic-panel-footer"><button type="button" className="organic-link" onClick={() => onAction(null, 'assets')}>Ver todos los activos <RiArrowRightLine /></button></div></section>
}

function LeadsPanel({ data, onAction }) {
  return <section id="organic-leads" className="organic-panel organic-small-panel"><header className="organic-panel-header"><div><h2>Leads orgánicos</h2><p>Contactos atribuidos a búsquedas.</p></div><RiUserSearchLine aria-hidden="true" /></header><div className="organic-lead-list">{data.leads.length ? data.leads.slice(0, 3).map((lead, index) => <div className="organic-lead-row" key={lead.id || index}><span className="organic-lead-avatar">{initials(lead.name)}</span><div className="organic-lead-copy"><strong>{lead.name || 'Lead orgánico'}</strong><span>{lead.query || lead.search || 'Origen orgánico'}</span><small>{lead.statusLabel || lead.status || 'Sin estado'}</small></div><span className="organic-lead-value">{displayCurrency(lead.value ?? lead.estimatedValue, data.project?.currency || 'EUR')}</span></div>) : <p className="organic-muted-copy">Los contactos que lleguen desde Google o asistentes de IA aparecerán aquí junto a su valor comercial.</p>}</div><div className="organic-panel-footer"><button type="button" className="organic-link" onClick={() => onAction(null, 'leads')}>Ver todos los leads <RiArrowRightLine /></button></div></section>
}

function CompetitorGap({ data, onAction }) {
  const items = data.competitorGap.items.slice(0, 3)
  return <section id="organic-competitors" className="organic-gap"><div><h2>Competitor Gap</h2><p>{data.competitorGap.summary || 'Detecta la demanda que otros negocios están captando y encuentra cómo superarla.'}</p></div>{items.length ? items.map((item, index) => <div className="organic-gap-row" key={item.id || index}><span className="organic-gap-icon"><RiSearchEyeLine /></span><div><strong>{item.title || item.name || 'Oportunidad competitiva'}</strong><span>{item.description || item.detail || 'Sin detalle disponible todavía.'}</span></div></div>) : <div className="organic-gap-row"><span className="organic-gap-icon"><RiSearchEyeLine /></span><div><strong>Conecta tu proyecto para comparar</strong><span>Veremos qué servicios, zonas y mensajes están generando demanda en tu mercado.</span></div></div>}<button type="button" className="organic-button primary" onClick={() => onAction(null, 'competitors')}>Ver oportunidades <RiArrowRightLine /></button></section>
}

function OrganicModal({ type, target, action = 'draft', onClose, onSubmit, submitting, message }) {
  const isSetup = type === 'setup'
  const isProject = action === 'project'
  const isConnect = action === 'connect'
  const isDraft = type === 'draft' || type === 'opportunity'
  const title = isConnect ? 'Conecta tu web' : isProject ? 'Configura Organic Leads' : isDraft ? 'Preparar activo comercial' : 'Explorar Organic Leads'
  const [form, setForm] = useState({ name: target?.query || target?.title || '', website: '', location: '', notes: target?.description || '' })
  function update(field, value) { setForm(current => ({ ...current, [field]: value })) }
  function submit(event) { event.preventDefault(); onSubmit(form) }
  return <div className="organic-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}><form className="organic-modal" role="dialog" aria-modal="true" aria-labelledby="organic-modal-title" onSubmit={submit}><header className="organic-modal-header"><div><h2 id="organic-modal-title">{title}</h2><p>{isSetup ? 'Dinos qué vendes y dónde para que el análisis tenga contexto real.' : 'La acción se guardará como borrador para que puedas revisarla antes de publicarla.'}</p></div><button type="button" className="organic-icon-button" onClick={onClose} aria-label="Cerrar" disabled={submitting}><RiCloseLine /></button></header><div className="organic-modal-body">{isDraft ? <label className="organic-field">Oportunidad o activo<input value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Página de servicio para una zona" required /></label> : <><label className="organic-field">Nombre del proyecto<input value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Clínica Dental Valencia" required /></label><label className="organic-field">Web del negocio<input type="url" value={form.website} onChange={event => update('website', event.target.value)} placeholder="https://tuweb.com" required /></label><label className="organic-field">Ciudad o zona<input value={form.location} onChange={event => update('location', event.target.value)} placeholder="Ej. Valencia y Campanar" /></label></>}<label className="organic-field">Contexto para Vendrava<textarea value={form.notes} onChange={event => update('notes', event.target.value)} placeholder="Servicios, oferta, conversión principal o cualquier contexto comercial." /></label></div>{message ? <p className="organic-modal-message" role="status">{message}</p> : null}<footer className="organic-modal-footer"><button type="button" className="organic-button secondary" onClick={onClose} disabled={submitting}>Cerrar</button><button type="submit" className="organic-button primary" disabled={submitting}>{submitting ? 'Preparando…' : isConnect ? 'Conectar web' : isProject ? 'Crear proyecto' : 'Crear borrador'}</button></footer></form></div>
}

export default function OrganicLeadsPage() {
  const { locale } = useI18n()
  const [period, setPeriod] = useState('30d')
  const [projectId, setProjectId] = useState('')
  const [view, setView] = useState({ status: 'loading', data: null, error: '' })
  const [integrationState, setIntegrationState] = useState({ status: 'loading', integrations: [], error: '', message: '', busyProvider: '' })
  const [modal, setModal] = useState(null)
  const [modalMessage, setModalMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadOverview() {
    setView(current => ({ ...current, status: 'loading', error: '' }))
    try {
      const result = await fetchOrganicOverview({ projectId, period })
      const status = result.status === 'ready' && !hasOrganicSignals(result.data) ? 'empty' : result.status
      setView({ status, data: result.data, error: '' })
    } catch (error) {
      setView({ status: 'error', data: null, error: DEMO_MODE
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
    if (type === 'draft' || type === 'opportunity') openModal(type === 'opportunity' ? 'opportunity' : 'draft', target)
    else if (type === 'all-actions' || type === 'local' || type === 'ai' || type === 'assets' || type === 'leads' || type === 'competitors') setModal({ type: 'draft', target: { title: 'Nueva acción orgánica', description: 'Crea un borrador para continuar esta oportunidad.' }, action: 'draft' })
  }

  async function handleIntegrationAction(provider, action, value) {
    const currentProjectId = data?.project?.id || projectId || undefined
    setIntegrationState(current => ({ ...current, busyProvider: provider, message: '' }))
    try {
      if (action === 'connect') {
        const result = await startOrganicOAuth(provider, { projectId: currentProjectId })
        const authorizationUrl = result?.authorizationUrl || result?.url || result?.redirectUrl
        if (authorizationUrl) {
          window.location.assign(authorizationUrl)
          return
        }
        setIntegrationState(current => ({ ...current, message: 'El backend aceptó el inicio OAuth, pero no devolvió una URL de autorización.' }))
      } else if (action === 'disconnect') {
        await disconnectOrganicIntegration(provider, { projectId: currentProjectId })
        await loadIntegrations()
      } else if (action === 'configure') {
        if (!value) return
        await configureOrganicIntegration(provider, value)
        await loadIntegrations()
      } else if (action === 'sync') {
        await syncOrganicIntegration(provider, { projectId: currentProjectId })
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
      setModalMessage('Listo. Se ha guardado correctamente.')
      await loadOverview()
      setModal(null)
    } catch (error) {
      setModalMessage(error.message || 'No pudimos preparar la acción.')
    } finally { setSubmitting(false) }
  }

  const data = view.data
  const projects = useMemo(() => data?.project ? [data.project] : [], [data])
  const currency = data?.project?.currency || 'EUR'

  if (view.status === 'loading') return <main className="organic-page"><div className="organic-shell"><div className="organic-state"><div><div className="organic-spinner" /><p>{locale === 'en' ? 'Preparing your opportunity map…' : 'Preparando tu mapa de oportunidades…'}</p></div></div></div></main>
  if (view.status === 'setup' || !data) return <main className="organic-page"><div className="organic-shell"><SetupState kind="setup" onConfigure={() => openModal('setup', null, 'project')} /></div>{modal ? <OrganicModal {...modal} onClose={() => setModal(null)} onSubmit={submitModal} submitting={submitting} message={modalMessage} /> : null}</main>
  if (view.status === 'error') return <main className="organic-page"><div className="organic-shell"><SetupState kind="error" error={view.error} onRetry={loadOverview} onConfigure={() => openModal('setup', null, 'project')} /></div>{modal ? <OrganicModal {...modal} onClose={() => setModal(null)} onSubmit={submitModal} submitting={submitting} message={modalMessage} /> : null}</main>

  return <main className="organic-page"><div className="organic-shell"><header className="organic-topbar"><div className="organic-heading"><RiLeafLine aria-hidden="true" /><h1>Organic Leads</h1></div><div className="organic-header-actions"><div className="organic-selects">{projects.length ? <label><span className="organic-screen-reader">Proyecto</span><select className="organic-control" value={projectId || projects[0]?.id || ''} onChange={event => setProjectId(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.name || project.location || 'Proyecto orgánico'}</option>)}</select></label> : null}<label><span className="organic-screen-reader">Periodo</span><select className="organic-control" value={period} onChange={event => setPeriod(event.target.value)}>{PERIODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><button type="button" className="organic-button secondary" onClick={() => openModal('setup', null, 'connect')}><RiLinkM /> Conectar web</button><button type="button" className="organic-button primary" onClick={() => openModal('draft')}><RiAddLine /> Crear campaña orgánica</button></div></header><OrganicInternalNav /><section id="organic-summary" className="organic-opportunity-banner"><div className="organic-score" aria-label={`Oportunidad orgánica ${data.opportunity.score ?? 'sin puntuación'} sobre 100`}><span>{data.opportunity.score ?? '—'}<small>/100</small></span></div><div className="organic-opportunity-copy"><h2>Oportunidad orgánica: <strong>{data.opportunity.score ?? '—'}/100</strong></h2><p>{data.opportunity.summary || 'Vendrava está buscando oportunidades comerciales que tu negocio todavía no está aprovechando.'}</p></div><button type="button" className="organic-button secondary" onClick={() => handleAction(data.demand.best, 'opportunity')}>Ver análisis completo <RiArrowRightLine /></button></section><section className="organic-kpi-grid">{EMPTY_KPI.map((item, index) => <KpiCard key={item.key} item={item} value={data.kpis[item.key]} currency={currency} index={index} />)}</section><OrganicIntegrationsPanel state={integrationState} projectId={data.project?.id || projectId} onAction={handleIntegrationAction} onRefresh={loadIntegrations} /><div className="organic-main-grid"><OpportunitiesPanel data={data} onAction={handleAction} /><ActionPanel actions={data.actions} onAction={handleAction} /></div><div className="organic-lower-grid"><LocalPanel data={data} onAction={handleAction} /><AiPanel data={data} onAction={handleAction} /><AssetsPanel data={data} onAction={handleAction} /><LeadsPanel data={data} onAction={handleAction} /></div><CompetitorGap data={data} onAction={handleAction} /></div>{modal ? <OrganicModal {...modal} onClose={() => setModal(null)} onSubmit={submitModal} submitting={submitting} message={modalMessage} /> : null}</main>
}
