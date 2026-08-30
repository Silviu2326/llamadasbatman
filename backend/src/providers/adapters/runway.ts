import { registerProvider } from '../registry'
import type { ProviderCtx } from '../types'
import { getAssetDownloadUrl } from '../../services/assets.service'
import { fetchWithTimeout, responseErrorCode } from '../../lib/integrationRuntime'

/**
 * Runway API adapter.
 *
 * Contrato verificado contra la documentación oficial el 2026-08-18:
 * - POST /v1/text_to_video y /v1/image_to_video crean un task asíncrono.
 * - GET /v1/tasks/:id es el mecanismo oficial de seguimiento; Runway pide no
 *   consultar más de una vez cada cinco segundos.
 * - X-Runway-Version debe ser 2024-11-06.
 * - gen4.5 admite 2-10 s y cuesta 12 créditos/s; cada crédito cuesta USD 0.01.
 *
 * Runway no documenta un webhook nativo. El polling es por tanto el camino
 * canónico. La ruta firmada /webhooks/providers/runway del backend solo sirve
 * para un gateway gestionado explícitamente por Vendrava, nunca se anuncia
 * como funcionalidad nativa del proveedor.
 *
 * Fuentes primarias:
 * https://docs.dev.runwayml.com/api/
 * https://docs.dev.runwayml.com/guides/pricing/
 * https://docs.dev.runwayml.com/api-details/sdks/
 */

export const RUNWAY_PROVIDER_ID = 'runway'
export const RUNWAY_API_VERSION = '2024-11-06'
export const RUNWAY_MODEL = 'gen4.5'
export const RUNWAY_RATE_VERSION = 'runway-2026-08-18'
const RUNWAY_API_BASE = 'https://api.dev.runwayml.com'
const REQUEST_TIMEOUT_MS = 45_000
const GEN45_CENTS_PER_SECOND = 12

export interface RunwayTaskSnapshot {
  providerJobId: string
  state: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'
  outputUrls: string[]
  progress?: number
  failure?: string
}

function apiKey(ctx: ProviderCtx): string {
  const value = ctx.secret?.apiKey?.trim() || process.env.RUNWAYML_API_SECRET?.trim()
  if (!value) throw new Error('Falta la credencial de Runway')
  return value
}

function runwayHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': RUNWAY_API_VERSION,
  }
}

async function runwayRequest(path: string, key: string, init?: RequestInit): Promise<unknown> {
  const response = await fetchWithTimeout(
    `${RUNWAY_API_BASE}${path}`,
    { ...init, headers: { ...runwayHeaders(key), ...(init?.headers ?? {}) } },
    REQUEST_TIMEOUT_MS,
  )
  if (!response.ok) throw new Error(`Runway rechazó la solicitud (${await responseErrorCode(response)})`)
  if (response.status === 204) return null
  return response.json()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function parseRunwayTask(value: unknown): RunwayTaskSnapshot {
  const body = record(value)
  const providerJobId = typeof body.id === 'string'
    ? body.id
    : typeof body.taskId === 'string'
      ? body.taskId
      : ''
  const raw = String(body.status ?? body.state ?? 'PENDING').toUpperCase()
  const state: RunwayTaskSnapshot['state'] = raw === 'SUCCEEDED'
    ? 'succeeded'
    : raw === 'FAILED'
      ? 'failed'
      : raw === 'CANCELED' || raw === 'CANCELLED'
        ? 'canceled'
        : raw === 'RUNNING' || raw === 'THROTTLED'
          ? 'running'
          : 'pending'
  const outputUrls = Array.isArray(body.output)
    ? body.output.filter((item): item is string => typeof item === 'string' && item.startsWith('https://'))
    : typeof body.output === 'string' && body.output.startsWith('https://')
      ? [body.output]
      : []
  const progressNumber = Number(body.progress)
  const failure = typeof body.failure === 'string'
    ? body.failure
    : typeof body.failureCode === 'string'
      ? body.failureCode
      : undefined
  return {
    providerJobId,
    state,
    outputUrls,
    ...(Number.isFinite(progressNumber) ? { progress: Math.max(0, Math.min(100, Math.round(progressNumber * (progressNumber <= 1 ? 100 : 1)))) } : {}),
    ...(failure ? { failure } : {}),
  }
}

export async function getRunwayTask(apiKeyValue: string, providerJobId: string): Promise<RunwayTaskSnapshot> {
  const payload = await runwayRequest(`/v1/tasks/${encodeURIComponent(providerJobId)}`, apiKeyValue)
  return parseRunwayTask(payload)
}

/**
 * DELETE /v1/tasks/:id es el endpoint oficial de cancelación. Runway declara
 * 404 idempotente para tasks ya abortados/eliminados, por lo que también se
 * considera confirmado. No se confunde con AbortSignal: abortar el polling no
 * cancela el trabajo remoto.
 */
export async function cancelRunwayTask(apiKeyValue: string, providerJobId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${RUNWAY_API_BASE}/v1/tasks/${encodeURIComponent(providerJobId)}`,
    { method: 'DELETE', headers: runwayHeaders(apiKeyValue) },
    REQUEST_TIMEOUT_MS,
  )
  if (response.ok || response.status === 404) return
  throw new Error(`Runway rechazó la cancelación (${await responseErrorCode(response)})`)
}

async function resolveReferenceUrl(orgId: string, refAssetIds: string[] | undefined): Promise<string | undefined> {
  const first = refAssetIds?.[0]
  if (!first) return undefined
  const download = await getAssetDownloadUrl({ orgId, id: first, ttlSeconds: 60 * 60 })
  if (!download) throw new Error('La referencia visual no existe en esta organización')
  if (download.requiresAuth || !download.url.startsWith('https://')) {
    throw new Error('Runway necesita una URL HTTPS temporal; configura S3/R2 para usar referencias visuales')
  }
  return download.url
}

async function resolveAssetUrl(orgId: string, assetId: string): Promise<string> {
  const download = await getAssetDownloadUrl({ orgId, id: assetId, ttlSeconds: 60 * 60 })
  if (!download) throw new Error('El vídeo no existe en esta organización')
  if (download.requiresAuth || !download.url.startsWith('https://')) {
    throw new Error('Runway necesita una URL HTTPS temporal; configura S3/R2 para mejorar vídeo')
  }
  return download.url
}

function ratio(value: unknown): '1280:720' | '720:1280' {
  return value === '9:16' ? '720:1280' : '1280:720'
}

registerProvider({
  id: RUNWAY_PROVIDER_ID,
  displayName: 'Runway',
  auth: {
    modes: ['managed', 'byok'],
    byokFields: [{ key: 'apiKey', label: 'API secret de Runway', kind: 'secret', required: true }],
    async testConnection(secret) {
      try {
        await runwayRequest('/v1/organization', secret.apiKey?.trim() ?? '', { method: 'GET' })
        return { ok: true, message: 'Cuenta de Runway conectada' }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'No se pudo conectar con Runway' }
      }
    },
  },
  commercialUseAllowed: true,
  tosReviewedAt: '2026-08-18',
  docsUrl: 'https://docs.dev.runwayml.com/api/',
  capabilities: [{
    capability: 'video.generate',
    models: [RUNWAY_MODEL],
    qualityTier: 'premium',
    limits: { concurrent: 5, maxDurationS: 10 },
    async estimateCost(input) {
      const durationS = Number(record(input).durationS ?? 5)
      return { cents: Math.max(2, Math.min(10, durationS)) * GEN45_CENTS_PER_SECOND, confidence: 'exact' }
    },
    async execute(ctx, input) {
      const body = record(input)
      const duration = Math.max(2, Math.min(10, Math.round(Number(body.durationS ?? 5))))
      const promptText = String(body.prompt ?? '').trim().slice(0, 1000)
      const promptImage = await resolveReferenceUrl(
        ctx.orgId,
        Array.isArray(body.refAssetIds) ? body.refAssetIds.filter((id): id is string => typeof id === 'string') : undefined,
      )
      const endpoint = promptImage ? '/v1/image_to_video' : '/v1/text_to_video'
      const payload = await runwayRequest(endpoint, apiKey(ctx), {
        method: 'POST',
        body: JSON.stringify({
          model: RUNWAY_MODEL,
          promptText,
          ratio: ratio(body.aspectRatio),
          duration,
          ...(promptImage ? { promptImage } : {}),
        }),
      })
      const providerJobId = String(record(payload).id ?? '')
      if (!providerJobId) throw new Error('Runway no devolvió id de task')
      return { pending: true, providerJobId }
    },
  }, {
    capability: 'video.upscale',
    models: ['magnific_video_upscaler_creative'],
    qualityTier: 'premium',
    limits: { concurrent: 3, maxDurationS: 30 },
    async estimateCost(input) {
      const body = record(input)
      const durationS = Math.max(0.1, Math.min(30, Number(body.durationS ?? 1)))
      const fps = Math.max(1, Math.min(60, Number(body.fps ?? 30)))
      const centsPerFrame = body.resolution === '4k' ? 1.2 : body.resolution === '2k' ? 0.9 : 0.7
      return { cents: Math.max(1, durationS * fps * centsPerFrame), confidence: 'exact' }
    },
    async execute(ctx, input) {
      const body = record(input)
      const assetId = String(body.assetId ?? '')
      const videoUri = await resolveAssetUrl(ctx.orgId, assetId)
      const resolution = body.resolution === '720p' || body.resolution === '1k' || body.resolution === '4k' ? body.resolution : '2k'
      const payload = await runwayRequest('/v1/video_upscale', apiKey(ctx), {
        method: 'POST',
        body: JSON.stringify({ model: 'magnific_video_upscaler_creative', videoUri, resolution }),
      })
      const providerJobId = String(record(payload).id ?? '')
      if (!providerJobId) throw new Error('Runway no devolvió id de task de upscale')
      return { pending: true, providerJobId }
    },
  }],
})
