import { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import {
  getAsset,
  getAssetContent,
  getAssetDownloadUrl,
  listAssets,
  publishAsset,
  type AssetKind,
  type AssetStatus,
} from '../services/assets.service'
import { writeAuditLog } from '../lib/audit'
import { personalStudioRoutes } from './personalStudio'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

const KINDS: ReadonlySet<string> = new Set(['image', 'video', 'audio', 'document', 'dataset', 'text'])
const STATUSES: ReadonlySet<string> = new Set(['draft', 'approved', 'published', 'archived'])

/**
 * Biblioteca de activos (02-FUNDAMENTOS.md §2). Solo lectura por ahora: los
 * assets se crean desde los generadores (imagen, locución), no por la API.
 *
 * Permisos propios de activos con alcance org. La biblioteca es transversal:
 * puede contener creatividad, documentos, audio, vídeo y datasets, por lo que
 * no debe heredar accidentalmente el acceso de redes sociales. Sin
 * `requireEntitlement`: los assets cruzan dominios de plan (las imágenes de
 * anuncios nacen bajo el entitlement `growth`, las piezas bajo `social`) y
 * condicionar la biblioteca a un solo entitlement escondería archivos que la
 * org generó legítimamente por el otro camino.
 */
export async function assetsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  await app.register(personalStudioRoutes)
  const canRead = { preHandler: [requirePermission('assets.read', { scope: 'org' })] }
  const canPublish = { preHandler: [requirePermission('assets.manage', { scope: 'org' })] }

  app.get<{ Querystring: { kind?: string; status?: string; campaignId?: string; cursor?: string; limit?: string } }>(
    '/',
    canRead,
    async (request, reply) => {
      const { orgId } = request.user as JWTUser
      const query = request.query ?? {}
      if (query.kind && !KINDS.has(query.kind)) return reply.status(400).send({ error: 'kind inválido' })
      if (query.status && !STATUSES.has(query.status)) return reply.status(400).send({ error: 'status inválido' })
      const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined
      if (limit != null && (!Number.isFinite(limit) || limit < 1)) return reply.status(400).send({ error: 'limit inválido' })
      return reply.send(await listAssets({
        orgId,
        kind: query.kind as AssetKind | undefined,
        status: query.status as AssetStatus | undefined,
        campaignId: query.campaignId,
        cursor: query.cursor,
        limit,
      }))
    },
  )

  app.get<{ Params: { id: string } }>('/:id', canRead, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user as JWTUser
    const asset = await getAsset({ orgId, id: request.params.id })
    // Un id de otra org se comporta como inexistente, no como prohibido.
    if (!asset) return reply.status(404).send({ error: 'Asset no encontrado' })
    return reply.send(asset)
  })

  app.get<{ Params: { id: string } }>('/:id/url', canRead, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { orgId } = request.user as JWTUser
    const result = await getAssetDownloadUrl({ orgId, id: request.params.id })
    if (!result) return reply.status(404).send({ error: 'Asset no encontrado' })
    return reply.send(result)
  })

  /** Fallback local privado y descarga autenticada; nunca se monta en /public. */
  app.get<{ Params: { id: string } }>('/:id/content', canRead, async (request, reply) => {
    const { orgId } = request.user as JWTUser
    const result = await getAssetContent({ orgId, id: request.params.id })
    if (!result) return reply.status(404).send({ error: 'Asset no encontrado' })
    return reply.header('Cache-Control', 'private, no-store').type(result.mimeType).send(result.body)
  })

  /** Crea una copia pública inmutable; jamás hace público el original. */
  app.post<{ Params: { id: string } }>('/:id/publish', canPublish, async (request, reply) => {
    const { orgId, userId } = request.user as JWTUser
    try {
      const asset = await publishAsset({ orgId, id: request.params.id })
      if (!asset) return reply.status(404).send({ error: 'Asset no encontrado' })
      await writeAuditLog({
        orgId,
        actorUserId: userId,
        action: 'asset.publish',
        entityType: 'Asset',
        entityId: asset.id,
        after: { accessClass: asset.accessClass, publishedUrl: asset.publishedUrl },
      })
      return reply.send({
        id: asset.id,
        status: asset.status,
        accessClass: asset.accessClass,
        publishedUrl: asset.publishedUrl,
        publishedAt: asset.publishedAt,
      })
    } catch (error) {
      request.log.warn({ assetId: request.params.id, error }, 'No se pudo publicar el asset')
      return reply.status(409).send({ error: error instanceof Error ? error.message : 'No se pudo publicar el asset' })
    }
  })
}
