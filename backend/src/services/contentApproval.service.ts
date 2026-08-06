import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { StudioError } from './contentStudio.service'
import { extractBrandFacts, reviewPieceBody } from './contentSpecificity.service'
import { createDraftPost } from './metricoolSync.service'
import { createEmailDraft } from './mauticSync.service'
import { isOrganicEvent } from './organicChannels.service'

/**
 * Sala de aprobación — `docs/vendrava/pantallas.md` §3.
 *
 * Sustituye al botón suelto de "crear borrador" por una cola con tres acciones.
 * Dos decisiones del documento que aquí son código:
 *
 * - **Rechazar exige motivo.** Un rechazo sin motivo no enseña nada, y el
 *   aprendizaje de la fase 2 se explota sobre este histórico: por eso se guarda
 *   desde el primer día aunque todavía no se use (semana.md día 4).
 * - **Editar antes de aprobar se registra.** "% aprobado sin editar" es una de
 *   las tres métricas del MVP, y solo se puede medir si se sabe qué se tocó.
 */

/**
 * Quién decide sobre una pieza. Puede ser alguien del equipo (`userId`) o el
 * cliente de una agencia entrando por el enlace público (`label`), que no tiene
 * usuario. El historial tiene que poder decir cuál de los dos fue: "lo aprobó
 * el cliente" y "lo aprobó tu compañera" no son lo mismo.
 */
export interface PieceActor {
  userId?: string | null
  label?: string | null
}

/** Motivos cerrados: un clic. El texto libre es opcional y complementa. */
export const REJECTION_REASONS = [
  'no_suena_a_nosotros',
  'dato_incorrecto',
  'no_es_prioridad',
  'ya_lo_hemos_contado',
  'demasiado_generico',
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]

/**
 * Historial y comentarios de una pieza (§3). Se escribe siempre, también cuando
 * la acción viene del enlace público: una cola donde no se sabe quién aprobó
 * qué no es una sala de aprobación, es un botón.
 *
 * No lanza nunca: perder una línea de historial no puede tumbar la decisión que
 * describe, igual que en el registro de auditoría.
 */
export async function recordPieceEvent(
  orgId: string,
  pieceId: string,
  event: { kind: string; message?: string | null; actor?: PieceActor; meta?: Record<string, unknown> },
) {
  try {
    await prisma.contentPieceEvent.create({
      data: {
        orgId,
        pieceId,
        kind: event.kind,
        message: event.message?.slice(0, 1_000) ?? null,
        actorUserId: event.actor?.userId ?? null,
        actorLabel: event.actor?.label?.slice(0, 120) ?? null,
        meta: (event.meta ?? undefined) as Prisma.InputJsonObject | undefined,
      },
    })
  } catch (error) {
    console.error('[contentApproval] no se pudo registrar el evento de la pieza', { pieceId, kind: event.kind, error })
  }
}

/** Comentario de una persona sobre una pieza. Exige texto: un comentario vacío no dice nada. */
export async function commentPiece(orgId: string, pieceId: string, message: string, actor: PieceActor) {
  const piece = await prisma.contentPiece.findFirst({ where: { id: pieceId, orgId }, select: { id: true } })
  if (!piece) throw new StudioError('Pieza no encontrada')
  const clean = message?.trim()
  if (!clean) throw new StudioError('El comentario está vacío.')

  await recordPieceEvent(orgId, pieceId, { kind: 'comment', message: clean, actor })
  return pieceHistory(orgId, pieceId)
}

/** Historial completo de una pieza, de lo más antiguo a lo más reciente. */
export async function pieceHistory(orgId: string, pieceId: string) {
  const events = await prisma.contentPieceEvent.findMany({
    where: { orgId, pieceId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  const userIds = Array.from(new Set(events.map(event => event.actorUserId).filter((id): id is string => Boolean(id))))
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds }, orgId }, select: { id: true, name: true, email: true } })
    : []
  const nameById = new Map(users.map(user => [user.id, user.name || user.email]))

  return {
    events: events.map(event => ({
      id: event.id,
      kind: event.kind,
      message: event.message,
      // Quién, ya resuelto: la interfaz no tiene que saber que hay dos maneras
      // de actuar sobre una pieza para poder escribir una línea de historial.
      actor: event.actorUserId ? (nameById.get(event.actorUserId) ?? 'Alguien del equipo') : (event.actorLabel ?? 'Cliente'),
      external: !event.actorUserId,
      meta: event.meta,
      at: event.createdAt,
    })),
  }
}

export async function listQueue(orgId: string) {
  const pieces = await prisma.contentPiece.findMany({
    where: { orgId, status: { in: ['draft', 'pending_approval'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      opportunity: { select: { title: true, type: true, evidenceCount: true } },
      // Los comentarios se cuentan aquí: la cola tiene que poder enseñar "2
      // comentarios" sin pedir el historial de cada pieza por separado.
      _count: { select: { events: true } },
    },
    take: 60,
  })
  return { pieces }
}

export async function submitForApproval(orgId: string, pieceId: string, actor: PieceActor = {}) {
  const piece = await prisma.contentPiece.findFirst({ where: { id: pieceId, orgId } })
  if (!piece) throw new StudioError('Pieza no encontrada')
  if (piece.status !== 'draft') throw new StudioError(`Una pieza en estado «${piece.status}» no se puede enviar a aprobación.`)

  const submitted = await prisma.contentPiece.update({ where: { id: pieceId }, data: { status: 'pending_approval' } })
  await recordPieceEvent(orgId, pieceId, { kind: 'submitted', actor })
  return submitted
}

/**
 * Guarda una edición humana. Marca la pieza como editada: sin esa marca, el
 * "% aprobado sin editar" contaría como intacto lo que alguien reescribió
 * entero.
 *
 * El chequeo de especificidad se vuelve a pasar sobre lo editado —si no, la
 * pieza enseñaría marcas de frases que ya no existen—, pero **solo marca**: se
 * pasa la lista de datos vacía a propósito. Reescribirle el texto a quien acaba
 * de escribirlo a mano sería lo contrario de una edición.
 */
export async function editPiece(orgId: string, pieceId: string, body: unknown, actor: PieceActor = {}) {
  const piece = await prisma.contentPiece.findFirst({ where: { id: pieceId, orgId } })
  if (!piece) throw new StudioError('Pieza no encontrada')
  if (piece.status === 'published') throw new StudioError('Una pieza publicada ya no se edita aquí.')
  if (!body || typeof body !== 'object') throw new StudioError('El contenido editado no es válido.')

  const check = reviewPieceBody(piece.format, body as Record<string, unknown>, [])
  // Cuántos datos **hay**, aunque esta pasada no los use para sustituir. Sin
  // este conteo, editar a mano hacía que la pieza dijera "no hay nada en la Base
  // de conocimiento" teniéndola llena: el número describe al negocio, no a la
  // decisión de no reescribir.
  const facts = await extractBrandFacts(orgId)

  await recordPieceEvent(orgId, pieceId, { kind: 'edited', actor })

  return prisma.contentPiece.update({
    where: { id: pieceId },
    data: {
      body: body as Prisma.InputJsonObject,
      editedByHuman: true,
      specificity: {
        checkedAt: new Date().toISOString(),
        replaced: 0,
        unresolved: check.unresolved,
        factsAvailable: facts.length,
        afterHumanEdit: true,
        flags: check.flags,
      } as unknown as Prisma.InputJsonObject,
    },
  })
}

export async function approvePiece(orgId: string, actor: PieceActor, pieceId: string) {
  const piece = await prisma.contentPiece.findFirst({ where: { id: pieceId, orgId } })
  if (!piece) throw new StudioError('Pieza no encontrada')
  if (piece.status === 'published') throw new StudioError('La pieza ya está publicada.')

  const approved = await prisma.contentPiece.update({
    where: { id: pieceId },
    data: { status: 'approved', decidedAt: new Date() },
  })

  await writeAuditLog({
    orgId,
    actorUserId: actor.userId ?? null,
    // Sin usuario, el actor es el enlace público: se audita como sistema con la
    // etiqueta del enlace, no como un usuario que no existe.
    actorType: actor.userId ? 'user' : 'system',
    action: 'content.piece.approved',
    entityType: 'ContentPiece',
    entityId: pieceId,
    after: { format: piece.format, editedByHuman: piece.editedByHuman, externalActor: actor.userId ? null : actor.label ?? 'enlace público' },
  })
  await recordPieceEvent(orgId, pieceId, { kind: 'approved', actor })

  return approved
}

export async function rejectPiece(
  orgId: string,
  actor: PieceActor,
  pieceId: string,
  input: { reason?: string; comment?: string },
) {
  const piece = await prisma.contentPiece.findFirst({ where: { id: pieceId, orgId } })
  if (!piece) throw new StudioError('Pieza no encontrada')
  // El documento es explícito: rechazar exige motivo.
  if (!input.reason || !REJECTION_REASONS.includes(input.reason as RejectionReason)) {
    throw new StudioError('Rechazar exige un motivo: sin él no hay nada que aprender del rechazo.')
  }

  const rejected = await prisma.contentPiece.update({
    where: { id: pieceId },
    data: {
      status: 'rejected',
      decidedAt: new Date(),
      rejectionReason: [input.reason, input.comment?.trim()].filter(Boolean).join(' · ').slice(0, 500),
    },
  })

  await writeAuditLog({
    orgId,
    actorUserId: actor.userId ?? null,
    actorType: actor.userId ? 'user' : 'system',
    action: 'content.piece.rejected',
    entityType: 'ContentPiece',
    entityId: pieceId,
    after: { reason: input.reason, comment: input.comment ?? null, externalActor: actor.userId ? null : actor.label ?? 'enlace público' },
  })
  await recordPieceEvent(orgId, pieceId, {
    kind: 'rejected',
    message: input.comment?.trim() || null,
    actor,
    meta: { reason: input.reason },
  })

  // El rechazo alimenta las preferencias del negocio (§3).
  await refreshContentPreferences(orgId)

  return rejected
}

/**
 * Preferencias del negocio aprendidas de los rechazos — `pantallas.md` §3.
 *
 * El documento pide que el motivo "actualice automáticamente las preferencias
 * del negocio". Se hace por conteo, no con un modelo: si algo se rechazó tres
 * veces por el mismo motivo, eso es una preferencia; una vez es una opinión
 * sobre una pieza concreta. Y se guarda junto a la voz del dueño, en
 * `Organization.settings`, porque las dos describen cómo quiere comunicar este
 * negocio.
 */
const MIN_REJECTIONS_TO_LEARN = 3

export async function refreshContentPreferences(orgId: string) {
  const rejected = await prisma.contentPiece.findMany({
    where: { orgId, status: 'rejected', rejectionReason: { not: null } },
    select: { rejectionReason: true, format: true },
    take: 300,
  })

  const counts = new Map<string, number>()
  for (const piece of rejected) {
    // El motivo canónico es lo que va antes del " · " del comentario libre.
    const reason = (piece.rejectionReason ?? '').split(' · ')[0]
    if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }

  const learned = Array.from(counts.entries())
    .filter(([, count]) => count >= MIN_REJECTIONS_TO_LEARN)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }))

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } })
  const settings = (org?.settings ?? {}) as Record<string, unknown>
  const preferences = {
    learned,
    totalRejections: rejected.length,
    updatedAt: new Date().toISOString(),
  }
  await prisma.organization.update({
    where: { id: orgId },
    data: { settings: { ...settings, contentPreferences: preferences } as unknown as Prisma.InputJsonObject },
  })

  return preferences
}

/** Traduce lo aprendido a instrucciones para el redactor. */
export function preferenceInstructions(learned: { reason: string; count: number }[]) {
  if (!learned.length) return null
  const rules: Record<string, string> = {
    no_suena_a_nosotros: 'Ajústate mucho a la voz del negocio: han rechazado piezas por no sonar a ellos.',
    dato_incorrecto: 'No afirmes ningún dato que no venga en la evidencia: han rechazado piezas por datos incorrectos.',
    no_es_prioridad: 'Céntrate en la oportunidad concreta, sin abrir temas laterales.',
    ya_lo_hemos_contado: 'Busca un ángulo nuevo: han rechazado piezas por repetir lo ya contado.',
    demasiado_generico: 'Sé concreto y específico: han rechazado piezas por genéricas.',
  }
  return learned
    .map(item => rules[item.reason] ? `${rules[item.reason]} (${item.count} rechazos)` : null)
    .filter(Boolean)
    .join('\n')
}

/** Texto publicable de una pieza, según su formato. */
export function renderPiece(piece: { format: string; body: Prisma.JsonValue }) {
  const body = (piece.body ?? {}) as Record<string, any>
  if (piece.format === 'post') return String(body.text ?? '')
  if (piece.format === 'carousel') return [body.title, ...(body.slides ?? [])].filter(Boolean).join('\n\n')
  if (piece.format === 'stories') {
    return (Array.isArray(body.stories) ? body.stories : [])
      .map((story: any) => String(story?.text ?? '').trim())
      .filter(Boolean)
      .join('\n\n')
  }
  if (piece.format === 'email') return [body.subject, body.preheader, body.body].filter(Boolean).join('\n\n')
  return [body.hook, body.body, body.cta].filter(Boolean).join('\n\n')
}

/**
 * El email de la fase 2 se publica en texto plano en el cuerpo de la plantilla
 * de Mautic. No se compone HTML de marca aquí a propósito: la plantilla se crea
 * despublicada y quien la envíe le da el formato en Mautic, que es donde vive
 * el email marketing de este producto.
 */
export function emailHtml(body: Record<string, any>) {
  const paragraphs = String(body.body ?? '')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${escapeHtml(part)}</p>`)
  const cta = body.cta ? `<p><strong>${escapeHtml(String(body.cta))}</strong></p>` : ''
  return `${paragraphs.join('\n')}\n${cta}`.trim()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A dónde va cada formato al aprobarlo — atomización de la fase 2.
 *
 * No todas las piezas se publican igual, y forzarlas por el mismo camino sería
 * mentir dos veces: el email no es un post de Instagram, y la locución no se
 * publica sola —acompaña al Reel, y su borrador es el del guion—.
 */
export type PublishTarget = 'social' | 'email' | 'none'

export function publishTargetFor(format: string): PublishTarget {
  if (format === 'email') return 'email'
  if (format === 'voiceover') return 'none'
  return 'social'
}

/**
 * Referencia del borrador creado. Metricool devuelve el post cuando el canal es
 * uno solo y `{posts:[…]}` cuando son varios, así que con canales múltiples la
 * referencia son varias y se guardan todas: es una traza para poder encontrar
 * cada borrador, no una clave.
 */
function draftReference(draft: unknown): string | null {
  const container = draft as { posts?: unknown[] } | unknown[] | null
  const items = Array.isArray(container) ? container : container?.posts ?? [draft]
  const ids = items.flatMap(item => {
    const entry = (Array.isArray(item) ? item[0] : item) as { id?: unknown } | null
    return entry?.id ? [String(entry.id)] : []
  })
  return ids.join(',') || null
}

/**
 * "Aprobar todo": aprueba en lote y crea el borrador de cada pieza en Metricool
 * — `pantallas.md` §3.
 *
 * Devuelve el resultado pieza a pieza en vez de un booleano: si Metricool
 * rechaza una, el usuario tiene que saber cuál y por qué, no que "algo falló".
 * Aprobar y publicar son pasos separados a propósito: una pieza aprobada cuyo
 * borrador falla sigue aprobada, y se puede reintentar sin volver a decidir.
 */
export async function approveAndDraft(
  orgId: string,
  actor: PieceActor,
  pieceIds: string[],
  options: { platforms?: string[] } = {},
) {
  const results: { id: string; approved: boolean; drafted: boolean; reason?: string }[] = []

  for (const pieceId of pieceIds) {
    try {
      const approved = await approvePiece(orgId, actor, pieceId)
      const piece = await prisma.contentPiece.findFirstOrThrow({
        where: { id: pieceId, orgId },
        include: { campaign: { select: { id: true, landingSlug: true } } },
      })

      const target = publishTargetFor(piece.format)

      // La locución no se publica sola: acompaña al Reel, cuyo borrador ya
      // lleva el guion. Aprobarla es aceptar el audio, no programar un post.
      if (target === 'none') {
        results.push({
          id: pieceId,
          approved: true,
          drafted: false,
          reason: 'La locución no se publica sola: acompaña al Reel, y se descarga desde la pieza.',
        })
        continue
      }

      // Sin campaña con landing publicada no hay a dónde enviar el tráfico, y
      // un borrador sin destino no se puede atribuir.
      if (!piece.campaign?.landingSlug) {
        results.push({ id: pieceId, approved: true, drafted: false, reason: 'La pieza no tiene campaña con landing publicada.' })
        continue
      }

      // El email no va a redes: se crea como plantilla despublicada en Mautic,
      // que es donde vive el email marketing de este producto.
      if (target === 'email') {
        const body = (piece.body ?? {}) as Record<string, any>
        const created = await createEmailDraft(orgId, {
          name: String(body.subject ?? 'Email de contenido').slice(0, 120),
          subject: String(body.subject ?? '').trim() || 'Sin asunto',
          html: emailHtml(body),
        })
        if (!created) {
          results.push({ id: pieceId, approved: true, drafted: false, reason: 'Mautic no está conectado o rechazó la plantilla.' })
          continue
        }
        await prisma.contentPiece.update({
          where: { id: pieceId },
          data: { status: 'published', publishedAt: new Date(), externalDraftId: `mautic:${created.id}` },
        })
        await recordPieceEvent(orgId, pieceId, { kind: 'published', actor, meta: { destination: 'mautic', externalId: created.id } })
        results.push({ id: approved.id, approved: true, drafted: true })
        continue
      }

      const draft = await createDraftPost({
        text: renderPiece(piece),
        imageUrl: piece.imageUrl ?? undefined,
        // Los canales los eligió el Estudio al generar (§2). `platforms` solo
        // los pisa si quien aprueba en lote pide explícitamente otros.
        platforms: options.platforms?.length ? options.platforms : piece.channels.length ? piece.channels : ['instagram'],
        // Una story no es un post aunque salga por el mismo endpoint.
        instagramType: piece.format === 'stories' ? 'STORY' : 'POST',
        attribution: {
          campaignId: piece.campaign.id,
          landingSlug: piece.campaign.landingSlug,
          // El UTM propio de la pieza viaja hasta la URL publicada.
          utmContent: piece.utmContent ?? undefined,
        },
      }, orgId)

      if (!draft) {
        results.push({ id: pieceId, approved: true, drafted: false, reason: 'Metricool no está conectado.' })
        continue
      }

      await prisma.contentPiece.update({
        where: { id: pieceId },
        data: { status: 'published', publishedAt: new Date(), externalDraftId: draftReference(draft) },
      })
      await recordPieceEvent(orgId, pieceId, { kind: 'published', actor, meta: { destination: 'metricool' } })
      results.push({ id: approved.id, approved: true, drafted: true })
    } catch (error) {
      results.push({
        id: pieceId,
        approved: false,
        drafted: false,
        reason: error instanceof Error ? error.message : 'Error desconocido',
      })
    }
  }

  return {
    total: pieceIds.length,
    approved: results.filter(result => result.approved).length,
    drafted: results.filter(result => result.drafted).length,
    results,
  }
}

export interface AttributionRow {
  content: string | null
  type: string
  leadId: string | null
  source: string | null
  medium: string | null
}

/**
 * Visitas y leads por UTM de pieza — `pantallas.md` §4.
 *
 * Dos reglas sin las cuales el número de la pantalla era mentira:
 *
 * - **Solo `landing_view` es una visita.** Contar todos los eventos del UTM
 *   sumaba la conversión a la visita, así que una pieza con 10 visitas y 2
 *   leads enseñaba 12 visitas.
 * - **El tráfico pagado no cuenta**, con la misma regla que el embudo orgánico
 *   (`isOrganicEvent`): una pieza no se apunta los leads que ya pagó Ads.
 *
 * Y los leads se cuentan por `leadId` distinto, no por eventos: quien rellena
 * el formulario dos veces sigue siendo un lead.
 */
export function attributionByUtm(rows: AttributionRow[]) {
  const byUtm = new Map<string, { visits: number; leadIds: Set<string> }>()
  for (const row of rows) {
    if (!row.content || !isOrganicEvent(row)) continue
    let entry = byUtm.get(row.content)
    if (!entry) byUtm.set(row.content, (entry = { visits: 0, leadIds: new Set<string>() }))
    if (row.type === 'landing_view') entry.visits += 1
    if (row.leadId) entry.leadIds.add(row.leadId)
  }
  return byUtm
}

/** Cuántos leads hay en cada estado del pipeline. */
function countByStatus(leadIds: string[], statusByLead: Map<string, string>) {
  const counts: Record<string, number> = {}
  for (const leadId of leadIds) {
    const status = statusByLead.get(leadId) ?? 'desconocido'
    counts[status] = (counts[status] ?? 0) + 1
  }
  return counts
}

/**
 * Euros que ha movido el contenido — `roadmap.md` fase 4, la parte que faltaba
 * del cruce (visitas → leads → etapa → **dinero**).
 *
 * Se devuelven dos cifras separadas y nunca sumadas, porque no significan lo
 * mismo y juntarlas sería el número inflado de siempre:
 *
 * - **`won`**: valor de las oportunidades ya ganadas de esos leads. Es dinero
 *   que existe.
 * - **`open`**: valor de las que siguen abiertas. Es dinero que *puede* existir,
 *   y se enseña como expectativa, sin ponderar por probabilidad —ponderar
 *   convertiría una estimación del comercial en una métrica del producto—.
 *
 * Lo perdido no se cuenta en ninguna de las dos: una venta perdida no es un
 * resultado del contenido, aunque el lead llegara por él.
 */
export interface OpportunityValueRow {
  leadId: string
  stage: string
  value: unknown
  currency: string
}

export function valueByLead(rows: OpportunityValueRow[]) {
  const byLead = new Map<string, { won: number; open: number; currency: string }>()
  for (const row of rows) {
    // `Decimal` de Prisma: se pasa por Number con su propio `toString`, que es
    // exacto, en vez de fiarlo a la coerción implícita del objeto.
    const amount = row.value === null || row.value === undefined ? 0 : Number(String(row.value))
    if (!Number.isFinite(amount) || amount <= 0) continue
    // Lo perdido ni suma ni aparece: crear la fila a cero haría que un lead con
    // una sola venta perdida se enseñara como "0 €" en vez de como lo que es,
    // un lead sin resultado económico atribuible.
    if (row.stage === 'closed_lost') continue
    const entry = byLead.get(row.leadId) ?? { won: 0, open: 0, currency: row.currency || 'EUR' }
    if (row.stage === 'closed_won') entry.won += amount
    else entry.open += amount
    byLead.set(row.leadId, entry)
  }
  return byLead
}

/** Suma los euros de un conjunto de leads. */
function sumValue(leadIds: string[], byLead: ReturnType<typeof valueByLead>) {
  let won = 0
  let open = 0
  for (const leadId of leadIds) {
    const entry = byLead.get(leadId)
    if (!entry) continue
    won += entry.won
    open += entry.open
  }
  return { won: Math.round(won), open: Math.round(open) }
}

/**
 * Métricas del MVP — `pantallas.md` §4.
 *
 * Las tres que pide el documento, y ninguna inventada: lo que no se puede medir
 * todavía se devuelve como `null` con su motivo, igual que en landings.
 */
export async function contentResults(orgId: string) {
  const pieces = await prisma.contentPiece.findMany({
    where: { orgId },
    select: { id: true, format: true, status: true, channels: true, editedByHuman: true, minutesSaved: true, utmContent: true, campaignId: true, publishedAt: true },
  })

  const decided = pieces.filter(piece => ['approved', 'rejected', 'published'].includes(piece.status))
  const approved = pieces.filter(piece => ['approved', 'published'].includes(piece.status))
  const approvedUntouched = approved.filter(piece => !piece.editedByHuman)

  // Tiempo ahorrado: solo cuenta lo aprobado. Una pieza rechazada no ahorró
  // nada, y sumarla sería inflar la única métrica que justifica el producto.
  const minutesSaved = approved.reduce((total, piece) => total + (piece.minutesSaved ?? 0), 0)

  const utms = approved.map(piece => piece.utmContent).filter((value): value is string => Boolean(value))
  const events = utms.length
    ? await prisma.acquisitionEvent.findMany({
        where: { orgId, content: { in: utms } },
        select: { content: true, type: true, leadId: true, source: true, medium: true },
      })
    : []
  const byUtm = attributionByUtm(events)

  // Estado en pipeline de los leads que trajeron las piezas (§4). Se consulta
  // una vez para todas: la tabla puede tener decenas de filas.
  const attributedLeadIds = Array.from(new Set(Array.from(byUtm.values()).flatMap(entry => Array.from(entry.leadIds))))
  const [leads, opportunities] = attributedLeadIds.length
    ? await Promise.all([
        prisma.lead.findMany({ where: { orgId, id: { in: attributedLeadIds } }, select: { id: true, status: true } }),
        // Los euros del cruce completo (fase 4): las oportunidades del CRM de
        // esos mismos leads.
        prisma.opportunity.findMany({
          where: { orgId, leadId: { in: attributedLeadIds } },
          select: { leadId: true, stage: true, value: true, currency: true },
        }),
      ])
    : [[], []]
  const statusByLead = new Map(leads.map(lead => [lead.id, String(lead.status)]))
  const byLead = valueByLead(opportunities.map(row => ({ ...row, stage: String(row.stage) })))
  const totalValue = sumValue(attributedLeadIds, byLead)

  return {
    minutesSaved,
    // `null` en vez de 0%: sin decisiones tomadas no hay tasa que enseñar.
    approvalRate: decided.length ? Number((approved.length / decided.length).toFixed(3)) : null,
    untouchedRate: approved.length ? Number((approvedUntouched.length / approved.length).toFixed(3)) : null,
    pieces: pieces.length,
    approved: approved.length,
    published: pieces.filter(piece => piece.status === 'published').length,
    // La tercera métrica del MVP. Se cuentan leads distintos: uno que llegó por
    // dos piezas es un lead, aunque aparezca en las dos filas de la tabla.
    leadsAttributed: attributedLeadIds.length,
    /**
     * Euros asistidos por el contenido (fase 4). `wonValue` es dinero cerrado;
     * `openValue` es lo que sigue vivo en el pipeline. Se enseñan aparte a
     * propósito: sumarlos daría una cifra que no es ninguna de las dos.
     */
    value: {
      won: totalValue.won,
      open: totalValue.open,
      currency: opportunities[0]?.currency ?? 'EUR',
      // Sin oportunidades en el CRM para esos leads no hay euros que enseñar, y
      // decirlo evita leer un 0 como "el contenido no vendió nada".
      measurable: opportunities.length > 0,
    },
    perPiece: approved.map(piece => {
      const attribution = byUtm.get(piece.utmContent ?? '')
      const pieceLeadIds = Array.from(attribution?.leadIds ?? [])
      return {
        id: piece.id,
        format: piece.format,
        channels: piece.channels,
        utmContent: piece.utmContent,
        // `null` = todavía no se publicó, así que no hay nada que medir. Un 0
        // diría "se publicó y no funcionó", que es otra cosa.
        visits: piece.publishedAt ? attribution?.visits ?? 0 : null,
        leads: piece.publishedAt ? pieceLeadIds.length : null,
        // Visitas → leads → estado en pipeline, el recorrido que pide §4.
        pipeline: piece.publishedAt ? countByStatus(pieceLeadIds, statusByLead) : null,
        // …y hasta los euros, que es donde lo cierra la fase 4.
        value: piece.publishedAt ? sumValue(pieceLeadIds, byLead) : null,
      }
    }),
    caveats: [
      ...(pieces.some(piece => piece.status === 'approved' && !piece.publishedAt)
        ? ['Hay piezas aprobadas sin publicar: su atribución aparecerá cuando se publiquen.']
        : []),
      ...(!utms.length ? ['Todavía no hay piezas aprobadas con UTM propio: no se puede atribuir tráfico por pieza.'] : []),
      // Honestidad sobre el límite real de la atribución: el evento de
      // conversión no conserva la sesión que vio la pieza (se identifica por
      // huella de contacto), así que un lead que vio una pieza y convirtió por
      // otra vía no se puede reconstruir. Se cuenta lo directo y se dice.
      'Solo se cuenta la atribución directa: quien llegó por el UTM de la pieza. Los leads «asistidos» —los que la vieron y convirtieron por otro camino— no se pueden reconstruir todavía, porque el evento de conversión no conserva la sesión.',
      'El tráfico pagado se descarta, igual que en el embudo orgánico: una pieza no se apunta los leads que trajo un anuncio a la misma landing.',
      ...(opportunities.length
        ? ['Los euros ganados y los abiertos se enseñan por separado y no se suman: lo abierto es expectativa, no ingreso. Lo perdido no cuenta en ninguno de los dos.']
        : []),
      ...(attributedLeadIds.length && !opportunities.length
        ? ['Hay leads atribuidos pero ninguno tiene oportunidad en el CRM: sin oportunidad no hay euros que atribuir al contenido.']
        : []),
    ],
  }
}
