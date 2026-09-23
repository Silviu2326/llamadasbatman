import { useEffect, useMemo, useState } from 'react'
import FormModal from './ui/FormModal'
import { apiFetch } from '../lib/api'

function pad(value) {
  return String(value).padStart(2, '0')
}

function nextSlot() {
  const value = new Date(Date.now() + 60 * 60 * 1000)
  value.setMinutes(Math.ceil(value.getMinutes() / 15) * 15, 0, 0)
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

export default function ScheduleAgentCallModal({ agent, onClose, onSuccess }) {
  const [leads, setLeads] = useState(null)
  const [leadId, setLeadId] = useState('')
  const [scheduledAt, setScheduledAt] = useState(nextSlot)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`/api/agents/${agent.id}/schedule-options`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('No se pudieron cargar los contactos disponibles.')
        return response.json()
      })
      .then(items => {
        if (controller.signal.aborted) return
        const next = Array.isArray(items) ? items : []
        setLeads(next)
        if (next.length) setLeadId(next[0].id)
      })
      .catch(caught => { if (!controller.signal.aborted) { setLeads([]); setError(caught.message) } })
    return () => controller.abort()
  }, [agent.id])

  const minimum = useMemo(() => {
    const value = new Date(Date.now() + 5 * 60 * 1000)
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
  }, [])

  async function submit() {
    if (saving || done || !leadId || !scheduledAt) return
    setSaving(true); setError('')
    try {
      const response = await apiFetch(`/api/agents/${agent.id}/schedule-call`, { method: 'POST', body: JSON.stringify({ leadId, scheduledAt: new Date(scheduledAt).toISOString() }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo programar la llamada.')
      setDone(true)
      onSuccess?.(body)
    } catch (caught) {
      setError(caught.message)
    } finally {
      setSaving(false)
    }
  }

  return <FormModal title={`Programar llamada · ${agent.name}`} onClose={onClose} onSubmit={done ? onClose : submit} submitText={done ? 'Cerrar' : saving ? 'Programando…' : 'Programar llamada'} submitDisabled={!done && (saving || leads === null || !leads.length || !leadId || !scheduledAt)}>
    <p>El agente usará su configuración activa y la línea asignada.</p>
    {error && <p role="alert" className="team-modal-error">{error}</p>}
    {done ? <p role="status" className="team-modal-success">Llamada programada. El proceso la pondrá en cola a la hora elegida.</p> : leads === null ? <p>Cargando contactos…</p> : !leads.length ? <p>No hay contactos con teléfono listos para este agente.</p> : <>
      <label>Contacto<select value={leadId} onChange={event => setLeadId(event.target.value)} disabled={saving}>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name || 'Sin nombre'}{lead.company ? ` · ${lead.company}` : ''} · {lead.phone}</option>)}</select></label>
      <label>Fecha y hora<input type="datetime-local" value={scheduledAt} min={minimum} onChange={event => setScheduledAt(event.target.value)} disabled={saving} /></label>
    </>}
  </FormModal>
}
