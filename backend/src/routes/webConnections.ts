import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { websiteSeoRoutes } from './websiteSeo'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import { parseRequest } from '../lib/validation'
import { detectWebsiteConnection, discoverWebsiteConnection, isWebsiteConnectionMode, listWebsiteConnections, updateWebsiteConnection, WebsiteDetectionError, WEBSITE_CONNECTION_MODES } from '../services/websiteConnections.service'
import {
  WORDPRESS_ERROR_MESSAGES,
  WordPressConnectorError,
  connectWordPress,
  disconnectWordPress,
  getWordPressPage,
  installWordPressTracking,
  listWordPressPages,
  updateWordPressPage,
  verifyWordPress,
} from '../services/wordpressConnector.service'
import {
  GIT_ERROR_MESSAGES,
  GitConnectorError,
  closeGitProposal,
  connectGit,
  createGitProposal,
  disconnectGit,
  getGitProposal,
  listGitProposals,
  refreshGitProposal,
  verifyGit,
} from '../services/gitConnector.service'

const gitConnectSchema = z.object({
  repository: z.string().trim().min(3).max(300),
  token: z.string().trim().min(20).max(400),
}).strict()

const proposalCreateSchema = z.object({
  instructions: z.string().trim().min(10).max(8_000),
  title: z.string().trim().min(3).max(120).optional(),
  source: z.enum(['manual', 'seo']).optional(),
}).strict()

const proposalQuerySchema = z.object({ refresh: z.enum(['1', 'true']).optional() }).strict()

function sendGitError(reply: FastifyReply, error: unknown) {
  if (error instanceof GitConnectorError) {
    return reply.status(error.status).send({ error: GIT_ERROR_MESSAGES[error.code] ?? 'No se pudo completar la operación con GitHub.', code: error.code })
  }
  if (error instanceof Error && error.message === 'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY_MISSING') {
    return reply.status(503).send({ error: 'El servidor no tiene configurada la clave de cifrado de credenciales.', code: error.message })
  }
  throw error
}

const discoverSchema = z.object({ website: z.string().trim().min(4).max(2_048) }).strict()
const connectSchema = discoverSchema.extend({ mode: z.enum(WEBSITE_CONNECTION_MODES).optional() })
const updateSchema = z.object({ mode: z.string().optional(), status: z.enum(['setup_required', 'verification_pending', 'connected', 'degraded', 'disconnected']).optional() }).strict().refine(value => Boolean(value.mode || value.status), 'Falta un cambio')

const wordpressConnectSchema = z.object({
  username: z.string().trim().min(1).max(120),
  applicationPassword: z.string().trim().min(8).max(200),
}).strict()

const pagesQuerySchema = z.object({
  type: z.enum(['pages', 'posts']).optional(),
  search: z.string().trim().max(120).optional(),
}).strict()

const pageUpdateSchema = z.object({
  type: z.enum(['pages', 'posts']).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().max(400_000).optional(),
  excerpt: z.string().max(2_000).optional(),
  seoTitle: z.union([z.string().trim().max(200), z.null()]).optional(),
  metaDescription: z.union([z.string().trim().max(400), z.null()]).optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== 'type'), 'Falta un cambio')

type Params = { id: string }
type PageParams = { id: string; pageId: string }

function sendWordPressError(reply: FastifyReply, error: unknown) {
  if (error instanceof WordPressConnectorError) {
    return reply.status(error.status).send({ error: WORDPRESS_ERROR_MESSAGES[error.code] ?? 'No se pudo completar la operación con WordPress.', code: error.code })
  }
  if (error instanceof Error && error.message === 'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY_MISSING') {
    return reply.status(503).send({ error: 'El servidor no tiene configurada la clave de cifrado de credenciales.', code: error.message })
  }
  throw error
}

function pageId(value: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new WordPressConnectorError('WORDPRESS_PAGE_NOT_FOUND', 404)
  return id
}

export async function webConnectionsRoutes(app: FastifyInstance) {
  app.register(websiteSeoRoutes)
  app.addHook('preHandler', authenticate)
  const read = { preHandler: requirePermission('integrations.read', { scope: 'org' }) }
  const manage = { preHandler: requirePermission('integrations.manage', { scope: 'org' }) }

  app.get('/', read, async request => listWebsiteConnections(request.user.orgId))

  // La detección no crea registros ni instala nada en la web.
  app.post('/detect', manage, async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const body = parseRequest(reply, discoverSchema, request.body ?? {})
    if (!body) return
    try {
      return await detectWebsiteConnection(body.website)
    } catch (error) {
      if (error instanceof WebsiteDetectionError) return reply.status(422).send({ error: error.message, code: error.code })
      throw error
    }
  })

  app.post('/discover', manage, async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const body = parseRequest(reply, connectSchema, request.body ?? {})
    if (!body) return
    try {
      return reply.status(201).send(await discoverWebsiteConnection({ orgId: request.user.orgId, website: body.website, mode: body.mode }))
    } catch (error) {
      if (error instanceof WebsiteDetectionError) return reply.status(422).send({ error: error.message, code: error.code })
      const code = error instanceof Error ? error.message : 'WEB_CONNECTION_DISCOVERY_FAILED'
      const status = code === 'WEB_CONNECTION_URL_REQUIRED' ? 400 : code === 'WEB_CONNECTION_SITE_UNREACHABLE' ? 422 : 400
      return reply.status(status).send({ error: status === 422 ? 'La web no responde o no devuelve HTML público.' : 'No se pudo analizar esa web.', code })
    }
  })

  app.patch('/:id', manage, async (request: FastifyRequest<{ Params: Params; Body: unknown }>, reply) => {
    const body = parseRequest(reply, updateSchema, request.body ?? {})
    if (!body) return
    if (body.mode && !isWebsiteConnectionMode(body.mode)) return reply.status(400).send({ error: 'Modo de conexión no válido', code: 'WEB_CONNECTION_MODE_INVALID' })
    const updated = await updateWebsiteConnection({ orgId: request.user.orgId, id: request.params.id, mode: body.mode as any, status: body.status })
    if (!updated) return reply.status(404).send({ error: 'Conexión web no encontrada', code: 'WEB_CONNECTION_NOT_FOUND' })
    return reply.send(updated)
  })

  /* ── WordPress ──────────────────────────────────────────────────────── */

  // Conecta con usuario + contraseña de aplicación. La contraseña nunca se
  // devuelve: la respuesta es la conexión con `connector` (sin secretos).
  app.post('/:id/wordpress/connect', manage, async (request: FastifyRequest<{ Params: Params; Body: unknown }>, reply) => {
    const body = parseRequest(reply, wordpressConnectSchema, request.body ?? {})
    if (!body) return
    try {
      const connection = await connectWordPress({
        orgId: request.user.orgId,
        connectionId: request.params.id,
        username: body.username,
        applicationPassword: body.applicationPassword,
        actorUserId: request.user.userId,
        correlationId: request.correlationId,
      })
      return reply.send(connection)
    } catch (error) {
      return sendWordPressError(reply, error)
    }
  })

  app.post('/:id/wordpress/verify', manage, async (request: FastifyRequest<{ Params: Params }>, reply) => {
    try {
      return reply.send(await verifyWordPress({ orgId: request.user.orgId, connectionId: request.params.id }))
    } catch (error) {
      return sendWordPressError(reply, error)
    }
  })

  app.delete('/:id/wordpress', manage, async (request: FastifyRequest<{ Params: Params }>, reply) => {
    try {
      return reply.send(await disconnectWordPress({ orgId: request.user.orgId, connectionId: request.params.id, actorUserId: request.user.userId, correlationId: request.correlationId }))
    } catch (error) {
      return sendWordPressError(reply, error)
    }
  })

  app.post('/:id/wordpress/install-script', manage, async (request: FastifyRequest<{ Params: Params }>, reply) => {
    try {
      return reply.send(await installWordPressTracking({ orgId: request.user.orgId, connectionId: request.params.id, actorUserId: request.user.userId, correlationId: request.correlationId }))
    } catch (error) {
      return sendWordPressError(reply, error)
    }
  })

  app.get('/:id/wordpress/pages', read, async (request: FastifyRequest<{ Params: Params; Querystring: unknown }>, reply) => {
    const query = parseRequest(reply, pagesQuerySchema, request.query ?? {})
    if (!query) return
    try {
      return reply.send(await listWordPressPages({ orgId: request.user.orgId, connectionId: request.params.id, type: query.type, search: query.search }))
    } catch (error) {
      return sendWordPressError(reply, error)
    }
  })

  app.get('/:id/wordpress/pages/:pageId', read, async (request: FastifyRequest<{ Params: PageParams; Querystring: unknown }>, reply) => {
    const query = parseRequest(reply, pagesQuerySchema, request.query ?? {})
    if (!query) return
    try {
      return reply.send(await getWordPressPage({ orgId: request.user.orgId, connectionId: request.params.id, pageId: pageId(request.params.pageId), type: query.type }))
    } catch (error) {
      return sendWordPressError(reply, error)
    }
  })

  // Escritura real en la web del cliente. Registra antes/después en AuditLog.
  app.put('/:id/wordpress/pages/:pageId', manage, async (request: FastifyRequest<{ Params: PageParams; Body: unknown }>, reply) => {
    const body = parseRequest(reply, pageUpdateSchema, request.body ?? {})
    if (!body) return
    try {
      return reply.send(await updateWordPressPage({
        orgId: request.user.orgId,
        connectionId: request.params.id,
        pageId: pageId(request.params.pageId),
        changes: body,
        actorUserId: request.user.userId,
        correlationId: request.correlationId,
      }))
    } catch (error) {
      return sendWordPressError(reply, error)
    }
  })

  /* ── Git (GitHub + pull requests) ───────────────────────────────────── */

  // Crear una propuesta lanza un agente con LLM: misma barrera de coste que
  // el resto de tareas con modelo (costs.request) además de integrations.manage.
  const propose = { preHandler: [requirePermission('integrations.manage', { scope: 'org' }), requirePermission('costs.request', { scope: 'org' })] }
  type ProposalParams = { id: string; proposalId: string }

  app.post('/:id/git/connect', manage, async (request: FastifyRequest<{ Params: Params; Body: unknown }>, reply) => {
    const body = parseRequest(reply, gitConnectSchema, request.body ?? {})
    if (!body) return
    try {
      return reply.send(await connectGit({ orgId: request.user.orgId, connectionId: request.params.id, repository: body.repository, token: body.token, actorUserId: request.user.userId, correlationId: request.correlationId }))
    } catch (error) {
      return sendGitError(reply, error)
    }
  })

  app.post('/:id/git/verify', manage, async (request: FastifyRequest<{ Params: Params }>, reply) => {
    try {
      return reply.send(await verifyGit({ orgId: request.user.orgId, connectionId: request.params.id }))
    } catch (error) {
      return sendGitError(reply, error)
    }
  })

  app.delete('/:id/git', manage, async (request: FastifyRequest<{ Params: Params }>, reply) => {
    try {
      return reply.send(await disconnectGit({ orgId: request.user.orgId, connectionId: request.params.id, actorUserId: request.user.userId, correlationId: request.correlationId }))
    } catch (error) {
      return sendGitError(reply, error)
    }
  })

  app.get('/:id/git/proposals', read, async (request: FastifyRequest<{ Params: Params }>, reply) => {
    try {
      return reply.send({ items: await listGitProposals(request.user.orgId, request.params.id) })
    } catch (error) {
      return sendGitError(reply, error)
    }
  })

  app.post('/:id/git/proposals', propose, async (request: FastifyRequest<{ Params: Params; Body: unknown }>, reply) => {
    const body = parseRequest(reply, proposalCreateSchema, request.body ?? {})
    if (!body) return
    try {
      return reply.status(201).send(await createGitProposal({
        orgId: request.user.orgId,
        connectionId: request.params.id,
        instructions: body.instructions,
        title: body.title,
        source: body.source,
        actorUserId: request.user.userId,
        correlationId: request.correlationId,
      }))
    } catch (error) {
      return sendGitError(reply, error)
    }
  })

  app.get('/:id/git/proposals/:proposalId', read, async (request: FastifyRequest<{ Params: ProposalParams; Querystring: unknown }>, reply) => {
    const query = parseRequest(reply, proposalQuerySchema, request.query ?? {})
    if (!query) return
    try {
      const proposal = query.refresh
        ? await refreshGitProposal(request.user.orgId, request.params.id, request.params.proposalId)
        : await getGitProposal(request.user.orgId, request.params.id, request.params.proposalId)
      if (!proposal) return reply.status(404).send({ error: GIT_ERROR_MESSAGES.GIT_PROPOSAL_NOT_FOUND, code: 'GIT_PROPOSAL_NOT_FOUND' })
      return reply.send(proposal)
    } catch (error) {
      return sendGitError(reply, error)
    }
  })

  app.post('/:id/git/proposals/:proposalId/close', manage, async (request: FastifyRequest<{ Params: ProposalParams }>, reply) => {
    try {
      return reply.send(await closeGitProposal({ orgId: request.user.orgId, connectionId: request.params.id, proposalId: request.params.proposalId, actorUserId: request.user.userId, correlationId: request.correlationId }))
    } catch (error) {
      return sendGitError(reply, error)
    }
  })
}
