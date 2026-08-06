import { useState } from 'react'
import {
  RiCheckLine,
  RiEyeOffLine,
  RiForbid2Line,
  RiPlayCircleLine,
  RiShieldKeyholeLine,
  RiStopCircleLine,
} from 'react-icons/ri'

/**
 * Sala de autonomía — `docs/vendrava/organico.md` §9 y fase 4 de §11.
 *
 * Lo que esta pantalla tiene que dejar claro, en este orden:
 *
 * 1. **Qué puede hacer Vendrava solo y qué no.** La lista de §9 es cerrada y se
 *    enseña entera, incluidos los tipos que todavía no tienen ejecución: un
 *    hueco silencioso se lee como "esto ya funciona".
 * 2. **Por qué está en el nivel en el que está.** Cada tipo dice qué le falta
 *    para promocionar y, si se degradó solo, por qué.
 * 3. **Qué se comprobó antes de cada decisión.** Los guardarraíles se enseñan
 *    todos, no solo el que bloqueó: quien aprueba tiene que ver el examen
 *    completo, no el suspenso.
 *
 * El freno de emergencia es el mismo que el de Ads y aquí solo se muestra: un
 * segundo botón de parada que parase la mitad del sistema sería peor que
 * ninguno.
 */

const LEVEL_COPY = {
  N1: { label: 'N1 · sugerir', detail: 'Vendrava calcula y explica; decide siempre una persona.' },
  N2: { label: 'N2 · aprobar', detail: 'Una persona aprueba cada acción concreta con un clic.' },
  N3: { label: 'N3 · automático', detail: 'Solo la lista cerrada de §9, con cooldown y freno.' },
}

const STATUS_COPY = {
  advisory: { label: 'Observación', tone: 'idle' },
  pending_approval: { label: 'Esperando aprobación', tone: 'warn' },
  shadow: { label: 'Modo sombra', tone: 'idle' },
  executed: { label: 'Ejecutada', tone: 'ok' },
  blocked: { label: 'Bloqueada', tone: 'bad' },
  rejected: { label: 'Rechazada', tone: 'idle' },
  approved: { label: 'Aprobada', tone: 'ok' },
  expired: { label: 'Caducada', tone: 'idle' },
}

function LevelBadge({ level }) {
  const copy = LEVEL_COPY[level] ?? LEVEL_COPY.N1
  return <span className={`organic-autonomy-level is-${level.toLowerCase()}`} title={copy.detail}>{copy.label}</span>
}

export default function OrganicAutonomy({ state, busy, onChangeLevel, onToggleShadow, onRun, onApprove, onReject, onPromote, onDemote }) {
  const [rejecting, setRejecting] = useState('')
  const [reason, setReason] = useState('')
  if (!state) return null

  const { config, killSwitch, dataQuality, kinds = [], decisions = [] } = state
  const stopped = Boolean(killSwitch?.enabled)

  return (
    <section id="organic-autonomy" className="organic-panel organic-autonomy">
      <header className="organic-panel-header">
        <div>
          <h2><span className="organic-panel-icon"><RiShieldKeyholeLine /></span>Sala de autonomía</h2>
          <p>Qué puede hacer Vendrava sin preguntar, qué se ha ganado ese permiso y qué se comprobó antes de cada acción.</p>
        </div>
        <span className="organic-panel-note">{state.policyVersion}</span>
      </header>

      {stopped && (
        <p className="organic-autonomy-stop" role="alert">
          <RiStopCircleLine /> La autonomía está parada para toda la organización
          {killSwitch.reason ? `: ${killSwitch.reason}` : '.'} El freno se comparte con Ads y se suelta desde allí.
        </p>
      )}

      <div className="organic-autonomy-controls">
        <label>
          <span>Nivel concedido</span>
          <select
            className="organic-control"
            value={config.level}
            disabled={busy || stopped}
            onChange={event => onChangeLevel(event.target.value)}
          >
            {Object.entries(LEVEL_COPY).map(([value, copy]) => <option key={value} value={value}>{copy.label}</option>)}
          </select>
          <small>{(LEVEL_COPY[config.level] ?? LEVEL_COPY.N1).detail}</small>
        </label>

        <label className="organic-autonomy-shadow">
          <span>Modo sombra</span>
          <button
            type="button"
            className={`organic-button ${config.shadowMode ? 'secondary' : 'ghost'}`}
            disabled={busy || stopped}
            onClick={() => onToggleShadow(!config.shadowMode)}
          >
            {config.shadowMode ? <><RiEyeOffLine /> Activado</> : <><RiPlayCircleLine /> Desactivado</>}
          </button>
          <small>
            {config.shadowMode
              ? 'N3 escribe lo que haría, sin hacerlo. No se puede salir de sombra con los datos en rojo.'
              : 'N3 ejecuta de verdad las acciones de la lista de §9.'}
          </small>
        </label>

        <div className="organic-autonomy-limits">
          <span>Guardarraíles</span>
          <ul>
            <li>Máximo {config.maxActionsPerDay} acciones al día</li>
            <li>{config.cooldownMinutes} min entre acciones del mismo tipo</li>
            <li>Cobertura mínima de atribución: {config.minAttributionCoveragePct} %</li>
            <li>
              Hoy: fuentes «{dataQuality?.status ?? 'sin medir'}»
              {dataQuality?.attributionCoveragePct != null
                ? ` · cobertura ${dataQuality.attributionCoveragePct} %`
                : ' · cobertura sin medir'}
            </li>
          </ul>
        </div>

        <button type="button" className="organic-button primary" disabled={busy} onClick={onRun}>
          <RiShieldKeyholeLine /> {busy ? 'Revisando…' : 'Revisar ahora'}
        </button>
      </div>

      <div className="organic-autonomy-kinds">
        {kinds.map(kind => (
          <article key={kind.kind} className={kind.executable ? '' : 'is-unavailable'}>
            <header>
              <strong>{kind.label}</strong>
              <LevelBadge level={kind.effectiveLevel} />
            </header>
            {!kind.executable && <p className="organic-autonomy-unavailable">Sin ejecución todavía: {kind.unavailableReason}</p>}
            {kind.degradedReason && <p className="organic-autonomy-degraded">Degradada sola: {kind.degradedReason}</p>}
            {kind.promotion?.blockers?.length
              ? <ul className="organic-autonomy-blockers">{kind.promotion.blockers.map(item => <li key={item}>{item}</li>)}</ul>
              : <p className="organic-autonomy-ready">Se ha ganado subir a {kind.promotion?.eligibleFor}.</p>}
            {/* Subir y bajar en la misma tarjeta: el camino de vuelta existía
                en el backend pero no en la pantalla, así que para retirar un
                permiso concreto había que usar el freno de emergencia, que
                para el sistema entero. */}
            {(kind.promotion?.eligibleFor || kind.effectiveLevel !== 'N1') && (
              <footer className="organic-autonomy-kind-actions">
                {kind.promotion?.eligibleFor && (
                  <button type="button" className="organic-button secondary" disabled={busy} onClick={() => onPromote(kind.kind)}>
                    Subir a {kind.promotion.eligibleFor}
                  </button>
                )}
                {kind.effectiveLevel !== 'N1' && onDemote && (
                  <button type="button" className="organic-button ghost" disabled={busy} onClick={() => onDemote(kind.kind)}>
                    Bajar permiso
                  </button>
                )}
              </footer>
            )}
          </article>
        ))}
      </div>

      {decisions.length > 0 && (
        <div className="organic-autonomy-decisions">
          <h3>Qué ha decidido Vendrava</h3>
          {decisions.map(decision => {
            const status = STATUS_COPY[decision.status] ?? STATUS_COPY.advisory
            const pending = ['advisory', 'pending_approval', 'shadow'].includes(decision.status)
            return (
              <article key={decision.id} className={`is-${status.tone}`}>
                <header>
                  <strong>{decision.title}</strong>
                  <span>{status.label}</span>
                  <LevelBadge level={decision.level} />
                </header>
                <p>{decision.explanation}</p>
                {decision.note && <p className="organic-autonomy-note">{decision.note}</p>}
                {decision.execution?.providerResponse && (
                  <p className="organic-autonomy-note"><RiCheckLine /> {decision.execution.providerResponse}</p>
                )}
                {decision.guardrails?.length > 0 && (
                  <ul className="organic-autonomy-guardrails">
                    {decision.guardrails.map(check => (
                      <li key={check.rule} className={check.passed ? 'is-ok' : 'is-bad'}>
                        {check.passed ? <RiCheckLine /> : <RiForbid2Line />} {check.detail}
                      </li>
                    ))}
                  </ul>
                )}
                {pending && (rejecting === decision.id ? (
                  <form
                    className="organic-rec-dismiss"
                    onSubmit={event => {
                      event.preventDefault()
                      if (reason.trim().length < 3) return
                      onReject(decision.id, reason.trim())
                      setRejecting('')
                      setReason('')
                    }}
                  >
                    <label htmlFor={`reject-${decision.id}`}>¿Por qué la rechazas?</label>
                    <textarea id={`reject-${decision.id}`} rows="2" value={reason} onChange={event => setReason(event.target.value)} placeholder="Ej.: la propiedad de Search Console está mal elegida" />
                    <div>
                      <button type="button" className="organic-link" onClick={() => setRejecting('')}>Cancelar</button>
                      <button type="submit" className="organic-button secondary" disabled={reason.trim().length < 3}>Confirmar</button>
                    </div>
                  </form>
                ) : (
                  <div className="organic-rec-actions">
                    <button type="button" className="organic-button primary" disabled={busy || stopped} onClick={() => onApprove(decision.id)}>
                      Aprobar y ejecutar
                    </button>
                    <button type="button" className="organic-link" onClick={() => setRejecting(decision.id)}>Rechazar</button>
                  </div>
                ))}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
