import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiAlertLine, RiArrowRightLine, RiBarChartBoxLine, RiCheckboxCircleLine,
  RiExternalLinkLine, RiFocus3Line, RiLineChartLine, RiMetaLine,
  RiMoneyEuroCircleLine, RiPauseCircleLine, RiPlayCircleLine, RiRefreshLine, RiRocketLine,
  RiSettings4Line, RiSparkling2Line, RiTrophyLine, RiUserFollowLine,
} from 'react-icons/ri'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import { DEMO_MODE } from '../lib/dataMode'
import { formatLocaleNumber, localeCode, useI18n } from '../i18n'
import { useThemeColors } from '../hooks/useTheme'
import CaptureJourney from '../components/capture/CaptureJourney'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import AdsDataIntegrity from '../components/ads/AdsDataIntegrity'
import AdsFunnel from '../components/ads/AdsFunnel'
import AdsDecisions from '../components/ads/AdsDecisions'
import AdsNarrative from '../components/ads/AdsNarrative'
import AdsPendingActions from '../components/ads/AdsPendingActions'
import AdsAutonomy, { AdsExperiments } from '../components/ads/AdsAutonomy'
import '../dashboard.css'
import './ads.css'

const ADS_COPY = {
  es: { loading: 'Cargando operación de Ads…', refresh: 'Actualizar', newCampaign: 'Nueva campaña', subtitle: 'Genera demanda cualificada y conecta cada anuncio con una campaña, una landing y un resultado.', createCampaign: 'Crear campaña', connectMeta: 'Conectar Meta' },
  en: { loading: 'Loading Ads operation…', refresh: 'Refresh', newCampaign: 'New campaign', subtitle: 'Generate qualified demand and connect every ad to a campaign, landing page and outcome.', createCampaign: 'Create campaign', connectMeta: 'Connect Meta' },
}
function statusLabels(locale) { return locale === 'en' ? { active: 'Active', paused: 'Paused', draft: 'Draft', done: 'Finished' } : { active: 'Activa', paused: 'Pausada', draft: 'Borrador', done: 'Finalizada' } }
function currency(locale, precise = false) { return new Intl.NumberFormat(localeCode(locale), { style: 'currency', currency: 'EUR', minimumFractionDigits: precise ? 2 : 0, maximumFractionDigits: precise ? 2 : 0 }) }
const STATUS = { active: { className: 'is-active' }, paused: { className: 'is-paused' }, draft: { className: 'is-draft' }, done: { className: 'is-done' } }

function formatCents(value, precise = false, locale = 'es') { return value == null ? (locale === 'en' ? 'No measurement' : 'Sin medición') : currency(locale, precise).format(value / 100) }
function Metric({ Icon, label, value, detail, tone = 'indigo' }) { return <article className={`ads-metric ads-tone-${tone}`}><span className="ads-metric-icon"><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article> }

function EmptyAds({ accountConnected, gated }) {
  const { locale } = useI18n()
  const copy = ADS_COPY[locale]
  // Sin plan el alta devolveria 403: se explica el motivo y no se ofrece un enlace que siempre falla.
  if (gated) return <section className="ads-empty"><div><RiRocketLine /></div><h2>Ads no está incluido en tu plan</h2><p>Mejora tu plan para publicar campañas y medir su rendimiento desde aquí.</p></section>
  return <section className="ads-empty"><div><RiRocketLine /></div><h2>{accountConnected ? 'Todavía no hay campañas de Ads' : 'Conecta Meta para empezar a medir Ads'}</h2><p>{accountConnected ? 'Crea una campaña desde el laboratorio y aquí aparecerán sus resultados y recomendaciones.' : 'Con una cuenta conectada podrás publicar, medir y optimizar desde un único lugar.'}</p><Link to={accountConnected ? '/captacion/nueva' : '/captacion/conectar'} className="ads-action primary"><RiArrowRightLine /> {accountConnected ? 'Crear campaña' : 'Conectar Meta'}</Link></section>
}

function CampaignRow({ campaign, selected, onSelect }) {
  const { locale } = useI18n()
  const labels = statusLabels(locale)
  const state = { ...(STATUS[campaign.crmStatus] ?? STATUS.draft), label: labels[campaign.crmStatus] || labels.draft }
  // Acumulado del período, no el último snapshot: un snapshot es el gasto de
  // un solo día y presentarlo como gasto de la campaña lo subestimaba.
  const period = campaign.period
  // Las columnas profundas salen del embudo económico, no de Meta: son las que
  // distinguen una campaña barata de una campaña rentable (ads.md §4.5).
  const economics = campaign.economics
  const noMeasure = locale === 'en' ? 'No measurement' : 'Sin medición'
  const qualified = economics?.qualified == null ? noMeasure : formatLocaleNumber(economics.qualified, locale)
  const deepCost = economics?.cacCents ?? economics?.cpqlCents ?? null
  const deepLabel = economics?.cacCents != null ? 'CAC' : economics?.cpqlCents != null ? 'CPQL' : 'CPL'
  // Veredicto frente al objetivo calculado desde el margen: es lo que separa
  // "barato" de "rentable" (ads.md §9).
  const verdict = campaign.targets?.verdict
  const verdictLabel = verdict === 'over'
    ? 'sobre objetivo'
    : verdict === 'within'
      ? 'dentro de objetivo'
      : null
  return <button type="button" className={`ads-campaign-row${selected ? ' selected' : ''}`} onClick={() => onSelect(campaign.id)}><span className={`ads-row-dot ${state.className}`} aria-hidden="true" /><span className="ads-campaign-name"><strong>{campaign.name}</strong><small>{campaign.objective || (locale === 'en' ? 'No objective defined' : 'Sin objetivo definido')}</small></span><span className={`ads-status ${state.className}`}>{state.label}</span><span className="ads-number"><strong>{formatCents(period.spendCents, false, locale)}</strong><small>{locale === 'en' ? `spend · ${period.days}d` : `gasto · ${period.days}d`}</small></span><span className="ads-number"><strong>{qualified}</strong><small>cualificados</small></span><span className={`ads-number${verdict === 'over' ? ' is-over' : verdict === 'within' ? ' is-within' : ''}`}><strong>{formatCents(deepCost ?? period.costPerLeadCents, true, locale)}</strong><small>{verdictLabel ? `${deepLabel} · ${verdictLabel}` : deepLabel}</small></span><RiArrowRightLine className="ads-row-arrow" /></button>
}

export default function AdsPage() {
  const { locale } = useI18n()
  const colors = useThemeColors()
  const copy = ADS_COPY[locale]
  const navigate = useNavigate()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [notice, setNotice] = useState('')
  const [refreshingQuality, setRefreshingQuality] = useState(false)
  const [decidingId, setDecidingId] = useState('')
  const [pendingActions, setPendingActions] = useState([])
  const [rules, setRules] = useState([])
  const [experiments, setExperiments] = useState([])
  const [busyRule, setBusyRule] = useState('')
  const [managingCampaign, setManagingCampaign] = useState(false)
  const [dataStatus, setDataStatus] = useState('loading')
  const [dataError, setDataError] = useState('')

  async function loadOverview() {
    setLoading(true)
    setDataStatus('loading')
    setDataError('')
    try {
      const response = await apiFetch('/api/ads/overview')
      if (!response.ok) {
        // Bloqueo de plan (403/409 con codigo): no es una caida, la pagina se muestra vacia con su aviso.
        const gate = await readPlanGate(response)
        if (gate) { setOverview({ campaigns: [] }); setSelectedId(null); setDataStatus('plan'); setDataError(planGateMessage(gate, locale)); return }
        throw new Error('overview-failed')
      }
      const data = await response.json()
      // Las acciones pendientes se piden aparte: llevan la comprobación de
      // guardarraíles en vivo, que no tiene sentido cachear con el resumen.
      apiFetch('/api/ads/actions/pending')
        .then(res => (res.ok ? res.json() : []))
        .then(rows => setPendingActions(Array.isArray(rows) ? rows : []))
        .catch(() => setPendingActions([]))
      apiFetch('/api/ads/rules')
        .then(res => (res.ok ? res.json() : []))
        .then(rows => setRules(Array.isArray(rows) ? rows : []))
        .catch(() => setRules([]))
      apiFetch('/api/ads/experiments')
        .then(res => (res.ok ? res.json() : []))
        .then(rows => setExperiments(Array.isArray(rows) ? rows : []))
        .catch(() => setExperiments([]))
      const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : []
      const normalized = { ...(data || {}), campaigns }
      setOverview(normalized)
      setDataStatus(campaigns.length ? 'live' : 'empty')
      setSelectedId(current => current && campaigns.some(campaign => campaign.id === current) ? current : campaigns[0]?.id ?? null)
    } catch (error) {
      setOverview(null)
      setDataStatus('disconnected')
      setDataError(DEMO_MODE
        ? 'El modo demo está habilitado, pero Ads no usa datos simulados: conecta Meta para ver información real.'
        : error?.message || 'No se pudo conectar con la operación de Ads.')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadOverview() }, [])

  const decisionsByCampaign = useMemo(() => {
    const map = new Map()
    for (const decision of overview?.decisions ?? []) {
      if (!decision.campaignId) continue
      map.set(decision.campaignId, [...(map.get(decision.campaignId) ?? []), decision])
    }
    return map
  }, [overview])

  const campaigns = useMemo(() => {
    const items = overview?.campaigns ?? []
    const flagged = id => decisionsByCampaign.get(id) ?? []
    switch (filter) {
      // "Necesitan atención" son las que tienen una observación grave o cuyo
      // coste se ha salido del objetivo calculado desde el margen.
      case 'attention':
        return items.filter(c => flagged(c.id).some(d => d.severity === 'critical') || c.targets?.verdict === 'over')
      case 'watch':
        return items.filter(c => flagged(c.id).some(d => d.severity === 'warning'))
      case 'sales':
        return items.filter(c => (c.economics?.sales ?? 0) > 0)
      case 'shadow':
        return items.filter(c => flagged(c.id).some(d => d.mode === 'shadow'))
      // "Datos incompletos" es lo contrario de una campaña medida: sin
      // snapshots del período o sin cohorte que sostenga una comparación.
      case 'incomplete':
        return items.filter(c => c.period.measuredDays === 0 || c.economics?.cohortStatus === 'insufficient')
      default:
        return items
    }
  }, [overview, filter, decisionsByCampaign])
  const selectedCampaign = useMemo(() => (overview?.campaigns ?? []).find(campaign => campaign.id === selectedId) ?? null, [overview, selectedId])
  const chartData = useMemo(() => (overview?.series ?? []).map(point => ({ ...point, label: new Date(`${point.date}T12:00:00`).toLocaleDateString(localeCode(locale), { day: 'numeric', month: 'short' }), spend: Math.round(point.spendCents / 100) })), [locale, overview])
  function showNotice(message) { setNotice(message); window.setTimeout(() => setNotice(''), 3600) }

  // Aprobar deja la acción registrada y pendiente, con sus guardarraíles ya
  // evaluados; no toca Meta. Rechazar exige motivo.
  async function decideOnRecommendation(decisionId, verb, reason) {
    setDecidingId(decisionId)
    try {
      const response = await apiFetch(`/api/ads/decisions/${decisionId}/${verb}`, {
        method: 'POST',
        body: JSON.stringify(verb === 'reject' ? { reason } : {}),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'decision-failed')
      }
      showNotice(verb === 'approve' ? 'Acción aprobada y registrada como pendiente.' : 'Recomendación rechazada con tu motivo.')
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || 'No se pudo registrar la decisión.')
    } finally {
      setDecidingId('')
    }
  }

  // Ejecutar revalida los guardarraíles en el servidor: si algo cambió desde
  // la aprobación, devuelve 409 con el motivo concreto y no toca Meta.
  async function runAction(actionId, verb = 'execute') {
    setDecidingId(actionId)
    try {
      const response = await apiFetch(`/api/ads/actions/${actionId}/${verb}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'action-failed')
      showNotice(verb === 'execute' ? 'Acción ejecutada y estado remoto comprobado.' : 'Acción deshecha.')
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || 'No se pudo completar la acción.')
    } finally {
      setDecidingId('')
    }
  }

  // Promover amplía lo que el sistema hace solo, así que el servidor vuelve a
  // comprobar que la regla se lo ha ganado y devuelve 409 con lo que falta.
  async function changeRuleAutonomy(ruleKey, verb) {
    setBusyRule(ruleKey)
    try {
      const response = await apiFetch(`/api/ads/rules/${ruleKey}/${verb}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.blockers?.join(' ') || body?.error || 'rule-failed')
      showNotice(verb === 'promote' ? 'Regla promocionada.' : 'Regla devuelta a N1.')
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || 'No se pudo cambiar la autonomía de la regla.')
    } finally {
      setBusyRule('')
    }
  }

  async function toggleAutonomyStop(stop) {
    try {
      const response = await apiFetch('/api/ads/policy/stop', {
        method: 'POST',
        body: JSON.stringify(stop ? { reason: 'Parada solicitada desde la página de Ads' } : { resume: true }),
      })
      if (!response.ok) throw new Error('stop-failed')
      showNotice(stop ? 'Autonomía parada.' : 'Autonomía reanudada.')
      await loadOverview()
    } catch {
      showNotice('No se pudo cambiar el estado de la autonomía.')
    }
  }

  // Recomprueba permisos, frescura, atribución y consentimiento sin esperar a
  // que caduque la caché del último diagnóstico.
  async function refreshDataQuality() {
    setRefreshingQuality(true)
    try {
      const response = await apiFetch('/api/ads/data-quality/refresh', { method: 'POST' })
      if (!response.ok) throw new Error('data-quality-failed')
      await loadOverview()
    } catch {
      showNotice('No se pudo recomprobar la integridad de los datos.')
    } finally {
      setRefreshingQuality(false)
    }
  }

  async function manageCampaign(action) {
    if (!selectedCampaign) return
    setManagingCampaign(true)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${selectedCampaign.id}/${action}`, { method: 'POST' })
      if (!response.ok) throw new Error('meta-action-failed')
      const labels = { publish: 'Borrador enviado a Meta.', activate: 'Campaña activada.', pause: 'Campaña pausada.' }
      showNotice(labels[action])
      await loadOverview()
    } catch {
      showNotice('Meta no pudo completar la operación. Revisa la cuenta y vuelve a intentarlo.')
    } finally {
      setManagingCampaign(false)
    }
  }

  async function syncSelectedCampaign() {
    if (!selectedCampaign) return
    setManagingCampaign(true)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${selectedCampaign.id}/remote-status`)
      if (!response.ok) throw new Error('remote-status-failed')
      showNotice('Estado de Meta actualizado.')
      await loadOverview()
    } catch {
      showNotice('No se pudo sincronizar el estado con Meta.')
    } finally {
      setManagingCampaign(false)
    }
  }

  if (loading) return <main className="ads-dashboard ads-dashboard-loading"><span /><p>{copy.loading}</p><DataStatusBanner status="loading" message={locale === 'en' ? 'Loading your campaigns and their latest data.' : 'Consultando tus campañas y sus últimos datos.'} /></main>
  const summary = overview?.summary
  const fast = summary?.fast
  const mature = summary?.mature
  const account = overview?.account
  const period = overview?.period
  const dataQuality = overview?.dataQuality
  const noMeasurement = locale === 'en' ? 'No measurement' : 'Sin medición'
  const fastDays = period?.days ?? 14
  const matureDays = overview?.funnelPeriodDays ?? 30
  // Una campaña sin cohorte madura no se penaliza por no tener ventas: puede
  // ser simplemente demasiado joven (ads.md §4.7).
  const immatureCount = (overview?.campaigns ?? []).filter(
    campaign => campaign.economics && campaign.economics.cohortStatus !== 'mature'
  ).length
  const cohortSummary = immatureCount > 0
    ? `${immatureCount === 1 ? 'Una campaña tiene' : `${immatureCount} campañas tienen`} la cohorte sin madurar: su falta de ventas todavía no significa nada.`
    : null
  const connectionHasIssues = Boolean(
    account?.connected && (
      !account.permissions?.insights ||
      !account.permissions?.leads ||
      !account.permissions?.capi ||
      dataQuality?.missingAssets?.length
    )
  )

  return <main className="dark-scroll ads-dashboard">
    <header className="ads-dashboard-header"><div><h1>Ads</h1><p>{copy.subtitle}</p></div><div className="ads-header-actions"><button className="ads-action secondary" onClick={loadOverview}><RiRefreshLine /> {copy.refresh}</button><button className="ads-action primary" disabled={dataStatus === 'plan'} title={dataStatus === 'plan' ? dataError : undefined} onClick={() => navigate('/captacion/nueva')}><RiAddLine /> {copy.newCampaign}</button></div></header>
    <CaptureJourney active="attract" />
    <DataStatusBanner
      status={dataStatus}
      message={dataStatus === 'empty' ? 'Meta está conectado o disponible, pero todavía no hay campañas con datos que mostrar.' : dataError}
      onRetry={dataStatus === 'disconnected' || dataStatus === 'error' ? loadOverview : undefined}
    />
    {!overview ? <section className="ads-error"><RiAlertLine /><div><strong>No se pudo cargar Ads</strong><span>Revisa la conexión y vuelve a intentarlo.</span></div><button className="ads-action secondary" onClick={loadOverview}>Reintentar</button></section> : <>
      {/* Estar conectado no equivale a estar conectado bien (ads.md §4.1): si
          el token existe pero no permite leer Insights o enviar CAPI, la banda
          lo dice en vez de mostrar un visto bueno. */}
      <section className="ads-command-strip"><div className="ads-command-copy"><RiMetaLine /><div><strong>{!account?.connected ? 'Meta Ads sin conectar' : connectionHasIssues ? 'Meta Ads conectado con incidencias' : 'Meta Ads conectado'}</strong><span>{account?.connected ? `Cuenta ${account.metaAdAccountId}${connectionHasIssues ? ' · revisa permisos y activos' : ''}` : 'Conecta una cuenta para publicar y medir resultados.'}</span></div></div>{account?.connected ? <Link className="ads-command-link" to="/captacion/conectar"><RiSettings4Line /> Gestionar cuenta</Link> : <Link className="ads-command-link" to="/captacion/conectar"><RiExternalLinkLine /> Conectar Meta</Link>}</section>
      <AdsDataIntegrity account={account} dataQuality={dataQuality} onSync={refreshDataQuality} syncing={refreshingQuality} />
      {/* Cuatro tarjetas de ads.md §4.3. Las de cohorte madura (cualificados,
          CAC, compradores) dicen "Sin medición" hasta la Fase 1: es la
          respuesta honesta, no un cero que aparente un embudo vacío. */}
      <section className="ads-metrics" aria-label={locale === 'en' ? 'Ads performance summary' : 'Resumen de rendimiento Ads'}>
        <Metric Icon={RiMoneyEuroCircleLine} label={locale === 'en' ? 'Spend' : 'Gasto'} value={formatCents(fast?.spendCents, false, locale)} detail={`${fastDays} d · ${fast?.ctr == null ? (locale === 'en' ? 'no CTR yet' : 'sin CTR') : `CTR ${fast.ctr}%`}`} tone="cyan" />
        <Metric Icon={RiUserFollowLine} label={locale === 'en' ? 'Qualified' : 'Cualificados'} value={mature?.qualified == null ? noMeasurement : formatLocaleNumber(mature.qualified, locale)} detail={`${matureDays} d · ${mature?.qualified == null ? (locale === 'en' ? 'funnel not connected' : 'embudo sin conectar') : (locale === 'en' ? 'valid call outcome' : 'con llamada válida')}`} tone="emerald" />
        <Metric Icon={RiFocus3Line} label={mature?.cacCents != null ? 'CAC' : mature?.cpqlCents != null ? 'CPQL' : 'CPL'} value={formatCents(mature?.cacCents ?? mature?.cpqlCents ?? fast?.cplCents, true, locale)} detail={`${mature?.cacCents != null || mature?.cpqlCents != null ? matureDays : fastDays} d · ${mature?.cacCents != null ? (locale === 'en' ? 'per buyer' : 'por comprador') : mature?.cpqlCents != null ? (locale === 'en' ? 'per qualified lead' : 'por cualificado') : (locale === 'en' ? 'no deeper signal' : 'sin señal más profunda')}`} tone="indigo" />
        <Metric Icon={RiTrophyLine} label={locale === 'en' ? 'Buyers / real ROAS' : 'Compradores / ROAS real'} value={mature?.sales == null ? noMeasurement : formatLocaleNumber(mature.sales, locale)} detail={`${matureDays} d · ${mature?.roas == null ? (locale === 'en' ? 'no mature cohort' : 'sin cohorte madura') : `ROAS ${mature.roas}`}`} tone="violet" />
      </section>
      {/* Los dos circuitos de ads.md 4.7 se separan a la vista: el rapido
          protege el gasto, el lento decide donde ponerlo. Mezclarlos invita
          a castigar hoy una campana cuyos compradores tardan diez dias. */}
      <p className="ads-circuit"><span>Ahora</span><small>{`Señales rápidas de entrega · últimos ${period?.days ?? 14} días`}</small></p>
      {overview.campaigns.length > 0 && <section className="ads-chart-section"><article className="ads-chart-panel"><div className="ads-section-head"><div><h2>{locale === 'en' ? 'Spend and leads' : 'Gasto y leads'}</h2><p>{locale === 'en' ? 'A daily view of your campaign results.' : 'Una lectura diaria de los resultados de tus campañas.'}</p></div><span>{chartData.length ? `${chartData.length} ${locale === 'en' ? 'days' : 'días'}` : (locale === 'en' ? 'No history' : 'Sin histórico')}</span></div>{chartData.length ? <div className="ads-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 14, right: 12, left: -23, bottom: 0 }}><defs><linearGradient id="adsSpendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors.cyan} stopOpacity=".35" /><stop offset="100%" stopColor={colors.cyan} stopOpacity="0" /></linearGradient></defs><XAxis dataKey="label" tick={{ fill: colors.dim, fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: colors.dim, fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--text)', fontSize: 11 }} formatter={(value, name) => [name === 'spend' ? currency(locale).format(value) : value, name === 'spend' ? (locale === 'en' ? 'Spend' : 'Gasto') : 'Leads']} /><Area type="monotone" dataKey="spend" stroke={colors.cyan} strokeWidth={2.25} fill="url(#adsSpendGradient)" /><Area type="monotone" dataKey="leads" stroke={colors.accentSoft} strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div> : <div className="ads-chart-empty">{locale === 'en' ? 'There is not enough history yet to draw the trend.' : 'Todavía no hay suficiente histórico para dibujar la evolución.'}</div>}</article></section>}
      <p className="ads-circuit"><span>Resultado</span><small>{`Cohortes maduras · últimos ${overview.funnelPeriodDays ?? 30} días`}</small></p>
      {overview.campaigns.length > 0 && (
        <AdsFunnel
          funnel={overview.funnel}
          deepestEligibleSignal={summary?.deepestEligibleSignal}
          eligibilityReason={summary?.eligibilityReason}
          periodDays={overview.funnelPeriodDays ?? 30}
          cohortSummary={cohortSummary}
        />
      )}
      {!overview.campaigns.length ? <EmptyAds accountConnected={account?.connected} gated={dataStatus === 'plan'} /> : <div className="ads-layout"><section className="ads-performance"><div className="ads-section-head"><div><h2>Rendimiento de campañas</h2><p>Elige una campaña para revisar su señal actual.</p></div><div className="ads-filter" aria-label="Filtrar campañas">{[['all', 'Todas'], ['attention', 'Necesitan atención'], ['watch', 'En observación'], ['sales', 'Con ventas'], ['shadow', 'Modo sombra'], ['incomplete', 'Datos incompletos']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div><div className="ads-campaign-list" role="list">{campaigns.length ? campaigns.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} selected={campaign.id === selectedId} onSelect={setSelectedId} />) : <div className="ads-list-empty">No hay campañas que coincidan con este filtro.</div>}</div><div className="ads-table-footer"><span>{campaigns.length} campaña{campaigns.length === 1 ? '' : 's'} visibles</span><span><i /> Datos de la última medición disponible</span></div></section>
        <aside className="ads-intelligence"><section className="ads-selection"><div className="ads-rail-title"><RiLineChartLine /><h2>Campaña seleccionada</h2></div>{selectedCampaign ? <><strong>{selectedCampaign.name}</strong><p>{selectedCampaign.objective || 'Sin objetivo definido.'}</p><dl><div><dt>Leads</dt><dd>{selectedCampaign.period.leadsCount ?? noMeasurement}</dd></div><div><dt>Reuniones</dt><dd>{selectedCampaign.meetingsScheduled}</dd></div><div><dt>Límite CPL</dt><dd>{formatCents(selectedCampaign.maxCostPerLeadCents, true, locale)}</dd></div></dl>
          {/* Cuando el anuncio funciona y la conversión no, el diagnóstico vive
              en la landing: se abre allí con el contexto ya cargado
              (docs/xarly/landings.md §11, fase 2). */}
          <Link className="ads-landing-link" to={`/landings?campaign=${selectedCampaign.id}`}>Ver la landing de esta campaña <RiArrowRightLine /></Link><div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {!selectedCampaign.metaCampaignId ? <button className="ads-action primary wide" onClick={() => manageCampaign('publish')} disabled={managingCampaign}><RiRocketLine /> {managingCampaign ? 'Enviando…' : 'Publicar borrador en Meta'}</button> : selectedCampaign.crmStatus === 'active' || selectedCampaign.status === 'active' ? <button className="ads-action secondary wide" onClick={() => manageCampaign('pause')} disabled={managingCampaign}><RiPauseCircleLine /> {managingCampaign ? 'Pausando…' : 'Pausar en Meta'}</button> : <button className="ads-action primary wide" onClick={() => manageCampaign('activate')} disabled={managingCampaign}><RiPlayCircleLine /> {managingCampaign ? 'Activando…' : 'Activar en Meta'}</button>}
          <button className="ads-action secondary wide" onClick={syncSelectedCampaign} disabled={managingCampaign}><RiRefreshLine /> Sincronizar estado</button>
        </div><Link to={`/campanas/${selectedCampaign.id}`} className="ads-detail-link">Abrir detalle <RiArrowRightLine /></Link></> : <p>Selecciona una campaña para ver su contexto.</p>}</section></aside></div>}
      {overview.campaigns.length > 0 && (
        <section className="ads-recommendation-panel">
          <div className="ads-section-head">
            <div>
              <h2>Qué recomienda Xarly</h2>
              <p>Cada observación dice con qué datos se hizo, cuánta confianza tiene y qué la limita.</p>
            </div>
            <RiSparkling2Line />
          </div>
          <AdsDecisions decisions={overview.decisions} policy={overview.policy} onDecide={decideOnRecommendation} busyId={decidingId} />
        </section>
      )}
      <AdsPendingActions
        actions={pendingActions}
        onExecute={id => runAction(id, 'execute')}
        onCompensate={id => runAction(id, 'compensate')}
        busyId={decidingId}
      />
      <AdsNarrative narrative={overview.weeklyNarrative} />
      <p className="ads-circuit"><span>Gobierno</span><small>Hasta dónde puede llegar Xarly sin preguntar</small></p>
      <AdsAutonomy
        rules={rules}
        policy={overview.policy}
        onPromote={key => changeRuleAutonomy(key, 'promote')}
        onDemote={key => changeRuleAutonomy(key, 'demote')}
        onStop={toggleAutonomyStop}
        busyKey={busyRule}
      />
      <AdsExperiments experiments={experiments} />
    </>}
    {notice && <div className="ads-toast" role="status"><RiCheckboxCircleLine /> {notice}</div>}
  </main>
}
