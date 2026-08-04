import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

const CATEGORIAS = [
  'Producto', 'Servicios', 'Precios y planes', 'Objeciones comunes',
  'Procesos internos', 'Casos de éxito', 'Integraciones', 'Recursos de ventas',
]

export default function NewArticuloModal({ onClose, onSuccess }) {
  const { t, locale } = useI18n()
  const [form, setForm] = useState({ title: '', category: 'Producto', description: '', author: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          name: form.title,
          type: form.category,
          content: form.description,
        }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal title={t('modal.newArticle')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : t('modal.createArticle')}>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label={t('modal.title')} value={form.title} onChange={e => update('title', e.target.value)} placeholder={locale === 'en' ? 'e.g. How does voice AI work?' : 'Ej. ¿Cómo funciona la IA de voz?'} required />
      <FormSelect label={t('modal.category')} value={form.category} onChange={e => update('category', e.target.value)} options={CATEGORIAS} required />
      <FormTextarea label={t('modal.summary')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={locale === 'en' ? 'Write a summary of the content…' : 'Escribe un resumen del contenido…'} />
      <FormInput label={t('modal.author')} value={form.author} onChange={e => update('author', e.target.value)} placeholder={locale === 'en' ? 'e.g. Product team' : 'Ej. Equipo de Producto'} />
    </FormModal>
  )
}
