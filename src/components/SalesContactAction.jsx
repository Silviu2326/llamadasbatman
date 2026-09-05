import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import FormModal from './ui/FormModal'
import NewReunionModal from '../modals/NewReunionModal'

// Resolves the contact first; opening the dialog never starts a real call.
export default function SalesContactAction({ record, action, onClose, onSuccess }) {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState([])
  const [leadId, setLeadId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const endpoint = record.entity === 'account' ? `/api/accounts/${record.id}` : `/api/leads/${record.leadId || record.id}`
    apiFetch(endpoint, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('No se pudo consultar el contacto. Cierra y vuelve a intentarlo.')
      const body = await response.json()
      if (controller.signal.aborted) return
      const items = record.entity === 'account' ? body.leads || [] : [body]
      setContacts(items); setLeadId(items.length === 1 ? items[0].id : '')
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [record.entity, record.id, record.leadId])
  const lead = contacts.find(item => item.id === leadId)
  async function submit() {
    if (busy || !lead) return
    if (action === 'meeting') { setReady(true); return }
    setBusy(true); setError('')
    try {
      const response = await apiFetch(`/api/leads/${lead.id}/call-now`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok || body.queued !== true) {
        const messages = { lead_without_campaign: 'Asigna este contacto a una campaña con un agente antes de llamar.', lead_without_phone: 'Añade un teléfono a este contacto.', call_queue_unavailable: 'El servicio de llamadas no está disponible. Inténtalo más tarde.' }
        throw new Error(messages[body.error] || 'No se pudo poner la llamada en cola. Revisa la configuración del contacto y su campaña.')
      }
      setDone(true); onSuccess?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  if (ready && lead) return <NewReunionModal initialLead={lead} onClose={onClose} onSuccess={item => { onSuccess?.(item); onClose() }} />
  return <FormModal title={action === 'meeting' ? 'Programar reunión' : 'Llamar al contacto'} onClose={() => { if (!busy) onClose() }} onSubmit={done ? onClose : submit} submitText={done ? 'Cerrar' : busy ? 'Preparando llamada…' : action === 'meeting' ? 'Elegir fecha y hora' : 'Iniciar llamada'} submitDisabled={!done && (loading || busy || !lead || (action === 'call' && !lead.phone))}>
    <p>{record.title || record.name}</p>
    {error && <p role="alert">{error}</p>}
    {done ? <p role="status">La llamada está en cola. <button type="button" onClick={() => navigate(`/llamadas?leadId=${encodeURIComponent(lead.id)}`)}>Ver llamadas de este contacto</button></p> : loading ? <p>Cargando contacto…</p> : error && !contacts.length ? null : <>
      {contacts.length ? <label>Contacto<select value={leadId} onChange={event => setLeadId(event.target.value)}><option value="">Selecciona una persona</option>{contacts.map(item => <option key={item.id} value={item.id}>{item.name}{item.phone ? ` · ${item.phone}` : ' · Sin teléfono'}</option>)}</select></label> : <p>No hay contactos vinculados. Añade uno desde la ficha de la empresa.</p>}
      {lead && <><p>{action === 'call' ? `Se llamará a ${lead.phone || 'un contacto sin teléfono'} con el agente de su campaña. Se aplicará el consumo habitual de llamadas.` : `La reunión quedará vinculada a ${lead.name}.`}</p><button type="button" onClick={() => navigate(`/ventas/lead/${lead.id}`)}>Abrir ficha del contacto</button></>}
    </>}
  </FormModal>
}
