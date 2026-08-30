import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  RiArrowRightSLine, RiCheckboxCircleLine, RiCloseCircleLine, RiCloseLine,
  RiErrorWarningLine, RiFlowChart, RiListCheck2, RiLoader4Line,
  RiRestartLine, RiTimeLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode } from '../i18n'
import { useAuth } from '../contexts/AuthContext'
import { hasNavigationPermission } from '../lib/navigationPermissions'
import PageLoadingState from '../components/ui/PageLoadingState'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import './jobs-center.css'
import './growth-visual-standard.css'

// Estados canónicos del modelo Job (backend/src/services/jobs.service.ts).
const STATUS_META = {
  pending: { label: 'Pendiente', color: 'var(--warn)' },
  running: { label: 'En ejecución', color: 'var(--info)' },
  waiting_provider: { label: 'Esperando proveedor', color: 'var(--cyan)' },
  awaiting_approval: { label: 'Esperando aprobación', color: 'var(--violet)' },
  succeeded: { label: 'Completado', color: 'var(--success)' },
  failed: { label: 'Fallido', color: 'var(--danger-soft)' },
  cancel_requested: { label: 'Cancelación solicitada', color: 'var(--warn)' },
  canceled: { label: 'Cancelado', color: 'var(--muted)' },
}
const STATUS_FILTERS = ['', 'pending', 'running', 'waiting_provider', 'awaiting_approval', 'succeeded', 'failed', 'cancel_requested', 'canceled']
// Mientras haya trabajos en alguno de estos estados la vista se refresca sola.
const ACTIVE_STATUSES = new Set(['pending', 'running', 'waiting_provider', 'awaiting_approval', 'cancel_requested'])
const CANCELABLE_STATUSES = new Set(['pending', 'running', 'waiting_provider', 'awaiting_approval'])

const KIND_LABELS = {
  'image.generate': 'Generar imagen',
  'image.upscale': 'Escalar imagen',
  'audio.tts': 'Locución (voz)',
  'video.generate': 'Generar vídeo',
  'microapp.run': 'Ejecutar microapp',
  'research.company': 'Investigar empresa',
}

// El mismo código de jobs.service.ts: fallo con efecto externo incierto — el
// backend rechaza el reintento automático y aquí se explica el porqué.
const UNCERTAIN_OUTCOME = 'UNCERTAIN_EXTERNAL_OUTCOME'

const PAGE_SIZE = 25
const MAX_LIMIT = 100 // tope del backend (listQuerySchema)

export function kindLabel(kind) {
  return KIND_LABELS[kind] || kind || '—'
}

export function formatCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return '—'
  return (Number(cents) / 100).toLocaleString(localeCode(getLocale()), { style: 'currency', currency: 'EUR' })
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || '—', color: 'var(--muted)' }
  return <span className="jobs-status" style={{ '--status': meta.color }}><i />{meta.label}</span>
}

function errorText(error) {
  if (!error || typeof error !== 'object') return ''
  const code = typeof error.code === 'string' ? error.code : ''
  const message = typeof error.message === 'string' ? error.message : ''
  if (code === UNCERTAIN_OUTCOME) {
    return `${message || 'El proveedor no confirmó el resultado.'} El efecto externo quedó en duda, por eso no se reintenta automáticamente.`
  }
  return [code, message].filter(Boolean).join(' — ') || 'Fallo sin detalle registrado.'
}

/** Decisión del router (Job.input._routing): transparencia obligatoria del plan. */
function RoutingPanel({ routing }) {
  if (!routing || typeof routing !== 'object') {
    return <p className="jobs-drawer-muted">Este trabajo no registró decisión de enrutado (se creó sin pasar por el router de proveedores).</p>
  }
  const alternatives = Array.isArray(routing.alternatives) ? routing.alternatives : []
  const exclusions = Array.isArray(routing.exclusions) ? routing.exclusions : []
  return (
    <div className="jobs-routing">
      <div className="jobs-routing-chosen">
        <span className="jobs-routing-tag">Elegido</span>
        <strong>{routing.providerId || '—'}</strong>
        <em>{formatCents(routing.estimateCents)}</em>
        {routing.billingMode && <small>{routing.billingMode === 'byok' ? 'Con tu propia clave (BYOK)' : 'Facturación gestionada'}</small>}
        {routing.fallbackProviderId && <small>Respaldo si falla: {routing.fallbackProviderId}</small>}
      </div>
      {alternatives.length > 0 && (
        <div className="jobs-routing-group">
          <h4>Alternativas consideradas</h4>
          {alternatives.map((alt, index) => (
            <div key={`${alt.providerId}-${index}`} className="jobs-routing-row">
              <strong>{alt.providerId}</strong>
              <em>{formatCents(alt.estimateCents)}</em>
              <span>{alt.reason}</span>
            </div>
          ))}
        </div>
      )}
      {exclusions.length > 0 && (
        <div className="jobs-routing-group">
          <h4>Proveedores excluidos</h4>
          {exclusions.map((exclusion, index) => (
            <div key={`${exclusion.providerId}-${index}`} className="jobs-routing-row excluded">
              <strong>{exclusion.providerId}</strong>
              <span>{exclusion.reason}</span>
            </div>
          ))}
        </div>
      )}
      {alternatives.length === 0 && exclusions.length === 0 && (
        <p className="jobs-drawer-muted">Era el único proveedor candidato para esta capability.</p>
      )}
    </div>
  )
}

function DetailDrawer({ jobId, listItem, onClose, onJobChanged, canManage }) {
  const [detail, setDetail] = useState(null)
  const [state, setState] = useState('loading')
  const [actionState, setActionState] = useState('idle') // idle | canceling | retrying
  const [actionMessage, setActionMessage] = useState(null) // { tone: 'error'|'ok', text }

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState('loading')
    try {
      const response = await apiFetch(`/api/jobs/${jobId}`)
      if (!response.ok) throw new Error(`job_${response.status}`)
      setDetail(await response.json())
      setState('ready')
    } catch {
      if (!silent) setState('error')
    }
  }, [jobId])

  useEffect(() => { load() }, [load])

  // Mientras el job siga vivo, el detalle se refresca al mismo ritmo que la lista.
  useEffect(() => {
    if (!detail || !ACTIVE_STATUSES.has(detail.status)) return undefined
    const timer = setInterval(() => load({ silent: true }), 10_000)
    return () => clearInterval(timer)
  }, [detail, load])

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const job = detail || listItem
  const routing = detail?.input && typeof detail.input === 'object' && !Array.isArray(detail.input)
    ? detail.input._routing
    : listItem?.routing

  const canCancel = canManage && job && CANCELABLE_STATUSES.has(job.status)
  const isRetryableError = !job?.error || job.error?.code !== UNCERTAIN_OUTCOME
  const canRetry = canManage && job?.status === 'failed' && isRetryableError
  const cancelHint = canCancel ? '' : !canManage ? 'Tu rol puede consultar trabajos, pero no cancelarlos.' : job?.status === 'cancel_requested' ? 'La cancelación ya está solicitada al proveedor.' : 'Solo puede cancelarse un trabajo pendiente, en ejecución o esperando proveedor/aprobación.'
  const retryHint = canRetry ? '' : !canManage ? 'Tu rol puede consultar trabajos, pero no reintentarlos.' : job?.status !== 'failed'
    ? 'Solo un trabajo fallido puede reintentarse.'
    : 'El resultado externo quedó en duda; requiere revisión manual, no reintento.'

  async function runAction(action) {
    setActionState(action === 'cancel' ? 'canceling' : 'retrying')
    setActionMessage(null)
    try {
      const response = await apiFetch(`/api/jobs/${jobId}/${action}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        // 409: el estado ya no lo permite; el backend explica el motivo.
        setActionMessage({ tone: 'error', text: body.error || `No se pudo completar la acción (${response.status}).` })
      } else {
        setActionMessage({ tone: 'ok', text: action === 'cancel' ? 'Trabajo cancelado.' : 'Trabajo reencolado: volverá a intentarse en unos segundos.' })
        await load({ silent: true })
        onJobChanged(body)
      }
    } catch {
      setActionMessage({ tone: 'error', text: 'No hay conexión con el servidor. Inténtalo de nuevo.' })
    } finally {
      setActionState('idle')
    }
  }

  return (
    <div className="jobs-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="jobs-drawer dark-scroll" role="dialog" aria-modal="true" aria-label="Detalle del trabajo">
        <header className="jobs-drawer-header">
          <div>
            <h2>{kindLabel(job?.kind)}</h2>
            <p data-i18n-skip>{jobId}</p>
          </div>
          {job && <StatusBadge status={job.status} />}
          <button type="button" className="jobs-icon-button" aria-label="Cerrar detalle" onClick={onClose}><RiCloseLine /></button>
        </header>

        {state === 'loading' && <div className="jobs-drawer-state"><RiLoader4Line className="jobs-spin" /> Cargando detalle…</div>}
        {state === 'error' && (
          <div className="jobs-drawer-state error">
            <RiErrorWarningLine />
            <span>No se pudo cargar el detalle del trabajo.</span>
            <button type="button" onClick={() => load()}>Reintentar</button>
          </div>
        )}

        {state === 'ready' && detail && (
          <>
            <section className="jobs-drawer-section">
              <h3>Resumen</h3>
              <dl className="jobs-drawer-grid">
                <div><dt>Proveedor</dt><dd data-i18n-skip>{detail.provider || 'Sin asignar todavía'}</dd></div>
                <div><dt>Id en el proveedor</dt><dd data-i18n-skip>{detail.providerJobId || '—'}</dd></div>
                <div><dt>Coste estimado</dt><dd>{formatCents(detail.costEstimateCents)}</dd></div>
                <div><dt>Coste real</dt><dd>{formatCents(detail.costActualCents)}</dd></div>
                <div><dt>Intentos</dt><dd>{detail.attempts ?? 0} de {detail.maxAttempts ?? '—'}</dd></div>
                <div><dt>Creado</dt><dd>{formatDate(detail.createdAt)}</dd></div>
                <div><dt>Iniciado</dt><dd>{formatDate(detail.startedAt)}</dd></div>
                <div><dt>Terminado</dt><dd>{formatDate(detail.finishedAt)}</dd></div>
              </dl>
            </section>

            {detail.status === 'failed' && (
              <section className="jobs-drawer-section">
                <h3>Qué falló</h3>
                <p className="jobs-drawer-error" role="alert"><RiErrorWarningLine /> {errorText(detail.error)}</p>
              </section>
            )}

            <section className="jobs-drawer-section">
              <h3><RiFlowChart /> Decisión del router</h3>
              <RoutingPanel routing={routing} />
            </section>

            {detail.output != null && (
              <section className="jobs-drawer-section">
                <h3>Resultado</h3>
                <details className="jobs-drawer-details">
                  <summary>Ver salida del trabajo</summary>
                  <pre className="dark-scroll" data-i18n-skip>{JSON.stringify(detail.output, null, 2)}</pre>
                </details>
              </section>
            )}

            <section className="jobs-drawer-section jobs-drawer-actions">
              {actionMessage && (
                <p className={`jobs-action-message ${actionMessage.tone}`} role={actionMessage.tone === 'error' ? 'alert' : 'status'}>
                  {actionMessage.tone === 'ok' ? <RiCheckboxCircleLine /> : <RiErrorWarningLine />} {actionMessage.text}
                </p>
              )}
              <div className="jobs-action-row">
                <button
                  type="button"
                  className="jobs-button danger"
                  disabled={!canCancel || actionState !== 'idle'}
                  title={cancelHint || undefined}
                  onClick={() => runAction('cancel')}
                >
                  <RiCloseCircleLine /> {actionState === 'canceling' ? 'Cancelando…' : 'Cancelar'}
                </button>
                <button
                  type="button"
                  className="jobs-button primary"
                  disabled={!canRetry || actionState !== 'idle'}
                  title={retryHint || undefined}
                  onClick={() => runAction('retry')}
                >
                  <RiRestartLine /> {actionState === 'retrying' ? 'Reintentando…' : 'Reintentar'}
                </button>
              </div>
              {!canCancel && <small className="jobs-action-hint">{cancelHint}</small>}
              {!canRetry && job?.status === 'failed' && <small className="jobs-action-hint">{retryHint}</small>}
            </section>
          </>
        )}
      </aside>
    </div>
  )
}

export default function JobsCenterPage({ sectionNavigation = null }) {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(0)
  const [pagesLoaded, setPagesLoaded] = useState(1)
  const [statusFilter, setStatusFilter] = useState(() => {
    const requested = searchParams.get('status') || ''
    return STATUS_FILTERS.includes(requested) ? requested : ''
  })
  const [kindFilter, setKindFilter] = useState('')
  const [listState, setListState] = useState('loading') // loading | ready | empty | error
  const [loadingMore, setLoadingMore] = useState(false)
  // Enlazable desde otras páginas (p. ej. la Biblioteca de activos): ?job=<id>.
  const [selectedId, setSelectedId] = useState(() => searchParams.get('job') || null)
  // Los kinds vistos se acumulan para que el filtro no pierda opciones al filtrar.
  const knownKindsRef = useRef(new Set())
  const [kindOptions, setKindOptions] = useState([])
  const requestRef = useRef(0)
  const canManage = hasNavigationPermission(user, ['jobs.manage'])

  const fetchList = useCallback(async ({ pages = 1, silent = false } = {}) => {
    const requestId = ++requestRef.current
    if (!silent) setListState('loading')
    const params = new URLSearchParams({ page: '1', limit: String(Math.min(pages * PAGE_SIZE, MAX_LIMIT)) })
    if (statusFilter) params.set('status', statusFilter)
    if (kindFilter) params.set('kind', kindFilter)
    try {
      const response = await apiFetch(`/api/jobs?${params}`)
      if (!response.ok) throw new Error(`jobs_${response.status}`)
      const data = await response.json()
      if (requestRef.current !== requestId) return
      const items = Array.isArray(data?.jobs) ? data.jobs : []
      setJobs(items)
      setTotal(Number(data?.pagination?.total) || items.length)
      let changed = false
      items.forEach(job => { if (job.kind && !knownKindsRef.current.has(job.kind)) { knownKindsRef.current.add(job.kind); changed = true } })
      if (changed) setKindOptions([...knownKindsRef.current].sort())
      setListState(items.length ? 'ready' : 'empty')
    } catch {
      if (requestRef.current === requestId && !silent) setListState('error')
    } finally {
      if (requestRef.current === requestId) setLoadingMore(false)
    }
  }, [statusFilter, kindFilter])

  // Cambiar de filtro reinicia la paginación; "Cargar más" amplía el límite.
  useEffect(() => { setPagesLoaded(1) }, [statusFilter, kindFilter])
  useEffect(() => { fetchList({ pages: pagesLoaded, silent: pagesLoaded > 1 }) }, [fetchList, pagesLoaded])

  const hasActiveJobs = useMemo(() => jobs.some(job => ACTIVE_STATUSES.has(job.status)), [jobs])

  // Sin cliente socket.io en este frontend: refresco por intervalo mientras
  // haya trabajos vivos, silencioso para no parpadear la tabla.
  useEffect(() => {
    if (!hasActiveJobs) return undefined
    const timer = setInterval(() => fetchList({ pages: pagesLoaded, silent: true }), 10_000)
    return () => clearInterval(timer)
  }, [hasActiveJobs, fetchList, pagesLoaded])

  const hasMore = jobs.length < total && jobs.length < MAX_LIMIT

  async function loadMore() {
    setLoadingMore(true)
    setPagesLoaded(pages => pages + 1)
  }

  function openJob(id) {
    setSelectedId(id)
    setSearchParams(params => { const next = new URLSearchParams(params); next.set('job', id); return next }, { replace: true })
  }

  function closeDrawer() {
    setSelectedId(null)
    setSearchParams(params => { const next = new URLSearchParams(params); next.delete('job'); return next }, { replace: true })
  }

  function onJobChanged(summary) {
    if (summary?.id) setJobs(current => current.map(job => (job.id === summary.id ? { ...job, ...summary } : job)))
    fetchList({ pages: pagesLoaded, silent: true })
  }

  const selectedListItem = jobs.find(job => job.id === selectedId) || null

  if (listState === 'loading') return <PageLoadingState label="Cargando trabajos" />

  return (
    <main className="jobs-page dark-scroll">
      <ProductPageHeader Icon={RiListCheck2} title="Trabajos" description="La cola común de generaciones e investigaciones: estado, proveedor y coste de cada trabajo." navigation={sectionNavigation} />

      <section className="jobs-filters" aria-label="Filtros de trabajos">
        <div className="jobs-filter-chips" role="group" aria-label="Filtrar por estado">
          {STATUS_FILTERS.map(value => (
            <button
              key={value || 'all'}
              type="button"
              className={statusFilter === value ? 'active' : ''}
              onClick={() => setStatusFilter(value)}
            >
              {value ? STATUS_META[value].label : 'Todos'}
            </button>
          ))}
        </div>
        <label className="jobs-kind-filter">
          <span>Tipo</span>
          <select value={kindFilter} onChange={event => setKindFilter(event.target.value)}>
            <option value="">Todos</option>
            {kindOptions.map(kind => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}
          </select>
        </label>
        {hasActiveJobs && <span className="jobs-live-hint"><RiTimeLine /> Actualizando cada 10 s mientras haya trabajos activos</span>}
      </section>

      {listState === 'loading' && <div className="jobs-state" role="status"><RiLoader4Line className="jobs-spin" /><strong>Cargando trabajos…</strong></div>}

      {listState === 'error' && (
        <div className="jobs-state error" role="alert">
          <RiErrorWarningLine />
          <strong>No se pudieron cargar los trabajos.</strong>
          <span>Comprueba tu conexión o inténtalo de nuevo en unos segundos.</span>
          <button type="button" className="jobs-button secondary" onClick={() => fetchList({ pages: pagesLoaded })}>Reintentar</button>
        </div>
      )}

      {listState === 'empty' && (
        <div className="jobs-state" role="status">
          <RiListCheck2 />
          <strong>{statusFilter || kindFilter ? 'No hay trabajos con estos filtros' : 'Todavía no hay trabajos'}</strong>
          <span>
            {statusFilter || kindFilter
              ? 'Prueba con otro estado u otro tipo de trabajo.'
              : 'Cada generación de imagen, locución o vídeo y cada investigación larga entra en esta cola. Se crean desde Campañas, Redes sociales, Ads y las microapps; aquí verás su progreso, proveedor y coste, y podrás cancelarlas o reintentarlas.'}
          </span>
        </div>
      )}

      {listState === 'ready' && (
        <section className="jobs-table-card">
          <div className="jobs-table-head" role="row">
            <span>Estado</span><span>Trabajo</span><span>Proveedor</span><span>Coste</span><span>Intentos</span><span>Fecha</span><span />
          </div>
          <div className="jobs-table-body">
            {jobs.map(job => (
              <button type="button" key={job.id} className="jobs-row" onClick={() => openJob(job.id)}>
                <StatusBadge status={job.status} />
                <span className="jobs-kind"><strong>{kindLabel(job.kind)}</strong><small data-i18n-skip>{job.kind}</small></span>
                <span className="jobs-provider" data-i18n-skip>{job.provider || '—'}</span>
                <span className="jobs-cost">
                  <strong>{formatCents(job.costActualCents ?? job.costEstimateCents)}</strong>
                  <small>{job.costActualCents != null ? 'real' : job.costEstimateCents != null ? 'estimado' : ''}</small>
                </span>
                <span className="jobs-attempts">{job.attempts ?? 0}/{job.maxAttempts ?? '—'}</span>
                <span className="jobs-date">{formatDate(job.createdAt)}</span>
                <RiArrowRightSLine className="jobs-row-arrow" />
              </button>
            ))}
          </div>
          <footer className="jobs-table-footer">
            <span>Mostrando {jobs.length} de {total.toLocaleString(localeCode(getLocale()))} trabajos</span>
            {hasMore && (
              <button type="button" className="jobs-button secondary" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            )}
            {!hasMore && jobs.length >= MAX_LIMIT && jobs.length < total && (
              <small>La vista muestra los {MAX_LIMIT} más recientes; usa los filtros para acotar el resto.</small>
            )}
          </footer>
        </section>
      )}

      {selectedId && (
        <DetailDrawer
          jobId={selectedId}
          listItem={selectedListItem}
          onClose={closeDrawer}
          onJobChanged={onJobChanged}
          canManage={canManage}
        />
      )}
    </main>
  )
}
