import { useState } from 'react'
import {
  RiCheckLine,
  RiEyeOffLine,
  RiForbid2Line,
  RiPlayCircleLine,
  RiShieldKeyholeLine,
  RiStopCircleLine,
} from 'react-icons/ri'
import './organic-components.css'
import { useI18n } from '../../i18n'

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

const LEVELS = ['N1', 'N2', 'N3']
const levelCopy = (level, t) => {
  const key = LEVELS.includes(level) ? level : 'N1'
  return { label: t(`organic.autonomy.level.${key}`), detail: t(`organic.autonomy.level.${key}Detail`) }
}

const STATUS_TONE = { advisory: 'idle', pending_approval: 'warn', shadow: 'idle', executed: 'ok', blocked: 'bad', rejected: 'idle', approved: 'ok', expired: 'idle' }
const statusCopy = (status, t) => {
  const key = STATUS_TONE[status] ? status : 'advisory'
  return { label: t(`organic.autonomy.status.${key}`), tone: STATUS_TONE[key] }
}

function LevelBadge({ level }) {
  const { t } = useI18n()
  const copy = levelCopy(level, t)
  return <span className={`organic-autonomy-level is-${level.toLowerCase()}`} title={copy.detail}>{copy.label}</span>
}

export default function OrganicAutonomy({ state, busy, onChangeLevel, onToggleShadow, onRun, onApprove, onReject, onPromote, onDemote }) {
  const { t } = useI18n()
  const [rejecting, setRejecting] = useState('')
  const [reason, setReason] = useState('')
  if (!state) return null

  const { config, killSwitch, dataQuality, kinds = [], decisions = [] } = state
  const stopped = Boolean(killSwitch?.enabled)

  return (
    <section id="organic-autonomy" className="organic-panel organic-autonomy">
      <header className="organic-panel-header">
        <div>
          <h2><span className="organic-panel-icon"><RiShieldKeyholeLine /></span>{t('organic.autonomy.title')}</h2>
          <p>{t('organic.autonomy.intro')}</p>
        </div>
        <span className="organic-panel-note">{state.policyVersion}</span>
      </header>

      {stopped && (
        <p className="organic-autonomy-stop" role="alert">
          <RiStopCircleLine /> {t('organic.autonomy.stopped')}
          {killSwitch.reason ? `: ${killSwitch.reason}` : '.'} {t('organic.autonomy.stoppedShared')}
        </p>
      )}

      <div className="organic-autonomy-controls">
        <label>
          <span>{t('organic.autonomy.grantedLevel')}</span>
          <select
            className="organic-control"
            value={config.level}
            disabled={busy || stopped}
            onChange={event => onChangeLevel(event.target.value)}
          >
            {LEVELS.map(value => <option key={value} value={value}>{levelCopy(value, t).label}</option>)}
          </select>
          <small>{levelCopy(config.level, t).detail}</small>
        </label>

        <label className="organic-autonomy-shadow">
          <span>{t('organic.autonomy.shadowMode')}</span>
          <button
            type="button"
            className={`organic-button ${config.shadowMode ? 'secondary' : 'ghost'}`}
            disabled={busy || stopped}
            onClick={() => onToggleShadow(!config.shadowMode)}
          >
            {config.shadowMode ? <><RiEyeOffLine /> {t('organic.autonomy.enabled')}</> : <><RiPlayCircleLine /> {t('organic.autonomy.disabled')}</>}
          </button>
          <small>
            {config.shadowMode
              ? t('organic.autonomy.shadowOn')
              : t('organic.autonomy.shadowOff')}
          </small>
        </label>

        <div className="organic-autonomy-limits">
          <span>{t('organic.autonomy.guardrails')}</span>
          <ul>
            <li>{t('organic.autonomy.maxPerDay', { n: config.maxActionsPerDay })}</li>
            <li>{t('organic.autonomy.cooldown', { n: config.cooldownMinutes })}</li>
            <li>{t('organic.autonomy.minCoverage', { n: config.minAttributionCoveragePct })}</li>
            <li>
              {t('organic.autonomy.today', { status: dataQuality?.status ?? t('organic.autonomy.unmeasured') })}
              {dataQuality?.attributionCoveragePct != null
                ? t('organic.autonomy.coverage', { n: dataQuality.attributionCoveragePct })
                : t('organic.autonomy.coverageUnmeasured')}
            </li>
          </ul>
        </div>

        <button type="button" className="organic-button primary" disabled={busy} onClick={onRun}>
          <RiShieldKeyholeLine /> {busy ? t('organic.autonomy.reviewing') : t('organic.autonomy.reviewNow')}
        </button>
      </div>

      <div className="organic-autonomy-kinds">
        {kinds.map(kind => (
          <article key={kind.kind} className={kind.executable ? '' : 'is-unavailable'}>
            <header>
              <strong>{kind.label}</strong>
              <LevelBadge level={kind.effectiveLevel} />
            </header>
            {!kind.executable && <p className="organic-autonomy-unavailable">{t('organic.autonomy.noExecution', { reason: kind.unavailableReason })}</p>}
            {kind.degradedReason && <p className="organic-autonomy-degraded">{t('organic.autonomy.degraded', { reason: kind.degradedReason })}</p>}
            {kind.promotion?.blockers?.length
              ? <ul className="organic-autonomy-blockers">{kind.promotion.blockers.map(item => <li key={item}>{item}</li>)}</ul>
              : <p className="organic-autonomy-ready">{t('organic.autonomy.earned', { level: kind.promotion?.eligibleFor })}</p>}
            {/* Subir y bajar en la misma tarjeta: el camino de vuelta existía
                en el backend pero no en la pantalla, así que para retirar un
                permiso concreto había que usar el freno de emergencia, que
                para el sistema entero. */}
            {(kind.promotion?.eligibleFor || kind.effectiveLevel !== 'N1') && (
              <footer className="organic-autonomy-kind-actions">
                {kind.promotion?.eligibleFor && (
                  <button type="button" className="organic-button secondary" disabled={busy} onClick={() => onPromote(kind.kind)}>
                    {t('organic.autonomy.promote', { level: kind.promotion.eligibleFor })}
                  </button>
                )}
                {kind.effectiveLevel !== 'N1' && onDemote && (
                  <button type="button" className="organic-button ghost" disabled={busy} onClick={() => onDemote(kind.kind)}>
                    {t('organic.autonomy.demote')}
                  </button>
                )}
              </footer>
            )}
          </article>
        ))}
      </div>

      {decisions.length > 0 && (
        <div className="organic-autonomy-decisions">
          <h3>{t('organic.autonomy.decisions')}</h3>
          {decisions.map(decision => {
            const status = statusCopy(decision.status, t)
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
                    <label htmlFor={`reject-${decision.id}`}>{t('organic.autonomy.whyReject')}</label>
                    <textarea id={`reject-${decision.id}`} rows="2" value={reason} onChange={event => setReason(event.target.value)} placeholder={t('organic.autonomy.rejectPlaceholder')} />
                    <div>
                      <button type="button" className="organic-link" onClick={() => setRejecting('')}>{t('organic.autonomy.cancel')}</button>
                      <button type="submit" className="organic-button secondary" disabled={reason.trim().length < 3}>{t('organic.autonomy.confirm')}</button>
                    </div>
                  </form>
                ) : (
                  <div className="organic-rec-actions">
                    <button type="button" className="organic-button primary" disabled={busy || stopped} onClick={() => onApprove(decision.id)}>
                      {t('organic.autonomy.approveExecute')}
                    </button>
                    <button type="button" className="organic-link" onClick={() => setRejecting(decision.id)}>{t('organic.autonomy.reject')}</button>
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
