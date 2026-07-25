import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createProspectState, decideNextAction } from '../voice/intelligence/salesBrain'

const root = process.cwd()
const dir = path.join(root, 'fixtures', 'voice-scenarios')

test('voice scenario fixtures are reproducible and exercise the Sales Brain', () => {
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.json')).sort()
  assert.ok(files.length >= 3)
  for (const file of files) {
    const scenario = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    let state = createProspectState()
    for (const turn of scenario.turns) state = decideNextAction(state, turn.text, 1000).state
    assert.ok(state.evidence.length > 0, file)
    assert.ok(Array.isArray(scenario.criticalErrors), file)
  }
})
