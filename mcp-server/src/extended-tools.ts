import * as z from 'zod/v4'
import type { McpServer } from '@modelcontextprotocol/server'
import { CallsRobinClient } from './callsrobin-client.js'

const id = z.string().trim().min(1).max(128)
const page = z.number().int().min(1).max(100_000).optional()
const limit = z.number().int().min(1).max(100).default(25)
const empty = z.object({})
const leadId = z.object({ leadId: id })
const callId = z.object({ callId: id })
const opportunityId = z.object({ opportunityId: id })
const campaignId = z.object({ campaignId: id })
const automationId = z.object({ automationId: id })

function json(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: { data: value },
  }
}

type Args = Record<string, any>

function registerGetTool(
  server: McpServer,
  api: CallsRobinClient,
  definition: {
    name: string
    title: string
    description: string
    inputSchema: any
    request: (args: Args) => { path: string; query?: Record<string, string | number | undefined> }
  },
) {
  server.registerTool(definition.name, {
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
  }, async (args: Args) => {
    const request = definition.request(args)
    return json(await api.get(request.path, request.query))
  })
}

export function registerExtendedReadOnlyTools(server: McpServer, api: CallsRobinClient) {
  // CRM complementario
  registerGetTool(server, api, {
    name: 'listar_cuentas', title: 'Listar cuentas',
    description: 'Lista empresas o cuentas del CRM. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/accounts' }),
  })
  registerGetTool(server, api, {
    name: 'obtener_cuenta', title: 'Obtener cuenta',
    description: 'Obtiene una empresa o cuenta por ID. Solo lectura.', inputSchema: z.object({ accountId: id }),
    request: ({ accountId }) => ({ path: `/api/accounts/${encodeURIComponent(accountId)}` }),
  })
  registerGetTool(server, api, {
    name: 'listar_tareas', title: 'Listar tareas',
    description: 'Lista tareas del CRM. Solo lectura.', inputSchema: z.object({ page, limit }),
    request: ({ page: pageNumber, limit: pageSize }) => ({ path: '/api/tasks', query: { page: pageNumber, limit: pageSize } }),
  })
  registerGetTool(server, api, {
    name: 'obtener_tarea', title: 'Obtener tarea',
    description: 'Obtiene una tarea por ID. Solo lectura.', inputSchema: z.object({ taskId: id }),
    request: ({ taskId }) => ({ path: `/api/tasks/${encodeURIComponent(taskId)}` }),
  })
  registerGetTool(server, api, {
    name: 'listar_conversaciones', title: 'Listar conversaciones',
    description: 'Lista conversaciones omnicanal. Solo lectura.', inputSchema: z.object({ page, limit }),
    request: ({ page: pageNumber, limit: pageSize }) => ({ path: '/api/conversations', query: { page: pageNumber, limit: pageSize } }),
  })
  registerGetTool(server, api, {
    name: 'listar_plantillas_conversacion', title: 'Plantillas de conversación',
    description: 'Lista plantillas disponibles para conversaciones. Solo lectura.', inputSchema: z.object({ channel: z.string().trim().min(1).max(40).optional() }),
    request: ({ channel }) => ({ path: '/api/conversations/templates', query: { channel } }),
  })
  registerGetTool(server, api, {
    name: 'obtener_conversacion', title: 'Obtener conversación',
    description: 'Obtiene una conversación completa por ID. Solo lectura.', inputSchema: z.object({ conversationId: id }),
    request: ({ conversationId }) => ({ path: `/api/conversations/${encodeURIComponent(conversationId)}` }),
  })
  registerGetTool(server, api, {
    name: 'listar_notas_llamada', title: 'Notas de llamada',
    description: 'Lista las notas asociadas a una llamada. Solo lectura.', inputSchema: callId,
    request: ({ callId: value }) => ({ path: `/api/calls/${encodeURIComponent(value)}/notes` }),
  })
  registerGetTool(server, api, {
    name: 'listar_tareas_llamada', title: 'Tareas de llamada',
    description: 'Lista las tareas asociadas a una llamada. Solo lectura.', inputSchema: callId,
    request: ({ callId: value }) => ({ path: `/api/calls/${encodeURIComponent(value)}/tasks` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_historial_oportunidad', title: 'Historial de oportunidad',
    description: 'Obtiene los cambios de etapa de una oportunidad. Solo lectura.', inputSchema: opportunityId,
    request: ({ opportunityId: value }) => ({ path: `/api/pipeline/${encodeURIComponent(value)}/history` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_actividad_oportunidad', title: 'Actividad de oportunidad',
    description: 'Obtiene la actividad comercial de una oportunidad. Solo lectura.', inputSchema: opportunityId,
    request: ({ opportunityId: value }) => ({ path: `/api/pipeline/${encodeURIComponent(value)}/activity` }),
  })
  registerGetTool(server, api, {
    name: 'listar_contactos_oportunidad', title: 'Contactos de oportunidad',
    description: 'Lista contactos y roles de compra de una oportunidad. Solo lectura.', inputSchema: opportunityId,
    request: ({ opportunityId: value }) => ({ path: `/api/pipeline/${encodeURIComponent(value)}/contacts` }),
  })
  registerGetTool(server, api, {
    name: 'listar_lineas_oportunidad', title: 'Líneas de oportunidad',
    description: 'Lista productos y líneas de una oportunidad. Solo lectura.', inputSchema: opportunityId,
    request: ({ opportunityId: value }) => ({ path: `/api/pipeline/${encodeURIComponent(value)}/line-items` }),
  })
  registerGetTool(server, api, {
    name: 'listar_propietarios_leads', title: 'Propietarios de leads',
    description: 'Lista usuarios que pueden ser propietarios de leads. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/leads/owners' }),
  })
  registerGetTool(server, api, {
    name: 'listar_importaciones_leads', title: 'Importaciones de leads',
    description: 'Lista trabajos de importación de leads. Solo lectura.', inputSchema: z.object({ page, limit }),
    request: ({ page: pageNumber, limit: pageSize }) => ({ path: '/api/leads/imports', query: { page: pageNumber, limit: pageSize } }),
  })
  registerGetTool(server, api, {
    name: 'obtener_importacion_leads', title: 'Estado de importación',
    description: 'Obtiene el estado de una importación de leads. Solo lectura.', inputSchema: z.object({ importId: id }),
    request: ({ importId }) => ({ path: `/api/leads/imports/${encodeURIComponent(importId)}` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_consentimiento_lead', title: 'Consentimiento del lead',
    description: 'Obtiene el estado de consentimiento de un lead por canal. Solo lectura.', inputSchema: leadId,
    request: ({ leadId: value }) => ({ path: `/api/leads/${encodeURIComponent(value)}/consent` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_auditoria_lead', title: 'Auditoría del lead',
    description: 'Obtiene la auditoría comercial disponible de un lead. Solo lectura.', inputSchema: leadId,
    request: ({ leadId: value }) => ({ path: `/api/leads/${encodeURIComponent(value)}/audit` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_historial_auditoria_lead', title: 'Historial de auditoría del lead',
    description: 'Obtiene el historial de auditorías de un lead. Solo lectura.', inputSchema: leadId,
    request: ({ leadId: value }) => ({ path: `/api/leads/${encodeURIComponent(value)}/audit-history` }),
  })
  registerGetTool(server, api, {
    name: 'listar_notas_lead', title: 'Notas del lead',
    description: 'Lista las notas de un lead. Solo lectura.', inputSchema: leadId,
    request: ({ leadId: value }) => ({ path: `/api/leads/${encodeURIComponent(value)}/notes` }),
  })
  registerGetTool(server, api, {
    name: 'listar_archivos_lead', title: 'Archivos del lead',
    description: 'Lista archivos asociados a un lead. Solo lectura.', inputSchema: leadId,
    request: ({ leadId: value }) => ({ path: `/api/leads/${encodeURIComponent(value)}/files` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_historial_email_lead', title: 'Historial de email del lead',
    description: 'Obtiene entregas y eventos de email de un lead. Solo lectura.', inputSchema: leadId,
    request: ({ leadId: value }) => ({ path: `/api/leads/${encodeURIComponent(value)}/email-history` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_preferencias_lead', title: 'Preferencias del lead',
    description: 'Obtiene las preferencias de comunicación de un lead. Solo lectura.', inputSchema: leadId,
    request: ({ leadId: value }) => ({ path: `/api/leads/${encodeURIComponent(value)}/preferences` }),
  })

  // Anuncios y rendimiento de campañas
  registerGetTool(server, api, {
    name: 'obtener_overview_ads', title: 'Resumen de anuncios',
    description: 'Obtiene el resumen de rendimiento de anuncios. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/overview' }),
  })
  registerGetTool(server, api, {
    name: 'obtener_calidad_datos_ads', title: 'Calidad de datos de anuncios',
    description: 'Obtiene el diagnóstico de calidad de datos publicitarios. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/data-quality' }),
  })
  registerGetTool(server, api, {
    name: 'obtener_politica_ads', title: 'Política de anuncios',
    description: 'Obtiene la política y controles de anuncios. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/policy' }),
  })
  registerGetTool(server, api, {
    name: 'listar_acciones_ads', title: 'Acciones de anuncios',
    description: 'Lista acciones publicitarias registradas. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/actions' }),
  })
  registerGetTool(server, api, {
    name: 'listar_acciones_ads_pendientes', title: 'Acciones pendientes de anuncios',
    description: 'Lista acciones publicitarias pendientes de revisión. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/actions/pending' }),
  })
  registerGetTool(server, api, {
    name: 'listar_reglas_autonomia_ads', title: 'Reglas de autonomía publicitaria',
    description: 'Lista reglas de autonomía y su estado. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/rules' }),
  })
  registerGetTool(server, api, {
    name: 'listar_experimentos_ads', title: 'Experimentos publicitarios',
    description: 'Lista experimentos de anuncios. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/experiments' }),
  })
  registerGetTool(server, api, {
    name: 'obtener_asignacion_experimento_ads', title: 'Asignación de experimento publicitario',
    description: 'Obtiene la asignación calculada de un experimento. Solo lectura.', inputSchema: z.object({ experimentId: id }),
    request: ({ experimentId }) => ({ path: `/api/ads/experiments/${encodeURIComponent(experimentId)}/allocation` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_asignacion_presupuesto_ads', title: 'Asignación de presupuesto publicitario',
    description: 'Obtiene la recomendación de asignación presupuestaria. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/budget-allocation' }),
  })
  registerGetTool(server, api, {
    name: 'obtener_borrador_ads', title: 'Borrador de anuncios',
    description: 'Obtiene el borrador publicitario actual. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/ads/draft' }),
  })
  registerGetTool(server, api, {
    name: 'obtener_estado_campana_ads', title: 'Estado de campaña publicitaria',
    description: 'Obtiene el estado local y remoto de una campaña publicitaria. Solo lectura.', inputSchema: campaignId,
    request: ({ campaignId: value }) => ({ path: `/api/ads/campaigns/${encodeURIComponent(value)}/status` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_insights_campana_ads', title: 'Insights de campaña publicitaria',
    description: 'Obtiene insights de una campaña publicitaria. Solo lectura.', inputSchema: campaignId,
    request: ({ campaignId: value }) => ({ path: `/api/ads/campaigns/${encodeURIComponent(value)}/insights` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_atribucion_campana_ads', title: 'Atribución de campaña publicitaria',
    description: 'Obtiene la atribución de conversiones de una campaña. Solo lectura.', inputSchema: campaignId,
    request: ({ campaignId: value }) => ({ path: `/api/ads/campaigns/${encodeURIComponent(value)}/attribution` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_decisiones_campana_ads', title: 'Decisiones de campaña publicitaria',
    description: 'Obtiene decisiones y recomendaciones registradas para una campaña. Solo lectura.', inputSchema: campaignId,
    request: ({ campaignId: value }) => ({ path: `/api/ads/campaigns/${encodeURIComponent(value)}/decisions` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_estado_remoto_campana_ads', title: 'Estado remoto de campaña publicitaria',
    description: 'Obtiene el estado remoto de una campaña publicitaria. Solo lectura.', inputSchema: campaignId,
    request: ({ campaignId: value }) => ({ path: `/api/ads/campaigns/${encodeURIComponent(value)}/remote-status` }),
  })

  // Email y contenido
  registerGetTool(server, api, {
    name: 'obtener_metricas_email_campana', title: 'Métricas de email de campaña',
    description: 'Obtiene métricas de email de una campaña. Solo lectura.', inputSchema: campaignId,
    request: ({ campaignId: value }) => ({ path: `/api/email/campaigns/${encodeURIComponent(value)}/metrics` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_variantes_email_campana', title: 'Variantes de email de campaña',
    description: 'Obtiene el rendimiento de variantes de email. Solo lectura.', inputSchema: campaignId,
    request: ({ campaignId: value }) => ({ path: `/api/email/campaigns/${encodeURIComponent(value)}/variants` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_ingresos_email_campana', title: 'Ingresos de email de campaña',
    description: 'Obtiene ingresos atribuidos a una campaña de email. Solo lectura.', inputSchema: campaignId,
    request: ({ campaignId: value }) => ({ path: `/api/email/campaigns/${encodeURIComponent(value)}/revenue` }),
  })
  registerGetTool(server, api, {
    name: 'obtener_overview_email', title: 'Resumen de email marketing',
    description: 'Obtiene el resumen global de email marketing. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/email/overview' }),
  })
  registerGetTool(server, api, {
    name: 'listar_suscriptores_email', title: 'Suscriptores de email',
    description: 'Lista suscriptores de email. Solo lectura.', inputSchema: z.object({ page, limit }),
    request: ({ page: pageNumber, limit: pageSize }) => ({ path: '/api/email/subscribers', query: { page: pageNumber, limit: pageSize } }),
  })
  registerGetTool(server, api, {
    name: 'obtener_resumen_suscriptores_email', title: 'Resumen de suscriptores',
    description: 'Obtiene el resumen de la audiencia de email. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/email/subscribers/summary' }),
  })
  registerGetTool(server, api, {
    name: 'listar_entregas_email', title: 'Entregas de email',
    description: 'Lista entregas y eventos de email. Solo lectura.', inputSchema: z.object({ page, limit }),
    request: ({ page: pageNumber, limit: pageSize }) => ({ path: '/api/email/deliveries', query: { page: pageNumber, limit: pageSize } }),
  })
  registerGetTool(server, api, {
    name: 'listar_oportunidades_contenido', title: 'Oportunidades de contenido',
    description: 'Lista oportunidades detectadas para crear contenido. Solo lectura.', inputSchema: z.object({ page, limit }),
    request: ({ page: pageNumber, limit: pageSize }) => ({ path: '/api/content/opportunities', query: { page: pageNumber, limit: pageSize } }),
  })
  registerGetTool(server, api, {
    name: 'listar_automatizaciones', title: 'Listar automatizaciones',
    description: 'Lista automatizaciones configuradas. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/automations' }),
  })
  registerGetTool(server, api, {
    name: 'obtener_salud_automatizaciones', title: 'Salud de automatizaciones',
    description: 'Obtiene el estado de salud de las automatizaciones. Solo lectura.', inputSchema: empty,
    request: () => ({ path: '/api/automations/health' }),
  })
  registerGetTool(server, api, {
    name: 'listar_ejecuciones_automatizacion', title: 'Ejecuciones de automatización',
    description: 'Lista ejecuciones de una automatización. Solo lectura.', inputSchema: z.object({ automationId: id, page, limit }),
    request: ({ automationId: value, page: pageNumber, limit: pageSize }) => ({ path: `/api/automations/${encodeURIComponent(value)}/runs`, query: { page: pageNumber, limit: pageSize } }),
  })
  registerGetTool(server, api, {
    name: 'listar_producciones_studio', title: 'Producciones del Studio',
    description: 'Lista producciones audiovisuales del Studio. Solo lectura.', inputSchema: z.object({ page, limit }),
    request: ({ page: pageNumber, limit: pageSize }) => ({ path: '/api/studio/productions', query: { page: pageNumber, limit: pageSize } }),
  })
}
