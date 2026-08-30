import * as z from 'zod/v4'
import type { McpServer } from '@modelcontextprotocol/server'
import { CallsRobinClient } from './callsrobin-client.js'
import { json, registerWriteTool } from './write-tools.js'

const id = z.string().trim().min(1).max(128)
const pageSize = z.number().int().min(1).max(100).default(50)
const confirm = z.literal(true).describe('Debe ser true después de una confirmación explícita del usuario')

type Args = Record<string, any>
type RecordValue = Record<string, any>

function extractRows(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (!isRecord(value)) return []
  for (const key of ['data', 'items', 'leads', 'results']) {
    if (Array.isArray(value[key])) return value[key].filter(isRecord)
  }
  return []
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function apiError(error: unknown) {
  if (isRecord(error) && typeof error.message === 'string') return { error: error.message, code: error.code }
  return { error: 'No se pudo obtener esta sección' }
}

async function safeGet(api: CallsRobinClient, path: string, query?: Record<string, string | number | undefined>) {
  try {
    return { ok: true, data: await api.get(path, query) }
  } catch (error) {
    return { ok: false, ...apiError(error) }
  }
}

async function safePost(api: CallsRobinClient, path: string, body: unknown) {
  try {
    return { ok: true, data: await api.post(path, body) }
  } catch (error) {
    return { ok: false, ...apiError(error) }
  }
}

const leadResearchSchema = z.object({
  leadId: id,
  includeAudit: z.boolean().default(true),
  includeEmailHistory: z.boolean().default(true),
})

const leadPrioritySchema = z.object({
  campaignId: id.optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().min(1).max(100).optional(),
  limit: pageSize,
})

const audienceDefinitionSchema = z.object({
  status: z.array(z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted'])).max(10).optional(),
  source: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  subscribedPurpose: z.string().trim().min(1).max(60).regex(/^[a-z0-9_-]+$/).optional(),
}).strict()

const campaignSimulationSchema = z.object({
  campaignId: id.optional(),
  marketingCampaignId: id.optional(),
  audienceDefinition: audienceDefinitionSchema.optional(),
  projectedContactRate: z.number().min(0).max(1).default(0.35),
  projectedMeetingRate: z.number().min(0).max(1).default(0.1),
  estimatedCostPerContactCents: z.number().int().min(0).max(100_000).default(0),
}).refine(value => value.campaignId || value.marketingCampaignId, 'Indica campaignId o marketingCampaignId')

const contentGenerationSchema = z.object({
  confirm,
  prompt: z.string().trim().min(3).max(4_000),
  channels: z.array(z.string().trim().min(1).max(48)).min(1).max(12),
  tone: z.string().trim().max(80).optional(),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional(),
})

const planCampaignSchema = z.object({
  name: z.string().trim().min(1).max(140),
  objective: z.string().trim().max(2_000).optional(),
  goal: z.string().trim().max(240).optional(),
  budgetCents: z.number().int().min(0).max(100_000_000).optional(),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/, 'Fecha inválida').optional(),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/, 'Fecha inválida').optional(),
})

const commercialPlanSchema = z.object({
  confirm,
  sector: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(160),
  country: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(20).default(20),
  campaignId: id.optional(),
  createCampaign: planCampaignSchema.optional(),
  importLeads: z.boolean().default(false),
  enrich: z.boolean().default(false),
  autoAudit: z.boolean().default(false),
  autoCall: z.boolean().default(false),
  autoEmail: z.boolean().default(false),
  sequenceId: id.optional(),
  generateContent: z.boolean().default(false),
  contentChannels: z.array(z.string().trim().min(1).max(48)).min(1).max(12).default(['linkedin', 'email']),
  tone: z.string().trim().max(80).optional(),
}).refine(value => !value.importLeads || value.campaignId || value.createCampaign, {
  message: 'Para importar leads necesitas campaignId o createCampaign',
  path: ['campaignId'],
}).refine(value => !value.sequenceId || value.importLeads, {
  message: 'sequenceId requiere importLeads=true',
  path: ['sequenceId'],
}).refine(value => !(value.campaignId && value.createCampaign), {
  message: 'Usa campaignId o createCampaign, no ambos',
  path: ['campaignId'],
})

function scoreLead(lead: RecordValue) {
  const reasons: string[] = []
  const statusScore: Record<string, number> = {
    new: 60,
    contacted: 50,
    qualified: 90,
    converted: 25,
    unqualified: 5,
  }
  let score = statusScore[String(lead.status)] ?? 40
  if (lead.status === 'qualified') reasons.push('Está cualificado')
  if (lead.status === 'new') reasons.push('Todavía no ha sido contactado')
  if (lead.phone) { score += 10; reasons.push('Tiene teléfono') }
  if (lead.email) { score += 10; reasons.push('Tiene email') }
  if (lead.company) { score += 5; reasons.push('Tiene empresa asociada') }
  if (lead.firstResponseOverdue) { score += 15; reasons.push('Supera el SLA de primera respuesta') }
  return { ...lead, priorityScore: Math.min(100, score), priorityReasons: reasons }
}

export function registerIntelligentReadTools(server: McpServer, api: CallsRobinClient) {
  server.registerTool('investigar_empresa_360', {
    title: 'Investigar empresa 360',
    description: 'Construye un dossier de un lead combinando ficha, timeline, actividades, notas, auditoría, preferencias e historial de email. Es solo lectura y devuelve los fallos por sección sin perder el resto del informe.',
    inputSchema: leadResearchSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ leadId, includeAudit, includeEmailHistory }) => {
    const requests: Record<string, Promise<unknown>> = {
      lead: safeGet(api, `/api/leads/${encodeURIComponent(leadId)}`),
      timeline: safeGet(api, `/api/leads/${encodeURIComponent(leadId)}/timeline`),
      activities: safeGet(api, `/api/leads/${encodeURIComponent(leadId)}/activities`, { limit: 100 }),
      notes: safeGet(api, `/api/leads/${encodeURIComponent(leadId)}/notes`),
      preferences: safeGet(api, `/api/leads/${encodeURIComponent(leadId)}/preferences`),
    }
    if (includeAudit) requests.audit = safeGet(api, `/api/leads/${encodeURIComponent(leadId)}/audit`)
    if (includeEmailHistory) requests.emailHistory = safeGet(api, `/api/leads/${encodeURIComponent(leadId)}/email-history`)
    const entries = await Promise.all(Object.entries(requests).map(async ([key, request]) => [key, await request] as const))
    return json({ leadId, generatedAt: new Date().toISOString(), dossier: Object.fromEntries(entries) })
  })

  server.registerTool('calcular_prioridad_leads', {
    title: 'Calcular prioridad de leads',
    description: 'Ordena leads por prioridad comercial con una puntuación explicable basada en estado, teléfono, email, empresa y SLA de primera respuesta. No modifica ningún lead.',
    inputSchema: leadPrioritySchema,
    annotations: { readOnlyHint: true },
  }, async ({ campaignId, status, search, source, limit }) => {
    const response = await api.get('/api/leads', { campaignId, status, search, source, limit, sort: 'updatedAt:desc' })
    const leads = extractRows(response).map(scoreLead).sort((a, b) => b.priorityScore - a.priorityScore)
    return json({ data: leads, totalReturned: leads.length, scoring: 'Estado + disponibilidad de contacto + SLA de primera respuesta' })
  })

  server.registerTool('simular_campana', {
    title: 'Simular campaña',
    description: 'Calcula el tamaño de audiencia, contactos, reuniones y coste estimado antes de lanzar una campaña. No publica ni modifica la campaña.',
    inputSchema: campaignSimulationSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ campaignId, marketingCampaignId, audienceDefinition, projectedContactRate, projectedMeetingRate, estimatedCostPerContactCents }) => {
    const [campaign, stats, audience] = await Promise.all([
      campaignId ? safeGet(api, `/api/campaigns/${encodeURIComponent(campaignId)}`) : Promise.resolve(null),
      campaignId ? safeGet(api, `/api/campaigns/${encodeURIComponent(campaignId)}/stats`) : Promise.resolve(null),
      marketingCampaignId && audienceDefinition
        ? safePost(api, `/api/marketing-campaigns/${encodeURIComponent(marketingCampaignId)}/audience-preview`, { audienceDefinition })
        : Promise.resolve(null),
    ])
    let audienceSize = 0
    if (audience?.ok) audienceSize = extractRows(audience.data).length || Number((audience.data as RecordValue)?.count ?? 0)
    if (!audienceSize && stats?.ok) audienceSize = Number((stats.data as RecordValue)?.totalLeads ?? 0)
    if (!audienceSize && campaign?.ok) audienceSize = Number((campaign.data as RecordValue)?.totalLeads ?? 0)
    const estimatedContacts = Math.round(audienceSize * projectedContactRate)
    const estimatedMeetings = Math.round(estimatedContacts * projectedMeetingRate)
    return json({
      campaignId: campaignId ?? marketingCampaignId,
      audienceSize,
      estimatedContacts,
      estimatedMeetings,
      estimatedCostCents: estimatedContacts * estimatedCostPerContactCents,
      assumptions: { projectedContactRate, projectedMeetingRate, estimatedCostPerContactCents },
      source: audience?.ok ? 'audience-preview' : stats?.ok ? 'campaign-stats' : 'campaign-detail',
    })
  })
}

export function registerIntelligentWriteTools(server: McpServer, api: CallsRobinClient) {
  registerWriteTool(server, api, {
    name: 'generar_contenido_multicanal',
    title: 'Generar contenido multicanal',
    description: 'Genera un plan de contenido para varios canales usando IA. Devuelve propuestas de publicaciones y mensajes; no publica nada. Requiere confirm=true porque consume recursos de IA.',
    inputSchema: contentGenerationSchema,
    execute: async ({ confirm: _confirm, ...body }) => api.post('/api/metricool/ai/generate', body),
  })

  registerWriteTool(server, api, {
    name: 'ejecutar_plan_comercial',
    title: 'Ejecutar plan comercial',
    description: 'Busca y prioriza prospectos, puede crear una campaña, importar los leads y generar contenido. Por defecto solo busca y prepara el plan; crear campaña, importar, enriquecer, enviar o llamar requiere activar cada opción y confirm=true.',
    inputSchema: commercialPlanSchema,
    destructiveHint: true,
    execute: async ({ confirm: _confirm, ...args }) => {
      const prospectsResponse = await api.post<{ data?: RecordValue[] }>('/api/prospects/search', {
        sector: args.sector,
        city: args.city,
        country: args.country,
        limit: args.limit,
      })
      const prospects = extractRows(prospectsResponse).sort((a, b) => Number(b.quickScore ?? 0) - Number(a.quickScore ?? 0))

      let campaign = null
      let campaignId = args.campaignId
      if (args.createCampaign) {
        campaign = await api.post('/api/campaigns', {
          name: args.createCampaign.name,
          objective: args.createCampaign.objective,
          goal: args.createCampaign.goal,
          budgetCents: args.createCampaign.budgetCents,
          startDate: args.createCampaign.startDate,
          endDate: args.createCampaign.endDate,
        })
        campaignId = isRecord(campaign) && typeof campaign.id === 'string' ? campaign.id : campaignId
      }

      let imported = null
      if (args.importLeads) {
        imported = await api.post('/api/prospects/import', {
          campaignId,
          sector: args.sector,
          city: args.city,
          enrich: args.enrich,
          autoAudit: args.autoAudit,
          autoCall: args.autoCall,
          autoEmail: args.autoEmail,
          sequenceId: args.sequenceId,
          items: prospects,
        })
      }

      let contentPlan = null
      if (args.generateContent) {
        contentPlan = await api.post('/api/metricool/ai/generate', {
          prompt: `Crea contenido comercial para captar ${args.sector} en ${args.city}. Objetivo: conseguir reuniones cualificadas.`,
          channels: args.contentChannels,
          tone: args.tone,
        })
      }

      return {
        objective: `Captar ${args.sector} en ${args.city}`,
        campaign,
        campaignId,
        prospectsFound: prospects.length,
        prospects: prospects.map((prospect, index) => ({ rank: index + 1, ...prospect })),
        imported,
        contentPlan,
        nextSteps: [
          !args.importLeads ? 'Revisar los prospectos y activar importLeads cuando estén aprobados' : null,
          !args.generateContent ? 'Generar contenido multicanal para iniciar la cadencia' : null,
          'Revisar consentimiento y permisos antes de contactar',
        ].filter(Boolean),
      }
    },
  })
}
