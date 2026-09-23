import type { AmiConfig } from './ami'

export interface ZadarmaGatewayConfig {
  orgId: string; token: string; callerId: string; controlPort: number; audioPort: number
  maxConcurrent: number; maxDurationMs: number; ami: AmiConfig
}

export function loadZadarmaGatewayConfig(env: NodeJS.ProcessEnv = process.env): ZadarmaGatewayConfig {
  if (env.ZADARMA_GATEWAY_ENABLED !== 'true') throw new Error('ZADARMA_GATEWAY_DISABLED')
  const required = (key: string) => {
    const value = env[key]?.trim()
    if (!value || /[\r\n\0]/.test(value)) throw new Error(`Missing or invalid ${key}`)
    return value
  }
  const integer = (key: string, fallback: number, max = 65535) => {
    const value = Number(env[key] ?? fallback)
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${key}`)
    return value
  }
  const token = required('ZADARMA_GATEWAY_TOKEN')
  if (token.length < 32) throw new Error('ZADARMA_GATEWAY_TOKEN_TOO_SHORT')
  const callerId = required('ZADARMA_CALLER_ID')
  if (!/^\+[1-9]\d{7,14}$/.test(callerId)) throw new Error('INVALID_ZADARMA_CALLER_ID')
  const audioPort = integer('ZADARMA_AUDIO_PORT', 9092)
  const controlPort = integer('ZADARMA_CONTROL_PORT', 9093)
  const amiPort = integer('ZADARMA_AMI_PORT', 5038)
  if (new Set([audioPort, controlPort, amiPort]).size !== 3) throw new Error('ZADARMA_PORT_CONFLICT')
  const endpoint = env.ZADARMA_PJSIP_ENDPOINT ?? 'zadarma-ai'
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(endpoint)) throw new Error('INVALID_ZADARMA_ENDPOINT')
  return {
    orgId: required('ZADARMA_ORG_ID'), token, callerId, controlPort, audioPort,
    maxConcurrent: integer('ZADARMA_MAX_CONCURRENT', 1, 3),
    maxDurationMs: integer('ZADARMA_MAX_CALL_SECONDS', 1200, 3600) * 1000,
    ami: { port: amiPort, username: required('ZADARMA_AMI_USER'), secret: required('ZADARMA_AMI_SECRET'), endpoint, audioPort },
  }
}
