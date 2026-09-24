import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'

export interface AmiConfig { port: number; username: string; secret: string; endpoint: string; audioPort: number }

/** Causa del fallo de marcado, cuando la centralita la da o se puede deducir. */
export type OriginateCause = 'no_answer' | 'busy' | 'congestion' | 'rejected' | 'unknown'

export type OriginateErrorCode =
  | 'ORIGINATE_TIMEOUT'    // la acción no obtuvo respuesta a tiempo: resultado ambiguo
  | 'ORIGINATE_REJECTED'   // la centralita respondió Error a Originate
  | 'AMI_UNAVAILABLE'      // no se pudo conectar/autenticar con AMI: no se marcó
  | 'INVALID_ORIGINATE_PARAMETERS'

/**
 * Error tipado de marcado. `dialed` dice si la centralita llegó a intentar la
 * llamada: `AMI_UNAVAILABLE` y parámetros inválidos son fallos previos y se
 * pueden reintentar sin gastar un intento del lead; un timeout es ambiguo.
 */
export class OriginateError extends Error {
  constructor(readonly code: OriginateErrorCode, readonly cause_: OriginateCause, readonly dialed: boolean, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'OriginateError'
  }
  get cause(): OriginateCause { return this.cause_ }
}

export const ORIGINATE_RING_TIMEOUT_MS = 45_000
/** Mapa de `Reason` del evento OriginateResponse de Asterisk. */
const ORIGINATE_REASONS: Record<string, OriginateCause> = { '0': 'rejected', '1': 'no_answer', '3': 'no_answer', '5': 'busy', '8': 'congestion' }

/**
 * Sin el evento OriginateResponse (el usuario AMI tiene `read=none`), la
 * respuesta síncrona "Originate failed" no dice por qué. Si llegó tras agotar
 * el tiempo de timbre configurado, nadie contestó; si llegó enseguida, la red
 * o el destino rechazaron (comunica, número inválido, congestión).
 */
export function inferOriginateCause(elapsedMs: number, reason?: string): OriginateCause {
  if (reason && ORIGINATE_REASONS[reason]) return ORIGINATE_REASONS[reason]
  return elapsedMs >= ORIGINATE_RING_TIMEOUT_MS - 5_000 ? 'no_answer' : 'rejected'
}

export function amiAction(fields: Record<string, string>): string {
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[A-Za-z]+$/.test(key) || /[\r\n\0]/.test(value)) throw new Error('INVALID_AMI_FIELD')
  }
  return Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\r\n') + '\r\n\r\n'
}

export function originateFields(uuid: string, phone: string, callerId: string, config: AmiConfig): Record<string, string> {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(uuid)
    || !/^\+[1-9]\d{7,14}$/.test(phone) || !/^\+[1-9]\d{7,14}$/.test(callerId)
    || !/^[a-zA-Z0-9_-]{1,64}$/.test(config.endpoint)
    || !Number.isInteger(config.audioPort) || config.audioPort < 1 || config.audioPort > 65535) {
    throw new OriginateError('INVALID_ORIGINATE_PARAMETERS', 'rejected', false)
  }
  return {
    Action: 'Originate', ActionID: uuid, Channel: `PJSIP/${phone}@${config.endpoint}`,
    Context: 'vendrava-recorded', Exten: uuid, Priority: '1',
    Variable: `VENDRAVA_AUDIO_PORT=${config.audioPort}`,
    CallerID: callerId, Timeout: String(ORIGINATE_RING_TIMEOUT_MS), Async: 'false', ChannelId: uuid,
  }
}

/** Dedicated local AMI; no access to the existing remote CRM PBX. */
export async function originate(config: AmiConfig, uuid: string, phone: string, callerId: string): Promise<void> {
  const dial = amiAction(originateFields(uuid, phone, callerId, config))
  const loginId = randomUUID()
  const login = amiAction({ Action: 'Login', ActionID: loginId, Username: config.username, Secret: config.secret, Events: 'off' })
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: config.port })
    let pending = ''
    let authenticated = false
    let settled = false
    let dialedAt = 0
    let eventReason: string | undefined
    const timer = setTimeout(() => done(new OriginateError('ORIGINATE_TIMEOUT', 'unknown', dialedAt > 0, 'AMI_TIMEOUT')), 55_000)
    const loginTimer = setTimeout(() => done(new OriginateError('AMI_UNAVAILABLE', 'unknown', false, 'AMI_LOGIN_TIMEOUT')), 5000)
    function done(error?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(loginTimer)
      socket.destroy()
      if (error) reject(error); else resolve()
    }
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(login))
    socket.on('error', () => done(new OriginateError(dialedAt ? 'ORIGINATE_TIMEOUT' : 'AMI_UNAVAILABLE', 'unknown', dialedAt > 0, 'AMI_CONNECTION_FAILED')))
    socket.on('close', () => { if (!settled) done(new OriginateError(dialedAt ? 'ORIGINATE_TIMEOUT' : 'AMI_UNAVAILABLE', 'unknown', dialedAt > 0, 'AMI_CONNECTION_CLOSED')) })
    socket.on('data', chunk => {
      pending += chunk
      if (pending.length > 64 * 1024) return done(new OriginateError('ORIGINATE_TIMEOUT', 'unknown', dialedAt > 0, 'AMI_RESPONSE_TOO_LARGE'))
      let boundary: number
      while ((boundary = pending.indexOf('\r\n\r\n')) >= 0) {
        const block = pending.slice(0, boundary)
        pending = pending.slice(boundary + 4)
        const fields: Record<string, string> = {}
        for (const line of block.split('\r\n')) {
          const colon = line.indexOf(':')
          if (colon >= 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
        }
        if (!authenticated && fields.ActionID === loginId && fields.Response) {
          if (fields.Response !== 'Success') return done(new OriginateError('AMI_UNAVAILABLE', 'unknown', false, 'AMI_LOGIN_REJECTED'))
          authenticated = true
          clearTimeout(loginTimer)
          dialedAt = Date.now()
          socket.write(dial)
        } else if (authenticated && fields.Event === 'OriginateResponse' && fields.ActionID === uuid) {
          // Solo llega si el usuario AMI puede leer eventos de llamada; entonces
          // trae la causa real (busy, no answer, congestion).
          eventReason = fields.Reason
        } else if (authenticated && fields.ActionID === uuid && fields.Response) {
          if (fields.Response === 'Success') return done()
          // Keep operational reasons, without logging phone numbers or arbitrary text.
          const reason = ['Extension does not exist', 'Permission denied', 'Originate failed', 'Invalid channel', 'Channel not specified', 'Invalid priority', 'Invalid timeout', 'Originate Access Forbidden']
            .find(value => (fields.Message ?? '').toLowerCase().includes(value.toLowerCase())) ?? 'unspecified'
          // "Originate failed" es el destino que no contesta, comunica o rechaza;
          // el resto son errores de configuración que no dependen del destino.
          const cause = reason === 'Originate failed' ? inferOriginateCause(Date.now() - dialedAt, eventReason) : 'rejected'
          done(new OriginateError('ORIGINATE_REJECTED', cause, true, reason))
        }
      }
    })
  })
}
