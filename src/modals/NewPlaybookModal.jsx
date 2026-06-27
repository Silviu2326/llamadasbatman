import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'

const TIPOS = ['Oficial', 'Personalizado']
const CATEGORIAS = ['Ventas', 'Recuperación', 'Cierre', 'Atención al cliente', 'Recordatorios', 'Fidelización', 'Seguimiento', 'Cross-sell']

export default function NewPlaybookModal({ onClose }) {
  const [form, setForm] = useState({
    name: '',
    type: 'Personalizado',
    description: '',
    category: 'Ventas',
    tags: '',
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <FormModal title="Crear playbook" onClose={onClose} submitText="Crear playbook">
      <FormInput
        label="Nombre del playbook"
        value={form.name}
        onChange={e => update('name', e.target.value)}
        placeholder="Ej. Cierre en 3 pasos"
        required
      />

      <FormRow>
        <FormSelect
          label="Tipo"
          value={form.type}
          onChange={e => update('type', e.target.value)}
          options={TIPOS}
          required
        />
        <FormSelect
          label="Categoría"
          value={form.category}
          onChange={e => update('category', e.target.value)}
          options={CATEGORIAS}
          required
        />
      </FormRow>

      <FormTextarea
        label="Descripción"
        value={form.description}
        onChange={e => update('description', e.target.value)}
        placeholder="Describe la estrategia conversacional..."
        required
      />

      <FormInput
        label="Tags"
        value={form.tags}
        onChange={e => update('tags', e.target.value)}
        placeholder=" outbound, b2b, saas..."
      />
    </FormModal>
  )
}
