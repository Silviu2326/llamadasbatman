import { prisma } from '../lib/prisma'

export async function getPlaybook(orgId: string, id: string) {
  return prisma.playbook.findFirst({ where: { id, orgId } })
}

export async function listPlaybooks(orgId: string) {
  return prisma.playbook.findMany({
    where: { orgId, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createPlaybook(orgId: string, data: {
  name: string
  description?: string
  steps?: unknown
  tags?: string[]
}) {
  return prisma.playbook.create({
    data: {
      orgId,
      name: data.name,
      description: data.description,
      steps: data.steps ? (data.steps as object) : undefined,
      tags: data.tags ?? [],
    },
  })
}

export async function updatePlaybook(orgId: string, id: string, data: {
  name?: string
  description?: string
  steps?: unknown
  tags?: string[]
  isActive?: boolean
}) {
  return prisma.playbook.updateMany({
    where: { id, orgId },
    data: {
      name: data.name,
      description: data.description,
      steps: data.steps ? (data.steps as object) : undefined,
      tags: data.tags,
      isActive: data.isActive,
    },
  })
}
