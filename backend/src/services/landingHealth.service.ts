import { prisma } from '../lib/prisma'

/**
 * Salud técnica de la landing — docs/xarly/landings.md §7.3.
 *
 * Su papel en el producto no es informar de velocidad: es **descartar causas
 * técnicas antes de diagnosticar mensaje** (§6). Acusar al copy de un hero que
 * tarda seis segundos en aparecer, o de una página que devuelve 500, es
 * diagnosticar al revés y hacer perder el tiempo al cliente.
 *
 * Se mide lo que se puede medir de forma determinista desde el servidor. No se
 * usa PageSpeed/CrUX: son datos de campo que exigen tráfico real y una landing
 * de pyme casi nunca los tiene.
 */

/** A partir de aquí el visitante percibe espera. */
const SLOW_TTFB_MS = 800
const SLOW_TOTAL_MS = 2500
/** Una imagen de héroe por encima de esto castiga a cualquiera con datos móviles. */
const HEAVY_HERO_BYTES = 500_000
const REQUEST_TIMEOUT_MS = 15_000

export type HealthVerdict = 'ok' | 'slow' | 'broken' | 'unknown'

export interface HealthMeasurement {
  statusCode: number | null
  ttfbMs: number | null
  totalMs: number | null
  documentBytes: number | null
  heroImageBytes: number | null
  mobileReady: boolean | null
  verdict: HealthVerdict
  error: string | null
}

function verdictFrom(measurement: Omit<HealthMeasurement, 'verdict' | 'error'>, error: string | null): HealthVerdict {
  if (error || measurement.statusCode === null) return 'unknown'
  if (measurement.statusCode >= 400) return 'broken'
  const slow = (measurement.ttfbMs !== null && measurement.ttfbMs > SLOW_TTFB_MS)
    || (measurement.totalMs !== null && measurement.totalMs > SLOW_TOTAL_MS)
    || (measurement.heroImageBytes !== null && measurement.heroImageBytes > HEAVY_HERO_BYTES)
  return slow ? 'slow' : 'ok'
}

async function measureAsset(url: string) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    // HEAD evita descargar la imagen entera solo para conocer su peso.
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timer)
    const length = response.headers.get('content-length')
    return length ? Number(length) : null
  } catch {
    return null
  }
}

export async function measureLanding(url: string, heroImageUrl?: string | null): Promise<HealthMeasurement> {
  const startedAt = Date.now()
  let statusCode: number | null = null
  let ttfbMs: number | null = null
  let totalMs: number | null = null
  let documentBytes: number | null = null
  let mobileReady: boolean | null = null
  let error: string | null = null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    // Las cabeceras ya están: el resto es cuerpo. Es la mejor aproximación a
    // TTFB que ofrece `fetch` sin instrumentar el socket.
    ttfbMs = Date.now() - startedAt
    statusCode = response.status
    const html = await response.text()
    clearTimeout(timer)
    totalMs = Date.now() - startedAt
    documentBytes = Buffer.byteLength(html, 'utf8')
    mobileReady = /<meta[^>]+name=["']viewport["']/i.test(html)
  } catch (caught) {
    error = caught instanceof Error ? caught.message.slice(0, 300) : 'Error desconocido'
  }

  const heroImageBytes = heroImageUrl ? await measureAsset(heroImageUrl) : null
  const partial = { statusCode, ttfbMs, totalMs, documentBytes, heroImageBytes, mobileReady }

  return { ...partial, verdict: verdictFrom(partial, error), error }
}

/**
 * Chequea todas las landings publicadas de una organización y guarda el
 * resultado. Devuelve cuántas se comprobaron.
 */
export async function checkOrganizationLandings(orgId: string, baseUrl = process.env.FRONTEND_URL) {
  // Sin dirección pública no hay nada que medir. Se devuelve el motivo en vez
  // de fallar: el resto de la telemetría sigue siendo válida sin este chequeo.
  if (!baseUrl) return { checked: 0, skipped: 'FRONTEND_URL no configurada' }

  const campaigns = await prisma.campaign.findMany({
    where: { orgId, status: 'active', landingSlug: { not: null }, landingKey: { not: null } },
    select: { id: true, landingSlug: true, landingKey: true, adAssets: true },
  })

  let checked = 0
  for (const campaign of campaigns) {
    const url = `${baseUrl.replace(/\/+$/, '')}/l/${campaign.landingSlug}`
    const assets = (campaign.adAssets ?? {}) as { imageUrl?: string }
    const heroImage = assets.imageUrl && /^https?:\/\//i.test(assets.imageUrl)
      ? assets.imageUrl
      : assets.imageUrl ? `${baseUrl.replace(/\/+$/, '')}${assets.imageUrl}` : null

    const measurement = await measureLanding(url, heroImage)
    await prisma.landingHealthCheck.create({
      data: {
        orgId,
        campaignId: campaign.id,
        landingKey: campaign.landingKey as string,
        url,
        ...measurement,
      },
    })
    checked += 1
  }

  return { checked }
}

/** Último chequeo de cada landing, para que los diagnósticos lo consulten. */
export async function latestHealthByLanding(orgId: string, landingKeys: string[]) {
  if (!landingKeys.length) return new Map<string, Awaited<ReturnType<typeof prisma.landingHealthCheck.findFirst>>>()

  const checks = await prisma.landingHealthCheck.findMany({
    where: { orgId, landingKey: { in: landingKeys } },
    orderBy: { checkedAt: 'desc' },
  })

  const latest = new Map<string, (typeof checks)[number]>()
  for (const check of checks) {
    if (!latest.has(check.landingKey)) latest.set(check.landingKey, check)
  }
  return latest
}
