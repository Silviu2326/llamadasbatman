import { randomUUID } from 'crypto'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'

/**
 * Helpers de setup/teardown para pruebas de integración contra la base de
 * datos real de desarrollo (no hay una base de datos de test separada
 * configurada todavía — ver docs/auditoria-nutricion-ventas/IMPLEMENTACION-PROGRESO.md).
 * Todo lo creado se prefija con "test-" y se limpia explícitamente en el
 * teardown de cada suite; no se deja basura en la base de datos compartida.
 */

export async function createTestOrg(name = `test-org-${randomUUID()}`) {
  return prisma.organization.create({ data: { name, plan: 'completo', mauticEnabled: true } })
}

export async function createTestUser(orgId: string, role: 'admin' | 'agent' | 'viewer' = 'agent') {
  const passwordHash = await bcrypt.hash('test-password', 4)
  return prisma.user.create({
    data: {
      orgId,
      email: `test-${randomUUID()}@example.com`,
      passwordHash,
      role,
      name: 'Test User',
    },
  })
}

export async function createTestLead(orgId: string, data: Partial<{ name: string; email: string; phone: string; status: string }> = {}) {
  return prisma.lead.create({
    data: {
      orgId,
      name: data.name ?? 'Test Lead',
      email: data.email ?? `lead-${randomUUID()}@example.com`,
      phone: data.phone,
      status: (data.status as any) ?? 'new',
    },
  })
}

/** Borra todo lo creado bajo estas organizaciones, en orden de dependencias (FK). */
export async function cleanupOrgs(orgIds: string[]) {
  if (!orgIds.length) return
  const where = { orgId: { in: orgIds } }
  await prisma.automationStepRun.deleteMany({ where })
  await prisma.automationRun.deleteMany({ where })
  await prisma.automationVersion.deleteMany({ where })
  await prisma.automation.deleteMany({ where })
  await prisma.contactConsent.deleteMany({ where })
  await prisma.task.deleteMany({ where })
  await prisma.salesActivity.deleteMany({ where })
  await prisma.opportunityStageHistory.deleteMany({ where })
  await prisma.opportunity.deleteMany({ where })
  await prisma.meeting.deleteMany({ where })
  await prisma.auditLog.deleteMany({ where })
  await prisma.lead.deleteMany({ where })
  await prisma.user.deleteMany({ where })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
}
