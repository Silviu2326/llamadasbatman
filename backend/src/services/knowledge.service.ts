import { prisma } from '../lib/prisma'

export async function getKnowledgeBase(orgId: string, id: string, userId?: string) {
  const item = await prisma.knowledgeBase.findFirst({ where: { id, orgId } })
  if (!item) return item
  const [isFavoritedByMe, isHelpfulByMe, helpfulCount] = await Promise.all([
    userId
      ? prisma.knowledgeFavorite.findUnique({
          where: { userId_knowledgeBaseId_type: { userId, knowledgeBaseId: id, type: 'favorite' } },
        })
      : null,
    userId
      ? prisma.knowledgeFavorite.findUnique({
          where: { userId_knowledgeBaseId_type: { userId, knowledgeBaseId: id, type: 'helpful' } },
        })
      : null,
    prisma.knowledgeFavorite.count({ where: { orgId, knowledgeBaseId: id, type: 'helpful' } }),
  ])
  return {
    ...item,
    isFavoritedByMe: !!isFavoritedByMe,
    isHelpfulByMe: !!isHelpfulByMe,
    helpfulCount,
  }
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

export async function updateKnowledgeBase(orgId: string, id: string, data: {
  name?: string
  type?: string
  content?: string
  fileUrl?: string
  isActive?: boolean
}) {
  return prisma.knowledgeBase.updateMany({
    where: { id, orgId },
    data,
  })
}

async function toggleReaction(orgId: string, userId: string, knowledgeBaseId: string, type: 'favorite' | 'helpful') {
  const where = { userId_knowledgeBaseId_type: { userId, knowledgeBaseId, type } }
  const existing = await prisma.knowledgeFavorite.findFirst({ where: { orgId, userId, knowledgeBaseId, type } })
  if (existing) {
    await prisma.knowledgeFavorite.delete({ where })
    return false
  }
  await prisma.knowledgeFavorite.create({ data: { orgId, userId, knowledgeBaseId, type } })
  return true
}

export async function toggleFavorite(orgId: string, userId: string, knowledgeBaseId: string) {
  return toggleReaction(orgId, userId, knowledgeBaseId, 'favorite')
}

export async function toggleHelpful(orgId: string, userId: string, knowledgeBaseId: string) {
  return toggleReaction(orgId, userId, knowledgeBaseId, 'helpful')
}
