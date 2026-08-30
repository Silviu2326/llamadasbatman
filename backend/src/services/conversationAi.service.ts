import { askJson, fastModel, isDeepseekConfigured } from '../lib/deepseek'
import { prisma } from '../lib/prisma'

export async function suggestConversationReply(orgId: string, conversationId: string, tone = 'consultivo') {
  if (!isDeepseekConfigured()) throw new Error('La IA de respuestas no está configurada')
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      lead: {
        include: {
          campaign: { select: { id: true, name: true, objective: true, landingSlug: true } },
          acquisitionEvents: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  })
  if (!conversation) return null
  const lead = conversation.lead
  const acquisition = lead?.acquisitionEvents?.[0]
  const acquisitionContext = acquisition ? {
    source: acquisition.source,
    medium: acquisition.medium,
    content: acquisition.content,
    campaign: lead?.campaign,
    metadata: acquisition.metadata,
  } : { campaign: lead?.campaign }
  const recentMessages = conversation.messages.slice(-12).map(message => ({
    direction: message.direction,
    channel: message.channel,
    body: message.body,
    at: message.createdAt,
  }))
  // Modelo rápido: el comercial está esperando con la conversación abierta, y
  // aquí la latencia se nota más que el matiz.
  const parsed = await askJson<any>({
    model: fastModel(),
    maxTokens: 500,
    label: 'conversation:reply',
    prompt: `Eres copiloto comercial de un CRM español. Sugiere una respuesta breve, útil y verificable para continuar esta conversación. No inventes precios, compromisos, disponibilidad ni hechos. Si falta contexto, haz una pregunta concreta. Tono: ${tone}.
Lead: ${JSON.stringify({ name: lead?.name, company: lead?.company, status: lead?.status, source: lead?.source })}
Contexto de captación: ${JSON.stringify(acquisitionContext)}
Mensajes recientes: ${JSON.stringify(recentMessages)}
Responde solo JSON válido: {"text":"...","reason":"..."}`,
  })
  if (typeof parsed?.text !== 'string' || !parsed.text.trim()) throw new Error('La IA no devolvió una sugerencia válida')
  return { text: parsed.text.trim(), reason: typeof parsed.reason === 'string' ? parsed.reason : '' }
}
