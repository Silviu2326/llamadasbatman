// Lógica pura del Resumen Growth (/growth): catálogo de formatos, normalización
// de la respuesta, filtros y validación. Vive fuera de GrowthHubPage.jsx para
// poder probarla con node:test sin React ni red.

/** Mismo mínimo que createSchema/updateSchema en growthPrograms.controller.ts. */
export const PROGRAM_NAME_MIN_LENGTH = 2
export const PROGRAM_NAME_MAX_LENGTH = 160

export const TYPE_OPTIONS = [
  { value: 'lead_magnet', label: 'Lead magnet', area: 'acquisition' },
  { value: 'popup', label: 'Popup de captación', area: 'acquisition' },
  { value: 'webinar', label: 'Webinar', area: 'acquisition' },
  { value: 'newsletter', label: 'Newsletter', area: 'newsletter' },
  { value: 'automation_journey', label: 'Journey automatizado', area: 'automation' },
  { value: 'sales_sequence', label: 'Secuencia comercial', area: 'sales' },
  { value: 'proposal', label: 'Propuesta comercial', area: 'sales' },
  { value: 'nps', label: 'Pulso NPS', area: 'retention' },
  { value: 'referral', label: 'Programa de referidos', area: 'retention' },
  { value: 'customer_health', label: 'Customer health', area: 'retention' },
]

/** Estados desde los que la fila ofrece activar/pausar. */
const TOGGLEABLE_STATUSES = ['draft', 'active', 'paused']

export function areaFromType(type) {
  return TYPE_OPTIONS.find(option => option.value === type)?.area || 'automation'
}

export function readableType(type) {
  return TYPE_OPTIONS.find(option => option.value === type)?.label || String(type || 'Programa').replaceAll('_', ' ')
}

/**
 * Acepta la lista directa o envuelta en { programs } / { data } y descarta
 * archivados: la API los excluye por defecto, pero una respuesta de archivo o
 * un cliente antiguo no debe devolverlos a la vista.
 */
export function normalizePrograms(payload) {
  const list = Array.isArray(payload) ? payload : payload?.programs || payload?.data || []
  if (!Array.isArray(list)) return []
  return list
    .filter(program => program && typeof program === 'object' && !isArchived(program))
    .map(program => ({ ...program, area: areaFromType(program.type) }))
}

export function isArchived(program) {
  return Boolean(program?.archivedAt) || program?.status === 'archived'
}

export function canToggleProgram(program) {
  return TOGGLEABLE_STATUSES.includes(program?.status || 'draft')
}

/**
 * Filtra por área, estado y texto. `area`/`status` = 'all' no filtran.
 * `localeTag` se usa para comparar sin distinguir mayúsculas según el idioma.
 */
export function filterPrograms(programs, { area = 'all', status = 'all', query = '', localeTag } = {}) {
  const lower = value => String(value || '').toLocaleLowerCase(localeTag)
  const term = lower(query).trim()
  return (programs || []).filter(program => {
    const programStatus = program.status || 'draft'
    const matchingArea = area === 'all' || program.area === area
    const matchingStatus = status === 'all' || programStatus === status
    const matchingSearch = !term || [program.name, program.description, program.type, readableType(program.type)].some(value => lower(value).includes(term))
    return matchingArea && matchingStatus && matchingSearch
  })
}

/** Conteo por área para las pestañas. */
export function countByArea(programs) {
  return (programs || []).reduce((counts, program) => ({ ...counts, [program.area]: (counts[program.area] || 0) + 1 }), {})
}

/** Devuelve el mensaje de error del nombre o '' si es válido. */
export function validateProgramName(name) {
  const value = String(name ?? '').trim()
  if (!value) return 'Escribe un nombre para el programa.'
  if (value.length < PROGRAM_NAME_MIN_LENGTH) return `El nombre debe tener al menos ${PROGRAM_NAME_MIN_LENGTH} caracteres.`
  if (value.length > PROGRAM_NAME_MAX_LENGTH) return `El nombre no puede superar ${PROGRAM_NAME_MAX_LENGTH} caracteres.`
  return ''
}

/**
 * Tras crear un programa, garantiza que los filtros activos lo muestran: si el
 * área o el estado filtrados lo ocultarían, se vuelven a 'all' y se limpia la
 * búsqueda. Devuelve los filtros que la página debe aplicar.
 */
export function filtersRevealing(program, filters) {
  const visible = filterPrograms([program], filters).length === 1
  if (visible) return filters
  return { ...filters, area: 'all', status: 'all', query: '' }
}

/** Sustituye un programa de la lista o lo quita si quedó archivado. */
export function replaceProgram(programs, id, next) {
  if (!next || isArchived(next)) return programs.filter(program => program.id !== id)
  return programs.map(program => program.id === id ? { ...program, ...next, area: areaFromType(next.type || program.type) } : program)
}

/** Extrae el mensaje del backend ({ error } o validación zod con fields). */
export function errorMessageFrom(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback
  const fields = payload.fields && typeof payload.fields === 'object' ? Object.values(payload.fields).flat().filter(Boolean) : []
  if (payload.error && fields.length) return `${payload.error}: ${fields.join(' ')}`
  return payload.error || payload.message || fallback
}
