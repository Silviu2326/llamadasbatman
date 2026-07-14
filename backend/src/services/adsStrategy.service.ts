import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

export interface AdsStrategyInput {
  vertical: string
  objetivo: string
  presupuestoMensual: number
  audience?: string
}

export interface AdsStrategyRecommendation {
  id: string
  title: string
  body: string
  impact: string
  action: 'audience' | 'objective' | 'creative'
}

export interface AdsStrategy {
  score: number
  scoreLabel: string
  audience: string
  audienceDetail: string
  confidence: number
  summary: string
  forecast: {
    leads: string
    cpl: string
    conversion: string
    reach: string
  }
  recommendations: AdsStrategyRecommendation[]
  provider: 'claude' | 'fallback'
  model: string
  generatedAt: string
}

const recommendationDefaults: AdsStrategyRecommendation[] = [
  {
    id: 'audience',
    title: 'Segmenta por intención alta',
    body: 'Enfoca la audiencia en señales de compra recientes para reducir el coste por lead.',
    impact: 'Impacto alto',
    action: 'audience',
  },
  {
    id: 'message',
    title: 'Habla de un resultado medible',
    body: 'El mensaje debe prometer una mejora concreta, no una lista de funcionalidades.',
    impact: 'Impacto alto',
    action: 'objective',
  },
  {
    id: 'creative',
    title: 'Prueba dos variaciones',
    body: 'Compara el ángulo de crecimiento con una creatividad orientada a ROI.',
    impact: 'Impacto medio',
    action: 'creative',
  },
]

const aiEnhancementSchema = z.object({
  audience: z.string().min(3).max(160),
  audienceDetail: z.string().min(10).max(280),
  summary: z.string().min(20).max(500),
  recommendations: z.array(z.object({
    id: z.string().min(1).max(40),
    title: z.string().min(3).max(90),
    body: z.string().min(10).max(280),
    impact: z.string().min(3).max(40),
    action: z.enum(['audience', 'objective', 'creative']),
  })).length(3),
})

let anthropicClient: Anthropic | null = null

function getAnthropicClient() {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) return null
  if (!anthropicClient) {
    const timeoutSeconds = Number(process.env.CLAUDE_TIMEOUT_SECONDS ?? 15)
    anthropicClient = new Anthropic({ apiKey, timeout: timeoutSeconds * 1000 })
  }
  return anthropicClient
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatReach(value: number) {
  return new Intl.NumberFormat('es-ES', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function getProfile(vertical: string) {
  const normalized = vertical.toLowerCase()
  if (normalized.includes('salud') || normalized.includes('clín')) {
    return {
      audience: 'Personas interesadas en tratamientos',
      detail: 'Señales de intención, ubicación y búsquedas relacionadas.',
      cpl: 34,
      conversion: '9–14%',
      reachFactor: 260,
      angle: 'confianza y resultado',
    }
  }
  if (normalized.includes('servicio') || normalized.includes('consult')) {
    return {
      audience: 'Responsables de operaciones',
      detail: 'Empresas en crecimiento que necesitan ganar eficiencia.',
      cpl: 48,
      conversion: '11–16%',
      reachFactor: 230,
      angle: 'eficiencia y control',
    }
  }
  return {
    audience: 'Gerentes y Directores de TI',
    detail: 'Empresas de 50–500 empleados con intención de modernización.',
    cpl: 72,
    conversion: '12–18%',
    reachFactor: 190,
    angle: 'crecimiento y automatización',
  }
}

export function buildFallbackStrategy(input: AdsStrategyInput): AdsStrategy {
  const profile = getProfile(input.vertical)
  const budget = Number(input.presupuestoMensual) || 0
  const completedFields = [input.vertical, input.objetivo, input.presupuestoMensual, input.audience].filter(Boolean).length
  const score = Math.min(96, Math.max(44, Math.round(
    38 + completedFields * 11 + Math.min(18, budget / 120) + (input.objetivo.length > 18 ? 7 : 0),
  )))
  const expectedLeads = Math.max(4, Math.round(budget / profile.cpl))
  const lowLeads = Math.max(3, Math.round(expectedLeads * 0.82))
  const highLeads = Math.max(lowLeads + 2, Math.round(expectedLeads * 1.22))
  const resolvedAudience = input.audience?.trim() || profile.audience
  const objective = input.objetivo.trim() || 'captar demanda cualificada'

  return {
    score,
    scoreLabel: score >= 80 ? 'Alta oportunidad' : score >= 65 ? 'Buena base' : 'Necesita más señales',
    audience: resolvedAudience,
    audienceDetail: profile.detail,
    confidence: Math.min(96, Math.max(72, 70 + completedFields * 6)),
    summary: `La mejor entrada es ${profile.angle}: ${objective.toLowerCase()} con una audiencia que ya reconoce el problema.`,
    forecast: {
      leads: `${lowLeads}–${highLeads}`,
      cpl: formatCurrency(profile.cpl),
      conversion: profile.conversion,
      reach: budget ? `${formatReach(budget * profile.reachFactor)}+` : '—',
    },
    recommendations: recommendationDefaults.map((recommendation, index) => ({
      ...recommendation,
      body: index === 0
        ? `Prioriza ${resolvedAudience.toLowerCase()} y excluye perfiles sin señales de compra para proteger el presupuesto.`
        : index === 1
          ? `Construye el mensaje alrededor de ${profile.angle} y conecta la promesa con un resultado verificable.`
          : 'Lanza una versión centrada en crecimiento y otra en ROI; deja que la primera señal decida el siguiente ajuste.',
    })),
    provider: 'fallback',
    model: 'deterministic-v2',
    generatedAt: new Date().toISOString(),
  }
}

function parseJsonObject(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('La respuesta IA no contiene JSON válido')
  return JSON.parse(text.slice(start, end + 1)) as unknown
}

async function enhanceWithClaude(input: AdsStrategyInput, fallback: AdsStrategy) {
  const client = getAnthropicClient()
  if (!client) return fallback

  const model = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'
  const prompt = `
Eres el estratega de adquisición de VozIA. Devuelve únicamente JSON válido, sin markdown.
Analiza este brief de Meta Ads:
- vertical: ${input.vertical}
- objetivo: ${input.objetivo}
- audiencia indicada: ${input.audience?.trim() || 'no indicada'}
- presupuesto mensual: ${input.presupuestoMensual} EUR

El pronóstico numérico ya fue calculado por el servidor. Mejora únicamente el criterio estratégico y devuelve exactamente:
{
  "audience": "segmento recomendado en español",
  "audienceDetail": "por qué ese segmento tiene intención",
  "summary": "resumen accionable de 1 o 2 frases",
  "recommendations": [
    {"id":"audience","title":"...","body":"...","impact":"Impacto alto","action":"audience"},
    {"id":"message","title":"...","body":"...","impact":"Impacto alto","action":"objective"},
    {"id":"creative","title":"...","body":"...","impact":"Impacto medio","action":"creative"}
  ]
}
No inventes integraciones, resultados garantizados ni datos personales.
`

  const response = await client.messages.create({
    model,
    max_tokens: 800,
    system: 'Responde en español y valida mentalmente que todos los campos estén presentes.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = response.content.find(block => block.type === 'text')?.text ?? ''
  const enhanced = aiEnhancementSchema.parse(parseJsonObject(text))

  return {
    ...fallback,
    ...enhanced,
    recommendations: enhanced.recommendations.map((recommendation, index) => ({
      ...fallback.recommendations[index],
      ...recommendation,
    })),
    provider: 'claude' as const,
    model,
    generatedAt: new Date().toISOString(),
  }
}

export async function generateStrategy(input: AdsStrategyInput) {
  const fallback = buildFallbackStrategy(input)
  try {
    return await enhanceWithClaude(input, fallback)
  } catch (error) {
    console.warn('[AdsStrategy] Claude no disponible; usando estrategia determinista:', (error as Error).message)
    return fallback
  }
}

function budgetToCents(value: unknown) {
  const budget = Number(value)
  if (!Number.isFinite(budget) || budget <= 0) return null
  return Math.round(budget * 100)
}

function centsToBudget(value: number | null) {
  return value == null ? '' : value / 100
}

export interface AdWizardDraftInput {
  vertical?: string
  objetivo?: string
  audience?: string | null
  presupuesto?: number | null
  strategy?: Record<string, unknown> | null
  creativeIndex?: number
}

export async function getDraft(orgId: string, userId: string) {
  const draft = await prisma.adWizardDraft.findUnique({
    where: { orgId_userId: { orgId, userId } },
  })
  if (!draft) return null

  return {
    id: draft.id,
    vertical: draft.vertical,
    objetivo: draft.objective,
    audience: draft.audience ?? '',
    presupuesto: centsToBudget(draft.monthlyBudgetCents),
    strategy: draft.strategy,
    creativeIndex: draft.creativeIndex,
    updatedAt: draft.updatedAt,
  }
}

export async function saveDraft(orgId: string, userId: string, input: AdWizardDraftInput) {
  const data = {
    vertical: input.vertical ?? '',
    objective: input.objetivo ?? '',
    audience: input.audience?.trim() || null,
    monthlyBudgetCents: budgetToCents(input.presupuesto),
    strategy: input.strategy === undefined
      ? undefined
      : input.strategy === null
        ? Prisma.JsonNull
        : input.strategy as Prisma.InputJsonValue,
    creativeIndex: input.creativeIndex ?? 0,
  }

  const draft = await prisma.adWizardDraft.upsert({
    where: { orgId_userId: { orgId, userId } },
    create: { orgId, userId, ...data },
    update: data,
  })

  return {
    id: draft.id,
    vertical: draft.vertical,
    objetivo: draft.objective,
    audience: draft.audience ?? '',
    presupuesto: centsToBudget(draft.monthlyBudgetCents),
    strategy: draft.strategy,
    creativeIndex: draft.creativeIndex,
    updatedAt: draft.updatedAt,
  }
}
