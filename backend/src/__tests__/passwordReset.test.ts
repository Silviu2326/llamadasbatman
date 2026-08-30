import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResetToken } from '../services/passwordReset.service'

// El servicio consulta la base para resolver el usuario; lo que se prueba aquí
// es la firma, que es la parte que decide si un enlace vale o no.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(48)

test('el enlace de reseteo lleva usuario, caducidad y firma', () => {
  const token = buildResetToken('user-1', 'hash-actual', Date.parse('2026-08-11T10:00:00Z'))
  const [userId, expiresAt, signature] = token.split('.')
  assert.equal(userId, 'user-1')
  assert.equal(Number(expiresAt), Date.parse('2026-08-11T11:00:00Z'))
  assert.ok(signature.length >= 40)
})

test('cambiar la contraseña invalida los enlaces ya emitidos', () => {
  const at = Date.parse('2026-08-11T10:00:00Z')
  const before = buildResetToken('user-1', 'hash-viejo', at)
  const after = buildResetToken('user-1', 'hash-nuevo', at)
  // Misma caducidad y mismo usuario: si la firma no cambiara, un enlace antiguo
  // seguiría sirviendo después de usarlo.
  assert.notEqual(before, after)
})

test('dos usuarios distintos no comparten firma', () => {
  const at = Date.parse('2026-08-11T10:00:00Z')
  assert.notEqual(
    buildResetToken('user-1', 'hash', at).split('.')[2],
    buildResetToken('user-2', 'hash', at).split('.')[2],
  )
})
