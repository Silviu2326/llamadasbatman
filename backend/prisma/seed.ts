import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
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
