import { prisma } from '../lib/prisma'
import { QUALIFYING_CALL_OUTCOMES } from '../lib/callOutcome'
import { getTrafficByChannel } from './organicGoogleIngest.service'

/**
 * Embudo orgánico unificado y snapshots por canal — `docs/xarly/organico.md`
 * §5.3 y §10.
 *
 *   presencia → visita → lead → cualificado → oportunidad → venta
 *
 * Tres reglas que este servicio no negocia:
 *
 * 1. **Un cualificado se cuenta igual venga de donde venga.** Misma definición
 *    que `ads.md` §4.4 (`lib/callOutcome.ts`): el embudo no puede contar
 *    distinto según el canal que trajo el lead.
 *
 * 2. **El tráfico sin UTM no se reparte entre canales.** Va a un canal propio,
 *    `unattributed`. Estimar su origen en silencio es la forma más cómoda de
 *    inflar el canal favorito.
 *
 * 3. **Las latencias orgánicas se respetan.** Un artículo tarda semanas en
 *    posicionar, así que una cohorte joven no se declara fracaso.
 */

export const ORGANIC_CHANNELS = ['search', 'social', 'gbp', 'prospecting', 'unattributed'] as const
export type OrganicChannel = (typeof ORGANIC_CHANNELS)[number]

const CHANNEL_LABEL: Record<OrganicChannel, string> = {
  search: 'Búsqueda',
  social: 'Redes',
  gbp: 'Ficha de Google',
  prospecting: 'Prospección',
  unattributed: 'Origen no identificado',
}

/**
 * El orgánico madura mucho más despacio que Ads: una pieza puede tardar
 * semanas en posicionar y meses en producir su primera venta.
 */
const SALE_MATURITY_DAYS = 45
const QUALIFICATION_MATURITY_DAYS = 7
const MIN_LEADS_FOR_MATURE = 10

/**
 * Clasifica un evento de captación en su canal. Deliberadamente conservador:
 * lo que no se reconoce va a `unattributed` en vez de caer en el canal más
 * probable, que es como se fabrica una atribución que parece buena.
 */
/**
 * Medios que delatan tráfico pagado. Un lead de Meta Ads que aterriza en una
 * landing genera `landing_lead` igual que uno de búsqueda: sin esta exclusión
 * el embudo orgánico se apunta los leads que ya pagó Ads.
 */
const PAID_MEDIUMS = ['paid_social', 'cpc', 'ppc', 'paid', 'display', 'retargeting']
const PAID_SOURCES = ['meta', 'facebook_ads', 'google_ads', 'adwords', 'tiktok_ads']

export function isOrganicEvent(event: { type: string; source: string | null; medium: string | null }): boolean {
  const source = (event.source ?? '').toLowerCase()
  const medium = (event.medium ?? '').toLowerCase()
  if (PAID_MEDIUMS.some(paid => medium.includes(paid))) return false
  // `meta` como fuente exacta es Ads; `metricool` no, de ahí la comparación
  // por igualdad y no por inclusión.
  if (PAID_SOURCES.includes(source)) return false
  return true
}

export function classifyChannel(event: { type: string; source: string | null; medium: string | null }): OrganicChannel {
  const source = (event.source ?? '').toLowerCase()
  const medium = (event.medium ?? '').toLowerCase()

  if (event.type === 'prospect_import') return 'prospecting'
  if (medium.includes('organic_social') || source.includes('instagram') || source.includes('linkedin') || source.includes('facebook') || source.includes('tiktok')) return 'social'
  if (source.includes('business') || source.includes('gbp') || source.includes('maps')) return 'gbp'
  if (medium === 'organic' || source.includes('google') || source.includes('bing') || source.includes('search')) return 'search'
  return 'unattributed'
}

function conversion(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round((current / previous) * 1000) / 10
}

export async function buildChannelSnapshots(orgId: string, projectId: string, periodKey: string, periodDays: number) {
  const periodStart = new Date(Date.now() - periodDays * 86_400_000)
  const now = Date.now()

  const allEvents = await prisma.acquisitionEvent.findMany({
    where: { orgId, createdAt: { gte: periodStart }, leadId: { not: null } },
    select: { type: true, source: true, medium: true, leadId: true, createdAt: true },
  })
  // El tráfico pagado se descarta antes de clasificar: lo mide Ads.
  const events = allEvents.filter(isOrganicEvent)
  // Un lead que tuvo cualquier toque pagado no es orgánico aunque después
  // llegara por búsqueda: atribuírselo al orgánico sería quitárselo a Ads.
  const paidLeadIds = new Set(allEvents.filter(event => !isOrganicEvent(event)).map(event => event.leadId))

  // Un lead puede tener varios eventos; se le asigna su primer canal conocido
  // para no contarlo en dos sitios y duplicar el embudo.
  const leadChannel = new Map<string, OrganicChannel>()
  const leadCreatedAt = new Map<string, Date>()
  for (const event of events) {
    if (!event.leadId || leadChannel.has(event.leadId) || paidLeadIds.has(event.leadId)) continue
    leadChannel.set(event.leadId, classifyChannel(event))
    leadCreatedAt.set(event.leadId, event.createdAt)
  }

  const leadIds = Array.from(leadChannel.keys())
  // El tráfico ingerido se lee aquí y no en un paso posterior a propósito: esta
  // función reconstruye el snapshot entero, así que cualquier dato escrito
  // después se perdería en la siguiente reconstrucción.
  const traffic = await getTrafficByChannel(orgId, projectId, periodStart)
  const [qualified, opportunities, presence] = await Promise.all([
    leadIds.length
      ? prisma.lead.findMany({
          where: { orgId, id: { in: leadIds }, calls: { some: { outcome: { in: [...QUALIFYING_CALL_OUTCOMES] } } } },
          select: { id: true },
        })
      : Promise.resolve([]),
    leadIds.length
      ? prisma.opportunity.findMany({
          where: { orgId, leadId: { in: leadIds } },
          select: { leadId: true, stage: true, value: true },
        })
      : Promise.resolve([]),
    prisma.organicOpportunity.count({ where: { orgId, projectId } }),
  ])

  const qualifiedIds = new Set(qualified.map(lead => lead.id))
  const rows = new Map<OrganicChannel, {
    leads: number; qualified: number; opportunities: number; sales: number; revenueCents: number
    matureLeads: number; evaluableLeads: number
  }>()
  for (const channel of ORGANIC_CHANNELS) {
    rows.set(channel, { leads: 0, qualified: 0, opportunities: 0, sales: 0, revenueCents: 0, matureLeads: 0, evaluableLeads: 0 })
  }

  for (const [leadId, channel] of leadChannel) {
    const row = rows.get(channel)!
    row.leads += 1
    if (qualifiedIds.has(leadId)) row.qualified += 1
    const ageDays = (now - (leadCreatedAt.get(leadId)?.getTime() ?? now)) / 86_400_000
    if (ageDays >= SALE_MATURITY_DAYS) row.matureLeads += 1
    if (ageDays >= QUALIFICATION_MATURITY_DAYS) row.evaluableLeads += 1
  }
  for (const opportunity of opportunities) {
    const channel = leadChannel.get(opportunity.leadId)
    if (!channel) continue
    const row = rows.get(channel)!
    row.opportunities += 1
    if (opportunity.stage === 'closed_won') {
      row.sales += 1
      if (opportunity.value != null) row.revenueCents += Math.round(Number(opportunity.value) * 100)
    }
  }

  const snapshots = []
  for (const channel of ORGANIC_CHANNELS) {
    const row = rows.get(channel)!
    const cohortStatus = row.matureLeads >= MIN_LEADS_FOR_MATURE
      ? 'mature'
      : row.evaluableLeads >= MIN_LEADS_FOR_MATURE
        ? 'maturing'
        : 'insufficient'

    const channelTraffic = traffic.get(channel)
    // La ficha de Google mide su presencia en vistas; la búsqueda, en consultas
    // de Search Console. Redes y prospección siguen sin fuente de presencia, y
    // eso es `null`, no cero.
    const gbpViews = channel === 'gbp' ? channelTraffic?.views ?? null : null
    const data = {
      orgId,
      projectId,
      channel,
      periodKey,
      periodDays,
      periodStart,
      presence: channel === 'search' ? presence : gbpViews,
      presenceUnit: channel === 'search' ? 'consultas' : gbpViews != null ? 'vistas de ficha' : null,
      // Visitas reales de GA4. `null` mientras no haya ni una fila ingerida.
      visits: channelTraffic?.visits ?? null,
      leads: row.leads,
      qualified: row.qualified,
      opportunities: row.opportunities,
      sales: row.sales,
      revenueCents: row.revenueCents || null,
      hoursInvested: null,
      cohortStatus,
      computedAt: new Date(),
    }
    snapshots.push(
      await prisma.organicChannelSnapshot.upsert({
        where: { projectId_channel_periodKey: { projectId, channel, periodKey } },
        create: data,
        update: data,
      })
    )
  }
  return snapshots
}

/** Embudo unificado y desglose por canal, leídos de los snapshots. */
export async function getUnifiedFunnel(orgId: string, projectId: string, periodKey: string, periodDays: number) {
  let snapshots = await prisma.organicChannelSnapshot.findMany({ where: { orgId, projectId, periodKey } })
  const stale = !snapshots.length || snapshots.some(item => Date.now() - item.computedAt.getTime() > 3_600_000)
  if (stale) snapshots = await buildChannelSnapshots(orgId, projectId, periodKey, periodDays)

  const totals = snapshots.reduce((sum, item) => ({
    leads: sum.leads + (item.leads ?? 0),
    qualified: sum.qualified + (item.qualified ?? 0),
    opportunities: sum.opportunities + (item.opportunities ?? 0),
    sales: sum.sales + (item.sales ?? 0),
    presence: sum.presence + (item.presence ?? 0),
    // Se acumula aparte para distinguir "ningún canal mide visitas" (null) de
    // "se midieron y fueron cero".
    visits: item.visits == null ? sum.visits : (sum.visits ?? 0) + item.visits,
  }), { leads: 0, qualified: 0, opportunities: 0, sales: 0, presence: 0, visits: null as number | null })

  const funnel = [
    { key: 'presence', label: 'Presencia', value: totals.presence || null, conversionPct: null },
    // Visitas reales de GA4; `null` mientras esa ingesta no haya traído nada.
    // Cada paso lleva su tasa contra el anterior, así que el tramo
    // presencia → visita → lead solo aparece cuando GA4 mide de verdad.
    { key: 'visit', label: 'Visitas', value: totals.visits, conversionPct: conversion(totals.visits ?? 0, totals.presence) },
    { key: 'lead', label: 'Leads', value: totals.leads, conversionPct: conversion(totals.leads, totals.visits ?? 0) },
    { key: 'qualified', label: 'Cualificados', value: totals.qualified, conversionPct: conversion(totals.qualified, totals.leads) },
    { key: 'opportunity', label: 'Oportunidades', value: totals.opportunities, conversionPct: conversion(totals.opportunities, totals.qualified) },
    { key: 'sale', label: 'Ventas', value: totals.sales, conversionPct: conversion(totals.sales, totals.opportunities) },
  ]

  const channels = snapshots
    .filter(item => (item.leads ?? 0) > 0 || (item.presence ?? 0) > 0)
    .map(item => ({
      channel: item.channel,
      label: CHANNEL_LABEL[item.channel as OrganicChannel] ?? item.channel,
      presence: item.presence,
      presenceUnit: item.presenceUnit,
      visits: item.visits,
      leads: item.leads,
      qualified: item.qualified,
      opportunities: item.opportunities,
      sales: item.sales,
      hoursInvested: item.hoursInvested,
      cohortStatus: item.cohortStatus,
      qualificationPct: conversion(item.qualified ?? 0, item.leads ?? 0),
      // La señal más profunda elegible por canal (§5.3), con las mismas
      // exigencias de volumen y madurez que Ads.
      deepestEligibleSignal: (item.sales ?? 0) >= 3 && item.cohortStatus === 'mature'
        ? 'sale'
        : (item.qualified ?? 0) >= 5
          ? 'qualified_lead'
          : (item.leads ?? 0) > 0
            ? 'lead'
            : 'presence',
    }))
    .sort((left, right) => (right.qualified ?? 0) - (left.qualified ?? 0) || (right.leads ?? 0) - (left.leads ?? 0))

  return { funnel, channels, periodKey, periodDays }
}

/**
 * Informe semanal narrado, versión observacional (§5.7). Comparte enfoque con
 * el de Ads: plantillas, no LLM. Un informe que puede alucinar una cifra no
 * sirve para decidir dónde poner las horas.
 */
export function buildOrganicNarrative(input: {
  periodDays: number
  funnel: Array<{ key: string; label: string; value: number | null; conversionPct: number | null }>
  channels: Array<{ label: string; leads: number | null; qualified: number | null; sales: number | null; qualificationPct: number | null; cohortStatus: string }>
  /** Resultado de lo despachado: la prueba de valor de la fase 3. */
  outcomes?: {
    evaluated: Array<{ title: string; outcomeStatus: string; outcomeSummary: string | null }>
    maturing: number
  }
}) {
  const measured = input.channels.filter(channel => (channel.leads ?? 0) > 0)
  if (!measured.length) return null

  const leads = input.funnel.find(step => step.key === 'lead')?.value ?? 0
  const qualified = input.funnel.find(step => step.key === 'qualified')?.value ?? 0
  const sales = input.funnel.find(step => step.key === 'sale')?.value ?? 0

  const best = [...measured].sort((left, right) => (right.sales ?? 0) - (left.sales ?? 0) || (right.qualified ?? 0) - (left.qualified ?? 0))[0]
  const worst = [...measured]
    .filter(channel => channel.qualificationPct != null && (channel.leads ?? 0) >= 5)
    .sort((left, right) => (left.qualificationPct ?? 0) - (right.qualificationPct ?? 0))[0]
  const immature = measured.filter(channel => channel.cohortStatus !== 'mature')
  const unattributed = input.channels.find(channel => channel.label.startsWith('Origen no'))

  const sections = [
    {
      key: 'deepest',
      title: 'Qué canal llegó más lejos',
      body: `“${best.label}” es el que más avanza: ${best.qualified ?? 0} cualificados y ${best.sales ?? 0} ventas sobre ${best.leads ?? 0} leads.`,
    },
  ]

  if (worst && worst.label !== best.label) {
    sections.push({
      key: 'leak',
      title: 'Dónde se pierde el embudo',
      body: `“${worst.label}” trae ${worst.leads} leads pero solo cualifica el ${worst.qualificationPct} %. ` +
        'Suele significar que el tráfico llega con otra intención o aterriza en una página pensada para otro canal.',
    })
  }

  if (unattributed && (unattributed.leads ?? 0) > 0) {
    sections.push({
      key: 'coverage',
      title: 'Cobertura de atribución',
      // No se reparte entre canales: se declara como lo que es.
      body: `${unattributed.leads} leads llegaron sin origen identificable. No se reparten entre canales: hacerlo inflaría al que ya parece mejor.`,
    })
  }

  if (immature.length) {
    sections.push({
      key: 'immature',
      title: 'Qué datos siguen inmaduros',
      body: `${immature.length === 1 ? 'Un canal tiene' : `${immature.length} canales tienen`} la cohorte sin madurar. ` +
        'El orgánico tarda semanas en producir su primera venta, así que su ausencia todavía no significa nada.',
    })
  }

  // Que paso con lo que Xarly recomendo. Sin esta seccion el informe solo
  // demuestra que se dijo algo, no que sirviera de algo.
  if (input.outcomes && (input.outcomes.evaluated.length || input.outcomes.maturing)) {
    const done = input.outcomes.evaluated
    const parts: string[] = []
    if (done.length) {
      const worked = done.filter(item => item.outcomeStatus === 'evaluated' && item.outcomeSummary?.startsWith('Funcion'))
      parts.push(
        `${done.length === 1 ? 'Se ha evaluado 1 recomendacion' : `Se han evaluado ${done.length} recomendaciones`} ya madura` +
        `${done.length === 1 ? '' : 's'}${worked.length ? `, ${worked.length} con el efecto esperado` : ''}. ` +
        done.slice(0, 2).map(item => `"${item.title}": ${item.outcomeSummary}`).join(' ')
      )
    }
    if (input.outcomes.maturing) {
      parts.push(`${input.outcomes.maturing} siguen madurando: todavia no se pueden juzgar.`)
    }
    sections.push({ key: 'outcomes', title: 'Que paso con lo recomendado', body: parts.join(' ') })
  }

  return {
    periodDays: input.periodDays,
    headline: `${leads} leads orgánicos en ${input.periodDays} días · ${qualified} cualificados · ${sales} ventas.`,
    sections,
    generatedAt: new Date().toISOString(),
  }
}
