#!/usr/bin/env node
/**
 * Alta de una organización nueva con su usuario propietario.
 *
 * Hasta ahora la única forma de dar de alta a un cliente era el seed de
 * desarrollo o SQL a mano. Esto no abre registro público —esa es otra decisión,
 * ver docs/BLOQUEANTES.md §2— pero deja el onboarding asistido en un comando.
 *
 * Uso:
 *   node --env-file=.env scripts/create-org.mjs "Nombre Cliente" admin@cliente.com [plan]
 *
 * La contraseña se genera al azar y se imprime una sola vez.
 */
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const PLANS = ['free', 'pro', 'completo', 'agency']

const [, , rawName, rawEmail, rawPlan = 'pro'] = process.argv
const name = String(rawName ?? '').trim()
const email = String(rawEmail ?? '').trim().toLowerCase()
const plan = String(rawPlan).trim().toLowerCase()

if (!name || !email) {
  console.error('Uso: node --env-file=.env scripts/create-org.mjs "Nombre Cliente" admin@cliente.com [plan]')
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
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    console.error(`Ya existe un usuario con el email ${email}. Usa el reseteo de contraseña en vez de crear otra organización.`)
    process.exit(1)
  }

  // 24 bytes en base64url: suficiente para no tener que forzar rotación al alta.
  const password = randomBytes(24).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 12)

  const result = await prisma.$transaction(async tx => {
    const org = await tx.organization.create({ data: { name, plan } })
    const user = await tx.user.create({
      data: { orgId: org.id, email, passwordHash, name: `Propietario de ${name}`, role: 'owner' },
      select: { id: true, email: true },
    })
    await tx.organizationMembership.create({
      data: { orgId: org.id, userId: user.id, role: 'owner', status: 'active', isDefault: true },
    })
    return { org, user }
  })

  console.log('\nOrganización creada')
  console.log(`  id:       ${result.org.id}`)
  console.log(`  nombre:   ${result.org.name}`)
  console.log(`  plan:     ${result.org.plan}`)
  console.log('\nPropietario')
  console.log(`  email:    ${result.user.email}`)
  console.log(`  password: ${password}`)
  console.log('\nEsta contraseña no se vuelve a mostrar. Compártela por un canal seguro y pide que la cambie al entrar.')
  console.log('Siguiente paso: conectar las credenciales de la organización (Twilio, Meta, Google) desde /api/integration-credentials.\n')
} catch (error) {
  console.error('No se pudo crear la organización:', error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
