import { prisma } from '../lib/prisma'
import { getCampaignAttribution } from './adAttribution.service'

/**
 * Aprender a propósito — Fase 6 y §12 de `docs/vendrava/ads.md`.
 *
 * La advertencia central del documento: **la distribución normal de Meta no es
 * un A/B**. Meta entrega más impresiones a lo que predice que va a funcionar,
 * así que comparar dos anuncios que solo han recibido reparto ordinario mide
 * la predicción de Meta, no la calidad de la creatividad.
 *
 * De ahí los dos modos:
 *
 * - **experiment**: división aleatoria predefinida. Permite atribuir causa.
 * - **bandit**: explotación y exploración, 80–90 % / 10–20 %. No aísla la
 *   causa, pero reparte mejor el dinero mientras aprende.
 *
 * Y de ahí `honestLabel()`: si las variantes no se asignaron aleatoriamente,
 * la interfaz no puede llamar A/B a lo que no lo es.
 */

const MIN_EXPLORE_PERCENT = 10
const MAX_EXPLORE_PERCENT = 20

export type VariantPerformance = {
  variantId: string
  key: string
  label: string
  /** Coste por unidad de la métrica primaria; `null` sin medición. */
  costPerOutcomeCents: number | null
  outcomes: number | null
  spendCents: number | null
  allocationPercent: number
  /** Eventos que le faltan para que su resultado sea concluyente. */
  eventsToConclusive: number
}

/**
 * Etiqueta honesta de lo que es el experimento. La §12 lo pide explícitamente:
 * no llamar "A/B" a una campaña que solo ha recibido distribución ordinaria.
 */
export function honestLabel(mode: string): { label: string; caveat: string } {
  if (mode === 'experiment') {
    return {
      label: 'Experimento aleatorizado',
      caveat: 'Las variantes se asignan al azar, así que la diferencia se puede atribuir a la creatividad.',
    }
  }
  return {
    label: 'Torneo (bandit)',
    caveat:
      'No es un A/B: Meta entrega más impresiones a lo que predice que funcionará. ' +
      'Este modo reparte mejor el dinero mientras aprende, pero no aísla la causa.',
  }
}

export async function createExperiment(
  orgId: string,
  input: {
    name: string
    hypothesis: string
    campaignId?: string | null
    mode?: 'experiment' | 'bandit'
    primaryMetric?: 'lead' | 'qualified_lead' | 'sale'
    explorePercent?: number
    variants: Array<{ key: string; label: string; description?: string; metaAdId?: string }>
  }
) {
  if (input.variants.length < 2) {
    throw new Error('Un experimento necesita al menos dos variantes que comparar.')
  }
  const explorePercent = Math.min(
    MAX_EXPLORE_PERCENT,
    Math.max(MIN_EXPLORE_PERCENT, input.explorePercent ?? 15)
  )
  const even = Math.floor(100 / input.variants.length)

  return prisma.adExperiment.create({
    data: {
      orgId,
      campaignId: input.campaignId ?? null,
      name: input.name,
      hypothesis: input.hypothesis,
      mode: input.mode ?? 'bandit',
      primaryMetric: input.primaryMetric ?? 'qualified_lead',
      explorePercent,
      status: 'draft',
      variants: {
        create: input.variants.map((variant, index) => ({
          orgId,
          key: variant.key,
          label: variant.label,
          description: variant.description ?? null,
          metaAdId: variant.metaAdId ?? null,
          // Reparto inicial uniforme; el resto va a la primera para que sume 100.
          allocationPercent: index === 0 ? 100 - even * (input.variants.length - 1) : even,
        })),
      },
    },
    include: { variants: true },
  })
}

export async function startExperiment(orgId: string, experimentId: string) {
  return prisma.adExperiment.update({
    where: { id: experimentId },
    data: { status: 'running', startedAt: new Date() },
    include: { variants: true },
  })
}

function costPerOutcome(spendCents: number | null, outcomes: number | null): number | null {
  if (spendCents == null || outcomes == null || outcomes <= 0) return null
  return Math.round(spendCents / outcomes)
}

function outcomesFor(
  variant: { leads: number | null; qualified: number | null; sales: number | null },
  metric: string
): number | null {
  if (metric === 'sale') return variant.sales
  if (metric === 'lead') return variant.leads
  return variant.qualified
}

/**
 * Reparto recomendado.
 *
 * En modo bandit: el grueso del presupuesto va a la variante con mejor coste
 * por resultado (explotar) y una porción fija se reserva para las demás
 * (explorar). La exploración no baja del 10 %: dejar de explorar del todo es
 * como apostar a que lo que funciona hoy funcionará siempre.
 *
 * En modo experimento el reparto no se toca: cambiarlo sobre la marcha rompe
 * la aleatorización y con ella la posibilidad de atribuir causa.
 */
export async function computeAllocation(orgId: string, experimentId: string) {
  const experiment = await prisma.adExperiment.findFirst({
    where: { id: experimentId, orgId },
    include: { variants: true },
  })
  if (!experiment) return null

  const performance: VariantPerformance[] = experiment.variants.map(variant => {
    const outcomes = outcomesFor(variant, experiment.primaryMetric)
    return {
      variantId: variant.id,
      key: variant.key,
      label: variant.label,
      outcomes,
      spendCents: variant.spendCents,
      costPerOutcomeCents: costPerOutcome(variant.spendCents, outcomes),
      allocationPercent: variant.allocationPercent,
      eventsToConclusive: Math.max(0, experiment.minEventsPerVariant - (outcomes ?? 0)),
    }
  })

  if (experiment.mode === 'experiment') {
    return {
      experiment,
      performance,
      recommendedAllocation: performance.map(item => ({ variantId: item.variantId, percent: item.allocationPercent })),
      rationale: 'En un experimento aleatorizado el reparto se mantiene fijo: cambiarlo rompería la aleatorización.',
      ...honestLabel(experiment.mode),
    }
  }

  const measured = performance.filter(item => item.costPerOutcomeCents != null)
  if (measured.length < 2) {
    return {
      experiment,
      performance,
      recommendedAllocation: performance.map(item => ({ variantId: item.variantId, percent: item.allocationPercent })),
      rationale: 'Todavía no hay resultados medidos en al menos dos variantes: el reparto se mantiene mientras se acumula señal.',
      ...honestLabel(experiment.mode),
    }
  }

  const best = measured.reduce((champion, item) =>
    (item.costPerOutcomeCents ?? Infinity) < (champion.costPerOutcomeCents ?? Infinity) ? item : champion
  )
  const explore = experiment.explorePercent
  const others = performance.filter(item => item.variantId !== best.variantId)
  const perOther = others.length ? Math.floor(explore / others.length) : 0

  const recommendedAllocation = performance.map(item =>
    item.variantId === best.variantId
      ? { variantId: item.variantId, percent: 100 - perOther * others.length }
      : { variantId: item.variantId, percent: perOther }
  )

  return {
    experiment,
    performance,
    recommendedAllocation,
    rationale:
      `“${best.label}” consigue el mejor coste por ${experiment.primaryMetric === 'sale' ? 'venta' : experiment.primaryMetric === 'lead' ? 'lead' : 'cualificado'} ` +
      `(${((best.costPerOutcomeCents ?? 0) / 100).toFixed(2)} €), así que recibe el grueso del presupuesto. ` +
      `Se reserva un ${explore} % para seguir explorando las demás.`,
    ...honestLabel(experiment.mode),
  }
}

/**
 * Concluye el experimento. "Sin conclusión" es un resultado válido y se
 * comunica como tal: declarar ganadora con 17 visitas es peor que no declarar
 * nada.
 */
export async function concludeExperiment(orgId: string, experimentId: string) {
  const allocation = await computeAllocation(orgId, experimentId)
  if (!allocation) return null
  const { experiment, performance } = allocation

  const daysRunning = experiment.startedAt
    ? (Date.now() - experiment.startedAt.getTime()) / 86_400_000
    : 0
  const underpowered = performance.filter(item => item.eventsToConclusive > 0)

  if (daysRunning < experiment.minDurationDays || underpowered.length > 0) {
    const missing = underpowered.length
      ? `faltan eventos en ${underpowered.length} variante${underpowered.length === 1 ? '' : 's'}`
      : `solo lleva ${Math.round(daysRunning)} de los ${experiment.minDurationDays} días mínimos`
    return prisma.adExperiment.update({
      where: { id: experiment.id },
      data: {
        status: 'inconclusive',
        endedAt: new Date(),
        conclusion: `Sin conclusión: ${missing}. No hay evidencia suficiente para declarar una ganadora.`,
      },
      include: { variants: true },
    })
  }

  const measured = performance.filter(item => item.costPerOutcomeCents != null)
  const winner = measured.reduce((champion, item) =>
    (item.costPerOutcomeCents ?? Infinity) < (champion.costPerOutcomeCents ?? Infinity) ? item : champion
  )

  return prisma.adExperiment.update({
    where: { id: experiment.id },
    data: {
      status: 'concluded',
      endedAt: new Date(),
      winnerVariantId: winner.variantId,
      conclusion:
        `Gana “${winner.label}” con ${((winner.costPerOutcomeCents ?? 0) / 100).toFixed(2)} € por resultado. ` +
        honestLabel(experiment.mode).caveat,
    },
    include: { variants: true },
  })
}

export async function listExperiments(orgId: string) {
  const experiments = await prisma.adExperiment.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { variants: true, campaign: { select: { name: true } } },
  })
  return experiments.map(experiment => ({ ...experiment, ...honestLabel(experiment.mode) }))
}

/**
 * Reparto de presupuesto por **rendimiento marginal** (§9).
 *
 * La diferencia con lo que hace todo el mundo: no se premia el menor CPQL
 * histórico, sino el coste esperado del *siguiente* comprador si se sube el
 * presupuesto. Una campaña puede tener el mejor CPQL histórico y estar ya
 * saturada, de modo que cada euro adicional compre mucho peor.
 *
 * La aproximación usa la tendencia reciente frente a la del período completo:
 * si el coste por resultado ha subido mientras subía el gasto, la campaña está
 * saturándose y no merece más dinero aunque su media siga siendo buena.
 */
export async function recommendBudgetAllocation(orgId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: {
      orgId,
      status: 'active',
      OR: [{ adStatus: { not: null } }, { metaCampaignId: { not: null } }],
    },
    select: { id: true, name: true, budgetCents: true },
  })
  if (!campaigns.length) return { campaigns: [], rationale: 'No hay campañas activas que comparar.' }

  const rows = await Promise.all(
    campaigns.map(async campaign => {
      const [full, recent] = await Promise.all([
        getCampaignAttribution(orgId, campaign.id, { periodDays: 30 }),
        getCampaignAttribution(orgId, campaign.id, { periodDays: 7 }),
      ])
      const baseCost = full.cacCents ?? full.cpqlCents
      const recentCost = recent.cacCents ?? recent.cpqlCents

      // Sin coste reciente medible no se puede hablar de rendimiento marginal.
      const marginalTrendPct = baseCost != null && recentCost != null && baseCost > 0
        ? Math.round(((recentCost - baseCost) / baseCost) * 100)
        : null

      const saturating = marginalTrendPct != null && marginalTrendPct > 20
      return {
        campaignId: campaign.id,
        name: campaign.name,
        budgetCents: campaign.budgetCents,
        historicalCostCents: baseCost,
        recentCostCents: recentCost,
        marginalTrendPct,
        cohortStatus: full.cohortStatus,
        recommendation: baseCost == null
          ? 'hold'
          : saturating
            ? 'hold'
            : marginalTrendPct != null && marginalTrendPct < -10
              ? 'increase'
              : 'hold',
        reason: baseCost == null
          ? 'Sin coste por resultado medido: no hay base para mover presupuesto.'
          : saturating
            ? `El coste por resultado ha subido un ${marginalTrendPct} % en la última semana: la campaña se está saturando y el siguiente euro compraría peor.`
            : marginalTrendPct != null && marginalTrendPct < -10
              ? `El coste por resultado ha bajado un ${Math.abs(marginalTrendPct)} % en la última semana: el siguiente euro compraría mejor que la media.`
              : 'El coste por resultado se mantiene estable: no hay motivo para mover el presupuesto.',
      }
    })
  )

  const increase = rows.filter(row => row.recommendation === 'increase')
  return {
    campaigns: rows,
    rationale: increase.length
      ? `Se recomienda subir presupuesto en ${increase.length} campaña${increase.length === 1 ? '' : 's'}, por rendimiento marginal reciente y no por su media histórica.`
      : 'Ninguna campaña muestra rendimiento marginal mejorando: no se recomienda mover presupuesto.',
  }
}
