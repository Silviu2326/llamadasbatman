import { prisma } from '../lib/prisma'
import { computeBaseline, describeBaseline } from './landingBaseline.service'

/**
 * Informe por landing en euros — docs/vendrava/landings.md §11, fase 4.
 *
 * "X cualificados, CAC Y, mejor variante Z". El informe existe para responder a
 * la pregunta del dueño del negocio, que no es cuál es la tasa de rebote sino
 * cuánto le cuesta un cliente por esta puerta.
 *
 * Todo lo que no se ha medido vale `null` y se dice con palabras. Un CAC
 * inventado sobre gasto incompleto no es una aproximación: es un número que
 * lleva a decisiones caras.
 */

export interface LandingReport {
  landingKey: string
  campaignId: string
  name: string
  period: { start: Date; end: Date } | null
  visits: number | null
  leads: number | null
  qualified: number | null
  sales: number | null
  revenueCents: number | null
  spendCents: number | null
  /** Coste por lead cualificado. `null` sin gasto o sin cualificados medidos. */
  cpqlCents: number | null
  /** Coste de adquisición de cliente. `null` si no hay ventas medidas. */
  cacCents: number | null
  /** Retorno sobre el gasto atribuido, cuando ambos se conocen. */
  roas: number | null
  bestVariant: { name: string; status: string; justification: string } | null
  confidence: string
  maturity: string
  baselineUsed: string | null
  /** Frases que explican cada hueco, en el idioma del negocio. */
  caveats: string[]
}

export async function buildReport(orgId: string, landingKey: string): Promise<LandingReport | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { orgId, landingKey },
    select: { id: true, name: true, adAssets: true },
  })
  if (!campaign) return null

  const [snapshot, variants, baseline] = await Promise.all([
    prisma.landingPerformanceSnapshot.findFirst({
      where: { orgId, landingKey },
      orderBy: { periodEnd: 'desc' },
    }),
    prisma.landingVariant.findMany({
      where: { orgId, landingKey },
      orderBy: { updatedAt: 'desc' },
    }),
    computeBaseline(landingKey),
  ])

  const caveats: string[] = []

  // Gasto atribuido en el período del snapshot. Sin snapshot no hay período
  // sobre el que sumar gasto y el informe no puede hablar de coste.
  let spendCents: number | null = null
  if (snapshot) {
    const spend = await prisma.adInsightSnapshot.aggregate({
      where: { orgId, campaignId: campaign.id, capturedAt: { gte: snapshot.periodStart, lt: snapshot.periodEnd } },
      _sum: { spendCents: true },
    })
    spendCents = spend._sum.spendCents ?? null
    if (spendCents === null) {
      caveats.push('No hay gasto publicitario registrado en el período: el coste por cliente no se puede calcular. Si esta landing recibe solo tráfico orgánico, es lo esperado.')
    }
  } else {
    caveats.push('Todavía no hay ningún período calculado para esta landing.')
  }

  const qualified = snapshot?.qualified ?? null
  const sales = snapshot?.sales ?? null
  const revenueCents = snapshot?.revenueCents ?? null

  if (qualified === null) {
    caveats.push('Ningún lead de esta landing tiene llamada registrada, así que la cualificación no se ha medido.')
  }
  if (snapshot && sales === 0) {
    caveats.push('Se midió el paso a venta y todavía no hay ninguna cerrada en el período.')
  }
  if (revenueCents === null && sales) {
    caveats.push('Hay ventas cerradas sin importe en el CRM: el ingreso atribuido no se puede sumar.')
  }

  const cpqlCents = spendCents !== null && qualified ? Math.round(spendCents / qualified) : null
  const cacCents = spendCents !== null && sales ? Math.round(spendCents / sales) : null
  const roas = spendCents && revenueCents !== null ? Number((revenueCents / spendCents).toFixed(2)) : null

  // "Mejor variante" solo si un experimento la declaró ganadora. Una variante
  // que va por delante sin significación no es la mejor: es la que va por
  // delante (§9).
  const winner = variants.find(variant => variant.status === 'winner') ?? null
  if (!winner && variants.some(variant => variant.status === 'inconclusive')) {
    caveats.push('El último experimento terminó sin conclusión: no hay una variante mejor demostrada.')
  }
  if (!variants.length) {
    caveats.push('Esta landing no ha tenido variantes: no hay comparación posible.')
  }

  if (baseline.insufficientReason) caveats.push(baseline.insufficientReason)

  return {
    landingKey,
    campaignId: campaign.id,
    name: ((campaign.adAssets ?? {}) as { title?: string }).title || campaign.name,
    period: snapshot ? { start: snapshot.periodStart, end: snapshot.periodEnd } : null,
    visits: snapshot?.visits ?? null,
    leads: snapshot?.leads ?? null,
    qualified,
    sales,
    revenueCents,
    spendCents,
    cpqlCents,
    cacCents,
    roas,
    bestVariant: winner ? { name: winner.name, status: winner.status, justification: winner.justification } : null,
    confidence: snapshot?.confidence ?? 'none',
    maturity: snapshot?.maturity ?? 'insufficient',
    baselineUsed: baseline.insufficientReason ? null : describeBaseline(baseline),
    caveats,
  }
}

/**
 * Frase de portada del informe. Se construye solo con lo medido: si falta el
 * coste, no se menciona el coste.
 */
export function narrateReport(report: LandingReport) {
  const euros = (cents: number) => `${(cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`
  const parts: string[] = []

  parts.push(report.qualified === null
    ? `«${report.name}» no tiene cualificación medida`
    : `«${report.name}» produjo ${report.qualified} cualificados`)

  if (report.cacCents !== null) parts.push(`con un coste por cliente de ${euros(report.cacCents)}`)
  else if (report.cpqlCents !== null) parts.push(`con un coste por cualificado de ${euros(report.cpqlCents)}`)

  if (report.revenueCents) parts.push(`e ingresos atribuidos de ${euros(report.revenueCents)}`)

  const sentence = `${parts.join(', ')}.`
  const variant = report.bestVariant
    ? ` La mejor variante demostrada es «${report.bestVariant.name}».`
    : ' Todavía no hay una variante mejor demostrada.'

  return sentence + variant
}
