import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'

export interface AmiConfig { port: number; username: string; secret: string; endpoint: string; audioPort: number }

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
    throw new Error('INVALID_ORIGINATE_PARAMETERS')
  }
  return {
    Action: 'Originate', ActionID: uuid, Channel: `PJSIP/${phone}@${config.endpoint}`,
    Context: 'vendrava-recorded', Exten: uuid, Priority: '1',
    Variable: `VENDRAVA_AUDIO_PORT=${config.audioPort}`,
    CallerID: callerId, Timeout: '45000', Async: 'false', ChannelId: uuid,
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
    const timer = setTimeout(() => done(new Error('AMI_TIMEOUT')), 55_000)
    const loginTimer = setTimeout(() => done(new Error('AMI_LOGIN_TIMEOUT')), 5000)
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
    socket.on('error', () => done(new Error('AMI_CONNECTION_FAILED')))
    socket.on('close', () => { if (!settled) done(new Error('AMI_CONNECTION_CLOSED')) })
    socket.on('data', chunk => {
      pending += chunk
      if (pending.length > 64 * 1024) return done(new Error('AMI_RESPONSE_TOO_LARGE'))
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
          if (fields.Response !== 'Success') return done(new Error('AMI_LOGIN_REJECTED'))
          authenticated = true
          clearTimeout(loginTimer)
          socket.write(dial)
        } else if (authenticated && fields.ActionID === uuid && fields.Response) {
          // Keep operational reasons, without logging phone numbers or arbitrary text.
          const reason = ['Extension does not exist', 'Permission denied', 'Originate failed', 'Invalid channel', 'Channel not specified', 'Invalid priority', 'Invalid timeout', 'Originate Access Forbidden']
            .find(value => (fields.Message ?? '').toLowerCase().includes(value.toLowerCase())) ?? 'unspecified'
          done(fields.Response === 'Success' ? undefined : new Error(`AMI_ORIGINATE_REJECTED: ${reason}`))
        }
      }
    })
  })
}
