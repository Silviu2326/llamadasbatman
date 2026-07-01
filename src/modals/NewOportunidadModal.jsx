import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'

const ETAPAS = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
const ETAPAS_LABEL = ['Lead', 'Calificado', 'Propuesta', 'Negociación', 'Cerrado (ganado)', 'Cerrado (perdido)']

export default function NewOportunidadModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ company: '', stage: 'lead', value: '', score: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      // Create lead first since Opportunity.leadId is required
      const leadRes = await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({ name: form.company }),
      })
      if (!leadRes.ok) { setError('Error al crear el registro'); return }
      const lead = await leadRes.json()

      const res = await apiFetch('/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({
          leadId: lead.id,
          name: form.company,
          stage: form.stage,
          value: form.value ? parseFloat(form.value.replace(/[^0-9.]/g, '')) : undefined,
          probability: form.score ? parseInt(form.score) : undefined,
        }),
      })
      if (!res.ok) { setError('Error al crear la oportunidad'); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <FormModal title="Nueva oportunidad" onClose={onClose} onSubmit={handleSubmit} submitText={saving ? 'Creando…' : 'Crear oportunidad'} size="sm">
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label="Empresa" value={form.company} onChange={e => update('company', e.target.value)} placeholder="Ej. DataPro Iberia" required />
      <FormSelect
        label="Etapa"
        value={form.stage}
        onChange={e => update('stage', e.target.value)}
        options={ETAPAS.map((v, i) => ({ value: v, label: ETAPAS_LABEL[i] }))}
        required
      />
      <FormRow>
        <FormInput label="Valor estimado (€)" value={form.value} onChange={e => update('value', e.target.value)} placeholder="0" />
        <FormInput label="Probabilidad (0-100)" type="number" min="0" max="100" value={form.score} onChange={e => update('score', e.target.value)} placeholder="50" />
      </FormRow>
    </FormModal>
  )
}
