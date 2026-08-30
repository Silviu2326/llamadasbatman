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

// Voz por defecto del pipeline (backend/src/voice/pipelines/vendravaProtocol.ts).
const DEFAULT_VOICE_ID = ''

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
  const [form, setForm] = useState({
    name: '', role: 'Ventas SaaS', agentType: 'sales', callDirection: 'both', strategyId: '', subrole: '', description: '', personality: '',
    language: en ? 'en' : 'es', voiceId: '', speechSpeed: '1.0', keyMessages: '', escalationRules: '',
    maxCallsPerDay: '', maxCallDuration: '', autoRetries: '',
    formality: 'auto', verbosity: 'balanced', openingLine: '', structure: '', doNotSay: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [sharedSources, setSharedSources] = useState(null)

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
    // Mismo esqueleto que lee la ficha del agente (AgentDetailPage): los límites
    // van bajo `operationalLimits` y solo si el usuario ha rellenado alguno.
    const limits = {
      maxCallsPerDay: form.maxCallsPerDay,
      maxCallDuration: form.maxCallDuration,
      autoRetries: form.autoRetries,
    }
    const hasLimits = Object.values(limits).some(value => String(value).trim() !== '')
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
          personality: form.personality || undefined,
          systemPrompt: form.description || undefined,
          settings: {
            strategyId: selectedStrategy.id,
            speechSpeed: form.speechSpeed,
            ...(form.keyMessages.trim() ? { keyMessages: form.keyMessages.trim() } : {}),
            ...(form.escalationRules.trim() ? { escalationRules: form.escalationRules.trim() } : {}),
            ...(hasLimits ? { operationalLimits: limits } : {}),
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
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal title={t('modal.newAgent')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : t('modal.createAgent')} submitDisabled={saving} size="lg">
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label={t('modal.agentName')} value={form.name} onChange={e => update('name', e.target.value)} placeholder={locale === 'en' ? 'e.g. Sofia' : 'Ej. Sofía'} required />
      <FormRow>
        <FormSelect label="Rol" value={form.role} onChange={e => update('role', e.target.value)} options={ROLES} required />
        <FormInput label={t('modal.subrole')} value={form.subrole} onChange={e => update('subrole', e.target.value)} placeholder={locale === 'en' ? 'e.g. Outbound specialist' : 'Ej. Especialista en outbound'} />
      </FormRow>
      <FormSelect
        label={locale === 'en' ? 'Call strategy' : 'Estrategia de llamada'}
        value={selectedStrategy.id}
        onChange={e => update('strategyId', e.target.value)}
        options={strategyOptions.map(strategy => ({ value: strategy.id, label: strategy.label }))}
        required
      />
      <FormRow>
        <FormSelect
          label={locale === 'en' ? 'Agent type' : 'Tipo de agente'}
          value={form.agentType}
          onChange={e => update('agentType', e.target.value)}
          options={AGENT_TYPES.map(item => ({ value: item.value, label: item[locale === 'en' ? 'en' : 'es'] }))}
          required
        />
        <FormSelect
          label={locale === 'en' ? 'Call direction' : 'Dirección de llamadas'}
          value={form.callDirection}
          onChange={e => update('callDirection', e.target.value)}
          options={CALL_DIRECTIONS.map(item => ({ value: item.value, label: item[locale === 'en' ? 'en' : 'es'] }))}
          required
        />
      </FormRow>
      {/* El tipo ya no es decorativo: decide el saludo, el objetivo y si el
          agente puede transferir. Conviene que se vea antes de crearlo. */}
      <div style={{ margin: '-4px 0 12px', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>{playbookFor(form.agentType).summary}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--dim)' }}>{playbookFor(form.agentType).detail}</p>
        <p style={{ margin: '8px 0 0', paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--accent-soft)', fontWeight: 650 }}>{selectedStrategy.label}: <span style={{ color: 'var(--dim)', fontWeight: 400 }}>{selectedStrategy.summary}</span></p>
        {directionMismatch(form.agentType, form.callDirection) && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--warn-soft)' }}>
            {directionMismatch(form.agentType, form.callDirection)} Puedes dejarlo así: el agente adapta el saludo a la dirección real de cada llamada.
          </p>
        )}
      </div>
      <div className="new-agent-sources" style={{ margin: '-2px 0 12px', padding: '11px 12px', border: '1px solid color-mix(in srgb, var(--success) 32%, var(--line))', borderRadius: 10, background: 'color-mix(in srgb, var(--success) 5%, var(--surface-2))' }}>
        <p style={{ margin: 0, color: 'var(--text)', fontSize: 12.5, fontWeight: 700 }}>Fuentes compartidas incluidas automáticamente</p>
        <p style={{ margin: '4px 0 8px', color: 'var(--dim)', fontSize: 11.5, lineHeight: 1.45 }}>El nuevo agente usará la información de empresa, precios y Knowledge Base en todas sus llamadas.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          <span style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 7, color: sharedSources?.profileReady ? 'var(--success)' : 'var(--warn-soft)', fontSize: 10.5 }}>Empresa {sharedSources?.profileReady ? 'lista' : 'pendiente'}</span>
          <span style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 7, color: sharedSources?.activeOffers > 0 ? 'var(--success)' : 'var(--warn-soft)', fontSize: 10.5 }}>{sharedSources?.activeOffers ?? 0} precios activos</span>
          <span style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 7, color: sharedSources?.knowledgeCount > 0 ? 'var(--success)' : 'var(--warn-soft)', fontSize: 10.5 }}>{sharedSources?.knowledgeCount ?? 0} artículos Knowledge</span>
        </div>
      </div>
      <FormTextarea label={t('modal.objective')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={locale === 'en' ? "Describe the agent's primary objective…" : 'Describe el objetivo principal del agente…'} />
      <FormInput label={t('modal.personality')} value={form.personality} onChange={e => update('personality', e.target.value)} placeholder={locale === 'en' ? 'Empathetic, consultative, professional…' : 'Empática, consultiva, profesional…'} />

      {/* Todo lo de abajo tiene valor por defecto y también se puede cambiar
          después en la ficha del agente: va plegado para no alargar el alta. */}
      <details open style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-2)' }}>
        <summary style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: 'var(--text)' }}>
          {en ? 'How it should behave on the call' : 'Cómo se debe comportar en la llamada'}
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 12px 14px' }}>
          <FormRow>
            <FormSelect
              label={en ? 'Form of address' : 'Tratamiento'}
              value={form.formality}
              onChange={e => update('formality', e.target.value)}
              options={FORMALITY.map(item => ({ value: item.value, label: item[en ? 'en' : 'es'] }))}
            />
            <FormSelect
              label={en ? 'Answer length' : 'Longitud de respuesta'}
              value={form.verbosity}
              onChange={e => update('verbosity', e.target.value)}
              options={VERBOSITY.map(item => ({ value: item.value, label: item[en ? 'en' : 'es'] }))}
            />
          </FormRow>
          <FormInput
            label={en ? 'Opening line' : 'Frase de apertura'}
            value={form.openingLine}
            onChange={e => update('openingLine', e.target.value)}
            maxLength={300}
            placeholder={en ? 'Hi, this is Sofia from Vendrava — do you have two minutes?' : 'Hola, soy Sofía de Vendrava, ¿tienes dos minutos?'}
            hint={en ? 'Said verbatim as the first sentence. Leave empty to let the strategy choose it.' : 'Se dice literal como primera frase. Vacío: la elige la estrategia.'}
          />
          <div>
            <FormTextarea
              label={en ? 'Call structure' : 'Estructura de la llamada'}
              value={form.structure}
              onChange={e => update('structure', e.target.value)}
              rows={4}
              placeholder={STRUCTURE_TEMPLATES[form.agentType]}
            />
            <button
              type="button"
              onClick={() => update('structure', STRUCTURE_TEMPLATES[form.agentType] ?? '')}
              style={{ marginTop: 6, background: 'transparent', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 9px', color: 'var(--accent-soft)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              {en ? 'Use the template for this agent type' : 'Usar la plantilla de este tipo de agente'}
            </button>
          </div>
          <FormTextarea
            label={en ? 'Key messages' : 'Mensajes clave'}
            value={form.keyMessages}
            onChange={e => update('keyMessages', e.target.value)}
            placeholder={en ? 'Points the agent must always mention…' : 'Puntos que el agente debe mencionar siempre…'}
          />
          <FormTextarea
            label={en ? 'Escalation rules' : 'Reglas de escalado'}
            value={form.escalationRules}
            onChange={e => update('escalationRules', e.target.value)}
            placeholder={en ? 'When to transfer to a human…' : 'Cuándo transferir a una persona…'}
          />
          <FormTextarea
            label={en ? 'Never say' : 'Qué no debe decir nunca'}
            value={form.doNotSay}
            onChange={e => update('doNotSay', e.target.value)}
            placeholder={en ? 'No discounts, no delivery dates, never name competitors…' : 'Nada de descuentos, ni plazos de entrega, ni nombrar a la competencia…'}
          />
        </div>
      </details>

      <details style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-2)' }}>
        <summary style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 650, color: 'var(--text)' }}>
          {en ? 'Voice and operating limits' : 'Voz y límites de operación'}
          <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--dim)' }}>{en ? '(optional)' : '(opcional)'}</span>
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 12px 14px' }}>
          <FormRow>
            <FormSelect
              label={en ? 'Language' : 'Idioma'}
              value={form.language}
              onChange={e => update('language', e.target.value)}
              options={LANGUAGES.map(item => ({ value: item.value, label: item[en ? 'en' : 'es'] }))}
            />
            <FormSelect
              label={en ? 'Speech speed' : 'Velocidad de habla'}
              value={form.speechSpeed}
              onChange={e => update('speechSpeed', e.target.value)}
              options={SPEECH_SPEEDS.map(speed => ({ value: speed, label: `${speed}×` }))}
            />
          </FormRow>
          <FormInput
            label={en ? 'Voice' : 'Voz'}
            value={form.voiceId}
            onChange={e => update('voiceId', e.target.value)}
            placeholder={DEFAULT_VOICE_ID}
            maxLength={128}
            hint={en ? 'Leave empty to use the server voice configured for the agent language.' : 'Déjalo vacío para usar la voz configurada en el servidor para el idioma del agente.'}
          />
          <FormRow columns={3}>
            <FormInput label={en ? 'Max calls/day' : 'Máx. llamadas/día'} type="number" min="0" value={form.maxCallsPerDay} onChange={e => update('maxCallsPerDay', e.target.value)} placeholder={en ? 'No limit' : 'Sin límite'} />
            <FormInput label={en ? 'Max minutes/call' : 'Máx. minutos/llamada'} type="number" min="0" value={form.maxCallDuration} onChange={e => update('maxCallDuration', e.target.value)} placeholder={en ? 'No limit' : 'Sin límite'} />
            <FormInput label={en ? 'Auto retries' : 'Reintentos'} type="number" min="0" value={form.autoRetries} onChange={e => update('autoRetries', e.target.value)} placeholder="0" />
          </FormRow>
        </div>
      </details>
    </FormModal>
  )
}
