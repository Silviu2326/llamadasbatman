import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  RiApps2Line,
  RiArrowRightSLine,
  RiCheckboxCircleLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiFlowChart,
  RiLoader4Line,
  RiPlayLine,
  RiPlugLine,
  RiSearchLine,
  RiStore2Line,
  RiToolsLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { CAPABILITIES_HUB_HERO } from '../lib/microappArt'
import PageLoadingState from '../components/ui/PageLoadingState'
import './capabilities-hub.css'

const TABS = [
  { id: 'microapps', label: 'Microapps', Icon: RiApps2Line },
  { id: 'flows', label: 'Flows', Icon: RiFlowChart },
  { id: 'providers', label: 'Proveedores', Icon: RiPlugLine },
  { id: 'marketplace', label: 'Marketplace', Icon: RiStore2Line },
]

async function getJson(path) {
  const response = await apiFetch(path)
  if (!response.ok) throw new Error(`${path}:${response.status}`)
  return response.json()
}

function contains(item, search) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const text = JSON.stringify(item).toLowerCase()
  return terms.every(term => text.includes(term))
}

function FlowRunner({ flow, onClose }) {
  const navigate = useNavigate()
  const defaults = flow?.currentVersion?.graph?.variables || {}
  const [variables, setVariables] = useState(() => JSON.stringify(defaults, null, 2))
  const [budget, setBudget] = useState('')
  const [state, setState] = useState('idle')
  const [result, setResult] = useState(null)

  useEffect(() => { setVariables(JSON.stringify(flow?.currentVersion?.graph?.variables || {}, null, 2)); setResult(null); setState('idle') }, [flow])

  async function run(dryRun) {
    setState('running'); setResult(null)
    try {
      const parsedVariables = variables.trim() ? JSON.parse(variables) : {}
      const euros = budget.trim() ? Number(budget.replace(',', '.')) : null
      if (euros != null && (!Number.isFinite(euros) || euros < 0)) throw new Error('El presupuesto no es válido.')
      const response = await apiFetch(`/api/flows/${flow.id}/run`, { method: 'POST', body: JSON.stringify({ variables: parsedVariables, ...(euros != null ? { budgetCents: Math.round(euros * 100) } : {}), dryRun }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `No se pudo iniciar (${response.status}).`)
      setResult(body); setState('done')
    } catch (error) { setResult({ error: error.message }); setState('error') }
  }

  return <aside className="cap-flow-runner" aria-label={`Ejecutar ${flow.name}`}><header><div><span>Flow publicado · v{flow.currentVersion?.version || '—'}</span><h2>{flow.name}</h2><p>{flow.description || 'Sin descripción'}</p></div><button type="button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button></header><div className="cap-flow-meta"><span>{flow.isSystem ? 'Sistema' : 'Organización'}</span><span>{flow.dependencies?.length || 0} capabilities</span></div><label><span>Variables JSON</span><textarea rows={11} value={variables} onChange={event => setVariables(event.target.value)} spellCheck="false" /></label><label><span>Presupuesto máximo (€)</span><input inputMode="decimal" placeholder="Sin límite adicional" value={budget} onChange={event => setBudget(event.target.value)} /></label>{result ? <div className={`cap-run-result ${state}`} role={state === 'error' ? 'alert' : 'status'}>{state === 'done' ? <RiCheckboxCircleLine /> : <RiErrorWarningLine />}<span><strong>{state === 'done' ? (result.dryRun ? 'Dry-run iniciado' : 'Flow iniciado') : 'No se pudo iniciar'}</strong><small>{state === 'done' ? `Run ${result.id} · ${result.status}` : result.error}</small></span></div> : null}<footer><button type="button" onClick={() => run(true)} disabled={state === 'running'}>Validar dry-run</button><button className="primary" type="button" onClick={() => run(false)} disabled={state === 'running'}>{state === 'running' ? <RiLoader4Line className="cap-spin" /> : <RiPlayLine />} Ejecutar</button></footer>{result?.id ? <button type="button" className="cap-open-jobs" onClick={() => navigate('/trabajos')}>Abrir Centro de trabajos <RiArrowRightSLine /></button> : null}</aside>
}

export default function CapabilitiesHubPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const tab = TABS.some(item => item.id === requestedTab) ? requestedTab : 'microapps'
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [data, setData] = useState({ microapps: [], flows: [], providers: [], marketplace: [] })
  const [state, setState] = useState('loading')

  const load = useCallback(async () => {
    setState('loading')
    const [microapps, flows, capabilities, marketplace] = await Promise.allSettled([
      getJson('/api/microapps'),
      getJson('/api/flows'),
      getJson('/api/capabilities'),
      getJson('/api/marketplace'),
    ])
    const appsBody = microapps.status === 'fulfilled' ? microapps.value : []
    const flowsBody = flows.status === 'fulfilled' ? flows.value : []
    const capabilitiesBody = capabilities.status === 'fulfilled' ? capabilities.value : {}
    const marketBody = marketplace.status === 'fulfilled' ? marketplace.value : []
    setData({
      microapps: Array.isArray(appsBody) ? appsBody : appsBody.microapps || [],
      flows: Array.isArray(flowsBody) ? flowsBody : flowsBody.flows || [],
      providers: capabilitiesBody.capabilities || [],
      marketplace: Array.isArray(marketBody) ? marketBody : marketBody.listings || marketplace.value?.items || [],
    })
    setState([microapps, flows, capabilities, marketplace].some(result => result.status === 'fulfilled') ? 'ready' : 'error')
  }, [])

  useEffect(() => { load() }, [load])
  const visible = useMemo(() => data[tab].filter(item => contains(item, deferredSearch)), [data, deferredSearch, tab])
  const selectedFlow = data.flows.find(flow => flow.id === searchParams.get('flow')) || null

  function selectTab(next) {
    setSearchParams({ tab: next }, { replace: true })
    setSearch('')
  }

  if (state === 'loading') return <PageLoadingState label="Cargando capacidades" />

  return <main className={`cap-page dark-scroll${selectedFlow ? ' has-runner' : ''}`}><header className="cap-header" style={{ backgroundImage: `url(${CAPABILITIES_HUB_HERO})` }}><div className="cap-heading"><span><RiToolsLine /></span><div><h1>Centro de capacidades</h1><p>Descubre y ejecuta habilidades, Flows y proveedores sin convertirlos en navegación permanente.</p></div></div></header><section className="cap-summary" aria-label="Resumen"><span><strong>{data.microapps.length}</strong> microapps</span><span><strong>{data.flows.length}</strong> Flows</span><span><strong>{data.providers.length}</strong> capabilities</span><span><strong>{data.marketplace.length}</strong> publicaciones</span></section><section className="cap-toolbar"><nav role="tablist">{TABS.map(item => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => selectTab(item.id)}><item.Icon /> {item.label}<small>{data[item.id].length}</small></button>)}</nav><label><RiSearchLine /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar en ${TABS.find(item => item.id === tab)?.label}…`} /></label></section>{state === 'loading' ? <div className="cap-state"><RiLoader4Line className="cap-spin" /><strong>Cargando capacidades…</strong></div> : null}{state === 'error' ? <div className="cap-state error"><RiErrorWarningLine /><strong>No se pudo cargar el catálogo.</strong><button onClick={load}>Reintentar</button></div> : null}{state === 'ready' && !visible.length ? <div className="cap-state"><RiSearchLine /><strong>No hay resultados</strong><span>Cambia la búsqueda o revisa tus conexiones y permisos.</span></div> : null}{state === 'ready' && visible.length ? <section className="cap-list">{tab === 'microapps' ? visible.map(app => <button type="button" key={app.id} onClick={() => navigate(`/microapps/${app.id}`)}><span className="cap-item-icon"><RiApps2Line /></span><span><strong>{app.name}</strong><small>{app.promise}</small></span><em>{app.category}</em><RiArrowRightSLine /></button>) : null}{tab === 'flows' ? visible.map(flow => <button type="button" key={flow.id} onClick={() => setSearchParams({ tab: 'flows', flow: flow.id })}><span className="cap-item-icon flow"><RiFlowChart /></span><span><strong>{flow.name}</strong><small>{flow.description || flow.slug}</small></span><em>{flow.isSystem ? 'Sistema' : `v${flow.currentVersion?.version || '—'}`}</em><RiPlayLine /></button>) : null}{tab === 'providers' ? visible.map(item => <article key={item.capability}><span className="cap-item-icon provider"><RiPlugLine /></span><span><strong>{item.capability}</strong><small>{item.providers?.map(provider => provider.displayName).join(' · ') || 'Sin proveedor enrutable'}</small></span><em>{item.providers?.length || 0} proveedores</em></article>) : null}{tab === 'marketplace' ? visible.map(item => <button type="button" key={item.id || item.slug} onClick={() => navigate(`/marketplace/${item.id || item.slug}`)}><span className="cap-item-icon market"><RiStore2Line /></span><span><strong>{item.name}</strong><small>{item.description || item.category}</small></span><em>{item.kind || 'publicación'}</em><RiArrowRightSLine /></button>) : null}</section> : null}{selectedFlow ? <FlowRunner flow={selectedFlow} onClose={() => setSearchParams({ tab: 'flows' }, { replace: true })} /> : null}</main>
}
