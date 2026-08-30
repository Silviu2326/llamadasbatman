import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { invalidateAgentConfigCache } from '../voice/agentConfig'

export const BUSINESS_PROFILE_VERSION = 1

export type BusinessOffer = {
  id: string
  name: string
  description: string
  priceCents: number | null
  currency: string
  billingPeriod: 'one_time' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
  includes: string[]
  conditions: string
  active: boolean
}

export type BusinessProfileContent = {
  version: number
  description: string
  idealCustomer: string
  valueProposition: string
  differentiators: string[]
  offers: BusinessOffer[]
  commercialGuardrails: {
    discountPolicy: string
    paymentTerms: string
    guarantees: string
    forbiddenClaims: string
  }
  updatedAt: string | null
}

export type BusinessProfileUpdate = Omit<BusinessProfileContent, 'version' | 'updatedAt'> & {
  company: {
    name: string
    email: string | null
    website: string | null
    phone: string | null
    industry: string | null
    address: string | null
    currency: string
  }
}

const EMPTY_CONTENT: BusinessProfileContent = {
  version: BUSINESS_PROFILE_VERSION,
  description: '',
  idealCustomer: '',
  valueProposition: '',
  differentiators: [],
  offers: [],
  commercialGuardrails: {
    discountPolicy: '',
    paymentTerms: '',
    guarantees: '',
    forbiddenClaims: '',
  },
  updatedAt: null,
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeOffer(value: unknown, index: number): BusinessOffer {
  const item = record(value)
  const allowedPeriods = new Set<BusinessOffer['billingPeriod']>(['one_time', 'monthly', 'quarterly', 'yearly', 'custom'])
  const period = text(item.billingPeriod) as BusinessOffer['billingPeriod']
  return {
    id: text(item.id) || `offer-${index + 1}`,
    name: text(item.name),
    description: text(item.description),
    priceCents: typeof item.priceCents === 'number' && Number.isInteger(item.priceCents) && item.priceCents >= 0 ? item.priceCents : null,
    currency: /^[A-Z]{3}$/.test(text(item.currency)) ? text(item.currency) : 'EUR',
    billingPeriod: allowedPeriods.has(period) ? period : 'monthly',
    includes: stringList(item.includes),
    conditions: text(item.conditions),
    active: item.active !== false,
  }
}

export function parseBusinessProfile(settings: unknown): BusinessProfileContent {
  const source = record(record(settings).businessProfile)
  const guardrails = record(source.commercialGuardrails)
  return {
    ...EMPTY_CONTENT,
    description: text(source.description),
    idealCustomer: text(source.idealCustomer),
    valueProposition: text(source.valueProposition),
    differentiators: stringList(source.differentiators),
    offers: Array.isArray(source.offers) ? source.offers.map(normalizeOffer) : [],
    commercialGuardrails: {
      discountPolicy: text(guardrails.discountPolicy),
      paymentTerms: text(guardrails.paymentTerms),
      guarantees: text(guardrails.guarantees),
      forbiddenClaims: text(guardrails.forbiddenClaims),
    },
    updatedAt: text(source.updatedAt) || null,
  }
}

const COMPANY_SELECT = {
  name: true,
  email: true,
  website: true,
  phone: true,
  industry: true,
  timezone: true,
  address: true,
  currency: true,
  settings: true,
} as const

export async function getBusinessProfile(orgId: string) {
  const [org, knowledgeCount, agentCount] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: COMPANY_SELECT }),
    prisma.knowledgeBase.count({ where: { orgId, isActive: true } }),
    prisma.agent.count({ where: { orgId, isActive: true } }),
  ])
  if (!org) return null
  const profile = parseBusinessProfile(org.settings)
  const requiredValues = [org.name, profile.description, profile.idealCustomer, profile.valueProposition]
  const completedRequired = requiredValues.filter(value => value.trim()).length
  return {
    company: {
      name: org.name,
      email: org.email,
      website: org.website,
      phone: org.phone,
      industry: org.industry,
      timezone: org.timezone,
      address: org.address,
      currency: org.currency,
    },
    profile,
    readiness: {
      completedRequired,
      totalRequired: requiredValues.length,
      profileReady: completedRequired === requiredValues.length,
      activeOffers: profile.offers.filter(offer => offer.active && offer.name.trim()).length,
      knowledgeCount,
      activeAgentCount: agentCount,
    },
  }
}

export async function getBusinessProfileSource(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: COMPANY_SELECT })
  if (!org) return null
  return {
    company: {
      name: org.name,
      email: org.email,
      website: org.website,
      phone: org.phone,
      industry: org.industry,
      timezone: org.timezone,
      address: org.address,
      currency: org.currency,
    },
    profile: parseBusinessProfile(org.settings),
  }
}

export async function updateBusinessProfile(orgId: string, data: BusinessProfileUpdate) {
  const current = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } })
  if (!current) return null
  const settings = record(current.settings)
  const updatedAt = new Date().toISOString()
  const businessProfile: BusinessProfileContent = {
    version: BUSINESS_PROFILE_VERSION,
    description: data.description,
    idealCustomer: data.idealCustomer,
    valueProposition: data.valueProposition,
    differentiators: data.differentiators,
    offers: data.offers,
    commercialGuardrails: data.commercialGuardrails,
    updatedAt,
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      name: data.company.name,
      email: data.company.email,
      website: data.company.website,
      phone: data.company.phone,
      industry: data.company.industry,
      address: data.company.address,
      currency: data.company.currency,
      settings: { ...settings, businessProfile } as Prisma.InputJsonValue,
    },
  })
  invalidateAgentConfigCache(orgId)
  return getBusinessProfile(orgId)
}
