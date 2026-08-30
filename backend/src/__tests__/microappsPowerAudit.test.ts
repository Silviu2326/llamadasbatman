process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../providers'
import { listMicroapps } from '../microapps/registry'
import { auditMicroappPower } from '../microapps/powerAudit'

test('la matriz de potencia cubre 147/147 y todas superan las diez puertas comunes', () => {
  const apps = listMicroapps()
  assert.equal(apps.length, 147)
  const audits = apps.map(auditMicroappPower)
  const failures = audits.filter(audit => audit.score !== 100)
  assert.deepEqual(failures, [], failures.map(item => `${item.microappId} (${item.score}): ${item.issues.join(', ')}`).join('\n'))
  assert.equal(new Set(audits.map(audit => audit.microappId)).size, 147)
})

