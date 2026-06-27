import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'

const ESTADOS = [
  { value: 'activa', label: 'Activa' },
  { value: 'pausada', label: 'Pausada' },
]
const DISPARADORES = [
  'Llamada completada',
  'Lead sin actividad > 7 días',
  'Reunión agendada 24h antes',
  'Oportunidad en etapa Propuesta > 3 días',
  'Nuevo lead creado',
  'Lead sin actividad > 30 días',
]

export default function NewAutomatizacionModal({ onClose }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    tags: '',
    status: 'activa',
    trigger: DISPARADORES[0],
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <FormModal title="Nueva automatización" onClose={onClose} submitText="Crear automatización">
      <FormInput
        label="Nombre"
        value={form.name}
        onChange={e => update('name', e.target.value)}
        placeholder="Ej. Seguimiento post-llamada"
        required
      />

      <FormTextarea
        label="Descripción"
        value={form.description}
        onChange={e => update('description', e.target.value)}
        placeholder="¿Qué hace esta automatización?"
        required
      />

      <FormRow>
        <FormSelect
          label="Estado inicial"
          value={form.status}
          onChange={e => update('status', e.target.value)}
          options={ESTADOS}
          required
        />
        <FormSelect
          label="Disparador"
          value={form.trigger}
          onChange={e => update('trigger', e.target.value)}
          options={DISPARADORES}
          required
        />
      </FormRow>

      <FormInput
        label="Tags"
        value={form.tags}
        onChange={e => update('tags', e.target.value)}
        placeholder=" llamadas, sms, email..."
      />
    </FormModal>
  )
}
