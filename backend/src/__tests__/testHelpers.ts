import { randomUUID } from 'crypto'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'

// El runner fija estas variables antes de importar cualquier test o singleton
// Prisma. Aquí sólo verificamos la identidad efectiva; no mutamos DATABASE_URL
// después de que Prisma haya sido construido.
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim()
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL es obligatoria para las pruebas de integración.')
}
if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL?.trim() !== testDatabaseUrl) {
  throw new Error('La suite debe inicializar Prisma con TEST_DATABASE_URL antes de importar los tests.')
}

/**
 * Helpers de setup/teardown contra la base aislada indicada por
 * TEST_DATABASE_URL. Todo lo creado se prefija con "test-" y se limpia
 * explícitamente en el teardown de cada suite.
 */

export async function createTestOrg(name = `test-org-${randomUUID()}`) {
  return prisma.organization.create({ data: { name, plan: 'completo' } })
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
  await prisma.salesSequenceStepRun.deleteMany({ where })
  await prisma.salesSequenceEnrollment.deleteMany({ where })
  await prisma.growthProgram.deleteMany({ where })
  await prisma.actionItemHistory.deleteMany({ where })
  await prisma.actionItem.deleteMany({ where })
  await prisma.sensitiveApprovalRequest.deleteMany({ where })
  await prisma.organizationIntegrationCredential.deleteMany({ where })
  await prisma.metaOAuthState.deleteMany({ where })
  await prisma.webhookEvent.deleteMany({ where })
  await prisma.organicAction.deleteMany({ where })
  await prisma.organicAsset.deleteMany({ where })
  await prisma.organicOpportunity.deleteMany({ where })
  await prisma.organicProject.deleteMany({ where })
  await prisma.organicIntegration.deleteMany({ where })
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
  await prisma.userPreference.deleteMany({ where: { user: { orgId: { in: orgIds } } } })
  await prisma.authSession.deleteMany({ where: { user: { orgId: { in: orgIds } } } })
  await prisma.user.deleteMany({ where })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
}
