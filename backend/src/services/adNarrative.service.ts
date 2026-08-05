import type { CampaignAttribution } from './adAttribution.service'
import type { DataQualityIssue } from './adDataQuality.service'

/**
 * Informe semanal narrado de `docs/xarly/ads.md` §4.8. Debe existir desde la
 * Fase 1, antes de que haya autonomía: es la forma de demostrar valor sin
 * pedir permiso para actuar.
 *
 * Se redacta con plantillas, no con un LLM. Un informe que puede alucinar una
 * cifra no sirve para decidir dónde poner el presupuesto, y además mandar el
 * embudo a un modelo externo chocaría con la regla de no sacar datos de la
 * organización sin necesidad.
 */

export type NarrativeSection = {
  key: 'deepest_signal' | 'funnel_leak' | 'decisions' | 'immature' | 'next_week'
  title: string
  body: string
}

export type WeeklyNarrative = {
  periodDays: number
  headline: string
  sections: NarrativeSection[]
  generatedAt: string
}

type CampaignWithAttribution = { id: string; name: string; attribution: CampaignAttribution }

function euros(cents: number | null): string {
  return cents == null ? 'sin medición' : `${(cents / 100).toFixed(2)} €`
}

function plural(count: number, singular: string, prefix = ''): string {
  return `${count} ${prefix}${singular}${count === 1 ? '' : 's'}`
}

/**
 * Campaña con la señal más profunda: la que ha llegado más lejos en el embudo,
 * y a igualdad de profundidad la más barata por unidad de esa señal.
 */
function deepestPerformer(campaigns: CampaignWithAttribution[]): CampaignWithAttribution | null {
  const depth = { sale: 4, opportunity: 3, qualified_lead: 2, lead: 1, clic: 0 }
  const ranked = campaigns
    .filter(item => (item.attribution.leads ?? 0) > 0)
    .sort((left, right) => {
      const byDepth =
        depth[right.attribution.deepestEligibleSignal] - depth[left.attribution.deepestEligibleSignal]
      if (byDepth !== 0) return byDepth
      const leftCost = left.attribution.cacCents ?? left.attribution.cpqlCents ?? left.attribution.cplCents ?? Infinity
      const rightCost = right.attribution.cacCents ?? right.attribution.cpqlCents ?? right.attribution.cplCents ?? Infinity
      return leftCost - rightCost
    })
  return ranked[0] ?? null
}

/**
 * Paso del embudo con la peor caída: dónde se está perdiendo el dinero.
 *
 * Se salta el paso clic → lead, que estructuralmente siempre es el más bajo
 * (una landing que convierte al 25 % ya es buena) y ganaría siempre la
 * comparación. Ese tramo tiene además su propio diagnóstico de landing.
 */
function worstLeak(attribution: CampaignAttribution): { from: string; to: string; pct: number } | null {
  let worst: { from: string; to: string; pct: number } | null = null
  for (let index = 2; index < attribution.funnel.length; index += 1) {
    const step = attribution.funnel[index]
    const previous = attribution.funnel[index - 1]
    if (step.conversionPct == null || previous.value == null || previous.value < 5) continue
    if (!worst || step.conversionPct < worst.pct) {
      worst = { from: previous.label.toLowerCase(), to: step.label.toLowerCase(), pct: step.conversionPct }
    }
  }
  return worst
}

export function buildWeeklyNarrative(input: {
  periodDays: number
  campaigns: CampaignWithAttribution[]
  totals: {
    spendCents: number | null
    leads: number | null
    qualified: number | null
    sales: number | null
    cplCents: number | null
    cpqlCents: number | null
    cacCents: number | null
  }
  decisions: Array<{ title: string; severity: string; diagnosis: string }>
  dataQualityIssues: DataQualityIssue[]
  deepestEligibleSignal: string
  eligibilityReason: string
}): WeeklyNarrative | null {
  const { periodDays, campaigns, totals, decisions } = input
  const active = campaigns.filter(item => (item.attribution.leads ?? 0) > 0 || (item.attribution.spendCents ?? 0) > 0)
  if (!active.length) return null

  const sections: NarrativeSection[] = []

  const headline = totals.spendCents == null
    ? `Sin gasto medido en los últimos ${periodDays} días.`
    : `${euros(totals.spendCents)} invertidos en ${periodDays} días · ` +
      `${totals.leads ?? 0} leads · ${totals.qualified ?? 0} cualificados · ${totals.sales ?? 0} ventas.`

  // 1. Qué campaña produjo la señal más profunda
  const best = deepestPerformer(active)
  if (best) {
    const cheapest = active
      .filter(item => item.attribution.cplCents != null)
      .sort((left, right) => (left.attribution.cplCents ?? 0) - (right.attribution.cplCents ?? 0))[0]

    const contrast = cheapest && cheapest.id !== best.id
      ? ` Meta señalaría a “${cheapest.name}” por su CPL de ${euros(cheapest.attribution.cplCents)}, ` +
        `pero su coste por cualificado es de ${euros(cheapest.attribution.cpqlCents)}.`
      : ''

    sections.push({
      key: 'deepest_signal',
      title: 'Qué campaña produjo la señal más profunda',
      body:
        `“${best.name}” es la que llega más lejos en el embudo: ` +
        `${plural(best.attribution.qualified ?? 0, 'cualificado')} a ${euros(best.attribution.cpqlCents)} ` +
        `y ${plural(best.attribution.sales ?? 0, 'venta')}` +
        `${best.attribution.cacCents != null ? ` con un CAC de ${euros(best.attribution.cacCents)}` : ''}.` +
        contrast,
    })
  }

  // 2. Dónde se pierde el embudo
  const leaks = active
    .map(item => ({ item, leak: worstLeak(item.attribution) }))
    .filter((entry): entry is { item: CampaignWithAttribution; leak: NonNullable<ReturnType<typeof worstLeak>> } => entry.leak != null)
    .sort((left, right) => left.leak.pct - right.leak.pct)

  if (leaks.length) {
    const { item, leak } = leaks[0]
    sections.push({
      key: 'funnel_leak',
      title: 'Dónde se pierde el embudo',
      body:
        `La caída más pronunciada está en “${item.name}”, entre ${leak.from} y ${leak.to}: ` +
        `solo avanza el ${leak.pct} %. Es el punto donde cada euro invertido deja de avanzar hacia una venta.`,
    })
  }

  // 3. Qué decidió Xarly o dejó pendiente
  const critical = decisions.filter(decision => decision.severity === 'critical')
  sections.push({
    key: 'decisions',
    title: 'Qué observó Xarly',
    body: decisions.length
      ? `Xarly ha registrado ${decisions.length === 1 ? '1 observación' : `${decisions.length} observaciones`}` +
        `${critical.length ? `, ${critical.length} de ellas graves` : ''}: ` +
        `${decisions.slice(0, 3).map(decision => `“${decision.title}”`).join('; ')}. ` +
        'Ninguna se ha ejecutado: Xarly está en modo consultivo y todas esperan una decisión humana.'
      : 'Xarly no ha detectado ningún problema que merezca una recomendación en este período.',
  })

  // 4. Qué datos siguen inmaduros
  const immature = active.filter(item => item.attribution.cohortStatus !== 'mature')
  const issues = input.dataQualityIssues.filter(issue => issue.severity !== 'info')
  if (immature.length || issues.length) {
    const parts: string[] = []
    if (immature.length) {
      parts.push(
        `${immature.length === 1 ? 'Una campaña tiene' : `${immature.length} campañas tienen`} la cohorte todavía sin madurar, ` +
        'así que su ausencia de ventas no significa que no vayan a producirlas.'
      )
    }
    if (issues.length) parts.push(`Integridad de datos: ${issues.map(issue => issue.message).join(' ')}`)
    parts.push(`Señal más profunda utilizable ahora mismo: ${input.eligibilityReason}`)
    sections.push({ key: 'immature', title: 'Qué datos siguen inmaduros', body: parts.join(' ') })
  }

  // 5. Qué probar la semana que viene
  const nextSteps: string[] = []
  if (leaks.length) {
    const { item, leak } = leaks[0]
    nextSteps.push(`atacar el paso ${leak.from} → ${leak.to} de “${item.name}”`)
  }
  if (best && (best.attribution.sales ?? 0) > 0) {
    nextSteps.push(`sostener o ampliar “${best.name}”, que es la única que ha producido compradores`)
  }
  const fatigue = decisions.find(decision => decision.diagnosis === 'creative_fatigue')
  if (fatigue) nextSteps.push('renovar la creatividad señalada por desgaste')

  sections.push({
    key: 'next_week',
    title: 'Qué probar la semana que viene',
    body: nextSteps.length
      ? `${nextSteps.map((step, index) => `${index + 1}) ${step}`).join('; ')}.`
      : 'No hay una prueba clara que priorizar: conviene dejar correr el período actual y volver a mirar con más volumen.',
  })

  return {
    periodDays,
    headline,
    sections: sections.filter(section => section.body.trim().length > 0),
    generatedAt: new Date().toISOString(),
  }
}
