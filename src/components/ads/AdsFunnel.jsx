import { RiArrowRightSLine, RiFilterLine } from 'react-icons/ri'

// Embudo económico de docs/xarly/ads.md §4.4. Su trabajo no es enseñar
// números bonitos, sino dejar ver en qué paso concreto deja de avanzar el
// dinero, y decir hasta dónde llega hoy la señal fiable.

const SIGNAL_LABEL = {
  clic: 'Clic',
  lead: 'Lead',
  qualified_lead: 'Lead cualificado',
  opportunity: 'Oportunidad',
  sale: 'Venta',
}

const COHORT_LABEL = {
  mature: 'madura',
  maturing: 'madurando',
  insufficient: 'insuficiente',
}

export default function AdsFunnel({ funnel, deepestEligibleSignal, eligibilityReason, periodDays, cohortSummary }) {
  if (!funnel?.length) return null

  const measured = funnel.filter(step => step.value != null)
  const maxValue = measured.length ? Math.max(...measured.map(step => step.value)) : 0

  // El paso con peor conversión, saltando clic → lead: ese tramo es asunto de
  // la landing y estructuralmente siempre sería el más bajo.
  const leak = funnel
    .slice(2)
    .filter(step => step.conversionPct != null)
    .sort((left, right) => left.conversionPct - right.conversionPct)[0]

  return (
    <section className="ads-funnel">
      <div className="ads-section-head">
        <div>
          <h2>Embudo económico</h2>
          <p>Del clic al comprador, en los últimos {periodDays} días.</p>
        </div>
        <span className="ads-funnel-signal">
          <RiFilterLine /> Xarly evalúa hasta: <b>{SIGNAL_LABEL[deepestEligibleSignal] ?? 'sin señal'}</b>
        </span>
      </div>

      <ol className="ads-funnel-steps">
        {funnel.map((step, index) => {
          const width = step.value != null && maxValue > 0 ? Math.max(6, (step.value / maxValue) * 100) : 0
          const isLeak = leak && step.key === leak.key
          return (
            <li key={step.key} className={isLeak ? 'is-leak' : ''}>
              <div className="ads-funnel-label">
                <span>{step.label}</span>
                <strong>{step.value == null ? 'Sin medición' : step.value.toLocaleString('es-ES')}</strong>
              </div>
              <div className="ads-funnel-bar">
                <i style={{ width: `${width}%` }} />
              </div>
              {index > 0 && (
                <div className="ads-funnel-rate">
                  {step.conversionPct == null
                    ? <em>sin medición</em>
                    : <><RiArrowRightSLine />{step.conversionPct} %</>}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <footer className="ads-funnel-foot">
        {/* Meta optimiza a lead porque es la señal que puede medir; Xarly llega
            más lejos. Mostrar ambas evita la impresión de que discrepan. */}
        <p><b>Meta optimiza a:</b> Lead · <b>Xarly evalúa hasta:</b> {SIGNAL_LABEL[deepestEligibleSignal] ?? '—'}</p>
        {eligibilityReason && <p className="ads-funnel-reason">{eligibilityReason}</p>}
        {leak && (
          <p className="ads-funnel-leak">
            Mayor caída: <b>{leak.label.toLowerCase()}</b>, donde solo avanza el {leak.conversionPct} %.
          </p>
        )}
        {cohortSummary && <p className="ads-funnel-cohort">{cohortSummary}</p>}
      </footer>
    </section>
  )
}

export { COHORT_LABEL, SIGNAL_LABEL }
