import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'

const AGENTES = ['Sofía', 'Carlos', 'Emma', 'Diego', 'Lucía', 'Mateo', 'Isabella', 'Tomás']
const DURACIONES = ['15 min', '30 min', '45 min', '60 min']
const PLATAFORMAS = [
  { value: 'google', label: 'Google Meet' },
  { value: 'zoom', label: 'Zoom' },
]
const PRIORIDADES = ['Alta', 'Media', 'Baja']

export default function NewReunionModal({ onClose }) {
  const [form, setForm] = useState({
    lead: '',
    role: '',
    company: '',
    agent: AGENTES[0],
    date: '',
    time: '',
    duration: '30 min',
    platform: 'google',
    objective: '',
    value: '',
    priority: 'Media',
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <FormModal title="Nueva reunión" onClose={onClose} submitText="Crear reunión">
      <FormInput
        label="Nombre del lead"
        value={form.lead}
        onChange={e => update('lead', e.target.value)}
        placeholder="Ej. María Rodríguez"
        required
      />

      <FormRow>
        <FormInput
          label="Cargo"
          value={form.role}
          onChange={e => update('role', e.target.value)}
          placeholder="Ej. Directora de Operaciones"
          required
        />
        <FormInput
          label="Empresa"
          value={form.company}
          onChange={e => update('company', e.target.value)}
          placeholder="Ej. TechSolutions S.L."
          required
        />
      </FormRow>

      <FormRow>
        <FormSelect
          label="Agente IA"
          value={form.agent}
          onChange={e => update('agent', e.target.value)}
          options={AGENTES}
          required
        />
        <FormSelect
          label="Prioridad"
          value={form.priority}
          onChange={e => update('priority', e.target.value)}
          options={PRIORIDADES}
          required
        />
      </FormRow>

      <FormRow>
        <FormInput
          label="Fecha"
          type="date"
          value={form.date}
          onChange={e => update('date', e.target.value)}
          required
        />
        <FormInput
          label="Hora"
          type="time"
          value={form.time}
          onChange={e => update('time', e.target.value)}
          required
        />
      </FormRow>

      <FormRow>
        <FormSelect
          label="Duración"
          value={form.duration}
          onChange={e => update('duration', e.target.value)}
          options={DURACIONES}
          required
        />
        <FormSelect
          label="Plataforma"
          value={form.platform}
          onChange={e => update('platform', e.target.value)}
          options={PLATAFORMAS}
          required
        />
      </FormRow>

      <FormTextarea
        label="Objetivo de la reunión"
        value={form.objective}
        onChange={e => update('objective', e.target.value)}
        placeholder="¿Qué queremos conseguir en esta llamada?"
        required
      />

      <FormInput
        label="Valor potencial"
        value={form.value}
        onChange={e => update('value', e.target.value)}
        placeholder="€0"
      />
    </FormModal>
  )
}
