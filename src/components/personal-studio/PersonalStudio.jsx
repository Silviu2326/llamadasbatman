import { useCallback, useEffect, useRef, useState } from 'react'
import { RiArrowUpLine, RiChat3Line, RiCloseLine, RiFolderImageLine, RiSparkling2Line, RiArrowGoBackLine, RiCheckLine, RiSaveLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { StudioProviders, StudioVideoEditor, StudioZip } from './StudioTools'
import { StudioCanvas, StudioPresets } from './StudioCanvas'
import './personal-studio.css'

const SUGGESTIONS = ['Un pódcast con guion y clips', 'Un estudio de recursos Free Values', 'Tengo una idea diferente…']
const TOOL_NAMES = { 'video-editor': 'Editor de vídeo', 'zip-export': 'Exportar ZIP', providers: 'Proveedores' }

export default function PersonalStudio({ children, assets, canUseAI }) {
  const [state, setState] = useState(null), [presets, setPresets] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [chatOpen, setChatOpen] = useState(true), [draft, setDraft] = useState(''), [pendingMessage, setPendingMessage] = useState('')
  const [busy, setBusy] = useState(false), [undo, setUndo] = useState(null), [view, setView] = useState('studio')
  const [edited, setEdited] = useState(null), [presetPreview, setPresetPreview] = useState(null), [activeBlock, setActiveBlock] = useState('')
  const alive = useRef(true), lock = useRef(false), log = useRef(null), composer = useRef(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [response, presetResponse] = await Promise.all([apiFetch('/api/assets/studio/config'), apiFetch('/api/assets/studio/presets')])
      if (!response.ok) throw new Error('No pude recuperar tu estudio. Reintenta en un momento.')
      const body = await response.json()
      const catalog = presetResponse.ok ? await presetResponse.json() : { presets: [] }
      if (alive.current) { setState(body); setPresets(catalog.presets || []); setEdited(null); setPresetPreview(null) }
    } catch (err) { if (alive.current) setError(err.message) } finally { if (alive.current) setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (log.current) log.current.scrollTop = state?.messages?.length || pendingMessage ? log.current.scrollHeight : 0 }, [state?.messages, pendingMessage, error, state?.build])
  useEffect(() => {
    if (!edited) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [edited])
  const config = edited || state?.config
  const standaloneTools = (config?.tools || []).filter(tool => !config?.blocks?.some(block => block.type === tool))
  async function commit(next, action = 'edit') {
    if (!state || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const response = await apiFetch('/api/assets/studio/config', { method: 'PUT', body: JSON.stringify({ revision: state.revision, config: next, action }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || body.error || 'No pude guardar los cambios. Tu edición sigue aquí.')
      if (alive.current) { setUndo(action === 'undo' ? null : state.config); setState(body); setEdited(null); setPresetPreview(null); setView('studio') }
    } catch (err) { if (alive.current) setError(err.message) } finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function send(message) {
    const content = message.trim()
    if (!content || lock.current || !state || !canUseAI || edited) return
    lock.current = true; setBusy(true); setError(''); setPendingMessage(content); setDraft(''); setPresetPreview(null)
    try {
      const response = await apiFetch('/api/assets/studio/chat', { method: 'POST', body: JSON.stringify({ revision: state.revision, message: content }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || body.error || 'Se nos ha atascado el diseño. Tu estudio sigue intacto; probamos otra vez.')
      if (alive.current) { setUndo(state.config); setState(body); setView(body.config.blocks?.length ? 'studio' : body.config.activeTool); setActiveBlock(body.config.blocks?.[0]?.id || '') }
    } catch (err) { if (alive.current) { setError(err.message); setDraft(content) } }
    finally { lock.current = false; if (alive.current) { setBusy(false); setPendingMessage(''); composer.current?.focus() } }
  }
  const disabled = busy || loading || !state
  const chatDisabled = disabled || !canUseAI || !!edited
  return <div className={`ps-workspace ps-accent-${config?.accent || 'violet'} ps-density-${config?.density || 'comfortable'} ps-layout-${config?.layout || 'grid'}`}>
    <header className="ps-header"><div><h1>Tu próximo gran estudio.</h1><p>Empieza con una idea. Dale forma con Nara.</p></div><div className="ps-actions">{undo ? <button className="ps-button" disabled={disabled || !!edited} onClick={() => commit(undo, 'undo')}><RiArrowGoBackLine /> Deshacer</button> : null}<button className="ps-button" onClick={() => setView(view === 'library' ? 'studio' : 'library')}><RiFolderImageLine /> {view === 'library' ? 'Volver al estudio' : 'Ver biblioteca'}</button>{<button className="ps-button primary" onClick={() => { setChatOpen(true); requestAnimationFrame(() => { composer.current?.scrollIntoView({ block: 'center' }); composer.current?.focus({ preventScroll: true }) }) }}><RiChat3Line /> Hablar con Nara</button>}</div></header>
    {edited ? <div className="ps-savebar" role="status"><span>Tienes cambios sin guardar.</span><div><button className="ps-button" disabled={busy} onClick={() => setEdited(null)}>Descartar</button><button className="ps-button primary" disabled={busy} onClick={() => commit(edited)}><RiSaveLine /> {busy ? 'Guardando…' : 'Guardar cambios'}</button></div></div> : null}
    <div className={`ps-body${chatOpen ? ' has-chat' : ''}`}><div className="ps-stage">
      <StudioPresets presets={presets} selected={config?.preset} disabled={disabled || !!edited} onSelect={setPresetPreview} />
      {presetPreview ? <section className="ps-preset-preview" aria-label="Vista previa del preset"><h2>{presetPreview.config.name}</h2><p>{presetPreview.config.description}</p><ol>{presetPreview.config.blocks.map(block => <li key={block.id}>{block.title}</li>)}</ol><p>Este preset sustituye el recorrido actual. Podrás deshacer el cambio.</p><div className="ps-actions"><button className="ps-button primary" disabled={disabled} onClick={() => commit(presetPreview.config, 'preset')}>Usar preset {presetPreview.title}</button><button className="ps-button" onClick={() => setPresetPreview(null)}>Cancelar</button></div></section> : null}
      {loading ? <div className="ps-canvas-skeleton" role="status">Preparando tu espacio…<i /><i /><i /></div> : null}
      {!loading && config ? <>
        <div hidden={view !== 'studio'}><StudioCanvas config={config} activeId={activeBlock} onActivate={setActiveBlock} onChange={setEdited} disabled={busy} assets={assets}>{view === 'studio' ? children : null}</StudioCanvas></div>
        <div hidden={view !== 'library'} className="ps-library">{view === 'library' ? children : null}</div>
        {standaloneTools.length ? <nav className="ps-tool-shortcuts" aria-label="Accesos a herramientas"><button onClick={() => setView('studio')} aria-current={view === 'studio' ? 'page' : undefined}>Mi recorrido</button>{standaloneTools.map(tool => <button key={tool} onClick={() => setView(tool)} aria-current={view === tool ? 'page' : undefined}>{TOOL_NAMES[tool]}</button>)}</nav> : null}
        {standaloneTools.includes('video-editor') ? <div hidden={view !== 'video-editor'}><StudioVideoEditor /></div> : null}
        {standaloneTools.includes('zip-export') ? <div hidden={view !== 'zip-export'}><StudioZip assets={assets} /></div> : null}
        {view === 'providers' ? <StudioProviders query={config.providerQuery} /> : null}
      </> : null}
      {error ? <div className="ps-error" role="alert"><p>{error}</p><button className="ps-button" disabled={busy || !!edited} onClick={load}>Recargar configuración</button>{edited ? <p>Guarda o descarta tu edición antes de recargar.</p> : null}</div> : null}
    </div>{chatOpen ? <aside id="studio-builder-chat" className="ps-chat" aria-label="Chat con Nara"><header><span className="ps-assistant-icon"><RiSparkling2Line /></span><div><strong>Nara</strong><small>Tu cómplice de estudio</small></div><button className="ps-icon-button" aria-label="Cerrar chat del estudio" onClick={() => setChatOpen(false)}><RiCloseLine /></button></header>
      <div className="ps-chat-log" ref={log} role="log" aria-live="polite" aria-relevant="additions text"><div className="ps-nara-intro"><h2>Tú pones la idea.<br />Yo monto el estudio.</h2><p>Podemos empezar por un pódcast, una serie de recursos o algo que todavía no tiene nombre.</p></div>{!state?.messages?.length ? <div className="ps-suggestions">{SUGGESTIONS.map(text => <button key={text} disabled={chatDisabled} onClick={() => { setDraft(text); composer.current?.focus() }}>{text}<RiArrowUpLine /></button>)}</div> : null}
        {state?.messages.map((message, index) => <div className={`ps-message ${message.role}`} key={`${index}-${message.role}`}><small>{message.role === 'user' ? 'Tú' : 'Nara'}</small><p>{message.content}</p></div>)}
        {pendingMessage ? <><div className="ps-message user"><small>Tú</small><p>{pendingMessage}</p></div><div className="ps-build-working" role="status"><RiSparkling2Line /><div><strong>Estoy dando forma a tu idea…</strong><p>Diseñar el recorrido → validar bloques → construir tu espacio</p></div></div></> : null}
        {!busy && state?.build?.changes?.length ? <div className="ps-build-receipt"><RiCheckLine /><div><strong>Tu espacio está actualizado</strong><ul>{state.build.changes.map((change, i) => <li key={i}>{change}</li>)}</ul></div></div> : null}
      </div><form className="ps-composer" onSubmit={event => { event.preventDefault(); send(draft) }}><label htmlFor="studio-message" className="ps-sr-only">Mensaje a Nara</label><textarea id="studio-message" ref={composer} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Cuéntame qué quieres crear…" maxLength={2000} rows={3} disabled={chatDisabled} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft) } }} /><div><small>{edited ? 'Guarda tus cambios para seguir con Nara.' : !canUseAI ? 'Necesitas permiso para usar IA.' : 'De una idea a tu propio espacio.'}</small><button className="ps-send" type="submit" aria-label="Enviar mensaje" disabled={chatDisabled || !draft.trim()}><RiArrowUpLine /></button></div></form>
    </aside> : null}</div>
  </div>
}

