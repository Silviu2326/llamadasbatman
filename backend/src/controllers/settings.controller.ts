import { FastifyRequest, FastifyReply } from 'fastify'
import * as settingsService from '../services/settings.service'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  locale: z.string().trim().min(2).max(12).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  emailNotifications: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), 'Incluye al menos un campo para actualizar')

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
}).strict()

const optionalEmail = z.union([z.string().trim().email().max(254), z.literal('')]).transform(value => value || null).optional()
const optionalWebsite = z.union([z.string().trim().url().max(2_048), z.literal('')]).transform(value => value || null).optional()
const optionalPhone = z.union([z.string().trim().min(3).max(40), z.literal('')]).transform(value => value || null).optional()

const organizationSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  email: optionalEmail,
  website: optionalWebsite,
  phone: optionalPhone,
  industry: z.string().trim().max(120).optional().nullable(),
  timezone: z.string().trim().min(1).max(64).optional(),
  address: z.string().trim().max(500).optional().nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, 'Usa un código ISO de tres letras').optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), 'Incluye al menos un campo para actualizar')

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = request.user as JWTUser
  const result = await settingsService.getMe(userId)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}

export async function updateMe(
  request: FastifyRequest<{
    Body: {
      name?: string
      locale?: string
      timezone?: string
      emailNotifications?: boolean
      desktopNotifications?: boolean
      weeklyDigest?: boolean
      theme?: string
    }
  }>,
  reply: FastifyReply
) {
  const { userId } = request.user as JWTUser
  const body = parseRequest(reply, profileSchema, request.body)
  if (!body) return
  const preference = await settingsService.updateMe(userId, body)
  return reply.send({ ok: true, preference })
}

export async function changePassword(
  request: FastifyRequest<{ Body: { currentPassword: string; newPassword: string } }>,
  reply: FastifyReply
) {
  const { userId } = request.user as JWTUser
  const body = parseRequest(reply, passwordSchema, request.body)
  if (!body) return
  const { currentPassword, newPassword } = body

  const result = await settingsService.changePassword(userId, currentPassword, newPassword)
  if (!result.ok) return reply.status(result.status).send({ error: result.error })
  return reply.send({ ok: true })
}

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(256),
}).strict()

export async function deleteAccount(
  request: FastifyRequest<{ Body: { password: string } }>,
  reply: FastifyReply
) {
  const { userId } = request.user as JWTUser
  const body = parseRequest(reply, deleteAccountSchema, request.body)
  if (!body) return
  const result = await settingsService.deleteAccount(userId, body.password)
  if (!result.ok) return reply.status(result.status).send({ error: result.error })
  return reply.send({ ok: true })
}

export async function getOrganization(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const org = await settingsService.getOrganization(orgId)
  if (!org) return reply.status(404).send({ error: 'Not found' })
  return reply.send(org)
}

export async function updateOrganization(
  request: FastifyRequest<{
    Body: {
      name?: string
      email?: string
      website?: string
      phone?: string
      industry?: string
      timezone?: string
      address?: string
      currency?: string
    }
  }>,
  reply: FastifyReply
) {
  const { orgId, role } = request.user as JWTUser
  if (role === 'viewer') {
    return reply.status(403).send({ error: 'Viewers cannot modify organization settings' })
  }
  const body = parseRequest(reply, organizationSchema, request.body)
  if (!body) return
  const org = await settingsService.updateOrganization(orgId, body)
  return reply.send(org)
}

export async function getIntegrations(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const result = await settingsService.getIntegrations(orgId)
  if (!result) return reply.status(404).send({ error: 'Not found' })
  return reply.send(result)
}
