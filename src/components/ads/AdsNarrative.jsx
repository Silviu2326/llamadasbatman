import { RiFileTextLine } from 'react-icons/ri'

// Informe semanal narrado de docs/vendrava/ads.md §4.8. Existe desde la Fase 1,
// antes de que haya autonomía: es la forma de demostrar valor sin pedir
// permiso para actuar. El texto lo compone el backend con plantillas, no un
// LLM — un informe que puede alucinar una cifra no sirve para repartir
// presupuesto.

export default function AdsNarrative({ narrative }) {
  if (!narrative) return null

  return (
    <section className="ads-narrative">
      <div className="ads-section-head">
        <div>
          <h2>Informe del período</h2>
          <p>{narrative.headline}</p>
        </div>
        <RiFileTextLine />
      </div>
      <div className="ads-narrative-body">
        {narrative.sections.map(section => (
          <article key={section.key}>
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
