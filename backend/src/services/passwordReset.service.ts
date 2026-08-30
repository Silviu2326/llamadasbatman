import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { hashPassword } from './auth.service'
import { isEmailConfigured, sendTransactionalEmail } from './transactionalEmail.service'

/**
 * Token de reseteo sin tabla nueva: se firma con HMAC sobre el id del usuario,
 * su hash de contraseña actual y una caducidad.
 *
 * ponytail: el hash actual va dentro de la firma, así que en cuanto la
 * contraseña cambia todos los enlaces emitidos dejan de validar. Eso da un solo
 * uso efectivo sin persistir nada ni añadir una migración. Si algún día hace
 * falta revocar enlaces uno a uno o auditarlos, entonces sí toca tabla.
 */
const TOKEN_TTL_MS = 60 * 60 * 1000

function secret(): string {
  const value = process.env.JWT_SECRET?.trim()
  if (!value || value.length < 32) throw new Error('JWT_SECRET no configurado: no se pueden firmar enlaces de reseteo')
  return `${value}:password-reset`
}

function sign(userId: string, passwordHash: string, expiresAt: number): string {
  return createHmac('sha256', secret()).update(`${userId}.${passwordHash}.${expiresAt}`).digest('base64url')
}

export function buildResetToken(userId: string, passwordHash: string, now = Date.now()): string {
  const expiresAt = now + TOKEN_TTL_MS
  return `${userId}.${expiresAt}.${sign(userId, passwordHash, expiresAt)}`
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export type ResetOutcome = 'ok' | 'invalid' | 'expired' | 'weak_password'

export async function resetPassword(token: string, newPassword: string, now = Date.now()): Promise<ResetOutcome> {
  if (typeof newPassword !== 'string' || newPassword.length < 10) return 'weak_password'
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3) return 'invalid'
  const [userId, rawExpiry, signature] = parts
  const expiresAt = Number(rawExpiry)
  if (!Number.isFinite(expiresAt)) return 'invalid'
  if (expiresAt < now) return 'expired'

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } })
  if (!user) return 'invalid'
  if (!safeEqual(signature, sign(user.id, user.passwordHash, expiresAt))) return 'invalid'

  const password = await hashPassword(newPassword)
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: password } }),
    // Cambiar la contraseña cierra las sesiones abiertas: si alguien entró con
    // la anterior, este es el momento de echarlo.
    prisma.authSession.deleteMany({ where: { userId: user.id } }),
  ])
  return 'ok'
}

/**
 * Nunca revela si el email existe: responde igual en los dos casos. Devuelve
 * el enlace solo cuando no hay proveedor de email configurado y el entorno no
 * es producción, para poder probarlo en local.
 */
export async function requestPasswordReset(email: string, appUrl: string): Promise<{ debugLink?: string }> {
  const normalized = String(email ?? '').trim().toLowerCase()
  if (!normalized) return {}
  // `orgId` viaja al ledger de consumo: el reseteo lo paga la organización del usuario.
  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, passwordHash: true, name: true, orgId: true } })
  if (!user) return {}

  const token = buildResetToken(user.id, user.passwordHash)
  const link = `${appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`

  if (isEmailConfigured()) {
    await sendTransactionalEmail({
      to: normalized,
      usage: { orgId: user.orgId },
      subject: 'Restablece tu contraseña',
      html: `<p>Hola${user.name ? ` ${user.name}` : ''},</p>
<p>Has pedido restablecer tu contraseña. El enlace caduca en una hora y solo funciona una vez:</p>
<p><a href="${link}">Restablecer contraseña</a></p>
<p>Si no has sido tú, ignora este mensaje: tu contraseña actual sigue siendo válida.</p>`,
    }).catch(error => console.warn('[AUTH] no se pudo enviar el email de reseteo:', (error as Error).message))
    return {}
  }

  console.warn('[AUTH] RESEND_API_KEY sin configurar: enlace de reseteo generado pero no enviado')
  return process.env.NODE_ENV === 'production' ? {} : { debugLink: link }
}
