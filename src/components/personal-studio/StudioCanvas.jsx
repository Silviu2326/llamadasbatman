import { RiArrowLeftLine, RiArrowRightLine, RiCloseLine, RiDownload2Line, RiFileTextLine, RiMicLine, RiEqualizerLine, RiCheckLine } from 'react-icons/ri'
import { StudioProviders, StudioVideoEditor, StudioZip } from './StudioTools'
import { downloadStudioBlob } from '../../lib/studioZip'

const PRESET_ICONS = { podcast: RiMicLine, 'free-values': RiFileTextLine, custom: RiEqualizerLine }
export function StudioPresets({ presets, selected, disabled, onSelect }) {
  return <div className="ps-presets" aria-label="Presets de estudio">{presets.map(preset => {
    const Icon = PRESET_ICONS[preset.id] || RiEqualizerLine
    return <button key={preset.id} disabled={disabled} aria-pressed={selected === preset.id} onClick={() => onSelect(preset)}><Icon /><span><strong>{preset.title}</strong><small>{preset.subtitle}</small></span>{selected === preset.id ? <RiCheckLine className="ps-preset-check" /> : null}</button>
  })}</div>
}

export function StudioCanvas({ config, activeId, onActivate, onChange, assets, children, disabled }) {
  const blocks = config.blocks || []
  const active = blocks.find(block => block.id === activeId) || blocks[0]
  function update(id, patch) { onChange({ ...config, blocks: blocks.map(block => block.id === id ? { ...block, ...patch } : block) }) }
  function move(offset) {
    const index = blocks.findIndex(block => block.id === active.id), next = [...blocks]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    onChange({ ...config, blocks: next })
  }
  const textFiles = blocks.filter(block => (block.type === 'text' || block.type === 'brief') && block.content.trim()).map(block => ({ name: `${block.title}.txt`, content: block.content }))
  return <section className="ps-canvas" aria-label="Interfaz de tu estudio">
    <div className="ps-canvas-heading"><h2>{config.name}</h2><p>{config.description}</p></div>
    {blocks.length ? <>
      <nav className="ps-workflow" aria-label="Recorrido del estudio">{blocks.map((block, index) => <button key={block.id} aria-current={active?.id === block.id ? 'step' : undefined} onClick={() => onActivate(block.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{block.title}</strong></button>)}</nav>
      <div className="ps-block-toolbar"><span>{blocks.length} bloques · Recorrido editable</span><div><button className="ps-icon-button" aria-label="Mover bloque antes" disabled={disabled || blocks[0].id === active.id} onClick={() => move(-1)}><RiArrowLeftLine /></button><button className="ps-icon-button" aria-label="Mover bloque después" disabled={disabled || blocks.at(-1).id === active.id} onClick={() => move(1)}><RiArrowRightLine /></button><button className="ps-icon-button" aria-label="Quitar bloque" disabled={disabled} onClick={() => onChange({ ...config, blocks: blocks.filter(block => block.id !== active.id) })}><RiCloseLine /></button></div></div>
      {blocks.map(block => <section key={`${block.id}-${block.type}`} className="ps-block" hidden={block.id !== active.id} aria-label={block.title}>
        <header className="ps-block-heading"><div><h3>{block.title}</h3><p>{block.description}</p></div></header>
        {block.type === 'text' || block.type === 'brief' ? <><label className="ps-sr-only" htmlFor={`block-${block.id}`}>{block.title}</label><textarea id={`block-${block.id}`} className="ps-document" value={block.content} maxLength={12000} placeholder="¿Qué historia vas a contar?" disabled={disabled} onChange={event => update(block.id, { content: event.target.value })} /><footer><small>{block.content.length.toLocaleString()} / 12.000 caracteres</small><button className="ps-button" disabled={!block.content.trim()} onClick={() => downloadStudioBlob(new Blob([block.content], { type: 'text/plain;charset=utf-8' }), `${block.title.replace(/[\\/:*?"<>|]/g, '-')}.txt`)}><RiDownload2Line /> Descargar texto</button></footer></> : null}
        {block.type === 'checklist' ? <div className="ps-checklist">{block.items.map(item => <div className="ps-task-row" key={item.id}><input type="checkbox" aria-label={item.text} checked={item.done} disabled={disabled} onChange={event => update(block.id, { items: block.items.map(task => task.id === item.id ? { ...task, done: event.target.checked } : task) })} /><input className="ps-task-title" aria-label={`Editar tarea ${item.text}`} value={item.text} maxLength={250} disabled={disabled} onChange={event => update(block.id, { items: block.items.map(task => task.id === item.id ? { ...task, text: event.target.value } : task) })} /><button className="ps-icon-button" aria-label={`Quitar tarea ${item.text}`} disabled={disabled} onClick={() => update(block.id, { items: block.items.filter(task => task.id !== item.id) })}><RiCloseLine /></button></div>)}<button className="ps-button" disabled={disabled || block.items.length >= 20} onClick={() => update(block.id, { items: [...block.items, { id: `task-${Date.now()}`, text: 'Nueva tarea', done: false }] })}>Añadir tarea</button></div> : null}
        {block.type === 'video-editor' ? <StudioVideoEditor /> : null}
        {block.type === 'zip-export' ? <StudioZip assets={assets} documents={textFiles} /> : null}
        {block.type === 'providers' && block.id === active.id ? <StudioProviders query={config.providerQuery} /> : null}
        {block.type === 'library' && block.id === active.id ? <div className="ps-library">{children}</div> : null}
      </section>)}
    </> : <div className="ps-canvas-empty"><RiEqualizerLine /><h3>Un espacio por inventar.</h3><p>Elige un preset o cuéntale a Nara qué quieres crear. Los bloques de tu estudio aparecerán aquí.</p></div>}
  </section>
}
