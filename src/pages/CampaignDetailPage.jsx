import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  RiArrowDownSLine, RiArrowRightLine,
  RiCalendar2Line, RiCheckboxCircleLine, RiCheckLine, RiCloseLine, RiEditLine,
  RiErrorWarningLine, RiExternalLinkLine, RiGroupLine, RiFileCopyLine,
  RiPauseCircleLine, RiPlayCircleLine, RiSendPlaneLine,
  RiShareForwardLine, RiSparkling2Line, RiUserLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { outcomeLabel } from '../lib/callOutcome'
import { describeCallBlock } from '../lib/callBlockLabels'
import { readApiError, startConfirmation, validateCampaignForm } from '../lib/campaignsView'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import PageLoadingState from '../components/ui/PageLoadingState'
import { formatLocaleDate, formatLocaleNumber, useI18n } from '../i18n'
import '../components/campaigns.css'

// Etiquetas en campaignDetail.types.* / campaignDetail.status.* (i18n).
const TYPE_IDS = ['outbound', 'ads']

function campaignType(campaign) {
  const channels = Array.isArray(campaign.settings?.captureChannels) ? campaign.settings.captureChannels : []
  return campaign.adPlaybookId || campaign.metaCampaignId || campaign.adStatus || campaign.adAssets || channels.includes('paid_ads') ? 'ads' : 'outbound'
}

const STATUS_META = {
  active: { color: 'var(--success)' },
  paused: { color: 'var(--warn)' },
  draft: { color: 'var(--muted)' },
  done: { color: 'var(--violet)' },
}

// `slug` es el valor de ?tab= (se conserva el histórico para no romper enlaces).
const TABS = [
  { id: 'summary', slug: 'resumen' },
  { id: 'ad', slug: 'anuncio' },
  { id: 'economy', slug: 'economía' },
  { id: 'audience', slug: 'audiencia' },
  { id: 'conversations', slug: 'conversaciones' },
  { id: 'content', slug: 'contenido' },
  { id: 'automation', slug: 'automatización' },
  { id: 'settings', slug: 'configuración' },
]

const DEFAULT_SETTINGS = { scoring: true, alerts: true, organic: false, frequency: true }

const ACTIVITY_META = {
  lead: { color: 'var(--violet)', Icon: RiGroupLine },
  call: { color: 'var(--cyan)', Icon: RiSendPlaneLine },
  meeting: { color: 'var(--pink)', Icon: RiCalendar2Line },
}

function StatusBadge({ status }) {
  const { t } = useI18n()
  const key = STATUS_META[status] ? status : 'draft'
  return <span className="campaign-status" style={{ '--status-color': STATUS_META[key].color }}><i />{t(`campaignDetail.status.${key}`)}</span>
}

function Overview({ campaign }) {
  const { t, locale } = useI18n()
  const number = value => formatLocaleNumber(value, locale)
  const totalLeads = campaign.totalLeads || 0
  const contacted = campaign.contacted || 0
  const meetingsScheduled = campaign.meetingsScheduled || 0
  const conversionRate = totalLeads > 0 ? Math.round((meetingsScheduled / totalLeads) * 1000) / 10 : 0
  const steps = [
    { key: 'leads', label: t('campaignDetail.overview.leads'), value: totalLeads, width: '100%', color: 'var(--violet-deep)' },
    { key: 'contacted', label: t('campaignDetail.overview.contacted'), value: contacted, width: `${totalLeads > 0 ? Math.min(100, Math.round((contacted / totalLeads) * 100)) : 0}%`, color: 'var(--cyan)' },
    { key: 'meetings', label: t('campaignDetail.overview.meetingsScheduled'), value: meetingsScheduled, width: `${totalLeads > 0 ? Math.min(100, Math.round((meetingsScheduled / totalLeads) * 100)) : 0}%`, color: 'var(--pink)' },
  ]
  return <>
    <div className="campaign-summary-grid">
      <section className="campaign-detail-card campaign-funnel-large">
        <div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.overview.funnelTitle')}</h2><p>{t('campaignDetail.overview.funnelHint')}</p></div></div>
        <div className="campaign-funnel">
          <div className="campaign-funnel-shape">{steps.map(step => <div key={step.key} style={{ width: step.width, background: step.color }} />)}</div>
          <div className="campaign-funnel-list">{steps.map(step => <div key={step.key}><span><i style={{ background: step.color }} />{step.label}</span><strong>{number(step.value)}</strong></div>)}</div>
          <div className="campaign-funnel-total"><span>{t('campaignDetail.overview.conversionRate')}</span><strong>{conversionRate}%</strong></div>
        </div>
      </section>
      <section className="campaign-detail-card campaign-chart-card">
        <div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.overview.resultsTitle')}</h2><p>{t('campaignDetail.overview.resultsHint')}</p></div></div>
        <div className="campaign-chart-kpis">
          <div><span>{t('campaignDetail.overview.leads')}</span><strong>{number(totalLeads)}</strong></div>
          <div><span>{t('campaignDetail.overview.contacted')}</span><strong>{number(contacted)}</strong></div>
          <div><span>{t('campaignDetail.overview.meetings')}</span><strong>{number(meetingsScheduled)}</strong></div>
          <div><span>{t('campaignDetail.overview.conversion')}</span><strong>{conversionRate}%</strong></div>
        </div>
      </section>
    </div>
    <section className="campaign-detail-card campaign-action-composer"><div className="campaign-detail-card-header"><div><h2><RiSparkling2Line /> {t('campaignDetail.overview.contentTitle')}</h2><p>{t('campaignDetail.overview.contentHint')}</p></div></div><div className="campaign-composer-empty"><span>{t('campaignDetail.overview.contentEmpty')}</span></div></section>
  </>
}

function CampaignAdsPanel({ campaign }) {
  const { t, locale } = useI18n()
  const [status, setStatus] = useState(null)
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [statusResponse, insightsResponse] = await Promise.all([
        apiFetch(`/api/ads/campaigns/${campaign.id}/status`),
        apiFetch(`/api/ads/campaigns/${campaign.id}/insights`),
      ])
      if (!statusResponse.ok || !insightsResponse.ok) throw new Error('ads-detail-failed')
      const [statusData, insightsData] = await Promise.all([statusResponse.json(), insightsResponse.json()])
      setStatus(statusData)
      setInsights(Array.isArray(insightsData) ? insightsData : [])
    } catch {
      setNotice(t('campaignDetail.ads.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [campaign.id])

  async function runAction(nextAction) {
    setAction(nextAction)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${campaign.id}/${nextAction}`, { method: 'POST' })
      if (!response.ok) throw new Error('ads-action-failed')
      setNotice(nextAction === 'publish' ? t('campaignDetail.ads.published') : nextAction === 'pause' ? t('campaignDetail.ads.paused') : t('campaignDetail.ads.activated'))
      await load()
    } catch {
      setNotice(t('campaignDetail.ads.actionError'))
    } finally {
      setAction('')
    }
  }

  if (loading) return <section className="campaign-detail-card"><div className="campaign-composer-empty"><span>{t('campaignDetail.ads.loading')}</span></div></section>

  const latest = insights[insights.length - 1]
  const adStatus = status?.adStatus || campaign.adStatus || 'draft'
  const hasRemoteObjects = Boolean(status?.metaCampaignId || campaign.metaCampaignId)
  const isActive = adStatus === 'active'
  const formatEuro = value => value == null ? '—' : `${formatLocaleNumber(value / 100, locale, { maximumFractionDigits: 2 })} €`
  const pending = t('campaignDetail.ads.pending')

  return <section className="campaign-detail-card">
    <div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.ads.title')}</h2><p>{t('campaignDetail.ads.hint')}</p></div><span className="campaign-status"><i />{adStatus}</span></div>
    {notice && <div className="campaign-composer-empty" style={{ marginBottom: 14 }} role="status"><span>{notice}</span></div>}
    <div className="campaign-chart-kpis">
      <div><span>{t('campaignDetail.ads.spend')}</span><strong>{formatEuro(latest?.spendCents ?? 0)}</strong></div>
      <div><span>{t('campaignDetail.ads.leads')}</span><strong>{formatLocaleNumber(latest?.leadsCount ?? campaign.totalLeads ?? 0, locale)}</strong></div>
      <div><span>{t('campaignDetail.ads.cpl')}</span><strong>{formatEuro(latest?.costPerLeadCents)}</strong></div>
      <div><span>{t('campaignDetail.ads.impressions')}</span><strong>{formatLocaleNumber(latest?.impressions ?? 0, locale)}</strong></div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
      {!hasRemoteObjects ? <button className="campaign-button primary" onClick={() => runAction('publish')} disabled={Boolean(action)}>{action === 'publish' ? t('campaignDetail.ads.sending') : t('campaignDetail.ads.publish')}</button> : isActive ? <button className="campaign-button ghost" onClick={() => runAction('pause')} disabled={Boolean(action)}>{action === 'pause' ? t('campaignDetail.ads.pausing') : t('campaignDetail.ads.pause')}</button> : <button className="campaign-button primary" onClick={() => runAction('activate')} disabled={Boolean(action)}>{action === 'activate' ? t('campaignDetail.ads.activating') : t('campaignDetail.ads.activate')}</button>}
    </div>
    <div className="campaign-composer-empty" style={{ marginTop: 18 }}><span>{t('campaignDetail.ads.remoteIds', { campaign: status?.metaCampaignId || campaign.metaCampaignId || pending, adSet: status?.metaAdSetId || campaign.metaAdSetId || pending, ad: status?.metaAdId || campaign.metaAdId || pending })}</span></div>
  </section>
}

// Lista auxiliar de una pestaña. `items` es null mientras carga; un fallo de
// red o un HTTP no-OK deja `error` con el motivo real en vez de fingir «vacío».
function useCampaignList(url, fallbackError) {
  const [state, setState] = useState({ items: null, error: '' })
  useEffect(() => {
    let cancelled = false
    setState({ items: null, error: '' })
    apiFetch(url).then(async r => {
      if (!r.ok) throw new Error(await readApiError(r, fallbackError))
      return r.json()
    }).then(body => {
      if (!cancelled) setState({ items: Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [], error: '' })
    }).catch(err => { if (!cancelled) setState({ items: null, error: err?.message || fallbackError }) })
    return () => { cancelled = true }
  }, [url])
  return state
}

function ListState({ state, loading, empty }) {
  if (state.error) return <div className="campaign-composer-empty" role="alert"><span>{state.error}</span></div>
  if (state.items === null) return <div className="campaign-composer-empty"><span>{loading}</span></div>
  return <div className="campaign-composer-empty"><span>{empty}</span></div>
}

const AUDIT_ACTIONS = new Set([
  'ads.decision.approved', 'ads.decision.rejected', 'ads.action.executed', 'ads.action.failed', 'ads.action.compensated',
  'ads.policy.updated', 'ads.autonomy.stopped', 'ads.autonomy.resumed', 'ads.rule.promoted', 'ads.rule.degraded',
])
const COHORTS = new Set(['mature', 'maturing', 'insufficient'])
const SIGNALS = new Set(['clic', 'lead', 'qualified_lead', 'opportunity', 'sale'])

function EconomyTab({ campaignId }) {
  const { t, locale } = useI18n()
  const money = cents => cents == null ? t('campaignDetail.economy.noMeasurement') : `${formatLocaleNumber(cents / 100, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  const cohort = value => (COHORTS.has(value) ? t(`campaignDetail.economy.cohort.${value}`) : value)
  const dateTime = value => formatLocaleDate(new Date(value), locale, { dateStyle: 'short', timeStyle: 'short' })
  const [data, setData] = useState(undefined)
  const [decisions, setDecisions] = useState([])
  const [audit, setAudit] = useState([])

  useEffect(() => {
    let active = true
    apiFetch(`/api/ads/campaigns/${campaignId}/attribution`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active) setData(d) })
      .catch(() => { if (active) setData(null) })
    apiFetch(`/api/ads/campaigns/${campaignId}/decisions`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (active) setDecisions(Array.isArray(d) ? d : []) })
      .catch(() => { if (active) setDecisions([]) })
    apiFetch('/api/ads/audit?limit=25')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (active) setAudit(Array.isArray(d) ? d : []) })
      .catch(() => { if (active) setAudit([]) })
    return () => { active = false }
  }, [campaignId])

  if (data === undefined) return <section className="campaign-detail-card"><div className="campaign-composer-empty"><span>{t('campaignDetail.economy.loading')}</span></div></section>
  if (data === null) return <section className="campaign-detail-card"><div className="campaign-composer-empty"><span>{t('campaignDetail.economy.empty')}</span></div></section>

  const targets = data.targets
  return <>
    <section className="campaign-detail-card">
      <div className="campaign-detail-card-header">
        <div><h2>{t('campaignDetail.economy.title')}</h2><p>{t('campaignDetail.economy.hint', { days: data.periodDays })}</p></div>
        <span className="campaign-status"><i />{SIGNALS.has(data.deepestEligibleSignal) ? t(`campaignDetail.economy.signal.${data.deepestEligibleSignal}`) : '—'}</span>
      </div>
      <div className="campaign-tasks">
        {data.funnel.map(step => (
          <div className="campaign-task" key={step.key}>
            <div><span>{step.label}</span><small>{step.conversionPct == null ? t('campaignDetail.economy.noRate') : t('campaignDetail.economy.stepRate', { pct: step.conversionPct })}</small></div>
            <time>{step.value == null ? t('campaignDetail.economy.noMeasurement') : formatLocaleNumber(step.value, locale)}</time>
          </div>
        ))}
      </div>
      <div className="campaign-tasks" style={{ marginTop: 10 }}>
        <div className="campaign-task"><div><span>{t('campaignDetail.economy.cpl')}</span><small>{cohort(data.cohortStatus)}</small></div><time>{money(data.cplCents)}</time></div>
        <div className="campaign-task"><div><span>{t('campaignDetail.economy.cpql')}</span><small>{targets?.maxCpqlCents ? t('campaignDetail.economy.target', { value: money(targets.maxCpqlCents) }) : t('campaignDetail.economy.noTarget')}</small></div><time>{money(data.cpqlCents)}</time></div>
        <div className="campaign-task"><div><span>{t('campaignDetail.economy.cac')}</span><small>{targets?.maxCacCents ? t('campaignDetail.economy.target', { value: money(targets.maxCacCents) }) : t('campaignDetail.economy.noTarget')}</small></div><time>{money(data.cacCents)}</time></div>
        <div className="campaign-task"><div><span>{t('campaignDetail.economy.roas')}</span><small>{data.saleLatencyDays == null ? t('campaignDetail.economy.noSales') : t('campaignDetail.economy.saleLatency', { days: data.saleLatencyDays })}</small></div><time>{data.roas ?? t('campaignDetail.economy.noMeasurement')}</time></div>
      </div>
      {targets?.explanation && <p className="campaign-detail-empty-note" style={{ marginTop: 10 }}>{targets.explanation}</p>}
    </section>

    {data.breakdown?.ads?.length > 0 && (
      <section className="campaign-detail-card">
        <div className="campaign-detail-card-header">
          <div><h2>{t('campaignDetail.economy.byAdTitle')}</h2><p>{t('campaignDetail.economy.byAdHint')}</p></div>
        </div>
        <div className="campaign-tasks">
          {data.breakdown.ads.map(ad => (
            <div className="campaign-task" key={ad.metaAdId}>
              <div>
                <span>{t('campaignDetail.economy.ad', { id: ad.metaAdId })}</span>
                <small>{t('campaignDetail.economy.adStats', { leads: ad.leads, qualified: ad.qualified })}{ad.qualificationPct != null ? t('campaignDetail.economy.adQualificationPct', { pct: ad.qualificationPct }) : ''}{ad.sales ? t('campaignDetail.economy.adSales', { count: ad.sales }) : ''}</small>
              </div>
              <time>{ad.qualified}</time>
            </div>
          ))}
          {/* Los leads anteriores a que se guardara el identificador de anuncio
              no lo tendrán nunca. Se muestran aparte en vez de repartirlos. */}
          {data.breakdown.unattributed && (
            <div className="campaign-task">
              <div>
                <span style={{ color: 'var(--dim)' }}>{t('campaignDetail.economy.unattributed')}</span>
                <small>{t('campaignDetail.economy.unattributedHint', { count: data.breakdown.unattributed.leads })}</small>
              </div>
              <time>{data.breakdown.unattributed.qualified}</time>
            </div>
          )}
        </div>
      </section>
    )}

    <section className="campaign-detail-card">
      <div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.economy.observedTitle')}</h2><p>{t('campaignDetail.economy.observedHint')}</p></div></div>
      {decisions.length === 0
        ? <div className="campaign-composer-empty"><span>{t('campaignDetail.economy.observedEmpty')}</span></div>
        : <div className="campaign-timeline campaign-decision-log">
            {decisions.map(d => (
              <div className="campaign-timeline-item" key={d.id} style={{ '--timeline-color': d.severity === 'critical' ? 'var(--danger-soft)' : d.severity === 'warning' ? 'var(--warn-soft)' : 'var(--info)' }}>
                <span className="campaign-timeline-dot" />
                <div>
                  <small>{dateTime(d.createdAt)} · {t('campaignDetail.economy.confidence', { value: d.confidence })} · {cohort(d.cohortStatus)}</small>
                  <strong>{d.title}</strong>
                  <p>{d.explanation}</p>
                  <p><b>{t('campaignDetail.economy.recommendation')}</b> {d.recommendation}</p>
                  {/* El estado y quién lo decidió es lo que convierte esto en
                      auditoría y no en una lista de avisos. */}
                  <p style={{ color: 'var(--dim)' }}>
                    {t('campaignDetail.economy.state', { status: d.status })}
                    {d.actor ? t('campaignDetail.economy.decidedBy', { name: d.actor.name || d.actor.email }) : ''}
                    {d.decisionNote ? ` · “${d.decisionNote}”` : ''}
                    {d.actions?.length ? t('campaignDetail.economy.actions', { count: d.actions.length, list: d.actions.map(a => `${a.kind} (${a.status})`).join(', ') }) : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>}
    </section>

    {audit.length > 0 && (
      <section className="campaign-detail-card">
        <div className="campaign-detail-card-header">
          <div><h2>{t('campaignDetail.economy.auditTitle')}</h2><p>{t('campaignDetail.economy.auditHint')}</p></div>
        </div>
        <div className="campaign-tasks">
          {audit.map(entry => (
            <div className="campaign-task" key={entry.id}>
              <div>
                <span>{AUDIT_ACTIONS.has(entry.action) ? t(`campaignDetail.economy.audit.${entry.action}`) : entry.action}</span>
                <small>
                  {entry.actorType === 'system'
                    ? t('campaignDetail.economy.bySystem')
                    : entry.actor ? t('campaignDetail.economy.byActor', { name: entry.actor.name || entry.actor.email }) : t('campaignDetail.economy.noActor')}
                  {` · ${entry.entityType}`}
                </small>
              </div>
              <time>{dateTime(entry.createdAt)}</time>
            </div>
          ))}
        </div>
      </section>
    )}
  </>
}

// El listado de leads devuelve la fila completa: el último bloqueo del
// dispatch vive en customFields.lastCallBlock; `callability` solo llega si el
// backend la calcula para el listado.
function leadCallBlock(lead) {
  return lead.lastCallBlock ?? lead.callability?.lastCallBlock ?? lead.customFields?.lastCallBlock ?? null
}

function AudienceTab({ campaignId, onNavigate }) {
  const { t } = useI18n()
  const leads = useCampaignList(`/api/leads?campaignId=${campaignId}&limit=50`, t('campaignDetail.audience.loadError'))
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.audience.title')}</h2><p>{t('campaignDetail.audience.hint')}</p></div></div>
    {!leads.items?.length ? <ListState state={leads} loading={t('campaignDetail.audience.loading')} empty={t('campaignDetail.audience.empty')} />
      : <div className="campaign-tasks">{leads.items.map(lead => {
        const block = describeCallBlock(leadCallBlock(lead))
        const eligible = typeof lead.callability?.eligible === 'boolean' ? lead.callability.eligible : null
        return <div className="campaign-task" key={lead.id} role="button" tabIndex="0" style={{ cursor: 'pointer' }} onClick={() => onNavigate(`/leads/${lead.id}`)} onKeyDown={e => e.key === 'Enter' && onNavigate(`/leads/${lead.id}`)}>
          <div>
            <span>{lead.name || t('campaignDetail.audience.noName')}</span>
            <small>{[lead.company, lead.status].filter(Boolean).join(' · ') || t('campaignDetail.audience.noData')}</small>
            {eligible !== null && <small style={{ display: 'block', color: eligible ? 'var(--success)' : 'var(--warn)' }}>{eligible ? t('campaignDetail.audience.eligible') : t('campaignDetail.audience.notEligible')}</small>}
            {block && <small style={{ display: 'block', color: 'var(--warn)' }}>{t('campaignDetail.audience.lastBlock', { reason: block })}</small>}
          </div>
          <time>{lead.score != null ? t('campaignDetail.audience.score', { value: lead.score }) : ''}</time>
        </div>
      })}</div>}
  </section>
}

function ConversationsTab({ campaignId, onNavigate }) {
  const { t, locale } = useI18n()
  const calls = useCampaignList(`/api/calls?campaignId=${campaignId}&limit=50`, t('campaignDetail.conversations.loadError'))
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.conversations.title')}</h2><p>{t('campaignDetail.conversations.hint')}</p></div></div>
    {!calls.items?.length ? <ListState state={calls} loading={t('campaignDetail.conversations.loading')} empty={t('campaignDetail.conversations.empty')} />
      : <div className="campaign-tasks">{calls.items.map(call => <div className="campaign-task" key={call.id} role="button" tabIndex="0" style={{ cursor: 'pointer' }} onClick={() => onNavigate(`/llamadas/${call.id}`)} onKeyDown={e => e.key === 'Enter' && onNavigate(`/llamadas/${call.id}`)}><div><span>{call.lead?.name || t('campaignDetail.conversations.noContact')}</span><small>{[call.agent?.name, outcomeLabel(call.outcome)].filter(Boolean).join(' · ')}</small></div><time>{call.startedAt ? formatLocaleDate(new Date(call.startedAt), locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</time></div>)}</div>}
  </section>
}

function ContentTab({ campaign }) {
  const { t } = useI18n()
  const rows = [
    ['objective', t('campaignDetail.content.objective'), campaign.objective || t('campaignDetail.notDefined')],
    ['goal', t('campaignDetail.content.mainGoal'), campaign.goal || t('campaignDetail.notDefined')],
    ['landing', t('campaignDetail.content.publicLanding'), campaign.landingSlug ? `${window.location.origin}/l/${campaign.landingSlug}` : t('campaignDetail.content.noLanding')],
    ['share', t('campaignDetail.content.shareLink'), campaign.shareToken ? `${window.location.origin}/campanas/compartir/${campaign.shareToken}` : t('campaignDetail.content.noShareLink')],
    ['creatives', t('campaignDetail.content.adCreatives'), campaign.adAssets ? t('campaignDetail.content.creativesConfigured') : t('campaignDetail.content.noCreatives')],
  ]
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.content.title')}</h2><p>{t('campaignDetail.content.hint')}</p></div></div><div className="campaign-tasks">{rows.map(([key, label, value]) => <div className="campaign-task" key={key}><div><span>{label}</span><small style={{ wordBreak: 'break-all' }}>{value}</small></div>{typeof value === 'string' && value.startsWith('http') && <button className="campaign-button ghost compact" onClick={() => window.open(value, '_blank', 'noopener')}><RiExternalLinkLine /> {t('campaignDetail.content.open')}</button>}</div>)}</div></section>
}

function AutomationTab({ onNavigate }) {
  const { t } = useI18n()
  const automations = useCampaignList('/api/automations', t('campaignDetail.automation.loadError'))
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.automation.title')}</h2><p>{t('campaignDetail.automation.hint')}</p></div><button className="campaign-button ghost compact" onClick={() => onNavigate('/automatizaciones')}><RiExternalLinkLine /> {t('campaignDetail.automation.manage')}</button></div>
    {!automations.items?.length ? <ListState state={automations} loading={t('campaignDetail.automation.loading')} empty={t('campaignDetail.automation.empty')} />
      : <div className="campaign-tasks">{automations.items.map(auto => <div className="campaign-task" key={auto.id} role="button" tabIndex="0" style={{ cursor: 'pointer' }} onClick={() => onNavigate(`/automatizaciones/${auto.id}`)} onKeyDown={e => e.key === 'Enter' && onNavigate(`/automatizaciones/${auto.id}`)}><div><span>{auto.name}</span><small>{auto.isActive ? t('campaignDetail.automation.active') : t('campaignDetail.automation.paused')} · {t('campaignDetail.automation.runs', { count: auto.runsCount ?? 0 })}</small></div></div>)}</div>}
  </section>
}

const SETTING_IDS = ['scoring', 'alerts', 'organic', 'frequency']

function SettingsTab({ settings, onToggle, onSave, saving }) {
  const { t } = useI18n()
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.settings.title')}</h2><p>{t('campaignDetail.settings.hint')}</p></div><button className="campaign-button primary compact" onClick={onSave} disabled={saving}><RiCheckLine /> {saving ? t('campaignDetail.settings.saving') : t('campaignDetail.settings.save')}</button></div><div className="campaign-settings">{SETTING_IDS.map(id => { const title = t(`campaignDetail.settings.${id}`); return <div className="campaign-setting" key={id}><div><strong>{title}</strong><small>{t(`campaignDetail.settings.${id}Hint`)}</small></div><button type="button" role="switch" aria-checked={Boolean(settings[id])} className={`campaign-toggle${settings[id] ? ' on' : ''}`} aria-label={t('campaignDetail.settings.toggleAria', { name: title })} onClick={() => onToggle(id)} /></div> })}</div></section>
}

// Mismas reglas que el formulario de la lista (validateCampaignForm) más el
// campo `goal`; Escape cierra salvo mientras se guarda.
function EditModal({ campaign, onClose, onSave, saving }) {
  const { t } = useI18n()
  const [name, setName] = useState(campaign.name || '')
  const [objective, setObjective] = useState(campaign.objective || '')
  const [goal, setGoal] = useState(campaign.goal || '')
  const [budget, setBudget] = useState(campaign.budgetCents != null ? String(campaign.budgetCents / 100) : '')
  const [formError, setFormError] = useState({ field: '', message: '' })
  const titleId = `campaign-edit-title-${useId().replaceAll(':', '')}`
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape' && !saving) onCloseRef.current() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saving])

  function submit(event) {
    event.preventDefault()
    const result = validateCampaignForm({ name, objective, budget }, { editing: true, t })
    if (!result.ok) { setFormError({ field: result.field, message: result.error }); return }
    setFormError({ field: '', message: '' })
    onSave({ ...result.payload, goal: goal.trim() || null })
  }

  return <div className="campaign-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && !saving && onClose()}>
    <form className="campaign-create-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} noValidate>
      <div className="campaign-modal-head"><div><span>{t('campaignDetail.editModal.kicker')}</span><h2 id={titleId}>{t('campaignDetail.editModal.title')}</h2><p>{t('campaignDetail.editModal.hint')}</p></div><button type="button" className="campaign-icon-button" onClick={onClose} aria-label={t('campaignDetail.editModal.close')}><RiCloseLine /></button></div>
      {formError.message && <p role="alert" className="campaign-form-error">{formError.message}</p>}
      <div className="campaign-form-grid">
        <label>{t('campaignDetail.editModal.name')}<input autoFocus maxLength={140} value={name} onChange={event => setName(event.target.value)} aria-invalid={formError.field === 'name' || undefined} /></label>
        <label>{t('campaignDetail.editModal.objective')}<textarea maxLength={2000} value={objective} onChange={event => setObjective(event.target.value)} rows="4" aria-invalid={formError.field === 'objective' || undefined} /></label>
        <label>{t('campaignDetail.editModal.goal')}<input maxLength={240} value={goal} onChange={event => setGoal(event.target.value)} placeholder={t('campaignDetail.editModal.goalPlaceholder')} /></label>
        <label>{t('campaignDetail.editModal.budget')}<input type="number" min="0" step="0.01" inputMode="decimal" value={budget} onChange={event => setBudget(event.target.value)} aria-invalid={formError.field === 'budget' || undefined} /></label>
      </div>
      <div className="campaign-modal-actions"><button type="button" className="campaign-button ghost" onClick={onClose} disabled={saving}>{t('campaignDetail.editModal.cancel')}</button><button className="campaign-button primary" type="submit" disabled={saving}>{saving ? t('campaignDetail.editModal.saving') : t('campaignDetail.editModal.save')} <RiCheckLine /></button></div>
    </form>
  </div>
}

function ShareModal({ url, onClose, onCopy }) {
  const { t } = useI18n()
  const titleId = `campaign-share-title-${useId().replaceAll(':', '')}`
  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return <div className="campaign-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="campaign-create-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="campaign-modal-head"><div><span>{t('campaignDetail.shareModal.kicker')}</span><h2 id={titleId}>{t('campaignDetail.shareModal.title')}</h2><p>{t('campaignDetail.shareModal.hint')}</p></div><button type="button" className="campaign-icon-button" onClick={onClose} aria-label={t('campaignDetail.shareModal.close')}><RiCloseLine /></button></div><div className="campaign-form-grid"><label>{t('campaignDetail.shareModal.url')}<input readOnly value={url} onFocus={event => event.target.select()} /></label></div><div className="campaign-modal-actions"><button type="button" className="campaign-button ghost" onClick={onClose}>{t('campaignDetail.shareModal.close')}</button><button className="campaign-button primary" type="button" onClick={onCopy}><RiFileCopyLine /> {t('campaignDetail.shareModal.copy')}</button></div></div></div>
}

function tabFromSlug(slug) {
  return TABS.find(item => item.slug === slug || item.id === slug)?.id || 'summary'
}

export default function CampaignDetailPage() {
  const { t, locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState(() => tabFromSlug(searchParams.get('tab')))
  const [showEdit, setShowEdit] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [notice, setNotice] = useState(null) // { message, tone: 'ok' | 'error' }
  const [statusBusy, setStatusBusy] = useState(false)
  const [startPrompt, setStartPrompt] = useState(null) // vista previa de /start-preview
  const noticeTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState(false)
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setNotFound(false)
      setLoadError(false)
      try {
        const response = await apiFetch(`/api/campaigns/${id}`)
        if (response.status === 404) {
          if (!cancelled) { setCampaign(null); setNotFound(true) }
          return
        }
        if (!response.ok) throw new Error('load failed')
        const data = await response.json()
        if (cancelled) return
        setCampaign(data)
        setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) })
      } catch {
        if (!cancelled) { setCampaign(null); setLoadError(true) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function loadActivity() {
      setActivityLoading(true)
      setActivityError(false)
      try {
        const response = await apiFetch(`/api/campaigns/${id}/activity`)
        if (!response.ok) throw new Error('activity failed')
        const data = await response.json()
        if (!cancelled) setActivity(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) { setActivity([]); setActivityError(true) }
      } finally {
        if (!cancelled) setActivityLoading(false)
      }
    }
    loadActivity()
    return () => { cancelled = true }
  }, [id])

  const typeId = useMemo(() => (campaign && TYPE_IDS.includes(campaignType(campaign)) ? campaignType(campaign) : 'outbound'), [campaign])

  function selectTab(nextTab) { setTab(nextTab); setSearchParams(nextTab === 'summary' ? {} : { tab: TABS.find(item => item.id === nextTab).slug }) }
  function notify(message, tone = 'ok') {
    window.clearTimeout(noticeTimer.current)
    setNotice({ message, tone })
    noticeTimer.current = window.setTimeout(() => setNotice(null), tone === 'error' ? 6000 : 2600)
  }

  async function refreshCampaign() {
    const response = await apiFetch(`/api/campaigns/${id}`)
    if (!response.ok) return
    const data = await response.json()
    setCampaign(data)
  }

  // Pausar va directo. Activar encola llamadas reales: primero la vista previa
  // (solo lectura) y se confirma con el desglose, igual que en la lista.
  async function toggleStatus() {
    if (statusBusy) return
    setStatusBusy(true)
    try {
      if (campaign.status === 'active') {
        const response = await apiFetch(`/api/campaigns/${id}/pause`, { method: 'POST' })
        if (!response.ok) throw new Error(await readApiError(response, t('campaignDetail.errors.pause')))
        setCampaign(previous => ({ ...previous, status: 'paused' }))
        notify(t('campaignDetail.notices.paused'))
        return
      }
      const response = await apiFetch(`/api/campaigns/${id}/start-preview`)
      if (!response.ok) throw new Error(await readApiError(response, t('campaignDetail.errors.preview')))
      setStartPrompt(await response.json())
    } catch (err) {
      notify(err?.message || t('campaignDetail.errors.toggle'), 'error')
    } finally {
      setStatusBusy(false)
    }
  }

  // Desde el ConfirmDialog; el error real del backend (p. ej. 409
  // AGENT_NOT_PUBLISHED) se muestra en el aviso, no se enmascara.
  async function confirmStart() {
    try {
      const response = await apiFetch(`/api/campaigns/${id}/start`, { method: 'POST' })
      if (!response.ok) throw new Error(await readApiError(response, t('campaignDetail.errors.start')))
      const result = await response.json().catch(() => ({}))
      const queued = Number(result?.queued) || 0
      setCampaign(previous => ({ ...previous, status: 'active' }))
      notify(queued ? t(`campaignDetail.notices.activatedQueued.${queued === 1 ? 'one' : 'other'}`, { count: queued }) : t('campaignDetail.notices.activatedNone'))
      refreshCampaign().catch(() => {})
    } catch (err) {
      notify(err?.message || t('campaignDetail.errors.start'), 'error')
    }
  }

  async function saveEdit(data) {
    setSavingEdit(true)
    try {
      const response = await apiFetch(`/api/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      if (!response.ok) throw new Error(await readApiError(response, t('campaignDetail.errors.save')))
      setCampaign(previous => ({ ...previous, ...data }))
      setShowEdit(false)
      notify(t('campaignDetail.notices.saved'))
    } catch (err) {
      notify(err?.message || t('campaignDetail.errors.save'), 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  function toggleSetting(key) {
    setSettings(previous => ({ ...previous, [key]: !previous[key] }))
  }

  async function saveSettings() {
    setSavingSettings(true)
    try {
      const response = await apiFetch(`/api/campaigns/${id}`, { method: 'PUT', body: JSON.stringify({ settings }) })
      if (!response.ok) throw new Error(await readApiError(response, t('campaignDetail.errors.settings')))
      setCampaign(previous => ({ ...previous, settings }))
      notify(t('campaignDetail.notices.settingsSaved'))
    } catch (err) {
      notify(err?.message || t('campaignDetail.errors.settings'), 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  async function duplicateCampaign() {
    setShowMore(false)
    try {
      const response = await apiFetch(`/api/campaigns/${id}/duplicate`, { method: 'POST' })
      if (!response.ok) throw new Error(await readApiError(response, t('campaignDetail.errors.duplicate')))
      const copy = await response.json()
      notify(t('campaignDetail.notices.duplicated'))
      navigate(`/campanas/${copy.id}`)
    } catch (err) {
      notify(err?.message || t('campaignDetail.errors.duplicate'), 'error')
    }
  }

  async function shareCampaign() {
    setShowMore(false)
    try {
      const response = await apiFetch(`/api/campaigns/${id}/share-link`, { method: 'POST' })
      if (!response.ok) throw new Error(await readApiError(response, t('campaignDetail.errors.share')))
      const data = await response.json()
      setShareUrl(data.url)
    } catch (err) {
      notify(err?.message || t('campaignDetail.errors.share'), 'error')
    }
  }

  function copyShareUrl() {
    navigator.clipboard?.writeText(shareUrl).then(
      () => notify(t('campaignDetail.notices.linkCopied')),
      () => notify(t('campaignDetail.errors.copy'), 'error'),
    )
  }

  function exportReport() {
    setShowMore(false)
    const lines = [
      t('campaignDetail.report.title', { name: campaign.name }),
      t('campaignDetail.report.status', { status: STATUS_META[campaign.status] ? t(`campaignDetail.status.${campaign.status}`) : campaign.status }),
      t('campaignDetail.report.objective', { value: campaign.objective || '—' }),
      t('campaignDetail.report.goal', { value: campaign.goal || '—' }),
      t('campaignDetail.report.budget', { value: campaign.budgetCents != null ? `${formatLocaleNumber(campaign.budgetCents / 100, locale)} €` : '—' }),
      t('campaignDetail.report.totalLeads', { value: campaign.totalLeads || 0 }),
      t('campaignDetail.report.contacted', { value: campaign.contacted || 0 }),
      t('campaignDetail.report.meetings', { value: campaign.meetingsScheduled || 0 }),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `informe-${campaign.id}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
    notify(t('campaignDetail.notices.reportDownloaded'))
  }

  if (loading) return <PageLoadingState label={t('campaignDetail.loading')} />
  if (notFound) return <div className="campaign-detail-loading"><strong>{t('campaignDetail.notFound')}</strong><button className="campaign-button ghost" onClick={() => navigate('/captacion/planificar')}>{t('campaignDetail.backToCampaigns')}</button></div>
  if (loadError || !campaign) return <div className="campaign-detail-loading" role="alert"><strong>{t('campaignDetail.loadError')}</strong><p>{t('campaignDetail.loadErrorHint')}</p><button className="campaign-button ghost" onClick={() => window.location.reload()}>{t('campaignDetail.retry')}</button></div>

  const totalLeads = campaign.totalLeads || 0
  const contacted = campaign.contacted || 0
  const meetingsScheduled = campaign.meetingsScheduled || 0
  const number = value => formatLocaleNumber(value, locale)
  const progressPct = totalLeads > 0 ? Math.min(100, Math.round((contacted / totalLeads) * 100)) : 0
  const conversionPct = totalLeads > 0 ? Math.min(100, Math.round((meetingsScheduled / totalLeads) * 100)) : 0
  const budgetLabel = campaign.budgetCents != null ? `${number(campaign.budgetCents / 100)} €` : t('campaignDetail.notDefined')
  const datesLabel = campaign.startDate
    ? `${formatLocaleDate(new Date(campaign.startDate), locale)}${campaign.endDate ? ` – ${formatLocaleDate(new Date(campaign.endDate), locale)}` : ''}`
    : t('campaignDetail.noDates')
  const dateTime = value => formatLocaleDate(new Date(value), locale, { dateStyle: 'short', timeStyle: 'short' })

  const StatusIcon = campaign.status === 'active' ? RiPauseCircleLine : RiPlayCircleLine
  const startView = startPrompt ? startConfirmation(startPrompt, t) : null

  return <main className="dark-scroll campaign-detail-page">
    <div className="campaign-detail-breadcrumb"><button onClick={() => navigate('/captacion/planificar')}>{t('campaignDetail.breadcrumb')}</button><RiArrowRightLine /><strong>{campaign.name}</strong></div>
    <header className="campaign-detail-header"><div className="campaign-detail-title"><div><h1>{campaign.name} <StatusBadge status={campaign.status} /></h1><p>{campaign.objective || t('campaignDetail.noObjective')}</p><div className="campaign-detail-meta"><span><RiCalendar2Line />{datesLabel}</span><span><RiUserLine />{campaign.agent?.name || t('campaignDetail.noAgent')}</span><span>{t(`campaignDetail.types.${typeId}`)}</span></div></div></div><div className="campaign-detail-actions"><button className={`campaign-button ${campaign.status === 'active' ? 'danger' : 'primary'}`} onClick={toggleStatus} disabled={statusBusy}><StatusIcon />{campaign.status === 'active' ? t('campaignDetail.pause') : t('campaignDetail.activate')}</button><button className="campaign-button primary" onClick={() => setShowEdit(true)}><RiEditLine /> {t('campaignDetail.edit')}</button><div className="campaign-more-wrap"><button className="campaign-button ghost" aria-haspopup="menu" aria-expanded={showMore} onClick={() => setShowMore(value => !value)}>{t('campaignDetail.more')} <RiArrowDownSLine /></button>{showMore && <div className="campaign-more-menu" role="menu"><button role="menuitem" onClick={duplicateCampaign}><RiFileCopyLine /> {t('campaignDetail.duplicate')}</button><button role="menuitem" onClick={exportReport}><RiExternalLinkLine /> {t('campaignDetail.exportReport')}</button><button role="menuitem" onClick={shareCampaign}><RiShareForwardLine /> {t('campaignDetail.shareLink')}</button></div>}</div></div></header>

    <section className="campaign-health-strip">
      <div className="campaign-health-item health"><div className="campaign-health-ring" style={{ background: `conic-gradient(var(--success) 0 ${conversionPct}%, var(--line) ${conversionPct}% 100%)` }}><strong>{conversionPct}%</strong></div><div><span>{t('campaignDetail.health.conversionRate')}</span><strong>{t('campaignDetail.health.meetings', { count: number(meetingsScheduled) })}</strong><small>{t('campaignDetail.health.ofLeads', { count: number(totalLeads) })}</small></div></div>
      <div className="campaign-health-item progress"><span>{t('campaignDetail.health.contactProgress')}</span><strong>{progressPct}%</strong><div className="campaign-health-bar"><i style={{ width: `${progressPct}%` }} /></div><small>{t('campaignDetail.health.contactedOf', { contacted: number(contacted), total: number(totalLeads) })}</small></div>
      <div className="campaign-health-item budget"><span>{t('campaignDetail.health.budget')}</span><strong>{budgetLabel}</strong></div>
      <div className="campaign-health-item goal"><span>{t('campaignDetail.health.mainGoal')}</span><strong>{campaign.goal || t('campaignDetail.notDefined')}</strong><small>{t('campaignDetail.health.meetingsScheduled', { count: number(meetingsScheduled) })}</small></div>
      <div className="campaign-health-item roi"><span>{t('campaignDetail.health.totalLeads')}</span><strong>{number(totalLeads)}</strong></div>
    </section>

    <nav className="campaign-detail-tabs" role="tablist" aria-label={t('campaignDetail.tabsAria')}>{TABS.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => selectTab(item.id)}>{t(`campaignDetail.tabs.${item.id}`)}</button>)}</nav>
    <div className="campaign-detail-content">
      <div className="campaign-detail-main">
        {tab === 'summary' && <Overview campaign={campaign} />}
        {tab === 'ad' && <CampaignAdsPanel campaign={campaign} />}
        {tab === 'economy' && <EconomyTab campaignId={campaign.id} />}
        {tab === 'audience' && <AudienceTab campaignId={campaign.id} onNavigate={navigate} />}
        {tab === 'conversations' && <ConversationsTab campaignId={campaign.id} onNavigate={navigate} />}
        {tab === 'content' && <ContentTab campaign={campaign} />}
        {tab === 'automation' && <AutomationTab onNavigate={navigate} />}
        {tab === 'settings' && <SettingsTab settings={settings} onToggle={toggleSetting} onSave={saveSettings} saving={savingSettings} />}
      </div>
      <aside className="campaign-detail-side">
        <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.side.dataTitle')}</h2><p>{t('campaignDetail.side.dataHint')}</p></div></div><div className="campaign-tasks"><div className="campaign-task"><div><span>{t('campaignDetail.side.leadsRegistered')}</span><small>{t('campaignDetail.side.accumulated')}</small></div><time>{number(totalLeads)}</time></div><div className="campaign-task"><div><span>{t('campaignDetail.side.meetingsScheduled')}</span><small>{t('campaignDetail.side.accumulated')}</small></div><time>{number(meetingsScheduled)}</time></div></div></section>
        <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>{t('campaignDetail.side.activityTitle')}</h2></div></div><div className="campaign-timeline">{activityLoading ? <span className="campaign-detail-empty-note">{t('campaignDetail.side.activityLoading')}</span> : activityError ? <span className="campaign-detail-empty-note" role="alert">{t('campaignDetail.side.activityError')}</span> : activity.length ? activity.map((event, index) => { const meta = ACTIVITY_META[event.type] || ACTIVITY_META.lead; const Icon = meta.Icon; return <div className="campaign-timeline-item" key={`${event.type}-${index}`} style={{ '--timeline-color': meta.color }}><span className="campaign-timeline-dot" /><div><small>{dateTime(event.at)}</small><strong>{event.title}</strong><p><Icon /> {event.type === 'lead' ? t('campaignDetail.side.eventLead') : event.type === 'call' ? t('campaignDetail.side.eventCall') : t('campaignDetail.side.eventMeeting')}</p></div></div> }) : <span className="campaign-detail-empty-note">{t('campaignDetail.side.activityEmpty')}</span>}</div></section>
      </aside>
    </div>
    {notice && <div className={`campaign-toast${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'error' ? <RiErrorWarningLine /> : <RiCheckboxCircleLine />}{notice.message}<button onClick={() => setNotice(null)} aria-label={t('campaignDetail.closeNotice')}><RiCloseLine /></button></div>}
    {showEdit && <EditModal campaign={campaign} onClose={() => setShowEdit(false)} onSave={saveEdit} saving={savingEdit} />}
    {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl('')} onCopy={copyShareUrl} />}
    {startPrompt && startView && <ConfirmDialog
      title={startView.title}
      message={startView.message}
      confirmText={startView.confirmText}
      cancelText={t('campaignDetail.editModal.cancel')}
      tone={startView.count > 0 ? 'danger' : 'primary'}
      onConfirm={confirmStart}
      onClose={() => setStartPrompt(null)}
    />}
  </main>
}
