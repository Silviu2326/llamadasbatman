import test from 'node:test'
import assert from 'node:assert/strict'
import { QwenOmniRealtimeSession } from '../voice/engine/qwenOmni'
import type { CallContext } from '../voice/intelligence/conversation/callContext'

function sessionWithSpy() {
  const session = new QwenOmniRealtimeSession({ callSid: 'test' } as CallContext, 'prompt')
  const events: Array<{ kind: string; args: unknown[] }> = []
  void session.attach({
    onAudio: async (audio: Buffer) => { events.push({ kind: 'audio', args: [audio] }) },
    onInterrupt: async () => { events.push({ kind: 'interrupt', args: [] }) },
    onTranscript: async (role: string, text: string) => { events.push({ kind: 'transcript', args: [role, text] }) },
  })
  return { session, events }
}

test('mapea los eventos del servidor DashScope al contrato VoiceSession', () => {
  const { session, events } = sessionWithSpy()

  const pcm = Buffer.from([1, 2, 3, 4])
  session.handleServerEvent({ type: 'response.audio.delta', delta: pcm.toString('base64') })
  assert.equal(events[0].kind, 'audio')
  assert.deepEqual(events[0].args[0], pcm)

  session.handleServerEvent({ type: 'conversation.item.input_audio_transcription.delta', text: 'hola', stash: ' mun' })
  assert.deepEqual(events[1], { kind: 'transcript', args: ['partial', 'hola mun'] })

  session.handleServerEvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'hola mundo' })
  assert.deepEqual(events[2], { kind: 'transcript', args: ['prospecto', 'hola mundo'] })

  session.handleServerEvent({ type: 'response.audio_transcript.delta', delta: 'buenas ' })
  session.handleServerEvent({ type: 'response.audio_transcript.delta', delta: 'tardes' })
  session.handleServerEvent({ type: 'response.audio_transcript.done' })
  assert.deepEqual(events[3], { kind: 'transcript', args: ['agente', 'buenas tardes'] })

  session.handleServerEvent({ type: 'input_audio_buffer.speech_started' })
  assert.equal(events[4].kind, 'interrupt')

  // Eventos desconocidos o malformados no rompen la sesión ni emiten nada.
  session.handleServerEvent({ type: 'response.unknown' })
  session.handleServerEvent({ noType: true })
  assert.equal(events.length, 5)
})

test('los deltas incrementales estilo OpenAI también acumulan el parcial del usuario', () => {
  const { session, events } = sessionWithSpy()
  session.handleServerEvent({ type: 'conversation.item.input_audio_transcription.delta', delta: 'ho' })
  session.handleServerEvent({ type: 'conversation.item.input_audio_transcription.delta', delta: 'la' })
  assert.deepEqual(events.at(-1), { kind: 'transcript', args: ['partial', 'hola'] })
  session.handleServerEvent({ type: 'conversation.item.input_audio_transcription.completed' })
  assert.deepEqual(events.at(-1), { kind: 'transcript', args: ['prospecto', 'hola'] })
})
