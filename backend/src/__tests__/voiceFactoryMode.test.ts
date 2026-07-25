import assert from 'node:assert/strict'
import test from 'node:test'
import { configuredVoiceArchitecture, configuredVoiceEngineMode } from '../voice/engine/factory'

function withEnv(values: Record<string, string | undefined>, callback: () => void): void {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    callback()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('self-hosted voice is the effective default', () => {
  withEnv({ VOICE_ENGINE_MODE: undefined, VOICE_ENGINE_ALLOW_PROPRIETARY: undefined }, () => {
    assert.equal(configuredVoiceEngineMode(), 'remote')
  })
})

test('legacy voice requires an explicit proprietary opt-in', () => {
  withEnv({ VOICE_ENGINE_MODE: 'legacy', VOICE_ENGINE_ALLOW_PROPRIETARY: undefined }, () => {
    assert.equal(configuredVoiceEngineMode(), 'remote')
  })
  withEnv({ VOICE_ENGINE_MODE: 'legacy', VOICE_ENGINE_ALLOW_PROPRIETARY: 'true' }, () => {
    assert.equal(configuredVoiceEngineMode(), 'legacy')
  })
})

test('modular architecture is the safe default', () => {
  withEnv({ VOICE_ENGINE_ARCHITECTURE: undefined }, () => {
    assert.equal(configuredVoiceArchitecture(), 'modular')
  })
})

test('duplex architecture can be selected by deployment configuration', () => {
  withEnv({ VOICE_ENGINE_ARCHITECTURE: 'duplex' }, () => {
    assert.equal(configuredVoiceArchitecture(), 'duplex')
  })
})

test('voice experiment payload overrides the deployment default', () => {
  withEnv({ VOICE_ENGINE_ARCHITECTURE: 'modular' }, () => {
    assert.equal(configuredVoiceArchitecture({
      metadata: { voiceExperiment: { payload: { architecture: 'duplex' } } },
    }), 'duplex')
  })
})
