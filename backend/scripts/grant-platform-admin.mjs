#!/usr/bin/env node
/**
 * Concede o retira el privilegio de operador del back office de plataforma.
 *
 * Es deliberadamente un comando de servidor y no un endpoint. El back office
 * puede cambiar roles, planes y contraseñas de cualquier tenant; si además
 * pudiera crear operadores nuevos desde su propia interfaz, comprometer una
 * sola cuenta bastaría para hacerse persistente y revocarla dejaría de servir
 * de nada. Para conceder el privilegio hay que tener acceso al servidor y a la
 * base de datos, que es exactamente el nivel de acceso que ya implica.
 *
 * Uso:
 *   node --env-file=.env scripts/grant-platform-admin.mjs persona@empresa.com
 *   node --env-file=.env scripts/grant-platform-admin.mjs persona@empresa.com --revoke
 *   node --env-file=.env scripts/grant-platform-admin.mjs --list
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const args = process.argv.slice(2)
const revoke = args.includes('--revoke')
const list = args.includes('--list')
const email = args.find(arg => !arg.startsWith('--'))?.trim().toLowerCase()

async function main() {
  if (list) {
    const admins = await prisma.user.findMany({
      where: { isPlatformAdmin: true },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!admins.length) {
      console.log('No hay ningún operador de plataforma. El back office está cerrado para todos.')
      return
    }
    console.log(`Operadores de plataforma (${admins.length}):`)
    for (const admin of admins) console.log(`  · ${admin.email}  ${admin.name}  [${admin.id}]`)
    return
  }

  if (!email) {
    console.error('Uso: node --env-file=.env scripts/grant-platform-admin.mjs persona@empresa.com [--revoke]')
    console.error('     node --env-file=.env scripts/grant-platform-admin.mjs --list')
    process.exitCode = 1
    return
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, isPlatformAdmin: true } })
  if (!user) {
    console.error(`No existe ningún usuario con el email ${email}.`)
    process.exitCode = 1
    return
  }

  const next = !revoke
  if (user.isPlatformAdmin === next) {
    console.log(`Sin cambios: ${email} ya ${next ? 'es' : 'no es'} operador de plataforma.`)
    return
  }

  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { isPlatformAdmin: next } })
    // Al retirar el privilegio se cierran sus sesiones: `requirePlatformAdmin`
    // ya consulta la base en cada petición, pero cortar aquí deja el efecto
    // completo y explícito en un solo paso.
    if (!next) {
      await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    }
    await tx.platformAuditLog.create({
      data: {
        actorUserId: null,
        actorEmail: 'cli:grant-platform-admin',
        action: next ? 'platform_admin.grant' : 'platform_admin.revoke',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id,
        before: { isPlatformAdmin: user.isPlatformAdmin },
        after: { isPlatformAdmin: next },
        reason: 'Ejecutado desde scripts/grant-platform-admin.mjs',
      },
    })
  })

  console.log(next
    ? `Concedido: ${email} (${user.name}) ya puede entrar en /backoffice.`
    : `Retirado: ${email} ya no tiene acceso al back office y sus sesiones se han cerrado.`)
}

main()
  .catch(error => {
    console.error('Error:', error.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
