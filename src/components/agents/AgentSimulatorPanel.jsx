import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RiArrowDownSLine, RiCheckLine, RiExternalLinkLine, RiLoader4Line,
  RiMicLine, RiPauseCircleLine, RiPulseLine, RiRefreshLine, RiRobot2Line,
  RiSendPlane2Line, RiSparkling2Line, RiTimeLine, RiUser3Line, RiWifiLine,
} from 'react-icons/ri'
import './agent-simulator.css'

export const DEFAULT_AGENT_SIMULATOR_SCENARIOS = [
  { id: 'discovery', label: 'Descubrimiento', description: 'Entender contexto, necesidad y encaje.', starter: 'Quiero entender cómo podría ayudarme esta solución.' },
  { id: 'price-objection', label: 'Objeción de precio', description: 'Practicar una respuesta clara ante el coste.', starter: 'Me interesa, pero ahora mismo me parece demasiado caro.' },
  { id: 'book-meeting', label: 'Agendar reunión', description: 'Llevar la conversación hacia el siguiente paso.', starter: 'Tiene sentido. ¿Podemos agendar una reunión?' },
]

const DEFAULT_CONNECTION = { status: 'connected', label: 'Motor conectado', detail: 'Listo para simular turnos' }
const DEFAULT_METRICS = { latencyMs: 382, turns: 2 }

function makeMessage(role, text, id) {
  return { id: id || `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text }
}

function initialConversation(agent, scenario) {
  const agentName = agent?.name || 'tu agente'
  return [
    makeMessage('assistant', `Hola, soy ${agentName}. Estoy listo para ayudarte y entender qué necesitas.`, 'welcome'),
    makeMessage('user', scenario.starter, 'scenario-starter'),
  ]
}

function simulatedReply(scenarioId, text, agentName) {
  const normalized = text.toLowerCase()
  if (scenarioId === 'price-objection' || normalized.includes('caro') || normalized.includes('precio')) {
    return 'Lo entiendo. Para ponerlo en contexto, podemos revisar el impacto y el volumen que necesitas antes de hablar de una inversión. ¿Qué resultado tendría más valor para tu equipo?'
  }
  if (scenarioId === 'book-meeting' || normalized.includes('reunión') || normalized.includes('reunion') || normalized.includes('agenda')) {
    return 'Perfecto. Puedo ayudarte a dejar el siguiente paso preparado. ¿Te viene mejor una conversación de 20 minutos esta semana o prefieres que te proponga dos horarios?'
  }
  return `Gracias por contármelo. Para orientarte bien, ${agentName} necesita conocer un poco más sobre vuestro proceso actual. ¿Cuál es el punto que más tiempo os está haciendo perder hoy?`
}

function normalizeConnection(value) {
  if (typeof value === 'string') return { ...DEFAULT_CONNECTION, status: value }
  return { ...DEFAULT_CONNECTION, ...(value || {}) }
}

function formatMetric(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
}

function MessageBubble({ message }) {
  const isAssistant = message.role === 'assistant'
  return <article className={`agent-simulator-message is-${message.role}`}>
    <span className="agent-simulator-message-avatar" aria-hidden="true">{isAssistant ? <RiRobot2Line /> : <RiUser3Line />}</span>
    <div className="agent-simulator-message-body">
      <div className="agent-simulator-message-meta"><strong>{isAssistant ? 'Agente IA' : 'Tú'}</strong><span>{isAssistant ? 'Respuesta del agente' : 'Mensaje de prueba'}</span></div>
      <p>{message.text}</p>
    </div>
  </article>
}

export default function AgentSimulatorPanel({
  agent = {}, scenarios = DEFAULT_AGENT_SIMULATOR_SCENARIOS, initialMessages,
  connectionStatus = DEFAULT_CONNECTION, metrics, onSend, onReset, onMicToggle,
  onScenarioChange, onTestInCabin, cabinHref = '/voz/cabina', className = '',
}) {
  const safeScenarios = scenarios.length ? scenarios : DEFAULT_AGENT_SIMULATOR_SCENARIOS
  const [scenarioId, setScenarioId] = useState(safeScenarios[0].id)
  const selectedScenario = useMemo(() => safeScenarios.find(item => item.id === scenarioId) || safeScenarios[0], [safeScenarios, scenarioId])
  const [messages, setMessages] = useState(() => initialMessages?.length ? initialMessages : initialConversation(agent, safeScenarios[0]))
  const [draft, setDraft] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [localMetrics, setLocalMetrics] = useState(DEFAULT_METRICS)
  const [notice, setNotice] = useState('')
  const replyTimerRef = useRef(null)
  const connection = normalizeConnection(connectionStatus)
  const displayedMetrics = { ...localMetrics, ...(metrics || {}) }
  const agentName = agent?.name || 'tu agente'

  useEffect(() => () => {
    if (replyTimerRef.current) window.clearTimeout(replyTimerRef.current)
  }, [])

  useEffect(() => {
    if (!selectedScenario) return
    setMessages(initialMessages?.length ? initialMessages : initialConversation(agent, selectedScenario))
    setDraft('')
    setIsThinking(false)
    setNotice('')
    setLocalMetrics(DEFAULT_METRICS)
  }, [selectedScenario?.id])

  const resetConversation = () => {
    if (replyTimerRef.current) window.clearTimeout(replyTimerRef.current)
    setMessages(initialMessages?.length ? initialMessages : initialConversation(agent, selectedScenario))
    setDraft('')
    setIsThinking(false)
    setNotice('Simulación reiniciada')
    setLocalMetrics(DEFAULT_METRICS)
    onReset?.({ scenario: selectedScenario, agent })
  }

  const sendMessage = event => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isThinking || connection.status === 'offline') return
    const userMessage = makeMessage('user', text)
    setMessages(current => [...current, userMessage])
    setDraft('')
    setIsThinking(true)
    setNotice('El agente está preparando una respuesta')
    const startedAt = performance.now()
    onSend?.({ text, scenario: selectedScenario, agent, messages: [...messages, userMessage] })
    replyTimerRef.current = window.setTimeout(() => {
      const assistantMessage = makeMessage('assistant', simulatedReply(selectedScenario.id, text, agentName))
      setMessages(current => [...current, assistantMessage])
      setLocalMetrics(current => ({ latencyMs: Math.max(260, Math.round(performance.now() - startedAt)), turns: current.turns + 1 }))
      setIsThinking(false)
      setNotice('Respuesta lista')
    }, 620)
  }

  const toggleMicrophone = () => {
    const nextListening = !isListening
    setIsListening(nextListening)
    setNotice(nextListening ? 'Micrófono listo para escuchar' : 'Micrófono en pausa')
    onMicToggle?.(nextListening)
  }

  const handleCabin = () => {
    if (onTestInCabin) return onTestInCabin({ agent, scenario: selectedScenario })
    if (typeof window !== 'undefined') window.location.assign(cabinHref)
  }

  return <section className={`agent-simulator-panel ${className}`.trim()} data-agent-simulator>
    <header className="agent-simulator-header">
      <div className="agent-simulator-heading"><span className="agent-simulator-kicker"><RiSparkling2Line /> SIMULADOR DEL AGENTE</span><h2>Ensaya cómo responderá {agentName}</h2><p>Prueba el tono, el flujo y el siguiente paso antes de lanzar una llamada real.</p></div>
      <div className={`agent-simulator-connection is-${connection.status}`} role="status"><span className="agent-simulator-connection-dot" /><span><strong>{connection.label}</strong><small>{connection.detail}</small></span><RiWifiLine aria-hidden="true" /></div>
    </header>
    <div className="agent-simulator-toolbar">
      <label className="agent-simulator-scenario"><span>Escenario de prueba</span><div><select value={selectedScenario.id} onChange={event => { const next = safeScenarios.find(item => item.id === event.target.value) || safeScenarios[0]; setScenarioId(next.id); onScenarioChange?.(next) }} aria-label="Escenario de prueba">{safeScenarios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><RiArrowDownSLine aria-hidden="true" /></div></label>
      <div className="agent-simulator-scenario-copy"><RiCheckLine aria-hidden="true" /><span>{selectedScenario.description}</span></div>
      <div className="agent-simulator-toolbar-actions"><button type="button" className="agent-simulator-secondary-button" onClick={resetConversation}><RiRefreshLine /> Reiniciar</button><button type="button" className="agent-simulator-primary-button" onClick={handleCabin}><RiExternalLinkLine /> Probar en cabina</button></div>
    </div>
    <div className="agent-simulator-layout">
      <div className="agent-simulator-conversation">
        <div className="agent-simulator-conversation-head"><div><span>CONVERSACIÓN DE PRUEBA</span><strong>{selectedScenario.label}</strong></div><span className="agent-simulator-local-badge">Simulación local</span></div>
        <div className="agent-simulator-messages" aria-live="polite">{messages.map(message => <MessageBubble key={message.id} message={message} />)}{isThinking ? <div className="agent-simulator-thinking"><RiLoader4Line /><span>El agente está pensando…</span></div> : null}</div>
        <form className="agent-simulator-composer" onSubmit={sendMessage}>
          <label htmlFor="agent-simulator-draft" className="sr-only">Escribe un mensaje para el agente</label>
          <textarea id="agent-simulator-draft" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="Escribe una respuesta del cliente…" rows={2} disabled={isThinking || connection.status === 'offline'} />
          <div className="agent-simulator-composer-actions"><button type="button" className={`agent-simulator-mic-button${isListening ? ' is-listening' : ''}`} onClick={toggleMicrophone} aria-pressed={isListening}>{isListening ? <RiPauseCircleLine /> : <RiMicLine />}<span>{isListening ? 'Escuchando' : 'Micrófono'}</span></button><button type="submit" className="agent-simulator-send-button" disabled={!draft.trim() || isThinking || connection.status === 'offline'}>{isThinking ? <RiLoader4Line className="is-spinning" /> : <RiSendPlane2Line />}<span>Enviar</span></button></div>
        </form>
        <div className="agent-simulator-composer-foot"><span>Enter para enviar</span><span>Shift + Enter para salto de línea</span></div>
      </div>
      <aside className="agent-simulator-rail" aria-label="Estado de la simulación">
        <section className="agent-simulator-metrics"><div className="agent-simulator-section-title"><span>TELEMETRÍA</span><RiPulseLine /></div><div className="agent-simulator-metric-grid"><div className="agent-simulator-metric"><RiTimeLine /><span>Latencia de respuesta</span><strong>{formatMetric(displayedMetrics.latencyMs, ' ms')}</strong><small>objetivo &lt; 500 ms</small></div><div className="agent-simulator-metric"><RiSendPlane2Line /><span>Turnos simulados</span><strong>{formatMetric(displayedMetrics.turns)}</strong><small>intercambios completados</small></div></div></section>
        <section className="agent-simulator-route-card"><div className="agent-simulator-section-title"><span>RUTA ACTIVA</span><RiSparkling2Line /></div><div className="agent-simulator-route"><span className="is-cyan"><RiMicLine /></span><div><strong>Deepgram Flux</strong><small>Escucha y turn-taking</small></div></div><i className="agent-simulator-route-line" /><div className="agent-simulator-route"><span className="is-violet"><RiSparkling2Line /></span><div><strong>Cerebras · gpt-oss-120b</strong><small>Razonamiento en streaming</small></div></div><i className="agent-simulator-route-line" /><div className="agent-simulator-route"><span className="is-green"><RiPulseLine /></span><div><strong>Fish Audio · S2.1 Pro</strong><small>Voz natural en español</small></div></div></section>
        <div className={`agent-simulator-notice${notice ? ' is-visible' : ''}`} aria-live="polite">{notice || 'Selecciona un escenario para empezar.'}</div>
      </aside>
    </div>
  </section>
}
