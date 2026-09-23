import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiArrowLeftSLine, RiArrowRightSLine, RiCalendarLine,
  RiCheckboxCircleLine, RiCloseLine, RiGroupLine, RiListCheck2,
  RiSearchLine, RiTimeLine, RiVideoLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import NewReunionModal from '../modals/NewReunionModal'
import PageLoadingState from '../components/ui/PageLoadingState'
import './sales-workspace.css'
import { readSalesCollection, calendarLanes } from '../lib/salesWorkspace'
import { useAuth } from '../contexts/AuthContext'
import SalesTaskModal from '../modals/SalesTaskModal'
import { useAssistantScreen } from '../lib/useAssistantScreen'

const START_HOUR = 8
const HOURS = Array.from({ length: 11 }, (_, index) => index + START_HOUR)
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
function sameDay(first, second) { return first.toDateString() === second.toDateString() }
function formatHours(minutes) { const hours = minutes / 60; return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1).replace('.', ',')} h` }

function CalendarEmpty({ filtered, onCreate, agenda = false }) {
  const emptyTitle = agenda ? 'No hay próximos eventos' : 'Tu semana está libre'
  const emptyCopy = agenda ? 'Las próximas reuniones y tareas aparecerán aquí en orden.' : 'Cuando programes reuniones o tareas con vencimiento aparecerán aquí.'
  return <div className="calendar-empty-overlay"><RiCalendarLine /><strong>{filtered ? 'No hay eventos para estos filtros' : emptyTitle}</strong><span>{filtered ? 'Prueba con otro tipo, estado o término de búsqueda.' : emptyCopy}</span>{!filtered ? <button type="button" onClick={onCreate}>Crear reunión</button> : null}</div>
}

export default function SalesCalendarPage() {
  const navigate = useNavigate()
  const { user } = useAuth() || {}
  const orgId = user?.orgId
  const requestRef = useRef(null)
  const calendarRef = useRef(null)
  const [revision, setRevision] = useState(0)
  const refresh = () => setRevision(value => value + 1)
  const [editingTask, setEditingTask] = useState(null)
  const [taskBusy, setTaskBusy] = useState(false)
  const [taskError, setTaskError] = useState('')
  async function completeTask(task) {
    if (taskBusy) return
    setTaskBusy(true); setTaskError('')
    try {
      const response = await apiFetch(`/api/tasks/${task.id}/complete`, { method: 'POST' })
      if (!response.ok) throw new Error('No se pudo completar la tarea. Revisa tus permisos y vuelve a intentarlo.')
      refresh()
    } catch (err) { setTaskError(err.message) } finally { setTaskBusy(false) }
  }
  const [weekOffset, setWeekOffset] = useState(0)
  const [mode, setMode] = useState('week')
  const [sources, setSources] = useState({ meetings: [], tasks: [], meetingsUnavailable: false, tasksUnavailable: false })
  const [state, setState] = useState('loading')
  const [showNewMeeting, setShowNewMeeting] = useState(false)
  const [selectedKey, setSelectedKey] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [dayFilter, setDayFilter] = useState('all')
  const weekStart = useMemo(() => addDays(mondayOf(new Date()), weekOffset * 7), [weekOffset])
  const days = useMemo(() => DAY_NAMES.map((name, index) => ({ name, date: addDays(weekStart, index) })), [weekStart])

  const load = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController(); requestRef.current = controller
    setState('loading'); setSources({ meetings: [], tasks: [], meetingsUnavailable: false, tasksUnavailable: false })
    const from = encodeURIComponent(weekStart.toISOString())
    const to = encodeURIComponent(new Date(addDays(weekStart, 7).getTime() - 1).toISOString())
    const [meetingsResult, tasksResult] = await Promise.allSettled([
      readSalesCollection(apiFetch, `/api/meetings?dateFrom=${from}&dateTo=${to}`, { signal: controller.signal }),
      readSalesCollection(apiFetch, `/api/tasks?dueAfter=${from}&dueBefore=${to}`, { signal: controller.signal }),
    ])
    if (controller.signal.aborted) return
    if (meetingsResult.status === 'rejected' && tasksResult.status === 'rejected') { setSources({ meetings: [], tasks: [], meetingsUnavailable: true, tasksUnavailable: true }); setState('error'); return }
    setSources({ meetings: meetingsResult.status === 'fulfilled' ? meetingsResult.value : [], tasks: tasksResult.status === 'fulfilled' ? tasksResult.value : [], meetingsUnavailable: meetingsResult.status === 'rejected', tasksUnavailable: tasksResult.status === 'rejected' })
    setState('ready')
  }, [weekStart, orgId, revision])

  useEffect(() => { setSelectedKey(null); setEditingTask(null); setTaskError(''); load(); return () => requestRef.current?.abort() }, [load])

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
  const visibleWeekEvents = useMemo(() => weekEvents.filter(event => event.start.getHours() >= START_HOUR && event.start.getHours() <= START_HOUR + HOURS.length - 1), [weekEvents])
  const lanes = useMemo(() => calendarLanes(weekEvents), [weekEvents])
  useEffect(() => { if (state === 'ready' && mode === 'week' && calendarRef.current) calendarRef.current.scrollTop = 0 }, [state, mode, weekStart])
  const selected = weekEvents.find(event => eventKey(event) === selectedKey) || weekEvents[0] || null
  const today = useMemo(() => new Date(), [])
  const tomorrow = useMemo(() => addDays(today, 1), [today])
  const weekMeetings = weekEvents.filter(event => event.kind === 'meeting')
  const openTasks = weekEvents.filter(event => event.kind === 'task' && statusGroup(event.status) === 'pending')
  const plannedMinutes = weekEvents.filter(event => statusGroup(event.status) !== 'cancelled').reduce((sum, event) => sum + event.duration, 0)
  const eventsToday = weekEvents.filter(event => sameDay(event.start, today))
  const meetingsToday = eventsToday.filter(event => event.kind === 'meeting')
  const tasksToday = eventsToday.filter(event => event.kind === 'task')
  const planEventsFor = date => weekEvents.filter(event => sameDay(event.start, date) && (dayFilter === 'all' || event.kind === dayFilter))
  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || query.trim().length > 0
  const clearFilters = () => { setTypeFilter('all'); setStatusFilter('all'); setQuery('') }
  useAssistantScreen('calendar', { form: showNewMeeting || editingTask ? 'editing' : null, ready: state === 'ready', selected: selected?.kind === 'task' ? { type: 'task', id: selected.id, label: eventLabel(selected) } : undefined, filters: { search: query, type: typeFilter, status: statusFilter, mode } }, async command => {
    if (command.name === 'refresh') { refresh(); return }
    if (showNewMeeting || editingTask) throw new Error('Hay un formulario abierto. Guarda o cierra sus cambios antes de cambiar el calendario.')
    if (command.name !== 'show_calendar') throw new Error('Esta operación no está conectada al calendario.')
    const search = command.args.search || '', type = command.args.type || 'all', status = command.args.status || 'all'
    setQuery(search); setTypeFilter(type); setStatusFilter(status); setMode('agenda'); setSelectedKey(null)
    return { message: 'Calendario abierto en agenda con los filtros solicitados para la semana visible.', verify: context => context.ready && context.filters.search === search && context.filters.type === type && context.filters.status === status && context.filters.mode === 'agenda' }
  })
  const place = event => {
    const day = (event.start.getDay() + 6) % 7
    const row = Math.max(1, Math.min(HOURS.length * 4, Math.floor((event.start.getHours() + event.start.getMinutes() / 60 - START_HOUR) * 4) + 1))
    const span = Math.max(1, Math.min(HOURS.length * 4 - row + 1, Math.ceil(event.duration / 15)))
    const { lane, count } = lanes.get(eventKey(event)) || { lane: 0, count: 1 }
    return { gridColumn: day + 1, gridRow: `${row} / span ${span}`, width: `calc(${100 / count}% - 4px)`, marginLeft: `calc(${lane * 100 / count}% + 2px)` }
  }
  const renderAgendaEvent = (event, compact = false) => <button type="button" className={selected && eventKey(selected) === eventKey(event) ? 'selected' : ''} key={`${compact ? 'compact-' : ''}${eventKey(event)}`} onClick={() => setSelectedKey(eventKey(event))}><time>{event.start.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}<strong>{event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong></time><span><small className={`calendar-kind ${event.kind}`}>{eventTypeLabel(event)}</small><strong>{eventLabel(event)}</strong><small>{event.lead?.name || (event.kind === 'task' ? 'Sin contacto vinculado' : 'Sin contacto')} · {event.duration} min</small></span><em className={eventTone(event)}>{eventStatusLabel(event)}</em>{!compact ? <RiArrowRightSLine /> : null}</button>
  const renderPlanEvent = event => {
    const active = selected && eventKey(selected) === eventKey(event)
    return <article className={`calendar-plan-item ${active ? 'selected' : ''}`} key={`plan-${eventKey(event)}`}>
      <button type="button" className="calendar-plan-select" onClick={() => setSelectedKey(eventKey(event))}>
        <span className={`calendar-plan-icon ${eventTone(event)}`}>{event.kind === 'task' ? <RiCheckboxCircleLine /> : <RiVideoLine />}</span>
        <span className="calendar-plan-copy"><small>{event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} – {new Date(event.start.getTime() + event.duration * 60000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small><strong>{eventLabel(event)}</strong><span>{event.lead?.company || event.lead?.name || (event.kind === 'task' ? 'Tarea del equipo' : 'Sala virtual')}</span></span>
        <em>{eventTypeLabel(event)}</em>
      </button>
      {active ? <div className="calendar-plan-actions">{event.kind === 'meeting' ? <button type="button" onClick={() => navigate(`/reuniones/${event.id}`)}>Ver reunión</button> : <><button type="button" disabled={taskBusy} onClick={() => setEditingTask(event)}>Editar</button>{!['completed', 'cancelled'].includes(event.status) && <button type="button" disabled={taskBusy} onClick={() => completeTask(event)}>{taskBusy ? 'Guardando…' : 'Completar'}</button>}</>}{event.lead?.id ? <button type="button" onClick={() => navigate(`/ventas/lead/${event.lead.id}`)}>Contacto</button> : null}</div> : null}
    </article>
  }

  if (state === 'loading' && !events.length) return <PageLoadingState label="Cargando calendario" />

  return <main className="sales-workspace calendar-workspace calendar-v2 dark-scroll">
    <header className="calendar-page-heading">
      <div><h1>Calendario</h1><p>Reuniones y tareas del equipo, reunidas en una misma agenda.</p></div>
      <button type="button" className="sales-create calendar-create" onClick={() => setShowNewMeeting(true)}><RiAddLine /> Nueva reunión</button>
    </header>

    <section className="calendar-summary-grid" aria-label="Resumen del calendario">
      <article><span className="calendar-summary-icon violet"><RiCalendarLine /></span><div><small>Reuniones esta semana</small><strong>{weekMeetings.length}</strong><p>{weekMeetings.filter(event => statusGroup(event.status) === 'pending').length} programadas</p></div><i style={{ '--progress': `${Math.min(100, weekMeetings.length * 10)}%` }} /></article>
      <article><span className="calendar-summary-icon green"><RiListCheck2 /></span><div><small>Tareas abiertas</small><strong>{openTasks.length}</strong><p>{tasksToday.length} para hoy</p></div><i style={{ '--progress': `${Math.min(100, openTasks.length * 12)}%` }} /></article>
      <article><span className="calendar-summary-icon indigo"><RiTimeLine /></span><div><small>Tiempo planificado</small><strong>{formatHours(plannedMinutes)}</strong><p>En la semana visible</p></div><i style={{ '--progress': `${Math.min(100, plannedMinutes / 24)}%` }} /></article>
      <article><span className="calendar-summary-icon lavender"><RiGroupLine /></span><div><small>Carga de hoy</small><strong>{eventsToday.length}</strong><p>{meetingsToday.length} reuniones · {tasksToday.length} tareas</p></div><i style={{ '--progress': `${Math.min(100, eventsToday.length * 16)}%` }} /></article>
    </section>

    <section className={`calendar-commandbar ${mode === 'agenda' ? 'agenda-commandbar' : ''}`} aria-label="Navegación y filtros del calendario">
      <div className="calendar-mode"><button type="button" className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Semana</button><button type="button" className={mode === 'agenda' ? 'active' : ''} onClick={() => { setMode('agenda'); setWeekOffset(0) }}>Agenda</button></div>
      {mode === 'week' ? <><button type="button" className="calendar-today" onClick={() => setWeekOffset(0)}>Hoy</button><div className="calendar-range"><button type="button" onClick={() => setWeekOffset(value => value - 1)} aria-label="Semana anterior"><RiArrowLeftSLine /></button><strong>{formatRange(weekStart)}</strong><button type="button" onClick={() => setWeekOffset(value => value + 1)} aria-label="Semana siguiente"><RiArrowRightSLine /></button></div></> : <div className="calendar-agenda-types" aria-label="Tipo de evento">{TYPE_FILTERS.map(filter => <button key={`agenda-${filter.value}`} type="button" className={typeFilter === filter.value ? 'active' : ''} onClick={() => setTypeFilter(filter.value)}>{filter.label}</button>)}</div>}
      <select className="calendar-status-select" aria-label="Estado" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>{STATUS_FILTERS.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select>
      <label className="calendar-search"><RiSearchLine /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar en esta semana…" aria-label="Buscar evento o contacto" /></label>
      {hasActiveFilters ? <button type="button" className="calendar-clear-filters" onClick={clearFilters}><RiCloseLine /> Limpiar</button> : null}
    </section>

    {(sources.meetingsUnavailable || sources.tasksUnavailable) && state === 'ready' ? <p className="calendar-source-note">{sources.meetingsUnavailable ? 'No se pudieron cargar las reuniones.' : ''}{sources.meetingsUnavailable && sources.tasksUnavailable ? ' ' : ''}{sources.tasksUnavailable ? 'No se pudieron cargar las tareas.' : ''} Se muestran los eventos disponibles.</p> : null}

    <section className={`calendar-layout ${mode === 'agenda' ? 'agenda-mode' : ''}`}>
      <div className="calendar-main" ref={calendarRef}>
        {state === 'error' ? <div className="sales-state error"><strong>No se pudo cargar el calendario.</strong><button type="button" onClick={load}>Reintentar</button></div> : null}
        {state === 'ready' && mode === 'week' ? <>
          <div className="calendar-grid-shell calendar-week-desktop">
            <div className="calendar-week-head"><span>Hora</span>{days.map(day => <span key={day.name} className={sameDay(day.date, today) ? 'today' : ''}><b>{day.name}</b><small>{day.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</small></span>)}</div>
            <div className="calendar-week-body"><div className="calendar-hours">{HOURS.map(hour => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div><div className="calendar-events-grid">{HOURS.map((hour, row) => DAY_NAMES.map((day, column) => <i key={`${hour}-${day}`} style={{ gridColumn: column + 1, gridRow: `${row * 4 + 1} / span 4` }} />))}{visibleWeekEvents.map(event => <button type="button" key={eventKey(event)} className={`calendar-event ${eventTone(event)} ${selected && eventKey(selected) === eventKey(event) ? 'selected' : ''}`} style={place(event)} title={`${event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · ${eventLabel(event)}`} aria-label={`${eventTypeLabel(event)} · ${eventLabel(event)} · ${event.start.toLocaleString('es-ES')}`} onClick={() => setSelectedKey(eventKey(event))}><small>{event.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small><strong>{eventLabel(event)}</strong><span>{event.lead?.company || event.lead?.name || eventTypeLabel(event)}</span></button>)}</div></div>
            {!weekEvents.length ? <CalendarEmpty filtered={hasActiveFilters} onCreate={() => setShowNewMeeting(true)} /> : null}
          </div>
          <div className="calendar-mobile-week">{weekEvents.length ? weekEvents.map(event => renderAgendaEvent(event, true)) : <CalendarEmpty filtered={hasActiveFilters} onCreate={() => setShowNewMeeting(true)} />}</div>
        </> : null}
        {state === 'ready' && mode === 'agenda' ? <div className="calendar-agenda">{weekEvents.length ? weekEvents.map(event => renderAgendaEvent(event)) : <CalendarEmpty filtered={hasActiveFilters} onCreate={() => setShowNewMeeting(true)} agenda />}</div> : null}
      </div>

      {mode === 'week' ? <aside className="calendar-day-plan" aria-label="Plan del día">
        <header><div><h2>Plan del día</h2><strong>Hoy · {today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</strong><p>{meetingsToday.length} reuniones · {tasksToday.length} tareas</p></div></header>
        <nav aria-label="Filtrar plan del día">{TYPE_FILTERS.map(filter => <button key={`plan-${filter.value}`} type="button" className={dayFilter === filter.value ? 'active' : ''} onClick={() => setDayFilter(filter.value)}>{filter.label}</button>)}</nav>
        <section className="calendar-plan-group"><h3>Hoy <span>{planEventsFor(today).length}</span></h3>{planEventsFor(today).length ? planEventsFor(today).map(renderPlanEvent) : <p className="calendar-plan-empty">No tienes nada programado para hoy.</p>}</section>
        <section className="calendar-plan-group"><h3>Mañana · {tomorrow.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })} <span>{planEventsFor(tomorrow).length}</span></h3>{planEventsFor(tomorrow).length ? planEventsFor(tomorrow).map(renderPlanEvent) : <p className="calendar-plan-empty">Mañana está libre.</p>}</section>
        {taskError ? <p className="calendar-task-error" role="alert">{taskError}</p> : null}
      </aside> : null}
    </section>
    {editingTask && <SalesTaskModal task={editingTask} onClose={() => setEditingTask(null)} onSuccess={refresh} />}
    {showNewMeeting ? <NewReunionModal onClose={() => setShowNewMeeting(false)} onSuccess={() => { setShowNewMeeting(false); refresh() }} /> : null}
  </main>
}
