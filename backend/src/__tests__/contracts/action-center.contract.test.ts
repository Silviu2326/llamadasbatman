import test from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../lib/prisma'
import {
  ActionItemIdempotencyError,
  ActionItemStatusError,
  normalizeActionItemStatus,
  updateActionItemStatus,
  type ActionItemStatus,
} from '../../services/actionCenter.service'

type Row = Record<string, unknown> & {
  id: string
  status: ActionItemStatus
}

function row(status: ActionItemStatus, id = 'action-1'): Row {
  return {
    id,
    orgId: 'org-contract',
    dedupeKey: id,
    kind: 'lead_follow_up',
    title: 'Contactar lead',
    evidence: 'Lead nuevo sin contactar',
    priority: 'high',
    impactMetric: 'leads',
    impactValue: 1,
    impactLabel: '1 lead',
    ownerType: 'system',
    ownerId: null,
    ownerLabel: 'Sistema',
    status,
    ctaLabel: 'Abrir lead',
    ctaMethod: 'navigate',
    targetType: 'lead',
    targetId: 'lead-1',
    targetPath: '/leads/lead-1',
    dueAt: null,
    result: null,
    resultLabel: null,
    lastResultAt: null,
    completedAt: null,
    dismissedAt: null,
    createdAt: new Date('2026-07-22T10:00:00.000Z'),
    updatedAt: new Date('2026-07-22T10:00:00.000Z'),
  }
}

async function withTransaction<T>(client: Record<string, unknown>, work: () => Promise<T>): Promise<T> {
  const prismaClient = prisma as unknown as { $transaction: unknown }
  const original = prismaClient.$transaction
  prismaClient.$transaction = async (callback: (tx: unknown) => Promise<T>) => callback(client)
  try {
    return await work()
  } finally {
    prismaClient.$transaction = original
  }
}

test('normaliza los estados de compatibilidad sin ampliar el estado persistido', () => {
  assert.equal(normalizeActionItemStatus('postponed'), 'blocked')
  assert.equal(normalizeActionItemStatus('discarded'), 'dismissed')
  assert.equal(normalizeActionItemStatus('in_progress'), 'in_progress')
})

test('una transición válida escribe historial con la misma clave de idempotencia', async () => {
  let current = row('new')
  const history: unknown[] = []
  let updates = 0
  const client = {
    actionItem: {
      findFirst: async () => current,
      updateMany: async () => {
        updates += 1
        current = { ...current, status: 'accepted' }
        return { count: 1 }
      },
      findUnique: async () => current,
    },
    actionItemHistory: {
      findUnique: async () => null,
      create: async (args: unknown) => {
        history.push(args)
        return args
      },
    },
  }

  const updated = await withTransaction(client, () => updateActionItemStatus('org-contract', 'action-1', 'accepted', {
    actorUserId: 'user-approver',
    idempotencyKey: 'action-transition-001',
    reason: 'Revisado',
  }))

  assert.equal(updated.status, 'accepted')
  assert.equal(updates, 1)
  assert.equal(history.length, 1)
  assert.equal((history[0] as { data: { idempotencyKey: string } }).data.idempotencyKey, 'action-transition-001')
})

test('una transición terminal inválida se rechaza antes de escribir', async () => {
  let updates = 0
  const client = {
    actionItem: {
      findFirst: async () => row('completed'),
      updateMany: async () => {
        updates += 1
        return { count: 1 }
      },
    },
    actionItemHistory: { findUnique: async () => null },
  }

  await assert.rejects(
    () => withTransaction(client, () => updateActionItemStatus('org-contract', 'action-1', 'new')),
    (error: unknown) => error instanceof ActionItemStatusError && error.current === 'completed' && error.next === 'new',
  )
  assert.equal(updates, 0)
})

test('un replay de idempotencia no ejecuta otra transición y una colisión entre acciones se bloquea', async () => {
  let updates = 0
  const current = row('accepted')
  const replay = {
    actionItemId: current.id,
    actionItem: current,
  }
  const client = {
    actionItem: {
      findFirst: async () => current,
      updateMany: async () => {
        updates += 1
        return { count: 1 }
      },
    },
    actionItemHistory: { findUnique: async () => replay },
  }

  const result = await withTransaction(client, () => updateActionItemStatus('org-contract', 'action-1', 'completed', {
    idempotencyKey: 'action-replay-001',
  }))
  assert.equal(result.status, 'accepted')
  assert.equal(updates, 0)

  const collisionClient = {
    ...client,
    actionItemHistory: { findUnique: async () => ({ ...replay, actionItemId: 'other-action' }) },
  }
  await assert.rejects(
    () => withTransaction(collisionClient, () => updateActionItemStatus('org-contract', 'action-1', 'completed', {
      idempotencyKey: 'action-replay-001',
    })),
    (error: unknown) => error instanceof ActionItemIdempotencyError,
  )
})
