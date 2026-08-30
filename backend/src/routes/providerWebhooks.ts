// Webhooks entrantes de proveedores asíncronos de la plataforma abierta
// (docs/plataforma-abierta/03-PROVEEDORES.md §5). El integrador monta este
// plugin en /api/webhooks/providers; aquí solo se definen las rutas relativas.
//
// Verificación del webhook de Magnific, en dos capas:
//   1. Token compartido en query (?token=...) contra MAGNIFIC_WEBHOOK_TOKEN —
//      obligatorio siempre; la URL con token la genera el adapter al hacer
//      submit y solo la conoce Magnific.
//   2. Firma HMAC nativa si MAGNIFIC_WEBHOOK_SIGNING_SECRET está configurado:
//      Magnific firma estilo Standard Webhooks (docs.magnific.com/webhooks)
//      con cabeceras webhook-id / webhook-timestamp / webhook-signature y
//      HMAC-SHA256 en base64 sobre "id.timestamp.rawBody". El secreto se
//      obtiene al registrar el endpoint en el panel de Magnific; mientras no
//      esté configurado, la capa 1 sigue siendo el control de acceso.
import type { FastifyInstance } from 'fastify'
import type { Job } from '@prisma/client'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { assertSafeOutboundUrl, fetchWithTimeout, readResponseBufferLimited, redactProviderError, responseErrorCode } from '../lib/integrationRuntime'
import { completeProviderJob, confirmProviderJobCanceled } from '../services/jobs.service'
import { createAssetVersion } from '../services/assets.service'
import { recordUsage } from '../lib/usage'
import { createAssetFromBuffer } from '../services/assets.service'
import { beginWebhookEvent, finishWebhookEvent } from '../observability/webhookLifecycle'
import { resolveProviderCredential } from '../providers/credentials'
import { getJobStatus, parseMagnificTaskPayload, type MagnificTaskSnapshot, type MagnificUpscaleMode } from '../providers/adapters/magnificClient'
import {
  getRunwayTask,
  parseRunwayTask,
  RUNWAY_MODEL,
  RUNWAY_PROVIDER_ID,
  RUNWAY_RATE_VERSION,
  type RunwayTaskSnapshot,
} from '../providers/adapters/runway'

const MAGNIFIC_PROVIDER = 'magnific'
const RESULT_DOWNLOAD_TIMEOUT_MS = 60_000
// El resultado de un upscale x16 puede pesar; por encima de esto algo va mal.
const MAX_RESULT_BYTES = 100 * 1024 * 1024
const USAGE_RATE_VERSION = '2026-08'
// El polling de respaldo solo mira jobs con más de 10 min corriendo: antes de
// eso el webhook sigue siendo el camino esperado.
const POLL_MIN_AGE_MS = 10 * 60 * 1000
const RUNWAY_RESULT_MAX_BYTES = Math.max(1, Number(process.env.RUNWAY_RESULT_MAX_BYTES ?? 500 * 1024 * 1024))
const RUNWAY_POLL_MIN_AGE_MS = Math.max(5_000, Number(process.env.RUNWAY_POLL_MIN_AGE_MS ?? 15_000))

/** Comparación en tiempo constante sin filtrar longitudes (se comparan hashes). */
function tokenMatches(supplied: string | undefined, expected: string | undefined): boolean {
  if (!supplied || !expected) return false
  return timingSafeEqual(
    createHash('sha256').update(supplied).digest(),
    createHash('sha256').update(expected).digest(),
  )
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Firma HMAC de Magnific (Standard Webhooks). Devuelve null si no hay secreto
 * configurado (capa opcional), true/false si se pudo verificar.
 */
function signatureMatches(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean | null {
  const secret = process.env.MAGNIFIC_WEBHOOK_SIGNING_SECRET?.trim()
  if (!secret) return null

  const id = headerValue(headers['webhook-id'])
  const timestamp = headerValue(headers['webhook-timestamp'])
  const signatureHeader = headerValue(headers['webhook-signature'])
  if (!id || !timestamp || !signatureHeader) return false

  // Ventana anti-replay de 5 minutos, como pide la doc de Magnific.
  const skewSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(skewSeconds) || skewSeconds > 300) return false

  // Convención Standard Webhooks: el secreto puede venir como "whsec_<base64>".
  const key = secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret, 'utf8')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')
  const expectedBuffer = Buffer.from(expected)

  // La cabecera puede traer varias firmas "v1,<base64>" separadas por espacio.
  return signatureHeader.split(' ').some(candidate => {
    const raw = candidate.includes(',') ? candidate.split(',')[1] : candidate
    if (!raw) return false
    const candidateBuffer = Buffer.from(raw)
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
  })
}

interface MagnificJobInput {
  assetId?: string
  mode?: MagnificUpscaleMode
  scale?: number
  billingMode?: 'managed' | 'byok'
}

interface RunwayJobInput {
  capability: 'video.generate' | 'video.upscale'
  prompt: string
  durationS: number
  refAssetIds: string[]
  assetId?: string
  model: string
  billingMode: 'managed' | 'byok'
}

function runwayJobInput(job: Job): RunwayJobInput {
  const root = job.input && typeof job.input === 'object' && !Array.isArray(job.input)
    ? job.input as Record<string, unknown>
    : {}
  const payload = root.payload && typeof root.payload === 'object' && !Array.isArray(root.payload)
    ? root.payload as Record<string, unknown>
    : root
  const routing = root._routing && typeof root._routing === 'object' && !Array.isArray(root._routing)
    ? root._routing as Record<string, unknown>
    : {}
  const duration = Number(payload.durationS ?? 5)
  const capability = job.kind === 'video.upscale' ? 'video.upscale' : 'video.generate'
  return {
    capability,
    prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
    durationS: Number.isFinite(duration)
      ? Math.max(capability === 'video.upscale' ? 0.1 : 2, Math.min(capability === 'video.upscale' ? 30 : 10, duration))
      : 5,
    refAssetIds: Array.isArray(payload.refAssetIds)
      ? payload.refAssetIds.filter((id): id is string => typeof id === 'string')
      : [],
    ...(typeof payload.assetId === 'string' ? { assetId: payload.assetId } : {}),
    model: job.kind === 'video.upscale' ? 'magnific_video_upscaler_creative' : RUNWAY_MODEL,
    billingMode: routing.billingMode === 'byok' ? 'byok' : 'managed',
  }
}

async function closeRunwayJobWithResult(job: Job, snapshot: RunwayTaskSnapshot): Promise<void> {
  if (!job.providerJobId || !snapshot.outputUrls[0]) return
  const resultUrl = await assertSafeOutboundUrl(snapshot.outputUrls[0])
  const response = await fetchWithTimeout(resultUrl, { method: 'GET' }, RESULT_DOWNLOAD_TIMEOUT_MS)
  if (!response.ok) throw new Error(`No se pudo descargar el resultado de Runway (${await responseErrorCode(response)})`)
  const buffer = await readResponseBufferLimited(response, RUNWAY_RESULT_MAX_BYTES, RESULT_DOWNLOAD_TIMEOUT_MS)
  if (!buffer.length || buffer.length > RUNWAY_RESULT_MAX_BYTES) {
    throw new Error(`Resultado de Runway con tamaño inválido (${buffer.length} bytes)`)
  }
  const details = runwayJobInput(job)
  const costCents = job.costEstimateCents == null ? details.durationS * 12 : Number(job.costEstimateCents)
  const asset = await createAssetFromBuffer({
    orgId: job.orgId,
    buffer,
    filename: `runway-${job.providerJobId}.mp4`,
    kind: 'video',
    mimeType: 'video/mp4',
    provider: RUNWAY_PROVIDER_ID,
    model: details.model,
    prompt: details.prompt,
    params: { durationS: details.durationS, providerJobId: job.providerJobId, capability: details.capability },
    costCents,
    jobId: job.id,
    sourceAssets: [
      ...details.refAssetIds.map(id => ({ id, role: 'reference' })),
      ...(details.assetId ? [{ id: details.assetId, role: 'upscale_of' }] : []),
    ],
  })
  await recordUsage({
    orgId: job.orgId,
    provider: RUNWAY_PROVIDER_ID,
    capability: details.capability,
    quantity: details.durationS,
    unit: 'seconds',
    costCents: details.billingMode === 'byok' ? 0 : costCents,
    billingMode: details.billingMode,
    jobId: job.id,
    rateVersion: RUNWAY_RATE_VERSION,
    idempotencyKey: `runway:${job.providerJobId}:${details.capability}`,
    meta: { model: details.model, providerJobId: job.providerJobId },
  })
  await completeProviderJob({
    provider: RUNWAY_PROVIDER_ID,
    providerJobId: job.providerJobId,
    output: { assetIds: [asset.id] },
    costActualCents: costCents,
  })
}

async function applyRunwaySnapshot(job: Job, snapshot: RunwayTaskSnapshot): Promise<'closed' | 'pending'> {
  if (!job.providerJobId) return 'pending'
  if (snapshot.state === 'canceled' && job.status === 'cancel_requested') {
    await confirmProviderJobCanceled(RUNWAY_PROVIDER_ID, job.providerJobId)
    return 'closed'
  }
  if (snapshot.state === 'failed' || snapshot.state === 'canceled') {
    await completeProviderJob({
      provider: RUNWAY_PROVIDER_ID,
      providerJobId: job.providerJobId,
      error: {
        code: snapshot.state === 'canceled' ? 'RUNWAY_TASK_CANCELED' : 'RUNWAY_TASK_FAILED',
        message: snapshot.failure ?? `Runway informó estado ${snapshot.state}`,
      },
    })
    return 'closed'
  }
  if (snapshot.state === 'succeeded' && snapshot.outputUrls[0]) {
    await closeRunwayJobWithResult(job, snapshot)
    return 'closed'
  }
  await prisma.job.updateMany({
    where: { id: job.id, status: { in: ['waiting_provider', 'cancel_requested'] } },
    data: {
      nextPollAt: new Date(Date.now() + RUNWAY_POLL_MIN_AGE_MS),
      ...(snapshot.progress !== undefined ? { progress: snapshot.progress } : {}),
    },
  })
  return 'pending'
}

export async function pollPendingRunwayJobs(): Promise<{ checked: number; closed: number; failed: number }> {
  const jobs = await prisma.job.findMany({
    where: {
      provider: RUNWAY_PROVIDER_ID,
      status: { in: ['waiting_provider', 'cancel_requested'] },
      providerJobId: { not: null },
      submittedAt: { lt: new Date(Date.now() - RUNWAY_POLL_MIN_AGE_MS) },
      OR: [{ nextPollAt: null }, { nextPollAt: { lte: new Date() } }],
    },
    orderBy: { submittedAt: 'asc' },
    take: 25,
  })
  let closed = 0
  let failed = 0
  for (const job of jobs) {
    if (!job.providerJobId) continue
    try {
      const credential = await resolveProviderCredential(job.orgId, RUNWAY_PROVIDER_ID)
      const key = credential?.secret?.apiKey?.trim() || process.env.RUNWAYML_API_SECRET?.trim()
      if (!key) continue
      const snapshot = await getRunwayTask(key, job.providerJobId)
      if (await applyRunwaySnapshot(job, snapshot) === 'closed') closed += 1
    } catch (error) {
      failed += 1
      console.warn('[RunwayPoll] no se pudo comprobar el job', { jobId: job.id, error: redactProviderError(error) })
      await prisma.job.updateMany({
        where: { id: job.id, status: { in: ['waiting_provider', 'cancel_requested'] } },
        data: { nextPollAt: new Date(Date.now() + Math.max(30_000, RUNWAY_POLL_MIN_AGE_MS * 2)) },
      }).catch(() => undefined)
    }
  }
  return { checked: jobs.length, closed, failed }
}

function runwayGatewaySignatureMatches(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
  const secret = process.env.RUNWAY_GATEWAY_WEBHOOK_SECRET?.trim()
  if (!secret) return false
  const timestamp = headerValue(headers['x-vendrava-timestamp'])
  const supplied = headerValue(headers['x-vendrava-signature'])?.replace(/^sha256=/, '')
  if (!timestamp || !supplied) return false
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const left = Buffer.from(expected)
  const right = Buffer.from(supplied)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Lee del propio Job lo que el cierre necesita: el input de la capability
 * (assetId/mode/scale) y la decisión del router persistida en `_routing`
 * (billingMode). Tolerante a forma: un job antiguo sin `_routing` cae a
 * 'managed' solo si tampoco puede saberse otra cosa.
 */
function magnificJobInput(job: Job): MagnificJobInput {
  const input = job.input && typeof job.input === 'object' && !Array.isArray(job.input)
    ? job.input as Record<string, unknown>
    : {}
  const routing = input._routing && typeof input._routing === 'object' && !Array.isArray(input._routing)
    ? input._routing as Record<string, unknown>
    : {}
  const billingMode = routing.billingMode === 'byok' || routing.billingMode === 'managed'
    ? routing.billingMode
    : undefined
  const mode = input.mode === 'faithful' || input.mode === 'creative' || input.mode === 'relight' || input.mode === 'restore'
    ? input.mode
    : undefined
  const scale = Number(input.scale)
  return {
    assetId: typeof input.assetId === 'string' ? input.assetId : undefined,
    mode,
    scale: Number.isFinite(scale) && scale > 0 ? scale : undefined,
    billingMode,
  }
}

/**
 * Materializa el resultado y cierra el job: descarga la imagen (con las
 * defensas SSRF de integrationRuntime — la URL viene de un tercero), crea la
 * AssetVersion sobre el asset de origen, apunta el consumo en el ledger y
 * recién entonces llama a completeProviderJob.
 *
 * Idempotencia: la barrera real es el UPDATE condicional sobre 'running' de
 * completeProviderJob. Dos avisos simultáneos podrían llegar a descargar dos
 * veces, pero solo uno cierra el job; el coste de esa ventana es una versión
 * extra, nunca un doble cierre. Un reenvío posterior encuentra el job
 * terminado y sale por la vía rápida del caller.
 */
async function closeMagnificJobWithResult(job: Job, snapshot: MagnificTaskSnapshot): Promise<void> {
  const providerJobId = job.providerJobId
  if (!providerJobId || !snapshot.resultUrl) return

  const url = await assertSafeOutboundUrl(snapshot.resultUrl)
  const response = await fetchWithTimeout(url, { method: 'GET' }, RESULT_DOWNLOAD_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`No se pudo descargar el resultado de Magnific (${await responseErrorCode(response)})`)
  }
  const buffer = await readResponseBufferLimited(response, MAX_RESULT_BYTES, RESULT_DOWNLOAD_TIMEOUT_MS)
  if (!buffer.length || buffer.length > MAX_RESULT_BYTES) {
    throw new Error(`Resultado de Magnific con tamaño inválido (${buffer.length} bytes)`)
  }

  const input = magnificJobInput(job)
  if (!input.assetId) {
    await completeProviderJob({
      provider: MAGNIFIC_PROVIDER,
      providerJobId,
      error: { code: 'SOURCE_ASSET_UNKNOWN', message: 'El job no conserva el assetId de origen' },
    })
    return
  }

  const costCents = snapshot.costCents ?? (job.costEstimateCents == null ? undefined : Number(job.costEstimateCents))
  const version = await createAssetVersion({
    orgId: job.orgId,
    assetId: input.assetId,
    buffer,
    label: 'upscaled-magnific',
    params: { mode: input.mode ?? null, scale: input.scale ?? null },
    costCents,
    idempotencyKey: `magnific:${providerJobId}:upscaled-version`,
  })
  if (!version) {
    // El asset de origen ya no existe en la org: no hay dónde colgar la versión.
    await completeProviderJob({
      provider: MAGNIFIC_PROVIDER,
      providerJobId,
      error: { code: 'SOURCE_ASSET_MISSING', message: `El asset de origen ${input.assetId} ya no existe` },
    })
    return
  }

  // El ledger registra siempre; el coste para Vendrava es 0 si la org puso su
  // propia clave (BYOK). recordUsage nunca lanza: un fallo del ledger no puede
  // dejar el job colgado.
  await recordUsage({
    orgId: job.orgId,
    provider: MAGNIFIC_PROVIDER,
    capability: 'image.upscale',
    quantity: 1,
    unit: 'images',
    costCents: input.billingMode === 'byok' ? 0 : costCents,
    billingMode: input.billingMode ?? 'managed',
    jobId: job.id,
    rateVersion: USAGE_RATE_VERSION,
    idempotencyKey: `magnific:${providerJobId}:image.upscale`,
  })

  await completeProviderJob({
    provider: MAGNIFIC_PROVIDER,
    providerJobId,
    output: { assetId: input.assetId, versionId: version.id },
    costActualCents: snapshot.costCents ?? undefined,
  })
}

/**
 * Polling de respaldo para cuando el webhook se pierde: jobs 'running' de
 * Magnific con más de 10 minutos se consultan por API y se cierran por el
 * mismo camino que el webhook. Pensado para que el integrador lo enganche a
 * su scheduler (no monta timers propios). Devuelve contadores para logs.
 */
export async function pollPendingMagnificJobs(): Promise<{ checked: number; closed: number; failed: number }> {
  const jobs = await prisma.job.findMany({
    where: {
      provider: MAGNIFIC_PROVIDER,
      status: { in: ['waiting_provider', 'cancel_requested'] },
      providerJobId: { not: null },
      submittedAt: { lt: new Date(Date.now() - POLL_MIN_AGE_MS) },
      OR: [{ nextPollAt: null }, { nextPollAt: { lte: new Date() } }],
    },
    orderBy: { submittedAt: 'asc' },
    take: 25,
  })

  let closed = 0
  let failed = 0
  for (const job of jobs) {
    if (!job.providerJobId) continue
    try {
      // Misma cadena de credencial que la ejecución: BYOK de la org primero,
      // clave gestionada global después.
      const credential = await resolveProviderCredential(job.orgId, MAGNIFIC_PROVIDER)
      const apiKey = credential?.secret?.apiKey?.trim() || process.env.MAGNIFIC_API_KEY?.trim()
      if (!apiKey) continue

      const snapshot = await getJobStatus({
        apiKey,
        providerJobId: job.providerJobId,
        mode: magnificJobInput(job).mode,
      })
      if (snapshot.state === 'failed') {
        await completeProviderJob({
          provider: MAGNIFIC_PROVIDER,
          providerJobId: job.providerJobId,
          error: { code: 'MAGNIFIC_TASK_FAILED', message: snapshot.errorMessage ?? 'Magnific reported a failed task' },
        })
        failed += 1
      } else if (snapshot.state === 'succeeded') {
        await closeMagnificJobWithResult(job, snapshot)
        closed += 1
      } else {
        await prisma.job.updateMany({
          where: { id: job.id, status: { in: ['waiting_provider', 'cancel_requested'] } },
          data: { nextPollAt: new Date(Date.now() + 5 * 60_000) },
        })
      }
      // 'running': se vuelve a mirar en la siguiente pasada.
    } catch (error) {
      // Un job que no se puede consultar no bloquea al resto de la pasada.
      console.warn('[MagnificPoll] no se pudo comprobar el job', {
        jobId: job.id,
        error: redactProviderError(error),
      })
    }
  }
  return { checked: jobs.length, closed, failed }
}

export async function providerWebhooksRoutes(app: FastifyInstance) {
  // Raw body para poder verificar la firma HMAC; el parser queda encapsulado
  // en este plugin (mismo patrón que mauticWebhooks.ts).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as any).rawBody = body
    try { done(null, JSON.parse(body as string)) } catch (error) { done(error as Error, undefined) }
  })

  app.post<{ Querystring: { token?: string } }>('/magnific', async (req, reply) => {
    // Capa 1: token compartido. Sin MAGNIFIC_WEBHOOK_TOKEN configurado se
    // rechaza todo (fail closed): un webhook sin autenticación no cierra jobs.
    if (!tokenMatches(req.query.token, process.env.MAGNIFIC_WEBHOOK_TOKEN?.trim())) {
      req.log.warn({ event: 'webhook.rejected', provider: MAGNIFIC_PROVIDER, errorCode: 'INVALID_TOKEN' }, 'Webhook rechazado')
      return reply.status(403).send({ error: 'Invalid token' })
    }

    // Capa 2: firma HMAC nativa, solo si hay secreto configurado.
    const rawBody = (req as any).rawBody as string | undefined
    const signatureOk = signatureMatches(rawBody ?? '', req.headers)
    if (signatureOk === false) {
      req.log.warn({ event: 'webhook.rejected', provider: MAGNIFIC_PROVIDER, errorCode: 'INVALID_SIGNATURE' }, 'Webhook rechazado')
      return reply.status(403).send({ error: 'Invalid signature' })
    }

    const snapshot = parseMagnificTaskPayload(req.body)
    if (!snapshot.providerJobId) {
      return reply.status(400).send({ error: 'Missing task id' })
    }

    // Barrera ANTES de consultar/materializar. La identidad nativa manda; el
    // fallback conserva compatibilidad con callbacks antiguos sin webhook-id.
    const nativeEventId = headerValue(req.headers['webhook-id'])
    const timestampRaw = headerValue(req.headers['webhook-timestamp'])
    const parsedTimestamp = timestampRaw && Number.isFinite(Number(timestampRaw))
      ? new Date(Number(timestampRaw) * 1000)
      : undefined
    const inbox = await beginWebhookEvent({
      provider: MAGNIFIC_PROVIDER,
      channel: 'image.upscale',
      externalEventId: nativeEventId ?? `${snapshot.providerJobId}:${createHash('sha256').update(rawBody ?? '').digest('hex')}`,
      rawBody: rawBody ?? '',
      correlationId: req.correlationId,
      providerJobId: snapshot.providerJobId,
      eventTimestamp: parsedTimestamp,
      eventType: `task.${snapshot.state}`,
      signatureValid: signatureOk === true,
      signatureVersion: signatureOk === true ? 'standard-webhooks-hmac-sha256' : 'shared-token-legacy',
    })
    if (!inbox.claimed) {
      return reply.status(200).send({ ok: true, duplicate: true, inFlight: inbox.inFlight, deadLetter: inbox.deadLetter })
    }

    const job = await prisma.job.findFirst({
      where: { provider: MAGNIFIC_PROVIDER, providerJobId: snapshot.providerJobId },
    })
    // Job desconocido o ya cerrado: 200 sin efectos. Los proveedores reenvían
    // webhooks y un 4xx/5xx aquí solo provocaría más reintentos inútiles.
    if (!job) {
      await finishWebhookEvent({ id: inbox.id, provider: MAGNIFIC_PROVIDER, channel: 'image.upscale', success: true, correlationId: req.correlationId })
      return reply.status(200).send({ ok: true, unknown: true })
    }
    if (!['waiting_provider', 'cancel_requested'].includes(job.status)) {
      await finishWebhookEvent({ id: inbox.id, provider: MAGNIFIC_PROVIDER, channel: 'image.upscale', success: true, correlationId: req.correlationId })
      return reply.status(200).send({ ok: true, duplicate: true })
    }

    if (snapshot.state === 'failed') {
      await completeProviderJob({
        provider: MAGNIFIC_PROVIDER,
        providerJobId: snapshot.providerJobId,
        error: { code: 'MAGNIFIC_TASK_FAILED', message: snapshot.errorMessage ?? 'Magnific reported a failed task' },
      })
      await finishWebhookEvent({ id: inbox.id, provider: MAGNIFIC_PROVIDER, channel: 'image.upscale', success: true, correlationId: req.correlationId })
      return reply.status(200).send({ ok: true })
    }

    // Aviso de progreso sin resultado: nada que materializar todavía.
    if (snapshot.state !== 'succeeded') {
      await finishWebhookEvent({ id: inbox.id, provider: MAGNIFIC_PROVIDER, channel: 'image.upscale', success: true, correlationId: req.correlationId })
      return reply.status(200).send({ ok: true, pending: true })
    }

    // Responder rápido: descargar/materializar puede tardar decenas de
    // segundos. Si el proceso cae, nextPollAt conserva el polling como red de
    // seguridad. AssetVersion y UsageRecord tienen claves idempotentes, por lo
    // que webhook y polling pueden competir sin duplicar efectos.
    void closeMagnificJobWithResult(job, snapshot).then(async () => {
      await finishWebhookEvent({ id: inbox.id, provider: MAGNIFIC_PROVIDER, channel: 'image.upscale', success: true, correlationId: req.correlationId })
    }).catch(async error => {
      await finishWebhookEvent({ id: inbox.id, provider: MAGNIFIC_PROVIDER, channel: 'image.upscale', success: false, error, correlationId: req.correlationId }).catch(() => undefined)
      req.log.warn(
        { event: 'webhook.failed', provider: MAGNIFIC_PROVIDER, jobId: job.id, error: redactProviderError(error) },
        'No se pudo materializar el resultado; lo recuperará el polling',
      )
    })
    return reply.status(202).send({ ok: true, accepted: true })
  })

  /**
   * Callback de un gateway propio, no webhook nativo de Runway. Runway
   * documenta polling de GET /v1/tasks/:id; esta entrada permite que una
   * infraestructura gestionada acelere el cierre sin alterar la semántica.
   * Firma/timestamp se verifican ANTES de reclamar el inbox durable.
   */
  app.post('/runway', async (req, reply) => {
    const rawBody = (req as any).rawBody as string | undefined
    if (!rawBody || !runwayGatewaySignatureMatches(rawBody, req.headers)) {
      req.log.warn({ event: 'webhook.rejected', provider: RUNWAY_PROVIDER_ID, errorCode: 'INVALID_SIGNATURE' }, 'Webhook rechazado')
      return reply.status(403).send({ error: 'Invalid signature' })
    }
    const snapshot = parseRunwayTask(req.body)
    if (!snapshot.providerJobId) return reply.status(400).send({ error: 'Missing task id' })
    const eventId = headerValue(req.headers['x-vendrava-event-id'])
      ?? `${snapshot.providerJobId}:${snapshot.state}:${snapshot.progress ?? 'none'}`
    const lifecycle = await beginWebhookEvent({
      provider: RUNWAY_PROVIDER_ID,
      channel: 'managed-gateway',
      externalEventId: eventId,
      eventType: `task.${snapshot.state}`,
      correlationId: req.correlationId,
      rawBody,
      providerJobId: snapshot.providerJobId,
      eventTimestamp: new Date(Number(headerValue(req.headers['x-vendrava-timestamp'])) * 1000),
      signatureValid: true,
      signatureVersion: 'vendrava-hmac-sha256-v1',
    })
    if (!lifecycle.claimed) {
      return reply.status(200).send({
        ok: true,
        duplicate: lifecycle.duplicate || lifecycle.inFlight,
        deadLetter: lifecycle.deadLetter,
      })
    }
    try {
      const job = await prisma.job.findFirst({
        where: { provider: RUNWAY_PROVIDER_ID, providerJobId: snapshot.providerJobId },
      })
      if (!job || !['waiting_provider', 'cancel_requested'].includes(job.status)) {
        await finishWebhookEvent({
          id: lifecycle.id,
          provider: RUNWAY_PROVIDER_ID,
          channel: 'managed-gateway',
          correlationId: req.correlationId,
          success: true,
        })
        return reply.status(200).send({ ok: true, duplicate: Boolean(job) })
      }
      await applyRunwaySnapshot(job, snapshot)
      await finishWebhookEvent({
        id: lifecycle.id,
        provider: RUNWAY_PROVIDER_ID,
        channel: 'managed-gateway',
        correlationId: req.correlationId,
        success: true,
      })
      return reply.status(200).send({ ok: true })
    } catch (error) {
      await finishWebhookEvent({
        id: lifecycle.id,
        provider: RUNWAY_PROVIDER_ID,
        channel: 'managed-gateway',
        correlationId: req.correlationId,
        success: false,
        error,
      })
      req.log.warn({ event: 'webhook.failed', provider: RUNWAY_PROVIDER_ID, error: redactProviderError(error) }, 'Webhook falló')
      // 503 permite que el gateway vuelva a entregar; el inbox controla
      // reintentos y dead-letter sin duplicar assets ni consumo.
      return reply.status(503).send({ error: 'Temporary processing failure' })
    }
  })
}
