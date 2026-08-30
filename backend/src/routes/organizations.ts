import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import { isKnownRole } from '../access-control/permissions'
import { hasPermission } from '../access-control/permissions'
import { parseRequest } from '../lib/validation'

const memberSchema = z.object({ email: z.string().trim().email().max(320), role: z.string() }).strict()
const updateSchema = z.object({ role: z.string().optional(), status: z.enum(['active', 'suspended']).optional(), isDefault: z.boolean().optional() }).strict().refine((v) => Object.keys(v).length > 0)

async function ensureNotLastOwner(orgId: string, userId: string, demoting: boolean, reply: FastifyReply) {
  if (!demoting) return true
  const target = await prisma.organizationMembership.findUnique({ where: { orgId_userId: { orgId, userId } }, select: { role: true, status: true } })
  if (target?.role !== 'owner' || target.status !== 'active') return true
  const owners = await prisma.organizationMembership.count({ where: { orgId, role: 'owner', status: 'active' } })
  if (owners > 1) return true
  reply.status(409).send({ error: 'La organización debe conservar al menos un owner activo', code: 'LAST_OWNER' })
  return false
}

/** Asignar o modificar roles es distinto de administrar usuarios. `admin`
 * puede invitar viewers y suspender miembros ordinarios, pero no fabricarse
 * un owner/finance_controller ni alterar a un owner. */
export function canAssignOrganizationRole(actorRole: string, role: string): boolean {
  return role === 'viewer' || hasPermission(actorRole, 'roles.manage', 'org')
}

export async function organizationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  const read = { preHandler: requirePermission('users.read', { scope: 'org' }) }
  const manage = { preHandler: requirePermission('users.manage', { scope: 'org' }) }

  app.get('/members', read, async (request) => {
    const { orgId } = request.user
    return { members: await prisma.organizationMembership.findMany({ where: { orgId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] }) }
  })

  app.post('/members', manage, async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const { orgId, userId, role: actorRole } = request.user
    const body = parseRequest(reply, memberSchema, request.body ?? {})
    if (!body) return
    if (!isKnownRole(body.role)) return reply.status(400).send({ error: 'Rol desconocido', code: 'ROLE_INVALID' })
    if (!canAssignOrganizationRole(actorRole, body.role)) return reply.status(403).send({ error: 'No puedes asignar ese rol', code: 'ROLE_MANAGEMENT_REQUIRED' })
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, select: { id: true } })
    if (!user) return reply.status(404).send({ error: 'El usuario debe crear su cuenta antes de ser añadido', code: 'USER_NOT_FOUND' })
    const membership = await prisma.organizationMembership.upsert({ where: { orgId_userId: { orgId, userId: user.id } }, create: { orgId, userId: user.id, role: body.role, status: 'active', invitedById: userId }, update: { role: body.role, status: 'active', invitedById: userId } })
    return reply.status(201).send(membership)
  })

  app.patch('/members/:userId', manage, async (request: FastifyRequest<{ Params: { userId: string }; Body: unknown }>, reply) => {
    const { orgId, userId: actorUserId, role: actorRole } = request.user
    const body = parseRequest(reply, updateSchema, request.body ?? {})
    if (!body) return
    if (body.role && !isKnownRole(body.role)) return reply.status(400).send({ error: 'Rol desconocido', code: 'ROLE_INVALID' })
    const exists = await prisma.organizationMembership.findUnique({ where: { orgId_userId: { orgId, userId: request.params.userId } } })
    if (!exists) return reply.status(404).send({ error: 'Membresía no encontrada' })
    const changesProtectedRole = (body.role !== undefined && body.role !== exists.role)
      || (exists.role === 'owner' && body.status === 'suspended')
    if (changesProtectedRole && (!body.role || !canAssignOrganizationRole(actorRole, body.role) || !hasPermission(actorRole, 'roles.manage', 'org'))) {
      return reply.status(403).send({ error: 'No puedes modificar ese rol', code: 'ROLE_MANAGEMENT_REQUIRED' })
    }
    if (body.isDefault !== undefined && request.params.userId !== actorUserId) {
      return reply.status(403).send({ error: 'Solo cada usuario puede elegir su organización predeterminada', code: 'DEFAULT_ORG_SELF_ONLY' })
    }
    if (!await ensureNotLastOwner(orgId, request.params.userId, body.status === 'suspended' || (body.role !== undefined && body.role !== 'owner'), reply)) return
    const updated = await prisma.$transaction(async tx => {
      if (body.isDefault) await tx.organizationMembership.updateMany({ where: { userId: request.params.userId, isDefault: true }, data: { isDefault: false } })
      return tx.organizationMembership.update({ where: { orgId_userId: { orgId, userId: request.params.userId } }, data: { role: body.role as any, status: body.status, isDefault: body.isDefault } })
    })
    return reply.send(updated)
  })

  app.delete('/members/:userId', manage, async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
    const { orgId, role: actorRole } = request.user
    const target = await prisma.organizationMembership.findUnique({ where: { orgId_userId: { orgId, userId: request.params.userId } }, select: { role: true } })
    if (target?.role === 'owner' && !hasPermission(actorRole, 'roles.manage', 'org')) {
      return reply.status(403).send({ error: 'No puedes suspender a un owner', code: 'ROLE_MANAGEMENT_REQUIRED' })
    }
    if (!await ensureNotLastOwner(orgId, request.params.userId, true, reply)) return
    const updated = await prisma.organizationMembership.updateMany({ where: { orgId, userId: request.params.userId, status: 'active' }, data: { status: 'suspended', isDefault: false } })
    if (!updated.count) return reply.status(404).send({ error: 'Membresía no encontrada' })
    return reply.status(204).send()
  })
}
