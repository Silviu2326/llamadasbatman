import { prisma } from '../lib/prisma'
import { recordDecision } from './adDecision.service'

/**
 * Guardarraíles de gasto: tope diario de la cuenta y CPL máximo por campaña.
 *
 * Hasta la Fase 3 de `docs/xarly/ads.md` estas reglas **pausaban campañas en
 * Meta automáticamente**, sin aprobación humana, sin modo sombra, sin cooldown
 * y sin entrada de auditoría. Eso es autonomía N3 de facto, y el documento la
 * reserva para reglas ya demostradas, con canario y botón de parada.
 *
 * Ahora se ejecutan en modo sombra: calculan, registran lo que habrían hecho y
 * no tocan nada. La ejecución con aprobación llega en la Fase 4, a través de
 * `AdAction` y sus guardarraíles.
 *
 * Redacción deliberada (§10.2): se dice "habría pausado tras 84 € de gasto",
 * nunca "habría ahorrado 84 €". Nadie sabe qué habría ocurrido después de
 * pausar — quizá el siguiente lead era el comprador.
 */

const RULE_VERSION = '1'

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`
}

export async function evaluateCampaign(orgId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, orgId } })
  if (!campaign?.metaAdSetId || campaign.status !== 'active') return

  const metaAccount = await prisma.metaAdAccount.findFirst({ where: { orgId, status: 'connected' } })
  if (!metaAccount) return

  const latestSnapshot = await prisma.adInsightSnapshot.findFirst({
    where: { campaignId },
    orderBy: { capturedAt: 'desc' },
  })
  if (!latestSnapshot) return

  // Un snapshot es "gasto acumulado hoy": la comparación con el tope diario
  // solo tiene sentido contra la lectura del día en curso.
  const day = latestSnapshot.capturedAt.toISOString().slice(0, 10)

  if (metaAccount.dailyBudgetCapCents && latestSnapshot.spendCents >= metaAccount.dailyBudgetCapCents) {
    await recordDecision({
      orgId,
      campaignId,
      diagnosis: 'daily_budget_cap',
      ruleKey: 'daily_budget_cap',
      ruleVersion: RULE_VERSION,
      dedupeKey: `daily_budget_cap:${campaignId}:${day}`,
      severity: 'critical',
      confidence: 'high',
      confidenceReason: 'El tope diario es un límite configurado, no una estimación: la comparación es exacta.',
      title: `${campaign.name} ha alcanzado el tope de gasto diario`,
      explanation:
        `El gasto de hoy (${euros(latestSnapshot.spendCents)}) alcanza el tope diario configurado ` +
        `para la cuenta (${euros(metaAccount.dailyBudgetCapCents)}).`,
      recommendation: `Pausar el ad set ${campaign.metaAdSetId} hasta mañana o subir el tope diario si el gasto está justificado.`,
      hypotheticalAction: {
        kind: 'pause_ad_set',
        scope: 'ad_set',
        target: campaign.metaAdSetId,
        // Lo que la regla habría enviado a Meta. No se envía.
        payload: { status: 'PAUSED' },
        reason: 'daily_budget_cap',
      },
      evidence: {
        spendCentsToday: latestSnapshot.spendCents,
        dailyBudgetCapCents: metaAccount.dailyBudgetCapCents,
        snapshotId: latestSnapshot.id,
        capturedAt: latestSnapshot.capturedAt,
        // Qué no sabemos: pausar no equivale a ahorrar, porque no sabemos qué
        // habría pasado con el gasto restante del día.
        limitations: ['No se puede afirmar cuánto se habría ahorrado: se desconoce el resultado de no pausar.'],
      },
      cohortStatus: 'mature',
      signalUsed: 'clic',
    })
    return
  }

  if (
    campaign.maxCostPerLeadCents &&
    latestSnapshot.costPerLeadCents &&
    latestSnapshot.costPerLeadCents > campaign.maxCostPerLeadCents
  ) {
    const excessPct = Math.round(
      ((latestSnapshot.costPerLeadCents - campaign.maxCostPerLeadCents) / campaign.maxCostPerLeadCents) * 100
    )
    // Con muy pocos leads el CPL de un día oscila con violencia; se dice, en
    // lugar de tratar 2 leads como una tendencia.
    const thinVolume = latestSnapshot.leadsCount < 5

    await recordDecision({
      orgId,
      campaignId,
      diagnosis: 'high_cpl',
      ruleKey: 'high_cpl',
      ruleVersion: RULE_VERSION,
      dedupeKey: `high_cpl:${campaignId}:${day}`,
      severity: thinVolume ? 'warning' : 'critical',
      confidence: thinVolume ? 'low' : 'medium',
      confidenceReason: thinVolume
        ? `Solo ${latestSnapshot.leadsCount} lead${latestSnapshot.leadsCount === 1 ? '' : 's'} hoy: con ese volumen el CPL diario oscila demasiado para concluir nada.`
        : `${latestSnapshot.leadsCount} leads en la lectura de hoy, suficiente para que el CPL diario sea representativo.`,
      title: `El CPL de ${campaign.name} supera su límite`,
      explanation:
        `El coste por lead de hoy (${euros(latestSnapshot.costPerLeadCents)}) está un ${excessPct} % por encima ` +
        `del límite configurado (${euros(campaign.maxCostPerLeadCents)}).`,
      recommendation: thinVolume
        ? 'Esperar a acumular más leads antes de actuar: el dato de hoy no es concluyente.'
        : `Revisar la segmentación o pausar el ad set ${campaign.metaAdSetId}.`,
      hypotheticalAction: {
        kind: 'pause_ad_set',
        scope: 'ad_set',
        target: campaign.metaAdSetId,
        payload: { status: 'PAUSED' },
        reason: 'high_cpl',
      },
      evidence: {
        costPerLeadCents: latestSnapshot.costPerLeadCents,
        maxCostPerLeadCents: campaign.maxCostPerLeadCents,
        excessPct,
        leadsToday: latestSnapshot.leadsCount,
        spendCentsToday: latestSnapshot.spendCents,
        snapshotId: latestSnapshot.id,
        capturedAt: latestSnapshot.capturedAt,
        limitations: [
          'El CPL mide coste por lead, no por comprador: un CPL alto con buena cualificación puede ser rentable.',
        ],
      },
      cohortStatus: thinVolume ? 'insufficient' : 'maturing',
      signalUsed: 'lead',
    })
  }
}
