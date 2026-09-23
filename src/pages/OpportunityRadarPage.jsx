import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiArrowRightLine, RiDownloadLine, RiEditLine, RiExternalLinkLine, RiRadarLine, RiRefreshLine, RiSearchLine } from 'react-icons/ri'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../lib/api'
import { radarCsv, radarRows, radarType, radarObjectives, radarSummary, radarHasBusinessInfo } from '../lib/opportunityRadar'
import RadarSetupFlow from '../components/RadarSetupFlow'
import HomeLoadingState, { HomeLoadingIndicator } from '../components/ui/HomeLoadingState'
import './opportunity-radar.css'

const TERMINAL = ['succeeded', 'failed', 'canceled']
const EMPTY_DRAFT = { kind: 'clients', target: '', location: '', criteria: '' }
function defaultStart() { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(9, 0, 0, 0); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const dateLabel = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Sin fecha'
async function request(path, options = {}) {
  const response = await apiFetch(path, options)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : body?.error?.message || 'No se pudo completar la consulta. Vuelve a intentarlo.')
  return body
}

function CompanyTable({ context }) {
  const rows = [
    ['Empresa', context.company?.name], ['Sector', context.company?.industry],
    ['Cliente ideal', context.profile?.idealCustomer], ['Qué ofrecemos', context.profile?.valueProposition], ['Mercado', context.company?.address],
  ]
  return <section className="radar-company" aria-label="Información de tu empresa">
    <div className="radar-company-actions"><Link to="/configuracion/empresa"><RiEditLine aria-hidden="true" />Editar empresa</Link></div>
    <div className="radar-company-scroll" tabIndex={0} role="region" aria-label="Perfil utilizado por el radar"><table><thead><tr>{rows.map(([label]) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody><tr>{rows.map(([label, value]) => <td key={label}>{value || <span className="radar-muted">Por completar</span>}</td>)}</tr></tbody></table></div>
  </section>
}

function RadarWorkspace() {
  const [context, setContext] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeJob, setActiveJob] = useState(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [pollError, setPollError] = useState('')
  const [pollVersion, setPollVersion] = useState(0)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [selectedRun, setSelectedRun] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [scheduleError, setScheduleError] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [intervalHours, setIntervalHours] = useState(24)
  const [startsAt, setStartsAt] = useState(defaultStart)
  const [toggling, setToggling] = useState(null)
  const scheduleRequestId = useRef(null)
  const initialDraft = useRef(false)
  const mounted = useRef(false)
  const startingRef = useRef(false)
  const loadController = useRef(null)

  useEffect(() => { scheduleRequestId.current = null }, [draft, intervalHours, startsAt])

  const load = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setError(''); setHistoryError(''); setScheduleError('')
    const [companyResult, historyResult, schedulesResult] = await Promise.allSettled([
      request('/api/revenue-intelligence/business-context', { signal: controller.signal }),
      request('/api/revenue-intelligence/investigations?limit=20', { signal: controller.signal }),
      request('/api/revenue-intelligence/radar-schedules', { signal: controller.signal }),
    ])
    if (controller.signal.aborted || !mounted.current) return
    if (companyResult.status === 'fulfilled' && companyResult.value?.company && companyResult.value?.profile) {
      setContext(companyResult.value)
      if (!initialDraft.current) {
        const setup = companyResult.value.radarSetup
        const goal = setup?.businesses?.find(item => item.id === setup.suggestedType)?.goals[0]
        setDraft({ ...EMPTY_DRAFT, ...companyResult.value.radarDefaults, offering: companyResult.value.profile.valueProposition?.slice(0, 500) || '', audience: companyResult.value.profile.idealCustomer?.slice(0, 500) || '', ...(goal ? { businessType: setup.suggestedType, kind: goal.kind, target: goal.target } : {}) })
        initialDraft.current = true
      }
    } else setError(companyResult.reason?.message || 'No se pudo leer el perfil de empresa.')
    if (historyResult.status === 'fulfilled' && Array.isArray(historyResult.value?.investigations)) {
      setRuns(historyResult.value.investigations)
      setActiveJob(historyResult.value.activeJobs?.[0] || null)
    } else setHistoryError(historyResult.reason?.message || 'No se pudieron leer las búsquedas guardadas.')
    if (schedulesResult.status === 'fulfilled' && Array.isArray(schedulesResult.value?.schedules)) setSchedules(schedulesResult.value.schedules)
    else setScheduleError(schedulesResult.reason?.message || 'No se pudieron leer las programaciones.')
    setLoading(false)
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    return () => { mounted.current = false; loadController.current?.abort() }
  }, [load])

  useEffect(() => {
    if (!activeJob?.id || TERMINAL.includes(activeJob.status)) return
    let canceled = false
    let timer
    const controller = new AbortController()
    async function poll() {
      try {
        const job = await request(`/api/jobs/${encodeURIComponent(activeJob.id)}`, { signal: controller.signal })
        if (canceled) return
        if (!job?.id || !job.status) throw new Error('No se pudo leer el estado de la búsqueda.')
        setActiveJob(job); setPollError('')
        if (TERMINAL.includes(job.status)) {
          setActiveJob(null)
          if (job.status === 'succeeded') { setMessage('Búsqueda terminada. Revisa las oportunidades y sus fuentes.'); await load() }
          else setError(job.error?.message || (job.status === 'canceled' ? 'La búsqueda se ha cancelado.' : 'La búsqueda no pudo completarse. Revisa el trabajo antes de volver a intentarlo.'))
        } else if (job.status !== 'awaiting_approval') timer = window.setTimeout(poll, 2500)
      } catch (failure) {
        if (!canceled) setPollError(failure.message || 'Se perdió el seguimiento. La búsqueda puede seguir en curso.')
      }
    }
    timer = window.setTimeout(poll, 800)
    return () => { canceled = true; controller.abort(); window.clearTimeout(timer) }
  }, [activeJob?.id, pollVersion, load])

  const history = useMemo(() => runs.filter(run => run.input?.radar), [runs])
  const rows = useMemo(() => radarRows(selectedRun === 'all' ? history : history.filter(run => run.id === selectedRun)), [history, selectedRun])
  const visibleRows = useMemo(() => {
    const query = filter.toLocaleLowerCase().trim()
    return rows.filter(row => (kindFilter === 'all' || row.kind === kindFilter) && (!query || [row.name, row.location, row.rationale, radarType(row.kind)?.label].some(value => value?.toLocaleLowerCase().includes(query))))
  }, [rows, filter, kindFilter])
  const selected = selectedRun === 'all' ? history[0] : history.find(run => run.id === selectedRun)
  const gaps = selected?.result?.data?.gaps || []
  const busy = starting || !!activeJob
  const available = context?.radarSearchAvailable !== false

  async function start(event) {
    event.preventDefault()
    if (startingRef.current || busy || !consent || !available || !radarHasBusinessInfo(context, draft)) return
    const business = context.radarSetup?.businesses.find(item => item.id === draft.businessType)
    const objectives = radarObjectives(draft)
    if (!objectives.length || objectives.some(objective => !business?.goals.some(item => item.kind === objective.kind) || objective.target.trim().length < 3) || draft.location.trim().length < 2) { setError('Revisa la actividad, los objetivos y los criterios antes de activar el radar.'); return }
    startingRef.current = true; setStarting(true); setError(''); setMessage('')
    try {
      if (event.nativeEvent.submitter?.value === 'schedule') {
        const date = new Date(startsAt)
        if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error('Elige una fecha futura para la primera búsqueda.')
        scheduleRequestId.current ||= crypto.randomUUID()
        const schedule = await request('/api/revenue-intelligence/radar-schedules', { method: 'POST', body: JSON.stringify({ radar: draft, intervalHours, startsAt: date.toISOString(), requestId: scheduleRequestId.current, allowExternalReview: true }) })
        if (!mounted.current) return
        if (!schedule?.id) throw new Error('No se pudo confirmar la programación. Actualiza la información antes de repetirla.')
        setSchedules(current => [schedule, ...current.filter(item => item.id !== schedule.id)])
        scheduleRequestId.current = null; setShowSchedule(false); setMessage('Radar programado. Puedes lanzar otra búsqueda manual cuando lo necesites.')
        return true
      }
      const type = radarType(draft.kind)
      const result = await request('/api/revenue-intelligence/investigations', {
        method: 'POST', body: JSON.stringify({ lens: type.lens, focus: `${radarSummary(draft)} · ${draft.location}`, allowExternalReview: true, radar: draft }),
      })
      if (!mounted.current) return
      if (!result?.jobId) throw new Error('El servidor no confirmó la búsqueda. Revisa los trabajos antes de repetirla.')
      setActiveJob({ id: result.jobId, status: 'pending' }); setSelectedRun('all'); setPollError('')
      return true
    } catch (failure) { if (mounted.current) setError(failure.message) }
    finally { startingRef.current = false; if (mounted.current) setStarting(false) }
  }

  async function toggleSchedule(schedule) {
    if (toggling) return
    setToggling(schedule.id); setScheduleError('')
    try {
      const update = await request(`/api/revenue-intelligence/radar-schedules/${encodeURIComponent(schedule.id)}`, { method: 'PATCH', body: JSON.stringify({ active: !['pending', 'running'].includes(schedule.status) }) })
      if (mounted.current) setSchedules(current => current.map(item => item.id === schedule.id ? { ...item, ...update, lastError: '' } : item))
    } catch (failure) { if (mounted.current) setScheduleError(failure.message) }
    finally { if (mounted.current) setToggling(null) }
  }

  function exportRows() {
    const url = URL.createObjectURL(new Blob([radarCsv(visibleRows)], { type: 'text/csv;charset=utf-8;' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'radar-oportunidades.csv'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <main className="opportunity-radar dark-scroll"><div className="radar-content">
    <header className="radar-header"><div><h1>Inteligencia</h1><p>Un radar de oportunidades para tu negocio.</p></div><Link to="/inteligencia/prioridades">Ver prioridades de ventas<RiArrowRightLine aria-hidden="true" /></Link></header>
    {error ? <div className="radar-notice is-error" role="alert"><span>{error}</span><button onClick={load} type="button"><RiRefreshLine aria-hidden="true" />Actualizar información</button></div> : null}
    {loading ? <HomeLoadingState variant="metrics" label="Leyendo el perfil y las búsquedas de tu empresa…" /> : context ? <>
      <CompanyTable context={context} />
      <section className="radar-config" aria-label="Configura tu radar">
        {!radarHasBusinessInfo(context, draft) ? <p className="radar-notice">Añade servicios, documentos o una descripción en la configuración del radar para preparar una búsqueda. <Link to="/configuracion/empresa">Completar empresa</Link></p> : null}
        <RadarSetupFlow error={error} context={context} draft={draft} setDraft={setDraft} busy={busy} starting={starting} activeJob={activeJob} consent={consent} setConsent={setConsent} available={available} onSubmit={start} showSchedule={showSchedule} setShowSchedule={setShowSchedule} intervalHours={intervalHours} setIntervalHours={setIntervalHours} startsAt={startsAt} setStartsAt={setStartsAt} />
        {!available ? <p className="radar-notice" role="status">La búsqueda web todavía no está conectada. El radar necesita un proveedor de búsqueda configurado para encontrar oportunidades reales.</p> : null}
      </section>
    </> : null}
    {activeJob ? <div className="radar-notice radar-job" role="status">
      <HomeLoadingIndicator label={activeJob.status === 'awaiting_approval' ? 'La búsqueda necesita tu revisión.' : 'Buscando oportunidades y contrastando fuentes…'} />
      <Link to={`/trabajos?jobId=${encodeURIComponent(activeJob.id)}`}>Ver trabajo<RiArrowRightLine aria-hidden="true" /></Link>
      {pollError ? <><span>{pollError}</span><button type="button" onClick={() => { setPollError(''); setPollVersion(value => value + 1) }}>Reanudar seguimiento</button></> : null}
    </div> : null}
    {message ? <p className="radar-notice" role="status">{message}</p> : null}
    {schedules.length || scheduleError ? <section className="radar-schedules" aria-labelledby="radar-schedules-title"><h2 id="radar-schedules-title">Búsquedas programadas</h2>
      {scheduleError ? <div className="radar-notice is-error" role="alert">{scheduleError}<button onClick={load} type="button">Reintentar</button></div> : null}
      {schedules.map(schedule => <div className="radar-schedule-item" key={schedule.id}><div><strong>{schedule.radar.name || radarSummary(schedule.radar)}</strong><p>{schedule.radar.location} · {schedule.intervalHours === 24 ? 'Cada 24 horas' : 'Cada 7 días'} · {schedule.status === 'pending' ? `Próxima: ${dateLabel(schedule.nextRunAt)}` : schedule.status === 'running' ? 'Preparando búsqueda' : schedule.status === 'error' ? 'Detenida: requiere revisión' : 'En pausa'}</p>{schedule.lastError ? <p>{schedule.lastError}</p> : null}</div>{schedule.lastJobId ? <Link to={`/trabajos?jobId=${encodeURIComponent(schedule.lastJobId)}`}>Último trabajo</Link> : null}<button type="button" disabled={!!toggling} onClick={() => toggleSchedule(schedule)}>{['pending', 'running'].includes(schedule.status) ? 'Pausar próximas búsquedas' : 'Reanudar'}</button></div>)}
    </section> : null}
    <section className="radar-results" aria-labelledby="radar-results-title">
      <div className="radar-results-head"><h2 id="radar-results-title">Oportunidades encontradas</h2><div className="radar-result-types" role="group" aria-label="Filtrar por objetivo">{['all', ...new Set(rows.map(row => row.kind))].map(kind => <button type="button" key={kind} aria-pressed={kindFilter === kind} onClick={() => setKindFilter(kind)}>{kind === 'all' ? 'Todas' : radarType(kind)?.label}<span>{kind === 'all' ? rows.length : rows.filter(row => row.kind === kind).length}</span></button>)}</div><div className="radar-toolbar">
        <label className="radar-filter"><RiSearchLine aria-hidden="true" /><input aria-label="Filtrar resultados" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar resultados" /></label>
        <select aria-label="Búsqueda" value={selectedRun} onChange={event => { setSelectedRun(event.target.value); setExpanded(null) }}><option value="all">Todas las búsquedas</option>{history.map(run => <option key={run.id} value={run.id}>{run.input.radar.name || radarSummary(run.input.radar)} · {dateLabel(run.createdAt)}</option>)}</select>
        <button type="button" className="radar-export" disabled={!visibleRows.length} onClick={exportRows}><RiDownloadLine aria-hidden="true" />Exportar CSV</button>
      </div></div>
      {historyError ? <div className="radar-notice is-error" role="alert">{historyError} <button onClick={load} type="button">Reintentar</button></div> : null}
      <div className="radar-table-scroll" role="region" aria-label="Tabla de oportunidades" tabIndex={0}><table className="radar-table">
        <thead><tr>{['Oportunidad', 'Tipo', 'Ubicación', 'Por qué encaja', 'Fuente', 'Detectada'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{visibleRows.map(row => <Fragment key={row.key}><tr>
          <td><button className="radar-row-name" type="button" aria-expanded={expanded === row.key} onClick={() => setExpanded(value => value === row.key ? null : row.key)}>{row.name}</button><span className="radar-row-status">{row.stale ? 'Revisar vigencia' : 'Por validar'}</span></td>
          <td>{radarType(row.kind)?.label}</td><td>{row.location || 'Sin confirmar'}</td><td><p>{row.rationale}</p></td>
          <td><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Ver fuente<RiExternalLinkLine aria-hidden="true" /></a></td><td><time dateTime={row.detectedAt}>{dateLabel(row.detectedAt)}</time></td>
        </tr>{expanded === row.key ? <tr className="radar-detail"><td colSpan={6}><strong>{row.sourceTitle}</strong><p>{row.sourceSnippet || 'La fuente no incluye un extracto.'}</p>{row.detail ? <p><b>Dato publicado: </b>{row.detail}</p> : null}<small>El encaje es una hipótesis. Comprueba la disponibilidad y las condiciones en la fuente.</small></td></tr> : null}</Fragment>)}</tbody>
      </table></div>
      {!visibleRows.length ? loading || activeJob ? <HomeLoadingState label={loading ? 'Cargando búsquedas guardadas…' : 'Los nuevos resultados aparecerán al terminar la búsqueda.'} /> : !historyError ? <div className="radar-empty"><RiRadarLine aria-hidden="true" /><strong>{filter ? 'No hay coincidencias con ese filtro.' : history.length ? 'Sin candidatos identificables en las fuentes consultadas.' : 'Tu próxima oportunidad empieza con una búsqueda.'}</strong><p>{filter ? 'Prueba otro nombre, ubicación o tipo de oportunidad.' : 'Define qué necesitas y dónde. Cada resultado tendrá su fuente para que puedas revisarlo.'}</p></div> : null : null}
      {gaps.length ? <details className="radar-gaps"><summary>Limitaciones de la última búsqueda seleccionada</summary><ul>{gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></details> : null}
      <footer className="radar-results-footer">{visibleRows.length} oportunidades · {history.length} búsquedas guardadas (hasta 20 recientes). Los candidatos repetidos se agrupan.</footer>
    </section>
  </div></main>
}

export default function OpportunityRadarPage() {
  const { user } = useAuth()
  return <RadarWorkspace key={user?.orgId || user?.id || 'workspace'} />
}
