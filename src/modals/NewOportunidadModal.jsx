import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormRow from '../components/forms/FormRow'

const ETAPAS = ['lead', 'contactado', 'interesado', 'reunión', 'propuesta', 'negociación', 'ganado']
const BADGES = ['Nuevo', 'Contactado', 'Interesado', 'Reunión', 'Propuesta enviada', 'Negociación', 'Ganado']

export default function NewOportunidadModal({ onClose }) {
  const [form, setForm] = useState({
    company: '',
    city: '',
    stage: 'lead',
    value: '',
    badge: 'Nuevo',
    score: '',
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <FormModal title="Nueva oportunidad" onClose={onClose} submitText="Crear oportunidad" size="sm">
      <FormInput
        label="Empresa"
        value={form.company}
        onChange={e => update('company', e.target.value)}
        placeholder="Ej. DataPro Iberia"
        required
      />

      <FormInput
        label="Ciudad / País"
        value={form.city}
        onChange={e => update('city', e.target.value)}
        placeholder="Ej. Madrid, España"
        required
      />

      <FormRow>
        <FormSelect
          label="Etapa"
          value={form.stage}
          onChange={e => update('stage', e.target.value)}
          options={ETAPAS}
          required
        />
        <FormSelect
          label="Badge"
          value={form.badge}
          onChange={e => update('badge', e.target.value)}
          options={BADGES}
          required
        />
      </FormRow>

      <FormRow>
        <FormInput
          label="Valor estimado"
          value={form.value}
          onChange={e => update('value', e.target.value)}
          placeholder="€0"
          required
        />
        <FormInput
          label="Score (0-100)"
          type="number"
          min="0"
          max="100"
          value={form.score}
          onChange={e => update('score', e.target.value)}
          placeholder="50"
        />
      </FormRow>
    </FormModal>
  )
}
