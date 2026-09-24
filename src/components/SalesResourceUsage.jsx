import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { readSalesCollection } from '../lib/salesWorkspace'
import { useAuth } from '../contexts/AuthContext'

/**
 * Quién usa cada guion: campañas (`Campaign.playbookId`) y agentes con guion
 * activo (`Agent.settings.activePlaybookId`), que hasta ahora no se veían.
 */
export default function SalesResourceUsage() {
  const { user } = useAuth() || {}
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState(null)
  const [agents, setAgents] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setCampaigns(null); setAgents(null); setError('')
    Promise.all([
      readSalesCollection(apiFetch, '/api/campaigns', { signal: controller.signal }),
      apiFetch('/api/agents', { signal: controller.signal }).then(response => response.ok ? response.json() : []).then(body => Array.isArray(body) ? body : body?.data ?? []),
    ])
      .then(([campaignItems, agentItems]) => { if (!controller.signal.aborted) { setCampaigns(campaignItems); setAgents(agentItems) } })
      .catch(() => { if (!controller.signal.aborted) setError('No se pudieron consultar las asignaciones. Revisa tus permisos o vuelve a intentarlo.') })
    return () => controller.abort()
  }, [open, user?.orgId, retry])

  const campaignsWithPlaybook = (campaigns || []).filter(campaign => campaign.playbookId)
  const agentsWithPlaybook = (agents || []).filter(agent => typeof agent?.settings?.activePlaybookId === 'string' && agent.settings.activePlaybookId)
  const playbookName = id => campaignsWithPlaybook.find(campaign => campaign.playbookId === id)?.playbook?.name

  return <details className="sales-resource-usage" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Uso de documentos y guiones</summary>
    <p>Un guion llega al agente de dos formas: como guion activo del propio agente (ficha del agente → estrategia) o a través de la campaña. Los documentos son una biblioteca compartida: cada agente usa todos por defecto o los que se le marquen en su ficha. En cada llamada entran hasta ocho fichas, elegidas por relevancia con el rol del agente y la conversación, con un tope de caracteres por ficha y para el prompt completo.</p>
    {error ? <p role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Reintentar</button></p> : !campaigns || !agents ? <p>Cargando asignaciones…</p> : <>
      <p><strong>Agentes con guion activo</strong></p>
      {agentsWithPlaybook.length ? <ul>{agentsWithPlaybook.map(agent => <li key={agent.id}><Link to={`/agentes/${agent.id}`}>{agent.name}</Link><span> · </span><Link to={`/playbooks/${agent.settings.activePlaybookId}`}>{playbookName(agent.settings.activePlaybookId) || 'Ver guion'}</Link></li>)}</ul> : <p>Ningún agente tiene un guion activo.</p>}
      <p><strong>Campañas con guion</strong></p>
      {campaignsWithPlaybook.length ? <ul>{campaignsWithPlaybook.map(c => <li key={c.id}><Link to={`/playbooks/${c.playbookId}`}>{c.playbook?.name || 'Ver guion'}</Link><span> · </span>{c.agentId ? <Link to={`/agentes/${c.agentId}`}>{c.agent?.name || 'Ver agente'}</Link> : <span>Sin agente asignado</span>}<span> · </span><Link to={`/campanas/${c.id}`}>{c.name}</Link></li>)}</ul> : <p>No hay campañas con un guion asignado.</p>}
    </>}
  </details>
}
