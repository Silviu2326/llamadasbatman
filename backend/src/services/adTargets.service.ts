import { prisma } from '../lib/prisma'
import { getCampaignAttribution } from './adAttribution.service'

/**
 * Objetivos de coste calculados hacia atrás desde el margen (`ads.md` §9):
 *
 *   CAC máximo  = margen por venta × porcentaje admisible para adquisición
 *   CPQL máximo = CAC máximo × tasa cualificado→venta
 *   CPL máximo  = CPQL máximo × tasa lead→cualificado
 *
 * La diferencia con lo que hacía antes la página es de fondo: el límite de
 * CPL dejaba de salir del CPL actual (una tautología: "tu límite es lo que ya
 * gastas") y pasa a salir de lo que el negocio se puede permitir pagar por un
 * comprador.
 *
 * Cuando no hay tasas propias suficientes se dice que el objetivo es
 * provisional y con qué supuestos se calculó. Nunca se presenta como si
 * viniera del histórico real.
 */

/** Tasas de arranque, solo hasta que la organización tenga las suyas. */
const ASSUMED_QUALIFIED_TO_SALE = 0.25
const ASSUMED_LEAD_TO_QUALIFIED = 0.35
/** Porcentaje del margen que se admite gastar en adquirir un cliente. */
const DEFAULT_ACQUISITION_SHARE_PCT = 30

/** Volumen mínimo para que una tasa propia sea preferible a la supuesta. */
const MIN_SALES_FOR_RATE = 3
const MIN_QUALIFIED_FOR_RATE = 10

export type AdTargets = {
  campaignId: string
  /** `null` cuando no se ha declarado margen: sin margen no hay objetivo. */
  maxCacCents: number | null
  maxCpqlCents: number | null
  maxCplCents: number | null
  marginPerSaleCents: number | null
  acquisitionSharePct: number
  qualifiedToSaleRate: number
  leadToQualifiedRate: number
  /** `own` si las tasas salen del histórico propio, `assumed` si son supuestas. */
  ratesSource: 'own' | 'partial' | 'assumed'
  provisional: boolean
  explanation: string
  /** Coste actual frente al objetivo, cuando ambos existen. */
  actual: { cplCents: number | null; cpqlCents: number | null; cacCents: number | null }
  verdict: 'within' | 'over' | 'unknown'
}

export async function getCampaignTargets(orgId: string, campaignId: string): Promise<AdTargets | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: { id: true, marginPerSaleCents: true, acquisitionSharePct: true },
  })
  if (!campaign) return null

  const attribution = await getCampaignAttribution(orgId, campaignId)

  // Tasas propias solo con volumen suficiente; si no, se usan las supuestas y
  // se declara. Una tasa calculada sobre dos ventas no es una tasa.
  const hasOwnSaleRate = (attribution.sales ?? 0) >= MIN_SALES_FOR_RATE && (attribution.qualified ?? 0) > 0
  const hasOwnQualifyRate = (attribution.qualified ?? 0) >= MIN_QUALIFIED_FOR_RATE && (attribution.leads ?? 0) > 0

  const qualifiedToSaleRate = hasOwnSaleRate
    ? (attribution.sales ?? 0) / (attribution.qualified ?? 1)
    : ASSUMED_QUALIFIED_TO_SALE
  const leadToQualifiedRate = hasOwnQualifyRate
    ? (attribution.qualified ?? 0) / (attribution.leads ?? 1)
    : ASSUMED_LEAD_TO_QUALIFIED

  const ratesSource: AdTargets['ratesSource'] = hasOwnSaleRate && hasOwnQualifyRate
    ? 'own'
    : hasOwnSaleRate || hasOwnQualifyRate
      ? 'partial'
      : 'assumed'

  const acquisitionSharePct = campaign.acquisitionSharePct ?? DEFAULT_ACQUISITION_SHARE_PCT
  const margin = campaign.marginPerSaleCents

  const maxCacCents = margin != null ? Math.round(margin * (acquisitionSharePct / 100)) : null
  const maxCpqlCents = maxCacCents != null ? Math.round(maxCacCents * qualifiedToSaleRate) : null
  const maxCplCents = maxCpqlCents != null ? Math.round(maxCpqlCents * leadToQualifiedRate) : null

  const actual = {
    cplCents: attribution.cplCents,
    cpqlCents: attribution.cpqlCents,
    cacCents: attribution.cacCents,
  }

  // Se compara al nivel más profundo donde existan objetivo y dato real.
  let verdict: AdTargets['verdict'] = 'unknown'
  if (maxCacCents != null && actual.cacCents != null) {
    verdict = actual.cacCents <= maxCacCents ? 'within' : 'over'
  } else if (maxCpqlCents != null && actual.cpqlCents != null) {
    verdict = actual.cpqlCents <= maxCpqlCents ? 'within' : 'over'
  } else if (maxCplCents != null && actual.cplCents != null) {
    verdict = actual.cplCents <= maxCplCents ? 'within' : 'over'
  }

  const explanation = margin == null
    ? 'No se ha declarado el margen por venta, así que no hay objetivo de coste que comparar. Sin margen, el CPL solo se puede leer frente a otras campañas, no frente a lo que el negocio se puede permitir.'
    : ratesSource === 'own'
      ? `Con un margen de ${(margin / 100).toFixed(2)} € y un ${acquisitionSharePct} % admisible, el CAC máximo es ${((maxCacCents ?? 0) / 100).toFixed(2)} €. ` +
        `Las tasas usadas son las tuyas: ${Math.round(leadToQualifiedRate * 100)} % de lead a cualificado y ${Math.round(qualifiedToSaleRate * 100)} % de cualificado a venta.`
      : `Con un margen de ${(margin / 100).toFixed(2)} € y un ${acquisitionSharePct} % admisible, el CAC máximo es ${((maxCacCents ?? 0) / 100).toFixed(2)} €. ` +
        `Objetivo provisional: ${ratesSource === 'partial' ? 'falta volumen en una de las dos tasas' : 'todavía no hay volumen propio'}, ` +
        `así que se han supuesto ${Math.round(leadToQualifiedRate * 100)} % de lead a cualificado y ${Math.round(qualifiedToSaleRate * 100)} % de cualificado a venta. Conviene confirmarlas.`

  return {
    campaignId,
    maxCacCents,
    maxCpqlCents,
    maxCplCents,
    marginPerSaleCents: margin,
    acquisitionSharePct,
    qualifiedToSaleRate: Math.round(qualifiedToSaleRate * 1000) / 1000,
    leadToQualifiedRate: Math.round(leadToQualifiedRate * 1000) / 1000,
    ratesSource,
    provisional: ratesSource !== 'own',
    explanation,
    actual,
    verdict,
  }
}

/** Objetivos de todas las campañas de Ads, para pintarlos en la tabla. */
export async function getOrgTargets(orgId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: {
      orgId,
      OR: [{ adStatus: { not: null } }, { adPlaybookId: { not: null } }, { metaCampaignId: { not: null } }],
    },
    select: { id: true },
  })
  const targets = await Promise.all(campaigns.map(campaign => getCampaignTargets(orgId, campaign.id)))
  return targets.filter((target): target is AdTargets => target != null)
}
