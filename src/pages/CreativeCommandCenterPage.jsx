import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiBookShelfLine,
  RiCalendarLine,
  RiCheckLine,
  RiCloseLine,
  RiDownload2Line,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiFilmLine,
  RiImageLine,
  RiLayoutGridLine,
  RiMegaphoneLine,
  RiPlugLine,
  RiRefreshLine,
  RiSave3Line,
  RiSendPlaneLine,
  RiSettings4Line,
  RiSparkling2Line,
  RiStackLine,
  RiTimeLine,
  RiUpload2Line,
  RiVideoLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { readPlanGate } from '../lib/planGate'
import { useAuth } from '../contexts/AuthContext'
import './creative-command-center.css'

/*
 * Estudio creativo de Ads. Es una capa fina sobre lo que ya existe en el
 * backend, no un producto aparte:
 *   - imagen:  POST /api/metricool/ai/image (URL pública + asset en la biblioteca)
 *   - vídeo:   POST /api/capabilities/run (video.generate) + sondeo de /api/jobs/:id
 *   - subida:  POST /api/metricool/media
 *   - piezas:  GET /api/content/pieces y PUT /api/content/pieces/:id/image
 *   - marca:   GET /api/content/brand · canales: GET /api/metricool
 * Cada bloqueo (plan, integración sin configurar, saldo) se enseña con el
 * mensaje que devuelve el servidor; aquí no se simula nada.
 */

const FORMAT_PRESETS = [
  { id: 'reel', label: 'Reel 9:16', ratio: '9:16', icon: RiVideoLine, description: 'Vídeo vertical' },
  { id: 'story', label: 'Story 9:16', ratio: '9:16', icon: RiFilmLine, description: 'Impacto rápido' },
  { id: 'feed', label: 'Feed 1:1', ratio: '1:1', icon: RiImageLine, description: 'Imagen cuadrada' },
  { id: 'portrait', label: 'Feed 4:5', ratio: '4:5', icon: RiImageLine, description: 'Vertical de feed' },
  { id: 'carousel', label: 'Carrusel', ratio: '1:1', icon: RiStackLine, description: 'Portada 1:1' },
  { id: 'banner', label: 'Banner 16:9', ratio: '16:9', icon: RiLayoutGridLine, description: 'Web y YouTube' },
]
const RATIOS = ['9:16', '1:1', '16:9', '4:5']
// videoGenerateInput del backend solo admite estas tres.
const VIDEO_RATIOS = new Set(['9:16', '16:9', '1:1'])
const TYPE_TABS = [['image', RiImageLine, 'Imagen'], ['video', RiVideoLine, 'Vídeo'], ['carousel', RiStackLine, 'Carrusel']]
// El formato de un brief de Ads (imagen|video|carrusel) marca el tipo de
// generación por defecto del estudio; el borrador local, si existe, gana.
const BRIEF_TYPE = { imagen: 'image', video: 'video', carrusel: 'carousel' }
const BRIEF_FORMAT_PRESET = { imagen: 'feed', video: 'reel', carrusel: 'carousel' }
const BRIEF_CHANNEL_LABEL = { meta: 'Meta', google: 'Google' }
const DEFAULT_TITLE = 'Nueva creatividad'
const DEFAULT_PROMPT = ''

const PIECE_STATUS = {
  draft: { label: 'Borrador', color: '#25d9ff' },
  pending_approval: { label: 'En revisión', color: '#f2b84b' },
  approved: { label: 'Aprobada', color: '#23d68b' },
  published: { label: 'Publicada', color: '#8b5cf6' },
  rejected: { label: 'Rechazada', color: '#f87171' },
}
const PIECE_FORMAT_LABEL = { post: 'Post', carousel: 'Carrusel', reel_script: 'Guion de Reel', stories: 'Stories', email: 'Email', voiceover: 'Locución' }
const CHANNEL_LABEL = { instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', x: 'X' }
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms))
const isPublicUrl = value => typeof value === 'string' && /^https?:\/\//i.test(value)

async function readJson(response) {
  return response.json().catch(() => null)
}

/** Mensaje accionable de una respuesta fallida: bloqueo de plan o `error` del servidor. */
async function failureMessage(response, fallback) {
  const gate = await readPlanGate(response)
  if (gate) return gate.message
  const body = await readJson(response)
  if (response.status === 402) return `${body?.error || 'Saldo insuficiente para este trabajo.'} Recarga el saldo desde Configuración.`
  return body?.error || fallback
}

function pieceTitle(piece) {
  const body = piece.body && typeof piece.body === 'object' ? piece.body : {}
  if (piece.format === 'carousel') return body.title || 'Carrusel'
  if (piece.format === 'reel_script') return body.hook || 'Guion de Reel'
  const text = typeof body.text === 'string' ? body.text : ''
  return text.split('\n').find(Boolean)?.slice(0, 90) || PIECE_FORMAT_LABEL[piece.format] || 'Pieza'
}

function pieceChannel(piece) {
  const channels = Array.isArray(piece.channels) ? piece.channels.map(channel => CHANNEL_LABEL[channel] ?? channel) : []
  const format = PIECE_FORMAT_LABEL[piece.format] ?? piece.format
  return channels.length ? `${channels.join(', ')} · ${format}` : format
}

function shortDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

// Las URL de la biblioteca son prefirmadas o, en local, una ruta autenticada
// que un <img> no puede pedir con el token: en ese caso se baja como blob.
const assetUrlCache = new Map()
async function resolveAssetUrl(assetId) {
  if (assetUrlCache.has(assetId)) return assetUrlCache.get(assetId)
  const response = await apiFetch(`/api/assets/${assetId}/url`)
  const data = await readJson(response)
  if (!response.ok || !data?.url) throw new Error(data?.error || 'No se pudo leer el activo de la biblioteca.')
  let url = data.url
  if (data.requiresAuth) {
    const content = await apiFetch(data.url)
    if (!content.ok) throw new Error('No se pudo descargar el activo de la biblioteca.')
    url = URL.createObjectURL(await content.blob())
  }
  const resolved = { url, publicUrl: data.requiresAuth ? null : data.url, mimeType: data.mimeType ?? null }
  assetUrlCache.set(assetId, resolved)
  return resolved
}

function PreviewMedia({ format, media, title, brand, orgName }) {
  const isCarousel = format === 'carousel'
  const initial = (orgName || 'V').trim().charAt(0).toUpperCase()
  return (
    <div className={`ccc-preview-stage format-${format}`}>
      {isCarousel ? <div className="ccc-carousel-back" aria-hidden="true" /> : null}
      <div className="ccc-ad-preview">
        {media?.kind === 'video'
          ? <video src={media.url} controls playsInline loop muted aria-label="Vista previa del vídeo generado" />
          : media?.url
            ? <img src={media.url} alt="Vista previa de la creatividad" />
            : <div className="ccc-preview-empty"><RiSparkling2Line /><p>Describe la creatividad y pulsa «Generar», o sube una imagen.</p></div>}
        {media?.url ? <div className="ccc-preview-vignette" /> : null}
        <div className="ccc-preview-content">
          <div className="ccc-preview-brand">
            {brand?.logoUrl ? <img src={brand.logoUrl} alt="" /> : <span style={brand?.primary ? { color: brand.primary, borderColor: brand.primary } : undefined}>{initial}</span>}
            {orgName || 'Tu marca'}
          </div>
          <h2>{title}</h2>
        </div>
        <span className="ccc-preview-format">{media?.kind === 'video' ? 'Vídeo' : isCarousel ? 'Portada' : 'Vista previa'}</span>
      </div>
    </div>
  )
}

function AssetThumb({ asset }) {
  // La copia pública inmutable no necesita URL prefirmada.
  const [url, setUrl] = useState(asset.publishedUrl || assetUrlCache.get(asset.id)?.url || null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (url || failed) return undefined
    let active = true
    resolveAssetUrl(asset.id).then(resolved => { if (active) setUrl(resolved.url) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [asset.id, url, failed])
  if (asset.kind === 'video') return url ? <video src={url} muted playsInline /> : <span className="ccc-thumb-empty"><RiVideoLine /></span>
  return url ? <img src={url} alt="" /> : <span className="ccc-thumb-empty"><RiImageLine /></span>
}

function GenerationRow({ asset, busy, onUse }) {
  // El listado ligero de la biblioteca no incluye el prompt: se identifica por
  // tipo, modelo y fecha, y el detalle completo vive en /activos.
  const label = asset.kind === 'video' ? 'Vídeo generado' : 'Imagen generada'
  return (
    <button type="button" className="ccc-generation-row" disabled={busy} onClick={() => onUse(asset)} title={`${label} · ${asset.model ?? asset.provider ?? 'biblioteca'}`}>
      <span className="ccc-generation-thumb"><AssetThumb asset={asset} /></span>
      <span className="ccc-generation-copy"><strong>{label}</strong><small>{asset.model ?? asset.provider ?? (asset.kind === 'video' ? 'Vídeo' : 'Imagen')}</small></span>
      <span className="ccc-generation-status"><i /><span>{asset.status === 'published' ? 'Publicado' : 'En biblioteca'}</span><small>{shortDate(asset.createdAt)}</small></span>
    </button>
  )
}

function SectionNote({ state, children }) {
  if (state?.status === 'loading') return <p className="ccc-empty-note">Cargando…</p>
  if (state?.status === 'gated' || state?.status === 'error') return <p className="ccc-empty-note is-warn"><RiErrorWarningLine /> {state.message}</p>
  return children
}

function PublicationsView({ pieces, channels, onNotice }) {
  const [filter, setFilter] = useState('all')
  const items = pieces.items.filter(piece => filter === 'all' || piece.status === filter)
  const monthStart = useMemo(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1).getTime() }, [])
  const monthCount = useMemo(() => {
    const counts = {}
    for (const piece of pieces.items) {
      if (new Date(piece.createdAt).getTime() < monthStart) continue
      for (const channel of piece.channels ?? []) counts[channel] = (counts[channel] ?? 0) + 1
    }
    return counts
  }, [pieces.items, monthStart])

  return (
    <section className="ccc-publications-view" aria-labelledby="publications-title">
      <div className="ccc-publications-hero">
        <div>
          <span className="ccc-eyebrow">Contenido en movimiento</span>
          <h1 id="publications-title">Publicaciones</h1>
          <p>Las piezas del estudio de contenido, con su estado real. Las imágenes que generes aquí se adjuntan a cualquiera que esté en borrador o en revisión.</p>
        </div>
        <Link to="/captacion/atraer/organico?tab=fuentes" className="ccc-primary-button"><RiSparkling2Line /> Generar piezas en Redes</Link>
      </div>
      <div className="ccc-publication-toolbar">
        <div className="ccc-filter-tabs">
          {[['all', 'Todas'], ...Object.entries(PIECE_STATUS).map(([key, meta]) => [key, meta.label])].map(([key, label]) => (
            <button type="button" key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <button type="button" className="ccc-secondary-button" onClick={() => onNotice('La programación por fecha se hace desde el planificador de Metricool, en Redes sociales.')}><RiCalendarLine /> Calendario</button>
      </div>
      <div className="ccc-publication-list">
        <SectionNote state={pieces}>
          {items.length === 0
            ? <p className="ccc-empty-note">No hay piezas {filter === 'all' ? 'todavía' : 'en este estado'}. Se generan a partir de las oportunidades detectadas en Redes sociales.</p>
            : items.map(piece => {
              const status = PIECE_STATUS[piece.status] ?? { label: piece.status, color: '#91a2bd' }
              return (
                <article className="ccc-publication-row" key={piece.id}>
                  <span className="ccc-publication-date">{shortDate(piece.createdAt)}</span>
                  {piece.imageUrl ? <img src={piece.imageUrl} alt="" /> : <span className="ccc-piece-thumb-empty" aria-hidden="true"><RiImageLine /></span>}
                  <div className="ccc-publication-copy"><strong>{pieceTitle(piece)}</strong><small>{pieceChannel(piece)}</small></div>
                  <span className="ccc-publication-status" style={{ '--status-color': status.color }}><i />{status.label}</span>
                  <Link to="/captacion/atraer/organico?tab=fuentes" className="ccc-icon-button" aria-label={`Abrir ${pieceTitle(piece)} en Redes sociales`}><RiArrowRightLine /></Link>
                </article>
              )
            })}
        </SectionNote>
      </div>
      <div className="ccc-channel-strip">
        {channels.status === 'ready' && channels.items.length > 0
          ? channels.items.slice(0, 3).map((item, index) => {
            const key = String(item?.platform ?? item?.type ?? item?.provider ?? '').toLowerCase()
            const label = item?.name ?? item?.username ?? CHANNEL_LABEL[key] ?? key ?? 'Canal'
            const count = monthCount[key] ?? 0
            return <div key={item?.id ?? index}><span className={`ccc-channel-icon ${key}`}>{label.charAt(0).toUpperCase()}</span><div><strong>{label}</strong><small>{count === 1 ? '1 pieza este mes' : `${count} piezas este mes`}</small></div></div>
          })
          : <div className="ccc-channel-empty"><SectionNote state={channels}>{channels.status === 'ready' ? 'Sin canales conectados todavía.' : null}</SectionNote></div>}
        <Link to="/captacion/atraer/organico?tab=fuentes" className="ccc-text-link">Gestionar canales <RiArrowRightLine /></Link>
      </div>
    </section>
  )
}

function CccHeader({ activeView, setActiveView, onFocusPrompt, onNotice }) {
  return (
    <header className="ccc-header">
      <div className="ccc-brand"><span className="ccc-brand-mark">C</span><strong>Creative<br />Command Center</strong></div>
      <nav className="ccc-top-nav" aria-label="Secciones del estudio">
        <button type="button" className={activeView === 'studio' ? 'active' : ''} onClick={() => setActiveView('studio')}>Estudio</button>
        <button type="button" className={activeView === 'publications' ? 'active' : ''} onClick={() => setActiveView('publications')}>Publicaciones</button>
        <Link to="/activos">Biblioteca</Link>
      </nav>
      <div className="ccc-header-actions">
        <button type="button" className="ccc-icon-button" aria-label="Ayuda" onClick={() => onNotice('Genera o sube una imagen, ajusta el formato y adjúntala a una pieza de Publicaciones. Los vídeos se procesan como trabajos y aparecen en la biblioteca.')}>?</button>
        <button type="button" className="ccc-header-generate" onClick={() => { setActiveView('studio'); onFocusPrompt() }}><RiSparkling2Line /> Generar</button>
      </div>
    </header>
  )
}

// `brief` y `onDeliver` son opcionales: llegan cuando el estudio se abre desde
// la página de Ads con un brief creativo (?studio=1&brief=). El brief es
// contexto de solo lectura que el estudio consume, no inventa; `onDeliver`
// crea la creatividad en la campaña con el activo generado. Sin ellos, el
// estudio funciona exactamente igual que siempre.
export default function CreativeCommandCenterPage({ onOpenPerformance, brief = null, onDeliver = null }) {
  const { user } = useAuth()
  const orgId = user?.orgId ?? 'default'
  const draftKey = `vendrava.creative-command-center.draft.${orgId}`

  const [activeView, setActiveView] = useState('studio')
  const [activeFormat, setActiveFormat] = useState(() => BRIEF_FORMAT_PRESET[brief?.format] ?? 'reel')
  const [generationType, setGenerationType] = useState(() => BRIEF_TYPE[brief?.format] ?? 'image')
  const [providerId, setProviderId] = useState('')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [editingTitle, setEditingTitle] = useState(false)
  const [media, setMedia] = useState(null)
  const [status, setStatus] = useState('idle')
  const [stage, setStage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [attachingId, setAttachingId] = useState(null)
  const [delivering, setDelivering] = useState(false)
  const [draftState, setDraftState] = useState('clean')
  const [capabilities, setCapabilities] = useState({ status: 'loading', image: [], video: [], message: '' })
  const [assets, setAssets] = useState({ status: 'loading', items: [], message: '' })
  const [pieces, setPieces] = useState({ status: 'loading', items: [], message: '' })
  const [channels, setChannels] = useState({ status: 'loading', items: [], message: '' })
  const [brand, setBrand] = useState(null)
  const [orgName, setOrgName] = useState('')

  const noticeTimer = useRef(null)
  const unmounted = useRef(false)
  const promptRef = useRef(null)
  const fileInputRef = useRef(null)

  const currentFormat = useMemo(() => FORMAT_PRESETS.find(item => item.id === activeFormat) ?? FORMAT_PRESETS[0], [activeFormat])
  const providers = generationType === 'video' ? capabilities.video : capabilities.image
  const currentProvider = providers.find(item => item.providerId === providerId) ?? providers[0] ?? null
  const running = status === 'running'
  const videoUnavailable = generationType === 'video' && capabilities.status !== 'loading' && !capabilities.video.length
  const pendingApprovals = pieces.items.filter(piece => piece.status === 'pending_approval').length
  const attachable = pieces.items.filter(piece => piece.status === 'draft' || piece.status === 'pending_approval')
  const canAttach = media?.kind === 'image' && isPublicUrl(media.publicUrl ?? media.url)

  const announce = useCallback(message => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3600)
  }, [])

  // StrictMode monta, desmonta y vuelve a montar en desarrollo: el flag se
  // rearma en cada montaje o el segundo quedaría marcado como desmontado.
  useEffect(() => {
    unmounted.current = false
    return () => { unmounted.current = true; window.clearTimeout(noticeTimer.current) }
  }, [])

  // Borrador local por organización: prompt, título, formato y el activo en
  // pantalla (por id, para volver a pedir su URL si era temporal).
  useEffect(() => {
    let active = true
    try {
      const raw = window.localStorage.getItem(draftKey)
      if (!raw) return undefined
      const draft = JSON.parse(raw)
      if (draft.prompt) setPrompt(draft.prompt)
      if (draft.title) setTitle(draft.title)
      if (FORMAT_PRESETS.some(item => item.id === draft.activeFormat)) setActiveFormat(draft.activeFormat)
      if (draft.generationType) setGenerationType(draft.generationType)
      if (draft.media?.kind) {
        if (isPublicUrl(draft.media.url)) setMedia(draft.media)
        else if (draft.media.assetId) {
          resolveAssetUrl(draft.media.assetId)
            .then(resolved => { if (active) setMedia({ ...draft.media, url: resolved.url, publicUrl: resolved.publicUrl }) })
            .catch(() => {})
        }
      }
      setDraftState('saved')
    } catch { /* borrador local corrupto: se ignora */ }
    return () => { active = false }
  }, [draftKey])

  // Con brief: si el prompt sigue vacío tras cargar el borrador local, se
  // compone uno útil con promesa/oferta/CTA del brief. Se declara DESPUÉS del
  // efecto del borrador y usa actualización funcional: lo escrito antes gana.
  useEffect(() => {
    if (!brief) return
    const message = brief.message && typeof brief.message === 'object' ? brief.message : {}
    const parts = [message.promesa, message.oferta, brief.cta ? `CTA: ${brief.cta}` : null].filter(Boolean)
    if (!parts.length) return
    const composed = `${parts.join('. ')}.`
    setPrompt(current => (current.trim() ? current : composed))
  }, [brief])

  // El brief puede llegar DESPUÉS del montaje (deep link con el plan aún
  // cargando): los inicializadores de useState ya no lo verían y un brief de
  // vídeo abriría el estudio en modo imagen. Se aplica el preset solo si el
  // usuario no ha tocado nada (ni escrito, ni cargado un borrador local).
  useEffect(() => {
    if (!brief?.format || draftState !== 'clean') return
    if (BRIEF_TYPE[brief.format]) setGenerationType(BRIEF_TYPE[brief.format])
    if (BRIEF_FORMAT_PRESET[brief.format]) setActiveFormat(BRIEF_FORMAT_PRESET[brief.format])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief])

  const loadAssets = useCallback(async () => {
    try {
      const response = await apiFetch('/api/assets?limit=12')
      if (!response.ok) { setAssets({ status: response.status === 403 ? 'gated' : 'error', items: [], message: await failureMessage(response, 'No se pudo leer la biblioteca.') }); return }
      const data = await readJson(response)
      const items = (data?.items ?? []).filter(item => item.kind === 'image' || item.kind === 'video')
      setAssets({ status: 'ready', items, message: '' })
    } catch {
      setAssets({ status: 'error', items: [], message: 'No se pudo leer la biblioteca.' })
    }
  }, [])

  const loadPieces = useCallback(async () => {
    try {
      const response = await apiFetch('/api/content/pieces')
      if (!response.ok) { setPieces({ status: response.status === 403 ? 'gated' : 'error', items: [], message: await failureMessage(response, 'No se pudieron leer las piezas.') }); return }
      const data = await readJson(response)
      setPieces({ status: 'ready', items: Array.isArray(data?.items) ? data.items : [], message: '' })
    } catch {
      setPieces({ status: 'error', items: [], message: 'No se pudieron leer las piezas.' })
    }
  }, [])

  useEffect(() => {
    let active = true
    const guard = setter => value => { if (active) setter(value) }

    apiFetch('/api/capabilities').then(async response => {
      if (!response.ok) { guard(setCapabilities)({ status: response.status === 403 ? 'gated' : 'error', image: [], video: [], message: await failureMessage(response, 'No se pudo leer el catálogo de proveedores.') }); return }
      const data = await readJson(response)
      const next = { status: 'ready', image: [], video: [], message: '' }
      for (const entry of data?.capabilities ?? []) {
        if (entry.capability === 'image.generate') next.image = entry.providers ?? []
        if (entry.capability === 'video.generate') next.video = entry.providers ?? []
      }
      guard(setCapabilities)(next)
    }).catch(() => guard(setCapabilities)({ status: 'error', image: [], video: [], message: 'No se pudo leer el catálogo de proveedores.' }))

    apiFetch('/api/metricool').then(async response => {
      if (!response.ok) { guard(setChannels)({ status: response.status === 403 ? 'gated' : 'error', items: [], message: await failureMessage(response, 'No se pudo consultar Redes sociales.') }); return }
      const data = await readJson(response)
      guard(setChannels)({ status: 'ready', items: Array.isArray(data?.integrations) ? data.integrations : [], message: '' })
    }).catch(() => guard(setChannels)({ status: 'error', items: [], message: 'No se pudo consultar Redes sociales.' }))

    apiFetch('/api/content/brand').then(async response => {
      if (!response.ok) return
      const data = await readJson(response)
      guard(setBrand)(data?.brand ?? null)
    }).catch(() => {})

    apiFetch('/api/auth/organizations').then(async response => {
      if (!response.ok) return
      const data = await readJson(response)
      const current = (data?.organizations ?? []).find(item => item.id === user?.orgId)
      if (current?.name) guard(setOrgName)(current.name)
    }).catch(() => {})

    loadAssets()
    loadPieces()
    return () => { active = false }
  }, [loadAssets, loadPieces, user?.orgId])

  useEffect(() => {
    if (!providers.length) { setProviderId(''); return }
    if (!providers.some(item => item.providerId === providerId)) setProviderId(providers[0].providerId)
  }, [providers, providerId])

  function markDirty() { setDraftState('dirty') }

  function changeType(nextType) {
    setGenerationType(nextType)
    markDirty()
    if (nextType === 'video' && !VIDEO_RATIOS.has(currentFormat.ratio)) setActiveFormat('reel')
    if (nextType === 'carousel') setActiveFormat('carousel')
  }

  function chooseRatio(ratio) {
    if (generationType === 'video' && !VIDEO_RATIOS.has(ratio)) return
    if (currentFormat.ratio === ratio) return
    const preset = FORMAT_PRESETS.find(item => item.ratio === ratio && (generationType !== 'carousel' || item.id === 'carousel')) ?? FORMAT_PRESETS.find(item => item.ratio === ratio)
    if (preset) { setActiveFormat(preset.id); markDirty() }
  }

  function chooseFormat(id) {
    const preset = FORMAT_PRESETS.find(item => item.id === id)
    if (!preset) return
    if (generationType === 'video' && !VIDEO_RATIOS.has(preset.ratio)) { announce('El proveedor de vídeo solo admite 9:16, 16:9 y 1:1.'); return }
    setActiveFormat(id)
    markDirty()
  }

  function cycleFormat() {
    const index = FORMAT_PRESETS.findIndex(item => item.id === activeFormat)
    chooseFormat(FORMAT_PRESETS[(index + 1) % FORMAT_PRESETS.length].id)
  }

  function saveDraft() {
    const payload = { prompt, title, activeFormat, generationType, media: media ? { kind: media.kind, url: media.publicUrl ?? media.url, publicUrl: media.publicUrl ?? null, assetId: media.assetId ?? null } : null }
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(payload))
      setDraftState('saved')
      announce('Borrador guardado en este navegador.')
    } catch {
      announce('No se pudo guardar el borrador en este navegador.')
    }
  }

  function resetCreative() {
    setMedia(null)
    setTitle(DEFAULT_TITLE)
    setPrompt(DEFAULT_PROMPT)
    setActiveFormat('reel')
    setGenerationType('image')
    setStatus('idle')
    setStage('')
    setErrorMessage('')
    setDraftState('dirty')
    announce('Creatividad reiniciada.')
  }

  function orientationHint(ratio) {
    if (ratio === '1:1') return 'Encuadre cuadrado'
    if (ratio === '16:9') return 'Encuadre horizontal apaisado'
    return 'Encuadre vertical'
  }

  async function generateImage(text) {
    const response = await apiFetch('/api/metricool/ai/image', { method: 'POST', body: JSON.stringify({ prompt: `${text}. ${orientationHint(currentFormat.ratio)}.` }) })
    if (!response.ok) throw new Error(await failureMessage(response, 'No se pudo generar la imagen.'))
    const data = await readJson(response)
    if (!data?.imageUrl) throw new Error('El servidor no devolvió ninguna imagen.')
    return { kind: 'image', url: data.imageUrl, publicUrl: data.imageUrl, assetId: data.assetId ?? null, source: 'ia' }
  }

  async function waitForJob(jobId) {
    const startedAt = Date.now()
    while (!unmounted.current) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      if (elapsed > 10 * 60) throw new Error('El vídeo sigue procesándose. Cuando termine aparecerá en la biblioteca; puedes seguirlo en Trabajos.')
      const response = await apiFetch(`/api/jobs/${jobId}`)
      if (!response.ok) throw new Error(await failureMessage(response, 'No se pudo consultar el trabajo de vídeo.'))
      const job = await readJson(response)
      if (job?.status === 'succeeded') return job
      if (job?.status === 'failed' || job?.status === 'canceled') throw new Error(job?.error?.message || 'El proveedor no pudo generar el vídeo.')
      setStage(job?.status === 'awaiting_approval'
        ? 'El trabajo espera la aprobación de coste en Trabajos.'
        : job?.status === 'waiting_provider' || job?.status === 'running'
          ? `Renderizando en el proveedor · ${elapsed}s`
          : `En cola · ${elapsed}s`)
      await sleep(5000)
    }
    throw new Error('Generación interrumpida.')
  }

  async function generateVideo(text) {
    const aspectRatio = VIDEO_RATIOS.has(currentFormat.ratio) ? currentFormat.ratio : '9:16'
    setStage('Enviando el trabajo al proveedor…')
    const response = await apiFetch('/api/capabilities/run', {
      method: 'POST',
      body: JSON.stringify({ capability: 'video.generate', input: { prompt: text, aspectRatio, durationS: 5 }, ...(currentProvider ? { preferences: { providerId: currentProvider.providerId } } : {}) }),
    })
    if (!response.ok) throw new Error(await failureMessage(response, 'No se pudo encolar el vídeo.'))
    const data = await readJson(response)
    if (!data?.jobId) throw new Error('El servidor no devolvió el identificador del trabajo.')
    const job = await waitForJob(data.jobId)
    const assetId = job?.output?.assetIds?.[0]
    if (!assetId) throw new Error('El trabajo terminó sin activo de vídeo.')
    const resolved = await resolveAssetUrl(assetId)
    return { kind: 'video', url: resolved.url, publicUrl: resolved.publicUrl, assetId, source: 'ia', jobId: data.jobId }
  }

  async function generate() {
    const text = prompt.trim()
    if (text.length < 3) { announce('Describe la creatividad con al menos tres caracteres.'); promptRef.current?.focus(); return }
    if (videoUnavailable) { setShowSettings(true); return }
    setStatus('running')
    setErrorMessage('')
    setStage(generationType === 'video' ? 'Preparando el trabajo…' : 'Generando la imagen…')
    try {
      const result = generationType === 'video' ? await generateVideo(text) : await generateImage(text)
      if (unmounted.current) return
      setMedia(result)
      setStatus('ready')
      setStage('')
      markDirty()
      loadAssets()
      announce(result.kind === 'video' ? 'Vídeo generado y guardado en la biblioteca.' : 'Imagen generada y guardada en la biblioteca.')
    } catch (error) {
      if (unmounted.current) return
      setStatus('error')
      setStage('')
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo generar la creatividad.')
    }
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { announce('Sube una imagen PNG, JPEG o WebP.'); return }
    setStatus('running')
    setStage('Subiendo la imagen…')
    setErrorMessage('')
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
        reader.readAsDataURL(file)
      })
      const response = await apiFetch('/api/metricool/media', { method: 'POST', body: JSON.stringify({ data }) })
      if (!response.ok) throw new Error(await failureMessage(response, 'No se pudo subir la imagen.'))
      const payload = await readJson(response)
      if (!payload?.imageUrl) throw new Error('El servidor no devolvió la URL de la imagen.')
      if (unmounted.current) return
      setMedia({ kind: 'image', url: payload.imageUrl, publicUrl: payload.imageUrl, assetId: payload.assetId ?? null, source: 'upload' })
      setGenerationType(current => (current === 'video' ? 'image' : current))
      setStatus('ready')
      setStage('')
      markDirty()
      announce('Imagen subida y lista para usar.')
    } catch (error) {
      if (unmounted.current) return
      setStatus('error')
      setStage('')
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo subir la imagen.')
    }
  }

  async function useAsset(asset) {
    try {
      const resolved = asset.publishedUrl ? { url: asset.publishedUrl, publicUrl: asset.publishedUrl } : await resolveAssetUrl(asset.id)
      if (unmounted.current) return
      setMedia({ kind: asset.kind, url: resolved.url, publicUrl: resolved.publicUrl, assetId: asset.id, source: 'library' })
      setGenerationType(asset.kind === 'video' ? 'video' : 'image')
      if (asset.kind === 'video' && !VIDEO_RATIOS.has(currentFormat.ratio)) setActiveFormat('reel')
      setStatus('ready')
      setErrorMessage('')
      markDirty()
      announce('Activo de la biblioteca cargado en la vista previa.')
    } catch (error) {
      announce(error instanceof Error ? error.message : 'No se pudo cargar el activo.')
    }
  }

  async function downloadCreative() {
    if (!media?.url) { announce('Todavía no hay ninguna creatividad que descargar.'); return }
    const extension = media.kind === 'video' ? 'mp4' : (media.url.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1] ?? 'png')
    try {
      const response = media.url.startsWith('/api/') ? await apiFetch(media.url) : await fetch(media.url, { mode: 'cors' })
      if (!response.ok) throw new Error('descarga')
      const objectUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `vendrava-creatividad.${extension}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
      announce('Descarga iniciada.')
    } catch {
      // Sin CORS el navegador no deja leer el binario: se abre en otra pestaña.
      window.open(media.url, '_blank', 'noopener')
    }
  }

  async function attachToPiece(piece) {
    if (!canAttach) return
    setAttachingId(piece.id)
    try {
      const response = await apiFetch(`/api/content/pieces/${piece.id}/image`, { method: 'PUT', body: JSON.stringify({ imageUrl: media.publicUrl ?? media.url }) })
      if (!response.ok) throw new Error(await failureMessage(response, 'No se pudo adjuntar la imagen a la pieza.'))
      if (unmounted.current) return
      setShowAttach(false)
      await loadPieces()
      announce(`Imagen adjuntada a «${pieceTitle(piece)}».`)
    } catch (error) {
      announce(error instanceof Error ? error.message : 'No se pudo adjuntar la imagen.')
    } finally {
      if (!unmounted.current) setAttachingId(null)
    }
  }

  // Entrega la pieza a la campaña de Ads: crea la creatividad vinculada al
  // brief (lo hace el padre vía onDeliver) y NO cierra el estudio, porque lo
  // normal es seguir generando variantes del mismo brief.
  async function deliverToCampaign() {
    if (!onDeliver || delivering) return
    if (!media?.assetId) { announce('Entrega solo piezas con activo en la biblioteca: genera la creatividad aquí o cárgala desde la biblioteca.'); return }
    setDelivering(true)
    try {
      const delivered = await onDeliver({
        assetId: media.assetId,
        format: brief?.format ?? (generationType === 'video' ? 'video' : 'imagen'),
        headline: title || null,
        primaryText: null,
      })
      if (!unmounted.current && delivered) announce('Creatividad entregada — revísala en Ads.')
    } finally {
      if (!unmounted.current) setDelivering(false)
    }
  }

  function openAttach() {
    if (!media) { announce('Genera o sube una imagen antes de enviarla a Publicaciones.'); return }
    if (media.kind === 'video') { announce('Las piezas de contenido llevan imagen; el vídeo queda en la biblioteca y en Trabajos.'); return }
    if (!canAttach) { announce('Esta imagen no tiene URL pública; vuelve a generarla o súbela para poder adjuntarla.'); return }
    setShowAttach(true)
  }

  const providerState = (() => {
    if (capabilities.status === 'loading') return { tone: 'is-pending', label: 'Consultando proveedores…' }
    if (generationType === 'video') {
      if (capabilities.video.length) return { tone: 'is-ready', label: `${capabilities.video.map(item => item.displayName).join(', ')} disponible` }
      return { tone: 'is-error', label: capabilities.message || 'Sin proveedor de vídeo configurado' }
    }
    if (capabilities.image.length) return { tone: 'is-ready', label: `${capabilities.image[0].displayName} disponible` }
    return { tone: 'is-pending', label: capabilities.message || 'Se comprobará la configuración al generar' }
  })()

  const header = <CccHeader activeView={activeView} setActiveView={setActiveView} onFocusPrompt={() => window.setTimeout(() => promptRef.current?.focus(), 0)} onNotice={announce} />
  const toast = notice ? <div className="ccc-toast" role="status">{notice}</div> : null

  if (activeView === 'publications') {
    return (
      <main className="dark-scroll ccc-page">
        <div className="ccc-shell">{header}</div>
        <PublicationsView pieces={pieces} channels={channels} onNotice={announce} />
        {toast}
      </main>
    )
  }

  return (
    <main className="dark-scroll ccc-page">
      <div className="ccc-shell">
        {header}
        <div className="ccc-layout">
          <aside className="ccc-left-rail">
            <div className="ccc-rail-section-title">ESTUDIO</div>
            <button type="button" className="ccc-rail-item active"><RiSparkling2Line /> Crear</button>
            <button type="button" className="ccc-rail-item" onClick={onOpenPerformance}><RiBarChartBoxLine /> Campañas</button>
            <button type="button" className="ccc-rail-item" onClick={() => setActiveView('publications')}><RiCalendarLine /> Publicaciones</button>
            <Link to="/captacion/atraer/organico?tab=fuentes" className="ccc-rail-item"><RiCheckLine /> Aprobaciones {pendingApprovals > 0 ? <span className="ccc-rail-count">{pendingApprovals}</span> : null}</Link>
            <button type="button" className="ccc-rail-item" onClick={onOpenPerformance}><RiBarChartBoxLine /> Rendimiento</button>
            <div className="ccc-rail-divider" />
            <div className="ccc-rail-section-title">RECURSOS</div>
            <Link to="/activos" className="ccc-rail-item"><RiBookShelfLine /> Biblioteca</Link>
            <Link to="/trabajos" className="ccc-rail-item"><RiTimeLine /> Trabajos</Link>
            <Link to="/captacion/atraer/organico?tab=fuentes" className="ccc-rail-item"><RiSettings4Line /> Marca</Link>
            <Link to="/configuracion" className="ccc-rail-item"><RiPlugLine /> Integraciones</Link>
            <div className="ccc-workspace-card"><span className="ccc-workspace-avatar">{(orgName || 'V').charAt(0).toUpperCase()}</span><div><strong>{orgName || 'Tu organización'}</strong><small>{user?.email ?? 'Estudio creativo'}</small></div></div>
          </aside>

          <section className="ccc-editor" aria-label="Editor creativo">
            <div className="ccc-editor-toolbar">
              <button type="button" className="ccc-back-button" aria-label="Volver a Publicidad" onClick={onOpenPerformance}><RiArrowLeftLine /></button>
              <div className="ccc-document-title">
                {editingTitle
                  ? <input value={title} onChange={event => { setTitle(event.target.value); markDirty() }} onKeyDown={event => event.key === 'Enter' && setEditingTitle(false)} onBlur={() => setEditingTitle(false)} autoFocus aria-label="Nombre de la creatividad" />
                  : <><span>{title}</span><small>· {currentFormat.label}</small><button type="button" aria-label="Editar nombre" onClick={() => setEditingTitle(true)}><RiFileCopyLine /></button></>}
              </div>
              <div className="ccc-toolbar-actions">
                <button type="button" aria-label="Reiniciar creatividad" title="Reiniciar" onClick={resetCreative}><RiRefreshLine /></button>
                <button type="button" aria-label="Subir imagen" title="Subir imagen" disabled={running} onClick={() => fileInputRef.current?.click()}><RiUpload2Line /></button>
                <button type="button" aria-label="Descargar" title="Descargar" disabled={!media} onClick={downloadCreative}><RiDownload2Line /></button>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="ccc-upload-input" onChange={uploadFile} aria-hidden="true" tabIndex={-1} />
              </div>
            </div>
            {brief ? (
              // Contexto bloqueado del brief: el estudio lo consume tal cual,
              // no lo edita ni lo inventa. La creatividad se entrega a esta
              // campaña desde la barra inferior.
              <div className="ccc-brief-strip" aria-label="Contexto del brief creativo">
                <span className="ccc-brief-eyebrow"><RiMegaphoneLine /> Brief de campaña</span>
                <dl>
                  <div><dt>Campaña</dt><dd>{brief.campaignName || 'Sin nombre'}</dd></div>
                  <div><dt>Audiencia</dt><dd>{brief.audienceName || 'Sin audiencia'}</dd></div>
                  <div><dt>Canal</dt><dd>{BRIEF_CHANNEL_LABEL[brief.channel] ?? brief.channel ?? 'Sin canal'}</dd></div>
                  <div><dt>CTA</dt><dd>{brief.cta || 'Sin CTA'}</dd></div>
                  <div><dt>Destino</dt><dd>{brief.destination || 'Sin destino'}</dd></div>
                  {brief.restrictions ? <div className="is-wide"><dt>Restricciones</dt><dd>{brief.restrictions}</dd></div> : null}
                </dl>
              </div>
            ) : null}
            <div className="ccc-canvas">
              <PreviewMedia format={activeFormat} media={media} title={title} brand={brand} orgName={orgName} />
              <div className="ccc-canvas-tip">
                <span><i className={media ? '' : 'is-idle'} /> {running ? stage || 'Trabajando…' : media ? (media.source === 'upload' ? 'Imagen subida' : media.source === 'library' ? 'Desde la biblioteca' : media.kind === 'video' ? 'Vídeo generado' : 'Imagen generada') : 'Sin creatividad todavía'}</span>
                <span>{currentFormat.ratio}{media?.kind === 'video' ? ' · 5 s' : ''}</span>
              </div>
            </div>
            <div className="ccc-format-tray">
              <div className="ccc-tray-copy"><strong>Formatos rápidos</strong><small>El formato define el encuadre de la vista previa y la relación del vídeo.</small></div>
              <div className="ccc-format-list">
                {FORMAT_PRESETS.map(item => {
                  const Icon = item.icon
                  const blocked = generationType === 'video' && !VIDEO_RATIOS.has(item.ratio)
                  return <button type="button" key={item.id} className={`ccc-format-card ${activeFormat === item.id ? 'active' : ''}`} disabled={blocked} title={blocked ? 'No disponible para vídeo' : undefined} onClick={() => chooseFormat(item.id)}><span><Icon /></span><strong>{item.label}</strong><small>{item.description}</small></button>
                })}
              </div>
              <button type="button" className="ccc-tray-next" aria-label="Siguiente formato" onClick={cycleFormat}><RiArrowRightLine /></button>
            </div>
          </section>

          <aside className="ccc-inspector">
            <div className="ccc-inspector-heading">
              <div><h2><RiSparkling2Line /> Generar con IA</h2><span className={`ccc-provider-state ${providerState.tone}`}><i /> {providerState.label}</span></div>
              <button type="button" onClick={() => setShowSettings(true)} aria-label="Ver proveedores"><RiSettings4Line /></button>
            </div>
            <span className="ccc-field-label">Proveedor</span>
            <button type="button" className="ccc-select-button" onClick={() => setShowSettings(true)}>
              <span className="ccc-provider-mark">{(currentProvider?.displayName ?? 'IA').charAt(0).toUpperCase()}</span>
              <strong>{currentProvider?.displayName ?? (generationType === 'video' ? 'Sin proveedor de vídeo' : 'OpenAI Imágenes')}</strong>
              <span className="ccc-select-spacer" />
              <span className={`ccc-configured ${providerState.tone}`}>{providerState.tone === 'is-ready' ? 'Listo' : providerState.tone === 'is-error' ? 'No disponible' : 'Pendiente'}</span>
              <RiArrowDownSLine />
            </button>
            <label className="ccc-field-label" htmlFor="ccc-model">Modelo</label>
            <div className="ccc-select-wrap">
              <select id="ccc-model" value={currentProvider?.providerId ?? ''} disabled={!providers.length} onChange={event => setProviderId(event.target.value)}>
                {providers.length ? providers.map(item => <option key={item.providerId} value={item.providerId}>{item.displayName}{item.qualityTier ? ` · ${item.qualityTier}` : ''}</option>) : <option value="">{generationType === 'video' ? 'Sin proveedor configurado' : 'gpt-image-1'}</option>}
              </select>
              <RiArrowDownSLine />
            </div>
            <label className="ccc-field-label" htmlFor="ccc-prompt">¿Qué quieres generar?</label>
            <div className="ccc-prompt-wrap"><textarea id="ccc-prompt" ref={promptRef} maxLength={1000} value={prompt} placeholder="Describe la escena, el tono y lo que debe transmitir. Sin texto sobreimpreso: el titular se añade en la pieza." onChange={event => { setPrompt(event.target.value); markDirty() }} /><span>{prompt.length}/1000</span></div>
            <div className="ccc-type-tabs" role="tablist" aria-label="Tipo de generación">
              {TYPE_TABS.map(([id, Icon, label]) => <button type="button" role="tab" aria-selected={generationType === id} key={id} className={generationType === id ? 'active' : ''} onClick={() => changeType(id)}><Icon /> {label}</button>)}
            </div>
            <span className="ccc-field-label">Relación de aspecto</span>
            <div className="ccc-ratio-grid">
              {RATIOS.map(ratio => {
                const blocked = generationType === 'video' && !VIDEO_RATIOS.has(ratio)
                return <button type="button" key={ratio} className={currentFormat.ratio === ratio ? 'active' : ''} disabled={blocked} title={blocked ? 'No disponible para vídeo' : undefined} onClick={() => chooseRatio(ratio)}><span className={`ccc-ratio-icon ratio-${ratio.replace(':', '-')}`} />{ratio}</button>
              })}
            </div>
            {generationType !== 'video' ? <p className="ccc-stage-note">La imagen se genera en el lienzo estándar del proveedor; la vista previa aplica el recorte del formato.</p> : null}
            {generationType === 'carousel' ? <p className="ccc-stage-note">Aquí se genera la portada. Las slides del carrusel se componen con la plantilla de marca en Redes sociales.</p> : null}
            <button type="button" className={`ccc-generate-button ${running ? 'running' : ''}`} onClick={generate} disabled={running}><RiSparkling2Line /> {running ? stage || 'Generando…' : generationType === 'video' ? 'Generar vídeo' : 'Generar imagen'} <RiArrowRightLine /></button>
            {status === 'error' && errorMessage ? <div className="ccc-error-box" role="alert"><RiErrorWarningLine /><div><p>{errorMessage}</p><Link to="/configuracion">Revisar configuración <RiArrowRightLine /></Link></div></div> : null}
            <div className="ccc-recent-heading"><strong>Generaciones recientes</strong><Link to="/activos" className="ccc-text-link">Ver biblioteca</Link></div>
            <div className="ccc-generations">
              <SectionNote state={assets}>
                {assets.items.length === 0
                  ? <p className="ccc-empty-note">Todavía no hay imágenes ni vídeos en la biblioteca.</p>
                  : assets.items.slice(0, 4).map(asset => <GenerationRow key={asset.id} asset={asset} busy={running} onUse={useAsset} />)}
              </SectionNote>
            </div>
          </aside>
        </div>
        <footer className="ccc-bottom-bar">
          <span className={draftState === 'saved' ? 'is-saved' : draftState === 'dirty' ? 'is-dirty' : ''}><RiCheckLine /> {draftState === 'saved' ? 'Borrador guardado' : draftState === 'dirty' ? 'Cambios sin guardar' : 'Sin cambios'}</span>
          <small>El borrador se guarda en este navegador; los activos generados, en la biblioteca.</small>
          <div>
            <button type="button" className="ccc-secondary-button" onClick={saveDraft}><RiSave3Line /> Guardar borrador</button>
            {/* Con entrega a campaña disponible, esa es la acción primaria. */}
            <button type="button" className={onDeliver ? 'ccc-secondary-button' : 'ccc-primary-button'} onClick={openAttach}><RiSendPlaneLine /> Enviar a Publicaciones</button>
            {onDeliver ? <button type="button" className="ccc-primary-button" disabled={delivering || !media?.assetId} title={!media?.assetId ? 'Necesita un activo de la biblioteca: genera la pieza aquí o cárgala desde «Generaciones recientes».' : undefined} onClick={deliverToCampaign}><RiMegaphoneLine /> {delivering ? 'Entregando…' : 'Entregar a la campaña'}</button> : null}
          </div>
        </footer>
        {toast}
        {showSettings ? (
          <div className="ccc-modal-backdrop" role="presentation" onClick={() => setShowSettings(false)}>
            <div className="ccc-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ccc-settings-title" onClick={event => event.stopPropagation()}>
              <button type="button" className="ccc-modal-close" onClick={() => setShowSettings(false)} aria-label="Cerrar"><RiCloseLine /></button>
              <span className="ccc-modal-icon"><RiSettings4Line /></span>
              <h2 id="ccc-settings-title">Proveedores creativos</h2>
              <p>Las claves se guardan en Configuración → Integraciones. Aquí solo se elige con cuál generar; el coste se registra en cada trabajo.</p>
              <SectionNote state={capabilities}>
                {[['Imagen', capabilities.image], ['Vídeo', capabilities.video]].map(([label, list]) => (
                  <div className="ccc-connection-row" key={label}>
                    <span className="ccc-provider-mark">{label.charAt(0)}</span>
                    <div><strong>{label}</strong><small>{list.length ? list.map(item => item.displayName).join(' · ') : 'Sin proveedor configurado'}</small></div>
                    <span className={`ccc-pending-badge ${list.length ? 'is-ready' : ''}`}>{list.length ? 'Listo' : 'Pendiente'}</span>
                  </div>
                ))}
              </SectionNote>
              <Link to="/configuracion" className="ccc-primary-button" onClick={() => setShowSettings(false)}>Ir a configuración <RiArrowRightLine /></Link>
            </div>
          </div>
        ) : null}
        {showAttach ? (
          <div className="ccc-modal-backdrop" role="presentation" onClick={() => setShowAttach(false)}>
            <div className="ccc-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ccc-attach-title" onClick={event => event.stopPropagation()}>
              <button type="button" className="ccc-modal-close" onClick={() => setShowAttach(false)} aria-label="Cerrar"><RiCloseLine /></button>
              <span className="ccc-modal-icon"><RiSendPlaneLine /></span>
              <h2 id="ccc-attach-title">Adjuntar a una pieza</h2>
              <p>La imagen se fija en la pieza y viaja con ella al borrador de cada canal. Solo se pueden tocar piezas en borrador o en revisión.</p>
              <div className="ccc-attach-list">
                <SectionNote state={pieces}>
                  {attachable.length === 0
                    ? <p className="ccc-empty-note">No hay piezas editables. Genera piezas desde las oportunidades en <Link to="/captacion/atraer/organico?tab=fuentes">Redes sociales</Link>.</p>
                    : attachable.map(piece => (
                      <button type="button" key={piece.id} className="ccc-attach-row" disabled={attachingId !== null} onClick={() => attachToPiece(piece)}>
                        {piece.imageUrl ? <img src={piece.imageUrl} alt="" /> : <span className="ccc-piece-thumb-empty" aria-hidden="true"><RiImageLine /></span>}
                        <span className="ccc-publication-copy"><strong>{pieceTitle(piece)}</strong><small>{pieceChannel(piece)} · {PIECE_STATUS[piece.status]?.label ?? piece.status}{piece.imageUrl ? ' · se reemplazará la imagen' : ''}</small></span>
                        <span className="ccc-attach-action">{attachingId === piece.id ? 'Adjuntando…' : 'Adjuntar'}</span>
                      </button>
                    ))}
                </SectionNote>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
