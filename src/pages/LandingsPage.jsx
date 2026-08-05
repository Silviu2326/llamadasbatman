import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  RiAddLine, RiAlarmWarningLine, RiArrowDownSLine, RiArrowRightLine,
  RiBarChartGroupedLine, RiCheckLine, RiCloseLine, RiDeleteBinLine, RiEditLine,
  RiExternalLinkLine, RiEyeLine, RiFileCopyLine, RiFilter3Line, RiGlobalLine,
  RiInformationLine, RiLayoutGridLine, RiListCheck, RiMore2Line,
  RiPauseCircleLine, RiPlayCircleLine, RiRefreshLine, RiRocketLine,
  RiSearchLine, RiSettings3Line, RiSparkling2Line, RiTeamLine, RiTimeLine,
  RiUploadCloud2Line,
} from 'react-icons/ri'
import CaptureJourney from '../components/capture/CaptureJourney'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import './landings.css'

const STORAGE_KEY = 'vendrava.external-webs.v1'

const TEMPLATE_META = {
  'gym-trial-v1': { label: 'Fitness Boost', kind: 'Fitness', color: 'var(--pink)' },
  'pet-grooming-v1': { label: 'Pet Care', kind: 'Mascotas', color: 'var(--warn)' },
  'legal-consult-v1': { label: 'Lex Pro', kind: 'Servicios legales', color: 'var(--warn-soft)' },
  'generic-v1': { label: 'Clarity Pro', kind: 'General', color: 'var(--cyan)' },
}

const FALLBACK_IMAGES = [
  '/assets/landings/landing-hero.png',
  '/assets/campaigns/campaign-signal.png',
  '/assets/landings/landing-hero.png',
  '/assets/campaigns/campaign-signal.png',
]

function readExternalWebs() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.map(item => ({ ...item, leads: null, meetings: null, visits: null }))
      : []
  } catch {
    return []
  }
}

function writeExternalWebs(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function templateMeta(templateId) {
  return TEMPLATE_META[templateId] || TEMPLATE_META['generic-v1']
}

function normalizeCampaign(campaign, index) {
  const assets = campaign.adAssets && typeof campaign.adAssets === 'object' ? campaign.adAssets : {}
  const templateId = assets.landingTemplateId || 'generic-v1'
  const hasLanding = Boolean(campaign.landingSlug)
  // Las visitas vienen del snapshot de telemetría y de ningún otro sitio.
  // `adAssets.visits` era un número escrito a mano que competía con la
  // medición real: la doble fuente de verdad que advierte landings.md §12.
  const rawVisits = campaign.trackedVisits
  const parsedVisits = rawVisits === null || rawVisits === undefined || rawVisits === '' ? null : Number(rawVisits)
  const visits = Number.isFinite(parsedVisits) && parsedVisits >= 0 ? parsedVisits : null
  // Los leads medidos mandan sobre el contador de la campaña. `totalLeads` es
  // un acumulador que puede no estar mantenido, y tenerlo junto al ranking del
  // snapshot hacía que la misma landing mostrara 10 leads arriba y 0 abajo.
  const measuredLeads = campaign.snapshotLeads
  const leads = Number.isFinite(measuredLeads) && measuredLeads !== null
    ? measuredLeads
    : Math.max(0, Number(campaign.totalLeads) || 0)
  const meetings = Math.max(0, Number(campaign.meetingsScheduled) || 0)
  const activityDate = campaign.updatedAt || campaign.createdAt
  return {
    id: campaign.id,
    sourceId: campaign.id,
    name: assets.title || campaign.name || 'Landing sin título',
    campaignName: campaign.name || 'Campaña sin nombre',
    slug: campaign.landingSlug || '',
    templateId,
    status: !hasLanding ? 'none' : campaign.status === 'active' ? 'published' : 'draft',
    leads,
    meetings,
    visits,
    updatedAt: activityDate ? new Date(activityDate).toLocaleDateString(localeCode(getLocale()), { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha',
    updatedBy: campaign.agent?.name || 'Equipo Vendrava',
    telemetryState: campaign.telemetryState || 'pending',
    image: assets.imageUrl || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    offer: assets.offer || '',
    leadMagnet: assets.leadMagnet || '',
    adCopy: assets.adCopy || campaign.objective || '',
    assets,
    external: false,
  }
}

function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat(localeCode(getLocale())).format(Number(value))
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString(localeCode(getLocale()), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function getConversion(item) {
  return Number.isFinite(item.visits) && item.visits > 0 ? (item.leads / item.visits) * 100 : null
}

function getLink(item) {
  if (item.external) return item.url
  return item.slug ? `${window.location.origin}/l/${item.slug}` : null
}

function StatusBadge({ status }) {
  const meta = {
    published: { label: 'Publicada', color: 'var(--success)' },
    draft: { label: 'Borrador', color: 'var(--warn)' },
    none: { label: 'Sin landing', color: 'var(--dim)' },
    external: { label: 'Web externa', color: 'var(--cyan)' },
  }[status] || { label: 'Sin estado', color: 'var(--dim)' }
  return <span className="landing-status" style={{ '--status-color': meta.color }}><i />{meta.label}</span>
}

/**
 * Banda de integridad de datos (landings.md §5, mismos estados que ads.md
 * §4.2). Va antes que cualquier KPI: la página no puede pedir confianza en un
 * número sin decir primero si ese número se puede creer.
 */
function IntegrityBand({ integrity, onRefresh, refreshing }) {
  if (!integrity) {
    return <section className="landings-integrity state-unknown" role="status">
      <span className="landings-integrity-dot" />
      <div>
        <strong>Estado de los datos desconocido</strong>
        <p>No se ha podido leer la telemetría de tus landings. Los indicadores que dependen de ella aparecen como «sin medición», nunca como cero.</p>
      </div>
      <button className="landing-button ghost" onClick={onRefresh} disabled={refreshing}><RiRefreshLine /> Reintentar</button>
    </section>
  }

  const meta = {
    ready: { label: 'Datos listos', detail: 'Todas las landings publicadas están midiendo.' },
    partial: { label: 'Datos parciales', detail: `${integrity.measured} de ${integrity.landings} landings están midiendo. Las demás aún no han recibido visitas desde que la telemetría está activa.` },
    stale: { label: 'Datos obsoletos', detail: 'El último cálculo tiene más de dos días. Actualiza antes de tomar decisiones.' },
    unreliable: { label: 'Sin telemetría fiable', detail: 'Ninguna landing ha registrado comportamiento todavía: no hay base para diagnosticar.' },
  }[integrity.state] || { label: 'Estado desconocido', detail: '' }

  const coverage = integrity.utmCoverage === null || integrity.utmCoverage === undefined
    ? 'sin visitas registradas'
    : `${Math.round(integrity.utmCoverage * 100)}% del tráfico con origen identificado`

  return <section className={`landings-integrity state-${integrity.state}`} role="status">
    <span className="landings-integrity-dot" />
    <div>
      <strong>{meta.label}</strong>
      <p>{meta.detail}</p>
      <small>Cobertura de atribución: {coverage}{integrity.lastComputedAt ? ` · calculado ${new Date(integrity.lastComputedAt).toLocaleString(localeCode(getLocale()))}` : ' · sin cálculo previo'}</small>
    </div>
    <button className="landing-button ghost" onClick={onRefresh} disabled={refreshing}><RiRefreshLine /> {refreshing ? 'Actualizando…' : 'Actualizar'}</button>
  </section>
}

const CONFIDENCE_LABEL = { high: 'alta', medium: 'media', low: 'baja', none: 'sin datos' }
const EFFORT_LABEL = { low: 'bajo', medium: 'medio', high: 'alto' }
// Mismo vocabulario que el backend usa en los diagnósticos: el mapa de caída no
// puede llamar «email» a lo que la recomendación llama «email» de otra forma.
const FIELD_LABEL = { name: 'nombre', phone: 'teléfono', email: 'email', contactTime: 'franja horaria', consent: 'consentimiento' }

const CHANGE_TYPE_LABEL = {
  optional_field: 'Campo del formulario',
  block_order: 'Orden de los bloques',
  cta_text: 'Texto del CTA',
  hero_variant: 'Variante de hero',
  faq: 'FAQ',
  pricing: 'Precios',
  testimonial: 'Testimonio',
  legal_claim: 'Afirmación legal',
  contract_terms: 'Condiciones contractuales',
  consent: 'Consentimiento',
  targeting: 'Segmentación',
}

const fieldList = fields => (Array.isArray(fields) ? fields : []).map(field => FIELD_LABEL[field] || field).join(', ')

/**
 * Traduce un parche de variante o un cambio de autonomía a algo que una persona
 * pueda leer. Sin esto la página enseña `hiddenFields` y `{"fields":["email"]}`,
 * que no significan nada para quien lleva el negocio.
 */
function describeChange(payload) {
  if (!payload || typeof payload !== 'object') return 'sin cambios'
  const parts = []
  if (payload.hiddenFields?.length) parts.push(`retira ${fieldList(payload.hiddenFields)} del formulario`)
  if (payload.optionalFields?.length) parts.push(`deja de exigir ${fieldList(payload.optionalFields)}`)
  if (payload.fields?.length) parts.push(`afecta a ${fieldList(payload.fields)}`)
  if (payload.title) parts.push(`nuevo titular: «${payload.title}»`)
  if (payload.offer) parts.push(`nueva oferta: «${payload.offer}»`)
  if (payload.leadMagnet) parts.push('nuevo recurso descargable')
  if (payload.adCopy) parts.push('nuevo texto de captación')
  if (payload.text) parts.push(`texto: «${payload.text}»`)
  return parts.length ? parts.join(' · ') : 'sin cambios'
}

function formatMoney(cents) {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat(localeCode(getLocale()), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatRate(rate) {
  if (rate === null || rate === undefined) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

/**
 * "Atención requerida" (landings.md §5.1). Tres o cuatro tarjetas como máximo:
 * el usuario no revisa veinte filas para descubrir qué pasa. El orden lo decide
 * la prioridad económica que calcula el backend, no la fecha ni el nombre.
 */
function AttentionRequired({ diagnoses, onOpen }) {
  if (!diagnoses?.length) return null
  const top = diagnoses.slice(0, 4)

  return <section className="landings-attention" aria-label="Atención requerida">
    <div className="landings-attention-head">
      <h2><RiAlarmWarningLine /> Atención requerida</h2>
      <span>{diagnoses.length} {diagnoses.length === 1 ? 'hallazgo' : 'hallazgos'} ordenados por impacto estimado</span>
    </div>
    <div className="landings-attention-grid">
      {top.map(diagnosis => <article key={diagnosis.id} className={`landings-attention-card type-${diagnosis.type}`}>
        <header>
          <span className="landings-attention-type">{diagnosis.title}</span>
          <span className="landings-attention-level">{diagnosis.level}</span>
        </header>
        <strong>{diagnosis.problem}</strong>
        <ul>{diagnosis.evidence.slice(0, 2).map(item => <li key={item}>{item}</li>)}</ul>
        <div className="landings-attention-impact">
          <span>Impacto estimado</span>
          <strong>{diagnosis.impact.minLeads}–{diagnosis.impact.maxLeads} leads/mes</strong>
          {/* Sin tasa de cualificación medida no se traduce a oportunidades:
              inventarla es lo que hace desconfiar del resto de la página. */}
          <small>{diagnosis.impact.maxOpportunities !== null
            ? `≈ ${diagnosis.impact.minOpportunities}–${diagnosis.impact.maxOpportunities} oportunidades`
            : 'Oportunidades: sin tasa de cualificación medida'}</small>
        </div>
        <footer>
          <span>Confianza {CONFIDENCE_LABEL[diagnosis.confidence]} · esfuerzo {EFFORT_LABEL[diagnosis.effort]}</span>
          <button className="landing-button ghost" onClick={() => onOpen(diagnosis.landingKey)}>Ver detalle <RiArrowRightLine /></button>
        </footer>
      </article>)}
    </div>
  </section>
}

/**
 * Ranking económico (§5.2): demuestra que más leads no es mejor landing. Las
 * landings sin medición no aparecen aquí — no han perdido, es que no se sabe.
 */
function EconomicRanking({ items, onOpen }) {
  const measured = items.filter(item => item.snapshot)
  if (!measured.length) return null

  return <section className="landings-ranking" aria-label="Ranking económico">
    <div className="landings-panel-heading">
      <div><h2>Qué landing produce compradores</h2><span>Ordenadas por ingresos atribuidos, no por volumen de leads</span></div>
      <RiBarChartGroupedLine />
    </div>
    <div className="landings-ranking-scroll">
      <table className="landings-ranking-table">
        <thead><tr><th>Landing</th><th>Visitas</th><th>Leads</th><th>Cualificados</th><th>Ventas</th><th>Ingresos</th><th>Confianza</th></tr></thead>
        <tbody>
          {measured.map(item => <tr key={item.campaignId} onClick={() => onOpen(item.landingKey)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter') onOpen(item.landingKey) }}>
            <td><strong>{item.name}</strong><small>/l/{item.slug}</small></td>
            <td>{formatNumber(item.snapshot.visits)}</td>
            <td>{formatNumber(item.snapshot.leads)}</td>
            <td>{formatNumber(item.snapshot.qualified)}</td>
            <td>{formatNumber(item.snapshot.sales)}</td>
            <td>{formatMoney(item.snapshot.revenueCents)}</td>
            <td><span className={`landings-confidence is-${item.snapshot.confidence}`}>{CONFIDENCE_LABEL[item.snapshot.confidence]}</span></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>
}

const VARIANT_STATUS_LABEL = {
  generated: 'Generada',
  pending_approval: 'Pendiente de aprobación',
  active: 'Activa',
  winner: 'Ganadora',
  loser: 'Perdedora',
  inconclusive: 'Sin conclusión',
  discarded: 'Descartada',
}

const DECISION_LABEL = {
  running: 'En curso',
  winner: 'Hay ganadora',
  inconclusive: 'Sin conclusión',
  insufficient: 'Sin volumen suficiente',
}

/**
 * Variantes y experimentos (§5.4, §5.5 y §9). Cada variante muestra su
 * justificación escrita: es lo que permite aprender del resultado, gane o
 * pierda, y lo que impide que se cuelen cambios cosméticos sin hipótesis.
 */
function VariantsPanel({ variants, experiment, busy, onGenerate, onRequestApproval, onStart, onConclude, onDiscard }) {
  return <>
    <h3>Variantes y experimentos</h3>
    <div className="landings-variants-actions">
      <button className="landing-button primary" onClick={onGenerate} disabled={busy}>
        <RiSparkling2Line /> {busy ? 'Trabajando…' : 'Proponer variante'}
      </button>
      <small>La variante nace del diagnóstico activo, con su justificación escrita. Sin diagnóstico no hay hipótesis que probar.</small>
    </div>

    {experiment ? <div className="landings-experiment">
      <div className="landings-experiment-head">
        <strong>Experimento en curso</strong>
        <span className={`landings-decision is-${experiment.decision}`}>{DECISION_LABEL[experiment.decision] || experiment.decision}</span>
      </div>
      <p>{experiment.reason}</p>
      <table className="landings-fields-table">
        <thead><tr><th>Variante</th><th>Sesiones</th><th>Conversiones</th><th>Tasa</th></tr></thead>
        <tbody>{experiment.results.map(result => <tr key={result.variantId}>
          <td>{result.name}{result.isControl ? ' (control)' : ''}</td>
          <td>{formatNumber(result.exposures)}</td>
          <td>{formatNumber(result.conversions)}</td>
          <td>{formatRate(result.conversionRate)}</td>
        </tr>)}</tbody>
      </table>
      <small>
        Asignación por sesión · umbral: {experiment.thresholds.minExposuresPerVariant} sesiones por variante,
        {' '}{experiment.thresholds.minConversionsTotal} conversiones y {experiment.thresholds.confidence} de confianza.
      </small>
      {experiment.decision === 'winner' || experiment.decision === 'inconclusive'
        ? <button className="landing-button primary" onClick={() => onConclude(experiment.experimentId)} disabled={busy}>Cerrar experimento y aplicar resultado</button>
        : null}
    </div> : null}

    {variants.length ? <div className="landings-variant-list">
      {variants.map(variant => <article key={variant.id} className="landings-variant">
        <header>
          <strong>{variant.name}</strong>
          <span className={`landings-variant-status is-${variant.status}`}>{VARIANT_STATUS_LABEL[variant.status] || variant.status}</span>
        </header>
        <p className="landings-variant-justification">{variant.justification}</p>
        <small>Sobre la versión {variant.baseVersion?.version ?? '—'} · {describeChange(variant.patch)}</small>
        <footer>
          {variant.status === 'generated' ? <button className="landing-button ghost" onClick={() => onRequestApproval(variant.id)} disabled={busy}>Enviar a aprobación</button> : null}
          {variant.status === 'pending_approval' ? <button className="landing-button ghost" onClick={() => onStart(variant.id)} disabled={busy}>Activar experimento</button> : null}
          {variant.status !== 'active' && variant.status !== 'discarded' ? <button className="landing-button ghost" onClick={() => onDiscard(variant.id)} disabled={busy}>Descartar</button> : null}
        </footer>
      </article>)}
    </div> : <p className="landings-detail-empty">Todavía no hay variantes para esta landing.</p>}
  </>
}

const AUTONOMY_STATUS_LABEL = {
  shadow: 'En sombra',
  proposed: 'Propuesta',
  approved: 'Aprobada',
  applied: 'Aplicada',
  rolled_back: 'Revertida',
  blocked: 'Bloqueada',
  expired: 'Caducada',
}

/**
 * Informe en euros (§11, fase 4). Cada hueco se explica con palabras: un CAC
 * calculado sobre gasto incompleto no es una aproximación, es un número que
 * lleva a decisiones caras.
 */
function LandingReport({ report }) {
  if (!report) return null
  return <div className="landings-report">
    <p className="landings-report-narrative">{report.narrative}</p>
    <div className="landings-report-grid">
      <span><small>Cualificados</small><strong>{formatNumber(report.qualified)}</strong></span>
      <span><small>Ventas</small><strong>{formatNumber(report.sales)}</strong></span>
      <span><small>Ingresos</small><strong>{formatMoney(report.revenueCents)}</strong></span>
      <span><small>Gasto</small><strong>{formatMoney(report.spendCents)}</strong></span>
      <span><small>CPQL</small><strong>{formatMoney(report.cpqlCents)}</strong></span>
      <span><small>CAC</small><strong>{formatMoney(report.cacCents)}</strong></span>
      <span><small>ROAS</small><strong>{report.roas === null ? '—' : `${report.roas}×`}</strong></span>
      <span><small>Confianza</small><strong>{CONFIDENCE_LABEL[report.confidence]}</strong></span>
    </div>
    {report.caveats.length ? <ul className="landings-report-caveats">
      {report.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}
    </ul> : null}
  </div>
}

/**
 * Panel de autonomía (§10). Muestra el nivel, el modo sombra y el registro de
 * decisiones con sus guardarraíles. El lenguaje es deliberado: en sombra se
 * dice "habría hecho", nunca "habría ahorrado" — no sabemos qué habría pasado
 * por el otro camino.
 */
function AutonomyPanel({ autonomy, onRun, busy }) {
  if (!autonomy) return null
  const { config, decisions } = autonomy

  return <>
    <h3>Autonomía</h3>
    <div className="landings-autonomy-state">
      <span className={`landings-autonomy-level is-${config.level}`}>{config.level}</span>
      <div>
        <strong>{config.level === 'N1' ? 'Solo recomienda' : config.level === 'N2' ? 'Aprobación con un clic' : config.shadowMode ? 'Automático en modo sombra' : 'Automático'}</strong>
        <p>{config.shadowMode
          ? 'El modo sombra registra lo que haría sin tocar ninguna landing.'
          : 'Los cambios permitidos se aplican solos, con observación y reversión automática.'}</p>
        <small>Observación {config.observationDays} días · revierte si la conversión cae un {Math.round(config.rollbackDropThreshold * 100)}%</small>
      </div>
      <button className="landing-button ghost" onClick={onRun} disabled={busy}>{busy ? 'Ejecutando…' : 'Ejecutar pasada'}</button>
    </div>

    {decisions?.length ? <div className="landings-autonomy-list">
      {decisions.slice(0, 6).map(decision => <article key={decision.id} className="landings-autonomy-decision">
        <header>
          <strong>{CHANGE_TYPE_LABEL[decision.changeType] || decision.changeType}</strong>
          <span className={`landings-autonomy-status is-${decision.status}`}>{AUTONOMY_STATUS_LABEL[decision.status] || decision.status}</span>
        </header>
        <p>{decision.status === 'shadow'
          ? `Habría cambiado: ${describeChange(decision.payload)}.`
          : decision.status === 'blocked'
            ? decision.blockedReason
            : `Cambio: ${describeChange(decision.payload)}.`}</p>
        {decision.outcome ? <small className="landings-autonomy-outcome">{decision.outcome.detail}</small> : null}
        <small>Política {decision.policyVersion} · {new Date(decision.createdAt).toLocaleDateString(localeCode(getLocale()))}</small>
      </article>)}
    </div> : <p className="landings-detail-empty">
      Sin decisiones registradas. Hoy N3 no tiene ningún cambio que pueda aplicar
      en esta landing: los únicos campos obligatorios son los esenciales, y el CTA,
      la FAQ y el orden de los bloques todavía no son editables. Los guardarraíles,
      el registro y la reversión ya funcionan; falta superficie que tocar.
    </p>}
  </>
}

/** Detalle de landing (§5.3): embudo, mapa de caída, origen y diagnóstico. */
function LandingDetail({ detail, loading, onClose, variants, experiment, busy, actions, autonomy, report }) {
  return <div className="landings-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="landings-detail" role="dialog" aria-modal="true" aria-labelledby="landing-detail-title">
      <header className="landings-modal-head">
        <div>
          <span>Detalle de landing</span>
          <h2 id="landing-detail-title">{loading ? 'Cargando…' : detail?.name}</h2>
          {detail ? <p>/l/{detail.slug} · {detail.dropMap.sessions} sesiones medidas en 28 días</p> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button>
      </header>

      {loading || !detail ? <div className="landings-detail-body"><p className="landings-detail-empty">Cargando telemetría…</p></div> : <div className="landings-detail-body">
        {detail.baseline?.insufficientReason
          ? <p className="landings-detail-note"><RiInformationLine /> {detail.baseline.insufficientReason}</p>
          : null}

        <h3>Mapa de caída</h3>
        {detail.dropMap.sessions ? <div className="landings-dropmap">
          {detail.dropMap.steps.map(step => <div key={step.key} className="landings-dropmap-step">
            <span>{step.label}</span>
            <div className="landings-dropmap-bar"><i style={{ width: `${Math.round((step.rate ?? 0) * 100)}%` }} /></div>
            <strong>{formatRate(step.rate)}</strong>
            <small>{formatNumber(step.value)}</small>
          </div>)}
          {/* Fuera del recorrido a propósito: se puede pulsar el CTA del hero
              sin llegar al final, así que no es un paso posterior. */}
          {detail.dropMap.depth ? <p className="landings-dropmap-depth">
            {detail.dropMap.depth.label}: <strong>{formatRate(detail.dropMap.depth.rate)}</strong> ({formatNumber(detail.dropMap.depth.value)}) — señal de profundidad, no un paso del recorrido.
          </p> : null}
        </div> : <p className="landings-detail-empty">Sin sesiones medidas en el período: no hay recorrido que dibujar.</p>}

        {detail.dropMap.fields.length ? <>
          <h3>Abandono por campo <small>sobre quienes llegaron al campo, no sobre el total</small></h3>
          <table className="landings-fields-table">
            <thead><tr><th>Campo</th><th>Expuestos</th><th>Completados</th><th>Abandono</th><th>Errores</th><th>Tiempo medio</th></tr></thead>
            <tbody>{detail.dropMap.fields.map(field => <tr key={field.field}>
              <td>{FIELD_LABEL[field.field] || field.field}</td>
              <td>{formatNumber(field.exposed)}</td>
              <td>{formatNumber(field.completed)}</td>
              <td className={field.abandonment > 0.45 ? 'is-bad' : ''}>{formatRate(field.abandonment)}</td>
              <td>{formatNumber(field.validationErrors)}</td>
              <td>{field.averageMs === null ? '—' : `${(field.averageMs / 1000).toFixed(1)} s`}</td>
            </tr>)}</tbody>
          </table>
        </> : null}

        {detail.traffic.length ? <>
          <h3>Origen del tráfico</h3>
          <table className="landings-fields-table">
            <thead><tr><th>Canal</th><th>Sesiones</th><th>Envíos</th><th>Conversión</th></tr></thead>
            <tbody>{detail.traffic.map(row => <tr key={row.channel}>
              <td>{row.channel}</td><td>{formatNumber(row.sessions)}</td><td>{formatNumber(row.submits)}</td><td>{formatRate(row.conversion)}</td>
            </tr>)}</tbody>
          </table>
        </> : null}

        <h3>Diagnóstico</h3>
        {detail.diagnoses.length ? detail.diagnoses.map(diagnosis => <article key={diagnosis.id} className="landings-detail-diagnosis">
          <strong>{diagnosis.title}</strong>
          <p>{diagnosis.problem}</p>
          <ul>{diagnosis.evidence.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="landings-detail-reco"><RiSparkling2Line /> {diagnosis.recommendation}</p>
          <small>Impacto {diagnosis.impact.minLeads}–{diagnosis.impact.maxLeads} leads/mes · confianza {CONFIDENCE_LABEL[diagnosis.confidence]} · esfuerzo {EFFORT_LABEL[diagnosis.effort]}{diagnosis.baselineUsed ? ` · ${diagnosis.baselineUsed}` : ''}</small>
        </article>) : <p className="landings-detail-empty">Sin hallazgos: o la landing va bien, o todavía no hay datos suficientes para afirmar lo contrario.</p>}

        <h3>Informe en euros</h3>
        <LandingReport report={report} />

        <VariantsPanel
          variants={variants}
          experiment={experiment}
          busy={busy}
          onGenerate={() => actions.generate(detail.landingKey)}
          onRequestApproval={actions.requestApproval}
          onStart={actions.start}
          onConclude={actions.conclude}
          onDiscard={actions.discard}
        />

        <AutonomyPanel autonomy={autonomy} onRun={actions.runAutonomy} busy={busy} />

        {detail.health ? <p className="landings-detail-note">
          <RiInformationLine /> Salud técnica: {detail.health.verdict === 'ok' ? 'sin incidencias' : detail.health.verdict === 'slow' ? 'la landing carga despacio' : detail.health.verdict === 'broken' ? `la landing responde con error ${detail.health.statusCode}` : 'sin comprobar'}
          {detail.health.ttfbMs ? ` · primer byte ${detail.health.ttfbMs} ms` : ''}
        </p> : null}
      </div>}
    </section>
  </div>
}

function LandingThumb({ item, featured = false }) {
  return <div className={`landing-thumb${featured ? ' featured' : ''}`} style={{ '--thumb-color': templateMeta(item.templateId).color }}>
    <img src={item.image || FALLBACK_IMAGES[0]} alt="" />
    <div className="landing-thumb-shade" />
    <span className="landing-thumb-label">{item.external ? 'SITIO WEB' : templateMeta(item.templateId).kind.toUpperCase()}</span>
    <strong>{item.name}</strong>
    <small>{item.external ? 'URL importada' : item.offer || 'Experiencia de captación'}</small>
  </div>
}

function KpiCard({ icon: Icon, label, value, detail, color }) {
  return <article className="landings-kpi" style={{ '--kpi-color': color }}>
    <span className="landings-kpi-icon"><Icon /></span>
    <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    <div className="landings-kpi-spark"><i /><i /><i /><i /><i /></div>
  </article>
}

function LandingRow({ item, onAction, onOpen }) {
  const meta = templateMeta(item.templateId)
  const conversion = getConversion(item)
  return <article className="landing-row" onClick={() => onOpen(item)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item) } }}>
    <LandingThumb item={item} />
    <div className="landing-row-main">
      <div className="landing-row-title"><strong>{item.name}</strong><StatusBadge status={item.external ? 'external' : item.status} /></div>
      <span className="landing-row-url">{item.external ? item.url : item.slug ? `/l/${item.slug}` : 'Crea una URL para activar esta landing'}</span>
      <div className="landing-row-meta"><span style={{ '--meta-color': meta.color }}><i />{item.external ? 'Web externa' : meta.label}</span><span><RiGlobalLine /> {item.campaignName}</span></div>
    </div>
    <div className="landing-row-date"><span>Última actualización</span><strong>{item.updatedAt}</strong><small>{item.updatedBy}</small></div>
    <div className="landing-row-leads"><strong>{formatNumber(item.leads)}</strong><span>{item.external ? 'Métricas no conectadas' : `${formatNumber(item.meetings)} reuniones de campaña`}</span></div>
    <div className="landing-row-conversion"><strong>{formatPercent(conversion)}</strong><span>{Number.isFinite(item.visits) ? `${formatNumber(item.visits)} visitas medidas` : item.external ? 'Sin medición' : 'Aún sin visitas medidas'}</span></div>
    <div className="landing-row-actions">
      <button aria-label={`Abrir ${item.name}`} title="Abrir landing" onClick={event => { event.stopPropagation(); onAction('open', item) }}><RiExternalLinkLine /></button>
      <button aria-label={`Editar ${item.name}`} title="Editar landing" onClick={event => { event.stopPropagation(); onAction('edit', item) }}><RiEditLine /></button>
      <button aria-label={`Más acciones para ${item.name}`} title="Más acciones" onClick={event => { event.stopPropagation(); onAction('menu', item) }}><RiMore2Line /></button>
    </div>
  </article>
}

function PerformanceRail({ items, onNavigate }) {
  const campaignItems = items.filter(item => !item.external)
  const landingItems = campaignItems.filter(item => item.slug)
  const published = items.filter(item => item.status === 'published').length
  const trackedItems = landingItems.filter(item => Number.isFinite(item.visits))
  const leads = campaignItems.reduce((total, item) => total + item.leads, 0)
  const visits = trackedItems.reduce((total, item) => total + item.visits, 0)
  const trackedLeads = trackedItems.reduce((total, item) => total + item.leads, 0)
  const meetings = campaignItems.reduce((total, item) => total + item.meetings, 0)
  const conversion = visits > 0 ? (trackedLeads / visits) * 100 : null
  const draft = landingItems.find(item => item.status === 'draft')
  const recommendations = [
    { text: draft ? `Completa y publica “${draft.name}”.` : 'Revisa el estado de tus campañas de captación.', route: draft ? `/campanas/${draft.sourceId}` : '/campanas' },
    { text: conversion !== null ? `La conversión medida es ${formatPercent(conversion)}. Revisa el recorrido completo.` : 'Activa el tracking de visitas para poder medir conversión.', route: '/funnels' },
    { text: meetings ? `${formatNumber(meetings)} reuniones están registradas en estas campañas.` : 'Todavía no hay reuniones registradas en estas campañas.', route: '/funnels' },
  ]
  return <aside className="landings-rail">
    <section className="landings-rail-panel performance-rail-panel">
      <div className="landings-panel-heading"><div><h2>Rendimiento global</h2><span>Datos disponibles en tus campañas</span></div><RiBarChartGroupedLine /></div>
      <div className="landings-rail-score"><span>Conversión medida</span><strong>{formatPercent(conversion)}</strong><em>{published} publicadas</em></div>
      <div className="landings-tracking-state"><span>Tracking de visitas</span><strong>{trackedItems.length} de {landingItems.length}</strong><small>{landingItems.length ? 'landings con datos de visitas' : 'No hay landings publicadas o en borrador'}</small></div>
      <div className="landings-rail-metrics"><span><small>Visitas medidas</small><strong>{trackedItems.length ? formatNumber(visits) : '—'}</strong></span><span><small>Leads de campaña</small><strong>{formatNumber(leads)}</strong></span></div>
      <button className="landing-link-button" onClick={() => onNavigate('/funnels')}>Abrir Funnels <RiArrowRightLine /></button>
    </section>
    <section className="landings-rail-panel">
      <div className="landings-panel-heading"><div><h2>Acciones recomendadas</h2><span>Para mejorar la captación</span></div><RiSparkling2Line /></div>
      <div className="landing-recommendations">{recommendations.map((recommendation, index) => <button key={recommendation.text} onClick={() => onNavigate(recommendation.route)}><span className={`recommendation-icon tone-${index}`}><RiRocketLine /></span><span>{recommendation.text}</span><RiArrowRightLine /></button>)}</div>
      <button className="landing-link-button" onClick={() => onNavigate('/campanas')}>Gestionar campañas <RiArrowRightLine /></button>
    </section>
    <section className="landings-rail-panel landing-help-panel"><span className="landing-help-icon"><RiSettings3Line /></span><div><strong>De campaña a cliente</strong><p>Conecta oferta, landing y seguimiento para medir el recorrido completo.</p><button onClick={() => onNavigate('/campanas')}>Abrir campañas <RiArrowRightLine /></button></div></section>
  </aside>
}

function LandingModal({ mode, item, onClose, onSave, saving }) {
  const initial = mode === 'import'
    ? { name: item?.name || '', campaignName: item?.campaignName || '', url: item?.url || '' }
    : { name: item?.name || '', campaignName: item?.campaignName || '', slug: item?.slug || '', templateId: item?.templateId || 'generic-v1', offer: item?.offer || '', leadMagnet: item?.leadMagnet || '', adCopy: item?.adCopy || '' }
  const [form, setForm] = useState(initial)
  const isImport = mode === 'import'
  const isEdit = mode === 'edit'
  function setField(field, value) { setForm(previous => ({ ...previous, [field]: value })) }
  function submit(event) {
    event.preventDefault()
    if (!form.name.trim() || (isImport ? !form.url.trim() : !form.slug.trim())) return
    onSave({ ...form, name: form.name.trim(), campaignName: form.campaignName.trim() })
  }
  return <div className="landings-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="landings-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="landing-modal-title">
      <header className="landings-modal-head"><div><span>{isImport ? 'Añadir propiedad' : isEdit ? 'Editar experiencia' : 'Nuevo espacio de captación'}</span><h2 id="landing-modal-title">{isImport ? 'Importar sitio web' : isEdit ? 'Editar landing' : 'Crear nueva landing'}</h2><p>{isImport ? 'Añade una web externa para tenerla localizada junto a tus landings.' : 'Define la base de la experiencia y deja lista su URL pública.'}</p></div><button type="button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button></header>
      {isImport ? <div className="landings-form-grid"><label className="full">Nombre visible<input autoFocus value={form.name} onChange={event => setField('name', event.target.value)} placeholder="Ej. Web corporativa" /></label><label className="full">URL del sitio<input type="url" value={form.url} onChange={event => setField('url', event.target.value)} placeholder="https://tuempresa.com" /></label><label className="full">Campaña asociada <input value={form.campaignName} onChange={event => setField('campaignName', event.target.value)} placeholder="Ej. Presencia de marca" /></label></div> : <div className="landings-form-grid"><label>Nombre de la landing<input autoFocus value={form.name} onChange={event => setField('name', event.target.value)} placeholder="Ej. Consulta inicial" /></label><label>Campaña asociada<input value={form.campaignName} onChange={event => setField('campaignName', event.target.value)} placeholder="Ej. Servicios legales — Mayo" /></label><label>Slug público<input value={form.slug} onChange={event => setField('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="consulta-inicial" /><small>Se verá en /l/{form.slug || 'tu-slug'}</small></label><label>Plantilla<select value={form.templateId} onChange={event => setField('templateId', event.target.value)}>{Object.entries(TEMPLATE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label} · {meta.kind}</option>)}</select></label><label className="full">Oferta principal<input value={form.offer} onChange={event => setField('offer', event.target.value)} placeholder="Consulta inicial gratuita" /></label><label className="full">Lead magnet <input value={form.leadMagnet} onChange={event => setField('leadMagnet', event.target.value)} placeholder="Guía, checklist o recurso gratuito" /></label><label className="full">Copy de captación<textarea rows="3" value={form.adCopy} onChange={event => setField('adCopy', event.target.value)} placeholder="Explica qué conseguirá la persona y cuál es el siguiente paso." /></label></div>}
      <footer className="landings-modal-actions"><button type="button" className="landing-button ghost" onClick={onClose}>Cancelar</button><button type="submit" className="landing-button primary" disabled={saving}>{saving ? 'Guardando…' : isImport ? 'Añadir sitio' : isEdit ? 'Guardar cambios' : 'Crear landing'} <RiArrowRightLine /></button></footer>
    </form>
  </div>
}

export default function LandingsPage() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [externalWebs, setExternalWebs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState('list')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [openMenu, setOpenMenu] = useState(null)
  const [integrity, setIntegrity] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [attention, setAttention] = useState([])
  const [performance, setPerformance] = useState([])
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [variants, setVariants] = useState([])
  const [experiment, setExperiment] = useState(null)
  const [variantBusy, setVariantBusy] = useState(false)
  const [autonomy, setAutonomy] = useState(null)
  const [report, setReport] = useState(null)

  useEffect(() => {
    setExternalWebs(readExternalWebs())
    loadLandings()
  }, [])

  // Enlace profundo desde Ads: el diagnóstico "anuncio correcto, landing
  // deficiente" abre esta página con el detalle ya cargado (landings.md §11).
  useEffect(() => {
    const landingKey = searchParams.get('landing')
    if (landingKey) openDetail(landingKey)
    // Solo al montar con el parámetro: reabrirlo en cada render impediría
    // cerrar el detalle.
  }, [])

  async function loadLandings() {
    setLoading(true)
    setLoadError('')
    try {
      const [response, landingsResponse] = await Promise.all([
        apiFetch('/api/campaigns?limit=100'),
        // La telemetría es un dato accesorio para el listado: si su petición
        // falla, las landings se siguen mostrando sin métricas inventadas.
        apiFetch('/api/landings/overview').catch(() => ({ ok: false })),
      ])
      if (!response.ok) throw new Error('No se pudieron cargar las campañas')
      const data = await response.json()
      if (!Array.isArray(data?.items)) throw new Error('La respuesta de campañas no tiene el formato esperado')
      const landingsData = landingsResponse.ok ? await landingsResponse.json() : null
      const telemetryByCampaign = new Map((landingsData?.items || []).map(item => [item.campaignId, item]))
      setIntegrity(landingsData?.integrity ?? null)
      // Enlace profundo desde /ads por campaña: allí se conoce el id de
      // campaña, no la `landingKey`, así que la resolución se hace aquí una
      // vez cargados los datos.
      const fromCampaign = searchParams.get('campaign')
      if (fromCampaign) {
        const match = (landingsData?.items || []).find(item => item.campaignId === fromCampaign)
        if (match?.landingKey) openDetail(match.landingKey)
        else notify('Esa campaña todavía no tiene landing con telemetría')
      }
      setAttention(landingsData?.attention ?? [])
      // El ranking llega ya ordenado por el backend: quién produce compradores
      // no lo decide el orden en que se crearon las campañas.
      const order = new Map((landingsData?.ranking || []).map((campaignId, index) => [campaignId, index]))
      setPerformance((landingsData?.items || [])
        .filter(item => item.snapshot)
        .sort((a, b) => (order.get(a.campaignId) ?? 999) - (order.get(b.campaignId) ?? 999)))
      setItems(data.items.map((campaign, index) => {
        const telemetry = telemetryByCampaign.get(campaign.id)
        return normalizeCampaign({
          ...campaign,
          // `undefined` cuando no hay snapshot: sin medición, no cero visitas.
          trackedVisits: telemetry?.snapshot?.visits ?? undefined,
          snapshotLeads: telemetry?.snapshot?.leads ?? null,
          telemetryState: telemetry?.telemetry ?? 'pending',
        }, index)
      }))
    } catch (error) {
      setItems([])
      setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las campañas')
    } finally {
      setLoading(false)
    }
  }

  const allItems = useMemo(() => [...items, ...externalWebs], [externalWebs, items])
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return allItems.filter(item => {
      const matchesFilter = filter === 'all' || (filter === 'external' ? item.external : item.status === filter) || (filter === 'none' && item.status === 'none')
      const matchesTemplate = templateFilter === 'all' || item.templateId === templateFilter
      const matchesSearch = !normalizedSearch || `${item.name} ${item.campaignName} ${item.slug} ${item.url || ''}`.toLowerCase().includes(normalizedSearch)
      return matchesFilter && matchesTemplate && matchesSearch
    }).sort((a, b) => {
      if (sort === 'leads') return (b.leads ?? -1) - (a.leads ?? -1)
      if (sort === 'conversion') return (getConversion(b) ?? -1) - (getConversion(a) ?? -1)
      return a.name.localeCompare(b.name, 'es')
    })
  }, [allItems, filter, search, sort, templateFilter])

  const metrics = useMemo(() => {
    const published = allItems.filter(item => item.status === 'published').length
    const campaignItems = allItems.filter(item => !item.external)
    const trackedItems = campaignItems.filter(item => item.slug && Number.isFinite(item.visits))
    const visits = trackedItems.reduce((total, item) => total + item.visits, 0)
    const trackedLeads = trackedItems.reduce((total, item) => total + item.leads, 0)
    const leads = campaignItems.reduce((total, item) => total + item.leads, 0)
    const conversion = visits > 0 ? (trackedLeads / visits) * 100 : null
    return { published, visits, leads, conversion, trackedCount: trackedItems.length }
  }, [allItems])

  const featured = allItems.find(item => item.status === 'published') || allItems.find(item => item.slug) || allItems[0]

  function notify(message) { setNotice(message); window.setTimeout(() => setNotice(''), 2800) }
  async function loadVariants(landingKey) {
    const response = await apiFetch(`/api/landings/variants?landingKey=${encodeURIComponent(landingKey)}`)
    if (!response.ok) return
    const data = await response.json()
    setVariants(data.items || [])

    // Solo hay un experimento activo por landing (§10): dos a la vez harían
    // que ninguno de los dos significara nada.
    const active = (data.items || []).find(variant => variant.status === 'active' && variant.experimentId)
    if (!active) return setExperiment(null)
    const results = await apiFetch(`/api/landings/experiments/${active.experimentId}`)
    setExperiment(results.ok ? await results.json() : null)
  }

  async function openDetail(landingKey) {
    if (!landingKey) return notify('Esta landing todavía no tiene telemetría')
    setDetail(null)
    setVariants([])
    setExperiment(null)
    setDetailLoading(true)
    try {
      const response = await apiFetch(`/api/landings/${landingKey}`)
      if (!response.ok) throw new Error('No se pudo cargar el detalle de la landing')
      setDetail(await response.json())
      // Variantes, autonomía e informe son lecturas independientes: si una
      // falla, el detalle no se queda sin dibujar.
      await Promise.all([
        loadVariants(landingKey),
        apiFetch(`/api/landings/autonomy?landingKey=${encodeURIComponent(landingKey)}`)
          .then(res => res.ok ? res.json() : null).then(setAutonomy).catch(() => setAutonomy(null)),
        apiFetch(`/api/landings/report/${encodeURIComponent(landingKey)}`)
          .then(res => res.ok ? res.json() : null).then(setReport).catch(() => setReport(null)),
      ])
    } catch (error) {
      setDetailLoading(false)
      notify(error.message)
      return
    }
    setDetailLoading(false)
  }

  /** Acciones de variante y experimento. El backend devuelve 409 con el motivo
   *  cuando la transición no está permitida; se muestra tal cual. */
  async function runVariantAction(path, options, successMessage) {
    if (!detail) return
    setVariantBusy(true)
    try {
      const response = await apiFetch(path, { method: 'POST', ...options })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'No se pudo completar la acción')
      notify(successMessage)
      await loadVariants(detail.landingKey)
    } catch (error) {
      notify(error.message)
    } finally {
      setVariantBusy(false)
    }
  }

  const variantActions = {
    generate: landingKey => runVariantAction('/api/landings/variants', { body: JSON.stringify({ landingKey }) }, 'Variante propuesta'),
    requestApproval: id => runVariantAction(`/api/landings/variants/${id}/request-approval`, {}, 'Enviada a aprobación'),
    start: id => runVariantAction(`/api/landings/variants/${id}/start`, { body: JSON.stringify({}) }, 'Experimento activado'),
    conclude: id => runVariantAction(`/api/landings/experiments/${id}/conclude`, {}, 'Experimento cerrado'),
    discard: id => runVariantAction(`/api/landings/variants/${id}/discard`, { body: JSON.stringify({}) }, 'Variante descartada'),
    runAutonomy: async () => {
      if (!detail) return
      setVariantBusy(true)
      try {
        const response = await apiFetch('/api/landings/autonomy/run', { method: 'POST' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No se pudo ejecutar la pasada')
        notify(data.shadowMode ? 'Pasada en sombra registrada: no se ha tocado ninguna landing' : 'Pasada de autonomía ejecutada')
        const refreshed = await apiFetch(`/api/landings/autonomy?landingKey=${encodeURIComponent(detail.landingKey)}`)
        setAutonomy(refreshed.ok ? await refreshed.json() : null)
      } catch (error) {
        notify(error.message)
      } finally {
        setVariantBusy(false)
      }
    },
  }
  async function refreshTelemetry() {
    setRefreshing(true)
    try {
      const response = await apiFetch('/api/landings/refresh', { method: 'POST' })
      if (!response.ok) throw new Error('No se pudo recalcular la telemetría')
      await loadLandings()
      notify('Telemetría recalculada')
    } catch (error) {
      notify(error.message)
    } finally {
      setRefreshing(false)
    }
  }
  function openItem(item) { if (item.external || item.slug) window.open(getLink(item), '_blank', 'noopener,noreferrer'); else setModal({ mode: 'edit', item }) }
  function action(type, item) {
    setOpenMenu(null)
    if (type === 'open') return openItem(item)
    if (type === 'edit') return setModal({ mode: item.external ? 'import' : 'edit', item })
    if (type === 'menu') return setOpenMenu(item.id)
  }
  async function copyLink(item) {
    const link = getLink(item)
    if (!link) return notify('Añade un slug para disponer de un enlace público')
    try { await navigator.clipboard.writeText(link); notify('Enlace copiado al portapapeles') } catch { notify('No se pudo copiar el enlace') }
  }
  async function saveLanding(form) {
    setSaving(true)
    try {
      if (modal.mode === 'import') {
        const next = { ...modal.item, ...form, id: modal.item?.id || `external-${Date.now()}`, external: true, status: 'external', updatedAt: 'Actualizado ahora', templateId: 'generic-v1', leads: null, visits: null, meetings: null, image: FALLBACK_IMAGES[1] }
        const nextWebs = modal.item ? externalWebs.map(item => item.id === next.id ? next : item) : [next, ...externalWebs]
        setExternalWebs(nextWebs)
        writeExternalWebs(nextWebs)
        setModal(null)
        notify(modal.item ? 'Sitio web actualizado' : 'Sitio web añadido a tu espacio')
        return
      }
      const assets = { ...(modal.item?.assets || {}), title: form.name, offer: form.offer, leadMagnet: form.leadMagnet, adCopy: form.adCopy, landingTemplateId: form.templateId }
      if (modal.mode === 'create') {
        const response = await apiFetch('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: form.campaignName || form.name, objective: form.adCopy, landingSlug: form.slug, adAssets: assets }) })
        if (!response.ok) throw new Error('No se pudo crear la landing')
        const campaign = await response.json()
        setItems(previous => [normalizeCampaign({ ...campaign, adAssets: assets, landingSlug: form.slug }, previous.length), ...previous])
      } else if (!modal.item.external) {
        const response = await apiFetch(`/api/campaigns/${modal.item.sourceId || modal.item.id}/landing`, { method: 'PUT', body: JSON.stringify({ landingSlug: form.slug, adAssets: assets }) })
        if (!response.ok) throw new Error('No se pudo guardar la landing')
        setItems(previous => previous.map(item => item.id === modal.item.id ? { ...item, ...form, slug: form.slug, templateId: form.templateId, assets, updatedAt: 'Actualizado ahora' } : item))
      }
      setModal(null)
      notify(modal.mode === 'create' ? 'Landing creada como borrador' : 'Landing actualizada correctamente')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setSaving(false)
    }
  }
  async function toggleStatus(item) {
    if (item.external) return notify('Las webs externas no permiten cambiar estado desde campañas')
    const nextStatus = item.status === 'published' ? 'paused' : 'active'
    const response = await apiFetch(`/api/campaigns/${item.sourceId || item.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus }) })
    if (!response.ok) return notify('No se pudo actualizar el estado')
    setItems(previous => previous.map(current => current.id === item.id ? { ...current, status: nextStatus === 'active' ? 'published' : 'draft' } : current))
    notify(nextStatus === 'active' ? 'Landing publicada' : 'Landing pausada')
  }

  if (loading) return <main className="dark-scroll landings-page landings-loading"><div className="landings-loading-orb"><RiGlobalLine /></div><strong>{locale === 'en' ? 'Loading your landing pages' : 'Cargando tus landings'}</strong><span>{locale === 'en' ? 'Connecting campaigns, websites and metrics…' : 'Conectando campañas, webs y métricas…'}</span></main>

  const tabs = [{ id: 'all', label: 'Todas', count: allItems.length }, { id: 'published', label: 'Publicadas', count: allItems.filter(item => item.status === 'published').length }, { id: 'draft', label: 'Borradores', count: allItems.filter(item => item.status === 'draft').length }, { id: 'none', label: 'Sin landing', count: allItems.filter(item => item.status === 'none').length }, { id: 'external', label: 'Webs externas', count: externalWebs.length }]

  return <main className="dark-scroll landings-page" onClick={() => openMenu && setOpenMenu(null)}>
    <header className="landings-header">
      <div className="landings-heading"><span className="landings-brand-icon"><RiGlobalLine /></span><div><h1>Landings &amp; webs</h1><p>{locale === 'en' ? 'Turn campaign interest into measurable opportunities.' : 'Convierte el interés de tus campañas en oportunidades medibles.'}</p></div></div>
      <div className="landings-header-actions"><button className="landing-button ghost" onClick={() => setModal({ mode: 'import', item: null })}><RiUploadCloud2Line /> {locale === 'en' ? 'Import URL' : 'Importar URL'}</button><button className="landing-button primary" onClick={() => setModal({ mode: 'create', item: null })}><RiAddLine /> {locale === 'en' ? 'New landing page' : 'Nueva landing'} <RiArrowDownSLine /></button></div>
    </header>
    <CaptureJourney active="convert" />
    <IntegrityBand integrity={integrity} onRefresh={refreshTelemetry} refreshing={refreshing} />
    <AttentionRequired diagnoses={attention} onOpen={openDetail} />
    {loadError ? <div className="landings-inline-alert" role="alert"><RiRefreshLine /><span><strong>No se han podido cargar las campañas.</strong> No se muestran datos de referencia ni métricas simuladas.</span><button onClick={loadLandings}>Reintentar</button></div> : null}
    {featured ? <section className="landings-featured">
      <div className="landings-featured-copy"><div className="landings-featured-top"><StatusBadge status={featured.external ? 'external' : featured.status} /><span>Landing destacada</span></div><h2>{featured.name}</h2><p>{featured.adCopy || 'Configura la oferta y el siguiente paso de esta experiencia de captación.'}</p><div className="landings-featured-url"><RiGlobalLine /> {featured.external ? featured.url : featured.slug ? `/l/${featured.slug}` : 'URL pública pendiente'} <button onClick={() => copyLink(featured)} aria-label="Copiar enlace" disabled={!getLink(featured)}><RiFileCopyLine /></button></div><div className="landings-featured-actions"><button className="landing-button primary" onClick={() => openItem(featured)}>{getLink(featured) ? <RiExternalLinkLine /> : <RiEditLine />} {getLink(featured) ? 'Abrir landing' : 'Configurar landing'}</button><button className="landing-button ghost" onClick={() => setModal({ mode: featured.external ? 'import' : 'edit', item: featured })}><RiEditLine /> Editar</button><button className="landing-button ghost" onClick={() => copyLink(featured)} disabled={!getLink(featured)}><RiFileCopyLine /> Copiar enlace</button></div></div>
      <div className="landings-featured-media"><LandingThumb item={featured} featured /><div className="landings-featured-metric"><span>{featured.external ? 'Métricas' : 'Leads de campaña'}</span><strong>{formatNumber(featured.leads)}</strong><em>{featured.external ? 'No conectadas' : `${formatPercent(getConversion(featured))} conversión medida`}</em></div></div>
    </section> : null}
    <section className="landings-kpi-row" aria-label="Resumen de landings"><KpiCard icon={RiLayoutGridLine} label="Landings activas" value={loadError ? '—' : metrics.published} detail="publicadas ahora" color="#8b5cf6" /><KpiCard icon={RiEyeLine} label="Visitas medidas" value={loadError || !metrics.trackedCount ? '—' : formatNumber(metrics.visits)} detail={metrics.trackedCount ? `${metrics.trackedCount} con tracking` : 'tracking pendiente'} color="#22d3ee" /><KpiCard icon={RiTeamLine} label="Leads de campaña" value={loadError ? '—' : formatNumber(metrics.leads)} detail="registrados en campañas vinculadas" color="#34d399" /><KpiCard icon={RiBarChartGroupedLine} label="Conversión medida" value={loadError ? '—' : formatPercent(metrics.conversion)} detail="solo donde hay visitas" color="#ec4899" /></section>
    <EconomicRanking items={performance} onOpen={openDetail} />
    <section className="landings-workspace">
      <div className="landings-list-panel">
        <div className="landings-tabs" role="tablist">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={filter === tab.id} className={filter === tab.id ? 'active' : ''} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</div>
        <div className="landings-toolbar"><div className="landings-search"><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar landing, campaña o URL…" aria-label="Buscar landing" /></div><div className="landings-toolbar-actions"><label><RiFilter3Line /><select value={templateFilter} onChange={event => setTemplateFilter(event.target.value)} aria-label="Filtrar por plantilla"><option value="all">Todas las plantillas</option>{Object.entries(TEMPLATE_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label><label><RiTimeLine /><select value={sort} onChange={event => setSort(event.target.value)} aria-label="Ordenar landings"><option value="updated">Por nombre</option><option value="leads">Más leads</option><option value="conversion">Mejor conversión</option></select></label><div className="landings-view-switcher"><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="Vista lista" aria-pressed={view === 'list'}><RiListCheck /></button><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Vista cuadrícula" aria-pressed={view === 'grid'}><RiLayoutGridLine /></button></div></div></div>
        {filteredItems.length ? <div className={`landings-list${view === 'grid' ? ' grid-view' : ''}`}>{filteredItems.map(item => view === 'list' ? <LandingRow key={item.id} item={item} onOpen={openItem} onAction={action} /> : <article className="landing-grid-card" key={item.id} onClick={() => openItem(item)} tabIndex="0" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openItem(item) } }}><LandingThumb item={item} /><div className="landing-grid-card-copy"><div><strong>{item.name}</strong><StatusBadge status={item.external ? 'external' : item.status} /></div><span>{item.campaignName}</span><div><b>{formatNumber(item.leads)}</b><small> leads de campaña</small><em>{formatPercent(getConversion(item))}</em></div></div><button className="landing-grid-edit" aria-label={`Editar ${item.name}`} onClick={event => { event.stopPropagation(); setModal({ mode: item.external ? 'import' : 'edit', item }) }}><RiEditLine /></button></article>)}</div> : <div className={`landings-empty${loadError && !allItems.length ? ' error' : ''}`} role={loadError && !allItems.length ? 'alert' : 'status'}><span>{loadError && !allItems.length ? <RiRefreshLine /> : allItems.length ? <RiSearchLine /> : <RiGlobalLine />}</span><h3>{loadError && !allItems.length ? 'No pudimos cargar tus landings' : allItems.length ? 'No hay resultados con estos filtros' : 'Aún no tienes campañas ni landings'}</h3><p>{loadError && !allItems.length ? 'Reintenta la conexión. Tus datos no se han sustituido por contenido demo.' : allItems.length ? 'Ajusta la búsqueda o limpia los filtros para volver a ver tus propiedades.' : 'Crea una landing vinculada a una campaña para empezar a captar y medir oportunidades.'}</p><div className="landings-empty-actions">{loadError && !allItems.length ? <button className="landing-button primary" onClick={loadLandings}><RiRefreshLine /> Reintentar</button> : allItems.length ? <button className="landing-button ghost" onClick={() => { setSearch(''); setFilter('all'); setTemplateFilter('all') }}>Limpiar filtros</button> : <><button className="landing-button primary" onClick={() => setModal({ mode: 'create', item: null })}><RiAddLine /> Crear landing</button><button className="landing-button ghost" onClick={() => navigate('/campanas')}>Ver campañas <RiArrowRightLine /></button></>}</div></div>}
        <footer className="landings-list-footer"><span>Mostrando <strong>{filteredItems.length}</strong> de {allItems.length} propiedades</span><span className={loadError ? 'sync-error' : externalWebs.length ? 'sync-partial' : ''}>{loadError ? <RiRefreshLine /> : <RiCheckLine />} {loadError ? 'Campañas sin sincronizar' : externalWebs.length ? 'Campañas sincronizadas · webs externas locales' : 'Datos sincronizados con campañas'}</span></footer>
      </div>
      <PerformanceRail items={allItems} onNavigate={navigate} />
    </section>
    {openMenu && <div className="landing-context-menu" onClick={event => event.stopPropagation()}><button onClick={() => { const item = allItems.find(current => current.id === openMenu); if (item) copyLink(item); setOpenMenu(null) }}><RiFileCopyLine /> Copiar enlace</button><button onClick={() => { const item = allItems.find(current => current.id === openMenu); if (item) setModal({ mode: item.external ? 'import' : 'edit', item }); setOpenMenu(null) }}><RiEditLine /> Editar landing</button><button onClick={() => { const item = allItems.find(current => current.id === openMenu); if (item) toggleStatus(item); setOpenMenu(null) }}><RiPauseCircleLine /> Cambiar estado</button><button className="danger" onClick={() => { setOpenMenu(null); notify('La eliminación requiere confirmación desde la configuración') }}><RiDeleteBinLine /> Eliminar</button></div>}
    {notice && <div className="landings-toast" role="status"><RiCheckLine />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><RiCloseLine /></button></div>}
    {modal && <LandingModal mode={modal.mode} item={modal.item} onClose={() => setModal(null)} onSave={saveLanding} saving={saving} />}
    {(detail || detailLoading) && <LandingDetail
      detail={detail}
      loading={detailLoading}
      variants={variants}
      experiment={experiment}
      busy={variantBusy}
      actions={variantActions}
      autonomy={autonomy}
      report={report}
      onClose={() => { setDetail(null); setDetailLoading(false); setVariants([]); setExperiment(null); setAutonomy(null); setReport(null) }}
    />}
  </main>
}
