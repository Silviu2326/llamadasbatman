import { Link } from 'react-router-dom'
import { RiAddLine, RiArrowRightLine, RiRefreshLine } from 'react-icons/ri'
import { formatCents, formatPeriod, statusLabels } from './primitives'
import './panels/ads-plan.css'

// Barra de contexto de campaña: siempre visible encima de las pestañas.
// Responde a «¿en qué campaña global estoy trabajando?» y recuerda que Ads no
// es una herramienta independiente: ejecuta una campaña definida en Planificar.
// La pestaña Resumen lee la organización entera y no se bloquea sin selección;
// Estructura y Creatividades sí la necesitan.

// Chip de dato: null = «Sin medición» y se distingue tipográficamente de un
// cero medido; nunca se fabrica un número.
function Chip({ label, value, missing = false, children }) {
  return <div className={`ah-chip${missing ? ' is-missing' : ''}`}><span>{label}</span><strong>{children ?? value}</strong></div>
}

export default function CampaignContextBar({ plan, ui }) {
  const { locale, t } = ui
  const labels = statusLabels(t)
  const campaign = plan.plan?.campaign
  const budget = plan.plan?.budget
  const loadingSelection = Boolean(plan.selectedId) && plan.planLoading && !plan.plan

  return <section className="ah-context" aria-label={t('ads.context.aria')}>
    <div className="ah-context-top">
      <label htmlFor="ads-campaign-select">
        {t('ads.context.campaignLabel')}
        <select
          id="ads-campaign-select"
          className="gs-select"
          value={plan.selectedId ?? ''}
          disabled={plan.campaignsLoading}
          onChange={event => plan.selectCampaign(event.target.value || null)}
        >
          <option value="">{t('ads.context.selectPlaceholder')}</option>
          {plan.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.status ? ` · ${labels[c.status] ?? c.status}` : ''}</option>)}
        </select>
      </label>
      {plan.selectedId && <Link className="gs-link ah-context-detail" to={`/campanas/${plan.selectedId}`}>{t('ads.context.openDetail')} <RiArrowRightLine /></Link>}
      <button type="button" className="gs-button ghost" onClick={() => ui.navigate('/captacion/planificar')}><RiAddLine /> {t('ads.context.createCampaign')}</button>
    </div>

    {!plan.selectedId ? <div className="ah-context-band">
      <div className="gs-band"><span className="gs-band-dot" aria-hidden="true" /><div>
        <strong>{t('ads.context.noSelectionTitle')}</strong>
        <p>{t('ads.context.noSelectionText')}</p>
      </div></div>
    </div> : loadingSelection ? <div className="ah-context-chips" aria-busy="true">
      {[0, 1, 2, 3, 4].map(i => <span key={i} className="ah-chip-skeleton" aria-hidden="true" />)}
    </div> : plan.planError ? <div className="ah-context-band">
      <div className="gs-alert is-error" role="alert"><span>{plan.planError}</span><button type="button" className="gs-button small" onClick={plan.reloadPlan}><RiRefreshLine /> {t('ads.common.retry')}</button></div>
    </div> : campaign ? <div className="ah-context-chips">
      <Chip label={t('ads.context.objective')} value={campaign.objective || t('ads.common.noObjective')} missing={!campaign.objective} />
      <Chip label={t('ads.context.period')} value={formatPeriod(campaign.startDate, campaign.endDate, locale, t)} missing={!campaign.startDate && !campaign.endDate} />
      <Chip label={t('ads.context.status')} value={labels[campaign.status] ?? campaign.status ?? t('ads.common.noStatus')} />
      <Chip label={t('ads.context.globalBudget')} value={formatCents(budget?.globalCents, false, locale, t)} missing={budget?.globalCents == null} />
      <Chip label={t('ads.context.realSpend')} value={formatCents(budget?.spentCents, false, locale, t)} missing={budget?.spentCents == null} />
      <Chip label={t('ads.context.available')} value={formatCents(budget?.availableCents, false, locale, t)} missing={budget?.availableCents == null} />
      <Chip label={t('ads.context.landing')} missing={!campaign.landingSlug}>
        {campaign.landingSlug
          ? <Link to={`/captacion/convertir?tab=landings&campaign=${campaign.id}`}>/{campaign.landingSlug}</Link>
          : t('ads.context.noLanding')}
      </Chip>
      {/* Progreso comercial honesto: la meta textual si existe y los conteos
          reales del CRM; null = «Sin medición», nunca un cero inventado. */}
      <Chip label={t('ads.context.progress')} missing={campaign.totalLeads == null && campaign.meetingsScheduled == null}>
        {`${campaign.goal ? `${campaign.goal} · ` : ''}${campaign.totalLeads == null ? t('ads.common.noMeasurement') : t('ads.context.leadsCount', { count: campaign.totalLeads })} · ${campaign.meetingsScheduled == null ? t('ads.common.noMeasurement') : t('ads.context.meetingsCount', { count: campaign.meetingsScheduled })}`}
      </Chip>
    </div> : null}
  </section>
}
