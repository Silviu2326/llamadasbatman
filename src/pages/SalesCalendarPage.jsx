import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiAddLine, RiArrowLeftSLine, RiArrowRightSLine, RiCalendarLine, RiCheckboxCircleLine, RiCloseLine, RiPhoneLine, RiRobot2Line, RiSearchLine } from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import NewReunionModal from '../modals/NewReunionModal'
import PageLoadingState from '../components/ui/PageLoadingState'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import './sales-workspace.css'

const START_HOUR = 7
const HOURS = Array.from({ length: 13 }, (_, index) => index + START_HOUR)
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const TYPE_FILTERS = [{ value: 'all', label: 'Todos' }, { value: 'meeting', label: 'Reuniones' }, { value: 'task', label: 'Tareas' }]
const STATUS_FILTERS = [{ value: 'all', label: 'Todos los estados' }, { value: 'pending', label: 'Pendientes' }, { value: 'completed', label: 'Completados' }, { value: 'cancelled', label: 'Cancelados / no asistió' }]

function mondayOf(date) { const result = new Date(date); result.setHours(0, 0, 0, 0); result.setDate(result.getDate() - ((result.getDay() + 6) % 7)); return result }
function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result }
function formatRange(start) { const end = addDays(start, 6); return `${start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}` }
function statusGroup(status) { if (status === 'completed') return 'completed'; if (status === 'cancelled' || status === 'no_show') return 'cancelled'; return 'pending' }
function eventTone(event) { const group = statusGroup(event.status); return group === 'completed' ? 'done' : group === 'cancelled' ? 'cancelled' : event.kind }
function eventLabel(event) { return event.title || (event.kind === 'task' ? 'Tarea sin título' : `Reunión · ${event.lead?.name || 'Sin contacto'}`) }
function eventTypeLabel(event) { return event.kind === 'task' ? 'Tarea' : 'Reunión' }
function eventKey(event) { return `${event.kind}:${event.id}` }
function eventStatusLabel(event) { if (event.status === 'completed') return 'Completada'; if (event.status === 'cancelled') return 'Cancelada'; if (event.status === 'no_show') return 'No asistió'; if (event.status === 'in_progress') return 'En curso'; return event.kind === 'task' ? 'Pendiente' : 'Programada' }
function readCollection(response) { if (!response.ok) throw new Error(`request_${response.status}`); return response.json().then(body => Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []) }

function CalendarEmpty({ filtered, onCreate }) {
  return <div className="calendar-empty-overlay"><RiCalendarLine /><strong>{filtered ? 'No hay eventos para estos filtros' : 'Tu semana está libre'}</strong><span>{filtered ? 'Prueba con otro tipo, estado o término de búsqueda.' : 'Cuando programes reuniones o tareas con vencimiento aparecerán aquí.'}</span>{!filtered ? <button type="button" onClick={onCreate}>Crear reunión</button> : null}</div>
}

export default function SalesCalendarPage() {
  const navigate = useNavigate()
  const [weekOffset, setWeekOffset] = useState(0)
  const [mode, setMode] = useState('week')
  const [sources, setSources] = useState({ meetings: [], tasks: [], meetingsUnavailable: false, tasksUnavailable: false })
  const [state, setState] = useState('loading')
  const [showNewMeeting, setShowNewMeeting] = useState(false)
  const [selectedKey, setSelectedKey] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const weekStart = useMemo(() => addDays(mondayOf(new Date()), weekOffset * 7), [weekOffset])
  const days = useMemo(() => DAY_NAMES.map((name, index) => ({ name, date: addDays(weekStart, index) })), [weekStart])

  const load = useCallback(async () => {
    setState('loading')
    const [meetingsResult, tasksResult] = await Promise.allSettled([apiFetch('/api/meetings?limit=100').then(readCollection), apiFetch('/api/tasks?limit=100').then(readCollection)])
    if (meetingsResult.status === 'rejected' && tasksResult.status === 'rejected') { setSources({ meetings: [], tasks: [], meetingsUnavailable: true, tasksUnavailable: true }); setState('error'); return }
    setSources({ meetings: meetingsResult.status === 'fulfilled' ? meetingsResult.value : [], tasks: tasksResult.status === 'fulfilled' ? tasksResult.value : [], meetingsUnavailable: meetingsResult.status === 'rejected', tasksUnavailable: tasksResult.status === 'rejected' })
    setState('ready')
  }, [])

  useEffect(() => { load() }, [load])

  const events = useMemo(() => {
    const meetings = sources.meetings.map(item => ({ ...item, kind: 'meeting', start: new Date(item.scheduledAt), duration: item.durationMinutes ?? 30 }))
    const tasks = sources.tasks.filter(item => item.dueAt).map(item => ({ ...item, kind: 'task', start: new Date(item.dueAt), duration: 30 }))
    return meetings.concat(tasks).filter(item => !Number.isNaN(item.start.getTime()))
  }, [sources])
  const filteredEvents = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es-ES')
    return events.filter(event => {
      if (typeFilter !== 'all' && event.kind !== typeFilter) return false
      if (statusFilter !== 'all' && statusGroup(event.status) !== statusFilter) return false
      return !term || [eventLabel(event), event.lead?.name, event.lead?.company].filter(Boolean).join(' ').toLocaleLowerCase('es-ES').includes(term)
    })
  }, [events, query, statusFilter, typeFilter])
  const weekEvents = useMemo(() => {
    const end = addDays(weekStart, 7).getTime()
    return filteredEvents.filter(event => event.start.getTime() >= weekStart.getTime() && event.start.getTime() < end).sort((a, b) => a.start - b.start)
  }, [filteredEvents, weekStart])
  const selected = weekEvents.find(event => eventKey(event) === selectedKey) || weekEvents[0] || null
  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || query.trim().length > 0
  const clearFilters = () => { setTypeFilter('all'); setStatusFilter('all'); setQuery('') }
  const place = event => {
    const eventDay = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate()).getTime()
    const day = Math.floor((eventDay - weekStart.getTime()) / 86400000)
    const row = Math.max(1, Math.min(HOURS.length, Math.floor(event.start.getHours() + event.start.getMinutes() / 60 - START_HOUR) + 1))
    const span = Math.max(1, Math.min(HOURS.length - row + 1, Math.ceil(event.duration / 60)))
    return { gridColumn: day + 1, gridRow: `${row} / span ${span}` }
  }
  const renderAgendaEvent = (event, compact = false) => <button type="button" className={selected && eventKey(selected) === eventKey(event) ? 'selected' : ''} key={`${compact ? 'compact-' : ''}${eventKey(event)}`} onClick={() => setSelectedKey(eventKey(event))}><time>{event.start.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}<strong>{event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong></time><span><small className={`calendar-kind ${event.kind}`}>{eventTypeLabel(event)}</small><strong>{eventLabel(event)}</strong><small>{event.lead?.name || (event.kind === 'task' ? 'Sin contacto vinculado' : 'Sin contacto')} · {event.duration} min</small></span><em className={eventTone(event)}>{eventStatusLabel(event)}</em>{!compact ? <RiArrowRightSLine /> : null}</button>

  if (state === 'loading' && !events.length) return <PageLoadingState label="Cargando calendario" />

  return <main className="sales-workspace calendar-workspace dark-scroll">
    <ProductPageHeader Icon={RiCalendarLine} title="Calendario" description="Reuniones y tareas del equipo, reunidas en una misma agenda." actions={<div className="sales-header-actions"><button type="button" className="sales-create" onClick={() => setShowNewMeeting(true)}><RiAddLine /> Nueva reunión</button></div>} />
    <section className="calendar-toolbar" aria-label="Navegación del calendario"><div className="calendar-mode"><button type="button" className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Semana</button><button type="button" className={mode === 'agenda' ? 'active' : ''} onClick={() => setMode('agenda')}>Agenda</button></div><div className="calendar-range"><button type="button" onClick={() => setWeekOffset(value => value - 1)} aria-label="Semana anterior"><RiArrowLeftSLine /></button><strong>{formatRange(weekStart)}</strong><button type="button" onClick={() => setWeekOffset(value => value + 1)} aria-label="Semana siguiente"><RiArrowRightSLine /></button></div><button type="button" className="calendar-today" onClick={() => setWeekOffset(0)}>Hoy</button></section>
    <section className="calendar-filters" aria-label="Filtros de eventos"><div className="calendar-filter-chips" aria-label="Tipo de evento">{TYPE_FILTERS.map(filter => <button key={filter.value} type="button" className={typeFilter === filter.value ? 'active' : ''} onClick={() => setTypeFilter(filter.value)}>{filter.label}</button>)}</div><label className="calendar-status-filter"><span>Estado</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>{STATUS_FILTERS.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label><label className="calendar-search"><RiSearchLine /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar evento o contacto" aria-label="Buscar evento o contacto" /></label>{hasActiveFilters ? <button type="button" className="calendar-clear-filters" onClick={clearFilters}><RiCloseLine /> Limpiar</button> : null}</section>
    {(sources.meetingsUnavailable || sources.tasksUnavailable) && state === 'ready' ? <p className="calendar-source-note">{sources.meetingsUnavailable ? 'No se pudieron cargar las reuniones.' : ''}{sources.meetingsUnavailable && sources.tasksUnavailable ? ' ' : ''}{sources.tasksUnavailable ? 'No se pudieron cargar las tareas.' : ''} Se muestran los eventos disponibles.</p> : null}
    <section className="calendar-layout"><div className="calendar-main">
      {state === 'error' ? <div className="sales-state error"><strong>No se pudo cargar el calendario.</strong><button type="button" onClick={load}>Reintentar</button></div> : null}
      {state === 'ready' && mode === 'week' ? <><div className="calendar-grid-shell calendar-week-desktop"><div className="calendar-week-head"><span>Hora</span>{days.map(day => <span key={day.name} className={day.date.toDateString() === new Date().toDateString() ? 'today' : ''}><b>{day.name}</b><small>{day.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</small></span>)}</div><div className="calendar-week-body"><div className="calendar-hours">{HOURS.map(hour => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div><div className="calendar-events-grid">{HOURS.map(hour => DAY_NAMES.map(day => <i key={`${hour}-${day}`} />))}{weekEvents.map(event => <button type="button" key={eventKey(event)} className={`calendar-event ${eventTone(event)} ${selected && eventKey(selected) === eventKey(event) ? 'selected' : ''}`} style={place(event)} onClick={() => setSelectedKey(eventKey(event))}><small>{eventTypeLabel(event)}</small><strong>{event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong><span>{eventLabel(event)}</span></button>)}</div></div>{!weekEvents.length ? <CalendarEmpty filtered={hasActiveFilters} onCreate={() => setShowNewMeeting(true)} /> : null}</div><div className="calendar-mobile-week">{weekEvents.length ? weekEvents.map(event => renderAgendaEvent(event, true)) : <CalendarEmpty filtered={hasActiveFilters} onCreate={() => setShowNewMeeting(true)} />}</div></> : null}
      {state === 'ready' && mode === 'agenda' ? <div className="calendar-agenda">{weekEvents.length ? weekEvents.map(event => renderAgendaEvent(event)) : <CalendarEmpty filtered={hasActiveFilters} onCreate={() => setShowNewMeeting(true)} />}</div> : null}
    </div><aside className="calendar-sidebar"><section><header><strong>Próximos eventos</strong><RiCalendarLine /></header>{weekEvents.slice(0, 5).map(event => <button type="button" key={eventKey(event)} onClick={() => setSelectedKey(eventKey(event))}><time>{event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</time><span><small className={`calendar-kind ${event.kind}`}>{eventTypeLabel(event)}</small><strong>{eventLabel(event)}</strong><small>{event.lead?.company || event.lead?.name || 'Sin contacto vinculado'}</small></span></button>)}{!weekEvents.length ? <p>{hasActiveFilters ? 'No hay eventos que coincidan con los filtros.' : 'No hay eventos programados en esta semana.'}</p> : null}</section><section className="calendar-context"><header><strong>Operación conectada</strong><RiRobot2Line /></header><p>Consulta las reuniones y las tareas con fecha de vencimiento en una sola vista.</p><ul><li><RiCalendarLine /> Reuniones</li><li><RiCheckboxCircleLine /> Tareas y seguimientos</li><li><RiPhoneLine /> Llamadas consultables desde cada contacto</li></ul></section>{selected ? <section className="calendar-selected"><span className={`calendar-dot ${eventTone(selected)}`} /><small className={`calendar-kind ${selected.kind}`}>{eventTypeLabel(selected)} · {eventStatusLabel(selected)}</small><strong>{eventLabel(selected)}</strong><p>{selected.start.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · {selected.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>{selected.kind === 'meeting' ? <button type="button" onClick={() => navigate(`/reuniones/${selected.id}`)}>Ver detalle <RiArrowRightSLine /></button> : null}</section> : null}</aside></section>
    {showNewMeeting ? <NewReunionModal onClose={() => setShowNewMeeting(false)} onSuccess={() => { setShowNewMeeting(false); load() }} /> : null}
  </main>
}
