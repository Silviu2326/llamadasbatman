import { useEffect, useRef, useState } from 'react'
import { RiArrowRightLine, RiCheckLine, RiFlashlightLine, RiLoader4Line } from 'react-icons/ri'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { refreshAssistantScreen } from '../lib/assistantScreen'

export async function assistantApi(path, options = {}) {
  const response = await apiFetch(`/api/assistant${path}`, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.')
  return data
}
const SCREEN_LABELS = { dashboard: 'Resumen', crm: 'CRM', calendar: 'Calendario', intelligence: 'Inteligencia', calls: 'Llamadas', agents: 'Agentes IA', resources: 'Documentos y guiones', plan: 'Plan y objetivos', insights: 'Análisis del negocio', all: 'Todos', meeting: 'Reuniones', task: 'Tareas', pending: 'Pendientes', completed: 'Completadas', cancelled: 'Canceladas' }
const LABELS = { expired: 'Caducada', pending: 'Pendiente de ejecutar', running: 'Procesando; comprueba el resultado', completed: 'Completada', cancelled: 'Cancelada', failed: 'No realizada', uncertain: 'Resultado pendiente de comprobar', open: 'Pendiente', in_progress: 'En curso', low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente', new: 'Nuevo', contacted: 'Contactado', qualified: 'Cualificado', unqualified: 'No cualificado', converted: 'Convertido' }
const valueText = (key, value) => key === 'dueAt' && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : LABELS[value] || String(value)

export function AssistantActionCard({ action, onChange, onClose }) {
  const navigate = useNavigate(), lock = useRef(false)
  const [current, setCurrent] = useState(action), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  useEffect(() => setCurrent(action), [action])
  async function execute(cancel = false, refresh = false) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const data = refresh ? (await assistantApi('/actions')).actions.find(item => item.id === current.id) : await assistantApi('/actions/execute', { method: 'POST', body: JSON.stringify({ id: current.id, cancel }) })
      if (!data) throw new Error('La acción ya no está disponible con tus permisos actuales.')
      setCurrent(data); setUncertain(false); onChange?.(data)
      if (data.status === 'completed') refreshAssistantScreen()
    } catch (failure) { setError(failure.message); setUncertain(true) }
    finally { lock.current = false; setBusy(false) }
  }
  async function undo() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const data = await assistantApi(`/actions/${encodeURIComponent(current.id)}/undo`, { method: 'POST', body: '{}' })
      const updated = { ...current, ...data }
      setCurrent(updated); onChange?.(updated); refreshAssistantScreen()
    } catch (failure) { setError(failure.message) }
    finally { lock.current = false; setBusy(false) }
  }
  const completed = current.status === 'completed'
  return <article className={`assistant-action-card is-${current.status}`} aria-label={current.label}>
    <div className="assistant-action-heading"><RiFlashlightLine /><strong>{current.label}</strong><span>{completed ? <RiCheckLine /> : null}{LABELS[current.status] || current.status}</span></div>
    {current.target ? <p className="assistant-action-target">{current.target}</p> : null}
    <dl>{Object.entries(current.args).map(([key, value]) => <div key={key}><dt>{current.fields?.[key]?.label || key}</dt><dd>{['leadId', 'taskId'].includes(key) && current.target ? current.target : valueText(key, value)}</dd></div>)}</dl>
    {current.error || error ? <p role="alert" className="assistant-operation-error">{error || current.error}</p> : null}
    <div className="assistant-action-buttons">
      {current.undoAvailable ? <button type="button" disabled={busy} onClick={undo}>{busy ? 'Procesando…' : current.undoLabel || 'Deshacer tarea'}</button> : null}
      {current.undoStatus === 'completed' ? <span>Tarea cancelada al deshacer</span> : null}
      {current.status === 'pending' && !uncertain ? <><button type="button" className="assistant-action-primary" disabled={busy} onClick={() => execute()}>{busy ? <RiLoader4Line /> : <RiFlashlightLine />}Ejecutar</button><button type="button" disabled={busy} onClick={() => execute(true)}>Cancelar</button></> : null}
      {uncertain || ['running', 'uncertain'].includes(current.status) ? <button type="button" disabled={busy} onClick={() => execute(false, true)}>Comprobar estado</button> : null}
      {current.link ? <button type="button" disabled={busy} onClick={() => { onClose?.(); navigate(current.link) }}>{completed ? 'Ver en la aplicación' : 'Abrir sección'}<RiArrowRightLine /></button> : null}
    </div>
  </article>
}

export function AssistantQueryResult({ result, onScreenCommand }) {
  const [screenError, setScreenError] = useState('')
  const data = result.data
  const rows = data?.leads || data?.tasks || data?.items || (Array.isArray(data?.data) ? data.data : null) || (Array.isArray(data) ? data : null)
  return <section className="assistant-query-result"><h4>{result.label}</h4>{rows ? <>
    {!rows.length ? <p>No se encontraron registros con estos filtros.</p> : rows.map((row, index) => <div className="assistant-result-row" key={row.id || index}><strong>{row.name || row.title || 'Registro'}</strong><span>{[row.company, row.email, row.phone, LABELS[row.status] || row.status].filter(Boolean).join(' · ')}</span>{row.dueAt ? <span>{valueText('dueAt', row.dueAt)}</span> : null}{result.label === 'Buscar contactos' && onScreenCommand ? <button type="button" onClick={() => { setScreenError(''); onScreenCommand({ name: 'open_contact', args: { leadId: row.id } }).catch(error => setScreenError(error.message)) }}>Abrir contacto en el CRM<RiArrowRightLine /></button> : null}</div>)}
    {screenError ? <p role="alert">{screenError}</p> : null}
    <small>Hasta 10 registros por consulta{typeof data?.total === 'number' ? ` · ${data.total} coincidencias` : ''}.</small>
  </> : <><p>Información consultada de tu empresa. Los documentos se muestran como extractos.</p><details><summary>Ver información</summary><pre>{JSON.stringify(data, null, 2)}</pre></details></>}</section>
}

function AssistantEntityPicker({ field, value, onChange }) {
  const [search, setSearch] = useState(''), [items, setItems] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false)
  const lookup = useRef(null)
  useEffect(() => () => lookup.current?.abort(), [])
  async function find() {
    if (busy) return
    const controller = new AbortController(); lookup.current = controller
    setBusy(true); setError(''); onChange('')
    try {
      const result = await assistantApi('/tools', { method: 'POST', signal: controller.signal, body: JSON.stringify({ name: field.type === 'contact' ? 'find_contacts' : 'list_tasks', args: field.type === 'contact' && search.trim() ? { search: search.trim() } : {}, requestId: crypto.randomUUID() }) })
      setItems(result.data?.data || result.data?.leads || result.data?.tasks || []); setLoaded(true)
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <div className="assistant-entity-picker">
    <label>{field.label}{field.required ? ' *' : ''}<select aria-label={field.label} required={field.required} value={value || ''} onChange={event => onChange(event.target.value)}><option value="">{field.required ? 'Selecciona un registro…' : 'Sin vincular'}</option>{items.map(item => <option key={item.id} value={item.id}>{item.name || item.title}{item.company ? ` · ${item.company}` : ''}</option>)}</select></label>
    <div>{field.type === 'contact' ? <input aria-label="Buscar contacto por nombre" maxLength={200} placeholder="Nombre, empresa o email" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); find() } }} /> : null}<button type="button" disabled={busy} onClick={find}>{busy ? 'Buscando…' : field.type === 'contact' ? 'Buscar contactos' : 'Cargar mis tareas'}</button></div>
    {loaded && !items.length ? <small>No hay coincidencias. Prueba otra búsqueda.</small> : null}{error ? <p role="alert" className="assistant-operation-error">{error}</p> : null}
  </div>
}

export default function AssistantOperations({ onClose, onScreenCommand, onWorkflowDraft }) {
  const [tools, setTools] = useState([]), [actions, setActions] = useState([]), [selected, setSelected] = useState(''), [args, setArgs] = useState({})
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null)
  const lock = useRef(false), requestId = useRef(crypto.randomUUID())
  const tool = tools.find(item => item.name === selected)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([assistantApi('/capabilities', { signal: controller.signal }), assistantApi('/actions', { signal: controller.signal })]).then(([catalog, history]) => {
      setTools(catalog.tools || []); setActions(history.actions || []); setSelected(catalog.tools?.find(item => item.name === 'create_task')?.name || catalog.tools?.[0]?.name || '')
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  const updateAction = action => setActions(current => current.map(item => item.id === action.id ? action : item))
  async function run(event) {
    event.preventDefault()
    if (lock.current || !tool) return
    lock.current = true; setBusy(true); setError(''); setResult(null)
    try {
      const values = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== '').map(([key, value]) => [key, tool.fields[key]?.type === 'datetime-local' ? new Date(value).toISOString() : value]))
      const response = await assistantApi('/tools', { method: 'POST', body: JSON.stringify({ name: tool.name, args: values, requestId: requestId.current }) })
      if (response.kind === 'workflow') onWorkflowDraft?.(response.workflowDraft)
      else if (response.kind === 'screen') await onScreenCommand(response.command)
      else if (response.kind === 'action') { setActions(current => [response.action, ...current.filter(item => item.id !== response.action.id)]); setArgs({}) }
      else setResult(response)
      requestId.current = crypto.randomUUID()
    } catch (failure) { setError(failure.message) }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="assistant-operations"><div className="assistant-operations-intro"><RiFlashlightLine /><h3>Del mensaje a la acción</h3><p>Abre pantallas, aplica filtros, rellena formularios y prepara cambios en tu negocio. Estas herramientas funcionan también cuando la IA no está disponible.</p></div>
    {loading ? <p role="status">Cargando herramientas y acciones…</p> : null}
    {!loading && !tools.length && !error ? <p>No hay herramientas disponibles con tu rol actual.</p> : null}
    {tools.length ? <form className="assistant-operation-form" onSubmit={run}><fieldset disabled={busy}><label>Qué quieres hacer<select value={selected} onChange={event => { setSelected(event.target.value); setArgs({}); setResult(null); setError(''); requestId.current = crypto.randomUUID() }}>{tools.map(item => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label>
      {tool ? Object.entries(tool.fields).map(([key, field]) => ['contact', 'task'].includes(field.type) ? <AssistantEntityPicker key={`${selected}-${key}`} field={field} value={args[key]} onChange={value => setArgs(current => ({ ...current, [key]: value }))} /> : <label key={`${selected}-${key}`}>{field.label}{field.required ? ' *' : ''}{field.options ? <select aria-label={field.label} required={field.required} value={args[key] || ''} onChange={event => setArgs(current => ({ ...current, [key]: event.target.value }))}><option value="">Selecciona…</option>{field.options.map(value => <option key={value} value={value}>{(tool.screen ? SCREEN_LABELS[value] : null) || LABELS[value] || value}</option>)}</select> : field.type === 'textarea' ? <textarea required={field.required} rows={3} maxLength={2000} value={args[key] || ''} onChange={event => setArgs(current => ({ ...current, [key]: event.target.value }))} /> : <input type={field.type || 'text'} required={field.required} maxLength={key === 'title' ? 200 : key === 'name' ? 160 : 254} value={args[key] || ''} onChange={event => setArgs(current => ({ ...current, [key]: event.target.value }))} />}</label>) : null}
      <button className="assistant-action-primary" type="submit">{busy ? <RiLoader4Line /> : <RiFlashlightLine />}{busy ? 'Procesando…' : tool?.write ? 'Preparar acción' : tool?.screen ? 'Aplicar en pantalla' : 'Consultar'}</button></fieldset></form> : null}
    {error ? <p role="alert" className="assistant-operation-error">{error}</p> : null}
    {result ? <AssistantQueryResult result={result} onScreenCommand={onScreenCommand} /> : null}
    {actions.length ? <div className="assistant-action-history"><h4>Tus acciones recientes</h4>{actions.map(action => <AssistantActionCard key={action.id} action={action} onChange={updateAction} onClose={onClose} />)}</div> : null}
  </div>
}
