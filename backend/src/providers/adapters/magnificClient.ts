// Cliente HTTP mínimo de Magnific (upscale de imagen). TODO el conocimiento
// del API de Magnific vive en este archivo: endpoints, nombres de campos y
// formas de payload. Si Magnific cambia algo, se corrige aquí y solo aquí.
//
// HECHOS VERIFICADOS en https://docs.magnific.com (consultada 2026-08-18):
//   - Base: https://api.magnific.com/v1 — autenticación por cabecera
//     `x-magnific-api-key` (docs.magnific.com/authentication).
//   - Upscaler creativo: POST /v1/ai/image-upscaler
//     (docs.magnific.com/api-reference/image-upscaler-creative/image-upscaler).
//   - Upscaler de precisión (fiel): POST /v1/ai/image-upscaler-precision
//     (docs.magnific.com/api-reference/image-upscaler-precision/image-upscaler).
//   - Webhooks asíncronos con firma HMAC-SHA256 estilo Standard Webhooks:
//     cabeceras `webhook-id`, `webhook-timestamp`, `webhook-signature`
//     (docs.magnific.com/webhooks). La verificación vive en
//     src/routes/providerWebhooks.ts porque necesita el raw body de Fastify.
//
// SUPUESTO API: la doc pública no expone el esquema exacto de cuerpo ni de
// respuesta. Estos puntos son suposiciones razonadas (siguen el patrón de la
// familia de APIs Freepik/Magnific) y están marcados uno a uno más abajo:
//   1. Cuerpo del submit: { image, scale_factor: "2x"|..., prompt?, webhook_url }.
//   2. Respuesta del submit: task_id/status en la raíz o bajo `data`.
//   3. Estado por polling: GET {endpoint-de-submit}/{task-id}.
//   4. Resultado terminado: array `generated` de URLs (o result.url).
//   5. No hay endpoint barato documentado de validación de clave: se valida
//      consultando un task inexistente y distinguiendo 401/403 de 404.
// La clave de API jamás se loguea ni viaja en mensajes de error: todos los
// errores salientes pasan por redactProviderError.
import { fetchWithTimeout, redactProviderError, responseErrorCode } from '../../lib/integrationRuntime'

const BASE_URL = 'https://api.magnific.com/v1'
const SUBMIT_TIMEOUT_MS = 30_000
const STATUS_TIMEOUT_MS = 15_000

export type MagnificUpscaleMode = 'faithful' | 'creative' | 'relight' | 'restore'

// SUPUESTO API (1): 'faithful' y 'restore' van al upscaler de precisión;
// 'creative' y 'relight' al creativo (que acepta prompt de guía). Magnific
// documenta ambos productos pero no un modo "relight" separado en el API.
function endpointPathForMode(mode: MagnificUpscaleMode): string {
  return mode === 'faithful' || mode === 'restore'
    ? '/ai/image-upscaler-precision'
    : '/ai/image-upscaler'
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'x-magnific-api-key': apiKey,
    'content-type': 'application/json',
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export interface SubmitUpscaleParams {
  apiKey: string
  /** URL descargable por Magnific (prefirmada de nuestro almacenamiento). */
  imageUrl: string
  mode: MagnificUpscaleMode
  scale: number
  prompt?: string
  webhookUrl: string
}

export interface SubmitUpscaleResult {
  providerJobId: string
  estimatedCostCents?: number
}

export type MagnificTaskState = 'running' | 'succeeded' | 'failed'

export interface MagnificTaskSnapshot {
  providerJobId?: string
  state: MagnificTaskState
  /** URL de la imagen resultante cuando state === 'succeeded'. */
  resultUrl?: string
  /** Mensaje de fallo YA redactado, apto para persistir en Job.error. */
  errorMessage?: string
  /** Coste real en céntimos si el payload lo trae (SUPUESTO API: cost_cents). */
  costCents?: number
}

function extractCostCents(data: Record<string, unknown>): number | undefined {
  const raw = data.cost_cents ?? data.costCents
  const value = Number(raw)
  return raw != null && Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * Normaliza el estado textual del task. SUPUESTO API (4): valores tipo
 * CREATED/IN_PROGRESS/COMPLETED/FAILED. Cualquier estado desconocido se trata
 * como "sigue corriendo" — el polling de respaldo volverá a preguntar en vez
 * de cerrar un job en falso.
 */
function normalizeState(raw: unknown): MagnificTaskState {
  const value = String(raw ?? '').toLowerCase()
  if (['completed', 'complete', 'succeeded', 'success', 'done', 'finished'].includes(value)) return 'succeeded'
  if (['failed', 'failure', 'error', 'canceled', 'cancelled', 'rejected'].includes(value)) return 'failed'
  return 'running'
}

function firstUrl(value: unknown): string | undefined {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstUrl(item)
      if (url) return url
    }
    return undefined
  }
  const record = asRecord(value)
  if (record) return firstUrl(record.url) ?? firstUrl(record.image) ?? firstUrl(record.src)
  return undefined
}

/**
 * Interpreta un payload de task de Magnific — tanto la respuesta del GET de
 * estado como el cuerpo del webhook (SUPUESTO API (2)(4): mismo documento en
 * ambos, en la raíz o envuelto en `data`). Exportado para que el webhook no
 * duplique conocimiento del API fuera de este módulo.
 */
export function parseMagnificTaskPayload(payload: unknown): MagnificTaskSnapshot {
  const root = asRecord(payload) ?? {}
  const data = asRecord(root.data) ?? root
  const providerJobIdRaw = data.task_id ?? data.taskId ?? data.id ?? root.task_id
  const providerJobId = providerJobIdRaw == null ? undefined : String(providerJobIdRaw)
  const state = normalizeState(data.status ?? data.state ?? root.status)
  const costCents = extractCostCents(data)

  if (state === 'failed') {
    const detail = data.error ?? data.message ?? root.error ?? 'Magnific reported a failed task'
    return { providerJobId, state, costCents, errorMessage: redactProviderError(typeof detail === 'string' ? detail : JSON.stringify(detail)) }
  }
  if (state === 'succeeded') {
    const resultUrl = firstUrl(data.generated) ?? firstUrl(data.result) ?? firstUrl(data.output) ?? firstUrl(data.url) ?? firstUrl(data.images)
    if (!resultUrl) {
      // Terminado sin URL utilizable: mejor fallar con contexto que colgar el job.
      return { providerJobId, state: 'failed', costCents, errorMessage: 'Magnific task completed without a downloadable result URL' }
    }
    return { providerJobId, state, resultUrl, costCents }
  }
  return { providerJobId, state, costCents }
}

/**
 * Envía un upscale asíncrono. SUPUESTO API (1)(2): el cuerpo usa `image` (URL),
 * `scale_factor` con sufijo "x" ("2x", "4x"...), `prompt` opcional y
 * `webhook_url` por petición; la respuesta trae `task_id`. La doc de webhooks
 * habla de "registrar una URL", así que si el campo por petición no existiera,
 * el fallback operativo es registrar la URL del webhook en el panel de
 * Magnific — el endpoint receptor es el mismo.
 */
export async function submitUpscale(params: SubmitUpscaleParams): Promise<SubmitUpscaleResult> {
  const body: Record<string, unknown> = {
    image: params.imageUrl,
    scale_factor: `${params.scale}x`,
    webhook_url: params.webhookUrl,
  }
  if (params.prompt) body.prompt = params.prompt

  let response: Response
  try {
    response = await fetchWithTimeout(
      `${BASE_URL}${endpointPathForMode(params.mode)}`,
      { method: 'POST', headers: authHeaders(params.apiKey), body: JSON.stringify(body) },
      SUBMIT_TIMEOUT_MS,
    )
  } catch (error) {
    throw new Error(`Magnific submit failed: ${redactProviderError(error)}`)
  }
  if (!response.ok) {
    throw new Error(`Magnific submit failed (${await responseErrorCode(response)})`)
  }

  const payload: unknown = await response.json().catch(() => null)
  const snapshot = parseMagnificTaskPayload(payload)
  if (!snapshot.providerJobId) {
    throw new Error('Magnific submit succeeded but returned no task_id')
  }
  return { providerJobId: snapshot.providerJobId }
}

export interface GetJobStatusParams {
  apiKey: string
  providerJobId: string
  /** Si se conoce, ahorra el segundo intento de endpoint. */
  mode?: MagnificUpscaleMode
}

/**
 * Estado por polling (respaldo del webhook). SUPUESTO API (3): el GET de
 * estado es {endpoint-de-submit}/{task-id}, igual que los productos de
 * Magnific que sí lo documentan (p. ej. GET /v1/ai/mystic/{task-id}). Como el
 * Job solo guarda el task-id, sin el modo se prueban ambas familias y un 404
 * en la primera solo significa "prueba la otra".
 */
export async function getJobStatus(params: GetJobStatusParams): Promise<MagnificTaskSnapshot> {
  const paths = params.mode
    ? [endpointPathForMode(params.mode)]
    : ['/ai/image-upscaler', '/ai/image-upscaler-precision']

  let lastError: string | null = null
  for (const path of paths) {
    let response: Response
    try {
      response = await fetchWithTimeout(
        `${BASE_URL}${path}/${encodeURIComponent(params.providerJobId)}`,
        { method: 'GET', headers: authHeaders(params.apiKey) },
        STATUS_TIMEOUT_MS,
      )
    } catch (error) {
      lastError = redactProviderError(error)
      continue
    }
    if (response.status === 404) {
      lastError = `task not found under ${path}`
      continue
    }
    if (!response.ok) {
      lastError = await responseErrorCode(response)
      continue
    }
    const payload: unknown = await response.json().catch(() => null)
    return parseMagnificTaskPayload(payload)
  }
  throw new Error(`Magnific status check failed: ${lastError ?? 'unknown error'}`)
}

/**
 * Validación barata de una clave para testConnection. SUPUESTO API (5): no hay
 * endpoint de "whoami" documentado, así que se consulta un task inexistente:
 * 401/403 ⇒ clave rechazada; cualquier otra respuesta (404 incluido) ⇒ la
 * clave fue aceptada por el API. No consume créditos.
 */
export async function validateApiKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}/ai/image-upscaler/00000000-0000-0000-0000-000000000000`,
      { method: 'GET', headers: authHeaders(apiKey) },
      STATUS_TIMEOUT_MS,
    )
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'Magnific rechazó la API key (401/403)' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: `No se pudo contactar con Magnific: ${redactProviderError(error)}` }
  }
}
