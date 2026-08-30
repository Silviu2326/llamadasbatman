import { useId, useRef, useState } from 'react'
import {
  RiAlertLine,
  RiArrowRightLine,
  RiCheckLine,
  RiLockLine,
  RiMessage2Line,
  RiPriceTag3Line,
  RiShieldCheckLine,
  RiUser3Line,
} from 'react-icons/ri'
import './agent-safety.css'

function GuardrailState({ complete }) {
  return <span className={`agent-safety-state${complete ? ' is-active' : ' is-incomplete'}`}>
    {complete ? <RiCheckLine aria-hidden="true" /> : <RiAlertLine aria-hidden="true" />}
    {complete ? 'Activo' : 'Incompleto'}
  </span>
}

function GuardrailCard({ rule, onFocusRule }) {
  const { Icon } = rule

  return <article className={`agent-safety-rule${rule.complete ? ' is-complete' : ' is-incomplete'}`}>
    <div className="agent-safety-rule-head">
      <div className="agent-safety-rule-title">
        <span className="agent-safety-rule-icon"><Icon aria-hidden="true" /></span>
        <div>
          <span className="agent-safety-rule-index">Regla {rule.index}</span>
          <h3>{rule.title}</h3>
        </div>
      </div>
      <GuardrailState complete={rule.complete} />
    </div>

    <p className="agent-safety-rule-description">{rule.description}</p>

    <label className="agent-safety-editor-label" htmlFor={rule.inputId}>
      <span>{rule.fieldLabel}</span>
      <small>{rule.field}</small>
    </label>
    <textarea
      ref={rule.inputRef}
      id={rule.inputId}
      value={rule.value}
      onChange={event => rule.onChange(event.target.value)}
      placeholder={rule.placeholder}
      aria-describedby={`${rule.inputId}-hint`}
    />
    <div className="agent-safety-rule-footer">
      <span id={`${rule.inputId}-hint`} className="agent-safety-rule-hint">Una regla activa se aplica a las nuevas conversaciones.</span>
      <button type="button" className="agent-safety-complete-cta" onClick={() => onFocusRule(rule.id)}>
        {rule.complete ? 'Revisar regla' : 'Completar regla'}
        <RiArrowRightLine aria-hidden="true" />
      </button>
    </div>
  </article>
}

export default function AgentSafetyPanel({ draft, onChange }) {
  const [focusedRule, setFocusedRule] = useState('')
  const inputRefs = useRef({})
  const panelId = useId()
  const settings = draft?.settings || {}
  const behavior = settings.behavior || {}
  const values = {
    escalationRules: settings.escalationRules || '',
    keyMessages: settings.keyMessages || '',
    doNotSay: behavior.doNotSay || '',
  }

  const updateSetting = (key, value) => {
    onChange?.({ settings: { ...settings, [key]: value } })
  }

  const updateBehavior = (key, value) => {
    onChange?.({ settings: { ...settings, behavior: { ...behavior, [key]: value } } })
  }

  const rules = [
    {
      id: 'escalation',
      index: '01',
      Icon: RiUser3Line,
      title: 'Escalado a una persona',
      description: 'Define cuándo debe detener la conversación y pedir intervención humana.',
      fieldLabel: 'Cuándo escalar',
      field: 'settings.escalationRules',
      value: values.escalationRules,
      placeholder: 'Describe las situaciones que requieren pasar la conversación a una persona…',
      onChange: value => updateSetting('escalationRules', value),
    },
    {
      id: 'commercial',
      index: '02',
      Icon: RiPriceTag3Line,
      title: 'Promesas y precio',
      description: 'Alinea los mensajes aprobados y los límites sobre precios, plazos o resultados.',
      fieldLabel: 'Mensajes y límites comerciales',
      field: 'settings.keyMessages',
      value: values.keyMessages,
      placeholder: 'Escribe lo que puede afirmar y los límites que debe respetar…',
      onChange: value => updateSetting('keyMessages', value),
    },
    {
      id: 'risk',
      index: '03',
      Icon: RiShieldCheckLine,
      title: 'Señales de riesgo',
      description: 'Indica qué lenguaje debe evitar cuando detecte frustración, riesgo o una petición sensible.',
      fieldLabel: 'Qué debe evitar ante una señal de riesgo',
      field: 'settings.behavior.doNotSay',
      value: values.doNotSay,
      placeholder: 'Añade afirmaciones, compromisos o expresiones que nunca debe usar…',
      onChange: value => updateBehavior('doNotSay', value),
    },
  ].map(rule => ({
    ...rule,
    complete: Boolean(rule.value.trim()),
    inputId: `${panelId}-${rule.id}`,
    inputRef: node => { inputRefs.current[rule.id] = node },
  }))

  const activeCount = rules.filter(rule => rule.complete).length
  const allActive = activeCount === rules.length

  const focusRule = id => {
    setFocusedRule(id)
    requestAnimationFrame(() => {
      const input = inputRefs.current[id]
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      input?.focus({ preventScroll: true })
    })
  }

  return <section className="agent-safety-panel" aria-labelledby={`${panelId}-title`}>
    <header className="agent-safety-header">
      <div className="agent-safety-heading">
        <span className="agent-safety-icon"><RiLockLine aria-hidden="true" /></span>
        <div>
          <span className="agent-safety-kicker">CONTROL DE CONVERSACIÓN</span>
          <h2 id={`${panelId}-title`}>Protección del agente</h2>
          <p>Revisa los límites que guían sus respuestas y decide cuándo debe pedir ayuda.</p>
        </div>
      </div>
      <div className={`agent-safety-overall${allActive ? ' is-complete' : ''}`} aria-live="polite">
        <span className="agent-safety-overall-icon">{allActive ? <RiShieldCheckLine aria-hidden="true" /> : <RiAlertLine aria-hidden="true" />}</span>
        <span><strong>{activeCount} de {rules.length} reglas activas</strong><small>{allActive ? 'Protección completa' : 'Completa las reglas pendientes'}</small></span>
      </div>
    </header>

    <div className="agent-safety-summary">
      <div className="agent-safety-summary-mark"><RiShieldCheckLine aria-hidden="true" /></div>
      <div>
        <strong>Resumen de protección</strong>
        <p>{allActive ? 'El agente tiene definidos los tres límites principales para escalar, hablar de negocio y responder ante riesgo.' : 'El agente solo aplicará los límites que ya tengan contenido. Completa cada regla para cerrar los huecos de protección.'}</p>
      </div>
      <div className="agent-safety-summary-list" aria-label="Estado de las reglas">
        {rules.map(rule => <span key={rule.id} className={rule.complete ? 'is-active' : 'is-incomplete'}><i />{rule.index}</span>)}
      </div>
    </div>

    <div className="agent-safety-rules" aria-label="Reglas de protección">
      {rules.map(rule => <div className={focusedRule === rule.id ? 'is-focused' : ''} key={rule.id}><GuardrailCard rule={rule} onFocusRule={focusRule} /></div>)}
    </div>

    <footer className="agent-safety-note">
      <RiMessage2Line aria-hidden="true" />
      <span>Estas reglas se guardan junto a la configuración del agente y se incorporan a sus instrucciones de conversación.</span>
    </footer>
  </section>
}
