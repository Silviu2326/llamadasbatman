import { Server } from 'socket.io'
import { Server as HttpServer } from 'http'

let io: Server

export function initWebSockets(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: '*' },
  })

  io.on('connection', (socket) => {
    console.log('[WS] client connected:', socket.id)

    socket.on('join:org', (orgId: string) => {
      socket.join(orgId)
      console.log(`[WS] socket ${socket.id} joined org ${orgId}`)
    })

    socket.on('disconnect', () => {
      console.log('[WS] client disconnected:', socket.id)
    })
  })
}

export function emitToOrg(orgId: string, event: string, data: unknown) {
  io?.to(orgId).emit(event, data)
}
