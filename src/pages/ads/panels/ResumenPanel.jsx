import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAddLine, RiAlertLine, RiArrowRightLine, RiFocus3Line, RiMoneyEuroCircleLine,
  RiRocketLine, RiSparkling2Line, RiTrophyLine, RiUserFollowLine,
} from 'react-icons/ri'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatLocaleNumber, localeCode } from '../../../i18n'
import AdsFunnel from '../../../components/ads/AdsFunnel'
import AdsNarrative from '../../../components/ads/AdsNarrative'
import { CampaignRow, Metric, currency, formatCents } from '../primitives'

// Resumen de la operación de Ads: lectura rápida de los dos circuitos (el
// rápido protege el gasto, el lento decide dónde ponerlo) más la puerta de
// entrada al resto de pestañas. Es un panel presentacional: todos los datos
// llegan de useAdsOverview/useAdsPlan y aquí solo se ordenan y se pintan.
// Regla sagrada del dominio: null = «Sin medición», 0 = medido y salió cero.

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 }
const SEVERITY_PILL = { critical: 'tone-bad', warning: 'tone-warn', info: 'tone-info' }
const CONFIDENCE_LABEL = { high: 'alta', medium: 'media', low: 'baja' }

// Mismos filtros y mismas reglas que la página anterior: "necesitan atención"
// mezcla gravedad de la observación con coste fuera del objetivo de margen, y
// "datos incompletos" es lo contrario de una campaña medida.
const FILTERS = [
  ['all', 'Todas'], ['attention', 'Necesitan atención'], ['watch', 'En observación'],
  ['sales', 'Con ventas'], ['shadow', 'Modo sombra'], ['incomplete', 'Datos incompletos'],
]

export default function ResumenPanel({ overview, plan, ui }) {
  const { locale, colors } = ui
  const data = overview.overview
  // El filtro de la tabla es estado de UI puro: no viaja en la URL ni al servidor.
  const [filter, setFilter] = useState('all')

  const chartData = useMemo(() => (data?.series ?? []).map(point => ({
    ...point,
    label: new Date(`${point.date}T12:00:00`).toLocaleDateString(localeCode(locale), { day: 'numeric', month: 'short' }),
    spend: Math.round(point.spendCents / 100),
  })), [locale, data])

  const filteredCampaigns = useMemo(() => {
    const items = data?.campaigns ?? []
    const flagged = id => overview.decisionsByCampaign.get(id) ?? []
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
  }, [data, filter, overview.decisionsByCampaign])

  // La decisión más severa manda: es la respuesta honesta a "¿qué hago ahora?".
  const topDecision = useMemo(() => {
    const decisions = data?.decisions ?? []
    if (!decisions.length) return null
    return [...decisions].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))[0]
  }, [data])

  // Sin plan el alta devolvería 403: se explica el motivo y no se ofrece un
  // enlace que siempre fallaría.
  if (overview.dataStatus === 'plan') {
    return <div className="gs-stack">
      <section className="gs-panel">
        <div className="gs-empty">
          <span><RiRocketLine /></span>
          <h3>Ads no está incluido en tu plan</h3>
          <p>{overview.dataError || 'Mejora tu plan para publicar campañas y medir su rendimiento desde aquí.'}</p>
        </div>
      </section>
    </div>
  }

  const campaigns = data?.campaigns ?? []

  // Arranque honesto: sin campañas no hay nada que medir y no se enseña ningún
  // dato de ejemplo que aparente un embudo en marcha.
  if (!campaigns.length) {
    return <div className="gs-stack">
      <section className="gs-onboard">
        <span className="gs-onboard-icon"><RiRocketLine /></span>
        <h2>Cuando conectes un canal, aquí verás el recorrido completo</h2>
        <p>Campaña → lead → conversación → reunión. Empieza conectando Meta Ads o prepara tu cuenta para Google Ads. Todo lo que aparezca aquí será real: nada de datos de demostración.</p>
        <div className="gs-onboard-actions">
          <Link to="/captacion/nueva" className="gs-button primary"><RiAddLine /> Crear campaña</Link>
        </div>
      </section>
    </div>
  }

  const summary = data?.summary
  const fast = summary?.fast
  const mature = summary?.mature
  const period = data?.period
  const quality = data?.dataQuality
  const noMeasurement = locale === 'en' ? 'No measurement' : 'Sin medición'
  const fastDays = period?.days ?? 14
  const matureDays = data?.funnelPeriodDays ?? 30

  // Una campaña sin cohorte madura no se penaliza por no tener ventas: puede
  // ser simplemente demasiado joven (ads.md §4.7).
  const immatureCount = campaigns.filter(c => c.economics && c.economics.cohortStatus !== 'mature').length
  const cohortSummary = immatureCount > 0
    ? `${immatureCount === 1 ? 'Una campaña tiene' : `${immatureCount} campañas tienen`} la cohorte sin madurar: su falta de ventas todavía no significa nada.`
    : null

  const qualityIssues = quality?.issues ?? []
  const hasQualityProblem = qualityIssues.length > 0 || Boolean(quality?.status && quality.status !== 'ready')

  return <div className="gs-stack">
    {/* Cuatro tarjetas de ads.md §4.3. Las de cohorte madura (cualificados,
        CAC, compradores) dicen "Sin medición" hasta la Fase 1: es la respuesta
        honesta, no un cero que aparente un embudo vacío. */}
    <section className="ads-metrics" aria-label={locale === 'en' ? 'Ads performance summary' : 'Resumen de rendimiento Ads'}>
      <Metric Icon={RiMoneyEuroCircleLine} label={locale === 'en' ? 'Spend' : 'Gasto'} value={formatCents(fast?.spendCents, false, locale)} detail={`${fastDays} d · ${fast?.ctr == null ? (locale === 'en' ? 'no CTR yet' : 'sin CTR') : `CTR ${fast.ctr}%`}`} tone="cyan" />
      <Metric Icon={RiUserFollowLine} label={locale === 'en' ? 'Qualified' : 'Cualificados'} value={mature?.qualified == null ? noMeasurement : formatLocaleNumber(mature.qualified, locale)} detail={`${matureDays} d · ${mature?.qualified == null ? (locale === 'en' ? 'funnel not connected' : 'embudo sin conectar') : (locale === 'en' ? 'valid call outcome' : 'con llamada válida')}`} tone="emerald" />
      <Metric Icon={RiFocus3Line} label={mature?.cacCents != null ? 'CAC' : mature?.cpqlCents != null ? 'CPQL' : 'CPL'} value={formatCents(mature?.cacCents ?? mature?.cpqlCents ?? fast?.cplCents, true, locale)} detail={`${mature?.cacCents != null || mature?.cpqlCents != null ? matureDays : fastDays} d · ${mature?.cacCents != null ? (locale === 'en' ? 'per buyer' : 'por comprador') : mature?.cpqlCents != null ? (locale === 'en' ? 'per qualified lead' : 'por cualificado') : (locale === 'en' ? 'no deeper signal' : 'sin señal más profunda')}`} tone="indigo" />
      <Metric Icon={RiTrophyLine} label={locale === 'en' ? 'Buyers / real ROAS' : 'Compradores / ROAS real'} value={mature?.sales == null ? noMeasurement : formatLocaleNumber(mature.sales, locale)} detail={`${matureDays} d · ${mature?.roas == null ? (locale === 'en' ? 'no mature cohort' : 'sin cohorte madura') : `ROAS ${mature.roas}`}`} tone="violet" />
    </section>

    {/* Los dos circuitos de ads.md §4.7 se separan a la vista: mezclarlos
        invita a castigar hoy una campaña cuyos compradores tardan diez días. */}
    <p className="ads-circuit"><span>Ahora</span><small>{`Señales rápidas de entrega · últimos ${fastDays} días`}</small></p>

    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>{locale === 'en' ? 'Spend and leads' : 'Gasto y leads'}</h2>
          <p>{locale === 'en' ? 'A daily view of your campaign results.' : 'Una lectura diaria de los resultados de tus campañas.'}</p>
        </div>
        <span className="gs-panel-note">{chartData.length ? `${chartData.length} ${locale === 'en' ? 'days' : 'días'}` : (locale === 'en' ? 'No history' : 'Sin histórico')}</span>
      </div>
      <div className="gs-panel-body">
        {chartData.length ? <div className="ads-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 14, right: 12, left: -23, bottom: 0 }}>
              <defs>
                <linearGradient id="adsSpendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.cyan} stopOpacity=".35" />
                  <stop offset="100%" stopColor={colors.cyan} stopOpacity="0" />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: colors.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: colors.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--text)', fontSize: 11 }} formatter={(value, name) => [name === 'spend' ? currency(locale).format(value) : value, name === 'spend' ? (locale === 'en' ? 'Spend' : 'Gasto') : 'Leads']} />
              <Area type="monotone" dataKey="spend" stroke={colors.cyan} strokeWidth={2.25} fill="url(#adsSpendGradient)" />
              <Area type="monotone" dataKey="leads" stroke={colors.accentSoft} strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div> : <div className="ads-chart-empty">{locale === 'en' ? 'There is not enough history yet to draw the trend.' : 'Todavía no hay suficiente histórico para dibujar la evolución.'}</div>}
      </div>
    </section>

    <p className="ads-circuit"><span>Resultado</span><small>{`Cohortes maduras · últimos ${matureDays} días`}</small></p>

    <AdsFunnel
      funnel={data?.funnel}
      deepestEligibleSignal={summary?.deepestEligibleSignal}
      eligibilityReason={summary?.eligibilityReason}
      periodDays={matureDays}
      cohortSummary={cohortSummary}
    />

    {/* La decisión más severa del período, o la verdad de que no hay ninguna:
        el detalle completo (evidencia, aprobar, rechazar) vive en Decisiones. */}
    <section className="gs-panel is-accent">
      <div className="gs-panel-head">
        <div>
          <span className="gs-overline">Próxima acción recomendada</span>
          <h2>{topDecision ? topDecision.title : 'Sin recomendaciones pendientes'}</h2>
          <p>{topDecision ? topDecision.recommendation : 'Vendrava no ha detectado ningún problema que merezca una recomendación en este período.'}</p>
        </div>
        {topDecision && <div className="gs-panel-actions">
          <button type="button" className="gs-button accent" onClick={() => ui.selectTab('decisiones')}><RiSparkling2Line /> Ver en Decisiones</button>
        </div>}
      </div>
      {topDecision && <div className="gs-panel-body">
        <span className={`gs-pill ${SEVERITY_PILL[topDecision.severity] ?? 'tone-info'}`}>Confianza {CONFIDENCE_LABEL[topDecision.confidence] ?? topDecision.confidence}</span>
        {topDecision.campaignName && <span className="gs-pill">{topDecision.campaignName}</span>}
      </div>}
    </section>

    {/* La calidad del dato limita lo que las cifras pueden afirmar: si hay
        incidencias se dicen aquí, y el arreglo vive en Medición. */}
    {hasQualityProblem && <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>Problemas importantes</h2>
          <p>La medición no está al 100 %: revisa qué falta antes de fiarte de las métricas profundas.</p>
        </div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-link" onClick={() => ui.selectTab('medicion')}>Revisar medición <RiArrowRightLine /></button>
        </div>
      </div>
      <div className="gs-panel-body">
        {qualityIssues.length ? qualityIssues.slice(0, 4).map(issue => <p key={issue.code} className={`gs-alert${issue.severity === 'critical' ? ' is-error' : ''}`}><RiAlertLine /><span>{issue.message}{issue.action ? <> <em>{issue.action}</em></> : null}</span></p>) : <p className="gs-alert"><RiAlertLine /><span>Los datos están en estado «{quality?.status}»: las comparaciones entre campañas pierden fiabilidad.</span></p>}
      </div>
    </section>}

    {/* Seleccionar una fila fija el contexto de campaña de toda la página
        (?campaign=): Estructura, Creatividades y Medición leerán esa selección. */}
    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>Rendimiento por campaña</h2>
          <p>Elige una campaña para fijar el contexto de trabajo de toda la página.</p>
        </div>
        <div className="gs-panel-actions gs-choices" role="group" aria-label="Filtrar campañas">
          {FILTERS.map(([value, label]) => <button key={value} type="button" className={`gs-choice${filter === value ? ' selected' : ''}`} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
      </div>
      <div className="gs-panel-body">
        <div className="ads-campaign-list" role="list">
          {filteredCampaigns.length
            ? filteredCampaigns.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} selected={plan.selectedId === campaign.id} locale={locale} onSelect={plan.selectCampaign} />)
            : <div className="ads-list-empty">No hay campañas que coincidan con este filtro.</div>}
        </div>
      </div>
      <footer className="gs-panel-foot">
        <span className="gs-muted">{filteredCampaigns.length} campaña{filteredCampaigns.length === 1 ? '' : 's'} visibles · datos de la última medición disponible</span>
      </footer>
    </section>

    <AdsNarrative narrative={data?.weeklyNarrative} />
  </div>
}
