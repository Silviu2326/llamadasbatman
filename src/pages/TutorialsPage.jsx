import { useState } from 'react'
import {
  RiArrowRightSLine,
  RiBookReadLine,
  RiCheckLine,
  RiTimeLine,
} from 'react-icons/ri'
import { TUTORIALS } from './learningData'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import './learning.css'

export default function TutorialsPage({ sectionNavigation = null }) {
  const [selectedId, setSelectedId] = useState(TUTORIALS[0].id)
  const [completed, setCompleted] = useState({})
  const selected = TUTORIALS.find(item => item.id === selectedId) || TUTORIALS[0]
  const completedSteps = completed[selected.id] || []
  const progress = Math.round((completedSteps.length / selected.steps.length) * 100)
  const nextStepIndex = selected.steps.findIndex((_, index) => !completedSteps.includes(index))

  function toggleStep(stepIndex) {
    setCompleted(previous => {
      const current = previous[selected.id] || []
      const next = current.includes(stepIndex) ? current.filter(index => index !== stepIndex) : [...current, stepIndex]
      return { ...previous, [selected.id]: next }
    })
  }

  function handlePrimaryAction() {
    if (progress === 100) {
      setCompleted(previous => ({ ...previous, [selected.id]: [] }))
      return
    }
    toggleStep(nextStepIndex)
  }

  return (
    <main className="learn-page dark-scroll">
      <ProductPageHeader
        Icon={RiBookReadLine}
        title="Tutoriales"
        description="Rutas breves y prácticas para configurar Vendrava y dominar agentes, microapps y automatizaciones."
        navigation={sectionNavigation}
      />

      <section className="learn-layout" aria-label="Tutoriales disponibles">
        <div className="learn-main-column">
          <div className="learn-section-heading"><div><h2>Rutas recomendadas</h2><p>Empieza por lo que necesitas hoy y avanza paso a paso.</p></div><span className="learn-count">{TUTORIALS.length} tutoriales</span></div>
          <div className="tutorial-grid">
            {TUTORIALS.map(tutorial => {
              const Icon = tutorial.Icon
              const done = (completed[tutorial.id] || []).length
              return <button type="button" className={`tutorial-card ${selected.id === tutorial.id ? 'active' : ''}`} style={{ '--tutorial-accent': tutorial.color }} key={tutorial.id} onClick={() => setSelectedId(tutorial.id)}>
                <span className="tutorial-card-icon"><Icon /></span>
                <span className="tutorial-card-copy"><small>{tutorial.eyebrow}</small><strong>{tutorial.title}</strong><span>{tutorial.description}</span></span>
                <span className="tutorial-card-footer"><span><RiTimeLine /> {tutorial.duration}</span><span>{done ? `${done}/${tutorial.steps.length}` : tutorial.level}</span><RiArrowRightSLine /></span>
              </button>
            })}
          </div>
        </div>

        <aside className="tutorial-detail" aria-label={`Detalle de ${selected.title}`} style={{ '--tutorial-accent': selected.color }}>
          <div className="tutorial-detail-top"><div><span className="learn-overline">Tutorial seleccionado</span><h2>{selected.title}</h2></div><span className="tutorial-level">{selected.level}</span></div>
          <p>{selected.description}</p>
          <div className="tutorial-progress"><div><span>Tu progreso</span><strong>{progress}%</strong></div><div className="tutorial-progress-bar"><span style={{ width: `${progress}%` }} /></div></div>
          <ol className="tutorial-steps">
            {selected.steps.map((step, index) => {
              const isDone = completedSteps.includes(index)
              return <li key={step}><button type="button" className={isDone ? 'done' : ''} onClick={() => toggleStep(index)} aria-pressed={isDone}><span>{isDone ? <RiCheckLine /> : index + 1}</span><strong>{step}</strong></button></li>
            })}
          </ol>
          <button type="button" className="learn-primary" onClick={handlePrimaryAction}>{progress === 100 ? 'Repetir tutorial' : progress ? 'Continuar tutorial' : 'Empezar tutorial'} <RiArrowRightSLine /></button>
        </aside>
      </section>
    </main>
  )
}
