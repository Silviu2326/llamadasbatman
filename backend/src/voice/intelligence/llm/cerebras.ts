import OpenAI from 'openai'

export interface LatencyMetrics {
  ttftMs: number
  totalTimeMs: number
  tokensGenerated: number
  tokensPerSecond: number
}

const VALID_EMOTIONS = new Set(['interesado', 'molesto', 'confundido', 'calmado', 'agitado', 'sarcastico', 'neutro'])

export class CerebrasAgent {
  private _client: OpenAI

  constructor(
    apiKey: string,
    private model = 'llama-3.3-70b',
    private timeoutSeconds = 8,
    private systemPrompt = '',
  ) {
    this._client = new OpenAI({
      apiKey,
      baseURL: 'https://api.cerebras.ai/v1',
      timeout: timeoutSeconds * 1000,
    })
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
      const res = await this._client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 400,
        temperature: 0.7,
      })
      const total = performance.now() - t0
      const text = res.choices[0]?.message?.content?.trim() ?? ''
      const tokens = res.usage?.completion_tokens ?? 0
      return [text, { ttftMs: total, totalTimeMs: total, tokensGenerated: tokens, tokensPerSecond: tokens / (total / 1000) || 0 }]
    } catch (e) {
      return ['Perdona, me ha fallado la conexión un segundo. ¿Me puedes repetir eso?',
        { ttftMs: this.timeoutSeconds * 1000, totalTimeMs: this.timeoutSeconds * 1000, tokensGenerated: 0, tokensPerSecond: 0 }]
    }
  }

  async classifyEmotion(text: string, acousticState: string): Promise<string> {
    try {
      const res = await this._client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'Clasifica la emoción del hablante en UNA sola palabra: interesado/molesto/confundido/calmado/agitado/sarcastico/neutro. Solo la palabra.' },
          { role: 'user', content: `Texto: '${text.slice(0, 200)}' | Tono acústico: ${acousticState}` },
        ],
        max_tokens: 8,
        temperature: 0,
      }, { timeout: 2000 })
      const word = res.choices[0]?.message?.content?.trim().toLowerCase().split(/\s/)[0] ?? ''
      return VALID_EMOTIONS.has(word) ? word : 'neutro'
    } catch {
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
