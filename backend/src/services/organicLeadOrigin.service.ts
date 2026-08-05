import { prisma } from '../lib/prisma'
import { classifyChannel, isOrganicEvent, type OrganicChannel } from './organicChannels.service'

/**
 * De dónde vino este lead, en concreto — criterio de aceptación de §13 de
 * `docs/xarly/organico.md`:
 *
 * > "puede seguir un lead desde keyword, post, ficha, prospección o
 * > acontecimiento vertical hasta llamada, cualificación y venta"
 *
 * La ficha ya enseñaba la campaña de Ads, así que un comprador que llegó por un
 * anuncio se podía rastrear hasta el anuncio, pero uno que llegó por una
 * búsqueda o por un post se quedaba en "fuente: orgánico". El hilo estaba roto
 * justo en el lado que este documento vino a cerrar.
 *
 * Tres reglas, todas de §8:
 *
 * 1. **`AcquisitionEvent` es el hub único.** No se crea una cadena paralela: se
 *    lee la que ya existe y se le pone nombre.
 * 2. **Un toque pagado gana.** Si el lead pasó por publicidad en algún momento,
 *    el origen es de Ads aunque después volviera por búsqueda. Atribuírselo al
 *    orgánico sería quitárselo a Ads.
 * 3. **Lo desconocido se declara desconocido.** Sin UTM el origen es "orgánico
 *    no identificado", nunca el canal que mejor quedaría.
 */

export type OrganicOriginKind =
  | 'keyword'
  | 'piece'
  | 'gbp'
  | 'prospecting'
  | 'vertical_event'
  | 'organic_unidentified'
  | 'paid'
  | 'none'

export type OrganicLeadOrigin = {
  kind: OrganicOriginKind
  channel: OrganicChannel | 'ads' | null
  channelLabel: string
  /** El nombre concreto del origen: la keyword, el título del post, la ficha… */
  label: string | null
  /** Frase para la ficha, en lenguaje llano. */
  detail: string
  firstTouchAt: Date | null
  utm: { source: string | null; medium: string | null; content: string | null; campaign: string | null; term: string | null } | null
  /** Pieza de contenido concreta, cuando el UTM la identifica. */
  piece: { id: string; format: string; publishedAt: Date | null } | null
  /** Oportunidad orgánica de origen (prospección, acontecimiento vertical…). */
  opportunity: { id: string; title: string; sourceKind: string; channel: string } | null
}

const CHANNEL_LABEL: Record<OrganicChannel, string> = {
  search: 'Búsqueda orgánica',
  social: 'Redes sociales',
  gbp: 'Ficha de Google',
  prospecting: 'Prospección',
  unattributed: 'Origen orgánico no identificado',
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Resuelve el origen de un lead. Nunca lanza por falta de datos: un lead sin
 * ningún evento de captación devuelve `kind: 'none'`, que es una respuesta y no
 * un error.
 */
export async function getLeadOrganicOrigin(orgId: string, leadId: string): Promise<OrganicLeadOrigin> {
  const events = await prisma.acquisitionEvent.findMany({
    where: { orgId, leadId },
    orderBy: { createdAt: 'asc' },
    select: { type: true, source: true, medium: true, content: true, externalKey: true, metadata: true, createdAt: true },
  })

  if (!events.length) {
    return {
      kind: 'none',
      channel: null,
      channelLabel: 'Sin evento de captación',
      label: null,
      detail: 'Este lead no tiene ningún evento de captación registrado: se dio de alta a mano o llegó por un camino sin telemetría.',
      firstTouchAt: null,
      utm: null,
      piece: null,
      opportunity: null,
    }
  }

  const paid = events.find(event => !isOrganicEvent(event))
  if (paid) {
    return {
      kind: 'paid',
      channel: 'ads',
      channelLabel: 'Publicidad de pago',
      label: text(paid.source),
      detail: 'Este lead tuvo un toque pagado, así que lo mide Ads. El embudo orgánico no se lo apunta aunque después volviera por búsqueda.',
      firstTouchAt: paid.createdAt,
      utm: { source: paid.source, medium: paid.medium, content: paid.content, campaign: null, term: null },
      piece: null,
      opportunity: null,
    }
  }

  // El primer toque orgánico es el que cuenta, igual que en los snapshots del
  // embudo: si no, un lead cambiaría de canal cada vez que vuelve.
  const first = events[0]
  const channel = classifyChannel(first)
  const metadata = (first.metadata ?? {}) as Record<string, unknown>
  const utm = {
    source: first.source,
    medium: first.medium,
    content: first.content,
    campaign: text(metadata.utmCampaign),
    term: text(metadata.utmTerm),
  }

  // La oportunidad orgánica, si alguna lo reclamó, nombra el origen mejor que
  // cualquier UTM: es el acontecimiento o el prospecto concreto.
  const opportunityRow = await prisma.organicOpportunity.findFirst({
    where: { orgId, leadId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, sourceKind: true, channel: true },
  })
  const opportunity = opportunityRow ?? null

  // La pieza concreta: mismo enganche que el ranking de §5.4,
  // `ContentPiece.utmContent` ↔ `AcquisitionEvent.content`.
  const pieceRow = first.content
    ? await prisma.contentPiece.findFirst({
        where: { orgId, utmContent: first.content },
        select: { id: true, format: true, publishedAt: true },
      }).catch(() => null)
    : null

  const base = {
    channel,
    channelLabel: CHANNEL_LABEL[channel],
    firstTouchAt: first.createdAt,
    utm,
    piece: pieceRow,
    opportunity,
  }

  if (first.type === 'prospect_import' || channel === 'prospecting') {
    const sector = text(metadata.sector)
    const city = text(metadata.city)
    const where = [sector, city].filter(Boolean).join(' · ')
    return {
      ...base,
      kind: 'prospecting',
      label: opportunity?.title ?? where ?? text(first.externalKey),
      detail: where
        ? `Llegó de un lote de prospección (${where}). El identificador de la ficha de Google es ${first.externalKey ?? 'desconocido'}.`
        : 'Llegó de un lote de prospección importado desde Google Places.',
    }
  }

  if (opportunity?.sourceKind === 'vertical_event') {
    return {
      ...base,
      kind: 'vertical_event',
      label: opportunity.title,
      detail: `Nació de un acontecimiento del conector del sector: «${opportunity.title}».`,
    }
  }

  if (channel === 'gbp') {
    return {
      ...base,
      kind: 'gbp',
      label: text(first.source),
      detail: 'Llegó desde la ficha de Google del negocio.',
    }
  }

  if (pieceRow) {
    return {
      ...base,
      kind: 'piece',
      label: `${pieceRow.format}${pieceRow.publishedAt ? ` del ${pieceRow.publishedAt.toISOString().slice(0, 10)}` : ''}`,
      detail: `Llegó por una publicación concreta: un ${pieceRow.format} con el UTM «${first.content}».`,
    }
  }

  if (channel === 'search' && utm.term) {
    return {
      ...base,
      kind: 'keyword',
      label: utm.term,
      detail: `Llegó de una búsqueda con la consulta «${utm.term}».`,
    }
  }

  if (channel === 'unattributed') {
    return {
      ...base,
      kind: 'organic_unidentified',
      label: null,
      // §8: no se reparte entre canales por estimación silenciosa.
      detail: 'Llegó sin UTM ni referente reconocible. Se declara como origen orgánico no identificado en vez de asignarlo al canal que mejor quedaría.',
    }
  }

  // Canal conocido pero pieza sin identificar: se dice el canal y se dice qué
  // falta para poder nombrar la pieza, en vez de inventarla.
  const path = text(metadata.path)
  return {
    ...base,
    kind: 'organic_unidentified',
    label: null,
    detail: channel === 'search'
      ? `Llegó por búsqueda orgánica${path ? ` a ${path}` : ''}, pero sin \`utm_term\`: la consulta concreta no viaja en el enlace.`
      : `Llegó por ${CHANNEL_LABEL[channel].toLowerCase()}${path ? ` a ${path}` : ''}, pero sin un UTM de pieza que permita nombrar la publicación.`,
  }
}
