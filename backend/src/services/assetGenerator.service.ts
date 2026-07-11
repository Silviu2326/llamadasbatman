import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export interface GeneratedAdAssets {
  offer: string
  leadMagnet: string
  adCopy: string
  landingTemplateId: string
  imagePrompt: string
  imageUrl?: string
}

let _client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (_client) return _client
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) return null
  _client = new Anthropic({ apiKey })
  return _client
}

async function generateImageUrl(prompt: string): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return undefined
  try {
    const openai = new OpenAI({ apiKey })
    const res = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    })
    return res.data?.[0]?.url ?? undefined
  } catch (err) {
    console.warn('[AssetGenerator] image generation failed:', (err as Error).message)
    return undefined
  }
}

/**
 * Fallback cuando el rubro no tiene AdPlaybook preparado (ver
 * META_ADS_AUTOMATION.md). Genera oferta/lead magnet/copy con el mismo LLM
 * ya configurado para VozIA (Claude). Si OPENAI_API_KEY está configurada,
 * también genera la imagen real a partir del prompt; si no, devuelve solo
 * imagePrompt para que se genere después.
 */
export async function generateFallbackAssets(params: {
  vertical: string
  objetivo: string
}): Promise<GeneratedAdAssets> {
  const client = getClient()
  if (!client) {
    const imagePrompt = `Foto realista relacionada con el rubro "${params.vertical}", ambiente profesional, sin texto`
    return {
      offer: `Consulta inicial gratuita para ${params.vertical}`,
      leadMagnet: `Guía gratis para ${params.vertical}`,
      adCopy: `¿Buscás ${params.objetivo}? Escribinos y te ayudamos.`,
      landingTemplateId: 'generic-v1',
      imagePrompt,
      imageUrl: await generateImageUrl(imagePrompt),
    }
  }

  const prompt = `Rubro de negocio: "${params.vertical}". Objetivo de la campaña: "${params.objetivo}".
Generá, en español y en JSON plano (sin markdown, sin explicación), estos 4 campos para un anuncio de captación de leads:
- "offer": una oferta corta y concreta (ej. "Prueba gratuita de 7 días")
- "leadMagnet": un lead magnet gratis a cambio del contacto (ej. "Guía de...")
- "adCopy": el texto del anuncio, 1-2 frases, tono cercano
- "imagePrompt": un prompt en inglés para generar la imagen del anuncio, describiendo la escena, sin pedir texto en la imagen
Respondé solo el JSON con esas 4 claves.`

  try {
    const res = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
    const parsed = JSON.parse(text.trim())
    const imagePrompt = parsed.imagePrompt
    return {
      offer: parsed.offer,
      leadMagnet: parsed.leadMagnet,
      adCopy: parsed.adCopy,
      landingTemplateId: 'generic-v1',
      imagePrompt,
      imageUrl: await generateImageUrl(imagePrompt),
    }
  } catch (err) {
    console.warn('[AssetGenerator] LLM generation failed, using static fallback:', (err as Error).message)
    const imagePrompt = `Foto realista relacionada con el rubro "${params.vertical}", ambiente profesional, sin texto`
    return {
      offer: `Consulta inicial gratuita para ${params.vertical}`,
      leadMagnet: `Guía gratis para ${params.vertical}`,
      adCopy: `¿Buscás ${params.objetivo}? Escribinos y te ayudamos.`,
      landingTemplateId: 'generic-v1',
      imagePrompt,
      imageUrl: await generateImageUrl(imagePrompt),
    }
  }
}
