// Eventos de resultado — docs/plataforma-abierta/09-MODELO-COMERCIAL-Y-METRICAS.md §5.
//
// North star: resultados de negocio completados por organización y semana.
// `emitOutcome` se llama desde los puntos donde el resultado ya ocurrió
// (oportunidad ganada, reunión creada, publicación, campaña activada) y sigue
// el mismo principio que `recordUsage` (lib/usage.ts): registrar nunca puede
// tumbar la operación de negocio que lo origina — un fallo se loguea y se
// pierde esa fila, no el resultado del cliente.
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'

export const OUTCOME_KINDS = [
  'research_used',
  'ad_approved',
  'meeting_booked',
  'campaign_published',
  'deal_won',
  'asset_published',
] as const

export type OutcomeKind = (typeof OUTCOME_KINDS)[number]

export interface OutcomeInput {
  orgId: string
  kind: OutcomeKind
  /** { flowRunId?, microappRunId?, callId?, campaignId?, opportunityId?, ... } */
  sourceRef: Record<string, unknown>
  /** Céntimos, solo si el resultado tiene valor económico directo. */
  valueCents?: number | null
  /** Clave del efecto upstream (p. ej. opportunity:<id>:won). */
  idempotencyKey?: string
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function outcomeIdempotencyKey(input: Pick<OutcomeInput, 'kind' | 'sourceRef' | 'idempotencyKey'>): string {
  const explicit = input.idempotencyKey?.trim()
  if (explicit) return explicit.slice(0, 240)
  const digest = createHash('sha256').update(canonicalJson(input.sourceRef)).digest('hex')
  return `${input.kind}:sha256:${digest}`
}

export async function emitOutcome(input: OutcomeInput): Promise<void> {
  try {
    await prisma.outcomeEvent.create({
      data: {
        orgId: input.orgId,
        kind: input.kind,
        sourceRef: input.sourceRef as Prisma.InputJsonObject,
        valueCents: input.valueCents ?? null,
        idempotencyKey: outcomeIdempotencyKey(input),
      },
    })
  } catch (err) {
    // Reintentar un subscriber/outbox es éxito idempotente.
    if ((err as { code?: string }).code === 'P2002') return
    console.error('[outcomes] no se pudo registrar el resultado', {
      kind: input.kind,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Lunes 00:00 UTC de la semana de `date` — el bucket semanal de la serie. */
function weekStart(date: Date): Date {
  const day = date.getUTCDay()
  const diff = (day + 6) % 7 // lunes = 0
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diff))
  return start
}

export interface OutcomeWeek {
  weekStart: string
  total: number
  valueCents: number
  byKind: Record<string, number>
}

export interface OutcomeSummary {
  weeks: OutcomeWeek[]
  /** Total del mes natural en curso. */
  month: { total: number; valueCents: number; byKind: Record<string, number> }
}

/**
 * Serie semanal por kind para el dashboard. Se agrega en memoria en vez de con
 * `groupBy` porque Prisma no sabe truncar por semana y los volúmenes por org
 * son bajos (decenas de resultados/semana, con tope de lectura defensivo).
 */
export async function getOutcomeSummary(params: { orgId: string; weeks?: number }): Promise<OutcomeSummary> {
  const weeksCount = Math.min(Math.max(params.weeks ?? 8, 1), 52)
  const now = new Date()
  const firstWeek = weekStart(new Date(now.getTime() - (weeksCount - 1) * 7 * 24 * 60 * 60 * 1000))
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const since = firstWeek.getTime() < monthStart.getTime() ? firstWeek : monthStart

  const events = await prisma.outcomeEvent.findMany({
    where: { orgId: params.orgId, createdAt: { gte: since } },
    select: { kind: true, valueCents: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 10_000,
  })

  const byWeek = new Map<string, OutcomeWeek>()
  for (let i = 0; i < weeksCount; i++) {
    const start = new Date(firstWeek.getTime() + i * 7 * 24 * 60 * 60 * 1000)
    const key = start.toISOString().slice(0, 10)
    byWeek.set(key, { weekStart: key, total: 0, valueCents: 0, byKind: {} })
  }

  const month = { total: 0, valueCents: 0, byKind: {} as Record<string, number> }

  for (const event of events) {
    const key = weekStart(event.createdAt).toISOString().slice(0, 10)
    const bucket = byWeek.get(key)
    if (bucket) {
      bucket.total += 1
      bucket.valueCents += event.valueCents ?? 0
      bucket.byKind[event.kind] = (bucket.byKind[event.kind] ?? 0) + 1
    }
    if (event.createdAt.getTime() >= monthStart.getTime()) {
      month.total += 1
      month.valueCents += event.valueCents ?? 0
      month.byKind[event.kind] = (month.byKind[event.kind] ?? 0) + 1
    }
  }

  return { weeks: Array.from(byWeek.values()), month }
}
