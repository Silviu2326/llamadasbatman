import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormToggle from '../components/forms/FormToggle'
import FormRow from '../components/forms/FormRow'

const ROLES = ['Ventas SaaS', 'Recuperación de leads', 'Renovaciones', 'Cierre agresivo', 'Soporte preventa', 'Cross-selling', 'Welcome calls', 'Encuestas NPS']
const ESTADOS = ['Activo', 'Pausado', 'Borrador', 'Archivado']

export default function NewAgenteModal({ onClose }) {
  const [form, setForm] = useState({
    name: '',
    role: 'Ventas SaaS',
    subrole: '',
    description: '',
    status: 'Borrador',
    personality: '',
    verified: false,
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <FormModal title="Nuevo agente IA" onClose={onClose} submitText="Crear agente">
      <FormInput
        label="Nombre del agente"
        value={form.name}
        onChange={e => update('name', e.target.value)}
        placeholder="Ej. Sofía"
        required
      />

      <FormRow>
        <FormSelect
          label="Rol"
          value={form.role}
          onChange={e => update('role', e.target.value)}
          options={ROLES}
          required
        />
        <FormInput
          label="Subrol"
          value={form.subrole}
          onChange={e => update('subrole', e.target.value)}
          placeholder="Ej. Especialista en outbound"
          required
        />
      </FormRow>

      <FormTextarea
        label="Descripción / objetivo"
        value={form.description}
        onChange={e => update('description', e.target.value)}
        placeholder="Describe el objetivo principal del agente..."
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
        <FormInput
          label="Personalidad"
          value={form.personality}
          onChange={e => update('personality', e.target.value)}
          placeholder="Empática, consultiva, profesional..."
        />
      </FormRow>

      <FormToggle
        label="Verificado desde el inicio"
        checked={form.verified}
        onChange={v => update('verified', v)}
      />
    </FormModal>
  )
}
