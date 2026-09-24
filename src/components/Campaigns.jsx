import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiArrowRightLine, RiBarChartGroupedLine,
  RiCheckboxCircleLine, RiCloseLine, RiEditLine, RiErrorWarningLine,
  RiFileCopyLine, RiGroupLine, RiLayoutGridLine,
  RiMegaphoneLine, RiPauseCircleLine, RiPhoneLine,
  RiPlayCircleLine, RiSearchLine, RiWallet3Line, RiShareForwardLine,
  RiCompass3Line, RiFlowChart,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import {
  buildChannelMixView, buildFunnelView, readApiError, startConfirmation,
  summarizeCampaigns, validateCampaignForm,
} from '../lib/campaignsView'
import ConfirmDialog from './ui/ConfirmDialog'
import DataStatusBanner from './ui/DataStatusBanner'
import PageLoadingState from './ui/PageLoadingState'
import ProductPageHeader from './ui/ProductPageHeader'
import './campaigns.css'
import './capture/campaign-command.css'
import '../pages/growth-visual-standard.css'
import { formatLocaleNumber, useI18n } from '../i18n'

// ponytail: `type` (email/social/ads/automation) no existe en el modelo
// Campaign real — el producto es una plataforma de llamadas de voz. Se
// deriva un tipo honesto a partir de campos que sí existen (adPlaybookId /
// metaCampaignId => la campaña vino de Meta Ads, si no es una campaña de
// llamadas outbound estándar).
// Las etiquetas salen de campaigns.types.* / campaigns.status.* (i18n).
const TYPE_META = {
  outbound: { Icon: RiPhoneLine, color: 'var(--violet)' },
  ads: { Icon: RiMegaphoneLine, color: 'var(--warn)' },
  social: { Icon: RiShareForwardLine, color: 'var(--cyan)' },
  prospecting: { Icon: RiCompass3Line, color: 'var(--success)' },
  multichannel: { Icon: RiFlowChart, color: 'var(--pink)' },
}

const STATUS_META = {
  active: { color: 'var(--success)' },
  paused: { color: 'var(--warn-soft)' },
  draft: { color: 'var(--muted)' },
  done: { color: 'var(--violet)' },
}

const LIMIT = 10
const STATS_LIMIT = 100

function campaignType(campaign) {
  const settings = campaign.settings && typeof campaign.settings === 'object' && !Array.isArray(campaign.settings)
    ? campaign.settings
    : {}
  const configured = Array.isArray(settings.captureChannels) ? settings.captureChannels : []
  const hints = new Set([settings.source, settings.channel, ...configured].filter(Boolean))
  const detected = []
  if (campaign.adPlaybookId || campaign.metaCampaignId || hints.has('meta_ads') || hints.has('ads')) detected.push('ads')
  if (hints.has('organic_social') || hints.has('social')) detected.push('social')
  if (hints.has('outbound_prospecting') || hints.has('prospecting')) detected.push('prospecting')
  if (detected.length > 1) return 'multichannel'
  return detected[0] || 'outbound'
}

function toRow(campaign) {
  const totalLeads = campaign.totalLeads || 0
  const contacted = campaign.contacted || 0
  const meetingsScheduled = campaign.meetingsScheduled || 0
  const progress = totalLeads > 0 ? Math.min(100, Math.round((contacted / totalLeads) * 100)) : 0
  const conversionLabel = totalLeads > 0 ? `${Math.round((meetingsScheduled / totalLeads) * 100)}%` : '—'
  return { ...campaign, type: campaignType(campaign), totalLeads, contacted, meetingsScheduled, progress, conversionLabel }
}

function formatCents(cents, locale) {
  if (cents === null || cents === undefined) return '—'
  return `${formatLocaleNumber(Math.round(cents / 100), locale)} €`
}

function StatusBadge({ status }) {
  const { t } = useI18n()
  const key = STATUS_META[status] ? status : 'draft'
  return <span className="campaign-status" style={{ '--status-color': STATUS_META[key].color }}><i />{t(`campaigns.status.${key}`)}</span>
}

function MetricCard({ Icon, label, value, detail, color }) {
  return <article className="campaign-metric-card" style={{ '--metric-color': color }}>
    <div className="campaign-metric-head"><span className="campaign-metric-icon"><Icon /></span><span>{label}</span></div>
    <strong>{value}</strong>
    <div className="campaign-metric-foot"><span>{detail}</span></div>
  </article>
}

// Embudo y mezcla reciben la vista ya calculada (src/lib/campaignsView.js):
// sin medición real ('loading' | 'plan' | 'error') muestran «—», no ceros.
function Funnel({ view }) {
  const { t } = useI18n()
  return <div className="campaign-funnel" aria-busy={!view.measured && view.noteKind === 'loading'}>
    <div className="campaign-funnel-shape">{view.steps.map(step => <div key={step.key} style={{ width: step.width, background: step.color }} />)}</div>
    <div className="campaign-funnel-list">{view.steps.map(step => <div key={step.key}><span><i style={{ background: step.color }} />{step.label}</span><strong>{step.display}</strong></div>)}</div>
    <div className="campaign-funnel-total"><span>{view.measured ? t('campaigns.funnel.conversionRate') : t('campaigns.funnel.conversionRateNote', { note: view.note })}</span><strong>{view.conversionDisplay}</strong></div>
  </div>
}

function ChannelMix({ view }) {
  const { t } = useI18n()
  if (view.state === 'unmeasured') return <div className="campaign-empty"><RiLayoutGridLine /><strong>—</strong><span>{view.noteKind === 'loading' ? t('campaigns.channelMix.calculating') : t('campaigns.channelMix.unmeasured')}</span></div>
  if (view.state === 'empty') return <div className="campaign-empty"><RiLayoutGridLine /><strong>{t('campaigns.channelMix.emptyTitle')}</strong><span>{t('campaigns.channelMix.emptyHint')}</span></div>
  const total = view.channels.reduce((sum, channel) => sum + channel.count, 0)
  return <div className="campaign-channel-mix">
    <div className="campaign-donut" style={{ background: view.gradient }}><span>{total}<br /><small>{t('campaigns.channelMix.unit')}</small></span></div>
    <div className="campaign-channel-legend">
      {view.channels.map(channel => <div key={channel.id}><span><i style={{ background: channel.color }} />{channel.label}</span><strong>{channel.pct}%</strong></div>)}
    </div>
  </div>
}

function CampaignRow({ campaign, busy, onOpen, onToggleStatus, onEdit, onDuplicate }) {
  const { t, locale } = useI18n()
  const type = TYPE_META[campaign.type] || TYPE_META.outbound
  const Icon = type.Icon
  const toggleLabel = campaign.status === 'active' ? t('campaigns.row.pause') : t('campaigns.row.activate')
  // Los botones paran la propagación para no abrir el detalle al pulsarlos.
  const act = handler => event => { event.stopPropagation(); handler(campaign) }
  return <article className="campaign-row" onClick={() => onOpen(campaign.id)}>
    <div className="campaign-name-cell"><span className="campaign-row-icon" style={{ '--type-color': type.color }}><Icon /></span><div><strong>{campaign.name}</strong><span>{campaign.objective || t('campaigns.row.noObjective')}</span></div></div>
    <StatusBadge status={campaign.status} />
    <div className="campaign-progress-cell"><div><span>{campaign.progress}%</span><small>{campaign.progress === 100 ? t('campaigns.row.completed') : campaign.progress ? t('campaigns.row.inProgress') : t('campaigns.row.notStarted')}</small></div><div className="campaign-progress"><i style={{ width: `${campaign.progress}%`, background: type.color }} /></div></div>
    <strong className="campaign-number-cell">{formatLocaleNumber(campaign.totalLeads, locale)}</strong>
    <div className="campaign-response-cell"><strong>{formatLocaleNumber(campaign.contacted, locale)}</strong><span>{campaign.conversionLabel}</span></div>
    <span className="campaign-agent-cell">{campaign.agent?.name || t('campaigns.row.noAgent')}</span>
    <div className="campaign-row-actions">
      <button type="button" className="campaign-icon-button" title={toggleLabel} aria-label={t('campaigns.row.toggleAria', { action: toggleLabel, name: campaign.name })} disabled={busy} onClick={act(onToggleStatus)}>{campaign.status === 'active' ? <RiPauseCircleLine /> : <RiPlayCircleLine />}</button>
      <button type="button" className="campaign-icon-button" title={t('campaigns.row.editTitle')} aria-label={t('campaigns.row.editAria', { name: campaign.name })} disabled={busy} onClick={act(onEdit)}><RiEditLine /></button>
      <button type="button" className="campaign-icon-button" title={t('campaigns.row.duplicateTitle')} aria-label={t('campaigns.row.duplicateAria', { name: campaign.name })} disabled={busy} onClick={act(onDuplicate)}><RiFileCopyLine /></button>
      <button type="button" className="campaign-icon-button" title={t('campaigns.row.openTitle')} aria-label={t('campaigns.row.openAria', { name: campaign.name })} onClick={event => { event.stopPropagation(); onOpen(campaign.id) }}><RiArrowRightLine /></button>
    </div>
  </article>
}

// Modal de crear y de editar (nombre, objetivo y presupuesto). En edición usa
// el PUT /api/campaigns/:id existente; el resto se edita en /campanas/:id.
function CampaignFormModal({ initial = null, onClose, onSubmit, saving }) {
  const { t } = useI18n()
  const editing = Boolean(initial)
  const [name, setName] = useState(initial?.name || '')
  const [objective, setObjective] = useState(initial?.objective || '')
  const [budget, setBudget] = useState(initial?.budgetCents !== null && initial?.budgetCents !== undefined ? String(initial.budgetCents / 100) : '')
  const [formError, setFormError] = useState({ field: '', message: '' })
  const titleId = `campaign-form-title-${useId().replaceAll(':', '')}`
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape' && !saving) onCloseRef.current() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saving])

  function submit(event) {
    event.preventDefault()
    const result = validateCampaignForm({ name, objective, budget }, { editing, t })
    if (!result.ok) { setFormError({ field: result.field, message: result.error }); return }
    setFormError({ field: '', message: '' })
    onSubmit(result.payload)
  }

  return <div className="campaign-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && !saving && onClose()}>
    <form className="campaign-create-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} noValidate>
      <div className="campaign-modal-head"><div><span>{editing ? t('campaigns.form.editKicker') : t('campaigns.form.createKicker')}</span><h2 id={titleId}>{editing ? initial.name : t('campaigns.form.createTitle')}</h2><p>{editing ? t('campaigns.form.editHint') : t('campaigns.form.createHint')}</p></div><button type="button" className="campaign-icon-button" onClick={onClose} aria-label={t('campaigns.form.close')}><RiCloseLine /></button></div>
      {formError.message && <p role="alert" className="campaign-form-error">{formError.message}</p>}
      <div className="campaign-form-grid">
        <label>{t('campaigns.form.name')}<input autoFocus maxLength={140} value={name} onChange={event => setName(event.target.value)} placeholder={t('campaigns.form.namePlaceholder')} aria-invalid={formError.field === 'name' || undefined} /></label>
        <label>{t('campaigns.form.objective')}<textarea maxLength={2000} value={objective} onChange={event => setObjective(event.target.value)} placeholder={t('campaigns.form.objectivePlaceholder')} rows="3" aria-invalid={formError.field === 'objective' || undefined} /></label>
        <label>{t('campaigns.form.budget')}<input type="number" min="0" step="0.01" inputMode="decimal" value={budget} onChange={event => setBudget(event.target.value)} aria-invalid={formError.field === 'budget' || undefined} /><small>{editing ? t('campaigns.form.budgetEditHint') : t('campaigns.form.budgetCreateHint')}</small></label>
      </div>
      <div className="campaign-modal-actions"><button type="button" className="campaign-button ghost" onClick={onClose} disabled={saving}>{t('campaigns.form.cancel')}</button><button className="campaign-button primary" type="submit" disabled={saving}>{editing ? (saving ? t('campaigns.form.saving') : t('campaigns.form.saveChanges')) : (saving ? t('campaigns.form.creating') : t('campaigns.form.create'))} <RiArrowRightLine /></button></div>
    </form>
  </div>
}

export default function Campaigns() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  // Solo la primera carga usa la pantalla completa; después se atenúa la tabla
  // para no desmontar la página (el buscador perdía el foco en cada tecla).
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [error, setError] = useState('')
  const [formModal, setFormModal] = useState(null) // null | { mode: 'create' } | { mode: 'edit', campaign }
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null) // { message, tone: 'ok' | 'error' }
  const [pendingId, setPendingId] = useState('')
  const [startPrompt, setStartPrompt] = useState(null) // { campaign, preview }
  const [allCampaigns, setAllCampaigns] = useState([])
  // 'loading' | 'live' | 'plan' | 'error' — mientras no sea 'live' las tarjetas
  // muestran «—» en vez de ceros que parecerían actividad real.
  const [statsStatus, setStatsStatus] = useState('loading')
  const [statsMessage, setStatsMessage] = useState('')
  const listRequest = useRef(0)
  const noticeTimer = useRef(0)

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => { setPage(1) }, [status])
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  async function loadCampaigns() {
    // Descarta respuestas antiguas si el usuario sigue escribiendo o paginando.
    const requestId = ++listRequest.current
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (status !== 'all') params.set('status', status)
      if (search) params.set('search', search)
      const res = await apiFetch(`/api/campaigns?${params}`)
      if (!res.ok) throw new Error(await readApiError(res, t('campaigns.errors.load')))
      const data = await res.json()
      if (requestId !== listRequest.current) return
      setItems((data.items || []).map(toRow))
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch (err) {
      if (requestId !== listRequest.current) return
      setError(err?.message || t('campaigns.errors.load'))
      setItems([])
    } finally {
      if (requestId === listRequest.current) {
        setLoading(false)
        setLoadedOnce(true)
      }
    }
  }

  async function loadStats() {
    setStatsStatus('loading')
    setStatsMessage('')
    try {
      const res = await apiFetch(`/api/campaigns?page=1&limit=${STATS_LIMIT}`)
      if (!res.ok) {
        const gate = await readPlanGate(res)
        setAllCampaigns([])
        setStatsStatus(gate ? 'plan' : 'error')
        setStatsMessage(gate ? planGateMessage(gate, locale) : t('campaigns.errors.stats'))
        return
      }
      const data = await res.json()
      setAllCampaigns((data.items || []).map(toRow))
      setStatsStatus('live')
    } catch {
      setAllCampaigns([])
      setStatsStatus('error')
      setStatsMessage(t('campaigns.errors.stats'))
    }
  }

  useEffect(() => { loadCampaigns() }, [page, status, search])
  useEffect(() => { loadStats() }, [])

  const stats = useMemo(() => summarizeCampaigns(allCampaigns), [allCampaigns])
  const numberFormat = value => formatLocaleNumber(value, locale)
  const funnelView = buildFunnelView(stats, statsStatus, numberFormat, t)
  const channelView = buildChannelMixView(stats, statsStatus, t)

  // Mismo patrón que Automatizaciones: sin datos reales no se pinta un 0.
  const metricValue = value => (statsStatus === 'live' ? value : '—')

  function notify(message, tone = 'ok') {
    window.clearTimeout(noticeTimer.current)
    setNotice({ message, tone })
    noticeTimer.current = window.setTimeout(() => setNotice(null), tone === 'error' ? 6000 : 2600)
  }

  function refreshAll() {
    loadCampaigns()
    loadStats()
  }

  // Pausar no encola nada: va directo. Activar encola llamadas reales, así que
  // primero se pide la vista previa (solo lectura) y se confirma con el número.
  async function toggleStatus(campaign) {
    if (pendingId) return
    setPendingId(campaign.id)
    try {
      if (campaign.status === 'active') {
        const res = await apiFetch(`/api/campaigns/${campaign.id}/pause`, { method: 'POST' })
        if (!res.ok) throw new Error(await readApiError(res, t('campaigns.errors.pause')))
        notify(t('campaigns.notices.paused'))
        refreshAll()
        return
      }
      const res = await apiFetch(`/api/campaigns/${campaign.id}/start-preview`)
      if (!res.ok) throw new Error(await readApiError(res, t('campaigns.errors.preview')))
      setStartPrompt({ campaign, preview: await res.json() })
    } catch (err) {
      notify(err?.message || t('campaigns.errors.toggle'), 'error')
    } finally {
      setPendingId('')
    }
  }

  // Se ejecuta desde el ConfirmDialog; no relanza el error para que el
  // diálogo se cierre y el motivo quede en el aviso.
  async function confirmStart(campaign) {
    try {
      const res = await apiFetch(`/api/campaigns/${campaign.id}/start`, { method: 'POST' })
      if (!res.ok) throw new Error(await readApiError(res, t('campaigns.errors.start')))
      const result = await res.json().catch(() => ({}))
      const queued = Number(result?.queued) || 0
      notify(queued ? t(`campaigns.notices.activatedQueued.${queued === 1 ? 'one' : 'other'}`, { count: queued }) : t('campaigns.notices.activatedNone'))
      refreshAll()
    } catch (err) {
      notify(err?.message || t('campaigns.errors.start'), 'error')
    }
  }

  async function duplicateCampaign(campaign) {
    if (pendingId) return
    setPendingId(campaign.id)
    try {
      const res = await apiFetch(`/api/campaigns/${campaign.id}/duplicate`, { method: 'POST' })
      if (!res.ok) throw new Error(await readApiError(res, t('campaigns.errors.duplicate')))
      const copy = await res.json()
      notify(t('campaigns.notices.duplicated', { name: copy?.name || t('campaigns.notices.copyName') }))
      refreshAll()
    } catch (err) {
      notify(err?.message || t('campaigns.errors.duplicate'), 'error')
    } finally {
      setPendingId('')
    }
  }

  async function submitForm(payload) {
    const editing = formModal?.mode === 'edit'
    setSaving(true)
    try {
      const res = editing
        ? await apiFetch(`/api/campaigns/${formModal.campaign.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) throw new Error(await readApiError(res, editing ? t('campaigns.errors.save') : t('campaigns.errors.create')))
      setFormModal(null)
      if (editing) {
        notify(t('campaigns.notices.updated'))
        refreshAll()
        return
      }
      const created = await res.json()
      notify(t('campaigns.notices.created'))
      navigate(`/campanas/${created.id}`)
    } catch (err) {
      notify(err?.message || t('campaigns.errors.save'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const statusTabs = [
    { id: 'all', label: t('campaigns.status.all'), color: 'var(--violet)' },
    ...Object.entries(STATUS_META).map(([id, meta]) => ({ id, label: t(`campaigns.status.${id}`), color: meta.color })),
  ]

  if (!loadedOnce) return <PageLoadingState label={t('campaigns.loading')} />

  const startView = startPrompt ? startConfirmation(startPrompt.preview, t) : null
  const refreshing = loading && loadedOnce

  return <main className="dark-scroll campaign-page">
    <ProductPageHeader Icon={RiMegaphoneLine} title={t('modules.campaignsTitle')} description={t('modules.campaignsSubtitle')} actions={<><button className="campaign-button soft" onClick={() => navigate('/captacion/cerrar')}>{t('campaigns.viewFunnel')} <RiArrowRightLine /></button><button className="campaign-button primary" onClick={() => setFormModal({ mode: 'create' })}><RiAddLine /> {t('modules.newCampaign')}</button></>} />


    {statsStatus !== 'live' && statsStatus !== 'loading' && <DataStatusBanner status={statsStatus} message={statsMessage} onRetry={statsStatus === 'error' ? loadStats : undefined} />}

    <section className="campaign-metrics-row">
      <MetricCard Icon={RiGroupLine} label={t('campaigns.metrics.totalLeads')} value={metricValue(numberFormat(stats.totalLeads))} detail={t('campaigns.metrics.totalLeadsDetail')} color="#8b5cf6" />
      <MetricCard Icon={RiPhoneLine} label={t('campaigns.metrics.contacted')} value={metricValue(numberFormat(stats.contacted))} detail={t('campaigns.metrics.contactedDetail')} color="#22d3ee" />
      <MetricCard Icon={RiBarChartGroupedLine} label={t('campaigns.metrics.conversion')} value={metricValue(`${stats.conversionRate}%`)} detail={t('campaigns.metrics.conversionDetail')} color="#ec4899" />
      <MetricCard Icon={RiWallet3Line} label={t('campaigns.metrics.budget')} value={metricValue(formatCents(stats.budgetTotalCents, locale))} detail={t('campaigns.metrics.budgetDetail')} color="#34d399" />
    </section>

    <section className="campaigns-layout">
      <div className="campaigns-list-panel" id="campaign-list">
        <div className="campaign-type-tabs" role="tablist" aria-label={t('campaigns.list.filterAria')}>{statusTabs.map(tab => <button key={tab.id} role="tab" aria-selected={status === tab.id} className={status === tab.id ? 'active' : ''} onClick={() => setStatus(tab.id)} style={{ '--tab-color': tab.color }}>{tab.label}</button>)}</div>
        <div className="campaigns-list-toolbar"><div className="campaign-search"><RiSearchLine /><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder={t('campaigns.list.searchPlaceholder')} aria-label={t('campaigns.list.searchAria')} /></div></div>
        <div className="campaigns-list-heading"><div><h2>{t('modules.allCampaigns')}</h2><span aria-live="polite">{refreshing ? t('campaigns.list.refreshing') : t('campaigns.list.visibleOf', { count: items.length, total })}</span></div></div>
        <div className="campaign-table-head"><span>{t('campaigns.list.headers.campaign')}</span><span>{t('campaigns.list.headers.status')}</span><span>{t('campaigns.list.headers.progress')}</span><span>{t('campaigns.list.headers.leads')}</span><span>{t('campaigns.list.headers.contacted')}</span><span>{t('campaigns.list.headers.agent')}</span><span /></div>
        <div className={`campaign-rows${refreshing ? ' is-refreshing' : ''}`} aria-busy={refreshing}>
          {error ? <div className="campaign-empty" role="alert"><strong>{error}</strong><button className="campaign-button ghost" onClick={loadCampaigns}>{t('campaigns.list.retry')}</button></div>
            : items.length ? items.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} busy={pendingId === campaign.id} onOpen={id => navigate(`/campanas/${id}`)} onToggleStatus={toggleStatus} onEdit={row => setFormModal({ mode: 'edit', campaign: row })} onDuplicate={duplicateCampaign} />)
            : <div className="campaign-empty"><RiSearchLine /><strong>{search.trim() || status !== 'all' ? t('campaigns.list.noMatches') : t('campaigns.list.empty')}</strong><span>{search.trim() || status !== 'all' ? t('campaigns.list.noMatchesHint') : t('campaigns.list.emptyHint')}</span><button className="campaign-button primary" onClick={() => setFormModal({ mode: 'create' })}>{t('campaigns.list.create')}</button></div>}
        </div>
        <div className="campaigns-list-footer">
          <span>{t('campaigns.list.showing', { from: items.length ? (page - 1) * LIMIT + 1 : 0, to: (page - 1) * LIMIT + items.length, total })}</span>
          <div>
            <button disabled={page <= 1 || refreshing} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label={t('campaigns.list.prevPage')}>‹</button>
            <button className="current" aria-current="page">{page}</button>
            <button disabled={page >= totalPages || refreshing} onClick={() => setPage(p => Math.min(totalPages, p + 1))} aria-label={t('campaigns.list.nextPage')}>›</button>
          </div>
          <label>{t('campaigns.list.perPage', { count: LIMIT })}</label>
        </div>
      </div>
      <aside className="campaigns-rail">
        <section className="campaign-rail-panel performance-panel"><div className="campaign-panel-heading"><div><h2>{t('campaigns.rail.performance')}</h2><span>{t('campaigns.rail.allCampaigns')}</span></div></div><div className="campaign-rail-section-title">{t('campaigns.rail.funnel')}</div><Funnel view={funnelView} /><div className="campaign-divider" /><div className="campaign-rail-section-title">{t('campaigns.rail.channelMix')}</div><ChannelMix view={channelView} /></section>
      </aside>
    </section>
    {notice && <div className={`campaign-toast${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'error' ? <RiErrorWarningLine /> : <RiCheckboxCircleLine />}{notice.message}<button onClick={() => setNotice(null)} aria-label={t('campaigns.closeNotice')}><RiCloseLine /></button></div>}
    {formModal && <CampaignFormModal initial={formModal.mode === 'edit' ? formModal.campaign : null} onClose={() => setFormModal(null)} onSubmit={submitForm} saving={saving} />}
    {startPrompt && startView && <ConfirmDialog
      title={startView.title}
      message={startView.message}
      confirmText={startView.confirmText}
      cancelText={t('campaigns.form.cancel')}
      tone={startView.count > 0 ? 'danger' : 'primary'}
      onConfirm={() => confirmStart(startPrompt.campaign)}
      onClose={() => setStartPrompt(null)}
    />}
  </main>
}
