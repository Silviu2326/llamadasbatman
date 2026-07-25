#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scenariosDir = path.join(root, 'fixtures', 'voice-scenarios')
const requested = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const files = requested.length
  ? requested.map(id => path.join(scenariosDir, `${id}.json`))
  : fs.readdirSync(scenariosDir).filter(file => file.endsWith('.json')).sort().map(file => path.join(scenariosDir, file))

const required = ['id', 'language', 'persona', 'objective', 'turns', 'successCriteria', 'criticalErrors']
const results = []
for (const file of files) {
  const scenario = JSON.parse(fs.readFileSync(file, 'utf8'))
  const missing = required.filter(key => scenario[key] === undefined)
  if (missing.length || !Array.isArray(scenario.turns) || scenario.turns.length === 0) {
    throw new Error(`${path.basename(file)} inválido: ${missing.join(', ') || 'turns'}`)
  }
  results.push({ id: scenario.id, turns: scenario.turns.length, objective: scenario.objective, valid: true })
}

console.log(JSON.stringify({ scenarios: results, count: results.length }, null, 2))
