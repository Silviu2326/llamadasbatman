import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { extractRadarDocument, RADAR_FILE_BYTES, type DocumentText } from './radarDocument'
import { collectIntakePages, type IntakePage } from './websiteIntake.crawler'
import { assertAuditablePublicUrl, normalizeUrl } from './digitalAudit.service'
import { createAssetFromBuffer } from './assets.service'
import { invalidateAgentConfigCache, loadAgentConfig } from '../voice/agentConfig'
import { buildIntelligentPromptDetailed, knowledgeIdsFromSettings, type IntelligentPromptResult } from '../voice/intelligence/promptContext'

/**
 * Base de conocimiento de la organización: lo que el agente puede consultar
 * en una llamada (promptContext.knowledgeSection).
 *
 * Hasta el 23-09-2026 un PDF llegaba al agente como «Archivo importado:
 * nombre (tamaño)» y una URL como la propia URL. Ahora el texto se extrae en
 * el servidor (proceso hijo con límite de memoria y tiempo, el mismo del
 * radar) y las webs se rastrean con el crawler del intake, sobre una URL
 * pública validada. El binario original se archiva como Asset privado; en
 * `fileUrl` queda solo su referencia, nunca una data-URL.
 */

export const KNOWLEDGE_TYPES = ['document', 'url', 'article', 'text', 'faq', 'seo-article'] as const
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number]

/** Mismo tope que el extractor del radar. */
export const KNOWLEDGE_FILE_BYTES = RADAR_FILE_BYTES
/** Lo que se guarda como `content` (el extractor ya corta en 60.000). */
export const KNOWLEDGE_CONTENT_CHARS = 60_000
/** Caracteres de `content` que devuelve el listado; el resto va por `GET /:id`. */
export const LIST_PREVIEW_CHARS = 2_000
const URL_PAGE_CHARS = 9_000

export class KnowledgeError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) {
    super(message)
    this.name = 'KnowledgeError'
  }
}

export interface KnowledgeFileInput {
  /** Nombre original con extensión; decide el extractor. */
  name: string
  contentBase64: string
}

export interface CreateKnowledgeInput {
  name: string
  type?: KnowledgeType
  content?: string
  /** URL pública a rastrear cuando `type === 'url'`. */
  sourceUrl?: string
  file?: KnowledgeFileInput
  /** Compatibilidad: data-URL de clientes antiguos. Se convierte en `file`. */
  fileUrl?: string
}

/** Dependencias sustituibles en tests (extractor, crawler, validador de URL, archivo). */
export interface KnowledgeDeps {
  extract: (buffer: Buffer, filename: string) => Promise<DocumentText>
  crawl: (website: string) => Promise<IntakePage[]>
  assertPublicUrl: (url: string) => Promise<unknown>
  archive: ((input: { orgId: string; buffer: Buffer; filename: string; mimeType: string }) => Promise<{ id: string }>) | null
}

const defaultDeps: KnowledgeDeps = {
  extract: extractRadarDocument,
  crawl: collectIntakePages,
  assertPublicUrl: assertAuditablePublicUrl,
  archive: input => createAssetFromBuffer({ orgId: input.orgId, buffer: input.buffer, filename: input.filename, kind: 'document', mimeType: input.mimeType, provider: 'knowledge-upload' }),
}

export interface KnowledgeExtraction {
  format: string
  chars: number
  warnings: string[]
  /** Páginas rastreadas (solo URL). */
  pages?: number
  /** Id del Asset con el original, si se pudo archivar. */
  assetId?: string | null
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
}
const EXT_BY_MIME: Record<string, string> = Object.fromEntries(Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]))

function extensionOf(filename: string): string {
  return (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
}

/**
 * Comprueba que el binario es lo que dice su extensión antes de gastar un
 * proceso hijo en él. Las cabeceras: `%PDF`, ZIP (`PK\x03\x04`) para DOCX,
 * OLE (`D0 CF 11 E0`) para el .doc antiguo, y UTF-8 sin NUL para texto.
 */
export function assertKnowledgeFileHeader(buffer: Buffer, filename: string): string {
  const ext = extensionOf(filename)
  if (!buffer.length) throw new KnowledgeError('El archivo está vacío.', 'KNOWLEDGE_FILE_EMPTY')
  if (buffer.length > KNOWLEDGE_FILE_BYTES) throw new KnowledgeError('El archivo supera los 10 MB.', 'KNOWLEDGE_FILE_TOO_LARGE', 413)
  if (!MIME_BY_EXT[ext]) throw new KnowledgeError('Formato no compatible. Usa PDF, DOCX, TXT, MD, CSV o JSON.', 'KNOWLEDGE_FILE_FORMAT')
  const head4 = buffer.subarray(0, 4)
  if (ext === 'pdf' && head4.toString('latin1') !== '%PDF') throw new KnowledgeError('El archivo no es un PDF válido.', 'KNOWLEDGE_FILE_HEADER')
  if (ext === 'docx' && !(head4[0] === 0x50 && head4[1] === 0x4b && head4[2] === 0x03 && head4[3] === 0x04)) throw new KnowledgeError('El archivo no es un DOCX válido.', 'KNOWLEDGE_FILE_HEADER')
  if (ext === 'doc') {
    const ole = head4[0] === 0xd0 && head4[1] === 0xcf && head4[2] === 0x11 && head4[3] === 0xe0
    if (!ole) throw new KnowledgeError('El archivo no es un documento Word válido.', 'KNOWLEDGE_FILE_HEADER')
    throw new KnowledgeError('El formato .doc antiguo no se puede leer. Guárdalo como DOCX o PDF y vuelve a subirlo.', 'KNOWLEDGE_FILE_LEGACY_DOC', 415)
  }
  if (['txt', 'md', 'csv', 'json'].includes(ext) && buffer.subarray(0, 4096).includes(0)) throw new KnowledgeError('El archivo de texto no está en UTF-8.', 'KNOWLEDGE_FILE_HEADER')
  return ext
}

function fileFromDataUrl(name: string, dataUrl: string): KnowledgeFileInput {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match || !match[2]) throw new KnowledgeError('fileUrl debe ser una data-URL base64 o, mejor, envía el archivo en `file`.', 'KNOWLEDGE_FILE_FORMAT')
  const ext = EXT_BY_MIME[match[1] ?? ''] ?? ''
  if (!ext) throw new KnowledgeError('Formato no compatible. Usa PDF, DOCX, TXT, MD, CSV o JSON.', 'KNOWLEDGE_FILE_FORMAT')
  const filename = extensionOf(name) === ext ? name : `${name}.${ext}`
  return { name: filename, contentBase64: match[3] ?? '' }
}

function decodeFile(file: KnowledgeFileInput): { buffer: Buffer; ext: string } {
  // 10 MB en base64 son ~13,4 M caracteres; se corta antes de decodificar
  // para no reservar memoria por un cuerpo que se va a rechazar igual.
  if (file.contentBase64.length > Math.ceil(KNOWLEDGE_FILE_BYTES * 4 / 3) + 4) throw new KnowledgeError('El archivo supera los 10 MB.', 'KNOWLEDGE_FILE_TOO_LARGE', 413)
  const buffer = Buffer.from(file.contentBase64, 'base64')
  const ext = assertKnowledgeFileHeader(buffer, file.name)
  return { buffer, ext }
}

async function extractFile(orgId: string, file: KnowledgeFileInput, deps: KnowledgeDeps): Promise<{ content: string; extraction: KnowledgeExtraction; fileUrl: string | null }> {
  const { buffer, ext } = decodeFile(file)
  let extracted: DocumentText
  try {
    extracted = await deps.extract(buffer, file.name)
  } catch (error) {
    throw new KnowledgeError(error instanceof Error ? error.message : 'No se pudo extraer el texto del archivo.', 'KNOWLEDGE_EXTRACTION_FAILED', 422)
  }
  const content = extracted.text.slice(0, KNOWLEDGE_CONTENT_CHARS)
  const warnings = [...extracted.warnings]
  let assetId: string | null = null
  if (deps.archive) {
    try {
      assetId = (await deps.archive({ orgId, buffer, filename: file.name, mimeType: MIME_BY_EXT[ext]! })).id
    } catch (error) {
      // El conocimiento es el texto; el original es un extra. Se avisa y sigue.
      console.warn('[KNOWLEDGE] no se pudo archivar el original:', error instanceof Error ? error.message : error)
      warnings.push('El texto se guardó, pero el archivo original no se pudo archivar.')
    }
  }
  return { content, extraction: { format: ext, chars: content.length, warnings, assetId }, fileUrl: assetId ? `asset://${assetId}` : null }
}

async function crawlUrl(rawUrl: string, deps: KnowledgeDeps): Promise<{ content: string; sourceUrl: string; extraction: KnowledgeExtraction }> {
  const url = normalizeUrl(rawUrl)
  if (!url) throw new KnowledgeError('Falta la URL.', 'KNOWLEDGE_URL_REQUIRED')
  try {
    await deps.assertPublicUrl(url)
  } catch {
    throw new KnowledgeError('Esa URL no se puede rastrear: debe ser una web pública accesible por HTTP(S).', 'KNOWLEDGE_URL_BLOCKED')
  }
  const pages = await deps.crawl(url)
  if (!pages.length) throw new KnowledgeError('No se pudo leer la web: no responde, redirige fuera o no devuelve HTML.', 'KNOWLEDGE_URL_UNREACHABLE', 422)
  const content = pages
    .map(page => `## ${page.title?.trim() || page.url}\n${page.url}\n${page.text.slice(0, URL_PAGE_CHARS).trim()}`)
    .join('\n\n')
    .slice(0, KNOWLEDGE_CONTENT_CHARS)
  return { content, sourceUrl: url, extraction: { format: 'html', chars: content.length, warnings: [], pages: pages.length } }
}

const LIST_SELECT = {
  id: true, orgId: true, name: true, type: true, sourceType: true, sourceUrl: true,
  isActive: true, slug: true, publishedAt: true, createdAt: true, updatedAt: true, content: true,
} satisfies Prisma.KnowledgeBaseSelect

function withPreview<T extends { content: string | null }>(row: T) {
  const content = row.content ?? ''
  return {
    ...row,
    content: content.length > LIST_PREVIEW_CHARS ? `${content.slice(0, LIST_PREVIEW_CHARS)}…` : content,
    contentChars: content.length,
    contentTruncated: content.length > LIST_PREVIEW_CHARS,
  }
}


export async function getKnowledgeBase(orgId: string, id: string, userId?: string) {
  const item = await prisma.knowledgeBase.findFirst({ where: { id, orgId } })
  if (!item) return item
  const [isFavoritedByMe, isHelpfulByMe, helpfulCount] = await Promise.all([
    userId
      ? prisma.knowledgeFavorite.findUnique({
          where: { userId_knowledgeBaseId_type: { userId, knowledgeBaseId: id, type: 'favorite' } },
        })
      : null,
    userId
      ? prisma.knowledgeFavorite.findUnique({
          where: { userId_knowledgeBaseId_type: { userId, knowledgeBaseId: id, type: 'helpful' } },
        })
      : null,
    prisma.knowledgeFavorite.count({ where: { orgId, knowledgeBaseId: id, type: 'helpful' } }),
  ])
  return {
    ...item,
    isFavoritedByMe: !!isFavoritedByMe,
    isHelpfulByMe: !!isHelpfulByMe,
    helpfulCount,
  }
}

/**
 * Listado sin binarios: `fileUrl` se excluye (antes viajaba una data-URL de
 * hasta 10 MB por fila) y `content` va recortado a una vista previa.
 */
export async function listKnowledgeBase(orgId: string) {
  const rows = await prisma.knowledgeBase.findMany({
    where: { orgId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: LIST_SELECT,
  })
  return rows.map(withPreview)
}

export async function createKnowledgeBase(orgId: string, data: CreateKnowledgeInput, deps: KnowledgeDeps = defaultDeps) {
  const type: KnowledgeType = data.type ?? 'document'
  let content = data.content?.trim() ?? ''
  let fileUrl: string | null = null
  let sourceUrl: string | null = null
  let sourceType = 'manual'
  let extraction: KnowledgeExtraction | null = null

  const file = data.file ?? (data.fileUrl?.startsWith('data:') ? fileFromDataUrl(data.name, data.fileUrl) : null)
  if (file) {
    const result = await extractFile(orgId, file, deps)
    content = result.content
    fileUrl = result.fileUrl
    sourceType = 'upload'
    extraction = result.extraction
  } else if (type === 'url') {
    const result = await crawlUrl(data.sourceUrl ?? content, deps)
    content = result.content
    sourceUrl = result.sourceUrl
    sourceType = 'url'
    extraction = result.extraction
  } else if (data.fileUrl && /^https?:\/\//i.test(data.fileUrl)) {
    fileUrl = data.fileUrl
  }

  if (!content) throw new KnowledgeError('Añade contenido, un archivo o una URL.', 'KNOWLEDGE_CONTENT_REQUIRED')
  const item = await prisma.knowledgeBase.create({
    data: {
      orgId,
      name: data.name,
      type,
      content: content.slice(0, KNOWLEDGE_CONTENT_CHARS),
      fileUrl,
      sourceUrl,
      sourceType,
    },
  })
  return { ...item, extraction }
}

export async function removeKnowledgeBase(orgId: string, id: string) {
  return prisma.knowledgeBase.updateMany({
    where: { id, orgId },
    data: { isActive: false },
  })
}

export async function updateKnowledgeBase(orgId: string, id: string, data: {
  name?: string
  type?: KnowledgeType
  content?: string
  fileUrl?: string
  isActive?: boolean
}) {
  if (data.fileUrl?.startsWith('data:')) throw new KnowledgeError('Sube el archivo con POST /api/knowledge/upload; fileUrl no admite data-URL.', 'KNOWLEDGE_FILE_FORMAT')
  return prisma.knowledgeBase.updateMany({
    where: { id, orgId },
    data: { ...data, content: data.content?.slice(0, KNOWLEDGE_CONTENT_CHARS) },
  })
}

// ---------------------------------------------------------------------------
// Vinculación por agente y vista previa del prompt.
// ---------------------------------------------------------------------------

async function findAgentSettings(orgId: string, agentId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true, name: true, settings: true } })
  if (!agent) throw new KnowledgeError('Agente no encontrado.', 'AGENT_NOT_FOUND', 404)
  return agent
}

/** Documentos de la organización y cuáles usa el agente (null = todos). */
export async function getAgentKnowledgeLinks(orgId: string, agentId: string) {
  const [agent, documents] = await Promise.all([
    findAgentSettings(orgId, agentId),
    prisma.knowledgeBase.findMany({
      where: { orgId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, type: true, sourceType: true, updatedAt: true, content: true },
    }),
  ])
  const selected = knowledgeIdsFromSettings(agent.settings)
  const known = new Set(documents.map(document => document.id))
  return {
    agentId: agent.id,
    useAll: selected === null,
    knowledgeIds: selected?.filter(id => known.has(id)) ?? [],
    documents: documents.map(document => ({
      id: document.id, name: document.name, type: document.type, sourceType: document.sourceType, updatedAt: document.updatedAt,
      contentChars: (document.content ?? '').length,
    })),
  }
}

/**
 * Guarda `settings.knowledgeIds` fusionando con el resto de ajustes del
 * agente (no se toca nada más). `null` vuelve a «usar todos».
 */
export async function setAgentKnowledgeIds(orgId: string, agentId: string, knowledgeIds: string[] | null) {
  const agent = await findAgentSettings(orgId, agentId)
  let next: string[] | null = null
  if (knowledgeIds) {
    const unique = [...new Set(knowledgeIds.map(id => id.trim()).filter(Boolean))]
    if (unique.length) {
      const found = await prisma.knowledgeBase.findMany({ where: { orgId, id: { in: unique }, isActive: true }, select: { id: true } })
      if (found.length !== unique.length) throw new KnowledgeError('Alguno de los documentos no existe en esta organización.', 'KNOWLEDGE_NOT_FOUND', 404)
      next = unique
    } else {
      // Lista vacía explícita: el agente no usa ningún documento.
      next = []
    }
  }
  const settings = agent.settings && typeof agent.settings === 'object' && !Array.isArray(agent.settings) ? { ...(agent.settings as Record<string, unknown>) } : {}
  if (next === null) delete settings.knowledgeIds
  else settings.knowledgeIds = next
  await prisma.agent.update({ where: { id: agent.id }, data: { settings: settings as Prisma.InputJsonObject } })
  invalidateAgentConfigCache(orgId, agent.id)
  return getAgentKnowledgeLinks(orgId, agent.id)
}

/**
 * El prompt real que recibiría el LLM para este agente ahora mismo, con la
 * lista de fuentes que entraron y cuántos caracteres ocupa cada una.
 */
export async function agentPromptPreview(orgId: string, agentId: string, options: { leadId?: string | null; lastUserTurn?: string | null } = {}): Promise<IntelligentPromptResult & { agent: { id: string; name: string } }> {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true, name: true } })
  if (!agent) throw new KnowledgeError('Agente no encontrado.', 'AGENT_NOT_FOUND', 404)
  // Se salta la caché de cinco minutos: la vista previa debe reflejar lo que
  // se acaba de guardar.
  invalidateAgentConfigCache(orgId, agent.id)
  const config = await loadAgentConfig(agent.id, orgId)
  if (config.softwareId !== agent.id) throw new KnowledgeError('No se pudo cargar la configuración del agente.', 'AGENT_CONFIG_UNAVAILABLE', 503)
  const result = await buildIntelligentPromptDetailed({
    orgId,
    agentId: agent.id,
    basePrompt: (config.playbook.scripts.base_prompt as string) ?? '',
    leadId: options.leadId ?? null,
    agentType: config.agentType,
    direction: config.callDirection === 'inbound' ? 'inbound' : 'outbound',
    strategyId: config.playbook.strategy,
    keyMessages: config.playbook.scripts.key_messages as string | undefined,
    escalationRules: config.playbook.scripts.escalation_rules as string | undefined,
    customPlaybook: config.playbook.scripts.custom_playbook as string | undefined,
    behavior: config.behavior,
    agentName: config.identity.agentName,
    lastUserTurn: options.lastUserTurn ?? null,
  })
  return { ...result, agent }
}

async function toggleReaction(orgId: string, userId: string, knowledgeBaseId: string, type: 'favorite' | 'helpful') {
  const where = { userId_knowledgeBaseId_type: { userId, knowledgeBaseId, type } }
  const existing = await prisma.knowledgeFavorite.findFirst({ where: { orgId, userId, knowledgeBaseId, type } })
  if (existing) {
    await prisma.knowledgeFavorite.delete({ where })
    return false
  }
  await prisma.knowledgeFavorite.create({ data: { orgId, userId, knowledgeBaseId, type } })
  return true
}

export async function toggleFavorite(orgId: string, userId: string, knowledgeBaseId: string) {
  return toggleReaction(orgId, userId, knowledgeBaseId, 'favorite')
}

export async function toggleHelpful(orgId: string, userId: string, knowledgeBaseId: string) {
  return toggleReaction(orgId, userId, knowledgeBaseId, 'helpful')
}
