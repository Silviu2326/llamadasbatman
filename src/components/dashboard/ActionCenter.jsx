import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAlertLine,
  RiArrowRightLine,
  RiBarChartLine,
  RiCheckLine,
  RiCloseCircleLine,
  RiErrorWarningLine,
  RiFilter3Line,
  RiGlobalLine,
  RiGroupLine,
  RiLoader4Line,
  RiPauseLine,
  RiPhoneLine,
  RiPlayLine,
  RiRefreshLine,
  RiRobotLine,
  RiSearchLine,
  RiSettings3Line,
  RiTimeLine,
  RiUserLine,
} from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { getLocale, localeCode, useI18n } from '../../i18n'

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'Todas las prioridades' },
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'new', label: 'Nueva' },
  { value: 'accepted', label: 'Aceptada' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'completed', label: 'Completada' },
  { value: 'postponed', label: 'Pospuesta' },
  { value: 'discarded', label: 'Descartada' },
  { value: 'blocked', label: 'Bloqueada' },
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.slice(1).map(option => [option.value, option.label]))
const TERMINAL_STATUSES = new Set(['completed', 'discarded'])
const LIVE_STATUSES = new Set(['new', 'accepted', 'in_progress', 'completed', 'dismissed', 'blocked'])

const CATEGORY_LABELS = {
  ads: 'Ads',
  automation: 'Automatizaciones',
  calls: 'Llamadas',
  leads: 'Leads',
  organic: 'Orgánico',
  pipeline: 'Pipeline',
  prospects: 'Prospect Finder',
}

const ACTION_ICONS = {
  leads: RiGroupLine,
  pipeline: RiBarChartLine,
  ads: RiBarChartLine,
  organic: RiGlobalLine,
  prospects: RiSearchLine,
  calls: RiPhoneLine,
  automation: RiSettings3Line,
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = String(value ?? '').toLowerCase().replace(/\s+/g, '_')
  return allowed.includes(normalized) ? normalized : fallback
}

function normalizeCategory(value, fallback) {
  const normalized = String(value ?? '').toLowerCase().replace(/\s+/g, '_')
  if (['campaign', 'campaigns', 'ads'].includes(normalized)) return 'ads'
  if (['automation', 'automations'].includes(normalized)) return 'automation'
  if (['call', 'calls', 'meeting', 'meetings'].includes(normalized)) return 'calls'
  if (['lead', 'leads'].includes(normalized)) return 'leads'
  if (['organic', 'organic_leads', 'organic_opportunity'].includes(normalized)) return 'organic'
  if (['opportunity', 'opportunities', 'pipeline'].includes(normalized)) return 'pipeline'
  if (['prospect', 'prospects'].includes(normalized)) return 'prospects'
  return normalized || fallback
}

function normalizeStatus(value, fallback) {
  const normalized = String(value ?? '').toLowerCase().replace(/\s+/g, '_')
  // The API calls this state "dismissed"; the dashboard presents one consistent label.
  if (normalized === 'dismissed') return 'discarded'
  return normalizeChoice(normalized, STATUS_OPTIONS.slice(1).map(option => option.value), fallback)
}

function normalizeAction(item, index = 0) {
  const target = item?.target && typeof item.target === 'object' ? item.target : {}
  const rawCategory = item?.category ?? item?.type ?? target.type ?? item?.kind
  const category = normalizeCategory(rawCategory, 'unknown')
  const cta = item?.cta && typeof item.cta === 'object' ? item.cta : {}
  const impact = item?.impact && typeof item.impact === 'object' ? item.impact.label : item?.impact
  const owner = item?.owner && typeof item.owner === 'object' ? item.owner.label : item?.owner

  return {
    id: item?.id ? String(item.id) : `server-action-${index}`,
    category,
    title: item?.title ?? item?.name ?? 'Acción sin título',
    evidence: item?.evidence ?? item?.description ?? item?.reason ?? 'Sin evidencia disponible.',
    priority: normalizeChoice(item?.priority ?? item?.severity, ['urgent', 'high', 'medium', 'low'], 'medium'),
    impact: impact || 'Impacto todavía no calculado.',
    owner: owner || item?.responsible || item?.assignee || 'Sin responsable asignado',
    cta: {
      label: cta.label ?? item?.ctaLabel ?? 'Abrir módulo',
      route: cta.route ?? target.path ?? item?.route ?? null,
    },
    status: normalizeStatus(item?.status, 'new'),
  }
}

function extractActions(payload) {
  const candidate = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.actions)
        ? payload.actions
        : Array.isArray(payload?.data?.items)
          ? payload.data.items
          : Array.isArray(payload?.data?.actions)
            ? payload.data.actions
            : Array.isArray(payload?.data)
              ? payload.data
              : []
  return candidate.filter(Boolean).map(normalizeAction)
}

function extractUpdatedAction(payload) {
  if (!payload || Array.isArray(payload)) return null
  const candidate = payload?.item ?? payload?.action ?? payload?.data?.item ?? payload?.data ?? payload
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  return normalizeAction(candidate, 0)
}

function getPriorityLabel(priority) {
  return priority === 'urgent' ? 'Urgente' : priority === 'high' ? 'Alta' : priority === 'low' ? 'Baja' : 'Media'
}

function getNextStatus(currentStatus, action) {
  if (action === 'accept') return 'accepted'
  if (action === 'start') return 'in_progress'
  if (action === 'complete') return 'completed'
  if (action === 'postpone') return 'postponed'
  if (action === 'discard') return 'discarded'
  return currentStatus
}

function getErrorMessage(error) {
  if (error?.status === 401 || error?.status === 403) return 'Tu sesión o tus permisos no permiten consultar estas señales.'
  if (error?.status >= 500) return 'El servicio del dashboard no está disponible ahora mismo.'
  return 'Comprueba la conexión e inténtalo de nuevo.'
}

function formatUpdatedAt(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(localeCode(getLocale()), { hour: '2-digit', minute: '2-digit' }).format(value)
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? category
}

function ActionIcon({ category }) {
  const Icon = ACTION_ICONS[category] ?? RiAlertLine
  return <Icon aria-hidden="true" />
}

function StatusBadge({ status }) {
  return (
    <span className={`action-center-status action-center-status-${status}`}>
      {STATUS_LABELS[status] ?? 'Sin estado'}
    </span>
  )
}

function ActionCard({ action, isLive, pendingActionId, onStatusChange, onNavigate }) {
  const isTerminal = TERMINAL_STATUSES.has(action.status)
  const isPostponed = action.status === 'postponed'
  const isNew = action.status === 'new'
  const isPending = pendingActionId === action.id
  const titleId = `action-center-title-${action.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  return (
    <article
      className={`action-center-card action-center-card-${action.priority} action-center-card-${action.status}`}
      aria-labelledby={titleId}
      aria-busy={isPending}
    >
      <div className="action-center-card-topline">
        <span className={`action-center-category action-center-category-${action.category}`} aria-hidden="true">
          <ActionIcon category={action.category} />
        </span>
        <span className={`action-center-priority action-center-priority-${action.priority}`}>
          {getPriorityLabel(action.priority)}
        </span>
        <StatusBadge status={action.status} />
      </div>

      <div className="action-center-card-copy">
        <h3 id={titleId}>{action.title}</h3>
        <p className="action-center-evidence">{action.evidence}</p>
        <p className="action-center-impact"><strong>Impacto</strong>{action.impact}</p>
      </div>

      <div className="action-center-card-meta">
        <span title={action.owner}><RiUserLine aria-hidden="true" /> {action.owner}</span>
        <span className="action-center-card-source">{categoryLabel(action.category)}</span>
      </div>

      <div className="action-center-card-actions">
        <button
          type="button"
          className="action-center-cta"
          onClick={() => onNavigate(action)}
          aria-label={`${action.cta.label}: ${action.title}`}
        >
          {action.cta.label}<RiArrowRightLine aria-hidden="true" />
        </button>
        <div className="action-center-secondary-actions" role="group" aria-label={`Gestionar acción: ${action.title}`}>
          {isNew || isPostponed ? (
            <button
              type="button"
              className="action-center-action-button"
              onClick={() => onStatusChange(action, 'accept')}
              disabled={isPending}
              aria-label={`${isPostponed ? 'Reactivar' : 'Aceptar'}: ${action.title}`}
            >
              <RiCheckLine aria-hidden="true" /> {isPostponed ? 'Reactivar' : 'Aceptar'}
            </button>
          ) : null}
          {!isTerminal && !isPostponed && action.status !== 'blocked' ? (
            <button
              type="button"
              className="action-center-action-button"
              onClick={() => onStatusChange(action, 'start')}
              disabled={isPending}
              aria-label={`Poner en curso: ${action.title}`}
            >
              <RiPlayLine aria-hidden="true" /> En curso
            </button>
          ) : null}
          {!isTerminal ? (
            <>
              <button
                type="button"
                className="action-center-action-button"
                onClick={() => onStatusChange(action, 'complete')}
                disabled={isPending}
                aria-label={`Completar: ${action.title}`}
              >
                <RiCheckLine aria-hidden="true" /> Completar
              </button>
              {!isLive ? (
                <button
                  type="button"
                  className="action-center-action-button"
                  onClick={() => onStatusChange(action, 'postpone')}
                  disabled={isPending}
                  aria-label={`Posponer: ${action.title}`}
                >
                  <RiPauseLine aria-hidden="true" /> Posponer
                </button>
              ) : null}
              <button
                type="button"
                className="action-center-action-button action-center-action-button-danger"
                onClick={() => onStatusChange(action, 'discard')}
                disabled={isPending}
                aria-label={`Descartar: ${action.title}`}
              >
                <RiCloseCircleLine aria-hidden="true" /> Descartar
              </button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function LoadingState() {
  return (
    <div className="action-center-loading" role="status" aria-live="polite" aria-label="Cargando señales del dashboard">
      <div className="action-center-loading-heading"><RiLoader4Line aria-hidden="true" /> <span>Sincronizando señales...</span></div>
      <div className="action-center-skeleton-grid" aria-hidden="true">
        {[1, 2, 3, 4].map(item => <div className="action-center-skeleton-card" key={item} />)}
      </div>
    </div>
  )
}

function EmptyState({ hasFilters, onClearFilters, onRetry }) {
  return (
    <div className="action-center-empty" role="status" aria-live="polite">
      <RiTimeLine aria-hidden="true" />
      <div>
        <strong>{hasFilters ? 'No hay señales con estos filtros' : 'No hay señales activas'}</strong>
        <p>{hasFilters ? 'Prueba otra prioridad, estado, módulo o búsqueda.' : 'Cuando detectemos una oportunidad, aparecerá aquí con su siguiente paso.'}</p>
      </div>
      {hasFilters ? (
        <button type="button" onClick={onClearFilters}>Limpiar filtros</button>
      ) : (
        <div className="action-center-empty-actions">
          <button type="button" onClick={onRetry}>Actualizar</button>
        </div>
      )}
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="action-center-error-state" role="alert">
      <RiErrorWarningLine aria-hidden="true" />
      <div>
        <strong>No se pudo sincronizar el Centro de acción</strong>
        <p>{message}</p>
      </div>
      <div className="action-center-empty-actions">
        <button type="button" onClick={onRetry}>Reintentar</button>
      </div>
    </div>
  )
}

export default function ActionCenter() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const activeRequestRef = useRef(null)
  const hasLoadedRef = useRef(false)
  const [actions, setActions] = useState([])
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [requestState, setRequestState] = useState('loading')
  const [dataSource, setDataSource] = useState('live')
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [pendingActionId, setPendingActionId] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadActions = useCallback(async () => {
    activeRequestRef.current?.abort()
    const controller = new AbortController()
    activeRequestRef.current = controller
    const isCurrentRequest = () => activeRequestRef.current === controller

    setIsRefreshing(true)
    setRequestState(current => hasLoadedRef.current ? current : 'loading')
    setError(null)

    try {
      const response = await apiFetch('/api/dashboard/actions', { signal: controller.signal })
      if (!response.ok) {
        const requestError = new Error(`Action center ${response.status}`)
        requestError.status = response.status
        throw requestError
      }

      const payload = await response.json()
      const remoteActions = extractActions(payload)
      if (!isCurrentRequest()) return
      setActions(remoteActions)
      setDataSource('live')
      setRequestState('success')
      hasLoadedRef.current = true
      setLastUpdated(new Date())
      // El backend degrada a los items calculados en memoria cuando no puede
      // persistirlos (antes eso era un 503 que rompia la tarjeta entera). Las
      // señales son validas, pero los cambios de estado no se estan guardando.
      const persistenceDown = payload?.degraded === true
      setFeedback(persistenceDown
        ? 'Señales al día, pero no se están guardando los cambios de estado. Reintenta en unos minutos.'
        : remoteActions.length ? `${remoteActions.length} señales sincronizadas.` : 'No se han detectado señales activas.')
    } catch (requestError) {
      if (requestError?.name === 'AbortError' || !isCurrentRequest()) return
      setRequestState('error')
      setDataSource('error')
      setError(requestError)
      setFeedback('La sincronización necesita atención.')
    } finally {
      if (isCurrentRequest()) {
        activeRequestRef.current = null
        setIsRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    loadActions()
    return () => activeRequestRef.current?.abort()
  }, [loadActions])

  const categoryOptions = useMemo(() => {
    const categories = [...new Set(actions.map(action => action.category))].sort((left, right) => categoryLabel(left).localeCompare(categoryLabel(right), 'es'))
    return [{ value: 'all', label: 'Todos los módulos' }, ...categories.map(category => ({ value: category, label: categoryLabel(category) }))]
  }, [actions])

  const filteredActions = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('es')
    return actions.filter(action => {
      const searchableText = [action.title, action.evidence, action.impact, action.owner, categoryLabel(action.category)].join(' ').toLocaleLowerCase('es')
      return (
        (priorityFilter === 'all' || action.priority === priorityFilter) &&
        (statusFilter === 'all' || action.status === statusFilter) &&
        (categoryFilter === 'all' || action.category === categoryFilter) &&
        (!query || searchableText.includes(query))
      )
    })
  }, [actions, categoryFilter, priorityFilter, searchQuery, statusFilter])

  const activeCount = actions.filter(action => !TERMINAL_STATUSES.has(action.status)).length
  const visibleCount = filteredActions.length
  const hasFilters = priorityFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all' || Boolean(searchQuery.trim())
  const isLoading = requestState === 'loading'
  const sourceLabel = dataSource === 'live' ? 'Datos conectados' : dataSource === 'error' ? 'Sin sincronizar' : 'Demo explícito'

  const clearFilters = () => {
    setPriorityFilter('all')
    setStatusFilter('all')
    setCategoryFilter('all')
    setSearchQuery('')
  }

  const handleStatusChange = async (action, operation) => {
    if (pendingActionId) return
    const nextStatus = getNextStatus(action.status, operation)
    if (nextStatus === action.status) return

    const previousStatus = action.status
    setPendingActionId(action.id)
    setActions(current => current.map(item => item.id === action.id ? { ...item, status: nextStatus } : item))
    setFeedback(`${action.title}: ${STATUS_LABELS[nextStatus]?.toLowerCase() ?? 'estado actualizado'}.`)

    // Demo actions are deliberately local and never call a remote endpoint.
    if (!action.id.startsWith('demo-')) {
      const remoteStatus = nextStatus === 'discarded' ? 'dismissed' : nextStatus
      if (!LIVE_STATUSES.has(remoteStatus)) {
        setActions(current => current.map(item => item.id === action.id ? { ...item, status: previousStatus } : item))
        setFeedback(`No se puede sincronizar el estado de ${action.title} con el servicio actual.`)
        setPendingActionId(null)
        return
      }

      try {
        const response = await apiFetch(`/api/dashboard/actions/${encodeURIComponent(action.id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `action-center:${action.id}:${remoteStatus}`,
          },
          body: JSON.stringify({ status: remoteStatus }),
        })
        if (!response.ok) {
          const requestError = new Error(`Action update ${response.status}`)
          requestError.status = response.status
          throw requestError
        }
        const updatedAction = extractUpdatedAction(await response.json().catch(() => null))
        setActions(current => current.map(item => item.id === action.id ? (updatedAction ?? { ...item, status: nextStatus }) : item))
        setLastUpdated(new Date())
        setFeedback(`${action.title}: ${STATUS_LABELS[updatedAction?.status ?? nextStatus]?.toLowerCase() ?? 'estado actualizado'}.`)
      } catch (requestError) {
        setActions(current => current.map(item => item.id === action.id ? { ...item, status: previousStatus } : item))
        setFeedback(`No se pudo actualizar “${action.title}”. ${getErrorMessage(requestError)}`)
      }
    }

    setPendingActionId(null)
  }

  const handleNavigate = action => {
    if (!action.cta.route) {
      setFeedback(`La acción «${action.title}» todavía no tiene un destino configurado.`)
      return
    }
    setFeedback(`Abriendo ${action.cta.label.toLowerCase()}.`)
    navigate(action.cta.route)
  }

  return (
    <section
      className="action-center"
      aria-labelledby="action-center-title"
      aria-describedby="action-center-feedback"
      aria-busy={isLoading}
    >
      <div className="action-center-header">
        <div className="action-center-heading">
          <span className="action-center-kicker"><RiRobotLine aria-hidden="true" /> {locale === 'en' ? 'Revenue director' : 'Director comercial'}</span>
          <div className="action-center-title-row">
            <h2 id="action-center-title">{locale === 'en' ? 'Action center' : 'Centro de acción'}</h2>
            <span className="action-center-count" aria-label={`${activeCount} ${locale === 'en' ? 'active actions' : 'acciones activas'}`}>{activeCount} {locale === 'en' ? 'active' : 'activas'}</span>
          </div>
          <p>{locale === 'en' ? 'Turn your business signals into the most important next step.' : 'Convierte las señales de tu negocio en el siguiente paso más importante.'}</p>
        </div>
        <div className="action-center-header-actions">
          <div className={`action-center-source action-center-source-${dataSource}`} aria-label={sourceLabel}>
            <span className="action-center-source-dot" />
            {sourceLabel}
          </div>
          <button
            type="button"
            className="action-center-refresh"
            onClick={loadActions}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            <RiRefreshLine aria-hidden="true" className={isLoading ? 'action-center-spin' : ''} />
            {isLoading ? (locale === 'en' ? 'Refreshing' : 'Actualizando') : (locale === 'en' ? 'Refresh' : 'Actualizar')}
          </button>
        </div>
      </div>

      {error && actions.length > 0 ? (
        <div className="action-center-error" role="alert">
          <RiErrorWarningLine aria-hidden="true" />
          <span>{getErrorMessage(error)}</span>
          <button type="button" onClick={loadActions} disabled={isRefreshing}>Reintentar</button>
        </div>
      ) : null}

      <div className="action-center-toolbar">
        <div className="action-center-summary" id="action-center-feedback" role="status" aria-live="polite" aria-atomic="true">
          <strong>{visibleCount}</strong> visibles · <strong>{actions.length}</strong> detectadas
          {lastUpdated ? <span className="action-center-updated">Actualizado a las {formatUpdatedAt(lastUpdated)}</span> : null}
        </div>
        <div className="action-center-filters" aria-label="Filtros del Centro de acción">
          <label className="action-center-search">
            <span className="action-center-visually-hidden">Buscar señales</span>
            <RiSearchLine aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Buscar señal..."
              aria-label="Buscar señales"
            />
          </label>
          <label>
            <span>Prioridad</span>
            <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} aria-label="Filtrar por prioridad">
              {PRIORITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filtrar por estado">
              {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Módulo</span>
            <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} aria-label="Filtrar por módulo">
              {categoryOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {hasFilters ? (
            <button type="button" className="action-center-clear-filters" onClick={clearFilters} aria-label="Limpiar todos los filtros">
              <RiFilter3Line aria-hidden="true" /> Limpiar
            </button>
          ) : null}
        </div>
      </div>

      <div className="action-center-feedback" aria-live="polite" aria-atomic="true">
        {feedback || 'Selecciona una acción para actualizar su estado o abrir el módulo responsable.'}
      </div>

      {isLoading && actions.length === 0 ? <LoadingState /> : null}
      {!isLoading && error && actions.length === 0 ? <ErrorState message={getErrorMessage(error)} onRetry={loadActions} /> : null}
      {!isLoading && !error && actions.length === 0 ? <EmptyState hasFilters={hasFilters} onClearFilters={clearFilters} onRetry={loadActions} /> : null}
      {!isLoading && actions.length > 0 && filteredActions.length > 0 ? (
        <div className={`action-center-grid${isRefreshing ? ' action-center-grid-refreshing' : ''}`} aria-live="polite">
          {filteredActions.map(action => (
            <ActionCard key={action.id} action={action} isLive={dataSource === 'live'} pendingActionId={pendingActionId} onStatusChange={handleStatusChange} onNavigate={handleNavigate} />
          ))}
        </div>
      ) : null}
      {!isLoading && !error && actions.length > 0 && filteredActions.length === 0 ? <EmptyState hasFilters onClearFilters={clearFilters} onRetry={loadActions} /> : null}
    </section>
  )
}
