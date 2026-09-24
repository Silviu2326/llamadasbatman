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

// Mismos filtros y mismas reglas que la página anterior: "necesitan atención"
// mezcla gravedad de la observación con coste fuera del objetivo de margen, y
// "datos incompletos" es lo contrario de una campaña medida. Etiquetas en
// ads.resumen.filters.<id>.
const FILTERS = ['all', 'attention', 'watch', 'sales', 'shadow', 'incomplete']

export default function ResumenPanel({ overview, plan, ui }) {
  const { locale, colors, t } = ui
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
          <h3>{t('ads.resumen.planTitle')}</h3>
          <p>{overview.dataError || t('ads.resumen.planText')}</p>
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
        <h2>{t('ads.resumen.onboardTitle')}</h2>
        <p>{t('ads.resumen.onboardText')}</p>
        <div className="gs-onboard-actions">
          <Link to="/captacion/nueva" className="gs-button primary"><RiAddLine /> {t('ads.resumen.createCampaign')}</Link>
        </div>
      </section>
    </div>
  }

  const summary = data?.summary
  const fast = summary?.fast
  const mature = summary?.mature
  const period = data?.period
  const quality = data?.dataQuality
  const noMeasurement = t('ads.common.noMeasurement')
  const fastDays = period?.days ?? 14
  const matureDays = data?.funnelPeriodDays ?? 30

  // Una campaña sin cohorte madura no se penaliza por no tener ventas: puede
  // ser simplemente demasiado joven (ads.md §4.7).
  const immatureCount = campaigns.filter(c => c.economics && c.economics.cohortStatus !== 'mature').length
  const cohortSummary = immatureCount > 0
    ? (immatureCount === 1 ? t('ads.resumen.cohortOne') : t('ads.resumen.cohortMany', { count: immatureCount }))
    : null

  const qualityIssues = quality?.issues ?? []
  const hasQualityProblem = qualityIssues.length > 0 || Boolean(quality?.status && quality.status !== 'ready')

  return <div className="gs-stack">
    {/* Cuatro tarjetas de ads.md §4.3. Las de cohorte madura (cualificados,
        CAC, compradores) dicen "Sin medición" hasta la Fase 1: es la respuesta
        honesta, no un cero que aparente un embudo vacío. */}
    <section className="ads-metrics" aria-label={t('ads.resumen.metricsAria')}>
      <Metric Icon={RiMoneyEuroCircleLine} label={t('ads.resumen.spend')} value={formatCents(fast?.spendCents, false, locale, t)} detail={`${fastDays} d · ${fast?.ctr == null ? t('ads.resumen.noCtr') : `CTR ${fast.ctr}%`}`} tone="cyan" />
      <Metric Icon={RiUserFollowLine} label={t('ads.resumen.qualified')} value={mature?.qualified == null ? noMeasurement : formatLocaleNumber(mature.qualified, locale)} detail={`${matureDays} d · ${mature?.qualified == null ? t('ads.resumen.funnelNotConnected') : t('ads.resumen.validCall')}`} tone="emerald" />
      <Metric Icon={RiFocus3Line} label={mature?.cacCents != null ? 'CAC' : mature?.cpqlCents != null ? 'CPQL' : 'CPL'} value={formatCents(mature?.cacCents ?? mature?.cpqlCents ?? fast?.cplCents, true, locale, t)} detail={`${mature?.cacCents != null || mature?.cpqlCents != null ? matureDays : fastDays} d · ${mature?.cacCents != null ? t('ads.resumen.perBuyer') : mature?.cpqlCents != null ? t('ads.resumen.perQualified') : t('ads.resumen.noDeeperSignal')}`} tone="indigo" />
      <Metric Icon={RiTrophyLine} label={t('ads.resumen.buyers')} value={mature?.sales == null ? noMeasurement : formatLocaleNumber(mature.sales, locale)} detail={`${matureDays} d · ${mature?.roas == null ? t('ads.resumen.noMatureCohort') : `ROAS ${mature.roas}`}`} tone="violet" />
    </section>

    {/* Los dos circuitos de ads.md §4.7 se separan a la vista: mezclarlos
        invita a castigar hoy una campaña cuyos compradores tardan diez días. */}
    <p className="ads-circuit"><span>{t('ads.resumen.now')}</span><small>{t('ads.resumen.fastSignals', { days: fastDays })}</small></p>

    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>{t('ads.resumen.spendAndLeads')}</h2>
          <p>{t('ads.resumen.dailyView')}</p>
        </div>
        <span className="gs-panel-note">{chartData.length ? t('ads.resumen.days', { count: chartData.length }) : t('ads.resumen.noHistory')}</span>
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
              <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 9, color: 'var(--text)', fontSize: 11 }} formatter={(value, name) => [name === 'spend' ? currency(locale).format(value) : value, name === 'spend' ? t('ads.resumen.spend') : t('ads.common.leads')]} />
              <Area type="monotone" dataKey="spend" stroke={colors.cyan} strokeWidth={2.25} fill="url(#adsSpendGradient)" />
              <Area type="monotone" dataKey="leads" stroke={colors.accentSoft} strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div> : <div className="ads-chart-empty">{t('ads.resumen.noHistoryChart')}</div>}
      </div>
    </section>

    <p className="ads-circuit"><span>{t('ads.resumen.result')}</span><small>{t('ads.resumen.matureCohorts', { days: matureDays })}</small></p>

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
          <span className="gs-overline">{t('ads.resumen.nextAction')}</span>
          <h2>{topDecision ? topDecision.title : t('ads.resumen.noRecommendations')}</h2>
          <p>{topDecision ? topDecision.recommendation : t('ads.resumen.noRecommendationsText')}</p>
        </div>
        {topDecision && <div className="gs-panel-actions">
          <button type="button" className="gs-button accent" onClick={() => ui.selectTab('decisiones')}><RiSparkling2Line /> {t('ads.resumen.seeDecisions')}</button>
        </div>}
      </div>
      {topDecision && <div className="gs-panel-body">
        <span className={`gs-pill ${SEVERITY_PILL[topDecision.severity] ?? 'tone-info'}`}>{t('ads.resumen.confidenceLabel', { level: t(`ads.resumen.confidence.${topDecision.confidence}`) ?? topDecision.confidence })}</span>
        {topDecision.campaignName && <span className="gs-pill">{topDecision.campaignName}</span>}
      </div>}
    </section>

    {/* La calidad del dato limita lo que las cifras pueden afirmar: si hay
        incidencias se dicen aquí, y el arreglo vive en Medición. */}
    {hasQualityProblem && <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>{t('ads.resumen.issuesTitle')}</h2>
          <p>{t('ads.resumen.issuesText')}</p>
        </div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-link" onClick={() => ui.selectTab('medicion')}>{t('ads.resumen.reviewMeasurement')} <RiArrowRightLine /></button>
        </div>
      </div>
      <div className="gs-panel-body">
        {qualityIssues.length ? qualityIssues.slice(0, 4).map(issue => <p key={issue.code} className={`gs-alert${issue.severity === 'critical' ? ' is-error' : ''}`}><RiAlertLine /><span>{issue.message}{issue.action ? <> <em>{issue.action}</em></> : null}</span></p>) : <p className="gs-alert"><RiAlertLine /><span>{t('ads.resumen.issuesStatus', { status: quality?.status })}</span></p>}
      </div>
    </section>}

    {/* Seleccionar una fila fija el contexto de campaña de toda la página
        (?campaign=): Estructura, Creatividades y Medición leerán esa selección. */}
    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>{t('ads.resumen.perCampaign')}</h2>
          <p>{t('ads.resumen.perCampaignText')}</p>
        </div>
        <div className="gs-panel-actions gs-choices" role="group" aria-label={t('ads.resumen.filterAria')}>
          {FILTERS.map(value => <button key={value} type="button" className={`gs-choice${filter === value ? ' selected' : ''}`} onClick={() => setFilter(value)}>{t(`ads.resumen.filters.${value}`)}</button>)}
        </div>
      </div>
      <div className="gs-panel-body">
        <div className="ads-campaign-list" role="list">
          {filteredCampaigns.length
            ? filteredCampaigns.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} selected={plan.selectedId === campaign.id} locale={locale} t={t} onSelect={plan.selectCampaign} />)
            : <div className="ads-list-empty">{t('ads.resumen.noMatches')}</div>}
        </div>
      </div>
      <footer className="gs-panel-foot">
        <span className="gs-muted">{filteredCampaigns.length === 1 ? t('ads.resumen.visibleOne') : t('ads.resumen.visibleMany', { count: filteredCampaigns.length })}</span>
      </footer>
    </section>

    <AdsNarrative narrative={data?.weeklyNarrative} />
  </div>
}
