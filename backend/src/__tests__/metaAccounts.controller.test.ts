import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma'
import { encryptToken } from '../lib/tokenCrypto'
import { budgetCap, pixelId, select } from '../controllers/metaAccounts.controller'

// Pruebas sin red ni base de datos: prisma y fetch se sustituyen y se comprueba
// que el controlador valida el cuerpo antes de tocar el servicio.

const originalFetch = globalThis.fetch
const originalUpdateMany = prisma.metaAdAccount.updateMany
const originalFindFirst = prisma.metaAdAccount.findFirst
const originalUpdate = prisma.metaAdAccount.update
const originalDeleteMany = prisma.metaAdAccount.deleteMany
const originalKey = process.env.META_TOKEN_ENCRYPTION_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  prisma.metaAdAccount.updateMany = originalUpdateMany
  prisma.metaAdAccount.findFirst = originalFindFirst
  prisma.metaAdAccount.update = originalUpdate
  prisma.metaAdAccount.deleteMany = originalDeleteMany
  if (originalKey === undefined) delete process.env.META_TOKEN_ENCRYPTION_KEY
  else process.env.META_TOKEN_ENCRYPTION_KEY = originalKey
})

function fakeReply() {
  const state: { status: number; body: unknown } = { status: 200, body: undefined }
  const reply = {
    status(code: number) { state.status = code; return reply },
    send(body: unknown) { state.body = body; return reply },
  }
  return { reply: reply as unknown as FastifyReply, state }
}

function fakeRequest(body: unknown) {
  return {
    user: { userId: 'u1', orgId: 'org-1', role: 'admin', email: 'a@b.c' },
    params: { id: 'acc-1' },
    body,
  } as unknown as FastifyRequest<{ Params: { id: string }; Body: unknown }>
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('budget-cap valida enteros en céntimos y admite null para quitar el tope', async () => {
  const received: unknown[] = []
  prisma.metaAdAccount.updateMany = (async (args: { data: { dailyBudgetCapCents: unknown } }) => {
    received.push(args.data.dailyBudgetCapCents)
    return { count: 1 }
  }) as unknown as typeof prisma.metaAdAccount.updateMany

  for (const body of [{}, { dailyBudgetCapCents: -1 }, { dailyBudgetCapCents: 12.5 }, { dailyBudgetCapCents: '100' }, { dailyBudgetCapCents: 100, extra: true }, null]) {
    const { reply, state } = fakeReply()
    await budgetCap(fakeRequest(body), reply)
    assert.equal(state.status, 400, JSON.stringify(body))
    assert.ok(Array.isArray((state.body as { issues: unknown[] }).issues))
  }
  assert.equal(received.length, 0)

  const ok = fakeReply()
  await budgetCap(fakeRequest({ dailyBudgetCapCents: 2500 }), ok.reply)
  assert.equal(ok.state.status, 200)
  const cleared = fakeReply()
  await budgetCap(fakeRequest({ dailyBudgetCapCents: null }), cleared.reply)
  assert.equal(cleared.state.status, 200)
  assert.deepEqual(received, [2500, null])
})

test('pixel-id exige 5-30 dígitos o null', async () => {
  const received: unknown[] = []
  prisma.metaAdAccount.updateMany = (async (args: { data: { metaPixelId: unknown } }) => {
    received.push(args.data.metaPixelId)
    return { count: 1 }
  }) as unknown as typeof prisma.metaAdAccount.updateMany

  for (const body of [{ metaPixelId: '' }, { metaPixelId: '1234' }, { metaPixelId: 'abc123456' }, { metaPixelId: '1'.repeat(31) }, {}]) {
    const { reply, state } = fakeReply()
    await pixelId(fakeRequest(body), reply)
    assert.equal(state.status, 400, JSON.stringify(body))
  }
  assert.equal(received.length, 0)

  const ok = fakeReply()
  await pixelId(fakeRequest({ metaPixelId: ' 123456789012345 ' }), ok.reply)
  assert.equal(ok.state.status, 200)
  const cleared = fakeReply()
  await pixelId(fakeRequest({ metaPixelId: null }), cleared.reply)
  assert.deepEqual(received, ['123456789012345', null])
})

test('select valida ids, solo acepta cuentas y páginas del token y actualiza la conexión', async () => {
  process.env.META_TOKEN_ENCRYPTION_KEY = 'k'.repeat(40)
  const bad = fakeReply()
  await select(fakeRequest({ adAccountId: 'act_1; drop', pageId: 'x' }), bad.reply)
  assert.equal(bad.state.status, 400)

  // Sin cuenta conectada: 404 con código, sin llamar a Graph.
  prisma.metaAdAccount.findFirst = (async () => null) as unknown as typeof prisma.metaAdAccount.findFirst
  globalThis.fetch = (async () => { throw new Error('Graph no debe llamarse sin cuenta') }) as typeof fetch
  const missing = fakeReply()
  await select(fakeRequest({ adAccountId: 'act_99' }), missing.reply)
  assert.equal(missing.state.status, 404)

  prisma.metaAdAccount.findFirst = (async () => ({
    id: 'acc-1', orgId: 'org-1', metaAdAccountId: 'act_1', metaPageId: '111', status: 'connected',
    systemUserTokenEnc: encryptToken('long-lived-token'),
  })) as unknown as typeof prisma.metaAdAccount.findFirst
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    assert.equal(url.includes('long-lived-token'), true)
    if (url.includes('/me/adaccounts')) return jsonResponse({ data: [{ id: 'act_1', name: 'Principal' }, { id: 'act_2', name: 'Secundaria' }] })
    if (url.includes('/me/accounts')) return jsonResponse({ data: [{ id: '111', name: 'Página' }] })
    throw new Error(`Unexpected Meta request: ${url}`)
  }) as typeof fetch

  const notAllowed = fakeReply()
  await select(fakeRequest({ adAccountId: 'act_99', pageId: null }), notAllowed.reply)
  assert.equal(notAllowed.state.status, 409)
  assert.equal((notAllowed.state.body as { code: string }).code, 'META_AD_ACCOUNT_NOT_ALLOWED')

  const badPage = fakeReply()
  await select(fakeRequest({ adAccountId: 'act_2', pageId: '999' }), badPage.reply)
  assert.equal((badPage.state.body as { code: string }).code, 'META_PAGE_NOT_ALLOWED')

  let deletedStale = false
  const captured: { data?: Record<string, unknown> } = {}
  prisma.metaAdAccount.deleteMany = (async () => { deletedStale = true; return { count: 0 } }) as unknown as typeof prisma.metaAdAccount.deleteMany
  prisma.metaAdAccount.update = (async (args: { data: Record<string, unknown> }) => {
    captured.data = args.data
    return { id: 'acc-1', orgId: 'org-1', status: 'connected', systemUserTokenEnc: 'secret', ...args.data }
  }) as unknown as typeof prisma.metaAdAccount.update

  const ok = fakeReply()
  await select(fakeRequest({ adAccountId: 'act_2', pageId: '111' }), ok.reply)
  assert.equal(ok.state.status, 200)
  assert.equal(deletedStale, true)
  assert.equal(captured.data?.metaAdAccountId, 'act_2')
  assert.equal(captured.data?.metaPageId, '111')
  // El token cifrado nunca sale en la respuesta.
  assert.equal('systemUserTokenEnc' in (ok.state.body as object), false)

  // Graph caído: 502 con mensaje seguro, sin cuerpo del proveedor.
  globalThis.fetch = (async () => jsonResponse({ error: { message: 'token=secret' } }, 500)) as typeof fetch
  const down = fakeReply()
  await select(fakeRequest({ adAccountId: 'act_2' }), down.reply)
  assert.equal(down.state.status, 502)
  assert.equal(String((down.state.body as { error: string }).error).includes('secret'), false)
})
