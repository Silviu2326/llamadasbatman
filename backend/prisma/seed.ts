import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const AD_PLAYBOOKS = [
  {
    vertical: 'gimnasio',
    offer: 'Prueba gratuita de 7 días',
    leadMagnet: 'Guía de entrenamiento para principiantes',
    adCopy: '¿Querés ponerte en forma antes del verano? Probá 7 días gratis en nuestro gimnasio.',
    landingTemplateId: 'gym-trial-v1',
    imagePrompt: 'Foto realista de un gimnasio moderno, luz natural, personas entrenando, ambiente motivador, sin texto',
  },
  {
    vertical: 'peluqueria_canina',
    offer: 'Primera sesión con 20% de descuento',
    leadMagnet: null,
    adCopy: 'Tu mascota merece lo mejor. Primera sesión de peluquería canina con 20% off.',
    landingTemplateId: 'pet-grooming-v1',
    imagePrompt: 'Foto realista de un perro recién bañado y peinado en una peluquería canina, ambiente limpio y cálido, sin texto',
  },
  {
    vertical: 'abogados',
    offer: 'Consulta inicial gratuita',
    leadMagnet: 'Guía: qué preguntar antes de contratar un abogado',
    adCopy: '¿Tenés una duda legal? Consulta inicial gratuita con un abogado especializado.',
    landingTemplateId: 'legal-consult-v1',
    imagePrompt: 'Foto realista de una oficina de abogados profesional y cálida, sin texto',
  },
]

async function seedAdPlaybooks() {
  for (const playbook of AD_PLAYBOOKS) {
    await prisma.adPlaybook.upsert({
      where: { vertical: playbook.vertical },
      update: playbook,
      create: playbook,
    })
  }
  console.log(`Ad playbooks: ${AD_PLAYBOOKS.length} sembrados`)
}

/**
 * A demo account is opt-in, development-only and must use credentials supplied
 * by the operator. Seeds must never create or print a predictable admin.
 */
async function seedDevelopmentUser() {
  if (process.env.NODE_ENV !== 'development' || process.env.SEED_DEMO_USER !== 'true') return

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password || password.length < 12) {
    throw new Error('SEED_DEMO_USER requiere SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 12 caracteres)')
  }

  const org = await prisma.organization.upsert({
    where: { id: process.env.SEED_ORG_ID?.trim() || 'local-development-org' },
    update: {},
    create: { id: process.env.SEED_ORG_ID?.trim() || 'local-development-org', name: process.env.SEED_ORG_NAME?.trim() || 'Vozia Local', plan: 'pro' },
  })
  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, orgId: org.id, name: process.env.SEED_ADMIN_NAME?.trim() || 'Propietario local', role: 'owner' },
    create: {
      orgId: org.id,
      email,
      passwordHash,
      name: process.env.SEED_ADMIN_NAME?.trim() || 'Propietario local',
      // Bootstrap explicito y solo de desarrollo. En operacion normal un
      // owner adicional siempre requiere solicitud y aprobacion de otro owner.
      role: 'owner',
    },
  })
  console.log(`Usuario local creado/actualizado: ${user.email}`)
}

async function main() {
  await seedAdPlaybooks()
  await seedDevelopmentUser()
}

main().catch(console.error).finally(() => prisma.$disconnect())
