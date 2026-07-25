import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ComposedChart } from 'recharts'
import { RiArrowRightSLine, RiBarChartLine, RiCalendarLine, RiCheckLine, RiFilterLine, RiGroupLine, RiLineChartLine, RiMoneyDollarBoxLine, RiPhoneLine, RiRefreshLine, RiRocketLine, RiSparkling2Line, RiTimeLine } from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { DEMO_MODE, getApiErrorMessage, isNonEmptyPayload } from '../lib/dataMode'
import insightsHeroImage from '../assets/insights-hero.png'
import '../dashboard.css'
import './insights.css'
import { getLocale, localeCode, useI18n } from '../i18n'

const COLORS = ['#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa']
const tooltipProps = { contentStyle: { background: '#0d1117', border: '1px solid #273249', borderRadius: 9, fontSize: 11 }, labelStyle: { color: '#94a3b8' }, itemStyle: { color: '#e2e8f0' } }
const DEMO_STATS = {
  closedWonValue: 48600, pipelineValue: 128400, meetingsScheduled: 34, conversionRate: 18.7, totalCalls: 462, totalLeads: 186, activeCampaigns: 4,
  kpiPcts: { pipeline: 22, meetings: 14, calls: 18, leads: 9 },
  timeSeries: [{ date: 'Lun', llamadas: 42, reuniones: 4 }, { date: 'Mar', llamadas: 58, reuniones: 6 }, { date: 'Mié', llamadas: 51, reuniones: 5 }, { date: 'Jue', llamadas: 76, reuniones: 8 }, { date: 'Vie', llamadas: 64, reuniones: 7 }, { date: 'Sáb', llamadas: 36, reuniones: 2 }, { date: 'Dom', llamadas: 28, reuniones: 2 }],
  callsByCampaign: [{ name: 'Outbound B2B', value: 164, pct: 35 }, { name: 'Reactivación Q3', value: 118, pct: 26 }, { name: 'Demo producto', value: 92, pct: 20 }, { name: 'Partners', value: 54, pct: 12 }, { name: 'Inbound', value: 34, pct: 7 }],
  funnel: [{ label: 'Leads', value: 186 }, { label: 'Contactados', value: 132 }, { label: 'Cualificados', value: 74 }, { label: 'Propuesta', value: 41 }, { label: 'Ganados', value: 18 }],
  agentLeaderboard: [{ name: 'Sofía', calls: 138 }, { name: 'Leo', calls: 112 }, { name: 'Clara', calls: 96 }, { name: 'Nora', calls: 71 }, { name: 'Hugo', calls: 45 }],
  sentiment: { positive: 62, neutral: 27, negative: 11 },
  pipelineByDay: [{ date: '05 Jul', value: 12400 }, { date: '06 Jul', value: 19800 }, { date: '07 Jul', value: 8200 }, { date: '08 Jul', value: 26400 }, { date: '09 Jul', value: 17200 }, { date: '10 Jul', value: 22100 }, { date: '11 Jul', value: 12300 }],
}

const EMPTY_STATS = {
  closedWonValue: 0,
  pipelineValue: 0,
  meetingsScheduled: 0,
  conversionRate: 0,
  totalCalls: 0,
  totalLeads: 0,
  activeCampaigns: 0,
  kpiPcts: {},
  timeSeries: [],
  callsByCampaign: [],
  funnel: [],
  agentLeaderboard: [],
  sentiment: null,
  pipelineByDay: [],
}

function displayValue(value, empty) {
  return empty ? '—' : value
}

function Empty({ message }) { return <div className="insights-empty"><div><RiLineChartLine /></div><strong>Aún no hay datos suficientes</strong><p>{message}</p></div> }

function Metric({ Icon, label, value, detail, color }) { return <article className="insights-metric"><div className="insights-metric-icon" style={{ color, background: `${color}18`, borderColor: `${color}38` }}><Icon /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article> }

function ActivityChart({ data, period, setPeriod }) {
  if (!data.length) return <Empty message="Las llamadas y reuniones aparecerán aquí cuando empiecen a registrarse." />
  return <><div className="insights-panel-heading"><div><span className="insights-eyebrow">Ritmo comercial</span><h2>Actividad a lo largo del tiempo</h2><p>Compara volumen de llamadas con reuniones generadas.</p></div><select value={period} onChange={event => setPeriod(event.target.value)} aria-label="Periodo del gráfico">{['Diario', 'Semanal', 'Mensual'].map(item => <option key={item}>{item}</option>)}</select></div><div className="insights-legend"><span><i className="cyan" /> Llamadas</span><span><i className="green" /> Reuniones</span></div><ResponsiveContainer width="100%" height={220}><ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}><XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} width={30} /><Tooltip {...tooltipProps} /><Bar dataKey="llamadas" name="Llamadas" fill="#22d3ee" fillOpacity={.65} radius={[4, 4, 0, 0]} /><Line type="monotone" dataKey="reuniones" name="Reuniones" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: '#34d399', strokeWidth: 0 }} /></ComposedChart></ResponsiveContainer></>
}

function CampaignMix({ data }) {
  if (!data.length) return <Empty message="Cuando haya campañas con actividad podrás comparar su peso aquí." />
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return <div className="insights-campaign-mix"><div className="insights-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" innerRadius={45} outerRadius={67} strokeWidth={0}>{data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer><div><strong>{total}</strong><span>llamadas</span></div></div><div className="insights-campaign-list">{data.slice(0, 5).map((item, index) => <div key={item.name}><span><i style={{ background: COLORS[index % COLORS.length] }} />{item.name}</span><strong>{item.value}<small>{item.pct}%</small></strong></div>)}</div></div>
}

function Funnel({ data }) {
  const { locale } = useI18n()
  if (!data.length) return <Empty message="El embudo se activará cuando existan oportunidades en el pipeline." />
  const max = data[0]?.value || 1
  return <div className="insights-funnel">{data.map((item, index) => <div className="insights-funnel-row" key={item.label}><div className="insights-funnel-bar" style={{ width: `${Math.max(18, (item.value / max) * 100)}%`, background: COLORS[index % COLORS.length] }}><span>{item.label}</span><strong>{item.value.toLocaleString(localeCode(locale))}</strong></div></div>)} </div>
}

function Sentiment({ sentiment }) {
  const { locale } = useI18n()
  if (!sentiment) return <Empty message="Procesaremos el sentimiento cuando existan transcripciones disponibles." />
  const data = [{ name: locale === 'en' ? 'Positive' : 'Positivo', value: sentiment.positive, color: '#34d399' }, { name: 'Neutral', value: sentiment.neutral, color: '#fbbf24' }, { name: locale === 'en' ? 'Negative' : 'Negativo', value: sentiment.negative, color: '#fb7185' }]
  if (!data.some(item => Number(item.value) > 0)) return <Empty message="Procesaremos el sentimiento cuando existan transcripciones disponibles." />
  return <div className="insights-sentiment"><div className="insights-sentiment-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.some(item => item.value > 0) ? data : [{ value: 1, color: '#1e293b' }]} dataKey="value" innerRadius={35} outerRadius={52} strokeWidth={0}>{(data.some(item => item.value > 0) ? data : [{ color: '#1e293b' }]).map((item, index) => <Cell key={index} fill={item.color} />)}</Pie></PieChart></ResponsiveContainer><div><strong>{sentiment.positive || '—'}%</strong><span>positivo</span></div></div><div className="insights-sentiment-list">{data.map(item => <div key={item.name}><span><i style={{ background: item.color }} />{item.name}</span><div><span className="sentiment-track"><b style={{ width: `${item.value}%`, background: item.color }} /></span><strong>{item.value}%</strong></div></div>)}</div></div>
}

export default function Insights() {
  const { t, locale } = useI18n()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('Diario')
  const [notice, setNotice] = useState('')
  const [dataSource, setDataSource] = useState(DEMO_MODE ? 'demo' : 'loading')
  const [error, setError] = useState('')

  async function loadStats() {
    setLoading(true)
    setError('')
    try {
      const response = await apiFetch('/api/dashboard/stats')
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(getApiErrorMessage(body, 'No se pudieron cargar los insights.'))
      const nextStats = body && typeof body === 'object' ? { ...EMPTY_STATS, ...body } : EMPTY_STATS
      setStats(nextStats)
      setDataSource(isNonEmptyPayload(nextStats) ? 'live' : 'empty')
    } catch (loadError) {
      setError(loadError.message || 'No se pudo cargar la lectura de rendimiento.')
      if (DEMO_MODE) {
        setStats(DEMO_STATS)
        setDataSource('demo')
      } else {
        setStats(EMPTY_STATS)
        setDataSource('disconnected')
      }
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadStats() }, [])

  const metrics = useMemo(() => stats ? [
    { Icon: RiMoneyDollarBoxLine, label: locale === 'en' ? 'Closed pipeline' : 'Pipeline cerrado', value: `€${Math.round(stats.closedWonValue ?? 0).toLocaleString(localeCode(locale))}`, detail: `${stats.kpiPcts?.pipeline ?? 0}% ${locale === 'en' ? 'vs. previous period' : 'vs. periodo anterior'}`, color: '#a78bfa' },
    { Icon: RiCalendarLine, label: locale === 'en' ? 'Meetings booked' : 'Reuniones agendadas', value: stats.meetingsScheduled ?? 0, detail: `${stats.kpiPcts?.meetings ?? 0}% ${locale === 'en' ? 'change' : 'de variación'}`, color: '#22d3ee' },
    { Icon: RiLineChartLine, label: locale === 'en' ? 'Overall conversion' : 'Conversión global', value: `${stats.conversionRate ?? 0}%`, detail: locale === 'en' ? 'over the current funnel' : 'sobre el funnel actual', color: '#34d399' },
    { Icon: RiPhoneLine, label: locale === 'en' ? 'Total calls' : 'Llamadas totales', value: stats.totalCalls ?? 0, detail: `${stats.kpiPcts?.calls ?? 0}% ${locale === 'en' ? 'change' : 'de variación'}`, color: '#fbbf24' },
  ] : [], [stats, dataSource, locale])
  const bestCampaign = stats?.callsByCampaign?.[0]
  const activeCampaigns = stats?.activeCampaigns ?? 0

  return <div className="dark-scroll insights-page">
    {DEMO_MODE && <div className="insights-demo-banner" role="status"><RiSparkling2Line /><div><strong>Estás viendo datos demo</strong><span>Sirven para explorar la experiencia. El modo demo se ha habilitado explícitamente.</span></div><button onClick={loadStats}><RiRefreshLine /> Intentar conexión real</button></div>}
    <header className="insights-header"><div className="insights-heading"><div className="insights-brand-icon"><RiBarChartLine /></div><div><h1>{t('modules.insightsTitle')}</h1><p>{locale === 'en' ? 'Turn CRM activity into decisions that move the pipeline.' : 'Convierte la actividad de tu CRM en decisiones que mueven el pipeline.'}</p></div></div><div className="insights-header-actions"><button className="insights-button ghost" onClick={loadStats}><RiRefreshLine /> {t('calls.refresh')}</button><button className="insights-button secondary" onClick={() => setNotice('Los filtros avanzados estarán disponibles al conectar más fuentes de datos.')}><RiFilterLine /> {t('calls.filters')}</button></div></header>

    <section className="insights-hero" aria-labelledby="insights-hero-title"><div className="insights-hero-copy"><div className="insights-hero-status"><i /> Lectura ejecutiva · datos actualizados</div><h2 id="insights-hero-title">Mira el patrón. Decide el siguiente movimiento.</h2><p>Una vista unificada de llamadas, reuniones, campañas y pipeline para entender qué está funcionando y dónde actuar ahora.</p><div className="insights-hero-actions"><button className="insights-button primary" onClick={() => document.querySelector('#insights-evidence')?.scrollIntoView({ behavior: 'smooth' })}><RiSparkling2Line /> Explorar señales</button><button className="insights-button secondary" onClick={() => document.querySelector('#insights-detail')?.scrollIntoView({ behavior: 'smooth' })}>Ver detalle <RiArrowRightSLine /></button></div><div className="insights-hero-meta"><span><RiCheckLine /> Datos agregados del CRM</span><span><RiTimeLine /> Actualización automática</span></div></div><div className="insights-hero-media"><img src={insightsHeroImage} alt="Capa visual de inteligencia sobre datos comerciales" /><div className="insights-hero-caption"><span>Revenue intelligence</span><strong>Observar · entender · actuar</strong></div></div></section>

    {loading ? <div className="insights-loading"><RiBarChartLine /><span>Preparando tu lectura de rendimiento…</span></div> : stats ? <>
      <section className="insights-metrics" aria-label="Resumen de rendimiento">{metrics.map(metric => <Metric key={metric.label} {...metric} />)}</section>

      <section className="insights-signal-band" id="insights-evidence"><div className="insights-signal-intro"><span className="insights-eyebrow">Lectura rápida</span><h2>Lo que merece tu atención.</h2><p>Señales derivadas de los datos que ya tienes en VozIA.</p></div><div className="insights-signal-grid"><article><span><RiRocketLine /> Campaña líder</span><strong>{bestCampaign?.name ?? 'Sin datos todavía'}</strong><small>{bestCampaign ? `${bestCampaign.value} llamadas · ${bestCampaign.pct}% del total` : 'Añade actividad para identificar el canal con más tracción.'}</small></article><article><span><RiGroupLine /> Base comercial</span><strong>{stats.totalLeads ?? 0} leads</strong><small>{activeCampaigns} campañas activas conectadas al análisis.</small></article><article><span><RiCalendarLine /> Próximo foco</span><strong>{stats.meetingsScheduled ?? 0} reuniones</strong><small>Revisa la conversión para saber dónde priorizar seguimiento.</small></article></div></section>

      <section className="insights-evidence-grid"><article className="insights-panel insights-chart-panel"><ActivityChart data={stats.timeSeries ?? []} period={period} setPeriod={setPeriod} /></article><article className="insights-panel"><div className="insights-panel-heading"><div><span className="insights-eyebrow">Distribución</span><h2>Llamadas por campaña</h2><p>Cómo se reparte el esfuerzo comercial.</p></div></div><CampaignMix data={stats.callsByCampaign ?? []} /></article></section>

      <section className="insights-detail-grid" id="insights-detail"><article className="insights-panel"><div className="insights-panel-heading"><div><span className="insights-eyebrow">Conversión</span><h2>Embudo comercial</h2><p>La progresión de oportunidades por etapa.</p></div></div><Funnel data={stats.funnel ?? []} /></article><article className="insights-panel"><div className="insights-panel-heading"><div><span className="insights-eyebrow">Equipo</span><h2>Agentes IA con más actividad</h2><p>Volumen de llamadas por agente.</p></div></div>{stats.agentLeaderboard?.length ? <div className="insights-agent-list">{stats.agentLeaderboard.slice(0, 5).map((agent, index) => <div key={agent.name}><span className="agent-rank">0{index + 1}</span><span className="agent-avatar">{agent.name.slice(0, 2).toUpperCase()}</span><strong>{agent.name}</strong><b>{agent.calls}</b></div>)}</div> : <Empty message="El ranking aparecerá cuando los agentes empiecen a registrar llamadas." />}</article><article className="insights-panel"><div className="insights-panel-heading"><div><span className="insights-eyebrow">Conversaciones</span><h2>Sentimiento</h2><p>Lectura de las transcripciones procesadas.</p></div></div><Sentiment sentiment={stats.sentiment} /></article></section>

      <section className="insights-bottom-grid"><article className="insights-panel"><div className="insights-panel-heading"><div><span className="insights-eyebrow">Pipeline</span><h2>Valor generado por día</h2><p>Últimos siete días registrados.</p></div></div>{stats.pipelineByDay?.length ? <div className="insights-pipeline-list">{stats.pipelineByDay.map(item => <div key={item.date}><span>{item.date}</span><div><span><b style={{ width: `${stats.pipelineValue ? Math.min(100, (item.value / stats.pipelineValue) * 100) : 0}%` }} /></span><strong>{item.value ? `€${Math.round(item.value).toLocaleString(localeCode(getLocale()))}` : '—'}</strong></div></div>)}</div> : <Empty message="No hay oportunidades registradas esta semana." />}</article><aside className="insights-panel insights-summary"><div className="insights-panel-heading"><div><span className="insights-eyebrow">Resumen global</span><h2>Tu contexto actual</h2></div></div><div className="insights-summary-list"><div><span>Campañas activas</span><strong>{stats.activeCampaigns ?? 0}</strong></div><div><span>Pipeline total</span><strong>€{Math.round(stats.pipelineValue ?? 0).toLocaleString(localeCode(getLocale()))}</strong></div><div><span>Pipeline cerrado</span><strong>€{Math.round(stats.closedWonValue ?? 0).toLocaleString(localeCode(getLocale()))}</strong></div><div><span>Tasa de conversión</span><strong>{stats.conversionRate ?? 0}%</strong></div></div><button className="insights-link-button" onClick={() => setNotice('El detalle por fuente estará disponible próximamente.')}>Profundizar en el análisis <RiArrowRightSLine /></button></aside></section>
    </> : <div className="insights-full-empty"><RiLineChartLine /><h2>No hemos podido cargar tus insights</h2><p>Comprueba la conexión y vuelve a intentarlo para ver el rendimiento de tu CRM.</p><button className="insights-button primary" onClick={loadStats}><RiRefreshLine /> Reintentar</button></div>}
    <footer className="insights-footer"><span>Los datos se actualizan automáticamente desde tu cuenta.</span><span><RiCheckLine /> Lectura basada en actividad real</span></footer>{notice && <div className="insights-toast" role="status"><RiCheckLine /> {notice}</div>}
  </div>
}
