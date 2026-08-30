import * as z from 'zod/v4'
import type { McpServer } from '@modelcontextprotocol/server'
import { CallsRobinClient } from './callsrobin-client.js'

const page = z.number().int().min(1).max(100_000).optional()
const limit = z.number().int().min(1).max(100).default(25)
const id = z.string().trim().min(1).max(128)
const date = z.string().trim().min(1).max(64)
const opportunityStage = z.enum(['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'])
const opportunitySort = z.enum([
  'createdAt:asc', 'createdAt:desc',
  'updatedAt:asc', 'updatedAt:desc',
  'expectedCloseDate:asc', 'expectedCloseDate:desc',
  'value:asc', 'value:desc',
  'name:asc', 'name:desc',
])

function json(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: { data: value },
  }
}

export function registerReadOnlyTools(server: McpServer, api: CallsRobinClient) {
  server.registerTool('listar_leads', {
    title: 'Listar leads',
    description: 'Lista leads de la organización actual. Solo lectura.',
    inputSchema: z.object({
      campaignId: id.optional(),
      status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted']).optional(),
      search: z.string().trim().min(1).max(200).optional(),
      source: z.string().trim().min(1).max(100).optional(),
      page,
      limit,
    }),
  }, async ({ campaignId, status, search, source, page: pageNumber, limit: pageSize }) => json(await api.get('/api/leads', {
    campaignId, status, search, source, page: pageNumber, limit: pageSize,
  })))

  server.registerTool('obtener_lead', {
    title: 'Obtener lead',
    description: 'Obtiene el detalle de un lead por ID. Solo lectura.',
    inputSchema: z.object({ leadId: id }),
  }, async ({ leadId }) => json(await api.get(`/api/leads/${encodeURIComponent(leadId)}`)))

  server.registerTool('listar_llamadas', {
    title: 'Listar llamadas',
    description: 'Lista llamadas con filtros de agente, campaña, estado y fechas. Solo lectura.',
    inputSchema: z.object({
      agentId: id.optional(),
      campaignId: id.optional(),
      status: z.string().trim().min(1).max(60).optional(),
      outcome: z.string().trim().min(1).max(80).optional(),
      dateFrom: z.string().trim().min(1).max(40).optional(),
      dateTo: z.string().trim().min(1).max(40).optional(),
      page,
      limit,
    }),
  }, async ({ agentId, campaignId, status, outcome, dateFrom, dateTo, page: pageNumber, limit: pageSize }) => json(await api.get('/api/calls', {
    agentId, campaignId, status, outcome, dateFrom, dateTo, page: pageNumber, limit: pageSize,
  })))

  server.registerTool('obtener_llamada', {
    title: 'Obtener llamada',
    description: 'Obtiene el detalle de una llamada por ID. Solo lectura.',
    inputSchema: z.object({ callId: id }),
  }, async ({ callId }) => json(await api.get(`/api/calls/${encodeURIComponent(callId)}`)))

  server.registerTool('obtener_evaluacion_llamada', {
    title: 'Evaluar llamada',
    description: 'Obtiene la evaluación disponible de una llamada. Solo lectura.',
    inputSchema: z.object({ callId: id }),
  }, async ({ callId }) => json(await api.get(`/api/calls/${encodeURIComponent(callId)}/evaluation`)))

  server.registerTool('obtener_metricas_voz', {
    title: 'Obtener métricas de voz',
    description: 'Obtiene métricas agregadas de voz para un intervalo. Solo lectura.',
    inputSchema: z.object({
      from: z.string().trim().min(1).max(40).optional(),
      to: z.string().trim().min(1).max(40).optional(),
    }),
  }, async ({ from, to }) => json(await api.get('/api/calls/voice-metrics', { from, to })))

  server.registerTool('listar_agentes', {
    title: 'Listar agentes',
    description: 'Lista los agentes de voz de la organización actual. Solo lectura.',
    inputSchema: z.object({}),
  }, async () => json(await api.get('/api/agents')))

  server.registerTool('obtener_estadisticas_agente', {
    title: 'Estadísticas de agente',
    description: 'Obtiene estadísticas de un agente por ID. Solo lectura.',
    inputSchema: z.object({ agentId: id }),
  }, async ({ agentId }) => json(await api.get(`/api/agents/${encodeURIComponent(agentId)}/stats`)))

  server.registerTool('listar_campanas', {
    title: 'Listar campañas',
    description: 'Lista campañas de la organización actual. Solo lectura.',
    inputSchema: z.object({
      status: z.enum(['draft', 'active', 'paused', 'done']).optional(),
      search: z.string().trim().max(160).optional(),
      page,
      limit,
    }),
  }, async ({ status, search, page: pageNumber, limit: pageSize }) => json(await api.get('/api/campaigns', {
    status, search, page: pageNumber, limit: pageSize,
  })))

  server.registerTool('obtener_metricas_campana', {
    title: 'Métricas de campaña',
    description: 'Obtiene estadísticas de una campaña por ID. Solo lectura.',
    inputSchema: z.object({ campaignId: id }),
  }, async ({ campaignId }) => json(await api.get(`/api/campaigns/${encodeURIComponent(campaignId)}/stats`)))

  server.registerTool('obtener_resumen_dashboard', {
    title: 'Resumen del dashboard',
    description: 'Obtiene las métricas agregadas del dashboard para 7, 30 o 90 días. Solo lectura.',
    inputSchema: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7) }),
  }, async ({ days }) => json(await api.get('/api/dashboard/stats', { days })))

  server.registerTool('listar_actividad_dashboard', {
    title: 'Actividad reciente',
    description: 'Lista la actividad comercial reciente de la organización. Solo lectura.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
  }, async ({ limit: activityLimit }) => json(await api.get('/api/dashboard/activity', { limit: activityLimit })))

  server.registerTool('listar_llamadas_en_directo', {
    title: 'Llamadas en directo',
    description: 'Muestra las llamadas activas en este momento. Solo lectura.',
    inputSchema: z.object({}),
  }, async () => json(await api.get('/api/dashboard/live')))

  server.registerTool('consultar_pipeline', {
    title: 'Consultar pipeline',
    description: 'Obtiene el pipeline agrupado por etapas. Solo lectura.',
    inputSchema: z.object({}),
  }, async () => json(await api.get('/api/pipeline')))

  server.registerTool('listar_oportunidades', {
    title: 'Listar oportunidades',
    description: 'Lista oportunidades del pipeline con filtros y paginación. Solo lectura.',
    inputSchema: z.object({
      search: z.string().trim().min(1).max(200).optional(),
      stage: opportunityStage.optional(),
      ownerId: id.optional(),
      closeFrom: date.optional(),
      closeTo: date.optional(),
      source: z.string().trim().min(1).max(100).optional(),
      sort: opportunitySort.optional(),
      page,
      limit,
    }),
  }, async ({ search, stage, ownerId, closeFrom, closeTo, source, sort, page: pageNumber, limit: pageSize }) => json(await api.get('/api/pipeline/list', {
    search, stage, ownerId, closeFrom, closeTo, source, sort, page: pageNumber, limit: pageSize,
  })))

  server.registerTool('obtener_oportunidad', {
    title: 'Obtener oportunidad',
    description: 'Obtiene el detalle de una oportunidad del pipeline. Solo lectura.',
    inputSchema: z.object({ opportunityId: id }),
  }, async ({ opportunityId }) => json(await api.get(`/api/pipeline/${encodeURIComponent(opportunityId)}`)))

  server.registerTool('obtener_insights_pipeline', {
    title: 'Insights del pipeline',
    description: 'Obtiene indicadores y oportunidades de mejora del pipeline. Solo lectura.',
    inputSchema: z.object({}),
  }, async () => json(await api.get('/api/pipeline/insights')))

  server.registerTool('obtener_forecast_pipeline', {
    title: 'Forecast del pipeline',
    description: 'Obtiene el forecast agregado del pipeline por categoría y moneda. Solo lectura.',
    inputSchema: z.object({
      ownerId: id.optional(),
      category: z.enum(['pipeline', 'best_case', 'commit', 'omitted']).optional(),
      currency: z.enum(['EUR', 'USD', 'GBP', 'MXN']).optional(),
      closeFrom: date.optional(),
      closeTo: date.optional(),
    }),
  }, async ({ ownerId, category, currency, closeFrom, closeTo }) => json(await api.get('/api/pipeline/forecast', {
    ownerId, category, currency, closeFrom, closeTo,
  })))

  server.registerTool('listar_reuniones', {
    title: 'Listar reuniones',
    description: 'Lista reuniones con filtros de estado, fecha y responsable. Solo lectura.',
    inputSchema: z.object({
      assignedTo: id.optional(),
      status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
      dateFrom: date.optional(),
      dateTo: date.optional(),
      search: z.string().trim().min(1).max(200).optional(),
      page,
      limit,
    }),
  }, async ({ assignedTo, status, dateFrom, dateTo, search, page: pageNumber, limit: pageSize }) => json(await api.get('/api/meetings', {
    assignedTo, status, dateFrom, dateTo, search, page: pageNumber, limit: pageSize,
  })))

  server.registerTool('obtener_reunion', {
    title: 'Obtener reunión',
    description: 'Obtiene el detalle de una reunión por ID. Solo lectura.',
    inputSchema: z.object({ meetingId: id }),
  }, async ({ meetingId }) => json(await api.get(`/api/meetings/${encodeURIComponent(meetingId)}`)))

  server.registerTool('preparar_reunion', {
    title: 'Preparar reunión',
    description: 'Obtiene el contexto de una reunión: lead, llamadas, notas, oportunidad y actividad. Solo lectura.',
    inputSchema: z.object({ meetingId: id }),
  }, async ({ meetingId }) => json(await api.get(`/api/meetings/${encodeURIComponent(meetingId)}/prep`)))

  server.registerTool('obtener_timeline_lead', {
    title: 'Timeline del lead',
    description: 'Obtiene el timeline consolidado de un lead. Solo lectura.',
    inputSchema: z.object({ leadId: id }),
  }, async ({ leadId }) => json(await api.get(`/api/leads/${encodeURIComponent(leadId)}/timeline`)))

  server.registerTool('listar_actividades_lead', {
    title: 'Actividades del lead',
    description: 'Lista las actividades comerciales de un lead con paginación. Solo lectura.',
    inputSchema: z.object({ leadId: id, page, limit }),
  }, async ({ leadId, page: pageNumber, limit: pageSize }) => json(await api.get(`/api/leads/${encodeURIComponent(leadId)}/activities`, {
    page: pageNumber, limit: pageSize,
  })))

  server.registerTool('obtener_traza_llamada', {
    title: 'Traza de llamada',
    description: 'Obtiene la traza técnica y conversacional de una llamada. Solo lectura.',
    inputSchema: z.object({ callId: id, limit: z.number().int().min(1).max(1000).default(1000) }),
  }, async ({ callId, limit: traceLimit }) => json(await api.get(`/api/calls/${encodeURIComponent(callId)}/trace`, { limit: traceLimit })))

  server.registerTool('obtener_metricas_llamada', {
    title: 'Métricas de llamada',
    description: 'Obtiene las métricas detalladas de una llamada. Solo lectura.',
    inputSchema: z.object({ callId: id }),
  }, async ({ callId }) => json(await api.get(`/api/calls/${encodeURIComponent(callId)}/metrics`)))
}
