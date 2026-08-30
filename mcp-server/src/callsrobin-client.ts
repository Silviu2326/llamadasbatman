import type { Config } from './config.js'

export class CallsRobinApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'CallsRobinApiError'
    this.status = status
    this.code = code
  }
}

export class CallsRobinClient {
  constructor(
    private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly apiKey: string = config.apiKey,
  ) {}

  async get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, query)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${this.config.apiUrl}${path}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          accept: 'application/json',
          ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
          'x-api-key': this.apiKey,
        },
        ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      })

      const responseBody = await this.readJson(response)
      if (!response.ok) {
        const message = isRecord(responseBody) && typeof responseBody.error === 'string'
          ? responseBody.error
          : `La API respondió con HTTP ${response.status}`
        throw new CallsRobinApiError(response.status, 'CALLSROBIN_API_ERROR', message)
      }
      return responseBody as T
    } catch (error) {
      if (error instanceof CallsRobinApiError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CallsRobinApiError(504, 'CALLSROBIN_TIMEOUT', 'La API de llamadasrobin ha agotado el tiempo de espera')
      }
      throw new CallsRobinApiError(502, 'CALLSROBIN_UNAVAILABLE', 'No se pudo conectar con la API de llamadasrobin')
    } finally {
      clearTimeout(timeout)
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    const length = response.headers.get('content-length')
    if (length && Number(length) > this.config.maxResponseBytes) {
      throw new CallsRobinApiError(502, 'CALLSROBIN_RESPONSE_TOO_LARGE', 'La respuesta de llamadasrobin es demasiado grande')
    }

    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > this.config.maxResponseBytes) {
      throw new CallsRobinApiError(502, 'CALLSROBIN_RESPONSE_TOO_LARGE', 'La respuesta de llamadasrobin es demasiado grande')
    }
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      throw new CallsRobinApiError(502, 'CALLSROBIN_INVALID_JSON', 'La API de llamadasrobin devolvió JSON inválido')
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
