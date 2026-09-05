import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../lib/api'
import { localDateInput } from '../lib/salesWorkspace'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormTextarea from '../components/forms/FormTextarea'

export default function SalesTaskModal({ task, leadId, opportunityId, opportunities = [], onClose, onSuccess }) {
  const { user } = useAuth() || {}
  const [selectedOpportunity, setSelectedOpportunity] = useState(opportunityId || '')
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [dueAt, setDueAt] = useState(localDateInput(task?.dueAt))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch(task ? `/api/tasks/${task.id}` : '/api/tasks', { method: task ? 'PUT' : 'POST', body: JSON.stringify({ title: title.trim(), description, dueAt: new Date(dueAt).toISOString(), ...(!task ? { leadId, opportunityId: selectedOpportunity || undefined, ownerId: user?.id || user?.userId } : {}) }) })
      if (!response.ok) throw new Error('No se pudo guardar la tarea. Revisa tus permisos y vuelve a intentarlo.')
      onSuccess?.(await response.json()); onClose()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <FormModal title={task ? 'Editar tarea' : 'Programar seguimiento'} onClose={() => { if (!busy) onClose() }} onSubmit={save} submitText={busy ? 'Guardando…' : 'Guardar tarea'} submitDisabled={busy || !title.trim() || !dueAt}>
    {error && <p role="alert">{error}</p>}
    {!task && opportunities.length > 0 && <label>Oportunidad vinculada<select value={selectedOpportunity} onChange={event => setSelectedOpportunity(event.target.value)}><option value="">Seguimiento general del contacto</option>{opportunities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <FormInput label="Qué hay que hacer" value={title} onChange={e => setTitle(e.target.value)} required />
    <FormInput label="Fecha y hora" type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} required />
    <FormTextarea label="Notas" value={description} onChange={e => setDescription(e.target.value)} />
  </FormModal>
}
