import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const routeSource = (file: string) => readFileSync(resolve(process.cwd(), 'src/routes', file), 'utf8')

const coverage = [
  { file: 'leads.ts', capabilities: ['crm'], limit: 'resource: \'leads\'' },
  { file: 'meetings.ts', capabilities: ['crm'], limit: undefined },
  { file: 'pipeline.ts', capabilities: ['crm'], limit: undefined },
  { file: 'tasks.ts', capabilities: ['crm'], limit: undefined },
  { file: 'accounts.ts', capabilities: ['crm'], limit: undefined },
  { file: 'campaigns.ts', capabilities: ['growth', 'agents'], limit: 'resource: \'campaigns\'' },
  { file: 'funnels.ts', capabilities: ['growth'], limit: 'resource: \'campaigns\'' },
  { file: 'knowledge.ts', capabilities: ['agents'], limit: undefined },
  { file: 'playbooks.ts', capabilities: ['agents'], limit: undefined },
] as const

test('las rutas CRM declaran entitlement de plan para toda su superficie', () => {
  for (const entry of coverage) {
    const source = routeSource(entry.file)
    assert.match(source, /requireEntitlement\(/, `${entry.file} debe tener un guard de plan`)
    for (const capability of entry.capabilities) {
      assert.match(source, new RegExp(`requireEntitlement\\(['"]${capability}['"]`), `${entry.file} debe proteger ${capability}`)
    }
    if (entry.limit) {
      assert.match(source, new RegExp(`requireEntitlement\\([^\\n]*${entry.limit}`), `${entry.file} debe aplicar el límite ${entry.limit}`)
    }
  }
})

test('las rutas CRM no aplican límites de agentes o automatizaciones por error', () => {
  for (const entry of coverage) {
    const source = routeSource(entry.file)
    assert.doesNotMatch(source, /resource:\s*['"](?:agents|automations|users|workspaces)['"]/, `${entry.file} no debe consumir un límite ajeno a su creación`)
  }
})
