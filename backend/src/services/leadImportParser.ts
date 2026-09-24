import { parse } from 'csv-parse/sync'

/**
 * Parseo de archivos de importación de leads (CSV y XLSX) con cabeceras
 * flexibles. Antes el CSV exigía literalmente `name,phone,email,company` y
 * separador coma; un archivo exportado desde Excel en español
 * (`Nombre;Teléfono;Correo;Empresa`) fallaba entero. Aquí se aceptan alias
 * en español/inglés, con o sin acentos, y separador `,`, `;` o tabulador.
 *
 * Todo lo de este módulo es puro (sin Prisma) para poder probarlo offline.
 */

export type ImportField =
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'email'
  | 'company'
  | 'consentVoice'
  | 'consentSource'
  | 'consentEvidence'

export interface ParsedImportRow {
  name: string
  phone?: string
  email?: string
  company?: string
  /** `consent_voice` de la fila: true/false si la columna existe y es legible. */
  consentVoice?: boolean
  consentSource?: string
  consentEvidence?: string
}

export interface ParsedImportFile {
  rows: ParsedImportRow[]
  /** Cabeceras originales que no se reconocieron (informativo para el usuario). */
  unmappedHeaders: string[]
  /** Campo → cabecera original usada. */
  mapping: Partial<Record<ImportField, string>>
}

export class ImportParseError extends Error {
  constructor(public code: 'invalid_format' | 'missing_name_column' | 'empty', message: string) {
    super(message)
    this.name = 'ImportParseError'
  }
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'nombre', 'nombre_completo', 'full_name', 'fullname', 'contacto', 'contact', 'contact_name', 'persona', 'lead'],
  firstName: ['first_name', 'firstname', 'nombre_de_pila', 'given_name'],
  lastName: ['last_name', 'lastname', 'apellido', 'apellidos', 'surname', 'family_name'],
  phone: ['phone', 'telefono', 'tel', 'tlf', 'movil', 'mobile', 'celular', 'phone_number', 'numero', 'numero_de_telefono', 'telephone', 'whatsapp'],
  email: ['email', 'correo', 'e_mail', 'mail', 'correo_electronico', 'email_address'],
  company: ['company', 'empresa', 'compania', 'organizacion', 'organization', 'negocio', 'business', 'razon_social', 'account'],
  consentVoice: ['consent_voice', 'consentimiento_voz', 'consentimiento', 'consent', 'voice_consent', 'consiente_llamada', 'acepta_llamadas'],
  consentSource: ['consent_source', 'fuente_consentimiento', 'origen_consentimiento', 'consent_origin'],
  consentEvidence: ['consent_evidence', 'evidencia_consentimiento', 'prueba_consentimiento', 'consent_proof'],
}

/** Minúsculas, sin acentos, sin BOM y con espacios/guiones como `_`. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^﻿/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s\-./]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Asigna cada campo a la primera cabecera que coincide con alguno de sus
 * alias. Una cabecera solo se puede usar para un campo (la primera que la
 * reclama, en el orden de `HEADER_ALIASES`).
 */
export function mapImportHeaders(headers: string[]): { mapping: Partial<Record<ImportField, string>>; unmapped: string[] } {
  const normalized = headers.map(header => normalizeHeader(String(header ?? '')))
  const used = new Set<number>()
  const mapping: Partial<Record<ImportField, string>> = {}
  for (const field of Object.keys(HEADER_ALIASES) as ImportField[]) {
    const aliases = HEADER_ALIASES[field]
    const index = normalized.findIndex((header, i) => !used.has(i) && aliases.includes(header))
    if (index >= 0) {
      used.add(index)
      mapping[field] = headers[index]
    }
  }
  const unmapped = headers.filter((header, i) => !used.has(i) && normalized[i] !== '')
  return { mapping, unmapped }
}

const TRUE_VALUES = new Set(['true', 'si', 'sí', 's', 'yes', 'y', '1', 'x', 'ok', 'verdadero', 'granted', 'concedido'])
const FALSE_VALUES = new Set(['false', 'no', 'n', '0', 'falso', 'revoked', 'revocado', 'denied'])

/** true/sí/1 → true; no/false/0 → false; vacío u otra cosa → undefined. */
export function parseConsentFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined) return undefined
  const text = String(value).trim().toLowerCase()
  if (!text) return undefined
  if (TRUE_VALUES.has(text)) return true
  if (FALSE_VALUES.has(text)) return false
  return undefined
}

/** Cuenta separadores en la línea de cabecera; empate → coma. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  const counts: Array<[',' | ';' | '\t', number]> = [
    [',', (firstLine.match(/,/g) ?? []).length],
    [';', (firstLine.match(/;/g) ?? []).length],
    ['\t', (firstLine.match(/\t/g) ?? []).length],
  ]
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const obj = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }>; hyperlink?: string }
    if (Array.isArray(obj.richText)) return obj.richText.map(part => part.text ?? '').join('').trim()
    if (obj.text !== undefined) return cellText(obj.text)
    if (obj.result !== undefined) return cellText(obj.result)
  }
  return String(value).trim()
}

/**
 * Convierte registros `{cabecera: valor}` en filas tipadas usando el mapeo
 * de cabeceras. Sin columna de nombre (ni nombre+apellidos) no se importa
 * nada: es el único campo obligatorio.
 */
export function buildImportRows(records: Array<Record<string, unknown>>, headers: string[]): ParsedImportFile {
  const { mapping, unmapped } = mapImportHeaders(headers)
  if (!mapping.name && !mapping.firstName) {
    throw new ImportParseError('missing_name_column', 'El archivo no tiene columna de nombre (name/nombre o nombre+apellidos)')
  }
  const read = (record: Record<string, unknown>, field: ImportField) => {
    const header = mapping[field]
    return header === undefined ? '' : cellText(record[header])
  }
  const rows: ParsedImportRow[] = records.map(record => {
    let name = read(record, 'name')
    if (!name) name = [read(record, 'firstName'), read(record, 'lastName')].filter(Boolean).join(' ').trim()
    const row: ParsedImportRow = { name }
    const phone = read(record, 'phone')
    const email = read(record, 'email')
    const company = read(record, 'company')
    if (phone) row.phone = phone
    if (email) row.email = email
    if (company) row.company = company
    const consent = parseConsentFlag(read(record, 'consentVoice'))
    if (consent !== undefined) row.consentVoice = consent
    const source = read(record, 'consentSource')
    const evidence = read(record, 'consentEvidence')
    if (source) row.consentSource = source.slice(0, 120)
    if (evidence) row.consentEvidence = evidence.slice(0, 2000)
    return row
  })
  return { rows, unmappedHeaders: unmapped, mapping }
}

export function parseImportCsv(text: string): ParsedImportFile {
  const clean = text.replace(/^﻿/, '')
  let records: Array<Record<string, unknown>>
  try {
    records = parse(clean, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter: detectDelimiter(clean),
      relax_column_count: true,
      relax_quotes: true,
    })
  } catch {
    throw new ImportParseError('invalid_format', 'Invalid CSV format')
  }
  if (!records.length) throw new ImportParseError('empty', 'CSV is empty')
  const headers = Object.keys(records[0])
  return buildImportRows(records, headers)
}

/** Primera hoja del libro; la primera fila con contenido es la cabecera. */
export async function parseImportXlsx(buffer: Buffer): Promise<ParsedImportFile> {
  // exceljs es CommonJS: con import() dinámico el constructor llega en `default`.
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as any)
  } catch {
    throw new ImportParseError('invalid_format', 'Invalid XLSX format')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new ImportParseError('empty', 'XLSX is empty')

  let headers: string[] | null = null
  const records: Array<Record<string, unknown>> = []
  sheet.eachRow({ includeEmpty: false }, (row: any) => {
    const values = row.values as unknown[] // índice 1-based; [0] siempre vacío
    const cells = values.slice(1).map(cellText)
    if (!headers) {
      if (cells.some(Boolean)) headers = cells.map((cell, i) => cell || `col_${i + 1}`)
      return
    }
    if (!cells.some(Boolean)) return
    const record: Record<string, unknown> = {}
    headers.forEach((header, i) => { record[header] = cells[i] ?? '' })
    records.push(record)
  })
  if (!headers || !records.length) throw new ImportParseError('empty', 'XLSX is empty')
  return buildImportRows(records, headers)
}

/** Decide por nombre de archivo (o cabecera mágica ZIP) si el contenido es XLSX. */
export function looksLikeXlsx(fileName: string | undefined, buffer?: Buffer): boolean {
  if (fileName && /\.xlsx$/i.test(fileName)) return true
  if (buffer && buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return true
  return false
}
