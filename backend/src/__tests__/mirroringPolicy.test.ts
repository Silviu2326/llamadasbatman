import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mirrorPolicy, serToEmocion } from '../voice/tts/mirroringPolicy'

test('calma al prospecto molesto: voz calm, ritmo lento, pausa larga', () => {
  const s = mirrorPolicy({ emocion: 'molesto', acustico: 'agitado' })
  assert.equal(s.voice, 'calm')
  assert.ok(s.rate < 1)
  assert.ok(s.preResponsePauseMs >= 400)
})

test('acompaña al interesado con energia y poca pausa', () => {
  const s = mirrorPolicy({ emocion: 'interesado', acustico: 'energico' })
  assert.equal(s.voice, 'energetic')
  assert.ok(s.rate > 1)
  assert.ok(s.preResponsePauseMs < 200)
})

test('espeja el ritmo por wpm y respeta los limites', () => {
  assert.ok(mirrorPolicy({ emocion: 'neutro', acustico: 'calmado', wpm: 250 }).rate > 1)
  assert.ok(mirrorPolicy({ emocion: 'molesto', acustico: 'agitado', wpm: 80 }).rate >= 0.88)
  assert.ok(mirrorPolicy({ emocion: 'interesado', acustico: 'energico', wpm: 300 }).rate <= 1.12)
})

test('mapea etiquetas SER al vocabulario del sistema', () => {
  assert.equal(serToEmocion('ang'), 'molesto')
  assert.equal(serToEmocion('hap'), 'interesado')
  assert.equal(serToEmocion('otra'), 'neutro')
})
