import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiArrowRightLine, RiBarChartLine, RiFlowChart, RiGlobalLine, RiLeafLine,
  RiCompass3Line, RiShareForwardLine,
} from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { fetchOrganicOverview } from '../../lib/organic/organicApi'
import { formatLocaleNumber, useI18n } from '../../i18n'
import PageLoadingState from '../../components/ui/PageLoadingState'
import ProductPageHeader from '../../components/ui/ProductPageHeader'
import '../growth/growth-surface.css'
import '../growth-visual-standard.css'

/**
 * Portada de Captación: las cuatro etapas de un vistazo.
 *
 * No repite las páginas: enseña dos o tres cifras por etapa que ya calculan
 * los endpoints de cada módulo y la siguiente acción que sale de ellas. Cada
 * lectura es independiente y tolerante: si una falla, su tarjeta dice «sin
 * medición» y las demás siguen; nunca se rellena con ceros.
 */

async function readJson(path) {
  try {
    const response = await apiFetch(path)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function readOrganic() {
  try {
    const result = await fetchOrganicOverview({ period: '30d' })
    return result
  } catch {
    return null
  }
}

/** Todas las lecturas a la vez; ninguna tumba a las demás. */
async function loadOverview() {
  const [campaigns, ads, organic, landings, seo, funnels] = await Promise.all([
    readJson('/api/campaigns?page=1&limit=100'),
    readJson('/api/ads/overview'),
    readOrganic(),
    readJson('/api/landings/overview'),
    readJson('/api/seo/reports/latest'),
    readJson('/api/funnels/overview'),
  ])
  return { campaigns, ads, organic, landings, seo, funnels }
}

// Etapas con sus cifras y siguiente acción. Todo el texto sale de `t`
// (captacion.*); los formatos de número siguen el idioma de la sesión.
function buildStages(data, t, locale) {
  const money = cents => (cents === null || cents === undefined ? null : formatLocaleNumber(cents / 100, locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }))
  const number = value => (value === null || value === undefined ? null : formatLocaleNumber(value, locale))
  const campaignItems = Array.isArray(data.campaigns?.items) ? data.campaigns.items : Array.isArray(data.campaigns) ? data.campaigns : null
  const activeCampaigns = campaignItems ? campaignItems.filter(item => item.status === 'active').length : null
  const campaignLeads = campaignItems ? campaignItems.reduce((total, item) => total + (Number(item.totalLeads) || 0), 0) : null
  const campaignMeetings = campaignItems ? campaignItems.reduce((total, item) => total + (Number(item.meetingsScheduled) || 0), 0) : null

  const adsSummary = data.ads?.summary ?? null
  const adsMeasured = adsSummary?.fast?.spendCents != null
  const organicReady = data.organic?.status === 'ready' || data.organic?.status === 'empty'
  const organicLeads = organicReady ? data.organic?.data?.summary?.fast?.organicLeads ?? null : null

  const integrity = data.landings?.integrity ?? null
  const landingCount = integrity?.landings ?? (Array.isArray(data.landings?.items) ? data.landings.items.length : null)
  const measuredLandings = integrity?.measured ?? null
  const attention = Array.isArray(data.landings?.attention) ? data.landings.attention.length : 0
  const report = data.seo?.data ?? null

  const funnelSummary = data.funnels?.summary ?? null
  const funnelRecommendation = data.funnels?.recommendation ?? null

  return [
    {
      id: 'plan', number: '01', label: t('captacion.stages.plan.label'), detail: t('captacion.stages.plan.detail'), Icon: RiShareForwardLine, color: 'var(--capt-plan)', to: '/captacion/planificar',
      figures: [
        { label: t('captacion.figures.activeCampaigns'), value: number(activeCampaigns) },
        { label: t('captacion.figures.accumulatedLeads'), value: number(campaignLeads) },
        { label: t('captacion.figures.meetings'), value: number(campaignMeetings) },
      ],
      next: campaignItems === null
        ? { label: t('captacion.next.openCampaigns'), to: '/captacion/planificar' }
        : !campaignItems.length
          ? { label: t('captacion.next.createFirstCampaign'), to: '/captacion/planificar', tone: 'primary' }
          : !activeCampaigns
            ? { label: t('captacion.next.activateCampaign'), to: '/captacion/planificar', tone: 'primary' }
            : { label: t('captacion.next.reviewCampaigns'), to: '/captacion/planificar' },
    },
    {
      id: 'attract', number: '02', label: t('captacion.stages.attract.label'), detail: t('captacion.stages.attract.detail'), Icon: RiBarChartLine, color: 'var(--capt-attract)', to: '/captacion/atraer/ads',
      figures: [
        { label: t('captacion.figures.adsSpend'), value: adsMeasured ? money(adsSummary.fast.spendCents) : null },
        { label: t('captacion.figures.adsLeads'), value: adsMeasured ? number(adsSummary.fast.leads) : null },
        { label: t('captacion.figures.organicLeads'), value: number(organicLeads) },
      ],
      next: data.ads === null
        ? { label: t('captacion.next.connectMeta'), to: '/captacion/atraer/ads', tone: 'primary' }
        : !organicReady
          ? { label: t('captacion.next.setupOrganic'), to: '/captacion/atraer/organico', tone: 'primary' }
          : !adsMeasured
            ? { label: t('captacion.next.measureAds'), to: '/captacion/atraer/ads' }
            : { label: t('captacion.next.seeRecommendations'), to: '/captacion/atraer/organico?tab=acciones' },
      links: [
        { label: t('captacion.links.ads'), to: '/captacion/atraer/ads' },
        { label: t('captacion.links.organic'), to: '/captacion/atraer/organico' },
        { label: t('captacion.links.prospects'), to: '/captacion/atraer/prospectos' },
      ],
    },
    {
      id: 'convert', number: '03', label: t('captacion.stages.convert.label'), detail: t('captacion.stages.convert.detail'), Icon: RiGlobalLine, color: 'var(--capt-convert)', to: '/captacion/convertir',
      figures: [
        { label: t('captacion.figures.landingsMeasuring'), value: measuredLandings != null && landingCount != null ? t('captacion.figures.landingsMeasuringOf', { measured: number(measuredLandings), total: number(landingCount) }) : number(landingCount) },
        { label: t('captacion.figures.seoScore'), value: report ? t('captacion.figures.seoScoreValue', { score: report.score }) : null },
        { label: t('captacion.figures.openFindings'), value: data.landings ? number(attention) : null },
      ],
      next: !report
        ? { label: t('captacion.next.auditWeb'), to: '/captacion/convertir?tab=seo', tone: 'primary' }
        : attention
          ? { label: t(`captacion.next.attendFindings.${attention === 1 ? 'one' : 'other'}`, { count: attention }), to: '/captacion/convertir', tone: 'primary' }
          : integrity && integrity.state !== 'ready'
            ? { label: t('captacion.next.reviewLandingTracking'), to: '/captacion/convertir?tab=landings' }
            : { label: t('captacion.next.seeLandingsSeo'), to: '/captacion/convertir' },
    },
    {
      id: 'close', number: '04', label: t('captacion.stages.close.label'), detail: t('captacion.stages.close.detail'), Icon: RiFlowChart, color: 'var(--capt-close)', to: '/captacion/cerrar',
      figures: [
        { label: t('captacion.figures.activeFunnels'), value: number(funnelSummary?.active ?? null) },
        { label: t('captacion.figures.visitToLead'), value: funnelSummary?.visitToLead != null ? `${funnelSummary.visitToLead}%` : null },
        { label: t('captacion.figures.meetings'), value: number(funnelSummary?.meetings ?? null) },
      ],
      next: funnelRecommendation
        ? { label: funnelRecommendation.title, to: '/captacion/cerrar', tone: 'primary' }
        : funnelSummary && !funnelSummary.active
          ? { label: t('captacion.next.createFunnel'), to: '/captacion/cerrar', tone: 'primary' }
          : { label: t('captacion.next.seeFunnels'), to: '/captacion/cerrar' },
      links: [
        { label: t('captacion.links.calls'), to: '/llamadas' },
        { label: t('captacion.links.meetings'), to: '/reuniones' },
      ],
    },
  ]
}

export default function CaptacionOverview() {
  const { t, locale } = useI18n()
  const [state, setState] = useState({ loading: true, data: null })

  async function load() {
    setState(current => ({ ...current, loading: true }))
    setState({ loading: false, data: await loadOverview() })
  }
  useEffect(() => { load() }, [])

  if (state.loading) return <PageLoadingState label={t('captacion.loadingOverview')} />

  const stages = state.data ? buildStages(state.data, t, locale) : null

  return (
    <main className="gs-page captacion-home">
      <div className="gs-shell">
        <ProductPageHeader Icon={RiCompass3Line} title={t('captacion.title')} description={t('captacion.description')} />

        <section className="captacion-stage-cards" aria-label={t('captacion.stageStateAria')}>
          {(stages ?? buildStages({}, t, locale)).map(stage => {
            const Icon = stage.Icon
            return (
              <article key={stage.id} className={`captacion-card${state.loading ? ' is-loading' : ''}`} style={{ '--card-color': stage.color }}>
                <header>
                  <span className="captacion-card-number">{stage.number}</span>
                  <span className="captacion-card-icon"><Icon aria-hidden="true" /></span>
                  <div><h2><Link to={stage.to}>{stage.label}</Link></h2><p>{stage.detail}</p></div>
                </header>
                <div className="gs-minis">
                  {stage.figures.map(figure => (
                    <div key={figure.label} className={`gs-mini${figure.value == null && !state.loading ? ' is-missing' : ''}`}>
                      <span>{figure.label}</span>
                      <strong>{state.loading ? '…' : figure.value ?? t('captacion.noMeasurement')}</strong>
                    </div>
                  ))}
                </div>
                <footer>
                  {!state.loading ? <Link className={`gs-button small${stage.next.tone === 'primary' ? ' primary' : ''}`} to={stage.next.to}>{stage.next.label} <RiArrowRightLine /></Link> : <span className="gs-skeleton"><i /></span>}
                  {stage.links ? <div className="captacion-card-links">{stage.links.map(link => <Link key={link.to} to={link.to}>{link.label}</Link>)}</div> : null}
                </footer>
              </article>
            )
          })}
        </section>

        <section className="gs-panel is-dashed captacion-note">
          <div className="gs-panel-body">
            <RiLeafLine aria-hidden="true" />
            <p>{t('captacion.note')}</p>
          </div>
        </section>
      </div>
    </main>
  )
}
