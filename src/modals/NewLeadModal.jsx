import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'

const STATUS_MAP = {
  'Nuevo': 'new', 'Contactado': 'contacted', 'Interesado': 'qualified',
  'Reunión agendada': 'qualified', 'Negociación': 'qualified', 'Ganado': 'converted', 'Perdido': 'unqualified',
}
const ESTADOS = ['Nuevo', 'Contactado', 'Interesado', 'Reunión agendada', 'Negociación', 'Ganado', 'Perdido']
const FUENTES = ['Web form', 'LinkedIn', 'Referido', 'Evento', 'Cold email', 'Importación CRM']

export default function NewLeadModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '', role: '', company: '', email: '', phone: '',
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
      if (!res.ok) { setError('Error al crear el lead'); return }
      const item = await res.json()
      if (callNow && item.phone) {
        apiFetch(`/api/leads/${item.id}/call-now`, { method: 'POST' }).catch(() => {})
      }
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <FormModal title="Nuevo lead" onClose={onClose} onSubmit={handleSubmit} submitText={saving ? 'Creando…' : 'Crear lead'}>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormRow>
        <FormInput label="Nombre completo" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Ej. Carlos Méndez" required />
        <FormInput label="Cargo" value={form.role} onChange={e => update('role', e.target.value)} placeholder="Ej. CEO" />
      </FormRow>
      <FormInput label="Empresa" value={form.company} onChange={e => update('company', e.target.value)} placeholder="Ej. TechSolutions S.L." />
      <FormRow>
        <FormInput label="Email" type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="carlos@empresa.com" />
        <FormInput label="Teléfono" type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+34 600 000 000" />
      </FormRow>
      <FormRow>
        <FormSelect label="Estado" value={form.status} onChange={e => update('status', e.target.value)} options={ESTADOS} />
        <FormInput label="Valor potencial" value={form.value} onChange={e => update('value', e.target.value)} placeholder="€0" />
      </FormRow>
      <FormRow>
        <FormSelect label="Fuente" value={form.source} onChange={e => update('source', e.target.value)} options={FUENTES} />
        <FormInput label="Etiquetas" value={form.tags} onChange={e => update('tags', e.target.value)} placeholder="SaaS, Enterprise, Madrid..." />
      </FormRow>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>
        <input type="checkbox" checked={callNow} onChange={e => setCallNow(e.target.checked)} /> Llamar ahora si tiene teléfono
      </label>
    </FormModal>
  )
}
