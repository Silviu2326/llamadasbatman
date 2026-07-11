import { FastifyRequest, FastifyReply } from 'fastify'
import * as service from '../services/metaAdAccount.service'

type JWTUser = { userId: string; orgId: string; role: string; email: string }

export async function oauthStartUrl(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.send({ url: service.buildOAuthStartUrl(orgId) })
}

export async function oauthStart(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  return reply.redirect(service.buildOAuthStartUrl(orgId))
}

export async function oauthCallback(
  request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>,
  reply: FastifyReply
) {
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173'
  const { code, state, error } = request.query

  if (error || !code || !state) {
    return reply.redirect(`${appUrl}/captacion/conectar?status=error`)
  }

  const orgId = service.verifyState(state)
  if (!orgId) {
    return reply.redirect(`${appUrl}/captacion/conectar?status=error`)
  }

  try {
    await service.completeOAuth(orgId, code)
    return reply.redirect(`${appUrl}/captacion/conectar?status=connected`)
  } catch (err) {
    console.error('[MetaOAuth] callback error:', err)
    return reply.redirect(`${appUrl}/captacion/conectar?status=error`)
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
