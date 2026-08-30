import { useEffect, useMemo, useState } from 'react'
import { RiArrowRightSLine, RiLoader4Line, RiRestartLine, RiSparkling2Line, RiTimeLine } from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import '../pages/microapps-catalog.css'

const ENTITY_QUERY = { lead: 'leadId', account: 'accountId', call: 'callId', opportunity: 'opportunityId', conversation: 'conversationId', meeting: 'meetingId' }

export function MicroappSurfaceActions({ surface, entityId, className = '' }) {
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')
  useEffect(() => {
    let active = true
    const query = entityId ? `?entityId=${encodeURIComponent(entityId)}` : ''
    apiFetch(`/api/microapps/surfaces/${surface}${query}`).then(response => response.ok ? response.json() : Promise.reject(new Error('surface'))).then(body => { if (active) { setItems(Array.isArray(body?.microapps) ? body.microapps : []); setState('ready') } }).catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [surface, entityId])
  const primary = useMemo(() => items.find(item => item.role === 'primary') || items[0], [items])
  const secondary = useMemo(() => items.filter(item => item !== primary), [items, primary])
  if (state === 'loading') return <span className={`microapp-surface-actions ${className}`}><RiLoader4Line className="microapp-surface-spin" /> Cargando capacidades…</span>
  if (state === 'error' || !primary) return null
  function open(item) {
    const param = ENTITY_QUERY[surface]
    const query = param && entityId ? `?${param}=${encodeURIComponent(entityId)}&drawer=1` : '?drawer=1'
    window.history.pushState({}, '', `/microapps/${encodeURIComponent(item.id)}${query}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  return <div className={`microapp-surface-actions ${className}`}>
    <button type="button" className="microapp-primary-action" onClick={() => open(primary)}><RiSparkling2Line /> {primary.actionLabel}<RiArrowRightSLine /></button>
    {secondary.length > 0 && <details className="microapp-more-actions"><summary>Más capacidades</summary><div>{secondary.map(item => <button key={item.id} type="button" onClick={() => open(item)}>{item.actionLabel}<small>{item.name}</small></button>)}</div></details>}
  </div>
}

export function MicroappProjectionPanel({ surface, entityId, title = 'Proyecciones' }) {
  const [projections, setProjections] = useState([])
  useEffect(() => {
    if (!entityId) return undefined
    let active = true
    apiFetch(`/api/microapps/projections?surface=${encodeURIComponent(surface)}&entityId=${encodeURIComponent(entityId)}`).then(response => response.ok ? response.json() : null).then(body => { if (active) setProjections(Array.isArray(body?.projections) ? body.projections : []) }).catch(() => {})
    return () => { active = false }
  }, [surface, entityId])
  function regenerate(item) {
    const param = ENTITY_QUERY[surface]
    const query = param && entityId ? `?${param}=${encodeURIComponent(entityId)}&drawer=1` : '?drawer=1'
    window.history.pushState({}, '', `/microapps/${encodeURIComponent(item.microappId)}${query}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  if (!projections.length) return null
  return <section className="microapp-projections"><header><h3>{title}</h3><span>{projections.length}</span></header>{projections.map(item => <article key={item.id} className={item.stale ? 'stale' : ''}><div><strong>{item.kind}</strong><small>{item.stale ? <><RiTimeLine /> Caducado</> : 'Fijado en esta ficha'}</small></div><p>{typeof item.payload === 'string' ? item.payload : item.payload?.resumen || item.payload?.summary || item.payload?.nextAction || 'Resultado disponible'}</p>{item.stale && item.microappId && <button type="button" className="microapp-regenerate" onClick={() => regenerate(item)}><RiRestartLine /> Volver a generar</button>}</article>)}</section>
}
