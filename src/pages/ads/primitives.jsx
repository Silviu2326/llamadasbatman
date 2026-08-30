import { RiArrowRightLine } from 'react-icons/ri'
import { formatLocaleNumber, localeCode } from '../../i18n'

// Primitivas compartidas por los paneles de la página de Ads. Viven aparte
// para que Resumen y Estructura no dupliquen el formato de importes ni la
// semántica de "null = sin medición, 0 = medido y salió cero".

export function statusLabels(locale) {
  return locale === 'en'
    ? { active: 'Active', paused: 'Paused', draft: 'Draft', done: 'Finished' }
    : { active: 'Activa', paused: 'Pausada', draft: 'Borrador', done: 'Finalizada' }
}

export function currency(locale, precise = false) {
  return new Intl.NumberFormat(localeCode(locale), {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: precise ? 2 : 0, maximumFractionDigits: precise ? 2 : 0,
  })
}

export const STATUS = {
  active: { className: 'is-active' },
  paused: { className: 'is-paused' },
  draft: { className: 'is-draft' },
  done: { className: 'is-done' },
}

export function formatCents(value, precise = false, locale = 'es') {
  return value == null
    ? (locale === 'en' ? 'No measurement' : 'Sin medición')
    : currency(locale, precise).format(value / 100)
}

export function Metric({ Icon, label, value, detail, tone = 'indigo' }) {
  return <article className={`ads-metric ads-tone-${tone}`}><span className="ads-metric-icon"><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>
}

// Fila del rendimiento por campaña. Acumulado del período, no el último
// snapshot: un snapshot es el gasto de un solo día y presentarlo como gasto de
// la campaña lo subestimaba. Las columnas profundas salen del embudo económico
// (ads.md §4.5) y el veredicto compara contra el objetivo calculado desde el
// margen (ads.md §9): es lo que separa "barata" de "rentable".
export function CampaignRow({ campaign, selected, locale, onSelect }) {
  const labels = statusLabels(locale)
  const state = { ...(STATUS[campaign.crmStatus] ?? STATUS.draft), label: labels[campaign.crmStatus] || labels.draft }
  const period = campaign.period
  const economics = campaign.economics
  const noMeasure = locale === 'en' ? 'No measurement' : 'Sin medición'
  const qualified = economics?.qualified == null ? noMeasure : formatLocaleNumber(economics.qualified, locale)
  const deepCost = economics?.cacCents ?? economics?.cpqlCents ?? null
  const deepLabel = economics?.cacCents != null ? 'CAC' : economics?.cpqlCents != null ? 'CPQL' : 'CPL'
  const verdict = campaign.targets?.verdict
  const verdictLabel = verdict === 'over' ? 'sobre objetivo' : verdict === 'within' ? 'dentro de objetivo' : null
  return <button type="button" className={`ads-campaign-row${selected ? ' selected' : ''}`} onClick={() => onSelect(campaign.id)}><span className={`ads-row-dot ${state.className}`} aria-hidden="true" /><span className="ads-campaign-name"><strong>{campaign.name}</strong><small>{campaign.objective || (locale === 'en' ? 'No objective defined' : 'Sin objetivo definido')}</small></span><span className={`ads-status ${state.className}`}>{state.label}</span><span className="ads-number"><strong>{formatCents(period.spendCents, false, locale)}</strong><small>{locale === 'en' ? `spend · ${period.days}d` : `gasto · ${period.days}d`}</small></span><span className="ads-number"><strong>{qualified}</strong><small>cualificados</small></span><span className={`ads-number${verdict === 'over' ? ' is-over' : verdict === 'within' ? ' is-within' : ''}`}><strong>{formatCents(deepCost ?? period.costPerLeadCents, true, locale)}</strong><small>{verdictLabel ? `${deepLabel} · ${verdictLabel}` : deepLabel}</small></span><RiArrowRightLine className="ads-row-arrow" /></button>
}

// Etiquetas de estado de una activación publicitaria (nivel plataforma).
export const ACTIVATION_STATUS_LABEL = {
  unconfigured: 'Sin configurar',
  draft: 'Borrador',
  ready: 'Lista',
  active: 'Activa',
  paused: 'Pausada',
  finished: 'Finalizada',
}

// Etiquetas del flujo de aprobación de una creatividad.
export const APPROVAL_LABEL = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

// Etiquetas de estado de un brief creativo.
export const BRIEF_STATUS_LABEL = {
  draft: 'Borrador',
  in_studio: 'En el estudio',
  delivered: 'Entregado',
  archived: 'Archivado',
}
