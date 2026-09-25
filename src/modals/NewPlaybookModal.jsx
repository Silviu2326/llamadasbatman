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

/**
 * Pasos iniciales escritos a mano, uno por línea: «Título: instrucción».
 * El editor completo (objetivo, orden) está en la ficha del guion.
 */
export function parseInitialSteps(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:\d+[.)]\s*|[-*]\s*)/, '').trim())
    .filter(Boolean)
    .slice(0, 40)
    .map(line => {
      const separator = line.indexOf(':')
      if (separator > 0 && separator < 160) return { title: line.slice(0, separator).trim(), instruction: line.slice(separator + 1).trim() }
      return { title: line.slice(0, 160) }
    })
}

export default function NewPlaybookModal({ onClose, onSuccess }) {
  const { t, locale } = useI18n()
  const [form, setForm] = useState({ name: '', type: 'Personalizado', description: '', category: 'Ventas', tags: '', steps: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    if (form.name.trim().length < 2) { setError('El nombre necesita al menos dos caracteres.'); return }
    setSaving(true)
    setError(null)
    try {
      const steps = parseInitialSteps(form.steps)
      const res = await apiFetch('/api/playbooks', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || undefined,
          tags: [form.category, ...(form.tags ? form.tags.split(',').map(s => s.trim()) : [])].filter(Boolean).slice(0, 20),
          ...(steps.length ? { steps } : {}),
        }),
      })
      if (!res.ok) { const body = await res.json().catch(() => null); setError(body?.error || t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal title={t('modal.newPlaybook')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : t('modal.createPlaybook')}>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label={t('modal.name')} value={form.name} onChange={e => update('name', e.target.value)} placeholder={locale === 'en' ? 'e.g. Three-step close' : 'Ej. Cierre en 3 pasos'} required />
      <FormRow>
        <FormSelect label={t('modal.type')} value={form.type} onChange={e => update('type', e.target.value)} options={TIPOS} />
        <FormSelect label={t('modal.category')} value={form.category} onChange={e => update('category', e.target.value)} options={CATEGORIAS} />
      </FormRow>
      <FormTextarea label={t('modal.description')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={locale === 'en' ? 'Describe the conversation strategy…' : 'Describe la estrategia conversacional…'} />
      <FormInput label="Tags" value={form.tags} onChange={e => update('tags', e.target.value)} placeholder="outbound, b2b, saas..." />
      <FormTextarea label="Pasos iniciales (uno por línea, «Título: instrucción»)" value={form.steps} onChange={e => update('steps', e.target.value)} placeholder={'Apertura: preséntate y pide permiso para hablar\nDescubrimiento: pregunta por su situación actual\nCierre: propón día y hora para una reunión'} />
    </FormModal>
  )
}
