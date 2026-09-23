import { prisma } from '../lib/prisma'
import { getDecryptedToken } from './metaAdAccount.service'
import { enqueueAdReviewPoll } from '../jobs/adReviewPoll'
import { emitOutcome } from './outcomes.service'
import { checkAssetsConsentForPublication } from './consent.service'

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? 'v23.0'
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`
// Mismo plazo que metaAdAccount.service: una llamada colgada a Graph no puede
// dejar la petición del usuario (ni el worker) esperando indefinidamente.
export const META_HTTP_TIMEOUT_MS = 15_000
// Tope de anuncios por publicación: cada creatividad aprobada es un anuncio,
// pero una campaña nueva con más de cinco reparte demasiado poco presupuesto
// para que Meta aprenda de alguna.
const MAX_ADS_PER_PUBLISH = 5

// ─── Errores tipados ────────────────────────────────────────────────────────

export type MetaPublishErrorCode =
  | 'CAMPAIGN_NOT_FOUND'
  | 'APP_URL_MISSING'
  | 'APP_URL_NOT_PUBLIC'
  | 'META_NOT_CONNECTED'
  | 'META_PAGE_MISSING'
  | 'META_TOKEN_UNAVAILABLE'
  | 'NO_CREATIVE'
  | 'CREATIVE_ASSET_NOT_PUBLISHED'
  | 'NO_BUDGET'
  | 'BUDGET_ABOVE_CAP'
  | 'ASSET_CONSENT_INVALID'
  | 'NOT_PUBLISHED'
  | 'META_TIMEOUT'
  | 'META_PROVIDER'
  | 'META_NETWORK'
  | 'META_INVALID_RESPONSE'

/**
 * Error de publicación con código estable y estado HTTP. Los fallos previos a
 * tocar Meta (configuración, cuenta, creatividad, consentimiento) son 4xx: el
 * usuario puede corregirlos. Solo lo que falla dentro de Meta es 502/504.
 * `details` nunca contiene el cuerpo del proveedor: solo códigos numéricos.
 */
export class MetaPublishError extends Error {
  readonly code: MetaPublishErrorCode
  readonly statusCode: number
  readonly details?: Record<string, unknown>

  constructor(message: string, code: MetaPublishErrorCode, statusCode: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'MetaPublishError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export function isMetaPublishError(error: unknown): error is MetaPublishError {
  return error instanceof MetaPublishError
}

/**
 * Traduce cualquier error de este servicio a {status, code, message} seguro
 * para enviar al navegador. Lo desconocido es 502 genérico y sin detalles.
 */
export function classifyPublishError(error: unknown): { status: number; code: string; message: string; details?: Record<string, unknown> } {
  if (isMetaPublishError(error)) {
    return { status: error.statusCode, code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
  }
  const legacy = error as { code?: string; message?: string } | null
  if (legacy?.code === 'ASSET_CONSENT_INVALID') {
    return { status: 422, code: 'ASSET_CONSENT_INVALID', message: legacy.message ?? 'Consentimiento no válido' }
  }
  if (legacy?.message === 'Campaign not found') {
    return { status: 404, code: 'CAMPAIGN_NOT_FOUND', message: 'Campaña no encontrada' }
  }
  return { status: 502, code: 'META_PROVIDER', message: 'Meta no pudo completar la operación' }
}

// ─── Cliente Graph ──────────────────────────────────────────────────────────

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/** Solo códigos numéricos del error de Meta: el mensaje puede traer datos. */
async function safeProviderCodes(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = await res.json() as { error?: { code?: unknown; error_subcode?: unknown } }
    const codes: Record<string, unknown> = { metaStatus: res.status }
    if (typeof body?.error?.code === 'number') codes.metaErrorCode = body.error.code
    if (typeof body?.error?.error_subcode === 'number') codes.metaErrorSubcode = body.error.error_subcode
    return codes
  } catch {
    return { metaStatus: res.status }
  }
}

/**
 * Llamada a Graph con plazo máximo y el token en la cabecera Authorization
 * (nunca en la query: las URLs acaban en logs de proxies y de errores).
 */
async function graphRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token: string,
  options: { body?: Record<string, unknown>; query?: Record<string, string> } = {},
): Promise<T> {
  const signal = AbortSignal.timeout(META_HTTP_TIMEOUT_MS)
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : ''
  const operation = `${method} ${path.replace(/\d{5,}/g, ':id')}`
  try {
    const res = await fetch(`${GRAPH_URL}${path}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal,
    })
    if (!res.ok) {
      const details = await safeProviderCodes(res)
      throw new MetaPublishError(`Meta rechazó la operación ${operation} (${res.status})`, 'META_PROVIDER', 502, details)
    }
    try {
      return await res.json() as T
    } catch {
      throw new MetaPublishError(`Meta devolvió una respuesta no válida en ${operation}`, 'META_INVALID_RESPONSE', 502)
    }
  } catch (error) {
    if (isMetaPublishError(error)) throw error
    if (signal.aborted || isAbortError(error)) {
      throw new MetaPublishError(`Meta no respondió a tiempo en ${operation}`, 'META_TIMEOUT', 504)
    }
    throw new MetaPublishError(`Meta no está disponible (${operation})`, 'META_NETWORK', 502)
  }
}

async function graphPost(path: string, token: string, body: Record<string, unknown>): Promise<{ id: string }> {
  const result = await graphRequest<{ id?: unknown }>('POST', path, token, { body })
  return { id: typeof result?.id === 'string' ? result.id : String(result?.id ?? '') }
}

async function graphGet(path: string, token: string, fields: string) {
  return graphRequest<Record<string, unknown>>('GET', path, token, { query: { fields } })
}

async function graphDelete(path: string, token: string) {
  return graphRequest<Record<string, unknown>>('DELETE', path, token)
}

// ─── Funciones puras: objetivo, segmentación, CTA y presupuesto ────────────

interface CampaignAdAssets {
  offer?: string
  adCopy?: string
  landingTemplateId?: string
  imagePrompt?: string
  imageUrl?: string
  imageAssetId?: string
  presupuestoMensual?: number
  // Variante elegida en el asistente (AdsWizardPage): copy inicial del anuncio
  // cuando la campaña todavía no tiene creatividades aprobadas.
  creative?: { label?: string; title?: string; body?: string; cta?: string }
}

const CONVERSION_EVENTS: Record<string, string> = {
  lead: 'LEAD',
  schedule: 'SCHEDULE',
  reserva: 'SCHEDULE',
  cita: 'SCHEDULE',
  contact: 'CONTACT',
  contacto: 'CONTACT',
  completeregistration: 'COMPLETE_REGISTRATION',
  registro: 'COMPLETE_REGISTRATION',
  purchase: 'PURCHASE',
  compra: 'PURCHASE',
  submitapplication: 'SUBMIT_APPLICATION',
}

function normalizeKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface MetaObjective {
  mode: 'pixel_leads' | 'traffic'
  campaignObjective: 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC'
  optimizationGoal: 'OFFSITE_CONVERSIONS' | 'LINK_CLICKS'
  billingEvent: 'IMPRESSIONS'
  promotedObject?: { pixel_id: string; custom_event_type: string }
}

/**
 * Objetivo coherente con lo que Meta acepta para un anuncio que lleva a una
 * landing propia (no a un formulario nativo):
 *
 * - Con píxel en la cuenta: OUTCOME_LEADS optimizando OFFSITE_CONVERSIONS con
 *   promoted_object {pixel_id, custom_event_type}. El evento sale de la
 *   activación Meta del plan (conversionEvent) y por defecto es LEAD.
 * - Sin píxel: OUTCOME_TRAFFIC con LINK_CLICKS. Es honesto: sin píxel Meta no
 *   puede ver el lead, así que optimizar "leads" sería optimizar a ciegas.
 *
 * La combinación anterior (OUTCOME_LEADS + LEAD_GENERATION sin promoted_object
 * ni formulario) la rechaza Meta. Si la activación pide tráfico de forma
 * explícita, se respeta aunque haya píxel.
 */
export function buildObjective(input: { pixelId?: string | null; activationObjective?: string | null; conversionEvent?: string | null }): MetaObjective {
  const wantsTraffic = input.activationObjective ? /traffic|trafico|tráfico|clic/i.test(input.activationObjective) : false
  const pixelId = input.pixelId?.trim()
  if (pixelId && !wantsTraffic) {
    const event = input.conversionEvent ? CONVERSION_EVENTS[normalizeKey(input.conversionEvent)] : undefined
    return {
      mode: 'pixel_leads',
      campaignObjective: 'OUTCOME_LEADS',
      optimizationGoal: 'OFFSITE_CONVERSIONS',
      billingEvent: 'IMPRESSIONS',
      promotedObject: { pixel_id: pixelId, custom_event_type: event ?? 'LEAD' },
    }
  }
  return { mode: 'traffic', campaignObjective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS', billingEvent: 'IMPRESSIONS' }
}

const COUNTRY_CODES: Record<string, string> = {
  espana: 'ES', spain: 'ES', portugal: 'PT', francia: 'FR', france: 'FR', italia: 'IT', italy: 'IT',
  alemania: 'DE', germany: 'DE', reinounido: 'GB', uk: 'GB', unitedkingdom: 'GB', irlanda: 'IE', ireland: 'IE',
  andorra: 'AD', mexico: 'MX', argentina: 'AR', colombia: 'CO', chile: 'CL', peru: 'PE', uruguay: 'UY',
  estadosunidos: 'US', eeuu: 'US', usa: 'US', unitedstates: 'US', paisesbajos: 'NL', holanda: 'NL',
  belgica: 'BE', suiza: 'CH', austria: 'AT',
}
const ISO_CODES = new Set(Object.values(COUNTRY_CODES))

export interface TargetingAudience {
  location?: string | null
  ageRange?: string | null
  interests?: string[] | null
  customAudiences?: string[] | null
  exclusions?: string[] | null
}

export interface TargetingResult {
  targeting: Record<string, unknown>
  source: 'audience' | 'default'
  warnings: string[]
}

/**
 * Segmentación desde la audiencia del plan. Solo se traduce lo que se puede
 * traducir sin inventar: países por nombre o código ISO, edad (18–65) y
 * audiencias propias por id numérico de Meta. Ciudades e intereses en texto
 * libre necesitan ids de Meta (búsqueda de targeting) y se avisan en vez de
 * enviarse mal. Sin países reconocibles, España es el respaldo explícito.
 */
export function buildTargeting(audience: TargetingAudience | null | undefined): TargetingResult {
  const warnings: string[] = []
  const countries: string[] = []
  const location = audience?.location?.trim()
  if (location) {
    for (const raw of location.split(/[,;/|]|\s+y\s+|\s+and\s+/i)) {
      const token = raw.trim()
      if (!token) continue
      const upper = token.toUpperCase()
      const code = ISO_CODES.has(upper) && token.length === 2 ? upper : COUNTRY_CODES[normalizeKey(token)]
      if (code) {
        if (!countries.includes(code)) countries.push(code)
      } else {
        warnings.push(`La ubicación «${token}» no es un país reconocible; Meta necesita un id de ciudad o región y no se aplicó.`)
      }
    }
  }

  const targeting: Record<string, unknown> = {
    geo_locations: { countries: countries.length ? countries : ['ES'] },
  }
  if (!countries.length) warnings.push('Sin países en la audiencia: se usa España como respaldo.')

  const ageRange = audience?.ageRange?.trim()
  if (ageRange) {
    const range = ageRange.match(/(\d{2})\s*(?:-|–|—|a|to|hasta)\s*(\d{2})/i)
    const plus = ageRange.match(/(\d{2})\s*\+/)
    const clamp = (value: number) => Math.min(65, Math.max(18, value))
    if (range) {
      const min = clamp(Number(range[1]))
      const max = clamp(Number(range[2]))
      targeting.age_min = Math.min(min, max)
      targeting.age_max = Math.max(min, max)
    } else if (plus) {
      targeting.age_min = clamp(Number(plus[1]))
    } else {
      warnings.push(`No se pudo interpretar la edad «${ageRange}»; se usa el rango por defecto de Meta.`)
    }
  }

  const metaIds = (values?: string[] | null) => (values ?? []).map(v => v.trim()).filter(v => /^\d{6,}$/.test(v))
  const custom = metaIds(audience?.customAudiences)
  const excluded = metaIds(audience?.exclusions)
  if (custom.length) targeting.custom_audiences = custom.map(id => ({ id }))
  if (excluded.length) targeting.excluded_custom_audiences = excluded.map(id => ({ id }))
  if ((audience?.customAudiences?.length ?? 0) > custom.length || (audience?.exclusions?.length ?? 0) > excluded.length) {
    warnings.push('Algunas audiencias propias o exclusiones no son ids de Meta y no se aplicaron.')
  }
  if (audience?.interests?.length) {
    warnings.push('Los intereses en texto libre no se envían: Meta exige ids de interés.')
  }
  // Meta exige declarar Advantage+ audience; se desactiva para respetar la
  // segmentación que el equipo definió en el plan.
  targeting.targeting_automation = { advantage_audience: 0 }

  return { targeting, source: countries.length ? 'audience' : 'default', warnings }
}

const META_CTAS = new Set(['LEARN_MORE', 'SIGN_UP', 'CONTACT_US', 'BOOK_NOW', 'GET_QUOTE', 'DOWNLOAD', 'SHOP_NOW', 'SUBSCRIBE', 'APPLY_NOW', 'GET_OFFER', 'WHATSAPP_MESSAGE'])

/** Traduce el CTA en texto libre de la creatividad al enum de Meta. */
export function mapCallToAction(cta?: string | null): string {
  if (!cta) return 'LEARN_MORE'
  const upper = cta.trim().toUpperCase().replace(/\s+/g, '_')
  if (META_CTAS.has(upper)) return upper
  const text = normalizeKey(cta)
  if (/reserv|cita|agenda/.test(text)) return 'BOOK_NOW'
  if (/contact|llam|habla/.test(text)) return 'CONTACT_US'
  if (/regist|inscrib|apunt|empez|prueba/.test(text)) return 'SIGN_UP'
  if (/presupuest|cotiz/.test(text)) return 'GET_QUOTE'
  if (/descarg/.test(text)) return 'DOWNLOAD'
  if (/compr|tienda/.test(text)) return 'SHOP_NOW'
  if (/suscrib/.test(text)) return 'SUBSCRIBE'
  if (/oferta|descuento/.test(text)) return 'GET_OFFER'
  return 'LEARN_MORE'
}

/**
 * Presupuesto diario en céntimos. La activación Meta del plan manda; si no
 * tiene presupuesto, el mensual del asistente y después el global. Un periodo
 * explícito reparte el total entre sus días; sin periodo, 30 días.
 */
export function computeDailyBudgetCents(input: {
  activationBudgetCents?: number | null
  startDate?: Date | null
  endDate?: Date | null
  wizardMonthlyBudget?: number | null
  campaignBudgetCents?: number | null
}): number | null {
  const total = input.activationBudgetCents
    ?? (input.wizardMonthlyBudget ? Math.round(input.wizardMonthlyBudget * 100) : null)
    ?? input.campaignBudgetCents
    ?? null
  if (!total || total <= 0) return null
  let days = 30
  if (input.activationBudgetCents && input.startDate && input.endDate) {
    const span = Math.ceil((input.endDate.getTime() - input.startDate.getTime()) / 86_400_000)
    if (span > 0) days = span
  }
  return Math.max(100, Math.round(total / days))
}

// ─── Plan de publicación ────────────────────────────────────────────────────

export interface PlannedAd {
  /** AdCreative.id cuando sale del plan; null si es el respaldo de adAssets */
  creativeId: string | null
  name: string
  linkData: Record<string, unknown>
}

export interface PublishPlan {
  adAccountId: string
  pageId: string
  campaignName: string
  objective: MetaObjective
  dailyBudgetCents: number
  targeting: TargetingResult
  schedule: { start_time?: string; end_time?: string }
  ads: PlannedAd[]
  consentAssetIds: string[]
  creativeSource: 'plan' | 'wizard'
}

export interface PublishPlanInput {
  publicBaseUrl: string | undefined
  campaign: { id: string; name: string; landingSlug: string | null; budgetCents: number | null; adAssets: unknown }
  metaAccount: { metaAdAccountId: string; metaPageId: string | null; metaPixelId: string | null; dailyBudgetCapCents: number | null } | null
  activation?: { objective: string | null; budgetCents: number | null; startDate: Date | null; endDate: Date | null; conversionEvent: string | null } | null
  audience?: TargetingAudience | null
  creatives?: Array<{
    id: string
    headline: string | null
    primaryText: string | null
    description: string | null
    cta: string | null
    assetId: string | null
    destination?: string | null
  }>
  /** Asset.id → URL pública publicada (publishedUrl) */
  assetUrls?: Record<string, string | null>
  now?: Date
}

function publicUrlOrThrow(value: string | undefined): URL {
  if (!value) throw new MetaPublishError('APP_URL pública no configurada: Meta necesita una URL de destino accesible.', 'APP_URL_MISSING', 422)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new MetaPublishError('APP_URL no es una URL válida.', 'APP_URL_MISSING', 422)
  }
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new MetaPublishError('APP_URL debe ser una URL pública antes de publicar en Meta.', 'APP_URL_NOT_PUBLIC', 422)
  }
  return parsed
}

/**
 * Compone todo lo que se enviará a Meta sin llamar a Meta. Prioridad:
 * creatividades aprobadas del plan → variante elegida en el asistente →
 * copy de adAssets. Lanza MetaPublishError 4xx ante cualquier hueco previo.
 */
export function buildPublishPlan(input: PublishPlanInput): PublishPlan {
  const publicUrl = publicUrlOrThrow(input.publicBaseUrl)
  const account = input.metaAccount
  if (!account) throw new MetaPublishError('No hay cuenta de Meta conectada para esta organización.', 'META_NOT_CONNECTED', 409)
  if (!account.metaPageId) {
    throw new MetaPublishError('La cuenta de Meta no tiene una página conectada para crear el anuncio.', 'META_PAGE_MISSING', 409)
  }

  const assets = (input.campaign.adAssets ?? null) as CampaignAdAssets | null
  const landingUrl = input.campaign.landingSlug ? new URL(`/l/${input.campaign.landingSlug}`, publicUrl).toString() : null
  const httpsDestination = (value?: string | null) => (value && /^https:\/\//i.test(value.trim()) ? value.trim() : null)

  const ads: PlannedAd[] = []
  const consentAssetIds: string[] = []
  const approved = (input.creatives ?? []).slice(0, MAX_ADS_PER_PUBLISH)
  for (const creative of approved) {
    const link = httpsDestination(creative.destination) ?? landingUrl
    if (!link) throw new MetaPublishError('La campaña no tiene landing ni destino para el anuncio.', 'NO_CREATIVE', 422)
    const linkData: Record<string, unknown> = {
      message: creative.primaryText ?? creative.headline ?? input.campaign.name,
      link,
      call_to_action: { type: mapCallToAction(creative.cta) },
    }
    if (creative.headline) linkData.name = creative.headline
    if (creative.description) linkData.description = creative.description
    if (creative.assetId) {
      const url = input.assetUrls?.[creative.assetId]
      if (!url) {
        throw new MetaPublishError(
          'Una creatividad aprobada usa una imagen que todavía no está publicada en la biblioteca.',
          'CREATIVE_ASSET_NOT_PUBLISHED', 422, { creativeId: creative.id },
        )
      }
      linkData.picture = url
      consentAssetIds.push(creative.assetId)
    }
    ads.push({ creativeId: creative.id, name: creative.headline ?? input.campaign.name, linkData })
  }

  let creativeSource: PublishPlan['creativeSource'] = 'plan'
  if (!ads.length) {
    creativeSource = 'wizard'
    const message = assets?.creative?.body?.trim() || assets?.adCopy?.trim()
    if (!assets || !message || !landingUrl) {
      throw new MetaPublishError(
        'La campaña no tiene creatividades aprobadas ni copy del asistente: aprueba una creatividad antes de publicar.',
        'NO_CREATIVE', 422,
      )
    }
    const linkData: Record<string, unknown> = {
      message,
      link: landingUrl,
      call_to_action: { type: mapCallToAction(assets.creative?.cta) },
    }
    if (assets.creative?.title) linkData.name = assets.creative.title
    if (assets.imageUrl) linkData.picture = assets.imageUrl
    if (assets.imageAssetId) consentAssetIds.push(assets.imageAssetId)
    ads.push({ creativeId: null, name: input.campaign.name, linkData })
  }

  const activation = input.activation ?? null
  const dailyBudgetCents = computeDailyBudgetCents({
    activationBudgetCents: activation?.budgetCents,
    startDate: activation?.startDate,
    endDate: activation?.endDate,
    wizardMonthlyBudget: assets?.presupuestoMensual,
    campaignBudgetCents: input.campaign.budgetCents,
  })
  if (!dailyBudgetCents) {
    throw new MetaPublishError('La campaña no tiene presupuesto: asígnalo en la activación Meta o en la campaña.', 'NO_BUDGET', 422)
  }
  if (account.dailyBudgetCapCents && dailyBudgetCents > account.dailyBudgetCapCents) {
    throw new MetaPublishError(
      `El presupuesto diario (${(dailyBudgetCents / 100).toFixed(2)} €) supera el tope de la cuenta (${(account.dailyBudgetCapCents / 100).toFixed(2)} €).`,
      'BUDGET_ABOVE_CAP', 422,
    )
  }

  const now = input.now ?? new Date()
  const schedule: PublishPlan['schedule'] = {}
  if (activation?.startDate && activation.startDate > now) schedule.start_time = activation.startDate.toISOString()
  if (activation?.endDate && activation.endDate > now) schedule.end_time = activation.endDate.toISOString()

  return {
    adAccountId: account.metaAdAccountId,
    pageId: account.metaPageId,
    campaignName: input.campaign.name,
    objective: buildObjective({ pixelId: account.metaPixelId, activationObjective: activation?.objective, conversionEvent: activation?.conversionEvent }),
    dailyBudgetCents,
    targeting: buildTargeting(input.audience),
    schedule,
    ads,
    consentAssetIds: [...new Set(consentAssetIds)],
    creativeSource,
  }
}

export interface ExecutedPublish {
  metaCampaignId: string
  metaAdSetId: string
  metaAdId: string
  ads: Array<{ creativeId: string | null; metaAdId: string }>
}

/**
 * Ejecuta el plan en Meta (todo en PAUSED). Si algo falla a mitad, borra en
 * orden inverso lo creado en esta ejecución (best-effort) para no dejar
 * campañas huérfanas en la cuenta del cliente, y adjunta el resultado del
 * deshacer al error. Nada queda gastando: todo nace pausado.
 */
export async function executePublishPlan(plan: PublishPlan, token: string): Promise<ExecutedPublish> {
  const created: string[] = []
  try {
    const metaCampaign = await graphPost(`/${plan.adAccountId}/campaigns`, token, {
      name: plan.campaignName,
      objective: plan.objective.campaignObjective,
      status: 'PAUSED',
      special_ad_categories: [],
    })
    created.push(metaCampaign.id)

    const metaAdSet = await graphPost(`/${plan.adAccountId}/adsets`, token, {
      name: `${plan.campaignName} — ad set`,
      campaign_id: metaCampaign.id,
      daily_budget: plan.dailyBudgetCents,
      billing_event: plan.objective.billingEvent,
      optimization_goal: plan.objective.optimizationGoal,
      ...(plan.objective.promotedObject ? { promoted_object: plan.objective.promotedObject } : {}),
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: plan.targeting.targeting,
      ...plan.schedule,
      status: 'PAUSED',
    })
    created.push(metaAdSet.id)

    const ads: ExecutedPublish['ads'] = []
    for (const [index, planned] of plan.ads.entries()) {
      const creative = await graphPost(`/${plan.adAccountId}/adcreatives`, token, {
        name: `${planned.name} — creative ${index + 1}`,
        object_story_spec: { page_id: plan.pageId, link_data: planned.linkData },
      })
      created.push(creative.id)
      const ad = await graphPost(`/${plan.adAccountId}/ads`, token, {
        name: plan.ads.length > 1 ? `${plan.campaignName} — ${index + 1}` : plan.campaignName,
        adset_id: metaAdSet.id,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      })
      created.push(ad.id)
      ads.push({ creativeId: planned.creativeId, metaAdId: ad.id })
    }

    return { metaCampaignId: metaCampaign.id, metaAdSetId: metaAdSet.id, metaAdId: ads[0].metaAdId, ads }
  } catch (error) {
    const rollback = { deleted: [] as string[], failed: [] as string[] }
    for (const id of [...created].reverse()) {
      try {
        await graphDelete(`/${id}`, token)
        rollback.deleted.push(id)
      } catch {
        rollback.failed.push(id)
      }
    }
    if (created.length) {
      console.warn(`[MetaPublish] publicación fallida; deshecho ${rollback.deleted.length}/${created.length} objetos`, rollback.failed.length ? { pendientes: rollback.failed } : '')
    }
    const classified = classifyPublishError(error)
    throw new MetaPublishError(
      rollback.failed.length
        ? `${classified.message}. No se pudieron borrar ${rollback.failed.length} objetos creados en Meta; revísalos en el Administrador de anuncios.`
        : classified.message,
      classified.code as MetaPublishErrorCode,
      classified.status,
      { ...(classified.details ?? {}), rollback },
    )
  }
}

/**
 * Arma Campaign → Ad Set → Ad Creative(s) → Ad(s) en Meta, todo en PAUSED. No
 * queda gastando nada hasta que se llame `activateCampaign`.
 *
 * Lee el plan de la campaña global: activación Meta (objetivo, evento,
 * presupuesto y fechas), la audiencia vinculada y las creatividades
 * aprobadas. `adAssets` del asistente queda como respaldo.
 *
 * ponytail: el anuncio apunta a la landing propia (link ad simple), no crea
 * un Lead Form nativo de Meta (`/{page_id}/leadgen_forms`) — eso requiere una
 * Página real conectada para poder probarse.
 */
export async function publishCampaign(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign) throw new MetaPublishError('Campaña no encontrada', 'CAMPAIGN_NOT_FOUND', 404)

  // Hacer la operación idempotente evita duplicar campañas si el navegador
  // reintenta la petición después de un timeout.
  if (campaign.metaCampaignId && campaign.metaAdSetId && campaign.metaAdId) {
    return {
      metaCampaignId: campaign.metaCampaignId,
      metaAdSetId: campaign.metaAdSetId,
      metaAdId: campaign.metaAdId,
    }
  }

  const [metaAccount, activation, creatives] = await Promise.all([
    prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } }),
    prisma.adActivation.findFirst({ where: { orgId, campaignId, platform: 'meta' } }),
    prisma.adCreative.findMany({
      where: { orgId, campaignId, approvalStatus: 'approved' },
      orderBy: { approvedAt: 'desc' },
      take: MAX_ADS_PER_PUBLISH,
      include: { brief: { select: { destination: true, audienceId: true } } },
    }),
  ])

  // La audiencia del brief de la creatividad aprobada manda; si no, la más
  // reciente de la campaña. AdAudience no tiene flujo de aprobación propio:
  // "aprobada" aquí es "no archivada y vinculada a la campaña".
  const briefAudienceId = creatives.find(c => c.brief?.audienceId)?.brief?.audienceId ?? null
  const audience = await prisma.adAudience.findFirst({
    where: briefAudienceId
      ? { id: briefAudienceId, orgId, archivedAt: null }
      : { orgId, campaignId, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
  })

  const assetIds = creatives.map(c => c.assetId).filter((id): id is string => Boolean(id))
  const assetRows = assetIds.length
    ? await prisma.asset.findMany({ where: { orgId, id: { in: assetIds } }, select: { id: true, publishedUrl: true } })
    : []

  const plan = buildPublishPlan({
    publicBaseUrl: process.env.APP_URL,
    campaign,
    metaAccount,
    activation,
    audience,
    creatives: creatives.map(c => ({ ...c, destination: c.brief?.destination ?? null })),
    assetUrls: Object.fromEntries(assetRows.map(a => [a.id, a.publishedUrl])),
  })

  const token = await getDecryptedToken(orgId)
  if (!token) throw new MetaPublishError('El token de Meta no está disponible: vuelve a conectar la cuenta.', 'META_TOKEN_UNAVAILABLE', 409)

  if (plan.consentAssetIds.length) {
    const consent = await checkAssetsConsentForPublication({ orgId, assetIds: plan.consentAssetIds, channels: ['meta'] })
    if (!consent.valid) {
      throw new MetaPublishError(
        `No se puede publicar la creatividad: ${consent.reason ?? 'consentimiento no válido'}`,
        'ASSET_CONSENT_INVALID', 422, { assetId: consent.assetId },
      )
    }
  }

  const result = await executePublishPlan(plan, token)

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      metaCampaignId: result.metaCampaignId,
      metaAdSetId: result.metaAdSetId,
      metaAdId: result.metaAdId,
      adStatus: 'draft',
    },
  })
  for (const ad of result.ads) {
    if (ad.creativeId) await prisma.adCreative.updateMany({ where: { id: ad.creativeId, orgId }, data: { metaAdId: ad.metaAdId } })
  }

  return {
    metaCampaignId: result.metaCampaignId,
    metaAdSetId: result.metaAdSetId,
    metaAdId: result.metaAdId,
    adsCreated: result.ads.length,
    objective: plan.objective.mode,
    creativeSource: plan.creativeSource,
    targetingSource: plan.targeting.source,
    warnings: plan.targeting.warnings,
  }
}

/** Anuncios extra creados desde creatividades del plan (además de campaign.metaAdId). */
async function extraAdIds(orgId: string, campaignId: string, primaryAdId: string | null) {
  const rows = await prisma.adCreative.findMany({
    where: { orgId, campaignId, metaAdId: { not: null } },
    select: { metaAdId: true },
  })
  return rows.map(r => r.metaAdId as string).filter(id => id !== primaryAdId)
}

export async function activateCampaign(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign) throw new MetaPublishError('Campaña no encontrada', 'CAMPAIGN_NOT_FOUND', 404)
  if (!campaign.metaCampaignId || !campaign.metaAdSetId || !campaign.metaAdId) {
    throw new MetaPublishError('La campaña todavía no está publicada en Meta.', 'NOT_PUBLISHED', 409)
  }
  const token = await getDecryptedToken(orgId)
  if (!token) throw new MetaPublishError('El token de Meta no está disponible: vuelve a conectar la cuenta.', 'META_TOKEN_UNAVAILABLE', 409)

  await graphPost(`/${campaign.metaCampaignId}`, token, { status: 'ACTIVE' })
  await graphPost(`/${campaign.metaAdSetId}`, token, { status: 'ACTIVE' })
  for (const adId of [campaign.metaAdId, ...(await extraAdIds(orgId, campaignId, campaign.metaAdId))]) {
    await graphPost(`/${adId}`, token, { status: 'ACTIVE' })
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { adStatus: 'pending_review', status: 'active' },
  })

  // North star (09 §5): campaña activada en Meta = 'campaign_published'. Nunca lanza.
  await emitOutcome({ orgId, kind: 'campaign_published', sourceRef: { campaignId, metaCampaignId: campaign.metaCampaignId } })

  await enqueueAdReviewPoll(orgId, campaignId)
}

export async function pauseCampaign(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign) throw new MetaPublishError('Campaña no encontrada', 'CAMPAIGN_NOT_FOUND', 404)
  if (!campaign.metaCampaignId && !campaign.metaAdSetId && !campaign.metaAdId) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused', adStatus: 'paused' } })
    return { ok: true, remote: false }
  }

  const token = await getDecryptedToken(orgId)
  if (!token) throw new MetaPublishError('El token de Meta no está disponible: vuelve a conectar la cuenta.', 'META_TOKEN_UNAVAILABLE', 409)

  // Pausar los tres niveles deja la intención explícita y permite reactivar
  // desde el mismo panel aunque Meta conserve el estado de los hijos.
  const extra = await extraAdIds(orgId, campaignId, campaign.metaAdId)
  for (const id of [campaign.metaAdId, ...extra, campaign.metaAdSetId, campaign.metaCampaignId]) {
    if (id) await graphPost(`/${id}`, token, { status: 'PAUSED' })
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'paused', adStatus: 'paused' },
  })
  return { ok: true, remote: true }
}

export async function getRemoteStatus(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: { id: true, metaCampaignId: true, metaAdSetId: true, metaAdId: true },
  })
  if (!campaign) throw new MetaPublishError('Campaña no encontrada', 'CAMPAIGN_NOT_FOUND', 404)
  const token = await getDecryptedToken(orgId)
  if (!token) throw new MetaPublishError('El token de Meta no está disponible: vuelve a conectar la cuenta.', 'META_TOKEN_UNAVAILABLE', 409)

  const [remoteCampaign, remoteAdSet, remoteAd] = await Promise.all([
    campaign.metaCampaignId ? graphGet(`/${campaign.metaCampaignId}`, token, 'status,effective_status') : null,
    campaign.metaAdSetId ? graphGet(`/${campaign.metaAdSetId}`, token, 'status,effective_status') : null,
    campaign.metaAdId ? graphGet(`/${campaign.metaAdId}`, token, 'status,effective_status') : null,
  ])

  const effectiveStatus = String(remoteAd?.effective_status ?? remoteCampaign?.effective_status ?? 'UNKNOWN').toLowerCase()
  const adStatus = effectiveStatus === 'active'
    ? 'active'
    : effectiveStatus === 'paused'
      ? 'paused'
      : effectiveStatus === 'disapproved'
        ? 'disapproved'
        : 'pending_review'

  await prisma.campaign.update({ where: { id: campaignId }, data: { adStatus } })
  return {
    campaign: remoteCampaign,
    adSet: remoteAdSet,
    ad: remoteAd,
    adStatus,
  }
}
