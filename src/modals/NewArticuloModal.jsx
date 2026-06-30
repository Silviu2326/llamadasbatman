import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import { apiFetch } from '../lib/api'

const CATEGORIAS = [
  'Producto', 'Servicios', 'Precios y planes', 'Objeciones comunes',
  'Procesos internos', 'Casos de éxito', 'Integraciones', 'Recursos de ventas',
]

export default function NewArticuloModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ title: '', category: 'Producto', description: '', author: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          name: form.title,
          type: form.category,
          content: form.description,
        }),
      })
      if (!res.ok) { setError('Error al crear el artículo'); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError('Error de conexión') } finally { setSaving(false) }
  }

  return (
    <FormModal title="Nuevo artículo" onClose={onClose} onSubmit={handleSubmit} submitText={saving ? 'Creando…' : 'Crear artículo'}>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label="Título" value={form.title} onChange={e => update('title', e.target.value)} placeholder="Ej. ¿Cómo funciona la IA de voz?" required />
      <FormSelect label="Categoría" value={form.category} onChange={e => update('category', e.target.value)} options={CATEGORIAS} required />
      <FormTextarea label="Descripción / resumen" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Escribe un resumen del contenido..." />
      <FormInput label="Autor" value={form.author} onChange={e => update('author', e.target.value)} placeholder="Ej. Equipo de Producto" />
    </FormModal>
  )
}
