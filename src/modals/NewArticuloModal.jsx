import { useState } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

const CATEGORIAS = [
  'Producto', 'Servicios', 'Precios y planes', 'Objeciones comunes',
  'Procesos internos', 'Casos de éxito', 'Integraciones', 'Recursos de ventas',
]

export default function NewArticuloModal({ onClose, onSuccess, mode = 'article' }) {
  const { t, locale } = useI18n()
  const [form, setForm] = useState({ title: '', category: 'Producto', description: '', url: '', author: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    const missingContent = mode === 'url' ? !form.url.trim() : mode === 'text' ? !form.description.trim() : false
    if (!form.title.trim() || missingContent) {
      setError(mode === 'url' ? 'Añade un nombre y una URL válida.' : 'Añade un título y el contenido que deben conocer tus agentes.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // URL: el servidor valida que sea pública y la rastrea (home + páginas
      // clave); el contenido guardado es el texto de la web, no la URL.
      const payload = mode === 'url'
        ? { name: form.title, type: 'url', sourceUrl: form.url.trim() }
        : mode === 'text'
          ? { name: form.title, type: 'text', content: form.description }
          : { name: form.title, type: 'article', content: `Categoría: ${form.category}${form.author ? `\nAutor: ${form.author}` : ''}\n\n${form.description}` }
      const res = await apiFetch('/api/knowledge', { method: 'POST', body: JSON.stringify(payload) })
      const item = await res.json().catch(() => null)
      if (!res.ok) { setError(item?.error || t('modal.createError')); return }
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  const title = mode === 'url' ? 'Añadir enlace' : mode === 'text' ? 'Pegar texto' : t('modal.newArticle')
  const submitText = mode === 'url' ? 'Guardar enlace' : mode === 'text' ? 'Guardar contenido' : t('modal.createArticle')

  return (
    <FormModal title={title} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? (mode === 'url' ? 'Rastreando la web…' : t('common.saving')) : submitText}>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
      <FormInput label={mode === 'url' ? 'Nombre del enlace' : t('modal.title')} value={form.title} onChange={e => update('title', e.target.value)} placeholder={mode === 'url' ? 'Ej. Centro de ayuda' : locale === 'en' ? 'e.g. How does voice AI work?' : 'Ej. Preguntas frecuentes de producto'} required />
      {mode === 'article' ? <FormSelect label={t('modal.category')} value={form.category} onChange={e => update('category', e.target.value)} options={CATEGORIAS} required /> : null}
      {mode === 'url'
        ? <>
          <FormInput label="URL" type="url" value={form.url} onChange={e => update('url', e.target.value)} placeholder="https://..." required />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--dim)' }}>Se leerán la portada y hasta siete páginas clave (servicios, precios, contacto…). El texto queda disponible para los agentes; puede tardar unos segundos.</p>
        </>
        : <FormTextarea label={mode === 'text' ? 'Contenido' : t('modal.summary')} value={form.description} onChange={e => update('description', e.target.value)} placeholder={mode === 'text' ? 'Pega aquí el contenido que deben conocer tus agentes…' : locale === 'en' ? 'Write a summary of the content…' : 'Escribe un resumen del contenido…'} />}
      {mode === 'article' ? <FormInput label={t('modal.author')} value={form.author} onChange={e => update('author', e.target.value)} placeholder={locale === 'en' ? 'e.g. Product team' : 'Ej. Equipo de Producto'} /> : null}
    </FormModal>
  )
}
