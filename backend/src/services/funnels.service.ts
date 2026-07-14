import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'

type FunnelAssets = Record<string, unknown>

function readVisits(adAssets: unknown) {
  if (!adAssets || typeof adAssets !== 'object' || Array.isArray(adAssets)) return null
  const value = (adAssets as FunnelAssets).visits
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}

function percent(current: number, previous: number | null) {
  if (previous === null || previous <= 0) return null
  return Math.round((current / previous) * 1000) / 10
}

function slugify(value: string) {
  const base = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'funnel'}-${randomUUID().slice(0, 8)}`
}

type Funnel = {
  id: string
  name: string
  objective: string | null
  status: string
  landingSlug: string | null
  createdAt: Date
  visits: number | null
  leads: number
  contacted: number
  meetings: number
  rates: {
    visitToLead: number | null
    leadToContact: number | null
    contactToMeeting: number | null
    visitToMeeting: number | null
    leadToMeeting: number | null
  }
}

function bottleneck(funnel: Funnel) {
  const stages = [
    { label: 'visita a lead', rate: funnel.rates.visitToLead, previous: funnel.visits },
    { label: 'lead a contacto', rate: funnel.rates.leadToContact, previous: funnel.leads },
    { label: 'contacto a reunion', rate: funnel.rates.contactToMeeting, previous: funnel.contacted },
  ].filter((stage): stage is { label: string; rate: number; previous: number } => stage.rate !== null && stage.previous !== null && stage.previous > 0)

  return stages.sort((a, b) => a.rate - b.rate)[0] ?? null
}

export async function getFunnelsOverview(orgId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      objective: true,
      status: true,
      landingSlug: true,
      totalLeads: true,
      contacted: true,
      meetingsScheduled: true,
      adAssets: true,
      createdAt: true,
    },
  })

  const campaignIds = campaigns.map(campaign => campaign.id)
  const eventVisitGroups = campaignIds.length
    ? await prisma.acquisitionEvent.groupBy({
        by: ['campaignId'],
        where: {
          orgId,
          campaignId: { in: campaignIds },
          type: 'landing_view',
        },
        _count: { id: true },
      })
    : []
  const eventVisitsByCampaign = new Map(
    eventVisitGroups.map(group => [group.campaignId, group._count.id])
  )

  const funnels: Funnel[] = campaigns.map(campaign => {
    // Los eventos son la fuente de verdad desde que existe atribucion. Para
    // campanas anteriores sin eventos conservamos el contador legacy.
    const eventVisits = eventVisitsByCampaign.get(campaign.id)
    const legacyVisits = readVisits(campaign.adAssets)
    const visits = campaign.landingSlug
      ? (eventVisits === undefined ? legacyVisits : (legacyVisits ?? 0) + eventVisits)
      : null
    const leads = campaign.totalLeads
    const contacted = campaign.contacted
    const meetings = campaign.meetingsScheduled
    return {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      landingSlug: campaign.landingSlug,
      createdAt: campaign.createdAt,
      visits,
      leads,
      contacted,
      meetings,
      rates: {
        visitToLead: percent(leads, visits),
        leadToContact: percent(contacted, leads),
        contactToMeeting: percent(meetings, contacted),
        visitToMeeting: percent(meetings, visits),
        leadToMeeting: percent(meetings, leads),
      },
    }
  })

  const summary = funnels.reduce((total, funnel) => ({
    active: total.active + (funnel.status === 'active' ? 1 : 0),
    visits: total.visits + (funnel.visits ?? 0),
    trackedFunnels: total.trackedFunnels + (funnel.landingSlug && funnel.visits !== null ? 1 : 0),
    trackedLeads: total.trackedLeads + (funnel.landingSlug && funnel.visits !== null ? funnel.leads : 0),
    trackedMeetings: total.trackedMeetings + (funnel.landingSlug && funnel.visits !== null ? funnel.meetings : 0),
    leads: total.leads + funnel.leads,
    contacted: total.contacted + funnel.contacted,
    meetings: total.meetings + funnel.meetings,
  }), { active: 0, visits: 0, trackedFunnels: 0, trackedLeads: 0, trackedMeetings: 0, leads: 0, contacted: 0, meetings: 0 })

  const withoutTracking = funnels.find(funnel => funnel.landingSlug && funnel.visits === null)
  const candidate = funnels
    .map(funnel => ({ funnel, bottleneck: bottleneck(funnel) }))
    .filter((item): item is { funnel: Funnel; bottleneck: { label: string; rate: number; previous: number } } => item.bottleneck !== null)
    .sort((a, b) => a.bottleneck.rate - b.bottleneck.rate)[0]

  const recommendation = withoutTracking
    ? {
        funnelId: withoutTracking.id,
        title: 'Mide las visitas antes de optimizar',
        detail: `${withoutTracking.name} ya capta resultados, pero todavia no registra visitas. Asi sabras si el freno esta en la landing o despues del formulario.`,
        action: { label: 'Revisar landing', to: '/landings' },
      }
    : candidate
      ? {
          funnelId: candidate.funnel.id,
          title: `Refuerza el paso de ${candidate.bottleneck.label}`,
          detail: `${candidate.funnel.name} convierte un ${candidate.bottleneck.rate.toLocaleString('es-ES')}% en esta transicion. Es el punto con mayor margen de mejora medible.`,
          action: { label: 'Abrir funnel', to: `/funnels?selected=${candidate.funnel.id}` },
        }
      : null

  return {
    funnels,
    summary: {
      ...summary,
      untrackedFunnels: funnels.filter(funnel => funnel.landingSlug && funnel.visits === null).length,
      visitToLead: percent(summary.trackedLeads, summary.trackedFunnels > 0 ? summary.visits : null),
      visitToMeeting: percent(summary.trackedMeetings, summary.trackedFunnels > 0 ? summary.visits : null),
    },
    recommendation,
  }
}

export async function createFunnel(orgId: string, data: { name: string; objective?: string | null }) {
  const landingSlug = slugify(data.name)
  return prisma.campaign.create({
    data: {
      orgId,
      name: data.name,
      objective: data.objective || null,
      landingSlug,
      adAssets: {
        landingTemplateId: 'generic-v1',
        funnelSource: 'funnels',
      },
    },
    select: { id: true, name: true, landingSlug: true, status: true },
  })
}
