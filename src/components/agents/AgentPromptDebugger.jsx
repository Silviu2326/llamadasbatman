import { useMemo, useState } from 'react'
import {
  RiBookOpenLine, RiCheckLine, RiClipboardLine, RiCodeLine, RiFileTextLine,
  RiFlaskLine, RiInformationLine, RiLockLine, RiMessage3Line, RiPlayLine,
  RiRouteLine, RiShieldCheckLine, RiSparkling2Line,
} from 'react-icons/ri'
import './agent-prompt-debugger.css'

const SCENARIOS = [
  { id: 'greeting', label: 'Saludo', description: 'Primeros segundos de la conversación', message: 'Hola, ¿con quién hablo?' },
  { id: 'objection', label: 'Objeción', description: 'El prospecto muestra una duda o resistencia', message: 'Ahora mismo no estoy seguro de que esto nos haga falta.' },
  { id: 'price', label: 'Petición de precio', description: 'El prospecto pide una cifra o condiciones', message: '¿Cuánto cuesta y qué incluye exactamente?' },
]
const DEFAULT_SCENARIO = SCENARIOS[0]

const firstText = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim() || ''
const shorten = (value, length = 140) => {
  const text = firstText(value)
  return text.length > length ? `${text.slice(0, length - 1).trim()}…` : text
}

function resolveContext(agent = {}, draft = {}, playbooks = []) {
  const settings = draft.settings || agent.settings || {}
  const behavior = settings.behavior || {}
  const activePlaybook = playbooks.find(playbook => playbook.id === settings.activePlaybookId)
  const languageCode = firstText(draft.language, agent.language, settings.language).toLowerCase() || 'es'
  const formality = firstText(behavior.formality, settings.formality) || 'auto'
  const strategy = firstText(settings.strategyLabel, settings.strategyName, typeof settings.strategy === 'object' ? settings.strategy.label : settings.strategy, agent.strategyLabel, settings.strategyId) || 'Consulta guiada'
  const goal = firstText(draft.goal, draft.objective, agent.goal, agent.objective, settings.goal) || 'Entender la necesidad y acordar el siguiente paso comercial.'
  const rules = [
    firstText(behavior.openingLine) && `Apertura: ${behavior.openingLine}`,
    firstText(settings.keyMessages) && `Mensajes prioritarios: ${settings.keyMessages}`,
    firstText(behavior.doNotSay, settings.doNotSay) && `Evitar: ${firstText(behavior.doNotSay, settings.doNotSay)}`,
    firstText(draft.systemPrompt, agent.systemPrompt) && `Instrucciones: ${firstText(draft.systemPrompt, agent.systemPrompt)}`,
  ].filter(Boolean)
  return {
    settings, name: firstText(draft.name, agent.name) || 'Este agente',
    role: firstText(draft.role, agent.role, agent.agentType) || 'asistente comercial', goal, strategy,
    playbook: activePlaybook?.name || firstText(settings.playbookName) || 'Sin playbook personalizado',
    languageCode, language: languageCode === 'en' ? 'English' : 'Español',
    formality: formality === 'tu' ? 'Tú, cercano' : formality === 'usted' ? 'Usted, formal' : 'Adaptada al interlocutor',
    rules, voice: firstText(draft.voiceId, agent.voiceId, settings.voiceId) || 'Voz configurada en el agente',
  }
}

function buildPrompt(context, scenario, prospectMessage) {
  const rules = context.rules.length ? context.rules.map(rule => `- ${rule}`).join('\n') : '- Mantén una conversación clara, breve y orientada al objetivo.'
  return [
    'VISTA PREVIA LOCAL · PROMPT COMPILADO', `Actúa como ${context.name}, ${context.role}.`,
    `Idioma: ${context.language}. Formalidad: ${context.formality}.`, `Objetivo: ${context.goal}`,
    `Estrategia: ${context.strategy}. Playbook: ${context.playbook}.`, 'Reglas activas:', rules, '',
    `Escenario de prueba: ${scenario.label}.`, `Mensaje del prospecto: "${prospectMessage}"`,
    'Responde en una intervención natural, sin inventar datos, y termina con un siguiente paso razonable.',
  ].join('\n')
}

function buildResponse(context, scenarioId, prospectMessage) {
  const nextStep = context.formality === 'Usted, formal' ? '¿Le parece si vemos su caso concreto?' : '¿Te parece si vemos tu caso concreto?'
  const role = context.role.toLowerCase()
  const hasPriceQuestion = /precio|coste|cuánto|how much|price/i.test(prospectMessage)
  if (context.languageCode === 'en') {
    if (scenarioId === 'objection') return `I understand the hesitation. As a ${role}, I would first check whether this is relevant for you, without committing you to anything. Would it be useful to look at one concrete use case?`
    if (scenarioId === 'price' || hasPriceQuestion) return 'Of course. The right price depends on what you need and the scope involved, so I do not want to give you a misleading figure without context. Would two quick questions work for you?'
    return `Hello, I’m ${context.name}. I’ll keep this brief: I’d like to understand what you are trying to improve and see whether we can help. Would that be useful?`
  }
  if (scenarioId === 'objection') return `Lo entiendo. Como ${role}, primero quiero comprobar si esto encaja contigo, sin comprometerte a nada. ${nextStep}`
  if (scenarioId === 'price' || hasPriceQuestion) return `Claro. El precio depende de lo que necesites y del alcance, así que prefiero no darte una cifra engañosa sin contexto. ${nextStep}`
  return `Hola, soy ${context.name}. Seré breve: quiero entender qué estás intentando mejorar y comprobar si podemos ayudarte. ${nextStep}`
}

async function copyText(value) {
  if (!value) return false
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true } catch { /* fallback below */ }
  }
  if (typeof document === 'undefined') return false
  const helper = document.createElement('textarea')
  helper.value = value; helper.setAttribute('readonly', ''); helper.style.position = 'fixed'; helper.style.opacity = '0'
  document.body.appendChild(helper); helper.select()
  let copied = false
  try { copied = Boolean(document.execCommand('copy')) } catch { copied = false }
  document.body.removeChild(helper)
  return copied
}

function ContextItem({ icon: Icon, label, value, tone = '' }) {
  return <div className="agent-prompt-context-item"><span className={`agent-prompt-context-icon ${tone}`}><Icon aria-hidden="true" /></span><span><small>{label}</small><strong title={value}>{value}</strong></span></div>
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => { const didCopy = await copyText(value); setCopied(didCopy); window.setTimeout(() => setCopied(false), 1800) }
  return <button type="button" className="agent-prompt-copy" onClick={handleCopy} disabled={!value}>{copied ? <RiCheckLine aria-hidden="true" /> : <RiClipboardLine aria-hidden="true" />}{copied ? 'Copiado' : label}</button>
}

export default function AgentPromptDebugger({ agent = {}, draft = {}, playbooks = [] }) {
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO.id)
  const [message, setMessage] = useState(DEFAULT_SCENARIO.message)
  const [result, setResult] = useState(null)
  const [runCount, setRunCount] = useState(0)
  const context = useMemo(() => resolveContext(agent, draft, playbooks), [agent, draft, playbooks])
  const scenario = SCENARIOS.find(item => item.id === scenarioId) || DEFAULT_SCENARIO
  const prompt = useMemo(() => buildPrompt(context, scenario, message.trim() || scenario.message), [context, scenario, message])
  const runTest = () => { const prospectMessage = message.trim() || scenario.message; setResult({ response: buildResponse(context, scenario.id, prospectMessage) }); setRunCount(count => count + 1) }
  const selectScenario = event => { const next = SCENARIOS.find(item => item.id === event.target.value) || DEFAULT_SCENARIO; setScenarioId(next.id); setMessage(next.message); setResult(null) }
  const guardrails = ['No inventar precios, descuentos, disponibilidad ni resultados.', 'No prometer acciones que el agente no pueda ejecutar.', firstText(context.settings.escalationRules) || 'Escalar cuando la petición salga del objetivo o requiera una excepción.']

  return <section className="agent-prompt-debugger" aria-labelledby="agent-prompt-debugger-title">
    <div className="agent-prompt-debugger-head"><div><span className="agent-prompt-kicker"><RiFlaskLine aria-hidden="true" /> INSPECTOR INTERACTIVO</span><h2 id="agent-prompt-debugger-title">Depura cómo responderá</h2><p>Prueba el contexto del agente antes de abrir una llamada real. Todo se ejecuta localmente en esta vista previa.</p></div><span className="agent-prompt-preview-badge"><RiInformationLine aria-hidden="true" /> Vista previa · sin API</span></div>
    <div className="agent-prompt-debugger-grid">
      <div className="agent-prompt-debugger-main">
        <div className="agent-prompt-test-panel"><div className="agent-prompt-panel-head"><div><span className="agent-prompt-step">01</span><div><h3>Mensaje de prueba</h3><p>Elige una situación y escribe lo que diría el prospecto.</p></div></div><RiMessage3Line aria-hidden="true" /></div><label className="agent-prompt-field"><span>Escenario</span><select value={scenario.id} onChange={selectScenario}>{SCENARIOS.map(item => <option value={item.id} key={item.id}>{item.label} · {item.description}</option>)}</select></label><label className="agent-prompt-field"><span>Mensaje del prospecto</span><textarea value={message} onChange={event => { setMessage(event.target.value); setResult(null) }} rows="5" placeholder="Escribe el mensaje que quieres probar…" /></label><div className="agent-prompt-test-actions"><span>{message.trim().length} caracteres · respuesta determinista</span><button type="button" className="agent-prompt-run" onClick={runTest}><RiPlayLine aria-hidden="true" /> Ejecutar prueba</button></div></div>
        <div className="agent-prompt-output-grid"><article className="agent-prompt-code-panel"><div className="agent-prompt-panel-head"><div><span className="agent-prompt-step">02</span><div><h3>Prompt compilado</h3><p>La instrucción que usaría el agente con este contexto.</p></div></div><CopyButton value={prompt} label="Copiar prompt" /></div><pre className="agent-prompt-code"><code>{prompt}</code></pre></article><article className={`agent-prompt-response-panel${result ? ' has-result' : ''}`}><div className="agent-prompt-panel-head"><div><span className="agent-prompt-step">03</span><div><h3>Respuesta de prueba</h3><p>{result ? `Ejecución local #${runCount}` : 'Ejecuta una prueba para ver una respuesta coherente.'}</p></div></div>{result ? <CopyButton value={result.response} label="Copiar respuesta" /> : <RiSparkling2Line aria-hidden="true" />}</div>{result ? <div className="agent-prompt-response"><span className="agent-prompt-response-label">{context.name}</span><p>{result.response}</p><small>Generada localmente · no se ha enviado ningún mensaje</small></div> : <div className="agent-prompt-empty"><RiPlayLine aria-hidden="true" /><strong>Listo para probar</strong><span>La salida respetará el idioma, objetivo y reglas visibles a la derecha.</span></div>}</article></div>
      </div>
      <aside className="agent-prompt-context-panel" aria-label="Contexto del agente"><div className="agent-prompt-panel-head"><div><span className="agent-prompt-step">CONTEXTO</span><div><h3>Lo que recibe el agente</h3><p>Valores activos en este borrador.</p></div></div><RiCodeLine aria-hidden="true" /></div><div className="agent-prompt-context-list"><ContextItem icon={RiMessage3Line} label="Idioma" value={context.language} tone="is-cyan" /><ContextItem icon={RiLockLine} label="Formalidad" value={context.formality} /><ContextItem icon={RiRouteLine} label="Objetivo" value={shorten(context.goal)} /><ContextItem icon={RiSparkling2Line} label="Estrategia" value={context.strategy} tone="is-violet" /><ContextItem icon={RiBookOpenLine} label="Playbook" value={context.playbook} /><ContextItem icon={RiInformationLine} label="Voz de referencia" value={context.voice} /></div><div className="agent-prompt-rules"><div className="agent-prompt-subhead"><span><RiFileTextLine aria-hidden="true" /> Reglas activas</span><b>{context.rules.length}</b></div>{context.rules.length ? <ul>{context.rules.map((rule, index) => <li key={`${rule}-${index}`}>{shorten(rule, 170)}</li>)}</ul> : <p className="agent-prompt-muted">No hay reglas adicionales; se aplican las instrucciones base.</p>}</div><div className="agent-prompt-guardrails"><div className="agent-prompt-subhead"><span><RiShieldCheckLine aria-hidden="true" /> Guardrails</span><b>Siempre</b></div><ul>{guardrails.map((guardrail, index) => <li key={`${guardrail}-${index}`}><RiCheckLine aria-hidden="true" />{shorten(guardrail, 170)}</li>)}</ul></div></aside>
    </div>
    <div className="agent-prompt-local-note"><RiInformationLine aria-hidden="true" /><span><strong>Solo vista previa.</strong> Esta herramienta no llama a Cerebras, Deepgram ni Fish Audio y no modifica la configuración guardada del agente.</span></div>
  </section>
}
