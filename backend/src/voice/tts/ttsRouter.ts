import { createHash } from 'node:crypto'
import { buildProsodyPlan, ProsodyPlan, selectTtsRoute, TtsRoute } from './prosodyController'

export type TtsProvider = {
  id: string
  model: string
  ready: () => boolean
  synthesize: (plan: ProsodyPlan) => Promise<Buffer>
}

export type TtsRouterResult = {
  audio: Buffer
  route: TtsRoute
  provider: string
  model: string
  cacheHit: boolean
}

type CacheEntry = { key: string; audio: Buffer; createdAt: number }

function hasSensitiveData(text: string): boolean {
  return /\b(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}\d)\b/i.test(text)
}

function isCacheable(text: string): boolean {
  return text.length > 0 && text.length <= 220 && !hasSensitiveData(text)
}

export class TtsRouter {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly providers: TtsProvider[],
    private readonly options: { prosodyVersion?: string; audioFormat?: string; maxCacheEntries?: number } = {},
  ) {}

  async synthesize(text: string, signals: { emotion?: string; acoustic?: string; maxDurationMs?: number } = {}): Promise<TtsRouterResult> {
    const plan = buildProsodyPlan(text, signals)
    const localReady = this.providers.some(provider => provider.ready() && provider.id.startsWith('local'))
    const remoteReady = this.providers.some(provider => provider.ready() && provider.id.startsWith('remote'))
    const desiredRoute = selectTtsRoute(plan.text, { localReady, remoteReady })
    const provider = this.pickProvider(desiredRoute)
    if (!provider) throw new Error('TTS_PROVIDER_UNAVAILABLE')

    const cacheable = isCacheable(text)
    const key = this.cacheKey(provider, plan)
    if (cacheable) {
      const cached = this.cache.get(key)
      if (cached) return { audio: Buffer.from(cached.audio), route: desiredRoute, provider: provider.id, model: provider.model, cacheHit: true }
    }

    const audio = await provider.synthesize(plan)
    if (cacheable && audio.length > 0) this.putCache({ key, audio: Buffer.from(audio), createdAt: Date.now() })
    return { audio, route: desiredRoute, provider: provider.id, model: provider.model, cacheHit: false }
  }

  clear(): void {
    this.cache.clear()
  }

  private pickProvider(route: TtsRoute): TtsProvider | undefined {
    const ready = this.providers.filter(provider => provider.ready())
    const prefix = route === 'remote_quality' ? 'remote' : route === 'fallback' ? 'fallback' : 'local'
    return ready.find(provider => provider.id.startsWith(prefix)) ?? ready[0]
  }

  private cacheKey(provider: TtsProvider, plan: ProsodyPlan): string {
    return createHash('sha256').update(JSON.stringify({
      provider: provider.id,
      model: provider.model,
      prosodyVersion: this.options.prosodyVersion ?? '1',
      audioFormat: this.options.audioFormat ?? 'pcm_s16le_24khz',
      plan,
    })).digest('hex')
  }

  private putCache(entry: CacheEntry): void {
    this.cache.set(entry.key, entry)
    const max = Math.max(1, this.options.maxCacheEntries ?? 256)
    while (this.cache.size > max) {
      const oldest = this.cache.keys().next().value
      if (!oldest) break
      this.cache.delete(oldest)
    }
  }
}
