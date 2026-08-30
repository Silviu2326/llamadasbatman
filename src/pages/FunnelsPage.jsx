import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  RiAddLine,
  RiAlertLine,
  RiArrowRightLine,
  RiCalendarLine,
  RiCheckLine,
  RiCloseLine,
  RiCompass3Line,
  RiEyeLine,
  RiFlowChart,
  RiFocus3Line,
  RiGlobalLine,
  RiInformationLine,
  RiLineChartLine,
  RiRefreshLine,
  RiRocketLine,
  RiSparkling2Line,
  RiTeamLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import { formatLocaleNumber, getLocale, useI18n } from '../i18n'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import PageLoadingState from '../components/ui/PageLoadingState'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import funnelSignalIntake from '../assets/funnels/funnel-signal-intake.png'
import funnelConversationOrbit from '../assets/funnels/funnel-conversation-orbit.png'
import funnelMeetingMomentum from '../assets/funnels/funnel-meeting-momentum.png'
import './funnels.css'
import './funnels-visual.css'
import './growth-visual-standard.css'

const STATUS = {
  active: { label: 'Activo', className: 'is-active' },
  paused: { label: 'Pausado', className: 'is-paused' },
  draft: { label: 'Borrador', className: 'is-draft' },
  done: { label: 'Finalizado', className: 'is-done' },
}

const FUNNEL_VISUALS = [
  { id: 'attraction', image: funnelSignalIntake, label: 'Atracción', title: 'Convertir atención en intención', detail: 'La entrada del recorrido.' },
  { id: 'conversation', image: funnelConversationOrbit, label: 'Conversación', title: 'Crear una conexión cualificada', detail: 'El momento de seguimiento.' },
  { id: 'momentum', image: funnelMeetingMomentum, label: 'Siguiente paso', title: 'Llevar la intención a una reunión', detail: 'El avance que importa.' },
]

function formatNumber(value, locale = getLocale()) {
  return formatLocaleNumber(Number(value || 0), locale)
}

function formatRate(value, locale = getLocale()) {
  return value == null ? '—' : `${formatLocaleNumber(value, locale)}%`
}

function Metric({ Icon, label, value, detail, tone = 'indigo' }) {
  return <article className={`funnels-metric funnels-tone-${tone}`}>
    <span className="funnels-metric-icon"><Icon /></span>
    <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
  </article>
}

function FunnelRow({ funnel, selected, onSelect }) {
  const state = STATUS[funnel.status] ?? STATUS.draft
  const conversionRate = funnel.landingSlug ? funnel.rates.visitToMeeting : funnel.rates.leadToMeeting
  return <button type="button" className={`funnel-row${selected ? ' selected' : ''}`} onClick={() => onSelect(funnel.id)}>
    <span className={`funnel-row-dot ${state.className}`} aria-hidden="true" />
    <span className="funnel-row-title"><strong>{funnel.name}</strong><small>{funnel.objective || 'Sin objetivo definido'}</small></span>
    <span className={`funnel-status ${state.className}`}>{state.label}</span>
    <span className="funnel-row-metric"><strong>{funnel.visits == null ? '—' : formatNumber(funnel.visits)}</strong><small>{funnel.landingSlug ? (funnel.visits == null ? 'sin tracking' : 'visitas') : 'canal outbound'}</small></span>
    <span className="funnel-row-metric"><strong>{formatNumber(funnel.leads)}</strong><small>leads</small></span>
    <span className="funnel-row-metric"><strong>{formatNumber(funnel.meetings)}</strong><small>reuniones</small></span>
    <span className="funnel-row-rate"><strong>{formatRate(conversionRate)}</strong><small>{funnel.landingSlug ? 'visita a reunión' : 'lead a reunión'}</small></span>
    <RiArrowRightLine className="funnel-row-arrow" />
  </button>
}

function Stage({ Icon, label, value, rate, tone, detail }) {
  return <div className={`funnel-stage funnel-stage-${tone}`}>
    <span className="funnel-stage-icon"><Icon /></span>
    <div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div>
    <b>{formatRate(rate)}</b>
  </div>
}

function FunnelJourney({ funnel }) {
  if (!funnel) return <div className="funnels-selection-empty"><RiFlowChart /><p>Selecciona un funnel para revisar cada transición.</p></div>
  const visitDetail = funnel.visits == null ? 'tracking pendiente' : 'tráfico registrado'
  return <>
    <div className="funnels-selected-top">
      <div><span>Funnel seleccionado</span><h2>{funnel.name}</h2><p>{funnel.objective || 'Define el objetivo de este funnel desde Campañas.'}</p></div>
      {funnel.landingSlug && <a href={`/l/${funnel.landingSlug}`} target="_blank" rel="noreferrer" className="funnels-icon-link" title="Abrir landing"><RiGlobalLine /></a>}
    </div>
    {funnel.landingSlug ? <div className="funnel-journey" aria-label="Recorrido del funnel">
      <Stage Icon={RiEyeLine} label="Visitas" value={funnel.visits == null ? '—' : formatNumber(funnel.visits)} detail={visitDetail} tone="cyan" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.visitToLead)}</small></span>
      <Stage Icon={RiTeamLine} label="Leads" value={formatNumber(funnel.leads)} detail="formularios captados" tone="emerald" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.leadToContact)}</small></span>
      <Stage Icon={RiFocus3Line} label="Contactados" value={formatNumber(funnel.contacted)} detail="seguimiento iniciado" tone="violet" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.contactToMeeting)}</small></span>
      <Stage Icon={RiCalendarLine} label="Reuniones" value={formatNumber(funnel.meetings)} detail="siguiente paso logrado" tone="amber" />
    </div> : <div className="funnel-journey" aria-label="Recorrido outbound">
      <Stage Icon={RiCompass3Line} label="Prospectos" value={formatNumber(funnel.leads)} detail="importados al CRM" tone="cyan" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.leadToContact)}</small></span>
      <Stage Icon={RiFocus3Line} label="Contactados" value={formatNumber(funnel.contacted)} detail="seguimiento iniciado" tone="violet" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.contactToMeeting)}</small></span>
      <Stage Icon={RiCalendarLine} label="Reuniones" value={formatNumber(funnel.meetings)} detail="siguiente paso logrado" tone="amber" />
    </div>}
    <FunnelVisualStory />
    <div className="funnels-selection-footer"><span><RiInformationLine /> Las tasas se calculan contra la etapa anterior.</span><Link to={`/campanas/${funnel.id}`}>Gestionar campaña <RiArrowRightLine /></Link></div>
  </>
}

function FunnelVisualStory() {
  const [activeId, setActiveId] = useState('attraction')
  const active = FUNNEL_VISUALS.find(item => item.id === activeId) ?? FUNNEL_VISUALS[0]
  return <section className="funnels-visual-story">
    <div className="funnels-visual-head"><div><span>Ruta en foco</span><h2>{active.title}</h2><p>{active.detail}</p></div><RiSparkling2Line /></div>
    <div className="funnels-visual-main"><img key={active.id} src={active.image} alt="" /><div className="funnels-visual-shade" /></div>
    <div className="funnels-visual-picker" aria-label="Fases visuales del funnel">{FUNNEL_VISUALS.map(item => <button type="button" key={item.id} className={item.id === active.id ? 'active' : ''} onClick={() => setActiveId(item.id)} aria-pressed={item.id === active.id}><img src={item.image} alt="" /><span>{item.label}</span></button>)}</div>
  </section>
}

function EmptyFunnels({ onCreate, gated }) {
  return <section className="funnels-empty">
    <span><RiFlowChart /></span><h2>{gated ? 'Funnels no está incluido en tu plan' : 'Tu primer funnel empieza con una landing'}</h2>
    <p>{gated ? 'Mejora tu plan para crear rutas de captación y medir sus leads, contactos y reuniones.' : 'Crea una ruta de captación y tendrás en un solo lugar sus leads, contactos y reuniones reales.'}</p>
    {/* Sin plan el POST devolveria 403: un boton que siempre falla es una trampa, no un gancho. */}
    {!gated && <button type="button" className="funnels-button primary" onClick={onCreate}><RiAddLine /> Crear funnel</button>}
  </section>
}

function CreateFunnelModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', objective: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    if (error) setError('')
  }

  async function submit(event) {
    event.preventDefault()
    if (form.name.trim().length < 3) {
      setError('Escribe un nombre de al menos 3 caracteres.')
      return
    }
    setSubmitting(true)
    try {
      const response = await apiFetch('/api/funnels', { method: 'POST', body: JSON.stringify({ name: form.name.trim(), objective: form.objective.trim() || null }) })
      if (!response.ok) throw new Error('No se pudo crear el funnel.')
      const data = await response.json()
      onCreated(data.funnel?.id || null)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo crear el funnel.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="funnels-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <form className="funnels-modal" onSubmit={submit}>
      <div className="funnels-modal-head"><div><span>Nueva ruta de conversión</span><h2>Crea un funnel listo para captar</h2><p>Se generará una landing genérica, editable desde Landings & webs.</p></div><button type="button" onClick={onClose} disabled={submitting} aria-label="Cerrar"><RiCloseLine /></button></div>
      <div className="funnels-form"><label>Nombre del funnel<input autoFocus value={form.name} maxLength="140" onChange={event => update('name', event.target.value)} placeholder="Ej. Diagnóstico comercial" /></label><label>Objetivo <span>Opcional</span><textarea value={form.objective} maxLength="2000" onChange={event => update('objective', event.target.value)} placeholder="Qué conversación o resultado buscas generar" rows="3" /></label>{error && <p className="funnels-form-error"><RiAlertLine /> {error}</p>}</div>
      <div className="funnels-modal-actions"><button type="button" className="funnels-button ghost" onClick={onClose} disabled={submitting}>Cancelar</button><button className="funnels-button primary" disabled={submitting}>{submitting ? 'Creando…' : <><RiRocketLine /> Crear funnel</>}</button></div>
    </form>
  </div>
}

export default function FunnelsPage() {
  const { locale } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [planGate, setPlanGate] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  async function loadOverview(preferredId = null) {
    setLoading(true)
    setError(false)
    setPlanGate(null)
    try {
      const response = await apiFetch('/api/funnels/overview')
      if (!response.ok) {
        // Bloqueo de plan (403/409 con codigo): la pagina se muestra igual, vacia y con su aviso.
        const gate = await readPlanGate(response)
        if (gate) { setOverview(null); setPlanGate(gate); return }
        throw new Error('overview-failed')
      }
      const data = await response.json()
      const requestedId = preferredId || searchParams.get('selected')
      setOverview(data)
      setSelectedId(current => requestedId && data.funnels.some(funnel => funnel.id === requestedId) ? requestedId : current && data.funnels.some(funnel => funnel.id === current) ? current : data.funnels[0]?.id ?? null)
    } catch {
      setOverview(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadOverview() }, [])

  const funnels = useMemo(() => {
    const items = overview?.funnels ?? []
    if (filter === 'tracking') return items.filter(funnel => funnel.landingSlug && funnel.visits === null)
    return filter === 'all' ? items : items.filter(funnel => funnel.status === filter)
  }, [filter, overview])
  const selected = useMemo(() => (overview?.funnels ?? []).find(funnel => funnel.id === selectedId) ?? null, [overview, selectedId])
  const summary = overview?.summary

  function selectFunnel(id) {
    setSelectedId(id)
    setSearchParams({ selected: id }, { replace: true })
  }

  async function created(id) {
    setShowCreate(false)
    await loadOverview(id)
  }

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading funnels' : 'Cargando funnels'} />
  if (error) return <main className="funnels-page"><section className="funnels-error"><RiAlertLine /><div><strong>No se pudo cargar Funnels</strong><span>Comprueba tu conexión e inténtalo de nuevo.</span></div><button type="button" className="funnels-button ghost" onClick={() => loadOverview()}><RiRefreshLine /> Reintentar</button></section></main>

  return <main className="funnels-page">
    <ProductPageHeader Icon={RiFlowChart} title="Funnels" description={locale === 'en' ? 'Measure how demand becomes conversations, meetings and real opportunities.' : 'Mide cómo la demanda se convierte en conversaciones, reuniones y oportunidades reales.'} actions={<><Link className="funnels-button ghost" to="/captacion/convertir?tab=landings"><RiGlobalLine /> Landings</Link><button type="button" className="funnels-button primary" disabled={Boolean(planGate)} title={planGate ? planGateMessage(planGate, locale) : undefined} onClick={() => setShowCreate(true)}><RiAddLine /> {locale === 'en' ? 'New funnel' : 'Nuevo funnel'}</button></>} />
    {planGate && <DataStatusBanner status="plan" message={planGateMessage(planGate, locale)} />}
    {overview?.recommendation && <section className="funnels-command"><span><RiLineChartLine /></span><div><small>Prioridad recomendada</small><strong>{overview.recommendation.title}</strong><p>{overview.recommendation.detail}</p></div><Link to={overview.recommendation.action.to}>{overview.recommendation.action.label} <RiArrowRightLine /></Link></section>}
    <section className="funnels-metrics" aria-label="Resumen del funnel"><Metric Icon={RiRocketLine} label="Funnels activos" value={formatNumber(summary?.active)} detail="en operación" /><Metric Icon={RiEyeLine} label="Visitas medidas" value={summary?.trackedFunnels ? formatNumber(summary.visits) : 'Sin tracking'} detail={summary?.trackedFunnels ? `${summary.trackedFunnels} funnel${summary.trackedFunnels === 1 ? '' : 's'} con medición` : `${summary?.untrackedFunnels || 0} pendiente${summary?.untrackedFunnels === 1 ? '' : 's'} de medir`} tone="cyan" /><Metric Icon={RiTeamLine} label="Leads captados" value={formatNumber(summary?.leads)} detail={summary?.visitToLead == null ? 'conversión pendiente' : `${formatRate(summary.visitToLead)} visita a lead`} tone="emerald" /><Metric Icon={RiCalendarLine} label="Reuniones" value={formatNumber(summary?.meetings)} detail={summary?.visitToMeeting == null ? 'conversión pendiente' : `${formatRate(summary.visitToMeeting)} visita a reunión`} tone="amber" /></section>
    {!overview?.funnels?.length ? <EmptyFunnels onCreate={() => setShowCreate(true)} gated={Boolean(planGate)} /> : <section className="funnels-workspace">
      <article className="funnels-list-panel"><div className="funnels-list-head"><div><span>Funnel performance</span><h2>Recorridos de captación</h2></div><div className="funnels-filter" aria-label="Filtros de funnel">{[['all', 'Todos'], ['active', 'Activos'], ['draft', 'Borradores'], ['tracking', 'Sin tracking']].map(([id, label]) => <button key={id} type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div></div><div className="funnels-table-labels"><span>Funnel</span><span>Estado</span><span>Visitas</span><span>Leads</span><span>Reuniones</span><span>Conversión</span><span /></div><div className="funnels-list">{funnels.length ? funnels.map(funnel => <FunnelRow key={funnel.id} funnel={funnel} selected={selectedId === funnel.id} onSelect={selectFunnel} />) : <div className="funnels-filter-empty">No hay funnels en este filtro.</div>}</div><footer className="funnels-list-footer"><span>{funnels.length} funnel{funnels.length === 1 ? '' : 's'} visible{funnels.length === 1 ? '' : 's'}</span><span><i /> Datos de tu organización</span></footer></article>
      <aside className="funnels-inspector"><article className="funnels-selection"><FunnelJourney funnel={selected} /></article><article className="funnels-measurement"><div><span><RiEyeLine /></span><div><small>Calidad de medición</small><h2>{summary?.untrackedFunnels ? 'Tracking por completar' : 'Recorrido medible'}</h2></div></div><p>{summary?.untrackedFunnels ? `${summary.untrackedFunnels} funnel${summary.untrackedFunnels === 1 ? '' : 's'} aún no tiene visitas registradas. Las conversiones de tráfico se mantienen vacías hasta recibir ese dato.` : 'Todas las rutas activas tienen datos de visitas para poder comparar sus conversiones.'}</p><Link to="/captacion/convertir?tab=landings">Ir a Web y SEO <RiArrowRightLine /></Link></article></aside>
    </section>}
    <section className="funnels-method"><RiCheckLine /><p><strong>Cómo se mide:</strong> leads, contactos y reuniones proceden de cada campaña; las tasas se calculan entre etapas consecutivas y nunca se estiman si falta el dato anterior.</p></section>
    {showCreate && <CreateFunnelModal onClose={() => setShowCreate(false)} onCreated={created} />}
  </main>
}
