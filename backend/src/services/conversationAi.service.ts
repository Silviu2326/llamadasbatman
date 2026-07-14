import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma'

export async function suggestConversationReply(orgId: string, conversationId: string, tone = 'consultivo') {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) throw new Error('La IA de respuestas no está configurada')
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
  const client = new Anthropic({ apiKey, timeout: Number(process.env.CLAUDE_TIMEOUT_SECONDS ?? 25) * 1000 })
  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Eres copiloto comercial de un CRM español. Sugiere una respuesta breve, útil y verificable para continuar esta conversación. No inventes precios, compromisos, disponibilidad ni hechos. Si falta contexto, haz una pregunta concreta. Tono: ${tone}.
Lead: ${JSON.stringify({ name: lead?.name, company: lead?.company, status: lead?.status, source: lead?.source })}
Contexto de captación: ${JSON.stringify(acquisitionContext)}
Mensajes recientes: ${JSON.stringify(recentMessages)}
Responde solo JSON válido: {"text":"...","reason":"..."}`,
    }],
  })
  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text
  const parsed = JSON.parse(jsonText)
  if (typeof parsed.text !== 'string' || !parsed.text.trim()) throw new Error('La IA no devolvió una sugerencia válida')
  return { text: parsed.text.trim(), reason: typeof parsed.reason === 'string' ? parsed.reason : '' }
}
