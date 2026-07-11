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

async function main() {
  await seedAdPlaybooks()
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org' },
    update: {},
    create: { id: 'seed-org', name: 'Vozia Demo', plan: 'pro' },
  })

  const passwordHash = await bcrypt.hash('admin1234', 10)

  const user = await prisma.user.upsert({
    where: { email: 'admin@vozia.ai' },
    update: {},
    create: {
      orgId: org.id,
      email: 'admin@vozia.ai',
      passwordHash,
      name: 'Admin',
      role: 'admin',
    },
  })

  console.log(`Org: ${org.name}`)
  console.log(`User: ${user.email} / admin1234`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
