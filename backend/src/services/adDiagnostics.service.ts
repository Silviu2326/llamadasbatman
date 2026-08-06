import { prisma } from '../lib/prisma'
import { ECONOMICS_PERIOD_DAYS, getCampaignAttribution, type CampaignAttribution } from './adAttribution.service'
import { expireDecisions, recordDecision } from './adDecision.service'

/**
 * Los tres diagnósticos del MVP de `docs/vendrava/ads.md` §3:
 *
 *   1. Gasto sin leads cualificados
 *   2. Fatiga creativa
 *   3. Anuncio correcto, landing deficiente
 *
 * Todos operan en N1: calculan, explican y registran una `AdDecision`. Ninguno
 * ejecuta nada. Cuando falta la instrumentación para evaluar uno, se dice —
 * callarse produce la falsa impresión de que se comprobó y salió bien.
 */

const RULE_VERSION = '1'

/** Gasto mínimo antes de opinar: por debajo, cualquier tasa es anecdótica. */
const MIN_SPEND_CENTS = 5_000
const MIN_LEADS = 10
/** Tasa de cualificación por debajo de la cual se levanta la alerta. */
const LOW_QUALIFICATION_PCT = 25
/** Aumento de frecuencia y caída de CTR que caracterizan el desgaste creativo. */
const FATIGUE_FREQUENCY_MIN = 2.5
const FATIGUE_CTR_DROP_PCT = 25
/** Caída de conversión de landing frente a su línea base. */
const LANDING_DROP_PCT = 35
/** La fatiga creativa se evalúa en la ventana corta del circuito rápido. */
const FATIGUE_WINDOW_DAYS = 14

function euros(cents: number | null): string {
  return cents == null ? 'sin medición' : `${(cents / 100).toFixed(2)} €`
}

function day(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Diagnóstico 1 — gasto sin leads cualificados.
 *
 * La campaña gasta y trae leads, pero la señal profunda no avanza. Antes de
 * culpar al anuncio se separa el problema de contactabilidad: si los leads no
 * llegan a hablar con nadie, el anuncio no es el culpable.
 */
async function spendWithoutQualified(
  orgId: string,
  campaign: { id: string; name: string },
  attribution: CampaignAttribution
): Promise<string | null> {
  const { spendCents, leads, contacted, qualified, cohortStatus } = attribution
  if (spendCents == null || spendCents < MIN_SPEND_CENTS) return null
  if (leads == null || leads < MIN_LEADS) return null
  if (cohortStatus === 'insufficient') return null

  const qualificationPct = contacted && contacted > 0 ? Math.round((qualified! / contacted) * 100) : 0
  const contactPct = Math.round(((contacted ?? 0) / leads) * 100)
  if (qualified != null && qualified > 0 && qualificationPct >= LOW_QUALIFICATION_PCT) return null

  // Si casi nadie descuelga, el problema es de contactabilidad y decirlo de
  // otra forma mandaría a cambiar un anuncio que quizá funciona bien.
  const contactabilityProblem = contactPct < 50
  const dedupeKey = `spend_without_qualified:${campaign.id}:${day()}`

  await recordDecision({
    orgId,
    campaignId: campaign.id,
    diagnosis: 'spend_without_qualified',
    ruleKey: 'spend_without_qualified',
    ruleVersion: RULE_VERSION,
    dedupeKey,
    severity: 'critical',
    confidence: cohortStatus === 'mature' ? 'high' : 'medium',
    confidenceReason: cohortStatus === 'mature'
      ? `${leads} leads con cohorte madura: la tasa de cualificación ya es estable.`
      : `${leads} leads, cohorte todavía madurando: la tendencia es clara pero puede moverse.`,
    title: contactabilityProblem
      ? `${campaign.name} gasta en leads con los que no se consigue hablar`
      : `${campaign.name} gasta sin producir cualificados`,
    explanation: contactabilityProblem
      ? `Se han gastado ${euros(spendCents)} en ${leads} leads, pero solo se ha conseguido conversación con ${contacted} (${contactPct} %). ` +
        `De esas conversaciones, ${qualified} cualifican. El cuello de botella está en el contacto, no necesariamente en el anuncio.`
      : `Se han gastado ${euros(spendCents)} en ${leads} leads y se ha hablado con ${contacted}, ` +
        `pero solo ${qualified} cualifican (${qualificationPct} % de las conversaciones). ` +
        `El coste por cualificado sube a ${euros(attribution.cpqlCents)} frente a ${euros(attribution.cplCents)} por lead.`,
    recommendation: contactabilityProblem
      ? 'Revisar horarios y número de intentos de llamada antes de tocar la campaña. Comprobar también la calidad del teléfono que pide el formulario.'
      : 'Revisar la segmentación y la promesa del anuncio: está atrayendo a personas que conversan pero no encajan.',
    evidence: {
      periodDays: attribution.periodDays,
      spendCents,
      leads,
      contacted,
      qualified,
      qualificationPct,
      contactPct,
      cplCents: attribution.cplCents,
      cpqlCents: attribution.cpqlCents,
      cohortStatus,
      limitations: [
        'La cualificación depende del resultado que registra la llamada; un agente mal configurado puede deprimirla sin culpa del anuncio.',
      ],
    },
    cohortStatus,
    signalUsed: 'qualified_lead',
  })
  return dedupeKey
}

/**
 * Diagnóstico 2 — fatiga creativa.
 *
 * La frecuencia sube y el CTR cae frente a la propia línea base de la campaña.
 * Sin `frequency` en los snapshots no se puede distinguir desgaste de un mal
 * mensaje desde el principio, y entonces se declara no evaluable.
 */
async function creativeFatigue(
  orgId: string,
  campaign: { id: string; name: string },
  periodDays: number
): Promise<string | null> {
  const periodStart = new Date(Date.now() - periodDays * 86_400_000)
  const snapshots = await prisma.adInsightSnapshot.findMany({
    where: { orgId, campaignId: campaign.id, capturedAt: { gte: periodStart } },
    orderBy: { capturedAt: 'asc' },
    select: { capturedAt: true, impressions: true, clicks: true, frequency: true },
  })
  if (snapshots.length < 6) return null

  // Línea base: la primera mitad del período. Comparar contra la propia
  // historia de la campaña, no contra un CTR "de mercado" que no existe.
  const half = Math.floor(snapshots.length / 2)
  const baseline = snapshots.slice(0, half)
  const recent = snapshots.slice(half)

  const ctrOf = (rows: typeof snapshots) => {
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
    return impressions > 0 ? (clicks / impressions) * 100 : null
  }
  const frequencyOf = (rows: typeof snapshots) => {
    const values = rows.map(row => row.frequency).filter((value): value is number => value != null)
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  }

  const baselineCtr = ctrOf(baseline)
  const recentCtr = ctrOf(recent)
  const baselineFrequency = frequencyOf(baseline)
  const recentFrequency = frequencyOf(recent)

  if (baselineCtr == null || recentCtr == null || baselineCtr === 0) return null

  const ctrDropPct = Math.round(((baselineCtr - recentCtr) / baselineCtr) * 100)
  if (ctrDropPct < FATIGUE_CTR_DROP_PCT) return null

  // Sin frecuencia el CTR caído no basta: puede ser desgaste o puede ser que
  // el mensaje nunca funcionó. Se registra como observación de menor confianza
  // en vez de afirmar una fatiga que no se ha comprobado.
  const hasFrequency = baselineFrequency != null && recentFrequency != null
  const frequencyRising = hasFrequency && recentFrequency > baselineFrequency && recentFrequency >= FATIGUE_FREQUENCY_MIN
  if (hasFrequency && !frequencyRising) return null

  const dedupeKey = `creative_fatigue:${campaign.id}:${day()}`
  await recordDecision({
    orgId,
    campaignId: campaign.id,
    diagnosis: 'creative_fatigue',
    ruleKey: 'creative_fatigue',
    ruleVersion: RULE_VERSION,
    dedupeKey,
    severity: 'warning',
    confidence: frequencyRising ? 'medium' : 'low',
    confidenceReason: frequencyRising
      ? `La frecuencia ha subido de ${baselineFrequency!.toFixed(1)} a ${recentFrequency!.toFixed(1)} mientras el CTR caía: es el patrón del desgaste.`
      : 'No hay frecuencia registrada en los snapshots, así que no se puede distinguir el desgaste de un mensaje que nunca funcionó.',
    title: `El anuncio de ${campaign.name} está perdiendo tracción`,
    explanation: frequencyRising
      ? `El CTR ha caído un ${ctrDropPct} % (de ${baselineCtr.toFixed(2)} % a ${recentCtr.toFixed(2)} %) mientras la frecuencia subía ` +
        `de ${baselineFrequency!.toFixed(1)} a ${recentFrequency!.toFixed(1)}: la misma audiencia está viendo el anuncio demasiadas veces.`
      : `El CTR ha caído un ${ctrDropPct} % (de ${baselineCtr.toFixed(2)} % a ${recentCtr.toFixed(2)} %) en la segunda mitad del período. ` +
        'Sin dato de frecuencia no se puede confirmar que sea desgaste creativo.',
    recommendation: frequencyRising
      ? 'Renovar la creatividad o ampliar la audiencia para bajar la frecuencia.'
      : 'Comprobar la frecuencia en el administrador de Meta antes de renovar la creatividad.',
    evidence: {
      periodDays,
      baselineCtr: Math.round(baselineCtr * 100) / 100,
      recentCtr: Math.round(recentCtr * 100) / 100,
      ctrDropPct,
      baselineFrequency,
      recentFrequency,
      snapshotsAnalysed: snapshots.length,
      limitations: hasFrequency
        ? ['La comparación es contra la propia línea base de la campaña, no contra un patrón del sector.']
        : ['No hay frecuencia registrada: el diagnóstico no puede confirmarse.'],
    },
    cohortStatus: 'maturing',
    signalUsed: 'clic',
  })
  return dedupeKey
}

/**
 * Diagnóstico 3 — anuncio correcto, landing deficiente.
 *
 * El anuncio consigue clics y visitas en proporción razonable, pero la página
 * convierte por debajo de su línea base o de campañas comparables.
 */
async function landingUnderperforming(
  orgId: string,
  campaign: { id: string; name: string },
  attribution: CampaignAttribution,
  peerConversionPct: number | null
): Promise<string | null> {
  const { landingViews, landingConversionPct, clicks } = attribution
  if (landingViews == null || landingViews < 50 || landingConversionPct == null) return null
  if (peerConversionPct == null || peerConversionPct <= 0) return null

  const dropPct = Math.round(((peerConversionPct - landingConversionPct) / peerConversionPct) * 100)
  if (dropPct < LANDING_DROP_PCT) return null

  // Si los clics no llegan a la landing el problema es de entrega o de
  // seguimiento, no de la página.
  const arrivalPct = clicks && clicks > 0 ? Math.round((landingViews / clicks) * 100) : null
  if (arrivalPct != null && arrivalPct < 50) return null

  const dedupeKey = `landing_underperforming:${campaign.id}:${day()}`
  await recordDecision({
    orgId,
    campaignId: campaign.id,
    diagnosis: 'landing_underperforming',
    ruleKey: 'landing_underperforming',
    ruleVersion: RULE_VERSION,
    dedupeKey,
    severity: 'warning',
    confidence: landingViews >= 200 ? 'high' : 'medium',
    confidenceReason: `${landingViews} visitas a la landing en el período: ${landingViews >= 200 ? 'volumen suficiente para que la tasa sea estable' : 'volumen justo, la tasa aún puede moverse'}.`,
    title: `El anuncio de ${campaign.name} funciona, la landing no`,
    explanation:
      `El anuncio trae tráfico (${clicks ?? 'sin medición'} clics, ${landingViews} visitas registradas), pero la landing convierte al ` +
      `${landingConversionPct} % frente al ${peerConversionPct} % de las demás campañas: un ${dropPct} % por debajo. ` +
      'El problema está después del clic.',
    recommendation: 'Revisar la landing antes que el anuncio: correspondencia con la promesa del anuncio, velocidad de carga y longitud del formulario.',
    evidence: {
      periodDays: attribution.periodDays,
      clicks,
      landingViews,
      landingLeads: attribution.landingLeads,
      landingConversionPct,
      peerConversionPct,
      dropPct,
      arrivalPct,
      limitations: [
        'La comparación es contra otras campañas de la organización, que pueden dirigirse a públicos distintos.',
      ],
    },
    cohortStatus: attribution.cohortStatus,
    signalUsed: 'lead',
  })
  return dedupeKey
}

/**
 * Ejecuta los tres diagnósticos sobre todas las campañas activas y retira las
 * observaciones de reglas que ya no se cumplen.
 */
export async function runDiagnostics(orgId: string, options: { periodDays?: number } = {}) {
  // Los diagnósticos económicos usan la ventana del circuito lento para ver la
  // misma realidad que la página. La fatiga creativa es una señal de entrega y
  // se mira en la ventana corta: un desgaste de hace tres semanas ya no importa.
  const periodDays = options.periodDays ?? ECONOMICS_PERIOD_DAYS
  const campaigns = await prisma.campaign.findMany({
    where: {
      orgId,
      OR: [{ adStatus: { not: null } }, { adPlaybookId: { not: null } }, { metaCampaignId: { not: null } }],
    },
    select: { id: true, name: true },
  })
  if (!campaigns.length) return { evaluated: 0, raised: 0 }

  const withAttribution = await Promise.all(
    campaigns.map(async campaign => ({
      campaign,
      attribution: await getCampaignAttribution(orgId, campaign.id, { periodDays }),
    }))
  )

  // Línea base entre campañas para el diagnóstico de landing: la mediana es
  // más robusta que la media cuando una sola campaña se comporta muy mal.
  const conversions = withAttribution
    .map(item => item.attribution.landingConversionPct)
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right)
  const peerConversionPct = conversions.length >= 2
    ? conversions[Math.floor(conversions.length / 2)]
    : null

  const raised: Record<string, string[]> = {
    spend_without_qualified: [],
    creative_fatigue: [],
    landing_underperforming: [],
  }

  for (const { campaign, attribution } of withAttribution) {
    const peers = conversions.length >= 2
      ? (() => {
          const others = withAttribution
            .filter(item => item.campaign.id !== campaign.id)
            .map(item => item.attribution.landingConversionPct)
            .filter((value): value is number => value != null)
            .sort((left, right) => left - right)
          return others.length ? others[Math.floor(others.length / 2)] : peerConversionPct
        })()
      : null

    const results = await Promise.all([
      spendWithoutQualified(orgId, campaign, attribution),
      creativeFatigue(orgId, campaign, FATIGUE_WINDOW_DAYS),
      landingUnderperforming(orgId, campaign, attribution, peers),
    ])
    if (results[0]) raised.spend_without_qualified.push(results[0])
    if (results[1]) raised.creative_fatigue.push(results[1])
    if (results[2]) raised.landing_underperforming.push(results[2])
  }

  // Lo que ya no se cumple deja de mostrarse, pero queda en el histórico.
  await Promise.all(
    Object.entries(raised).map(([ruleKey, keys]) => expireDecisions(orgId, ruleKey, keys))
  )

  return {
    evaluated: campaigns.length,
    raised: Object.values(raised).reduce((total, keys) => total + keys.length, 0),
  }
}
