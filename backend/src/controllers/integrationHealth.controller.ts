import { FastifyReply, FastifyRequest } from 'fastify'
import { getIntegrationReadiness, getOperationalReadiness } from '../services/integrationHealth.service'
import { getWorkerHealth } from '../observability/operationalHealth'

type HealthQuery = { probe?: string }

export async function integrations(request: FastifyRequest<{ Querystring: HealthQuery }>, reply: FastifyReply) {
  const probeExternal = request.query.probe === 'true'
  reply.header('cache-control', 'no-store')
  return reply.send(await getIntegrationReadiness({ probeExternal }))
}

export async function ready(_request: FastifyRequest, reply: FastifyReply) {
  reply.header('cache-control', 'no-store')
  const [result, worker] = await Promise.all([getOperationalReadiness(), getWorkerHealth()])
  const ready = result.status === 'ready' && worker.status !== 'not_ready'
  return reply.status(ready ? 200 : 503).send({ ...result, status: ready ? 'ready' : 'not_ready', workerStatus: worker.status, worker })
}
