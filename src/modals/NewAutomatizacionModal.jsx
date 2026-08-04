import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'
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

export default function NewAutomatizacionModal({ onClose, onSuccess }) {
  const { t, locale } = useI18n()
  const [form, setForm] = useState({ name: '', description: '', trigger: DISPARADORES[0].value, isActive: true })
  const [sendToMautic, setSendToMautic] = useState(false)
  const [segmentAlias, setSegmentAlias] = useState('')
  const [channelAction, setChannelAction] = useState('none')
  const [contentSid, setContentSid] = useState('')
  const [emailId, setEmailId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      // "enviar a segmento de Mautic" como una acción más, sin construir un
      // editor de acciones genérico.
      const actions = []
      if (sendToMautic && segmentAlias.trim()) actions.push({ type: 'send_to_mautic_segment', params: { segmentAlias: segmentAlias.trim() } })
      if (channelAction === 'ai_reply_whatsapp') actions.push({ type: channelAction, params: { tone: 'consultivo' } })
      if (channelAction === 'send_whatsapp_template') actions.push({ type: channelAction, params: { contentSid: contentSid.trim() } })
      if (channelAction === 'queue_voice_call') actions.push({ type: channelAction })
      if (channelAction === 'send_email_template') actions.push({ type: channelAction, params: { emailId: emailId.trim() } })
      const res = await apiFetch('/api/automations', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          trigger: { event: form.trigger },
          actions,
          isActive: form.isActive,
        }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal title={t('modal.newAutomation')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : t('modal.createAutomation')}>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label={t('modal.name')} value={form.name} onChange={e => update('name', e.target.value)} placeholder={locale === 'en' ? 'e.g. Post-call follow-up' : 'Ej. Seguimiento post-llamada'} required />
      <FormTextarea label={t('modal.description')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={locale === 'en' ? 'What does this automation do?' : '¿Qué hace esta automatización?'} />
        <FormSelect label={t('modal.trigger')} value={form.trigger} onChange={e => update('trigger', e.target.value)} options={DISPARADORES} required />
      <FormSelect label={t('modal.channelResponse')} value={channelAction} onChange={e => setChannelAction(e.target.value)} options={CHANNEL_ACTIONS} />
      {channelAction === 'send_whatsapp_template' && <FormInput label="Content SID aprobado en Twilio" value={contentSid} onChange={e => setContentSid(e.target.value)} placeholder="HX..." required />}
      {channelAction === 'send_email_template' && <FormInput label="ID de plantilla/email en Mautic" value={emailId} onChange={e => setEmailId(e.target.value)} placeholder="42" required />}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
        <input type="checkbox" checked={sendToMautic} onChange={e => setSendToMautic(e.target.checked)} />
        {t('modal.sendToSegment')}
      </label>
      {sendToMautic && (
        <FormInput label={t('modal.segmentAlias')} value={segmentAlias} onChange={e => setSegmentAlias(e.target.value)} placeholder={locale === 'en' ? 'e.g. reactivation' : 'Ej. reactivacion'} />
      )}
    </FormModal>
  )
}
