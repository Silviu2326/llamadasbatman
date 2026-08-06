import { useState } from 'react'
import { RiAlertLine, RiCheckboxCircleLine, RiCheckLine, RiCloseLine, RiErrorWarningLine, RiEyeLine, RiInformationLine } from 'react-icons/ri'
import { COHORT_LABEL, SIGNAL_LABEL } from './AdsFunnel'

// Tarjeta de decisión de docs/vendrava/ads.md §4.6. Cada observación debe
// contestar qué, por qué, con qué datos y qué riesgo tiene.
//
// Aprobar NO ejecuta nada en Meta: registra la acción con sus guardarraíles y
// su compensación, y la deja pendiente. La ejecución es la Fase 4. Rechazar
// exige motivo, porque en N1 es el único aprendizaje que recoge el sistema.

const SEVERITY = {
  critical: { Icon: RiErrorWarningLine, label: 'Prioridad', tone: 'bad' },
  warning: { Icon: RiAlertLine, label: 'Atención', tone: 'warn' },
  info: { Icon: RiInformationLine, label: 'Contexto', tone: 'info' },
}

const CONFIDENCE_LABEL = { high: 'alta', medium: 'media', low: 'baja' }

function formatCents(cents) {
  if (cents == null) return 'sin medición'
  return `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/** Solo las claves que un humano puede interpretar sin abrir el código. */
const EVIDENCE_LABELS = {
  periodDays: ['Período', value => `${value} días`],
  spendCents: ['Gasto', formatCents],
  leads: ['Leads', value => value],
  contacted: ['Contactados', value => value],
  qualified: ['Cualificados', value => value],
  qualificationPct: ['Tasa de cualificación', value => `${value} %`],
  contactPct: ['Tasa de contacto', value => `${value} %`],
  cplCents: ['CPL', formatCents],
  cpqlCents: ['CPQL', formatCents],
  baselineCtr: ['CTR inicial', value => `${value} %`],
  recentCtr: ['CTR reciente', value => `${value} %`],
  ctrDropPct: ['Caída de CTR', value => `${value} %`],
  baselineFrequency: ['Frecuencia inicial', value => value?.toFixed?.(1) ?? value],
  recentFrequency: ['Frecuencia reciente', value => value?.toFixed?.(1) ?? value],
  landingViews: ['Visitas a la landing', value => value],
  landingConversionPct: ['Conversión de la landing', value => `${value} %`],
  peerConversionPct: ['Conversión de las demás', value => `${value} %`],
  dropPct: ['Diferencia', value => `${value} %`],
  spendCentsToday: ['Gasto de hoy', formatCents],
  dailyBudgetCapCents: ['Tope diario', formatCents],
  costPerLeadCents: ['CPL de hoy', formatCents],
  maxCostPerLeadCents: ['Límite de CPL', formatCents],
}

function DecisionCard({ decision, onDecide, busyId }) {
  const [open, setOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const busy = busyId === decision.id
  const severity = SEVERITY[decision.severity] ?? SEVERITY.info
  const { Icon } = severity
  const evidence = decision.evidence ?? {}
  const limitations = Array.isArray(evidence.limitations) ? evidence.limitations : []

  const rows = Object.entries(EVIDENCE_LABELS)
    .filter(([key]) => evidence[key] != null)
    .map(([key, [label, format]]) => [label, format(evidence[key])])

  return (
    <article className={`ads-decision is-${severity.tone}`}>
      <header>
        <span className="ads-decision-badge"><Icon /> {severity.label}</span>
        {decision.campaignName && <span className="ads-decision-campaign">{decision.campaignName}</span>}
      </header>
      <h3>{decision.title}</h3>
      <p className="ads-decision-body">{decision.explanation}</p>
      <p className="ads-decision-action"><b>Recomendación:</b> {decision.recommendation}</p>

      <dl className="ads-decision-meta">
        <div><dt>Confianza</dt><dd>{CONFIDENCE_LABEL[decision.confidence] ?? decision.confidence}</dd></div>
        <div><dt>Cohorte</dt><dd>{COHORT_LABEL[decision.cohortStatus] ?? decision.cohortStatus}</dd></div>
        <div><dt>Señal</dt><dd>{SIGNAL_LABEL[decision.signalUsed] ?? '—'}</dd></div>
      </dl>

      <div className="ads-decision-controls">
        <button className="ads-detail-link" onClick={() => setOpen(value => !value)}>
          <RiEyeLine /> {open ? 'Ocultar evidencia' : 'Ver evidencia'}
        </button>
        {onDecide && decision.hypotheticalAction && (
          <button
            className="ads-decision-approve"
            disabled={busy}
            onClick={() => onDecide(decision.id, 'approve')}
          >
            <RiCheckLine /> {busy ? 'Guardando…' : 'Aprobar'}
          </button>
        )}
        {onDecide && (
          <button className="ads-decision-reject" disabled={busy} onClick={() => setRejecting(value => !value)}>
            <RiCloseLine /> Rechazar
          </button>
        )}
      </div>

      {rejecting && (
        // El motivo es obligatorio: en N1 es el único aprendizaje que recoge
        // el sistema sobre por qué una regla se equivocó.
        <form
          className="ads-decision-reject-form"
          onSubmit={event => {
            event.preventDefault()
            if (reason.trim().length < 3) return
            onDecide(decision.id, 'reject', reason.trim())
          }}
        >
          <label htmlFor={`reject-${decision.id}`}>¿Por qué la rechazas?</label>
          <textarea
            id={`reject-${decision.id}`}
            rows="2"
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder="Ej.: la campaña acaba de arrancar y todavía no la juzgamos"
          />
          <div>
            <button type="button" className="ads-detail-link" onClick={() => setRejecting(false)}>Cancelar</button>
            <button type="submit" className="ads-decision-reject" disabled={busy || reason.trim().length < 3}>
              Confirmar rechazo
            </button>
          </div>
        </form>
      )}

      {open && (
        <div className="ads-decision-evidence">
          <p className="ads-decision-why">Por qué esa confianza: {decision.confidenceReason}</p>
          {rows.length > 0 && (
            <dl>
              {rows.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          )}
          {decision.hypotheticalAction && (
            // Modo sombra: se dice qué habría hecho la regla, nunca cuánto
            // habría ahorrado — nadie sabe qué habría pasado después (§10.2).
            <p className="ads-decision-shadow">
              En modo sombra, la regla habría propuesto <b>pausar {decision.hypotheticalAction.scope === 'ad_set' ? 'el ad set' : 'la campaña'}</b>.
              No se ha ejecutado ni se ha enviado nada a Meta.
            </p>
          )}
          {limitations.length > 0 && (
            <ul className="ads-decision-limits">
              {limitations.map(limitation => <li key={limitation}>{limitation}</li>)}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}

export default function AdsDecisions({ decisions, policy, onDecide, busyId }) {
  if (!decisions?.length) {
    return (
      <div className="ads-recommendation-empty">
        <RiCheckboxCircleLine />
        <p>Vendrava no ha detectado ningún problema que merezca una recomendación en este período.</p>
      </div>
    )
  }

  return (
    <div className="ads-decision-list">
      {decisions.map(decision => <DecisionCard key={decision.id} decision={decision} onDecide={onDecide} busyId={busyId} />)}
      <p className="ads-decision-policy">
        Autonomía <b>{policy?.autonomyLevel ?? 'N1'}</b> en modo <b>{policy?.mode ?? 'shadow'}</b>: Vendrava calcula y explica,
        la decisión es tuya. Aprobar deja la acción registrada y pendiente; no modifica nada en Meta todavía.
        {policy?.killSwitch === 'engaged' && ' La autonomía está parada por decisión del equipo.'}
      </p>
    </div>
  )
}
