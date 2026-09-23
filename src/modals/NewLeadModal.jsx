import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

const STATUS_MAP = {
  'Nuevo': 'new', 'Contactado': 'contacted', 'Interesado': 'qualified',
  'Reunión agendada': 'qualified', 'Negociación': 'qualified', 'Ganado': 'converted', 'Perdido': 'unqualified',
}
const ESTADOS = ['Nuevo', 'Contactado', 'Interesado', 'Reunión agendada', 'Negociación', 'Ganado', 'Perdido']
const FUENTES = ['Web form', 'LinkedIn', 'Referido', 'Evento', 'Cold email', 'Importación CRM']

export default function NewLeadModal({ onClose, onSuccess, initialValues = null }) {
  const { t, locale } = useI18n()
  const [form, setForm] = useState({
    name: initialValues?.name || '', role: '', company: initialValues?.company || '', email: initialValues?.email || '', phone: initialValues?.phone || '',
    status: 'Nuevo', value: '', source: 'Web form', tags: '',
  })
  const [callNow, setCallNow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || undefined,
          email: form.email || undefined,
          company: form.company || undefined,
          source: form.source || undefined,
          status: STATUS_MAP[form.status] ?? 'new',
          tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
          customFields: form.role || form.value ? { role: form.role, value: form.value } : undefined,
        }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      if (callNow && item.phone) {
        apiFetch(`/api/leads/${item.id}/call-now`, { method: 'POST' }).catch(() => {})
      }
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal title={t('modal.newLead')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : t('modal.createLead')}>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormRow>
        <FormInput label={t('modal.fullName')} value={form.name} onChange={e => update('name', e.target.value)} placeholder={locale === 'en' ? 'e.g. Carlos Mendez' : 'Ej. Carlos Méndez'} required />
        <FormInput label={t('modal.role')} value={form.role} onChange={e => update('role', e.target.value)} placeholder={locale === 'en' ? 'e.g. CEO' : 'Ej. CEO'} />
      </FormRow>
      <FormInput label={t('modal.company')} value={form.company} onChange={e => update('company', e.target.value)} placeholder={locale === 'en' ? 'e.g. TechSolutions Ltd.' : 'Ej. TechSolutions S.L.'} />
      <FormRow>
        <FormInput label={t('modal.email')} type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="carlos@empresa.com" />
        <FormInput label={t('modal.phone')} type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+34 600 000 000" />
      </FormRow>
      <FormRow>
        <FormSelect label={t('modal.status')} value={form.status} onChange={e => update('status', e.target.value)} options={ESTADOS} />
        <FormInput label={t('modal.potentialValue')} value={form.value} onChange={e => update('value', e.target.value)} placeholder="€0" />
      </FormRow>
      <FormRow>
        <FormSelect label={t('modal.source')} value={form.source} onChange={e => update('source', e.target.value)} options={FUENTES} />
        <FormInput label={t('modal.tags')} value={form.tags} onChange={e => update('tags', e.target.value)} placeholder="SaaS, Enterprise, Madrid..." />
      </FormRow>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
        <input type="checkbox" checked={callNow} onChange={e => setCallNow(e.target.checked)} /> {t('modal.callNow')}
      </label>
    </FormModal>
  )
}
