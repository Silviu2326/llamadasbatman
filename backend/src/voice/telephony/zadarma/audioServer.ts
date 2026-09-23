import { createServer, type Socket } from 'node:net'
import type { VoiceSession, VoiceSessionCallbacks } from '../../engine/voiceSession'
import { AudioSocketParser, packet, PcmPlaybackQueue, SipPcmBridge, uuidFromBytes } from './audioSocket'

export interface SipVoiceCall {
  session: VoiceSession
  callbacks: Pick<VoiceSessionCallbacks, 'onTranscript' | 'onEvent'>
  finish(reason: string): Promise<void>
}

export type ClaimCall = (uuid: string, hangup: () => void) => Promise<SipVoiceCall>

export function acceptAudioSocket(socket: Socket, claim: ClaimCall, options: { maxDurationMs?: number; onError?: (code: string) => void } = {}) {
  const parser = new AudioSocketParser()
  const pcm = new SipPcmBridge()
  const playback = new PcmPlaybackQueue()
  let call: SipVoiceCall | undefined
  let closed = false
  let seenUuid = false
  let ready = false
  let pendingBytes = 0
  let reason = 'remote_hangup'
  let work = Promise.resolve()
  let windowAt = Date.now()
  let windowBytes = 0
  let messages = 0
  let resolveFinished!: () => void
  const finished = new Promise<void>(resolve => { resolveFinished = resolve })
  const deadline = setTimeout(() => stop('start_timeout'), 10_000)
  const duration = setTimeout(() => stop('duration_limit'), options.maxDurationMs ?? 20 * 60_000)
  // A stalled TCP peer must not accumulate seconds of stale voice after barge-in.
  const ticker = setInterval(() => {
    if (closed || !ready) return
    if (socket.writableLength > 3200) return stop('output_backpressure')
    const frame = playback.nextFrame()
    if (frame) socket.write(packet(0x10, frame))
  }, 20)

  function stop(code: string): void {
    if (closed) return
    reason = code
    cleanup()
    socket.destroy()
  }
  function cleanup(): void {
    if (closed) return
    closed = true
    clearTimeout(deadline)
    clearTimeout(duration)
    clearInterval(ticker)
    playback.clear()
    // Serialize disposal after a pending claim/attach, avoiding orphan sessions.
    void work.catch(() => {}).then(async () => {
      if (!call) return
      try { await call.session.close() }
      finally { await call.finish(reason) }
    }).catch(() => options.onError?.('call_cleanup_failed')).finally(resolveFinished)
  }
  socket.setNoDelay(true)
  socket.setTimeout(15_000, () => stop('input_timeout'))
  socket.on('close', cleanup)
  socket.on('error', () => stop('socket_error'))
  socket.on('data', (chunk: Buffer) => {
    if (closed) return
    if (Date.now() - windowAt >= 1000) { windowAt = Date.now(); windowBytes = 0; messages = 0 }
    windowBytes += chunk.length
    if (windowBytes > 64_000) return stop('input_rate_limit')
    try {
      for (const frame of parser.push(chunk)) {
        if (++messages > 250) return stop('message_rate_limit')
        if (frame.type === 0 || frame.type === 0xff) return stop(frame.type === 0 ? 'remote_hangup' : 'remote_error')
        if (!seenUuid) {
          if (frame.type !== 1) return stop('uuid_required')
          seenUuid = true
          work = work.then(async () => {
            if (closed) return
            call = await claim(uuidFromBytes(frame.payload), () => stop('agent_hangup'))
            if (closed) return
            await call.session.attach({
              ...call.callbacks,
              onAudio: async audio => {
                if (closed) return
                try { playback.push(pcm.output(audio)) }
                catch (error) { stop('output_backlog'); throw error }
              },
              onInterrupt: async () => { playback.clear(); pcm.clearOutput() },
            })
            if (closed) return
            clearTimeout(deadline)
            ready = true
            void call.session.run().catch(() => stop('voice_engine_failed'))
          }).catch(() => stop('session_start_failed'))
        } else if (frame.type === 1) return stop('duplicate_uuid')
        else if (frame.type === 0x10) {
          pendingBytes += frame.payload.length
          if (pendingBytes > 32_000) return stop('input_backlog')
          work = work.then(async () => {
            pendingBytes -= frame.payload.length
            if (!closed && call) await call.session.sendAudio(pcm.input(frame.payload))
          }).catch(() => stop('voice_input_failed'))
        }
        // DTMF is deliberately ignored; it cannot select tenants or agents.
      }
    } catch { stop('invalid_audio_packet') }
  })
  return { close: () => stop('gateway_shutdown'), finished }
}

/** Local Asterisk only: AudioSocket has no transport authentication or TLS. */
export function createAudioSocketServer(claim: ClaimCall, options: Parameters<typeof acceptAudioSocket>[2] = {}) {
  const peers = new Set<ReturnType<typeof acceptAudioSocket>>()
  const server = createServer(socket => {
    if (peers.size >= 16) { socket.destroy(); return }
    const peer = acceptAudioSocket(socket, claim, options)
    peers.add(peer)
    // Retain closed peers until persistence finishes, so shutdown also waits
    // for calls whose TCP socket has already disappeared.
    void peer.finished.then(() => peers.delete(peer))
  })
  return { server, shutdown: async () => {
    const closing = [...peers]
    for (const peer of closing) peer.close()
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), ...closing.map(peer => peer.finished)])
  } }
}
