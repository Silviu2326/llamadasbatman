import { FastifyRequest, FastifyReply } from 'fastify'
import * as service from '../services/adPlaybook.service'

export async function list(_request: FastifyRequest, reply: FastifyReply) {
  const playbooks = await service.listAdPlaybooks()
  return reply.send(playbooks)
}

export async function create(
  request: FastifyRequest<{
    Body: {
      vertical: string
      offer: string
      leadMagnet?: string
      adCopy: string
      landingTemplateId: string
      imagePrompt: string
    }
  }>,
  reply: FastifyReply
) {
  const playbook = await service.createAdPlaybook(request.body)
  return reply.status(201).send(playbook)
}

export async function update(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      offer?: string
      leadMagnet?: string
      adCopy?: string
      landingTemplateId?: string
      imagePrompt?: string
      isActive?: boolean
    }
  }>,
  reply: FastifyReply
) {
  const playbook = await service.updateAdPlaybook(request.params.id, request.body)
  return reply.send(playbook)
}
