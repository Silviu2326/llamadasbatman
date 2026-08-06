import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { QUALIFYING_CALL_OUTCOMES } from '../lib/callOutcome'

/**
 * Capas 2 y 3 de docs/vendrava/landings.md §3.3.
 *
 *   LandingEvent  →  LandingDailyRollup  →  LandingPerformanceSnapshot
 *
 * La página lee snapshots; nunca reconstruye el embudo desde eventos brutos en
 * cada carga. Regla que gobierna todo este fichero: `null` significa "sin
 * medición" y `0` significa "se midió y salió cero" (§2). Devolver `0` cuando
 * no se sabe es lo que convierte una integración a medias en un diagnóstico
 * falso de "esta landing no vende".
 */

/** Ventana habitual de §3.4. */
export const DEFAULT_PERIOD_DAYS = 28

/**
 * Umbrales de confianza. Son convenciones del producto, no estadística: sirven
 * para no llamar "degradada" a una landing con catorce visitas. El umbral real
 * del A/B (§9) es otra cosa y vive en la fase 3.
 */
const CONFIDENCE_THRESHOLDS = { low: 50, medium: 200, high: 1000 } as const

/** Volumen mínimo para que un diagnóstico pueda emitirse (§3.4). */
const MIN_SESSIONS_FOR_DIAGNOSIS = 200

/**
 * Días que tarda una cohorte en poder juzgarse: una venta puede aparecer
 * semanas después de la visita, así que el período recién cerrado todavía no
 * es comparable con el histórico (§4.2 de ads.md).
 */
const MATURITY_LAG_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

/** Eventos que hablan de un campo del formulario y solo de eso. */
const FORM_FIELD_EVENTS = new Set(['form_field_blur', 'form_validation_error'])

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

interface FieldStat {
  exposed: number
  interacted: number
  completed: number
  validationErrors: number
  totalMs: number
  timedSamples: number
}

function emptyFieldStat(): FieldStat {
  return { exposed: 0, interacted: 0, completed: 0, validationErrors: 0, totalMs: 0, timedSamples: 0 }
}

interface RollupBucket {
  orgId: string
  landingKey: string
  landingVersionId: string
  variantId: string
  day: Date
  source: string
  device: string
  sessions: Set<string>
  views: number
  scroll50: number
  scroll90: number
  ctaClicks: number
  formStarts: number
  formSubmits: number
  fields: Map<string, FieldStat>
}

function bucketKey(bucket: Omit<RollupBucket, 'sessions' | 'views' | 'scroll50' | 'scroll90' | 'ctaClicks' | 'formStarts' | 'formSubmits' | 'fields'>) {
  return [
    bucket.landingKey,
    bucket.landingVersionId,
    bucket.variantId,
    bucket.day.toISOString().slice(0, 10),
    bucket.source,
    bucket.device,
  ].join('|')
}

/**
 * Recalcula los agregados diarios de una organización.
 *
 * Recalcular en vez de acumular es deliberado: un lote de eventos puede llegar
 * tarde (`sendBeacon` al cerrar la pestaña, un reintento tras un fallo de red)
 * y sumar sobre lo ya escrito duplicaría esas sesiones.
 */
export async function buildDailyRollups(orgId: string, days = DEFAULT_PERIOD_DAYS) {
  const since = startOfUtcDay(new Date(Date.now() - days * DAY_MS))

  const events = await prisma.landingEvent.findMany({
    where: { orgId, occurredAt: { gte: since } },
    select: {
      landingKey: true,
      landingVersionId: true,
      variantId: true,
      sessionId: true,
      type: true,
      field: true,
      filled: true,
      value: true,
      source: true,
      device: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: 'asc' },
  })

  const buckets = new Map<string, RollupBucket>()

  for (const event of events) {
    const base = {
      orgId,
      landingKey: event.landingKey,
      landingVersionId: event.landingVersionId,
      variantId: event.variantId ?? '',
      day: startOfUtcDay(event.occurredAt),
      source: event.source,
      device: event.device ?? 'unknown',
    }
    const key = bucketKey(base)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { ...base, sessions: new Set(), views: 0, scroll50: 0, scroll90: 0, ctaClicks: 0, formStarts: 0, formSubmits: 0, fields: new Map() }
      buckets.set(key, bucket)
    }

    bucket.sessions.add(event.sessionId)

    switch (event.type) {
      case 'view': bucket.views += 1; break
      case 'scroll_50': bucket.scroll50 += 1; break
      case 'scroll_90': bucket.scroll90 += 1; break
      case 'cta_click': bucket.ctaClicks += 1; break
      case 'form_start': bucket.formStarts += 1; break
      case 'form_submit': bucket.formSubmits += 1; break
      default: break
    }

    // Exposición real por campo (§7.2): quien llegó al campo, quien lo tocó y
    // quien lo dejó relleno. Contar "abandonos después del campo X" sin esto
    // premia siempre al último campo, al que llega poca gente.
    //
    // Solo eventos de formulario: `cta_click` también trae `field` —el CTA que
    // se pulsó— y crearía campos fantasma con todo a cero.
    if (event.field && FORM_FIELD_EVENTS.has(event.type)) {
      let stat = bucket.fields.get(event.field)
      if (!stat) {
        stat = emptyFieldStat()
        bucket.fields.set(event.field, stat)
      }
      if (event.type === 'form_field_blur') {
        stat.exposed += 1
        stat.interacted += 1
        if (event.filled) stat.completed += 1
        if (typeof event.value === 'number') {
          stat.totalMs += event.value
          stat.timedSamples += 1
        }
      }
      if (event.type === 'form_validation_error') {
        stat.validationErrors += 1
        // Un error de validación demuestra exposición aunque el blur se
        // perdiera por el camino.
        if (!stat.exposed) stat.exposed += 1
      }
    }
  }

  for (const bucket of buckets.values()) {
    const fieldStats = Object.fromEntries(
      Array.from(bucket.fields.entries()).map(([field, stat]) => [field, {
        exposed: stat.exposed,
        interacted: stat.interacted,
        completed: stat.completed,
        validationErrors: stat.validationErrors,
        // `null` y no `0`: sin muestras cronometradas no se conoce el tiempo.
        averageMs: stat.timedSamples ? Math.round(stat.totalMs / stat.timedSamples) : null,
      }])
    )

    const data = {
      orgId: bucket.orgId,
      landingKey: bucket.landingKey,
      landingVersionId: bucket.landingVersionId,
      variantId: bucket.variantId,
      day: bucket.day,
      source: bucket.source,
      device: bucket.device,
      sessions: bucket.sessions.size,
      views: bucket.views,
      scroll50: bucket.scroll50,
      scroll90: bucket.scroll90,
      ctaClicks: bucket.ctaClicks,
      formStarts: bucket.formStarts,
      formSubmits: bucket.formSubmits,
      fieldStats: fieldStats as Prisma.InputJsonObject,
      computedAt: new Date(),
    }

    await prisma.landingDailyRollup.upsert({
      where: {
        landingKey_landingVersionId_variantId_day_source_device: {
          landingKey: bucket.landingKey,
          landingVersionId: bucket.landingVersionId,
          variantId: bucket.variantId,
          day: bucket.day,
          source: bucket.source,
          device: bucket.device,
        },
      },
      create: data,
      update: data,
    })
  }

  return { buckets: buckets.size, events: events.length }
}

function confidenceFrom(sessions: number | null) {
  if (sessions === null || sessions < CONFIDENCE_THRESHOLDS.low) return 'none'
  if (sessions < CONFIDENCE_THRESHOLDS.medium) return 'low'
  if (sessions < CONFIDENCE_THRESHOLDS.high) return 'medium'
  return 'high'
}

function maturityFrom(sessions: number | null, periodEnd: Date) {
  if (sessions === null || sessions < MIN_SESSIONS_FOR_DIAGNOSIS) return 'insufficient'
  const closedFor = Date.now() - periodEnd.getTime()
  return closedFor >= MATURITY_LAG_DAYS * DAY_MS ? 'mature' : 'maturing'
}

function attributionOf(customFields: Prisma.JsonValue | null) {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return null
  const attribution = (customFields as Record<string, unknown>).attribution
  if (!attribution || typeof attribution !== 'object' || Array.isArray(attribution)) return null
  return attribution as Record<string, unknown>
}

/**
 * Embudo económico de una landing en un período: visita → lead → cualificado →
 * oportunidad → venta, con cobertura de atribución y madurez declaradas.
 */
export async function buildSnapshot(
  campaign: { id: string; orgId: string; landingKey: string | null },
  periodStart: Date,
  periodEnd: Date
) {
  if (!campaign.landingKey) return null

  // Si la landing nunca se sirvió desde que existe la telemetría no hay
  // versión y, por tanto, no hay medición posible: `null`, no cero.
  const hasTelemetry = await prisma.landingVersion.findFirst({
    where: { landingKey: campaign.landingKey },
    select: { id: true },
  })

  const visits = hasTelemetry
    ? await prisma.landingEvent.count({
        where: { landingKey: campaign.landingKey, type: 'view', occurredAt: { gte: periodStart, lt: periodEnd } },
      })
    : null

  const leads = await prisma.lead.findMany({
    where: { orgId: campaign.orgId, campaignId: campaign.id, createdAt: { gte: periodStart, lt: periodEnd } },
    select: {
      id: true,
      customFields: true,
      calls: { select: { outcome: true } },
      opportunities: { select: { stage: true, value: true } },
    },
  })

  const qualifying = new Set<string>(QUALIFYING_CALL_OUTCOMES)
  const leadsWithCalls = leads.filter(lead => lead.calls.length > 0)
  const qualified = leadsWithCalls.filter(lead => lead.calls.some(call => qualifying.has(call.outcome ?? ''))).length
  const opportunities = leads.reduce((total, lead) => total + lead.opportunities.length, 0)
  const wonOpportunities = leads.flatMap(lead => lead.opportunities).filter(opportunity => opportunity.stage === 'closed_won')
  const valuedSales = wonOpportunities.filter(opportunity => opportunity.value !== null)
  const attributedLeads = leads.filter(lead => Boolean(attributionOf(lead.customFields)?.sessionId)).length

  const funnel = {
    // Cada paso declara su cobertura: un `null` aquí es una integración
    // incompleta, no un resultado malo.
    visits,
    leads: leads.length,
    // Sin ninguna llamada registrada, el paso de cualificación no se midió.
    qualified: leadsWithCalls.length ? qualified : null,
    opportunities,
    sales: wonOpportunities.length,
  }

  return prisma.landingPerformanceSnapshot.upsert({
    where: {
      landingKey_periodStart_periodEnd: {
        landingKey: campaign.landingKey,
        periodStart,
        periodEnd,
      },
    },
    create: {
      orgId: campaign.orgId,
      campaignId: campaign.id,
      landingKey: campaign.landingKey,
      periodStart,
      periodEnd,
      ...snapshotMetrics(funnel, leads.length, attributedLeads, wonOpportunities, valuedSales, visits, periodEnd),
    },
    update: snapshotMetrics(funnel, leads.length, attributedLeads, wonOpportunities, valuedSales, visits, periodEnd),
  })
}

function snapshotMetrics(
  funnel: { visits: number | null; leads: number; qualified: number | null; opportunities: number; sales: number },
  totalLeads: number,
  attributedLeads: number,
  wonOpportunities: { value: Prisma.Decimal | null }[],
  valuedSales: { value: Prisma.Decimal | null }[],
  visits: number | null,
  periodEnd: Date
) {
  // Ventas cerradas sin importe: el número de ventas es real, el ingreso no se
  // conoce. Sumar solo las que tienen valor daría una cifra que parece
  // completa y no lo es.
  const revenueCents = wonOpportunities.length && !valuedSales.length
    ? null
    : valuedSales.reduce((total, opportunity) => total + Math.round(Number(opportunity.value) * 100), 0)

  return {
    visits,
    leads: funnel.leads,
    qualified: funnel.qualified,
    opportunities: funnel.opportunities,
    sales: funnel.sales,
    revenueCents,
    attributionCoverage: totalLeads ? Number((attributedLeads / totalLeads).toFixed(4)) : null,
    maturity: maturityFrom(visits, periodEnd),
    confidence: confidenceFrom(visits),
    funnel: funnel as unknown as Prisma.InputJsonObject,
    computedAt: new Date(),
  }
}

/** Refresco completo de una organización: agregados del día y snapshots. */
export async function refreshLandingPerformance(orgId: string, days = DEFAULT_PERIOD_DAYS) {
  await buildDailyRollups(orgId, days)

  const campaigns = await prisma.campaign.findMany({
    where: { orgId, landingKey: { not: null } },
    select: { id: true, orgId: true, landingKey: true },
  })

  const periodEnd = startOfUtcDay(new Date(Date.now() + DAY_MS))
  const periodStart = new Date(periodEnd.getTime() - days * DAY_MS)

  const snapshots = []
  for (const campaign of campaigns) {
    snapshots.push(await buildSnapshot(campaign, periodStart, periodEnd))
  }
  return { campaigns: campaigns.length, snapshots: snapshots.filter(Boolean).length }
}

/**
 * Lo que lee `/landings`: el estado de los datos antes que los números (§5).
 *
 * Devuelve siempre el snapshot tal cual se calculó, sin rellenar huecos: si un
 * paso del embudo vale `null`, la interfaz debe decir "sin medición", no cero.
 */
export async function getLandingsOverview(orgId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { orgId, landingSlug: { not: null } },
    select: { id: true, name: true, status: true, landingSlug: true, landingKey: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const landingKeys = campaigns.map(campaign => campaign.landingKey).filter((key): key is string => Boolean(key))

  const [snapshots, lastEvents, viewEvents, attributedViews] = await Promise.all([
    landingKeys.length
      ? prisma.landingPerformanceSnapshot.findMany({
          where: { orgId, landingKey: { in: landingKeys } },
          orderBy: { periodEnd: 'desc' },
        })
      : [],
    landingKeys.length
      ? prisma.landingEvent.groupBy({
          by: ['landingKey'],
          where: { orgId, landingKey: { in: landingKeys } },
          _max: { occurredAt: true },
        })
      : [],
    // Cobertura UTM sobre la entrada real de tráfico: se mide en la tubería de
    // atribución que ya existe, no en la telemetría nueva.
    prisma.acquisitionEvent.count({ where: { orgId, type: 'landing_view' } }),
    prisma.acquisitionEvent.count({ where: { orgId, type: 'landing_view', source: { not: 'direct' } } }),
  ])

  const latestByKey = new Map<string, (typeof snapshots)[number]>()
  for (const snapshot of snapshots) {
    if (!latestByKey.has(snapshot.landingKey)) latestByKey.set(snapshot.landingKey, snapshot)
  }
  const lastEventByKey = new Map(lastEvents.map(row => [row.landingKey, row._max.occurredAt]))

  const items = campaigns.map(campaign => {
    const snapshot = campaign.landingKey ? latestByKey.get(campaign.landingKey) ?? null : null
    const lastEventAt = campaign.landingKey ? lastEventByKey.get(campaign.landingKey) ?? null : null
    return {
      campaignId: campaign.id,
      name: campaign.name,
      status: campaign.status,
      slug: campaign.landingSlug,
      landingKey: campaign.landingKey,
      // `pending` = la landing existe pero aún no se ha servido desde que hay
      // telemetría. No es un cero: es que todavía no se sabe.
      telemetry: campaign.landingKey && lastEventAt ? 'active' : 'pending',
      lastEventAt,
      snapshot: snapshot && {
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        visits: snapshot.visits,
        leads: snapshot.leads,
        qualified: snapshot.qualified,
        opportunities: snapshot.opportunities,
        sales: snapshot.sales,
        revenueCents: snapshot.revenueCents,
        attributionCoverage: snapshot.attributionCoverage,
        maturity: snapshot.maturity,
        confidence: snapshot.confidence,
        computedAt: snapshot.computedAt,
      },
    }
  })

  const measured = items.filter(item => item.telemetry === 'active').length
  const freshest = items.reduce<Date | null>((latest, item) => {
    const computedAt = item.snapshot?.computedAt ?? null
    if (!computedAt) return latest
    return !latest || computedAt > latest ? computedAt : latest
  }, null)

  // El ranking económico (§5.2): más leads no es mejor landing, así que el
  // orden lo decide lo que produce compradores. Las landings sin medición no
  // compiten en el ranking — no han perdido, es que no se sabe.
  const ranking = [...items]
    .filter(item => item.snapshot)
    .sort((a, b) => {
      const value = (item: typeof a) => [
        item.snapshot?.revenueCents ?? -1,
        item.snapshot?.sales ?? -1,
        item.snapshot?.qualified ?? -1,
        item.snapshot?.leads ?? -1,
      ]
      const [aRevenue, aSales, aQualified, aLeads] = value(a)
      const [bRevenue, bSales, bQualified, bLeads] = value(b)
      return (bRevenue - aRevenue) || (bSales - aSales) || (bQualified - aQualified) || (bLeads - aLeads)
    })
    .map(item => item.campaignId)

  return {
    items,
    ranking,
    integrity: {
      landings: items.length,
      measured,
      // Sin una sola visita registrada, la cobertura UTM es desconocida, no 0%.
      utmCoverage: viewEvents ? Number((attributedViews / viewEvents).toFixed(4)) : null,
      lastComputedAt: freshest,
      // Estado de §4.2 de ads.md, con el mismo vocabulario.
      state: !items.length ? 'ready'
        : measured === 0 ? 'unreliable'
        : measured < items.length ? 'partial'
        : freshest && Date.now() - freshest.getTime() > 2 * DAY_MS ? 'stale'
        : 'ready',
    },
  }
}

/**
 * Detalle de una landing (§5.3): embudo económico, mapa de caída, origen del
 * tráfico y línea base. Los diagnósticos se añaden en el controlador para no
 * crear una dependencia circular entre servicios.
 */
export async function getLandingDetail(orgId: string, landingKey: string, days = DEFAULT_PERIOD_DAYS) {
  const campaign = await prisma.campaign.findFirst({
    where: { orgId, landingKey },
    select: { id: true, name: true, status: true, landingSlug: true, landingKey: true, adAssets: true },
  })
  if (!campaign) return null

  const since = startOfUtcDay(new Date(Date.now() - days * DAY_MS))

  const [allRollups, experimentRows, snapshot, versions, health] = await Promise.all([
    prisma.landingDailyRollup.findMany({
      where: { landingKey, day: { gte: since } },
      orderBy: { day: 'asc' },
    }),
    prisma.landingDailyRollup.count({
      where: { landingKey, day: { gte: since }, variantId: { not: '' } },
    }),
    prisma.landingPerformanceSnapshot.findFirst({
      where: { orgId, landingKey },
      orderBy: { periodEnd: 'desc' },
    }),
    prisma.landingVersion.findMany({
      where: { landingKey },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, publishedAt: true, contentHash: true },
      take: 10,
    }),
    prisma.landingHealthCheck.findFirst({
      where: { orgId, landingKey },
      orderBy: { checkedAt: 'desc' },
    }),
  ])

  // El mapa de caída describe la versión principal. Con un experimento activo,
  // mezclar variantes dibujaría un recorrido que ningún visitante hizo.
  const rollups = allRollups.filter(row => !row.variantId)
  const total = (pick: (row: (typeof rollups)[number]) => number) => rollups.reduce((sum, row) => sum + pick(row), 0)
  const sessions = total(row => row.sessions)

  // Mapa de caída: cada paso sobre las sesiones medidas. Sin sesiones, cada
  // tasa es `null` — no hay recorrido que dibujar.
  const rate = (value: number) => sessions ? Number((value / sessions).toFixed(4)) : null
  const dropMap = {
    sessions,
    // Los pasos son un recorrido y se leen como tal: cada uno es un
    // subconjunto del anterior.
    steps: [
      { key: 'view', label: 'Llegan a la landing', value: total(row => row.views), rate: sessions ? 1 : null },
      { key: 'scroll_50', label: 'Pasan de la mitad', value: total(row => row.scroll50), rate: rate(total(row => row.scroll50)) },
      { key: 'cta_click', label: 'Pulsan el CTA', value: total(row => row.ctaClicks), rate: rate(total(row => row.ctaClicks)) },
      { key: 'form_start', label: 'Empiezan el formulario', value: total(row => row.formStarts), rate: rate(total(row => row.formStarts)) },
      { key: 'form_submit', label: 'Lo envían', value: total(row => row.formSubmits), rate: rate(total(row => row.formSubmits)) },
    ],
    // El scroll al final NO es un paso del recorrido: se puede pulsar el CTA
    // del hero sin llegar abajo. Ponerlo en la lista dibujaba un embudo donde
    // un paso posterior tenía más gente que el anterior.
    depth: {
      key: 'scroll_90',
      label: 'Llegan al final de la página',
      value: total(row => row.scroll90),
      rate: rate(total(row => row.scroll90)),
    },
    fields: aggregateFieldStats(rollups),
  }

  const byChannel = new Map<string, { sessions: number; submits: number }>()
  for (const row of rollups) {
    const current = byChannel.get(row.source) ?? { sessions: 0, submits: 0 }
    current.sessions += row.sessions
    current.submits += row.formSubmits
    byChannel.set(row.source, current)
  }

  return {
    campaignId: campaign.id,
    landingKey: campaign.landingKey,
    name: campaign.name,
    slug: campaign.landingSlug,
    status: campaign.status,
    snapshot,
    // Avisa a la interfaz de que hay tráfico en experimento excluido de estos
    // números, para que no parezca que la landing perdió visitas.
    hasExperimentTraffic: experimentRows > 0,
    dropMap,
    traffic: Array.from(byChannel.entries())
      .map(([channel, stats]) => ({
        channel,
        sessions: stats.sessions,
        submits: stats.submits,
        conversion: stats.sessions ? Number((stats.submits / stats.sessions).toFixed(4)) : null,
      }))
      .sort((a, b) => b.sessions - a.sessions),
    versions,
    health,
  }
}

/** Suma la exposición por campo de varios días (§7.2). */
function aggregateFieldStats(rollups: { fieldStats: Prisma.JsonValue | null }[]) {
  const fields = new Map<string, { exposed: number; interacted: number; completed: number; validationErrors: number; totalMs: number; samples: number }>()

  for (const row of rollups) {
    const stats = row.fieldStats
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) continue
    for (const [field, raw] of Object.entries(stats as Record<string, any>)) {
      const current = fields.get(field) ?? { exposed: 0, interacted: 0, completed: 0, validationErrors: 0, totalMs: 0, samples: 0 }
      current.exposed += raw.exposed ?? 0
      current.interacted += raw.interacted ?? 0
      current.completed += raw.completed ?? 0
      current.validationErrors += raw.validationErrors ?? 0
      if (typeof raw.averageMs === 'number') {
        current.totalMs += raw.averageMs * (raw.exposed ?? 0)
        current.samples += raw.exposed ?? 0
      }
      fields.set(field, current)
    }
  }

  return Array.from(fields.entries()).map(([field, stat]) => ({
    field,
    exposed: stat.exposed,
    interacted: stat.interacted,
    completed: stat.completed,
    validationErrors: stat.validationErrors,
    averageMs: stat.samples ? Math.round(stat.totalMs / stat.samples) : null,
    // La tasa que importa: sobre expuestos, no sobre el total (§7.2).
    abandonment: stat.exposed ? Number(((stat.exposed - stat.completed) / stat.exposed).toFixed(4)) : null,
  })).sort((a, b) => (b.abandonment ?? 0) - (a.abandonment ?? 0))
}

export async function organizationsWithLandings() {
  const rows = await prisma.campaign.findMany({
    where: { landingKey: { not: null } },
    select: { orgId: true },
    distinct: ['orgId'],
  })
  return rows.map(row => row.orgId)
}
