import { useEffect, useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

const DISPARADORES = [
  { value: 'call.completed', label: 'Llamada completada' },
  { value: 'lead.inactive.7d', label: 'Lead sin actividad > 7 días' },
  { value: 'meeting.scheduled.24h', label: 'Reunión agendada 24h antes' },
  { value: 'opportunity.proposal.3d', label: 'Oportunidad en etapa Propuesta > 3 días' },
  { value: 'lead.created', label: 'Nuevo lead creado' },
  { value: 'lead.inactive.30d', label: 'Lead sin actividad > 30 días' },
  { value: 'message.received', label: 'Mensaje recibido' },
]
const CHANNEL_ACTIONS = [
  { value: 'none', label: 'Sin respuesta automática' },
  { value: 'ai_reply_whatsapp', label: 'Responder WhatsApp con IA' },
  { value: 'send_whatsapp_template', label: 'Enviar plantilla de WhatsApp' },
  { value: 'queue_voice_call', label: 'Iniciar llamada automática' },
  { value: 'send_email_template', label: 'Enviar plantilla de email' },
]
const SEQUENCE_TYPES = [
  { value: 'email', label: 'Email con plantilla' },
  { value: 'ai_email', label: 'Email personalizado con IA' },
]
const makeStep = index => ({ key: 'email-' + (index + 1), type: 'email', delayDays: index === 0 ? 0 : 2, emailDraftId: '', purpose: 'marketing' })

function EmailSequenceEditor({ steps, setSteps, drafts, templateError }) {
  const updateStep = (index, field, value) => setSteps(current => current.map((step, i) => i === index ? { ...step, [field]: value } : step))
  return <div className="automation-sequence-editor">
    <div className="automation-sequence-heading"><strong>Pasos del recorrido</strong><small>La espera se cuenta desde el paso anterior. Las bajas o respuestas detienen los siguientes emails.</small></div>
    {steps.map((step, index) => <div className="automation-sequence-step" key={step.key}>
      <div className="automation-sequence-step-number">{index + 1}</div>
      <div className="automation-sequence-step-fields">
        <FormSelect label="Acción" value={step.type} onChange={event => updateStep(index, 'type', event.target.value)} options={SEQUENCE_TYPES} />
        {step.type === 'email' && <FormSelect label="Borrador de email" value={step.emailDraftId} onChange={event => updateStep(index, 'emailDraftId', event.target.value)} options={[{ value: '', label: drafts.length ? 'Selecciona un borrador…' : 'Crea un borrador en Email marketing' }, ...drafts.map(item => ({ value: String(item.id), label: item.name }))]} required />}
        {step.type === 'ai_email' && <p className="automation-sequence-note">El texto se redacta cuando llegue el momento usando la información disponible del contacto. Requiere auditoría, proveedor IA y permiso de marketing.</p>}
        <FormInput label="Esperar días desde el paso anterior" type="number" min="0" max="365" value={step.delayDays} onChange={event => updateStep(index, 'delayDays', Math.max(0, Math.min(365, Number(event.target.value) || 0)))} required />
      </div>
      <button type="button" className="automation-sequence-remove" disabled={steps.length <= 1} onClick={() => setSteps(current => current.filter((_, i) => i !== index))} aria-label={'Eliminar paso ' + (index + 1)}>×</button>
    </div>)}
    <button type="button" className="automation-button secondary" disabled={steps.length >= 20} onClick={() => setSteps(current => [...current, makeStep(current.length)])}>+ Añadir email</button>
    {templateError && <p className="automation-sequence-note" role="status">{templateError}</p>}
    <div className="automation-sequence-compliance">Solo se matriculan contactos con consentimiento de marketing vigente. El sistema vuelve a comprobarlo antes de cada envío.</div>
  </div>
}

export default function NewAutomatizacionModal({ onClose, onSuccess, initialMode = 'automation' }) {
  const { t, locale } = useI18n()
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ name: '', description: '', trigger: DISPARADORES[0].value, isActive: true })
  const [channelAction, setChannelAction] = useState('none')
  const [contentSid, setContentSid] = useState('')
  const [emailDraftId, setEmailDraftId] = useState('')
  const [sequenceSteps, setSequenceSteps] = useState([makeStep(0)])
  const [drafts, setDrafts] = useState([])
  const [templateError, setTemplateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (mode !== 'email_sequence' && channelAction !== 'send_email_template') return
    let active = true
    apiFetch('/api/email/newsletter-drafts')
      .then(async response => {
        const payload = await response.json().catch(() => [])
        if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las plantillas.')
        return Array.isArray(payload) ? payload : []
      })
      .then(items => { if (active) { setDrafts(items); setTemplateError(items.length ? '' : 'Crea un borrador en Email marketing para usarlo en la secuencia.') } })
      .catch(err => { if (active) { setDrafts([]); setTemplateError(err.message || 'No se pudieron cargar los borradores de email.') } })
    return () => { active = false }
  }, [mode, channelAction])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'email_sequence') {
        if (!sequenceSteps.length || sequenceSteps.some(step => step.type === 'email' && !step.emailDraftId)) {
          setError('Selecciona un borrador para cada paso de email.')
          return
        }
        const res = await apiFetch('/api/growth-programs', {
          method: 'POST',
          body: JSON.stringify({
            type: 'sales_sequence',
            name: form.name,
            description: form.description || 'Secuencia de email con pausas entre pasos.',
            status: 'draft',
            config: { steps: sequenceSteps.map((step, index) => ({ ...step, key: 'email-' + (index + 1), purpose: 'marketing' })) },
          }),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok) { setError(payload?.error || 'No se pudo guardar la secuencia.'); return }
        onSuccess?.({ kind: 'email_sequence', program: payload?.program || payload?.data || payload })
        return
      }

      const actions = []
      if (channelAction === 'ai_reply_whatsapp') actions.push({ type: channelAction, params: { tone: 'consultivo' } })
      if (channelAction === 'send_whatsapp_template') actions.push({ type: channelAction, params: { contentSid: contentSid.trim() } })
      if (channelAction === 'queue_voice_call') actions.push({ type: channelAction })
      if (channelAction === 'send_email_template') actions.push({ type: channelAction, params: { emailDraftId } })
      const res = await apiFetch('/api/automations', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, description: form.description, trigger: { event: form.trigger }, actions, isActive: form.isActive }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch (err) {
      setError(err?.message || t('modal.connectionError'))
    } finally {
      setSaving(false)
    }
  }

  return <FormModal title={mode === 'email_sequence' ? 'Nueva cadena de emails' : t('modal.newAutomation')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : mode === 'email_sequence' ? 'Guardar borrador' : t('modal.createAutomation')}>
    <div className="automation-create-mode" role="tablist" aria-label="Tipo de automatización">
      <button type="button" role="tab" aria-selected={mode === 'automation'} className={mode === 'automation' ? 'active' : ''} onClick={() => setMode('automation')}>Flujo por evento</button>
      <button type="button" role="tab" aria-selected={mode === 'email_sequence'} className={mode === 'email_sequence' ? 'active' : ''} onClick={() => setMode('email_sequence')}>Cadena de emails</button>
    </div>
    {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }} role="alert">{error}</p>}
    <FormInput label={t('modal.name')} value={form.name} onChange={e => update('name', e.target.value)} placeholder={locale === 'en' ? 'e.g. Post-call follow-up' : mode === 'email_sequence' ? 'Ej. Bienvenida a Preclases' : 'Ej. Seguimiento post-llamada'} required />
    <FormTextarea label={t('modal.description')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={mode === 'email_sequence' ? 'Objetivo y contexto de esta cadena…' : locale === 'en' ? 'What does this automation do?' : '¿Qué hace esta automatización?'} />
    {mode === 'automation' ? <>
      <FormSelect label={t('modal.trigger')} value={form.trigger} onChange={e => update('trigger', e.target.value)} options={DISPARADORES} required />
      <FormSelect label={t('modal.channelResponse')} value={channelAction} onChange={e => setChannelAction(e.target.value)} options={CHANNEL_ACTIONS} />
      {channelAction === 'send_whatsapp_template' && <FormInput label="Content SID aprobado en Twilio" value={contentSid} onChange={e => setContentSid(e.target.value)} placeholder="HX..." required />}
      {channelAction === 'send_email_template' && <FormSelect label="Borrador de email" value={emailDraftId} onChange={e => setEmailDraftId(e.target.value)} options={[{ value: '', label: drafts.length ? 'Selecciona un borrador…' : 'Crea un borrador en Email marketing' }, ...drafts.map(item => ({ value: String(item.id), label: item.name }))]} required />}
    </> : <EmailSequenceEditor steps={sequenceSteps} setSteps={setSequenceSteps} drafts={drafts} templateError={templateError} />}
  </FormModal>
}

