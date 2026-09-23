import { randomUUID } from 'node:crypto'
import { startOutboundCall as startTwilioCall } from './twilioClient'
import { zadarmaGatewayRequest } from './zadarma/client'
export { zadarmaGatewayUrl } from './zadarma/client'

type TwilioCallParams = Parameters<typeof startTwilioCall>[0]

/**
 * `mode: 'test'` es la llamada de prueba de un agente en borrador
 * (`voiceTestCall.service.ts`): no tiene campaña y su destino es un
 * `VoiceTestNumber`. La pasarela vuelve a validarlo todo por su cuenta.
 */
export type OutboundCallParams =
  | (TwilioCallParams & { mode?: 'campaign' })
  | (Omit<TwilioCallParams, 'campaignId'> & { mode: 'test' })

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
      requestId: randomUUID(), orgId: params.orgId, leadId: params.leadId, agentId: params.agentId,
      ...(test ? { mode: 'test' } : { campaignId: params.campaignId }),
    }),
  })
  // Never retry via another carrier after an uncertain dial result.
  if (!response.ok) throw new Error(`ZADARMA_GATEWAY_CALL_FAILED_${response.status}`)
  const data = await response.json() as { status?: string; sid?: string; to?: string }
  if (data.status !== 'iniciada' || !data.sid?.startsWith('zadarma:') || typeof data.to !== 'string') {
    throw new Error('ZADARMA_GATEWAY_INVALID_RESPONSE')
  }
  return { status: data.status, sid: data.sid, to: data.to }
}
