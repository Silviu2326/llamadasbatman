import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { askJson, smartModel, fastModel } from '../lib/deepseek'
import { runCapability } from '../providers/runCapability'
import { route, RoutingError } from '../providers/router'
import { registerCoreCapabilityContracts } from '../providers/capabilities'
import { enqueueStudioPost } from './studioPost.service'
import { createAssetFromBuffer, publishAsset } from './assets.service'
import * as metricoolSync from './metricoolSync.service'
import { getBusinessProfileSource } from './businessProfile.service'
import { getBrandKit } from './brandKit.service'
import {
  VOICEOVER_CHARS_PER_SECOND,
  buildStoryboardPrompt,
  checkBudget,
  storyboardAspectRatio,
  voiceoverCharBudget,
  voiceoverSeconds,
} from './studioPlanning'

/**
 * Studio de Cine v0 — preproducción (docs/plataforma-abierta/06-STUDIO-DE-CINE.md §1-§3).
 *
 * Pipeline: brief → conceptos → guion → shot list → storyboard. Los pasos de
 * texto (conceptos, guion, desglose) son SÍNCRONOS vía DeepSeek (segundos, no
 * necesitan Job); los storyboards son Jobs de image.generate vía runCapability
 * y el frontend los ve por el socket 'job:update'. Todo lo pesado (coste,
 * proveedor, asset) vive en Job + Asset — el Studio no inventa su propia media.
 */

export class StudioServiceError extends Error {
  statusCode: number
  code: string
  constructor(message: string, code: string, statusCode = 400) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Brief validado por el controlador; el servicio confía en esta forma. */
export interface ProductionBrief {
  objective: string
  audience: string
  channel: string
  durationS: number
  cta?: string
  references?: string[]
  constraints?: string
  rights?: string
}

// ---------------------------------------------------------------------------
// Producciones
// ---------------------------------------------------------------------------

export async function createProduction(params: {
  orgId: string
  title: string
  brief: ProductionBrief
  budgetCents?: number
  brandScope?: string
  createdById: string
}) {
  // Precarga de marca y negocio en el brief:
  // - de businessProfile: nombre/industria de la empresa, descripción,
  //   propuesta de valor, cliente ideal, diferenciadores y ofertas activas —
  //   contexto que conceptos y guion usan sin que el usuario reescriba su
  //   empresa. Si el brief no trae audiencia útil, el cliente ideal la rellena.
  //   Los "forbiddenClaims" de los guardarraíles se anexan a constraints: una
  //   afirmación prohibida en ventas también lo está en un anuncio.
  // - de brandKit: paleta, tipografía y logo para el mundo visual de los
  //   storyboards. Solo si la org lo personalizó (isDefault=false): unos
  //   colores por defecto de plataforma no son "su marca".
  const [source, brand] = await Promise.all([
    getBusinessProfileSource(params.orgId),
    getBrandKit(params.orgId),
  ])

  const brief: JsonRecord = { ...params.brief }
  if (source) {
    const profile = source.profile
    brief.business = {
      companyName: source.company.name,
      industry: source.company.industry,
      website: source.company.website,
      description: profile.description,
      valueProposition: profile.valueProposition,
      idealCustomer: profile.idealCustomer,
      differentiators: profile.differentiators,
      offers: profile.offers
        .filter((offer) => offer.active && offer.name.trim())
        .map((offer) => ({ name: offer.name, description: offer.description })),
    }
    if (!params.brief.audience.trim() && profile.idealCustomer.trim()) {
      brief.audience = profile.idealCustomer
    }
    const forbidden = profile.commercialGuardrails.forbiddenClaims.trim()
    if (forbidden) {
      brief.constraints = [params.brief.constraints?.trim(), `No afirmar nunca: ${forbidden}`]
        .filter(Boolean)
        .join('\n')
    }
  }
  if (!brand.isDefault) {
    brief.brand = {
      primary: brand.primary,
      secondary: brand.secondary,
      text: brand.text,
      logoUrl: brand.logoUrl,
      fontFamily: brand.fontFamily,
    }
  }

  return prisma.production.create({
    data: {
      orgId: params.orgId,
      title: params.title,
      brief: brief as unknown as Prisma.InputJsonValue,
      budgetCents: params.budgetCents ?? null,
      brandScope: params.brandScope ?? null,
      createdById: params.createdById,
    },
  })
}

export async function listProductions(orgId: string) {
  return prisma.production.findMany({
    where: { orgId, archivedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { concepts: true, scenes: true, bibleEntries: true } } },
  })
}

export async function getProduction(params: { orgId: string; productionId: string }) {
  // SIEMPRE where orgId: un id de otra org se comporta como inexistente.
  const production = await prisma.production.findFirst({
    where: { id: params.productionId, orgId: params.orgId, archivedAt: null },
    include: {
      concepts: { orderBy: { createdAt: 'asc' } },
      bibleEntries: { orderBy: { createdAt: 'asc' } },
      scenes: {
        orderBy: { order: 'asc' },
        include: {
          shots: {
            orderBy: { order: 'asc' },
            include: { takes: { orderBy: { createdAt: 'asc' } } },
          },
        },
      },
    },
  })
  if (!production) return null
  // Los masters viven como Assets (no como una FK redundante en Production).
  // Se inspecciona un lote acotado de exports recientes de la org y se filtra
  // por el productionId trazado en params. Evita depender de queries JSON
  // específicas de PostgreSQL y mantiene el endpoint portable para tests.
  const candidates = await prisma.asset.findMany({
    where: { orgId: params.orgId, kind: 'video', provider: 'vendrava-media-worker' },
    select: { id: true, mimeType: true, status: true, accessClass: true, publishedUrl: true, params: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const exports = candidates.filter(asset => asText(asRecord(asset.params).productionId) === production.id)
  return { ...production, exports }
}

async function requireProduction(orgId: string, productionId: string) {
  const production = await prisma.production.findFirst({ where: { id: productionId, orgId, archivedAt: null } })
  if (!production) throw new StudioServiceError('Producción no encontrada', 'PRODUCTION_NOT_FOUND', 404)
  return production
}

export async function updateProduction(params: { orgId: string; productionId: string; title?: string; brief?: Partial<ProductionBrief>; budgetCents?: number | null; brandScope?: string | null }) {
  const current = await requireProduction(params.orgId, params.productionId)
  const brief = params.brief ? { ...asRecord(current.brief), ...params.brief } : undefined
  return prisma.production.update({
    where: { id: current.id },
    data: { title: params.title, brief: brief as Prisma.InputJsonValue | undefined, budgetCents: params.budgetCents, brandScope: params.brandScope },
  })
}

export async function archiveProduction(params: { orgId: string; productionId: string }) {
  const production = await requireProduction(params.orgId, params.productionId)
  const takeJobs = await prisma.take.findMany({ where: { orgId: params.orgId, shot: { scene: { productionId: production.id } } }, select: { jobId: true } })
  const active = takeJobs.length ? await prisma.job.count({ where: { id: { in: takeJobs.map(take => take.jobId) }, orgId: params.orgId, status: { in: ['pending', 'running', 'waiting_provider', 'cancel_requested'] } } }) : 0
  if (active) throw new StudioServiceError('No se puede archivar mientras hay trabajos activos', 'PRODUCTION_HAS_ACTIVE_JOBS', 409)
  return prisma.production.update({ where: { id: production.id }, data: { archivedAt: new Date() } })
}

export async function exportProductionMetadata(params: { orgId: string; productionId: string }) {
  const production = await getProduction(params)
  if (!production) throw new StudioServiceError('Producción no encontrada', 'PRODUCTION_NOT_FOUND', 404)
  const assetIds = new Set<string>()
  for (const entry of production.bibleEntries) for (const id of entry.refAssetIds) assetIds.add(id)
  for (const scene of production.scenes) for (const shot of scene.shots) {
    if (shot.storyboardAssetId) assetIds.add(shot.storyboardAssetId)
    for (const take of shot.takes) if (take.assetId) assetIds.add(take.assetId)
  }
  const assets = assetIds.size ? await prisma.asset.findMany({ where: { orgId: params.orgId, id: { in: [...assetIds] } }, select: { id: true, kind: true, mimeType: true, bytes: true, width: true, height: true, durationMs: true, checksum: true, provider: true, model: true, costCents: true, currency: true, status: true, accessClass: true, createdAt: true } }) : []
  const payload = {
    schemaVersion: production.exportVersion,
    exportedAt: new Date().toISOString(),
    production: { id: production.id, title: production.title, status: production.status, brief: production.brief, budgetCents: production.budgetCents, spentCents: production.spentCents, brandScope: production.brandScope, createdAt: production.createdAt, updatedAt: production.updatedAt },
    concepts: production.concepts,
    bibleEntries: production.bibleEntries,
    scenes: production.scenes,
    assets: assets.map(asset => ({ ...asset, bytes: asset.bytes.toString(), costCents: asset.costCents?.toString() ?? null })),
  }
  return { ...payload, checksum: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}` }
}

// ---------------------------------------------------------------------------
// Conceptos (§4.2.3 de la visión: 3 direcciones creativas realmente distintas)
// ---------------------------------------------------------------------------

const conceptSchema = z.object({
  title: z.string().min(1).max(200),
  logline: z.string().min(1).max(500),
  promise: z.string().min(1),
  emotion: z.string().min(1),
  risk: z.string().min(1),
  visualWorld: z.string().min(1),
  treatment: z.string().min(1),
  estimatedProductionCost: z.string().min(1),
})
const conceptsResponseSchema = z.object({ concepts: z.array(conceptSchema).min(3) })

export async function generateConcepts(params: { orgId: string; productionId: string }) {
  const production = await requireProduction(params.orgId, params.productionId)

  // Una tirada de conceptos con el razonador no es gratis: si ya hay
  // propuestas sin decidir, se rechaza en alto en vez de duplicar en silencio.
  const pending = await prisma.concept.count({
    where: { orgId: params.orgId, productionId: production.id, status: 'proposed' },
  })
  if (pending > 0) {
    throw new StudioServiceError(
      `Ya hay ${pending} conceptos propuestos sin decidir en esta producción. Aprueba uno o descártalos antes de generar otra tanda.`,
      'CONCEPTS_PENDING_DECISION',
      409,
    )
  }

  const brief = asRecord(production.brief)
  const prompt = [
    'Eres el director creativo de un estudio publicitario. A partir de este brief, propone EXACTAMENTE 3 direcciones creativas realmente distintas entre sí (no variaciones de la misma idea): distinta promesa, distinta emoción dominante y distinto mundo visual.',
    '',
    `BRIEF:\n${JSON.stringify(brief, null, 2)}`,
    '',
    'Para cada dirección devuelve: title, logline (1 frase), promise (la promesa al espectador), emotion (emoción dominante), risk (qué riesgo creativo asume esta dirección), visualWorld (el mundo visual: paleta, texturas, localizaciones), treatment (tratamiento corto: sinopsis de 3-5 frases y tono), estimatedProductionCost (coste estimado de producirla con IA generativa, DECLARADO EXPLÍCITAMENTE como estimación orientativa, ej. "≈ 8-15 € en generación, estimación no vinculante").',
    '',
    'Responde SOLO con JSON: {"concepts": [{...}, {...}, {...}]}',
  ].join('\n')

  const raw = await askJson<unknown>({
    model: smartModel(),
    prompt,
    maxTokens: 4000,
    label: 'studio.concepts',
    usage: { orgId: params.orgId, feature: 'studio.concepts' },
  })
  const parsed = conceptsResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new StudioServiceError(
      'El generador no devolvió 3 conceptos válidos. Inténtalo de nuevo.',
      'CONCEPTS_GENERATION_FAILED',
      502,
    )
  }

  const three = parsed.data.concepts.slice(0, 3)
  // createMany no devuelve filas: se crean una a una dentro de la transacción
  // para devolverlas al frontend junto con el cambio de estado.
  const created = await prisma.$transaction(async (tx) => {
    const rows = []
    for (const concept of three) {
      rows.push(await tx.concept.create({
        data: {
          orgId: params.orgId,
          productionId: production.id,
          title: concept.title,
          logline: concept.logline,
          treatment: {
            promise: concept.promise,
            emotion: concept.emotion,
            risk: concept.risk,
            visualWorld: concept.visualWorld,
            treatment: concept.treatment,
            // El coste va declarado como estimación, nunca como precio.
            estimatedProductionCost: concept.estimatedProductionCost,
            isEstimate: true,
          } as unknown as Prisma.InputJsonValue,
        },
      }))
    }
    await tx.production.update({ where: { id: production.id }, data: { status: 'concepts' } })
    return rows
  })

  return created
}

export async function approveConcept(params: { orgId: string; productionId: string; conceptId: string }) {
  const production = await requireProduction(params.orgId, params.productionId)
  const concept = await prisma.concept.findFirst({
    where: { id: params.conceptId, orgId: params.orgId, productionId: production.id },
  })
  if (!concept) throw new StudioServiceError('Concepto no encontrado', 'CONCEPT_NOT_FOUND', 404)

  const [approved] = await prisma.$transaction([
    prisma.concept.update({ where: { id: concept.id }, data: { status: 'approved' } }),
    prisma.concept.updateMany({
      where: { productionId: production.id, orgId: params.orgId, id: { not: concept.id } },
      data: { status: 'discarded' },
    }),
    prisma.production.update({ where: { id: production.id }, data: { status: 'script' } }),
  ])
  return approved
}

// ---------------------------------------------------------------------------
// Guion por escenas
// ---------------------------------------------------------------------------

const scriptSceneSchema = z.object({
  order: z.number().int().min(1).optional(),
  action: z.string().min(1),
  dialogue: z.string().optional(),
  vo: z.string().optional(),
  textOnScreen: z.string().optional(),
  cta: z.string().optional(),
  estimatedSeconds: z.number().nonnegative().optional(),
})
const scriptResponseSchema = z.object({ scenes: z.array(scriptSceneSchema).min(1).max(24) })

export async function generateScript(params: { orgId: string; productionId: string }) {
  const production = await requireProduction(params.orgId, params.productionId)
  const approved = await prisma.concept.findFirst({
    where: { orgId: params.orgId, productionId: production.id, status: 'approved' },
  })
  if (!approved) {
    throw new StudioServiceError(
      'No hay concepto aprobado: aprueba una dirección creativa antes de escribir el guion.',
      'NO_APPROVED_CONCEPT',
      409,
    )
  }

  const brief = asRecord(production.brief)
  const durationS = typeof brief.durationS === 'number' && brief.durationS > 0 ? brief.durationS : 30
  const charBudget = voiceoverCharBudget(durationS)

  const prompt = [
    `Eres guionista publicitario. Escribe el guion por escenas de una pieza de ${durationS} segundos para el canal "${asText(brief.channel) || 'social'}".`,
    '',
    `CONCEPTO APROBADO:\n${JSON.stringify({ title: approved.title, logline: approved.logline, treatment: approved.treatment }, null, 2)}`,
    '',
    `BRIEF:\n${JSON.stringify(brief, null, 2)}`,
    '',
    `REGLA DE LOCUCIÓN: la voz en off se lee a ~${VOICEOVER_CHARS_PER_SECOND} caracteres por segundo. El total de caracteres de "vo" + "dialogue" de todas las escenas NO puede superar ${charBudget} caracteres. Ajusta cada escena a ese ritmo.`,
    '',
    'Devuelve SOLO JSON: {"scenes": [{"order": 1, "action": "qué se ve", "vo": "voz en off (opcional)", "dialogue": "diálogo (opcional)", "textOnScreen": "texto en pantalla (opcional)", "cta": "llamada a la acción (opcional, normalmente solo en la última escena)", "estimatedSeconds": 5}]}',
  ].join('\n')

  const raw = await askJson<unknown>({
    model: smartModel(),
    prompt,
    maxTokens: 6000,
    label: 'studio.script',
    usage: { orgId: params.orgId, feature: 'studio.script' },
  })
  // El razonador a veces devuelve el array pelado: se acepta también.
  const candidate = Array.isArray(raw) ? { scenes: raw } : raw
  const parsed = scriptResponseSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new StudioServiceError(
      'El guionista no devolvió escenas válidas. Inténtalo de nuevo.',
      'SCRIPT_GENERATION_FAILED',
      502,
    )
  }

  const scenes = parsed.data.scenes
  const created = await prisma.$transaction(async (tx) => {
    // Regeneración explícita: se borran las escenas previas (los shots y takes
    // colgados caen por el onDelete: Cascade del esquema).
    await tx.scene.deleteMany({ where: { productionId: production.id, orgId: params.orgId } })
    const rows = []
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index]
      const spoken = `${scene.vo ?? ''} ${scene.dialogue ?? ''}`.trim()
      rows.push(await tx.scene.create({
        data: {
          orgId: params.orgId,
          productionId: production.id,
          order: index + 1,
          scriptText: {
            action: scene.action,
            ...(scene.vo ? { vo: scene.vo } : {}),
            ...(scene.dialogue ? { dialogue: scene.dialogue } : {}),
            ...(scene.textOnScreen ? { textOnScreen: scene.textOnScreen } : {}),
            ...(scene.cta ? { cta: scene.cta } : {}),
            estimatedSeconds: scene.estimatedSeconds ?? null,
            // Se declara el cálculo en el propio JSON, como pide el pipeline:
            // segundos de locución de ESTA escena al ritmo estándar.
            voSeconds: voiceoverSeconds(spoken),
            voCharsPerSecond: VOICEOVER_CHARS_PER_SECOND,
          } as unknown as Prisma.InputJsonValue,
        },
      }))
    }
    await tx.production.update({ where: { id: production.id }, data: { status: 'storyboard' } })
    return rows
  })

  return created
}

// ---------------------------------------------------------------------------
// Shot list (microapp #50: desglose de planos por escena)
// ---------------------------------------------------------------------------

const shotSpecSchema = z.object({
  durationS: z.number().min(1).max(30).catch(3),
  framing: z.string().min(1),
  movement: z.string().min(1),
  action: z.string().min(1),
  audio: z.string().catch(''),
  recommendedTier: z.enum(['draft', 'premium']).catch('draft'),
})
const shotListResponseSchema = z.object({
  scenes: z.array(z.object({
    order: z.number().int().min(1),
    shots: z.array(shotSpecSchema).min(1).max(8),
  })).min(1),
})

export async function generateShotList(params: { orgId: string; productionId: string }) {
  const production = await requireProduction(params.orgId, params.productionId)
  const scenes = await prisma.scene.findMany({
    where: { orgId: params.orgId, productionId: production.id },
    orderBy: { order: 'asc' },
  })
  if (!scenes.length) {
    throw new StudioServiceError(
      'No hay guion: genera las escenas antes del desglose de planos.',
      'NO_SCENES',
      409,
    )
  }

  // Una sola llamada para todas las escenas (en vez de N llamadas): la salida
  // sigue siendo un desglose por escena, pero con una fracción de la latencia
  // y del coste. Modelo rápido con JSON nativo: esto es extracción
  // estructurada, no criterio creativo.
  const prompt = [
    'Eres director de fotografía. Desglosa cada escena de este guion en planos rodables (1-4 planos por escena).',
    '',
    `ESCENAS:\n${JSON.stringify(scenes.map((scene) => ({ order: scene.order, script: scene.scriptText })), null, 2)}`,
    '',
    'Para cada plano: durationS (segundos, 1-8 normalmente), framing (encuadre: plano general, medio, detalle...), movement (movimiento de cámara: estático, travelling, paneo...), action (qué ocurre exactamente en el plano), audio (qué se oye: VO, música, ambiente), recommendedTier ("draft" para planos simples, "premium" solo si el plano exige calidad de render alta: rostros protagonistas, producto en detalle).',
    '',
    'Responde SOLO con JSON: {"scenes": [{"order": 1, "shots": [{...}]}]}',
  ].join('\n')

  const raw = await askJson<unknown>({
    model: fastModel(),
    prompt,
    maxTokens: 6000,
    label: 'studio.shotlist',
    usage: { orgId: params.orgId, feature: 'studio.shotlist' },
  })
  const parsed = shotListResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new StudioServiceError(
      'El desglose de planos no devolvió una estructura válida. Inténtalo de nuevo.',
      'SHOTLIST_GENERATION_FAILED',
      502,
    )
  }

  const byOrder = new Map(parsed.data.scenes.map((entry) => [entry.order, entry.shots]))
  const created = await prisma.$transaction(async (tx) => {
    const rows = []
    for (const scene of scenes) {
      const specs = byOrder.get(scene.order)
      if (!specs) continue
      // Regeneración explícita del desglose de esa escena (takes en cascada).
      await tx.shot.deleteMany({ where: { sceneId: scene.id, orgId: params.orgId } })
      for (let index = 0; index < specs.length; index += 1) {
        const spec = specs[index]
        rows.push(await tx.shot.create({
          data: {
            orgId: params.orgId,
            sceneId: scene.id,
            order: index + 1,
            status: 'planned',
            spec: {
              durationS: spec.durationS,
              framing: spec.framing,
              movement: spec.movement,
              action: spec.action,
              audio: spec.audio,
              recommendedTier: spec.recommendedTier,
            } as unknown as Prisma.InputJsonValue,
          },
        }))
      }
    }
    return rows
  })

  if (!created.length) {
    throw new StudioServiceError(
      'El desglose no cubrió ninguna escena existente. Inténtalo de nuevo.',
      'SHOTLIST_EMPTY',
      502,
    )
  }
  return created
}

// ---------------------------------------------------------------------------
// Storyboard (Jobs de image.generate)
// ---------------------------------------------------------------------------

interface ShotWithScene {
  id: string
  order: number
  status: string
  spec: unknown
  storyboardAssetId: string | null
  scene: { id: string; order: number; scriptText: unknown }
}

/** Diferencia que hay que aplicar al gasto ya reservado al cerrar un render. */
export function storyboardBudgetAdjustment(reservationCents: number, actualCents: number | null): number {
  const reservation = Math.max(0, Number.isFinite(reservationCents) ? reservationCents : 0)
  if (actualCents == null) return -reservation
  const actual = Math.max(0, Number.isFinite(actualCents) ? actualCents : 0)
  return actual - reservation
}

function bibleNotes(entries: Array<{ kind: string; name: string; data: unknown }>, kind: string): string[] {
  return entries
    .filter((entry) => entry.kind === kind)
    .map((entry) => `${entry.name}: ${JSON.stringify(entry.data).slice(0, 400)}`)
}

export async function generateStoryboard(params: {
  orgId: string
  productionId: string
  shotIds?: string[]
  createdById?: string
}) {
  const production = await requireProduction(params.orgId, params.productionId)
  const [allShots, bible] = await Promise.all([
    prisma.shot.findMany({
      where: { orgId: params.orgId, scene: { productionId: production.id } },
      include: { scene: { select: { id: true, order: true, scriptText: true } } },
      orderBy: [{ scene: { order: 'asc' } }, { order: 'asc' }],
    }) as Promise<ShotWithScene[]>,
    prisma.productionBibleEntry.findMany({
      where: { orgId: params.orgId, productionId: production.id },
    }),
  ])

  // Sin shotIds: todos los planos aún sin tablero. Con shotIds: exactamente
  // esos (regeneración explícita), pero nunca uno que ya está generando —
  // relanzar un job en vuelo duplicaría coste en silencio.
  let targets: ShotWithScene[]
  if (params.shotIds?.length) {
    const wanted = new Set(params.shotIds)
    targets = allShots.filter((shot) => wanted.has(shot.id))
    if (targets.length !== wanted.size) {
      throw new StudioServiceError('Algún shotId no pertenece a esta producción', 'SHOT_NOT_FOUND', 404)
    }
    const inFlight = targets.filter((shot) => shot.status === 'generating')
    if (inFlight.length) {
      throw new StudioServiceError(
        `Hay ${inFlight.length} planos con storyboard en curso; sincroniza antes de relanzarlos.`,
        'STORYBOARD_IN_FLIGHT',
        409,
      )
    }
  } else {
    targets = allShots.filter((shot) => shot.status === 'planned')
  }
  if (!targets.length) {
    throw new StudioServiceError('No hay planos pendientes de storyboard', 'NO_SHOTS_PENDING', 409)
  }

  const brief = asRecord(production.brief)
  const aspectRatio = storyboardAspectRatio(
    asText(brief.channel),
    typeof brief.durationS === 'number' ? brief.durationS : undefined,
  )

  // Referencias visuales de la biblia (estilo/personaje/producto): assetIds
  // maestros adjuntos al prompt — la consistencia de personaje de v0 (§3.5).
  const refAssetIds = bible
    .filter((entry) => ['style', 'character', 'product'].includes(entry.kind))
    .flatMap((entry) => entry.refAssetIds)
    .slice(0, 8)
  const styleNotes = bibleNotes(bible, 'style').concat(bibleNotes(bible, 'rule'))
  const characterNotes = bibleNotes(bible, 'character')
  const productNotes = bibleNotes(bible, 'product')
  const locationNotes = bibleNotes(bible, 'location')

  // Presupuesto duro ANTES de lanzar nada: estimación del router (una llamada
  // representativa × número de planos; el coste de image.generate no depende
  // del prompt). La estimación se reserva con UPDATE condicional: dos peticiones
  // concurrentes no pueden aprobarse ambas sobre el mismo saldo disponible.
  registerCoreCapabilityContracts()
  const probe = await route({
    orgId: params.orgId,
    capability: 'image.generate',
    input: { prompt: 'storyboard frame', aspectRatio, quality: 'draft', count: 1 },
  })
  const estimatePerShotCents = Math.ceil(probe.decision.estimateCents)
  const estimateCents = estimatePerShotCents * targets.length
  const budget = checkBudget(production.budgetCents, production.spentCents, estimateCents)
  if (!budget.ok) {
    throw new StudioServiceError(
      `Presupuesto insuficiente: lanzar ${targets.length} storyboards cuesta ≈${estimateCents} cts y quedan ${budget.remainingCents} cts (faltan ${budget.shortfallCents}).`,
      'BUDGET_EXCEEDED',
      402,
    )
  }

  const budgetWhere = production.budgetCents == null
    ? { id: production.id, orgId: params.orgId }
    : { id: production.id, orgId: params.orgId, spentCents: { lte: production.budgetCents - estimateCents } }
  const reserved = await prisma.production.updateMany({
    where: budgetWhere,
    data: { spentCents: { increment: estimateCents } },
  })
  if (reserved.count !== 1) {
    throw new StudioServiceError('El presupuesto cambió mientras se preparaba el storyboard. Revisa el saldo y vuelve a intentarlo.', 'BUDGET_EXCEEDED', 402)
  }

  const launched: Array<{ shotId: string; jobId: string }> = []
  let attempted = 0
  try {
    for (const shot of targets) {
    attempted += 1
    const spec = asRecord(shot.spec)
    const script = asRecord(shot.scene.scriptText)
    const prompt = buildStoryboardPrompt({
      framing: asText(spec.framing) || 'plano medio',
      movement: asText(spec.movement) || 'estático',
      action: asText(spec.action) || asText(script.action) || 'acción del plano',
      sceneContext: asText(script.action) || undefined,
      styleNotes,
      characterNotes,
      productNotes,
      locationNotes,
    })

    const { jobId } = await runCapability({
      orgId: params.orgId,
      capability: 'image.generate',
      // Tier draft: el storyboard es un fotograma de trabajo, no un entregable.
      input: {
        prompt,
        aspectRatio,
        quality: 'draft',
        count: 1,
        ...(refAssetIds.length ? { refAssetIds } : {}),
      },
      createdById: params.createdById,
    })

    // Los storyboards NO son Takes (las tomas son vídeo): el vínculo con su
    // Job vive en spec._storyboardJobId hasta que syncStoryboards lo resuelva.
    await prisma.shot.update({
      where: { id: shot.id },
      data: {
        status: 'generating',
        spec: { ...spec, _storyboardJobId: jobId, _storyboardError: null, _storyboardReservationCents: estimatePerShotCents } as unknown as Prisma.InputJsonValue,
      },
    })
    launched.push({ shotId: shot.id, jobId })
    }
  } catch (error) {
    const unusedReservation = Math.max(0, targets.length - attempted) * estimatePerShotCents
    if (unusedReservation > 0) {
      await prisma.production.updateMany({
        where: { id: production.id, orgId: params.orgId },
        data: { spentCents: { decrement: unusedReservation } },
      }).catch(() => undefined)
    }
    throw error
  }

  return { launched, aspectRatio, estimateCents }
}

/**
 * Consolida los storyboards cuyos Jobs terminaron: copia el asset al Shot
 * (status 'boarded'), devuelve los fallos al estado 'planned' con el motivo, y
 * acumula el coste real (costActualCents) en Production.spentCents. Solo toca
 * shots en 'generating', así que cada job se contabiliza una única vez.
 */
export async function syncStoryboards(params: { orgId: string; productionId: string }) {
  const production = await requireProduction(params.orgId, params.productionId)
  const generating = await prisma.shot.findMany({
    where: { orgId: params.orgId, status: 'generating', scene: { productionId: production.id } },
  })
  if (!generating.length) return { boarded: 0, failed: 0, pending: 0, spentAddedCents: 0 }

  const jobIds = generating
    .map((shot) => asText(asRecord(shot.spec)._storyboardJobId))
    .filter(Boolean)
  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds }, orgId: params.orgId } })
  const jobById = new Map(jobs.map((job) => [job.id, job]))

  let boarded = 0
  let failed = 0
  let pending = 0
  let spentAddedCents = 0

  for (const shot of generating) {
    const spec = asRecord(shot.spec)
    const reservationCents = Math.max(0, Number(spec._storyboardReservationCents ?? 0) || 0)
    const job = jobById.get(asText(spec._storyboardJobId))
    if (!job) {
      // Job desaparecido o de otra org: el plano vuelve a la casilla de salida.
      await prisma.$transaction(async (tx) => {
        await tx.shot.update({
          where: { id: shot.id },
          data: {
            status: 'planned',
            spec: { ...spec, _storyboardError: 'Job de storyboard no encontrado', _storyboardReservationCents: 0 } as unknown as Prisma.InputJsonValue,
          },
        })
        if (reservationCents) await tx.production.update({ where: { id: production.id }, data: { spentCents: { decrement: reservationCents } } })
      })
      spentAddedCents += storyboardBudgetAdjustment(reservationCents, null)
      failed += 1
      continue
    }

    if (job.status === 'succeeded') {
      const assetId = asText((asRecord(job.output).assetIds as unknown[] | undefined)?.[0])
      if (assetId) {
        const actualCents = Number(job.costActualCents ?? job.costEstimateCents ?? 0)
        const adjustment = storyboardBudgetAdjustment(reservationCents, actualCents)
        await prisma.$transaction(async (tx) => {
          await tx.shot.update({
            where: { id: shot.id },
            data: {
              status: 'boarded',
              storyboardAssetId: assetId,
              spec: { ...spec, _storyboardError: null, _storyboardReservationCents: 0 } as unknown as Prisma.InputJsonValue,
            },
          })
          if (adjustment) await tx.production.update({ where: { id: production.id }, data: { spentCents: { increment: adjustment } } })
        })
        boarded += 1
        spentAddedCents += adjustment
        continue
      }
      // succeeded sin asset es un contrato roto del proveedor: se trata como fallo.
    }

    if (job.status === 'failed' || job.status === 'canceled' || job.status === 'succeeded') {
      const message = asText(asRecord(job.error).message) || `Job ${job.status} sin asset`
      await prisma.$transaction(async (tx) => {
        await tx.shot.update({
          where: { id: shot.id },
          data: {
            status: 'planned',
            spec: { ...spec, _storyboardError: message, _storyboardReservationCents: 0 } as unknown as Prisma.InputJsonValue,
          },
        })
        if (reservationCents) await tx.production.update({ where: { id: production.id }, data: { spentCents: { decrement: reservationCents } } })
      })
      spentAddedCents += storyboardBudgetAdjustment(reservationCents, null)
      failed += 1
      continue
    }

    pending += 1
  }

  return { boarded, failed, pending, spentAddedCents }
}

// ---------------------------------------------------------------------------
// Estimación de producción
// ---------------------------------------------------------------------------

export interface ProductionEstimate {
  storyboardsCents: number
  takesCents?: number
  postCents: number
  totalCents: number
  unavailable?: string[]
  budgetCents: number | null
  spentCents: number
  remainingBudgetCents: number | null
  requiresMaxCostConfirmation: true
  breakdown: {
    v0: { pendingStoryboards: number; estimateCents: number }
    v1: { takesPerShot: 1; shots: Array<{ shotId: string; durationS: number; estimateCents: number }>; estimateCents: number | null }
    v2: {
      upscales: Array<{ takeId: string; assetId: string; durationS: number; estimateCents: number }>
      upscaleEstimateCents: number | null
      post: { operation: 'local_ffmpeg_post'; estimateCents: 0; confidence: 'exact'; note: string }
      estimateCents: number | null
    }
  }
}

export async function estimateProduction(params: { orgId: string; productionId: string }): Promise<ProductionEstimate> {
  const production = await requireProduction(params.orgId, params.productionId)
  const shots = await prisma.shot.findMany({
    where: { orgId: params.orgId, scene: { productionId: production.id } },
  })

  registerCoreCapabilityContracts()
  const unavailable: string[] = []

  // Storyboards pendientes: el precio de image.generate no depende del prompt,
  // así que basta una estimación representativa multiplicada por los planos
  // sin tablero.
  let storyboardsCents = 0
  const pendingBoards = shots.filter((shot) => !shot.storyboardAssetId).length
  if (pendingBoards > 0) {
    try {
      const probe = await route({
        orgId: params.orgId,
        capability: 'image.generate',
        input: { prompt: 'storyboard frame', quality: 'draft', count: 1 },
      })
      storyboardsCents = Math.ceil(probe.decision.estimateCents) * pendingBoards
    } catch (error) {
      if (error instanceof RoutingError) unavailable.push(`image.generate: ${error.message}`)
      else throw error
    }
  }

  // Tomas: el coste de video.generate SÍ depende de la duración del plano, así
  // que se estima por shot. Si no hay proveedor de vídeo registrado (v0), se
  // declara en vez de fallar: el estimado sigue sirviendo para storyboards.
  let takesCents: number | undefined
  const takeBreakdown: Array<{ shotId: string; durationS: number; estimateCents: number }> = []
  let videoUnavailable = false
  for (const shot of shots) {
    if (videoUnavailable) break
    const spec = asRecord(shot.spec)
    const rawDuration = typeof spec.durationS === 'number' ? spec.durationS : 5
    // Gen-4.5 admite 2-10 s por task; un plano más largo se recorta a 10 s
    // en v1 y debe dividirse en shot list si necesita más duración.
    const durationS = Math.min(10, Math.max(2, Math.round(rawDuration)))
    try {
      const routed = await route({
        orgId: params.orgId,
        capability: 'video.generate',
        input: {
          prompt: asText(spec.action) || 'plano',
          durationS,
          quality: spec.recommendedTier === 'premium' ? 'final' : 'draft',
        },
      })
      const shotEstimate = Math.ceil(routed.decision.estimateCents)
      takesCents = (takesCents ?? 0) + shotEstimate
      takeBreakdown.push({ shotId: shot.id, durationS, estimateCents: shotEstimate })
    } catch (error) {
      if (error instanceof RoutingError && (error.code === 'NO_PROVIDERS' || error.code === 'NO_VIABLE_PROVIDER')) {
        unavailable.push('video.generate: vídeo no disponible aún')
        videoUnavailable = true
        takesCents = undefined
      } else if (error instanceof RoutingError) {
        unavailable.push(`video.generate: ${error.message}`)
        videoUnavailable = true
        takesCents = undefined
      } else {
        throw error
      }
    }
  }

  // v2: una mejora 2K por cada toma seleccionada. El detalle por toma evita
  // que la UI presente un total opaco y permite confirmar maxCostCents antes
  // de cada upscale.
  const selectedTakes = await prisma.take.findMany({
    where: { orgId: params.orgId, selected: true, assetId: { not: null }, shot: { scene: { productionId: production.id } } },
  })
  const selectedAssets = await prisma.asset.findMany({
    where: { orgId: params.orgId, id: { in: selectedTakes.map(take => take.assetId!).filter(Boolean) } },
  })
  const assetById = new Map(selectedAssets.map(asset => [asset.id, asset]))
  const upscaleBreakdown: Array<{ takeId: string; assetId: string; durationS: number; estimateCents: number }> = []
  let upscaleCents: number | undefined = selectedTakes.length ? 0 : undefined
  for (const take of selectedTakes) {
    if (!take.assetId) continue
    const asset = assetById.get(take.assetId)
    const meta = asRecord(asset?.params)
    const durationS = asset?.durationMs ? asset.durationMs / 1000 : typeof meta.durationS === 'number' ? meta.durationS : 5
    try {
      const routed = await route({
        orgId: params.orgId,
        capability: 'video.upscale',
        input: { assetId: take.assetId, durationS, fps: 30, resolution: '2k' },
        preferences: { providerId: 'runway', tier: 'premium' },
      })
      const estimateCents = Math.ceil(routed.decision.estimateCents)
      upscaleCents = (upscaleCents ?? 0) + estimateCents
      upscaleBreakdown.push({ takeId: take.id, assetId: take.assetId, durationS, estimateCents })
    } catch (error) {
      if (error instanceof RoutingError) {
        unavailable.push(`video.upscale: ${error.message}`)
        upscaleCents = undefined
        break
      }
      throw error
    }
  }

  return {
    storyboardsCents,
    ...(takesCents !== undefined ? { takesCents } : {}),
    postCents: 0,
    totalCents: storyboardsCents + (takesCents ?? 0) + (upscaleCents ?? 0),
    ...(unavailable.length ? { unavailable } : {}),
    budgetCents: production.budgetCents,
    spentCents: production.spentCents,
    remainingBudgetCents: production.budgetCents == null ? null : production.budgetCents - production.spentCents,
    requiresMaxCostConfirmation: true,
    breakdown: {
      v0: { pendingStoryboards: pendingBoards, estimateCents: storyboardsCents },
      v1: { takesPerShot: 1, shots: takeBreakdown, estimateCents: takesCents ?? null },
      v2: {
        upscales: upscaleBreakdown,
        upscaleEstimateCents: upscaleCents ?? null,
        post: {
          operation: 'local_ffmpeg_post',
          estimateCents: 0,
          confidence: 'exact',
          note: 'Sin coste de proveedor; el consumo de infraestructura se observa por separado.',
        },
        estimateCents: upscaleCents ?? null,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Studio v1 — tomas de vídeo
// ---------------------------------------------------------------------------

function takePrompt(shot: ShotWithScene): string {
  const spec = asRecord(shot.spec)
  const script = asRecord(shot.scene.scriptText)
  return [
    asText(spec.action) || asText(script.action) || 'Acción cinematográfica del plano',
    `Encuadre: ${asText(spec.framing) || 'plano medio'}.`,
    `Cámara: ${asText(spec.movement) || 'movimiento suave'}.`,
    'Movimiento natural, continuidad visual, sin texto añadido ni marcas de agua.',
  ].join(' ').slice(0, 1000)
}

interface RoutedTake {
  shot: ShotWithScene
  estimateCents: number
  prompt: string
  durationS: number
  refAssetIds: string[]
}

export async function generateTakes(params: {
  orgId: string
  productionId: string
  shotIds?: string[]
  takesPerShot: number
  quality: 'draft' | 'final'
  providerId?: string
  maxCostCents: number
  createdById?: string
  idempotencyKey?: string
}) {
  const production = await requireProduction(params.orgId, params.productionId)
  const shots = await prisma.shot.findMany({
    where: {
      orgId: params.orgId,
      scene: { productionId: production.id },
      ...(params.shotIds?.length ? { id: { in: params.shotIds } } : {}),
    },
    include: { scene: { select: { id: true, order: true, scriptText: true } } },
    orderBy: [{ scene: { order: 'asc' } }, { order: 'asc' }],
  }) as ShotWithScene[]
  if (!shots.length) throw new StudioServiceError('No hay planos para generar', 'NO_SHOTS', 409)
  if (params.shotIds?.length && new Set(params.shotIds).size !== shots.length) {
    throw new StudioServiceError('Algún shotId no pertenece a esta producción', 'SHOT_NOT_FOUND', 404)
  }

  const routed: RoutedTake[] = []
  for (const shot of shots) {
    const spec = asRecord(shot.spec)
    const rawDuration = typeof spec.durationS === 'number' ? spec.durationS : 5
    const durationS = Math.max(2, Math.min(10, Math.round(rawDuration)))
    const prompt = takePrompt(shot)
    const refAssetIds = shot.storyboardAssetId ? [shot.storyboardAssetId] : []
    const candidate = await route({
      orgId: params.orgId,
      capability: 'video.generate',
      input: { prompt, durationS, aspectRatio: '9:16', quality: params.quality, refAssetIds },
      preferences: { ...(params.providerId ? { providerId: params.providerId } : {}), tier: params.quality === 'final' ? 'premium' : 'draft' },
    })
    const estimateCents = Math.ceil(candidate.decision.estimateCents)
    for (let index = 0; index < params.takesPerShot; index += 1) {
      routed.push({ shot, estimateCents, prompt, durationS, refAssetIds })
    }
  }
  const estimateCents = routed.reduce((sum, item) => sum + item.estimateCents, 0)
  if (estimateCents > params.maxCostCents) {
    throw new StudioServiceError(
      `La generación cuesta ≈${estimateCents} cts, por encima del máximo confirmado (${params.maxCostCents} cts).`,
      'COST_CONFIRMATION_EXCEEDED',
      409,
    )
  }

  if (params.idempotencyKey) {
    const existingJobs = await prisma.job.findMany({
      where: {
        orgId: params.orgId,
        kind: 'video.generate',
        idempotencyKey: { startsWith: `${params.idempotencyKey}:` },
      },
    })
    if (existingJobs.length) {
      const existingTakes = await prisma.take.findMany({
        where: { orgId: params.orgId, jobId: { in: existingJobs.map(job => job.id) } },
      })
      return {
        launched: existingTakes.map(take => ({
          shotId: take.shotId,
          takeId: take.id,
          jobId: take.jobId,
          estimateCents: Number(asRecord(take.qcReport).budgetReservationCents ?? 0),
        })),
        estimateCents: existingTakes.reduce((sum, take) => sum + Number(asRecord(take.qcReport).budgetReservationCents ?? 0), 0),
        maxCostCents: params.maxCostCents,
        idempotentReplay: true,
      }
    }
  }

  // Reserva dura usando el único campo de presupuesto disponible en el
  // esquema: spentCents representa gasto comprometido. syncTakes reconcilia
  // estimado vs real o libera el compromiso si el job falla.
  const budgetWhere = production.budgetCents == null
    ? { id: production.id, orgId: params.orgId }
    : { id: production.id, orgId: params.orgId, spentCents: { lte: production.budgetCents - estimateCents } }
  const reserved = await prisma.production.updateMany({
    where: budgetWhere,
    data: { spentCents: { increment: estimateCents }, status: 'shooting' },
  })
  if (reserved.count !== 1) {
    const fresh = await requireProduction(params.orgId, production.id)
    const remaining = fresh.budgetCents == null ? null : fresh.budgetCents - fresh.spentCents
    throw new StudioServiceError(
      `Presupuesto insuficiente: se necesitan ${estimateCents} cts y quedan ${remaining ?? 0} cts.`,
      'BUDGET_EXCEEDED',
      402,
    )
  }

  const launched: Array<{ shotId: string; takeId: string; jobId: string; estimateCents: number }> = []
  let launchedReservation = 0
  try {
    for (let index = 0; index < routed.length; index += 1) {
      const item = routed[index]!
      const result = await runCapability({
        orgId: params.orgId,
        capability: 'video.generate',
        input: {
          prompt: item.prompt,
          durationS: item.durationS,
          aspectRatio: '9:16',
          quality: params.quality,
          ...(item.refAssetIds.length ? { refAssetIds: item.refAssetIds } : {}),
        },
        preferences: {
          ...(params.providerId ? { providerId: params.providerId } : {}),
          maxCostCents: item.estimateCents,
          tier: params.quality === 'final' ? 'premium' : 'draft',
        },
        createdById: params.createdById,
        idempotencyKey: params.idempotencyKey ? `${params.idempotencyKey}:${item.shot.id}:${index}` : undefined,
      })
      const take = await prisma.take.create({
        data: {
          orgId: params.orgId,
          shotId: item.shot.id,
          jobId: result.jobId,
          tier: params.quality,
          qcReport: {
            budgetReservationCents: item.estimateCents,
            budgetSettled: false,
            requestedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      })
      launchedReservation += item.estimateCents
      launched.push({ shotId: item.shot.id, takeId: take.id, jobId: result.jobId, estimateCents: item.estimateCents })
    }
    await prisma.shot.updateMany({ where: { id: { in: shots.map(shot => shot.id) }, orgId: params.orgId }, data: { status: 'generating' } })
  } catch (error) {
    const unused = estimateCents - launchedReservation
    if (unused > 0) {
      await prisma.production.update({ where: { id: production.id }, data: { spentCents: { decrement: unused } } }).catch(() => undefined)
    }
    throw error
  }
  return { launched, estimateCents, maxCostCents: params.maxCostCents }
}

export async function syncTakes(params: { orgId: string; productionId: string }) {
  const production = await requireProduction(params.orgId, params.productionId)
  const takes = await prisma.take.findMany({
    where: { orgId: params.orgId, shot: { scene: { productionId: production.id } } },
  })
  const jobs = await prisma.job.findMany({ where: { orgId: params.orgId, id: { in: takes.map(take => take.jobId) } } })
  const byId = new Map(jobs.map(job => [job.id, job]))
  let ready = 0
  let failed = 0
  let pending = 0
  let budgetAdjustmentCents = 0

  for (const candidate of takes) {
    const job = byId.get(candidate.jobId)
    if (!job || !['succeeded', 'failed', 'canceled'].includes(job.status)) { pending += 1; continue }
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Take" WHERE "id" = ${candidate.id} FOR UPDATE`
      const current = await tx.take.findFirst({ where: { id: candidate.id, orgId: params.orgId } })
      if (!current) return
      const report = asRecord(current.qcReport)
      if (report.budgetSettled === true) return
      const reservedCents = Number(report.budgetReservationCents ?? 0)
      const assetId = job.status === 'succeeded'
        ? asText((asRecord(job.output).assetIds as unknown[] | undefined)?.[0])
        : ''
      const actualCents = assetId ? Number(job.costActualCents ?? job.costEstimateCents ?? reservedCents) : 0
      const adjustment = Math.round(actualCents) - reservedCents
      await tx.take.update({
        where: { id: current.id },
        data: {
          ...(assetId ? { assetId } : {}),
          qcReport: {
            ...report,
            budgetSettled: true,
            budgetActualCents: actualCents,
            jobStatus: job.status,
            ...(assetId ? {} : { error: asText(asRecord(job.error).message) || `Job ${job.status}` }),
          } as unknown as Prisma.InputJsonValue,
        },
      })
      if (adjustment !== 0) {
        await tx.production.update({ where: { id: production.id }, data: { spentCents: { increment: adjustment } } })
      }
      budgetAdjustmentCents += adjustment
      if (assetId) ready += 1
      else failed += 1
    })
  }

  // Reconciliación de upscales v2. El job original de la toma permanece como
  // genealogía; el id del upscale vive en qcReport por falta de relación
  // dedicada en el esquema actual.
  const upscaleJobIds = takes
    .map(take => asText(asRecord(take.qcReport).upscaleJobId))
    .filter(Boolean)
  const upscaleJobs = await prisma.job.findMany({ where: { orgId: params.orgId, id: { in: upscaleJobIds } } })
  const upscaleById = new Map(upscaleJobs.map(job => [job.id, job]))
  for (const candidate of takes) {
    const initialReport = asRecord(candidate.qcReport)
    const upscaleJobId = asText(initialReport.upscaleJobId)
    const job = upscaleById.get(upscaleJobId)
    if (!job || !['succeeded', 'failed', 'canceled'].includes(job.status)) continue
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Take" WHERE "id" = ${candidate.id} FOR UPDATE`
      const current = await tx.take.findFirst({ where: { id: candidate.id, orgId: params.orgId } })
      if (!current) return
      const report = asRecord(current.qcReport)
      if (report.upscaleSettled === true || asText(report.upscaleJobId) !== job.id) return
      const reservedCents = Number(report.upscaleReservationCents ?? 0)
      const assetId = job.status === 'succeeded'
        ? asText((asRecord(job.output).assetIds as unknown[] | undefined)?.[0])
        : ''
      const actualCents = assetId ? Number(job.costActualCents ?? job.costEstimateCents ?? reservedCents) : 0
      const adjustment = Math.round(actualCents) - reservedCents
      await tx.take.update({
        where: { id: current.id },
        data: {
          ...(assetId ? { assetId } : {}),
          qcReport: {
            ...report,
            upscaleSettled: true,
            upscaleActualCents: actualCents,
            upscaleStatus: job.status,
            ...(assetId ? { upscaledAssetId: assetId } : { upscaleError: asText(asRecord(job.error).message) || `Job ${job.status}` }),
          } as unknown as Prisma.InputJsonValue,
        },
      })
      if (adjustment !== 0) await tx.production.update({ where: { id: production.id }, data: { spentCents: { increment: adjustment } } })
      budgetAdjustmentCents += adjustment
    })
  }

  const shots = await prisma.shot.findMany({
    where: { orgId: params.orgId, scene: { productionId: production.id } },
    include: { takes: { select: { assetId: true, qcReport: true } } },
  })
  for (const shot of shots) {
    if (shot.takes.some(take => Boolean(take.assetId))) {
      await prisma.shot.updateMany({ where: { id: shot.id, orgId: params.orgId }, data: { status: 'takes_ready' } })
    } else if (shot.takes.length && shot.takes.every(take => asRecord(take.qcReport).budgetSettled === true)) {
      await prisma.shot.updateMany({ where: { id: shot.id, orgId: params.orgId }, data: { status: shot.storyboardAssetId ? 'boarded' : 'planned' } })
    }
  }
  return { ready, failed, pending, budgetAdjustmentCents }
}

export async function listTakeTable(params: { orgId: string; productionId: string }) {
  const production = await requireProduction(params.orgId, params.productionId)
  const scenes = await prisma.scene.findMany({
    where: { orgId: params.orgId, productionId: production.id },
    orderBy: { order: 'asc' },
    include: { shots: { orderBy: { order: 'asc' }, include: { takes: { orderBy: { createdAt: 'asc' } } } } },
  })
  const jobIds = scenes.flatMap(scene => scene.shots.flatMap(shot => shot.takes.map(take => take.jobId)))
  const jobs = await prisma.job.findMany({ where: { orgId: params.orgId, id: { in: jobIds } } })
  const byJob = new Map(jobs.map(job => [job.id, {
    id: job.id,
    status: job.status,
    provider: job.provider,
    progress: job.progress,
    costEstimateCents: job.costEstimateCents == null ? null : Number(job.costEstimateCents),
    costActualCents: job.costActualCents == null ? null : Number(job.costActualCents),
    error: job.error,
  }]))
  return scenes.map(scene => ({
    id: scene.id,
    order: scene.order,
    shots: scene.shots.map(shot => ({ ...shot, takes: shot.takes.map(take => ({ ...take, job: byJob.get(take.jobId) ?? null })) })),
  }))
}

export async function selectTake(params: { orgId: string; productionId: string; shotId: string; takeId: string }) {
  await requireProduction(params.orgId, params.productionId)
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT s."id" FROM "Shot" s JOIN "Scene" sc ON sc."id" = s."sceneId" WHERE s."id" = ${params.shotId} AND s."orgId" = ${params.orgId} AND sc."productionId" = ${params.productionId} FOR UPDATE`
    const take = await tx.take.findFirst({ where: { id: params.takeId, shotId: params.shotId, orgId: params.orgId } })
    if (!take || !take.assetId) throw new StudioServiceError('La toma no existe o aún no tiene clip', 'TAKE_NOT_READY', 409)
    await tx.take.updateMany({ where: { shotId: params.shotId, orgId: params.orgId, selected: true }, data: { selected: false } })
    const selected = await tx.take.update({ where: { id: take.id }, data: { selected: true } })
    await tx.shot.update({ where: { id: params.shotId }, data: { status: 'approved' } })
    return selected
  })
}

export async function upscaleTake(params: {
  orgId: string
  productionId: string
  takeId: string
  resolution: '720p' | '1k' | '2k' | '4k'
  maxCostCents: number
  createdById?: string
  idempotencyKey?: string
}) {
  const production = await requireProduction(params.orgId, params.productionId)
  const take = await prisma.take.findFirst({
    where: { id: params.takeId, orgId: params.orgId, shot: { scene: { productionId: production.id } } },
  })
  if (!take?.assetId) throw new StudioServiceError('La toma no está lista para mejorar', 'TAKE_NOT_READY', 409)
  const report = asRecord(take.qcReport)
  if (asText(report.upscaleJobId) && report.upscaleSettled !== true) {
    throw new StudioServiceError('Ya hay una mejora en curso para esta toma', 'UPSCALE_IN_FLIGHT', 409)
  }
  const asset = await prisma.asset.findFirst({ where: { id: take.assetId, orgId: params.orgId } })
  if (!asset) throw new StudioServiceError('El clip de la toma no existe', 'TAKE_ASSET_MISSING', 404)
  const assetParams = asRecord(asset.params)
  const durationS = asset.durationMs
    ? asset.durationMs / 1000
    : typeof assetParams.durationS === 'number'
      ? assetParams.durationS
      : 5
  const routed = await route({
    orgId: params.orgId,
    capability: 'video.upscale',
    input: { assetId: asset.id, durationS, fps: 30, resolution: params.resolution },
    preferences: { providerId: 'runway', tier: 'premium' },
  })
  const estimateCents = Math.ceil(routed.decision.estimateCents)
  if (estimateCents > params.maxCostCents) {
    throw new StudioServiceError(
      `La mejora cuesta ≈${estimateCents} cts, por encima del máximo confirmado (${params.maxCostCents} cts).`,
      'COST_CONFIRMATION_EXCEEDED',
      409,
    )
  }
  if (params.idempotencyKey) {
    const existing = await prisma.job.findUnique({
      where: { orgId_kind_idempotencyKey: { orgId: params.orgId, kind: 'video.upscale', idempotencyKey: params.idempotencyKey } },
    })
    if (existing) return { jobId: existing.id, estimateCents: Number(existing.costEstimateCents ?? estimateCents), maxCostCents: params.maxCostCents, idempotentReplay: true }
  }
  const budgetWhere = production.budgetCents == null
    ? { id: production.id, orgId: params.orgId }
    : { id: production.id, orgId: params.orgId, spentCents: { lte: production.budgetCents - estimateCents } }
  const reserved = await prisma.production.updateMany({ where: budgetWhere, data: { spentCents: { increment: estimateCents } } })
  if (reserved.count !== 1) throw new StudioServiceError('El upscale supera el presupuesto disponible', 'BUDGET_EXCEEDED', 402)
  try {
    const { jobId } = await runCapability({
      orgId: params.orgId,
      capability: 'video.upscale',
      input: { assetId: asset.id, durationS, fps: 30, resolution: params.resolution },
      preferences: { providerId: 'runway', tier: 'premium', maxCostCents: estimateCents },
      createdById: params.createdById,
      idempotencyKey: params.idempotencyKey,
    })
    await prisma.take.update({
      where: { id: take.id },
      data: {
        qcReport: {
          ...report,
          upscaleJobId: jobId,
          upscaleReservationCents: estimateCents,
          upscaleSettled: false,
          upscaleResolution: params.resolution,
        } as unknown as Prisma.InputJsonValue,
      },
    })
    return { jobId, estimateCents, maxCostCents: params.maxCostCents }
  } catch (error) {
    await prisma.production.update({ where: { id: production.id }, data: { spentCents: { decrement: estimateCents } } }).catch(() => undefined)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Studio v2 — post ligera y entregables documentales
// ---------------------------------------------------------------------------

export async function exportPost(params: {
  orgId: string
  productionId: string
  subtitleAssetId?: string
  audioAssetId?: string
  publish: boolean
  preset: 'source' | 'vertical' | 'square' | 'landscape'
  maxCostCents: number
  createdById?: string
  idempotencyKey?: string
}) {
  await requireProduction(params.orgId, params.productionId)
  const shots = await prisma.shot.findMany({
    where: { orgId: params.orgId, scene: { productionId: params.productionId } },
    orderBy: [{ scene: { order: 'asc' } }, { order: 'asc' }],
    include: { takes: { where: { selected: true }, take: 2 } },
  })
  if (!shots.length) throw new StudioServiceError('La producción no tiene planos', 'NO_SHOTS', 409)
  if (shots.some(shot => shot.takes.length !== 1 || !shot.takes[0]?.assetId)) {
    throw new StudioServiceError('Selecciona exactamente una toma terminada por plano antes de exportar', 'TAKES_INCOMPLETE', 409)
  }
  const estimateCents = 0 // FFmpeg local: coste de proveedor cero; infraestructura se mide aparte.
  if (estimateCents > params.maxCostCents) {
    throw new StudioServiceError('La exportación supera el coste máximo confirmado', 'COST_CONFIRMATION_EXCEEDED', 409)
  }
  if (params.subtitleAssetId || params.audioAssetId) {
    const ids = [params.subtitleAssetId, params.audioAssetId].filter((id): id is string => Boolean(id))
    const found = await prisma.asset.count({ where: { orgId: params.orgId, id: { in: ids } } })
    if (found !== new Set(ids).size) throw new StudioServiceError('Audio o subtítulos no pertenecen a la organización', 'POST_ASSET_NOT_FOUND', 404)
  }
  const selected = shots.map(shot => shot.takes[0]!)
  const job = await enqueueStudioPost({
    orgId: params.orgId,
    productionId: params.productionId,
    takeIds: selected.map(take => take.id),
    videoAssetIds: selected.map(take => take.assetId!),
    subtitleAssetId: params.subtitleAssetId,
    audioAssetId: params.audioAssetId,
    publish: params.publish,
    preset: params.preset,
    createdById: params.createdById,
    idempotencyKey: params.idempotencyKey,
  })
  await prisma.production.update({ where: { id: params.productionId }, data: { status: 'post' } })
  return { jobId: job.id, estimateCents, maxCostCents: params.maxCostCents }
}

function escapePdfText(value: string): string {
  return value.replace(/[^\x20-\x7eáéíóúÁÉÍÓÚñÑüÜ¿¡]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function simplePdf(lines: string[]): Buffer {
  const visible = lines.flatMap(line => {
    const text = line.trim() || ' '
    const chunks: string[] = []
    for (let start = 0; start < text.length; start += 88) chunks.push(text.slice(start, start + 88))
    return chunks
  }).slice(0, 52)
  const stream = ['BT', '/F1 10 Tf', '42 800 Td', ...visible.flatMap((line, index) => [index ? '0 -14 Td' : '', `(${escapePdfText(line)}) Tj`]).filter(Boolean), 'ET'].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'binary')
}

export async function exportProductionDocuments(params: { orgId: string; productionId: string; publish: boolean; createdById?: string }) {
  const production = await getProduction({ orgId: params.orgId, productionId: params.productionId })
  if (!production) throw new StudioServiceError('Producción no encontrada', 'PRODUCTION_NOT_FOUND', 404)
  const lines = [
    `# ${production.title}`,
    '',
    `Estado: ${production.status}`,
    `Presupuesto comprometido/gastado: ${production.spentCents} cts${production.budgetCents == null ? '' : ` de ${production.budgetCents} cts`}`,
    '',
    '## Brief',
    JSON.stringify(production.brief, null, 2),
    '',
    '## Conceptos',
    ...production.concepts.map(concept => `- [${concept.status}] ${concept.title}: ${concept.logline}`),
    '',
    '## Guion y planos',
    ...production.scenes.flatMap(scene => [
      `### Escena ${scene.order}`,
      JSON.stringify(scene.scriptText),
      ...scene.shots.map(shot => `- Plano ${shot.order} [${shot.status}]: ${JSON.stringify(shot.spec)} | tomas: ${shot.takes.length}`),
    ]),
  ]
  const markdown = Buffer.from(lines.join('\n'), 'utf8')
  const pdf = simplePdf(lines.map(line => line.replace(/^#+\s*/, '')).filter(Boolean))
  const [mdAsset, pdfAsset] = await Promise.all([
    createAssetFromBuffer({ orgId: params.orgId, buffer: markdown, filename: 'production.md', kind: 'document', mimeType: 'text/markdown', provider: 'vendrava-studio', model: 'document-export-v1', createdById: params.createdById, brandScope: production.brandScope ?? undefined, params: { productionId: production.id, format: 'markdown' } }),
    createAssetFromBuffer({ orgId: params.orgId, buffer: pdf, filename: 'production.pdf', kind: 'document', mimeType: 'application/pdf', provider: 'vendrava-studio', model: 'document-export-v1', createdById: params.createdById, brandScope: production.brandScope ?? undefined, params: { productionId: production.id, format: 'pdf' } }),
  ])
  const published = params.publish
    ? await Promise.all([publishAsset({ orgId: params.orgId, id: mdAsset.id }), publishAsset({ orgId: params.orgId, id: pdfAsset.id })])
    : []
  return { markdownAssetId: mdAsset.id, pdfAssetId: pdfAsset.id, published }
}

export function studioUtmContent(productionId: string, assetId: string): string {
  return `studio_${productionId}_${assetId}`
}

/**
 * Handoff directo Studio → Metricool con un UTM de pieza estable. Metricool
 * exige una URL pública que no caduque: por eso se publica primero la copia
 * inmutable del Asset y nunca se entrega la URL prefirmada del original.
 */
export async function publishStudioMaster(params: {
  orgId: string
  productionId: string
  assetId: string
  campaignId: string
  text: string
  platforms: string[]
  cta?: string
  scheduledAt?: string
}) {
  const production = await requireProduction(params.orgId, params.productionId)
  const asset = await prisma.asset.findFirst({
    where: { id: params.assetId, orgId: params.orgId, kind: 'video' },
    select: { id: true, params: true, publishedUrl: true, accessClass: true },
  })
  if (!asset || asText(asRecord(asset.params).productionId) !== production.id) {
    throw new StudioServiceError('El vídeo no es un master exportado por esta producción', 'STUDIO_MASTER_NOT_FOUND', 404)
  }
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.campaignId, orgId: params.orgId },
    select: { id: true, landingSlug: true },
  })
  if (!campaign) throw new StudioServiceError('La campaña no existe en esta organización', 'CAMPAIGN_NOT_FOUND', 404)
  if (!campaign.landingSlug) throw new StudioServiceError('La campaña necesita una landing publicada para atribuir el tráfico', 'CAMPAIGN_LANDING_REQUIRED', 409)
  if (!(await metricoolSync.isConfiguredForOrg(params.orgId))) {
    throw new StudioServiceError('Conecta Metricool antes de publicar desde Studio', 'METRICOOL_NOT_CONFIGURED', 409)
  }
  if (!metricoolSync.hasPublicFrontendUrl()) {
    throw new StudioServiceError('Configura APP_URL o FRONTEND_URL pública para generar enlaces UTM', 'PUBLIC_URL_NOT_CONFIGURED', 409)
  }
  const published = asset.accessClass === 'published' && asset.publishedUrl
    ? asset
    : await publishAsset({ orgId: params.orgId, id: asset.id })
  if (!published?.publishedUrl) throw new StudioServiceError('No se pudo crear la copia pública inmutable del vídeo', 'STUDIO_MASTER_PUBLISH_FAILED', 502)

  const utmContent = studioUtmContent(production.id, asset.id)
  try {
    const post = await metricoolSync.createDraftPost({
      text: params.text,
      imageUrl: published.publishedUrl,
      imageAssetId: asset.id,
      platforms: params.platforms,
      instagramType: 'REEL',
      attribution: { campaignId: campaign.id, landingSlug: campaign.landingSlug, utmContent, cta: params.cta },
      scheduledAt: params.scheduledAt,
    }, params.orgId)
    if (!post) throw new StudioServiceError('Metricool no confirmó el borrador del vídeo', 'METRICOOL_UPSTREAM_ERROR', 502)
    await prisma.production.update({ where: { id: production.id }, data: { status: 'delivered' } })
    return { assetId: asset.id, publishedUrl: published.publishedUrl, utmContent, platforms: params.platforms, post }
  } catch (error) {
    if (error instanceof StudioServiceError) throw error
    throw new StudioServiceError(error instanceof Error ? error.message : 'Metricool rechazó la publicación', 'STUDIO_PUBLICATION_BLOCKED', 409)
  }
}

// ---------------------------------------------------------------------------
// Biblia de producción
// ---------------------------------------------------------------------------

export const BIBLE_KINDS = ['character', 'product', 'location', 'style', 'rule'] as const
export type BibleKind = (typeof BIBLE_KINDS)[number]

/**
 * Un personaje que es una persona real exige ConsentGrant activo
 * (08-SEGURIDAD §2). Se valida la fila por Prisma directo a propósito, sin
 * acoplarse al servicio de consent que se desarrolla en paralelo.
 */
async function assertConsentIfRealPerson(params: {
  orgId: string
  kind: string
  data: unknown
  consentGrantId?: string | null
}) {
  const requiresGrant = params.kind === 'character' && asRecord(params.data).realPerson === true
  if (requiresGrant && !params.consentGrantId) {
    throw new StudioServiceError(
      'Un personaje basado en una persona real exige un consentimiento (consentGrantId).',
      'CONSENT_REQUIRED',
      422,
    )
  }
  if (!params.consentGrantId) return
  const grant = await prisma.consentGrant.findFirst({
    where: {
      id: params.consentGrantId,
      orgId: params.orgId,
      status: 'active',
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  })
  if (!grant) {
    throw new StudioServiceError(
      'El consentimiento indicado no existe, no es de esta organización o no está activo.',
      'CONSENT_INVALID',
      422,
    )
  }
}

async function assertBibleReferenceAssets(orgId: string, refAssetIds: string[] | undefined) {
  const ids = [...new Set(refAssetIds ?? [])]
  if (!ids.length) return
  const found = await prisma.asset.count({ where: { orgId, id: { in: ids } } })
  if (found !== ids.length) {
    throw new StudioServiceError('Una o más referencias no existen en esta organización.', 'BIBLE_ASSET_INVALID', 422)
  }
}

export async function addBibleEntry(params: {
  orgId: string
  productionId: string
  kind: BibleKind
  name: string
  data: JsonRecord
  refAssetIds?: string[]
  consentGrantId?: string
}) {
  const production = await requireProduction(params.orgId, params.productionId)
  await assertConsentIfRealPerson(params)
  await assertBibleReferenceAssets(params.orgId, params.refAssetIds)
  return prisma.productionBibleEntry.create({
    data: {
      orgId: params.orgId,
      productionId: production.id,
      kind: params.kind,
      name: params.name,
      data: params.data as unknown as Prisma.InputJsonValue,
      refAssetIds: params.refAssetIds ?? [],
      consentGrantId: params.consentGrantId ?? null,
    },
  })
}

export async function updateBibleEntry(params: {
  orgId: string
  productionId: string
  entryId: string
  kind?: BibleKind
  name?: string
  data?: JsonRecord
  refAssetIds?: string[]
  consentGrantId?: string | null
}) {
  const entry = await prisma.productionBibleEntry.findFirst({
    where: { id: params.entryId, orgId: params.orgId, productionId: params.productionId },
  })
  if (!entry) throw new StudioServiceError('Entrada de biblia no encontrada', 'BIBLE_ENTRY_NOT_FOUND', 404)

  // La validación de consentimiento se hace sobre el estado RESULTANTE de la
  // edición: quitar el grant o marcar realPerson en un update también cuenta.
  const nextKind = params.kind ?? entry.kind
  const nextData = params.data ?? asRecord(entry.data)
  const nextGrant = params.consentGrantId === undefined ? entry.consentGrantId : params.consentGrantId
  await assertConsentIfRealPerson({ orgId: params.orgId, kind: nextKind, data: nextData, consentGrantId: nextGrant })
  await assertBibleReferenceAssets(params.orgId, params.refAssetIds)

  return prisma.productionBibleEntry.update({
    where: { id: entry.id },
    data: {
      ...(params.kind !== undefined ? { kind: params.kind } : {}),
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.data !== undefined ? { data: params.data as unknown as Prisma.InputJsonValue } : {}),
      ...(params.refAssetIds !== undefined ? { refAssetIds: params.refAssetIds } : {}),
      ...(params.consentGrantId !== undefined ? { consentGrantId: params.consentGrantId } : {}),
    },
  })
}
