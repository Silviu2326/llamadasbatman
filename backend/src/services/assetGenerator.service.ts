import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { saveGeneratedImage } from './generatedMedia.service'

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

/**
 * Genera la imagen con gpt-image-1 (que devuelve base64, no URL) y la guarda
 * en disco para exponerla como URL pública descargable por Metricool/Meta.
 */
export async function generateImageUrl(prompt: string): Promise<string | undefined> {
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
    const base64 = res.data?.[0]?.b64_json
    if (!base64) return undefined
    const saved = await saveGeneratedImage(base64)
    return saved?.publicUrl
  } catch (err) {
    console.warn('[AssetGenerator] image generation failed:', (err as Error).message)
    return undefined
  }
}

/**
 * Fallback cuando el rubro no tiene AdPlaybook preparado (ver
 * META_ADS_AUTOMATION.md). Genera oferta/lead magnet/copy con el mismo LLM
 * ya configurado para Vendrava (Claude). Si OPENAI_API_KEY está configurada,
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

export interface SocialContentPost {
  platform: string
  text: string
  suggestedDate: string
}

export interface SocialContentPlan {
  title: string
  summary: string
  posts: SocialContentPost[]
  generatedBy: 'ai' | 'fallback'
}

function addDaysIso(base: string | undefined, days: number): string {
  const date = base ? new Date(`${base}T00:00:00`) : new Date()
  if (Number.isNaN(date.getTime())) date.setTime(Date.now())
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function staticSocialPlan(params: { prompt: string; channels: string[]; tone?: string; startDate?: string }): SocialContentPlan {
  return {
    title: `Plan de contenido: ${params.prompt.slice(0, 60)}`,
    summary: `${params.channels.length} publicación(es) con tono ${params.tone ?? 'cercano'}, una por canal.`,
    posts: params.channels.map((platform, index) => ({
      platform,
      text: `${params.prompt} Descubre más y escríbenos si tenés dudas.`,
      suggestedDate: addDaysIso(params.startDate, index),
    })),
    generatedBy: 'fallback',
  }
}

/**
 * Copiloto de contenido para redes sociales (Metricool). Reemplaza el
 * `createAiPlan()` que antes corría 100% en el navegador con templates
 * hardcodeados — mismo cliente/estilo de prompt que `generateFallbackAssets`,
 * mismo fallback estático si no hay `CLAUDE_API_KEY`.
 */
export async function generateSocialContentPlan(params: {
  prompt: string
  channels: string[]
  tone?: string
  startDate?: string
}): Promise<SocialContentPlan> {
  const channels = params.channels?.length ? params.channels : ['instagram']
  const client = getClient()
  if (!client) return staticSocialPlan({ ...params, channels })

  const prompt = `Brief de contenido: "${params.prompt}".
Canales a cubrir (uno por uno, en este orden): ${channels.join(', ')}.
Tono: "${params.tone ?? 'cercano'}".
Fecha de inicio sugerida: "${params.startDate ?? 'hoy'}".
Generá, en español y en JSON plano (sin markdown, sin explicación), un plan de contenido para redes sociales con estos campos:
- "title": título corto del plan
- "summary": resumen de 1 frase del plan completo
- "posts": un array con exactamente un objeto por cada canal listado arriba, cada uno con:
  - "platform": el nombre del canal tal cual se listó arriba
  - "text": el copy del post, adaptado al canal y al tono indicado, 1-3 frases
  - "suggestedDate": fecha sugerida en formato YYYY-MM-DD, escalonando cada post unos días después del anterior a partir de la fecha de inicio
Respondé solo el JSON con esas 3 claves.`

  try {
    const res = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
    const parsed = JSON.parse(text.trim())
    if (!Array.isArray(parsed.posts) || !parsed.posts.length) throw new Error('invalid plan shape from LLM')
    return {
      title: parsed.title ?? `Plan de contenido: ${params.prompt.slice(0, 60)}`,
      summary: parsed.summary ?? '',
      posts: parsed.posts.map((post: any, index: number) => ({
        platform: post.platform ?? channels[index % channels.length],
        text: post.text ?? '',
        suggestedDate: post.suggestedDate ?? addDaysIso(params.startDate, index),
      })),
      generatedBy: 'ai',
    }
  } catch (err) {
    console.warn('[AssetGenerator] social plan generation failed, using static fallback:', (err as Error).message)
    return staticSocialPlan({ ...params, channels })
  }
}
