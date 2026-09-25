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
  RiPauseCircleLine,
  RiPlayCircleLine,
  RiRefreshLine,
  RiRocketLine,
  RiSparkling2Line,
  RiStopCircleLine,
  RiTeamLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { hasNavigationPermission } from '../lib/navigationPermissions'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import { formatLocaleNumber, useI18n } from '../i18n'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import PageLoadingState from '../components/ui/PageLoadingState'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import funnelSignalIntake from '../assets/funnels/funnel-signal-intake.png'
import funnelConversationOrbit from '../assets/funnels/funnel-conversation-orbit.png'
import funnelMeetingMomentum from '../assets/funnels/funnel-meeting-momentum.png'
import './funnels.css'
import './funnels-visual.css'
import './growth-visual-standard.css'

// Etiquetas en funnels.status.* (i18n).
const STATUS = {
  active: { className: 'is-active' },
  paused: { className: 'is-paused' },
  draft: { className: 'is-draft' },
  done: { className: 'is-done' },
}

// Permiso real de la sesión (lista explícita del backend o el fallback por rol
// de navigationPermissions, que replica catalog.ts). Es solo UI: la API sigue
// autorizando cada mutación con requirePermission('funnels.write').
function canWriteFunnels(user) {
  return Boolean(user) && hasNavigationPermission(user, ['funnels.write'])
}

// Acciones de ciclo de vida por estado. Solo cambian Campaign.status mediante
// PATCH /api/funnels/:id/status: nunca encolan llamadas (eso es Campañas).
// Textos en funnels.actions.* (label = clave, success = clave del aviso).
const LIFECYCLE_ACTIONS = {
  activate: { status: 'active', Icon: RiPlayCircleLine, success: 'activated' },
  pause: { status: 'paused', Icon: RiPauseCircleLine, success: 'paused' },
  finish: { status: 'done', Icon: RiStopCircleLine, success: 'finished' },
}

function lifecycleActionsFor(status) {
  if (status === 'done') return []
  if (status === 'active') return ['pause', 'finish']
  return ['activate', 'finish']
}

async function readErrorMessage(response, fallback) {
  const payload = await response.json().catch(() => null)
  return payload?.error || fallback
}

// Textos en funnels.visuals.<id>.*
const FUNNEL_VISUALS = [
  { id: 'attraction', image: funnelSignalIntake },
  { id: 'conversation', image: funnelConversationOrbit },
  { id: 'momentum', image: funnelMeetingMomentum },
]

function formatNumber(value, locale) {
  return formatLocaleNumber(Number(value || 0), locale)
}

function formatRate(value, locale) {
  return value == null ? '—' : `${formatLocaleNumber(value, locale)}%`
}

function plural(t, key, count, vars = {}) {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...vars })
}

function Metric({ Icon, label, value, detail, tone = 'indigo' }) {
  return <article className={`funnels-metric funnels-tone-${tone}`}>
    <span className="funnels-metric-icon"><Icon /></span>
    <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
  </article>
}

function FunnelRow({ funnel, selected, onSelect }) {
  const { t, locale } = useI18n()
  const state = STATUS[funnel.status] ?? STATUS.draft
  const conversionRate = funnel.landingSlug ? funnel.rates.visitToMeeting : funnel.rates.leadToMeeting
  return <button type="button" className={`funnel-row${selected ? ' selected' : ''}`} onClick={() => onSelect(funnel.id)} aria-pressed={selected}>
    <span className={`funnel-row-dot ${state.className}`} aria-hidden="true" />
    <span className="funnel-row-title"><strong>{funnel.name}</strong><small>{funnel.objective || t('funnels.row.noObjective')}</small></span>
    <span className={`funnel-status ${state.className}`}>{t(`funnels.status.${STATUS[funnel.status] ? funnel.status : 'draft'}`)}</span>
    <span className="funnel-row-metric"><strong>{funnel.visits == null ? '—' : formatNumber(funnel.visits, locale)}</strong><small>{funnel.landingSlug ? (funnel.visits == null ? t('funnels.row.noTracking') : t('funnels.row.visits')) : t('funnels.row.outbound')}</small></span>
    <span className="funnel-row-metric"><strong>{formatNumber(funnel.leads, locale)}</strong><small>{t('funnels.row.leads')}</small></span>
    <span className="funnel-row-metric"><strong>{formatNumber(funnel.meetings, locale)}</strong><small>{t('funnels.row.meetings')}</small></span>
    <span className="funnel-row-rate"><strong>{formatRate(conversionRate, locale)}</strong><small>{funnel.landingSlug ? t('funnels.row.visitToMeeting') : t('funnels.row.leadToMeeting')}</small></span>
    <RiArrowRightLine className="funnel-row-arrow" />
  </button>
}

function Stage({ Icon, label, value, rate, tone, detail }) {
  const { locale } = useI18n()
  return <div className={`funnel-stage funnel-stage-${tone}`}>
    <span className="funnel-stage-icon"><Icon /></span>
    <div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div>
    <b>{formatRate(rate, locale)}</b>
  </div>
}

function FunnelLifecycle({ funnel, canWrite, busy, onAction }) {
  const { t } = useI18n()
  const actions = lifecycleActionsFor(funnel.status)
  if (!actions.length) return <div className="funnels-lifecycle"><span><RiInformationLine /> {t('funnels.actions.finishedNote')}</span></div>
  return <div className="funnels-lifecycle" aria-label={t('funnels.actions.stateAria')}>
    {actions.map(key => {
      const Icon = LIFECYCLE_ACTIONS[key].Icon
      return <button key={key} type="button" className={`funnels-button ${key === 'activate' ? 'primary' : 'ghost'}`} disabled={!canWrite || busy} title={canWrite ? undefined : t('funnels.writeDenied')} onClick={() => onAction(funnel, key)}><Icon /> {busy ? t('funnels.actions.saving') : t(`funnels.actions.${key}`)}</button>
    })}
    {!canWrite && <small>{t('funnels.writeDenied')}</small>}
  </div>
}

function FunnelJourney({ funnel, canWrite, busy, onAction }) {
  const { t, locale } = useI18n()
  if (!funnel) return <div className="funnels-selection-empty"><RiFlowChart /><p>{t('funnels.journey.selectPrompt')}</p></div>
  const visitDetail = funnel.visits == null ? t('funnels.journey.trackingPending') : t('funnels.journey.trafficRecorded')
  return <>
    <div className="funnels-selected-top">
      <div><span>{t('funnels.journey.selected')}</span><h2>{funnel.name}</h2><p>{funnel.objective || t('funnels.journey.defineObjective')}</p></div>
      {funnel.landingSlug && <a href={`/l/${funnel.landingSlug}`} target="_blank" rel="noreferrer" className="funnels-icon-link" title={funnel.status === 'active' ? t('funnels.journey.openLanding') : t('funnels.journey.landingOnlyActive')} aria-label={t('funnels.journey.openLanding')}><RiGlobalLine /></a>}
    </div>
    <FunnelLifecycle funnel={funnel} canWrite={canWrite} busy={busy} onAction={onAction} />
    {funnel.landingSlug ? <div className="funnel-journey" aria-label={t('funnels.journey.aria')}>
      <Stage Icon={RiEyeLine} label={t('funnels.journey.visits')} value={funnel.visits == null ? '—' : formatNumber(funnel.visits, locale)} detail={visitDetail} tone="cyan" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.visitToLead, locale)}</small></span>
      <Stage Icon={RiTeamLine} label={t('funnels.journey.leads')} value={formatNumber(funnel.leads, locale)} detail={t('funnels.journey.leadsDetail')} tone="emerald" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.leadToContact, locale)}</small></span>
      <Stage Icon={RiFocus3Line} label={t('funnels.journey.contacted')} value={formatNumber(funnel.contacted, locale)} detail={t('funnels.journey.contactedDetail')} tone="violet" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.contactToMeeting, locale)}</small></span>
      <Stage Icon={RiCalendarLine} label={t('funnels.journey.meetings')} value={formatNumber(funnel.meetings, locale)} detail={t('funnels.journey.meetingsDetail')} tone="amber" />
    </div> : <div className="funnel-journey" aria-label={t('funnels.journey.outboundAria')}>
      <Stage Icon={RiCompass3Line} label={t('funnels.journey.prospects')} value={formatNumber(funnel.leads, locale)} detail={t('funnels.journey.prospectsDetail')} tone="cyan" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.leadToContact, locale)}</small></span>
      <Stage Icon={RiFocus3Line} label={t('funnels.journey.contacted')} value={formatNumber(funnel.contacted, locale)} detail={t('funnels.journey.contactedDetail')} tone="violet" />
      <span className="funnel-connector"><i /><small>{formatRate(funnel.rates.contactToMeeting, locale)}</small></span>
      <Stage Icon={RiCalendarLine} label={t('funnels.journey.meetings')} value={formatNumber(funnel.meetings, locale)} detail={t('funnels.journey.meetingsDetail')} tone="amber" />
    </div>}
    <FunnelVisualStory />
    <div className="funnels-selection-footer"><span><RiInformationLine /> {t('funnels.journey.ratesNote')}</span><Link to={`/campanas/${funnel.id}`}>{t('funnels.journey.manageCampaign')} <RiArrowRightLine /></Link></div>
  </>
}

function FunnelVisualStory() {
  const { t } = useI18n()
  const [activeId, setActiveId] = useState('attraction')
  const active = FUNNEL_VISUALS.find(item => item.id === activeId) ?? FUNNEL_VISUALS[0]
  return <section className="funnels-visual-story">
    <div className="funnels-visual-head"><div><span>{t('funnels.visuals.focus')}</span><h2>{t(`funnels.visuals.${active.id}.title`)}</h2><p>{t(`funnels.visuals.${active.id}.detail`)}</p></div><RiSparkling2Line /></div>
    <div className="funnels-visual-main"><img key={active.id} src={active.image} alt="" /><div className="funnels-visual-shade" /></div>
    <div className="funnels-visual-picker" aria-label={t('funnels.visuals.pickerAria')}>{FUNNEL_VISUALS.map(item => <button type="button" key={item.id} className={item.id === active.id ? 'active' : ''} onClick={() => setActiveId(item.id)} aria-pressed={item.id === active.id}><img src={item.image} alt="" /><span>{t(`funnels.visuals.${item.id}.label`)}</span></button>)}</div>
  </section>
}

function EmptyFunnels({ onCreate, gated, canWrite }) {
  const { t } = useI18n()
  return <section className="funnels-empty">
    <span><RiFlowChart /></span><h2>{gated ? t('funnels.empty.gatedTitle') : t('funnels.empty.title')}</h2>
    <p>{gated ? t('funnels.empty.gatedHint') : t('funnels.empty.hint')}</p>
    {/* Sin plan el POST devolveria 403: un boton que siempre falla es una trampa, no un gancho. */}
    {!gated && (canWrite ? <button type="button" className="funnels-button primary" onClick={onCreate}><RiAddLine /> {t('funnels.empty.create')}</button> : <p>{t('funnels.writeDenied')}</p>)}
  </section>
}

function CreateFunnelModal({ onClose, onCreated }) {
  const { t } = useI18n()
  const titleId = 'funnels-create-title'
  const [form, setForm] = useState({ name: '', objective: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    if (error) setError('')
  }

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [submitting, onClose])

  async function submit(event) {
    event.preventDefault()
    if (form.name.trim().length < 3) {
      setError(t('funnels.create.nameTooShort'))
      return
    }
    setSubmitting(true)
    try {
      const response = await apiFetch('/api/funnels', { method: 'POST', body: JSON.stringify({ name: form.name.trim(), objective: form.objective.trim() || null }) })
      // El backend explica el motivo (validación, permiso, límite del plan): se muestra tal cual.
      if (!response.ok) throw new Error(await readErrorMessage(response, t('funnels.create.error')))
      const data = await response.json()
      onCreated(data.funnel?.id || null)
    } catch (requestError) {
      setError(requestError.message || t('funnels.create.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="funnels-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <form className="funnels-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} noValidate>
      <div className="funnels-modal-head"><div><span>{t('funnels.create.kicker')}</span><h2 id={titleId}>{t('funnels.create.title')}</h2><p>{t('funnels.create.hint')}</p></div><button type="button" onClick={onClose} disabled={submitting} aria-label={t('funnels.create.close')}><RiCloseLine /></button></div>
      <div className="funnels-form"><label>{t('funnels.create.name')}<input autoFocus value={form.name} maxLength="140" onChange={event => update('name', event.target.value)} placeholder={t('funnels.create.namePlaceholder')} aria-invalid={Boolean(error) || undefined} /></label><label>{t('funnels.create.objective')} <span>{t('funnels.create.optional')}</span><textarea value={form.objective} maxLength="2000" onChange={event => update('objective', event.target.value)} placeholder={t('funnels.create.objectivePlaceholder')} rows="3" /></label>{error && <p className="funnels-form-error" role="alert"><RiAlertLine /> {error}</p>}</div>
      <div className="funnels-modal-actions"><button type="button" className="funnels-button ghost" onClick={onClose} disabled={submitting}>{t('funnels.create.cancel')}</button><button className="funnels-button primary" disabled={submitting}>{submitting ? t('funnels.create.creating') : <><RiRocketLine /> {t('funnels.create.submit')}</>}</button></div>
    </form>
  </div>
}

export default function FunnelsPage() {
  const { t, locale } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  // Solo la primera carga usa la pantalla completa; las siguientes (crear,
  // cambiar estado) refrescan con un indicador inline sin desmontar la página.
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [error, setError] = useState(false)
  const [planGate, setPlanGate] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const { user } = useAuth()
  const canWrite = useMemo(() => canWriteFunnels(user), [user])
  const [busyId, setBusyId] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [actionNotice, setActionNotice] = useState(null)

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
      setLoadedOnce(true)
    }
  }

  useEffect(() => { loadOverview() }, [])

  const funnels = useMemo(() => {
    const items = overview?.funnels ?? []
    // «Todos» son los funnels en curso: los finalizados quedan archivados en su filtro.
    if (filter === 'tracking') return items.filter(funnel => funnel.status !== 'done' && funnel.landingSlug && funnel.visits === null)
    return filter === 'all' ? items.filter(funnel => funnel.status !== 'done') : items.filter(funnel => funnel.status === filter)
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

  async function changeStatus(funnel, key) {
    const action = LIFECYCLE_ACTIONS[key]
    setBusyId(funnel.id)
    setActionNotice(null)
    try {
      const response = await apiFetch(`/api/funnels/${funnel.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: action.status }) })
      if (!response.ok) throw new Error(await readErrorMessage(response, t('funnels.actions.statusError')))
      const data = await response.json().catch(() => null)
      const status = data?.funnel?.status || action.status
      // Actualización local inmediata (sin perder filtro ni selección) y
      // después el overview real del backend, con indicador inline.
      setOverview(current => current ? {
        ...current,
        funnels: current.funnels.map(item => item.id === funnel.id ? { ...item, status } : item),
        summary: { ...current.summary, active: current.funnels.reduce((total, item) => total + ((item.id === funnel.id ? status : item.status) === 'active' ? 1 : 0), 0) },
      } : current)
      setActionNotice({ tone: 'success', message: t(`funnels.actions.${action.success}`) })
      await loadOverview(funnel.id)
    } catch (requestError) {
      // Un fallo de la acción no sustituye la lista: se avisa y se conserva todo.
      setActionNotice({ tone: 'error', message: requestError.message || t('funnels.actions.statusError') })
    } finally {
      setBusyId(null)
    }
  }

  function requestAction(funnel, key) {
    if (key === 'activate') { changeStatus(funnel, key); return }
    setPendingAction({ funnel, key })
  }

  if (loading && !loadedOnce) return <PageLoadingState label={t('funnels.loading')} />
  if (error) return <main className="funnels-page"><section className="funnels-error" role="alert"><RiAlertLine /><div><strong>{t('funnels.loadErrorTitle')}</strong><span>{t('funnels.loadErrorHint')}</span></div><button type="button" className="funnels-button ghost" onClick={() => loadOverview()}><RiRefreshLine /> {t('funnels.retry')}</button></section></main>

  const refreshing = loading && loadedOnce
  const number = value => formatNumber(value, locale)
  const rate = value => formatRate(value, locale)

  return <main className="funnels-page" aria-busy={refreshing}>
    <ProductPageHeader Icon={RiFlowChart} title={t('funnels.title')} description={t('funnels.description')} actions={<><Link className="funnels-button ghost" to="/captacion/convertir?tab=landings"><RiGlobalLine /> {t('funnels.landings')}</Link><button type="button" className="funnels-button primary" disabled={Boolean(planGate) || !canWrite} title={planGate ? planGateMessage(planGate, locale) : !canWrite ? t('funnels.writeDenied') : undefined} onClick={() => setShowCreate(true)}><RiAddLine /> {t('funnels.newFunnel')}</button></>} />
    {planGate && <DataStatusBanner status="plan" message={planGateMessage(planGate, locale)} />}
    {refreshing && <div className="funnels-notice is-refreshing" role="status"><RiRefreshLine /><span>{t('funnels.refreshing')}</span></div>}
    {actionNotice && <div className={`funnels-notice is-${actionNotice.tone}`} role={actionNotice.tone === 'error' ? 'alert' : 'status'}>{actionNotice.tone === 'error' ? <RiAlertLine /> : <RiCheckLine />}<span>{actionNotice.message}</span><button type="button" onClick={() => setActionNotice(null)} aria-label={t('funnels.closeNotice')}><RiCloseLine /></button></div>}
    {overview?.recommendation && <section className="funnels-command"><span><RiLineChartLine /></span><div><small>{t('funnels.recommendation')}</small><strong>{overview.recommendation.title}</strong><p>{overview.recommendation.detail}</p></div><Link to={overview.recommendation.action.to}>{overview.recommendation.action.label} <RiArrowRightLine /></Link></section>}
    <section className="funnels-metrics" aria-label={t('funnels.metrics.aria')}><Metric Icon={RiRocketLine} label={t('funnels.metrics.active')} value={number(summary?.active)} detail={t('funnels.metrics.activeDetail')} /><Metric Icon={RiEyeLine} label={t('funnels.metrics.visits')} value={summary?.trackedFunnels ? number(summary.visits) : t('funnels.metrics.noTracking')} detail={summary?.trackedFunnels ? plural(t, 'funnels.metrics.tracked', summary.trackedFunnels) : plural(t, 'funnels.metrics.untracked', summary?.untrackedFunnels || 0)} tone="cyan" /><Metric Icon={RiTeamLine} label={t('funnels.metrics.leads')} value={number(summary?.leads)} detail={summary?.visitToLead == null ? t('funnels.metrics.conversionPending') : t('funnels.metrics.visitToLead', { rate: rate(summary.visitToLead) })} tone="emerald" /><Metric Icon={RiCalendarLine} label={t('funnels.metrics.meetings')} value={number(summary?.meetings)} detail={summary?.visitToMeeting == null ? t('funnels.metrics.conversionPending') : t('funnels.metrics.visitToMeeting', { rate: rate(summary.visitToMeeting) })} tone="amber" /></section>
    {!overview?.funnels?.length ? <EmptyFunnels onCreate={() => setShowCreate(true)} gated={Boolean(planGate)} canWrite={canWrite} /> : <section className="funnels-workspace">
      <article className="funnels-list-panel"><div className="funnels-list-head"><div><span>{t('funnels.list.kicker')}</span><h2>{t('funnels.list.title')}</h2></div><div className="funnels-filter" aria-label={t('funnels.list.filtersAria')}>{['all', 'active', 'paused', 'draft', 'tracking', 'done'].map(id => <button key={id} type="button" className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{t(`funnels.list.filters.${id}`)}</button>)}</div></div><div className="funnels-table-labels"><span>{t('funnels.list.headers.funnel')}</span><span>{t('funnels.list.headers.status')}</span><span>{t('funnels.list.headers.visits')}</span><span>{t('funnels.list.headers.leads')}</span><span>{t('funnels.list.headers.meetings')}</span><span>{t('funnels.list.headers.conversion')}</span><span /></div><div className="funnels-list">{funnels.length ? funnels.map(funnel => <FunnelRow key={funnel.id} funnel={funnel} selected={selectedId === funnel.id} onSelect={selectFunnel} />) : <div className="funnels-filter-empty">{t('funnels.list.filterEmpty')}</div>}</div><footer className="funnels-list-footer"><span>{plural(t, 'funnels.list.visible', funnels.length)}</span><span><i /> {t('funnels.list.orgData')}</span></footer></article>
      <aside className="funnels-inspector"><article className="funnels-selection"><FunnelJourney funnel={selected} canWrite={canWrite} busy={busyId === selected?.id} onAction={requestAction} /></article><article className="funnels-measurement"><div><span><RiEyeLine /></span><div><small>{t('funnels.measurement.title')}</small><h2>{summary?.untrackedFunnels ? t('funnels.measurement.pending') : t('funnels.measurement.ready')}</h2></div></div><p>{summary?.untrackedFunnels ? plural(t, 'funnels.measurement.pendingHint', summary.untrackedFunnels) : t('funnels.measurement.readyHint')}</p><Link to="/captacion/convertir?tab=landings">{t('funnels.measurement.goToWeb')} <RiArrowRightLine /></Link></article></aside>
    </section>}
    <section className="funnels-method"><RiCheckLine /><p><strong>{t('funnels.method.title')}</strong> {t('funnels.method.text')}</p></section>
    {pendingAction && <ConfirmDialog
      title={pendingAction.key === 'finish' ? t('funnels.confirm.finishTitle', { name: pendingAction.funnel.name }) : t('funnels.confirm.pauseTitle', { name: pendingAction.funnel.name })}
      message={pendingAction.key === 'finish' ? t('funnels.confirm.finishMessage') : t('funnels.confirm.pauseMessage')}
      confirmText={pendingAction.key === 'finish' ? t('funnels.confirm.finish') : t('funnels.confirm.pause')}
      cancelText={t('funnels.create.cancel')}
      tone={pendingAction.key === 'finish' ? 'danger' : 'neutral'}
      onConfirm={() => changeStatus(pendingAction.funnel, pendingAction.key)}
      onClose={() => setPendingAction(null)}
    />}
    {showCreate && <CreateFunnelModal onClose={() => setShowCreate(false)} onCreated={created} />}
  </main>
}
