/**
 * Siembra el circuito completo de Ads en la base de datos LOCAL de desarrollo:
 *
 *   anuncio Meta → lead → llamada IA → cualificación → oportunidad → venta
 *
 * Sin esto no hay forma de construir el embudo económico de `docs/vendrava/ads.md`:
 * la base local está vacía y una cuenta de Meta real tardaría semanas en
 * producir cohortes maduras.
 *
 * Esto NO es el "modo demo" que el documento prohíbe. El modo demo inventa
 * datos en pantalla; aquí se escriben filas auténticas en Postgres y el código
 * de producción las lee como leería las de un cliente. Por eso hay dos
 * cerrojos: NODE_ENV=development y una base de datos en localhost.
 *
 * Reproduce el caso concreto de `ads.md` §3 — el que la página debe saber
 * contar:
 *
 *   Campaña A: leads a 12 €, cualificados a 75 €, 0 ventas.
 *   Campaña B: leads a 19 €, cualificados a 38 €, 3 ventas, CAC 126 €.
 *
 * Meta declararía ganadora la A. Vendrava debe recomendar la B.
 *
 *   npm run db:seed:ads              siembra (borra antes lo ya sembrado)
 *   npm run db:seed:ads -- --clean   solo borra
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { CALL_OUTCOME } from '../src/lib/callOutcome'
import { META_OAUTH_SCOPES } from '../src/services/metaAdAccount.service'

const prisma = new PrismaClient()

/** Todo lo sembrado lleva este prefijo en el id para poder retirarlo entero. */
const PREFIX = 'vendrava-dev'

/**
 * Prefijos anteriores. La limpieza filtra por prefijo, así que al renombrarlo
 * las filas ya sembradas con el nombre viejo se habrían quedado huérfanas —y
 * un nuevo sembrado las habría duplicado en vez de reemplazarlas.
 */
const LEGACY_PREFIXES = ['xarly-dev']

// 28 días para que las cohortes de venta puedan madurar de verdad: con 14 no
// existiría ningún lead de 14 días dentro de la ventana y el CAC nunca sería
// comparable (ver ECONOMICS_PERIOD_DAYS en adAttribution.service.ts).
const DAYS = 28
const MS_PER_DAY = 86_400_000

type CampaignPlan = {
  key: string
  name: string
  objective: string
  /** Gasto total del período, en céntimos. */
  spendCents: number
  leads: number
  /** Leads que acaban con un resultado de llamada que cualifica. */
  qualified: number
  /** De los cualificados, cuántos llegan a agendar reunión. */
  meetings: number
  /** Oportunidades creadas, incluidas las que se pierden. */
  opportunities: number
  /** Oportunidades en `closed_won`. */
  sales: number
  /** Valor de cada venta, en euros. */
  saleValues: number[]
  impressionsPerClick: number
  clicksPerLead: number
  /** Frecuencia media al principio y al final del período. */
  frequency: [number, number]
  /**
   * Desgaste creativo: la segunda mitad del período necesita muchas más
   * impresiones por clic, así que el CTR cae mientras la frecuencia sube.
   */
  fatigue: boolean
  /** Proporción de clics que llegan a registrar visita en la landing. */
  landingArrivalRate: number
  /** Conversión visita → lead de la landing. */
  landingConversionRate: number
  /** Margen por venta en euros; de aquí salen CAC, CPQL y CPL objetivo. */
  marginPerSale: number
}

const PLAN: CampaignPlan[] = [
  {
    key: 'a',
    name: 'A · Descuento 30% — tráfico barato',
    objective: 'Captar leads al menor coste posible',
    // 600 € / 50 leads = 12,00 €/lead · 600 € / 8 cualificados = 75,00 €
    spendCents: 60_000,
    leads: 50,
    qualified: 8,
    meetings: 3,
    opportunities: 1,
    sales: 0,
    saleValues: [],
    impressionsPerClick: 42,
    clicksPerLead: 9,
    frequency: [1.4, 1.7],
    fatigue: false,
    landingArrivalRate: 0.9,
    landingConversionRate: 0.13,
    marginPerSale: 900,
  },
  {
    key: 'b',
    name: 'B · Diagnóstico gratuito — intención alta',
    objective: 'Captar leads con intención de compra',
    // 378 € / 20 leads = 18,90 €/lead · 378 € / 10 = 37,80 €/cualificado
    // 378 € / 3 ventas = 126,00 € de CAC
    spendCents: 37_800,
    leads: 20,
    qualified: 10,
    meetings: 7,
    opportunities: 6,
    sales: 3,
    saleValues: [1_400, 900, 1_100],
    impressionsPerClick: 28,
    clicksPerLead: 4,
    frequency: [1.3, 1.6],
    fatigue: false,
    landingArrivalRate: 0.92,
    landingConversionRate: 0.27,
    marginPerSale: 1200,
  },
  {
    // Anuncio que se desgasta: la frecuencia sube y el CTR se hunde. Todo lo
    // demás funciona, así que aísla el diagnóstico de fatiga creativa.
    key: 'c',
    name: 'C · Vídeo testimonial — creatividad cansada',
    objective: 'Mantener volumen con prueba social',
    spendCents: 24_000,
    leads: 16,
    qualified: 7,
    meetings: 4,
    opportunities: 3,
    sales: 1,
    saleValues: [1_050],
    impressionsPerClick: 30,
    clicksPerLead: 5,
    frequency: [1.6, 4.4],
    fatigue: true,
    landingArrivalRate: 0.9,
    landingConversionRate: 0.25,
    marginPerSale: 1100,
  },
  {
    // Buen anuncio, mala página: el tráfico llega y se cae después del clic.
    key: 'd',
    name: 'D · Guía descargable — landing que no convierte',
    objective: 'Captar leads con un recurso gratuito',
    spendCents: 21_000,
    leads: 12,
    qualified: 6,
    meetings: 3,
    opportunities: 2,
    sales: 0,
    saleValues: [],
    impressionsPerClick: 24,
    clicksPerLead: 14,
    frequency: [1.2, 1.5],
    fatigue: false,
    landingArrivalRate: 0.94,
    // Un tercio de lo que convierten las demás: el problema no es el anuncio.
    landingConversionRate: 0.07,
    marginPerSale: 800,
  },
]

/**
 * Reparto determinista de un total entre N días. Nada de Math.random: dos
 * ejecuciones del seed deben producir exactamente los mismos números, o
 * comparar el antes y el después de un cambio deja de tener sentido.
 */
function distribute(total: number, buckets: number): number[] {
  if (buckets <= 0) return []
  // Pesos suaves y repetibles: los fines de semana rinden algo menos.
  const weights = Array.from({ length: buckets }, (_, index) => 0.7 + ((index * 7) % 10) / 10)
  const weightSum = weights.reduce((sum, value) => sum + value, 0)
  const raw = weights.map(weight => (total * weight) / weightSum)
  const floored = raw.map(Math.floor)
  let remainder = total - floored.reduce((sum, value) => sum + value, 0)
  // El resto se reparte por orden de mayor parte decimal para no perder unidades.
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction)
  for (const { index } of order) {
    if (remainder <= 0) break
    floored[index] += 1
    remainder -= 1
  }
  return floored
}

const CREATIVE_COPY: Record<string, { offer: string; adCopy: string }> = {
  a: { offer: 'Descuento del 30%', adCopy: 'Solo esta semana: 30% de descuento en tu primera contratación.' },
  b: { offer: 'Diagnóstico gratuito', adCopy: 'Te decimos en 15 minutos si podemos ayudarte. Sin compromiso.' },
  c: { offer: 'Casos reales', adCopy: 'Mira cómo lo resolvieron otros negocios como el tuyo.' },
  d: { offer: 'Guía gratuita', adCopy: 'Descarga la guía con los 7 errores que más caros salen.' },
}

/** Identificador de Meta estable y distinto por campaña. */
function metaId(key: string, prefix: string): string {
  return `${prefix}${String(key.charCodeAt(0) - 96).padStart(2, '0')}`
}

function daysAgo(days: number, hour = 10): Date {
  const date = new Date(Date.now() - days * MS_PER_DAY)
  date.setHours(hour, 0, 0, 0)
  return date
}

function assertLocalDevelopment() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'seed-ads-dev solo se ejecuta con NODE_ENV=development. Estos datos jamás deben llegar a staging ni a producción.'
    )
  }
  const url = process.env.DATABASE_URL ?? ''
  const host = url ? new URL(url).hostname : ''
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`seed-ads-dev exige una base de datos local; DATABASE_URL apunta a "${host || 'destino desconocido'}".`)
  }
}

async function resolveOrgId(): Promise<string> {
  const explicit = process.env.SEED_ORG_ID?.trim()
  if (explicit) {
    const org = await prisma.organization.findUnique({ where: { id: explicit } })
    if (!org) throw new Error(`SEED_ORG_ID="${explicit}" no existe en esta base de datos.`)
    return org.id
  }
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' }, take: 2 })
  if (!orgs.length) throw new Error('No hay ninguna organización. Crea una cuenta antes de sembrar.')
  if (orgs.length > 1) {
    throw new Error('Hay más de una organización; indica cuál con SEED_ORG_ID para no mezclar datos entre inquilinos.')
  }
  console.log(`Organización destino: ${orgs[0].name} (${orgs[0].id})`)
  return orgs[0].id
}

/**
 * Retira lo sembrado antes en orden inverso de dependencias. Se filtra siempre
 * por `orgId` además de por prefijo: un borrado de seed nunca debe poder tocar
 * datos de otra organización.
 */
async function clean(orgId: string) {
  const idFilter = { OR: [PREFIX, ...LEGACY_PREFIXES].map(prefix => ({ id: { startsWith: `${prefix}-` } })) }
  const deletions: Array<[string, Prisma.BatchPayload]> = [
    ['Opportunity', await prisma.opportunity.deleteMany({ where: { orgId, ...idFilter } })],
    ['ContactConsent', await prisma.contactConsent.deleteMany({ where: { orgId, ...idFilter } })],
    ['Meeting', await prisma.meeting.deleteMany({ where: { orgId, ...idFilter } })],
    ['AcquisitionEvent', await prisma.acquisitionEvent.deleteMany({ where: { orgId, ...idFilter } })],
    ['Call', await prisma.call.deleteMany({ where: { orgId, ...idFilter } })],
    ['AdInsightSnapshot', await prisma.adInsightSnapshot.deleteMany({ where: { orgId, ...idFilter } })],
    ['Lead', await prisma.lead.deleteMany({ where: { orgId, ...idFilter } })],
    ['Campaign', await prisma.campaign.deleteMany({ where: { orgId, ...idFilter } })],
    ['MetaAdAccount', await prisma.metaAdAccount.deleteMany({ where: { orgId, ...idFilter } })],
  ]
  const removed = deletions.filter(([, result]) => result.count > 0)
  if (removed.length) {
    console.log(`Retirado: ${removed.map(([model, result]) => `${model} ${result.count}`).join(' · ')}`)
  }
}

async function seedMetaAccount(orgId: string) {
  await prisma.metaAdAccount.create({
    data: {
      id: `${PREFIX}-meta-account`,
      orgId,
      metaAdAccountId: 'act_000000000000000',
      metaPageId: '000000000000000',
      metaPixelId: '000000000000000',
      metaBusinessId: '000000000000000',
      // La lista real que pide el OAuth; si aquí faltara alguno, la banda de
      // integridad avisaría de permisos incompletos con razón.
      scopes: [...META_OAUTH_SCOPES],
      status: 'connected',
      lastValidatedAt: daysAgo(0, 8),
      dailyBudgetCapCents: 8_000,
      connectedAt: daysAgo(DAYS + 7),
    },
  })
}

async function seedCampaign(orgId: string, plan: CampaignPlan) {
  const campaignId = `${PREFIX}-campaign-${plan.key}`

  await prisma.campaign.create({
    data: {
      id: campaignId,
      orgId,
      name: plan.name,
      objective: plan.objective,
      status: 'active',
      adStatus: 'active',
      metaCampaignId: metaId(plan.key, '1200000000000'),
      metaAdSetId: metaId(plan.key, '1200000000001'),
      metaAdId: metaId(plan.key, '1200000000002'),
      budgetCents: plan.spendCents,
      marginPerSaleCents: plan.marginPerSale * 100,
      acquisitionSharePct: 30,
      totalLeads: plan.leads,
      contacted: plan.leads,
      meetingsScheduled: plan.meetings,
      startDate: daysAgo(DAYS),
      createdAt: daysAgo(DAYS + 1),
      adAssets: {
        offer: CREATIVE_COPY[plan.key].offer,
        adCopy: CREATIVE_COPY[plan.key].adCopy,
      },
    },
  })

  // Snapshots diarios. Cada fila es el gasto de ese día, no el acumulado:
  // sumar el período es responsabilidad de quien lee, no del snapshot.
  const spendByDay = distribute(plan.spendCents, DAYS)
  const leadsByDay = distribute(plan.leads, DAYS)
  const clicksByDay = leadsByDay.map(leads => leads * plan.clicksPerLead)

  await prisma.adInsightSnapshot.createMany({
    data: spendByDay.map((spendCents, index) => {
      const dayOffset = DAYS - 1 - index
      const leadsCount = leadsByDay[index]
      const clicks = clicksByDay[index]
      // Progreso lineal por el período, para interpolar frecuencia y desgaste.
      const progress = DAYS > 1 ? index / (DAYS - 1) : 0
      const frequency = plan.frequency[0] + (plan.frequency[1] - plan.frequency[0]) * progress
      // Con fatiga hacen falta cada vez más impresiones para el mismo clic:
      // eso es exactamente una caída de CTR con frecuencia al alza.
      const impressionsPerClick = plan.fatigue
        ? plan.impressionsPerClick * (1 + 2.8 * progress * progress)
        : plan.impressionsPerClick
      return {
        id: `${PREFIX}-snapshot-${plan.key}-${index}`,
        orgId,
        campaignId,
        metaAdSetId: metaId(plan.key, '1200000000001'),
        capturedAt: daysAgo(dayOffset, 23),
        spendCents,
        impressions: Math.round(clicks * impressionsPerClick),
        clicks,
        leadsCount,
        costPerLeadCents: leadsCount > 0 ? Math.round(spendCents / leadsCount) : null,
        frequency: Math.round(frequency * 100) / 100,
      }
    }),
  })

  // Telemetría de la landing: sin estos eventos no se puede distinguir un mal
  // anuncio de una buena campaña con una página que no convierte.
  const totalClicks = clicksByDay.reduce((sum, clicks) => sum + clicks, 0)
  const totalViews = Math.round(totalClicks * plan.landingArrivalRate)
  const totalLandingLeads = Math.round(totalViews * plan.landingConversionRate)
  const viewsByDay = distribute(totalViews, DAYS)
  const landingLeadsByDay = distribute(totalLandingLeads, DAYS)

  const landingEvents: Prisma.AcquisitionEventCreateManyInput[] = []
  viewsByDay.forEach((views, dayIndex) => {
    const at = daysAgo(DAYS - 1 - dayIndex, 12)
    for (let n = 0; n < views; n += 1) {
      landingEvents.push({
        id: `${PREFIX}-view-${plan.key}-${dayIndex}-${n}`,
        orgId,
        campaignId,
        type: 'landing_view',
        source: 'meta',
        medium: 'paid_social',
        sessionId: `${PREFIX}-vs-${plan.key}-${dayIndex}-${n}`,
        createdAt: at,
      })
    }
    for (let n = 0; n < landingLeadsByDay[dayIndex]; n += 1) {
      landingEvents.push({
        id: `${PREFIX}-lview-${plan.key}-${dayIndex}-${n}`,
        orgId,
        campaignId,
        type: 'landing_lead',
        source: 'meta',
        medium: 'paid_social',
        createdAt: at,
      })
    }
  })
  await prisma.acquisitionEvent.createMany({ data: landingEvents })

  return { campaignId, leadsByDay }
}

/**
 * Reparte los desenlaces entre los leads de una campaña. El orden importa:
 * primero las reuniones, luego el resto de cualificados, después los rechazos
 * y al final las llamadas que no alcanzaron a una persona — así una campaña
 * con mala contactabilidad se distingue de una con mala audiencia.
 */
function outcomeForLead(index: number, plan: CampaignPlan): string {
  if (index < plan.meetings) return CALL_OUTCOME.MEETING_SCHEDULED
  if (index < plan.qualified) {
    // La mitad de los cualificados restantes pidió hablar con una persona.
    return (index - plan.meetings) % 2 === 0
      ? CALL_OUTCOME.TRANSFERRED_TO_HUMAN
      : CALL_OUTCOME.INTERESTED
  }
  const beyond = index - plan.qualified
  const rejected = Math.round((plan.leads - plan.qualified) * 0.6)
  if (beyond < rejected) return CALL_OUTCOME.NOT_INTERESTED
  return (beyond - rejected) % 2 === 0 ? CALL_OUTCOME.VOICEMAIL : CALL_OUTCOME.IVR
}

async function seedLeadsAndCalls(orgId: string, plan: CampaignPlan, campaignId: string, leadsByDay: number[]) {
  // Día de creación de cada lead, derivado del reparto diario de leads.
  const leadDayOffsets: number[] = []
  leadsByDay.forEach((count, index) => {
    for (let n = 0; n < count; n += 1) leadDayOffsets.push(DAYS - 1 - index)
  })

  const wonIndexes = new Set(Array.from({ length: plan.sales }, (_, index) => index))
  let opportunitiesCreated = 0

  for (let index = 0; index < plan.leads; index += 1) {
    const leadId = `${PREFIX}-lead-${plan.key}-${index}`
    const dayOffset = leadDayOffsets[index] ?? 0
    const createdAt = daysAgo(dayOffset, 9)
    const outcome = outcomeForLead(index, plan)
    const qualifies =
      outcome === CALL_OUTCOME.MEETING_SCHEDULED ||
      outcome === CALL_OUTCOME.TRANSFERRED_TO_HUMAN ||
      outcome === CALL_OUTCOME.INTERESTED
    const reachedHuman = qualifies || outcome === CALL_OUTCOME.NOT_INTERESTED

    await prisma.lead.create({
      data: {
        id: leadId,
        orgId,
        campaignId,
        name: `Contacto ${plan.key.toUpperCase()}-${String(index + 1).padStart(2, '0')}`,
        phone: `+3460000${plan.key.charCodeAt(0) - 96}${String(index).padStart(3, '0')}`,
        email: `contacto.${plan.key}${index + 1}@ejemplo-desarrollo.test`,
        company: `Empresa ${plan.key.toUpperCase()}${index + 1}`,
        status: qualifies ? 'qualified' : reachedHuman ? 'contacted' : 'new',
        source: 'meta_ads',
        metaAdId: metaId(plan.key, '1200000000002'),
        metaAdSetId: metaId(plan.key, '1200000000001'),
        createdAt,
        updatedAt: createdAt,
      },
    })

    // Un formulario de Meta recoge el consentimiento al enviarse; sin esta
    // fila no se le podrían devolver a Meta ni la cualificación ni la venta.
    await prisma.contactConsent.create({
      data: {
        id: `${PREFIX}-consent-${plan.key}-${index}`,
        orgId,
        leadId,
        channel: 'phone',
        purpose: 'contact',
        status: 'granted',
        source: 'meta_lead_form',
        evidence: 'Formulario de Meta Lead Ads',
        occurredAt: createdAt,
      },
    })

    await prisma.acquisitionEvent.create({
      data: {
        id: `${PREFIX}-acq-${plan.key}-${index}`,
        orgId,
        campaignId,
        leadId,
        type: 'lead',
        source: 'meta',
        medium: 'paid_social',
        content: plan.key === 'a' ? 'creative-descuento' : 'creative-diagnostico',
        sessionId: `${PREFIX}-session-${plan.key}-${index}`,
        createdAt,
      },
    })

    // La llamada ocurre el día siguiente a la captación del lead.
    const callAt = new Date(createdAt.getTime() + MS_PER_DAY)
    const callId = `${PREFIX}-call-${plan.key}-${index}`
    await prisma.call.create({
      data: {
        id: callId,
        orgId,
        leadId,
        campaignId,
        externalCallId: `${PREFIX}-cs-${plan.key}-${index}`,
        direction: 'outbound',
        status: reachedHuman ? 'completed' : 'no_answer',
        outcome,
        durationSeconds: reachedHuman ? 120 + (index % 7) * 35 : 8,
        contactClassification: reachedHuman ? 'HUMAN' : outcome === CALL_OUTCOME.VOICEMAIL ? 'VOICEMAIL' : 'IVR',
        contactClassificationConfidence: 0.9,
        summary: reachedHuman
          ? `Conversación registrada con resultado ${outcome}.`
          : 'La llamada no alcanzó a una persona.',
        startedAt: callAt,
        endedAt: new Date(callAt.getTime() + 3 * 60_000),
        createdAt: callAt,
      },
    })

    if (outcome === CALL_OUTCOME.MEETING_SCHEDULED) {
      await prisma.meeting.create({
        data: {
          id: `${PREFIX}-meeting-${plan.key}-${index}`,
          orgId,
          leadId,
          callId,
          title: `Reunión con Contacto ${plan.key.toUpperCase()}-${index + 1}`,
          scheduledAt: new Date(callAt.getTime() + 2 * MS_PER_DAY),
          status: 'completed',
          createdAt: callAt,
        },
      })
    }

    // Las oportunidades salen de los leads cualificados, por orden.
    if (qualifies && opportunitiesCreated < plan.opportunities) {
      const opportunityIndex = opportunitiesCreated
      opportunitiesCreated += 1
      const won = wonIndexes.has(opportunityIndex)
      // Latencia de cierre realista: las ventas tardan días en madurar, y ese
      // retraso es justo lo que el circuito lento debe respetar.
      const closedAt = new Date(callAt.getTime() + 6 * MS_PER_DAY)
      const isClosed = won || opportunityIndex >= plan.opportunities - 1

      await prisma.opportunity.create({
        data: {
          id: `${PREFIX}-opportunity-${plan.key}-${opportunityIndex}`,
          orgId,
          leadId,
          name: `Oportunidad ${plan.key.toUpperCase()}-${opportunityIndex + 1}`,
          stage: won ? 'closed_won' : isClosed ? 'closed_lost' : 'proposal',
          value: won
            ? new Prisma.Decimal(plan.saleValues[opportunityIndex] ?? 1_000)
            : new Prisma.Decimal(1_000),
          currency: 'EUR',
          probability: won ? 100 : isClosed ? 0 : 60,
          stageEnteredAt: won || isClosed ? closedAt : callAt,
          actualCloseDate: won || isClosed ? closedAt : null,
          lossReason: !won && isClosed ? 'Precio' : null,
          createdAt: callAt,
        },
      })
    }
  }
}

function report(plan: CampaignPlan) {
  const euros = plan.spendCents / 100
  const cpl = euros / plan.leads
  const cpql = plan.qualified ? euros / plan.qualified : null
  const cac = plan.sales ? euros / plan.sales : null
  const revenue = plan.saleValues.reduce((sum, value) => sum + value, 0)
  const roas = revenue ? revenue / euros : null
  console.log(
    `  ${plan.name}\n` +
    `    gasto ${euros.toFixed(2)} € · ${plan.leads} leads · CPL ${cpl.toFixed(2)} €\n` +
    `    ${plan.qualified} cualificados · CPQL ${cpql ? `${cpql.toFixed(2)} €` : 'sin medición'}\n` +
    `    ${plan.opportunities} oportunidades · ${plan.sales} ventas · ` +
    `CAC ${cac ? `${cac.toFixed(2)} €` : 'sin medición'} · ROAS ${roas ? roas.toFixed(2) : 'sin medición'}`
  )
}

async function main() {
  assertLocalDevelopment()
  const orgId = await resolveOrgId()

  await clean(orgId)
  if (process.argv.includes('--clean')) {
    console.log('Solo limpieza: no se ha sembrado nada.')
    return
  }

  await seedMetaAccount(orgId)
  for (const plan of PLAN) {
    const { campaignId, leadsByDay } = await seedCampaign(orgId, plan)
    await seedLeadsAndCalls(orgId, plan, campaignId, leadsByDay)
  }

  console.log(`\nCircuito sembrado sobre ${DAYS} días:\n`)
  PLAN.forEach(report)
  console.log(
    '\nMeta declararía ganadora la campaña A por su CPL.\n' +
    'La página de Ads está terminada (Fase 1) cuando recomienda la B y explica por qué.\n'
  )
}

main()
  .catch(error => {
    console.error(`\n${error instanceof Error ? error.message : error}\n`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
