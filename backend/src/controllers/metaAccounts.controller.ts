import { FastifyRequest, FastifyReply } from 'fastify'
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

export async function budgetCap(
  request: FastifyRequest<{ Params: { id: string }; Body: { dailyBudgetCapCents: number } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await service.setBudgetCap(orgId, request.params.id, request.body.dailyBudgetCapCents)
  return reply.send({ ok: true })
}

export async function pixelId(
  request: FastifyRequest<{ Params: { id: string }; Body: { metaPixelId: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await service.setPixelId(orgId, request.params.id, request.body.metaPixelId)
  return reply.send({ ok: true })
}

export async function disconnect(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { orgId } = request.user as JWTUser
  await service.disconnect(orgId, request.params.id)
  return reply.send({ ok: true })
}
