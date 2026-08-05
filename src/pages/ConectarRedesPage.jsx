import { useEffect, useState } from 'react'
import {
  RiAlertLine, RiArrowRightSLine, RiBarChartLine, RiCheckLine, RiCloseLine,
  RiExternalLinkLine, RiFacebookBoxFill, RiGlobalLine, RiImageAddLine,
  RiInstagramLine, RiLinkedinBoxFill, RiRefreshLine, RiShareForwardLine,
  RiSparkling2Line, RiTiktokFill, RiTimeLine, RiTwitterXFill, RiYoutubeFill,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import { DEMO_MODE } from '../lib/dataMode'
import { classifyFetchError, statusMessage } from '../lib/dataStatus'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import CaptureJourney from '../components/capture/CaptureJourney'
import '../dashboard.css'
import './social.css'

// Metricool gestiona la planificación y publicación de los posts orgánicos:
// esta página es una capa fina de conexión (workspace por Organization) + copiloto de
// contenido y enlace al planificador de Metricool.
// no se reconstruyen aquí, se embeben.

const PLATFORM_META = {
  instagram: { name: 'Instagram', color: '#e1306c', Icon: RiInstagramLine },
  linkedin: { name: 'LinkedIn', color: '#0a66c2', Icon: RiLinkedinBoxFill },
  facebook: { name: 'Facebook', color: '#1877f2', Icon: RiFacebookBoxFill },
  tiktok: { name: 'TikTok', color: '#25f4ee', Icon: RiTiktokFill },
  youtube: { name: 'YouTube', color: '#ff4d67', Icon: RiYoutubeFill },
  x: { name: 'X', color: 'var(--text)', Icon: RiTwitterXFill },
}

function platformMeta(name) {
  return PLATFORM_META[String(name ?? '').toLowerCase()] ?? { name: name ?? 'Canal', color: 'var(--accent-soft)', Icon: RiGlobalLine }
}

function formatShortDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(localeCode(getLocale()), { day: '2-digit', month: 'short' })
}

function renderAnalyticsValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString(localeCode(getLocale()))
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `${value.length} elemento${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return `${Object.keys(value).length} campo${Object.keys(value).length === 1 ? '' : 's'}`
  return String(value)
}

function AnalyticsPanel({ data, status, onRetry }) {
  if (status === 'loading') return <div className="social-side-empty"><RiBarChartLine aria-hidden="true" /><p>Cargando métricas…</p></div>
  if (status === 'error' || status === 'disconnected') return <div className="social-side-empty"><RiAlertLine aria-hidden="true" /><p>No se pudieron cargar las métricas.</p>{onRetry && <button type="button" className="social-text-button" onClick={onRetry}>Reintentar <RiRefreshLine /></button>}</div>
  const entries = data && typeof data === 'object' ? Object.entries(data) : []
  if (!entries.length) {
    return <div className="social-side-empty"><RiBarChartLine aria-hidden="true" /><p>Todavía no hay métricas disponibles. Aparecerán cuando Metricool reporte actividad de tus redes.</p></div>
  }
  return (
    <div className="social-analytics-list">
      {entries.map(([key, value]) => (
        <div className="social-analytics-row" key={key}><span><i style={{ background: 'var(--accent-soft)' }} />{key}</span><strong>{renderAnalyticsValue(value)}</strong></div>
      ))}
    </div>
  )
}

/**
 * Medios: subir y generar. Los usan el copiloto (por post del plan) y el
 * Estudio (por pieza), así que devuelven la URL pública y no tocan estado:
 * quién la guarda y dónde es decisión de cada pantalla.
 */
async function uploadMedia(file) {
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
  const res = await apiFetch('/api/metricool/media', { method: 'POST', body: JSON.stringify({ data }) })
  const payload = await res.json().catch(() => null)
  if (!res.ok || !payload?.imageUrl) throw new Error(payload?.error || 'No se pudo subir la imagen.')
  return payload.imageUrl
}

/**
 * Convierte una slide SVG con plantilla de marca en el PNG que Metricool
 * descarga (idea 7).
 *
 * Lo hace el navegador y no el backend a propósito: rasterizar en Node exigiría
 * una dependencia nativa (sharp, resvg) para algo que aquí ya está resuelto. El
 * SVG llega con el logo empotrado en base64 porque un `<image href>` externo no
 * se carga al dibujarlo en un canvas —el navegador lo bloquea— y el carrusel
 * saldría sin logo justo al convertirlo.
 */
async function rasterizeSlide(svgUrl, size = 1080) {
  const response = await fetch(svgUrl)
  if (!response.ok) throw new Error('No se pudo leer la slide.')
  const svg = await response.text()

  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('No se pudo dibujar la slide.'))
      element.src = blobUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    canvas.getContext('2d').drawImage(image, 0, 0, size, size)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('No se pudo convertir la slide a imagen.')
    return new File([blob], 'slide.png', { type: 'image/png' })
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

async function generateMedia(prompt) {
  const res = await apiFetch('/api/metricool/ai/image', { method: 'POST', body: JSON.stringify({ prompt }) })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.imageUrl) throw new Error(data?.error || 'No se pudo generar la imagen.')
  return data.imageUrl
}

const OPPORTUNITY_META = {
  objection: { label: 'Objeción detectada', tone: 'warn' },
  faq: { label: 'Pregunta frecuente', tone: 'info' },
  competitor: { label: 'Comparación con competidor', tone: 'warn' },
  pre_purchase: { label: 'Señal pre-compra', tone: 'success' },
  emotional: { label: 'Frase emocional', tone: 'info' },
  success_story: { label: 'Historia de éxito', tone: 'success' },
}

/**
 * Modos objetivo (§1 chip, §2 selector). Espejo de `PIECE_OBJECTIVES` en
 * `contentStudio.service.ts`: el vocabulario es cerrado, así que el chip del
 * Radar y el selector del Estudio hablan del mismo objetivo.
 */
const OBJECTIVE_LABEL = {
  educar: 'Educar',
  resolver_objecion: 'Resolver la objeción',
  diferenciar: 'Diferenciarnos',
  convertir: 'Convertir',
  conectar: 'Conectar',
  demostrar: 'Demostrar',
}

const OBJECTIVE_BY_TYPE = {
  objection: 'resolver_objecion',
  faq: 'educar',
  competitor: 'diferenciar',
  pre_purchase: 'convertir',
  emotional: 'conectar',
  success_story: 'demostrar',
}

function defaultObjectiveFor(type) {
  return OBJECTIVE_BY_TYPE[type] ?? 'educar'
}

const PIPELINE_LABEL = {
  new: 'nuevos',
  contacted: 'contactados',
  qualified: 'cualificados',
  unqualified: 'descartados',
  converted: 'convertidos',
  desconocido: 'sin estado',
}

/**
 * Radar de oportunidades — `docs/xarly/pantallas.md` §1, la pantalla estrella.
 *
 * Dos reglas de producto viven aquí:
 *
 * - **La cabecera cuenta lo analizado, no lo encontrado.** "Ha analizado N
 *   conversaciones" es lo que hace creíble el "y ha encontrado M".
 * - **Estado vacío honesto** (idea 26): sin señales suficientes se dice, nunca
 *   se rellena con tarjetas genéricas.
 */
function RadarPanel({ data, loading, busy, onRefresh, onDismiss, onEvidence, evidence, onCloseEvidence, onGenerate, onOwnIdea }) {
  const opportunities = data?.opportunities ?? []

  return (
    <section className="social-section radar-section" aria-labelledby="radar-title">
      <div className="social-section-heading">
        <div>
          <h2 id="radar-title">
            {loading
              ? 'Analizando conversaciones…'
              : `Vendrava ha analizado ${data?.conversationsAnalyzed ?? 0} conversaciones y ha encontrado ${opportunities.length} ${opportunities.length === 1 ? 'oportunidad' : 'oportunidades'} de contenido esta semana.`}
          </h2>
          <p>Cada oportunidad sale de conversaciones reales y guarda de dónde salió.</p>
        </div>
        <div className="radar-actions">
          {/* El generador libre no desaparece: baja a acción secundaria (§1). */}
          <button className="social-button ghost" onClick={onOwnIdea}>Crear desde una idea propia</button>
          <button className="social-button ghost" onClick={onRefresh} disabled={busy || loading}>
            <RiRefreshLine /> {busy ? 'Analizando…' : 'Volver a analizar'}
          </button>
        </div>
      </div>

      {loading ? null : opportunities.length ? (
        <div className="radar-grid">
          {opportunities.map(opportunity => {
            const meta = OPPORTUNITY_META[opportunity.type] ?? { label: opportunity.type, tone: 'info' }
            return (
              <article className={`radar-card tone-${meta.tone}`} key={opportunity.id}>
                <header>
                  <span className="radar-type">{meta.label}</span>
                  {/* El chip es el modo objetivo con el que se abrirá el
                      Estudio, no el texto libre del análisis (§1). */}
                  <span className="radar-objective">{OBJECTIVE_LABEL[defaultObjectiveFor(opportunity.type)]}</span>
                </header>
                <strong className="radar-summary">{opportunity.summary}</strong>
                <dl className="radar-fields">
                  <div><dt>Oportunidad</dt><dd>{opportunity.title}</dd></div>
                  <div>
                    <dt>Evidencias</dt>
                    <dd>
                      {opportunity.evidenceCount} {opportunity.evidenceCount === 1 ? 'mención' : 'menciones'} en {opportunity.conversationsScanned} conversaciones
                      <button type="button" className="radar-link" onClick={() => onEvidence(opportunity.id)}>ver</button>
                    </dd>
                  </div>
                </dl>
                <footer>
                  <button className="social-button ghost" onClick={() => onDismiss(opportunity.id)}>Descartar</button>
                  <button className="social-button primary" onClick={() => onGenerate(opportunity)}>Generar campaña</button>
                </footer>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="radar-empty">
          Esta semana no hay suficientes señales para proponer contenido con evidencia.
          Conecta más llamadas o vuelve el lunes.
        </p>
      )}

      {evidence ? (
        <div className="radar-evidence" role="status">
          <div className="radar-evidence-head">
            <strong>{evidence.title}</strong>
            <button type="button" onClick={onCloseEvidence} aria-label="Cerrar evidencias"><RiCloseLine /></button>
          </div>
          <p>{evidence.summary}</p>
          {/* Conteos y referencias, nunca la transcripción: la cita literal
              exige ContactConsent y aprobación expresa (README). */}
          <small>{evidence.calls.length} llamadas y {evidence.conversations.length} conversaciones sustentan esta oportunidad. Se muestran referencias, no transcripciones.</small>
        </div>
      ) : null}
    </section>
  )
}

const FORMAT_LABEL = {
  post: 'Post',
  carousel: 'Carrusel',
  reel_script: 'Guion de Reel',
  stories: '3 stories',
  email: 'Email',
  voiceover: 'Locución',
}

/** Cómo se lee cada movimiento del historial de una pieza (§3). */
const HISTORY_LABEL = {
  comment: 'comentó',
  submitted: 'la envió a aprobación',
  edited: 'la editó',
  approved: 'la aprobó',
  rejected: 'la rechazó',
  published: 'creó el borrador',
}

const REJECTION_LABEL = {
  no_suena_a_nosotros: 'No suena a nosotros',
  dato_incorrecto: 'Hay un dato incorrecto',
  no_es_prioridad: 'No es prioridad ahora',
  ya_lo_hemos_contado: 'Ya lo hemos contado',
  demasiado_generico: 'Demasiado genérico',
}

/**
 * Convierte el cuerpo de una pieza en texto editable, según su formato.
 *
 * Los formatos de la fase 2 (stories, email, locución) tienen su propia forma:
 * antes cualquier formato desconocido caía en hook/body/cta y unas stories se
 * habrían editado —y publicado— vacías.
 */
function pieceToText(piece) {
  const body = piece.body ?? {}
  if (piece.format === 'post') return body.text ?? ''
  if (piece.format === 'carousel') return [body.title, ...(body.slides ?? [])].join('\n')
  if (piece.format === 'stories') return (body.stories ?? []).map(story => story?.text ?? '').join('\n')
  if (piece.format === 'email') return [body.subject, body.preheader, body.body].filter(Boolean).join('\n')
  return [body.hook, body.body, body.cta].filter(Boolean).join('\n')
}

/** Y de vuelta: el mismo formato que espera el backend. */
function textToPiece(piece, text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  if (piece.format === 'post') return { text }
  if (piece.format === 'carousel') return { title: lines[0] ?? '', slides: lines.slice(1) }
  if (piece.format === 'stories') {
    // El sticker no se edita como texto: se conserva el que traía cada story,
    // porque es una interacción sugerida, no una frase del guion.
    const previous = piece.body?.stories ?? []
    return { stories: lines.slice(0, 3).map((line, index) => ({ text: line, sticker: previous[index]?.sticker ?? '' })) }
  }
  if (piece.format === 'email') {
    return { ...(piece.body ?? {}), subject: lines[0] ?? '', preheader: lines[1] ?? '', body: lines.slice(2).join('\n\n') }
  }
  const script = { hook: lines[0] ?? '', body: lines.slice(1, -1).join(' '), cta: lines[lines.length - 1] ?? '' }
  // La locución lleva además el guion locutado, el motor y la duración. Sin
  // conservarlos, editar el texto borraba de qué voz salió el audio y por qué
  // no sonaba, y la pieza pasaba a decir "voz desconocida" sin que nadie lo
  // hubiera cambiado. El `script` sí se rehace: es el texto que se acaba de
  // escribir, y dejarlo con el anterior sería guardar dos textos distintos.
  if (piece.format === 'voiceover') {
    return { ...(piece.body ?? {}), ...script, script: [script.hook, script.body, script.cta].filter(Boolean).join(' ') }
  }
  return script
}

const IMAGE_BUSY_STATES = ['uploading', 'generating', 'removing']

/**
 * Chequeo de especificidad (idea 27) de una pieza.
 *
 * Enseña las dos mitades, y la segunda es la que importa: lo que se sustituyó se
 * cita con su documento —para poder desconfiar del dato yendo a la fuente— y lo
 * que sigue genérico se dice, porque un hueco señalado se arregla y un hueco
 * escondido se publica.
 */
function SpecificityNote({ specificity }) {
  const flags = specificity?.flags ?? []
  if (!flags.length) return null

  const replaced = flags.filter(flag => flag.replacedWith)
  const pending = flags.filter(flag => !flag.replacedWith)

  return (
    <div className="studio-specificity">
      {replaced.length ? (
        <details>
          <summary className="is-ok">
            {replaced.length} {replaced.length === 1 ? 'frase genérica sustituida' : 'frases genéricas sustituidas'} con datos reales
          </summary>
          <ul>
            {replaced.map((flag, index) => (
              <li key={`ok-${index}`}>
                «{flag.phrase}» → <strong>{flag.replacedWith}</strong>
                {flag.sourceName ? <em> · de «{flag.sourceName}»</em> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {pending.length ? (
        <details>
          <summary className="is-warn">
            {pending.length} {pending.length === 1 ? 'frase sin dato que la sostenga' : 'frases sin dato que las sostengan'}
          </summary>
          <ul>
            {pending.map((flag, index) => (
              <li key={`pending-${index}`}>«{flag.phrase}» · {flag.why}</li>
            ))}
          </ul>
          {/* Dos motivos distintos para no haber sustituido, y decir uno por el
              otro engaña: o el negocio no tiene el dato, o lo tiene y esto es
              una edición a mano, donde el texto es de quien lo escribió. */}
          {specificity?.afterHumanEdit ? (
            <small>Al editar a mano solo se marca: el texto es tuyo y no se reescribe solo.</small>
          ) : specificity?.factsAvailable === 0 ? (
            <small>No hay nada en la Base de conocimiento con lo que sustituirlas: solo se pueden marcar.</small>
          ) : null}
        </details>
      ) : null}
    </div>
  )
}

/**
 * Informe del editor adversario (idea 21).
 *
 * Lo que enseña es lo que no se ve leyendo la pieza: si se enmascaró un dato
 * personal —el único fallo irreversible una vez publicado— y qué le vio el
 * crítico. Va delante de los botones de decidir, no escondido en un detalle,
 * cuando hay PII: aprobar sin leer eso es lo que hay que impedir.
 */
function CriticNote({ review }) {
  if (!review) return null
  const issues = review.critique?.issues ?? []
  const masked = review.pii?.masked ?? 0
  if (!masked && !issues.length && !review.critique?.discardedReason) return null

  return (
    <div className="studio-critic">
      {masked ? (
        <p className="is-alert">
          Se {masked === 1 ? 'ha eliminado un dato personal' : `han eliminado ${masked} datos personales`} del texto
          ({(review.pii.found ?? []).join(', ').toLowerCase()}). Revísala antes de aprobarla.
        </p>
      ) : null}
      {issues.length ? (
        <details>
          <summary>{issues.length === 1 ? 'El editor le vio una pega' : `El editor le vio ${issues.length} pegas`}</summary>
          <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
          {review.critique?.rewritten ? <small>La pieza que ves ya está reescrita con esas correcciones.</small> : null}
        </details>
      ) : null}
      {review.critique?.discardedReason ? <small>Reescritura descartada: {review.critique.discardedReason}</small> : null}
    </div>
  )
}

/** Historial y comentarios de una pieza — `pantallas.md` §3. */
function PieceHistory({ history, busy, onComment }) {
  const [message, setMessage] = useState('')
  const events = history?.events ?? []

  return (
    <div className="approval-history">
      <ul>
        {events.length
          ? events.map(event => (
            <li key={event.id}>
              <strong>{event.actor}</strong>{event.external ? ' (cliente)' : ''} · {HISTORY_LABEL[event.kind] ?? event.kind}
              {event.message ? <span>: «{event.message}»</span> : null}
              <em>{new Date(event.at).toLocaleString(localeCode(getLocale()))}</em>
            </li>
          ))
          : <li className="is-empty">Todavía no hay movimientos en esta pieza.</li>}
      </ul>
      <div className="approval-comment">
        <input
          value={message}
          onChange={event => setMessage(event.target.value)}
          placeholder="Comentar esta pieza…"
        />
        <button
          type="button"
          className="social-button ghost"
          disabled={busy || !message.trim()}
          onClick={() => { onComment(message.trim()); setMessage('') }}
        >Comentar</button>
      </div>
    </div>
  )
}

/**
 * Estudio — `pantallas.md` §2. Las seis piezas de la oportunidad con sus
 * evidencias al pie y el perfil de voz con el que se escribieron. Cuando no hay
 * perfil se dice: prometer "la voz del dueño" sin tenerla sería vender humo.
 *
 * Cada pieza lleva su propia imagen (subir o generar): la imagen es de la
 * pieza, no de la campaña, y viaja con ella hasta el borrador de Metricool.
 *
 * Antes de generar se decide **objetivo y canales**: el objetivo cambia cómo se
 * escribe y los canales son a dónde saldrá el borrador, así que preguntarlo
 * después sería preguntarlo tarde.
 */
function StudioPanel({
  setup, studio, busy, imageStatus, objective, channels,
  onObjective, onToggleChannel, onGenerate, onCloseSetup,
  onSubmit, onUploadImage, onGenerateImage, onRemoveImage, onUseSlide,
}) {
  if (!setup && !studio) return null

  return (
    <section className="social-section" id="content-studio" aria-labelledby="studio-title">
      <div className="social-section-heading">
        <div>
          <h2 id="studio-title">Estudio</h2>
          <p>
            {studio ? 'Seis piezas de la misma oportunidad: post, carrusel, guion de Reel, 3 stories, email y locución.' : 'Decide el objetivo y los canales antes de generar.'}
            {studio?.voice
              ? ` Escritas con la voz del negocio (${studio.voice.sampleSize} intervenciones reales).`
              : studio ? ` ${studio.voiceMissingReason}` : ''}
            {studio?.generatedBy === 'deterministic' ? ' Generadas sin modelo: falta configurar la clave de IA.' : ''}
            {/* Chequeo de especificidad (idea 27): lo sustituido y lo que sigue
                sin dato. Decirlo aquí evita que el hueco se publique sin verse. */}
            {studio?.specificity?.replaced
              ? ` ${studio.specificity.replaced} ${studio.specificity.replaced === 1 ? 'frase genérica sustituida' : 'frases genéricas sustituidas'} con datos de la Base de conocimiento.`
              : ''}
            {studio?.specificity?.unresolved
              ? ` ${studio.specificity.unresolved} sin dato que ${studio.specificity.unresolved === 1 ? 'la sostenga' : 'las sostenga'}${studio.specificity.knowledgeMissing ? ': la Base de conocimiento está vacía' : ''}.`
              : ''}
          </p>
        </div>
      </div>

      {setup ? (
        <div className="studio-setup">
          <div className="studio-setup-head">
            <div>
              <strong>{setup.title}</strong>
              <p>{setup.summary}</p>
              {/* El objetivo que propuso el análisis se conserva como enfoque:
                  es una sugerencia, no el modo objetivo que decide la persona. */}
              {setup.objective ? <small>Enfoque sugerido por el análisis: {setup.objective}</small> : null}
            </div>
            <button type="button" className="social-icon-button" aria-label="Cerrar el estudio" onClick={onCloseSetup}><RiCloseLine /></button>
          </div>

          <div className="studio-setup-fields">
            <label htmlFor="studio-objective">
              Objetivo
              <select id="studio-objective" value={objective} onChange={event => onObjective(event.target.value)}>
                {Object.entries(OBJECTIVE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <fieldset>
            <legend>Canales de publicación</legend>
            <div className="social-channel-picker">
              {Object.entries(PLATFORM_META).map(([id, item]) => {
                const Icon = item.Icon
                return (
                  <button type="button" key={id} className={`social-channel-option${channels.includes(id) ? ' selected' : ''}`} onClick={() => onToggleChannel(id)}>
                    <Icon aria-hidden="true" /><span>{item.name}</span>{channels.includes(id) && <RiCheckLine aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="studio-setup-actions">
            {/* Volver a generar rehace los borradores de esta oportunidad; lo
                que ya está en la cola de aprobación no se toca. */}
            <button className="social-button primary" disabled={busy || !channels.length} onClick={onGenerate}>
              <RiSparkling2Line /> {busy ? 'Generando…' : studio ? 'Volver a generar' : 'Generar la campaña (6 piezas)'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="studio-grid">
        {(studio?.pieces ?? []).map(piece => {
          const status = imageStatus[piece.id]
          // Una pieza publicada ya salió con la imagen que tenía: cambiarla
          // aquí no cambiaría el borrador, solo mentiría sobre él.
          const imageLocked = piece.status === 'published' || IMAGE_BUSY_STATES.includes(status)
          return (
            <article className="studio-piece" key={piece.id}>
              <header>
                <span className="studio-format">{FORMAT_LABEL[piece.format] ?? piece.format}</span>
                <span className="studio-saved">≈ {piece.minutesSaved} min ahorrados</span>
              </header>
              <pre className="studio-body">{pieceToText(piece)}</pre>
              <SpecificityNote specificity={piece.specificity} />
              <CriticNote review={piece.reviewReport} />

              {/* Locución (idea 8): el guion ya locutado con el stack propio.
                  Si no hay motor de voz se dice por qué, en vez de dejar un
                  reproductor vacío que parece roto. */}
              {piece.format === 'voiceover' ? (
                piece.audioUrl
                  ? (
                    <div className="studio-audio">
                      <audio controls src={piece.audioUrl} preload="none" />
                      <a className="social-text-button" href={piece.audioUrl} download>Descargar audio</a>
                      <small>≈ {piece.body?.estimatedSeconds ?? '—'} s · voz {piece.body?.provider ?? 'desconocida'}</small>
                      {/* El audio se grabó al generar. Si alguien tocó el texto
                          después, lo que suena ya no es lo que se lee, y eso
                          hay que decirlo antes de aprobarlo, no después. */}
                      {piece.editedByHuman ? <small className="studio-audio-stale">El audio se grabó antes de esta edición: vuelve a generar para que suene el texto nuevo.</small> : null}
                    </div>
                  )
                  : <p className="studio-missing">{piece.body?.missingReason}</p>
              ) : null}

              {/* Carrusel con plantilla de marca (idea 7): las slides ya
                  maquetadas con los colores y el logo del negocio. */}
              {piece.format === 'carousel' && piece.body?.slideImages?.length ? (
                <div className="studio-slides">
                  {piece.body.slideImages.map((url, index) => (
                    <img key={url} src={url} alt={`Slide ${index + 1} del carrusel`} loading="lazy" />
                  ))}
                  {piece.body?.brandTemplate?.usesDefaultColors ? (
                    <small>Maquetadas con los colores por defecto: pon los de tu marca en el libro de marca.</small>
                  ) : null}
                  {/* El PNG que Metricool descarga se compone aquí, en el
                      navegador: el backend deja el SVG, que es la parte
                      determinista. */}
                  <button type="button" className="social-text-button" disabled={imageLocked} onClick={() => onUseSlide(piece)}>
                    <RiImageAddLine /> Usar la portada como imagen
                  </button>
                </div>
              ) : null}
              {piece.format === 'carousel' && piece.body?.slidesMissingReason ? (
                <p className="studio-missing">{piece.body.slidesMissingReason}</p>
              ) : null}

              <div className="studio-image">
                {piece.imageUrl ? <img src={piece.imageUrl} alt={`Imagen de la pieza ${FORMAT_LABEL[piece.format] ?? piece.format}`} /> : null}
                <label className={`social-text-button${imageLocked ? ' disabled' : ''}`}>
                  <RiImageAddLine /> {status === 'uploading' ? 'Subiendo…' : piece.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    disabled={imageLocked}
                    onChange={event => { void onUploadImage(piece.id, event.target.files?.[0]); event.target.value = '' }}
                  />
                </label>
                <button type="button" className="social-text-button" disabled={imageLocked} onClick={() => onGenerateImage(piece)}>
                  <RiSparkling2Line /> {status === 'generating' ? 'Generando imagen…' : 'Generar imagen con IA'}
                </button>
                {piece.imageUrl ? (
                  <button type="button" className="social-text-button" disabled={imageLocked} onClick={() => onRemoveImage(piece.id)}>
                    <RiCloseLine /> {status === 'removing' ? 'Quitando…' : 'Quitar'}
                  </button>
                ) : null}
              </div>

              <footer>
                <small>{piece.evidenceSummary}</small>
                {piece.status === 'draft' ? (
                  <button className="social-button primary" disabled={busy} onClick={() => onSubmit(piece.id)}>
                    Enviar a aprobación
                  </button>
                ) : <span className="studio-state">{piece.status === 'pending_approval' ? 'En la cola' : piece.status}</span>}
              </footer>
            </article>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Sala de aprobación — `pantallas.md` §3. Rechazar exige motivo: sin él no hay
 * nada que aprender del rechazo, y el aprendizaje se explota sobre este
 * histórico.
 */
function ApprovalQueue({
  queue, busy, progress, drafts, histories,
  onDraft, onEdit, onApprove, onReject, onApproveAll, onOpenHistory, onComment,
}) {
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [openHistory, setOpenHistory] = useState(null)

  const pending = queue.filter(piece => piece.status === 'pending_approval')

  return (
    <section className="social-section" id="approval-room" aria-labelledby="approval-title">
      <div className="social-section-heading">
        <div>
          <h2 id="approval-title">Sala de aprobación</h2>
          <p>{pending.length ? `${pending.length} ${pending.length === 1 ? 'pieza pendiente' : 'piezas pendientes'} de decisión.` : 'No hay piezas esperando decisión.'}</p>
        </div>
        {pending.length ? (
          <button className="social-button primary" onClick={onApproveAll} disabled={busy}>
            {progress ? `Aprobando ${progress.done}/${progress.total}…` : 'Aprobar todo'}
          </button>
        ) : null}
      </div>

      {pending.map(piece => (
        <article className="approval-piece" key={piece.id}>
          <header>
            <strong>{FORMAT_LABEL[piece.format] ?? piece.format}</strong>
            {piece.opportunity ? <span className="approval-origin">de «{piece.opportunity.title}» · {piece.opportunity.evidenceCount} evidencias</span> : null}
            {piece.editedByHuman ? <span className="approval-edited">editada</span> : null}
          </header>

          <textarea
            className="approval-editor"
            rows="5"
            value={drafts[piece.id] ?? pieceToText(piece)}
            onChange={event => onDraft(piece.id, event.target.value)}
          />
          {/* Lo genérico, antes de decidir: es el motivo de rechazo
              «demasiado genérico» puesto delante en vez de después. */}
          <SpecificityNote specificity={piece.specificity} />
          <CriticNote review={piece.reviewReport} />

          <footer>
            <button className="social-button ghost" disabled={busy || drafts[piece.id] === undefined} onClick={() => onEdit(piece)}>Guardar edición</button>
            <button
              className="social-button ghost"
              onClick={() => {
                const next = openHistory === piece.id ? null : piece.id
                setOpenHistory(next)
                if (next) onOpenHistory(piece.id)
              }}
            >
              {openHistory === piece.id ? 'Ocultar historial' : `Historial${piece._count?.events ? ` (${piece._count.events})` : ''}`}
            </button>
            <button className="social-button ghost" disabled={busy} onClick={() => { setRejecting(piece.id); setReason(''); setComment('') }}>Rechazar</button>
            <button className="social-button primary" disabled={busy} onClick={() => onApprove(piece.id)}>Aprobar</button>
          </footer>

          {openHistory === piece.id ? (
            <PieceHistory
              history={histories[piece.id]}
              busy={busy}
              onComment={message => onComment(piece.id, message)}
            />
          ) : null}

          {rejecting === piece.id ? (
            <div className="approval-reject">
              <span>¿Por qué se rechaza? El motivo es obligatorio.</span>
              <div className="approval-reasons">
                {Object.entries(REJECTION_LABEL).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={reason === value ? 'is-selected' : ''}
                    onClick={() => setReason(value)}
                  >{label}</button>
                ))}
              </div>
              <input value={comment} onChange={event => setComment(event.target.value)} placeholder="Detalle opcional…" />
              <div className="approval-reject-actions">
                <button className="social-button ghost" onClick={() => setRejecting(null)}>Cancelar</button>
                <button
                  className="social-button primary"
                  disabled={!reason || busy}
                  onClick={() => { onReject(piece.id, reason, comment); setRejecting(null) }}
                >Confirmar rechazo</button>
              </div>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  )
}

/**
 * Libro de marca y enlaces de aprobación — fase 2 (idea 7) y fase 3.
 *
 * Van juntos porque son las dos cosas que se configuran una vez y afectan a
 * todo lo demás: con qué colores se maquetan los carruseles y quién de fuera
 * puede aprobar. El enlace se enseña **una sola vez**, al crearlo: después solo
 * queda su etiqueta y su caducidad.
 */
function BrandAndSharing({ brand, links, newLink, busy, onSaveBrand, onCreateLink, onRevokeLink }) {
  const [form, setForm] = useState(null)
  const current = form ?? brand
  if (!current) return null

  return (
    <section className="social-section" aria-labelledby="brand-title">
      <div className="social-section-heading">
        <div>
          <h2 id="brand-title">Marca y aprobación externa</h2>
          <p>
            Con estos colores y este logo se maquetan las slides del carrusel.
            {brand?.isDefault ? ' Ahora mismo son los colores por defecto, no los tuyos.' : ''}
          </p>
        </div>
      </div>

      <div className="brand-kit">
        {['primary', 'secondary', 'text'].map(key => (
          <label key={key} htmlFor={`brand-${key}`}>
            {key === 'primary' ? 'Color principal' : key === 'secondary' ? 'Color secundario' : 'Color del texto'}
            <input
              id={`brand-${key}`}
              type="color"
              value={current[key]}
              onChange={event => setForm({ ...current, [key]: event.target.value })}
            />
          </label>
        ))}
        <label htmlFor="brand-logo">
          Logo (URL)
          <input
            id="brand-logo"
            type="url"
            placeholder="https://…/logo.png"
            value={current.logoUrl ?? ''}
            onChange={event => setForm({ ...current, logoUrl: event.target.value || null })}
          />
        </label>
        <button
          className="social-button primary"
          disabled={busy || !form}
          onClick={() => { onSaveBrand(form); setForm(null) }}
        >Guardar marca</button>
      </div>

      <div className="approval-links">
        <div className="approval-links-head">
          <strong>Enlaces de aprobación para clientes</strong>
          <button className="social-button ghost" disabled={busy} onClick={onCreateLink}>Crear enlace</button>
        </div>
        {/* Se enseña una vez y no se puede volver a consultar: en la base solo
            vive su huella. */}
        {newLink ? (
          <p className="approval-link-new">
            <code>{newLink.url}</code>
            <small>{newLink.notice}</small>
          </p>
        ) : null}
        <ul>
          {links.length ? links.map(link => (
            <li key={link.id}>
              <span>{link.label || 'Sin etiqueta'}</span>
              <em>
                {link.active
                  ? `caduca el ${new Date(link.expiresAt).toLocaleDateString(localeCode(getLocale()))}`
                  : link.revokedAt ? 'revocado' : 'caducado'}
              </em>
              {link.active ? (
                <button className="social-text-button" disabled={busy} onClick={() => onRevokeLink(link.id)}>Revocar</button>
              ) : null}
            </li>
          )) : <li className="is-empty">No hay enlaces activos. Con uno, tu cliente aprueba sin entrar en el CRM.</li>}
        </ul>
      </div>
    </section>
  )
}

/** Euros sin decimales: en una tabla de resultados los céntimos son ruido. */
function formatEuros(value) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat(localeCode(getLocale()), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

/** "2 cualificados · 1 nuevo", o un guion si esa pieza no trajo a nadie. */
function formatPipeline(pipeline) {
  const entries = Object.entries(pipeline ?? {}).filter(([, count]) => count > 0)
  if (!entries.length) return '—'
  return entries.map(([status, count]) => `${count} ${PIPELINE_LABEL[status] ?? status}`).join(' · ')
}

/** Resultados — `pantallas.md` §4: las tres métricas del MVP, sin inventar. */
function ResultsPanel({ results }) {
  if (!results) return null
  const percent = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`)

  return (
    <section className="social-section" aria-labelledby="results-title">
      <div className="social-section-heading">
        <div><h2 id="results-title">Resultados</h2><p>Las tres métricas del MVP. Lo que aún no se puede medir se dice, no se rellena con ceros.</p></div>
      </div>
      <div className="results-grid">
        <span><small>Tiempo ahorrado</small><strong>{results.minutesSaved} min</strong><em>solo piezas aprobadas</em></span>
        <span><small>% aprobado</small><strong>{percent(results.approvalRate)}</strong><em>{results.approved} de {results.pieces} piezas</em></span>
        <span><small>% sin editar</small><strong>{percent(results.untouchedRate)}</strong><em>de las aprobadas</em></span>
        <span><small>Leads atribuidos</small><strong>{results.leadsAttributed ?? 0}</strong><em>{results.published} piezas publicadas</em></span>
        {/* Fase 4: los euros del cruce completo. Ganado y abierto no se suman
            nunca: lo abierto es expectativa, no ingreso. */}
        <span>
          <small>Euros ganados</small>
          <strong>{results.value?.measurable ? formatEuros(results.value.won) : '—'}</strong>
          <em>{results.value?.measurable ? `${formatEuros(results.value.open)} aún abiertos` : 'sin oportunidades en el CRM'}</em>
        </span>
      </div>
      {results.perPiece.length ? (
        <table className="results-table">
          <thead><tr><th>Pieza</th><th>Canales</th><th>UTM</th><th>Visitas</th><th>Leads</th><th>En pipeline</th><th>Ganado / abierto</th></tr></thead>
          <tbody>
            {results.perPiece.map(piece => (
              <tr key={piece.id}>
                <td>{FORMAT_LABEL[piece.format] ?? piece.format}</td>
                <td>{piece.channels?.length ? piece.channels.map(channel => platformMeta(channel).name).join(', ') : '—'}</td>
                <td>{piece.utmContent}</td>
                <td>{piece.visits === null ? 'sin publicar' : piece.visits}</td>
                <td>{piece.leads === null ? '—' : piece.leads}</td>
                {/* El recorrido completo del §4: visitas → leads → estado. */}
                <td>{formatPipeline(piece.pipeline)}</td>
                {/* …y hasta los euros, que es donde lo cierra la fase 4. */}
                <td>{piece.value ? `${formatEuros(piece.value.won)} / ${formatEuros(piece.value.open)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {results.caveats?.length ? <ul className="results-caveats">{results.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul> : null}
    </section>
  )
}

export default function ConectarRedesPage() {
  const { locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('loading')
  const [connectionError, setConnectionError] = useState('')
  const [connected, setConnected] = useState(false)
  const [providerUrl, setProviderUrl] = useState(null)
  const [integrations, setIntegrations] = useState([])
  const [connecting, setConnecting] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsStatus, setAnalyticsStatus] = useState('loading')
  const [analyticsError, setAnalyticsError] = useState('')
  const [notice, setNotice] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignStatus, setCampaignStatus] = useState('loading')
  const [campaignError, setCampaignError] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [socialCta, setSocialCta] = useState('Descubre cómo podemos ayudarte')

  const [radar, setRadar] = useState(null)
  const [radarLoading, setRadarLoading] = useState(true)
  const [radarBusy, setRadarBusy] = useState(false)
  const [evidence, setEvidence] = useState(null)
  const [studio, setStudio] = useState(null)
  const [studioBusy, setStudioBusy] = useState(false)
  // Oportunidad abierta en el Estudio, con el objetivo y los canales que se
  // usarán al generar (§2).
  const [studioSetup, setStudioSetup] = useState(null)
  const [studioObjective, setStudioObjective] = useState('educar')
  const [studioChannels, setStudioChannels] = useState(['instagram'])
  const [queue, setQueue] = useState([])
  const [results, setResults] = useState(null)
  const [drafts, setDrafts] = useState({})
  // Historial por pieza, cargado bajo demanda al abrirlo en la Sala (§3).
  const [histories, setHistories] = useState({})
  const [brand, setBrand] = useState(null)
  const [approvalLinks, setApprovalLinks] = useState([])
  const [newApprovalLink, setNewApprovalLink] = useState(null)
  const [batchProgress, setBatchProgress] = useState(null)
  const [pieceImageStatus, setPieceImageStatus] = useState({})

  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTone, setAiTone] = useState('cercano')
  const [aiStartDate, setAiStartDate] = useState('')
  const [aiChannels, setAiChannels] = useState(['instagram', 'linkedin'])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPlan, setAiPlan] = useState(null)
  const [draftStatus, setDraftStatus] = useState({})
  const [postImages, setPostImages] = useState({})
  const [imageStatus, setImageStatus] = useState({})
  const selectedCampaign = campaigns.find(campaign => campaign.id === selectedCampaignId)

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  async function loadRadar() {
    setRadarLoading(true)
    try {
      const res = await apiFetch('/api/content/opportunities')
      setRadar(res.ok ? await res.json() : null)
    } catch {
      setRadar(null)
    } finally {
      setRadarLoading(false)
    }
  }

  async function refreshRadar() {
    setRadarBusy(true)
    try {
      const res = await apiFetch('/api/content/opportunities/refresh', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      // El backend devuelve 409 cuando falta configuración o material: es un
      // estado del producto y se muestra tal cual, sin disfrazarlo de error.
      if (!res.ok) throw new Error(data.error || 'No se pudo analizar')
      showNotice(`Analizadas ${data.analyzed} conversaciones · ${data.created} oportunidades`)
      await loadRadar()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'No se pudo analizar')
    } finally {
      setRadarBusy(false)
    }
  }

  async function dismissOpportunity(id) {
    const res = await apiFetch(`/api/content/opportunities/${id}/dismiss`, { method: 'POST', body: JSON.stringify({}) })
    if (!res.ok) return showNotice('No se pudo descartar la oportunidad')
    setRadar(previous => previous && { ...previous, opportunities: previous.opportunities.filter(item => item.id !== id) })
  }

  async function loadEvidence(id) {
    const res = await apiFetch(`/api/content/opportunities/${id}/evidence`)
    if (!res.ok) return showNotice('No se pudieron cargar las evidencias')
    setEvidence(await res.json())
  }

  async function loadQueueAndResults() {
    const [queueRes, resultsRes] = await Promise.all([
      apiFetch('/api/content/pieces/queue').catch(() => ({ ok: false })),
      apiFetch('/api/content/results').catch(() => ({ ok: false })),
    ])
    if (queueRes.ok) setQueue((await queueRes.json()).pieces ?? [])
    if (resultsRes.ok) setResults(await resultsRes.json())
  }

  /** Libro de marca y enlaces de aprobación: se cargan con la página. */
  async function loadBrandAndLinks() {
    const [brandRes, linksRes] = await Promise.all([
      apiFetch('/api/content/brand').catch(() => ({ ok: false })),
      apiFetch('/api/content/approval-links').catch(() => ({ ok: false })),
    ])
    if (brandRes.ok) setBrand((await brandRes.json()).brand ?? null)
    if (linksRes.ok) setApprovalLinks((await linksRes.json()).links ?? [])
  }

  async function saveBrand(next) {
    const res = await apiFetch('/api/content/brand', { method: 'PUT', body: JSON.stringify(next) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return showNotice(data.error || 'No se pudo guardar la marca')
    setBrand(data.brand)
    showNotice('Marca guardada: los próximos carruseles saldrán con estos colores')
  }

  async function createApprovalLink() {
    const res = await apiFetch('/api/content/approval-links', { method: 'POST', body: JSON.stringify({}) })
    const data = await res.json().catch(() => ({}))
    // El 409 aquí es el plan: el enlace de cliente es del plan Agency.
    if (!res.ok) return showNotice(data.error || 'No se pudo crear el enlace')
    setNewApprovalLink(data)
    await loadBrandAndLinks()
  }

  async function revokeApprovalLink(id) {
    const res = await apiFetch(`/api/content/approval-links/${id}`, { method: 'DELETE' })
    if (!res.ok) return showNotice('No se pudo revocar el enlace')
    setNewApprovalLink(null)
    await loadBrandAndLinks()
    showNotice('Enlace revocado')
  }

  function scrollTo(selector) {
    window.requestAnimationFrame(() => document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  /**
   * "Generar campaña" del Radar: abre el Estudio con el objetivo del tipo ya
   * elegido. No genera todavía —eso cuesta una llamada al modelo— porque el
   * objetivo y los canales cambian lo que se escribe (§2).
   */
  function openStudio(opportunity) {
    setStudioSetup(opportunity)
    setStudio(null)
    setStudioObjective(defaultObjectiveFor(opportunity.type))
    setStudioChannels(['instagram'])
    setPieceImageStatus({})
    scrollTo('#content-studio')
  }

  async function generateCampaign() {
    if (!studioSetup || !studioChannels.length) return
    setStudioBusy(true)
    try {
      const res = await apiFetch('/api/content/pieces/generate', {
        method: 'POST',
        body: JSON.stringify({
          opportunityId: studioSetup.id,
          campaignId: selectedCampaignId || undefined,
          objective: studioObjective,
          channels: studioChannels,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudieron generar las piezas')
      setStudio(data)
      setPieceImageStatus({})
      await loadQueueAndResults()
      scrollTo('#content-studio')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'No se pudieron generar las piezas')
    } finally {
      setStudioBusy(false)
    }
  }

  /**
   * Imagen por pieza — §2. Subir y generar solo devuelven una URL pública; es
   * este PUT el que la fija en la pieza, y desde ahí viaja sola al borrador.
   */
  async function savePieceImage(pieceId, imageUrl) {
    const res = await apiFetch(`/api/content/pieces/${pieceId}/image`, {
      method: 'PUT',
      body: JSON.stringify({ imageUrl }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar la imagen en la pieza.')
    setStudio(previous => previous && {
      ...previous,
      pieces: previous.pieces.map(piece => piece.id === pieceId ? { ...piece, imageUrl: data.imageUrl ?? null } : piece),
    })
    setPieceImageStatus(previous => ({ ...previous, [pieceId]: 'done' }))
  }

  function failPieceImage(pieceId, error, fallback) {
    setPieceImageStatus(previous => ({ ...previous, [pieceId]: 'error' }))
    showNotice(error instanceof Error ? error.message : fallback)
  }

  async function uploadPieceImage(pieceId, file) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) return showNotice('La imagen no puede superar los 8 MB.')
    setPieceImageStatus(previous => ({ ...previous, [pieceId]: 'uploading' }))
    try {
      await savePieceImage(pieceId, await uploadMedia(file))
    } catch (error) {
      failPieceImage(pieceId, error, 'No se pudo subir la imagen.')
    }
  }

  /**
   * Usa la portada del carrusel maquetado como imagen de la pieza (idea 7). Es
   * la portada y no una slide cualquiera porque es la que se ve en el feed
   * antes de deslizar.
   */
  async function useSlideAsImage(piece) {
    const slide = piece.body?.slideImages?.[0]
    if (!slide) return
    setPieceImageStatus(previous => ({ ...previous, [piece.id]: 'uploading' }))
    try {
      await savePieceImage(piece.id, await uploadMedia(await rasterizeSlide(slide)))
    } catch (error) {
      failPieceImage(piece.id, error, 'No se pudo usar la slide como imagen.')
    }
  }

  async function generatePieceImage(piece) {
    setPieceImageStatus(previous => ({ ...previous, [piece.id]: 'generating' }))
    try {
      // El generador acepta 2.000 caracteres y un carrusel entero los pasa; el
      // brief útil está en las primeras líneas de la pieza.
      await savePieceImage(piece.id, await generateMedia(pieceToText(piece).slice(0, 1500)))
    } catch (error) {
      failPieceImage(piece.id, error, 'No se pudo generar la imagen.')
    }
  }

  async function removePieceImage(pieceId) {
    setPieceImageStatus(previous => ({ ...previous, [pieceId]: 'removing' }))
    try {
      await savePieceImage(pieceId, null)
    } catch (error) {
      failPieceImage(pieceId, error, 'No se pudo quitar la imagen.')
    }
  }

  /** Acción sobre una pieza; devuelve si salió bien para poder encadenar. */
  async function pieceAction(path, options, successMessage) {
    const res = await apiFetch(path, { method: 'POST', ...options })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showNotice(data.error || 'No se pudo completar la acción')
      return false
    }
    if (successMessage) showNotice(successMessage)
    return true
  }

  /** Historial de una pieza (§3). Se pide al abrirlo, no con la cola: son
   *  hasta 200 líneas por pieza y la cola enseña 60 piezas. */
  async function loadHistory(id) {
    const res = await apiFetch(`/api/content/pieces/${id}/history`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showNotice(data.error || 'No se pudo cargar el historial')
      return
    }
    setHistories(previous => ({ ...previous, [id]: data }))
  }

  async function commentPiece(id, message) {
    setStudioBusy(true)
    const res = await apiFetch(`/api/content/pieces/${id}/comment`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setHistories(previous => ({ ...previous, [id]: data }))
      await loadQueueAndResults()
    } else showNotice(data.error || 'No se pudo guardar el comentario')
    setStudioBusy(false)
  }

  async function submitPiece(id) {
    setStudioBusy(true)
    if (await pieceAction(`/api/content/pieces/${id}/submit`, {}, 'Pieza enviada a aprobación')) {
      setStudio(previous => previous && {
        ...previous,
        pieces: previous.pieces.map(piece => piece.id === id ? { ...piece, status: 'pending_approval' } : piece),
      })
      await loadQueueAndResults()
    }
    setStudioBusy(false)
  }

  async function savePieceEdit(piece) {
    const text = drafts[piece.id]
    if (text === undefined) return
    setStudioBusy(true)
    const res = await apiFetch(`/api/content/pieces/${piece.id}`, {
      method: 'PUT',
      body: JSON.stringify({ body: textToPiece(piece, text) }),
    })
    if (!res.ok) showNotice('No se pudo guardar la edición')
    else {
      showNotice('Edición guardada')
      setDrafts(previous => { const next = { ...previous }; delete next[piece.id]; return next })
      await loadQueueAndResults()
    }
    setStudioBusy(false)
  }

  async function approvePiece(id) {
    setStudioBusy(true)
    if (await pieceAction(`/api/content/pieces/${id}/approve`, {}, 'Pieza aprobada')) await loadQueueAndResults()
    setStudioBusy(false)
  }

  async function rejectPiece(id, reason, comment) {
    setStudioBusy(true)
    if (await pieceAction(`/api/content/pieces/${id}/reject`, { body: JSON.stringify({ reason, comment }) }, 'Pieza rechazada')) {
      await loadQueueAndResults()
    }
    setStudioBusy(false)
  }

  /**
   * "Aprobar todo": aprueba en lote y crea los borradores en Metricool. El
   * backend devuelve el resultado pieza a pieza, así que se informa de cuántas
   * se aprobaron y cuántas llegaron a borrador, no un "listo" genérico.
   */
  async function approveAll() {
    const pending = queue.filter(piece => piece.status === 'pending_approval')
    if (!pending.length) return
    setStudioBusy(true)
    setBatchProgress({ done: 0, total: pending.length })
    try {
      const res = await apiFetch('/api/content/pieces/approve-all', {
        method: 'POST',
        body: JSON.stringify({ pieceIds: pending.map(piece => piece.id) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo aprobar el lote')
      setBatchProgress({ done: data.approved, total: data.total })
      // El motivo del primer fallo se muestra: "no se pudo" sin decir por qué
      // obliga al usuario a adivinar.
      const blocked = data.results?.find(result => result.approved && !result.drafted)
      showNotice(blocked
        ? `${data.approved} aprobadas · ${data.drafted} en borrador. ${blocked.reason}`
        : `${data.approved} aprobadas y ${data.drafted} borradores creados`)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'No se pudo aprobar el lote')
    } finally {
      setBatchProgress(null)
      setStudioBusy(false)
      await loadQueueAndResults()
    }
  }

  async function loadAnalytics() {
    setAnalyticsLoading(true)
    setAnalyticsStatus('loading')
    setAnalyticsError('')
    try {
      const res = await apiFetch('/api/metricool/analytics')
      if (!res.ok) throw new Error(`metricool_analytics_${res.status}`)
      const data = await res.json()
      setAnalytics(data)
      setAnalyticsStatus(DEMO_MODE ? 'demo' : data && Object.keys(data).length ? 'live' : 'empty')
    } catch (error) {
      setAnalytics(null)
      const status = classifyFetchError(error)
      setAnalyticsStatus(status)
      setAnalyticsError(statusMessage(status, { error: 'Metricool no devolvió métricas.' }))
    } finally {
      setAnalyticsLoading(false)
    }
  }

  async function loadStatus() {
    setLoading(true)
    setConnectionStatus('loading')
    setConnectionError('')
    try {
      const res = await apiFetch('/api/metricool')
      if (res.status === 403) { setGated(true); setConnectionStatus('disconnected'); return }
      if (!res.ok) throw new Error('status failed')
      const data = await res.json()
      setConnected(Boolean(data.connected))
      setProviderUrl(data.appUrl ?? null)
      setIntegrations(Array.isArray(data.integrations) ? data.integrations : [])
      setConnectionStatus(DEMO_MODE ? 'demo' : data.connected ? 'live' : 'disconnected')
      if (data.connected) loadAnalytics()
      else { setAnalytics(null); setAnalyticsStatus('empty') }
    } catch (error) {
      setConnected(false)
      const status = classifyFetchError(error)
      setConnectionStatus(status)
      setConnectionError(statusMessage(status, { error: 'No se pudo consultar la conexión con Metricool.' }))
    } finally {
      setLoading(false)
    }
  }

  async function loadCampaigns() {
    setCampaignsLoading(true)
    setCampaignStatus('loading')
    setCampaignError('')
    try {
      const res = await apiFetch('/api/campaigns?page=1&limit=100')
      if (!res.ok) throw new Error(`campaigns_${res.status}`)
      const data = await res.json()
      const next = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
      setCampaigns(next)
      setCampaignStatus(DEMO_MODE ? 'demo' : next.length ? 'live' : 'empty')
    } catch (error) {
      setCampaigns([])
      const status = classifyFetchError(error)
      setCampaignStatus(status)
      setCampaignError(statusMessage(status, { error: 'No se pudieron cargar las campañas para enlazar el contenido.' }))
    } finally {
      setCampaignsLoading(false)
    }
  }

  useEffect(() => { void Promise.all([loadStatus(), loadCampaigns(), loadRadar(), loadQueueAndResults(), loadBrandAndLinks()]) }, [])

  async function connect() {
    setConnecting(true)
    try {
      const res = await apiFetch('/api/metricool/connect', { method: 'POST' })
      if (!res.ok) throw new Error('connect failed')
      const data = await res.json()
      setConnected(true)
      setConnectionStatus(DEMO_MODE ? 'demo' : 'live')
      setConnectionError('')
      setProviderUrl(data.appUrl ?? null)
      loadAnalytics()
    } catch {
      setConnectionStatus('error')
      setConnectionError('No se pudo conectar con Metricool. Intenta de nuevo.')
      showNotice('No se pudo conectar con Metricool. Intenta de nuevo.')
    } finally {
      setConnecting(false)
    }
  }

  function toggleChannel(id) {
    setAiChannels(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])
  }

  async function generatePlan(event) {
    event.preventDefault()
    if (!aiPrompt.trim() || !aiChannels.length) return
    setAiLoading(true)
    try {
      const res = await apiFetch('/api/metricool/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt.trim(), channels: aiChannels, tone: aiTone, startDate: aiStartDate || undefined }),
      })
      if (!res.ok) throw new Error('generate failed')
      setAiPlan(await res.json())
      setDraftStatus({})
      setPostImages({})
      setImageStatus({})
    } catch {
      showNotice('No se pudo generar el plan de contenido. Intenta de nuevo.')
    } finally {
      setAiLoading(false)
    }
  }

  async function uploadImage(file, index) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      showNotice('La imagen no puede superar los 8 MB.')
      return
    }
    setImageStatus(previous => ({ ...previous, [index]: 'uploading' }))
    try {
      const imageUrl = await uploadMedia(file)
      setPostImages(previous => ({ ...previous, [index]: imageUrl }))
      setImageStatus(previous => ({ ...previous, [index]: 'done' }))
    } catch (error) {
      setImageStatus(previous => ({ ...previous, [index]: 'error' }))
      showNotice(error instanceof Error ? error.message : 'No se pudo subir la imagen.')
    }
  }

  async function generateImage(post, index) {
    setImageStatus(previous => ({ ...previous, [index]: 'generating' }))
    try {
      const imageUrl = await generateMedia(post.text)
      setPostImages(previous => ({ ...previous, [index]: imageUrl }))
      setImageStatus(previous => ({ ...previous, [index]: 'done' }))
    } catch (error) {
      setImageStatus(previous => ({ ...previous, [index]: 'error' }))
      showNotice(error instanceof Error ? error.message : 'No se pudo generar la imagen.')
    }
  }

  async function createDraft(post, index) {
    if (!selectedCampaignId) {
      showNotice('Selecciona una campaña antes de crear el borrador.')
      return
    }
    if (!selectedCampaign?.landingSlug) {
      showNotice('La campaña necesita una landing publicada.')
      return
    }
    setDraftStatus(previous => ({ ...previous, [index]: 'creating' }))
    try {
      const res = await apiFetch('/api/metricool/posts', {
        method: 'POST',
        body: JSON.stringify({
          text: post.text,
          imageUrl: (postImages[index] ?? '').trim() || undefined,
          platforms: [post.platform],
          campaignId: selectedCampaignId,
          cta: socialCta.trim() || undefined,
          scheduledAt: post.suggestedDate || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'No se pudo crear el borrador en Metricool.')
      }
      setDraftStatus(previous => ({ ...previous, [index]: 'done' }))
      showNotice('Borrador conectado a la campaña y creado en Metricool.')
    } catch (error) {
      setDraftStatus(previous => ({ ...previous, [index]: 'error' }))
      showNotice(error instanceof Error ? error.message : 'No se pudo crear el borrador en Metricool.')
    }
  }

  if (loading) {
    return (
      <div className="dark-scroll social-page social-loading">
        <div className="social-loader"><RiRefreshLine aria-hidden="true" /><span>{locale === 'en' ? 'Loading social networks…' : 'Cargando redes sociales…'}</span></div>
        <DataStatusBanner status="loading" message={locale === 'en' ? 'Checking connection and real campaigns.' : 'Consultando conexión y campañas reales.'} />
      </div>
    )
  }

  if (gated) {
    return (
      <div className="dark-scroll social-page social-gated">
        <div className="social-gated-card">
          <RiAlertLine aria-hidden="true" />
          <h1>{locale === 'en' ? 'Social networks' : 'Redes sociales'}</h1>
          <p>{locale === 'en' ? 'Social networks are a Complete Plan feature. Talk to your administrator to enable them.' : 'Redes sociales es una función del Plan Completo. Habla con tu administrador para activarla.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dark-scroll social-page">
      <header className="social-header">
        <div className="social-heading">
          <div className="social-brand-icon"><RiShareForwardLine aria-hidden="true" /></div>
          <div><h1>{locale === 'en' ? 'Social networks' : 'Redes sociales'}</h1><p>{locale === 'en' ? 'Connect Metricool and prepare organic content with AI.' : 'Conecta Metricool y prepara contenido orgánico con IA.'}</p></div>
        </div>
        <div className="social-header-actions">
          <button className="social-button ghost" onClick={loadStatus}><RiRefreshLine /> {locale === 'en' ? 'Refresh' : 'Actualizar'}</button>
        </div>
      </header>

      <DataStatusBanner
        status={connectionStatus}
        message={connectionError || statusMessage(connectionStatus, { live: 'Metricool conectado: tus redes están listas para operar.', disconnected: 'Metricool está desconectado; conecta una cuenta para publicar.', demo: 'Modo demo explícito: no se publicará contenido real.', empty: 'Metricool está disponible, pero todavía no hay canales conectados.' })}
        onRetry={connectionStatus === 'error' ? loadStatus : undefined}
        onAction={connectionStatus === 'disconnected' ? connect : undefined}
        actionLabel="Conectar Metricool"
      />

      <CaptureJourney active="attract" />

      <RadarPanel
        data={radar}
        loading={radarLoading}
        busy={radarBusy}
        onRefresh={refreshRadar}
        onDismiss={dismissOpportunity}
        onEvidence={loadEvidence}
        evidence={evidence}
        onCloseEvidence={() => setEvidence(null)}
        onGenerate={openStudio}
        onOwnIdea={() => scrollTo('#ai-studio')}
      />

      <StudioPanel
        setup={studioSetup}
        studio={studio}
        busy={studioBusy}
        imageStatus={pieceImageStatus}
        objective={studioObjective}
        channels={studioChannels}
        onObjective={setStudioObjective}
        onToggleChannel={id => setStudioChannels(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])}
        onGenerate={generateCampaign}
        onCloseSetup={() => { setStudioSetup(null); setStudio(null) }}
        onSubmit={submitPiece}
        onUploadImage={uploadPieceImage}
        onGenerateImage={generatePieceImage}
        onUseSlide={useSlideAsImage}
        onRemoveImage={removePieceImage}
      />

      <ApprovalQueue
        queue={queue}
        busy={studioBusy}
        progress={batchProgress}
        drafts={drafts}
        histories={histories}
        onDraft={(id, value) => setDrafts(previous => ({ ...previous, [id]: value }))}
        onEdit={savePieceEdit}
        onApprove={approvePiece}
        onReject={rejectPiece}
        onApproveAll={approveAll}
        onOpenHistory={loadHistory}
        onComment={commentPiece}
      />

      <ResultsPanel results={results} />

      <BrandAndSharing
        brand={brand}
        links={approvalLinks}
        newLink={newApprovalLink}
        busy={studioBusy}
        onSaveBrand={saveBrand}
        onCreateLink={createApprovalLink}
        onRevokeLink={revokeApprovalLink}
      />

      <section className="social-section" aria-labelledby="connect-title">
        <div className="social-section-heading">
          <div><h2 id="connect-title">Conexión con Metricool</h2><p>Metricool gestiona tus canales, calendario y publicaciones orgánicas.</p></div>
          {connected && <span className="social-status success"><span className="social-status-dot" /> Conectado</span>}
        </div>

        {!connected ? (
          <div className="social-panel">
            <div className="social-empty-accounts">
              <div className="social-empty-icon"><RiShareForwardLine aria-hidden="true" /></div>
              <div>
                <strong>Aún no conectaste tus redes</strong>
                <p>Configura Metricool para publicar y programar contenido en Instagram, LinkedIn, Facebook, TikTok, YouTube y X.</p>
              </div>
              <button className="social-button primary" onClick={connect} disabled={connecting}>
                <RiShareForwardLine /> {connecting ? 'Conectando…' : 'Conectar redes sociales'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {integrations.length > 0 && (
              <div className="social-integration-list">
                {integrations.map((item, index) => {
                  const meta = platformMeta(item?.platform ?? item?.type ?? item?.provider)
                  return (
                    <span className="social-integration-chip" key={item?.id ?? index}>
                      <meta.Icon aria-hidden="true" /> {item?.name ?? item?.username ?? meta.name}
                    </span>
                  )
                })}
              </div>
            )}
            {/* El iframe embebido se elimino: ni GET /api/metricool ni POST /api/metricool/connect
                devuelven `embedUrl`, asi que esta rama nunca se renderizaba. */}
            <div className="social-panel"><div className="social-side-empty"><RiGlobalLine aria-hidden="true" /><p>Metricool está conectado. Abre su planificador para revisar y ajustar tus borradores.</p>{providerUrl && <a className="social-text-button" href={providerUrl} target="_blank" rel="noreferrer">Abrir Metricool <RiExternalLinkLine /></a>}</div></div>
          </>
        )}
      </section>

      {connected && (
        <section className="social-section" aria-labelledby="analytics-title">
          <div className="social-section-heading"><div><h2 id="analytics-title">Métricas</h2><p>Datos de rendimiento reportados por Metricool.</p></div></div>
          <DataStatusBanner compact status={analyticsStatus} message={analyticsError || statusMessage(analyticsStatus, { live: 'Métricas reales disponibles.', empty: 'Metricool todavía no ha reportado actividad.', demo: 'Las métricas demo están identificadas y no representan actividad real.' })} onRetry={analyticsStatus === 'error' || analyticsStatus === 'disconnected' ? loadAnalytics : undefined} />
          <div className="social-panel" style={{ padding: '16px 17px' }}>
            <AnalyticsPanel data={analytics} status={analyticsLoading ? 'loading' : analyticsStatus} onRetry={loadAnalytics} />
          </div>
        </section>
      )}

      <section className="social-ai-section" id="ai-studio" aria-labelledby="ai-studio-title">
        <div className="social-section-heading">
          <div><h2 id="ai-studio-title">Copiloto de contenido</h2><p>Describe qué quieres comunicar y genera un borrador por canal.</p></div>
          <span className="social-ai-status"><RiSparkling2Line aria-hidden="true" /> IA preparada</span>
        </div>

        <div className="social-panel" style={{ padding: '20px' }}>
          <form className="social-ai-form" onSubmit={generatePlan}>
            <div className="social-campaign-linker">
              <div className="social-campaign-linker-head">
                <span><RiGlobalLine aria-hidden="true" /> Campaña y destino</span>
                <small>Obligatorio para crear borradores</small>
              </div>
              <DataStatusBanner compact status={campaignStatus} message={campaignError || statusMessage(campaignStatus, { live: 'Campañas reales disponibles para enlazar.', empty: 'Crea una campaña con landing para poder crear borradores.', demo: 'Modo demo explícito: las campañas no publicarán contenido real.' })} onRetry={campaignStatus === 'error' || campaignStatus === 'disconnected' ? loadCampaigns : undefined} onAction={campaignStatus === 'empty' ? () => window.location.assign('/campanas') : undefined} actionLabel="Crear campaña" />
              <div className="social-campaign-fields">
                <label htmlFor="social-campaign">
                  Campaña
                  <select
                    id="social-campaign"
                    value={selectedCampaignId}
                    onChange={event => { setSelectedCampaignId(event.target.value); setDraftStatus({}) }}
                    disabled={campaignsLoading}
                  >
                    <option value="">{campaignsLoading ? 'Cargando campañas…' : 'Selecciona una campaña'}</option>
                    {campaigns.map(campaign => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}{campaign.landingSlug ? '' : ' · sin landing'}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="social-cta">
                  Llamada a la acción
                  <input id="social-cta" type="text" maxLength="160" value={socialCta} onChange={event => setSocialCta(event.target.value)} placeholder="Ej. Reserva una demo" />
                </label>
              </div>
              {selectedCampaignId && (
                selectedCampaign?.landingSlug ? (
                  <div className="social-campaign-destination success">
                    <RiCheckLine aria-hidden="true" />
                    <span>Destino: <a href={`/l/${selectedCampaign.landingSlug}`} target="_blank" rel="noreferrer">/l/{selectedCampaign.landingSlug}</a></span>
                    <small>Se añadirán UTMs únicas para cada canal.</small>
                  </div>
                ) : (
                  <div className="social-campaign-destination warning">
                    <RiAlertLine aria-hidden="true" />
                    <span>Esta campaña aún no tiene landing.</span>
                    <a href="/landings">Crear landing <RiArrowRightSLine /></a>
                  </div>
                )
              )}
            </div>
            <label htmlFor="ai-prompt">Brief de contenido</label>
            <textarea id="ai-prompt" value={aiPrompt} onChange={event => setAiPrompt(event.target.value)} rows="3" placeholder="Cuéntale a la IA qué quieres conseguir…" />
            <div className="social-ai-form-row">
              <label htmlFor="ai-tone">Tono</label>
              <select id="ai-tone" value={aiTone} onChange={event => setAiTone(event.target.value)}>
                <option value="cercano">Cercano</option>
                <option value="experto">Experto</option>
                <option value="inspirador">Inspirador</option>
                <option value="directo">Directo</option>
              </select>
            </div>
            <div className="social-ai-form-row">
              <label htmlFor="ai-start-date">Fecha de inicio</label>
              <input id="ai-start-date" type="date" value={aiStartDate} onChange={event => setAiStartDate(event.target.value)} />
            </div>
            <fieldset>
              <legend>Canales de salida</legend>
              <div className="social-channel-picker">
                {Object.entries(PLATFORM_META).map(([id, item]) => {
                  const Icon = item.Icon
                  return (
                    <button type="button" key={id} className={`social-channel-option${aiChannels.includes(id) ? ' selected' : ''}`} onClick={() => toggleChannel(id)}>
                      <Icon aria-hidden="true" /><span>{item.name}</span>{aiChannels.includes(id) && <RiCheckLine aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <button className="social-button primary social-ai-submit" type="submit" disabled={aiLoading || !aiPrompt.trim() || !aiChannels.length}>
              <RiSparkling2Line /> {aiLoading ? 'Generando…' : 'Generar plan de contenido'}
            </button>
          </form>
        </div>

        {aiPlan && (
          <div className="social-ai-result" style={{ position: 'static', width: '100%', margin: '14px 0 0' }}>
            <div className="social-ai-result-head">
              <div><span className="social-result-label">{aiPlan.generatedBy === 'fallback' ? 'Borrador automático · IA no disponible' : 'Plan generado con IA'}</span><h3>{aiPlan.title}</h3><p>{aiPlan.summary}</p></div>
              <button className="social-icon-button" type="button" aria-label="Descartar plan generado" onClick={() => setAiPlan(null)}><RiCloseLine /></button>
            </div>
            <div className="social-ai-post-list">
              {(aiPlan.posts ?? []).map((post, index) => {
                const meta = platformMeta(post.platform)
                const status = draftStatus[index]
                const creationBlocked = !selectedCampaignId || !selectedCampaign?.landingSlug
                return (
                  <article className="social-ai-post" key={`${post.platform}-${index}`}>
                    <div className="social-ai-post-date"><strong>{formatShortDate(post.suggestedDate)}</strong><span>{meta.name}</span></div>
                    <div className="social-ai-post-copy">
                      <div><span className="social-ai-post-type" style={{ color: meta.color }}>{meta.name}</span></div>
                      <p>{post.text}</p>
                      <div className="social-ai-post-image">
                        {postImages[index] && <img src={postImages[index]} alt="Imagen del post" />}
                        <label className={`social-text-button${imageStatus[index] === 'uploading' || status === 'creating' || status === 'done' ? ' disabled' : ''}`}>
                          <RiImageAddLine /> {imageStatus[index] === 'uploading' ? 'Subiendo…' : 'Subir imagen'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            hidden
                            disabled={imageStatus[index] === 'uploading' || status === 'creating' || status === 'done'}
                            onChange={event => { void uploadImage(event.target.files?.[0], index); event.target.value = '' }}
                          />
                        </label>
                        <button
                          type="button"
                          className="social-text-button"
                          disabled={imageStatus[index] === 'generating' || imageStatus[index] === 'uploading' || status === 'creating' || status === 'done'}
                          onClick={() => generateImage(post, index)}
                        >
                          <RiSparkling2Line /> {imageStatus[index] === 'generating' ? 'Generando imagen…' : 'Generar imagen con IA'}
                        </button>
                        {postImages[index] && status !== 'creating' && status !== 'done' && (
                          <button
                            type="button"
                            className="social-text-button"
                            aria-label="Quitar imagen"
                            onClick={() => setPostImages(previous => ({ ...previous, [index]: undefined }))}
                          >
                            <RiCloseLine /> Quitar
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="social-button secondary"
                      disabled={status === 'creating' || status === 'done' || creationBlocked}
                      title={creationBlocked ? 'Selecciona una campaña con landing para crear el borrador' : undefined}
                      onClick={() => createDraft(post, index)}
                    >
                      {status === 'done' ? <><RiCheckLine /> Creado</> : status === 'creating' ? 'Creando…' : 'Crear borrador'}
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        )}

        <div className="social-ai-footer"><span><RiGlobalLine /> Cada borrador incluye la landing y UTMs de su campaña.</span><span><RiTimeLine /> Las fechas son sugerencias, ajústalas desde el calendario de Metricool.</span></div>
      </section>

      {notice && <div className="social-ai-toast" role="status"><RiCheckLine /> {notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><RiCloseLine /></button></div>}
    </div>
  )
}
