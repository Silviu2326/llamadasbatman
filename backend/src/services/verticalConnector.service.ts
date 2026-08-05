import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '../lib/prisma'
import { encryptToken, decryptToken } from '../lib/tokenCrypto'
import { getModule } from '../data/verticalModules'

/**
 * Conectores verticales — `docs/xarly/organico.md` §4.9 (nivel 2) y §10.
 *
 * Es lo que convierte la plantilla sectorial en datos reales del negocio: el
 * contenido deja de hablar en abstracto y pasa a hablar del partido que acaba
 * de terminar o del inmueble que se acaba de publicar.
 *
 * El recorrido completo del núcleo universal:
 *
 *   Fuente (conector) → Acontecimiento (VerticalEvent)
 *     → Regla (OrganicContentRule) → Oportunidad (OrganicOpportunity)
 *     → Pieza → Resultado
 *
 * Tres cosas que este servicio no negocia:
 *
 * 1. **Nada se publica solo.** El acontecimiento crea una oportunidad; la pieza
 *    pasa por la política de aprobación de su regla (§9).
 * 2. **Deduplicación por identificador de origen.** Un reintento del cliente no
 *    puede generar dos veces la misma pieza.
 * 3. **El evento crudo se guarda antes de interpretarlo.** Si la regla cambia,
 *    se puede reprocesar sin volver a pedirle nada al cliente.
 */

export class ConnectorError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'ConnectorError'
    this.statusCode = statusCode
  }
}

export async function listConnectors(orgId: string) {
  const connectors = await prisma.verticalConnector.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, moduleKey: true, name: true, kind: true, endpoint: true,
      status: true, lastEventAt: true, lastError: true, eventsReceived: true, createdAt: true,
    },
  })
  // Los secretos no salen nunca, ni truncados: se dice si hay uno configurado.
  return connectors.map(connector => ({ ...connector, hasSecret: undefined }))
}

export async function createConnector(orgId: string, input: {
  moduleKey: string
  name: string
  kind?: 'webhook' | 'api' | 'feed' | 'manual'
  endpoint?: string
  secret?: string
  webhookSecret?: string
}) {
  const project = await prisma.organicProject.findUnique({ where: { orgId }, select: { id: true, sectors: true } })
  if (!project) throw new ConnectorError('No hay proyecto orgánico: completa antes el onboarding.')
  if (!getModule(input.moduleKey)) throw new ConnectorError(`El sector "${input.moduleKey}" no existe en la biblioteca.`)
  if (!project.sectors.includes(input.moduleKey)) {
    throw new ConnectorError(`El proyecto no tiene confirmado el sector "${input.moduleKey}".`)
  }

  return prisma.verticalConnector.create({
    data: {
      orgId,
      projectId: project.id,
      moduleKey: input.moduleKey,
      name: input.name,
      kind: input.kind ?? 'webhook',
      endpoint: input.endpoint ?? null,
      secretEnc: input.secret ? encryptToken(input.secret) : null,
      webhookSecretEnc: input.webhookSecret ? encryptToken(input.webhookSecret) : null,
      status: 'pending',
    },
    select: { id: true, moduleKey: true, name: true, kind: true, status: true, createdAt: true },
  })
}

/**
 * Valida la firma del webhook con comparación en tiempo constante. Un `===`
 * sobre el HMAC filtra información por el tiempo de respuesta.
 */
function verifySignature(secret: string, rawBody: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = signature.replace(/^sha256=/, '')
  if (expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

type IncomingEvent = {
  eventKey: string
  externalId: string
  occurredAt?: string
  payload?: Record<string, unknown>
}

/**
 * Ingesta de acontecimientos. Cada uno se guarda crudo y, si alguna regla
 * activa lo recoge, genera su `OrganicOpportunity`.
 *
 * Un acontecimiento sin regla **no es un error**: se guarda como `ignored` con
 * el motivo. Así, cuando alguien active esa regla más tarde, se ve que los
 * eventos ya estaban llegando.
 */
export async function ingestEvents(
  orgId: string,
  connectorId: string,
  events: IncomingEvent[],
  options: { rawBody?: string; signature?: string } = {},
) {
  const connector = await prisma.verticalConnector.findFirst({ where: { id: connectorId, orgId } })
  if (!connector) throw new ConnectorError('Conector no encontrado', 404)
  if (connector.status === 'disabled') throw new ConnectorError('El conector está deshabilitado', 409)

  if (connector.webhookSecretEnc) {
    if (!options.signature || !options.rawBody) {
      throw new ConnectorError('Falta la firma del webhook', 401)
    }
    const secret = decryptToken(connector.webhookSecretEnc)
    if (!verifySignature(secret, options.rawBody, options.signature)) {
      throw new ConnectorError('Firma del webhook no válida', 401)
    }
  }

  const module = getModule(connector.moduleKey)
  const rules = await prisma.organicContentRule.findMany({
    where: { orgId, projectId: connector.projectId, moduleKey: connector.moduleKey, isActive: true },
  })
  const ruleByEvent = new Map(rules.map(rule => [rule.eventKey, rule]))

  let matched = 0
  let ignored = 0
  let duplicated = 0

  for (const event of events) {
    const known = module?.events.find(item => item.key === event.eventKey)
    const rule = ruleByEvent.get(event.eventKey)

    // La deduplicación real: el mismo hecho del sistema de origen entra una vez.
    const existing = await prisma.verticalEvent.findUnique({
      where: { connectorId_externalId: { connectorId: connector.id, externalId: event.externalId } },
    })
    if (existing) {
      duplicated += 1
      continue
    }

    const reason = !known
      ? `El acontecimiento "${event.eventKey}" no existe en el módulo ${connector.moduleKey}.`
      : !rule
        ? 'No hay ninguna regla activa para este acontecimiento.'
        : null

    const stored = await prisma.verticalEvent.create({
      data: {
        orgId,
        connectorId: connector.id,
        eventKey: event.eventKey,
        externalId: event.externalId,
        payload: (event.payload ?? {}) as object,
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
        status: reason ? 'ignored' : 'matched',
        reason,
      },
    })

    if (reason) {
      ignored += 1
      continue
    }

    // Entra en la cola común como una oportunidad más, sin motor paralelo.
    const opportunity = await prisma.organicOpportunity.create({
      data: {
        orgId,
        projectId: connector.projectId,
        title: `${rule!.label}: ${String(event.payload?.title ?? event.externalId)}`,
        source: 'vertical_connector',
        sourceKind: 'vertical_event',
        channel: 'social',
        connectorId: connector.id,
        status: 'open',
        // La prioridad la fija después el motor de recomendaciones; aquí solo
        // se marca que viene de un dato confirmado del negocio.
        score: 70,
        metadata: {
          eventKey: event.eventKey,
          externalId: event.externalId,
          payload: event.payload ?? {},
          // La política de aprobación viaja con la oportunidad: quien genere la
          // pieza no tiene que volver a preguntar si puede publicarla sola.
          approvalPolicy: rule!.approvalPolicy,
        } as object,
      },
    })
    await prisma.verticalEvent.update({ where: { id: stored.id }, data: { opportunityId: opportunity.id } })
    matched += 1
  }

  await prisma.verticalConnector.update({
    where: { id: connector.id },
    data: {
      status: 'active',
      lastEventAt: new Date(),
      lastError: null,
      eventsReceived: { increment: events.length },
    },
  })

  return { received: events.length, matched, ignored, duplicated }
}

/** Estado del conector para la banda de integridad (§5.1). */
export async function getConnectorHealth(orgId: string) {
  const connectors = await prisma.verticalConnector.findMany({
    where: { orgId },
    select: { id: true, name: true, moduleKey: true, status: true, lastEventAt: true, lastError: true, eventsReceived: true },
  })
  return connectors.map(connector => ({
    key: `vertical:${connector.id}`,
    label: connector.name,
    module: connector.moduleKey,
    status: connector.lastError
      ? 'error'
      : connector.status === 'active'
        ? 'ready'
        : 'connected_no_ingest',
    detail: connector.lastError
      ? `Último error: ${connector.lastError}`
      : connector.lastEventAt
        ? `${connector.eventsReceived} acontecimientos recibidos · último el ${connector.lastEventAt.toISOString().slice(0, 10)}`
        : 'Dado de alta, todavía sin acontecimientos.',
    lastSyncAt: connector.lastEventAt,
  }))
}
