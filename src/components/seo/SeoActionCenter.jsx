import { memo, useMemo, useState } from 'react'
import {
  RiArrowRightLine,
  RiCheckLine,
  RiCheckboxBlankCircleLine,
  RiFlashlightLine,
  RiGlobalLine,
  RiLineChartLine,
  RiMapPin2Line,
  RiSearchEyeLine,
  RiToolsLine,
} from 'react-icons/ri'
import './seo-components.css'

function buildActions({ report, searchConsole, stale }) {
  const failed = (report?.checklist ?? []).filter((item) => !item.ok)
  const content = report?.contentPlan ?? []
  const keywords = report?.keywords ?? []
  const actions = []

  if (failed.length) {
    actions.push({
      id: 'technical',
      type: 'Urgente',
      tone: 'danger',
      icon: RiToolsLine,
      title: `Corrige ${failed[0].label.toLowerCase()}`,
      copy: failed[0].hint || 'Es el siguiente bloqueo técnico que está restando visibilidad.',
      cta: 'Ver salud técnica',
      tab: 'tecnico',
    })
  } else if (keywords[0]) {
    actions.push({
      id: 'active-page',
      type: 'Siguiente',
      tone: 'success',
      icon: RiFlashlightLine,
      title: `Crea una página para “${keywords[0].keyword}”`,
      copy: 'La keyword principal ya está en tu plan: conviértela en una página activa con una CTA clara.',
      cta: 'Abrir fábrica',
      keyword: keywords[0].keyword,
    })
  }

  if (!searchConsole?.connected) {
    actions.push({
      id: 'measurement',
      type: 'Medición',
      tone: 'cyan',
      icon: RiGlobalLine,
      title: 'Conecta Search Console',
      copy: 'Sin impresiones, clics y posiciones no sabrás qué contenido merece más inversión.',
      cta: 'Ver keywords',
      tab: 'keywords',
    })
  } else if (keywords[1]) {
    actions.push({
      id: 'passive-page',
      type: 'Oportunidad',
      tone: 'cyan',
      icon: RiSearchEyeLine,
      title: `Ataca “${keywords[1].keyword}” con una guía`,
      copy: 'Usa el modo pasivo para capturar búsquedas informacionales antes de la decisión de compra.',
      cta: 'Crear guía',
      keyword: keywords[1].keyword,
      mode: 'pasiva',
    })
  }

  if (stale.length) {
    actions.push({
      id: 'refresh',
      type: 'Mantenimiento',
      tone: 'warn',
      icon: RiLineChartLine,
      title: `Refresca ${stale.length} contenido${stale.length === 1 ? '' : 's'}`,
      copy: 'Los artículos antiguos pierden precisión y oportunidades de enlazado interno.',
      cta: 'Ver contenidos',
      tab: 'contenidos',
    })
  } else if (content[0]) {
    actions.push({
      id: 'content',
      type: 'Plan',
      tone: 'violet',
      icon: RiMapPin2Line,
      title: `Planifica “${content[0].title}”`,
      copy: 'Tu informe ya propone el siguiente tema. Genera el borrador y súmalo a la cola de publicación.',
      cta: 'Abrir fábrica',
      keyword: content[0].keyword,
    })
  }

  return actions.slice(0, 4)
}

function ActionItem({ item, done, onComplete, onOpenFactory, onOpenTab }) {
  const Icon = item.icon
  function execute() {
    if (item.keyword) onOpenFactory(item.keyword, item.mode)
    else if (item.tab) onOpenTab(item.tab)
  }
  return (
    <article className={`seo-action-item tone-${item.tone}${done ? ' is-done' : ''}`}>
      <button type="button" className="seo-action-check" onClick={() => onComplete(item.id)} aria-label={done ? `Marcar pendiente: ${item.title}` : `Marcar completada: ${item.title}`} aria-pressed={done}>
        {done ? <RiCheckLine /> : <RiCheckboxBlankCircleLine />}
      </button>
      <span className="seo-action-icon"><Icon /></span>
      <div className="seo-action-copy"><span>{item.type}</span><strong>{item.title}</strong><p>{item.copy}</p></div>
      <button type="button" className="seo-button small seo-action-cta" onClick={execute}>{item.cta} <RiArrowRightLine /></button>
    </article>
  )
}

function SeoActionCenter({ report, searchConsole, stale, onOpenFactory, onOpenTab }) {
  const actions = useMemo(() => buildActions({ report, searchConsole, stale }), [report, searchConsole, stale])
  const [completed, setCompleted] = useState(() => new Set())
  const completedCount = actions.filter((item) => completed.has(item.id)).length
  const progress = actions.length ? Math.round((completedCount / actions.length) * 100) : 0

  function toggle(itemId) {
    setCompleted((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  if (!actions.length) return null
  return (
    <section className="seo-action-center seo-rise" aria-labelledby="seo-action-title">
      <header className="seo-action-head">
        <div><span className="seo-overline">Plan de ejecución</span><h2 id="seo-action-title">Siguiente mejor acción</h2><p>Convierte el diagnóstico en trabajo concreto. Marca cada paso cuando lo hayas resuelto.</p></div>
        <div className="seo-action-progress"><strong>{progress}%</strong><span>{completedCount}/{actions.length} completadas</span><i><b style={{ width: `${progress}%` }} /></i></div>
      </header>
      <div className="seo-action-list">
        {actions.map((item) => <ActionItem key={item.id} item={item} done={completed.has(item.id)} onComplete={toggle} onOpenFactory={onOpenFactory} onOpenTab={onOpenTab} />)}
      </div>
    </section>
  )
}

export default memo(SeoActionCenter)
