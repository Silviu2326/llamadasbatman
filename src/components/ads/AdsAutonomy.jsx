import { RiArrowUpCircleLine, RiFlaskLine, RiLockLine, RiShutDownLine } from 'react-icons/ri'

// Autonomía por regla — Fase 5 de docs/xarly/ads.md.
//
// Se muestra regla a regla, no como un interruptor global, porque una regla
// demostrada no dice nada sobre otra recién escrita. Y cuando una no puede
// promocionarse, se enseña el motivo exacto en vez de un botón gris.

const RULE_LABEL = {
  spend_without_qualified: 'Gasto sin cualificados',
  creative_fatigue: 'Fatiga creativa',
  landing_underperforming: 'Landing deficiente',
  daily_budget_cap: 'Tope de gasto diario',
  high_cpl: 'CPL sobre el límite',
}

const LEVEL_COPY = {
  N1: { label: 'N1 · sugiere', tone: 'info' },
  N2: { label: 'N2 · aprobable', tone: 'warn' },
  N3: { label: 'N3 · canario', tone: 'ok' },
}

export default function AdsAutonomy({ rules, policy, onPromote, onDemote, onStop, busyKey }) {
  if (!rules?.length) return null
  const stopped = policy?.killSwitch === 'engaged'

  return (
    <section className="ads-autonomy">
      <div className="ads-section-head">
        <div>
          <h2>Autonomía por regla</h2>
          <p>Una regla solo sube de nivel cuando lo demuestra. Ante datos obsoletos o errores, baja sola.</p>
        </div>
        <button className={`ads-action ${stopped ? 'primary' : 'secondary'}`} onClick={() => onStop(!stopped)}>
          <RiShutDownLine /> {stopped ? 'Reanudar autonomía' : 'Parar autonomía'}
        </button>
      </div>

      {stopped && (
        <p className="ads-autonomy-stopped">
          <RiLockLine /> La autonomía está parada{policy?.killSwitchReason ? `: ${policy.killSwitchReason}` : ''}.
          Ninguna regla puede actuar mientras siga así.
        </p>
      )}

      <div className="ads-autonomy-list">
        {rules.map(rule => {
          const level = LEVEL_COPY[rule.currentLevel] ?? LEVEL_COPY.N1
          const busy = busyKey === rule.ruleKey
          return (
            <article key={rule.ruleKey} className={`ads-autonomy-rule is-${level.tone}`}>
              <header>
                <strong>{RULE_LABEL[rule.ruleKey] ?? rule.ruleKey}</strong>
                <span className={`ads-status is-${level.tone === 'ok' ? 'active' : level.tone === 'warn' ? 'paused' : 'draft'}`}>
                  {level.label}
                </span>
              </header>

              <dl className="ads-autonomy-stats">
                <div><dt>Observaciones</dt><dd>{rule.stats.raised}</dd></div>
                <div><dt>Aprobadas</dt><dd>{rule.stats.approved}</dd></div>
                <div><dt>Rechazadas</dt><dd>{rule.stats.rejected}</dd></div>
                <div><dt>Ejecutadas</dt><dd>{rule.stats.executed}</dd></div>
              </dl>

              {rule.eligibleFor ? (
                <button
                  className="ads-action primary"
                  disabled={busy || stopped}
                  onClick={() => onPromote(rule.ruleKey)}
                >
                  <RiArrowUpCircleLine /> {busy ? 'Promocionando…' : `Promover a ${rule.eligibleFor}`}
                </button>
              ) : (
                // El motivo concreto en vez de un botón gris: si no puede
                // subir, lo útil es saber qué falta para que suba.
                <ul className="ads-autonomy-blockers">
                  {rule.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
                </ul>
              )}

              {rule.currentLevel !== 'N1' && (
                <button className="ads-detail-link" disabled={busy} onClick={() => onDemote(rule.ruleKey)}>
                  Bajar a N1
                </button>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** Panel de experimentos: su trabajo principal es no mentir sobre qué son. */
export function AdsExperiments({ experiments }) {
  if (!experiments?.length) return null

  return (
    <section className="ads-experiments">
      <div className="ads-section-head">
        <div>
          <h2>Aprendizaje</h2>
          <p>Qué se está probando ahora mismo y con qué método.</p>
        </div>
        <RiFlaskLine />
      </div>
      <div className="ads-experiments-list">
        {experiments.map(experiment => (
          <article key={experiment.id}>
            <header>
              <strong>{experiment.name}</strong>
              {/* La §12 lo exige: no llamar A/B a lo que solo ha recibido
                  distribución ordinaria de Meta. */}
              <span className="ads-experiment-mode">{experiment.label}</span>
            </header>
            <p className="ads-experiment-hypothesis">{experiment.hypothesis}</p>
            <p className="ads-experiment-caveat">{experiment.caveat}</p>
            <div className="ads-experiment-variants">
              {experiment.variants?.map(variant => (
                <span key={variant.id}>{variant.label} · {variant.allocationPercent} %</span>
              ))}
            </div>
            {experiment.conclusion && <p className="ads-experiment-conclusion">{experiment.conclusion}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}
