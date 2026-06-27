import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormRow from '../components/forms/FormRow'

const ESTADOS = ['Nuevo', 'Contactado', 'Interesado', 'Reunión agendada', 'Negociación', 'Ganado', 'Perdido']
const FUENTES = ['Web form', 'LinkedIn', 'Referido', 'Evento', 'Cold email', 'Importación CRM']

export default function NewLeadModal({ onClose }) {
  const [form, setForm] = useState({
    name: '',
    role: '',
    company: '',
    email: '',
    phone: '',
    status: 'Nuevo',
    value: '',
    source: 'Web form',
    tags: '',
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <FormModal title="Nuevo lead" onClose={onClose} submitText="Crear lead">
      <FormRow>
        <FormInput
          label="Nombre completo"
          value={form.name}
          onChange={e => update('name', e.target.value)}
          placeholder="Ej. Carlos Méndez"
          required
        />
        <FormInput
          label="Cargo"
          value={form.role}
          onChange={e => update('role', e.target.value)}
          placeholder="Ej. CEO"
          required
        />
      </FormRow>

      <FormInput
        label="Empresa"
        value={form.company}
        onChange={e => update('company', e.target.value)}
        placeholder="Ej. TechSolutions S.L."
        required
      />

      <FormRow>
        <FormInput
          label="Email"
          type="email"
          value={form.email}
          onChange={e => update('email', e.target.value)}
          placeholder="carlos@empresa.com"
          required
        />
        <FormInput
          label="Teléfono"
          type="tel"
          value={form.phone}
          onChange={e => update('phone', e.target.value)}
          placeholder="+34 600 000 000"
        />
      </FormRow>

      <FormRow>
        <FormSelect
          label="Estado"
          value={form.status}
          onChange={e => update('status', e.target.value)}
          options={ESTADOS}
          required
        />
        <FormInput
          label="Valor potencial"
          value={form.value}
          onChange={e => update('value', e.target.value)}
          placeholder="€0"
        />
      </FormRow>

      <FormRow>
        <FormSelect
          label="Fuente"
          value={form.source}
          onChange={e => update('source', e.target.value)}
          options={FUENTES}
        />
        <FormInput
          label="Etiquetas"
          value={form.tags}
          onChange={e => update('tags', e.target.value)}
          placeholder="SaaS, Enterprise, Madrid..."
        />
      </FormRow>
    </FormModal>
  )
}
