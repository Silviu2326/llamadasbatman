import { Server } from 'socket.io'
import { Server as HttpServer } from 'http'
import { getCorsOrigins } from '../lib/securityConfig'

export interface RealtimePrincipal {
  userId: string
  orgId: string
  role: string
  email: string
}

export type VerifyRealtimeToken = (token: string) => RealtimePrincipal

let io: Server | undefined

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Shared by Socket.IO and the browser voice WebSocket. A missing Origin is
 * only accepted for non-browser clients, which still have to pass JWT auth.
 * The source of truth is the same explicit allowlist used by Fastify CORS.
 */
export function isRealtimeOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  return getCorsOrigins().has(origin.replace(/\/$/, ''))
}

function orgRoom(orgId: string): string {
  return `org:${orgId}`
}

function validPrincipal(value: unknown): value is RealtimePrincipal {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RealtimePrincipal>
  return [candidate.userId, candidate.orgId, candidate.role, candidate.email]
    .every(field => typeof field === 'string' && field.trim().length > 0 && field.length <= 256)
}

function tokenFromSocket(socket: { handshake: { auth: Record<string, unknown>; headers: Record<string, string | string[] | undefined> } }): string | null {
  const authToken = socket.handshake.auth?.token
  if (typeof authToken === 'string' && authToken.length <= 4096) return authToken

  const authorization = headerValue(socket.handshake.headers.authorization)
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  return bearer && bearer.length <= 4096 ? bearer : null
}

export function initWebSockets(server: HttpServer, verifyToken: VerifyRealtimeToken) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => callback(null, isRealtimeOriginAllowed(origin)),
      credentials: true,
    },
    // CORS headers do not protect WebSocket upgrades by themselves.
    allowRequest: (request, callback) => callback(null, isRealtimeOriginAllowed(headerValue(request.headers.origin))),
  })

  io.use((socket, next) => {
    const token = tokenFromSocket(socket)
    if (!token) return next(new Error('Unauthorized'))

    try {
      const principal = verifyToken(token)
      if (!validPrincipal(principal)) return next(new Error('Unauthorized'))
      socket.data.principal = principal
      return next()
    } catch {
      return next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const principal = socket.data.principal as RealtimePrincipal
    const room = orgRoom(principal.orgId)
    socket.join(room)
    console.info('[WS] client connected user=%s org=%s', principal.userId, principal.orgId)

    // Retained only for clients that already emitted this event. The supplied
    // org is never trusted and sockets are already in their authenticated room.
    socket.on('join:org', (requestedOrgId: unknown, acknowledgement?: (result: { ok: boolean; error?: string }) => void) => {
      if (requestedOrgId !== principal.orgId) {
        acknowledgement?.({ ok: false, error: 'Forbidden' })
        return
      }
      socket.join(room)
      acknowledgement?.({ ok: true })
    })

    socket.on('disconnect', () => {
      console.info('[WS] client disconnected user=%s org=%s', principal.userId, principal.orgId)
    })
  })
}

export function emitToOrg(orgId: string, event: string, data: unknown) {
  if (!orgId) return
  io?.to(orgRoom(orgId)).emit(event, data)
}
