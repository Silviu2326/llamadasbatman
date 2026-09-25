import { useEffect, useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormToggle from '../components/forms/FormToggle'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'
import { directionMismatch, playbookFor } from '../lib/agentPlaybooks'
import { strategiesForAgent, strategyForAgent } from '../lib/callStrategies'
import { useI18n } from '../i18n'
import { RiArrowLeftLine, RiArrowRightLine, RiCheckLine } from 'react-icons/ri'
import AgentVoicePicker from '../components/agents/AgentVoicePicker'
import { apiErrorMessage, readBody } from '../components/agents/agentLifecycle'

const ROLES = ['Ventas SaaS', 'Recuperación de leads', 'Renovaciones', 'Cierre agresivo', 'Soporte preventa', 'Cross-selling', 'Welcome calls', 'Encuestas NPS']

const AGENT_TYPES = [
  { value: 'sales', es: 'Ventas', en: 'Sales' },
  { value: 'receptionist', es: 'Recepción', en: 'Receptionist' },
  { value: 'qualification', es: 'Cualificación', en: 'Lead qualification' },
  { value: 'appointment', es: 'Citas', en: 'Appointment setter' },
  { value: 'support', es: 'Soporte', en: 'Customer support' },
  { value: 'collections', es: 'Cobros y renovaciones', en: 'Collections and renewals' },
  { value: 'handoff', es: 'Transferencia a humano', en: 'Human handoff' },
]

const CALL_DIRECTIONS = [
  { value: 'inbound', es: 'Recibe llamadas', en: 'Receives calls' },
  { value: 'outbound', es: 'Realiza llamadas', en: 'Makes calls' },
  { value: 'both', es: 'Entrante y saliente', en: 'Inbound and outbound' },
]

const LANGUAGES = [
  { value: 'es', es: 'Español', en: 'Spanish' },
  { value: 'en', es: 'Inglés', en: 'English' },
]

// Los mismos valores que acepta el backend (agentSettingsSchema.speechSpeed).
const SPEECH_SPEEDS = ['0.8', '0.9', '1.0', '1.1', '1.2']

// Comportamiento en llamada: los valores viajan tal cual a
// Agent.settings.behavior y el backend los traduce a directivas del prompt
// (backend/src/voice/intelligence/promptContext.ts).
const FORMALITY = [
  { value: 'auto', es: 'Automático (según el lead)', en: 'Automatic (follow the lead)' },
  { value: 'tu', es: 'Tuteo', en: 'Informal' },
  { value: 'usted', es: 'De usted', en: 'Formal' },
]

const VERBOSITY = [
  { value: 'brief', es: 'Breve (1-2 frases)', en: 'Brief (1-2 sentences)' },
  { value: 'balanced', es: 'Equilibrada (2-3 frases)', en: 'Balanced (2-3 sentences)' },
  { value: 'detailed', es: 'Detallada (hasta 4 frases)', en: 'Detailed (up to 4 sentences)' },
]

// Punto de partida editable: una estructura vacía es la que nadie rellena.
const STRUCTURE_TEMPLATES = {
  sales: '1. Saludo y motivo de la llamada. 2. Permiso para hacer preguntas. 3. Diagnóstico de la situación. 4. Propuesta con precio. 5. Cierre o siguiente paso.',
  receptionist: '1. Saludo con el nombre de la empresa. 2. Identificar el motivo. 3. Resolver o transferir. 4. Confirmar que queda cubierto.',
  qualification: '1. Presentación breve. 2. Presupuesto, decisor y plazo. 3. Encaje con el producto. 4. Cierre con siguiente paso.',
  appointment: '1. Saludo y motivo. 2. Valor de la reunión en una frase. 3. Proponer dos huecos concretos. 4. Confirmar fecha y datos de contacto.',
  support: '1. Saludo y escucha del problema. 2. Confirmar lo entendido. 3. Solución o escalado. 4. Verificar que queda resuelto.',
  collections: '1. Identificación y motivo. 2. Confirmar la deuda. 3. Acordar fecha y medio de pago. 4. Recapitular el compromiso.',
  handoff: '1. Saludo. 2. Recoger motivo y datos. 3. Anunciar la transferencia. 4. Transferir.',
}

export default function NewAgenteModal({ onClose, onSuccess }) {
  const { t, locale } = useI18n()
  const en = locale === 'en'
  // Sin `subrole`, `personality`, tiempo máximo ni reintentos: no los consume
  // nadie en el backend. `maxCallsPerDay` sí (voice/agentLimits.ts).
  const [form, setForm] = useState({
    name: '', role: 'Ventas SaaS', agentType: 'sales', callDirection: 'both', strategyId: '', description: '',
    language: en ? 'en' : 'es', voiceId: '', voiceName: '', phoneNumber: '', speechSpeed: '1.0', keyMessages: '', escalationRules: '',
    maxCallsPerDay: '',
    formality: 'auto', verbosity: 'balanced', openingLine: '', structure: '', doNotSay: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [sharedSources, setSharedSources] = useState(null)
  const [step, setStep] = useState(0)

  const steps = en
    ? [
        { title: 'Identity', description: 'Give your agent a clear role and name.' },
        { title: 'Mission', description: 'Tell it what to achieve on every call.' },
        { title: 'Voice & calls', description: 'Choose how it sounds and where it calls from.' },
        { title: 'Behaviour', description: 'Set the tone and guardrails for conversations.' },
      ]
    : [
        { title: 'Identidad', description: 'Dale un nombre y un papel claro a tu agente.' },
        { title: 'Objetivo', description: 'Cuéntale qué debe conseguir en cada llamada.' },
        { title: 'Voz y llamadas', description: 'Elige cómo suena y desde dónde llamará.' },
        { title: 'Comportamiento', description: 'Define el tono y los límites de sus conversaciones.' },
      ]

  useEffect(() => {
    let active = true
    apiFetch('/api/settings/business-profile')
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active) setSharedSources(data?.readiness ?? false) })
      .catch(() => { if (active) setSharedSources(false) })
    return () => { active = false }
  }, [])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const strategyOptions = strategiesForAgent(form.agentType, form.callDirection)
  const selectedStrategy = strategyForAgent(form.strategyId, form.agentType, form.callDirection)

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    // Mismo contrato que la ficha del agente y backend/src/voice/agentLimits.ts.
    const maxCallsPerDay = Number(form.maxCallsPerDay)
    const hasLimits = Number.isInteger(maxCallsPerDay) && maxCallsPerDay > 0
    try {
      const res = await apiFetch('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          role: form.role,
          agentType: form.agentType,
          callDirection: form.callDirection,
          language: form.language,
          voiceId: form.voiceId.trim() || undefined,
          phoneNumber: form.phoneNumber.trim() || undefined,
          systemPrompt: form.description || undefined,
          settings: {
            strategyId: selectedStrategy.id,
            speechSpeed: form.speechSpeed,
            ...(form.voiceId.trim() ? { voiceSelection: { id: form.voiceId.trim(), name: form.voiceName || 'Voz elegida' } } : {}),
            ...(form.keyMessages.trim() ? { keyMessages: form.keyMessages.trim() } : {}),
            ...(form.escalationRules.trim() ? { escalationRules: form.escalationRules.trim() } : {}),
            ...(hasLimits ? { operationalLimits: { maxCallsPerDay } } : {}),
            behavior: {
              formality: form.formality,
              verbosity: form.verbosity,
              ...(form.openingLine.trim() ? { openingLine: form.openingLine.trim() } : {}),
              ...(form.structure.trim() ? { structure: form.structure.trim() } : {}),
              ...(form.doNotSay.trim() ? { doNotSay: form.doNotSay.trim() } : {}),
            },
          },
        }),
      })
      if (!res.ok) { setError(apiErrorMessage(await readBody(res), t('modal.createError'))); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  function nextStep() {
    setError(null)
    if (step === 0 && !form.name.trim()) {
      setError(en ? 'Add a name to continue.' : 'Añade un nombre para continuar.')
      return
    }
    if (step === 2 && form.phoneNumber.trim() && !/^\+[1-9]\d{7,14}$/.test(form.phoneNumber.trim())) {
      setError(en ? 'Use an international phone number, for example +34910000000.' : 'Usa un número internacional, por ejemplo +34910000000.')
      return
    }
    if (step < steps.length - 1) setStep(current => current + 1)
  }

  function previousStep() {
    setError(null)
    setStep(current => Math.max(0, current - 1))
  }

  function handleFormSubmit() {
    if (step < steps.length - 1) nextStep()
    else handleSubmit()
  }

  const stepHeader = (
    <div className="new-agent-step-header" style={{ margin: 0, padding: '13px 14px 12px', border: '1px solid var(--line)', borderRadius: 12, background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--surface-2)), var(--surface-2))' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <p style={{ margin: 0, color: 'var(--accent-soft)', fontSize: 10.5, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase' }}>{en ? `Step ${step + 1} of ${steps.length}` : `Paso ${step + 1} de ${steps.length}`}</p>
          <h4 style={{ margin: '5px 0 2px', color: 'var(--text-strong)', fontSize: 18, lineHeight: 1.2 }}>{steps[step].title}</h4>
          <p style={{ margin: 0, color: 'var(--dim)', fontSize: 12 }}>{steps[step].description}</p>
        </div>
        <div aria-hidden="true" style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {steps.map((item, index) => (
            <span className={`new-agent-step-dot ${index === step ? 'is-current' : ''}`} key={item.title} style={{ width: index === step ? 24 : 8, height: 8, borderRadius: 99, background: index <= step ? 'var(--accent)' : 'var(--line-control)', transition: 'all .2s' }} />
          ))}
        </div>
      </div>
      <div style={{ height: 4, marginTop: 12, borderRadius: 99, background: 'var(--line)', overflow: 'hidden' }}>
        <div className="new-agent-progress-fill" style={{ width: `${((step + 1) / steps.length) * 100}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,var(--accent),var(--violet-deep))', transition: 'width .25s ease' }} />
      </div>
    </div>
  )

  const footer = (
    <div className="new-agent-modal-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
      <button className="new-agent-back-button" type="button" onClick={step === 0 ? onClose : previousStep} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 14px', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .6 : 1 }}>
        {step === 0 ? t('common.cancel') : <><RiArrowLeftLine aria-hidden="true" />{en ? 'Back' : 'Atrás'}</>}
      </button>
      <button className="new-agent-next-button" type="button" onClick={step === steps.length - 1 ? handleSubmit : nextStep} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))', border: 'none', borderRadius: 9, padding: '9px 17px', color: '#fff', fontSize: 13, fontWeight: 650, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .6 : 1, boxShadow: '0 0 20px #6366f140' }}>
        {step === steps.length - 1 ? <><RiCheckLine aria-hidden="true" />{saving ? t('common.saving') : (en ? 'Create agent' : 'Crear agente')}</> : <>{en ? 'Continue' : 'Continuar'}<RiArrowRightLine aria-hidden="true" /></>}
      </button>
    </div>
  )

  return (
    <FormModal title={t('modal.newAgent')} onClose={onClose} onSubmit={handleFormSubmit} submitDisabled={saving} size="lg" footer={footer} className="new-agent-modal">
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
      {stepHeader}
      <div className="new-agent-step-content" key={step}>
      {step === 0 && <>
        <FormInput label={t('modal.agentName')} value={form.name} onChange={e => update('name', e.target.value)} placeholder={locale === 'en' ? 'e.g. Sofia' : 'Ej. Sofía'} required data-autofocus />
        <FormSelect label="Rol" value={form.role} onChange={e => update('role', e.target.value)} options={ROLES} required />
        <div style={{ padding: '12px 13px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
          <p style={{ margin: 0, color: 'var(--text)', fontSize: 12.5, fontWeight: 700 }}>{en ? 'A focused agent is easier to train' : 'Un agente enfocado es más fácil de entrenar'}</p>
          <p style={{ margin: '4px 0 0', color: 'var(--dim)', fontSize: 12, lineHeight: 1.45 }}>{en ? 'You can refine the details later from the agent page.' : 'Podrás ajustar todos los detalles después desde la ficha del agente.'}</p>
        </div>
      </>}

      {step === 1 && <>
        <FormRow>
          <FormSelect label={en ? 'Agent type' : 'Tipo de agente'} value={form.agentType} onChange={e => update('agentType', e.target.value)} options={AGENT_TYPES.map(item => ({ value: item.value, label: item[en ? 'en' : 'es'] }))} required />
          <FormSelect label={en ? 'Call direction' : 'Dirección de llamadas'} value={form.callDirection} onChange={e => update('callDirection', e.target.value)} options={CALL_DIRECTIONS.map(item => ({ value: item.value, label: item[en ? 'en' : 'es'] }))} required />
        </FormRow>
        <FormSelect label={en ? 'Call strategy' : 'Estrategia de llamada'} value={selectedStrategy.id} onChange={e => update('strategyId', e.target.value)} options={strategyOptions.map(strategy => ({ value: strategy.id, label: strategy.label }))} required />
        <div style={{ padding: '11px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>{playbookFor(form.agentType).summary}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--dim)' }}>{playbookFor(form.agentType).detail}</p>
          <p style={{ margin: '8px 0 0', paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--accent-soft)', fontWeight: 650 }}>{selectedStrategy.label}: <span style={{ color: 'var(--dim)', fontWeight: 400 }}>{selectedStrategy.summary}</span></p>
          {directionMismatch(form.agentType, form.callDirection) && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--warn-soft)' }}>{directionMismatch(form.agentType, form.callDirection)} {en ? 'The agent will adapt the greeting to the real call direction.' : 'El agente adaptará el saludo a la dirección real de cada llamada.'}</p>}
        </div>
        <div className="new-agent-sources" style={{ padding: '11px 12px', border: '1px solid color-mix(in srgb, var(--success) 32%, var(--line))', borderRadius: 10, background: 'color-mix(in srgb, var(--success) 5%, var(--surface-2))' }}>
          <p style={{ margin: 0, color: 'var(--text)', fontSize: 12.5, fontWeight: 700 }}>{en ? 'Shared sources included automatically' : 'Fuentes compartidas incluidas automáticamente'}</p>
          <p style={{ margin: '4px 0 8px', color: 'var(--dim)', fontSize: 11.5, lineHeight: 1.45 }}>{en ? 'Your company information, prices and Knowledge Base will be available on every call.' : 'El nuevo agente usará la información de empresa, precios y Knowledge Base en todas sus llamadas.'}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            <span style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 7, color: sharedSources?.profileReady ? 'var(--success)' : 'var(--warn-soft)', fontSize: 10.5 }}>{en ? 'Company' : 'Empresa'} {sharedSources?.profileReady ? (en ? 'ready' : 'lista') : (en ? 'pending' : 'pendiente')}</span>
            <span style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 7, color: sharedSources?.activeOffers > 0 ? 'var(--success)' : 'var(--warn-soft)', fontSize: 10.5 }}>{sharedSources?.activeOffers ?? 0} {en ? 'active prices' : 'precios activos'}</span>
            <span style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 7, color: sharedSources?.knowledgeCount > 0 ? 'var(--success)' : 'var(--warn-soft)', fontSize: 10.5 }}>{sharedSources?.knowledgeCount ?? 0} {en ? 'Knowledge articles' : 'artículos Knowledge'}</span>
          </div>
        </div>
        <FormTextarea label={t('modal.objective')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={locale === 'en' ? "Describe the agent's primary objective…" : 'Describe el objetivo principal del agente…'} />
      </>}

      {step === 2 && <details className="new-agent-section new-agent-section-voice" open style={{ border: '1px solid color-mix(in srgb, var(--accent) 26%, var(--line))', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 4%, var(--surface-2))' }}>
        <summary style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: 'var(--text)' }}>{en ? 'Voice and calling number' : 'Voz y número de llamadas'} <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--dim)' }}>{en ? 'Configure now or later' : 'Configúralos ahora o después'}</span></summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 12px 14px' }}>
          <FormRow>
            <FormSelect label={en ? 'Language' : 'Idioma'} value={form.language} onChange={e => update('language', e.target.value)} options={LANGUAGES.map(item => ({ value: item.value, label: item[en ? 'en' : 'es'] }))} />
            <FormInput label={en ? 'Outgoing phone number' : 'Número desde el que llamará'} value={form.phoneNumber} onChange={e => update('phoneNumber', e.target.value)} type="tel" inputMode="tel" pattern="\\+[1-9]\\d{7,14}" placeholder="+34910000000" hint={en ? 'Use international format. You can assign it later.' : 'Usa formato internacional. También puedes asignarlo después.'} />
            <FormSelect label={en ? 'Speech speed' : 'Velocidad de habla'} value={form.speechSpeed} onChange={e => update('speechSpeed', e.target.value)} options={SPEECH_SPEEDS.map(speed => ({ value: speed, label: `${speed}×` }))} />
          </FormRow>
          {/* Selector real del catálogo (GET /agents/voices). El backend rechaza un identificador ajeno con 422. */}
          <AgentVoicePicker agentId={null} value={form.voiceId} selection={form.voiceId ? { id: form.voiceId, name: form.voiceName } : null} language={form.language} onChange={(voiceId, name) => setForm(prev => ({ ...prev, voiceId, voiceName: name || '' }))} />
          <FormInput label={en ? 'Max calls/day' : 'Máx. llamadas/día'} type="number" min="1" max="10000" value={form.maxCallsPerDay} onChange={e => update('maxCallsPerDay', e.target.value)} placeholder={en ? 'No limit' : 'Sin límite'} hint={en ? 'Applied by the call worker before dialing. Leave empty for no limit.' : 'Lo aplica el worker antes de marcar. Vacío: sin límite.'} />
        </div>
      </details>}

      {step === 3 && <details className="new-agent-section" open style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-2)' }}>
        <summary style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: 'var(--text)' }}>{en ? 'How it should behave on the call' : 'Cómo se debe comportar en la llamada'}</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 12px 14px' }}>
          <FormRow>
            <FormSelect label={en ? 'Form of address' : 'Tratamiento'} value={form.formality} onChange={e => update('formality', e.target.value)} options={FORMALITY.map(item => ({ value: item.value, label: item[en ? 'en' : 'es'] }))} />
            <FormSelect label={en ? 'Answer length' : 'Longitud de respuesta'} value={form.verbosity} onChange={e => update('verbosity', e.target.value)} options={VERBOSITY.map(item => ({ value: item.value, label: item[en ? 'en' : 'es'] }))} />
          </FormRow>
          <FormInput label={en ? 'Opening line' : 'Frase de apertura'} value={form.openingLine} onChange={e => update('openingLine', e.target.value)} maxLength={300} placeholder={en ? 'Hi, this is Sofia from Vendrava — do you have two minutes?' : 'Hola, soy Sofía de Vendrava, ¿tienes dos minutos?'} hint={en ? 'Said verbatim as the first sentence. Leave empty to let the strategy choose it.' : 'Se dice literal como primera frase. Vacío: la elige la estrategia.'} />
          <div>
            <FormTextarea label={en ? 'Call structure' : 'Estructura de la llamada'} value={form.structure} onChange={e => update('structure', e.target.value)} rows={4} placeholder={STRUCTURE_TEMPLATES[form.agentType]} />
            <button type="button" onClick={() => update('structure', STRUCTURE_TEMPLATES[form.agentType] ?? '')} style={{ marginTop: 6, background: 'transparent', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 9px', color: 'var(--accent-soft)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{en ? 'Use the template for this agent type' : 'Usar la plantilla de este tipo de agente'}</button>
          </div>
          <FormTextarea label={en ? 'Key messages' : 'Mensajes clave'} value={form.keyMessages} onChange={e => update('keyMessages', e.target.value)} placeholder={en ? 'Points the agent must always mention…' : 'Puntos que el agente debe mencionar siempre…'} />
          <FormTextarea label={en ? 'Escalation rules' : 'Reglas de escalado'} value={form.escalationRules} onChange={e => update('escalationRules', e.target.value)} placeholder={en ? 'When to transfer to a human…' : 'Cuándo transferir a una persona…'} />
          <FormTextarea label={en ? 'Never say' : 'Qué no debe decir nunca'} value={form.doNotSay} onChange={e => update('doNotSay', e.target.value)} placeholder={en ? 'No discounts, no delivery dates, never name competitors…' : 'Nada de descuentos, ni plazos de entrega, ni nombrar a la competencia…'} />
        </div>
      </details>}
      </div>
    </FormModal>
  )
}
