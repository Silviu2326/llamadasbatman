import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

const TIPOS = ['Oficial', 'Personalizado']
const CATEGORIAS = ['Ventas', 'Recuperación', 'Cierre', 'Atención al cliente', 'Recordatorios', 'Fidelización', 'Seguimiento', 'Cross-sell']

export default function NewPlaybookModal({ onClose, onSuccess }) {
  const { t, locale } = useI18n()
  const [form, setForm] = useState({ name: '', type: 'Personalizado', description: '', category: 'Ventas', tags: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/playbooks', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal title={t('modal.newPlaybook')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : t('modal.createPlaybook')}>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label={t('modal.name')} value={form.name} onChange={e => update('name', e.target.value)} placeholder={locale === 'en' ? 'e.g. Three-step close' : 'Ej. Cierre en 3 pasos'} required />
      <FormRow>
        <FormSelect label={t('modal.type')} value={form.type} onChange={e => update('type', e.target.value)} options={TIPOS} />
        <FormSelect label={t('modal.category')} value={form.category} onChange={e => update('category', e.target.value)} options={CATEGORIAS} />
      </FormRow>
      <FormTextarea label={t('modal.description')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={locale === 'en' ? 'Describe the conversation strategy…' : 'Describe la estrategia conversacional…'} />
      <FormInput label="Tags" value={form.tags} onChange={e => update('tags', e.target.value)} placeholder="outbound, b2b, saas..." />
    </FormModal>
  )
}
