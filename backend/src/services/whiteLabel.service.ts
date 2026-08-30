import { createHash, randomBytes } from 'crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { prisma } from '../lib/prisma'
import { askJson, fastModel, isDeepseekConfigured } from '../lib/deepseek'
import * as authService from './auth.service'
import { buildResetToken, requestPasswordReset } from './passwordReset.service'

const MAX_PAGES = 12
const MAX_PAGE_BYTES = 1_000_000
const MAX_DOCUMENT_CHARS = 14_000

export const CLIENT_STATUSES = ['draft', 'trial', 'active', 'paused', 'archived'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character))
}

function safeColor(value: string | undefined, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : fallback
}

function assertPricing(priceCents: number, costCents: number): void {
  if (costCents > priceCents) throw new Error('El coste mayorista no puede superar el precio mensual')
}

function normaliseEmail(value: string | undefined): string | null {
  const email = text(value).toLowerCase()
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function normaliseUrl(value: string): string {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('La URL debe empezar por http:// o https://')
  parsed.hash = ''
  return parsed.toString()
}

function privateAddress(address: string): boolean {
  const value = address.toLowerCase().split('%')[0]
  if (isIP(value) === 6) return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
  if (isIP(value) !== 4) return false
  const parts = value.split('.').map(Number)
  const [first, second] = parts
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 100 && second >= 64 && second <= 127) || first >= 224
}

async function assertSafeTrainingUrl(value: string): Promise<void> {
  if (process.env.ALLOW_PRIVATE_INTEGRATION_NETWORKS === 'true') return
  const parsed = new URL(value)
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local') || privateAddress(parsed.hostname)) throw new Error('La URL de entrenamiento apunta a una red privada')
  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true })
  if (addresses.some(address => privateAddress(address.address))) throw new Error('La URL de entrenamiento apunta a una red privada')
}

function hashWidgetKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function newWidgetKey(): string {
  return `vw_${randomBytes(24).toString('base64url')}`
}

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function pageTitle(html: string, url: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return stripHtml(match?.[1] ?? '') || new URL(url).hostname
}

function linksFromHtml(html: string, root: URL): string[] {
  const found = new Set<string>()
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], root)
      url.hash = ''
      if (url.protocol !== root.protocol || url.hostname !== root.hostname) continue
      if (!url.pathname || /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mp3)$/i.test(url.pathname)) continue
      found.add(url.toString())
      if (found.size >= MAX_PAGES - 1) break
    } catch {
      // Malformed links are ignored; one bad href must not fail training.
    }
  }
  return [...found]
}

async function fetchPage(url: string, redirects = 0): Promise<string> {
  if (redirects > 3) throw new Error('La web supera el lÃ­mite de redirecciones')
  const response = await fetch(url, {
    headers: { 'user-agent': 'VendravaWhiteLabelTrainer/1.0 (+https://vendrava.app)' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'manual',
  })
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) throw new Error('La web devolviÃ³ una redirecciÃ³n sin destino')
    const next = normaliseUrl(new URL(location, url).toString())
    await assertSafeTrainingUrl(next)
    return fetchPage(next, redirects + 1)
  }
  if (!response.ok) throw new Error(`La web respondió ${response.status} en ${url}`)
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_PAGE_BYTES) throw new Error(`La página supera el límite de ${MAX_PAGE_BYTES} bytes`)
  const html = await response.text()
  if (Buffer.byteLength(html, 'utf8') > MAX_PAGE_BYTES) throw new Error(`La página supera el límite de ${MAX_PAGE_BYTES} bytes`)
  return html
}

async function incrementTrainingUsage(clientOrgId: string) {
  await prisma.whiteLabelUsage.upsert({
    where: { clientOrgId_monthStart: { clientOrgId, monthStart: monthStart() } },
    create: { clientOrgId, monthStart: monthStart(), trainingRuns: 1 },
    update: { trainingRuns: { increment: 1 } },
  })
}

/**
 * Marca del panel (no del widget). La fila de WhiteLabelConfig de una
 * organización manda sobre el logotipo y los colores del CRM que ve su gente.
 * Una agencia marca su propio panel con una fila que se apunta a sí misma
 * (`clientOrgId === agencyOrgId`); sus clientes ya tienen la suya desde
 * `createClient`. Sin fila, el panel usa la marca por defecto del producto.
 *
 * `enabled` gatea el widget público, no el panel: se puede vender el CRM con la
 * marca del partner sin haber publicado todavía ningún asistente.
 */
export type PanelBrand = Readonly<{
  brandName: string
  logoUrl: string | null
  primaryColor: string
  accentColor: string
  textColor: string
}>

type BrandRow = { brandName: string; logoUrl: string | null; primaryColor: string; accentColor: string; textColor: string }

function panelBrand(config: BrandRow): PanelBrand {
  return Object.freeze({
    brandName: config.brandName,
    logoUrl: config.logoUrl,
    primaryColor: safeColor(config.primaryColor, '#4F46E5'),
    accentColor: safeColor(config.accentColor, '#22D3EE'),
    textColor: safeColor(config.textColor, '#FFFFFF'),
  })
}

const BRAND_SELECT = { brandName: true, logoUrl: true, primaryColor: true, accentColor: true, textColor: true } as const

export function normaliseAppDomain(value: unknown): string | null {
  const raw = text(value).toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(raw) && raw.length <= 253 ? raw : null
}

export async function brandForOrg(orgId: string): Promise<PanelBrand | null> {
  if (!orgId) return null
  const config = await prisma.whiteLabelConfig.findUnique({ where: { clientOrgId: orgId }, select: BRAND_SELECT })
  return config ? panelBrand(config) : null
}

/** Resuelve la marca antes del login, cuando sólo se conoce el dominio. */
export async function brandForHost(host: unknown): Promise<PanelBrand | null> {
  const appDomain = normaliseAppDomain(host)
  if (!appDomain) return null
  const config = await prisma.whiteLabelConfig.findUnique({ where: { appDomain }, select: BRAND_SELECT })
  return config ? panelBrand(config) : null
}

export async function getOwnBrand(orgId: string) {
  return prisma.whiteLabelConfig.findUnique({
    where: { clientOrgId: orgId },
    select: { ...BRAND_SELECT, appDomain: true, enabled: true },
  })
}

export async function updateOwnBrand(orgId: string, input: Partial<{
  brandName: string
  logoUrl: string | null
  primaryColor: string
  accentColor: string
  textColor: string
  appDomain: string | null
}>) {
  const appDomain = input.appDomain === undefined ? undefined : input.appDomain === null || !text(input.appDomain)
    ? null
    : normaliseAppDomain(input.appDomain)
  if (input.appDomain !== undefined && input.appDomain !== null && text(input.appDomain) && !appDomain) {
    throw new Error('El dominio del panel no es válido')
  }
  const data = {
    ...(input.brandName !== undefined ? { brandName: text(input.brandName) } : {}),
    ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    ...(input.primaryColor !== undefined ? { primaryColor: text(input.primaryColor) } : {}),
    ...(input.accentColor !== undefined ? { accentColor: text(input.accentColor) } : {}),
    ...(input.textColor !== undefined ? { textColor: text(input.textColor) } : {}),
    ...(appDomain !== undefined ? { appDomain } : {}),
  }
  const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } })
  if (!organization) throw new Error('Organización no encontrada')
  try {
    return await prisma.whiteLabelConfig.upsert({
      where: { clientOrgId: orgId },
      update: data,
      create: {
        clientOrgId: orgId,
        agencyOrgId: orgId,
        widgetKeyHash: hashWidgetKey(newWidgetKey()),
        brandName: text(input.brandName, organization.name),
        ...data,
      },
      select: { ...BRAND_SELECT, appDomain: true },
    })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new Error('Ese dominio ya está en uso por otra marca')
    throw error
  }
}

/**
 * Lo que la agencia cobra a sus clientes frente a lo que le cuesta el mayorista.
 * Sólo cuentan los clientes activos: los de prueba todavía no facturan.
 */
export async function agencyBillingSummary(agencyOrgId: string) {
  const clients = await prisma.agencyClient.findMany({
    where: { agencyOrgId, status: 'active' },
    select: { monthlyPriceCents: true, wholesaleCostCents: true },
  })
  const revenueCents = clients.reduce((total, client) => total + client.monthlyPriceCents, 0)
  const wholesaleCents = clients.reduce((total, client) => total + client.wholesaleCostCents, 0)
  return { activeClients: clients.length, revenueCents, wholesaleCents, marginCents: revenueCents - wholesaleCents }
}

export async function listClients(agencyOrgId: string) {
  return prisma.agencyClient.findMany({
    where: { agencyOrgId },
    include: {
      client: {
        select: {
          id: true, name: true, website: true, createdAt: true,
          whiteLabelConfig: true,
          trainingJobs: { orderBy: { createdAt: 'desc' }, take: 1 },
          whiteLabelUsage: { where: { monthStart: monthStart() }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createClient(agencyOrgId: string, input: {
  displayName: string
  clientEmail?: string
  website?: string
  monthlyPriceCents?: number
  wholesaleCostCents?: number
  monthlyVoiceMinutes?: number
  monthlyMessages?: number
}) {
  const displayName = text(input.displayName)
  if (!displayName) throw new Error('El nombre del cliente es obligatorio')
  const clientEmail = normaliseEmail(input.clientEmail)
  if (input.clientEmail && !clientEmail) throw new Error('El email del cliente no es válido')
  if (clientEmail && await prisma.user.findUnique({ where: { email: clientEmail }, select: { id: true } })) throw new Error('Ese email ya está asociado a otro usuario')
  const website = input.website ? normaliseUrl(input.website) : null
  if (website) await assertSafeTrainingUrl(website)
  const monthlyPriceCents = Math.max(0, input.monthlyPriceCents ?? 0)
  const wholesaleCostCents = Math.max(0, input.wholesaleCostCents ?? 0)
  assertPricing(monthlyPriceCents, wholesaleCostCents)
  const widgetKey = newWidgetKey()
  const client = await prisma.$transaction(async tx => {
    const workspace = await tx.organization.create({
      data: {
        name: displayName,
        website,
        plan: 'pro',
        settings: { agencyManaged: true, agencyOrgId },
      },
    })
    if (clientEmail) {
      const clientUser = await tx.user.create({
        data: {
          orgId: workspace.id,
          email: clientEmail,
          name: displayName,
          role: 'admin',
          passwordHash: await authService.hashPassword(randomBytes(32).toString('base64url')),
        },
        select: { id: true },
      })
      await tx.organizationMembership.create({
        data: { orgId: workspace.id, userId: clientUser.id, role: 'admin', status: 'active', isDefault: true },
      })
    }
    const created = await tx.agencyClient.create({
      data: {
        agencyOrgId,
        clientOrgId: workspace.id,
        displayName,
        clientEmail,
        status: 'trial',
        monthlyPriceCents,
        wholesaleCostCents,
        monthlyVoiceMinutes: Math.max(0, input.monthlyVoiceMinutes ?? 500),
        monthlyMessages: Math.max(0, input.monthlyMessages ?? 1000),
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    })
    await tx.whiteLabelConfig.create({
      data: {
        clientOrgId: workspace.id,
        agencyOrgId,
        widgetKeyHash: hashWidgetKey(widgetKey),
        brandName: displayName,
        enabled: false,
      },
    })
    await tx.agent.create({
      data: {
        orgId: workspace.id,
        name: `Asistente de ${displayName}`,
        role: 'Recepción y cualificación',
        agentType: 'receptionist',
        language: 'es',
        systemPrompt: `Representas a ${displayName}. Responde con claridad y deriva a una persona cuando sea necesario.`,
        isActive: false,
      },
    })
    return created
  })
  let inviteLink: string | undefined
  if (clientEmail) {
    const appUrl = process.env.APP_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:5173'
    try {
      const invitedUser = await prisma.user.findUnique({ where: { email: clientEmail }, select: { id: true, passwordHash: true } })
      if (invitedUser) inviteLink = `${appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(buildResetToken(invitedUser.id, invitedUser.passwordHash))}`
      await requestPasswordReset(clientEmail, appUrl)
    } catch (error) {
      console.warn('[WhiteLabel] no se pudo generar el enlace de acceso:', (error as Error).message)
    }
  }
  let trainingJob
  if (website) {
    try {
      trainingJob = await startTraining(agencyOrgId, client.id, website)
    } catch (error) {
      console.warn('[WhiteLabel] no se pudo iniciar el entrenamiento inicial:', (error as Error).message)
    }
  }
  return { client, widgetKey, ...(inviteLink ? { inviteLink } : {}), ...(trainingJob ? { trainingJob } : {}) }
}

export async function updateClient(agencyOrgId: string, id: string, input: Partial<{
  status: ClientStatus
  displayName: string
  monthlyPriceCents: number
  wholesaleCostCents: number
  monthlyVoiceMinutes: number
  monthlyMessages: number
}>) {
  const current = await prisma.agencyClient.findFirst({ where: { id, agencyOrgId } })
  if (!current) return null
  const nextPrice = input.monthlyPriceCents === undefined ? current.monthlyPriceCents : Math.max(0, input.monthlyPriceCents)
  const nextCost = input.wholesaleCostCents === undefined ? current.wholesaleCostCents : Math.max(0, input.wholesaleCostCents)
  assertPricing(nextPrice, nextCost)
  const status = input.status && CLIENT_STATUSES.includes(input.status) ? input.status : undefined
  const updated = await prisma.agencyClient.update({
    where: { id },
    data: {
      ...(input.displayName !== undefined ? { displayName: text(input.displayName, current.displayName) } : {}),
      ...(status ? { status, activatedAt: status === 'active' && !current.activatedAt ? new Date() : current.activatedAt } : {}),
      ...(input.monthlyPriceCents !== undefined ? { monthlyPriceCents: Math.max(0, input.monthlyPriceCents) } : {}),
      ...(input.wholesaleCostCents !== undefined ? { wholesaleCostCents: Math.max(0, input.wholesaleCostCents) } : {}),
      ...(input.monthlyVoiceMinutes !== undefined ? { monthlyVoiceMinutes: Math.max(0, input.monthlyVoiceMinutes) } : {}),
      ...(input.monthlyMessages !== undefined ? { monthlyMessages: Math.max(0, input.monthlyMessages) } : {}),
    },
  })
  if (status === 'active' || status === 'paused') {
    await prisma.agent.updateMany({ where: { orgId: current.clientOrgId, agentType: 'receptionist' }, data: { isActive: status === 'active' } })
  }
  return updated
}

export async function getClient(agencyOrgId: string, id: string) {
  return prisma.agencyClient.findFirst({
    where: { id, agencyOrgId },
    include: {
      client: {
        select: {
          id: true, name: true, website: true, plan: true,
          whiteLabelConfig: true,
          trainingJobs: { orderBy: { createdAt: 'desc' }, take: 10 },
          whiteLabelUsage: { where: { monthStart: monthStart() }, take: 1 },
        },
      },
    },
  })
}

export async function updateWhiteLabelConfig(agencyOrgId: string, clientId: string, input: Partial<{
  brandName: string
  logoUrl: string | null
  primaryColor: string
  accentColor: string
  textColor: string
  widgetTitle: string
  welcomeMessage: string
  enabled: boolean
  allowedOrigins: string[]
}>) {
  const client = await prisma.agencyClient.findFirst({ where: { id: clientId, agencyOrgId } })
  if (!client) return null
  return prisma.whiteLabelConfig.update({
    where: { clientOrgId: client.clientOrgId },
    data: {
      ...(input.brandName !== undefined ? { brandName: text(input.brandName) } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: text(input.primaryColor) } : {}),
      ...(input.accentColor !== undefined ? { accentColor: text(input.accentColor) } : {}),
      ...(input.textColor !== undefined ? { textColor: text(input.textColor) } : {}),
      ...(input.widgetTitle !== undefined ? { widgetTitle: text(input.widgetTitle) } : {}),
      ...(input.welcomeMessage !== undefined ? { welcomeMessage: text(input.welcomeMessage) } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.allowedOrigins !== undefined ? { allowedOrigins: input.allowedOrigins.map(value => text(value)).filter(Boolean) } : {}),
    },
  })
}

export async function rotateWidgetKey(agencyOrgId: string, clientId: string) {
  const client = await prisma.agencyClient.findFirst({ where: { id: clientId, agencyOrgId } })
  if (!client) return null
  const widgetKey = newWidgetKey()
  await prisma.whiteLabelConfig.update({ where: { clientOrgId: client.clientOrgId }, data: { widgetKeyHash: hashWidgetKey(widgetKey) } })
  return { widgetKey }
}

export async function startTraining(agencyOrgId: string, clientId: string, sourceUrl: string) {
  const client = await prisma.agencyClient.findFirst({ where: { id: clientId, agencyOrgId } })
  if (!client) return null
  const normalised = normaliseUrl(sourceUrl)
  await assertSafeTrainingUrl(normalised)
  const job = await prisma.whiteLabelTrainingJob.create({ data: { clientOrgId: client.clientOrgId, sourceUrl: normalised } })
  // Redis/BullMQ is preferred, but a missing queue service still leaves a
  // persisted job that can finish in the API process instead of being lost.
  void import('../jobs/whiteLabelTraining').then(({ enqueueWhiteLabelTraining }) =>
    enqueueWhiteLabelTraining(job.id).then(enqueued => {
      if (!enqueued) void processTrainingJob(job.id)
    })
  ).catch(() => { void processTrainingJob(job.id) })
  return job
}

export async function addDocument(agencyOrgId: string, clientId: string, input: { name: string; content: string }) {
  const client = await prisma.agencyClient.findFirst({ where: { id: clientId, agencyOrgId } })
  if (!client) return null
  const name = text(input.name).slice(0, 180)
  const content = text(input.content)
  if (!name || content.length < 20) throw new Error('El documento necesita nombre y al menos 20 caracteres')
  if (content.length > MAX_DOCUMENT_CHARS * 3) throw new Error('El documento supera el límite de texto permitido')
  return prisma.knowledgeBase.create({
    data: {
      orgId: client.clientOrgId,
      name,
      type: 'document',
      sourceType: 'upload',
      content: content.slice(0, MAX_DOCUMENT_CHARS * 3),
      isActive: true,
    },
  })
}

export async function processTrainingJob(jobId: string) {
  const job = await prisma.whiteLabelTrainingJob.findUnique({ where: { id: jobId } })
  if (!job || job.status === 'completed' || job.status === 'running') return job
  const claimed = await prisma.whiteLabelTrainingJob.updateMany({
    where: { id: jobId, status: 'queued' },
    data: { status: 'running', startedAt: new Date(), error: null },
  })
  if (!claimed.count) return prisma.whiteLabelTrainingJob.findUnique({ where: { id: jobId } })
  try {
    const root = new URL(job.sourceUrl)
    await assertSafeTrainingUrl(job.sourceUrl)
    const rootHtml = await fetchPage(root.toString())
    const urls = [root.toString(), ...linksFromHtml(rootHtml, root)]
    const pages = await Promise.all(urls.map(async url => ({ url, html: url === root.toString() ? rootHtml : await fetchPage(url).catch(() => '') })))
    const usable = pages.filter(page => stripHtml(page.html).length >= 80)
    await prisma.knowledgeBase.deleteMany({ where: { orgId: job.clientOrgId, sourceType: 'url', sourceUrl: { startsWith: root.origin } } })
    if (usable.length) {
      await prisma.knowledgeBase.createMany({
        data: usable.map(page => ({
          orgId: job.clientOrgId,
          name: pageTitle(page.html, page.url).slice(0, 180),
          type: 'url',
          sourceType: 'url',
          sourceUrl: page.url,
          content: stripHtml(page.html).slice(0, MAX_DOCUMENT_CHARS),
          isActive: true,
        })),
      })
    }
    await incrementTrainingUsage(job.clientOrgId)
    return prisma.whiteLabelTrainingJob.update({ where: { id: jobId }, data: { status: 'completed', pagesDiscovered: urls.length, documentsCreated: usable.length, completedAt: new Date() } })
  } catch (error) {
    return prisma.whiteLabelTrainingJob.update({ where: { id: jobId }, data: { status: 'failed', error: (error as Error).message.slice(0, 500), completedAt: new Date() } })
  }
}

async function publicContext(widgetKey: string) {
  const config = await prisma.whiteLabelConfig.findUnique({ where: { widgetKeyHash: hashWidgetKey(widgetKey) } })
  if (!config || !config.enabled) return null
  const client = await prisma.agencyClient.findFirst({ where: { clientOrgId: config.clientOrgId, OR: [{ status: 'active' }, { status: 'trial', trialEndsAt: { gt: new Date() } }] } })
  if (!client) return null
  const [agent, knowledge, usage] = await Promise.all([
    prisma.agent.findFirst({ where: { orgId: config.clientOrgId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { name: true, systemPrompt: true, language: true } }),
    prisma.knowledgeBase.findMany({ where: { orgId: config.clientOrgId, isActive: true }, orderBy: { updatedAt: 'desc' }, take: 20, select: { name: true, content: true } }),
    prisma.whiteLabelUsage.findUnique({ where: { clientOrgId_monthStart: { clientOrgId: config.clientOrgId, monthStart: monthStart() } } }),
  ])
  return { config, client, agent, knowledge, usage }
}

export async function publicBootstrap(widgetKey: string) {
  const context = await publicContext(widgetKey)
  if (!context) return null
  return {
    brandName: context.config.brandName,
    logoUrl: context.config.logoUrl,
    primaryColor: context.config.primaryColor,
    accentColor: context.config.accentColor,
    textColor: context.config.textColor,
    widgetTitle: context.config.widgetTitle,
    welcomeMessage: context.config.welcomeMessage,
  }
}

export async function publicMessage(widgetKey: string, message: string) {
  const context = await publicContext(widgetKey)
  if (!context) return null
  if (!await consumeWhiteLabelMessage(context.client.clientOrgId)) return { error: 'MONTHLY_MESSAGE_LIMIT_REACHED' as const }
  const source = context.knowledge.map(item => `${item.name}: ${item.content ?? ''}`).join('\n').slice(0, 30_000)
  if (!isDeepseekConfigured()) return { text: `Gracias por escribir a ${context.config.brandName}. Hemos recibido tu mensaje y una persona del equipo te responderá pronto.` }
  const answer = await askJson<{ text?: string }>({
    model: fastModel(),
    maxTokens: 350,
    label: 'white-label:widget-reply',
    prompt: `Responde como el asistente de ${context.config.brandName}. No inventes datos. Si la información no aparece en el contexto, pide los datos de contacto o indica que una persona continuará. Responde en el idioma del usuario y solo JSON válido: {"text":"..."}.\nINSTRUCCIONES: ${context.agent?.systemPrompt ?? ''}\nCONOCIMIENTO:\n${source}\nMENSAJE: ${message.slice(0, 2_000)}`,
  })
  return { text: typeof answer?.text === 'string' && answer.text.trim() ? answer.text.trim() : `Gracias por escribir a ${context.config.brandName}.` }
}

export async function generateWhiteLabelReply(clientOrgId: string, message: string) {
  const [config, client, agent, knowledge] = await Promise.all([
    prisma.whiteLabelConfig.findUnique({ where: { clientOrgId } }),
    prisma.agencyClient.findFirst({ where: { clientOrgId, OR: [{ status: 'active' }, { status: 'trial', trialEndsAt: { gt: new Date() } }] }, select: { status: true } }),
    prisma.agent.findFirst({ where: { orgId: clientOrgId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { systemPrompt: true } }),
    prisma.knowledgeBase.findMany({ where: { orgId: clientOrgId, isActive: true }, orderBy: { updatedAt: 'desc' }, take: 20, select: { name: true, content: true } }),
  ])
  if (!config?.enabled || !client) return null
  if (!await consumeWhiteLabelMessage(clientOrgId)) return { error: 'MONTHLY_MESSAGE_LIMIT_REACHED' as const }
  const source = knowledge.map(item => `${item.name}: ${item.content ?? ''}`).join('\n').slice(0, 30_000)
  if (!isDeepseekConfigured()) return { text: `Gracias por escribir a ${config.brandName}. Hemos recibido tu mensaje y una persona del equipo te responderá pronto.` }
  const answer = await askJson<{ text?: string }>({
    model: fastModel(),
    maxTokens: 350,
    label: 'white-label:widget-reply',
    prompt: `Responde como el asistente de ${config.brandName}. No inventes datos. Si la información no aparece en el contexto, pide los datos de contacto o indica que una persona continuará. Responde en el idioma del usuario y solo JSON válido: {"text":"..."}.\nINSTRUCCIONES: ${agent?.systemPrompt ?? ''}\nCONOCIMIENTO:\n${source}\nMENSAJE: ${message.slice(0, 2_000)}`,
  })
  return { text: typeof answer?.text === 'string' && answer.text.trim() ? answer.text.trim() : `Gracias por escribir a ${config.brandName}.` }
}

export async function consumeWhiteLabelMessage(clientOrgId: string): Promise<boolean> {
  const client = await prisma.agencyClient.findUnique({ where: { clientOrgId }, select: { monthlyMessages: true } })
  if (!client) return true
  const currentMonth = monthStart()
  await prisma.whiteLabelUsage.upsert({
    where: { clientOrgId_monthStart: { clientOrgId, monthStart: currentMonth } },
    create: { clientOrgId, monthStart: currentMonth },
    update: {},
  })
  const updated = await prisma.whiteLabelUsage.updateMany({
    where: { clientOrgId, monthStart: currentMonth, messages: { lt: client.monthlyMessages } },
    data: { messages: { increment: 1 } },
  })
  return updated.count === 1
}

export async function canStartWhiteLabelVoice(clientOrgId: string): Promise<boolean> {
  const client = await prisma.agencyClient.findUnique({ where: { clientOrgId }, select: { monthlyVoiceMinutes: true } })
  if (!client) return true
  const usage = await prisma.whiteLabelUsage.findUnique({ where: { clientOrgId_monthStart: { clientOrgId, monthStart: monthStart() } }, select: { voiceMinutes: true } })
  return (usage?.voiceMinutes ?? 0) < client.monthlyVoiceMinutes
}

export async function recordWhiteLabelVoiceUsage(clientOrgId: string, durationSeconds: number | null | undefined) {
  const minutes = Math.max(0, Math.ceil((Number(durationSeconds) || 0) / 60))
  if (!minutes) return false
  try {
    const client = await prisma.agencyClient.findUnique({ where: { clientOrgId }, select: { clientOrgId: true } })
    if (!client) return false
    await prisma.whiteLabelUsage.upsert({
      where: { clientOrgId_monthStart: { clientOrgId, monthStart: monthStart() } },
      create: { clientOrgId, monthStart: monthStart(), voiceMinutes: minutes },
      update: { voiceMinutes: { increment: minutes } },
    })
    return true
  } catch (error) {
    console.warn('[WhiteLabel] no se pudo registrar el consumo de voz:', (error as Error).message)
    return false
  }
}

export async function resolveWidgetKey(widgetKey: string) {
  return publicContext(widgetKey)
}

export function widgetScript(origin: string, widgetKey: string): string {
  const safeOrigin = JSON.stringify(origin)
  const safeKey = JSON.stringify(widgetKey)
  return `(()=>{const o=${safeOrigin},k=${safeKey};if(window.__vendravaWidget)return;window.__vendravaWidget=1;const f=document.createElement('iframe');f.src=o+'/api/white-label/public/widget?key='+encodeURIComponent(k);f.title='Asistente virtual';f.style.cssText='position:fixed;right:20px;bottom:20px;width:380px;height:620px;border:0;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.22);z-index:2147483647;background:transparent';document.body.appendChild(f)})();`
}

export function widgetHtml(origin: string, widgetKey: string, config: Awaited<ReturnType<typeof publicBootstrap>>): string {
  const brandName = escapeHtml(config?.brandName ?? 'Asistente')
  const widgetTitle = escapeHtml(config?.widgetTitle ?? 'Asistente virtual')
  const primaryColor = safeColor(config?.primaryColor, '#4F46E5')
  const accentColor = safeColor(config?.accentColor, '#22D3EE')
  const textColor = safeColor(config?.textColor, '#FFFFFF')
  const json = JSON.stringify({ origin, widgetKey, config }).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${brandName}</title><style>*{box-sizing:border-box}body{margin:0;font:14px Inter,system-ui,sans-serif;background:#fff;color:#14213d;border-radius:18px;overflow:hidden}.head{padding:18px;color:${textColor};background:${primaryColor}}.head strong{display:block;font-size:17px}.head small{display:block;margin-top:4px;opacity:.85}.messages{height:470px;overflow:auto;padding:16px;background:#f8fafc}.msg{max-width:88%;padding:10px 12px;margin:0 0 10px;border-radius:12px;line-height:1.4;white-space:pre-wrap}.bot{background:#fff;border:1px solid #e2e8f0}.user{margin-left:auto;background:${primaryColor};color:${textColor}}form{display:flex;gap:8px;padding:12px;border-top:1px solid #e2e8f0}input{min-width:0;flex:1;padding:10px 11px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}button{border:0;border-radius:10px;padding:0 14px;color:${textColor};background:${accentColor};font-weight:700;cursor:pointer}</style></head><body><div class="head"><strong>${widgetTitle}</strong><small>${brandName}</small></div><main class="messages" id="m"></main><form id="f"><input id="i" autocomplete="off" placeholder="Escribe tu pregunta…"><button>Enviar</button></form><script>const C=${json};const m=document.getElementById('m'),i=document.getElementById('i');function add(t,c){const e=document.createElement('div');e.className='msg '+c;e.textContent=t;m.appendChild(e);m.scrollTop=m.scrollHeight}add(C.config.welcomeMessage,'bot');document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const t=i.value.trim();if(!t)return;i.value='';add(t,'user');const wait=document.createElement('div');wait.className='msg bot';wait.textContent='…';m.appendChild(wait);try{const r=await fetch(C.origin+'/api/white-label/public/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:C.widgetKey,message:t})});const d=await r.json();wait.textContent=d.text||'No puedo responder ahora.'}catch{wait.textContent='No puedo responder ahora.'}m.scrollTop=m.scrollHeight});</script></body></html>`
}
