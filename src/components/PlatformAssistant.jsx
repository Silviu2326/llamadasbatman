import { useEffect, useRef, useState } from 'react'
import { RiCloseLine, RiAddLine, RiArrowUpLine, RiArrowRightLine, RiCompass3Line, RiUserAddLine, RiBarChartLine, RiFileCopyLine, RiCheckLine, RiStopFill, RiHistoryLine, RiDownload2Line, RiChatSmile2Line, RiListCheck2, RiLoader4Line, RiErrorWarningLine } from 'react-icons/ri'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import AssistantOperations, { AssistantActionCard, AssistantQueryResult } from './AssistantOperations'
import AssistantWorkflows from './AssistantWorkflows'
import { assistantScreenContext, performAssistantScreenCommand } from '../lib/assistantScreen'
import './platform-assistant.css'
import './assistant-workflows.css'

function AssistantCompanion({ small = false }) {
  return <span className={`assistant-companion${small ? ' is-small' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 80 80" fill="none">
      <path className="companion-petal" d="M40 7C49-3 61 5 61 17C75 13 84 27 75 39C86 50 77 65 64 63C62 78 47 84 39 73C28 84 14 76 16 62C1 64-6 48 6 39C-3 27 5 13 19 17C19 3 32-3 40 7Z" transform="translate(5 5) scale(.875)" />
      <path className="companion-eye" d="M30 34v4M49 34v4" strokeWidth="3.5" strokeLinecap="round" />
      <path className="companion-smile" d="M34 47q6 6 12 0" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse className="companion-cheek" cx="24" cy="44" rx="4" ry="2.5" />
      <ellipse className="companion-cheek" cx="55" cy="44" rx="4" ry="2.5" />
    </svg>
  </span>
}

function AssistantIllustration({ scene, className = '' }) {
  return <img className={`assistant-illustration ${className}`} src={`/images/assistant/${scene}.webp`} alt="" width="192" height="192" decoding="async" />
}

const NO_MODULES = []
const SHORTCUT_IDS = ['crm', 'plan', 'insights', 'calendar', 'agents', 'capture']

export default function PlatformAssistant({ open, onClose, onOpen, brandName, page, pageId, availableModules = NO_MODULES, locale, initialObjective = '', initialDraft = null }) {
  const navigate = useNavigate()
  const dialog = useRef(null)
  const input = useRef(null)
  const end = useRef(null)
  const pending = useRef(null)
  const chatRequestId = useRef(null)
  const screenPending = useRef(null)
  const [screenActivity, setScreenActivity] = useState(null)
  const body = useRef(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState(null)
  const [view, setView] = useState('chat')
  const [workflowDraft, setWorkflowDraft] = useState(initialDraft)
  const [copied, setCopied] = useState(null)
  const [notice, setNotice] = useState('')
  const en = locale === 'en'
  const lastUser = messages.findLast(message => message.role === 'user')?.content
  const shortcuts = SHORTCUT_IDS.map(id => availableModules.find(module => module.id === id)).filter(Boolean)
  const suggestions = [
    { icon: RiCompass3Line, tone: 'peach', title: en ? 'Find my first step' : 'Dar el primer paso', detail: en ? 'A little direction to get going' : 'Una pista para empezar', question: en ? 'Where should I start?' : '¿Por dónde empiezo?' },
    { icon: RiUserAddLine, tone: 'lavender', title: en ? 'Find my contacts' : 'Buscar mis contactos', detail: en ? 'Query your CRM' : 'Abre el CRM con los filtros aplicados', question: en ? 'Show me my newest contacts.' : 'Muéstrame los contactos nuevos.' },
    { icon: RiBarChartLine, tone: 'mint', title: en ? 'My pending tasks' : 'Mis tareas pendientes', detail: en ? 'See what needs doing' : 'Abre tu agenda de tareas', question: en ? 'Show me my open tasks.' : 'Muestra mis tareas pendientes.' },
  ]
  if (pageId && pageId !== 'dashboard') {
    suggestions[0] = { icon: RiCompass3Line, tone: 'peach', title: en ? 'Help with this page' : 'Una mano con esta página', detail: page, question: en ? `What can I do on the ${page} page? Give me a useful first step.` : `¿Qué puedo hacer en ${page}? Dame un primer paso útil.` }
  }

  useEffect(() => {
    if (open) { dialog.current?.showModal(); input.current?.focus() }
    else dialog.current?.close()
  }, [open])
  useEffect(() => {
    if (!open || view !== 'chat') return
    if (messages.length) end.current?.scrollIntoView({ block: 'nearest' })
    else body.current?.scrollTo({ top: 0 })
  }, [open, view, messages, busy, error])
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => () => screenPending.current?.abort(), [])
  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => setCopied(null), 2200)
    return () => clearTimeout(timer)
  }, [copied])
  useEffect(() => {
    if (!initialDraft) return
    setWorkflowDraft(initialDraft)
    setView('workflows')
  }, [initialDraft])

  function resetConversation() {
    setMessages([]); setError(''); setFailed(null); setDraft(''); setCopied(null); setNotice(''); setView('chat')
    input.current?.focus()
  }

  async function copyMessage(content, index) {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(index); setNotice(en ? 'Response copied.' : 'Respuesta copiada.')
    } catch {
      setNotice(en ? 'Could not copy. You can select the text and copy it manually.' : 'No se ha podido copiar. Puedes seleccionar el texto y copiarlo manualmente.')
    }
  }

  function downloadConversation() {
    const content = messages.map(message => `${message.role === 'user' ? (en ? 'You' : 'Tú') : (en ? 'Your assistant' : 'Tu asistente')}\n${message.content}`).join('\n\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'conversacion-asistente.txt'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(en ? 'Conversation ready to download.' : 'Conversación preparada para descargar.')
  }

  function stopResponse() {
    pending.current?.abort('user')
    pending.current = null; setBusy(false); setFailed(lastUser)
    setNotice(en ? 'Stopped. You can recover your message below.' : 'Respuesta detenida. Puedes recuperar tu mensaje abajo.')
    input.current?.focus()
  }

  async function send(value, retry = false) {
    const content = value?.trim()
    if (!content || pending.current) return
    const conversation = retry ? messages : [...messages, { role: 'user', content }]
    if (!retry || !chatRequestId.current) chatRequestId.current = crypto.randomUUID()
    if (!retry) { setMessages(conversation); setDraft('') }
    setBusy(true); setError(''); setFailed(null); setNotice(''); setView('chat')
    const controller = new AbortController()
    pending.current = controller
    const timeout = setTimeout(() => controller.abort('timeout'), 60000)
    try {
      const response = await apiFetch('/api/assistant/chat', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ messages: conversation.slice(-12).map(message => ({ role: message.role, content: message.content.slice(0, 2000) })), page, locale, requestId: chatRequestId.current, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, screenContext: assistantScreenContext() }),
      })
      const body = await response.json().catch(() => null)
      if (controller.signal.aborted) {
        if (controller.signal.reason === 'timeout') throw new Error('timeout')
        return
      }
      if (!response.ok || !body?.text?.trim()) throw new Error(response.status === 429 ? (en ? 'Too many messages. Try again in a minute.' : 'Has enviado muchos mensajes. Prueba de nuevo en un minuto.') : en ? 'I could not respond. Please try again.' : body?.error || 'No he podido responder. Inténtalo de nuevo.')
      if (body.workflowDraft) { setWorkflowDraft(body.workflowDraft); setView('workflows') }
      const screenResults = []
      for (const command of (body.screens || []).slice(0, 3)) screenResults.push(await applyScreenCommand(command))
      setMessages(current => [...current, { role: 'assistant', content: screenResults.length ? screenResults.join('\n') : body.text, actions: body.actions || [], results: body.results || [] }])
    } catch (failure) {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return
      setError(controller.signal.reason === 'timeout' ? (en ? 'The response is taking too long. Please try again.' : 'La respuesta está tardando demasiado. Puedes reintentar.') : failure.message)
      setFailed(content)
    } finally {
      clearTimeout(timeout)
      if (pending.current === controller) { pending.current = null; setBusy(false) }
    }
  }

  async function applyScreenCommand(command) {
    if (screenPending.current) throw new Error('Hay una operación de pantalla en curso.')
    const controller = new AbortController(); screenPending.current = controller
    setScreenActivity({ state: 'working', message: 'Aplicando la operación en pantalla…' })
    try {
      const message = await performAssistantScreenCommand(command, { navigate, availableModules, signal: controller.signal, onStart: onClose })
      setScreenActivity({ state: 'done', message }); return message
    } catch (failure) { setScreenActivity({ state: 'error', message: failure.message }); throw failure }
    finally { screenPending.current = null }
  }

  return <><dialog id="platform-assistant-dialog" ref={dialog} className={`platform-assistant${view === 'workflows' ? ' is-workflows' : ''}`} aria-labelledby="platform-assistant-title" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="assistant-panel">
      <header className="assistant-header">
        <AssistantCompanion small />
        <div><h2 id="platform-assistant-title">{en ? 'Your assistant' : 'Tu asistente'}</h2><p>{brandName}</p></div>
        <button type="button" disabled={busy || !messages.length} onClick={downloadConversation} aria-label={en ? 'Download conversation' : 'Descargar conversación'} title={en ? 'Download conversation' : 'Descargar conversación'}><RiDownload2Line /></button>
        <button type="button" disabled={busy || !messages.length} onClick={resetConversation} aria-label={en ? 'New conversation' : 'Nueva conversación'} title={en ? 'New conversation' : 'Nueva conversación'}><RiAddLine /></button>
        <button type="button" onClick={onClose} aria-label={en ? 'Close assistant' : 'Cerrar asistente'}><RiCloseLine /></button>
      </header>
      <nav className="assistant-views" aria-label={en ? 'Assistant views' : 'Vistas del asistente'}>
        <button type="button" aria-pressed={view === 'chat'} onClick={() => setView('chat')}><RiChatSmile2Line aria-hidden="true" />{en ? 'Chat' : 'Conversar'}</button>
        <button type="button" aria-pressed={view === 'actions'} onClick={() => setView('actions')}><RiListCheck2 aria-hidden="true" />{en ? 'Actions' : 'Acciones'}</button>
        <button type="button" aria-pressed={view === 'workflows'} onClick={() => setView('workflows')}><RiCompass3Line aria-hidden="true" />{en ? 'Objectives' : 'Objetivos'}</button>
        <button type="button" aria-pressed={view === 'explore'} onClick={() => setView('explore')}><RiCompass3Line aria-hidden="true" />{en ? 'Shortcuts' : 'Atajos'}</button>
      </nav>
      <div className="assistant-body" ref={body}>
        {view === 'actions' ? <AssistantOperations onClose={onClose} onScreenCommand={applyScreenCommand} onWorkflowDraft={draft => { setWorkflowDraft(draft); setView('workflows') }} /> : view === 'workflows' ? <AssistantWorkflows brandName={brandName} initialObjective={workflowDraft?.objective || initialObjective} initialDraft={workflowDraft} open={open} /> : view === 'explore' ? <div className="assistant-explore">
          <div className="assistant-explore-header"><AssistantIllustration scene="explore" /><div><h3>{en ? 'Where shall we go?' : '¿A dónde vamos?'}</h3><p>{en ? 'Your next stop, one click away.' : 'Tu siguiente parada, a un clic.'}</p></div></div>
          <div className="assistant-shortcuts">{shortcuts.map(module => <button type="button" key={module.id} onClick={() => { onClose(); navigate(module.to) }}><module.Icon aria-hidden="true" /><span>{en ? module.labelEn || module.label : module.label}</span><RiArrowRightLine aria-hidden="true" /></button>)}</div>
          {!shortcuts.length ? <p>{en ? 'Ask me where to find what you need.' : 'Pregúntame dónde encontrar lo que necesitas.'}</p> : null}
          <div className="assistant-explore-note"><RiCompass3Line aria-hidden="true" /><span>{en ? 'You’re in ' : 'Estás en '}<strong>{page}</strong></span></div>
        </div> : <>
        {!messages.length ? <div className="assistant-welcome">
          <div className="assistant-welcome-art" aria-hidden="true"><AssistantIllustration scene="welcome" /></div>
          <span className="assistant-eyebrow">{en ? 'A little help goes a long way' : 'Un poco de ayuda sienta bien'}</span>
          <h3>{en ? 'Let’s take it' : 'Vamos'} <em>{en ? 'step by step.' : 'paso a paso.'}</em></h3>
          <p>{en ? 'Tell me what you’d like to do in ' : 'Cuéntame qué quieres hacer en '}{brandName || 'Vendrava'}{en ? '. We’ll find where to start.' : '. Encontramos por dónde empezar.'}</p>
          <div className="assistant-suggestions">{suggestions.map(({ icon: Icon, tone, title, detail, question }) => <button type="button" key={question} aria-label={`${title}. ${question}`} onClick={() => send(question)}><span className={`assistant-suggestion-icon is-${tone}`}><Icon aria-hidden="true" /></span><span className="assistant-suggestion-copy"><strong>{title}</strong><span>{detail}</span></span><RiArrowRightLine className="assistant-suggestion-arrow" aria-hidden="true" /></button>)}</div>
        </div> : null}
        <div className="assistant-messages" role="log" aria-label={en ? 'Conversation' : 'Conversación'} aria-live="polite" aria-relevant="additions text">
          {messages.map((message, index) => <div className={`assistant-message is-${message.role}`} key={index}>
            <span className="assistant-message-author">{message.role === 'assistant' ? <AssistantCompanion small /> : null}{message.role === 'user' ? (en ? 'You' : 'Tú') : (en ? 'Your assistant' : 'Tu asistente')}</span><p>{message.content}</p>
            {message.results?.map((result, resultIndex) => <AssistantQueryResult key={resultIndex} result={result} onScreenCommand={applyScreenCommand} />)}
            {message.actions?.map(action => <AssistantActionCard key={action.id} action={action} onClose={onClose} onChange={updated => setMessages(current => current.map(item => ({ ...item, actions: item.actions?.map(entry => entry.id === updated.id ? updated : entry) })))} />)}
            {message.role === 'assistant' ? <button className="assistant-copy" type="button" onClick={() => copyMessage(message.content, index)} aria-label={en ? 'Copy response' : 'Copiar respuesta'}>{copied === index ? <RiCheckLine aria-hidden="true" /> : <RiFileCopyLine aria-hidden="true" />}{copied === index ? (en ? 'Copied' : 'Copiado') : (en ? 'Copy' : 'Copiar')}</button> : null}
          </div>)}
        </div>
        {busy ? <div className="assistant-thinking" role="status"><AssistantIllustration scene="notebook" /><div><strong>{en ? 'Let’s see…' : 'Vamos a verlo…'}</strong><span>{en ? 'Putting the next step into words' : 'Dándole forma al siguiente paso'}</span></div><span aria-hidden="true"><i /><i /><i /></span></div> : null}
        {!busy && !error && messages.at(-1)?.role === 'assistant' ? <div className="assistant-followups" aria-label={en ? 'Continue the conversation' : 'Seguir la conversación'}><button type="button" onClick={() => send(en ? 'Summarize your last answer in two short sentences.' : 'Resume tu última respuesta en dos frases cortas.')}><RiChatSmile2Line aria-hidden="true" />{en ? 'Keep it short' : 'Más breve'}</button><button type="button" onClick={() => send(en ? 'Turn your last answer into three concrete steps I can follow.' : 'Convierte tu última respuesta en tres pasos concretos que pueda seguir.')}><RiListCheck2 aria-hidden="true" />{en ? 'Step by step' : 'Paso a paso'}</button></div> : null}
        {error ? <div className="assistant-error" role="alert"><p>{error}</p><button type="button" onClick={() => send(failed, true)}>{en ? 'Retry' : 'Reintentar'}</button><button type="button" onClick={() => setView('actions')}>{en ? 'Go to actions' : 'Ir a Acciones'}</button></div> : null}
        <div ref={end} />
        </>}
      </div>
      <div className="assistant-notice" role="status">{notice}</div>
      <form className="assistant-composer" hidden={view === 'actions' || view === 'workflows'} onSubmit={event => { event.preventDefault(); send(draft) }}>
        {lastUser && !draft && !busy ? <button type="button" className="assistant-recover" onClick={() => { setDraft(lastUser); setNotice(''); setView('chat'); input.current?.focus() }}><RiHistoryLine aria-hidden="true" />{en ? 'Recover my last message' : 'Recuperar mi último mensaje'}</button> : null}
        <label className="sr-only" htmlFor="assistant-message">{en ? 'Your message' : 'Tu mensaje'}</label>
        <div className="assistant-input-wrap"><textarea id="assistant-message" ref={input} value={draft} maxLength={2000} rows={2} placeholder={en ? 'Tell me, what do you have in mind?' : 'Cuéntame, ¿qué tienes en mente?'} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(draft) } }} />{busy ? <button type="button" onClick={stopResponse} aria-label={en ? 'Stop response' : 'Detener respuesta'}><RiStopFill /></button> : <button type="submit" disabled={!draft.trim()} aria-label={en ? 'Send message' : 'Enviar mensaje'}><RiArrowUpLine /></button>}</div>
        <p>{en ? 'Your AI guide to ' : 'Tu guía con IA en '}{brandName || 'Vendrava'}</p>
      </form>
    </div>
  </dialog>{screenActivity && !open ? <aside className={`assistant-screen-activity is-${screenActivity.state}`} role="status">{screenActivity.state === 'working' ? <RiLoader4Line aria-hidden="true" /> : screenActivity.state === 'error' ? <RiErrorWarningLine aria-hidden="true" /> : <RiCheckLine aria-hidden="true" />}<span>{screenActivity.message}</span><button type="button" onClick={onOpen}>Volver al asistente</button>{screenActivity.state !== 'working' ? <button type="button" aria-label="Ocultar resultado del asistente" onClick={() => setScreenActivity(null)}><RiCloseLine /></button> : null}</aside> : null}</>
}
