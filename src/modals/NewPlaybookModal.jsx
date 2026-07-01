import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'

const TIPOS = ['Oficial', 'Personalizado']
const CATEGORIAS = ['Ventas', 'Recuperación', 'Cierre', 'Atención al cliente', 'Recordatorios', 'Fidelización', 'Seguimiento', 'Cross-sell']

export default function NewPlaybookModal({ onClose, onSuccess }) {
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
      if (!res.ok) { setError('Error al crear el playbook'); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <FormModal title="Crear playbook" onClose={onClose} onSubmit={handleSubmit} submitText={saving ? 'Creando…' : 'Crear playbook'}>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label="Nombre del playbook" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Ej. Cierre en 3 pasos" required />
      <FormRow>
        <FormSelect label="Tipo" value={form.type} onChange={e => update('type', e.target.value)} options={TIPOS} />
        <FormSelect label="Categoría" value={form.category} onChange={e => update('category', e.target.value)} options={CATEGORIAS} />
      </FormRow>
      <FormTextarea label="Descripción" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Describe la estrategia conversacional..." />
      <FormInput label="Tags" value={form.tags} onChange={e => update('tags', e.target.value)} placeholder="outbound, b2b, saas..." />
    </FormModal>
  )
}
