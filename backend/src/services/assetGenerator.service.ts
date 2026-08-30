import OpenAI from 'openai'
import { createHash } from 'node:crypto'
import { askJson, fastModel, isDeepseekConfigured, smartModel } from '../lib/deepseek'
import { prisma } from '../lib/prisma'
import { recordUsage } from '../lib/usage'
import { reviewPiece } from './contentCritic.service'
import { extractBrandFacts } from './contentSpecificity.service'
import { getOwnerVoice, voiceInstructions } from './ownerVoice.service'
import { saveGeneratedImage } from './generatedMedia.service'
import { createAssetFromBuffer, getAssetDownloadUrl } from './assets.service'

export interface GeneratedAdAssets {
  offer: string
  leadMagnet: string
  adCopy: string
  landingTemplateId: string
  imagePrompt: string
  imageUrl?: string
  /** Fila Asset de la biblioteca (02-FUNDAMENTOS §2.3, doble escritura). */
  imageAssetId?: string
}

/**
 * El copy va por DeepSeek; la imagen sigue en `gpt-image-1` más abajo. Son dos
 * proveedores a propósito: cada uno hace aquello en lo que es bueno.
 */
function getClient(): boolean {
  return isDeepseekConfigured()
}

export interface GeneratedImage {
  imageUrl: string
  /** Presente solo si hubo `orgId` a quien imputar la biblioteca de activos. */
  assetId?: string
}

/** Coste gestionado por imagen de gpt-image-1, en céntimos (env con default). */
function openaiImageCostCents(): number {
  const parsed = Number.parseFloat(process.env.OPENAI_IMAGE_COST_CENTS ?? '')
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 4
}

/**
 * Genera la imagen con gpt-image-1 (que devuelve base64, no URL). Con tenant
 * la guarda como Asset privado y devuelve una URL prefirmada; el disco local
 * queda únicamente como compatibilidad de desarrollo sin tenant.
 *
 * Con `orgId` la imagen entra en la biblioteca de activos (fila Asset con genealogía
 * provider/model/prompt) y se registra el consumo en el ledger. Sin `orgId`
 * no hay a quién imputar ni el asset ni el coste, así que solo se permite el
 * fallback local fuera de producción.
 */
export async function generateImage(
  prompt: string,
  opts?: { orgId?: string; createdById?: string; campaignId?: string; jobId?: string; size?: '1024x1024' | '1024x1536' | '1536x1024' },
): Promise<GeneratedImage | undefined> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return undefined
  try {
    const openai = new OpenAI({ apiKey })
    const size = opts?.size ?? '1024x1024'
    const res = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size,
    })
    const base64 = res.data?.[0]?.b64_json
    if (!base64) return undefined
    const buffer = Buffer.from(base64, 'base64')
    let assetId: string | undefined
    let imageUrl: string | undefined
    if (opts?.orgId) {
      try {
        const asset = await createAssetFromBuffer({
          orgId: opts.orgId,
          buffer,
          provider: 'openai',
          model: 'gpt-image-1',
          prompt,
          params: { size },
          costCents: openaiImageCostCents(),
          campaignId: opts.campaignId,
          createdById: opts.createdById,
          jobId: opts.jobId,
        })
        assetId = asset.id
        const download = await getAssetDownloadUrl({ orgId: opts.orgId, id: asset.id })
        if (download && !download.requiresAuth) imageUrl = download.url
      } catch (assetErr) {
        console.warn('[AssetGenerator] no se pudo registrar el Asset:', (assetErr as Error).message)
        if (process.env.NODE_ENV === 'production') throw assetErr
      }
      await recordUsage({
        orgId: opts.orgId,
        provider: 'openai',
        capability: 'image.generate',
        quantity: 1,
        unit: 'images',
        costCents: openaiImageCostCents(),
        billingMode: 'managed',
        jobId: opts.jobId,
        rateVersion: '2026-08',
        idempotencyKey: `openai-image:${assetId ?? createHash('sha256').update(buffer).digest('hex')}`,
        meta: { model: 'gpt-image-1', size },
      })
    }

    // El fallback en disco queda limitado a desarrollo y a llamadores legacy
    // sin tenant. En producción toda imagen nueva debe ser un Asset privado en
    // S3/R2; una réplica efímera nunca es un almacén ni una URL estable.
    if (!imageUrl) {
      if (process.env.NODE_ENV === 'production') {
        if (!opts?.orgId) throw new Error('orgId es obligatorio para generar imágenes en producción')
        throw new Error('No se pudo obtener una URL prefirmada del Asset generado')
      }
      const saved = await saveGeneratedImage(base64)
      if (!saved) return undefined
      imageUrl = saved.publicUrl
    }

    return { imageUrl, assetId }
  } catch (err) {
    console.warn('[AssetGenerator] image generation failed:', (err as Error).message)
    return undefined
  }
}

/** Compatibilidad: los llamadores antiguos solo quieren la URL. */
export async function generateImageUrl(
  prompt: string,
  opts?: { orgId?: string; createdById?: string; campaignId?: string; jobId?: string; size?: '1024x1024' | '1024x1536' | '1536x1024' },
): Promise<string | undefined> {
  return (await generateImage(prompt, opts))?.imageUrl
}

/** Campos de imagen del anuncio: URL pública actual + assetId de biblioteca. */
async function generatedImageFields(imagePrompt: string, orgId?: string): Promise<{ imageUrl?: string; imageAssetId?: string }> {
  const image = await generateImage(imagePrompt, { orgId })
  return { imageUrl: image?.imageUrl, imageAssetId: image?.assetId }
}

/**
 * Fallback cuando el rubro no tiene AdPlaybook preparado (ver
 * META_ADS_AUTOMATION.md). Genera oferta/lead magnet/copy con DeepSeek. Si
 * OPENAI_API_KEY está configurada, también genera la imagen real con
 * gpt-image-1; si no, devuelve solo imagePrompt para que se genere después.
 *
 * Con `orgId` el anuncio deja de escribirse a ciegas: recibe la voz del dueño
 * y los datos verificados de la base de conocimiento, y pasa por el mismo
 * panel creativo que las piezas de redes. Sin él sigue funcionando igual que
 * antes — dos cadenas de texto y a correr — porque el asistente de campañas
 * puede llamarse desde sitios que todavía no saben de qué organización son.
 */
export async function generateFallbackAssets(params: {
  vertical: string
  objetivo: string
  orgId?: string
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
      ...(await generatedImageFields(imagePrompt, params.orgId)),
    }
  }

  // Material del negocio: lo mismo que hace específicas a las piezas de redes.
  // Un anuncio que sabe desde cuándo existe el taller y qué preguntan sus
  // clientes no compite con "Consulta gratuita para dentista".
  const facts = params.orgId ? await extractBrandFacts(params.orgId) : []
  const voice = params.orgId ? voiceInstructions(await getOwnerVoice(params.orgId)) : null
  const factLines = facts.map(fact => `- ${fact.text}`).join('\n')
  const grounding = [
    facts.length ? `Datos verificados del negocio (úsalos, no los contradigas):\n${factLines}` : null,
    voice ? `Voz del negocio:\n${voice}` : null,
  ].filter(Boolean).join('\n\n')

  const prompt = `Rubro de negocio: "${params.vertical}". Objetivo de la campaña: "${params.objetivo}".
${grounding}
Generá, en español y en JSON plano (sin markdown, sin explicación), estos 4 campos para un anuncio de captación de leads:
- "offer": una oferta corta y concreta (ej. "Prueba gratuita de 7 días")
- "leadMagnet": un lead magnet gratis a cambio del contacto (ej. "Guía de...")
- "adCopy": el texto del anuncio, 1-2 frases, tono cercano
- "imagePrompt": un prompt en inglés para generar la imagen del anuncio, describiendo la escena, sin pedir texto en la imagen
Respondé solo el JSON con esas 4 claves.`

  try {
    // Razonador cuando hay material que respetar: elegir qué dato del negocio
    // sostiene la oferta es criterio. Sin material, el rápido basta.
    const parsed = await askJson<any>({
      model: grounding ? smartModel() : fastModel(),
      maxTokens: 500,
      label: 'asset:ad-copy',
      system: voice ?? undefined,
      prompt,
    })
    if (!parsed) throw new Error('la IA no devolvió copy del anuncio')
    const imagePrompt = parsed.imagePrompt

    // El mismo panel que revisa un post revisa ahora el anuncio. Va después de
    // generar y antes de la imagen: pagar una imagen de un copy que el editor
    // va a reescribir es tirar el dinero dos veces.
    let copy = { offer: parsed.offer, leadMagnet: parsed.leadMagnet, adCopy: parsed.adCopy }
    if (params.orgId) {
      const org = await prisma.organization.findUnique({
        where: { id: params.orgId },
        select: { phone: true, email: true },
      })
      const { body } = await reviewPiece('ad', copy as unknown as Record<string, any>, {
        evidence: null,
        facts,
        voice,
        own: { phone: org?.phone, email: org?.email },
      })
      copy = {
        offer: String(body.offer ?? copy.offer),
        leadMagnet: String(body.leadMagnet ?? copy.leadMagnet),
        adCopy: String(body.adCopy ?? copy.adCopy),
      }
    }

    return {
      ...copy,
      landingTemplateId: 'generic-v1',
      imagePrompt,
      ...(await generatedImageFields(imagePrompt, params.orgId)),
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
      ...(await generatedImageFields(imagePrompt, params.orgId)),
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
 * mismo fallback estático si no hay `DEEPSEEK_API_KEY`.
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
    const parsed = await askJson<any>({ model: fastModel(), maxTokens: 900, label: 'asset:content-plan', prompt })
    if (!parsed || !Array.isArray(parsed.posts) || !parsed.posts.length) throw new Error('invalid plan shape from LLM')
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
