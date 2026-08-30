import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  RiAddLine, RiAlertLine, RiArrowLeftLine, RiArrowRightSLine, RiBook2Line,
  RiCheckboxCircleLine, RiClapperboardLine, RiCloseLine, RiDownload2Line,
  RiErrorWarningLine, RiEyeLine, RiFileCopyLine, RiFileTextLine,
  RiFolderImageLine, RiGalleryLine, RiLightbulbFlashLine, RiLoader4Line,
  RiMovie2Line, RiPlayListAddLine, RiRefreshLine, RiScissorsCutLine,
  RiSearchLine, RiSendPlaneLine, RiSparkling2Line, RiTimeLine,
  RiUploadCloud2Line, RiVideoLine, RiWallet3Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { getEffectiveNavigationPermissions } from '../lib/navigationPermissions'
import { getLocale, localeCode } from '../i18n'
import { STUDIO_HERO } from '../lib/microappArt'
import { AssetMedia, MediaLightbox } from '../components/studio/StudioMedia'
import { AssetMultiPicker, AssetPicker } from '../components/studio/AssetPicker'
import PageLoadingState from '../components/ui/PageLoadingState'
import './studio.css'

/**
 * Studio de Cine. La pantalla era una pila de nueve paneles de formulario: no
 * enseñaba ni una imagen ni un vídeo de lo que ella misma genera, los activos se
 * referenciaban escribiendo cuids a mano, el dinero se pedía en céntimos enteros
 * y nada se refrescaba solo pese a que casi todo el trabajo es asíncrono. Pasa a
 * ser un espacio de trabajo: línea de fases, siguiente paso calculado, pestañas,
 * caja de luz, reproductor de tomas y refresco vivo mientras hay jobs en curso.
 */

export const PHASE_META = {
  brief: { label: 'Brief', color: 'var(--muted)', icon: RiLightbulbFlashLine },
  concepts: { label: 'Conceptos', color: 'var(--violet)', icon: RiSparkling2Line },
  script: { label: 'Guion', color: 'var(--info)', icon: RiMovie2Line },
  storyboard: { label: 'Storyboard', color: 'var(--cyan)', icon: RiGalleryLine },
  shooting: { label: 'Rodaje', color: 'var(--warn)', icon: RiVideoLine },
  post: { label: 'Post', color: 'var(--pink)', icon: RiScissorsCutLine },
  review: { label: 'Revisión', color: 'var(--accent)', icon: RiEyeLine },
  delivered: { label: 'Entregada', color: 'var(--success)', icon: RiCheckboxCircleLine },
}

// Orden canónico de Production.status (backend/prisma/schema.prisma).
const PHASE_ORDER = ['brief', 'concepts', 'script', 'storyboard', 'shooting', 'post', 'review', 'delivered']

const TABS = [
  { id: 'brief', label: 'Brief y biblia', icon: RiBook2Line },
  { id: 'concepts', label: 'Conceptos', icon: RiSparkling2Line },
  { id: 'script', label: 'Guion', icon: RiMovie2Line },
  { id: 'storyboard', label: 'Storyboard', icon: RiGalleryLine },
  { id: 'takes', label: 'Tomas', icon: RiVideoLine },
  { id: 'post', label: 'Montaje', icon: RiScissorsCutLine },
  { id: 'review', label: 'Revisión', icon: RiEyeLine },
  { id: 'publish', label: 'Publicar', icon: RiSendPlaneLine },
]

// Fase de la producción -> pestaña donde se trabaja esa fase.
const PHASE_TAB = {
  brief: 'brief', concepts: 'concepts', script: 'script', storyboard: 'storyboard',
  shooting: 'takes', post: 'post', review: 'review', delivered: 'publish',
}

const CHANNEL_OPTIONS = [
  { value: 'reels', label: 'Reels (Instagram)' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'ads', label: 'Ads (anuncio de pago)' },
]
const DURATION_OPTIONS = [6, 15, 30, 60]
const BIBLE_KINDS = [
  { value: 'character', label: 'Personaje' }, { value: 'product', label: 'Producto' },
  { value: 'location', label: 'Localización' }, { value: 'style', label: 'Estilo' },
  { value: 'rule', label: 'Regla de continuidad' },
]
const UPSCALE_RESOLUTIONS = ['720p', '1k', '2k', '4k']
const POST_PRESETS = [
  { value: 'vertical', label: 'Vertical 9:16' },
  { value: 'square', label: 'Cuadrado 1:1' },
  { value: 'landscape', label: 'Horizontal 16:9' },
  { value: 'source', label: 'Fuente (sin reencuadre)' },
]
const PUBLISH_PLATFORMS = ['instagram', 'tiktok', 'linkedin', 'youtube']

// Estados de Job en los que todavía se está trabajando (jobs.service.ts).
const ACTIVE_JOB_STATUSES = new Set(['pending', 'running', 'waiting_provider', 'awaiting_approval', 'cancel_requested'])
const FINISHED_JOB_STATUSES = new Set(['succeeded', 'failed', 'canceled'])
const JOB_STATUS_LABEL = {
  pending: 'En cola', running: 'Generando', waiting_provider: 'Esperando al proveedor',
  awaiting_approval: 'Esperando aprobación', cancel_requested: 'Cancelando',
  succeeded: 'Listo', failed: 'Fallido', canceled: 'Cancelado',
}
const POLL_MS = 8000
const AUTO_SYNC_MS = 16000

const asRecord = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})

export function phaseMeta(status) {
  return PHASE_META[status] || { label: status || '—', color: 'var(--muted)', icon: RiClapperboardLine }
}

export function formatCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return '—'
  return (Number(cents) / 100).toLocaleString(localeCode(getLocale()), { style: 'currency', currency: 'EUR' })
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatSeconds(seconds) {
  const total = Math.round(Number(seconds) || 0)
  if (total < 60) return `${total} s`
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatTimecode(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000)
  return `${Math.floor(total / 60)}:${String(Math.floor(total) % 60).padStart(2, '0')}`
}

/** El usuario piensa en euros y la API habla en céntimos. NaN = entrada inválida. */
export function eurToCents(text) {
  const clean = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (clean === '') return null
  const value = Number(clean)
  if (!Number.isFinite(value) || value < 0) return NaN
  return Math.round(value * 100)
}

export function centsToEur(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return ''
  const value = Number(cents) / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function slugify(value) {
  return String(value || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

function Spinner() {
  return <RiLoader4Line className="studio-spin" aria-hidden="true" />
}

export function PhaseBadge({ status }) {
  const meta = phaseMeta(status)
  return <span className="studio-status" style={{ '--status': meta.color }}><i />{meta.label}</span>
}

function StatTile({ icon: Icon, label, value, hint, tone = '' }) {
  return (
    <div className={`studio-stat ${tone}`.trim()}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </div>
  )
}

function Meter({ value, max, tone = '', label }) {
  const percent = max > 0 ? Math.min(100, Math.round((Number(value) / max) * 100)) : 0
  return (
    <div className={`studio-meter ${tone}`.trim()} role="img" aria-label={label || `${percent}%`}>
      <i style={{ width: `${percent}%` }} />
    </div>
  )
}

/** Campo monetario en euros que devuelve céntimos hacia arriba. */
function MoneyField({ label, cents, onCents, hint, placeholder = '0', disabled = false }) {
  const [text, setText] = useState(() => centsToEur(cents))
  const emitted = useRef(cents)
  useEffect(() => {
    // Solo se re-sincroniza cuando el valor cambia por fuera (una estimación
    // nueva): reescribir el texto mientras se teclea reordena el cursor.
    if (cents !== emitted.current) { setText(centsToEur(cents)); emitted.current = cents }
  }, [cents])
  const parsed = eurToCents(text)
  const invalid = Number.isNaN(parsed)
  return (
    <label className={`studio-field${invalid ? ' is-invalid' : ''}`}>
      <span>{label}</span>
      <div className="studio-money">
        <input
          inputMode="decimal"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={event => {
            setText(event.target.value)
            const next = eurToCents(event.target.value)
            // `null` (campo vacío) se propaga tal cual: para el presupuesto
            // significa «sin tope», y convertirlo a 0 lo volvía un tope de 0 €
            // que bloqueaba toda la producción.
            if (!Number.isNaN(next)) { emitted.current = next; onCents(next) }
          }}
        />
        <b>€</b>
      </div>
      {invalid ? <small className="studio-hint-bad">Importe no válido.</small> : hint ? <small>{hint}</small> : null}
    </label>
  )
}

function CostConfirmation({ checked, onChange, amountCents, label = 'Confirmo este máximo de gasto' }) {
  return (
    <label className="studio-cost-confirm">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>{label}: <strong>{formatCents(amountCents)}</strong></span>
    </label>
  )
}

function Message({ tone, children }) {
  if (!children) return null
  const Icon = tone === 'ok' ? RiCheckboxCircleLine : tone === 'error' ? RiErrorWarningLine : RiAlertLine
  return (
    <p className={`studio-message ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />{children}
    </p>
  )
}

function EmptyInline({ icon: Icon = RiClapperboardLine, title, children, action }) {
  return (
    <div className="studio-empty-inline">
      <Icon aria-hidden="true" />
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
      {action}
    </div>
  )
}

function Panel({ title, hint, actions, children }) {
  return (
    <section className="studio-panel">
      <header className="studio-panel-header">
        <div><h2>{title}</h2>{hint ? <p>{hint}</p> : null}</div>
        {actions ? <div className="studio-panel-tools">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}

function CopyButton({ value, label = 'Copiar' }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return undefined
    const timer = setTimeout(() => setDone(false), 1800)
    return () => clearTimeout(timer)
  }, [done])
  return (
    <button
      type="button"
      className="studio-button secondary"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => setDone(true)).catch(() => undefined)
      }}
    >
      {done ? <RiCheckboxCircleLine /> : <RiFileCopyLine />} {done ? 'Copiado' : label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Cálculos de estado de la producción
// ---------------------------------------------------------------------------

function collectShots(scenes, jobByTakeId) {
  return scenes.flatMap(scene => (scene.shots || []).map(shot => ({
    ...shot,
    sceneOrder: scene.order,
    takes: (shot.takes || []).map(take => ({ ...take, job: jobByTakeId.get(take.id) || null })),
  })))
}

function productionStats(production, shots) {
  const brief = asRecord(production.brief)
  const scenes = production.scenes || []
  const boarded = shots.filter(shot => shot.storyboardAssetId).length
  const withTakes = shots.filter(shot => shot.takes.some(take => take.assetId)).length
  const chosen = shots.filter(shot => shot.takes.some(take => take.selected && take.assetId)).length
  // Un plano sin ninguna toma utilizable hay que rodarlo; uno que tiene tomas
  // pero ninguna elegida solo hay que decidirlo. Son dos pasos distintos y
  // confundirlos manda al usuario a elegir entre cero opciones.
  const unshot = shots.length - withTakes
  const plannedSeconds = shots.reduce((sum, shot) => sum + (Number(asRecord(shot.spec).durationS) || 0), 0)
  const scriptSeconds = scenes.reduce((sum, scene) => sum + (Number(asRecord(scene.scriptText).estimatedSeconds) || 0), 0)
  const activeTakes = shots.flatMap(shot => shot.takes).filter(take => ACTIVE_JOB_STATUSES.has(take.job?.status))
  const generatingBoards = shots.filter(shot => shot.status === 'generating')
  const settleable = shots.flatMap(shot => shot.takes).filter(take => (
    FINISHED_JOB_STATUSES.has(take.job?.status) && !take.assetId && asRecord(take.qcReport).budgetSettled !== true
  ))
  return {
    brief,
    scenes,
    boarded,
    withTakes,
    chosen,
    unshot,
    plannedSeconds,
    scriptSeconds,
    targetSeconds: Number(brief.durationS) || 0,
    activeTakes,
    generatingBoards,
    settleable,
    pendingBoards: shots.filter(shot => !shot.storyboardAssetId && shot.status !== 'generating'),
    exports: Array.isArray(production.exports) ? production.exports : [],
  }
}

/**
 * Un único siguiente paso, calculado del estado real. El pipeline tiene ocho
 * fases y nueve botones repartidos por la pantalla; sin esto nadie sabe cuál
 * toca ni por qué el de más abajo está deshabilitado.
 */
function nextStep({ production, stats, shots, concepts, canGenerate, estimate }) {
  const approved = concepts.find(concept => concept.status === 'approved')
  // Un paso que exige gasto y no se puede lanzar se pinta en tono de espera,
  // pero conserva su explicación: decir solo «no tienes permiso» deja al lector
  // sin saber qué falta por hacer.
  const gated = canGenerate ? {} : { tone: 'wait' }

  if (!concepts.length) {
    return {
      tab: 'concepts', title: 'Genera tres direcciones creativas',
      hint: 'El brief ya está completo. El primer paso propone tres caminos distintos y comparables.',
      action: canGenerate ? { key: 'concepts', label: 'Generar conceptos', icon: RiSparkling2Line, path: 'concepts/generate', success: 'Se generaron tres direcciones creativas.' } : null,
      ...gated,
    }
  }
  if (!approved) {
    return {
      tab: 'concepts', title: 'Aprueba una dirección creativa',
      hint: 'Aprobar una descarta las otras dos y desbloquea el guion.',
    }
  }
  if (!stats.scenes.length) {
    return {
      tab: 'script', title: 'Escribe el guion por escenas',
      hint: `Acción, voz, diálogo y texto en pantalla ajustados a ${stats.targetSeconds || '—'} s de ${stats.brief.channel || 'canal'}.`,
      action: canGenerate ? { key: 'script', label: 'Generar guion', icon: RiMovie2Line, path: 'script/generate', success: 'Guion generado por escenas.' } : null,
      ...gated,
    }
  }
  if (!shots.length) {
    return {
      tab: 'storyboard', title: 'Desglosa el guion en planos',
      hint: 'Encuadre, movimiento de cámara, duración y calidad recomendada por plano.',
      action: canGenerate ? { key: 'shotlist', label: 'Generar planos', icon: RiPlayListAddLine, path: 'shotlist/generate', success: 'Desglose de planos generado.' } : null,
      ...gated,
    }
  }
  if (stats.pendingBoards.length) {
    const count = stats.pendingBoards.length
    return {
      tab: 'storyboard', title: `Dibuja ${count} storyboard${count === 1 ? '' : 's'}`,
      hint: `Un tablero por plano fija el encuadre antes de pagar vídeo. Estimado ${formatCents(estimate?.storyboardsCents)}.`,
      action: canGenerate ? { key: 'storyboard', label: `Generar ${count} storyboard${count === 1 ? '' : 's'}`, icon: RiFolderImageLine, path: 'storyboard/generate', body: {}, success: 'Storyboards lanzados.' } : null,
      ...gated,
    }
  }
  if (stats.activeTakes.length || stats.generatingBoards.length) {
    return {
      tab: stats.activeTakes.length ? 'takes' : 'storyboard',
      title: 'Hay generaciones en curso',
      hint: 'La pantalla se refresca sola y consolida los resultados en cuanto el proveedor responde.',
      tone: 'wait',
    }
  }
  if (stats.unshot) {
    return {
      tab: 'takes',
      title: stats.withTakes
        ? `Rueda ${stats.unshot} plano${stats.unshot === 1 ? '' : 's'} sin tomas`
        : 'Rueda las tomas',
      hint: 'Genera variantes de vídeo por plano; después te quedas con una sola por plano.',
    }
  }
  if (stats.chosen < shots.length) {
    const missing = shots.length - stats.chosen
    return {
      tab: 'takes', title: `Elige la toma buena de ${missing} plano${missing === 1 ? '' : 's'}`,
      hint: 'El montaje exige exactamente una toma terminada por plano.',
    }
  }
  if (!stats.exports.length) {
    return {
      tab: 'post', title: 'Monta el máster',
      hint: 'FFmpeg local encadena las tomas elegidas; sin coste de proveedor.',
    }
  }
  if (production.status !== 'delivered') {
    return {
      tab: 'publish', title: 'Publica con atribución',
      hint: 'Metricool recibe el borrador desde la copia pública inmutable, con un UTM propio de esta pieza.',
    }
  }
  return { tab: 'publish', title: 'Producción entregada', hint: 'Todo el pipeline está cerrado y trazado.', tone: 'done' }
}

// ---------------------------------------------------------------------------
// Modales
// ---------------------------------------------------------------------------

function ModalShell({ label, onClose, children, wide = false }) {
  useEffect(() => {
    function onKeyDown(event) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [onClose])
  return (
    <div className="studio-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`studio-modal dark-scroll${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

function NewProductionModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', objective: '', audience: '', channel: 'reels', durationS: '15', cta: '', constraints: '', budgetCents: null })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = field => event => setForm(current => ({ ...current, [field]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    setError(null)
    const title = form.title.trim()
    const objective = form.objective.trim()
    if (!title || !objective) { setError('El título y el objetivo son obligatorios.'); return }
    const payload = {
      title,
      brief: {
        objective, audience: form.audience.trim(), channel: form.channel, durationS: Number(form.durationS),
        ...(form.cta.trim() ? { cta: form.cta.trim() } : {}),
        ...(form.constraints.trim() ? { constraints: form.constraints.trim() } : {}),
      },
      ...(form.budgetCents != null ? { budgetCents: form.budgetCents } : {}),
    }
    setSaving(true)
    try {
      const response = await apiFetch('/api/studio/productions', { method: 'POST', body: JSON.stringify(payload) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) { setError(body.error || `No se pudo crear la producción (${response.status}).`); return }
      onCreated(body)
    } catch { setError('No hay conexión con el servidor. Inténtalo de nuevo.') } finally { setSaving(false) }
  }

  return (
    <ModalShell label="Nueva producción" onClose={onClose}>
      <header className="studio-modal-header">
        <div>
          <h2>Nueva producción</h2>
          <p>Tu perfil de empresa y tu marca se incorporan automáticamente al brief.</p>
        </div>
        <button type="button" className="studio-icon-button" aria-label="Cerrar" onClick={onClose}><RiCloseLine /></button>
      </header>
      <form className="studio-form" onSubmit={submit}>
        <label className="studio-field"><span>Título *</span><input value={form.title} onChange={set('title')} maxLength={200} placeholder="Anuncio de lanzamiento — otoño" autoFocus /></label>
        <label className="studio-field"><span>Objetivo *</span><textarea value={form.objective} onChange={set('objective')} rows={3} maxLength={2000} placeholder="Qué debe conseguir esta pieza" /></label>
        <label className="studio-field"><span>Audiencia</span><textarea value={form.audience} onChange={set('audience')} rows={2} maxLength={2000} placeholder="Vacío: usa el cliente ideal del perfil de empresa" /></label>
        <div className="studio-field-row">
          <label className="studio-field"><span>Canal</span><select value={form.channel} onChange={set('channel')}>{CHANNEL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="studio-field"><span>Duración</span><select value={form.durationS} onChange={set('durationS')}>{DURATION_OPTIONS.map(seconds => <option key={seconds} value={seconds}>{seconds} segundos</option>)}</select></label>
        </div>
        <label className="studio-field"><span>Llamada a la acción</span><input value={form.cta} onChange={set('cta')} maxLength={300} placeholder="Reserva tu plaza" /></label>
        <label className="studio-field"><span>Restricciones</span><textarea value={form.constraints} onChange={set('constraints')} rows={2} maxLength={2000} placeholder="Qué no puede aparecer o afirmarse" /></label>
        <MoneyField
          label="Presupuesto"
          cents={form.budgetCents}
          onCents={cents => setForm(current => ({ ...current, budgetCents: cents }))}
          placeholder="Sin tope"
          hint="Tope duro: el backend no genera nada que lo supere."
        />
        <Message tone="error">{error}</Message>
        <footer className="studio-form-actions">
          <button type="button" className="studio-button secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="studio-button primary" disabled={saving}>{saving ? <><Spinner /> Creando…</> : <><RiAddLine /> Crear producción</>}</button>
        </footer>
      </form>
    </ModalShell>
  )
}

function EditProductionModal({ production, onClose, onSaved }) {
  const brief = asRecord(production.brief)
  const [form, setForm] = useState({
    title: production.title,
    budgetCents: production.budgetCents,
    objective: brief.objective || '',
    audience: brief.audience || '',
    cta: brief.cta || '',
    constraints: brief.constraints || '',
    channel: brief.channel || 'reels',
    durationS: String(brief.durationS || 15),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/studio/productions/${production.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: form.title.trim(),
          budgetCents: form.budgetCents,
          brief: {
            objective: form.objective.trim(),
            audience: form.audience.trim(),
            channel: form.channel,
            durationS: Number(form.durationS),
            ...(form.cta.trim() ? { cta: form.cta.trim() } : {}),
            ...(form.constraints.trim() ? { constraints: form.constraints.trim() } : {}),
          },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo editar la producción.')
      onSaved(body)
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }

  const set = field => event => setForm(current => ({ ...current, [field]: event.target.value }))

  return (
    <ModalShell label="Editar producción" onClose={onClose}>
      <header className="studio-modal-header">
        <div><h2>Editar producción</h2><p>El brief es la fuente de todo lo que se genere a partir de ahora.</p></div>
        <button type="button" className="studio-icon-button" aria-label="Cerrar" onClick={onClose}><RiCloseLine /></button>
      </header>
      <form className="studio-form" onSubmit={submit}>
        <label className="studio-field"><span>Título</span><input required value={form.title} onChange={set('title')} maxLength={200} /></label>
        <label className="studio-field"><span>Objetivo</span><textarea required rows={3} value={form.objective} onChange={set('objective')} maxLength={2000} /></label>
        <label className="studio-field"><span>Audiencia</span><textarea rows={2} value={form.audience} onChange={set('audience')} maxLength={2000} /></label>
        <div className="studio-field-row">
          <label className="studio-field"><span>Canal</span><select value={form.channel} onChange={set('channel')}>{CHANNEL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="studio-field"><span>Duración</span><select value={form.durationS} onChange={set('durationS')}>{DURATION_OPTIONS.map(seconds => <option key={seconds} value={seconds}>{seconds} segundos</option>)}</select></label>
        </div>
        <label className="studio-field"><span>Llamada a la acción</span><input value={form.cta} onChange={set('cta')} maxLength={300} /></label>
        <label className="studio-field"><span>Restricciones</span><textarea rows={2} value={form.constraints} onChange={set('constraints')} maxLength={2000} /></label>
        <MoneyField label="Presupuesto" cents={form.budgetCents} onCents={cents => setForm(current => ({ ...current, budgetCents: cents }))} placeholder="Sin tope" />
        <Message tone="error">{error}</Message>
        <footer className="studio-form-actions">
          <button type="button" className="studio-button secondary" onClick={onClose}>Cancelar</button>
          <button className="studio-button primary" disabled={busy}>{busy ? <><Spinner /> Guardando…</> : 'Guardar cambios'}</button>
        </footer>
      </form>
    </ModalShell>
  )
}

function ShortcutsModal({ onClose }) {
  const rows = [
    ['1 … 8', 'Saltar a cada pestaña del pipeline'],
    ['R', 'Refrescar la producción'],
    ['N', 'Ir al siguiente paso pendiente'],
    ['←  →', 'Moverse entre planos en la caja de luz'],
    ['Esc', 'Cerrar la caja de luz o el diálogo'],
  ]
  return (
    <ModalShell label="Atajos de teclado" onClose={onClose}>
      <header className="studio-modal-header">
        <div><h2>Atajos de teclado</h2><p>Disponibles mientras no estés escribiendo en un campo.</p></div>
        <button type="button" className="studio-icon-button" aria-label="Cerrar" onClick={onClose}><RiCloseLine /></button>
      </header>
      <dl className="studio-shortcuts">
        {rows.map(([keys, description]) => (
          <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>
        ))}
      </dl>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Listado de producciones
// ---------------------------------------------------------------------------

function ProductionCard({ production, onOpen }) {
  const brief = asRecord(production.brief)
  const meta = phaseMeta(production.status)
  const phaseIndex = Math.max(0, PHASE_ORDER.indexOf(production.status))
  const counts = production._count || {}
  const budget = production.budgetCents
  const spent = Number(production.spentCents || 0)
  return (
    <button type="button" className="studio-card" onClick={onOpen} style={{ '--status': meta.color }}>
      <span className="studio-card-flag" aria-hidden="true"><meta.icon /></span>
      <div className="studio-card-main">
        <strong>{production.title}</strong>
        <small>
          {brief.channel || 'sin canal'} · {brief.durationS ? `${brief.durationS} s` : 'duración sin fijar'}
          {counts.scenes ? ` · ${counts.scenes} escenas` : ''}
          {counts.bibleEntries ? ` · ${counts.bibleEntries} en biblia` : ''}
        </small>
        <span className="studio-card-rail" aria-label={`Fase ${phaseIndex + 1} de ${PHASE_ORDER.length}: ${meta.label}`}>
          {PHASE_ORDER.map((phase, index) => (
            <i key={phase} className={index < phaseIndex ? 'done' : index === phaseIndex ? 'now' : ''} />
          ))}
        </span>
      </div>
      <div className="studio-card-side">
        <PhaseBadge status={production.status} />
        <span className="studio-card-budget">
          <strong>{formatCents(spent)}</strong>
          <small>{budget != null ? `de ${formatCents(budget)}` : 'sin tope'}</small>
          {budget != null ? <Meter value={spent} max={budget} tone={spent > budget ? 'bad' : ''} /> : null}
        </span>
      </div>
      <RiArrowRightSLine className="studio-card-arrow" aria-hidden="true" />
    </button>
  )
}

function ProductionsList({ canWrite }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [listState, setListState] = useState('loading')
  const [showModal, setShowModal] = useState(false)
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState('')
  const [sort, setSort] = useState('recent')
  const requestRef = useRef(0)

  const fetchList = useCallback(async () => {
    const requestId = ++requestRef.current
    setListState('loading')
    try {
      const response = await apiFetch('/api/studio/productions')
      if (!response.ok) throw new Error('list')
      const data = await response.json()
      if (requestRef.current !== requestId) return
      const list = Array.isArray(data) ? data : []
      setItems(list)
      setListState(list.length ? 'ready' : 'empty')
    } catch {
      if (requestRef.current === requestId) setListState('error')
    }
  }, [])
  useEffect(() => { fetchList() }, [fetchList])

  const totals = useMemo(() => {
    const spent = items.reduce((sum, item) => sum + Number(item.spentCents || 0), 0)
    const delivered = items.filter(item => item.status === 'delivered').length
    const shooting = items.filter(item => ['storyboard', 'shooting', 'post'].includes(item.status)).length
    return { spent, delivered, shooting, open: items.length - delivered }
  }, [items])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = items.filter(item => {
      if (phase && item.status !== phase) return false
      if (!needle) return true
      const brief = asRecord(item.brief)
      return `${item.title} ${brief.objective || ''} ${brief.channel || ''}`.toLowerCase().includes(needle)
    })
    const order = [...filtered]
    if (sort === 'spend') order.sort((a, b) => Number(b.spentCents || 0) - Number(a.spentCents || 0))
    else if (sort === 'phase') order.sort((a, b) => PHASE_ORDER.indexOf(b.status) - PHASE_ORDER.indexOf(a.status))
    else order.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    return order
  }, [items, query, phase, sort])

  const phasesPresent = useMemo(
    () => PHASE_ORDER.filter(value => items.some(item => item.status === value)),
    [items],
  )

  return (
    <main className="studio-page dark-scroll">
      <div className="studio-shell">
        <header className="studio-hero studio-rise" style={{ backgroundImage: `url(${STUDIO_HERO})` }}>
          <div className="studio-hero-copy">
            <span className="studio-eyebrow"><RiClapperboardLine /> Studio de cine</span>
            <h1>Del brief al máster, en una sola mesa</h1>
            <p>
              Conceptos, guion, desglose de planos, storyboard, tomas de vídeo, montaje y publicación.
              Con tope de presupuesto duro, procedencia de cada activo y el coste real de cada job a la vista.
            </p>
          </div>
          <div className="studio-hero-actions">
            {canWrite ? <button type="button" className="studio-button primary" onClick={() => setShowModal(true)}><RiAddLine /> Nueva producción</button> : null}
          </div>
        </header>

        {items.length ? (
          <section className="studio-stats studio-rise" aria-label="Resumen del Studio">
            <StatTile icon={RiClapperboardLine} label="Producciones abiertas" value={totals.open} hint={`${items.length} en total`} />
            <StatTile icon={RiVideoLine} label="En tablero o rodaje" value={totals.shooting} hint="storyboard, tomas o montaje" />
            <StatTile icon={RiCheckboxCircleLine} label="Entregadas" value={totals.delivered} tone="ok" />
            <StatTile icon={RiWallet3Line} label="Gasto acumulado" value={formatCents(totals.spent)} hint="jobs de IA ya liquidados" />
          </section>
        ) : null}

        {items.length ? (
          <div className="studio-toolbar studio-rise">
            <label className="studio-search">
              <RiSearchLine aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar por título, objetivo o canal"
                aria-label="Buscar producciones"
              />
            </label>
            <div className="studio-chips" role="group" aria-label="Filtrar por fase">
              <button type="button" className={phase === '' ? 'active' : ''} onClick={() => setPhase('')}>Todas</button>
              {phasesPresent.map(value => (
                <button key={value} type="button" className={phase === value ? 'active' : ''} onClick={() => setPhase(value)} style={{ '--status': phaseMeta(value).color }}>
                  {phaseMeta(value).label}
                  <b>{items.filter(item => item.status === value).length}</b>
                </button>
              ))}
            </div>
            <label className="studio-field studio-sort">
              <span className="visually-hidden">Ordenar</span>
              <select value={sort} onChange={event => setSort(event.target.value)} aria-label="Ordenar producciones">
                <option value="recent">Actividad reciente</option>
                <option value="phase">Fase más avanzada</option>
                <option value="spend">Mayor gasto</option>
              </select>
            </label>
          </div>
        ) : null}

        {listState === 'loading' ? (
          <div className="studio-state" role="status"><Spinner /><strong>Cargando producciones…</strong></div>
        ) : null}
        {listState === 'error' ? (
          <div className="studio-state error" role="alert">
            <RiErrorWarningLine />
            <strong>No se pudieron cargar las producciones.</strong>
            <button type="button" className="studio-button secondary" onClick={fetchList}>Reintentar</button>
          </div>
        ) : null}
        {listState === 'empty' ? (
          <div className="studio-state">
            <RiClapperboardLine />
            <strong>Todavía no hay producciones</strong>
            <span>Brief → conceptos → guion → planos → storyboard → tomas → montaje, con presupuesto duro y activos trazables en cada paso.</span>
            {canWrite ? <button type="button" className="studio-button primary" onClick={() => setShowModal(true)}><RiAddLine /> Crear la primera</button> : null}
          </div>
        ) : null}
        {listState === 'ready' && !visible.length ? (
          <div className="studio-state">
            <RiSearchLine />
            <strong>Ninguna producción coincide con el filtro</strong>
            <button type="button" className="studio-button secondary" onClick={() => { setQuery(''); setPhase('') }}>Quitar filtros</button>
          </div>
        ) : null}
        {listState === 'ready' && visible.length ? (
          <section className="studio-list studio-rise" aria-label="Producciones">
            {visible.map(production => (
              <ProductionCard key={production.id} production={production} onOpen={() => navigate(`/studio/${production.id}`)} />
            ))}
          </section>
        ) : null}
      </div>
      {showModal ? (
        <NewProductionModal onClose={() => setShowModal(false)} onCreated={production => { setShowModal(false); navigate(`/studio/${production.id}`) }} />
      ) : null}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Paneles del detalle
// ---------------------------------------------------------------------------

function BiblePanel({ entries, canWrite, busy, onCreate, onUpdate }) {
  const empty = { kind: 'style', name: '', refAssetIds: [], realPerson: false, consentGrantId: '' }
  const [editing, setEditing] = useState(null) // null | 'new' | entryId
  const [form, setForm] = useState(empty)

  function startNew() {
    setForm(empty)
    setEditing(current => (current === 'new' ? null : 'new'))
  }
  function startEdit(entry) {
    setForm({
      kind: entry.kind,
      name: entry.name,
      refAssetIds: entry.refAssetIds || [],
      realPerson: asRecord(entry.data).realPerson === true,
      consentGrantId: entry.consentGrantId || '',
    })
    setEditing(entry.id)
  }
  function submit(event) {
    event.preventDefault()
    if (!form.name.trim()) return
    const isNew = editing === 'new'
    const consent = form.consentGrantId.trim()
    const payload = {
      kind: form.kind,
      name: form.name.trim(),
      refAssetIds: form.refAssetIds,
      // `data` solo viaja para personajes: es lo único que esta pantalla sabe
      // rellenar, y mandarlo vacío al editar borraría lo que hubiera guardado
      // otro origen. Al crear sí hace falta porque el esquema le pone {}.
      ...(form.kind === 'character' ? { data: { realPerson: form.realPerson } } : isNew ? { data: {} } : {}),
      // Al editar, null es explícito: retira el consentimiento y revalida.
      ...(isNew ? (consent ? { consentGrantId: consent } : {}) : { consentGrantId: consent || null }),
    }
    const run = isNew ? onCreate(payload) : onUpdate(editing, payload)
    run.then(ok => { if (ok) { setForm(empty); setEditing(null) } })
  }

  return (
    <Panel
      title="Biblia de producción"
      hint="Referencias maestras que deben mantenerse idénticas entre planos: personajes, producto, localizaciones, estilo y reglas de continuidad."
      actions={canWrite ? <button type="button" className="studio-button secondary" onClick={startNew}><RiAddLine /> Añadir entrada</button> : null}
    >
      {editing ? (
        <form className="studio-bible-form" onSubmit={submit}>
          <label className="studio-field">
            <span>Tipo</span>
            <select value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value }))}>
              {BIBLE_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
            </select>
          </label>
          <label className="studio-field">
            <span>Nombre</span>
            <input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} maxLength={160} placeholder="Paleta cálida de interiores" />
          </label>
          <AssetMultiPicker
            kind={['image', 'video']}
            values={form.refAssetIds}
            onChange={refAssetIds => setForm(current => ({ ...current, refAssetIds }))}
            label="Referencias visuales"
            hint="Se validan contra la biblioteca de la organización antes de guardar."
          />
          {form.kind === 'character' ? (
            <>
              <label className="studio-check">
                <input type="checkbox" checked={form.realPerson} onChange={event => setForm(current => ({ ...current, realPerson: event.target.checked }))} />
                Es una persona real
              </label>
              {form.realPerson ? (
                <label className="studio-field studio-field-wide">
                  <span>ID de consentimiento activo *</span>
                  <input value={form.consentGrantId} onChange={event => setForm(current => ({ ...current, consentGrantId: event.target.value }))} placeholder="ConsentGrant vigente" />
                  <small>Sin consentimiento vigente el backend rechaza la entrada.</small>
                </label>
              ) : null}
            </>
          ) : null}
          <div className="studio-form-actions studio-field-wide">
            <button type="button" className="studio-button ghost" onClick={() => setEditing(null)}>Cancelar</button>
            <button type="submit" className="studio-button primary" disabled={busy || (form.realPerson && !form.consentGrantId.trim())}>
              {editing === 'new' ? 'Guardar entrada' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      ) : null}
      {entries.length ? (
        <div className="studio-bible-list">
          {entries.map(entry => (
            <article key={entry.id}>
              <span>{BIBLE_KINDS.find(kind => kind.value === entry.kind)?.label || entry.kind}</span>
              <strong>{entry.name}</strong>
              {entry.refAssetIds?.length ? (
                <div className="studio-bible-refs">
                  {entry.refAssetIds.slice(0, 4).map(assetId => (
                    <AssetMedia key={assetId} assetId={assetId} kind="image" alt={`Referencia de ${entry.name}`} className="tiny" />
                  ))}
                </div>
              ) : null}
              <small>
                {entry.refAssetIds?.length || 0} referencias
                {entry.consentGrantId ? ' · consentimiento verificado' : ''}
              </small>
              {canWrite ? <button type="button" className="studio-link" onClick={() => startEdit(entry)}>Editar</button> : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyInline icon={RiBook2Line} title="La biblia está vacía">
          Añade referencias maestras antes de generar personas, productos recurrentes o un estilo que deba repetirse plano a plano.
        </EmptyInline>
      )}
    </Panel>
  )
}

function ConceptsPanel({ concepts, canWrite, canGenerate, busy, onAction }) {
  return (
    <Panel
      title="Direcciones creativas"
      hint="Tres propuestas realmente distintas para el mismo brief. Aprobar una descarta las demás y fija el tono del guion."
      actions={concepts.length === 0 ? (
        <button type="button" className="studio-button primary" disabled={!canGenerate || Boolean(busy)} onClick={() => onAction('concepts', 'concepts/generate', { success: 'Se generaron tres direcciones creativas.' })}>
          {busy === 'concepts' ? <Spinner /> : <RiSparkling2Line />} Generar conceptos
        </button>
      ) : null}
    >
      {concepts.length ? (
        <div className="studio-concepts">
          {concepts.map(concept => {
            const treatment = asRecord(concept.treatment)
            return (
              <article key={concept.id} className={concept.status}>
                <div className="studio-concept-top">
                  <span>{concept.status === 'approved' ? 'Aprobado' : concept.status === 'discarded' ? 'Descartado' : 'Propuesto'}</span>
                  <strong>{concept.title}</strong>
                </div>
                <p className="studio-logline">{concept.logline}</p>
                <dl>
                  <div><dt>Promesa</dt><dd>{treatment.promise || '—'}</dd></div>
                  <div><dt>Emoción</dt><dd>{treatment.emotion || '—'}</dd></div>
                  <div><dt>Mundo visual</dt><dd>{treatment.visualWorld || '—'}</dd></div>
                  <div><dt>Coste estimado</dt><dd>{treatment.estimatedProductionCost || '—'}</dd></div>
                </dl>
                {concept.status === 'proposed' ? (
                  <button type="button" className="studio-button primary" disabled={!canWrite || Boolean(busy)} onClick={() => onAction(`approve-${concept.id}`, `concepts/${concept.id}/approve`, { success: `Dirección «${concept.title}» aprobada.` })}>
                    {busy === `approve-${concept.id}` ? <Spinner /> : <RiCheckboxCircleLine />} Aprobar dirección
                  </button>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyInline icon={RiSparkling2Line} title="Aún no hay conceptos">
          El primer paso propone tres caminos comparables — promesa, emoción y mundo visual — para que la decisión creativa se tome antes de gastar en imagen o vídeo.
        </EmptyInline>
      )}
    </Panel>
  )
}

function ScriptPanel({ scenes, stats, approved, canGenerate, busy, onAction }) {
  const over = stats.targetSeconds > 0 && stats.scriptSeconds > stats.targetSeconds * 1.15
  return (
    <Panel
      title="Guion por escenas"
      hint="Acción, voz en off, diálogo y texto en pantalla, con la locución medida en segundos reales."
      actions={approved && scenes.length === 0 ? (
        <button type="button" className="studio-button primary" disabled={!canGenerate || Boolean(busy)} onClick={() => onAction('script', 'script/generate', { success: 'Guion generado por escenas.' })}>
          {busy === 'script' ? <Spinner /> : <RiMovie2Line />} Generar guion
        </button>
      ) : null}
    >
      {scenes.length ? (
        <>
          <div className="studio-timeline" aria-label="Reparto de duración por escena">
            {scenes.map(scene => {
              const script = asRecord(scene.scriptText)
              const seconds = Number(script.estimatedSeconds) || 0
              return (
                <span
                  key={scene.id}
                  style={{ flexGrow: Math.max(seconds, 0.5) }}
                  title={`Escena ${scene.order}: ${formatSeconds(seconds)}`}
                >
                  <b>E{scene.order}</b>
                  <small>{seconds ? formatSeconds(seconds) : '—'}</small>
                </span>
              )
            })}
          </div>
          <p className={`studio-runtime${over ? ' bad' : ''}`}>
            <RiTimeLine aria-hidden="true" />
            <span>
              {scenes.length} escenas suman <strong>{formatSeconds(stats.scriptSeconds)}</strong> sobre un objetivo
              de <strong>{formatSeconds(stats.targetSeconds)}</strong>
              {over ? ' — se pasa del formato del canal; recorta antes de desglosar planos.' : '.'}
            </span>
          </p>
          <div className="studio-scenes">
            {scenes.map(scene => {
              const script = asRecord(scene.scriptText)
              return (
                <article key={scene.id}>
                  <span>Escena {scene.order}</span>
                  <strong>{script.action || 'Sin acción descrita'}</strong>
                  {script.vo ? <p><b>VO</b> {script.vo}</p> : null}
                  {script.dialogue ? <p><b>Diálogo</b> {script.dialogue}</p> : null}
                  {script.textOnScreen ? <p><b>En pantalla</b> {script.textOnScreen}</p> : null}
                  {script.cta ? <p><b>CTA</b> {script.cta}</p> : null}
                  <small>{script.estimatedSeconds || '—'} s · locución estimada {script.voSeconds ?? '—'} s</small>
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <EmptyInline icon={RiMovie2Line} title={approved ? 'Falta el guion' : 'Aprueba antes una dirección creativa'}>
          {approved
            ? 'La dirección ya está aprobada. El guion reparte el mensaje en escenas ajustadas a la duración del canal.'
            : 'El guion se escribe sobre el concepto aprobado, no sobre las tres propuestas a la vez.'}
        </EmptyInline>
      )}
    </Panel>
  )
}

function StoryboardPanel({ shots, stats, estimate, canWrite, canGenerate, busy, onAction, onOpenFrame }) {
  const boardedShots = shots.filter(shot => shot.storyboardAssetId)
  return (
    <Panel
      title="Shot list y storyboard"
      hint="Un tablero por plano fija encuadre y cámara antes de pagar vídeo, que cuesta un orden de magnitud más."
      actions={
        <>
          {shots.length === 0 && stats.scenes.length > 0 ? (
            <button type="button" className="studio-button primary" disabled={!canGenerate || Boolean(busy)} onClick={() => onAction('shotlist', 'shotlist/generate', { success: 'Desglose de planos generado.' })}>
              {busy === 'shotlist' ? <Spinner /> : <RiPlayListAddLine />} Generar planos
            </button>
          ) : null}
          {stats.pendingBoards.length ? (
            <button type="button" className="studio-button primary" disabled={!canGenerate || Boolean(busy)} onClick={() => onAction('storyboard', 'storyboard/generate', { body: {}, success: 'Storyboards lanzados.' })}>
              {busy === 'storyboard' ? <Spinner /> : <RiFolderImageLine />} Generar {stats.pendingBoards.length} tablero{stats.pendingBoards.length === 1 ? '' : 's'} · {formatCents(estimate?.storyboardsCents)}
            </button>
          ) : null}
          {stats.generatingBoards.length ? (
            <button type="button" className="studio-button secondary" disabled={!canWrite || Boolean(busy)} onClick={() => onAction('sync', 'storyboard/sync', { success: 'Resultados de storyboard consolidados.' })}>
              {busy === 'sync' ? <Spinner /> : <RiRefreshLine />} Sincronizar {stats.generatingBoards.length} en curso
            </button>
          ) : null}
        </>
      }
    >
      {shots.length ? (
        <>
          <div className="studio-coverage">
            <div>
              <span>Cobertura de tablero</span>
              <strong>{stats.boarded} / {shots.length}</strong>
              <Meter value={stats.boarded} max={shots.length} tone={stats.boarded === shots.length ? 'ok' : ''} label={`${stats.boarded} de ${shots.length} planos con storyboard`} />
            </div>
            <div>
              <span>Metraje planificado</span>
              <strong>{formatSeconds(stats.plannedSeconds)}</strong>
              <small>objetivo {formatSeconds(stats.targetSeconds)}</small>
            </div>
            <div>
              <span>Planos</span>
              <strong>{shots.length}</strong>
              <small>en {stats.scenes.length} escenas</small>
            </div>
          </div>
          <div className="studio-shots">
            {shots.map((shot, index) => {
              const spec = asRecord(shot.spec)
              return (
                <article key={shot.id}>
                  <div className="studio-shot-media">
                    {shot.storyboardAssetId ? (
                      <AssetMedia
                        assetId={shot.storyboardAssetId}
                        kind="image"
                        alt={`Storyboard escena ${shot.sceneOrder}, plano ${shot.order}`}
                        onClick={() => onOpenFrame(boardedShots.findIndex(item => item.id === shot.id))}
                      />
                    ) : (
                      <div className="studio-media">
                        <span className="studio-media-fallback">
                          {shot.status === 'generating' ? <Spinner /> : <RiClapperboardLine />}
                          <small>{shot.status === 'generating' ? 'Dibujando tablero…' : 'Sin storyboard'}</small>
                        </span>
                      </div>
                    )}
                    <span className="studio-shot-index">{index + 1}</span>
                  </div>
                  <div className="studio-shot-body">
                    <span>Escena {shot.sceneOrder} · Plano {shot.order}</span>
                    <strong>{spec.framing || 'Encuadre sin definir'}</strong>
                    <p>{spec.action || '—'}</p>
                    <ul className="studio-shot-tags">
                      <li>{spec.movement || 'cámara sin definir'}</li>
                      <li>{spec.durationS ? `${spec.durationS} s` : 'sin duración'}</li>
                      <li>{spec.recommendedTier || 'draft'}</li>
                    </ul>
                    {spec.audio ? <small>Audio: {spec.audio}</small> : null}
                    {spec._storyboardError ? <em>{spec._storyboardError}</em> : null}
                  </div>
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <EmptyInline icon={RiGalleryLine} title={stats.scenes.length ? 'Falta el desglose técnico' : 'El shot list llega después del guion'}>
          {stats.scenes.length
            ? 'Cada escena se parte en planos con encuadre, movimiento, duración y calidad recomendada.'
            : 'Escribe primero el guion: los planos se derivan de la acción de cada escena.'}
        </EmptyInline>
      )}
    </Panel>
  )
}

function TakeCard({ take, shot, estimate, canWrite, canGenerate, busy, onAction }) {
  const report = asRecord(take.qcReport)
  const job = take.job
  const active = ACTIVE_JOB_STATUSES.has(job?.status)
  const failed = job?.status === 'failed' || job?.status === 'canceled' || Boolean(report.error)
  const upscale = estimate?.breakdown?.v2?.upscales?.find(item => item.takeId === take.id)
  const [resolution, setResolution] = useState('2k')
  const [confirmed, setConfirmed] = useState(false)
  const displayAssetId = report.upscaledAssetId || take.assetId
  const cost = job?.costActualCents ?? job?.costEstimateCents ?? report.budgetActualCents

  return (
    <article className={`studio-take${take.selected ? ' selected' : ''}${failed ? ' failed' : ''}`}>
      <div className="studio-take-media">
        {displayAssetId ? (
          <AssetMedia assetId={displayAssetId} kind="video" alt={`Toma del plano ${shot.order}`} controls />
        ) : (
          <div className="studio-media">
            <span className="studio-media-fallback">
              {active ? <Spinner /> : <RiVideoLine />}
              <small>{JOB_STATUS_LABEL[job?.status] || 'Sin job'}</small>
            </span>
          </div>
        )}
        {take.selected ? <span className="studio-take-flag"><RiCheckboxCircleLine /> Elegida</span> : null}
        {report.upscaledAssetId ? <span className="studio-take-flag alt">Mejorada</span> : null}
      </div>
      <div className="studio-take-body">
        <header>
          <strong>{JOB_STATUS_LABEL[job?.status] || 'Sin job'}</strong>
          <span>{formatCents(cost)}</span>
        </header>
        <small>{take.tier} · {job?.provider || 'proveedor pendiente'} · {formatDate(take.createdAt)}</small>
        {active && job?.progress != null ? <Meter value={job.progress} max={100} label={`${job.progress}% completado`} /> : null}
        {failed ? <em>{report.error || asRecord(job?.error).message || 'La generación falló.'}</em> : null}
        {report.upscaleError ? <em>Mejora fallida: {report.upscaleError}</em> : null}
        <div className="studio-take-actions">
          {take.assetId && !take.selected ? (
            <button type="button" className="studio-button primary small" disabled={!canWrite || Boolean(busy)} onClick={() => onAction(`select-${take.id}`, `shots/${shot.id}/takes/${take.id}/select`, { success: 'Toma elegida para el montaje.' })}>
              {busy === `select-${take.id}` ? <Spinner /> : <RiCheckboxCircleLine />} Elegir esta
            </button>
          ) : null}
          {take.selected && upscale && !report.upscaledAssetId ? (
            <div className="studio-upscale">
              <select value={resolution} onChange={event => { setResolution(event.target.value); setConfirmed(false) }} aria-label="Resolución de la mejora">
                {UPSCALE_RESOLUTIONS.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}
              </select>
              <CostConfirmation checked={confirmed} onChange={setConfirmed} amountCents={upscale.estimateCents} label="Confirmo la mejora" />
              <button
                type="button"
                className="studio-button secondary small"
                disabled={!canGenerate || !confirmed || Boolean(busy)}
                onClick={() => onAction(`upscale-${take.id}`, `takes/${take.id}/upscale`, {
                  body: { resolution, maxCostCents: upscale.estimateCents },
                  idem: `upscale-${take.id}`,
                  success: `Mejora ${resolution.toUpperCase()} lanzada.`,
                })}
              >
                {busy === `upscale-${take.id}` ? <Spinner /> : <RiUploadCloud2Line />} Mejorar
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function TakesPanel({ shots, stats, estimate, canWrite, canGenerate, busy, onAction }) {
  const [form, setForm] = useState({ takesPerShot: '1', quality: 'draft', providerId: '', maxCostCents: null, confirmed: false })
  const [selectedShots, setSelectedShots] = useState([])

  const shotEstimates = asRecord(estimate?.breakdown?.v1).shots || []
  const baseCents = Number(estimate?.breakdown?.v1?.estimateCents ?? estimate?.takesCents ?? 0)
  const selectionCents = selectedShots.length
    ? shotEstimates.filter(item => selectedShots.includes(item.shotId)).reduce((sum, item) => sum + Number(item.estimateCents || 0), 0)
    : baseCents
  const suggested = selectionCents * Number(form.takesPerShot || 1)
  const maxCostCents = form.maxCostCents == null ? suggested : form.maxCostCents
  const videoUnavailable = estimate?.breakdown?.v1?.estimateCents == null

  useEffect(() => { setForm(current => ({ ...current, confirmed: false })) }, [suggested])

  function toggleShot(shotId) {
    setSelectedShots(current => (current.includes(shotId) ? current.filter(id => id !== shotId) : [...current, shotId]))
  }

  return (
    <Panel
      title="Mesa de tomas"
      hint="Cada plano se genera en variantes y se elige exactamente una. El backend nunca gasta por encima del máximo que confirmas aquí."
      actions={
        <button type="button" className="studio-button secondary" disabled={!canWrite || Boolean(busy)} onClick={() => onAction('takes-sync', 'takes/sync', { success: 'Tomas consolidadas.' })}>
          {busy === 'takes-sync' ? <Spinner /> : <RiRefreshLine />} Sincronizar
        </button>
      }
    >
      {shots.length === 0 ? (
        <EmptyInline icon={RiVideoLine} title="Sin planos que rodar">Crea el shot list antes de generar vídeo.</EmptyInline>
      ) : (
        <>
          <div className="studio-coverage">
            <div>
              <span>Planos con toma elegida</span>
              <strong>{stats.chosen} / {shots.length}</strong>
              <Meter value={stats.chosen} max={shots.length} tone={stats.chosen === shots.length ? 'ok' : ''} label={`${stats.chosen} de ${shots.length} planos con toma elegida`} />
            </div>
            <div>
              <span>Generaciones en curso</span>
              <strong>{stats.activeTakes.length}</strong>
              <small>{stats.activeTakes.length ? 'refrescando solo' : 'nada en cola'}</small>
            </div>
            <div>
              <span>Estimación por pasada</span>
              <strong>{videoUnavailable ? 'No disponible' : formatCents(baseCents)}</strong>
              <small>una toma por plano</small>
            </div>
          </div>

          {videoUnavailable ? (
            <Message tone="info">
              {estimate
                ? <>Vídeo no disponible: conecta un proveedor con la capacidad <code>video.generate</code> en Conexiones antes de lanzar tomas.</>
                : 'No se pudo calcular la estimación de coste, así que no se permite lanzar tomas a ciegas. Vuelve a intentarlo cuando la estimación esté disponible.'}
            </Message>
          ) : (
            <div className="studio-generate-box">
              <div className="studio-take-config">
                <label className="studio-field">
                  <span>Variantes por plano</span>
                  <select value={form.takesPerShot} onChange={event => setForm(current => ({ ...current, takesPerShot: event.target.value, maxCostCents: null, confirmed: false }))}>
                    {[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="studio-field">
                  <span>Calidad</span>
                  <select value={form.quality} onChange={event => setForm(current => ({ ...current, quality: event.target.value, confirmed: false }))}>
                    <option value="draft">Borrador (barato)</option>
                    <option value="final">Final (caro)</option>
                  </select>
                </label>
                <label className="studio-field">
                  <span>Proveedor</span>
                  <input value={form.providerId} onChange={event => setForm(current => ({ ...current, providerId: event.target.value, confirmed: false }))} placeholder="router automático" />
                </label>
                <MoneyField
                  label="Máximo confirmado"
                  cents={maxCostCents}
                  onCents={cents => setForm(current => ({ ...current, maxCostCents: cents, confirmed: false }))}
                  hint={`Sugerido ${formatCents(suggested)}`}
                />
              </div>
              <div className="studio-shot-picker" role="group" aria-label="Planos a generar">
                <span className="studio-picker-label">
                  {selectedShots.length ? `${selectedShots.length} planos seleccionados` : 'Todos los planos'}
                  {selectedShots.length ? <button type="button" className="studio-link" onClick={() => setSelectedShots([])}>Limpiar</button> : null}
                </span>
                {shots.map(shot => {
                  const done = shot.takes.some(take => take.selected && take.assetId)
                  return (
                    <label key={shot.id} className={done ? 'done' : ''}>
                      <input type="checkbox" checked={selectedShots.includes(shot.id)} onChange={() => toggleShot(shot.id)} />
                      <span>E{shot.sceneOrder}·P{shot.order}</span>
                      {done ? <RiCheckboxCircleLine aria-label="ya tiene toma elegida" /> : null}
                    </label>
                  )
                })}
              </div>
              <div className="studio-confirm-row">
                <CostConfirmation checked={form.confirmed} onChange={confirmed => setForm(current => ({ ...current, confirmed }))} amountCents={maxCostCents} />
                <button
                  type="button"
                  className="studio-button primary"
                  disabled={!canGenerate || !form.confirmed || maxCostCents == null || Boolean(busy)}
                  onClick={() => onAction('takes-generate', 'takes/generate', {
                    body: {
                      ...(selectedShots.length ? { shotIds: selectedShots } : {}),
                      takesPerShot: Number(form.takesPerShot),
                      quality: form.quality,
                      ...(form.providerId.trim() ? { providerId: form.providerId.trim() } : {}),
                      maxCostCents,
                    },
                    idem: 'takes-generate',
                    success: 'Tomas lanzadas. Su progreso se ve aquí y en Trabajos.',
                  })}
                >
                  {busy === 'takes-generate' ? <Spinner /> : <RiVideoLine />} Rodar tomas
                </button>
              </div>
              <p className="studio-estimate-note">
                La estimación cambia con la calidad, el proveedor y la duración de cada plano. El servidor recalcula antes de
                encolar y rechaza la petición si el precio real supera tu máximo.
              </p>
            </div>
          )}

          <div className="studio-take-table">
            {shots.map(shot => {
              const spec = asRecord(shot.spec)
              return (
                <section key={shot.id}>
                  <header>
                    <div>
                      <strong>Escena {shot.sceneOrder} · Plano {shot.order}</strong>
                      <small>{spec.framing || '—'} · {spec.movement || '—'} · {spec.durationS || '—'} s</small>
                    </div>
                    <span>{shot.takes.length} toma{shot.takes.length === 1 ? '' : 's'}</span>
                  </header>
                  {shot.takes.length ? (
                    <div className="studio-take-grid">
                      {shot.takes.map(take => (
                        <TakeCard key={take.id} take={take} shot={shot} estimate={estimate} canWrite={canWrite} canGenerate={canGenerate} busy={busy} onAction={onAction} />
                      ))}
                    </div>
                  ) : (
                    <p className="studio-take-empty">Todavía no se ha rodado este plano.</p>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}

function PostPanel({ stats, shots, canWrite, canGenerate, busy, onAction, navigate }) {
  const [form, setForm] = useState({ subtitleAssetId: '', audioAssetId: '', preset: 'vertical', publish: false, maxCostCents: 0, confirmed: false, publishDocuments: false })
  const missing = shots.length - stats.chosen
  const ready = shots.length > 0 && missing === 0

  return (
    <>
      <Panel
        title="Montaje y máster"
        hint="FFmpeg local encadena las tomas elegidas en orden de escena y plano. Sin coste de proveedor; el consumo de infraestructura se mide aparte."
      >
        {!ready ? (
          <Message tone="info">
            {shots.length === 0
              ? 'No hay planos que montar todavía.'
              : `Faltan ${missing} plano${missing === 1 ? '' : 's'} por elegir toma. El montaje exige exactamente una toma terminada por plano.`}
          </Message>
        ) : null}
        <div className="studio-take-config">
          <label className="studio-field">
            <span>Formato de salida</span>
            <select value={form.preset} onChange={event => setForm(current => ({ ...current, preset: event.target.value, confirmed: false }))}>
              {POST_PRESETS.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
            </select>
          </label>
          <AssetPicker
            kind={['document', 'text']}
            value={form.subtitleAssetId}
            onChange={subtitleAssetId => setForm(current => ({ ...current, subtitleAssetId }))}
            label="Subtítulos"
            placeholder="Sin subtítulos"
            hint="SRT o VTT ya subido a la biblioteca."
          />
          <AssetPicker
            kind="audio"
            value={form.audioAssetId}
            onChange={audioAssetId => setForm(current => ({ ...current, audioAssetId }))}
            label="Pista de audio"
            placeholder="Audio de las tomas"
            hint="Sustituye el audio original del montaje."
          />
          <MoneyField label="Máximo confirmado" cents={form.maxCostCents} onCents={cents => setForm(current => ({ ...current, maxCostCents: cents, confirmed: false }))} hint="El montaje local no cobra proveedor." />
        </div>
        <label className="studio-check">
          <input type="checkbox" checked={form.publish} onChange={event => setForm(current => ({ ...current, publish: event.target.checked }))} />
          Publicar además una copia inmutable del vídeo final
        </label>
        <div className="studio-confirm-row">
          <CostConfirmation checked={form.confirmed} onChange={confirmed => setForm(current => ({ ...current, confirmed }))} amountCents={form.maxCostCents} />
          <button
            type="button"
            className="studio-button primary"
            disabled={!canGenerate || !ready || !form.confirmed || Boolean(busy)}
            onClick={() => onAction('post-export', 'post/export', {
              body: {
                ...(form.subtitleAssetId ? { subtitleAssetId: form.subtitleAssetId } : {}),
                ...(form.audioAssetId ? { audioAssetId: form.audioAssetId } : {}),
                publish: form.publish,
                preset: form.preset,
                maxCostCents: form.maxCostCents ?? 0,
              },
              idem: 'post-export',
              success: 'Montaje lanzado; el máster aparecerá aquí y en Activos.',
            })}
          >
            {busy === 'post-export' ? <Spinner /> : <RiScissorsCutLine />} Montar máster
          </button>
        </div>

        {stats.exports.length ? (
          <div className="studio-masters">
            {stats.exports.map(asset => (
              <article key={asset.id}>
                <AssetMedia assetId={asset.id} kind="video" alt="Máster exportado" controls />
                <div>
                  <strong>{asset.status === 'published' ? 'Máster publicado' : 'Máster privado'}</strong>
                  <small>{formatDate(asset.createdAt)} · {asset.mimeType}</small>
                  <button type="button" className="studio-link" onClick={() => navigate(`/activos?asset=${encodeURIComponent(asset.id)}`)}>
                    Abrir en Activos <RiArrowRightSLine />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Entregables de preproducción"
        hint="La carpeta que se manda al cliente o al equipo: guion, planos y presupuesto en un documento trazable."
      >
        <div className="studio-document-export">
          <label className="studio-check">
            <input type="checkbox" checked={form.publishDocuments} onChange={event => setForm(current => ({ ...current, publishDocuments: event.target.checked }))} />
            Publicar copias inmutables
          </label>
          <button type="button" className="studio-button secondary" disabled={!canWrite || Boolean(busy)} onClick={() => onAction('documents', 'documents/export', { body: { publish: form.publishDocuments }, success: 'MD y PDF creados en la biblioteca de activos.' })}>
            {busy === 'documents' ? <Spinner /> : <RiFileTextLine />} Crear MD + PDF
          </button>
          <button type="button" className="studio-button ghost" onClick={() => navigate('/activos?kind=document')}>Ver documentos</button>
        </div>
      </Panel>
    </>
  )
}

function ReviewPanel({ production, canWrite }) {
  const exports = Array.isArray(production.exports) ? production.exports : []
  const [assetId, setAssetId] = useState(exports[0]?.id || '')
  const [label, setLabel] = useState('Revisión cliente')
  const [days, setDays] = useState('30')
  const [links, setLinks] = useState([])
  const [comments, setComments] = useState([])
  const [freshUrl, setFreshUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = `/api/studio/productions/${production.id}`

  const load = useCallback(async () => {
    try {
      const [linkResponse, commentResponse] = await Promise.all([apiFetch(`${base}/review-links`), apiFetch(`${base}/review-comments`)])
      if (linkResponse.ok) setLinks(await linkResponse.json())
      if (commentResponse.ok) setComments(await commentResponse.json())
    } catch { /* El resto del detalle sigue siendo utilizable si falla esta sección. */ }
  }, [base])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!assetId && exports[0]?.id) setAssetId(exports[0].id) }, [assetId, exports])

  async function createLink() {
    setBusy(true); setError(''); setFreshUrl('')
    try {
      const response = await apiFetch(`${base}/review-links`, {
        method: 'POST',
        body: JSON.stringify({ assetId, label: label.trim() || undefined, days: Number(days) || 30 }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo crear la sala.')
      setFreshUrl(`${window.location.origin}${body.reviewPath}`)
      await load()
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  async function revoke(linkId) {
    await apiFetch(`${base}/review-links/${linkId}`, { method: 'DELETE' })
    await load()
  }
  async function moderate(commentId, status) {
    await apiFetch(`${base}/review-comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    await load()
  }

  const open = comments.filter(comment => comment.status === 'open')

  return (
    <Panel
      title="Sala de revisión"
      hint="Comparte el máster con un enlace que caduca. El token solo se enseña al crearlo: si se pierde, se revoca y se crea otro."
      actions={null}
    >
      {exports.length === 0 ? (
        <EmptyInline icon={RiEyeLine} title="Aún no hay máster que revisar">Monta primero el vídeo final en la pestaña de montaje.</EmptyInline>
      ) : (
        <div className="studio-take-config">
          <label className="studio-field">
            <span>Máster</span>
            <select value={assetId} onChange={event => setAssetId(event.target.value)}>
              {exports.map(asset => <option key={asset.id} value={asset.id}>{asset.id.slice(0, 10)} · {formatDate(asset.createdAt)}</option>)}
            </select>
          </label>
          <label className="studio-field"><span>Etiqueta</span><input maxLength={120} value={label} onChange={event => setLabel(event.target.value)} /></label>
          <label className="studio-field">
            <span>Caducidad</span>
            <select value={days} onChange={event => setDays(event.target.value)}>
              {[7, 15, 30, 60, 90].map(value => <option key={value} value={value}>{value} días</option>)}
            </select>
          </label>
          <div className="studio-field studio-field-end">
            <button type="button" className="studio-button primary" disabled={!canWrite || !assetId || busy} onClick={createLink}>
              {busy ? <Spinner /> : <RiEyeLine />} Crear sala
            </button>
          </div>
        </div>
      )}
      <Message tone="error">{error}</Message>
      {freshUrl ? (
        <div className="studio-fresh-link">
          <input readOnly value={freshUrl} aria-label="Nuevo enlace de revisión" onFocus={event => event.target.select()} />
          <CopyButton value={freshUrl} label="Copiar enlace" />
        </div>
      ) : null}

      {links.length ? (
        <div className="studio-review-links">
          {links.map(link => (
            <article key={link.id} className={link.active ? '' : 'closed'}>
              <span>{link.active ? 'Activo' : 'Cerrado'}</span>
              <strong>{link.label || 'Sala sin etiqueta'}</strong>
              <small>Caduca {formatDate(link.expiresAt)} · {link.comments} nota{link.comments === 1 ? '' : 's'}</small>
              {link.active && canWrite ? (
                <button type="button" className="studio-button danger small" onClick={() => revoke(link.id)}>Revocar</button>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {comments.length ? (
        <>
          <h3 className="studio-subheading">Notas del cliente {open.length ? <b>{open.length} abiertas</b> : null}</h3>
          <div className="studio-comments">
            {comments.map(comment => (
              <article key={comment.id} className={comment.status}>
                <span className="studio-timecode">{formatTimecode(comment.timecodeMs)}</span>
                <div>
                  <strong>{comment.body}</strong>
                  <small>{comment.authorName || 'Invitado'} · {comment.status}</small>
                </div>
                {canWrite ? (
                  <div className="studio-comment-actions">
                    <button type="button" className="studio-button secondary small" onClick={() => moderate(comment.id, comment.status === 'resolved' ? 'open' : 'resolved')}>
                      {comment.status === 'resolved' ? 'Reabrir' : 'Resolver'}
                    </button>
                    {comment.status !== 'hidden' ? (
                      <button type="button" className="studio-button danger small" onClick={() => moderate(comment.id, 'hidden')}>Ocultar</button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </Panel>
  )
}

function CampaignPicker({ value, onChange }) {
  const [campaigns, setCampaigns] = useState(null) // null = aún sin respuesta
  useEffect(() => {
    let active = true
    apiFetch('/api/campaigns?limit=50')
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (active) setCampaigns(Array.isArray(data?.items) ? data.items : []) })
      .catch(() => { if (active) setCampaigns([]) })
    return () => { active = false }
  }, [])

  // Sin permiso de campañas o sin ninguna disponible, queda la vía manual: el
  // backend valida el id de todos modos.
  if (!campaigns?.length) {
    return (
      <label className="studio-field">
        <span>Campaña de atribución *</span>
        <input value={value} onChange={event => onChange(event.target.value)} placeholder="ID de una campaña con landing" />
        <small>{campaigns == null ? 'Cargando campañas…' : 'No se pudo listar tus campañas; pega el identificador.'}</small>
      </label>
    )
  }
  const withLanding = campaigns.filter(campaign => campaign.landingSlug)
  return (
    <label className="studio-field">
      <span>Campaña de atribución *</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Elige una campaña…</option>
        {withLanding.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        {campaigns.filter(campaign => !campaign.landingSlug).map(campaign => (
          <option key={campaign.id} value={campaign.id} disabled>{campaign.name} — sin landing publicada</option>
        ))}
      </select>
      <small>La atribución necesita una landing publicada para colgar el UTM.</small>
    </label>
  )
}

function PublishPanel({ production, canWrite, busy, onAction }) {
  const exports = Array.isArray(production.exports) ? production.exports : []
  const brief = asRecord(production.brief)
  const [form, setForm] = useState({
    assetId: exports[0]?.id || '',
    campaignId: '',
    text: `${production.title}\n\n${brief.objective || ''}`.trim(),
    cta: brief.cta || '',
    scheduledAt: '',
    platforms: ['instagram'],
  })
  useEffect(() => {
    if (!form.assetId && exports[0]?.id) setForm(current => ({ ...current, assetId: exports[0].id }))
  }, [exports, form.assetId])

  function togglePlatform(platform) {
    setForm(current => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter(value => value !== platform)
        : [...current.platforms, platform],
    }))
  }

  const ready = form.assetId && form.campaignId.trim() && form.text.trim() && form.platforms.length

  return (
    <Panel
      title="Publicación y atribución"
      hint="Metricool recibe el borrador desde la copia pública inmutable del máster, con un UTM propio de esta pieza para que el tráfico se pueda atribuir."
    >
      {exports.length === 0 ? (
        <EmptyInline icon={RiSendPlaneLine} title="Todavía no hay máster que publicar">
          Monta el vídeo final; cuando el job termine, el máster aparece aquí.
        </EmptyInline>
      ) : (
        <>
          <div className="studio-take-config">
            <label className="studio-field">
              <span>Máster de vídeo</span>
              <select value={form.assetId} onChange={event => setForm(current => ({ ...current, assetId: event.target.value }))}>
                {exports.map(asset => <option key={asset.id} value={asset.id}>{asset.id.slice(0, 10)} · {asset.status}</option>)}
              </select>
            </label>
            <CampaignPicker value={form.campaignId} onChange={campaignId => setForm(current => ({ ...current, campaignId }))} />
            <label className="studio-field"><span>Programar</span><input type="datetime-local" value={form.scheduledAt} onChange={event => setForm(current => ({ ...current, scheduledAt: event.target.value }))} /></label>
            <label className="studio-field"><span>CTA</span><input value={form.cta} onChange={event => setForm(current => ({ ...current, cta: event.target.value }))} maxLength={160} /></label>
          </div>
          <div className="studio-publish-body">
            <label className="studio-field">
              <span>Texto de publicación *</span>
              <textarea rows={5} maxLength={5000} value={form.text} onChange={event => setForm(current => ({ ...current, text: event.target.value }))} />
              <small>{form.text.length} / 5000</small>
            </label>
            <AssetMedia assetId={form.assetId} kind="video" alt="Máster a publicar" controls className="preview" />
          </div>
          <div className="studio-confirm-row">
            <div className="studio-platforms" role="group" aria-label="Plataformas">
              {PUBLISH_PLATFORMS.map(platform => (
                <label className="studio-check" key={platform}>
                  <input type="checkbox" checked={form.platforms.includes(platform)} onChange={() => togglePlatform(platform)} />
                  {platform}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="studio-button primary"
              disabled={!canWrite || !ready || Boolean(busy)}
              onClick={() => onAction('metricool-publish', 'publish/metricool', {
                body: {
                  assetId: form.assetId,
                  campaignId: form.campaignId.trim(),
                  text: form.text.trim(),
                  platforms: form.platforms,
                  ...(form.cta.trim() ? { cta: form.cta.trim() } : {}),
                  ...(form.scheduledAt ? { scheduledAt: new Date(form.scheduledAt).toISOString() } : {}),
                },
                success: 'Borrador enviado a Metricool con atribución UTM.',
              })}
            >
              {busy === 'metricool-publish' ? <Spinner /> : <RiSendPlaneLine />} Enviar a Metricool
            </button>
          </div>
        </>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Documento exportable
// ---------------------------------------------------------------------------

function buildMarkdown(production, estimate) {
  const brief = asRecord(production.brief)
  const lines = [
    `# ${production.title}`, '',
    `Estado: ${phaseMeta(production.status).label}`,
    `Creado: ${formatDate(production.createdAt)}`, '',
    '## Brief', '',
    `- Objetivo: ${brief.objective || '—'}`,
    `- Audiencia: ${brief.audience || '—'}`,
    `- Canal: ${brief.channel || '—'}`,
    `- Duración: ${brief.durationS || '—'} s`,
    `- CTA: ${brief.cta || '—'}`,
    `- Restricciones: ${brief.constraints || '—'}`, '',
    '## Presupuesto', '',
    `- Gastado: ${formatCents(production.spentCents)}`,
    `- Pendiente estimado: ${estimate ? formatCents(estimate.totalCents) : '—'}`,
    `- Tope: ${production.budgetCents == null ? 'Sin tope' : formatCents(production.budgetCents)}`, '',
  ]
  if (production.bibleEntries?.length) {
    lines.push('## Biblia', '')
    production.bibleEntries.forEach(entry => lines.push(`- [${entry.kind}] ${entry.name} — ${entry.refAssetIds?.length || 0} referencias`))
    lines.push('')
  }
  if (production.concepts?.length) {
    lines.push('## Conceptos', '')
    production.concepts.forEach(concept => lines.push(
      `### ${concept.title} (${concept.status})`, '',
      concept.logline || '', '',
      asRecord(concept.treatment).treatment || '', '',
    ))
  }
  if (production.scenes?.length) {
    lines.push('## Guion y planos', '')
    production.scenes.forEach(scene => {
      const script = asRecord(scene.scriptText)
      lines.push(`### Escena ${scene.order}`, '', `Acción: ${script.action || '—'}`, `VO: ${script.vo || '—'}`, `Diálogo: ${script.dialogue || '—'}`, '')
      scene.shots?.forEach(shot => {
        const spec = asRecord(shot.spec)
        lines.push(`- Plano ${shot.order}: ${spec.framing || '—'} · ${spec.movement || '—'} · ${spec.durationS || '—'} s — ${spec.action || '—'}`)
      })
      lines.push('')
    })
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Detalle de la producción
// ---------------------------------------------------------------------------

function ProductionDetail({ id, permissions }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [production, setProduction] = useState(null)
  const [estimate, setEstimate] = useState(null)
  const [takeTable, setTakeTable] = useState([])
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(null)
  const [editing, setEditing] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const [lightbox, setLightbox] = useState(-1)
  const [autoSyncing, setAutoSyncing] = useState(false)
  const idempotency = useRef(new Map())

  const canWrite = permissions.has('social.write')
  const canGenerate = canWrite && permissions.has('costs.request')
  const tabParam = searchParams.get('tab')
  const tab = TABS.some(item => item.id === tabParam) ? tabParam : null

  const setTab = useCallback(next => {
    setSearchParams(current => {
      const params = new URLSearchParams(current)
      params.set('tab', next)
      return params
    }, { replace: true })
  }, [setSearchParams])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState('loading')
    try {
      const [detailResponse, estimateResponse, takesResponse] = await Promise.all([
        apiFetch(`/api/studio/productions/${id}`),
        apiFetch(`/api/studio/productions/${id}/estimate`),
        apiFetch(`/api/studio/productions/${id}/takes`),
      ])
      if (!detailResponse.ok) throw new Error(`production_${detailResponse.status}`)
      const [detail, estimateData, takesData] = await Promise.all([
        detailResponse.json(),
        estimateResponse.ok ? estimateResponse.json() : Promise.resolve(null),
        takesResponse.ok ? takesResponse.json() : Promise.resolve([]),
      ])
      setProduction(detail)
      setEstimate(estimateData)
      setTakeTable(Array.isArray(takesData) ? takesData : [])
      setState('ready')
    } catch (error) {
      if (!silent) setState(String(error?.message).endsWith('_404') ? 'missing' : 'error')
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const action = useCallback(async (key, path, options = {}) => {
    setBusy(key)
    setMessage(null)
    try {
      // La clave de idempotencia sobrevive a los reintentos: si la petición se
      // cortó después de encolar, repetirla no cobra dos veces.
      let body = options.body
      if (options.idem) {
        if (!idempotency.current.has(options.idem)) {
          idempotency.current.set(options.idem, `${options.idem}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
        }
        body = { ...asRecord(body), idempotencyKey: idempotency.current.get(options.idem) }
      }
      const response = await apiFetch(`/api/studio/productions/${id}/${path}`, {
        method: options.method || 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ tone: 'error', text: payload.error || `La acción falló (${response.status}).` })
        return false
      }
      if (options.idem) idempotency.current.delete(options.idem)
      await load({ silent: true })
      setMessage({ tone: 'ok', text: options.success || 'Paso completado.' })
      return payload
    } catch {
      setMessage({ tone: 'error', text: 'No hay conexión con el servidor. Inténtalo de nuevo.' })
      return false
    } finally {
      setBusy('')
    }
  }, [id, load])

  // Datos derivados -------------------------------------------------------
  const jobByTakeId = useMemo(() => {
    const map = new Map()
    takeTable.forEach(scene => (scene.shots || []).forEach(shot => (shot.takes || []).forEach(take => {
      map.set(take.id, take.job || null)
    })))
    return map
  }, [takeTable])

  const shots = useMemo(
    () => (production ? collectShots(production.scenes || [], jobByTakeId) : []),
    [production, jobByTakeId],
  )
  const stats = useMemo(() => (production ? productionStats(production, shots) : null), [production, shots])
  const concepts = useMemo(() => production?.concepts || [], [production])
  const step = useMemo(
    () => (production && stats ? nextStep({ production, stats, shots, concepts, canGenerate, estimate }) : null),
    [production, stats, shots, concepts, canGenerate, estimate],
  )

  // Primera pestaña: la de la fase en la que está la producción.
  useEffect(() => {
    if (production && !tab) setTab(PHASE_TAB[production.status] || 'brief')
  }, [production, tab, setTab])

  const live = Boolean(stats && (stats.activeTakes.length || stats.generatingBoards.length))
  const needsSettle = Boolean(stats && stats.settleable.length)

  // Refresco vivo: casi todo el pipeline es asíncrono y antes había que pulsar
  // «Sincronizar» a mano para enterarse de que un proveedor ya había respondido.
  useEffect(() => {
    if (!live || state !== 'ready') return undefined
    const timer = setInterval(() => { load({ silent: true }) }, POLL_MS)
    return () => clearInterval(timer)
  }, [live, state, load])

  // Consolidación automática: solo cuando hay trabajo terminado sin liquidar.
  // Es idempotente en el servidor (guardas `budgetSettled` y status
  // `generating`), así que repetirla no mueve el presupuesto dos veces.
  useEffect(() => {
    if (!canWrite || state !== 'ready') return undefined
    const generating = stats?.generatingBoards.length || 0
    if (!needsSettle && !generating) return undefined
    let cancelled = false
    let failures = 0
    let timer = null
    async function sync() {
      if (cancelled) return
      setAutoSyncing(true)
      try {
        const responses = []
        if (needsSettle) responses.push(await apiFetch(`/api/studio/productions/${id}/takes/sync`, { method: 'POST' }))
        if (generating) responses.push(await apiFetch(`/api/studio/productions/${id}/storyboard/sync`, { method: 'POST' }))
        failures = responses.every(response => response.ok) ? 0 : failures + 1
        if (!cancelled) await load({ silent: true })
      } catch {
        failures += 1
      } finally {
        if (!cancelled) setAutoSyncing(false)
      }
      // Si el servidor rechaza la consolidación (permiso, 5xx) reintentarla cada
      // 16 s para siempre solo genera ruido: se deja el botón manual del panel.
      if (failures >= 3 && timer) { clearInterval(timer); timer = null }
    }
    sync()
    timer = setInterval(sync, AUTO_SYNC_MS)
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [canWrite, state, needsSettle, stats?.generatingBoards.length, id, load])

  // Atajos de teclado -----------------------------------------------------
  useEffect(() => {
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (lightbox >= 0 || editing || shortcuts) return
      const index = Number(event.key)
      if (Number.isInteger(index) && index >= 1 && index <= TABS.length) { setTab(TABS[index - 1].id); return }
      if ((event.key === 'n' || event.key === 'N') && step?.tab) { setTab(step.tab); return }
      if (event.key === '?') setShortcuts(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setTab, step, lightbox, editing, shortcuts])

  async function archiveProduction() {
    if (!window.confirm('¿Archivar esta producción? Dejará de aparecer en la lista.')) return
    setBusy('archive')
    setMessage(null)
    try {
      const response = await apiFetch(`/api/studio/productions/${id}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 204) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo archivar.')
      }
      navigate('/studio', { replace: true })
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally {
      setBusy('')
    }
  }

  async function downloadMetadata() {
    setBusy('metadata')
    try {
      const response = await apiFetch(`/api/studio/productions/${id}/export-metadata`)
      if (!response.ok) throw new Error('No se pudo generar el paquete de metadatos.')
      const payload = await response.json()
      downloadBlob(JSON.stringify(payload, null, 2), `${slugify(production.title) || 'produccion'}-metadatos.json`, 'application/json')
      setMessage({ tone: 'ok', text: `Paquete v${payload.schemaVersion} descargado con su checksum.` })
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally {
      setBusy('')
    }
  }

  if (state === 'loading') return <PageLoadingState label="Cargando producción" />
  if (state === 'error' || state === 'missing') {
    return (
      <main className="studio-page">
        <div className="studio-shell">
          <button type="button" className="studio-back" onClick={() => navigate('/studio')}><RiArrowLeftLine /> Studio</button>
          <div className="studio-state error">
            <RiErrorWarningLine />
            <strong>{state === 'missing' ? 'Producción no encontrada' : 'No se pudo cargar la producción'}</strong>
            <button type="button" className="studio-button secondary" onClick={() => load()}>Reintentar</button>
          </div>
        </div>
      </main>
    )
  }

  const brief = stats.brief
  const boardedShots = shots.filter(shot => shot.storyboardAssetId)
  const frames = boardedShots.map(shot => {
    const spec = asRecord(shot.spec)
    return {
      assetId: shot.storyboardAssetId,
      kind: 'image',
      title: `Escena ${shot.sceneOrder} · Plano ${shot.order}`,
      subtitle: spec.action || '',
      meta: [
        { label: 'Encuadre', value: spec.framing },
        { label: 'Cámara', value: spec.movement },
        { label: 'Duración', value: spec.durationS ? `${spec.durationS} s` : '' },
        { label: 'Audio', value: spec.audio },
        { label: 'Calidad', value: spec.recommendedTier },
      ],
    }
  })

  const phaseIndex = Math.max(0, PHASE_ORDER.indexOf(production.status))
  const budget = production.budgetCents
  const spent = Number(production.spentCents || 0)
  const projected = spent + Number(estimate?.totalCents || 0)
  const overBudget = budget != null && projected > budget

  const tabCounts = {
    brief: production.bibleEntries?.length || null,
    concepts: concepts.length || null,
    script: stats.scenes.length || null,
    storyboard: shots.length || null,
    takes: shots.reduce((sum, shot) => sum + shot.takes.length, 0) || null,
    post: stats.exports.length || null,
    review: null,
    publish: null,
  }

  return (
    <main className="studio-page dark-scroll">
      <div className="studio-shell">
        <button type="button" className="studio-back" onClick={() => navigate('/studio')}><RiArrowLeftLine /> Producciones</button>

        <header className="studio-detail-header studio-rise">
          <div className="studio-detail-title">
            <span className="studio-detail-icon" style={{ '--status': phaseMeta(production.status).color }}><RiClapperboardLine /></span>
            <div>
              <h1>{production.title}</h1>
              <p>
                {brief.channel || 'canal sin definir'} · {brief.durationS || '—'} s · {stats.scenes.length} escenas · {shots.length} planos
                {' · '}creada {formatDate(production.createdAt)}
              </p>
            </div>
            <PhaseBadge status={production.status} />
            {live ? (
              <span className="studio-live" title="Refrescando mientras hay trabajos en curso">
                <i />{autoSyncing ? 'Consolidando' : 'En vivo'}
              </span>
            ) : null}
          </div>
          <div className="studio-header-actions">
            <button type="button" className="studio-button ghost" onClick={() => downloadBlob(buildMarkdown(production, estimate), `${slugify(production.title) || 'produccion'}.md`, 'text/markdown;charset=utf-8')}>
              <RiDownload2Line /> Guion .md
            </button>
            <button type="button" className="studio-button ghost" disabled={busy === 'metadata'} onClick={downloadMetadata}>
              {busy === 'metadata' ? <Spinner /> : <RiFileTextLine />} Paquete .json
            </button>
            {canWrite ? <button type="button" className="studio-button secondary" onClick={() => setEditing(true)}>Editar</button> : null}
            {canWrite ? <button type="button" className="studio-button danger" disabled={Boolean(busy)} onClick={archiveProduction}>Archivar</button> : null}
          </div>
        </header>

        <nav className="studio-pipeline studio-rise" aria-label="Fases de la producción">
          {PHASE_ORDER.map((phase, index) => {
            const meta = PHASE_META[phase]
            const cls = index < phaseIndex ? 'done' : index === phaseIndex ? 'now' : ''
            return (
              <button
                key={phase}
                type="button"
                className={cls}
                style={{ '--status': meta.color }}
                onClick={() => setTab(PHASE_TAB[phase])}
                aria-current={index === phaseIndex ? 'step' : undefined}
              >
                <i><meta.icon aria-hidden="true" /></i>
                <span>{meta.label}</span>
              </button>
            )
          })}
        </nav>

        {message ? <Message tone={message.tone}>{message.text}</Message> : null}
        {!canWrite ? <Message tone="info">Tu rol tiene acceso de lectura: las decisiones y las generaciones están deshabilitadas.</Message> : null}
        {canWrite && !canGenerate ? <Message tone="info">Puedes editar y aprobar, pero tu rol no tiene permiso para solicitar gasto de IA.</Message> : null}

        {step ? (
          <section className={`studio-next ${step.tone || ''}`.trim()}>
            <div>
              <span>Siguiente paso</span>
              <strong>{step.title}</strong>
              <p>{step.hint}</p>
            </div>
            <div className="studio-next-actions">
              {step.action ? (
                <button
                  type="button"
                  className="studio-button primary"
                  disabled={Boolean(busy)}
                  onClick={() => { setTab(step.tab); action(step.action.key, step.action.path, { body: step.action.body, success: step.action.success }) }}
                >
                  {busy === step.action.key ? <Spinner /> : <step.action.icon />} {step.action.label}
                </button>
              ) : null}
              {step.tab !== tab ? (
                <button type="button" className="studio-button secondary" onClick={() => setTab(step.tab)}>
                  Ir al paso <RiArrowRightSLine />
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className={`studio-budget${overBudget ? ' over' : ''}`} aria-label="Presupuesto">
          <div><span>Gastado</span><strong>{formatCents(spent)}</strong></div>
          <div><span>Pendiente estimado</span><strong>{estimate ? formatCents(estimate.totalCents) : 'No disponible'}</strong></div>
          <div><span>Proyección</span><strong className={overBudget ? 'bad' : ''}>{formatCents(projected)}</strong></div>
          <div><span>Tope</span><strong>{budget == null ? 'Sin tope' : formatCents(budget)}</strong></div>
          {budget != null ? (
            <div className="studio-budget-track">
              <Meter
                value={spent}
                max={budget}
                tone={overBudget ? 'bad' : ''}
                /* Un tope de 0 € es válido (congela la producción) y dividir por
                   él anunciaba «Infinity% consumido» al lector de pantalla. */
                label={budget > 0 ? `${Math.round((spent / budget) * 100)}% del presupuesto consumido` : 'Presupuesto congelado en cero'}
              />
              {overBudget ? <small>La proyección supera el tope: el backend rechazará las generaciones que lo excedan.</small> : null}
            </div>
          ) : null}
          {estimate?.unavailable?.length ? <p>{estimate.unavailable.join(' · ')}</p> : null}
        </section>

        <nav className="studio-tabs" aria-label="Secciones de la producción">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              title={`${item.label} (${index + 1})`}
            >
              <item.icon /> {item.label}
              {tabCounts[item.id] ? <b>{tabCounts[item.id]}</b> : null}
            </button>
          ))}
          <button type="button" className="studio-tabs-help" onClick={() => setShortcuts(true)} aria-label="Atajos de teclado">?</button>
        </nav>

        <div className="studio-stack">
          {tab === 'brief' ? (
            <>
              <Panel title="Brief" hint="La fuente única de la que salen conceptos, guion, planos y prompts de imagen.">
                <dl className="studio-brief-grid">
                  <div><dt>Objetivo</dt><dd>{brief.objective || '—'}</dd></div>
                  <div><dt>Audiencia</dt><dd>{brief.audience || '—'}</dd></div>
                  <div><dt>Llamada a la acción</dt><dd>{brief.cta || '—'}</dd></div>
                  <div><dt>Restricciones</dt><dd>{brief.constraints || '—'}</dd></div>
                </dl>
                <div className="studio-coverage">
                  <div><span>Canal</span><strong>{brief.channel || '—'}</strong></div>
                  <div><span>Duración objetivo</span><strong>{formatSeconds(stats.targetSeconds)}</strong></div>
                  <div><span>Metraje planificado</span><strong>{shots.length ? formatSeconds(stats.plannedSeconds) : '—'}</strong><small>{shots.length ? `${shots.length} planos` : 'sin planos aún'}</small></div>
                  <div><span>Entradas de biblia</span><strong>{production.bibleEntries?.length || 0}</strong></div>
                </div>
              </Panel>
              <BiblePanel
                entries={production.bibleEntries || []}
                canWrite={canWrite}
                busy={Boolean(busy)}
                onCreate={payload => action('bible', 'bible', { body: payload, success: 'Entrada añadida a la biblia.' })}
                onUpdate={(entryId, payload) => action(`bible-${entryId}`, `bible/${entryId}`, { method: 'PUT', body: payload, success: 'Entrada de la biblia actualizada.' })}
              />
            </>
          ) : null}

          {tab === 'concepts' ? (
            <ConceptsPanel concepts={concepts} canWrite={canWrite} canGenerate={canGenerate} busy={busy} onAction={action} />
          ) : null}

          {tab === 'script' ? (
            <ScriptPanel
              scenes={stats.scenes}
              stats={stats}
              approved={concepts.some(concept => concept.status === 'approved')}
              canGenerate={canGenerate}
              busy={busy}
              onAction={action}
            />
          ) : null}

          {tab === 'storyboard' ? (
            <StoryboardPanel
              shots={shots}
              stats={stats}
              estimate={estimate}
              canWrite={canWrite}
              canGenerate={canGenerate}
              busy={busy}
              onAction={action}
              onOpenFrame={index => setLightbox(index)}
            />
          ) : null}

          {tab === 'takes' ? (
            <TakesPanel shots={shots} stats={stats} estimate={estimate} canWrite={canWrite} canGenerate={canGenerate} busy={busy} onAction={action} />
          ) : null}

          {tab === 'post' ? (
            <PostPanel stats={stats} shots={shots} canWrite={canWrite} canGenerate={canGenerate} busy={busy} onAction={action} navigate={navigate} />
          ) : null}

          {tab === 'review' ? <ReviewPanel production={production} canWrite={canWrite} /> : null}

          {tab === 'publish' ? <PublishPanel production={production} canWrite={canWrite} busy={busy} onAction={action} /> : null}
        </div>
      </div>

      {lightbox >= 0 && frames.length ? (
        <MediaLightbox
          items={frames}
          index={Math.min(lightbox, frames.length - 1)}
          onIndex={setLightbox}
          onClose={() => setLightbox(-1)}
        />
      ) : null}
      {editing ? (
        <EditProductionModal
          production={production}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load({ silent: true }); setMessage({ tone: 'ok', text: 'Producción actualizada.' }) }}
        />
      ) : null}
      {shortcuts ? <ShortcutsModal onClose={() => setShortcuts(false)} /> : null}
    </main>
  )
}

export default function StudioPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const permissions = useMemo(() => getEffectiveNavigationPermissions(user), [user])
  return id
    ? <ProductionDetail id={id} permissions={permissions} />
    : <ProductionsList canWrite={permissions.has('social.write')} />
}
