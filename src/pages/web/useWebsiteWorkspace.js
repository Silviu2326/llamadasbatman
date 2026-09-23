import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
async function read(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'No se pudieron cargar los datos de la web.')
  return body
}
export function useWebsiteWorkspace(requestedId) {
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const load = () => apiFetch('/api/web-connections', { signal: controller.signal }).then(read).then(body => {
      if (!controller.signal.aborted) { setConnections(Array.isArray(body) ? body : []); setError('') }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    load()
    const timer = setInterval(load, 60000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [revision])
  const connection = connections.find(item => item.id === requestedId) || connections[0] || null
  const id = connection?.id
  useEffect(() => {
    if (!id) { setOverview(null); return }
    const controller = new AbortController()
    let timer
    setOverview(null)
    async function poll() {
      try {
        const body = await read(await apiFetch('/api/web-connections/' + id + '/seo', { signal: controller.signal }))
        if (controller.signal.aborted) return
        setOverview({ ...body, connectionId: id }); setError('')
        const active = body.jobs?.some(job => ['pending', 'running', 'waiting_provider'].includes(job.status)) || body.proposals?.some(item => ['queued', 'running'].includes(item.status))
        timer = setTimeout(poll, active ? 4000 : 30000)
      } catch (err) {
        if (!controller.signal.aborted) { setError(err.message); timer = setTimeout(poll, 15000) }
      }
    }
    poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [id, revision])
  async function audit() {
    if (!id || busy) return
    setBusy(true); setError('')
    try { await read(await apiFetch('/api/web-connections/' + id + '/seo/audit', { method: 'POST' })); reload() }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return { connections, connection, overview: overview?.connectionId === id ? overview : null, loading, error, busy, audit, reload }
}
