import { prisma } from '../lib/prisma'
import * as authService from './auth.service'

const PREFERENCE_DEFAULTS = {
  locale: 'es',
  timezone: 'Europe/Madrid',
  emailNotifications: true,
  desktopNotifications: true,
  weeklyDigest: true,
  theme: 'system',
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  const preference = await prisma.userPreference.upsert({
    where: { userId },
    update: {},
    create: { userId, ...PREFERENCE_DEFAULTS },
  })

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    preference,
  }
}

export async function updateMe(
  userId: string,
  data: {
    name?: string
    locale?: string
    timezone?: string
    emailNotifications?: boolean
    desktopNotifications?: boolean
    weeklyDigest?: boolean
    theme?: string
  }
) {
  const { name, ...prefData } = data

  if (name !== undefined) {
    await prisma.user.update({ where: { id: userId }, data: { name } })
  }

  const preference = await prisma.userPreference.upsert({
    where: { userId },
    update: prefData,
    create: { userId, ...PREFERENCE_DEFAULTS, ...prefData },
  })

  return preference
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { ok: false, status: 404, error: 'User not found' } as const

  const valid = await authService.verifyPassword(currentPassword, user.passwordHash)
  if (!valid) return { ok: false, status: 401, error: 'Current password is incorrect' } as const

  const passwordHash = await authService.hashPassword(newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

  return { ok: true } as const
}

const ORG_FIELDS = {
  name: true,
  plan: true,
  email: true,
  website: true,
  phone: true,
  industry: true,
  timezone: true,
  address: true,
  currency: true,
  mauticEnabled: true,
  postizEnabled: true,
} as const

export async function getOrganization(orgId: string) {
  return prisma.organization.findUnique({ where: { id: orgId }, select: ORG_FIELDS })
}

export async function updateOrganization(
  orgId: string,
  data: {
    name?: string
    email?: string | null
    website?: string | null
    phone?: string | null
    industry?: string | null
    timezone?: string
    address?: string | null
    currency?: string
  }
) {
  return prisma.organization.update({ where: { id: orgId }, data, select: ORG_FIELDS })
}

export async function getIntegrations(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true, mauticEnabled: true, mauticCompanyId: true, postizEnabled: true, postizWorkspaceId: true },
  })
  if (!org) return null

  return {
    plan: org.plan,
    mautic: { enabled: org.mauticEnabled, connected: !!org.mauticCompanyId },
    postiz: { enabled: org.postizEnabled, connected: !!org.postizWorkspaceId },
  }
}
