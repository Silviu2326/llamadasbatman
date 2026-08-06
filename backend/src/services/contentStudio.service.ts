import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { getOwnerVoice, voiceInstructions } from './ownerVoice.service'
import { preferenceInstructions } from './contentApproval.service'
import { BrandFact, extractBrandFacts, factsInstructions } from './contentSpecificity.service'
import { CriticReport, reviewPiece } from './contentCritic.service'
import { getBrandKit } from './brandKit.service'
import { publishCarouselSlides } from './brandCarousel.service'
import { VoiceoverFailure, estimateSeconds, synthesizeVoiceover, voiceoverScript } from './contentVoiceover.service'

/**
 * Estudio — `docs/vendrava/pantallas.md` §2.
 *
 * De una oportunidad salen las tres piezas del MVP: post, carrusel y guion de
 * Reel. Cada una guarda las evidencias que la justifican y con qué versión del
 * perfil de voz se escribió.
 *
 * Dos reglas:
 *
 * - **La pieza no se inventa el dato.** El prompt recibe el resumen y las
 *   evidencias de la oportunidad, y prohíbe cifras, promesas y garantías que no
 *   estén ahí.
 * - **Si no hay voz del dueño, se dice.** Generar "con la voz del dueño" sin
 *   tenerla sería una promesa vacía; la respuesta declara `voiceVersion: null`
 *   y la interfaz lo muestra.
 *
 * Y una tercera que se aplica antes y después de escribir: el **chequeo de
 * especificidad** (idea 27). Antes, los datos verificados de la base de
 * conocimiento entran en el prompt; después, lo genérico que haya sobrevivido se
 * sustituye por esos mismos datos y lo que no tiene dato queda marcado en la
 * pieza. Ver `contentSpecificity.service.ts`.
 */

/**
 * Atomización total (idea 8, fase 2): de una misma oportunidad salen seis
 * piezas. Las cinco primeras las escribe el redactor; `voiceover` no se
 * escribe, se **locuta**: es el guion de Reel pasado por el stack TTS propio, y
 * existe como pieza aparte porque se aprueba y se publica por separado.
 */
export const PIECE_FORMATS = ['post', 'carousel', 'reel_script', 'stories', 'email', 'voiceover'] as const
export type PieceFormat = (typeof PIECE_FORMATS)[number]

/** Los formatos que el modelo escribe. `voiceover` se deriva del Reel. */
export const WRITTEN_FORMATS = ['post', 'carousel', 'reel_script', 'stories', 'email'] as const

/**
 * Modos objetivo del §1 ("el modo objetivo elegible al generar"). Es un
 * vocabulario cerrado a propósito: el objetivo condiciona cómo se escribe la
 * pieza, y texto libre haría imposible tanto preseleccionarlo por tipo de
 * oportunidad como agregar después qué objetivo funciona mejor.
 */
export const PIECE_OBJECTIVES = ['educar', 'resolver_objecion', 'diferenciar', 'convertir', 'conectar', 'demostrar'] as const
export type PieceObjective = (typeof PIECE_OBJECTIVES)[number]

/** Cada tipo de oportunidad trae su objetivo natural ya elegido (§2). */
const OBJECTIVE_BY_TYPE: Record<string, PieceObjective> = {
  objection: 'resolver_objecion',
  faq: 'educar',
  competitor: 'diferenciar',
  pre_purchase: 'convertir',
  emotional: 'conectar',
  success_story: 'demostrar',
}

/** Qué se le pide al redactor con cada objetivo. */
const OBJECTIVE_BRIEF: Record<PieceObjective, string> = {
  educar: 'Explica y enseña. No vendas: que quien lo lea entienda algo que antes no entendía.',
  resolver_objecion: 'Coge la objeción de frente y respóndela con lo que sabes, sin rodeos ni promesas nuevas.',
  diferenciar: 'Explica en qué sois distintos sin nombrar ni menospreciar a nadie.',
  convertir: 'Habla a quien ya está a punto de decidir y dile exactamente cuál es el siguiente paso.',
  conectar: 'Cuenta lo humano de lo que pasó. Sin épica ni frases de póster.',
  demostrar: 'Enseña el resultado concreto que ya ocurrió, con lo que la evidencia sostenga.',
}

export function defaultObjectiveFor(type: string): PieceObjective {
  return OBJECTIVE_BY_TYPE[type] ?? 'educar'
}

export function normalizeObjective(value?: string | null): PieceObjective | null {
  const clean = value?.trim().toLowerCase()
  return PIECE_OBJECTIVES.includes(clean as PieceObjective) ? (clean as PieceObjective) : null
}

/** Canales publicables. Coincide con el selector del copiloto y con Metricool. */
export const PIECE_CHANNELS = ['instagram', 'linkedin', 'facebook', 'tiktok', 'youtube', 'x'] as const
export type PieceChannel = (typeof PIECE_CHANNELS)[number]

/**
 * Canales válidos y sin repetir. Lo que no se reconoce se cae en vez de viajar
 * hasta Metricool y fallar allí, donde el usuario ya no puede corregirlo; si no
 * queda ninguno se usa Instagram, que es lo que hacía el circuito antes de que
 * el Estudio pudiera elegir.
 */
export function normalizeChannels(values?: string[] | null): PieceChannel[] {
  const clean = (values ?? [])
    .map(value => String(value ?? '').trim().toLowerCase())
    .filter((value): value is PieceChannel => PIECE_CHANNELS.includes(value as PieceChannel))
  const unique = Array.from(new Set(clean))
  return unique.length ? unique : ['instagram']
}

/** Minutos que se estima que ahorra cada formato frente a escribirlo a mano. */
const MINUTES_SAVED: Record<PieceFormat, number> = {
  post: 15,
  carousel: 45,
  reel_script: 30,
  stories: 20,
  email: 35,
  // La locución no se escribe: es grabar el guion. Lo que ahorra es el estudio,
  // no la redacción, así que cuenta menos que la pieza de la que sale.
  voiceover: 20,
}

export class StudioError extends Error {}

function getClient(): Anthropic | null {
  const apiKey = process.env.CLAUDE_API_KEY
  return apiKey ? new Anthropic({ apiKey }) : null
}

const STUDIO_PROMPT = `Eres el redactor de una agencia de contenido para pymes españolas.
Recibes una oportunidad detectada en conversaciones reales con clientes y escribes cinco piezas sobre ELLA.

Reglas innegociables:
- Te apoyas SOLO en la evidencia que recibes. No inventes cifras, plazos, precios, garantías ni testimonios.
- Si la evidencia no da para afirmar algo, no lo afirmes.
- Español de España, sin superlativos vacíos ni lenguaje de folleto.
- Concreto antes que genérico: "amplia experiencia" o "precios competitivos" no dicen nada. Si tienes un dato verificado, úsalo; si no lo tienes, di menos en vez de rellenar.
- Las cinco piezas cuentan lo mismo en formatos distintos, no cinco cosas distintas.

Devuelve SOLO JSON válido:
{
 "post": {"text": "..."},
 "carousel": {"title": "...", "slides": ["...", "...", "..."]},
 "reel_script": {"hook": "...", "body": "...", "cta": "..."},
 "stories": {"stories": [{"text": "...", "sticker": "..."}, {"text": "...", "sticker": "..."}, {"text": "...", "sticker": "..."}]},
 "email": {"subject": "...", "preheader": "...", "body": "...", "cta": "..."}
}
El carrusel lleva entre 5 y 7 slides. El hook del Reel dura 3 segundos leído.
Las stories son exactamente 3: gancho, desarrollo y cierre. Cada una con una frase corta ("text", máximo 120 caracteres) y una interacción sugerida ("sticker": encuesta, pregunta, cuenta atrás o similar, en una frase).
El email va en texto plano, con párrafos separados por líneas en blanco: sin HTML y sin firma.`

interface GeneratedPieces {
  post: { text: string }
  carousel: { title: string; slides: string[] }
  reel_script: { hook: string; body: string; cta: string }
  stories: { stories: { text: string; sticker: string }[] }
  email: { subject: string; preheader: string; body: string; cta: string }
}

/**
 * Respaldo determinista. No pretende sustituir al modelo: construye piezas
 * honestas con el material de la oportunidad para que el Estudio se pueda usar
 * y revisar sin clave, en vez de quedarse en blanco.
 */
function deterministicPieces(opportunity: { title: string; summary: string; evidenceSummary: string | null }): GeneratedPieces {
  const evidencia = opportunity.evidenceSummary ?? opportunity.summary
  return {
    post: { text: `${opportunity.title}\n\n${opportunity.summary}\n\nSi es tu caso, cuéntanoslo y te respondemos con claridad.` },
    carousel: {
      title: opportunity.title,
      slides: [
        opportunity.title,
        opportunity.summary,
        `Lo que nos preguntáis: ${evidencia}`,
        'Nuestra respuesta, sin letra pequeña.',
        'Cuéntanos tu caso y te lo concretamos.',
      ],
    },
    reel_script: {
      hook: opportunity.title,
      body: opportunity.summary,
      cta: 'Escríbenos y te lo aclaramos en una conversación.',
    },
    stories: {
      stories: [
        { text: opportunity.title, sticker: 'Encuesta: ¿te ha pasado? Sí / No' },
        { text: opportunity.summary.slice(0, 120), sticker: 'Caja de preguntas: ¿qué te falta por saber?' },
        { text: 'Te lo contamos sin letra pequeña.', sticker: 'Enlace: escríbenos' },
      ],
    },
    email: {
      subject: opportunity.title,
      preheader: opportunity.summary.slice(0, 120),
      body: `${opportunity.summary}\n\nLo que nos preguntáis: ${evidencia}\n\nSi es tu caso, respóndenos a este correo y te lo concretamos.`,
      cta: 'Responder a este correo',
    },
  }
}

async function askStudio(
  opportunity: {
    title: string
    summary: string
    evidenceSummary: string | null
    objective: PieceObjective
    focus: string | null
    channels: PieceChannel[]
  },
  voice: string | null,
  // Datos comprobables del negocio. Van en el prompt y no solo en el chequeo
  // posterior: escribir concreto de primeras sale más barato que reescribir.
  facts: string | null,
): Promise<GeneratedPieces> {
  const client = getClient()
  if (!client) return deterministicPieces(opportunity)

  const system = [STUDIO_PROMPT, voice ? `Voz del negocio:\n${voice}` : null, facts].filter(Boolean).join('\n\n')

  try {
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
      max_tokens: 2500,
      system,
      messages: [{
        role: 'user',
        content: JSON.stringify({
          oportunidad: opportunity.title,
          resumen: opportunity.summary,
          evidencias: opportunity.evidenceSummary,
          // El objetivo lo elige la persona en el Estudio; el del detector se
          // pasa como enfoque, que es lo que era: una sugerencia del análisis.
          objetivo: OBJECTIVE_BRIEF[opportunity.objective],
          enfoqueSugerido: opportunity.focus,
          canales: opportunity.channels,
        }),
      }],
    })
    const block = response.content.find(item => item.type === 'text')
    if (!block || block.type !== 'text') return deterministicPieces(opportunity)
    const parsed = JSON.parse(block.text.replace(/^```json\s*|\s*```$/g, '').trim())
    if (!parsed?.post?.text || !Array.isArray(parsed?.carousel?.slides) || !parsed?.reel_script?.hook) {
      return deterministicPieces(opportunity)
    }
    // Formato a formato: que el modelo se deje las stories no puede tirar el
    // post que sí escribió bien. Lo que falte se rellena con el respaldo, y la
    // pieza sale como saldría sin clave, que es peor pero no está vacía.
    return withFallbacks(parsed, deterministicPieces(opportunity))
  } catch {
    // Un fallo del proveedor no deja el Estudio en blanco.
    return deterministicPieces(opportunity)
  }
}

/** Qué tiene que traer cada formato para considerarse escrito. */
const FORMAT_IS_COMPLETE: Record<string, (body: any) => boolean> = {
  post: body => Boolean(body?.text?.trim()),
  carousel: body => Boolean(body?.title?.trim()) && Array.isArray(body?.slides) && body.slides.filter(Boolean).length >= 3,
  reel_script: body => Boolean(body?.hook?.trim() && body?.body?.trim() && body?.cta?.trim()),
  stories: body => Array.isArray(body?.stories) && body.stories.filter((story: any) => story?.text?.trim()).length >= 3,
  email: body => Boolean(body?.subject?.trim() && body?.body?.trim()),
}

export function withFallbacks(parsed: any, fallback: GeneratedPieces): GeneratedPieces {
  const result = { ...fallback }
  for (const format of WRITTEN_FORMATS) {
    const candidate = parsed?.[format]
    if (candidate && FORMAT_IS_COMPLETE[format](candidate)) (result as any)[format] = candidate
  }
  // Tres stories, ni dos ni siete: el formato es la trilogía gancho, desarrollo
  // y cierre, y una cuarta rompe la pauta con la que se aprueban en bloque.
  result.stories = { stories: (result.stories?.stories ?? []).slice(0, 3) }
  return result
}

/**
 * El informe que viaja con la pieza. Guarda las marcas, no el texto anterior:
 * lo que la Sala tiene que poder responder es "¿de dónde sale este dato?" y
 * "¿qué frase sigue sin sostenerse?", y para eso basta la frase, el documento
 * que la respalda y el motivo.
 */
function specificityReport(report: CriticReport, facts: BrandFact[]) {
  return {
    checkedAt: new Date().toISOString(),
    replaced: report.specificity.replaced,
    unresolved: report.specificity.unresolved,
    factsAvailable: facts.length,
    flags: report.specificity.flags,
  }
}

/**
 * La otra mitad del informe: lo que hizo el editor adversario. Se guarda sin las
 * marcas de especificidad —ya viajan en su propia columna— para que la Sala
 * pueda enseñar "esto es lo que el editor te avisa" sin repetir la lista.
 */
function criticReport(report: CriticReport) {
  return {
    version: report.version,
    pii: report.pii,
    critique: report.critique,
    passed: report.passed,
  }
}

/**
 * Genera las seis piezas de una oportunidad y las guarda como borradores.
 *
 * Reemplaza los borradores anteriores de la misma oportunidad: volver a generar
 * es rehacer, no acumular. Las piezas ya enviadas a aprobación no se tocan.
 */
export async function generatePieces(
  orgId: string,
  opportunityId: string,
  options: { campaignId?: string; channels?: string[]; objective?: string; createdById?: string } = {},
) {
  const opportunity = await prisma.contentOpportunity.findFirst({ where: { id: opportunityId, orgId } })
  if (!opportunity) throw new StudioError('Oportunidad no encontrada')

  // Objetivo y canales los decide el Estudio (§2); si no llegan, se cae al
  // objetivo natural del tipo de oportunidad y al canal de siempre.
  const objective = normalizeObjective(options.objective) ?? defaultObjectiveFor(opportunity.type)
  const channels = normalizeChannels(options.channels)

  // La campaña se comprueba contra la organización: sin esto, un id de otra
  // organización enlazaría la pieza a su landing y su atribución.
  if (options.campaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: options.campaignId, orgId }, select: { id: true } })
    if (!campaign) throw new StudioError('La campaña no existe o no es de tu organización.')
  }

  const profile = await getOwnerVoice(orgId)
  // Lo aprendido de los rechazos viaja al redactor: es lo que evita repetir el
  // error que ya costó un rechazo (pantallas.md §3).
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } })
  const learned = ((org?.settings ?? {}) as { contentPreferences?: { learned?: { reason: string; count: number }[] } }).contentPreferences?.learned ?? []
  const preferences = preferenceInstructions(learned)
  const facts = await extractBrandFacts(orgId)
  const pieces = await askStudio(
    {
      title: opportunity.title,
      summary: opportunity.summary,
      evidenceSummary: opportunity.evidenceSummary,
      objective,
      focus: opportunity.objective,
      channels,
    },
    [voiceInstructions(profile), preferences].filter(Boolean).join('\n') || null,
    factsInstructions(facts),
  )

  await prisma.contentPiece.deleteMany({ where: { orgId, opportunityId, status: 'draft' } })

  /**
   * Editor adversario (idea 21): PII enmascarada, especificidad resuelta con la
   * base de conocimiento (idea 27) y crítica + reescritura. Ninguna pieza llega
   * a la pantalla sin pasar por aquí; sin clave siguen corriendo los dos pasos
   * deterministas, que son los que protegen. Los cinco formatos se revisan a la
   * vez porque son cinco llamadas independientes: en serie multiplicarían por
   * cinco la espera del Estudio.
   */
  const orgProfile = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, phone: true, email: true },
  })
  const reviewed = Object.fromEntries(await Promise.all(WRITTEN_FORMATS.map(async format => [
    format,
    await reviewPiece(format, pieces[format] as unknown as Record<string, unknown>, {
      evidence: opportunity.evidenceSummary ?? opportunity.summary,
      facts,
      voice: voiceInstructions(profile),
      own: { phone: orgProfile?.phone, email: orgProfile?.email },
    }),
  ]))) as Record<string, Awaited<ReturnType<typeof reviewPiece>>>

  // Carrusel con plantilla de marca (idea 7). Se maqueta **después** de la
  // revisión: componer las slides de un texto que el editor va a reescribir es
  // trabajo tirado. Si falla, el carrusel sigue siendo texto aprobable.
  const brand = await getBrandKit(orgId)
  const slides = await publishCarouselSlides(
    brand,
    reviewed.carousel.body as { title?: string; slides?: unknown[] },
    { businessName: orgProfile?.name },
  ).catch(() => ({ urls: [] as string[], reason: 'Las slides no se pudieron componer con la plantilla de marca.' }))
  if (slides.urls.length) {
    reviewed.carousel.body.slideImages = slides.urls
    reviewed.carousel.body.brandTemplate = { usesDefaultColors: brand.isDefault, primary: brand.primary }
  } else {
    reviewed.carousel.body.slidesMissingReason = slides.reason
  }

  // Locución (idea 8): el guion ya revisado pasa por el stack TTS propio. La
  // pieza existe aunque no haya motor de voz —es el guion locutable con el
  // motivo de por qué todavía no suena—, porque el guion se aprueba igual.
  const script = voiceoverScript(reviewed.reel_script.body as { hook?: string; body?: string; cta?: string })
  const voiceover = await synthesizeVoiceover(script).catch(() => ({
    audioUrl: null,
    reason: 'El motor de voz falló al locutar el guion.',
  } as VoiceoverFailure))

  const bodies: Record<PieceFormat, Record<string, unknown>> = {
    ...(Object.fromEntries(WRITTEN_FORMATS.map(format => [format, reviewed[format].body])) as Record<PieceFormat, Record<string, unknown>>),
    voiceover: {
      ...(reviewed.reel_script.body as Record<string, unknown>),
      script,
      provider: 'provider' in voiceover ? voiceover.provider : null,
      estimatedSeconds: 'estimatedSeconds' in voiceover ? voiceover.estimatedSeconds : estimateSeconds(script),
      missingReason: voiceover.audioUrl ? null : (voiceover as VoiceoverFailure).reason,
    },
  } as Record<PieceFormat, Record<string, unknown>>

  /** La locución hereda la revisión del guion: es exactamente el mismo texto. */
  const reviewOf = (format: PieceFormat) => reviewed[format === 'voiceover' ? 'reel_script' : format]

  const created = await prisma.$transaction(PIECE_FORMATS.map(format => prisma.contentPiece.create({
    data: {
      orgId,
      opportunityId,
      campaignId: options.campaignId ?? null,
      format,
      channels,
      objective,
      body: bodies[format] as Prisma.InputJsonObject,
      specificity: specificityReport(reviewOf(format).report, facts) as unknown as Prisma.InputJsonObject,
      // El informe del editor va aparte del de especificidad: uno dice qué le
      // vio el crítico y si enmascaró PII, el otro de qué documento sale cada
      // dato. Mezclarlos habría hecho ilegibles los dos.
      reviewReport: criticReport(reviewOf(format).report) as unknown as Prisma.InputJsonObject,
      // Las evidencias viajan con la pieza: se muestran al pie y sobreviven
      // aunque la oportunidad se descarte después.
      evidenceSummary: opportunity.evidenceSummary ?? opportunity.summary,
      voiceVersion: profile?.version ?? null,
      minutesSaved: MINUTES_SAVED[format],
      audioUrl: format === 'voiceover' ? voiceover.audioUrl : null,
      // UTM propio: sin esto dos piezas de la misma campaña y canal son
      // indistinguibles y "leads por pieza" no se puede calcular (§4).
      utmContent: `pieza-${format}-${opportunity.id.slice(-8)}`,
      createdById: options.createdById ?? null,
      status: 'draft',
    },
  })))

  await prisma.contentOpportunity.update({ where: { id: opportunityId }, data: { status: 'generated' } })

  const reports = WRITTEN_FORMATS.map(format => reviewed[format].report)

  return {
    pieces: created,
    voice: profile ? { version: profile.version, sampleSize: profile.sampleSize } : null,
    // La interfaz necesita saberlo para no prometer una voz que no existe.
    voiceMissingReason: profile ? null : 'Todavía no hay perfil de voz: hacen falta más transcripciones del negocio.',
    generatedBy: getClient() ? 'ai' : 'deterministic',
    // Resumen del chequeo para la cabecera del Estudio: cuántas vaguedades se
    // sustituyeron con datos reales y cuántas siguen esperando un dato que el
    // negocio todavía no ha escrito en ningún sitio.
    specificity: {
      factsAvailable: facts.length,
      replaced: reports.reduce((total, report) => total + report.specificity.replaced, 0),
      unresolved: reports.reduce((total, report) => total + report.specificity.unresolved, 0),
      // Sin base de conocimiento el chequeo solo puede marcar: conviene decirlo
      // en vez de dejar creer que no había nada genérico que sustituir.
      knowledgeMissing: facts.length === 0,
    },
    review: {
      ran: reports.some(report => report.critique.ran),
      rewritten: reports.filter(report => report.critique.rewritten).length,
      piiMasked: reports.reduce((total, report) => total + report.pii.masked, 0),
      issues: reports.reduce((total, report) => total + report.critique.issues.length, 0),
    },
    voiceover: {
      audioUrl: voiceover.audioUrl,
      missingReason: voiceover.audioUrl ? null : (voiceover as VoiceoverFailure).reason,
    },
    carousel: {
      slides: slides.urls.length,
      usesDefaultColors: brand.isDefault,
      missingReason: slides.urls.length ? null : slides.reason,
    },
  }
}

/**
 * Imagen de la pieza — `pantallas.md` §2 ("subir o generar").
 *
 * El esquema vive en el servicio, no en el controlador, porque no es una
 * formalidad de transporte: la URL acaba en un `<img>` de la interfaz y en el
 * borrador que Metricool descarga. `javascript:` o `data:` pasarían el
 * `.url()` de zod y no son imágenes que nadie pueda descargar, así que se
 * exige http(s) explícitamente.
 *
 * `null` limpia la imagen: quitarla es una decisión tan legítima como ponerla.
 */
export const pieceImageSchema = z.object({
  imageUrl: z.union([
    z.string().trim().max(2_048).url().refine(value => /^https?:\/\//i.test(value), 'La imagen debe ser una URL http(s)'),
    z.null(),
  ]),
}).strict()

/**
 * Fija (o quita) la imagen de una pieza. La imagen viaja sola hasta el
 * borrador: `approveAndDraft` ya se la pasa a `createDraftPost`.
 *
 * Una pieza publicada no cambia de imagen: su borrador ya salió con la que
 * tenía, y tocarla aquí solo mentiría sobre lo que se publicó.
 */
export async function setPieceImage(orgId: string, pieceId: string, imageUrl: string | null) {
  const piece = await prisma.contentPiece.findFirst({ where: { id: pieceId, orgId } })
  if (!piece) throw new StudioError('Pieza no encontrada')
  if (piece.status === 'published') {
    throw new StudioError('La pieza ya está publicada: su borrador salió con la imagen que tenía.')
  }

  return prisma.contentPiece.update({ where: { id: pieceId }, data: { imageUrl } })
}

export async function listPieces(orgId: string, opportunityId?: string) {
  return prisma.contentPiece.findMany({
    where: { orgId, ...(opportunityId ? { opportunityId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })
}
