import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormToggle from '../components/forms/FormToggle'

const CATEGORIAS = [
  'Producto',
  'Servicios',
  'Precios y planes',
  'Objeciones comunes',
  'Procesos internos',
  'Casos de éxito',
  'Integraciones',
  'Recursos de ventas',
]

export default function NewArticuloModal({ onClose }) {
  const [form, setForm] = useState({
    title: '',
    category: 'Producto',
    description: '',
    author: '',
    starred: false,
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <FormModal title="Nuevo artículo" onClose={onClose} submitText="Crear artículo">
      <FormInput
        label="Título"
        value={form.title}
        onChange={e => update('title', e.target.value)}
        placeholder="Ej. ¿Cómo funciona la IA de voz?"
        required
      />

      <FormSelect
        label="Categoría"
        value={form.category}
        onChange={e => update('category', e.target.value)}
        options={CATEGORIAS}
        required
      />

      <FormTextarea
        label="Descripción / resumen"
        value={form.description}
        onChange={e => update('description', e.target.value)}
        placeholder="Escribe un resumen del contenido..."
        required
      />

      <FormInput
        label="Autor"
        value={form.author}
        onChange={e => update('author', e.target.value)}
        placeholder="Ej. Equipo de Producto"
        required
      />

      <FormToggle
        label="Marcar como destacado"
        checked={form.starred}
        onChange={v => update('starred', v)}
      />
    </FormModal>
  )
}
