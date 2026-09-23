import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'

/** Tasa entre etapas consecutivas; `null` si falta el dato anterior o es 0. */
export function percent(current: number, previous: number | null) {
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

export type Funnel = {
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

/** Transición medible con peor tasa; ignora etapas sin dato anterior. */
export function bottleneck(funnel: Funnel) {
  const stages = [
    { label: 'visita a lead', rate: funnel.rates.visitToLead, previous: funnel.visits },
    { label: 'lead a contacto', rate: funnel.rates.leadToContact, previous: funnel.leads },
    { label: 'contacto a reunion', rate: funnel.rates.contactToMeeting, previous: funnel.contacted },
  ].filter((stage): stage is { label: string; rate: number; previous: number } => stage.rate !== null && stage.previous !== null && stage.previous > 0)

  return stages.sort((a, b) => a.rate - b.rate)[0] ?? null
}

type CampaignRow = {
  id: string
  name: string
  objective: string | null
  status: string
  landingSlug: string | null
  totalLeads: number
  contacted: number
  meetingsScheduled: number
  createdAt: Date
}

/**
 * Convierte una campaña y sus visitas medidas en un funnel. Función pura: la
 * consulta a Prisma vive en `getFunnelsOverview` para poder probar esto offline.
 */
export function buildFunnel(campaign: CampaignRow, eventVisits: number | undefined): Funnel {
  // Las visitas son las que se midieron y nada más. `adAssets.visits` era un
  // contador escrito a mano que aquí se SUMABA a los eventos reales: una
  // campaña con 200 visitas heredadas y 30 medidas mostraba 230. Es la doble
  // fuente de verdad que señala docs/vendrava/landings.md §12.
  //
  // Sin eventos el valor es `null` —sin medición—, nunca `0`: una campaña
  // anterior a la atribución no midió cero visitas, no midió ninguna.
  const visits = campaign.landingSlug ? eventVisits ?? null : null
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
}

/** Resumen y recomendación a partir de funnels ya calculados (función pura). */
export function summarizeFunnels(funnels: Funnel[]) {
  // Los funnels finalizados siguen visibles, pero no deben generar una
  // recomendación de optimización: ya no captan.
  const live = funnels.filter(funnel => funnel.status !== 'done')
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

  const withoutTracking = live.find(funnel => funnel.landingSlug && funnel.visits === null)
  const candidate = live
    .map(funnel => ({ funnel, bottleneck: bottleneck(funnel) }))
    .filter((item): item is { funnel: Funnel; bottleneck: { label: string; rate: number; previous: number } } => item.bottleneck !== null)
    .sort((a, b) => a.bottleneck.rate - b.bottleneck.rate)[0]

  const recommendation = withoutTracking
    ? {
        funnelId: withoutTracking.id,
        title: 'Mide las visitas antes de optimizar',
        detail: `${withoutTracking.name} ya capta resultados, pero todavia no registra visitas. Asi sabras si el freno esta en la landing o despues del formulario.`,
        action: { label: 'Revisar landing', to: '/captacion/convertir?tab=landings' },
      }
    : candidate
      ? {
          funnelId: candidate.funnel.id,
          title: `Refuerza el paso de ${candidate.bottleneck.label}`,
          detail: `${candidate.funnel.name} convierte un ${candidate.bottleneck.rate.toLocaleString('es-ES')}% en esta transicion. Es el punto con mayor margen de mejora medible.`,
          action: { label: 'Abrir funnel', to: `/captacion/cerrar?selected=${candidate.funnel.id}` },
        }
      : null

  return {
    funnels,
    summary: {
      ...summary,
      untrackedFunnels: live.filter(funnel => funnel.landingSlug && funnel.visits === null).length,
      visitToLead: percent(summary.trackedLeads, summary.trackedFunnels > 0 ? summary.visits : null),
      visitToMeeting: percent(summary.trackedMeetings, summary.trackedFunnels > 0 ? summary.visits : null),
    },
    recommendation,
  }
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

  return summarizeFunnels(campaigns.map(campaign => buildFunnel(campaign, eventVisitsByCampaign.get(campaign.id))))
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


// ─── Ciclo de vida del funnel ────────────────────────────────────────────────
// Un funnel es una Campaign (CampaignStatus: draft | active | paused | done).
// Cambiar su estado desde aquí NUNCA encola llamadas: eso solo lo hace
// POST /api/campaigns/:id/start. Activar publica la landing (el controlador
// público solo sirve campañas `active`).

export type FunnelStatus = 'draft' | 'active' | 'paused' | 'done'
export type FunnelTargetStatus = 'active' | 'paused' | 'done'

export class FunnelNotFoundError extends Error {
  constructor() {
    super('Funnel no encontrado')
    this.name = 'FunnelNotFoundError'
  }
}

export class FunnelStatusError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'FunnelStatusError'
  }
}

/**
 * Decide si una transición de estado es válida (función pura).
 * - `done` es terminal: un funnel finalizado no se reabre desde aquí.
 * - Activar una campaña con agente de voz podría liberar llamadas ya en cola
 *   (el runtime solo exige campaña `active`), así que se deriva a Campañas.
 * Devuelve `null` si la transición es válida o el error que la impide.
 */
export function funnelStatusTransitionError(
  current: string,
  next: FunnelTargetStatus,
  options: { hasAgent: boolean },
): FunnelStatusError | null {
  if (current === next) return new FunnelStatusError('El funnel ya está en ese estado.', 'FUNNEL_STATUS_UNCHANGED')
  if (current === 'done') return new FunnelStatusError('El funnel está finalizado y no puede cambiar de estado.', 'FUNNEL_FINISHED')
  if (next === 'paused' && current !== 'active') return new FunnelStatusError('Solo se puede pausar un funnel activo.', 'FUNNEL_NOT_ACTIVE')
  if (next === 'active' && options.hasAgent) {
    return new FunnelStatusError('Este funnel tiene un agente de voz asignado: actívalo desde Campañas para revisar las llamadas antes de lanzarlo.', 'FUNNEL_HAS_AGENT')
  }
  return null
}

export async function updateFunnelStatus(orgId: string, actorUserId: string, id: string, status: FunnelTargetStatus) {
  const before = await prisma.campaign.findFirst({
    where: { id, orgId },
    select: { id: true, name: true, status: true, agentId: true },
  })
  if (!before) throw new FunnelNotFoundError()

  const transitionError = funnelStatusTransitionError(before.status, status, { hasAgent: Boolean(before.agentId) })
  if (transitionError) throw transitionError

  // Condicionado al estado leído: si otra sesión lo cambió entretanto, no pisamos.
  const result = await prisma.campaign.updateMany({
    where: { id, orgId, status: before.status },
    data: { status },
  })
  if (result.count !== 1) throw new FunnelStatusError('El funnel cambió mientras lo editabas. Recarga e inténtalo de nuevo.', 'FUNNEL_STATUS_CONFLICT')

  const after = { id: before.id, name: before.name, status }
  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'funnel.status',
    entityType: 'Campaign',
    entityId: id,
    before: { status: before.status },
    after: { status },
  })
  return after
}
