import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiAddLine, RiArrowRightLine, RiCalendarLine, RiExternalLinkLine, RiPhoneLine, RiPlayFill, RiSearchLine, RiShieldCheckLine, RiUserVoiceLine } from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import NewAgenteModal from '../modals/NewAgenteModal'
import ScheduleAgentCallModal from './ScheduleAgentCallModal'
import './agents-team.css'

const ZERO = { calls: 0, conversations: 0, meetings: 0, qualified: 0 }
const CALL_LABELS = { completed: 'Llamada completada', failed: 'No se pudo conectar', no_answer: 'Sin respuesta', busy: 'Línea ocupada' }
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateLabel = value => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const money = (value, code) => new Intl.NumberFormat('es', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value)
function periodQuery(date) {
  const start = new Date(`${date}T00:00:00`)
  const next = new Date(start); next.setDate(next.getDate() + 1)
  const previous = new Date(start); previous.setDate(previous.getDate() - 1)
  return new URLSearchParams({ start: start.toISOString(), end: new Date(Math.min(next.getTime(), Date.now())).toISOString(), previousStart: previous.toISOString() })
}
function Avatar({ agent, small = false }) {
  const name = agent?.name || 'Agente'
  const tone = name.charCodeAt(0) % 3
  return <span className={`team-avatar tone-${tone}${small ? ' small' : ''}`} aria-hidden="true">{name.split(' ').slice(0, 2).map(word => word[0]).join('')}</span>
}
function Empty({ icon: Icon = RiUserVoiceLine, title, children }) {
  return <div className="team-empty"><span><Icon /></span><strong>{title}</strong><p>{children}</p></div>
}
export default function AgentsTeam() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState(null)
  const [overview, setOverview] = useState(null)
  const [approvals, setApprovals] = useState(null)
  const [errors, setErrors] = useState({})
  const date = dateKey()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState('agents')
  const [creating, setCreating] = useState(false)
  const [scheduleAgent, setScheduleAgent] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let running = false
    setOverview(null); setApprovals(null); setErrors({})
    async function update() {
      if (running) return
      running = true
      const read = async url => {
        const response = await apiFetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(response.status === 403 ? 'No tienes acceso a estos datos.' : 'No se pudieron cargar los datos.')
        return response.json()
      }
      const results = await Promise.allSettled([read('/api/agents'), read(`/api/agents/team-overview?${periodQuery(date)}`), read('/api/jobs?status=awaiting_approval&limit=4')])
      if (controller.signal.aborted) return
      const nextErrors = {}
      results.forEach((result, index) => {
        const key = ['agents', 'overview', 'approvals'][index]
        if (result.status === 'fulfilled') [setAgents, setOverview, setApprovals][index](result.value)
        else nextErrors[key] = result.reason.message
      })
      setErrors(nextErrors); running = false
    }
    update()
    const timer = setInterval(() => { if (!document.hidden) update() }, 30000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [date, reload])
  const rows = useMemo(() => (agents || []).filter(agent => `${agent.name} ${agent.role || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (status === 'all' || agent.isActive === (status === 'active'))).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'es') : new Date(b.createdAt) - new Date(a.createdAt)), [agents, search, status, sort])
  const byId = useMemo(() => Object.fromEntries((agents || []).map(agent => [agent.id, agent])), [agents])
  const latest = useMemo(() => Object.fromEntries((overview?.latest || []).map(call => [call.agentId, call])), [overview])
  const stats = id => overview ? overview.agents[id] || ZERO : null
  const totalCalls = overview ? Object.values(overview.agents).reduce((total, row) => total + row.calls, 0) : null
  const change = overview?.previousCalls > 0 ? Math.round((totalCalls - overview.previousCalls) / overview.previousCalls * 100) : null
  const dayTitle = 'hoy'
  const openAgent = agent => navigate(`/agentes/${agent.id}`)
  const openCall = call => navigate(`/llamadas/${call.id}`)
  const jobsUrl = '/trabajos?status=awaiting_approval'
  const pending = approvals?.pagination?.total
  return <section className="agents-team-page">
    <header className="team-heading"><div><h1>Equipo de ventas</h1><p>Supervisa la actividad, los resultados y las tareas de tus agentes.</p></div><div className="team-heading-actions"><button className="team-button primary" onClick={() => setCreating(true)}><RiAddLine /> Crear agente</button></div></header>
    {(errors.agents || errors.overview) && <div className="team-error" role="status">{errors.agents || errors.overview} <button onClick={() => setReload(value => value + 1)}>Reintentar</button></div>}
    <section className="team-summary team-panel" aria-label="Resumen del equipo"><div className="team-summary-main"><h2>Resumen de {dayTitle}</h2><div className="team-kpis">
      <div className="team-kpi"><span className="team-kpi-main"><i className="team-dot" /><strong>{agents ? agents.filter(agent => agent.isActive).length : '—'}</strong> agentes activos</span><small>de {agents?.length ?? '—'} agentes</small></div>
      <div className="team-kpi"><span className="team-kpi-main"><strong>{totalCalls ?? '—'}</strong> llamadas</span><small>{change === null ? 'Durante hoy' : <><b className={change >= 0 ? 'positive' : ''}>{change > 0 ? '+' : ''}{change}%</b> frente al día anterior</>}</small></div>
      <div className="team-kpi"><span className="team-kpi-main"><strong>{overview ? overview.pipeline.reduce((sum, item) => sum + item.count, 0) : '—'}</strong> oportunidades abiertas</span><small>{overview?.pipeline.length ? overview.pipeline.map(item => money(item.value, item.currency)).join(' · ') : 'En tu pipeline actual'}</small></div>
      <button className="team-kpi team-kpi-link" onClick={() => navigate(jobsUrl)} disabled={!!errors.approvals}><span className="team-kpi-main"><strong>{pending ?? '—'}</strong> aprobaciones</span><small>Pendientes de revisar <RiArrowRightLine /></small></button>
    </div></div><aside className="team-live"><h2>Actividad del equipo</h2>{overview?.latest.length ? overview.latest.slice(0, 2).map(call => <button className="team-live-item" key={call.id} onClick={() => openCall(call)}><Avatar agent={byId[call.agentId]} small /><span><strong>{byId[call.agentId]?.name || 'Agente'}</strong> tuvo actividad<small>{dateLabel(call.createdAt)}</small></span></button>) : <p className="team-muted">{overview ? 'La próxima llamada aparecerá aquí.' : 'Esperando datos del equipo…'}</p>}</aside></section>
    <div className="team-toolbar"><div className="team-tabs" role="tablist" aria-label="Vista del equipo"><button id="team-agents-tab" role="tab" aria-selected={view === 'agents'} aria-controls="team-view" onClick={() => setView('agents')}>Agentes ({agents?.length ?? '—'})</button><button id="team-performance-tab" role="tab" aria-selected={view === 'performance'} aria-controls="team-view" onClick={() => setView('performance')}>Rendimiento</button></div><div className="team-filters"><label className="team-search"><RiSearchLine /><input aria-label="Buscar agente" placeholder="Buscar agente…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Estado del agente" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="paused">Pausados</option></select><select aria-label="Ordenar agentes" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Más recientes</option><option value="name">Nombre A–Z</option></select></div></div>
    <section id="team-view" className="team-panel team-table-panel" role="tabpanel" aria-labelledby={view === 'agents' ? 'team-agents-tab' : 'team-performance-tab'}>
      {view === 'agents' ? <div className="team-table-scroll"><table className="team-table"><thead><tr><th rowSpan="2" scope="col">Agente</th><th rowSpan="2" scope="col">Última actividad</th><th colSpan="3" scope="colgroup" className="team-today">Hoy</th><th rowSpan="2" scope="col">Resultados</th><th rowSpan="2" scope="col">Objetivo</th><th rowSpan="2" scope="col">Acciones</th></tr><tr className="team-subhead"><th scope="col">Llamadas</th><th scope="col">Conversaciones</th><th scope="col">Reuniones</th></tr></thead><tbody>
        {rows.map(agent => { const metric = stats(agent.id); const call = latest[agent.id]; const goal = Number(agent.settings?.dailyMeetingGoal) || 0; const progress = metric && goal ? Math.min(100, Math.round(metric.meetings / goal * 100)) : 0; return <tr key={agent.id}>
          <td><div className="team-identity"><Avatar agent={agent} /><div><div className="team-name-line"><button className="team-name" onClick={() => openAgent(agent)}>{agent.name}</button><span className={`team-status ${agent.isActive ? 'active' : 'paused'}`}><i />{agent.isActive ? 'Activo' : 'Pausado'}</span></div><p>{agent.role || 'Agente de voz'}</p><small>{agent.callDirection === 'inbound' ? 'Recibe y atiende llamadas.' : agent.callDirection === 'both' ? 'Llamadas entrantes y salientes.' : 'Realiza llamadas salientes.'}</small></div></div></td>
          <td><div className="team-call-state"><RiPhoneLine /><div><strong>{call ? call.isTest ? 'Prueba de voz' : CALL_LABELS[call.status] || 'Última llamada' : 'Sin actividad'}</strong><p>{call?.lead?.company || call?.lead?.name || 'Aún no hay llamadas'}</p>{call && <small>{dateLabel(call.createdAt)}</small>}</div></div></td>
          <td className="team-number">{metric?.calls ?? '—'}</td><td className="team-number">{metric?.conversations ?? '—'}</td><td className="team-number">{metric?.meetings ?? '—'}</td>
          <td><div className="team-result"><span><RiUserVoiceLine /></span><strong>{metric?.qualified ?? '—'}</strong></div><small>conversaciones<br />cualificadas</small></td>
          <td>{goal ? <><strong>{metric ? `${progress}%` : '—'}</strong><progress value={progress} max="100" aria-label={`Objetivo de ${agent.name}`} /><small>{metric?.meetings ?? '—'} de {goal} reuniones</small></> : <><span className="team-muted">Sin objetivo</span><small className="team-goal-caption">Reuniones al día</small></>}</td>
          <td><div className="team-row-actions"><button className="team-button compact" onClick={() => openAgent(agent)} aria-label={`Abrir ${agent.name}`}><RiExternalLinkLine />Abrir</button><button className="team-button compact" onClick={() => setScheduleAgent(agent)} aria-label={`Programar una llamada con ${agent.name}`}><RiCalendarLine />Programar</button><button className="team-button primary compact" onClick={() => navigate(`/voz/cabina?agentId=${agent.id}`)} aria-label={`Probar ${agent.name}`}><RiPlayFill />Probar</button></div></td>
        </tr> })}
        {!rows.length && <tr><td colSpan="8"><Empty title={agents === null ? errors.agents ? 'No pudimos cargar el equipo' : 'Cargando tu equipo…' : agents.length ? 'No hay agentes con estos filtros' : 'Tu equipo empieza aquí'}>{agents?.length ? 'Prueba otro nombre o cambia el estado.' : 'Crea tu primer agente para empezar a conversar.'}</Empty></td></tr>}
      </tbody></table></div> : <div className="team-performance"><h2>De la llamada a la reunión</h2><p className="team-muted">Actividad de {dayTitle} de los agentes seleccionados.</p>{rows.map(agent => { const metric = stats(agent.id); return <div className="team-performance-row" key={agent.id}><div className="team-identity"><Avatar agent={agent} small /><strong>{agent.name}</strong></div>{[['calls', 'Llamadas'], ['conversations', 'Conversaciones'], ['meetings', 'Reuniones']].map(([key, label]) => <div key={key}><span>{label}<b>{metric?.[key] ?? '—'}</b></span><progress value={metric?.[key] || 0} max={Math.max(metric?.calls || 0, metric?.[key] || 0, 1)} aria-label={`${label} de ${agent.name}`} /></div>)}</div> })}{!rows.length && <Empty title="Sin agentes para mostrar">Cambia los filtros o crea tu primer agente.</Empty>}</div>}
    </section>
    <div className="team-bottom"><section className="team-panel"><header className="team-panel-heading"><h2>Actividad reciente</h2><button onClick={() => navigate('/llamadas')}>Ver toda la actividad <RiArrowRightLine /></button></header>{overview?.recent.length ? <ul className="team-activity-list">{overview.recent.map(call => <li key={call.id}><time>{new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(call.createdAt))}</time><span className="team-event-icon"><RiPhoneLine /></span><div><strong>{byId[call.agentId]?.name || 'Agente'}</strong> · {call.isTest ? 'Prueba de voz' : CALL_LABELS[call.status] || 'Llamada'}<small>{call.lead?.company || call.lead?.name}</small></div><button onClick={() => openCall(call)}>{call.recordingUrl ? 'Ver grabación' : 'Ver llamada'}<RiArrowRightLine /></button></li>)}</ul> : <Empty icon={RiPhoneLine} title={errors.overview ? 'Actividad no disponible' : overview ? 'Todo listo para la próxima conversación' : 'Cargando actividad…'}>{errors.overview || 'Las llamadas de hoy y sus grabaciones aparecerán aquí.'}</Empty>}</section>
      <section className="team-panel"><header className="team-panel-heading"><h2>Aprobaciones pendientes</h2>{!errors.approvals && <button onClick={() => navigate(jobsUrl)}>Ver todas <RiArrowRightLine /></button>}</header>{approvals?.jobs?.length ? <div className="team-approvals-scroll"><table className="team-approvals"><thead><tr><th>Fecha</th><th>Solicitud</th><th>Estado</th><th /></tr></thead><tbody>{approvals.jobs.map(job => <tr key={job.id}><td>{dateLabel(job.createdAt)}</td><td>Acción pendiente de revisión</td><td><span className="team-status paused">Pendiente</span></td><td><button className="team-button compact" onClick={() => navigate(`${jobsUrl}&job=${job.id}`)}>Revisar</button></td></tr>)}</tbody></table></div> : <Empty icon={RiShieldCheckLine} title={errors.approvals ? 'Aprobaciones no disponibles' : approvals ? 'Todo al día' : 'Cargando aprobaciones…'}>{errors.approvals || 'Cuando una acción necesite tu visto bueno, la encontrarás aquí.'}</Empty>}</section>
    </div>
    {creating && <NewAgenteModal onClose={() => setCreating(false)} onSuccess={agent => { setAgents(current => [agent, ...(current || [])]); setCreating(false); setReload(value => value + 1) }} />}
    {scheduleAgent && <ScheduleAgentCallModal agent={scheduleAgent} onClose={() => setScheduleAgent(null)} onSuccess={() => setReload(value => value + 1)} />}
  </section>
}


