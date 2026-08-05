// Registro de llamadas en curso para el widget "En directo" del dashboard.
// ponytail: Map en memoria de un solo proceso — mover a Redis si el backend escala horizontal.
export type LiveCall = {
  callSid: string
  orgId: string
  leadId: string
  agentId: string
  campaignId: string
  phone: string
  startedAt: number
}

const live = new Map<string, LiveCall>()

export const registerLiveCall = (call: LiveCall) => { live.set(call.callSid, call) }
export const unregisterLiveCall = (callSid: string) => { live.delete(callSid) }
export const liveCallsByOrg = (orgId: string) =>
  [...live.values()].filter(c => c.orgId === orgId)
