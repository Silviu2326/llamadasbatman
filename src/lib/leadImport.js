// Lógica pura del modal de importación de leads (sin React ni fetch) para
// poder probarla con node:test: qué archivo se acepta, cómo se construye la
// petición, cómo se lee el progreso del ImportJob y cuándo se considera que
// el worker no lo está procesando.

export const IMPORT_ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const IMPORT_POLL_MS = 2000
// Las importaciones las procesa el worker (BACKGROUND_WORKERS_ENABLED=true).
// Si en este tiempo el job no avanza ni una fila, casi seguro no hay worker.
export const IMPORT_STALL_MS = 60_000
// Tope absoluto del polling: pasado esto se deja de preguntar y se avisa.
export const IMPORT_POLL_TIMEOUT_MS = 15 * 60_000

export function importFileKind(fileName) {
  const name = String(fileName || '').toLowerCase()
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) return 'csv'
  return null
}

// Query string de POST /api/leads/import. Solo viaja `consentVoice=true` si
// la casilla está marcada: sin acción explícita no se registra consentimiento.
export function buildImportQuery({ campaignId, autoCall = false, consentVoice = false, consentSource = '', consentEvidence = '', attachExisting = false }) {
  const params = new URLSearchParams()
  params.set('campaignId', campaignId)
  params.set('autoCall', autoCall ? 'true' : 'false')
  if (consentVoice) {
    params.set('consentVoice', 'true')
    if (consentSource.trim()) params.set('consentSource', consentSource.trim().slice(0, 120))
    if (consentEvidence.trim()) params.set('consentEvidence', consentEvidence.trim().slice(0, 2000))
  }
  if (attachExisting) params.set('attachExisting', 'true')
  return params.toString()
}

export function importProgress(job) {
  if (!job) return { percent: 0, done: false, failed: false, running: false }
  const done = job.status === 'completed' || job.status === 'failed'
  const total = Number(job.totalRows) || 0
  const processed = Number(job.processedRows) || 0
  const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : done ? 100 : 0
  return { percent, done, failed: job.status === 'failed', running: !done }
}

/**
 * Sin progreso durante IMPORT_STALL_MS con el job todavía pendiente o en
 * proceso → el worker de importaciones no está corriendo (o está caído).
 * `lastProgressAt` es la última vez que processedRows cambió (o se creó el job).
 */
export function detectStalledImport({ job, lastProgressAt, now = Date.now(), stallMs = IMPORT_STALL_MS }) {
  if (!job || importProgress(job).done) return false
  if (!Number.isFinite(lastProgressAt)) return false
  return now - lastProgressAt >= stallMs
}

export function stalledImportMessage(job) {
  const pending = job?.status === 'pending'
  return pending
    ? 'La importación sigue en cola y ningún proceso la ha recogido. El worker de importaciones (BACKGROUND_WORKERS_ENABLED=true) no parece estar en marcha: avisa al administrador. Los datos no se han perdido; se procesarán cuando el worker arranque.'
    : 'La importación lleva más de un minuto sin avanzar. Puede que el worker se haya reiniciado: la reanudará automáticamente al recuperar la lease. Si no avanza en unos minutos, avisa al administrador.'
}

const ERROR_KINDS = [
  ['invalidPhone', /^invalid_phone/],
  ['alreadyExists', /^already_exists/],
  ['duplicateInFile', /^duplicate_in_file/],
]

export function classifyImportError(message) {
  const text = String(message || '')
  for (const [kind, pattern] of ERROR_KINDS) if (pattern.test(text)) return kind
  return 'other'
}

export function describeImportError(message) {
  const text = String(message || '')
  switch (classifyImportError(text)) {
    case 'invalidPhone': return `Teléfono no válido${text.includes(':') ? ` (${text.split(':').slice(1).join(':').trim()})` : ''}: usa +34… o 9 dígitos nacionales.`
    case 'alreadyExists': return `Ya existía en el CRM${/mismo email/.test(text) ? ' (mismo email)' : /mismo tel/.test(text) ? ' (mismo teléfono)' : ''}; no se ha duplicado.`
    case 'duplicateInFile': return 'Repetido dentro del archivo; solo se importó la primera fila.'
    default: return text || 'Error al importar la fila'
  }
}

export function summarizeImportErrors(errors) {
  const summary = { invalidPhone: 0, alreadyExists: 0, duplicateInFile: 0, other: 0 }
  for (const error of Array.isArray(errors) ? errors : []) summary[classifyImportError(error?.message)]++
  return summary
}
