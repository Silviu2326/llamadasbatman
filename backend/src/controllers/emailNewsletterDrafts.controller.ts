import { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { parseRequest } from '../lib/validation'
import * as service from '../services/emailNewsletterDrafts.service'

type JWTUser = { orgId: string }

const idSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict()
const urlField = z.string().trim().max(2_048).refine(value => !value || /^https?:\/\//i.test(value), 'La URL debe usar http o https')
const contentSchema = z.object({
  brand: z.string().max(120),
  logoUrl: urlField,
  accent: z.string().regex(/^#[\da-f]{6}$/i),
  subject: z.string().max(180),
  preheader: z.string().max(240),
  heading: z.string().max(240),
  intro: z.string().max(500),
  body: z.string().max(30_000),
  cta: z.string().max(100),
  ctaUrl: urlField,
  footer: z.string().max(2_000),
}).strict()
const draftSchema = z.object({
  name: z.string().trim().min(1).max(140),
  content: contentSchema,
}).strict()

export async function list(_request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = _request.user as JWTUser
  return reply.send(await service.listNewsletterDrafts(orgId))
}

export async function create(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const body = parseRequest(reply, draftSchema, request.body)
  if (!body) return
  return reply.status(201).send(await service.createNewsletterDraft(orgId, body))
}

export async function update(request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const [params, body] = [parseRequest(reply, idSchema, request.params), parseRequest(reply, draftSchema, request.body)]
  if (!params || !body) return
  const draft = await service.updateNewsletterDraft(orgId, params.id, body)
  if (!draft) return reply.status(404).send({ error: 'Borrador no encontrado' })
  return reply.send(draft)
}

export async function remove(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { orgId } = request.user as JWTUser
  const params = parseRequest(reply, idSchema, request.params)
  if (!params) return
  if (!(await service.deleteNewsletterDraft(orgId, params.id))) return reply.status(404).send({ error: 'Borrador no encontrado' })
  return reply.status(204).send()
}

