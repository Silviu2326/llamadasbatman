import { Link } from 'react-router-dom'
import { RiAddLine, RiArrowRightLine, RiRefreshLine } from 'react-icons/ri'
import { formatCents, statusLabels } from './primitives'
import './panels/ads-plan.css'

// Barra de contexto de campaña: siempre visible encima de las pestañas.
// Responde a «¿en qué campaña global estoy trabajando?» y recuerda que Ads no
// es una herramienta independiente: ejecuta una campaña definida en Planificar.
// La pestaña Resumen lee la organización entera y no se bloquea sin selección;
// Estructura y Creatividades sí la necesitan.

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date)
}

function formatPeriod(startDate, endDate) {
  const start = formatDate(startDate)
  const end = formatDate(endDate)
  if (!start && !end) return 'Sin periodo'
  return `${start ?? '—'} – ${end ?? '—'}`
}

// Chip de dato: null = «Sin medición» y se distingue tipográficamente de un
// cero medido; nunca se fabrica un número.
function Chip({ label, value, missing = false, children }) {
  return <div className={`ah-chip${missing ? ' is-missing' : ''}`}><span>{label}</span><strong>{children ?? value}</strong></div>
}

export default function CampaignContextBar({ plan, ui }) {
  const { locale } = ui
  const labels = statusLabels(locale)
  const campaign = plan.plan?.campaign
  const budget = plan.plan?.budget
  const loadingSelection = Boolean(plan.selectedId) && plan.planLoading && !plan.plan

  return <section className="ah-context" aria-label="Campaña global en la que trabajas">
    <div className="ah-context-top">
      <label htmlFor="ads-campaign-select">
        Campaña global
        <select
          id="ads-campaign-select"
          className="gs-select"
          value={plan.selectedId ?? ''}
          disabled={plan.campaignsLoading}
          onChange={event => plan.selectCampaign(event.target.value || null)}
        >
          <option value="">— Selecciona una campaña global —</option>
          {plan.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.status ? ` · ${labels[c.status] ?? c.status}` : ''}</option>)}
        </select>
      </label>
      {plan.selectedId && <Link className="gs-link ah-context-detail" to={`/campanas/${plan.selectedId}`}>Abrir detalle <RiArrowRightLine /></Link>}
      <button type="button" className="gs-button ghost" onClick={() => ui.navigate('/captacion/planificar')}><RiAddLine /> Crear campaña global</button>
    </div>

    {!plan.selectedId ? <div className="ah-context-band">
      <div className="gs-band"><span className="gs-band-dot" aria-hidden="true" /><div>
        <strong>Ads ejecuta una campaña global. Selecciona una o crea una nueva</strong>
        <p>El Resumen lee toda la organización, pero Estructura y Creatividades trabajan sobre una campaña concreta: su presupuesto, sus activaciones y sus briefs.</p>
      </div></div>
    </div> : loadingSelection ? <div className="ah-context-chips" aria-busy="true">
      {[0, 1, 2, 3, 4].map(i => <span key={i} className="ah-chip-skeleton" aria-hidden="true" />)}
    </div> : plan.planError ? <div className="ah-context-band">
      <div className="gs-alert is-error" role="alert"><span>{plan.planError}</span><button type="button" className="gs-button small" onClick={plan.reloadPlan}><RiRefreshLine /> Reintentar</button></div>
    </div> : campaign ? <div className="ah-context-chips">
      <Chip label="Objetivo" value={campaign.objective || 'Sin objetivo'} missing={!campaign.objective} />
      <Chip label="Periodo" value={formatPeriod(campaign.startDate, campaign.endDate)} missing={!campaign.startDate && !campaign.endDate} />
      <Chip label="Estado" value={labels[campaign.status] ?? campaign.status ?? 'Sin estado'} />
      <Chip label="Presupuesto global" value={formatCents(budget?.globalCents, false, locale)} missing={budget?.globalCents == null} />
      <Chip label="Gasto real" value={formatCents(budget?.spentCents, false, locale)} missing={budget?.spentCents == null} />
      <Chip label="Disponible" value={formatCents(budget?.availableCents, false, locale)} missing={budget?.availableCents == null} />
      <Chip label="Landing" missing={!campaign.landingSlug}>
        {campaign.landingSlug
          ? <Link to={`/captacion/convertir?tab=landings&campaign=${campaign.id}`}>/{campaign.landingSlug}</Link>
          : 'Sin landing'}
      </Chip>
      {/* Progreso comercial honesto: la meta textual si existe y los conteos
          reales del CRM; null = «Sin medición», nunca un cero inventado. */}
      <Chip label="Progreso comercial" missing={campaign.totalLeads == null && campaign.meetingsScheduled == null}>
        {`${campaign.goal ? `${campaign.goal} · ` : ''}${campaign.totalLeads == null ? 'Sin medición' : `${campaign.totalLeads} leads`} · ${campaign.meetingsScheduled == null ? 'Sin medición' : `${campaign.meetingsScheduled} reuniones`}`}
      </Chip>
    </div> : null}
  </section>
}
