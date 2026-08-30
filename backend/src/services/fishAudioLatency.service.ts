import { randomUUID } from 'node:crypto'
import { recordUsage } from '../lib/usage'

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts'
const FISH_TIMEOUT_MS = 60_000

export const FISH_MODELS = ['s2.1-pro-free', 's2.1-pro', 's2-pro'] as const
export const FISH_LATENCY_MODES = ['balanced', 'normal', 'low'] as const

export type FishModel = typeof FISH_MODELS[number]
export type FishLatencyMode = typeof FISH_LATENCY_MODES[number]

export interface FishLatencyInput {
  text: string
  voiceId?: string
  model: FishModel
  latency: FishLatencyMode
  speed: number
}

export interface FishLatencyResult {
  audio: Buffer
  contentType: string
  ttfaMs: number
  totalMs: number
  model: FishModel
  latency: FishLatencyMode
}

export class FishAudioLatencyError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message)
    this.name = 'FishAudioLatencyError'
  }
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 10) / 10
}

function configuredCostCents(textLength: number, model: FishModel) {
  if (model === 's2.1-pro-free') return 0
  const perThousand = Number.parseFloat(process.env.FISH_AUDIO_COST_CENTS_PER_1K_CHARS ?? '')
  return Number.isFinite(perThousand) && perThousand >= 0
    ? (textLength / 1000) * perThousand
    : 0
}

/**
 * Ejecuta una síntesis corta y mide la latencia dentro del backend. TTFA se
 * toma cuando llega el primer chunk real del body, no cuando solo llegan las
 * cabeceras HTTP de Fish Audio.
 */
export async function measureFishAudioLatency(
  input: FishLatencyInput,
  opts?: { orgId?: string },
): Promise<FishLatencyResult> {
  const apiKey = process.env.FISH_API_KEY?.trim()
  if (!apiKey) {
    throw new FishAudioLatencyError('Configura FISH_API_KEY en el backend para ejecutar la medición real.', 503)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FISH_TIMEOUT_MS)
  const startedAt = performance.now()

  try {
    const response = await fetch(FISH_TTS_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        model: input.model,
      },
      body: JSON.stringify({
        text: input.text,
        ...(input.voiceId ? { reference_id: input.voiceId } : {}),
        format: 'mp3',
        mp3_bitrate: 128,
        latency: input.latency,
        chunk_length: 150,
        prosody: { speed: input.speed, volume: 0, normalize_loudness: true },
        normalize: true,
      }),
    })

    if (!response.ok) {
      const upstream = await response.json().catch(() => null) as { message?: string; reason?: string } | null
      const detail = upstream?.reason || upstream?.message
      const message = response.status === 401
        ? 'Fish Audio rechazó la clave API. Revisa FISH_API_KEY.'
        : response.status === 402
          ? 'La cuenta de Fish Audio no tiene saldo disponible para esta medición.'
          : `Fish Audio respondió ${response.status}${detail ? `: ${detail}` : '.'}`
      throw new FishAudioLatencyError(message, response.status === 402 ? 402 : 502)
    }

    if (!response.body) throw new FishAudioLatencyError('Fish Audio respondió sin flujo de audio.', 502)

    const reader = response.body.getReader()
    const first = await reader.read()
    const ttfaMs = elapsedMs(startedAt)
    if (first.done || !first.value?.length) {
      throw new FishAudioLatencyError('Fish Audio no devolvió audio reproducible.', 502)
    }

    const chunks = [Buffer.from(first.value)]
    while (true) {
      const next = await reader.read()
      if (next.done) break
      if (next.value?.length) chunks.push(Buffer.from(next.value))
    }

    const audio = Buffer.concat(chunks)
    const totalMs = elapsedMs(startedAt)
    if (!audio.length) throw new FishAudioLatencyError('Fish Audio devolvió un audio vacío.', 502)

    if (opts?.orgId) {
      const costCents = configuredCostCents(input.text.length, input.model)
      await recordUsage({
        orgId: opts.orgId,
        provider: 'fish-audio',
        capability: 'audio.tts.latency-test',
        quantity: input.text.length,
        unit: 'chars',
        costCents,
        billingMode: 'managed',
        rateVersion: '2026-08',
        idempotencyKey: `fish-latency:${randomUUID()}`,
        meta: { model: input.model, latency: input.latency, ttfaMs, totalMs },
      })
    }

    return {
      audio,
      contentType: response.headers.get('content-type') || 'audio/mpeg',
      ttfaMs,
      totalMs,
      model: input.model,
      latency: input.latency,
    }
  } catch (error) {
    if (error instanceof FishAudioLatencyError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FishAudioLatencyError('Fish Audio superó el límite de 60 segundos.', 504)
    }
    throw new FishAudioLatencyError('No se pudo conectar con Fish Audio para medir la latencia.', 502)
  } finally {
    clearTimeout(timeout)
  }
}
