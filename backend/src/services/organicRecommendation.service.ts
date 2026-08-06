import { prisma } from '../lib/prisma'
import { recordDecision } from './adDecision.service'
import { getUnifiedFunnel } from './organicChannels.service'
import { hoursForPieces } from '../data/effortEstimates'
import { getWeights, recordDispatchedAction, recordFeedback } from './organicOutcome.service'

/**
 * Diagnósticos y cola de recomendaciones del orgánico — `docs/vendrava/organico.md`
 * §3 y §5.5.
 *
 * Los tres diagnósticos del MVP:
 *
 *   1. Canal que trae leads que no cualifican
 *   2. Demanda detectada sin pieza que la capture
 *   3. Esfuerzo sin retorno
 *
 * Todos en N1: calculan, explican y registran. Ninguno ejecuta.
 *
 * Dos decisiones de arquitectura, ambas del documento:
 *
 * - **No hay motor paralelo** (§10). Se reutiliza `AdDecision` con `channel`,
 *   así que Ads y Orgánico comparten auditoría, aprobación y kill switch.
 * - **El centro de mando nunca ejecuta** (§1). Cada recomendación declara su
 *   brazo destino y el contexto que hay que llevarle; abrir `/seo` con la
 *   keyword cargada es el trabajo del despacho, no de esta página.
 */

const RULE_VERSION = '1'

/** Volumen mínimo por canal antes de opinar sobre su tasa de cualificación. */
const MIN_LEADS_FOR_CHANNEL_DIAGNOSIS = 8
/** Por debajo de esta fracción de la mediana, el canal cualifica mal. */
const QUALIFICATION_GAP_RATIO = 0.5
/** Impresiones mensuales que hacen que una demanda merezca una pieza. */
const MIN_IMPRESSIONS_FOR_DEMAND = 300
/** Horas invertidas sin un solo cualificado antes de avisar. */
const WASTED_HOURS_THRESHOLD = 4

function day(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Prioridad económica (§5.5, misma fórmula que `landings.md` §5.1):
 * impacto estimado × confianza ÷ esfuerzo. Ordenar por impacto a secas premia
 * lo grande aunque cueste semanas; dividir por horas es lo que hace que una
 * acción pequeña y segura pueda ganarle a una enorme e incierta.
 */
function priority(estimatedLeads: number, confidence: number, hours: number): number {
  return Math.round(((estimatedLeads * confidence) / Math.max(0.5, hours)) * 100) / 100
}

/**
 * Diagnóstico 1 — canal que trae leads que no cualifican.
 *
 * Se compara contra la mediana de los demás canales, no contra un número
 * absoluto: un 15 % de cualificación puede ser excelente o pésimo según el
 * negocio, y solo sus propios canales dan la referencia justa.
 */
async function channelNotQualifying(orgId: string, projectId: string, channels: Array<{
  channel: string; label: string; leads: number | null; qualified: number | null; qualificationPct: number | null; cohortStatus: string
}>) {
  const comparable = channels.filter(item =>
    item.channel !== 'unattributed' &&
    (item.leads ?? 0) >= MIN_LEADS_FOR_CHANNEL_DIAGNOSIS &&
    item.qualificationPct != null
  )
  if (comparable.length < 2) return []

  const rates = comparable.map(item => item.qualificationPct!).sort((a, b) => a - b)
  const median = rates[Math.floor(rates.length / 2)]
  const keys: string[] = []

  for (const channel of comparable) {
    if (channel.qualificationPct! >= median * QUALIFICATION_GAP_RATIO) continue
    const dedupeKey = `organic_channel_not_qualifying:${channel.channel}:${day()}`
    const hours = hoursForPieces(['landing'])
    await recordDecision({
      orgId,
      campaignId: null,
      diagnosis: 'channel_not_qualifying',
      ruleKey: 'organic_channel_not_qualifying',
      ruleVersion: RULE_VERSION,
      dedupeKey,
      severity: 'warning',
      confidence: channel.cohortStatus === 'mature' ? 'high' : 'medium',
      confidenceReason: `${channel.leads} leads de ${channel.label} y ${comparable.length} canales que comparar; cohorte ${channel.cohortStatus === 'mature' ? 'madura' : 'madurando'}.`,
      title: `${channel.label} trae leads que no cualifican`,
      explanation:
        `${channel.label} ha traído ${channel.leads} leads pero solo cualifica el ${channel.qualificationPct} %, ` +
        `frente al ${median} % de mediana de los demás canales. ` +
        'El tráfico llega, pero con otra intención o a una página pensada para otro canal.',
      recommendation: 'Revisar a qué página aterriza este canal y si el mensaje promete lo mismo que la página entrega.',
      evidence: {
        channel: channel.channel,
        leads: channel.leads,
        qualified: channel.qualified,
        qualificationPct: channel.qualificationPct,
        medianPct: median,
        comparedChannels: comparable.length,
        limitations: ['Los canales pueden dirigirse a públicos distintos: una diferencia no siempre es un problema.'],
      },
      cohortStatus: channel.cohortStatus as 'insufficient' | 'maturing' | 'mature',
      signalUsed: 'qualified_lead',
      channel: channel.channel,
      // Dos semanas: si el canal sigue sin cualificar pasado ese tiempo,
      // merece volver a plantearse aunque se descartara antes.
      suppressDays: 14,
      dispatchArm: 'landings',
      dispatchContext: { channel: channel.channel, reason: 'low_qualification' },
      estimatedHours: hours,
      priorityScore: priority((channel.leads ?? 0) * 0.3, 0.6, hours),
    })
    keys.push(dedupeKey)
  }
  return keys
}

/**
 * Diagnóstico 2 — demanda detectada sin pieza que la capture.
 *
 * Sale de las consultas de Search Console que ya se ingieren. Se enruta al
 * brazo según la intención: una pregunta va a artículo, una comparación o un
 * precio van a landing.
 */
async function demandWithoutContent(orgId: string, projectId: string) {
  const opportunities = await prisma.organicOpportunity.findMany({
    where: { orgId, projectId, status: { notIn: ['closed', 'closed_won', 'closed_lost', 'archived'] } },
    orderBy: { score: 'desc' },
    take: 40,
  })
  if (!opportunities.length) return []

  const keys: string[] = []
  for (const opportunity of opportunities.slice(0, 5)) {
    const metadata = (opportunity.metadata ?? {}) as Record<string, unknown>
    const impressions = typeof metadata.impressions === 'number' ? metadata.impressions : null
    if (impressions != null && impressions < MIN_IMPRESSIONS_FOR_DEMAND) continue

    const query = opportunity.title || opportunity.query || 'consulta sin nombre'
    // Intención: preguntas → artículo; precio o comparación → landing.
    const isQuestion = /^(qué|que|cómo|como|cuánto|cuanto|por qué|porque|cuál|cual|dónde|donde)\b/i.test(query)
    const isCommercial = /(precio|coste|cuesta|barato|mejor|comparativa|opiniones)/i.test(query)
    const arm = isCommercial ? 'landings' : isQuestion ? 'seo' : 'seo'
    const formats = isCommercial ? ['landing'] : ['articulo']
    const hours = hoursForPieces(formats)

    // Estimación conservadora y declarada como tal: un 2 % de las impresiones
    // como visitas y un 10 % de esas visitas como leads.
    const estimatedLeads = impressions != null ? Math.round(impressions * 0.02 * 0.1) : 1
    const dedupeKey = `organic_demand_without_content:${opportunity.id}:${day()}`

    await recordDecision({
      orgId,
      campaignId: null,
      diagnosis: 'demand_without_content',
      ruleKey: 'organic_demand_without_content',
      ruleVersion: RULE_VERSION,
      dedupeKey,
      severity: 'info',
      confidence: impressions != null && impressions > 1000 ? 'medium' : 'low',
      confidenceReason: impressions != null
        ? `${impressions} impresiones registradas en Search Console para esta consulta.`
        : 'La consulta no trae volumen de impresiones: la estimación es orientativa.',
      title: `Demanda sin contenido: “${query}”`,
      explanation:
        `Hay demanda en “${query}”${impressions != null ? ` (${impressions} impresiones)` : ''} y no existe una pieza tuya que la capture. ` +
        `Por la forma de la búsqueda, la intención parece ${isCommercial ? 'comercial' : 'informativa'}.`,
      recommendation: isCommercial
        ? 'Crear una landing que responda a esa búsqueda con una vía de contacto clara.'
        : 'Escribir un artículo que responda esa pregunta y enlace a la landing correspondiente.',
      evidence: {
        query,
        impressions,
        opportunityId: opportunity.id,
        intent: isCommercial ? 'comercial' : 'informativa',
        estimatedLeads,
        estimatedHours: hours,
        limitations: [
          'La estimación de leads es una proyección declarada (2 % de clic, 10 % de conversión), no un dato observado.',
        ],
      },
      cohortStatus: 'insufficient',
      signalUsed: 'lead',
      channel: 'search',
      // Un mes: "ya lo cubrimos con otra pieza" suele seguir siendo cierto.
      suppressDays: 30,
      dispatchArm: arm,
      // El contexto que hay que llevarle al brazo: abrir /seo con la keyword y
      // el brief cargados es el trabajo del despacho (§5.5).
      dispatchContext: { query, intent: isCommercial ? 'commercial' : 'informational', formats, opportunityId: opportunity.id },
      estimatedHours: hours,
      priorityScore: priority(estimatedLeads, impressions != null && impressions > 1000 ? 0.5 : 0.3, hours),
    })
    keys.push(dedupeKey)
  }
  return keys
}

/**
 * Diagnóstico 3 — esfuerzo sin retorno.
 *
 * Un canal con horas invertidas y cohorte ya madura que no produce
 * cualificados. Se recomienda mover esas horas al canal con mejor coste por
 * cualificado en tiempo, que es la comparación que da sentido a medir horas.
 */
async function effortWithoutReturn(orgId: string, channels: Array<{
  channel: string; label: string; leads: number | null; qualified: number | null; hoursInvested: number | null; cohortStatus: string
}>) {
  const withEffort = channels.filter(item => (item.hoursInvested ?? 0) >= WASTED_HOURS_THRESHOLD)
  if (!withEffort.length) return []

  const best = channels
    .filter(item => (item.qualified ?? 0) > 0 && (item.hoursInvested ?? 0) > 0)
    .map(item => ({ ...item, hoursPerQualified: item.hoursInvested! / item.qualified! }))
    .sort((left, right) => left.hoursPerQualified - right.hoursPerQualified)[0]

  const keys: string[] = []
  for (const channel of withEffort) {
    // La cohorte debe estar madura: el orgánico tarda semanas y penalizar un
    // canal joven es exactamente lo que el documento prohíbe.
    if (channel.cohortStatus !== 'mature') continue
    if ((channel.qualified ?? 0) > 0) continue

    const dedupeKey = `organic_effort_no_return:${channel.channel}:${day()}`
    await recordDecision({
      orgId,
      campaignId: null,
      diagnosis: 'effort_no_return',
      ruleKey: 'organic_effort_no_return',
      ruleVersion: RULE_VERSION,
      dedupeKey,
      severity: 'warning',
      confidence: 'medium',
      confidenceReason: `Cohorte madura y ${channel.hoursInvested} h invertidas sin ningún cualificado.`,
      title: `${channel.label} consume horas sin producir cualificados`,
      explanation:
        `Se han invertido ${channel.hoursInvested} h estimadas en ${channel.label} y su cohorte ya está madura, ` +
        `pero no ha producido ningún cualificado.` +
        (best ? ` ${best.label} consigue uno cada ${Math.round(best.hoursPerQualified * 10) / 10} h.` : ''),
      recommendation: best
        ? `Mover parte de esas horas a ${best.label}, que hoy es el canal más eficiente en tiempo.`
        : 'Revisar si el canal merece seguir recibiendo horas o conviene pausarlo.',
      evidence: {
        channel: channel.channel,
        hoursInvested: channel.hoursInvested,
        leads: channel.leads,
        qualified: channel.qualified,
        bestChannel: best?.label ?? null,
        bestHoursPerQualified: best ? Math.round(best.hoursPerQualified * 10) / 10 : null,
        limitations: [
          'Las horas son una estimación declarada por formato, no un registro de tiempo real.',
          'Un canal puede aportar valor de marca que este embudo no mide.',
        ],
      },
      cohortStatus: 'mature',
      signalUsed: 'qualified_lead',
      channel: channel.channel,
      suppressDays: 21,
      dispatchArm: channel.channel === 'social' ? 'social' : channel.channel === 'prospecting' ? 'prospecting' : 'seo',
      dispatchContext: { channel: channel.channel, reason: 'reallocate_hours' },
      estimatedHours: 1,
      priorityScore: priority(channel.hoursInvested ?? 0, 0.5, 1),
    })
    keys.push(dedupeKey)
  }
  return keys
}

/** Ejecuta los tres diagnósticos del MVP sobre el proyecto orgánico. */
export async function runOrganicDiagnostics(orgId: string, periodKey = '90d', periodDays = 90) {
  const project = await prisma.organicProject.findUnique({ where: { orgId }, select: { id: true } })
  if (!project) return { evaluated: 0, raised: 0 }

  const { channels } = await getUnifiedFunnel(orgId, project.id, periodKey, periodDays)
  const raised = [
    ...(await channelNotQualifying(orgId, project.id, channels)),
    ...(await demandWithoutContent(orgId, project.id)),
    ...(await effortWithoutReturn(orgId, channels)),
  ]
  return { evaluated: channels.length, raised: raised.length }
}

/**
 * Cola priorizada del §5.5: las tres corrientes juntas y ordenadas por valor
 * económico. Las oportunidades de contenido de la caza de Vendrava entran como
 * una fuente más, sin duplicar su modelo.
 */
export async function listOrganicRecommendations(orgId: string, limit = 20) {
  const weights = await getWeights(orgId)
  const [decisions, huntOpportunities] = await Promise.all([
    prisma.adDecision.findMany({
      where: {
        orgId,
        channel: { not: 'ads' },
        status: { in: ['advisory', 'shadow'] },
        // Las acciones autónomas (§9) comparten tabla pero no cola: una
        // re-sincronización no se "despacha a un brazo" ni se prioriza por
        // impacto económico. Tienen su propia sala de aprobación.
        NOT: { diagnosis: { startsWith: 'autonomy:' } },
      },
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    }),
    // La caza de Vendrava sobre llamadas, CRM e inbox ya produce oportunidades:
    // se leen, no se reimplementan.
    prisma.contentOpportunity.findMany({
      where: { orgId, status: 'proposed' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }).catch(() => []),
  ])

  const fromDecisions = decisions.map(decision => ({
    id: decision.id,
    stream: 'channel_signal' as const,
    diagnosis: decision.diagnosis,
    channel: decision.channel,
    title: decision.title,
    explanation: decision.explanation,
    recommendation: decision.recommendation,
    confidence: decision.confidence,
    confidenceReason: decision.confidenceReason,
    evidence: decision.evidence,
    dispatchArm: decision.dispatchArm,
    dispatchContext: decision.dispatchContext,
    estimatedHours: decision.estimatedHours,
    priorityScore: decision.priorityScore,
    severity: decision.severity,
  }))

  const fromHunt = (huntOpportunities as Array<{ id: string; title: string; evidenceCount: number; evidenceSummary: string | null }>).map(item => ({
    id: item.id,
    stream: 'vendrava_hunt' as const,
    diagnosis: 'content_opportunity',
    channel: 'social',
    title: item.title,
    explanation: item.evidenceSummary ?? `Detectado en ${item.evidenceCount} conversaciones.`,
    recommendation: 'Crear la pieza que responde a esta objeción antes de la próxima llamada.',
    confidence: item.evidenceCount >= 8 ? 'high' : item.evidenceCount >= 4 ? 'medium' : 'low',
    confidenceReason: `${item.evidenceCount} evidencias en conversaciones reales.`,
    evidence: { evidenceCount: item.evidenceCount },
    dispatchArm: 'social',
    dispatchContext: { opportunityId: item.id },
    estimatedHours: hoursForPieces(['carrusel']),
    // La caza no trae impacto estimado; se prioriza por evidencias, que es lo
    // que de verdad la respalda.
    priorityScore: priority(item.evidenceCount, 0.5, hoursForPieces(['carrusel'])),
    severity: 'info' as const,
  }))

  // El peso aprendido reordena los tipos de recomendacion: si sueles descartar
  // "demanda sin contenido", las proximas de ese tipo —sobre OTROS asuntos—
  // apareceran mas abajo, nunca ocultas. El asunto concreto que se descarto se
  // silencia aparte, por su ventana (`suppressDays`), para no repreguntar lo
  // mismo cada dia.
  const weighted = [...fromDecisions, ...fromHunt].map(item => {
    const learned = weights.get(item.diagnosis)
    return {
      ...item,
      priorityScore: Math.round((item.priorityScore ?? 0) * (learned?.weight ?? 1) * 100) / 100,
      /** Por que ha bajado: se ensena al usuario en vez de moverla en secreto. */
      demotedBecause: learned && learned.weight < 0.9 && learned.lastReasons.length
        ? `Has descartado ${learned.dismissed} recomendaciones como esta. Ultimo motivo: "${learned.lastReasons[0]}"`
        : null,
    }
  })

  return weighted
    .sort((left, right) => (right.priorityScore ?? 0) - (left.priorityScore ?? 0))
    .slice(0, limit)
}

/** Rutas de destino de cada brazo, con su contexto en la query. */
const ARM_ROUTES: Record<string, string> = {
  seo: '/seo',
  social: '/redes-sociales',
  prospecting: '/prospectos',
  landings: '/landings',
  ads: '/ads',
}

/**
 * Despacha una recomendación a su brazo: devuelve la URL destino con el
 * contexto cargado. El centro de mando **no ejecuta**: abre la herramienta
 * correcta con el caso preparado (§1 y §5.5).
 */
export async function dispatchRecommendation(orgId: string, decisionId: string) {
  const decision = await prisma.adDecision.findFirst({ where: { id: decisionId, orgId } })
  if (!decision) return null
  const arm = decision.dispatchArm ?? 'seo'
  const base = ARM_ROUTES[arm] ?? '/organic'
  const context = (decision.dispatchContext ?? {}) as Record<string, unknown>

  const params = new URLSearchParams({ from: 'organic', decisionId: decision.id })
  for (const [key, value] of Object.entries(context)) {
    if (value == null) continue
    params.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }

  await prisma.adDecision.update({
    where: { id: decision.id },
    data: { status: 'pending_approval', decisionNote: `Despachada a ${arm}` },
  })

  // Se declara aqui la metrica objetivo, su linea base y la ventana de
  // maduracion: sin hacerlo ANTES de ejecutar, medir despues no demuestra nada.
  const action = await recordDispatchedAction(orgId, {
    id: decision.id,
    diagnosis: decision.diagnosis,
    title: decision.title,
    channel: decision.channel,
    dispatchArm: arm,
    estimatedHours: decision.estimatedHours,
    evidence: decision.evidence,
  })
  await recordFeedback(orgId, decision.diagnosis, 'dispatched')

  return {
    url: `${base}?${params.toString()}`,
    arm,
    decisionId: decision.id,
    actionId: action?.id ?? null,
    maturesAt: action?.maturesAt ?? null,
  }
}

/** Descartar con motivo: alimenta el aprendizaje de la fase 3. */
export async function dismissRecommendation(orgId: string, decisionId: string, reason: string) {
  const decision = await prisma.adDecision.findFirst({ where: { id: decisionId, orgId } })
  if (!decision) return null
  await recordFeedback(orgId, decision.diagnosis, 'dismissed', reason)
  return prisma.adDecision.update({
    where: { id: decision.id },
    data: { status: 'rejected', decisionNote: reason, decidedAt: new Date() },
  })
}
