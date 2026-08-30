// Escritura de lo que una persona aceptó de la propuesta del análisis web.
//
// Separado a propósito de websiteIntake.service.ts: analizar es barato y
// reversible, escribir no. Aquí no se lee nada del Job — se escribe lo que el
// revisor envía, ya editado en pantalla, y cada sección se aplica solo si el
// actor tiene el permiso que esa sección exige por sí misma. Un usuario que
// puede editar la ficha de empresa pero no dar accesos aplica el perfil y
// recibe `forbidden` en el equipo, en vez de un 403 que tiraría todo.
//
// Nada de esto crea cuentas de usuario: dar de alta a una persona sigue
// exigiendo que ella cree su cuenta (misma regla que POST /organizations/
// members). Lo que aquí se hace es la membresía, cuando el usuario ya existe.
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { hasPermission, isKnownRole } from '../access-control/permissions'
import { createAccount } from './accounts.service'
import { createLead } from './leads.service'
import { createKnowledgeBase } from './knowledge.service'
import { updateBusinessProfile, type BusinessProfileUpdate } from './businessProfile.service'

export interface IntakeApplyActor {
  userId: string
  role: string
}

export interface IntakeApplySelection {
  profile?: BusinessProfileUpdate
  team?: Array<{ email: string; role: string }>
  knowledge?: Array<{ name: string; content: string }>
  crm?: {
    account?: {
      name: string
      website?: string | null
      domain?: string | null
      industry?: string | null
      sizeBand?: string | null
      phone?: string | null
      address?: string | null
    }
    contacts?: Array<{ name: string; email?: string | null; phone?: string | null; title?: string | null }>
  }
}

export interface IntakeApplyReport {
  profile: { status: 'applied' | 'skipped' | 'forbidden' | 'failed'; detail?: string }
  team: {
    status: 'applied' | 'skipped' | 'forbidden'
    members: Array<{ email: string; status: 'added' | 'updated' | 'needs_account' | 'role_forbidden' }>
  }
  knowledge: { status: 'applied' | 'skipped' | 'forbidden'; created: number }
  crm: {
    status: 'applied' | 'skipped' | 'forbidden'
    accountId: string | null
    accountDeduped: boolean
    contactsCreated: number
  }
}

/** Igual que en las rutas de organización: `viewer` lo puede invitar quien
 * administra usuarios; cualquier rol con permisos exige `roles.manage`. */
function canAssignRole(actorRole: string, role: string): boolean {
  return role === 'viewer' || hasPermission(actorRole, 'roles.manage', 'org')
}

export async function applyWebsiteIntake(params: {
  orgId: string
  actor: IntakeApplyActor
  jobId: string
  selection: IntakeApplySelection
}): Promise<IntakeApplyReport> {
  const { orgId, actor, selection } = params
  const report: IntakeApplyReport = {
    profile: { status: 'skipped' },
    team: { status: 'skipped', members: [] },
    knowledge: { status: 'skipped', created: 0 },
    crm: { status: 'skipped', accountId: null, accountDeduped: false, contactsCreated: 0 },
  }

  if (selection.profile) {
    if (!hasPermission(actor.role, 'organization.manage', 'org')) {
      report.profile = { status: 'forbidden', detail: 'Requiere organization.manage' }
    } else {
      const updated = await updateBusinessProfile(orgId, selection.profile)
      report.profile = updated
        ? { status: 'applied' }
        : { status: 'failed', detail: 'La organización no existe' }
    }
  }

  if (selection.team?.length) {
    if (!hasPermission(actor.role, 'users.manage', 'org')) {
      report.team = { status: 'forbidden', members: [] }
    } else {
      report.team.status = 'applied'
      for (const member of selection.team) {
        const email = member.email.trim().toLowerCase()
        const role = isKnownRole(member.role) ? member.role : 'viewer'
        if (!canAssignRole(actor.role, role)) {
          report.team.members.push({ email, status: 'role_forbidden' })
          continue
        }
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
        if (!user) {
          // Sin cuenta no hay membresía: el alta la hace la persona, no un
          // análisis automático. La UI muestra estos emails para invitarlos.
          report.team.members.push({ email, status: 'needs_account' })
          continue
        }
        const existing = await prisma.organizationMembership.findUnique({
          where: { orgId_userId: { orgId, userId: user.id } },
          select: { id: true },
        })
        await prisma.organizationMembership.upsert({
          where: { orgId_userId: { orgId, userId: user.id } },
          create: { orgId, userId: user.id, role: role as never, status: 'active', invitedById: actor.userId },
          update: { role: role as never, status: 'active', invitedById: actor.userId },
        })
        report.team.members.push({ email, status: existing ? 'updated' : 'added' })
      }
    }
  }

  if (selection.knowledge?.length) {
    if (!hasPermission(actor.role, 'knowledge.write', 'org')) {
      report.knowledge = { status: 'forbidden', created: 0 }
    } else {
      report.knowledge.status = 'applied'
      for (const entry of selection.knowledge) {
        await createKnowledgeBase(orgId, { name: entry.name, content: entry.content, type: 'document' })
        report.knowledge.created += 1
      }
    }
  }

  if (selection.crm?.account || selection.crm?.contacts?.length) {
    if (!hasPermission(actor.role, 'accounts.write', 'org')) {
      report.crm = { status: 'forbidden', accountId: null, accountDeduped: false, contactsCreated: 0 }
    } else {
      report.crm.status = 'applied'
      let accountId: string | null = null
      if (selection.crm.account) {
        const account = await createAccount(orgId, actor.userId, {
          name: selection.crm.account.name,
          domain: selection.crm.account.domain ?? undefined,
          website: selection.crm.account.website ?? undefined,
          industry: selection.crm.account.industry ?? undefined,
          sizeBand: selection.crm.account.sizeBand ?? undefined,
          phone: selection.crm.account.phone ?? undefined,
          address: selection.crm.account.address ?? undefined,
          source: 'website_intake',
        })
        accountId = account.id
        report.crm.accountId = account.id
        report.crm.accountDeduped = account.deduped
      }
      // Los contactos entran sin consentimiento de canal: se registran como
      // ficha, no como permiso para llamarles o escribirles.
      const canWriteLeads = hasPermission(actor.role, 'leads.write', 'org')
      for (const contact of selection.crm.contacts ?? []) {
        if (!canWriteLeads) break
        await createLead(orgId, actor.userId, {
          name: contact.name,
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          company: selection.crm.account?.name,
          accountId: accountId ?? undefined,
          source: 'website_intake',
          customFields: contact.title ? { title: contact.title } : undefined,
        })
        report.crm.contactsCreated += 1
      }
    }
  }

  await writeAuditLog({
    orgId,
    actorUserId: actor.userId,
    action: 'website_intake.apply',
    entityType: 'Job',
    entityId: params.jobId,
    after: report as unknown as object,
  })

  return report
}
