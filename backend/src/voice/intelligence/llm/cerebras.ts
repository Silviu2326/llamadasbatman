import OpenAI from 'openai'

export interface LatencyMetrics {
  ttftMs: number
  totalTimeMs: number
  tokensGenerated: number
  tokensPerSecond: number
}

const VALID_EMOTIONS = new Set(['interesado', 'molesto', 'confundido', 'calmado', 'agitado', 'sarcastico', 'neutro'])

export class CerebrasAgent {
  private _clients: OpenAI[]
  private _clientIdx = 0

  constructor(
    apiKeys: string,
    private model = 'llama-3.3-70b',
    private timeoutSeconds = 8,
    private systemPrompt = '',
  ) {
    // ponytail: varias keys separadas por coma en CEREBRAS_API_KEY reparten la
    // carga por turno (round-robin) — alivia los timeouts de la key única bajo rate limit.
    this._clients = apiKeys.split(',').map(k => k.trim()).filter(Boolean).map(apiKey => new OpenAI({
      apiKey,
      baseURL: 'https://api.cerebras.ai/v1',
      timeout: timeoutSeconds * 1000,
    }))
  }

  private _nextClient(): OpenAI {
    const client = this._clients[this._clientIdx % this._clients.length]
    this._clientIdx++
    return client
  }

  async *generateResponseStream(
    userMessage: string,
    opts?: { history?: Array<{ role: string; content: string }>; extraInstructions?: string; signal?: AbortSignal },
  ): AsyncGenerator<string, void, unknown> {
    let sys = this.systemPrompt || this._defaultPrompt()
    if (opts?.extraInstructions) sys = `${sys}\n\n${opts.extraInstructions}`

    const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: 'system', content: sys }]
    if (opts?.history) messages.push(...opts.history.slice(-10) as OpenAI.ChatCompletionMessageParam[])
    messages.push({ role: 'user', content: userMessage })

    // ponytail: the SDK's `timeout` option only bounds time-to-first-byte — once the stream
    // opens it can stall forever. Rearm this abort on every chunk so a dead stream still dies.
    const idleMs = this.timeoutSeconds * 1000
    const idleAbort = new AbortController()
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const armIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => idleAbort.abort(), idleMs) }
    let externallyAborted = false
    const onExternalAbort = () => { externallyAborted = true; idleAbort.abort() }
    opts?.signal?.addEventListener('abort', onExternalAbort)

    // Timeout absoluto para toda la generación (TTFB + stream). El SDK de OpenAI
    // no siempre respeta el timeout con Cerebras, así que lo forzamos con race.
    const absoluteAbort = new AbortController()
    const absoluteTimer = setTimeout(() => {
      console.warn('[LLM] Absolute timeout reached:', idleMs, 'ms')
      absoluteAbort.abort()
      idleAbort.abort()
    }, idleMs)

    try {
      armIdle()
      const t0 = performance.now()
      let firstTokenMs: number | null = null
      let tokens = 0
      const client = this._nextClient()
      console.log('[LLM] start request', { model: this.model, messages: messages.length, timeoutMs: idleMs })
      const stream = await Promise.race([
        client.chat.completions.create({
          model: this.model,
          messages,
          max_tokens: 400,
          temperature: 0.7,
          stream: true,
        }, { signal: idleAbort.signal }),
        new Promise<never>((_, reject) => absoluteAbort.signal.addEventListener('abort', () => reject(new Error('absolute timeout')))),
      ])
      for await (const chunk of stream) {
        if (firstTokenMs === null) {
          firstTokenMs = performance.now() - t0
          console.log('[LLM] first token', { ttftMs: Math.round(firstTokenMs) })
        }
        armIdle()
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          tokens += delta.length > 0 ? 1 : 0 // aproximación rápida
          yield delta
        }
      }
      const totalMs = performance.now() - t0
      console.log('[LLM] stream done', { totalMs: Math.round(totalMs), tokensApprox: tokens })
    } catch (e: any) {
      console.warn('[LLM] Stream error:', e?.message ?? e)
      if (!opts?.signal?.aborted && !externallyAborted) {
        yield 'Perdona, me ha fallado la conexión un segundo. ¿Me puedes repetir eso?'
      }
    } finally {
      clearTimeout(absoluteTimer)
      clearTimeout(idleTimer)
      opts?.signal?.removeEventListener('abort', onExternalAbort)
    }
  }

  async generateResponse(
    userMessage: string,
    context: Record<string, unknown>,
    opts?: { history?: Array<{ role: string; content: string }>; extraInstructions?: string },
  ): Promise<[string, LatencyMetrics]> {
    let sys = this.systemPrompt || this._defaultPrompt()
    if (opts?.extraInstructions) sys = `${sys}\n\n${opts.extraInstructions}`

    const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: 'system', content: sys }]
    if (opts?.history) messages.push(...opts.history.slice(-10) as OpenAI.ChatCompletionMessageParam[])
    messages.push({ role: 'user', content: userMessage })

    const t0 = performance.now()
    try {
      const res = await this._nextClient().chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 400,
        temperature: 0.7,
      })
      const total = performance.now() - t0
      const text = res.choices[0]?.message?.content?.trim() ?? ''
      const tokens = res.usage?.completion_tokens ?? 0
      console.log('[LLM] non-stream done', { totalMs: Math.round(total), tokens })
      return [text, { ttftMs: total, totalTimeMs: total, tokensGenerated: tokens, tokensPerSecond: tokens / (total / 1000) || 0 }]
    } catch (e) {
      console.warn('[LLM] non-stream error after', Math.round(performance.now() - t0), 'ms:', e)
      return ['Perdona, me ha fallado la conexión un segundo. ¿Me puedes repetir eso?',
        { ttftMs: this.timeoutSeconds * 1000, totalTimeMs: this.timeoutSeconds * 1000, tokensGenerated: 0, tokensPerSecond: 0 }]
    }
  }

  async classifyEmotion(text: string, acousticState: string): Promise<string> {
    const t0 = performance.now()
    try {
      const res = await this._nextClient().chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'Clasifica la emoción del hablante en UNA sola palabra: interesado/molesto/confundido/calmado/agitado/sarcastico/neutro. Solo la palabra.' },
          { role: 'user', content: `Texto: '${text.slice(0, 200)}' | Tono acústico: ${acousticState}` },
        ],
        max_tokens: 8,
        temperature: 0,
      }, { timeout: 2000 })
      const word = res.choices[0]?.message?.content?.trim().toLowerCase().split(/\s/)[0] ?? ''
      console.log('[LLM] emotion classified', { emotion: word, ms: Math.round(performance.now() - t0) })
      return VALID_EMOTIONS.has(word) ? word : 'neutro'
    } catch (e) {
      console.warn('[LLM] emotion error', { ms: Math.round(performance.now() - t0), error: e })
      return 'neutro'
    }
  }

  async close(): Promise<void> {}

  private _defaultPrompt(): string {
    return `Eres un asesor comercial profesional, cálido y empático.
Respondes concisamente (máximo 3 frases).
Tono: conversacional, natural, como hablando con un colega.
Siempre en español.`
  }
}
