import { Link } from 'react-router-dom'
import { RiArrowRightLine, RiSparkling2Line } from 'react-icons/ri'
import AdsDecisions from '../../../components/ads/AdsDecisions'
import AdsPendingActions from '../../../components/ads/AdsPendingActions'
import AdsAutonomy from '../../../components/ads/AdsAutonomy'

// Decisiones: el circuito de gobierno. Recomendación → aprobación humana →
// acción pendiente → ejecución con guardarraíles → autonomía por regla.
// Aprobar no toca Meta: registra la acción; la ejecución revalida los
// guardarraíles en el servidor y puede devolver 409 con el motivo concreto.

export default function DecisionesPanel({ overview, plan, ui }) {
  const { t } = ui
  const data = overview.overview

  return <div className="gs-stack">
    <p className="ads-circuit"><span>{t('ads.decisiones.governance')}</span><small>{t('ads.decisiones.governanceText')}</small></p>

    {/* Cada observación contesta qué, por qué, con qué datos y qué riesgo
        tiene (ads.md §4.6). El vacío honesto lo pinta AdsDecisions. */}
    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>{t('ads.decisiones.title')}</h2>
          <p>{t('ads.decisiones.text')}</p>
        </div>
        <span className="gs-panel-icon"><RiSparkling2Line /></span>
      </div>
      <div className="gs-panel-body">
        <AdsDecisions
          decisions={data?.decisions}
          policy={data?.policy}
          onDecide={overview.decideOnRecommendation}
          busyId={overview.decidingId}
        />
      </div>
    </section>

    {/* Aprobadas por una persona y pendientes de ejecutar; compensables, no
        reversibles, y esa diferencia se enseña antes de pulsar. */}
    <AdsPendingActions
      actions={overview.pendingActions}
      onExecute={id => overview.runAction(id, 'execute')}
      onCompensate={id => overview.runAction(id, 'compensate')}
      busyId={overview.decidingId}
    />

    {/* Autonomía regla a regla: una regla demostrada no dice nada sobre otra
        recién escrita, así que no hay interruptor global de "modo auto". */}
    <AdsAutonomy
      rules={overview.rules}
      policy={data?.policy}
      onPromote={key => overview.changeRuleAutonomy(key, 'promote')}
      onDemote={key => overview.changeRuleAutonomy(key, 'demote')}
      onStop={overview.toggleAutonomyStop}
      busyKey={overview.busyRule}
    />

    {/* El registro de auditoría por campaña vive en su detalle: cada decisión
        aprobada, ejecutada o compensada queda anotada allí. */}
    <p className="gs-note">
      {t('ads.decisiones.note')}{' '}
      {plan.selectedId
        ? <Link className="gs-link" to={`/campanas/${plan.selectedId}`}>{t('ads.decisiones.openLog')} <RiArrowRightLine /></Link>
        : t('ads.decisiones.selectCampaign')}
    </p>
  </div>
}
