import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import * as service from '../services/metaAdAccount.service'
import { getAppUrl } from '../lib/securityConfig'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function oauthStartUrl(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    return reply.send({ url: await service.buildOAuthStartUrl(orgId) })
  } catch (error) {
    // Sin las credenciales de la app de Meta el servicio lanza antes de tocar
    // la red; eso es configuración pendiente, no un error del servidor.
    if (!process.env.META_APP_ID?.trim() || !process.env.META_APP_SECRET?.trim()) {
      return reply.status(409).send({
        error: 'La conexión con Meta todavía no está activada. Pide a tu administrador que la configure para poder conectar tu cuenta de anuncios.',
        code: 'META_OAUTH_NOT_CONFIGURED',
      })
    }
    throw error
  }
}

export async function oauthStart(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.redirect(await service.buildOAuthStartUrl(orgId))
}

export async function oauthCallback(
  request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>,
  reply: FastifyReply
) {
  const appUrl = getAppUrl()
  const errorUrl = new URL('/captacion/conectar?status=error', appUrl).toString()
  const { code, state, error } = request.query

  // Consume provider-error callbacks too. Otherwise Meta could replay the
  // same valid state and weaken the one-use guarantee.
  if (!state) return reply.redirect(errorUrl)
  const oauthState = await service.consumeOAuthState(state)
  if (!oauthState || error || !code) return reply.redirect(errorUrl)

  try {
    await service.completeOAuth(oauthState.orgId, code, oauthState.codeVerifier)
    return reply.redirect(new URL('/captacion/conectar?status=connected', appUrl).toString())
  } catch (err) {
    console.error('[MetaOAuth] callback error:', err)
    return reply.redirect(errorUrl)
  }
}

export async function status(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const account = await service.getAccount(orgId)
  return reply.send(account)
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: 'Datos no válidos',
    issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })),
  })
}

// El tope viaja en céntimos enteros (nunca decimales) y null lo retira. Un
// body sin la clave, o con un número negativo o con decimales, es 400.
export const budgetCapSchema = z.object({
  dailyBudgetCapCents: z.union([z.null(), z.number().int().min(0).max(100_000_000)]),
}).strict()

// El Pixel ID de Meta son solo dígitos (5-30); null lo retira.
export const pixelIdSchema = z.object({
  metaPixelId: z.union([z.null(), z.string().trim().regex(/^\d{5,30}$/, 'El Pixel ID debe tener entre 5 y 30 dígitos')]),
}).strict()

export const selectionSchema = z.object({
  adAccountId: z.string().trim().min(1).max(64).regex(/^act_\d+$|^\d+$/, 'Id de cuenta publicitaria no válido'),
  pageId: z.union([z.null(), z.string().trim().regex(/^\d{1,64}$/, 'Id de página no válido')]).optional(),
}).strict()

export async function budgetCap(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = budgetCapSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  await service.setBudgetCap(orgId, request.params.id, parsed.data.dailyBudgetCapCents)
  return reply.send({ ok: true })
}

export async function pixelId(
  request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  const parsed = pixelIdSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  await service.setPixelId(orgId, request.params.id, parsed.data.metaPixelId)
  return reply.send({ ok: true })
}

/** Cuentas publicitarias y páginas disponibles para el token conectado. */
export async function options(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  try {
    const result = await service.listAccountOptions(orgId)
    if (!result) return reply.status(404).send({ error: 'No hay ninguna cuenta de Meta conectada.', code: 'META_NOT_CONNECTED' })
    return reply.send(result)
  } catch (error) {
    return metaProviderError(reply, error)
  }
}

export async function select(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const parsed = selectionSchema.safeParse(request.body)
  if (!parsed.success) return validationError(reply, parsed.error)
  try {
    const account = await service.selectAccountTargets(orgId, {
      adAccountId: parsed.data.adAccountId,
      pageId: parsed.data.pageId ?? null,
    })
    if (!account) return reply.status(404).send({ error: 'No hay ninguna cuenta de Meta conectada.', code: 'META_NOT_CONNECTED' })
    return reply.send(account)
  } catch (error) {
    return metaProviderError(reply, error)
  }
}

// Un fallo de Graph no es un 500 nuestro: se enseña como pasarela caída, con
// el mensaje seguro del servicio (nunca el cuerpo del proveedor).
function metaProviderError(reply: FastifyReply, error: unknown) {
  if (error instanceof service.MetaAccountSelectionError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code })
  }
  if (error instanceof Error && error.name === 'MetaRequestError') {
    return reply.status(502).send({ error: error.message, code: 'META_PROVIDER_ERROR' })
  }
  throw error
}

export async function disconnect(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await service.disconnect(orgId, request.params.id)
  return reply.send({ ok: true })
}
