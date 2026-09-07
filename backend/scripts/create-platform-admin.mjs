#!/usr/bin/env node
/**
 * Crea de cero la cuenta de operador del back office.
 *
 * `create-org.mjs` da de alta a un CLIENTE y `grant-platform-admin.mjs` concede
 * el privilegio a alguien que ya existe. Faltaba el caso del primer día: no hay
 * ninguna cuenta a la que concederle nada. Esto lo resuelve en un comando —
 * organización de servicio, usuario propietario, membresía por defecto y el
 * flag— en una sola transacción, para que no quede a medias.
 *
 * Sigue siendo un comando de servidor y no un endpoint, por el mismo motivo que
 * el resto del privilegio: crear operadores desde la propia interfaz haría que
 * comprometer una cuenta bastara para hacerse persistente.
 *
 * Uso:
 *   node --env-file=.env scripts/create-platform-admin.mjs admin@empresa.com
 *   node --env-file=.env scripts/create-platform-admin.mjs admin@empresa.com --name="Silviu" --org="Operaciones"
 *
 * Si el usuario ya existe no se toca su contraseña: solo se le concede el
 * privilegio, de modo que reejecutarlo es seguro.
 */
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const PLANS = ['free', 'pro', 'completo', 'agency']

const args = process.argv.slice(2)
function option(flag, fallback) {
  const match = args.find(arg => arg.startsWith(`--${flag}=`))
  return match ? match.slice(flag.length + 3).trim() : fallback
}

const email = args.find(arg => !arg.startsWith('--'))?.trim().toLowerCase()
const name = option('name', 'Operador de plataforma')
const orgName = option('org', 'Operaciones de plataforma')
// La organización del operador no es un cliente: no se factura ni cuenta como
// tenant, así que se le da el plan completo para que las pantallas normales del
// producto no le muestren límites que no significan nada en su caso.
const plan = option('plan', 'completo').toLowerCase()

if (!email) {
  console.error('Uso: node --env-file=.env scripts/create-platform-admin.mjs admin@empresa.com [--name="…"] [--org="…"] [--plan=completo]')
  process.exit(1)
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`Email no válido: ${email}`)
  process.exit(1)
}
if (!PLANS.includes(plan)) {
  console.error(`Plan no válido: ${plan}. Opciones: ${PLANS.join(', ')}`)
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, isPlatformAdmin: true },
  })

  if (existing) {
    if (existing.isPlatformAdmin) {
      console.log(`Sin cambios: ${email} ya es operador de plataforma. Entra en /backoffice con su contraseña actual.`)
    } else {
      await prisma.$transaction(async tx => {
        await tx.user.update({ where: { id: existing.id }, data: { isPlatformAdmin: true } })
        await tx.platformAuditLog.create({
          data: {
            actorUserId: null,
            actorEmail: 'cli:create-platform-admin',
            action: 'platform_admin.grant',
            entityType: 'User',
            entityId: existing.id,
            targetUserId: existing.id,
            before: { isPlatformAdmin: false },
            after: { isPlatformAdmin: true },
            reason: 'Concedido sobre una cuenta existente desde scripts/create-platform-admin.mjs',
          },
        })
      })
      console.log(`Concedido: ${email} (${existing.name}) ya puede entrar en /backoffice con su contraseña actual.`)
    }
    process.exit(0)
  }

  // 24 bytes en base64url: se enseña una vez y no hace falta forzar rotación.
  const password = randomBytes(24).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 12)

  const created = await prisma.$transaction(async tx => {
    const org = await tx.organization.create({ data: { name: orgName, plan } })
    const user = await tx.user.create({
      data: { orgId: org.id, email, passwordHash, name, role: 'owner', isPlatformAdmin: true },
      select: { id: true, email: true, name: true },
    })
    // `isDefault: true` explícito: sin una membresía por defecto el login
    // elegiría organización por antigüedad, y esta cuenta debe entrar siempre
    // en la misma.
    await tx.organizationMembership.create({
      data: { orgId: org.id, userId: user.id, role: 'owner', status: 'active', isDefault: true },
    })
    await tx.platformAuditLog.create({
      data: {
        actorUserId: null,
        actorEmail: 'cli:create-platform-admin',
        action: 'platform_admin.create',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id,
        orgId: org.id,
        after: { email: user.email, orgId: org.id, isPlatformAdmin: true },
        reason: 'Alta del operador de plataforma desde scripts/create-platform-admin.mjs',
      },
    })
    return { org, user }
  })

  console.log('\nOperador de plataforma creado')
  console.log(`  email:    ${created.user.email}`)
  console.log(`  password: ${password}`)
  console.log(`  nombre:   ${created.user.name}`)
  console.log(`  org:      ${created.org.name} (${created.org.plan}) — ${created.org.id}`)
  console.log('\nEsta contraseña no se vuelve a mostrar. Entra por /login y aterrizarás en /backoffice.')
  console.log('Para retirarle el privilegio: npm run platform:admin -- ' + created.user.email + ' --revoke\n')
} catch (error) {
  console.error('No se pudo crear el operador:', error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
