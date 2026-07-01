import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormToggle from '../components/forms/FormToggle'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'

const ROLES = ['Ventas SaaS', 'Recuperación de leads', 'Renovaciones', 'Cierre agresivo', 'Soporte preventa', 'Cross-selling', 'Welcome calls', 'Encuestas NPS']

export default function NewAgenteModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '', role: 'Ventas SaaS', subrole: '', description: '', personality: '',
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
          personality: form.personality || undefined,
          systemPrompt: form.description || undefined,
        }),
      })
      if (!res.ok) { setError('Error al crear el agente'); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <FormModal title="Nuevo agente IA" onClose={onClose} onSubmit={handleSubmit} submitText={saving ? 'Creando…' : 'Crear agente'}>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label="Nombre del agente" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Ej. Sofía" required />
      <FormRow>
        <FormSelect label="Rol" value={form.role} onChange={e => update('role', e.target.value)} options={ROLES} required />
        <FormInput label="Subrol" value={form.subrole} onChange={e => update('subrole', e.target.value)} placeholder="Ej. Especialista en outbound" />
      </FormRow>
      <FormTextarea label="Descripción / objetivo" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Describe el objetivo principal del agente..." />
      <FormInput label="Personalidad" value={form.personality} onChange={e => update('personality', e.target.value)} placeholder="Empática, consultiva, profesional..." />
    </FormModal>
  )
}
