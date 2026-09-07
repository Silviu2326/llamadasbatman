import assert from 'node:assert/strict'
import test from 'node:test'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { requirePlatformAdmin } from '../access-control/platformAdmin'
import { getPermissionMatrix } from '../services/backOffice.service'
import { PERMISSIONS, ROLE_GRANTS, ROLE_KEYS } from '../access-control'

/**
 * Estos casos cubren las salidas del guard que ocurren ANTES de tocar la base:
 * son precisamente las dos vías de escalada que el back office cierra a
 * propósito, así que deben seguir denegando aunque no haya Postgres delante.
 */
function fakeReply() {
  const state: { status: number | null; body: unknown } = { status: null, body: null }
  const reply = {
    status(code: number) {
      state.status = code
      return reply
    },
    send(body: unknown) {
      state.body = body
      return reply
    },
  }
  return { reply: reply as unknown as FastifyReply, state }
}

function fakeRequest(user: Record<string, unknown>) {
  return { user, ip: '203.0.113.10', correlationId: 'test' } as unknown as FastifyRequest
}

test('una clave de API nunca entra en el back office aunque su usuario sea operador', async () => {
  const { reply, state } = fakeReply()
  await requirePlatformAdmin(
    fakeRequest({ userId: 'user-1', orgId: 'org-1', role: 'owner', email: 'a@b.c', tokenType: 'api_key', apiKeyId: 'key-1' }),
    reply,
  )

  assert.equal(state.status, 403)
  assert.equal((state.body as { code?: string }).code, 'SESSION_REQUIRED')
})

test('una sesion suplantada no puede volver al back office', async () => {
  const { reply, state } = fakeReply()
  await requirePlatformAdmin(
    fakeRequest({ userId: 'user-2', orgId: 'org-1', role: 'owner', email: 'a@b.c', tokenType: 'access', sessionId: 'sess-1', impersonated: true }),
    reply,
  )

  assert.equal(state.status, 403)
  assert.equal((state.body as { code?: string }).code, 'IMPERSONATION_ACTIVE')
})

test('un token sin sessionId se rechaza antes de consultar nada', async () => {
  const { reply, state } = fakeReply()
  await requirePlatformAdmin(
    fakeRequest({ userId: 'user-3', orgId: 'org-1', role: 'owner', email: 'a@b.c', tokenType: 'access' }),
    reply,
  )

  assert.equal(state.status, 403)
  assert.equal((state.body as { code?: string }).code, 'SESSION_REQUIRED')
})

test('unos claims invalidos se deniegan sin construir principal', async () => {
  const { reply, state } = fakeReply()
  await requirePlatformAdmin(
    fakeRequest({ userId: 'user-4', orgId: 'org-1', role: 'rol_inventado', email: 'a@b.c', tokenType: 'access', sessionId: 'sess-2' }),
    reply,
  )

  assert.equal(state.status, 403)
})

test('la matriz de permisos refleja el catalogo estatico y se declara no editable', () => {
  const matrix = getPermissionMatrix()

  assert.equal(matrix.editable, false)
  assert.equal(matrix.roles.length, ROLE_KEYS.length)
  assert.equal(matrix.permissions.length, PERMISSIONS.length)

  // El owner conserva todo el catálogo con alcance de organización.
  const owner = matrix.roles.find(role => role.key === 'owner')
  assert.equal(owner?.permissionCount, ROLE_GRANTS.owner.length)

  // Y un permiso concreto expone el mismo alcance que concede la matriz.
  const leadsWrite = matrix.permissions.find(permission => permission.key === 'leads.write')
  assert.equal(
    leadsWrite?.roles.find(entry => entry.role === 'sales_rep')?.scope,
    ROLE_GRANTS.sales_rep.find(grant => grant.permission === 'leads.write')?.scope,
  )
  // Un rol sin el permiso no aparece en la lista: la celda vacía es denegación.
  assert.equal(leadsWrite?.roles.some(entry => entry.role === 'guest'), false)
})
