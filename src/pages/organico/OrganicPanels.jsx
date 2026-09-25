import { useState } from 'react'
import {
  RiArrowRightLine, RiBarChartBoxLine, RiCloseLine, RiCompass3Line, RiComputerLine,
  RiFileTextLine, RiFocus3Line, RiGlobalLine, RiLeafLine, RiLightbulbFlashLine,
  RiLinkM, RiMapPin2Line, RiRefreshLine, RiSearchEyeLine, RiSparkling2Line,
  RiTeamLine, RiUserSearchLine,
} from 'react-icons/ri'
import DataStatusBanner from '../../components/ui/DataStatusBanner'
import { integrationPresentation } from './useOrganicCommand'
import { formatDateTime, formatNumber } from './contentFormats'
import { createTranslator, getLocale, localeCode, useI18n } from '../../i18n'

/* ── Vocabulario ────────────────────────────────────────────────────────── */

// Las cuatro tarjetas de organico.md §5.2.
const ORGANIC_KPIS = [
  { key: 'organicLeads', group: 'fast', icon: RiUserSearchLine, color: 'var(--success)' },
  { key: 'qualified', group: 'mature', icon: RiTeamLine, color: 'var(--cyan)' },
  { key: 'sales', group: 'mature', icon: RiFocus3Line, color: 'var(--violet)' },
  { key: 'hoursPerQualified', group: 'mature', icon: RiLeafLine, color: 'var(--warn)' },
]

// Cifras que el backend mide y no caben en las cuatro tarjetas grandes.
const ORGANIC_SECONDARY = [
  { key: 'visits', group: 'fast' },
  { key: 'presence', group: 'fast' },
  { key: 'opportunities', group: 'mature' },
  { key: 'hoursInvested', group: 'mature' },
]

const SIGNAL_KEYS = ['visit', 'lead', 'qualified_lead', 'opportunity', 'sale']
const signalLabel = (signal, t) => (SIGNAL_KEYS.includes(signal) ? t(`organic.panels.signal.${signal}`) : signal)
const STREAM_KEYS = ['channel_signal', 'vendrava_hunt', 'vertical_event']
const streamLabel = (stream, t) => (STREAM_KEYS.includes(stream) ? t(`organic.panels.stream.${stream}`) : stream)
// Los brazos ahora viven en dos páginas: SEO y landings en «Web y SEO», y el
// brazo social es el estudio de esta misma página.
const ARM_KEYS = ['seo', 'social', 'prospecting', 'landings', 'ads']
export function armLabel(arm, t = createTranslator(getLocale())) {
  return ARM_KEYS.includes(arm) ? t(`organic.panels.arm.${arm}`) : arm
}
const ACTION_ICONS = [RiFileTextLine, RiMapPin2Line, RiLeafLine, RiLinkM, RiSparkling2Line]

const INTEGRATION_ICON = { search_console: RiSearchEyeLine, ga4: RiComputerLine, google_business_profile: RiMapPin2Line }

/* ── Resumen ────────────────────────────────────────────────────────────── */

export function OrganicKpis({ summary, loading = false }) {
  const { t } = useI18n()
  return (
    <section className="gs-kpis gs-rise" aria-label={t('organic.panels.kpis.aria')}>
      {ORGANIC_KPIS.map(item => {
        const Icon = item.icon
        const value = summary?.[item.group]?.[item.key]
        // `null` significa "no se ha medido"; `0`, "se midió y salió cero".
        const missing = value === null || value === undefined
        return (
          <article key={item.key} className={`gs-kpi${missing && !loading ? ' is-missing' : ''}${loading ? ' is-skeleton' : ''}`} style={{ '--kpi-color': item.color }}>
            <span className="gs-kpi-icon"><Icon aria-hidden="true" /></span>
            <div>
              <span>{t(`organic.panels.kpis.${item.key}`)}</span>
              <strong>{loading ? '…' : missing ? t('organic.panels.noMeasure') : formatNumber(value)}</strong>
              <small>{t(`organic.panels.kpis.${item.key}Desc`)}</small>
            </div>
          </article>
        )
      })}
    </section>
  )
}

export function OrganicSecondary({ summary }) {
  const { t } = useI18n()
  const signal = summary?.deepestEligibleSignal
  return (
    <section className="gs-minis" aria-label={t('organic.panels.secondary.aria')}>
      {ORGANIC_SECONDARY.map(item => {
        const value = summary?.[item.group]?.[item.key]
        const missing = value === null || value === undefined
        return (
          <div key={item.key} className={`gs-mini${missing ? ' is-missing' : ''}`} title={t(`organic.panels.secondary.${item.key}Hint`)}>
            <span>{t(`organic.panels.secondary.${item.key}`)}</span>
            <strong>{missing ? t('organic.panels.noMeasure') : formatNumber(value)}</strong>
          </div>
        )
      })}
      {signal ? (
        <div className="gs-mini is-signal">
          <span>{t('organic.panels.deepestSignal')}</span>
          <strong>{signalLabel(signal, t)}</strong>
        </div>
      ) : null}
    </section>
  )
}

/** Embudo unificado — organico.md §5.3. */
export function OrganicFunnel({ funnel }) {
  const { t } = useI18n()
  if (!funnel?.length) return null
  const measured = funnel.filter(step => step.value != null)
  const max = measured.length ? Math.max(...measured.map(step => step.value)) : 0
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiFocus3Line /></span>{t('organic.panels.funnel.title')}</h2><p>{t('organic.panels.funnel.intro')}</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="gs-bars">
          {funnel.map(step => (
            <div className="gs-bar-row" key={step.key}>
              <span>{step.label}</span>
              <div className="gs-bar-track"><i style={{ width: step.value != null && max > 0 ? `${Math.max(5, (step.value / max) * 100)}%` : '0%' }} /></div>
              <strong className={step.value == null ? 'is-missing' : ''}>{step.value == null ? t('organic.panels.noMeasure') : formatNumber(step.value)}</strong>
              <em>{step.conversionPct != null ? `${step.conversionPct} %` : ''}</em>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Informe narrado del período — organico.md §5.7. */
export function OrganicNarrative({ narrative }) {
  const { t } = useI18n()
  if (!narrative) return null
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>{t('organic.panels.narrative.title')}</h2><p>{narrative.headline}</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="og-narrative">
          {narrative.sections.map(section => (
            <article key={section.key}><h3>{section.title}</h3><p>{section.body}</p></article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Rendimiento ────────────────────────────────────────────────────────── */

/** Ranking por canal — organico.md §5.4. Más tráfico no es mejor canal. */
export function OrganicChannels({ channels }) {
  const { t } = useI18n()
  if (!channels?.length) return null
  const cohort = status => (status === 'mature' ? t('organic.panels.channels.mature') : status === 'maturing' ? t('organic.panels.channels.maturing') : t('organic.panels.channels.noCohort'))
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiBarChartBoxLine /></span>{t('organic.panels.channels.title')}</h2><p>{t('organic.panels.channels.intro')}</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="gs-table-scroll">
          <table className="gs-table">
            <thead><tr><th>{t('organic.panels.channels.colChannel')}</th><th className="num">{t('organic.panels.channels.colLeads')}</th><th className="num">{t('organic.panels.channels.colQualified')}</th><th className="num">{t('organic.panels.channels.colSales')}</th><th className="num">{t('organic.panels.channels.colHours')}</th><th>{t('organic.panels.channels.colSignal')}</th></tr></thead>
            <tbody>
              {channels.map(channel => (
                <tr key={channel.channel}>
                  <td><strong>{channel.label}</strong><small>{cohort(channel.cohortStatus)}</small></td>
                  <td className="num">{channel.leads ?? '—'}</td>
                  <td className="num">{channel.qualified ?? '—'}{channel.qualificationPct != null ? <small>{channel.qualificationPct} %</small> : null}</td>
                  <td className="num">{channel.sales ?? '—'}</td>
                  {/* `null` es "sin piezas publicadas", no "cero horas". */}
                  <td className={`num${channel.hoursInvested == null ? ' is-missing' : ''}`}>
                    {channel.hoursInvested == null ? t('organic.panels.channels.unrecorded') : t('organic.panels.channels.hours', { n: channel.hoursInvested })}
                    {channel.hoursPerQualified != null ? <small>{t('organic.panels.channels.hoursPerQualified', { n: channel.hoursPerQualified })}</small> : null}
                  </td>
                  <td><span className="gs-pill tone-info">{signalLabel(channel.deepestEligibleSignal, t)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/** Ranking por pieza — qué publicación trajo leads y a qué coste en tiempo. */
export function OrganicPieces({ pieces }) {
  const { t, locale } = useI18n()
  if (!pieces?.length) return null
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>{t('organic.panels.pieces.title')}</h2><p>{t('organic.panels.pieces.intro')}</p></div>
        <span className="gs-panel-note">{t('organic.panels.pieces.note')}</span>
      </header>
      <div className="gs-panel-body">
        <div className="gs-table-scroll">
          <table className="gs-table">
            <thead><tr><th>{t('organic.panels.pieces.colPiece')}</th><th>{t('organic.panels.pieces.colChannel')}</th><th className="num">{t('organic.panels.pieces.colHours')}</th><th className="num">{t('organic.panels.pieces.colLeads')}</th><th className="num">{t('organic.panels.pieces.colQualified')}</th><th className="num">{t('organic.panels.pieces.colCost')}</th></tr></thead>
            <tbody>
              {pieces.map(piece => (
                <tr key={piece.pieceId}>
                  <td><strong>{piece.format}</strong><small>{piece.publishedAt ? new Date(piece.publishedAt).toLocaleDateString(localeCode(locale)) : t('organic.panels.pieces.noDate')}</small></td>
                  <td>{piece.channel}</td>
                  <td className="num">{t('organic.panels.channels.hours', { n: piece.hoursInvested })}</td>
                  <td className="num">{piece.leads}</td>
                  <td className="num">{piece.qualified}</td>
                  <td className={`num${piece.hoursPerQualified == null ? ' is-missing' : ''}`}>{piece.hoursPerQualified == null ? t('organic.panels.pieces.noQualified') : t('organic.panels.channels.hoursPerQualified', { n: piece.hoursPerQualified })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/** A qué páginas llega el tráfico orgánico, según GA4. */
export function OrganicPages({ pages }) {
  const { t } = useI18n()
  if (!pages?.length) return null
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiGlobalLine /></span>{t('organic.panels.pages.title')}</h2><p>{t('organic.panels.pages.intro')}</p></div>
        <span className="gs-panel-note">{t('organic.panels.pages.note')}</span>
      </header>
      <div className="gs-panel-body">
        <div className="gs-table-scroll">
          <table className="gs-table">
            <thead><tr><th>{t('organic.panels.pages.colPage')}</th><th>{t('organic.panels.pages.colChannel')}</th><th className="num">{t('organic.panels.pages.colSessions')}</th><th className="num">{t('organic.panels.pages.colEngaged')}</th></tr></thead>
            <tbody>
              {pages.map(page => (
                <tr key={`${page.channel}-${page.page}`}>
                  <td><strong>{page.page}</strong></td>
                  <td>{page.channel}</td>
                  <td className="num">{formatNumber(page.sessions)}</td>
                  <td className="num">{formatNumber(page.engagedSessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/* ── Qué hacer ──────────────────────────────────────────────────────────── */

/**
 * Cola priorizada de organico.md §5.5: señales de canal, caza de Vendrava y
 * acontecimientos en la misma lista, ordenados por impacto × confianza ÷
 * esfuerzo. El botón NO ejecuta: abre el brazo con el contexto cargado.
 */
export function OrganicRecommendations({ items, onDispatch, onDismiss, onRefresh, refreshing, busyId, disabledReason }) {
  const { t } = useI18n()
  const [dismissing, setDismissing] = useState('')
  const [reason, setReason] = useState('')
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiLightbulbFlashLine /></span>{t('organic.panels.recs.title')}</h2><p>{t('organic.panels.recs.intro')}</p></div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-button" onClick={onRefresh} disabled={refreshing || Boolean(disabledReason)} title={disabledReason || undefined}>
            <RiRefreshLine className={refreshing ? 'gs-spin' : ''} /> {refreshing ? t('organic.panels.recs.recalculating') : t('organic.panels.recs.recalculate')}
          </button>
        </div>
      </header>
      <div className="gs-panel-body">
        {disabledReason ? <p className="gs-empty-inline">{disabledReason}</p> : null}
        {!disabledReason && !items?.length ? (
          <p className="gs-empty-inline">{t('organic.panels.recs.empty')}</p>
        ) : null}
        {items?.length ? (
          <div className="gs-queue">
            {items.map(item => (
              <article key={item.id} className={`gs-queue-card is-${item.severity}`}>
                <header>
                  <span className="gs-queue-kind">{streamLabel(item.stream, t)}</span>
                  <span className="gs-queue-meta">{t('organic.panels.recs.priority', { n: item.priorityScore })}</span>
                </header>
                <strong>{item.title}</strong>
                <p>{item.explanation}</p>
                <p><b>{t('organic.panels.recs.recommendation')}</b> {item.recommendation}</p>
                <dl>
                  <div><dt>{t('organic.panels.recs.confidence')}</dt><dd>{item.confidence}</dd></div>
                  <div><dt>{t('organic.panels.recs.effort')}</dt><dd>{t('organic.panels.recs.hours', { n: item.estimatedHours })}</dd></div>
                  <div><dt>{t('organic.panels.recs.runsIn')}</dt><dd>{armLabel(item.dispatchArm, t)}</dd></div>
                </dl>
                <small>{item.confidenceReason}</small>
                {item.demotedBecause ? <small>{item.demotedBecause}</small> : null}
                {dismissing === item.id ? (
                  <form className="gs-queue-form" onSubmit={event => { event.preventDefault(); if (reason.trim().length >= 3) { onDismiss(item.id, reason.trim()); setDismissing(''); setReason('') } }}>
                    <label htmlFor={`dismiss-${item.id}`}>{t('organic.panels.recs.whyDismiss')}</label>
                    <textarea id={`dismiss-${item.id}`} className="gs-textarea" rows="2" value={reason} onChange={event => setReason(event.target.value)} placeholder={t('organic.panels.recs.dismissPlaceholder')} />
                    <div>
                      <button type="button" className="gs-link" onClick={() => setDismissing('')}>{t('organic.panels.recs.cancel')}</button>
                      <button type="submit" className="gs-button small" disabled={reason.trim().length < 3}>{t('organic.panels.recs.confirm')}</button>
                    </div>
                  </form>
                ) : (
                  <footer>
                    <div>
                      {item.stream === 'channel_signal' ? <button type="button" className="gs-link" onClick={() => setDismissing(item.id)}>{t('organic.panels.recs.dismiss')}</button> : null}
                      <button type="button" className="gs-button small primary" disabled={busyId === item.id} onClick={() => onDispatch(item.id, item.dispatchArm)}>
                        {t('organic.panels.recs.openIn', { arm: armLabel(item.dispatchArm, t) })} <RiArrowRightLine />
                      </button>
                    </div>
                  </footer>
                )}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ActionPanel({ actions, onAction }) {
  const { t } = useI18n()
  const items = (actions ?? []).slice(0, 5)
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiSparkling2Line /></span>{t('organic.panels.actions.title')}</h2><p>{t('organic.panels.actions.intro')}</p></div>
      </header>
      <div className="gs-panel-body is-flush">
        {items.length ? items.map((action, index) => {
          const Icon = ACTION_ICONS[index] || RiLightbulbFlashLine
          return (
            <div className="og-action-row" key={action.id || `${action.title}-${index}`}>
              <span className="og-action-index">{index + 1}</span>
              <div className="og-action-copy">
                <strong>{action.title || action.name || t('organic.panels.actions.nextAction')}</strong>
                <p>{action.description || action.detail || t('organic.panels.actions.defaultDesc')}</p>
                <span className={`gs-pill ${action.impact === 'medium' ? 'tone-warn' : 'tone-ok'}`}>{action.impactLabel || (action.impact === 'medium' ? t('organic.panels.actions.impactMedium') : t('organic.panels.actions.impactHigh'))}</span>
              </div>
              <button type="button" className="gs-button small primary" onClick={() => onAction(action, 'draft')}><Icon aria-hidden="true" /> {action.cta || t('organic.panels.actions.prepare')}</button>
            </div>
          )
        }) : <p className="gs-empty-inline">{t('organic.panels.actions.empty')}</p>}
      </div>
    </section>
  )
}

export function AssetsPanel({ assets, onAction }) {
  const { t } = useI18n()
  const items = (assets ?? []).slice(0, 4)
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>{t('organic.panels.assets.title')}</h2><p>{t('organic.panels.assets.intro')}</p></div>
      </header>
      <div className="gs-panel-body is-flush">
        {items.length ? items.map((asset, index) => (
          <div className="og-action-row" key={asset.id || index}>
            <span className="og-action-index is-icon"><RiFileTextLine /></span>
            <div className="og-action-copy">
              <strong>{asset.name || asset.title || t('organic.panels.assets.default')}</strong>
              <p>{asset.description || asset.type || t('organic.panels.assets.defaultDesc')}</p>
            </div>
            <button type="button" className="gs-button small" onClick={() => onAction(asset, 'draft')}>{asset.cta || t('organic.panels.assets.create')}</button>
          </div>
        )) : <p className="gs-empty-inline">{t('organic.panels.assets.empty')}</p>}
      </div>
    </section>
  )
}

/* ── Fuentes ────────────────────────────────────────────────────────────── */

function IntegrationCard({ integration, projectId, busy, onAction }) {
  const { t } = useI18n()
  const known = Boolean(INTEGRATION_ICON[integration.provider])
  const meta = known
    ? { label: t(`organic.panels.integration.${integration.provider}`), description: t(`organic.panels.integration.${integration.provider}Desc`) }
    : { label: integration.provider, description: t('organic.panels.integration.externalDesc') }
  const Icon = INTEGRATION_ICON[integration.provider] || RiGlobalLine
  const presentation = integrationPresentation(integration, t)
  const propertyLabel = integration.externalPropertyName || integration.externalPropertyId
  // Sin propiedad ni ubicación no se sabe de dónde leer: no se sincroniza.
  const canSync = presentation.connected && !busy && presentation.hasProperty
  const properties = integration.properties || []
  return (
    <article className="og-source">
      <div className="og-source-head">
        <span className="og-source-icon"><Icon aria-hidden="true" /></span>
        <div><h3>{meta.label}</h3><span className={`gs-pill tone-${presentation.tone === 'idle' ? '' : presentation.tone}`}>{presentation.label}</span></div>
      </div>
      <p>{meta.description}</p>
      <p className="og-source-property">{propertyLabel ? t('organic.panels.sources.property', { name: propertyLabel }) : t('organic.panels.sources.propertyPending')}</p>
      {presentation.connected && properties.length ? (
        <label className="gs-field">
          <span>{t('organic.panels.sources.selectProperty')}</span>
          <select className="gs-select" value={integration.externalPropertyId || ''} onChange={event => onAction(integration.provider, 'configure', event.target.value)} disabled={busy}>
            <option value="">{t('organic.panels.sources.selectPropertyOption')}</option>
            {properties.map(property => <option key={property.id} value={property.id}>{property.label || property.id}</option>)}
          </select>
        </label>
      ) : null}
      {integration.lastError ? <p className="gs-inline-error" role="alert">{integration.lastError}</p> : null}
      {integration.lastSyncedAt ? <p className="gs-note">{t('organic.panels.sources.lastSync', { date: formatDateTime(integration.lastSyncedAt) })}</p> : null}
      <div className="og-source-actions">
        {presentation.connected ? (
          <>
            <button type="button" className="gs-button small" onClick={() => onAction(integration.provider, 'sync')} disabled={!canSync} title={!presentation.hasProperty ? t('organic.panels.sources.selectBeforeSync') : undefined}><RiRefreshLine /> {busy ? t('organic.panels.sources.syncing') : t('organic.panels.sources.sync')}</button>
            <button type="button" className="gs-button small ghost" onClick={() => onAction(integration.provider, 'disconnect')} disabled={busy}><RiCloseLine /> {t('organic.panels.sources.disconnect')}</button>
          </>
        ) : (
          <button type="button" className="gs-button small primary" onClick={() => onAction(integration.provider, 'connect')} disabled={busy || !projectId}><RiLinkM /> {busy ? t('organic.panels.sources.starting') : t('organic.panels.sources.startOauth')}</button>
        )}
      </div>
    </article>
  )
}

export function OrganicIntegrationsPanel({ state, projectId, onAction, onRefresh }) {
  const { t } = useI18n()
  const items = state.integrations || []
  const status = state.status === 'error' ? 'error' : state.status === 'unavailable' ? 'disconnected' : state.status === 'setup' ? 'empty' : state.status === 'loading' ? 'loading' : 'live'
  const statusMessage = state.status === 'error' || state.status === 'unavailable'
    ? state.error
    : state.status === 'setup' ? t('organic.panels.sources.setupFirst') : undefined
  return (
    <section className="gs-panel" aria-labelledby="og-sources-title">
      <header className="gs-panel-head">
        <div><h2 id="og-sources-title"><span className="gs-panel-icon"><RiLinkM /></span>{t('organic.panels.sources.title')}</h2><p>{t('organic.panels.sources.intro')}</p></div>
      </header>
      <div className="gs-panel-body">
        <DataStatusBanner compact status={status} message={statusMessage} onRetry={status === 'error' || status === 'disconnected' ? onRefresh : undefined} />
        {state.status === 'loading' ? <div className="gs-skeleton"><i /><i /><i /></div> : null}
        {state.status === 'unavailable' ? <p className="gs-empty-inline" role="status">{state.error} {t('organic.panels.sources.unavailableNote')}</p> : null}
        {state.status === 'ready' ? <div className="og-sources">{items.map(integration => <IntegrationCard key={integration.provider} integration={integration} projectId={projectId} busy={state.busyProvider === integration.provider} onAction={onAction} />)}</div> : null}
        {state.message ? <p className="gs-inline-error" role="status">{state.message}</p> : null}
      </div>
    </section>
  )
}

export function OrganicUpcoming() {
  const { t } = useI18n()
  // Solo lo que de verdad falta: cuando una fila se construye, se retira.
  const items = [
    [t('organic.panels.upcoming.reach'), t('organic.panels.upcoming.reachDetail'), t('organic.panels.upcoming.pending')],
    [t('organic.panels.upcoming.reschedule'), t('organic.panels.upcoming.rescheduleDetail'), t('organic.panels.upcoming.phase4')],
    [t('organic.panels.upcoming.reviews'), t('organic.panels.upcoming.reviewsDetail'), t('organic.panels.upcoming.phase4')],
  ]
  return (
    <section className="gs-panel is-dashed">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiCompass3Line /></span>{t('organic.panels.upcoming.title')}</h2><p>{t('organic.panels.upcoming.intro')}</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="og-upcoming">
          {items.map(([title, detail, phase]) => (
            <div key={title}><strong>{title}</strong><span className="gs-pill tone-info">{phase}</span><p>{detail}</p></div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Estados y diálogo ──────────────────────────────────────────────────── */

export function OrganicErrorState({ error, onRetry, onConfigure }) {
  const { t } = useI18n()
  return (
    <section className="gs-panel">
      <div className="gs-empty is-error" aria-live="polite">
        <span><RiRefreshLine /></span>
        <h3>{t('organic.panels.error.title')}</h3>
        <p>{error}</p>
        <div className="gs-empty-actions">
          <button type="button" className="gs-button primary" onClick={onRetry}><RiRefreshLine /> {t('organic.panels.error.retry')}</button>
          <button type="button" className="gs-button ghost" onClick={onConfigure}><RiLinkM /> {t('organic.panels.error.configure')}</button>
        </div>
      </div>
    </section>
  )
}

/** Aviso corto para las pestañas que necesitan proyecto cuando aún no lo hay. */
export function OrganicSetupPrompt({ onGoToSetup, what }) {
  const { t } = useI18n()
  return (
    <section className="gs-panel is-dashed">
      <div className="gs-empty">
        <span><RiLeafLine /></span>
        <h3>{t('organic.panels.setup.title')}</h3>
        <p>{t('organic.panels.setup.text', { what: what || t('organic.panels.setup.defaultWhat') })}</p>
        <div className="gs-empty-actions"><button type="button" className="gs-button primary" onClick={onGoToSetup}>{t('organic.panels.setup.cta')} <RiArrowRightLine /></button></div>
      </div>
    </section>
  )
}

export function OrganicModal({ type, target, action = 'draft', onClose, onSubmit, submitting, message }) {
  const { t } = useI18n()
  const isSetup = type === 'setup'
  const isProject = action === 'project'
  const isConnect = action === 'connect'
  const isDraft = type === 'draft' || type === 'opportunity'
  const title = isConnect ? t('organic.panels.modal.editProject') : isProject ? t('organic.panels.modal.setupProject') : isDraft ? t('organic.panels.modal.prepareAsset') : t('organic.panels.modal.explore')
  // Al editar se parte de lo guardado: el PATCH solo envía lo rellenado.
  const [form, setForm] = useState({
    name: isConnect || isProject ? (target?.name || '') : (target?.query || target?.title || ''),
    website: (isConnect || isProject) ? (target?.website || '') : '',
    location: (isConnect || isProject) ? (target?.locations?.[0] || target?.location || '') : '',
    notes: target?.description || '',
  })
  function update(field, value) { setForm(current => ({ ...current, [field]: value })) }
  return (
    <div className="gs-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <form className="gs-modal" role="dialog" aria-modal="true" aria-labelledby="og-modal-title" onSubmit={event => { event.preventDefault(); onSubmit(form) }}>
        <header className="gs-modal-head">
          <span className="gs-modal-eyebrow">{t('organic.panels.modal.eyebrow')}</span>
          <h2 id="og-modal-title">{title}</h2>
          <p>{isSetup ? t('organic.panels.modal.setupText') : t('organic.panels.modal.draftText')}</p>
          <button type="button" className="gs-modal-close" onClick={onClose} aria-label={t('organic.panels.modal.close')} disabled={submitting}><RiCloseLine /></button>
        </header>
        <div className="gs-modal-body">
          <div className="gs-form-grid">
            {isDraft ? (
              <label className="full">{t('organic.panels.modal.opportunityOrAsset')}<input className="gs-input" value={form.name} onChange={event => update('name', event.target.value)} placeholder={t('organic.panels.modal.opportunityPlaceholder')} required /></label>
            ) : (
              <>
                <label className="full">{t('organic.panels.modal.projectName')}<input className="gs-input" value={form.name} onChange={event => update('name', event.target.value)} placeholder={t('organic.panels.modal.projectNamePlaceholder')} required /></label>
                <label>{t('organic.panels.modal.website')}<input className="gs-input" type="url" value={form.website} onChange={event => update('website', event.target.value)} placeholder="https://tuweb.com" required /></label>
                <label>{t('organic.panels.modal.location')}<input className="gs-input" value={form.location} onChange={event => update('location', event.target.value)} placeholder={t('organic.panels.modal.locationPlaceholder')} /></label>
              </>
            )}
            <label className="full">{t('organic.panels.modal.context')}<textarea className="gs-textarea" value={form.notes} onChange={event => update('notes', event.target.value)} placeholder={t('organic.panels.modal.contextPlaceholder')} /></label>
          </div>
        </div>
        {message ? <p className="gs-modal-message" role="status">{message}</p> : null}
        <footer className="gs-modal-foot">
          <div className="gs-modal-actions">
            <button type="button" className="gs-button ghost" onClick={onClose} disabled={submitting}>{t('organic.panels.modal.close')}</button>
            <button type="submit" className="gs-button primary" disabled={submitting}>{submitting ? t('organic.panels.modal.saving') : isConnect ? t('organic.panels.modal.saveProject') : isProject ? t('organic.panels.modal.createProject') : t('organic.panels.modal.createDraft')}</button>
          </div>
        </footer>
      </form>
    </div>
  )
}
