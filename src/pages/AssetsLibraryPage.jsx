import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  RiCheckboxCircleLine, RiCloseLine, RiDatabase2Line, RiDownload2Line,
  RiErrorWarningLine, RiExternalLinkLine, RiFileCopyLine, RiFileTextLine,
  RiFolderImageLine, RiGitBranchLine, RiImage2Line, RiLoader4Line,
  RiMusic2Line, RiVideoLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { getEffectiveNavigationPermissions } from '../lib/navigationPermissions'
import { getLocale, localeCode } from '../i18n'
import { ASSETS_LIBRARY_HERO } from '../lib/microappArt'
import PageLoadingState from '../components/ui/PageLoadingState'
import './assets-library.css'

const KIND_META = {
  image: { label: 'Imagen', Icon: RiImage2Line, color: 'var(--violet)' },
  video: { label: 'Vídeo', Icon: RiVideoLine, color: 'var(--pink)' },
  audio: { label: 'Audio', Icon: RiMusic2Line, color: 'var(--cyan)' },
  document: { label: 'Documento', Icon: RiFileTextLine, color: 'var(--warn)' },
  dataset: { label: 'Datos', Icon: RiDatabase2Line, color: 'var(--success)' },
  text: { label: 'Texto', Icon: RiFileTextLine, color: 'var(--accent)' },
}
const KIND_FILTERS = ['', 'image', 'video', 'audio', 'document', 'dataset', 'text']

const STATUS_META = {
  draft: { label: 'Borrador', color: 'var(--muted)' },
  approved: { label: 'Aprobado', color: 'var(--info)' },
  published: { label: 'Publicado', color: 'var(--success)' },
  archived: { label: 'Archivado', color: 'var(--dim)' },
}

const PAGE_SIZE = 30
const ACCESS_META = { private: 'Privado', shared: 'Compartido', published: 'Público' }

function kindMeta(kind) {
  return KIND_META[kind] || { label: kind || '—', Icon: RiFileTextLine, color: 'var(--muted)' }
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return '—'
  return (Number(cents) / 100).toLocaleString(localeCode(getLocale()), { style: 'currency', currency: 'EUR' })
}

/** Nombre presentable: el modelo Asset no tiene "name", se deriva de la procedencia. */
function assetTitle(asset) {
  const meta = kindMeta(asset.kind)
  const source = asset.model || asset.provider
  return source ? `${meta.label} · ${source}` : meta.label
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || '—', color: 'var(--muted)' }
  return <span className="assets-status" style={{ '--status': meta.color }}><i />{meta.label}</span>
}

// URLs prefirmadas ya resueltas en esta sesión: una petición por asset, no por
// render. TTL corto asumido — si expira, el detalle vuelve a pedirla.
const thumbUrlCache = new Map()

/**
 * Miniatura perezosa: el placeholder por tipo se pinta siempre; solo cuando la
 * tarjeta entra en el viewport (y solo para imágenes) se pide la URL prefirmada.
 * Así el grid no dispara N peticiones al cargar la página.
 */
function LazyThumb({ asset }) {
  const meta = kindMeta(asset.kind)
  const ref = useRef(null)
  const [url, setUrl] = useState(() => thumbUrlCache.get(asset.id) || null)
  const [failed, setFailed] = useState(false)
  const wantsImage = asset.kind === 'image'

  useEffect(() => {
    if (!wantsImage || url || failed) return undefined
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    let aborted = false
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      apiFetch(`/api/assets/${asset.id}/url`)
        .then(response => (response.ok ? response.json() : null))
        .then(data => {
          if (aborted) return
          if (data?.url) { thumbUrlCache.set(asset.id, data.url); setUrl(data.url) } else setFailed(true)
        })
        .catch(() => { if (!aborted) setFailed(true) })
    }, { rootMargin: '160px' })
    observer.observe(node)
    return () => { aborted = true; observer.disconnect() }
  }, [asset.id, wantsImage, url, failed])

  return (
    <div ref={ref} className="assets-thumb" style={{ '--kind': meta.color }}>
      {url && !failed
        ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <meta.Icon aria-hidden="true" />}
    </div>
  )
}

function LineageCard({ asset, onOpen }) {
  const meta = kindMeta(asset.kind)
  return (
    <button type="button" className="assets-lineage-card" onClick={() => onOpen(asset.id)}>
      <meta.Icon style={{ color: meta.color }} />
      <span>
        <strong>{assetTitle(asset)}</strong>
        <small>{formatDate(asset.createdAt)} · {formatBytes(asset.bytes)}</small>
      </span>
      <RiExternalLinkLine />
    </button>
  )
}

function DetailDrawer({ assetId, onClose, onOpenAsset, canPublish, onPublished }) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState(null)
  const [state, setState] = useState('loading')
  const [urlMessage, setUrlMessage] = useState(null) // { tone, text }
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    let active = true
    setState('loading')
    setUrlMessage(null)
    apiFetch(`/api/assets/${assetId}`)
      .then(response => { if (!response.ok) throw new Error(`asset_${response.status}`); return response.json() })
      .then(data => { if (active) { setDetail(data); setState('ready') } })
      .catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [assetId])

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // La URL de descarga se pide fresca en cada acción: la prefirmada del
  // detalle puede haber caducado si el drawer lleva un rato abierto.
  const fetchFreshUrl = useCallback(async () => {
    const response = await apiFetch(`/api/assets/${assetId}/url`)
    if (!response.ok) throw new Error(`url_${response.status}`)
    const data = await response.json()
    if (!data?.url) throw new Error('sin_url')
    return data.url
  }, [assetId])

  async function copyUrl() {
    try {
      const url = await fetchFreshUrl()
      await navigator.clipboard.writeText(url)
      setUrlMessage({ tone: 'ok', text: 'URL copiada al portapapeles (temporal: caduca en unos minutos).' })
    } catch {
      setUrlMessage({ tone: 'error', text: 'No se pudo copiar la URL. Inténtalo de nuevo.' })
    }
  }

  async function download() {
    try {
      const url = await fetchFreshUrl()
      window.open(url, '_blank', 'noopener')
    } catch {
      setUrlMessage({ tone: 'error', text: 'No se pudo generar la URL de descarga.' })
    }
  }

  async function publish() {
    setPublishing(true); setUrlMessage(null)
    try {
      const response = await apiFetch(`/api/assets/${assetId}/publish`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo publicar el activo.')
      setDetail(current => ({ ...current, ...body }))
      setUrlMessage({ tone: 'ok', text: 'Copia pública inmutable creada. El original privado no se expone.' })
      onPublished()
    } catch (error) { setUrlMessage({ tone: 'error', text: error.message }) } finally { setPublishing(false) }
  }

  const meta = detail ? kindMeta(detail.kind) : null

  return (
    <div className="assets-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="assets-drawer dark-scroll" role="dialog" aria-modal="true" aria-label="Detalle del activo">
        <header className="assets-drawer-header">
          <div>
            <h2>{detail ? assetTitle(detail) : 'Activo'}</h2>
            <p data-i18n-skip>{assetId}</p>
          </div>
          {detail && <StatusBadge status={detail.status} />}
          <button type="button" className="assets-icon-button" aria-label="Cerrar detalle" onClick={onClose}><RiCloseLine /></button>
        </header>

        {state === 'loading' && <div className="assets-drawer-state"><RiLoader4Line className="assets-spin" /> Cargando activo…</div>}
        {state === 'error' && (
          <div className="assets-drawer-state error">
            <RiErrorWarningLine />
            <span>No se pudo cargar el activo.</span>
          </div>
        )}

        {state === 'ready' && detail && (
          <>
            <section className="assets-preview" style={{ '--kind': meta.color }}>
              {detail.url && detail.kind === 'image' && <img src={detail.url} alt={assetTitle(detail)} />}
              {detail.url && detail.kind === 'audio' && <audio controls src={detail.url} />}
              {detail.url && detail.kind === 'video' && <video controls src={detail.url} />}
              {(!detail.url || !['image', 'audio', 'video'].includes(detail.kind)) && (
                <div className="assets-preview-fallback">
                  <meta.Icon aria-hidden="true" />
                  <span data-i18n-skip>{detail.mimeType}</span>
                </div>
              )}
            </section>

            <section className="assets-drawer-section assets-drawer-actions">
              {urlMessage && (
                <p className={`assets-url-message ${urlMessage.tone}`} role={urlMessage.tone === 'error' ? 'alert' : 'status'}>
                  {urlMessage.tone === 'ok' ? <RiCheckboxCircleLine /> : <RiErrorWarningLine />} {urlMessage.text}
                </p>
              )}
              <div className="assets-action-row">
                <button type="button" className="assets-button secondary" onClick={copyUrl}><RiFileCopyLine /> Copiar URL</button>
                <button type="button" className="assets-button primary" onClick={download}><RiDownload2Line /> Descargar</button>
                {detail.accessClass === 'published' && detail.publishedUrl ? <a className="assets-button secondary" href={detail.publishedUrl} target="_blank" rel="noreferrer noopener"><RiExternalLinkLine /> Abrir copia pública</a> : <button type="button" className="assets-button secondary" disabled={!canPublish || publishing} onClick={publish}>{publishing ? 'Publicando…' : 'Publicar copia inmutable'}</button>}
              </div>
            </section>

            <section className="assets-drawer-section">
              <h3>Procedencia</h3>
              <dl className="assets-drawer-grid">
                <div><dt>Proveedor</dt><dd data-i18n-skip>{detail.provider || '—'}</dd></div>
                <div><dt>Modelo</dt><dd data-i18n-skip>{detail.model || '—'}</dd></div>
                <div><dt>Coste</dt><dd>{formatCents(detail.costCents)}</dd></div>
                <div><dt>Creado</dt><dd>{formatDate(detail.createdAt)}</dd></div>
                <div><dt>Tamaño</dt><dd>{formatBytes(detail.bytes)}{detail.width && detail.height ? ` · ${detail.width}×${detail.height}` : ''}{detail.durationMs ? ` · ${Math.round(detail.durationMs / 1000)} s` : ''}</dd></div>
                <div><dt>Tipo</dt><dd data-i18n-skip>{detail.mimeType}</dd></div>
                <div><dt>Acceso</dt><dd>{ACCESS_META[detail.accessClass] || detail.accessClass || 'Privado'}</dd></div>
                <div><dt>Publicación</dt><dd>{detail.publishedAt ? formatDate(detail.publishedAt) : 'No publicada'}</dd></div>
              </dl>
              {detail.prompt && (
                <details className="assets-drawer-details">
                  <summary>Ver prompt de generación</summary>
                  <pre className="dark-scroll" data-i18n-skip>{detail.prompt}</pre>
                </details>
              )}
              {detail.jobId && (
                <button type="button" className="assets-link-button" onClick={() => navigate(`/trabajos?job=${detail.jobId}`)}>
                  <RiExternalLinkLine /> Ver el trabajo que lo generó
                </button>
              )}
            </section>

            <section className="assets-drawer-section">
              <h3><RiGitBranchLine /> Genealogía</h3>
              {detail.parent ? (
                <>
                  <p className="assets-drawer-muted">Derivado de:</p>
                  <LineageCard asset={detail.parent} onOpen={onOpenAsset} />
                </>
              ) : (
                <p className="assets-drawer-muted">Es un activo original: no deriva de otro.</p>
              )}
              {Array.isArray(detail.inputs) && detail.inputs.length > 0 && <div className="assets-relations"><p className="assets-drawer-muted">Entradas N:M:</p>{detail.inputs.map(relation => <div key={`${relation.parentId}-${relation.role}`}><small>{relation.role}</small><LineageCard asset={relation.parent} onOpen={onOpenAsset} /></div>)}</div>}
              {Array.isArray(detail.outputs) && detail.outputs.length > 0 && <div className="assets-relations"><p className="assets-drawer-muted">Derivados N:M:</p>{detail.outputs.map(relation => <div key={`${relation.childId}-${relation.role}`}><small>{relation.role}</small><LineageCard asset={relation.child} onOpen={onOpenAsset} /></div>)}</div>}
              {Array.isArray(detail.versions) && detail.versions.length > 0 ? (
                <div className="assets-versions">
                  <p className="assets-drawer-muted">Versiones ({detail.versions.length}):</p>
                  {detail.versions.map(version => (
                    <div key={version.id} className="assets-version-row">
                      <strong>{version.label || 'original'}</strong>
                      <span>{formatDate(version.createdAt)}</span>
                      <em>{formatCents(version.costCents)}</em>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="assets-drawer-muted">Sin versiones adicionales.</p>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  )
}

export default function AssetsLibraryPage() {
  const { user } = useAuth()
  const permissions = useMemo(() => getEffectiveNavigationPermissions(user), [user])
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [kindFilter, setKindFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [listState, setListState] = useState('loading') // loading | ready | empty | error
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedId, setSelectedId] = useState(() => searchParams.get('asset') || null)
  const requestRef = useRef(0)

  const fetchPage = useCallback(async ({ cursor = null, append = false } = {}) => {
    const requestId = ++requestRef.current
    if (append) setLoadingMore(true)
    else setListState('loading')
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
    if (kindFilter) params.set('kind', kindFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (cursor) params.set('cursor', cursor)
    try {
      const response = await apiFetch(`/api/assets?${params}`)
      if (!response.ok) throw new Error(`assets_${response.status}`)
      const data = await response.json()
      if (requestRef.current !== requestId) return
      const page = Array.isArray(data?.items) ? data.items : []
      setItems(current => (append ? [...current, ...page] : page))
      setNextCursor(data?.nextCursor || null)
      if (!append) setListState(page.length ? 'ready' : 'empty')
    } catch {
      if (requestRef.current === requestId && !append) setListState('error')
    } finally {
      if (requestRef.current === requestId) setLoadingMore(false)
    }
  }, [kindFilter, statusFilter])

  useEffect(() => { fetchPage() }, [fetchPage])

  function openAsset(assetId) {
    setSelectedId(assetId)
    setSearchParams(params => { const next = new URLSearchParams(params); next.set('asset', assetId); return next }, { replace: true })
  }

  function closeAsset() {
    setSelectedId(null)
    setSearchParams(params => { const next = new URLSearchParams(params); next.delete('asset'); return next }, { replace: true })
  }

  if (listState === 'loading') return <PageLoadingState label="Cargando activos" />

  return (
    <main className="assets-page dark-scroll">
      <header className="assets-header" style={{ backgroundImage: `url(${ASSETS_LIBRARY_HERO})` }}>
        <div className="assets-title">
          <div className="assets-title-icon"><RiFolderImageLine /></div>
          <div>
            <h1>Biblioteca de activos</h1>
            <p>Todo lo que la plataforma ha generado o guardado: imágenes, audio y documentos con su procedencia y coste.</p>
          </div>
        </div>
      </header>

      <section className="assets-filters" aria-label="Filtros de activos">
        <div className="assets-filter-chips" role="group" aria-label="Filtrar por tipo">
          {KIND_FILTERS.map(value => (
            <button
              key={value || 'all'}
              type="button"
              className={kindFilter === value ? 'active' : ''}
              onClick={() => setKindFilter(value)}
            >
              {value ? kindMeta(value).label : 'Todos'}
            </button>
          ))}
        </div>
        <label className="assets-status-filter">
          <span>Estado</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
      </section>

      {listState === 'loading' && <div className="assets-state" role="status"><RiLoader4Line className="assets-spin" /><strong>Cargando activos…</strong></div>}

      {listState === 'error' && (
        <div className="assets-state error" role="alert">
          <RiErrorWarningLine />
          <strong>No se pudo cargar la biblioteca.</strong>
          <span>Comprueba tu conexión o inténtalo de nuevo en unos segundos.</span>
          <button type="button" className="assets-button secondary" onClick={() => fetchPage()}>Reintentar</button>
        </div>
      )}

      {listState === 'empty' && (
        <div className="assets-state" role="status">
          <RiFolderImageLine />
          <strong>{kindFilter || statusFilter ? 'No hay activos con estos filtros' : 'Tu biblioteca todavía está vacía'}</strong>
          <span>
            {kindFilter || statusFilter
              ? 'Prueba con otro tipo u otro estado.'
              : 'Cada imagen, locución o documento que generes desde Campañas, Redes sociales o Ads se guarda aquí con su procedencia (proveedor, modelo, prompt y coste) y su genealogía de versiones.'}
          </span>
        </div>
      )}

      {listState === 'ready' && (
        <>
          <section className="assets-grid" aria-label="Activos">
            {items.map(asset => (
              <button type="button" key={asset.id} className="assets-card" onClick={() => openAsset(asset.id)}>
                <LazyThumb asset={asset} />
                <div className="assets-card-body">
                  <strong>{assetTitle(asset)}</strong>
                  <div className="assets-card-badges">
                    <span className="assets-kind" style={{ '--kind': kindMeta(asset.kind).color }}>{kindMeta(asset.kind).label}</span>
                    <StatusBadge status={asset.status} />
                    <span className={`assets-access ${asset.accessClass || 'private'}`}>{ACCESS_META[asset.accessClass] || 'Privado'}</span>
                  </div>
                  <small>{formatDate(asset.createdAt)} · {formatBytes(asset.bytes)}</small>
                </div>
              </button>
            ))}
          </section>
          <footer className="assets-footer">
            <span>{items.length} activos en esta vista</span>
            {nextCursor && (
              <button type="button" className="assets-button secondary" disabled={loadingMore} onClick={() => fetchPage({ cursor: nextCursor, append: true })}>
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            )}
          </footer>
        </>
      )}

      {selectedId && (
        <DetailDrawer
          assetId={selectedId}
          onClose={closeAsset}
          onOpenAsset={openAsset}
          canPublish={permissions.has('assets.manage')}
          onPublished={() => fetchPage()}
        />
      )}
    </main>
  )
}
