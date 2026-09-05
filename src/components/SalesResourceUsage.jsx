import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { readSalesCollection } from '../lib/salesWorkspace'
import { useAuth } from '../contexts/AuthContext'

export default function SalesResourceUsage() {
  const { user } = useAuth() || {}
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setCampaigns(null); setError('')
    readSalesCollection(apiFetch, '/api/campaigns', { signal: controller.signal })
      .then(items => { if (!controller.signal.aborted) setCampaigns(items) }).catch(err => { if (!controller.signal.aborted) setError('No se pudieron consultar las asignaciones. Revisa tus permisos o vuelve a intentarlo.') })
    return () => controller.abort()
  }, [open, user?.orgId, retry])
  return <details className="sales-resource-usage" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Uso de documentos y guiones</summary>
    <p>La campaña vincula el guion con el agente que llama. Abre una campaña para cambiar su asignación. Los documentos forman una biblioteca compartida de la empresa. En las llamadas, el agente recibe un extracto de hasta seis documentos activos con contenido, empezando por los actualizados más recientemente. No todos los archivos se incluyen en cada llamada.</p>
    {error ? <p role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Reintentar</button></p> : !campaigns ? <p>Cargando asignaciones…</p> : campaigns.some(c => c.playbookId) ? <ul>{campaigns.filter(c => c.playbookId).map(c => <li key={c.id}><Link to={`/playbooks/${c.playbookId}`}>{c.playbook?.name || 'Ver guion'}</Link><span> · </span>{c.agentId ? <Link to={`/agentes/${c.agentId}`}>{c.agent?.name || 'Ver agente'}</Link> : <span>Sin agente asignado</span>}<span> · </span><Link to={`/campanas/${c.id}`}>{c.name}</Link></li>)}</ul> : <p>No hay campañas con un guion asignado.</p>}
  </details>
}
