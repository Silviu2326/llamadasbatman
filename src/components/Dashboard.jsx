import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiArrowRightSLine, RiFlashlightLine, RiChatSmile2Line, RiPhoneLine, RiCalendarCheckLine } from 'react-icons/ri'
import HomeAccentIcon from './ui/HomeAccentIcon'
import HomePageFrame from './ui/HomePageFrame'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { localeCode, useI18n } from '../i18n'
import { actionCopy, isNewWorkspace, pendingActions } from '../lib/homeOverview'
import { Notice, MonthlyGoals } from './MonthlyGoals'
export { MonthResults } from './MonthlyGoals'
import './home-command-center.css'

const initialResource = () => ({ data: null, loading: true, error: '' })
const priorities = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }

async function readJson(path, signal) {
  const response = await apiFetch(path, { signal })
  if (!response.ok) {
    throw new Error(response.status === 403 ? 'No tienes permiso para consultar estos datos.' : 'No se han podido cargar los datos. Inténtalo de nuevo.')
  }
  return response.json()
}

export function PendingList({ resource, retry, newWorkspace }) {
  const [expanded, setExpanded] = useState(false)
  const data = resource.data
  const items = data?.items || []
  const incomplete = data?.degraded || data?.warnings?.length > 0
  const truncated = data?.total > data?.received
  return <section className="home-section" aria-labelledby="home-pending-title" aria-busy={resource.loading}>
    <div className="home-section-title"><h2 id="home-pending-title"><HomeAccentIcon icon={RiFlashlightLine} tone="amber" />{newWorkspace ? 'Empieza por aquí' : 'Tu siguiente paso'}</h2></div>
    <p className="home-description">{newWorkspace ? 'Añade tus contactos y prepara la primera llamada.' : 'Tus pendientes, ordenados por prioridad.'}</p>
    <Notice resource={resource} retry={retry} />
    {incomplete ? <p className="home-message is-error" role="status">Faltan datos de algunas secciones. Esta lista puede estar incompleta.</p> : null}
    {items.length > 0 ? <>
      <div className="home-task-head" aria-hidden="true"><span>Prioridad</span><span>Qué puedes hacer</span><span>Por qué ahora</span><span>Siguiente paso</span></div>
      <ul className="home-task-list">{(expanded ? items : items.slice(0, 3)).map((item, index) => {
        const copy = actionCopy(item)
        return <li className="home-task" key={item.id || index}>
          <span className={`home-priority-label is-${item.priority}`}>{priorities[item.priority] || 'Media'}</span>
          <strong>{copy.title}</strong><p>{copy.detail}</p>
          {copy.path ? <Link className="home-button" to={copy.path}>{copy.label}<RiArrowRightSLine aria-hidden="true" /></Link> : <span className="home-description">Sin acceso directo</span>}
        </li>
      })}</ul>
      {items.length > 3 ? <button className="home-button home-show-all" type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
        {expanded ? 'Mostrar menos' : `Ver todos los pendientes (${items.length})`}
      </button> : null}
    </> : !resource.loading && !resource.error && !incomplete && !truncated && data ? newWorkspace ? <ol className="home-onboarding">
      <li><div><strong>Añade tus contactos</strong><p>Importa una lista o crea tu primer contacto.</p></div><Link className="home-button" to="/ventas?vista=leads">Añadir contactos<RiArrowRightSLine aria-hidden="true" /></Link></li>
      <li><div><strong>Prepara tu agente</strong><p>Elige su voz, configura qué debe decir y haz una llamada de prueba.</p></div><Link className="home-button" to="/agentes">Preparar agente<RiArrowRightSLine aria-hidden="true" /></Link></li>
    </ol> : <p className="home-message">No hay pendientes detectados en las secciones consultadas.</p> : null}
    {truncated ? <p className="home-description">Se han cargado los primeros {data.received} registros. Consulta el resto en sus secciones.</p> : null}
  </section>
}

export function RecentActivity({ resource, retry, locale }) {
  const items = resource.data || []
  return <section className="home-section home-recent" aria-labelledby="home-activity-title" aria-busy={resource.loading}>
    <h2 id="home-activity-title"><HomeAccentIcon icon={RiChatSmile2Line} tone="blue" />Tus últimas conversaciones</h2>
    <Notice resource={resource} retry={retry} variant="activity" label="Cargando tus últimas conversaciones…" />
    {items.length ? <ul className="home-activity-list">{items.map((item, index) => {
      const meeting = item.type === 'meeting'
      const date = new Date(item.createdAt)
      const time = Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat(localeCode(locale), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
      const label = `${meeting ? 'Reunión' : 'Llamada'} con ${item.data?.lead?.name || 'contacto sin nombre'}`
      const path = item.data?.id ? `/${meeting ? 'reuniones' : 'llamadas'}/${encodeURIComponent(item.data.id)}` : null
      return <li key={item.data?.id ? item.type + item.data.id : index}>
        <time dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>{time}</time>
        {path ? <Link to={path}><span className="home-activity-label"><HomeAccentIcon icon={meeting ? RiCalendarCheckLine : RiPhoneLine} tone={meeting ? 'violet' : 'blue'} />{label}</span><RiArrowRightSLine aria-hidden="true" /></Link> : <span>{label}</span>}
      </li>
    })}</ul> : !resource.loading && !resource.error && resource.data ? <p className="home-message">Aquí aparecerán tus llamadas y reuniones.</p> : null}
  </section>
}

function HomeOverview() {
  const { locale } = useI18n()
  const [stats, setStats] = useState(initialResource)
  const [actions, setActions] = useState(initialResource)
  const [activity, setActivity] = useState(initialResource)
  const [reloadKey, setReloadKey] = useState(0)
  const retry = () => setReloadKey(value => value + 1)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    function load(path, setResource, normalize) {
      setResource(current => ({ ...current, loading: true, error: '' }))
      readJson(path, controller.signal).then(normalize).then(data => {
        if (active) setResource({ data, loading: false, error: '' })
      }).catch(error => {
        if (active) setResource(current => ({ ...current, loading: false, error: error.message }))
      })
    }
    // Independent sections render as soon as their own request completes.
    load('/api/dashboard/stats?days=30', setStats, data => {
      if (!data || !Number.isFinite(data.monthlyClosedWonValue) || !Number.isFinite(data.monthlyMeetings)) throw new Error('Los resultados mensuales no están disponibles.')
      return data
    })
    load('/api/dashboard/actions?limit=100', setActions, data => ({
      items: pendingActions(data), warnings: data.warnings || [], degraded: data.degraded === true,
      total: data.total, received: (Array.isArray(data) ? data : data.items).length,
    }))
    load('/api/dashboard/activity?limit=5', setActivity, data => {
      if (!Array.isArray(data)) throw new Error('No se pudo leer la actividad reciente.')
      return data
    })
    return () => { active = false; controller.abort() }
  }, [reloadKey])

  const newWorkspace = !stats.error && !activity.error && !stats.loading && !activity.loading && isNewWorkspace(stats.data, activity.data)
  return <HomePageFrame page="dashboard" className="home-command" contentClassName="home-content">
      <PendingList resource={actions} retry={retry} newWorkspace={newWorkspace} />
      <MonthlyGoals refreshKey={reloadKey} />
      <RecentActivity resource={activity} retry={retry} locale={locale} />
  </HomePageFrame>
}

export default function Dashboard() {
  const { user } = useAuth()
  // Switching organization discards cached data and any unsaved goal draft.
  return <HomeOverview key={user?.orgId || user?.id || 'workspace'} />
}
