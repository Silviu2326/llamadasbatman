import type { Job, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { readResponseBufferLimited } from '../lib/integrationRuntime'
import { executeCapabilityInline } from '../providers/inline'
import { createJob, hasJobExecutor, registerJobExecutor } from './jobs.service'
import {
  decryptOrganizationCredentialSlot,
  markOrganizationCredentialError,
  revokeOrganizationCredential,
  upsertOrganizationCredential,
} from './organizationCredentials.service'
import {
  connectorOf as anyConnectorOf,
  getWebsiteConnection,
  setWebsiteConnector,
  type GitConnectorState,
} from './websiteConnections.service'

/**
 * Conector Git (GitHub). Para webs de código propio: el cliente conecta su
 * repositorio con un token, describe un cambio, y un agente lo propone como
 * **pull request**. Vendrava nunca escribe en la rama principal: publicar es
 * aprobar y fusionar el PR con el flujo de despliegue que el cliente ya tenga.
 *
 * El agente no clona nada: trabaja con la API de GitHub (árbol, contenidos,
 * blobs, commits, refs, pulls). La build y los tests los ejecuta la CI del
 * propio repositorio sobre el PR, y Vendrava lee su resultado.
 */

export const GIT_PROVIDER = 'github'
export const GIT_PROPOSAL_JOB_KIND = 'web.git.proposal'

const GITHUB_API = (process.env.GITHUB_API_URL?.trim() || 'https://api.github.com').replace(/\/+$/, '')
const REQUEST_TIMEOUT_MS = 20_000
const MAX_BODY_BYTES = 6_000_000

// Límites del agente: cuántos archivos ve, cuántos lee y cuánto puede escribir.
const MAX_TREE_PATHS_IN_PROMPT = 400
const MAX_FILES_TO_READ = 8
const MAX_EDITABLE_FILE_BYTES = 40_000
const MAX_PROMPT_FILE_CHARS = 60_000
const MAX_CHANGES = 10
const MAX_CHANGE_CHARS = 200_000
const SELECT_MAX_TOKENS = 1_200
const EDIT_MAX_TOKENS = 12_000

export class GitConnectorError extends Error {
  status: number
  code: string
  constructor(code: string, status = 400, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = status
  }
}

export type GitAuth = { token: string; owner: string; repo: string }

/* ── Repositorio ───────────────────────────────────────────────────────── */

/** Acepta https://github.com/o/r(.git), github.com/o/r, git@github.com:o/r.git y o/r. */
export function parseRepository(input: string): { owner: string; repo: string } {
  const value = input.trim()
  const patterns = [
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$/i,
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i,
    /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match) return { owner: match[1], repo: match[2] }
  }
  throw new GitConnectorError('GIT_REPOSITORY_INVALID', 400)
}

export async function githubRequest<T = unknown>(
  token: string | null,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; timeoutMs?: number } = {},
): Promise<{ status: number; data: T | null }> {
  const url = path.startsWith('http') ? path : `${GITHUB_API}${path.startsWith('/') ? '' : '/'}${path}`
  const controller = new AbortController()
  const timeoutMs = init.timeoutMs ?? REQUEST_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Vendrava-Connector/1.0 (+https://vendrava.com)',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.status >= 300 && response.status < 400) throw new GitConnectorError('GIT_REDIRECT_BLOCKED', 502)
    const raw = (await readResponseBufferLimited(response, MAX_BODY_BYTES, timeoutMs)).toString('utf8')
    let data: T | null = null
    if (raw.trim()) {
      try {
        data = JSON.parse(raw) as T
      } catch {
        data = null
      }
    }
    return { status: response.status, data }
  } catch (error) {
    if (error instanceof GitConnectorError) throw error
    const aborted = error instanceof Error && error.name === 'AbortError'
    throw new GitConnectorError(aborted ? 'GIT_TIMEOUT' : 'GIT_UNREACHABLE', 502)
  } finally {
    clearTimeout(timer)
  }
}

function ghMessage(data: unknown): string | undefined {
  return data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string' ? (data as { message: string }).message : undefined
}

function assertOk(result: { status: number; data: unknown }, code: string, okStatuses: number[] = [200, 201]) {
  if (result.status === 401) throw new GitConnectorError('GIT_AUTH_FAILED', 401, ghMessage(result.data))
  if (result.status === 403) throw new GitConnectorError('GIT_INSUFFICIENT_PERMISSIONS', 403, ghMessage(result.data))
  if (result.status === 404) throw new GitConnectorError('GIT_NOT_FOUND', 404, ghMessage(result.data))
  if (!okStatuses.includes(result.status)) throw new GitConnectorError(code, 502, ghMessage(result.data))
}

type RepoInfo = { default_branch?: string; private?: boolean; html_url?: string; permissions?: { push?: boolean; pull?: boolean; admin?: boolean } }

async function inspectRepository(auth: GitAuth): Promise<GitConnectorState> {
  const repo = await githubRequest<RepoInfo>(auth.token, `/repos/${auth.owner}/${auth.repo}`)
  assertOk(repo, 'GIT_UNEXPECTED_RESPONSE')
  const info = repo.data ?? {}
  // /user falla con tokens de app o de organización: el nombre es opcional.
  const user = await githubRequest<{ login?: string }>(auth.token, '/user').catch(() => null)
  return {
    kind: 'git',
    provider: 'github',
    owner: auth.owner,
    repo: auth.repo,
    defaultBranch: info.default_branch || 'main',
    canPush: info.permissions?.push === true,
    isPrivate: info.private === true,
    htmlUrl: info.html_url ?? `https://github.com/${auth.owner}/${auth.repo}`,
    username: user?.status === 200 ? user.data?.login ?? null : null,
    verifiedAt: new Date().toISOString(),
  }
}

async function loadConnection(orgId: string, connectionId: string) {
  const connection = await prisma.websiteConnection.findFirst({ where: { id: connectionId, orgId } })
  if (!connection) throw new GitConnectorError('WEB_CONNECTION_NOT_FOUND', 404)
  return connection
}

function gitConnectorOf(connection: { detection?: unknown } | null | undefined): GitConnectorState | null {
  const connector = anyConnectorOf(connection)
  return connector?.kind === 'git' ? connector : null
}

async function loadAuth(orgId: string, connectionId: string): Promise<GitAuth> {
  const fields = await decryptOrganizationCredentialSlot(orgId, GIT_PROVIDER, connectionId)
  if (!fields?.token || !fields.owner || !fields.repo) throw new GitConnectorError('GIT_NOT_CONNECTED', 409)
  return { token: fields.token, owner: fields.owner, repo: fields.repo }
}

/* ── Conexión ──────────────────────────────────────────────────────────── */

export async function connectGit(params: { orgId: string; connectionId: string; repository: string; token: string; actorUserId?: string | null; correlationId?: string }) {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const { owner, repo } = parseRepository(params.repository)
  const auth: GitAuth = { token: params.token.trim(), owner, repo }
  const state = await inspectRepository(auth)
  if (!state.canPush) throw new GitConnectorError('GIT_INSUFFICIENT_PERMISSIONS', 403)

  await upsertOrganizationCredential(params.orgId, {
    provider: GIT_PROVIDER,
    slot: connection.id,
    secrets: { token: auth.token, owner, repo },
    metadata: { domain: connection.domain, repository: `${owner}/${repo}` },
    scopes: ['contents:write', 'pull_requests:write'],
  })
  await setWebsiteConnector(connection.id, state, { status: 'connected', connectionMode: 'git' })
  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId ?? null,
    action: 'web_connection.git.connect',
    entityType: 'WebsiteConnection',
    entityId: connection.id,
    after: { repository: `${owner}/${repo}`, defaultBranch: state.defaultBranch, username: state.username },
    correlationId: params.correlationId,
  })
  return getWebsiteConnection(params.orgId, connection.id)
}

export async function verifyGit(params: { orgId: string; connectionId: string }) {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const auth = await loadAuth(params.orgId, connection.id)
  try {
    const state = await inspectRepository(auth)
    await setWebsiteConnector(connection.id, state, { status: state.canPush ? 'connected' : 'degraded', connectionMode: 'git' })
  } catch (error) {
    if (error instanceof GitConnectorError && (error.code === 'GIT_AUTH_FAILED' || error.code === 'GIT_NOT_FOUND')) {
      await markOrganizationCredentialError(params.orgId, GIT_PROVIDER, error, connection.id)
      const previous = gitConnectorOf(connection)
      await setWebsiteConnector(connection.id, previous ? { ...previous, canPush: false, verifiedAt: new Date().toISOString() } : null, { status: 'degraded' })
    }
    throw error
  }
  return getWebsiteConnection(params.orgId, connection.id)
}

export async function disconnectGit(params: { orgId: string; connectionId: string; actorUserId?: string | null; correlationId?: string }) {
  const connection = await loadConnection(params.orgId, params.connectionId)
  await revokeOrganizationCredential(params.orgId, GIT_PROVIDER, connection.id).catch(() => undefined)
  await setWebsiteConnector(connection.id, null, { status: connection.lastEventAt ? 'connected' : 'setup_required', connectionMode: 'script' })
  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId ?? null,
    action: 'web_connection.git.disconnect',
    entityType: 'WebsiteConnection',
    entityId: connection.id,
    correlationId: params.correlationId,
  })
  return getWebsiteConnection(params.orgId, connection.id)
}

/* ── Propuestas (pull requests) ────────────────────────────────────────── */

export type ProposalFile = { path: string; action: 'created' | 'modified'; additions: number; deletions: number }

export type ProposalView = {
  id: string
  connectionId: string
  source: string
  status: string
  title: string
  instructions: string
  baseBranch: string
  branch: string | null
  prNumber: number | null
  prUrl: string | null
  summary: string | null
  files: ProposalFile[]
  checksStatus: string | null
  error: string | null
  createdAt: Date
  updatedAt: Date
  proposedAt: Date | null
  mergedAt: Date | null
  closedAt: Date | null
}

function proposalView(row: {
  id: string; connectionId: string; source: string; status: string; title: string; instructions: string; baseBranch: string
  branch: string | null; prNumber: number | null; prUrl: string | null; summary: string | null; files: unknown; checksStatus: string | null
  error: string | null; createdAt: Date; updatedAt: Date; proposedAt: Date | null; mergedAt: Date | null; closedAt: Date | null
}): ProposalView {
  return {
    id: row.id,
    connectionId: row.connectionId,
    source: row.source,
    status: row.status,
    title: row.title,
    instructions: row.instructions,
    baseBranch: row.baseBranch,
    branch: row.branch,
    prNumber: row.prNumber,
    prUrl: row.prUrl,
    summary: row.summary,
    files: Array.isArray(row.files) ? row.files as ProposalFile[] : [],
    checksStatus: row.checksStatus,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    proposedAt: row.proposedAt,
    mergedAt: row.mergedAt,
    closedAt: row.closedAt,
  }
}

export async function listGitProposals(orgId: string, connectionId: string, limit = 20): Promise<ProposalView[]> {
  const rows = await prisma.websiteChangeProposal.findMany({
    where: { orgId, connectionId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(50, Math.max(1, limit)),
  })
  return rows.map(proposalView)
}

export async function getGitProposal(orgId: string, connectionId: string, proposalId: string): Promise<ProposalView | null> {
  const row = await prisma.websiteChangeProposal.findFirst({ where: { id: proposalId, orgId, connectionId } })
  return row ? proposalView(row) : null
}

function deriveTitle(instructions: string): string {
  const firstLine = instructions.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? 'Cambio propuesto por Vendrava'
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine
}

/** Encola la propuesta: el agente corre en el worker (Job) y actualiza la fila. */
export async function createGitProposal(params: {
  orgId: string
  connectionId: string
  instructions: string
  title?: string
  source?: 'manual' | 'seo'
  actorUserId?: string | null
  correlationId?: string
}): Promise<ProposalView> {
  const connection = await loadConnection(params.orgId, params.connectionId)
  const connector = gitConnectorOf(connection)
  if (!connector?.canPush) throw new GitConnectorError('GIT_NOT_CONNECTED', 409)
  const instructions = params.instructions.trim()
  if (instructions.length < 10) throw new GitConnectorError('GIT_INSTRUCTIONS_TOO_SHORT', 400)

  const running = await prisma.websiteChangeProposal.count({ where: { connectionId: connection.id, status: { in: ['queued', 'running'] } } })
  if (running >= 2) throw new GitConnectorError('GIT_TOO_MANY_RUNNING', 429)

  const proposal = await prisma.websiteChangeProposal.create({
    data: {
      orgId: params.orgId,
      connectionId: connection.id,
      source: params.source ?? 'manual',
      status: 'queued',
      title: params.title?.trim() || deriveTitle(instructions),
      instructions,
      baseBranch: connector.defaultBranch,
      createdByUserId: params.actorUserId ?? null,
    },
  })
  try {
    const job = await createJob({
      orgId: params.orgId,
      kind: GIT_PROPOSAL_JOB_KIND,
      input: { payload: { proposalId: proposal.id } } as unknown as Prisma.InputJsonValue,
      costEstimateCents: 0,
      createdById: params.actorUserId ?? undefined,
      // Reintentar abriría un segundo PR: si falla, se relanza desde la UI.
      maxAttempts: 1,
    })
    await prisma.websiteChangeProposal.update({ where: { id: proposal.id }, data: { jobId: job.id } })
  } catch (error) {
    await prisma.websiteChangeProposal.update({ where: { id: proposal.id }, data: { status: 'failed', error: 'No se pudo encolar el trabajo del agente.' } })
    throw error
  }
  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId ?? null,
    action: 'web_connection.git.proposal.create',
    entityType: 'WebsiteChangeProposal',
    entityId: proposal.id,
    after: { title: proposal.title, source: proposal.source, connectionId: connection.id },
    correlationId: params.correlationId,
  })
  return proposalView({ ...proposal })
}

/* ── El agente ─────────────────────────────────────────────────────────── */

const IGNORED_DIRS = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.output|vendor|coverage|\.cache|\.turbo|\.vercel|\.netlify|storybook-static|__pycache__|target)(\/|$)/
const IGNORED_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|composer\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock|\.DS_Store)$/
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|pdf|zip|gz|tgz|bz2|7z|rar|mp[34]|wav|ogg|webm|mov|avi|woff2?|ttf|otf|eot|exe|dll|so|dylib|wasm|jar|class|pyc|map|min\.js|min\.css)$/i
// Nunca se tocan: secretos, CI (un PR podría ejecutar código en la CI del cliente) y hooks.
const PROTECTED_PATHS = /(^|\/)(\.env[^/]*|\.github\/|\.gitlab-ci\.yml|\.circleci\/|\.husky\/|\.git\/|secrets?\.[a-z]+)/i

/** Prioriza lo que suele contener textos y metadatos de una web. */
function relevanceScore(path: string): number {
  let score = 0
  if (/(^|\/)(src|app|pages|components|layouts|content|public|templates|views|locales|i18n)\//.test(path)) score += 3
  if (/(index|home|layout|head|seo|meta|header|footer|hero|landing|_document|_app|root|site\.config|config)\b/i.test(path)) score += 4
  if (/\.(html?|jsx?|tsx?|vue|svelte|astro|mdx?|json|ya?ml|php|twig|liquid|hbs|ejs|njk|css|scss)$/i.test(path)) score += 2
  if (/(^|\/)(test|tests|__tests__|spec|specs|e2e|fixtures|mocks?)\//i.test(path) || /\.(test|spec)\.[a-z]+$/i.test(path)) score -= 4
  score -= Math.min(3, path.split('/').length - 1) * 0.5
  return score
}

type TreeEntry = { path: string; type: string; size?: number; sha: string }

export function selectCandidatePaths(entries: TreeEntry[], limit = MAX_TREE_PATHS_IN_PROMPT): TreeEntry[] {
  return entries
    .filter(entry => entry.type === 'blob' && !IGNORED_DIRS.test(entry.path) && !IGNORED_FILES.test(entry.path) && !BINARY_EXT.test(entry.path) && !PROTECTED_PATHS.test(entry.path))
    .filter(entry => (entry.size ?? 0) <= 400_000)
    .sort((a, b) => relevanceScore(b.path) - relevanceScore(a.path) || a.path.localeCompare(b.path))
    .slice(0, limit)
}

export function isSafeRepoPath(path: string): boolean {
  if (!path || path.length > 300) return false
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false
  const segments = path.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return false
  if (PROTECTED_PATHS.test(path) || IGNORED_DIRS.test(path) || IGNORED_FILES.test(path) || BINARY_EXT.test(path)) return false
  return true
}

function parseModelJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // sigue abajo
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) throw new GitConnectorError('GIT_AGENT_OUTPUT_INVALID', 502)
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // cae al error de abajo
  }
  throw new GitConnectorError('GIT_AGENT_OUTPUT_INVALID', 502)
}

function preferredProviderId(): string {
  return process.env.WEB_GIT_AGENT_PROVIDER_ID?.trim() || process.env.WEBSITE_INTAKE_PROVIDER_ID?.trim() || 'openai-chat'
}

async function llmJson(orgId: string, jobId: string, system: string, prompt: string, maxTokens: number): Promise<Record<string, unknown>> {
  const { output } = await executeCapabilityInline<{ text: string }>({
    orgId,
    capability: 'llm.generate',
    jobId,
    preferProviderId: preferredProviderId(),
    input: { prompt, system, maxTokens, json: true },
  })
  return parseModelJson(output.text)
}

const SELECT_SYSTEM = `Eres un desarrollador web senior. Te dan la lista de archivos de un repositorio y una petición de cambio.
Elige los archivos que hay que LEER para hacer el cambio (los que probablemente haya que editar y los que den contexto imprescindible).
Responde SOLO con JSON: {"files": ["ruta/1", "ruta/2"], "reasoning": "una frase"}. Máximo ${MAX_FILES_TO_READ} rutas, exactamente como aparecen en la lista.`

const EDIT_SYSTEM = `Eres un desarrollador web senior que prepara un pull request pequeño y seguro.
Reglas:
- Haz SOLO lo que pide la petición. No refactorices, no cambies formato ni dependencias.
- Devuelve el CONTENIDO COMPLETO de cada archivo que cambies o crees (no diffs, no fragmentos). Conserva el resto del archivo idéntico.
- Solo puedes modificar archivos marcados como EDITABLE. Puedes crear archivos nuevos si hace falta.
- Si el cambio no es posible con lo que ves, devuelve "changes": [] y explica por qué en "summary".
Responde SOLO con JSON:
{"summary": "qué has cambiado y por qué, en 2-4 frases en español", "prTitle": "título corto", "commitMessage": "mensaje de commit", "changes": [{"path": "ruta", "content": "contenido completo"}]}`

type ChangeSet = { summary: string; prTitle: string; commitMessage: string; changes: Array<{ path: string; content: string }> }

function coerceChangeSet(raw: Record<string, unknown>): ChangeSet {
  const changesRaw = Array.isArray(raw.changes) ? raw.changes : []
  const changes: Array<{ path: string; content: string }> = []
  for (const entry of changesRaw) {
    if (!entry || typeof entry !== 'object') continue
    const path = typeof (entry as { path?: unknown }).path === 'string' ? (entry as { path: string }).path.trim().replace(/^\.\//, '') : ''
    const content = typeof (entry as { content?: unknown }).content === 'string' ? (entry as { content: string }).content : null
    if (!path || content === null) continue
    changes.push({ path, content })
  }
  return {
    summary: typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 4_000) : '',
    prTitle: typeof raw.prTitle === 'string' ? raw.prTitle.trim().slice(0, 120) : '',
    commitMessage: typeof raw.commitMessage === 'string' ? raw.commitMessage.trim().slice(0, 500) : '',
    changes: changes.slice(0, MAX_CHANGES),
  }
}

function lineDiff(before: string, after: string): { additions: number; deletions: number } {
  const a = before.split('\n')
  const b = after.split('\n')
  const countA = new Map<string, number>()
  for (const line of a) countA.set(line, (countA.get(line) ?? 0) + 1)
  let common = 0
  for (const line of b) {
    const left = countA.get(line) ?? 0
    if (left > 0) {
      common += 1
      countA.set(line, left - 1)
    }
  }
  return { additions: b.length - common, deletions: a.length - common }
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cambio'
}

/**
 * Validación del resultado del modelo antes de tocar el repositorio: rutas
 * seguras, solo archivos leídos completos, tamaño acotado y sin cambios vacíos.
 */
export function validateChanges(changeSet: ChangeSet, readFiles: Map<string, { content: string; editable: boolean }>): { path: string; content: string; action: 'created' | 'modified'; additions: number; deletions: number }[] {
  const seen = new Set<string>()
  const result: { path: string; content: string; action: 'created' | 'modified'; additions: number; deletions: number }[] = []
  for (const change of changeSet.changes) {
    if (seen.has(change.path)) continue
    seen.add(change.path)
    if (!isSafeRepoPath(change.path)) throw new GitConnectorError('GIT_AGENT_UNSAFE_PATH', 502, change.path)
    if (change.content.length > MAX_CHANGE_CHARS) throw new GitConnectorError('GIT_AGENT_CHANGE_TOO_LARGE', 502, change.path)
    const existing = readFiles.get(change.path)
    if (existing) {
      if (!existing.editable) throw new GitConnectorError('GIT_AGENT_EDITED_UNREAD_FILE', 502, change.path)
      if (existing.content === change.content) continue
      const { additions, deletions } = lineDiff(existing.content, change.content)
      result.push({ ...change, action: 'modified', additions, deletions })
    } else {
      if (!change.content.trim()) continue
      result.push({ ...change, action: 'created', additions: change.content.split('\n').length, deletions: 0 })
    }
  }
  return result
}

type TreeResponse = { sha: string; tree: TreeEntry[]; truncated?: boolean }

async function fetchFileContent(auth: GitAuth, path: string, ref: string): Promise<{ content: string; size: number } | null> {
  const result = await githubRequest<{ content?: string; encoding?: string; size?: number; type?: string }>(auth.token, `/repos/${auth.owner}/${auth.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`)
  if (result.status === 404 || !result.data || result.data.type !== 'file') return null
  assertOk(result, 'GIT_UNEXPECTED_RESPONSE')
  const size = result.data.size ?? 0
  if (result.data.encoding !== 'base64' || typeof result.data.content !== 'string') {
    // Archivos > 1 MB llegan sin contenido inline: no son editables por este agente.
    return { content: '', size }
  }
  const buffer = Buffer.from(result.data.content.replace(/\n/g, ''), 'base64')
  if (buffer.includes(0)) return null // binario
  return { content: buffer.toString('utf8'), size }
}

async function runProposalAgent(job: Job, proposalId: string): Promise<{ prUrl: string | null }> {
  const proposal = await prisma.websiteChangeProposal.findUnique({ where: { id: proposalId }, include: { connection: true } })
  if (!proposal) throw new GitConnectorError('GIT_PROPOSAL_NOT_FOUND', 404)
  const connector = gitConnectorOf(proposal.connection)
  if (!connector?.canPush) throw new GitConnectorError('GIT_NOT_CONNECTED', 409)
  const auth = await loadAuth(proposal.orgId, proposal.connectionId)
  const repoPath = `/repos/${auth.owner}/${auth.repo}`

  // 1. Punto de partida: último commit de la rama base y su árbol.
  const ref = await githubRequest<{ object?: { sha?: string } }>(auth.token, `${repoPath}/git/ref/heads/${encodeURIComponent(proposal.baseBranch)}`)
  assertOk(ref, 'GIT_UNEXPECTED_RESPONSE')
  const baseSha = ref.data?.object?.sha
  if (!baseSha) throw new GitConnectorError('GIT_UNEXPECTED_RESPONSE', 502, 'sin sha de la rama base')
  const tree = await githubRequest<TreeResponse>(auth.token, `${repoPath}/git/trees/${baseSha}?recursive=1`)
  assertOk(tree, 'GIT_UNEXPECTED_RESPONSE')
  const candidates = selectCandidatePaths(tree.data?.tree ?? [])
  if (!candidates.length) throw new GitConnectorError('GIT_REPOSITORY_EMPTY', 422)

  // 2. El modelo elige qué leer.
  const listing = candidates.map(entry => `${entry.path}${entry.size ? ` (${entry.size} B)` : ''}`).join('\n')
  const selectPrompt = `Web: ${proposal.connection.websiteUrl} (${proposal.connection.technologyLabel})
Repositorio: ${auth.owner}/${auth.repo}, rama ${proposal.baseBranch}${tree.data?.truncated ? ' (listado parcial: el repositorio es muy grande)' : ''}

PETICIÓN DE CAMBIO:
${proposal.instructions}

ARCHIVOS:
${listing}`
  const selection = await llmJson(proposal.orgId, job.id, SELECT_SYSTEM, selectPrompt, SELECT_MAX_TOKENS)
  const candidateSet = new Set(candidates.map(entry => entry.path))
  const chosen = (Array.isArray(selection.files) ? selection.files : [])
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim().replace(/^\.\//, ''))
    .filter(path => candidateSet.has(path))
    .slice(0, MAX_FILES_TO_READ)
  if (!chosen.length) throw new GitConnectorError('GIT_AGENT_NO_FILES', 422)

  // 3. Lectura. Un archivo demasiado grande se muestra recortado y NO es
  //    editable: reescribirlo a partir de un fragmento destruiría el resto.
  const readFiles = new Map<string, { content: string; editable: boolean }>()
  let promptChars = 0
  const sections: string[] = []
  for (const path of chosen) {
    const file = await fetchFileContent(auth, path, baseSha)
    if (!file) continue
    const editable = file.size <= MAX_EDITABLE_FILE_BYTES && file.content.length > 0
    const shown = editable ? file.content : file.content.slice(0, 6_000)
    if (promptChars + shown.length > MAX_PROMPT_FILE_CHARS) break
    promptChars += shown.length
    readFiles.set(path, { content: file.content, editable })
    sections.push(`===== ${path} [${editable ? 'EDITABLE' : 'SOLO LECTURA, recortado'}] =====\n${shown}\n===== FIN ${path} =====`)
  }
  if (!readFiles.size) throw new GitConnectorError('GIT_AGENT_NO_FILES', 422)

  // 4. El modelo propone el contenido nuevo.
  const editPrompt = `Web: ${proposal.connection.websiteUrl} (${proposal.connection.technologyLabel})
Repositorio: ${auth.owner}/${auth.repo}, rama ${proposal.baseBranch}

PETICIÓN DE CAMBIO:
${proposal.instructions}

ARCHIVOS:
${sections.join('\n\n')}`
  const changeSet = coerceChangeSet(await llmJson(proposal.orgId, job.id, EDIT_SYSTEM, editPrompt, EDIT_MAX_TOKENS))
  const changes = validateChanges(changeSet, readFiles)
  if (!changes.length) {
    await prisma.websiteChangeProposal.update({
      where: { id: proposal.id },
      data: { status: 'no_changes', summary: changeSet.summary || 'El agente no encontró nada que cambiar con la información disponible.', files: [] },
    })
    return { prUrl: null }
  }

  // 5. Rama, commit único y pull request.
  const branch = `vendrava/${slugify(proposal.title)}-${proposal.id.slice(-6)}`
  const created = await githubRequest(auth.token, `${repoPath}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: baseSha } })
  assertOk(created, 'GIT_BRANCH_FAILED', [201])
  const baseCommit = await githubRequest<{ tree?: { sha?: string } }>(auth.token, `${repoPath}/git/commits/${baseSha}`)
  assertOk(baseCommit, 'GIT_UNEXPECTED_RESPONSE')
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = []
  for (const change of changes) {
    const blob = await githubRequest<{ sha?: string }>(auth.token, `${repoPath}/git/blobs`, { method: 'POST', body: { content: change.content, encoding: 'utf-8' } })
    assertOk(blob, 'GIT_COMMIT_FAILED', [201])
    treeEntries.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.data?.sha as string })
  }
  const newTree = await githubRequest<{ sha?: string }>(auth.token, `${repoPath}/git/trees`, { method: 'POST', body: { base_tree: baseCommit.data?.tree?.sha, tree: treeEntries } })
  assertOk(newTree, 'GIT_COMMIT_FAILED', [201])
  const commitMessage = `${changeSet.commitMessage || proposal.title}\n\nPropuesto por Vendrava. Revisar antes de fusionar.`
  const commit = await githubRequest<{ sha?: string }>(auth.token, `${repoPath}/git/commits`, { method: 'POST', body: { message: commitMessage, tree: newTree.data?.sha, parents: [baseSha] } })
  assertOk(commit, 'GIT_COMMIT_FAILED', [201])
  const headSha = commit.data?.sha as string
  const moved = await githubRequest(auth.token, `${repoPath}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: headSha, force: false } })
  assertOk(moved, 'GIT_COMMIT_FAILED')

  const files: ProposalFile[] = changes.map(change => ({ path: change.path, action: change.action, additions: change.additions, deletions: change.deletions }))
  const body = [
    changeSet.summary || proposal.title,
    '',
    '**Petición original**',
    '',
    proposal.instructions.split('\n').map(line => `> ${line}`).join('\n'),
    '',
    '**Archivos**',
    '',
    ...files.map(file => `- \`${file.path}\` (${file.action === 'created' ? 'nuevo' : 'modificado'}, +${file.additions} −${file.deletions})`),
    '',
    '_Pull request preparado por el agente de Vendrava. Nada se publica hasta que alguien lo revise y lo fusione._',
  ].join('\n')
  const pull = await githubRequest<{ number?: number; html_url?: string }>(auth.token, `${repoPath}/pulls`, {
    method: 'POST',
    body: { title: changeSet.prTitle || proposal.title, head: branch, base: proposal.baseBranch, body, maintainer_can_modify: true },
  })
  assertOk(pull, 'GIT_PULL_REQUEST_FAILED', [201])

  await prisma.websiteChangeProposal.update({
    where: { id: proposal.id },
    data: {
      status: 'proposed',
      branch,
      prNumber: pull.data?.number ?? null,
      prUrl: pull.data?.html_url ?? null,
      headSha,
      summary: changeSet.summary || null,
      files: files as unknown as Prisma.InputJsonValue,
      checksStatus: 'pending',
      proposedAt: new Date(),
      error: null,
    },
  })
  await writeAuditLog({
    orgId: proposal.orgId,
    actorType: 'system',
    action: 'web_connection.git.proposal.opened',
    entityType: 'WebsiteChangeProposal',
    entityId: proposal.id,
    after: { prUrl: pull.data?.html_url ?? null, branch, files },
  })
  return { prUrl: pull.data?.html_url ?? null }
}

export const GIT_ERROR_MESSAGES: Record<string, string> = {
  WEB_CONNECTION_NOT_FOUND: 'Conexión web no encontrada.',
  GIT_REPOSITORY_INVALID: 'No reconocemos esa dirección de repositorio. Usa https://github.com/usuario/repositorio.',
  GIT_AUTH_FAILED: 'GitHub rechazó el token.',
  GIT_INSUFFICIENT_PERMISSIONS: 'El token no puede escribir en ese repositorio. Necesita permisos de Contents y Pull requests en lectura y escritura.',
  GIT_NOT_FOUND: 'GitHub no encuentra ese repositorio con este token.',
  GIT_NOT_CONNECTED: 'Esta web no tiene un repositorio conectado.',
  GIT_INSTRUCTIONS_TOO_SHORT: 'Describe el cambio con algo más de detalle.',
  GIT_TOO_MANY_RUNNING: 'Ya hay dos propuestas en marcha para esta web. Espera a que terminen.',
  GIT_PROPOSAL_NOT_FOUND: 'La propuesta no existe.',
  GIT_PROPOSAL_NOT_OPEN: 'La propuesta no tiene un pull request abierto.',
  GIT_REPOSITORY_EMPTY: 'El repositorio no tiene archivos que el agente pueda editar.',
  GIT_AGENT_NO_FILES: 'El agente no encontró archivos relevantes para ese cambio.',
  GIT_AGENT_OUTPUT_INVALID: 'El modelo devolvió una respuesta que no se pudo interpretar.',
  GIT_AGENT_UNSAFE_PATH: 'El agente intentó tocar una ruta no permitida y se ha detenido.',
  GIT_AGENT_EDITED_UNREAD_FILE: 'El agente intentó reescribir un archivo que no había leído completo y se ha detenido.',
  GIT_AGENT_CHANGE_TOO_LARGE: 'El cambio propuesto es demasiado grande para un pull request automático.',
  GIT_BRANCH_FAILED: 'GitHub no permitió crear la rama.',
  GIT_COMMIT_FAILED: 'GitHub no aceptó el commit.',
  GIT_PULL_REQUEST_FAILED: 'GitHub no permitió abrir el pull request.',
  GIT_REDIRECT_BLOCKED: 'GitHub devolvió una redirección inesperada.',
  GIT_TIMEOUT: 'GitHub tardó demasiado en responder.',
  GIT_UNREACHABLE: 'No se pudo contactar con GitHub.',
  GIT_UNEXPECTED_RESPONSE: 'GitHub devolvió una respuesta inesperada.',
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof GitConnectorError) {
    const base = GIT_ERROR_MESSAGES[error.code] ?? 'La propuesta falló.'
    return error.message && error.message !== error.code ? `${base} (${error.message.slice(0, 200)})` : base
  }
  if (error instanceof Error && /provider|capability|credential|proveedor/i.test(error.message)) return 'No hay un proveedor de IA configurado para el agente. Revisa Conexiones → Proveedores.'
  return 'La propuesta falló por un error inesperado.'
}

async function executeGitProposal(job: Job): Promise<{ output: unknown; costActualCents: number }> {
  const proposalId = (job.input as { payload?: { proposalId?: string } } | null)?.payload?.proposalId
  if (!proposalId) throw new GitConnectorError('GIT_PROPOSAL_NOT_FOUND', 404)
  await prisma.websiteChangeProposal.update({ where: { id: proposalId }, data: { status: 'running', error: null } })
  try {
    const result = await runProposalAgent(job, proposalId)
    return { output: { proposalId, prUrl: result.prUrl }, costActualCents: 0 }
  } catch (error) {
    await prisma.websiteChangeProposal.update({ where: { id: proposalId }, data: { status: 'failed', error: safeErrorMessage(error) } }).catch(() => undefined)
    throw error
  }
}

export function registerGitProposalExecutor(): void {
  if (hasJobExecutor(GIT_PROPOSAL_JOB_KIND)) return
  registerJobExecutor(GIT_PROPOSAL_JOB_KIND, executeGitProposal)
}

/* ── Seguimiento del PR ────────────────────────────────────────────────── */

type PullInfo = { state?: string; merged?: boolean; merged_at?: string | null; closed_at?: string | null; html_url?: string; head?: { sha?: string } }
type CheckRuns = { total_count?: number; check_runs?: Array<{ status?: string; conclusion?: string | null }> }
type CombinedStatus = { state?: string; total_count?: number }

function summarizeChecks(checks: CheckRuns | null, combined: CombinedStatus | null): string {
  const runs = checks?.check_runs ?? []
  const legacy = combined?.total_count ? combined.state : null
  if (!runs.length && !legacy) return 'none'
  if (runs.some(run => run.status !== 'completed') || legacy === 'pending') return 'pending'
  if (runs.some(run => run.conclusion && !['success', 'neutral', 'skipped'].includes(run.conclusion)) || legacy === 'failure' || legacy === 'error') return 'failure'
  return 'success'
}

/** Sincroniza estado del PR y de sus checks desde GitHub. */
export async function refreshGitProposal(orgId: string, connectionId: string, proposalId: string): Promise<ProposalView> {
  const row = await prisma.websiteChangeProposal.findFirst({ where: { id: proposalId, orgId, connectionId } })
  if (!row) throw new GitConnectorError('GIT_PROPOSAL_NOT_FOUND', 404)
  if (!row.prNumber || !['proposed', 'merged', 'closed'].includes(row.status)) return proposalView(row)
  const auth = await loadAuth(orgId, connectionId)
  const repoPath = `/repos/${auth.owner}/${auth.repo}`
  const pull = await githubRequest<PullInfo>(auth.token, `${repoPath}/pulls/${row.prNumber}`)
  assertOk(pull, 'GIT_UNEXPECTED_RESPONSE')
  const info = pull.data ?? {}
  const headSha = info.head?.sha ?? row.headSha
  let checksStatus = row.checksStatus
  if (headSha && info.state === 'open') {
    const [checks, combined] = await Promise.all([
      githubRequest<CheckRuns>(auth.token, `${repoPath}/commits/${headSha}/check-runs`).then(result => (result.status === 200 ? result.data : null)).catch(() => null),
      githubRequest<CombinedStatus>(auth.token, `${repoPath}/commits/${headSha}/status`).then(result => (result.status === 200 ? result.data : null)).catch(() => null),
    ])
    checksStatus = summarizeChecks(checks, combined)
  }
  const status = info.merged ? 'merged' : info.state === 'closed' ? 'closed' : 'proposed'
  const updated = await prisma.websiteChangeProposal.update({
    where: { id: row.id },
    data: {
      status,
      headSha,
      checksStatus,
      prUrl: info.html_url ?? row.prUrl,
      mergedAt: info.merged_at ? new Date(info.merged_at) : row.mergedAt,
      closedAt: info.closed_at && !info.merged ? new Date(info.closed_at) : row.closedAt,
    },
  })
  return proposalView(updated)
}

/** Cierra el PR sin fusionar y borra la rama. */
export async function closeGitProposal(params: { orgId: string; connectionId: string; proposalId: string; actorUserId?: string | null; correlationId?: string }): Promise<ProposalView> {
  const row = await prisma.websiteChangeProposal.findFirst({ where: { id: params.proposalId, orgId: params.orgId, connectionId: params.connectionId } })
  if (!row) throw new GitConnectorError('GIT_PROPOSAL_NOT_FOUND', 404)
  if (row.status !== 'proposed' || !row.prNumber) throw new GitConnectorError('GIT_PROPOSAL_NOT_OPEN', 409)
  const auth = await loadAuth(params.orgId, params.connectionId)
  const repoPath = `/repos/${auth.owner}/${auth.repo}`
  const closed = await githubRequest(auth.token, `${repoPath}/pulls/${row.prNumber}`, { method: 'PATCH', body: { state: 'closed' } })
  assertOk(closed, 'GIT_UNEXPECTED_RESPONSE')
  if (row.branch) await githubRequest(auth.token, `${repoPath}/git/refs/heads/${encodeURIComponent(row.branch)}`, { method: 'DELETE' }).catch(() => undefined)
  const updated = await prisma.websiteChangeProposal.update({ where: { id: row.id }, data: { status: 'closed', closedAt: new Date() } })
  await writeAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId ?? null,
    action: 'web_connection.git.proposal.close',
    entityType: 'WebsiteChangeProposal',
    entityId: row.id,
    after: { prNumber: row.prNumber },
    correlationId: params.correlationId,
  })
  return proposalView(updated)
}
