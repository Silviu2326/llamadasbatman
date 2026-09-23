// Run on the VPS with the gateway env loaded. Internal Local channel only:
// no SIP destination, no prospects, no provider credits or database mutations.
const { createAudioSocketServer } = require('/opt/vendrava/gateway/dist/voice/telephony/zadarma/audioServer')
const { completedRecording, waitForRecordingStart } = require('/opt/vendrava/gateway/dist/voice/telephony/zadarma/recordings')
const { randomUUID } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs/promises')
const { setTimeout: delay } = require('node:timers/promises')

async function main() {
  const uuid = randomUUID()
  let incoming = Buffer.alloc(0), outputBytes = 0, completed = false
  const errors = []
  const server = createAudioSocketServer(async (id) => {
    if (id !== uuid) throw new Error('unexpected UUID')
    await waitForRecordingStart(id)
    return {
      session: {
        attach: async callbacks => {
          const audio = Buffer.alloc(24000 * 2)
          for (let i = 0; i < 24000; i++) audio.writeInt16LE(Math.round(4000 * Math.sin(2 * Math.PI * 880 * i / 24000)), i * 2)
          outputBytes = audio.length
          await callbacks.onAudio(audio)
        },
        sendAudio: async pcm => { incoming = Buffer.concat([incoming, pcm]) },
        run: async () => {},
        close: async () => {},
      },
      callbacks: {}, finish: async reason => {
        completed = true
        if (reason !== 'remote_hangup') errors.push(reason)
      },
    }
  }, { maxDurationMs: 10000, onError: code => errors.push(code) })
  const config = '/etc/asterisk/vendrava-smoke.conf'
  const mainConfig = '/etc/asterisk/extensions.conf'
  const original = await fs.readFile(mainConfig, 'utf8')
  if (original.includes('vendrava-smoke')) throw new Error('Unexpected existing smoke config')
  try {
    await fs.writeFile(config, `[vendrava-smoke]\nexten => tone,1,Answer()\n same => n,Playtones(440)\n same => n,Wait(4)\n same => n,Hangup()\n`)
    await fs.chmod(config, 0o644)
    await fs.writeFile(mainConfig, original + '\n#include "vendrava-smoke.conf"\n')
    execFileSync('asterisk', ['-rx', 'dialplan reload'])
    await new Promise((resolve, reject) => { server.server.once('error', reject); server.server.listen(9094, '127.0.0.1', resolve) })
    // Use a private context wrapper to set the same audio port used in production.
    await fs.appendFile(config, `\n[vendrava-smoke-record]\nexten => ${uuid},1,Set(VENDRAVA_AUDIO_PORT=9094)\n same => n,Goto(vendrava-recorded,${uuid},1)\n`)
    execFileSync('asterisk', ['-rx', 'dialplan reload'])
    execFileSync('asterisk', ['-rx', `channel originate Local/tone@vendrava-smoke/n extension ${uuid}@vendrava-smoke-record`])
    for (let i = 0; i < 100 && !completed; i++) await delay(100)
    if (!completed || errors.length) throw new Error('Audio session did not finish cleanly: ' + errors.join(','))
    await delay(300)
    const file = await completedRecording(uuid)
    const pieces = []
    for await (const part of file.stream()) pieces.push(part)
    const wav = Buffer.concat(pieces)
    function strength(pcm, rate, hz) {
      let sin = 0, cos = 0
      for (let i = 0; i < pcm.length / 2; i++) {
        const value = pcm.readInt16LE(i * 2)
        sin += value * Math.sin(2 * Math.PI * hz * i / rate)
        cos += value * Math.cos(2 * Math.PI * hz * i / rate)
      }
      return Math.round(2 * Math.hypot(sin, cos) / (pcm.length / 2))
    }
    const dataIndex = wav.indexOf(Buffer.from('data'), 12)
    if (dataIndex < 0) throw new Error('WAV has no data')
    const pcm = wav.subarray(dataIndex + 8)
    const callerTone = strength(pcm, 8000, 440), agentTone = strength(pcm, 8000, 880)
    if (incoming.length < 16000 || callerTone < 100 || agentTone < 100) throw new Error('Missing bidirectional audio in recording')
    console.log(JSON.stringify({ test: 'internal-audiosocket-mixmonitor', ok: true, uuid, inputBytes: incoming.length, outputBytes, wavBytes: wav.length, callerTone, agentTone }))
  } finally {
    await server.shutdown().catch(() => {})
    const now = await fs.readFile(mainConfig, 'utf8')
    await fs.writeFile(mainConfig, now.replace('\n#include "vendrava-smoke.conf"\n', ''))
    await fs.unlink(config).catch(() => {})
    execFileSync('asterisk', ['-rx', 'dialplan reload'])
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
