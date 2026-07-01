import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'

const DURACIONES = ['15 min', '30 min', '45 min', '60 min']
const DUR_MAP = { '15 min': 15, '30 min': 30, '45 min': 45, '60 min': 60 }
const PRIORIDADES = ['Alta', 'Media', 'Baja']

export default function NewReunionModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    lead: '', company: '', date: '', time: '', duration: '30 min', objective: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      // Create lead first since Meeting.leadId is required
      const leadRes = await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({ name: form.lead, company: form.company || undefined }),
      })
      if (!leadRes.ok) { setError('Error al crear el lead'); return }
      const lead = await leadRes.json()

      const scheduledAt = form.date && form.time ? `${form.date}T${form.time}:00` : new Date().toISOString()
      const res = await apiFetch('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          leadId: lead.id,
          title: form.objective || `Reunión con ${form.lead}`,
          scheduledAt,
          durationMinutes: DUR_MAP[form.duration] ?? 30,
          notes: form.objective || undefined,
        }),
      })
      if (!res.ok) { setError('Error al crear la reunión'); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <FormModal title="Nueva reunión" onClose={onClose} onSubmit={handleSubmit} submitText={saving ? 'Creando…' : 'Crear reunión'}>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label="Nombre del lead" value={form.lead} onChange={e => update('lead', e.target.value)} placeholder="Ej. María Rodríguez" required />
      <FormInput label="Empresa" value={form.company} onChange={e => update('company', e.target.value)} placeholder="Ej. TechSolutions S.L." />
      <FormRow>
        <FormInput label="Fecha" type="date" value={form.date} onChange={e => update('date', e.target.value)} required />
        <FormInput label="Hora" type="time" value={form.time} onChange={e => update('time', e.target.value)} required />
      </FormRow>
      <FormSelect label="Duración" value={form.duration} onChange={e => update('duration', e.target.value)} options={DURACIONES} />
      <FormTextarea label="Objetivo de la reunión" value={form.objective} onChange={e => update('objective', e.target.value)} placeholder="¿Qué queremos conseguir en esta llamada?" />
    </FormModal>
  )
}
