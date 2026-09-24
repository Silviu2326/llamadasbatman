import { createHash, randomUUID } from 'node:crypto'
import { startOutboundCall as startTwilioCall } from './twilioClient'
import { zadarmaGatewayRequest } from './zadarma/client'
export { zadarmaGatewayUrl } from './zadarma/client'

type TwilioCallParams = Parameters<typeof startTwilioCall>[0]

/**
 * `requestId` es la clave de idempotencia de la pasarela: dos peticiones con
 * el mismo valor son el mismo marcado. Quien reintenta un trabajo (la cola)
 * debe pasar siempre el mismo; si no se pasa, cada invocación es un marcado
 * distinto. Ver `stableRequestId`.
 */
type IdempotentCall = { requestId?: string }

/**
 * `mode: 'test'` es la llamada de prueba de un agente en borrador
 * (`voiceTestCall.service.ts`): no tiene campaña y su destino es un
 * `VoiceTestNumber`. La pasarela vuelve a validarlo todo por su cuenta.
 */
export type OutboundCallParams =
  | (TwilioCallParams & IdempotentCall & { mode?: 'campaign' })
  | (Omit<TwilioCallParams, 'campaignId'> & IdempotentCall & { mode: 'test' })

/**
 * UUID determinista (formato v5) a partir de las partes que identifican un
 * trabajo de llamada. El mismo trabajo reintentado tras un timeout ambiguo
 * manda el mismo `requestId`, y la pasarela devuelve el resultado que ya
 * tenía en vez de marcar otra vez.
 */
export function stableRequestId(...parts: Array<string | number | null | undefined>): string {
  const hex = createHash('sha256').update(parts.map(part => String(part ?? '')).join('\u0000')).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(8 + (parseInt(hex[16], 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/**
 * Fallo tipado de la pasarela Zadarma. `code` es el de `GatewayCallError`
 * (gateway.ts); `retryable` dice que no se ha marcado y el mismo `requestId`
 * puede repetirse; `dialed` que la centralita sí intentó la llamada (y por
 * tanto cuenta como intento sobre el lead).
 */
export class ZadarmaGatewayCallError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly options: { retryable?: boolean; dialed?: boolean; retryAfterMs?: number; cause?: string } = {},
  ) {
    super(code)
    this.name = 'ZadarmaGatewayCallError'
  }
  get retryable(): boolean { return this.options.retryable === true }
  get dialed(): boolean { return this.options.dialed === true }
  get retryAfterMs(): number | undefined { return this.options.retryAfterMs }
  get cause(): string | undefined { return this.options.cause }
}

export function isZadarmaGatewayCallError(error: unknown): error is ZadarmaGatewayCallError {
  return error instanceof ZadarmaGatewayCallError
}

function zadarmaSelected(orgId: string) {
  return process.env.ZADARMA_GATEWAY_ENABLED === 'true' && orgId === process.env.ZADARMA_ORG_ID
}

export async function startOutboundCall(params: OutboundCallParams): ReturnType<typeof startTwilioCall> {
  const test = params.mode === 'test'
  if (!zadarmaSelected(params.orgId)) {
    // La prueba telefónica de un agente en borrador solo existe en la pasarela
    // propia: el flujo de Twilio marca dentro de una campaña. Antes de inventar
    // un atajo, se dice que no.
    if (test) throw new Error('TEST_CALL_REQUIRES_ZADARMA_GATEWAY')
    return startTwilioCall(params)
  }
  const response = await zadarmaGatewayRequest('/calls', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: params.requestId ?? randomUUID(), orgId: params.orgId, leadId: params.leadId, agentId: params.agentId,
      ...(test ? { mode: 'test' } : { campaignId: params.campaignId }),
    }),
  })
  // Never retry via another carrier after an uncertain dial result.
  if (!response.ok) {
    let body: { error?: string; code?: string; retryable?: boolean; dialed?: boolean; retryAfterMs?: number; cause?: string } = {}
    try { body = await response.json() as typeof body } catch { /* sin cuerpo JSON: pasarela antigua o proxy */ }
    const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : `ZADARMA_GATEWAY_CALL_FAILED_${response.status}`
    throw new ZadarmaGatewayCallError(code, response.status, {
      retryable: body.retryable === true || response.status === 429,
      dialed: body.dialed === true,
      retryAfterMs: typeof body.retryAfterMs === 'number' ? body.retryAfterMs : undefined,
      cause: typeof body.cause === 'string' ? body.cause : undefined,
    })
  }
  const data = await response.json() as { status?: string; sid?: string; to?: string }
  if (data.status !== 'iniciada' || !data.sid?.startsWith('zadarma:') || typeof data.to !== 'string') {
    throw new Error('ZADARMA_GATEWAY_INVALID_RESPONSE')
  }
  return { status: data.status, sid: data.sid, to: data.to }
}
