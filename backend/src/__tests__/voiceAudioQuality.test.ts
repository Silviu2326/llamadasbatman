import assert from 'node:assert/strict'
import test from 'node:test'
import { AudioBridge } from '../voice/audio/bridge'
import { InboundAudioProcessor, rmsLevel } from '../voice/audio/dsp'

function pcmSine(sampleRate: number, frequency: number, durationMs: number, amplitude = 0.5): Buffer {
  const samples = Math.round(sampleRate * durationMs / 1000)
  const output = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) {
    output.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * index / sampleRate) * 32767 * amplitude), index * 2)
  }
  return output
}

test('stateful outbound resampling is independent of websocket chunk boundaries', () => {
  const input = pcmSine(24_000, 1_000, 240)
  const oneShot = new AudioBridge()
  const expected = [...oneShot.geminiToTwilioFrames(input), ...oneShot.flush()]

  const streamed = new AudioBridge()
  const actual = [
    ...streamed.geminiToTwilioFrames(input.subarray(0, 3_842)),
    ...streamed.geminiToTwilioFrames(input.subarray(3_842, 7_910)),
    ...streamed.geminiToTwilioFrames(input.subarray(7_910)),
    ...streamed.flush(),
  ]

  assert.deepEqual(Buffer.concat(actual), Buffer.concat(expected))
  assert.ok(actual.every(frame => frame.length === 160))
})

test('stateful inbound reconstruction is independent of Twilio frame boundaries', () => {
  const ulaw = Buffer.alloc(480)
  for (let index = 0; index < ulaw.length; index += 1) ulaw[index] = index % 256
  const oneShot = new AudioBridge().twilioToGemini(ulaw)
  const streamedBridge = new AudioBridge()
  const streamed = Buffer.concat([
    streamedBridge.twilioToGemini(ulaw.subarray(0, 160)),
    streamedBridge.twilioToGemini(ulaw.subarray(160, 320)),
    streamedBridge.twilioToGemini(ulaw.subarray(320)),
  ])
  assert.deepEqual(streamed, oneShot)
  assert.equal(streamed.length, ulaw.length * 4)
})

test('stateful inbound DSP closes softly on noise and recovers without clipping', () => {
  const processor = new InboundAudioProcessor()
  const silence = Buffer.alloc(640)
  for (let index = 0; index < 20; index += 1) processor.process(silence)
  assert.ok(processor.state().gate < 0.5)

  const speech = pcmSine(16_000, 440, 20, 0.7)
  const processed = processor.process(speech)
  assert.ok(rmsLevel(processed) > 0)
  for (let index = 0; index < processed.length; index += 2) {
    assert.ok(Math.abs(processed.readInt16LE(index)) <= 32767)
  }
})
