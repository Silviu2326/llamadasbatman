import * as z from 'zod/v4'
import type { McpServer } from '@modelcontextprotocol/server'
import { CallsRobinClient } from './callsrobin-client.js'

const id = z.string().trim().min(1).max(128)
const confirm = z.literal(true).describe('Debe ser true después de una confirmación explícita del usuario')
const phone = z.string().trim().regex(/^[0-9+()\-.\s]{3,40}$/).max(40)
const dateTime = z.string().trim().min(1).refine(value => !Number.isNaN(Date.parse(value)), 'Fecha inválida')

export function json(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: { data: value },
  }
}

type Args = Record<string, any>

export function registerWriteTool(
  server: McpServer,
  api: CallsRobinClient,
  definition: {
    name: string
    title: string
    description: string
    inputSchema: any
    destructiveHint?: boolean
    execute: (args: Args) => Promise<unknown>
  },
) {
  server.registerTool(definition.name, {
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: definition.destructiveHint ?? false,
      openWorldHint: true,
    },
  }, async (args: Args) => json(await definition.execute(args)))
}

const createLeadSchema = z.object({
  confirm,
  name: z.string().trim().min(1).max(160),
  phone: phone.optional(),
  email: z.string().trim().email().max(254).optional(),
  company: z.string().trim().max(160).optional(),
  campaignId: id.optional(),
  source: z.string().trim().max(80).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted']).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  accountId: id.optional(),
})

const updateLeadSchema = z.object({
  confirm,
  leadId: id,
  name: z.string().trim().min(1).max(160).optional(),
  phone: phone.optional(),
  email: z.string().trim().email().max(254).optional(),
  company: z.string().trim().max(160).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted']).optional(),
  source: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  campaignId: id.optional().nullable(),
  accountId: id.optional().nullable(),
}).refine(value => Object.keys(value).some(key => key !== 'confirm' && value[key as keyof typeof value] !== undefined), 'Incluye al menos un campo para actualizar')

const noteSchema = z.object({ confirm, text: z.string().trim().min(1).max(4_000) })

const createTaskSchema = z.object({
  confirm,
  type: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  ownerId: id.optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  dueAt: dateTime.optional(),
  reminderAt: dateTime.optional(),
  leadId: id.optional(),
  opportunityId: id.optional(),
  meetingId: id.optional(),
  conversationId: id.optional(),
  source: z.string().trim().min(1).max(100).optional(),
  sourceId: z.string().trim().min(1).max(200).optional(),
})

const createMeetingSchema = z.object({
  confirm,
  leadId: id,
  callId: id.optional(),
  assignedTo: id.optional(),
  title: z.string().trim().min(1).max(200),
  scheduledAt: dateTime,
  durationMinutes: z.number().int().positive().max(480).optional(),
  notes: z.string().trim().max(5_000).optional(),
  meetingUrl: z.string().trim().url().max(2_048).optional(),
})

const rescheduleMeetingSchema = z.object({
  confirm,
  scheduledAt: dateTime,
  reason: z.string().trim().min(1).max(2_000).optional(),
})

const moveOpportunitySchema = z.object({
  confirm,
  toStage: z.enum(['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']),
  reason: z.string().trim().max(500).optional(),
  probability: z.number().int().min(0).max(100).optional(),
})

const campaignCreateSchema = z.object({
  confirm,
  name: z.string().trim().min(1).max(140),
  agentId: id.nullable().optional(),
  playbookId: id.nullable().optional(),
  objective: z.string().trim().max(2_000).nullable().optional(),
  startDate: dateTime.nullable().optional(),
  endDate: dateTime.nullable().optional(),
  landingSlug: z.string().trim().min(1).max(160).optional(),
  adAssets: z.record(z.string(), z.unknown()).optional(),
  budgetCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  goal: z.string().trim().max(240).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
})

const campaignUpdateSchema = z.object({
  confirm,
  campaignId: id,
  name: z.string().trim().min(1).max(140).optional(),
  agentId: id.nullable().optional(),
  playbookId: id.nullable().optional(),
  objective: z.string().trim().max(2_000).nullable().optional(),
  startDate: dateTime.nullable().optional(),
  endDate: dateTime.nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'done']).optional(),
  budgetCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  goal: z.string().trim().max(240).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
}).refine(value => Object.keys(value).some(key => key !== 'confirm' && key !== 'campaignId' && value[key as keyof typeof value] !== undefined), 'Incluye al menos un campo para actualizar')

const campaignAuditSchema = z.object({ confirm, force: z.boolean().optional() })

const leadAuditSchema = z.object({
  confirm,
  leadId: id,
  website: z.string().trim().url().max(2_048).optional(),
  sector: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
})

const outboundDraftSchema = z.object({
  confirm,
  leadId: id,
  tone: z.string().trim().min(3).max(80).optional(),
})

const outboundSendSchema = z.object({
  confirm,
  leadId: id,
  subject: z.string().trim().min(3).max(120).optional(),
  body: z.string().trim().min(20).max(6_000).optional(),
})

const socialPostSchema = z.object({
  confirm,
  text: z.string().trim().min(1).max(5_000),
  imageUrl: z.string().trim().url().max(2_048).optional(),
  platforms: z.array(z.string().trim().min(1).max(12)).min(1).max(12),
  campaignId: id,
  cta: z.string().trim().min(1).max(160).optional(),
  scheduledAt: z.string().trim().max(80).optional(),
})

const prospectSearchSchema = z.object({
  confirm,
  sector: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(160),
  country: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(20).optional(),
})

const prospectSchema = z.object({
  placeId: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(300),
  address: z.string().trim().max(500).nullable().optional(),
  phone: phone.nullable().optional(),
  website: z.string().trim().url().max(2_048).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  userRatingCount: z.number().int().min(0).nullable().optional(),
  mapsUri: z.string().trim().url().max(2_048).nullable().optional(),
  photosCount: z.number().int().min(0).nullable().optional(),
  quickScore: z.number().int().min(0).max(100),
})

const prospectImportSchema = z.object({
  confirm,
  campaignId: id,
  sector: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
  state: z.string().trim().max(40).optional(),
  enrich: z.boolean().optional(),
  autoAudit: z.boolean().optional(),
  autoCall: z.boolean().optional(),
  autoEmail: z.boolean().optional(),
  sequenceId: id.optional(),
  items: z.array(prospectSchema).min(1).max(20),
})

export function registerWriteTools(server: McpServer, api: CallsRobinClient) {
  registerWriteTool(server, api, {
    name: 'crear_campana',
    title: 'Crear campaña',
    description: 'Crea una campaña outbound en el CRM. Requiere confirm=true; no inicia llamadas automáticamente.',
    inputSchema: campaignCreateSchema,
    execute: async ({ confirm: _confirm, ...body }) => api.post('/api/campaigns', body),
  })

  registerWriteTool(server, api, {
    name: 'actualizar_campana',
    title: 'Actualizar campaña',
    description: 'Actualiza objetivo, fechas, presupuesto, estado o configuración de una campaña. Requiere confirm=true.',
    inputSchema: campaignUpdateSchema,
    destructiveHint: true,
    execute: async ({ confirm: _confirm, campaignId, ...body }) => api.put(`/api/campaigns/${encodeURIComponent(campaignId)}`, body),
  })

  registerWriteTool(server, api, {
    name: 'iniciar_campana',
    title: 'Iniciar campaña',
    description: 'Activa una campaña y encola llamadas para sus leads nuevos con teléfono. Es una acción de contacto y requiere confirm=true.',
    inputSchema: z.object({ confirm, campaignId: id }),
    destructiveHint: true,
    execute: async ({ confirm: _confirm, campaignId }) => api.post(`/api/campaigns/${encodeURIComponent(campaignId)}/start`, {}),
  })

  registerWriteTool(server, api, {
    name: 'pausar_campana',
    title: 'Pausar campaña',
    description: 'Pausa una campaña outbound. Requiere confirm=true.',
    inputSchema: z.object({ confirm, campaignId: id }),
    destructiveHint: true,
    execute: async ({ confirm: _confirm, campaignId }) => api.post(`/api/campaigns/${encodeURIComponent(campaignId)}/pause`, {}),
  })

  registerWriteTool(server, api, {
    name: 'auditar_campana',
    title: 'Auditar campaña',
    description: 'Audita en lote los leads de una campaña y puede forzar una nueva auditoría. Consume recursos de auditoría y requiere confirm=true.',
    inputSchema: z.object({ campaignId: id }).merge(campaignAuditSchema),
    execute: async ({ confirm: _confirm, campaignId, force }) => api.post(`/api/campaigns/${encodeURIComponent(campaignId)}/audit-bulk`, { force }),
  })

  registerWriteTool(server, api, {
    name: 'auditar_lead',
    title: 'Auditar lead',
    description: 'Ejecuta una auditoría digital de un lead. Puede consumir recursos externos o de IA y requiere confirm=true.',
    inputSchema: leadAuditSchema,
    execute: async ({ confirm: _confirm, leadId, ...body }) => api.post(`/api/leads/${encodeURIComponent(leadId)}/audit`, body),
  })

  registerWriteTool(server, api, {
    name: 'llamar_lead_ahora',
    title: 'Llamar lead ahora',
    description: 'Encola una llamada inmediata para un lead con teléfono y campaña. Genera contacto externo y requiere confirm=true.',
    inputSchema: z.object({ confirm, leadId: id }),
    destructiveHint: true,
    execute: async ({ confirm: _confirm, leadId }) => api.post(`/api/leads/${encodeURIComponent(leadId)}/call-now`, {}),
  })

  registerWriteTool(server, api, {
    name: 'redactar_email_lead',
    title: 'Redactar email para lead',
    description: 'Genera un borrador de email personalizado sin enviarlo. Consume IA y requiere confirm=true.',
    inputSchema: outboundDraftSchema,
    execute: async ({ confirm: _confirm, leadId, ...body }) => api.post(`/api/leads/${encodeURIComponent(leadId)}/outbound-email/draft`, body),
  })

  registerWriteTool(server, api, {
    name: 'enviar_email_lead',
    title: 'Enviar email a lead',
    description: 'Envía un email outbound después de que el backend compruebe consentimiento, cumplimiento y permisos. Requiere confirm=true.',
    inputSchema: outboundSendSchema,
    destructiveHint: true,
    execute: async ({ confirm: _confirm, leadId, ...body }) => api.post(`/api/leads/${encodeURIComponent(leadId)}/outbound-email/send`, body),
  })

  registerWriteTool(server, api, {
    name: 'crear_publicacion_social',
    title: 'Crear publicación social',
    description: 'Crea un borrador o publicación programada en Metricool vinculada a una campaña. No publica inmediatamente si no se indica scheduledAt; requiere confirm=true.',
    inputSchema: socialPostSchema,
    execute: async ({ confirm: _confirm, ...body }) => api.post('/api/metricool/posts', body),
  })

  registerWriteTool(server, api, {
    name: 'buscar_leads_automaticamente',
    title: 'Buscar leads automáticamente',
    description: 'Busca negocios potenciales por sector y ciudad usando el Prospect Finder de LlamadasRobin. Devuelve hasta 20 resultados ordenados por quickScore, con teléfono, web, valoración y enlace de Maps. La consulta puede consumir créditos del proveedor, por eso requiere confirm=true.',
    inputSchema: prospectSearchSchema,
    execute: async ({ confirm: _confirm, ...body }) => api.post('/api/prospects/search', body),
  })

  registerWriteTool(server, api, {
    name: 'importar_leads_prospectados',
    title: 'Importar leads prospectados',
    description: 'Importa resultados del Prospect Finder como leads en una campaña. Evita duplicados por placeId o teléfono. Puede enriquecer webs, auditar, matricular en una secuencia y activar email o llamada; esas opciones tienen coste y requieren confirm=true.',
    inputSchema: prospectImportSchema,
    destructiveHint: true,
    execute: async ({ confirm: _confirm, ...body }) => api.post('/api/prospects/import', body),
  })

  registerWriteTool(server, api, {
    name: 'crear_lead',
    title: 'Crear lead',
    description: 'Crea un lead en LlamadasRobin. Requiere confirm=true tras una confirmación explícita del usuario.',
    inputSchema: createLeadSchema,
    execute: async ({ confirm: _confirm, ...body }) => api.post('/api/leads', body),
  })

  registerWriteTool(server, api, {
    name: 'actualizar_lead',
    title: 'Actualizar lead',
    description: 'Actualiza campos de un lead. Requiere confirm=true tras una confirmación explícita del usuario.',
    inputSchema: updateLeadSchema,
    destructiveHint: true,
    execute: async ({ confirm: _confirm, leadId, ...body }) => api.put(`/api/leads/${encodeURIComponent(leadId)}`, body),
  })

  registerWriteTool(server, api, {
    name: 'anadir_nota_lead',
    title: 'Añadir nota al lead',
    description: 'Añade una nota a un lead. Requiere confirm=true tras una confirmación explícita del usuario.',
    inputSchema: noteSchema.extend({ leadId: id }),
    execute: async ({ confirm: _confirm, leadId, text }) => api.post(`/api/leads/${encodeURIComponent(leadId)}/notes`, { text }),
  })

  registerWriteTool(server, api, {
    name: 'anadir_nota_llamada',
    title: 'Añadir nota a llamada',
    description: 'Añade una nota a una llamada. Requiere confirm=true tras una confirmación explícita del usuario.',
    inputSchema: noteSchema.extend({ callId: id }),
    execute: async ({ confirm: _confirm, callId, text }) => api.post(`/api/calls/${encodeURIComponent(callId)}/notes`, { text }),
  })

  registerWriteTool(server, api, {
    name: 'crear_tarea',
    title: 'Crear tarea',
    description: 'Crea una tarea comercial. Requiere confirm=true tras una confirmación explícita del usuario.',
    inputSchema: createTaskSchema,
    execute: async ({ confirm: _confirm, ...body }) => api.post('/api/tasks', body),
  })

  registerWriteTool(server, api, {
    name: 'crear_reunion',
    title: 'Crear reunión',
    description: 'Crea una reunión para un lead. Requiere confirm=true tras una confirmación explícita del usuario.',
    inputSchema: createMeetingSchema,
    execute: async ({ confirm: _confirm, ...body }) => api.post('/api/meetings', body),
  })

  registerWriteTool(server, api, {
    name: 'reprogramar_reunion',
    title: 'Reprogramar reunión',
    description: 'Cambia la fecha de una reunión. Requiere confirm=true tras una confirmación explícita del usuario.',
    inputSchema: rescheduleMeetingSchema.extend({ meetingId: id }),
    destructiveHint: true,
    execute: async ({ confirm: _confirm, meetingId, ...body }) => api.post(`/api/meetings/${encodeURIComponent(meetingId)}/reschedule`, body),
  })

  registerWriteTool(server, api, {
    name: 'mover_oportunidad_etapa',
    title: 'Mover oportunidad de etapa',
    description: 'Mueve una oportunidad a otra etapa del pipeline. Requiere confirm=true tras una confirmación explícita del usuario.',
    inputSchema: moveOpportunitySchema.extend({ opportunityId: id }),
    destructiveHint: true,
    execute: async ({ confirm: _confirm, opportunityId, ...body }) => api.post(`/api/pipeline/${encodeURIComponent(opportunityId)}/move-stage`, body),
  })
}
