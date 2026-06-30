import { prisma } from '../lib/prisma'

export async function getKnowledgeBase(orgId: string, id: string) {
  return prisma.knowledgeBase.findFirst({ where: { id, orgId } })
}

export async function listKnowledgeBase(orgId: string) {
  return prisma.knowledgeBase.findMany({
    where: { orgId, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createKnowledgeBase(orgId: string, data: {
  name: string
  type?: string
  content?: string
  fileUrl?: string
}) {
  return prisma.knowledgeBase.create({
    data: {
      orgId,
      name: data.name,
      type: data.type ?? 'document',
      content: data.content,
      fileUrl: data.fileUrl,
    },
  })
}

export async function removeKnowledgeBase(orgId: string, id: string) {
  return prisma.knowledgeBase.updateMany({
    where: { id, orgId },
    data: { isActive: false },
  })
}
