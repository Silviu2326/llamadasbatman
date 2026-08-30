import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiArrowRightLine, RiBarChartLine, RiFlowChart, RiGlobalLine, RiLeafLine,
  RiRocket2Line, RiShareForwardLine,
} from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { fetchOrganicOverview } from '../../lib/organic/organicApi'
import { getLocale, localeCode, useI18n } from '../../i18n'
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

function money(cents) {
  if (cents === null || cents === undefined) return null
  return new Intl.NumberFormat(localeCode(getLocale()), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function number(value) {
  if (value === null || value === undefined) return null
  return new Intl.NumberFormat(localeCode(getLocale())).format(value)
}

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

function buildStages(data) {
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
      id: 'plan', number: '01', label: 'Planificar', detail: 'Campañas y objetivos', Icon: RiShareForwardLine, color: 'var(--pink)', to: '/captacion/planificar',
      figures: [
        { label: 'Campañas activas', value: number(activeCampaigns) },
        { label: 'Leads acumulados', value: number(campaignLeads) },
        { label: 'Reuniones', value: number(campaignMeetings) },
      ],
      next: campaignItems === null
        ? { label: 'Abrir campañas', to: '/captacion/planificar' }
        : !campaignItems.length
          ? { label: 'Crea tu primera campaña', to: '/captacion/planificar', tone: 'primary' }
          : !activeCampaigns
            ? { label: 'Activa una campaña', to: '/captacion/planificar', tone: 'primary' }
            : { label: 'Revisar campañas', to: '/captacion/planificar' },
    },
    {
      id: 'attract', number: '02', label: 'Atraer', detail: 'Ads · Orgánico y social · Prospectos', Icon: RiBarChartLine, color: 'var(--accent-soft)', to: '/captacion/atraer/ads',
      figures: [
        { label: 'Gasto en Ads (período)', value: adsMeasured ? money(adsSummary.fast.spendCents) : null },
        { label: 'Leads de Ads', value: adsMeasured ? number(adsSummary.fast.leads) : null },
        { label: 'Leads orgánicos (30 días)', value: number(organicLeads) },
      ],
      next: data.ads === null
        ? { label: 'Conecta Meta y mide Ads', to: '/captacion/atraer/ads', tone: 'primary' }
        : !organicReady
          ? { label: 'Configura el orgánico', to: '/captacion/atraer/organico', tone: 'primary' }
          : !adsMeasured
            ? { label: 'Mide tus anuncios', to: '/captacion/atraer/ads' }
            : { label: 'Ver qué recomienda Vendrava', to: '/captacion/atraer/organico?tab=acciones' },
      links: [
        { label: 'Ads', to: '/captacion/atraer/ads' },
        { label: 'Orgánico y social', to: '/captacion/atraer/organico' },
        { label: 'Prospectos', to: '/captacion/atraer/prospectos' },
      ],
    },
    {
      id: 'convert', number: '03', label: 'Convertir', detail: 'Landings, webs y SEO', Icon: RiGlobalLine, color: 'var(--cyan)', to: '/captacion/convertir',
      figures: [
        { label: 'Landings midiendo', value: measuredLandings != null && landingCount != null ? `${measuredLandings} de ${landingCount}` : number(landingCount) },
        { label: 'Score SEO', value: report ? `${report.score} / 100` : null },
        { label: 'Hallazgos abiertos', value: data.landings ? number(attention) : null },
      ],
      next: !report
        ? { label: 'Audita tu web', to: '/captacion/convertir?tab=seo', tone: 'primary' }
        : attention
          ? { label: `Atender ${attention} ${attention === 1 ? 'hallazgo' : 'hallazgos'}`, to: '/captacion/convertir', tone: 'primary' }
          : integrity && integrity.state !== 'ready'
            ? { label: 'Revisar el tracking de landings', to: '/captacion/convertir?tab=landings' }
            : { label: 'Ver landings y SEO', to: '/captacion/convertir' },
    },
    {
      id: 'close', number: '04', label: 'Cerrar', detail: 'Funnels, llamadas y reuniones', Icon: RiFlowChart, color: 'var(--violet)', to: '/captacion/cerrar',
      figures: [
        { label: 'Funnels activos', value: number(funnelSummary?.active ?? null) },
        { label: 'Visita → lead', value: funnelSummary?.visitToLead != null ? `${funnelSummary.visitToLead}%` : null },
        { label: 'Reuniones', value: number(funnelSummary?.meetings ?? null) },
      ],
      next: funnelRecommendation
        ? { label: funnelRecommendation.title, to: '/captacion/cerrar', tone: 'primary' }
        : funnelSummary && !funnelSummary.active
          ? { label: 'Crea un funnel', to: '/captacion/cerrar', tone: 'primary' }
          : { label: 'Ver funnels', to: '/captacion/cerrar' },
      links: [
        { label: 'Llamadas', to: '/llamadas' },
        { label: 'Reuniones', to: '/reuniones' },
      ],
    },
  ]
}

export default function CaptacionOverview() {
  const { locale } = useI18n()
  const [state, setState] = useState({ loading: true, data: null })

  async function load() {
    setState(current => ({ ...current, loading: true }))
    setState({ loading: false, data: await loadOverview() })
  }
  useEffect(() => { load() }, [])

  if (state.loading) return <PageLoadingState label={locale === 'en' ? 'Loading acquisition overview' : 'Cargando resumen de captación'} />

  const stages = state.data ? buildStages(state.data) : null

  return (
    <main className="gs-page captacion-home">
      <div className="gs-shell">
        <ProductPageHeader Icon={RiRocket2Line} title={locale === 'en' ? 'Acquisition' : 'Captación'} description="Planifica campañas, atrae demanda, conviértela con Web y SEO y mide el cierre en funnels desde un mismo recorrido." />

        <section className="captacion-stage-cards" aria-label="Estado de las etapas">
          {(stages ?? buildStages({})).map(stage => {
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
                      <strong>{state.loading ? '…' : figure.value ?? 'Sin medición'}</strong>
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
            <p>Las cifras salen de lo que cada etapa ya mide: campañas del CRM, snapshots de Meta, circuito orgánico, telemetría de landings, último informe SEO y funnels. Una etapa sin conectar dice «sin medición», nunca cero. Llamadas y reuniones siguen viviendo en Ventas: desde «Cerrar» se enlazan, no se duplican.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
