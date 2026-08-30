export type Config = Readonly<{
  apiUrl: string
  apiKey: string
  writeEnabled: boolean
  writeApiKey?: string
  timeoutMs: number
  maxResponseBytes: number
}>

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo`)
  }
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiUrl = env.CALLSROBIN_API_URL?.trim().replace(/\/$/, '')
  const apiKey = env.CALLSROBIN_API_KEY?.trim()
  const writeFlag = env.CALLSROBIN_WRITE_ENABLED?.trim().toLowerCase() || 'false'
  const writeEnabled = writeFlag === 'true'
  const writeApiKey = env.CALLSROBIN_WRITE_API_KEY?.trim()

  if (!apiUrl) throw new Error('Falta CALLSROBIN_API_URL')
  if (!apiKey) throw new Error('Falta CALLSROBIN_API_KEY')
  if (!apiKey.startsWith('vk_')) throw new Error('CALLSROBIN_API_KEY debe empezar por vk_')
  if (!['true', 'false'].includes(writeFlag)) throw new Error('CALLSROBIN_WRITE_ENABLED debe ser true o false')
  if (writeEnabled) {
    if (!writeApiKey) throw new Error('Falta CALLSROBIN_WRITE_API_KEY con la escritura activada')
    if (!writeApiKey.startsWith('vk_')) throw new Error('CALLSROBIN_WRITE_API_KEY debe empezar por vk_')
  }

  try {
    const parsed = new URL(apiUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('protocolo no permitido')
    }
  } catch {
    throw new Error('CALLSROBIN_API_URL no es una URL HTTP válida')
  }

  return Object.freeze({
    apiUrl,
    apiKey,
    writeEnabled,
    ...(writeApiKey ? { writeApiKey } : {}),
    timeoutMs: positiveInteger(env, 'CALLSROBIN_TIMEOUT_MS', 15_000),
    maxResponseBytes: positiveInteger(env, 'CALLSROBIN_MAX_RESPONSE_BYTES', 2_000_000),
  })
}
