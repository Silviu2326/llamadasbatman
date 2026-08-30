process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertAuditablePublicUrl, fetchHtml } from '../services/digitalAudit.service'

test('la auditoría rechaza rangos privados antes del fetch', async () => {
  for (const value of [
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.2',
    'http://[::1]/',
    'http://localhost.local/',
    'https://user:secret@example.com/',
  ]) {
    await assert.rejects(() => assertAuditablePublicUrl(value), /AUDIT_URL_BLOCKED/)
  }
})

test('la auditoría no sigue una redirección pública hacia una red privada', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })
  }) as typeof fetch
  try {
    const result = await fetchHtml('http://93.184.216.34/', 2_000)
    assert.equal(calls, 1)
    assert.equal(result.status, 0)
    assert.equal(result.html, '')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('la auditoría limita el tamaño anunciado del HTML', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('x', {
    status: 200,
    headers: { 'content-type': 'text/html', 'content-length': '3000000' },
  })) as typeof fetch
  try {
    const result = await fetchHtml('http://93.184.216.34/', 2_000)
    assert.equal(result.status, 0)
    assert.equal(result.html, '')
  } finally {
    globalThis.fetch = originalFetch
  }
})
