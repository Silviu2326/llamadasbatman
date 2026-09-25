import { RiArrowRightLine } from 'react-icons/ri'
import { formatLocaleNumber, localeCode } from '../../i18n'

// Primitivas compartidas por los paneles de la página de Ads. Viven aparte
// para que Resumen y Estructura no dupliquen el formato de importes ni la
// semántica de "null = sin medición, 0 = medido y salió cero".

// Etiquetas de estado de campaña global. `t` es el de useI18n (ads.status.*).
export function statusLabels(t) {
  return Object.fromEntries(['active', 'paused', 'draft', 'done'].map(key => [key, t(`ads.status.${key}`)]))
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

// null = «Sin medición» en el idioma activo (ads.common.noMeasurement);
// nunca se fabrica un número. `t` es el de useI18n.
export function formatCents(value, precise = false, locale = 'es', t) {
  return value == null ? t('ads.common.noMeasurement') : currency(locale, precise).format(value / 100)
}

export function Metric({ Icon, label, value, detail, tone = 'indigo' }) {
  return <article className={`ads-metric ads-tone-${tone}`}><span className="ads-metric-icon"><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>
}

// Fila del rendimiento por campaña. Acumulado del período, no el último
// snapshot: un snapshot es el gasto de un solo día y presentarlo como gasto de
// la campaña lo subestimaba. Las columnas profundas salen del embudo económico
// (ads.md §4.5) y el veredicto compara contra el objetivo calculado desde el
// margen (ads.md §9): es lo que separa "barata" de "rentable".
export function CampaignRow({ campaign, selected, locale, t, onSelect }) {
  const labels = statusLabels(t)
  const state = { ...(STATUS[campaign.crmStatus] ?? STATUS.draft), label: labels[campaign.crmStatus] || labels.draft }
  const period = campaign.period
  const economics = campaign.economics
  const qualified = economics?.qualified == null ? t('ads.common.noMeasurement') : formatLocaleNumber(economics.qualified, locale)
  const deepCost = economics?.cacCents ?? economics?.cpqlCents ?? null
  const deepLabel = economics?.cacCents != null ? 'CAC' : economics?.cpqlCents != null ? 'CPQL' : 'CPL'
  const verdict = campaign.targets?.verdict
  const verdictLabel = verdict === 'over' ? t('ads.common.overTarget') : verdict === 'within' ? t('ads.common.withinTarget') : null
  return <button type="button" className={`ads-campaign-row${selected ? ' selected' : ''}`} onClick={() => onSelect(campaign.id)}><span className={`ads-row-dot ${state.className}`} aria-hidden="true" /><span className="ads-campaign-name"><strong>{campaign.name}</strong><small>{campaign.objective || t('ads.common.noObjectiveDefined')}</small></span><span className={`ads-status ${state.className}`}>{state.label}</span><span className="ads-number"><strong>{formatCents(period.spendCents, false, locale, t)}</strong><small>{t('ads.common.spendDays', { days: period.days })}</small></span><span className="ads-number"><strong>{qualified}</strong><small>{t('ads.common.qualified')}</small></span><span className={`ads-number${verdict === 'over' ? ' is-over' : verdict === 'within' ? ' is-within' : ''}`}><strong>{formatCents(deepCost ?? period.costPerLeadCents, true, locale, t)}</strong><small>{verdictLabel ? `${deepLabel} · ${verdictLabel}` : deepLabel}</small></span><RiArrowRightLine className="ads-row-arrow" /></button>
}

// Etiqueta de estado de una activación publicitaria (nivel plataforma); un
// estado desconocido se enseña tal cual (dato del servidor, no se traduce).
export function activationStatusLabel(t, status) {
  return t(`ads.activationStatus.${status}`) ?? status
}

// Etiqueta del flujo de aprobación de una creatividad.
export function approvalLabel(t, status) {
  return t(`ads.approval.${status}`) ?? status
}

// Etiqueta de estado de un brief creativo.
export function briefStatusLabel(t, status) {
  return t(`ads.briefStatus.${status}`) ?? status
}

// Fecha corta en el idioma activo; null si no hay fecha válida.
export function formatShortDate(value, locale = 'es') {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(localeCode(locale), { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export function formatPeriod(startDate, endDate, locale, t) {
  const start = formatShortDate(startDate, locale)
  const end = formatShortDate(endDate, locale)
  if (!start && !end) return t('ads.common.noPeriod')
  return `${start ?? '—'} – ${end ?? '—'}`
}
