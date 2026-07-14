import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiAlertLine, RiArrowRightLine, RiBarChartBoxLine, RiCheckboxCircleLine,
  RiCursorLine, RiExternalLinkLine, RiFocus3Line, RiLineChartLine, RiMetaLine,
  RiMoneyEuroCircleLine, RiRefreshLine, RiRocketLine, RiSettings4Line, RiSparkling2Line,
} from 'react-icons/ri'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiFetch } from '../lib/api'
import CaptureJourney from '../components/capture/CaptureJourney'
import creativeSignalFlow from '../assets/ads/creative-signal-flow.png'
import creativeProofStack from '../assets/ads/creative-proof-stack.png'
import creativeAudienceOrbit from '../assets/ads/creative-audience-orbit.png'
import '../dashboard.css'
import './ads.css'
import './ads-creative.css'

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const euroPrecise = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const STATUS = { active: { label: 'Activa', className: 'is-active' }, paused: { label: 'Pausada', className: 'is-paused' }, draft: { label: 'Borrador', className: 'is-draft' }, done: { label: 'Finalizada', className: 'is-done' } }
const CREATIVE_DIRECTIONS = [
  { id: 'signal', image: creativeSignalFlow, label: 'Señal que avanza', detail: 'Una ruta visual para llevar atención cualificada hacia el siguiente paso.' },
  { id: 'proof', image: creativeProofStack, label: 'Prueba que sostiene', detail: 'Una composición más sobria para reforzar autoridad, método y confianza.' },
  { id: 'audience', image: creativeAudienceOrbit, label: 'Audiencia resuelta', detail: 'Un enfoque que concentra el mensaje en la señal de mayor intención.' },
]

function formatCents(value, precise = false) { return value == null ? 'Sin medición' : (precise ? euroPrecise : euro).format(value / 100) }
function Metric({ Icon, label, value, detail, tone = 'indigo' }) { return <article className={`ads-metric ads-tone-${tone}`}><span className="ads-metric-icon"><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article> }

function EmptyAds({ accountConnected }) {
  return <section className="ads-empty"><div><RiRocketLine /></div><h2>{accountConnected ? 'Todavía no hay campañas de Ads' : 'Conecta Meta para empezar a medir Ads'}</h2><p>{accountConnected ? 'Crea una campaña desde el laboratorio y aquí aparecerán sus resultados y recomendaciones.' : 'Con una cuenta conectada podrás publicar, medir y optimizar desde un único lugar.'}</p><Link to={accountConnected ? '/captacion/nueva' : '/captacion/conectar'} className="ads-action primary"><RiArrowRightLine /> {accountConnected ? 'Crear campaña' : 'Conectar Meta'}</Link></section>
}

function CampaignRow({ campaign, selected, onSelect }) {
  const state = STATUS[campaign.crmStatus] ?? STATUS.draft
  const latest = campaign.latest
  return <button type="button" className={`ads-campaign-row${selected ? ' selected' : ''}`} onClick={() => onSelect(campaign.id)}><span className={`ads-row-dot ${state.className}`} aria-hidden="true" /><span className="ads-campaign-name"><strong>{campaign.name}</strong><small>{campaign.objective || 'Sin objetivo definido'}</small></span><span className={`ads-status ${state.className}`}>{state.label}</span><span className="ads-number"><strong>{formatCents(latest.spendCents)}</strong><small>gasto actual</small></span><span className="ads-number"><strong>{formatCents(latest.costPerLeadCents, true)}</strong><small>CPL</small></span><span className="ads-number"><strong>{latest.leadsCount.toLocaleString('es-ES')}</strong><small>leads</small></span><RiArrowRightLine className="ads-row-arrow" /></button>
}

function CreativeDirection({ campaign, activeIndex, onChange, onCreate }) {
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
  const navigate = useNavigate()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [creativeIndex, setCreativeIndex] = useState(0)
  const [notice, setNotice] = useState('')
  const [optimizing, setOptimizing] = useState(false)

  async function loadOverview() {
    setLoading(true)
    try {
      const response = await apiFetch('/api/ads/overview')
      if (!response.ok) throw new Error('overview-failed')
      const data = await response.json()
      setOverview(data)
      setSelectedId(current => current && data.campaigns.some(campaign => campaign.id === current) ? current : data.campaigns[0]?.id ?? null)
    } catch { setOverview(null) } finally { setLoading(false) }
  }

  useEffect(() => { loadOverview() }, [])

  const campaigns = useMemo(() => { const items = overview?.campaigns ?? []; return filter === 'all' ? items : items.filter(campaign => campaign.crmStatus === filter) }, [overview, filter])
  const selectedCampaign = useMemo(() => (overview?.campaigns ?? []).find(campaign => campaign.id === selectedId) ?? null, [overview, selectedId])
  const chartData = useMemo(() => (overview?.series ?? []).map(point => ({ ...point, label: new Date(`${point.date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), spend: Math.round(point.spendCents / 100) })), [overview])
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

  if (loading) return <main className="ads-dashboard ads-dashboard-loading"><span /><p>Cargando operación de Ads…</p></main>
  const summary = overview?.summary
  const account = overview?.account
  const recommendation = overview?.recommendation

  return <main className="dark-scroll ads-dashboard">
    <header className="ads-dashboard-header"><div><h1>Ads</h1><p>Genera demanda cualificada y conecta cada anuncio con una campaña, una landing y un resultado.</p></div><div className="ads-header-actions"><button className="ads-action secondary" onClick={loadOverview}><RiRefreshLine /> Actualizar</button><button className="ads-action primary" onClick={() => navigate('/captacion/nueva')}><RiAddLine /> Nueva campaña</button></div></header>
    <CaptureJourney active="attract" />
    {!overview ? <section className="ads-error"><RiAlertLine /><div><strong>No se pudo cargar Ads</strong><span>Revisa la conexión y vuelve a intentarlo.</span></div><button className="ads-action secondary" onClick={loadOverview}>Reintentar</button></section> : <>
      <section className="ads-command-strip"><div className="ads-command-copy"><RiMetaLine /><div><strong>{account?.connected ? 'Meta Ads conectado' : 'Meta Ads sin conectar'}</strong><span>{account?.connected ? `Cuenta ${account.metaAdAccountId}` : 'Conecta una cuenta para publicar y recibir snapshots.'}</span></div></div>{account?.connected ? <Link className="ads-command-link" to="/captacion/conectar"><RiSettings4Line /> Gestionar cuenta</Link> : <Link className="ads-command-link" to="/captacion/conectar"><RiExternalLinkLine /> Conectar Meta</Link>}</section>
      <section className="ads-metrics" aria-label="Resumen de rendimiento Ads"><Metric Icon={RiRocketLine} label="Campañas activas" value={(summary?.activeCampaigns ?? 0).toLocaleString('es-ES')} detail="en operación" /><Metric Icon={RiMoneyEuroCircleLine} label="Gasto actual" value={formatCents(summary?.spendCents)} detail="último snapshot por campaña" tone="cyan" /><Metric Icon={RiFocus3Line} label="Coste por lead" value={formatCents(summary?.costPerLeadCents, true)} detail="promedio ponderado" tone="emerald" /><Metric Icon={RiCursorLine} label="CTR" value={summary?.ctr == null ? 'Sin medición' : `${summary.ctr}%`} detail={`${summary?.leads ?? 0} leads medidos`} tone="violet" /></section>
      {!overview.campaigns.length ? <EmptyAds accountConnected={account?.connected} /> : <div className="ads-layout"><section className="ads-performance"><div className="ads-section-head"><div><h2>Rendimiento de campañas</h2><p>Elige una campaña para revisar su señal actual.</p></div><div className="ads-filter" aria-label="Filtrar campañas">{[['all', 'Todas'], ['active', 'Activas'], ['paused', 'Pausadas']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div><div className="ads-campaign-list" role="list">{campaigns.length ? campaigns.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} selected={campaign.id === selectedId} onSelect={setSelectedId} />) : <div className="ads-list-empty">No hay campañas que coincidan con este filtro.</div>}</div><div className="ads-table-footer"><span>{campaigns.length} campaña{campaigns.length === 1 ? '' : 's'} visibles</span><span><i /> Datos del último snapshot disponible</span></div></section>
        <aside className="ads-intelligence"><section className="ads-recommendation"><div className="ads-rail-title"><RiSparkling2Line /><h2>Optimización automática</h2></div>{recommendation ? <><p className="ads-priority">Prioridad principal</p><h3>{recommendation.title}</h3><p>{recommendation.detail}</p><button className="ads-action primary wide" onClick={applyRecommendation} disabled={optimizing}>{optimizing ? 'Aplicando…' : 'Aplicar límite recomendado'}</button></> : <div className="ads-recommendation-empty"><RiCheckboxCircleLine /><p>Cuando lleguen snapshots de Meta, el sistema priorizará una acción concreta.</p></div>}</section><section className="ads-selection"><div className="ads-rail-title"><RiLineChartLine /><h2>Campaña seleccionada</h2></div>{selectedCampaign ? <><strong>{selectedCampaign.name}</strong><p>{selectedCampaign.objective || 'Sin objetivo definido.'}</p><dl><div><dt>Leads</dt><dd>{selectedCampaign.latest.leadsCount}</dd></div><div><dt>Reuniones</dt><dd>{selectedCampaign.meetingsScheduled}</dd></div><div><dt>Límite CPL</dt><dd>{formatCents(selectedCampaign.maxCostPerLeadCents, true)}</dd></div></dl><Link to={`/campanas/${selectedCampaign.id}`} className="ads-detail-link">Abrir detalle <RiArrowRightLine /></Link></> : <p>Selecciona una campaña para ver su contexto.</p>}</section></aside></div>}
      {overview.campaigns.length > 0 && <section className="ads-lower-grid"><article className="ads-chart-panel"><div className="ads-section-head"><div><h2>Gasto y leads</h2><p>Una lectura diaria de los snapshots recibidos.</p></div><span>{chartData.length ? `${chartData.length} días` : 'Sin histórico'}</span></div>{chartData.length ? <div className="ads-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 14, right: 12, left: -23, bottom: 0 }}><defs><linearGradient id="adsSpendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity=".35" /><stop offset="100%" stopColor="#22d3ee" stopOpacity="0" /></linearGradient></defs><XAxis dataKey="label" tick={{ fill: '#71809a', fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71809a', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#101827', border: '1px solid #32425f', borderRadius: 9, color: '#e2e8f0', fontSize: 11 }} formatter={(value, name) => [name === 'spend' ? euro.format(value) : value, name === 'spend' ? 'Gasto' : 'Leads']} /><Area type="monotone" dataKey="spend" stroke="#22d3ee" strokeWidth={2.25} fill="url(#adsSpendGradient)" /><Area type="monotone" dataKey="leads" stroke="#818cf8" strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div> : <div className="ads-chart-empty">Aún no hay suficiente histórico de snapshots para dibujar la evolución.</div>}</article><CreativeDirection campaign={selectedCampaign} activeIndex={creativeIndex} onChange={setCreativeIndex} onCreate={() => navigate('/captacion/nueva')} /></section>}
    </>}
    {notice && <div className="ads-toast" role="status"><RiCheckboxCircleLine /> {notice}</div>}
  </main>
}
