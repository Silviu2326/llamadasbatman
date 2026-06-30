import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'

const DISPARADORES = [
  'Llamada completada',
  'Lead sin actividad > 7 días',
  'Reunión agendada 24h antes',
  'Oportunidad en etapa Propuesta > 3 días',
  'Nuevo lead creado',
  'Lead sin actividad > 30 días',
]

export default function NewAutomatizacionModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', description: '', trigger: DISPARADORES[0], isActive: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/automations', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          trigger: { type: form.trigger, description: form.description },
          actions: [],
          isActive: form.isActive,
        }),
      })
      if (!res.ok) { setError('Error al crear la automatización'); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <FormModal title="Nueva automatización" onClose={onClose} onSubmit={handleSubmit} submitText={saving ? 'Creando…' : 'Crear automatización'}>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label="Nombre" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Ej. Seguimiento post-llamada" required />
      <FormTextarea label="Descripción" value={form.description} onChange={e => update('description', e.target.value)} placeholder="¿Qué hace esta automatización?" />
      <FormRow>
        <FormSelect label="Disparador" value={form.trigger} onChange={e => update('trigger', e.target.value)} options={DISPARADORES} required />
      </FormRow>
    </FormModal>
  )
}
