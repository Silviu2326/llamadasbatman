import { RiFlaskLine } from 'react-icons/ri'
import { AdsExperiments } from '../../../components/ads/AdsAutonomy'

// Experimentos: dos formas de aprender (ads.md §12). La distribución ordinaria
// de Meta NO es un A/B: Meta entrega más impresiones a lo que predice que
// funcionará y eso introduce sesgo. La pantalla dice qué método usa cada
// prueba de verdad y no llama experimento a lo que no lo es.

export default function ExperimentosPanel({ overview }) {
  const experiments = overview.experiments ?? []

  return <div className="gs-stack">
    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>Cómo aprende Vendrava</h2>
          <p>Dos métodos con nombre propio; ninguno se confunde con la entrega ordinaria de Meta.</p>
        </div>
        <span className="gs-panel-icon"><RiFlaskLine /></span>
      </div>
      <div className="gs-panel-body">
        <div className="gs-cols-even">
          <div>
            <span className="gs-overline">Experimento</span>
            <p className="gs-muted">División aleatoria predefinida entre variantes, para estimar qué creatividad <b>causa</b> mejores resultados. Es más lento, pero la comparación es limpia.</p>
          </div>
          <div>
            <span className="gs-overline">Bandit / torneo</span>
            <p className="gs-muted">Explotación y exploración: la mayor parte del presupuesto (80–90 %) va a lo que mejor funciona y una parte pequeña (10–20 %) sigue probando alternativas, ajustando según volumen e incertidumbre.</p>
          </div>
        </div>
        <p className="gs-note">La distribución ordinaria de Meta no es ninguna de las dos cosas: Meta reparte impresiones según lo que predice que funcionará, y eso sesga cualquier comparación. Por eso aquí ninguna campaña se llama «A/B» si solo ha recibido esa entrega.</p>
      </div>
    </section>

    {experiments.length
      ? <AdsExperiments experiments={experiments} />
      : <section className="gs-panel">
        <div className="gs-empty">
          <span><RiFlaskLine /></span>
          <h3>Sin experimentos en marcha</h3>
          <p>Ahora mismo no se está probando nada con método experimental. Cuando haya volumen suficiente podrás lanzar un experimento o un torneo; hasta entonces no se muestra ningún resultado simulado.</p>
        </div>
      </section>}
  </div>
}
