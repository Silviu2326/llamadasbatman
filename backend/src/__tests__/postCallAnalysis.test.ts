import assert from 'node:assert/strict'
import test from 'node:test'
import { concatWavs, parseModelJson } from '../voice/analysis/postCallAnalysis'

function wav(dataBytes: number, sampleRate = 16000): Buffer {
  const data = Buffer.alloc(dataBytes, 7)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

test('concatWavs merges PCM data and rewrites the header', () => {
  const merged = concatWavs([wav(100), wav(60)], 16000)
  assert.equal(merged.length, 44 + 160)
  assert.equal(merged.toString('ascii', 0, 4), 'RIFF')
  assert.equal(merged.readUInt32LE(40), 160)          // data size
  assert.equal(merged.readUInt32LE(24), 16000)        // sample rate
  assert.equal(merged.readUInt32LE(4), 36 + 160)      // riff size
  assert.equal(merged[44], 7)                          // primer byte de datos, no de cabecera
})

test('parseModelJson tolerates fences and surrounding prose', () => {
  const parsed = parseModelJson('Claro:\n```json\n{"lead_score": 80, "resumen": "ok"}\n```\ngracias')
  assert.deepEqual(parsed, { lead_score: 80, resumen: 'ok' })
  assert.equal(parseModelJson('no hay json aqui'), null)
})
