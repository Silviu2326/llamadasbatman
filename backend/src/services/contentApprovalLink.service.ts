import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { hasCapability } from '../access-control/entitlements'
import { StudioError } from './contentStudio.service'

/**
 * Enlace público de solo-aprobación — `roadmap.md` fase 3.
 *
 * Para el cliente de una agencia que tiene que aprobar contenido y no tiene (ni
 * debe tener) usuario en el CRM. Es la superficie más delicada del producto:
 * una URL que aprueba publicaciones sin contraseña. Por eso:
 *
 * - **Solo-aprobación, literalmente.** Con el enlace se puede ver la cola,
 *   comentar, aprobar y rechazar con motivo. No se puede generar (cuesta
 *   modelo), ni editar el texto, ni ver el Radar, ni tocar nada del CRM.
 * - **En la base solo vive el hash.** El secreto se enseña una vez al crearlo.
 *   Quien lea la base de datos no puede aprobar en nombre de un cliente.
 * - **Caduca siempre y se puede revocar.** Un enlace de aprobación eterno es
 *   una puerta que nadie recuerda haber dejado abierta.
 * - **Es del plan Agency.** No por empaquetado comercial: es la única forma en
 *   que este producto reconoce que quien aprueba no es quien contrata.
 */

const TOKEN_BYTES = 32
/** Caducidad por defecto: un trimestre de campañas, no un año. */
const DEFAULT_TTL_DAYS = 90
const MAX_TTL_DAYS = 365

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createApprovalLink(
  orgId: string,
  createdById: string,
  input: { label?: string; days?: number } = {},
) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } })
  // `multiworkspace` es la capacidad que solo tiene Agency; comprobar el nombre
  // del plan a mano habría dejado dos verdades sobre qué es una agencia.
  if (!hasCapability(org?.plan, 'multiworkspace')) {
    throw new StudioError('El enlace de aprobación para clientes es del plan Agency.')
  }

  const days = Math.min(Math.max(Math.round(input.days ?? DEFAULT_TTL_DAYS), 1), MAX_TTL_DAYS)
  const token = randomBytes(TOKEN_BYTES).toString('base64url')

  const link = await prisma.contentApprovalLink.create({
    data: {
      orgId,
      tokenHash: hashToken(token),
      label: input.label?.trim().slice(0, 120) || null,
      createdById,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    },
  })

  // El token se devuelve aquí y no se vuelve a poder leer nunca.
  return { id: link.id, token, label: link.label, expiresAt: link.expiresAt }
}

export async function listApprovalLinks(orgId: string) {
  const links = await prisma.contentApprovalLink.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  // Sin `tokenHash`: la interfaz no tiene nada que hacer con él, y enseñarlo
  // convertiría un hash en un secreto compartido con el navegador.
  return links.map(link => ({
    id: link.id,
    label: link.label,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    lastUsedAt: link.lastUsedAt,
    createdAt: link.createdAt,
    active: !link.revokedAt && link.expiresAt > new Date(),
  }))
}

export async function revokeApprovalLink(orgId: string, id: string) {
  const link = await prisma.contentApprovalLink.findFirst({ where: { id, orgId } })
  if (!link) throw new StudioError('El enlace no existe o no es de tu organización.')
  if (link.revokedAt) return link
  return prisma.contentApprovalLink.update({ where: { id }, data: { revokedAt: new Date() } })
}

/**
 * Resuelve un token a su organización. Devuelve `null` para todo lo que no sea
 * un enlace vivo —inexistente, caducado o revocado— sin distinguir entre ellos:
 * quien prueba tokens al azar no tiene por qué aprender cuál existía.
 */
export async function resolveApprovalLink(token: string) {
  if (!token || token.length < 20) return null
  const link = await prisma.contentApprovalLink.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!link || link.revokedAt || link.expiresAt <= new Date()) return null

  // Marca de uso: es lo que permite revocar con criterio los que nadie abre.
  await prisma.contentApprovalLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } })
  return { orgId: link.orgId, linkId: link.id, label: link.label }
}
