import { prisma } from '../lib/prisma'

function normalizeVertical(vertical: string): string {
  return vertical.trim().toLowerCase()
}

export async function listAdPlaybooks() {
  return prisma.adPlaybook.findMany({
    orderBy: { vertical: 'asc' },
    include: { _count: { select: { campaigns: true } } },
  })
}

export async function findByVertical(vertical: string) {
  return prisma.adPlaybook.findFirst({
    where: { vertical: normalizeVertical(vertical), isActive: true },
  })
}

export async function createAdPlaybook(data: {
  vertical: string
  offer: string
  leadMagnet?: string
  adCopy: string
  landingTemplateId: string
  imagePrompt: string
}) {
  return prisma.adPlaybook.create({
    data: { ...data, vertical: normalizeVertical(data.vertical) },
  })
}

export async function updateAdPlaybook(id: string, data: {
  offer?: string
  leadMagnet?: string
  adCopy?: string
  landingTemplateId?: string
  imagePrompt?: string
  isActive?: boolean
}) {
  return prisma.adPlaybook.update({ where: { id }, data })
}
