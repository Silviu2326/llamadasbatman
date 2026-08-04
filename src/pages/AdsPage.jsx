import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiAlertLine, RiArrowRightLine, RiBarChartBoxLine, RiCheckboxCircleLine,
  RiCursorLine, RiExternalLinkLine, RiFocus3Line, RiLineChartLine, RiMetaLine,
  RiMoneyEuroCircleLine, RiPauseCircleLine, RiPlayCircleLine, RiRefreshLine, RiRocketLine,
  RiSettings4Line, RiSparkling2Line,
} from 'react-icons/ri'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import { DEMO_MODE } from '../lib/dataMode'
import { formatLocaleNumber, localeCode, useI18n } from '../i18n'
import { useThemeColors } from '../hooks/useTheme'
import CaptureJourney from '../components/capture/CaptureJourney'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import creativeSignalFlow from '../assets/ads/creative-signal-flow.png'
import creativeProofStack from '../assets/ads/creative-proof-stack.png'
import creativeAudienceOrbit from '../assets/ads/creative-audience-orbit.png'
import '../dashboard.css'
import './ads.css'
import './ads-creative.css'

const ADS_COPY = {
  es: { loading: 'Cargando operación de Ads…', refresh: 'Actualizar', newCampaign: 'Nueva campaña', subtitle: 'Genera demanda cualificada y conecta cada anuncio con una campaña, una landing y un resultado.', createCampaign: 'Crear campaña', connectMeta: 'Conectar Meta' },
  en: { loading: 'Loading Ads operation…', refresh: 'Refresh', newCampaign: 'New campaign', subtitle: 'Generate qualified demand and connect every ad to a campaign, landing page and outcome.', createCampaign: 'Create campaign', connectMeta: 'Connect Meta' },
}
function statusLabels(locale) { return locale === 'en' ? { active: 'Active', paused: 'Paused', draft: 'Draft', done: 'Finished' } : { active: 'Activa', paused: 'Pausada', draft: 'Borrador', done: 'Finalizada' } }
function currency(locale, precise = false) { return new Intl.NumberFormat(localeCode(locale), { style: 'currency', currency: 'EUR', minimumFractionDigits: precise ? 2 : 0, maximumFractionDigits: precise ? 2 : 0 }) }
const STATUS = { active: { className: 'is-active' }, paused: { className: 'is-paused' }, draft: { className: 'is-draft' }, done: { className: 'is-done' } }
const CREATIVE_DIRECTIONS = [
  { id: 'signal', image: creativeSignalFlow, label: 'Señal que avanza', detail: 'Una ruta visual para llevar atención cualificada hacia el siguiente paso.' },
  { id: 'proof', image: creativeProofStack, label: 'Prueba que sostiene', detail: 'Una composición más sobria para reforzar autoridad, método y confianza.' },
  { id: 'audience', image: creativeAudienceOrbit, label: 'Audiencia resuelta', detail: 'Un enfoque que concentra el mensaje en la señal de mayor intención.' },
]

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
  const latest = campaign.latest
  return <button type="button" className={`ads-campaign-row${selected ? ' selected' : ''}`} onClick={() => onSelect(campaign.id)}><span className={`ads-row-dot ${state.className}`} aria-hidden="true" /><span className="ads-campaign-name"><strong>{campaign.name}</strong><small>{campaign.objective || (locale === 'en' ? 'No objective defined' : 'Sin objetivo definido')}</small></span><span className={`ads-status ${state.className}`}>{state.label}</span><span className="ads-number"><strong>{formatCents(latest.spendCents, false, locale)}</strong><small>{locale === 'en' ? 'current spend' : 'gasto actual'}</small></span><span className="ads-number"><strong>{formatCents(latest.costPerLeadCents, true, locale)}</strong><small>CPL</small></span><span className="ads-number"><strong>{formatLocaleNumber(latest.leadsCount, locale)}</strong><small>leads</small></span><RiArrowRightLine className="ads-row-arrow" /></button>
}

function CreativeDirection({ campaign, activeIndex, onChange, onCreate }) {
  const { locale } = useI18n()
  const direction = CREATIVE_DIRECTIONS[activeIndex]
  const headline = campaign?.creative?.copy || campaign?.name || direction.label
  const offer = campaign?.creative?.offer || direction.label
  return <article className="ads-creative-panel">
    <div className="ads-section-head"><div><h2>Dirección creativa</h2><p>Explora una ruta visual antes de crear la siguiente variante.</p></div><RiBarChartBoxLine /></div>
    <div className="ads-creative-showcase">
      <div className="ads-creative-frame"><img key={direction.id} src={direction.image} alt={`Dirección creativa: ${direction.label}`} /></div>
      <div className="ads-creative-copy"><span>{offer}</span><strong>{headline}</strong><p>{direction.detail}</p><button className="ads-detail-link" onClick={onCreate}>Crear variante <RiArrowRightLine /></button></div>
    </div>
    <div className="ads-creative-picker" aria-label="Direcciones creativas">
      {CREATIVE_DIRECTIONS.map((item, index) => <button key={item.id} className={index === activeIndex ? 'active' : ''} onClick={() => onChange(index)} aria-pressed={index === activeIndex}><img src={item.image} alt="" /><span>{item.label}</span></button>)}
    </div>
  </article>
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
  const [creativeIndex, setCreativeIndex] = useState(0)
  const [notice, setNotice] = useState('')
  const [optimizing, setOptimizing] = useState(false)
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

  const campaigns = useMemo(() => { const items = overview?.campaigns ?? []; return filter === 'all' ? items : items.filter(campaign => campaign.crmStatus === filter) }, [overview, filter])
  const selectedCampaign = useMemo(() => (overview?.campaigns ?? []).find(campaign => campaign.id === selectedId) ?? null, [overview, selectedId])
  const chartData = useMemo(() => (overview?.series ?? []).map(point => ({ ...point, label: new Date(`${point.date}T12:00:00`).toLocaleDateString(localeCode(locale), { day: 'numeric', month: 'short' }), spend: Math.round(point.spendCents / 100) })), [locale, overview])
  function showNotice(message) { setNotice(message); window.setTimeout(() => setNotice(''), 3600) }

  async function applyRecommendation() {
    const recommendation = overview?.recommendation
    if (!recommendation) return
    setOptimizing(true)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${recommendation.campaignId}/max-cpl`, { method: 'PUT', body: JSON.stringify({ maxCostPerLeadCents: recommendation.maxCostPerLeadCents }) })
      if (!response.ok) throw new Error('recommendation-failed')
      showNotice(`Límite de CPL aplicado a ${recommendation.campaignName}.`)
      await loadOverview()
    } catch { showNotice('No se pudo aplicar el límite recomendado.') } finally { setOptimizing(false) }
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
  const account = overview?.account
  const recommendation = overview?.recommendation

  return <main className="dark-scroll ads-dashboard">
    <header className="ads-dashboard-header"><div><h1>Ads</h1><p>{copy.subtitle}</p></div><div className="ads-header-actions"><button className="ads-action secondary" onClick={loadOverview}><RiRefreshLine /> {copy.refresh}</button><button className="ads-action primary" disabled={dataStatus === 'plan'} title={dataStatus === 'plan' ? dataError : undefined} onClick={() => navigate('/captacion/nueva')}><RiAddLine /> {copy.newCampaign}</button></div></header>
    <CaptureJourney active="attract" />
    <DataStatusBanner
      status={dataStatus}
      message={dataStatus === 'empty' ? 'Meta está conectado o disponible, pero todavía no hay campañas con datos que mostrar.' : dataError}
      onRetry={dataStatus === 'disconnected' || dataStatus === 'error' ? loadOverview : undefined}
    />
    {!overview ? <section className="ads-error"><RiAlertLine /><div><strong>No se pudo cargar Ads</strong><span>Revisa la conexión y vuelve a intentarlo.</span></div><button className="ads-action secondary" onClick={loadOverview}>Reintentar</button></section> : <>
      <section className="ads-command-strip"><div className="ads-command-copy"><RiMetaLine /><div><strong>{account?.connected ? 'Meta Ads conectado' : 'Meta Ads sin conectar'}</strong><span>{account?.connected ? `Cuenta ${account.metaAdAccountId}` : 'Conecta una cuenta para publicar y medir resultados.'}</span></div></div>{account?.connected ? <Link className="ads-command-link" to="/captacion/conectar"><RiSettings4Line /> Gestionar cuenta</Link> : <Link className="ads-command-link" to="/captacion/conectar"><RiExternalLinkLine /> Conectar Meta</Link>}</section>
      <section className="ads-metrics" aria-label={locale === 'en' ? 'Ads performance summary' : 'Resumen de rendimiento Ads'}><Metric Icon={RiRocketLine} label={locale === 'en' ? 'Active campaigns' : 'Campañas activas'} value={formatLocaleNumber(summary?.activeCampaigns ?? 0, locale)} detail={locale === 'en' ? 'in operation' : 'en operación'} /><Metric Icon={RiMoneyEuroCircleLine} label={locale === 'en' ? 'Current spend' : 'Gasto actual'} value={formatCents(summary?.spendCents, false, locale)} detail={locale === 'en' ? 'latest data per campaign' : 'último dato por campaña'} tone="cyan" /><Metric Icon={RiFocus3Line} label={locale === 'en' ? 'Cost per lead' : 'Coste por lead'} value={formatCents(summary?.costPerLeadCents, true, locale)} detail={locale === 'en' ? 'weighted average' : 'promedio ponderado'} tone="emerald" /><Metric Icon={RiCursorLine} label="CTR" value={summary?.ctr == null ? (locale === 'en' ? 'No measurement' : 'Sin medición') : `${summary.ctr}%`} detail={`${summary?.leads ?? 0} ${locale === 'en' ? 'measured leads' : 'leads medidos'}`} tone="violet" /></section>
      {!overview.campaigns.length ? <EmptyAds accountConnected={account?.connected} gated={dataStatus === 'plan'} /> : <div className="ads-layout"><section className="ads-performance"><div className="ads-section-head"><div><h2>Rendimiento de campañas</h2><p>Elige una campaña para revisar su señal actual.</p></div><div className="ads-filter" aria-label="Filtrar campañas">{[['all', 'Todas'], ['active', 'Activas'], ['paused', 'Pausadas']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div><div className="ads-campaign-list" role="list">{campaigns.length ? campaigns.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} selected={campaign.id === selectedId} onSelect={setSelectedId} />) : <div className="ads-list-empty">No hay campañas que coincidan con este filtro.</div>}</div><div className="ads-table-footer"><span>{campaigns.length} campaña{campaigns.length === 1 ? '' : 's'} visibles</span><span><i /> Datos de la última medición disponible</span></div></section>
        <aside className="ads-intelligence"><section className="ads-recommendation"><div className="ads-rail-title"><RiSparkling2Line /><h2>Optimización automática</h2></div>{recommendation ? <><p className="ads-priority">Prioridad principal</p><h3>{recommendation.title}</h3><p>{recommendation.detail}</p><button className="ads-action primary wide" onClick={applyRecommendation} disabled={optimizing}>{optimizing ? 'Aplicando…' : 'Aplicar límite recomendado'}</button></> : <div className="ads-recommendation-empty"><RiCheckboxCircleLine /><p>Cuando Meta envíe los primeros resultados, aquí verás la acción más rentable.</p></div>}</section><section className="ads-selection"><div className="ads-rail-title"><RiLineChartLine /><h2>Campaña seleccionada</h2></div>{selectedCampaign ? <><strong>{selectedCampaign.name}</strong><p>{selectedCampaign.objective || 'Sin objetivo definido.'}</p><dl><div><dt>Leads</dt><dd>{selectedCampaign.latest.leadsCount}</dd></div><div><dt>Reuniones</dt><dd>{selectedCampaign.meetingsScheduled}</dd></div><div><dt>Límite CPL</dt><dd>{formatCents(selectedCampaign.maxCostPerLeadCents, true)}</dd></div></dl><div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {!selectedCampaign.metaCampaignId ? <button className="ads-action primary wide" onClick={() => manageCampaign('publish')} disabled={managingCampaign}><RiRocketLine /> {managingCampaign ? 'Enviando…' : 'Publicar borrador en Meta'}</button> : selectedCampaign.crmStatus === 'active' || selectedCampaign.status === 'active' ? <button className="ads-action secondary wide" onClick={() => manageCampaign('pause')} disabled={managingCampaign}><RiPauseCircleLine /> {managingCampaign ? 'Pausando…' : 'Pausar en Meta'}</button> : <button className="ads-action primary wide" onClick={() => manageCampaign('activate')} disabled={managingCampaign}><RiPlayCircleLine /> {managingCampaign ? 'Activando…' : 'Activar en Meta'}</button>}
          <button className="ads-action secondary wide" onClick={syncSelectedCampaign} disabled={managingCampaign}><RiRefreshLine /> Sincronizar estado</button>
        </div><Link to={`/campanas/${selectedCampaign.id}`} className="ads-detail-link">Abrir detalle <RiArrowRightLine /></Link></> : <p>Selecciona una campaña para ver su contexto.</p>}</section></aside></div>}
      {overview.campaigns.length > 0 && <section className="ads-lower-grid"><article className="ads-chart-panel"><div className="ads-section-head"><div><h2>{locale === 'en' ? 'Spend and leads' : 'Gasto y leads'}</h2><p>{locale === 'en' ? 'A daily view of your campaign results.' : 'Una lectura diaria de los resultados de tus campañas.'}</p></div><span>{chartData.length ? `${chartData.length} ${locale === 'en' ? 'days' : 'días'}` : (locale === 'en' ? 'No history' : 'Sin histórico')}</span></div>{chartData.length ? <div className="ads-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 14, right: 12, left: -23, bottom: 0 }}><defs><linearGradient id="adsSpendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors.cyan} stopOpacity=".35" /><stop offset="100%" stopColor={colors.cyan} stopOpacity="0" /></linearGradient></defs><XAxis dataKey="label" tick={{ fill: colors.dim, fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: colors.dim, fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--text)', fontSize: 11 }} formatter={(value, name) => [name === 'spend' ? currency(locale).format(value) : value, name === 'spend' ? (locale === 'en' ? 'Spend' : 'Gasto') : 'Leads']} /><Area type="monotone" dataKey="spend" stroke={colors.cyan} strokeWidth={2.25} fill="url(#adsSpendGradient)" /><Area type="monotone" dataKey="leads" stroke={colors.accentSoft} strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div> : <div className="ads-chart-empty">{locale === 'en' ? 'There is not enough history yet to draw the trend.' : 'Todavía no hay suficiente histórico para dibujar la evolución.'}</div>}</article><CreativeDirection campaign={selectedCampaign} activeIndex={creativeIndex} onChange={setCreativeIndex} onCreate={() => navigate('/captacion/nueva')} /></section>}
    </>}
    {notice && <div className="ads-toast" role="status"><RiCheckboxCircleLine /> {notice}</div>}
  </main>
}
