// Microapp #68 — Asistente de elección de modelo (07-MICROAPPS.md §4,
// catálogo §6.E).
//
// Sin LLM a propósito: la recomendación sale del registro real de proveedores
// (bindingsFor), con el mismo criterio explicable que usa el router — el tier
// pedido manda y, a igualdad, gana el coste — y con el coste estimado por el
// estimador de cada binding sobre un input de ejemplo por capability. Lo que
// el registro no sabe, la respuesta lo dice; no se inventa.
import { z } from 'zod'
import { bindingsFor } from '../../providers/registry'
import { registerMicroapp } from '../registry'
import type { EvidenceItem, MicroappCtx, MicroappResult } from '../types'

/**
 * Las capabilities del catálogo inicial (providers/capabilities.ts). Lista
 * estática a propósito: el uiSchema necesita opciones en tiempo de módulo y el
 * catálogo de contratos cambia por PR, igual que esta lista.
 */
const TASKS = [
  { value: 'llm.generate', label: 'Generar o analizar texto (LLM)' },
  { value: 'image.generate', label: 'Generar imágenes' },
  { value: 'image.upscale', label: 'Mejorar o ampliar imágenes' },
  { value: 'audio.tts', label: 'Locutar texto (voz sintética)' },
  { value: 'video.generate', label: 'Generar vídeo' },
  { value: 'web.search', label: 'Buscar en la web' },
] as const

const TASK_VALUES = ['llm.generate', 'image.generate', 'image.upscale', 'audio.tts', 'video.generate', 'web.search'] as const

const inputSchema = z.object({
  task: z.enum(TASK_VALUES),
  quality: z.enum(['draft', 'standard', 'premium']).default('standard'),
  maxEstimatedCostCents: z.coerce.number().nonnegative().max(1_000_000).optional(),
  requireByok: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
})

const optionSchema = z.object({
  providerId: z.string(),
  displayName: z.string(),
  tier: z.enum(['draft', 'standard', 'premium']),
  models: z.array(z.string()),
  estimatedCents: z.number().nullable(),
  estimateNote: z.string().nullable(),
  limits: z.object({
    rpm: z.number().nullable(),
    concurrent: z.number().nullable(),
    maxDurationS: z.number().nullable(),
  }),
  authModes: z.array(z.enum(['managed', 'byok'])),
  commercialUseAllowed: z.boolean(),
  docsUrl: z.string(),
})

const outputSchema = z.object({
  task: z.enum(TASK_VALUES),
  quality: z.enum(['draft', 'standard', 'premium']),
  notes: z.string().nullable(),
  selectionConstraints: z.object({ maxEstimatedCostCents: z.number().nullable(), requireByok: z.boolean() }),
  recommendation: optionSchema.nullable(),
  // Por qué gana el recomendado, en frases que la UI muestra tal cual.
  reasons: z.array(z.string()),
  alternatives: z.array(optionSchema.extend({ reason: z.string() })),
  // Transparencia: con qué input de ejemplo se estimó cada coste.
  sampleInput: z.record(z.unknown()),
  note: z.string().nullable(),
})

/**
 * Input de ejemplo por capability para pedir coste a cada estimador. Debe
 * cumplir el contrato de providers/capabilities.ts; los tamaños representan un
 * uso típico, no el mínimo, para que la cifra sea comparable y honesta.
 */
function sampleInputFor(task: (typeof TASK_VALUES)[number], quality: 'draft' | 'standard' | 'premium'): Record<string, unknown> {
  const finish = quality === 'premium' ? 'final' : 'draft'
  switch (task) {
    case 'llm.generate':
      return {
        prompt: 'Redacta un resumen comercial de unas 400 palabras a partir de este material de ejemplo. '.repeat(24),
        maxTokens: 900,
      }
    case 'image.generate':
      return { prompt: 'Imagen de producto sobre fondo neutro para un post de Instagram', aspectRatio: '1:1', quality: finish, count: 1 }
    case 'image.upscale':
      return { assetId: 'asset-de-ejemplo', mode: 'faithful', scale: 2 }
    case 'audio.tts':
      return { text: 'Locución de ejemplo para estimar el coste por carácter del proveedor de voz. '.repeat(8), format: 'mp3' }
    case 'video.generate':
      return { prompt: 'Plano de producto de 5 segundos para un anuncio vertical', durationS: 5, aspectRatio: '9:16', quality: finish }
    case 'web.search':
      return { query: 'ejemplo de búsqueda para estimar coste', count: 10 }
  }
}

const TIER_RANK = { draft: 0, standard: 1, premium: 2 } as const

async function run(_ctx: MicroappCtx, rawInput: unknown): Promise<MicroappResult> {
  const input = inputSchema.parse(rawInput)
  const sampleInput = sampleInputFor(input.task, input.quality)
  const fetchedAt = new Date().toISOString()

  const options: Array<z.infer<typeof optionSchema>> = []
  for (const { provider, binding } of bindingsFor(input.task)) {
    // Una recomendación tiene que ser ejecutable y apta para el uso de la
    // plataforma, no solo existir documentalmente en el registro.
    if (binding.routable === false || !provider.commercialUseAllowed) continue
    let estimatedCents: number | null = null
    let estimateNote: string | null = null
    try {
      const estimate = await binding.estimateCost(sampleInput)
      if (!Number.isFinite(estimate.cents) || estimate.cents < 0) throw new Error('Estimación no finita o negativa')
      estimatedCents = estimate.cents
      estimateNote = estimate.confidence === 'exact' ? 'Tarifa exacta del registro' : 'Estimación del proveedor sobre el input de ejemplo'
    } catch {
      estimateNote = 'El estimador del proveedor no pudo calcular el coste para el input de ejemplo'
    }
    options.push({
      providerId: provider.id,
      displayName: provider.displayName,
      tier: binding.qualityTier,
      models: binding.models ?? [],
      estimatedCents,
      estimateNote,
      limits: {
        rpm: binding.limits.rpm ?? null,
        concurrent: binding.limits.concurrent ?? null,
        maxDurationS: binding.limits.maxDurationS ?? null,
      },
      authModes: provider.auth.modes,
      commercialUseAllowed: provider.commercialUseAllowed,
      docsUrl: provider.docsUrl,
    })
  }

  const base = { task: input.task, quality: input.quality, notes: input.notes ?? null, selectionConstraints: { maxEstimatedCostCents: input.maxEstimatedCostCents ?? null, requireByok: input.requireByok }, sampleInput }

  if (!options.length) {
    return {
      data: {
        ...base,
        recommendation: null,
        reasons: [],
        alternatives: [],
        note: `Ningún proveedor del registro ofrece ${input.task} todavía. Conecta uno en el Centro de conexiones o espera a que entre por PR al catálogo.`,
      },
      evidence: [
        {
          claim: `El registro de proveedores no tiene ningún binding para ${input.task}`,
          sourceRef: { kind: 'provider-registry', id: input.task },
          confidence: 'high',
          fetchedAt,
        },
      ],
      suggestedActions: [{
        kind: 'open_provider_connections',
        label: 'Conectar un proveedor para esta capacidad',
        params: { capability: input.task },
      }],
    }
  }

  // Mismo criterio explicable que el router (providers/router.ts): distancia
  // al tier pedido primero; a igualdad, el coste estimado más bajo. Sin coste
  // estimable se compite en último lugar dentro de su tier.
  const sorted = [...options].sort((a, b) => {
    const tierDiff = Math.abs(TIER_RANK[a.tier] - TIER_RANK[input.quality]) - Math.abs(TIER_RANK[b.tier] - TIER_RANK[input.quality])
    if (tierDiff !== 0) return tierDiff
    return (a.estimatedCents ?? Number.POSITIVE_INFINITY) - (b.estimatedCents ?? Number.POSITIVE_INFINITY)
  })
  const eligible = sorted.filter(option => (!input.requireByok || option.authModes.includes('byok')) && (input.maxEstimatedCostCents == null || (option.estimatedCents != null && option.estimatedCents <= input.maxEstimatedCostCents)))
  if (!eligible.length) {
    return {
      data: {
        ...base,
        recommendation: null,
        reasons: [],
        alternatives: sorted.map(option => ({ ...option, reason: input.requireByok && !option.authModes.includes('byok') ? 'No admite BYOK, requisito obligatorio' : option.estimatedCents == null ? 'Coste no estimable bajo el límite pedido' : `Supera el máximo de ${input.maxEstimatedCostCents} céntimos` })),
        note: 'Hay proveedores comerciales, pero ninguno cumple todos los límites obligatorios. No se recomienda relajar restricciones automáticamente.',
      },
      evidence: options.map(option => ({ claim: `${option.displayName}: tier ${option.tier}, coste ${option.estimatedCents ?? 'no estimable'} céntimos, auth ${option.authModes.join('/')}`, sourceRef: { kind: 'provider-registry', id: option.providerId }, confidence: 'high' as const, fetchedAt })),
      suggestedActions: [{ kind: 'review_model_constraints', label: 'Revisar presupuesto o requisito BYOK', params: { capability: input.task, maxEstimatedCostCents: input.maxEstimatedCostCents ?? null, requireByok: input.requireByok } }],
    }
  }

  const recommendation = eligible[0]
  const reasons = [
    recommendation.tier === input.quality
      ? `Su tier (${recommendation.tier}) coincide con la calidad pedida (${input.quality})`
      : `Su tier (${recommendation.tier}) es el más cercano a la calidad pedida (${input.quality}) entre los proveedores registrados`,
    recommendation.estimatedCents !== null
      ? `Coste estimado de ${recommendation.estimatedCents.toFixed(3)} céntimos para el input de ejemplo, el más bajo de su tier`
      : 'Su estimador no pudo calcular el coste para el input de ejemplo',
    recommendation.authModes.includes('byok')
      ? 'Admite cuenta propia (BYOK) además del modo gestionado'
      : 'Solo disponible en modo gestionado (clave de la plataforma)',
    ...(recommendation.commercialUseAllowed ? [] : ['Atención: sus condiciones no tienen verificado el uso comercial']),
  ]

  const alternatives = sorted.filter(option => option.providerId !== recommendation.providerId).map((option) => {
    // Una alternativa puede estar fuera de un requisito obligatorio. No debe
    // presentarse como una segunda opción ejecutable ni ocultar la exclusión
    // detrás de una comparación de tier/coste.
    const excludedReason = input.requireByok && !option.authModes.includes('byok')
      ? 'Excluido: no admite BYOK, requisito obligatorio'
      : input.maxEstimatedCostCents != null && option.estimatedCents == null
        ? 'Excluido: coste no estimable bajo el límite obligatorio'
        : input.maxEstimatedCostCents != null && option.estimatedCents != null && option.estimatedCents > input.maxEstimatedCostCents
          ? `Excluido: supera el máximo de ${input.maxEstimatedCostCents} céntimos`
          : null
    return {
      ...option,
      reason: excludedReason ?? (option.tier === recommendation.tier
        ? 'Mismo tier, coste estimado mayor'
        : `Tier ${option.tier}: más lejos de la calidad pedida (${input.quality})`),
    }
  })

  const evidence: EvidenceItem[] = options.map((option) => ({
    claim: `${option.displayName} ofrece ${input.task} en tier ${option.tier}${
      option.estimatedCents !== null ? ` por ~${option.estimatedCents.toFixed(3)} céntimos (input de ejemplo)` : ' (coste no estimable)'
    }`,
    sourceRef: { kind: 'provider-registry', id: option.providerId },
    confidence: 'high',
    fetchedAt,
  }))

  return {
    data: { ...base, recommendation, reasons, alternatives, note: null },
    evidence,
    suggestedActions: [{
      kind: 'open_provider_connections',
      label: 'Configurar el proveedor recomendado',
      params: { providerId: recommendation.providerId, capability: input.task },
    }],
  }
}

registerMicroapp({
  id: 'model-picker',
  version: '1.3.0',
  name: 'Asistente de elección de modelo',
  promise: 'Qué proveedor usar para tu tarea y por qué, con coste estimado',
  category: 'data',

  inputSchema,
  outputSchema,
  uiSchema: [
    {
      key: 'task',
      label: 'Tarea',
      widget: 'select',
      help: 'La capability que quieres ejecutar; se consulta el registro vigente de proveedores.',
      options: TASKS.map((task) => ({ value: task.value, label: task.label })),
    },
    {
      key: 'quality',
      label: 'Calidad',
      widget: 'select',
      help: 'draft prioriza barato; premium prioriza calidad. Mismo criterio que usa el router.',
      options: [
        { value: 'draft', label: 'Borrador (barato y rápido)' },
        { value: 'standard', label: 'Estándar' },
        { value: 'premium', label: 'Premium (máxima calidad)' },
      ],
    },
    { key: 'maxEstimatedCostCents', label: 'Coste máximo estimado (céntimos)', widget: 'number', help: 'Descarta proveedores cuyo coste típico sea superior o no se pueda estimar.' },
    { key: 'requireByok', label: 'Exigir cuenta propia (BYOK)', widget: 'toggle', help: 'Si se activa, solo recomienda proveedores que admiten credenciales de la organización.' },
    {
      key: 'notes',
      label: 'Contexto (opcional)',
      widget: 'textarea',
      help: 'Región, plazo, presupuesto… Se guarda con la recomendación para poder revisarla después.',
    },
  ],

  // Solo lectura del registro en memoria: ni proveedores ni datos del CRM.
  capabilities: [],
  dataAccess: [],
  effects: 'local',

  async estimateCost(rawInput) {
    inputSchema.parse(rawInput)
    // Leer el registro no consume proveedor alguno.
    return { cents: 0 }
  },
  freshnessDays: 7,

  followUps: [{ kind: 'open_provider_connections', label: 'Configurar el proveedor recomendado' }],

  run,
})
