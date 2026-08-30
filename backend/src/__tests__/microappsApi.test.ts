// Tests offline de la API de microapps y capabilities (07-MICROAPPS §2).
// Sin BD: se registra una microapp fake y se ejercitan los handlers con
// request/reply simulados. Igual que providerRouter.test.ts, basta una
// DATABASE_URL de mentira fijada antes de importar (prisma es perezoso).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { registerMicroapp, unregisterMicroappForTests } from '../microapps/registry'
import type { MicroappManifest } from '../microapps/types'
import * as microapps from '../controllers/microapps.controller'
import * as capabilities from '../controllers/capabilities.controller'
import { registerCapabilityContract, registerProvider } from '../providers/registry'
import { RoutingError } from '../providers/router'
import { WalletError } from '../services/wallet.service'
import { prisma } from '../lib/prisma'
import { microappAccessSnapshots } from '../microapps/runtime'

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

type MockReply = FastifyReply & { statusCode: number; body: unknown }

function mockReply(): MockReply {
  const reply = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      reply.statusCode = code
      return reply
    },
    send(payload: unknown) {
      reply.body = payload
      return reply
    },
  }
  return reply as unknown as MockReply
}

function mockRequest(over: Record<string, unknown> = {}): FastifyRequest {
  return {
    user: { userId: 'u-1', orgId: 'org-1', role: 'owner', email: 'test@example.test' },
    params: {},
    query: {},
    body: {},
    headers: {},
    ...over,
  } as unknown as FastifyRequest
}

const FAKE_ID = 'test-fake-app'

const fakeManifest: MicroappManifest = {
  id: FAKE_ID,
  version: '1.0.0',
  name: 'Microapp de prueba',
  promise: 'Devuelve un eco estructurado',
  category: 'research',
  inputSchema: z.object({
    topic: z.string().min(1),
    depth: z.enum(['fast', 'deep']).default('fast'),
    maxResults: z.number().int().optional(),
  }),
  outputSchema: z.object({ summary: z.string() }),
  uiSchema: [
    { key: 'topic', label: 'Tema', widget: 'text' },
    { key: 'depth', label: 'Profundidad', widget: 'select', options: [{ value: 'fast', label: 'Rápida' }, { value: 'deep', label: 'Profunda' }] },
  ],
  capabilities: ['llm.generate'],
  dataAccess: ['leads.read'],
  effects: 'local',
  estimateCost: async (input) => ({ cents: (input as { depth?: string }).depth === 'deep' ? 40 : 7 }),
  freshnessDays: 30,
  followUps: [{ kind: 'save_to_crm', label: 'Guardar en el CRM' }],
  run: async () => ({ data: { summary: 'ok' }, evidence: [] }),
}

function withFakeMicroapp(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    registerMicroapp(fakeManifest)
    try {
      await fn()
    } finally {
      unregisterMicroappForTests(FAKE_ID)
    }
  }
}

// ---------------------------------------------------------------------------
// Serialización zod → JSON Schema resumido
// ---------------------------------------------------------------------------

test('zodToJsonSchemaSummary cubre objeto, enum con default, opcional y requeridos', () => {
  const schema = microapps.zodToJsonSchemaSummary(fakeManifest.inputSchema)
  assert.deepEqual(schema, {
    type: 'object',
    properties: {
      topic: { type: 'string', minLength: 1 },
      depth: { type: 'string', enum: ['fast', 'deep'], default: 'fast' },
      maxResults: { type: 'integer' },
    },
    required: ['topic'],
  })
})

test('zodToJsonSchemaSummary conserva restricciones útiles para clientes MCP', () => {
  const schema = z.object({
    email: z.string().email().min(6).max(120).describe('Correo de contacto'),
    score: z.number().int().min(0).max(100),
    tags: z.array(z.string()).min(1).max(5),
    note: z.string().nullable(),
  })
  assert.deepEqual(microapps.zodToJsonSchemaSummary(schema), {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email', minLength: 6, maxLength: 120, description: 'Correo de contacto' },
      score: { type: 'integer', minimum: 0, maximum: 100 },
      tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
      note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    required: ['email', 'score', 'tags', 'note'],
  })
})

test('zodToJsonSchemaSummary degrada tipos no cubiertos a {} en lugar de romper', () => {
  assert.deepEqual(microapps.zodToJsonSchemaSummary(z.map(z.string(), z.string())), {})
  assert.deepEqual(microapps.zodToJsonSchemaSummary(z.array(z.string())), { type: 'array', items: { type: 'string' } })
})

// ---------------------------------------------------------------------------
// Catálogo y manifiesto
// ---------------------------------------------------------------------------

test('el catálogo proyecta el manifiesto sin funciones internas', withFakeMicroapp(async () => {
  const reply = mockReply()
  await microapps.list(mockRequest(), reply)
  const { microapps: catalog } = reply.body as { microapps: Array<Record<string, unknown>> }
  const entry = catalog.find((item) => item.id === FAKE_ID)
  assert.ok(entry, 'la microapp registrada aparece en el catálogo')
  assert.equal(entry!.name, 'Microapp de prueba')
  assert.equal(entry!.category, 'research')
  assert.equal(entry!.effects, 'local')
  assert.equal(entry!.freshnessDays, 30)
  assert.deepEqual(entry!.capabilities, ['llm.generate'])
  assert.deepEqual(entry!.dataAccess, ['leads.read'])
  assert.equal(entry!.approvalAction, null)
  assert.equal(entry!.collection, 'existing')
  assert.equal(entry!.editorialNumber, null)
  assert.equal(entry!.catalogEdition, 'existing')
  // La lista es deliberadamente ligera; el contrato de ejecución sale solo
  // en GET /:id.
  assert.equal('followUps' in entry!, false)
  assert.equal('uiSchema' in entry!, false)
  assert.equal('inputSchema' in entry!, false)
  // Nada ejecutable ni interno debe salir por la API pública.
  assert.equal('run' in entry!, false)
  assert.equal('estimateCost' in entry!, false)
  assert.equal('outputSchema' in entry!, false)
}))

test('GET /:id conserva el contrato completo que necesita el runner', withFakeMicroapp(async () => {
  const reply = mockReply()
  await microapps.get(mockRequest({ params: { id: FAKE_ID } }) as never, reply)
  const entry = reply.body as Record<string, unknown>
  assert.equal(reply.statusCode, 200)
  assert.deepEqual(entry.followUps, [{ kind: 'save_to_crm', label: 'Guardar en el CRM' }])
  assert.deepEqual(entry.dataAccess, ['leads.read'])
  assert.equal(entry.approvalAction, null)
  assert.equal((entry.uiSchema as unknown[]).length, 2)
  assert.equal((entry.inputSchema as { type?: string }).type, 'object')
  assert.equal((entry.agenticProfile as { roles?: unknown[] }).roles?.length, 3)
  const workflow = entry.agenticWorkflow as { available?: boolean; requiresExplicitExternalReviewConsent?: boolean; installInputSchema?: { required?: string[] } }
  assert.equal(workflow.available, true)
  assert.equal(workflow.requiresExplicitExternalReviewConsent, true)
  assert.deepEqual(workflow.installInputSchema?.required, ['allowExternalReview'])
}))

test('template agentic existe y la instalación no permite eludir dataAccess', withFakeMicroapp(async () => {
  const templateReply = mockReply()
  await microapps.getAgenticFlowTemplate(mockRequest({ params: { id: FAKE_ID } }) as never, templateReply)
  const template = templateReply.body as { graph: { nodes: Array<{ type: string; microappId?: string }> } }
  assert.equal(template.graph.nodes.find(node => node.type === 'microapp')?.microappId, FAKE_ID)

  const denied = mockReply()
  await microapps.installAgenticFlow(mockRequest({
    params: { id: FAKE_ID },
    user: { userId: 'guest-1', orgId: 'org-1', role: 'guest', email: 'guest@example.test' },
  }) as never, denied)
  assert.equal(denied.statusCode, 403)
  assert.equal((denied.body as { code?: string }).code, 'MICROAPP_DATA_ACCESS_DENIED')
}))

test('instalar un workflow agentic exige consentimiento externo explícito', withFakeMicroapp(async () => {
  const reply = mockReply()
  await microapps.installAgenticFlow(mockRequest({ params: { id: FAKE_ID }, body: {} }) as never, reply)
  assert.equal(reply.statusCode, 400)
  assert.equal((reply.body as { code?: string }).code, 'AGENTIC_EXTERNAL_REVIEW_CONSENT_REQUIRED')
}))

test('la proyección identifica de forma estable una microapp de la selección 60', () => {
  const entry = microapps.manifestProjection({ ...fakeManifest, id: 'opportunity-close-plan' })
  assert.equal(entry.collection, 'revenue-agency')
  assert.equal(entry.editorialNumber, 1)
  assert.equal(entry.catalogEdition, 'selected-60')
})

test('GET /:id devuelve 404 para microapp desconocida', async () => {
  const reply = mockReply()
  await microapps.get(mockRequest({ params: { id: 'no-existe' } }) as never, reply)
  assert.equal(reply.statusCode, 404)
  assert.equal((reply.body as { code?: string }).code, 'MICROAPP_UNKNOWN')
})

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

test('estimate valida el input y devuelve céntimos del manifiesto', withFakeMicroapp(async () => {
  const ok = mockReply()
  await microapps.estimate(
    mockRequest({ params: { id: FAKE_ID }, body: { input: { topic: 'ia', depth: 'deep' } } }) as never,
    ok,
  )
  assert.equal(ok.statusCode, 200)
  assert.deepEqual(ok.body, { cents: 40 })

  const bad = mockReply()
  await microapps.estimate(
    mockRequest({ params: { id: FAKE_ID }, body: { input: { depth: 'deep' } } }) as never,
    bad,
  )
  assert.equal(bad.statusCode, 400)
  assert.equal((bad.body as { code?: string }).code, 'MICROAPP_INPUT_INVALID')
  assert.ok((bad.body as { details?: unknown }).details, 'incluye los detalles de zod')
}))

// ---------------------------------------------------------------------------
// Run: gate de dataAccess (la creación real del job requiere BD y no se prueba aquí)
// ---------------------------------------------------------------------------

test('run rechaza con 403 si el rol no tiene los permisos de dataAccess del manifiesto', async () => {
  const strict: MicroappManifest = {
    ...fakeManifest,
    id: 'test-fake-strict',
    // Permiso inexistente: hasPermission cierra por defecto, así el test no
    // depende de la matriz concreta de roles.
    dataAccess: ['permiso.inexistente'],
  }
  registerMicroapp(strict)
  try {
    const reply = mockReply()
    await microapps.run(
      mockRequest({ params: { id: 'test-fake-strict' }, body: { input: { topic: 'ia' } } }) as never,
      reply,
    )
    assert.equal(reply.statusCode, 403)
    assert.equal((reply.body as { code?: string }).code, 'MICROAPP_DATA_ACCESS_DENIED')
    assert.deepEqual((reply.body as { details?: { missing?: string[] } }).details?.missing, ['permiso.inexistente'])
  } finally {
    unregisterMicroappForTests('test-fake-strict')
  }
})

test('run exige una clave de idempotencia acotada cuando el cliente la aporta', withFakeMicroapp(async () => {
  const reply = mockReply()
  await microapps.run(
    mockRequest({ params: { id: FAKE_ID }, body: { input: { topic: 'ia' }, idempotencyKey: 'corta' } }) as never,
    reply,
  )
  assert.equal(reply.statusCode, 400)
  assert.match(String((reply.body as { error?: string }).error), /Datos de entrada no válidos/i)
}))

test('run rechaza claves de idempotencia contradictorias entre body y cabecera', withFakeMicroapp(async () => {
  const reply = mockReply()
  await microapps.run(
    mockRequest({
      params: { id: FAKE_ID },
      headers: { 'idempotency-key': 'header-key-12345' },
      body: { input: { topic: 'ia' }, idempotencyKey: 'body-key-123456' },
    }) as never,
    reply,
  )
  assert.equal(reply.statusCode, 409)
  assert.equal((reply.body as { code?: string }).code, 'IDEMPOTENCY_KEY_CONFLICT')
}))

test('run rechaza vínculos que no pertenecen a la organización antes de crear el Job', withFakeMicroapp(async () => {
  const originals = {
    leadFindFirst: prisma.lead.findFirst,
    accountFindFirst: prisma.account.findFirst,
    productionFindFirst: prisma.production.findFirst,
  }
  const queries: unknown[] = []
  ;(prisma.lead as any).findFirst = async (args: unknown) => { queries.push(args); return null }
  ;(prisma.account as any).findFirst = async (args: unknown) => { queries.push(args); return null }
  ;(prisma.production as any).findFirst = async (args: unknown) => { queries.push(args); return null }
  try {
    const reply = mockReply()
    await microapps.run(mockRequest({
      params: { id: FAKE_ID },
      body: { input: { topic: 'ia' }, leadId: 'lead-ajeno', accountId: 'account-ajena', productionId: 'production-ajena' },
    }) as never, reply)
    assert.equal(reply.statusCode, 404)
    assert.equal((reply.body as { code?: string }).code, 'MICROAPP_LINK_NOT_FOUND')
    assert.deepEqual((reply.body as { details?: { invalid?: string[] } }).details?.invalid, ['leadId', 'accountId', 'productionId'])
    assert.equal(queries.length, 3)
    for (const query of queries) assert.equal((query as { where?: { orgId?: string } }).where?.orgId, 'org-1')
  } finally {
    ;(prisma.lead as any).findFirst = originals.leadFindFirst
    ;(prisma.account as any).findFirst = originals.accountFindFirst
    ;(prisma.production as any).findFirst = originals.productionFindFirst
  }
}))

test('run devuelve 404 para microapp desconocida y 401 sin principal válido', async () => {
  const notFound = mockReply()
  await microapps.run(mockRequest({ params: { id: 'no-existe' } }) as never, notFound)
  assert.equal(notFound.statusCode, 404)

  const noAuth = mockReply()
  await microapps.run(mockRequest({ user: { role: 'rol-desconocido' }, params: { id: FAKE_ID } }) as never, noAuth)
  assert.equal(noAuth.statusCode, 401)
})

test('el historial no expone runs de microapps cuyo dataAccess no tiene el rol', withFakeMicroapp(async () => {
  const originals = {
    runFindFirst: prisma.microappRun.findFirst,
    runCount: prisma.microappRun.count,
    runFindMany: prisma.microappRun.findMany,
  }
  let historySelect: Record<string, unknown> | undefined
  let countCalls = 0
  ;(prisma.microappRun as any).findFirst = async () => ({ id: 'run-sensitive', orgId: 'org-1', microappId: FAKE_ID, input: { pii: true }, result: { secret: true } })
  ;(prisma.microappRun as any).count = async () => { countCalls++; return 0 }
  ;(prisma.microappRun as any).findMany = async ({ select }: { select: Record<string, unknown> }) => { historySelect = select; return [] }
  try {
    const request = mockRequest({ user: { userId: 'guest-1', orgId: 'org-1', role: 'guest', email: 'guest@example.test' } })
    const detail = mockReply()
    await microapps.getRun({ ...request, params: { id: 'run-sensitive' } } as never, detail)
    assert.equal(detail.statusCode, 403)
    assert.equal((detail.body as { code?: string }).code, 'MICROAPP_HISTORY_ACCESS_DENIED')

    const filtered = mockReply()
    await microapps.listRuns({ ...request, query: { microappId: FAKE_ID } } as never, filtered)
    assert.equal(filtered.statusCode, 403)
    assert.equal((filtered.body as { code?: string }).code, 'MICROAPP_HISTORY_ACCESS_DENIED')
    assert.equal(countCalls, 2, 'comprueba el conjunto autorizado y, solo al quedar vacío, la existencia explícita')
    assert.ok(historySelect)
    assert.equal(historySelect!.input, undefined)
    assert.equal(historySelect!.result, undefined)
  } finally {
    ;(prisma.microappRun as any).findFirst = originals.runFindFirst
    ;(prisma.microappRun as any).count = originals.runCount
    ;(prisma.microappRun as any).findMany = originals.runFindMany
  }
}))

test('el listado general aplica snapshots por fila y conserva el filtro org', withFakeMicroapp(async () => {
  const originals = { runCount: prisma.microappRun.count, runFindMany: prisma.microappRun.findMany }
  const whereClauses: Array<Record<string, unknown>> = []
  let findArgs: Record<string, any> | undefined
  ;(prisma.microappRun as any).count = async ({ where }: { where: Record<string, unknown> }) => { whereClauses.push(where); return 0 }
  ;(prisma.microappRun as any).findMany = async (args: Record<string, any>) => { findArgs = args; whereClauses.push(args.where); return [] }
  try {
    const reply = mockReply()
    await microapps.listRuns(mockRequest({
      user: { userId: 'guest-1', orgId: 'org-1', role: 'guest', email: 'guest@example.test' },
      query: {},
    }) as never, reply)
    assert.equal(reply.statusCode, 200)
    assert.equal(whereClauses.length, 2)
    for (const where of whereClauses) {
      assert.equal(where.orgId, 'org-1')
      assert.equal(where.microappId, undefined)
      const access = (where.AND as any[])[0]
      assert.deepEqual(access.OR[0].accessRolesSnapshot.array_contains, ['guest'])
      assert.equal(access.OR[1].microappId.in.includes(FAKE_ID), false, 'legacy usa únicamente manifests legibles hoy')
    }
    assert.equal(findArgs!.skip, 0)
    assert.equal(findArgs!.take, 25)
    assert.deepEqual(findArgs!.orderBy, { createdAt: 'desc' })
  } finally {
    ;(prisma.microappRun as any).count = originals.runCount
    ;(prisma.microappRun as any).findMany = originals.runFindMany
  }
}))

test('R6 una relajación futura del manifest no abre runs protegidos por snapshots', async () => {
  const id = 'test-relaxed-history'
  const relaxed: MicroappManifest = { ...fakeManifest, id, dataAccess: [] }
  registerMicroapp(relaxed)
  const originals = {
    runFindFirst: prisma.microappRun.findFirst,
    runCount: prisma.microappRun.count,
    runFindMany: prisma.microappRun.findMany,
  }
  const historical = {
    id: 'run-versioned', orgId: 'org-1', microappId: id,
    dataAccessSnapshot: ['leads.read'], accessRolesSnapshot: ['owner'],
    input: { pii: true }, result: { secret: true }, createdAt: new Date(),
  }
  ;(prisma.microappRun as any).findFirst = async () => historical
  ;(prisma.microappRun as any).count = async ({ where }: { where: Record<string, unknown> }) => 'AND' in where ? 0 : 1
  let listCalls = 0
  ;(prisma.microappRun as any).findMany = async () => { listCalls++; return [] }
  try {
    const guest = mockRequest({ user: { userId: 'guest-1', orgId: 'org-1', role: 'guest', email: 'guest@example.test' } })
    const detail = mockReply()
    await microapps.getRun({ ...guest, params: { id: historical.id } } as never, detail)
    assert.equal(detail.statusCode, 403)
    assert.equal((detail.body as { code?: string }).code, 'MICROAPP_HISTORY_ACCESS_DENIED')

    const listed = mockReply()
    await microapps.listRuns({ ...guest, query: { microappId: id } } as never, listed)
    assert.equal(listed.statusCode, 403)
    assert.equal(listCalls, 1, 'no carga la proyección del run después de denegar su snapshot')

    assert.equal(microapps.canReadMicroappRun('guest', historical), false)
    assert.equal(microapps.canReadMicroappRun('owner', historical), true)
    assert.equal(microapps.canReadMicroappRun('owner', { ...historical, accessRolesSnapshot: null }), false, 'snapshot parcial falla cerrado')
    assert.equal(microapps.canReadMicroappRun('guest', { ...historical, dataAccessSnapshot: null, accessRolesSnapshot: null }), true, 'un run legacy usa el manifest actual')
    assert.equal(microapps.canReadMicroappRun('owner', { ...historical, microappId: 'manifest-retirado' }), false, 'manifest desconocido falla cerrado')
  } finally {
    ;(prisma.microappRun as any).findFirst = originals.runFindFirst
    ;(prisma.microappRun as any).count = originals.runCount
    ;(prisma.microappRun as any).findMany = originals.runFindMany
    unregisterMicroappForTests(id)
  }
})

test('R6 el snapshot de runtime congela permisos y roles elegibles', () => {
  const snapshot = microappAccessSnapshots(fakeManifest)
  assert.deepEqual(snapshot.dataAccessSnapshot, ['leads.read'])
  assert.ok(snapshot.accessRolesSnapshot.includes('owner'))
  assert.equal(snapshot.accessRolesSnapshot.includes('guest'), false)
})

// ---------------------------------------------------------------------------
// Mapeo de errores compartido
// ---------------------------------------------------------------------------

test('replyWithRunError mapea WalletError 402 con las dos salidas accionables', () => {
  const reply = mockReply()
  microapps.replyWithRunError(reply, new WalletError('Saldo insuficiente', 402, 'WALLET_INSUFFICIENT_FUNDS'))
  assert.equal(reply.statusCode, 402)
  assert.deepEqual(reply.body, {
    error: 'Saldo insuficiente',
    code: 'WALLET_INSUFFICIENT_FUNDS',
    actions: ['topup', 'byok'],
  })
})

test('replyWithRunError respeta el statusCode de RoutingError con sus detalles', () => {
  const reply = mockReply()
  microapps.replyWithRunError(reply, new RoutingError('Sin proveedores', 'NO_VIABLE_PROVIDER', 422, { exclusions: [] }))
  assert.equal(reply.statusCode, 422)
  assert.deepEqual(reply.body, { error: 'Sin proveedores', code: 'NO_VIABLE_PROVIDER', details: { exclusions: [] } })
})

test('replyWithRunError traduce los errores tipados del runtime y relanza el resto', () => {
  const reply = mockReply()
  microapps.replyWithRunError(
    reply,
    Object.assign(new Error('Entrada inválida'), { statusCode: 400, code: 'MICROAPP_INPUT_INVALID', details: { formErrors: [] } }),
  )
  assert.equal(reply.statusCode, 400)
  assert.equal((reply.body as { code?: string }).code, 'MICROAPP_INPUT_INVALID')

  // Un error sin contrato { statusCode, code } no se enmascara: se relanza.
  assert.throws(() => microapps.replyWithRunError(mockReply(), new Error('boom')), /boom/)
})

// ---------------------------------------------------------------------------
// Catálogo de capabilities
// ---------------------------------------------------------------------------

test('GET /api/capabilities lista solo capabilities con contrato y sus proveedores', async () => {
  registerCapabilityContract({ capability: 'test.con-contrato', input: z.object({ q: z.string() }), output: z.any() })
  registerProvider({
    id: 'proveedor-test-capabilities',
    displayName: 'Proveedor de prueba',
    capabilities: [
      {
        capability: 'test.con-contrato',
        qualityTier: 'standard',
        limits: {},
        estimateCost: async () => ({ cents: 1, confidence: 'exact' }),
        execute: async () => ({ output: {} }),
      },
      {
        // Binding sin contrato registrado: no debe aparecer en el catálogo.
        capability: 'test.sin-contrato',
        qualityTier: 'draft',
        limits: {},
        estimateCost: async () => ({ cents: 1, confidence: 'exact' }),
        execute: async () => ({ output: {} }),
      },
    ],
    auth: { modes: ['managed', 'byok'] },
    commercialUseAllowed: true,
    tosReviewedAt: '2026-08-18',
    docsUrl: 'https://example.test',
  })

  const reply = mockReply()
  await capabilities.list(mockRequest(), reply)
  const listed = (reply.body as { capabilities: Array<{ capability: string; providers: Array<Record<string, unknown>> }> }).capabilities

  const withContract = listed.find((c) => c.capability === 'test.con-contrato')
  assert.ok(withContract, 'la capability con contrato aparece')
  assert.deepEqual(withContract!.providers, [{
    providerId: 'proveedor-test-capabilities',
    displayName: 'Proveedor de prueba',
    qualityTier: 'standard',
    authModes: ['managed', 'byok'],
  }])
  assert.equal(listed.some((c) => c.capability === 'test.sin-contrato'), false)
})
