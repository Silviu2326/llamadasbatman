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

/* ── Vocabulario ────────────────────────────────────────────────────────── */

// Las cuatro tarjetas de organico.md §5.2.
const ORGANIC_KPIS = [
  { key: 'organicLeads', group: 'fast', label: 'Leads orgánicos', description: 'Contactos llegados por búsqueda, redes, ficha de Google o prospección.', icon: RiUserSearchLine, color: 'var(--success)' },
  { key: 'qualified', group: 'mature', label: 'Cualificados', description: 'De esos leads, los que tuvieron un resultado de llamada válido.', icon: RiTeamLine, color: 'var(--cyan)' },
  { key: 'sales', group: 'mature', label: 'Ventas atribuidas', description: 'Oportunidades ganadas que nacieron de un canal orgánico.', icon: RiFocus3Line, color: 'var(--violet)' },
  { key: 'hoursPerQualified', group: 'mature', label: 'Horas por cualificado', description: 'El gasto del orgánico es tiempo: estimado desde las piezas publicadas.', icon: RiLeafLine, color: 'var(--warn)' },
]

// Cifras que el backend mide y no caben en las cuatro tarjetas grandes.
const ORGANIC_SECONDARY = [
  { key: 'visits', group: 'fast', label: 'Visitas orgánicas', hint: 'Sesiones sin pagar por el clic. Requiere Analytics conectado.' },
  { key: 'presence', group: 'fast', label: 'Presencia', hint: 'Sitios donde el negocio aparece sin pagar.' },
  { key: 'opportunities', group: 'mature', label: 'Oportunidades', hint: 'Leads orgánicos que llegaron a oportunidad abierta.' },
  { key: 'hoursInvested', group: 'mature', label: 'Horas invertidas', hint: 'Tiempo estimado de producción de las piezas del período.' },
]

const SIGNAL_LABEL = { visit: 'visita', lead: 'lead', qualified_lead: 'lead cualificado', opportunity: 'oportunidad', sale: 'venta' }
const STREAM_LABEL = { channel_signal: 'Señal de canal', vendrava_hunt: 'Caza de Vendrava', vertical_event: 'Acontecimiento' }
// Los brazos ahora viven en dos páginas: SEO y landings en «Web y SEO», y el
// brazo social es el estudio de esta misma página.
export const ARM_LABEL = { seo: 'Web y SEO', social: 'el estudio', prospecting: 'Prospectos', landings: 'Web y SEO', ads: 'Ads' }
const ACTION_ICONS = [RiFileTextLine, RiMapPin2Line, RiLeafLine, RiLinkM, RiSparkling2Line]

const INTEGRATION_META = {
  search_console: { label: 'Google Search Console', description: 'Consultas, impresiones y páginas que reciben demanda orgánica.', icon: RiSearchEyeLine },
  ga4: { label: 'Google Analytics 4', description: 'Sesiones y conversiones atribuidas cuando la propiedad está seleccionada.', icon: RiComputerLine },
  google_business_profile: { label: 'Google Business Profile', description: 'Visibilidad local, ubicaciones y acciones de tu ficha.', icon: RiMapPin2Line },
}

/* ── Resumen ────────────────────────────────────────────────────────────── */

export function OrganicKpis({ summary, loading = false }) {
  return (
    <section className="gs-kpis gs-rise" aria-label="Indicadores orgánicos">
      {ORGANIC_KPIS.map(item => {
        const Icon = item.icon
        const value = summary?.[item.group]?.[item.key]
        // `null` significa "no se ha medido"; `0`, "se midió y salió cero".
        const missing = value === null || value === undefined
        return (
          <article key={item.key} className={`gs-kpi${missing && !loading ? ' is-missing' : ''}${loading ? ' is-skeleton' : ''}`} style={{ '--kpi-color': item.color }}>
            <span className="gs-kpi-icon"><Icon aria-hidden="true" /></span>
            <div>
              <span>{item.label}</span>
              <strong>{loading ? '…' : missing ? 'Sin medición' : formatNumber(value)}</strong>
              <small>{item.description}</small>
            </div>
          </article>
        )
      })}
    </section>
  )
}

export function OrganicSecondary({ summary }) {
  const signal = summary?.deepestEligibleSignal
  return (
    <section className="gs-minis" aria-label="Cifras secundarias">
      {ORGANIC_SECONDARY.map(item => {
        const value = summary?.[item.group]?.[item.key]
        const missing = value === null || value === undefined
        return (
          <div key={item.key} className={`gs-mini${missing ? ' is-missing' : ''}`} title={item.hint}>
            <span>{item.label}</span>
            <strong>{missing ? 'Sin medición' : formatNumber(value)}</strong>
          </div>
        )
      })}
      {signal ? (
        <div className="gs-mini is-signal">
          <span>Señal más profunda con cohorte válida</span>
          <strong>{SIGNAL_LABEL[signal] ?? signal}</strong>
        </div>
      ) : null}
    </section>
  )
}

/** Embudo unificado — organico.md §5.3. */
export function OrganicFunnel({ funnel }) {
  if (!funnel?.length) return null
  const measured = funnel.filter(step => step.value != null)
  const max = measured.length ? Math.max(...measured.map(step => step.value)) : 0
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiFocus3Line /></span>Embudo orgánico</h2><p>De la presencia al comprador, sin pagar por el tráfico.</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="gs-bars">
          {funnel.map(step => (
            <div className="gs-bar-row" key={step.key}>
              <span>{step.label}</span>
              <div className="gs-bar-track"><i style={{ width: step.value != null && max > 0 ? `${Math.max(5, (step.value / max) * 100)}%` : '0%' }} /></div>
              <strong className={step.value == null ? 'is-missing' : ''}>{step.value == null ? 'Sin medición' : formatNumber(step.value)}</strong>
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
  if (!narrative) return null
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>Informe del período</h2><p>{narrative.headline}</p></div>
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
  if (!channels?.length) return null
  const cohort = status => (status === 'mature' ? 'cohorte madura' : status === 'maturing' ? 'cohorte madurando' : 'sin cohorte suficiente')
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiBarChartBoxLine /></span>Por canal</h2><p>Más tráfico no es mejor canal: lo que cuenta es quién trae compradores.</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="gs-table-scroll">
          <table className="gs-table">
            <thead><tr><th>Canal</th><th className="num">Leads</th><th className="num">Cualificados</th><th className="num">Ventas</th><th className="num">Horas</th><th>Señal</th></tr></thead>
            <tbody>
              {channels.map(channel => (
                <tr key={channel.channel}>
                  <td><strong>{channel.label}</strong><small>{cohort(channel.cohortStatus)}</small></td>
                  <td className="num">{channel.leads ?? '—'}</td>
                  <td className="num">{channel.qualified ?? '—'}{channel.qualificationPct != null ? <small>{channel.qualificationPct} %</small> : null}</td>
                  <td className="num">{channel.sales ?? '—'}</td>
                  {/* `null` es "sin piezas publicadas", no "cero horas". */}
                  <td className={`num${channel.hoursInvested == null ? ' is-missing' : ''}`}>
                    {channel.hoursInvested == null ? 'sin registrar' : `${channel.hoursInvested} h`}
                    {channel.hoursPerQualified != null ? <small>{channel.hoursPerQualified} h/cualif</small> : null}
                  </td>
                  <td><span className="gs-pill tone-info">{SIGNAL_LABEL[channel.deepestEligibleSignal] ?? channel.deepestEligibleSignal}</span></td>
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
  if (!pieces?.length) return null
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>Por pieza</h2><p>Qué publicación concreta trajo leads y cuánto tiempo costó producirla.</p></div>
        <span className="gs-panel-note">Horas estimadas por formato, no cronometradas</span>
      </header>
      <div className="gs-panel-body">
        <div className="gs-table-scroll">
          <table className="gs-table">
            <thead><tr><th>Pieza</th><th>Canal</th><th className="num">Horas</th><th className="num">Leads</th><th className="num">Cualificados</th><th className="num">Coste en tiempo</th></tr></thead>
            <tbody>
              {pieces.map(piece => (
                <tr key={piece.pieceId}>
                  <td><strong>{piece.format}</strong><small>{piece.publishedAt ? new Date(piece.publishedAt).toLocaleDateString('es-ES') : 'sin fecha'}</small></td>
                  <td>{piece.channel}</td>
                  <td className="num">{piece.hoursInvested} h</td>
                  <td className="num">{piece.leads}</td>
                  <td className="num">{piece.qualified}</td>
                  <td className={`num${piece.hoursPerQualified == null ? ' is-missing' : ''}`}>{piece.hoursPerQualified == null ? 'sin cualificados' : `${piece.hoursPerQualified} h/cualif`}</td>
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
  if (!pages?.length) return null
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiGlobalLine /></span>Por página</h2><p>Dónde aterriza el tráfico orgánico, según Analytics.</p></div>
        <span className="gs-panel-note">Sesiones del período, sin tráfico de pago</span>
      </header>
      <div className="gs-panel-body">
        <div className="gs-table-scroll">
          <table className="gs-table">
            <thead><tr><th>Página</th><th>Canal</th><th className="num">Sesiones</th><th className="num">Con interacción</th></tr></thead>
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
  const [dismissing, setDismissing] = useState('')
  const [reason, setReason] = useState('')
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiLightbulbFlashLine /></span>Qué recomienda Vendrava</h2><p>Ordenado por valor económico: impacto estimado × confianza ÷ horas de esfuerzo.</p></div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-button" onClick={onRefresh} disabled={refreshing || Boolean(disabledReason)} title={disabledReason || undefined}>
            <RiRefreshLine className={refreshing ? 'gs-spin' : ''} /> {refreshing ? 'Recalculando…' : 'Recalcular'}
          </button>
        </div>
      </header>
      <div className="gs-panel-body">
        {disabledReason ? <p className="gs-empty-inline">{disabledReason}</p> : null}
        {!disabledReason && !items?.length ? (
          <p className="gs-empty-inline">No hay recomendaciones pendientes. Tras sincronizar una fuente o publicar contenido, pulsa «Recalcular» para volver a pasar el diagnóstico.</p>
        ) : null}
        {items?.length ? (
          <div className="gs-queue">
            {items.map(item => (
              <article key={item.id} className={`gs-queue-card is-${item.severity}`}>
                <header>
                  <span className="gs-queue-kind">{STREAM_LABEL[item.stream] ?? item.stream}</span>
                  <span className="gs-queue-meta">prioridad {item.priorityScore}</span>
                </header>
                <strong>{item.title}</strong>
                <p>{item.explanation}</p>
                <p><b>Recomendación:</b> {item.recommendation}</p>
                <dl>
                  <div><dt>Confianza</dt><dd>{item.confidence}</dd></div>
                  <div><dt>Esfuerzo</dt><dd>{item.estimatedHours} h</dd></div>
                  <div><dt>Se ejecuta en</dt><dd>{ARM_LABEL[item.dispatchArm] ?? item.dispatchArm}</dd></div>
                </dl>
                <small>{item.confidenceReason}</small>
                {item.demotedBecause ? <small>{item.demotedBecause}</small> : null}
                {dismissing === item.id ? (
                  <form className="gs-queue-form" onSubmit={event => { event.preventDefault(); if (reason.trim().length >= 3) { onDismiss(item.id, reason.trim()); setDismissing(''); setReason('') } }}>
                    <label htmlFor={`dismiss-${item.id}`}>¿Por qué la descartas?</label>
                    <textarea id={`dismiss-${item.id}`} className="gs-textarea" rows="2" value={reason} onChange={event => setReason(event.target.value)} placeholder="Ej.: ya lo cubrimos con otra pieza" />
                    <div>
                      <button type="button" className="gs-link" onClick={() => setDismissing('')}>Cancelar</button>
                      <button type="submit" className="gs-button small" disabled={reason.trim().length < 3}>Confirmar</button>
                    </div>
                  </form>
                ) : (
                  <footer>
                    <div>
                      {item.stream === 'channel_signal' ? <button type="button" className="gs-link" onClick={() => setDismissing(item.id)}>Descartar</button> : null}
                      <button type="button" className="gs-button small primary" disabled={busyId === item.id} onClick={() => onDispatch(item.id, item.dispatchArm)}>
                        Abrir en {ARM_LABEL[item.dispatchArm] ?? item.dispatchArm} <RiArrowRightLine />
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
  const items = (actions ?? []).slice(0, 5)
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiSparkling2Line /></span>Qué hará Vendrava por ti</h2><p>Acciones ordenadas para mover la demanda hacia ventas.</p></div>
      </header>
      <div className="gs-panel-body is-flush">
        {items.length ? items.map((action, index) => {
          const Icon = ACTION_ICONS[index] || RiLightbulbFlashLine
          return (
            <div className="og-action-row" key={action.id || `${action.title}-${index}`}>
              <span className="og-action-index">{index + 1}</span>
              <div className="og-action-copy">
                <strong>{action.title || action.name || 'Siguiente acción'}</strong>
                <p>{action.description || action.detail || 'Una recomendación conectada con tu oportunidad comercial.'}</p>
                <span className={`gs-pill ${action.impact === 'medium' ? 'tone-warn' : 'tone-ok'}`}>{action.impactLabel || (action.impact === 'medium' ? 'Impacto medio' : 'Impacto alto')}</span>
              </div>
              <button type="button" className="gs-button small primary" onClick={() => onAction(action, 'draft')}><Icon aria-hidden="true" /> {action.cta || 'Preparar'}</button>
            </div>
          )
        }) : <p className="gs-empty-inline">Cuando haya una oportunidad, Vendrava te propondrá qué crear o mejorar primero.</p>}
      </div>
    </section>
  )
}

export function AssetsPanel({ assets, onAction }) {
  const items = (assets ?? []).slice(0, 4)
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiFileTextLine /></span>Activos que generan clientes</h2><p>Piezas comerciales conectadas al CRM.</p></div>
      </header>
      <div className="gs-panel-body is-flush">
        {items.length ? items.map((asset, index) => (
          <div className="og-action-row" key={asset.id || index}>
            <span className="og-action-index is-icon"><RiFileTextLine /></span>
            <div className="og-action-copy">
              <strong>{asset.name || asset.title || 'Activo comercial'}</strong>
              <p>{asset.description || asset.type || 'Borrador conectado a una oportunidad.'}</p>
            </div>
            <button type="button" className="gs-button small" onClick={() => onAction(asset, 'draft')}>{asset.cta || 'Crear'}</button>
          </div>
        )) : <p className="gs-empty-inline">Cuando descubras una oportunidad, aquí aparecerán páginas, guías y landings capaces de convertirla.</p>}
      </div>
    </section>
  )
}

/* ── Fuentes ────────────────────────────────────────────────────────────── */

function IntegrationCard({ integration, projectId, busy, onAction }) {
  const meta = INTEGRATION_META[integration.provider] || { label: integration.provider, description: 'Fuente externa de datos orgánicos.', icon: RiGlobalLine }
  const Icon = meta.icon
  const presentation = integrationPresentation(integration)
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
      <p className="og-source-property">{propertyLabel ? `Propiedad: ${propertyLabel}` : 'Propiedad: pendiente de selección'}</p>
      {presentation.connected && properties.length ? (
        <label className="gs-field">
          <span>Seleccionar propiedad</span>
          <select className="gs-select" value={integration.externalPropertyId || ''} onChange={event => onAction(integration.provider, 'configure', event.target.value)} disabled={busy}>
            <option value="">Selecciona una propiedad</option>
            {properties.map(property => <option key={property.id} value={property.id}>{property.label || property.id}</option>)}
          </select>
        </label>
      ) : null}
      {integration.lastError ? <p className="gs-inline-error" role="alert">{integration.lastError}</p> : null}
      {integration.lastSyncedAt ? <p className="gs-note">Última sincronización: {formatDateTime(integration.lastSyncedAt)}</p> : null}
      <div className="og-source-actions">
        {presentation.connected ? (
          <>
            <button type="button" className="gs-button small" onClick={() => onAction(integration.provider, 'sync')} disabled={!canSync} title={!presentation.hasProperty ? 'Selecciona una propiedad antes de sincronizar.' : undefined}><RiRefreshLine /> {busy ? 'Sincronizando…' : 'Sincronizar'}</button>
            <button type="button" className="gs-button small ghost" onClick={() => onAction(integration.provider, 'disconnect')} disabled={busy}><RiCloseLine /> Desconectar</button>
          </>
        ) : (
          <button type="button" className="gs-button small primary" onClick={() => onAction(integration.provider, 'connect')} disabled={busy || !projectId}><RiLinkM /> {busy ? 'Iniciando…' : 'Iniciar OAuth'}</button>
        )}
      </div>
    </article>
  )
}

export function OrganicIntegrationsPanel({ state, projectId, onAction, onRefresh }) {
  const items = state.integrations || []
  const status = state.status === 'error' ? 'error' : state.status === 'unavailable' ? 'disconnected' : state.status === 'setup' ? 'empty' : state.status === 'loading' ? 'loading' : 'live'
  const statusMessage = state.status === 'error' || state.status === 'unavailable'
    ? state.error
    : state.status === 'setup' ? 'Crea primero el proyecto orgánico para autorizar y seleccionar propiedades.' : undefined
  return (
    <section className="gs-panel" aria-labelledby="og-sources-title">
      <header className="gs-panel-head">
        <div><h2 id="og-sources-title"><span className="gs-panel-icon"><RiLinkM /></span>Fuentes de Google</h2><p>Conecta fuentes verificables para habilitar señales reales de búsqueda, analítica y presencia local.</p></div>
      </header>
      <div className="gs-panel-body">
        <DataStatusBanner compact status={status} message={statusMessage} onRetry={status === 'error' || status === 'disconnected' ? onRefresh : undefined} />
        {state.status === 'loading' ? <div className="gs-skeleton"><i /><i /><i /></div> : null}
        {state.status === 'unavailable' ? <p className="gs-empty-inline" role="status">{state.error} Las tarjetas quedan en estado no conectado hasta que el backend exponga el contrato OAuth.</p> : null}
        {state.status === 'ready' ? <div className="og-sources">{items.map(integration => <IntegrationCard key={integration.provider} integration={integration} projectId={projectId} busy={state.busyProvider === integration.provider} onAction={onAction} />)}</div> : null}
        {state.message ? <p className="gs-inline-error" role="status">{state.message}</p> : null}
      </div>
    </section>
  )
}

export function OrganicUpcoming() {
  // Solo lo que de verdad falta: cuando una fila se construye, se retira.
  const items = [
    ['Alcance de redes', 'Metricool tiene el alcance de cada publicación; Vendrava todavía no lo lee, así que redes no tiene presencia medida.', 'Pendiente'],
    ['Reprogramar un post solo', 'Está en la lista delegable de §9, pero falta la llamada de actualización de Metricool.', 'Fase 4'],
    ['Responder reseñas con plantilla', 'Las reseñas ya se leen; responderlas exige escribir en la API restringida de Google y plantillas aprobadas.', 'Fase 4'],
  ]
  return (
    <section className="gs-panel is-dashed">
      <header className="gs-panel-head">
        <div><h2><span className="gs-panel-icon"><RiCompass3Line /></span>Todavía no medido</h2><p>Lo que falta para cerrar el circuito, y cuándo llega.</p></div>
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
  return (
    <section className="gs-panel">
      <div className="gs-empty is-error" aria-live="polite">
        <span><RiRefreshLine /></span>
        <h3>No pudimos cargar el circuito orgánico</h3>
        <p>{error}</p>
        <div className="gs-empty-actions">
          <button type="button" className="gs-button primary" onClick={onRetry}><RiRefreshLine /> Reintentar</button>
          <button type="button" className="gs-button ghost" onClick={onConfigure}><RiLinkM /> Configurar proyecto</button>
        </div>
      </div>
    </section>
  )
}

/** Aviso corto para las pestañas que necesitan proyecto cuando aún no lo hay. */
export function OrganicSetupPrompt({ onGoToSetup, what = 'esta medición' }) {
  return (
    <section className="gs-panel is-dashed">
      <div className="gs-empty">
        <span><RiLeafLine /></span>
        <h3>Falta el proyecto orgánico</h3>
        <p>Para {what} Vendrava necesita saber qué negocio, qué web y qué zona interpreta. El estudio de contenido funciona sin él; la medición no.</p>
        <div className="gs-empty-actions"><button type="button" className="gs-button primary" onClick={onGoToSetup}>Configurar ahora <RiArrowRightLine /></button></div>
      </div>
    </section>
  )
}

export function OrganicModal({ type, target, action = 'draft', onClose, onSubmit, submitting, message }) {
  const isSetup = type === 'setup'
  const isProject = action === 'project'
  const isConnect = action === 'connect'
  const isDraft = type === 'draft' || type === 'opportunity'
  const title = isConnect ? 'Editar proyecto' : isProject ? 'Configura el proyecto orgánico' : isDraft ? 'Preparar activo comercial' : 'Explorar el circuito orgánico'
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
          <span className="gs-modal-eyebrow">Orgánico y social</span>
          <h2 id="og-modal-title">{title}</h2>
          <p>{isSetup ? 'El nombre, la web y la zona con los que Vendrava interpreta tus datos orgánicos.' : 'La acción se guardará como borrador para que puedas revisarla antes de publicarla.'}</p>
          <button type="button" className="gs-modal-close" onClick={onClose} aria-label="Cerrar" disabled={submitting}><RiCloseLine /></button>
        </header>
        <div className="gs-modal-body">
          <div className="gs-form-grid">
            {isDraft ? (
              <label className="full">Oportunidad o activo<input className="gs-input" value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Página de servicio para una zona" required /></label>
            ) : (
              <>
                <label className="full">Nombre del proyecto<input className="gs-input" value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Clínica Dental Valencia" required /></label>
                <label>Web del negocio<input className="gs-input" type="url" value={form.website} onChange={event => update('website', event.target.value)} placeholder="https://tuweb.com" required /></label>
                <label>Ciudad o zona<input className="gs-input" value={form.location} onChange={event => update('location', event.target.value)} placeholder="Ej. Valencia y Campanar" /></label>
              </>
            )}
            <label className="full">Contexto para Vendrava<textarea className="gs-textarea" value={form.notes} onChange={event => update('notes', event.target.value)} placeholder="Servicios, oferta, conversión principal o cualquier contexto comercial." /></label>
          </div>
        </div>
        {message ? <p className="gs-modal-message" role="status">{message}</p> : null}
        <footer className="gs-modal-foot">
          <div className="gs-modal-actions">
            <button type="button" className="gs-button ghost" onClick={onClose} disabled={submitting}>Cerrar</button>
            <button type="submit" className="gs-button primary" disabled={submitting}>{submitting ? 'Guardando…' : isConnect ? 'Guardar proyecto' : isProject ? 'Crear proyecto' : 'Crear borrador'}</button>
          </div>
        </footer>
      </form>
    </div>
  )
}
