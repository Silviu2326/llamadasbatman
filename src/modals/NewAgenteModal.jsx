import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormToggle from '../components/forms/FormToggle'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'
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

export default function NewAgenteModal({ onClose, onSuccess }) {
  const { t, locale } = useI18n()
  const [form, setForm] = useState({
    name: '', role: 'Ventas SaaS', agentType: 'sales', callDirection: 'both', subrole: '', description: '', personality: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          role: form.role,
          agentType: form.agentType,
          callDirection: form.callDirection,
          personality: form.personality || undefined,
          systemPrompt: form.description || undefined,
        }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal title={t('modal.newAgent')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : t('modal.createAgent')}>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label={t('modal.agentName')} value={form.name} onChange={e => update('name', e.target.value)} placeholder={locale === 'en' ? 'e.g. Sofia' : 'Ej. Sofía'} required />
      <FormRow>
        <FormSelect label="Rol" value={form.role} onChange={e => update('role', e.target.value)} options={ROLES} required />
        <FormInput label={t('modal.subrole')} value={form.subrole} onChange={e => update('subrole', e.target.value)} placeholder={locale === 'en' ? 'e.g. Outbound specialist' : 'Ej. Especialista en outbound'} />
      </FormRow>
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
      <FormTextarea label={t('modal.objective')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={locale === 'en' ? "Describe the agent's primary objective…" : 'Describe el objetivo principal del agente…'} />
      <FormInput label={t('modal.personality')} value={form.personality} onChange={e => update('personality', e.target.value)} placeholder={locale === 'en' ? 'Empathetic, consultative, professional…' : 'Empática, consultiva, profesional…'} />
    </FormModal>
  )
}
