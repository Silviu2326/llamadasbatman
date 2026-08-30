import {
  RiFacebookBoxFill, RiGlobalLine, RiInstagramLine, RiLinkedinBoxFill,
  RiTiktokFill, RiTwitterXFill, RiYoutubeFill,
} from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { getLocale, localeCode } from '../../i18n'

/**
 * Vocabulario y utilidades del estudio de contenido. Son datos, no vista: la
 * página y los paneles los importan para hablar del mismo canal, formato y
 * objetivo que el backend (`contentStudio.service.ts`).
 */

export const PLATFORM_META = {
  instagram: { name: 'Instagram', color: '#e1306c', Icon: RiInstagramLine },
  linkedin: { name: 'LinkedIn', color: '#0a66c2', Icon: RiLinkedinBoxFill },
  facebook: { name: 'Facebook', color: '#1877f2', Icon: RiFacebookBoxFill },
  tiktok: { name: 'TikTok', color: '#25f4ee', Icon: RiTiktokFill },
  youtube: { name: 'YouTube', color: '#ff4d67', Icon: RiYoutubeFill },
  x: { name: 'X', color: 'var(--text)', Icon: RiTwitterXFill },
}

export function platformMeta(name) {
  return PLATFORM_META[String(name ?? '').toLowerCase()] ?? { name: name ?? 'Canal', color: 'var(--accent-soft)', Icon: RiGlobalLine }
}

export const OPPORTUNITY_META = {
  objection: { label: 'Objeción detectada', tone: 'warn' },
  faq: { label: 'Pregunta frecuente', tone: 'info' },
  competitor: { label: 'Comparación con competidor', tone: 'warn' },
  pre_purchase: { label: 'Señal pre-compra', tone: 'success' },
  emotional: { label: 'Frase emocional', tone: 'info' },
  success_story: { label: 'Historia de éxito', tone: 'success' },
}

/** Modos objetivo: espejo de `PIECE_OBJECTIVES` del backend. Vocabulario cerrado. */
export const OBJECTIVE_LABEL = {
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

export function defaultObjectiveFor(type) {
  return OBJECTIVE_BY_TYPE[type] ?? 'educar'
}

export const FORMAT_LABEL = {
  post: 'Post',
  carousel: 'Carrusel',
  reel_script: 'Guion de Reel',
  stories: '3 stories',
  email: 'Email',
  voiceover: 'Locución',
}

export const HISTORY_LABEL = {
  comment: 'comentó',
  submitted: 'la envió a aprobación',
  edited: 'la editó',
  approved: 'la aprobó',
  rejected: 'la rechazó',
  published: 'creó el borrador',
}

export const REJECTION_LABEL = {
  no_suena_a_nosotros: 'No suena a nosotros',
  dato_incorrecto: 'Hay un dato incorrecto',
  no_es_prioridad: 'No es prioridad ahora',
  ya_lo_hemos_contado: 'Ya lo hemos contado',
  demasiado_generico: 'Demasiado genérico',
}

export const PIPELINE_LABEL = {
  new: 'nuevos',
  contacted: 'contactados',
  qualified: 'cualificados',
  unqualified: 'descartados',
  converted: 'convertidos',
  desconocido: 'sin estado',
}

export const IMAGE_BUSY_STATES = ['uploading', 'generating', 'removing']

/**
 * Convierte el cuerpo de una pieza en texto editable según su formato. Cada
 * formato tiene su forma: un desconocido que cayera en hook/body/cta haría
 * que unas stories se editaran —y publicaran— vacías.
 */
export function pieceToText(piece) {
  const body = piece.body ?? {}
  if (piece.format === 'post') return body.text ?? ''
  if (piece.format === 'carousel') return [body.title, ...(body.slides ?? [])].join('\n')
  if (piece.format === 'stories') return (body.stories ?? []).map(story => story?.text ?? '').join('\n')
  if (piece.format === 'email') return [body.subject, body.preheader, body.body].filter(Boolean).join('\n')
  return [body.hook, body.body, body.cta].filter(Boolean).join('\n')
}

/** Y de vuelta: el mismo formato que espera el backend. */
export function textToPiece(piece, text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  if (piece.format === 'post') return { text }
  if (piece.format === 'carousel') return { title: lines[0] ?? '', slides: lines.slice(1) }
  if (piece.format === 'stories') {
    // El sticker no se edita como texto: se conserva el de cada story.
    const previous = piece.body?.stories ?? []
    return { stories: lines.slice(0, 3).map((line, index) => ({ text: line, sticker: previous[index]?.sticker ?? '' })) }
  }
  if (piece.format === 'email') {
    return { ...(piece.body ?? {}), subject: lines[0] ?? '', preheader: lines[1] ?? '', body: lines.slice(2).join('\n\n') }
  }
  const script = { hook: lines[0] ?? '', body: lines.slice(1, -1).join(' '), cta: lines[lines.length - 1] ?? '' }
  // La locución conserva motor, duración y demás metadatos del audio; el
  // `script` sí se rehace porque es el texto recién escrito.
  if (piece.format === 'voiceover') {
    return { ...(piece.body ?? {}), ...script, script: [script.hook, script.body, script.cta].filter(Boolean).join(' ') }
  }
  return script
}

/** Medios: subir y generar devuelven la URL pública; quién la guarda lo decide cada panel. */
export async function uploadMedia(file) {
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

export async function generateMedia(prompt) {
  const res = await apiFetch('/api/metricool/ai/image', { method: 'POST', body: JSON.stringify({ prompt }) })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.imageUrl) throw new Error(data?.error || 'No se pudo generar la imagen.')
  return data.imageUrl
}

/**
 * Rasteriza una slide SVG con plantilla de marca al PNG que Metricool
 * descarga. Lo hace el navegador: en Node exigiría una dependencia nativa. El
 * SVG llega con el logo en base64 porque un `<image href>` externo no se
 * dibuja en canvas.
 */
export async function rasterizeSlide(svgUrl, size = 1080) {
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

export function formatShortDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(localeCode(getLocale()), { day: '2-digit', month: 'short' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(localeCode(getLocale()), { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Euros sin decimales: en una tabla de resultados los céntimos son ruido. */
export function formatEuros(value) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat(localeCode(getLocale()), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

export function formatNumber(value, options = {}) {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'number') return new Intl.NumberFormat(localeCode(getLocale()), options).format(value)
  return String(value)
}

/** "2 cualificados · 1 nuevo", o un guion si esa pieza no trajo a nadie. */
export function formatPipeline(pipeline) {
  const entries = Object.entries(pipeline ?? {}).filter(([, count]) => count > 0)
  if (!entries.length) return '—'
  return entries.map(([status, count]) => `${count} ${PIPELINE_LABEL[status] ?? status}`).join(' · ')
}

export function renderAnalyticsValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString(localeCode(getLocale()))
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `${value.length} elemento${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return `${Object.keys(value).length} campo${Object.keys(value).length === 1 ? '' : 's'}`
  return String(value)
}
