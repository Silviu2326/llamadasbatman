import { useState } from 'react'
import { RiArrowRightLine, RiBarChartLine, RiCheckLine, RiLightbulbLine, RiTimeLine } from 'react-icons/ri'
import './assistant-widgets.css'

export default function AssistantWidgets({ blocks = [], onScreenCommand }) {
  const [error, setError] = useState('')
  if (!blocks.length) return null
  async function runAction(action) {
    setError('')
    const command = action === 'crm'
      ? { name: 'show_crm', args: {} }
      : { name: 'show_calendar', args: { type: 'task' } }
    try { await onScreenCommand(command) } catch (failure) { setError(failure.message) }
  }
  return <section className="assistant-widgets" aria-label="Elementos interactivos de la respuesta">
    {blocks.map((block, index) => {
      if (block.type === 'metric') return <article className="assistant-widget-metric" key={`metric-${index}`}><span>{block.label}</span><strong>{block.value}</strong>{block.hint ? <small>{block.hint}</small> : null}</article>
      if (block.type === 'chart') {
        const max = Math.max(1, ...block.data.map(item => item.value))
        return <article className="assistant-widget-chart" key={`chart-${index}`}><div className="assistant-widget-title"><RiBarChartLine aria-hidden="true" /><strong>{block.title}</strong><span>muestra</span></div><div role="img" aria-label={`${block.title}: ${block.data.map(item => `${item.label}, ${item.value}`).join('; ')}`} className="assistant-widget-bars">{block.data.map((item, itemIndex) => <div className="assistant-widget-bar" key={`${item.label}-${itemIndex}`}><span>{item.label}</span><div><i style={{ width: `${Math.max(8, item.value / max * 100)}%` }} /></div><strong>{item.value}</strong></div>)}</div><small>Distribución de los registros consultados; máximo 10.</small></article>
      }
      if (block.type === 'donut') {
        const colors = ['#7664e8', '#42a78b', '#efa45f', '#dd718c', '#6f9bd5', '#a47bca']
        let offset = 0
        const gradient = block.data.map((item, itemIndex) => {
          const start = offset
          offset += block.total ? item.value / block.total * 100 : 0
          return `${colors[itemIndex % colors.length]} ${start}% ${offset}%`
        }).join(', ')
        return <article className="assistant-widget-donut" key={`donut-${index}`}><div className="assistant-widget-title"><RiBarChartLine aria-hidden="true" /><strong>{block.title}</strong></div><div className="assistant-widget-donut-content"><div className="assistant-widget-donut-visual" role="img" aria-label={`${block.title}: ${block.data.map(item => `${item.label}, ${item.value}`).join('; ')}`} style={{ background: `conic-gradient(${gradient})` }}><span><strong>{block.total}</strong><small>registros</small></span></div><ul className="assistant-widget-legend">{block.data.map((item, itemIndex) => <li key={`${item.label}-${itemIndex}`}><i style={{ background: colors[itemIndex % colors.length] }} /><span>{item.label}</span><strong>{item.value}</strong></li>)}</ul></div></article>
      }
      if (block.type === 'progress') return <article className="assistant-widget-progress" key={`progress-${index}`}><div className="assistant-widget-title"><strong>{block.title}</strong><span>{block.value}%</span></div><div className="assistant-widget-progress-track" role="meter" aria-label={block.title} aria-valuemin="0" aria-valuemax="100" aria-valuenow={block.value}><i style={{ width: `${Math.max(0, Math.min(100, block.value))}%` }} /></div>{block.hint ? <small>{block.hint}</small> : null}</article>
      if (block.type === 'timeline') return <article className="assistant-widget-timeline" key={`timeline-${index}`}><div className="assistant-widget-title"><RiTimeLine aria-hidden="true" /><strong>{block.title}</strong></div><ol>{block.items.map((item, itemIndex) => <li key={`${item.label}-${itemIndex}`}><span className="assistant-widget-timeline-dot" /><span>{item.label}</span><strong>{item.value}</strong></li>)}</ol><small>Agrupadas según su fecha de vencimiento.</small></article>
      if (block.type === 'action') return <button className="assistant-widget-action" key={`action-${index}`} type="button" onClick={() => runAction(block.action)}><span>{block.action === 'crm' ? 'Abrir CRM' : 'Ver tareas en Calendario'}</span><RiArrowRightLine aria-hidden="true" /></button>
      if (block.type === 'callout') return <aside className="assistant-widget-callout" key={`callout-${index}`}><RiLightbulbLine aria-hidden="true" /><div><strong>{block.title}</strong><p>{block.text}</p></div></aside>
      if (block.type === 'steps') return <article className="assistant-widget-steps" key={`steps-${index}`}><strong>{block.title}</strong><ol>{block.items.map((item, itemIndex) => <li key={itemIndex}><RiCheckLine aria-hidden="true" /><span>{item}</span></li>)}</ol></article>
      return null
    })}
    {error ? <p className="assistant-widget-error" role="alert">{error}</p> : null}
  </section>
}
