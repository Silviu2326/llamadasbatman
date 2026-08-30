import { z } from 'zod'
import { bindingsFor } from '../../providers/registry'
import { registerMicroapp } from '../registry'
import type { EvidenceItem, FollowUpAction, MicroappCategory, MicroappCtx, MicroappManifest, UiFieldSpec } from '../types'

export interface PreparedContext {
  data?: unknown
  evidence?: EvidenceItem[]
}

export interface CostItem {
  capability: string
  input: unknown
  multiplier?: number
}

/**
 * Contrato compartido para recetas de síntesis estructurada. La factoría no
 * decide la semántica: cada microapp aporta esquemas, prompt, evidencia y
 * entregable propios. Solo centraliza routing, estimación y validación JSON.
 */
export interface StructuredRecipeConfig<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny> {
  id: string
  name: string
  promise: string
  category: MicroappCategory
  inputSchema: InputSchema
  outputSchema: OutputSchema
  uiSchema: UiFieldSpec[]
  capabilities?: string[]
  dataAccess?: string[]
  freshnessDays?: number
  followUps?: FollowUpAction[]
  maxTokens?: number
  system(input: z.output<InputSchema>): string
  prompt(input: z.output<InputSchema>, prepared: PreparedContext): string
  prepare?(ctx: MicroappCtx, input: z.output<InputSchema>): Promise<PreparedContext>
  costItems?(input: z.output<InputSchema>): CostItem[] | Promise<CostItem[]>
  finalize?(input: z.output<InputSchema>, output: z.output<OutputSchema>, prepared: PreparedContext): z.output<OutputSchema>
  evidence(ctx: MicroappCtx, input: z.output<InputSchema>, output: z.output<OutputSchema>, prepared: PreparedContext): EvidenceItem[]
  suggestedActions?(input: z.output<InputSchema>, output: z.output<OutputSchema>): FollowUpAction[]
  placements?: MicroappManifest['placements']
  resultProjection?: MicroappManifest['resultProjection']
  configurationScope?: MicroappManifest['configurationScope']
}

export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''))
  } catch {
    return null
  }
}

export async function cheapestCapabilityCents(capability: string, input: unknown): Promise<number> {
  const estimates: number[] = []
  for (const { binding } of bindingsFor(capability)) {
    if (binding.routable === false) continue
    try {
      const cents = (await binding.estimateCost(input)).cents
      if (Number.isFinite(cents) && cents >= 0) estimates.push(cents)
    } catch {
      // Otro binding puede estimar. Si ninguno puede, devolvemos cero: el
      // router hará la validación definitiva al crear el trabajo.
    }
  }
  if (!estimates.length) return 0
  // estimateCost no recibe todavía el tenant y, por tanto, no puede saber si
  // su credencial BYOK está conectada. Un binding BYOK a 0 no debe hacer que
  // el presupuesto previo prometa «gratis» cuando existe una ruta gestionada
  // de pago. Reservamos la alternativa positiva más barata; si el router usa
  // BYOK, el settlement conciliará el coste real (menor) al terminar.
  const paidEstimates = estimates.filter(cents => cents > 0)
  return paidEstimates.length ? Math.min(...paidEstimates) : 0
}

export function inputEvidence(ctx: MicroappCtx, claim: string): EvidenceItem {
  return {
    claim,
    sourceRef: { kind: 'microapp-input', id: ctx.jobId },
    confidence: 'medium',
    fetchedAt: new Date().toISOString(),
  }
}

export function defineStructuredMicroapp<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny>(
  config: StructuredRecipeConfig<InputSchema, OutputSchema>,
): void {
  const maxTokens = config.maxTokens ?? 3200
  registerMicroapp({
    id: config.id,
    version: '1.0.0',
    name: config.name,
    promise: config.promise,
    category: config.category,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    uiSchema: config.uiSchema,
    capabilities: config.capabilities ?? ['llm.generate'],
    dataAccess: config.dataAccess ?? [],
    effects: 'local',
    freshnessDays: config.freshnessDays ?? 30,
    followUps: config.followUps ?? [],
    placements: config.placements,
    resultProjection: config.resultProjection,
    configurationScope: config.configurationScope,
    async estimateCost(raw) {
      const input = config.inputSchema.parse(raw)
      const items = config.costItems
        ? await config.costItems(input)
        : [{ capability: 'llm.generate', input: { prompt: config.prompt(input, {}), system: config.system(input), maxTokens, json: true } }]
      let cents = 0
      for (const item of items) {
        cents += (await cheapestCapabilityCents(item.capability, item.input)) * (item.multiplier ?? 1)
      }
      return { cents }
    },
    async run(ctx, raw) {
      const input = config.inputSchema.parse(raw)
      const prepared = config.prepare ? await config.prepare(ctx, input) : {}
      const result = await ctx.capability('llm.generate', {
        system: config.system(input),
        prompt: config.prompt(input, prepared),
        maxTokens,
        json: true,
      }) as { text: string }
      const parsed = config.outputSchema.safeParse(parseJsonText(result.text))
      if (!parsed.success) {
        ctx.log(`Salida inválida de ${config.id}`, { issues: parsed.error.issues.slice(0, 8) })
        throw Object.assign(new Error(`La microapp ${config.name} no devolvió su entregable estructurado`), {
          code: 'MICROAPP_PROVIDER_OUTPUT_INVALID',
        })
      }
      const finalized = config.finalize ? config.finalize(input, parsed.data, prepared) : parsed.data
      const finalParsed = config.outputSchema.safeParse(finalized)
      if (!finalParsed.success) throw new Error(`La microapp ${config.id} produjo un entregable final inválido`)
      const evidence = [
        ...(prepared.evidence ?? []),
        ...config.evidence(ctx, input, finalParsed.data, prepared),
      ]
      if (!evidence.length) throw new Error(`La microapp ${config.id} no produjo evidencias`)
      return {
        data: finalParsed.data,
        evidence,
        suggestedActions: config.suggestedActions?.(input, finalParsed.data) ?? config.followUps ?? [],
      }
    },
  })
}
