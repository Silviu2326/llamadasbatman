#!/usr/bin/env node
/**
 * Matriculación en bloque de leads en una secuencia.
 *
 * `POST /growth-programs/:id/enroll` acepta `leadIds`, y hasta ahora había que
 * componer esa lista a mano. Aquí se selecciona por filtro —el que de verdad
 * usa la campaña: `route:call` contra `route:email`, que es como etiqueta
 * `leadEnrichment`— y se matricula.
 *
 * Reglas que respeta porque las impone el servicio:
 *   · máximo 1.000 leads por operación
 *   · un lead ya matriculado en esa secuencia se salta, no se duplica
 *   · sin teléfono, una secuencia con paso de llamada lo deja `blocked`
 *   · la primera matriculación activa una secuencia en `draft`
 *
 * No envía por defecto: enseña a quién matricularía. Hay que añadir --run.
 *
 * Uso:
 *   node --env-file=.env --import=tsx scripts/enroll-leads.ts <orgId> <programId> --route call
 *   node --env-file=.env --import=tsx scripts/enroll-leads.ts <orgId> <programId> --route email --limit 10 --run
 */
import { prisma } from '../src/lib/prisma'
import { enrollSalesSequence } from '../src/services/salesSequence.service'

const MAX_PER_ENROLLMENT = 1_000

const [, , rawOrgId, rawProgramId, ...rest] = process.argv
const orgId = String(rawOrgId ?? '').trim()
const programId = String(rawProgramId ?? '').trim()

const flag = (name: string): string | null => {
  const index = rest.indexOf(name)
  return index >= 0 ? (rest[index + 1] ?? null) : null
}
const run = rest.includes('--run')
const route = flag('--route')
const campaignId = flag('--campaign')
const tag = flag('--tag')
const limit = Math.min(Number(flag('--limit') ?? MAX_PER_ENROLLMENT), MAX_PER_ENROLLMENT)

if (!orgId || !programId) {
  console.error(
    'Uso: node --env-file=.env --import=tsx scripts/enroll-leads.ts <orgId> <programId>' +
      ' [--route call|email] [--campaign <id>] [--tag <etiqueta>] [--limit N] [--run]'
  )
  process.exit(1)
}
if (route && !['call', 'email'].includes(route)) {
  console.error(`--route no válido: ${route}. Opciones: call, email`)
  process.exit(1)
}
if (!Number.isFinite(limit) || limit < 1) {
  console.error('--limit tiene que ser un entero positivo.')
  process.exit(1)
}

async function main() {
  const program = await prisma.growthProgram.findFirst({
    where: { id: programId, orgId, type: 'sales_sequence', archivedAt: null },
    select: { id: true, name: true, status: true, config: true },
  })
  if (!program) {
    console.error(`\nNo existe la secuencia ${programId} en esa organización.`)
    console.error('Créala con: npm run sequence:create -- <orgId>\n')
    process.exitCode = 1
    return
  }

  const steps = (program.config as { steps?: Array<{ type: string }> } | null)?.steps ?? []
  const needsPhone = steps.some(step => step.type === 'call' || step.type === 'whatsapp')

  // Las etiquetas las pone `leadEnrichment`: `route:call` es fijo de empresa
  // verificado —el único caso en que canCall permite llamada en frío— y
  // `route:email` es todo lo demás.
  const tags: string[] = []
  if (route) tags.push(`route:${route}`)
  if (tag) tags.push(tag)

  const candidates = await prisma.lead.findMany({
    where: {
      orgId,
      ...(campaignId ? { campaignId } : {}),
      ...(tags.length ? { tags: { hasEvery: tags } } : {}),
      // Un paso de llamada sobre un lead sin teléfono nace bloqueado: mejor no
      // meterlo y decirlo aquí que descubrirlo en la cola días después.
      ...(needsPhone ? { phone: { not: null } } : {}),
      // Nunca se re-matricula: el servicio lo saltaría, pero así el recuento
      // que se enseña es el real y no promete de más.
      salesSequenceEnrollments: { none: { programId } },
    },
    select: { id: true, name: true, company: true, phone: true, email: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  console.log(`\nSecuencia: ${program.name} (${program.status})`)
  console.log(`Pasos: ${steps.map(step => step.type).join(' → ') || '—'}`)
  console.log(
    `Filtro: ${[
      campaignId && `campaña ${campaignId}`,
      tags.length && `etiquetas ${tags.join(' + ')}`,
      needsPhone && 'con teléfono',
      `límite ${limit}`,
    ]
      .filter(Boolean)
      .join(' · ')}\n`
  )

  if (!candidates.length) {
    console.log('Ningún lead cumple el filtro y está sin matricular.')
    if (route) {
      console.log('Si esperabas leads aquí, comprueba que leadEnrichment ya los ha etiquetado:')
      console.log('  npm run preflight:usa -- <orgId>\n')
    }
    return
  }

  const sinEmail = candidates.filter(lead => !lead.email).length
  console.log(`${candidates.length} leads a matricular:`)
  for (const lead of candidates.slice(0, 10)) {
    console.log(`  · ${(lead.company ?? lead.name).slice(0, 40).padEnd(40)} ${lead.phone ?? '—'}`)
  }
  if (candidates.length > 10) console.log(`  · … y ${candidates.length - 10} más`)
  if (sinEmail) console.log(`\n⚠ ${sinEmail} sin correo: los pasos de email quedarán bloqueados en esos.`)

  if (!run) {
    console.log('\nEsto es solo la vista previa. Añade --run para matricular de verdad.\n')
    return
  }

  const owner = await prisma.user.findFirst({
    where: { orgId, role: { in: ['owner', 'admin'] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  const result = await enrollSalesSequence(orgId, programId, candidates.map(lead => lead.id), owner?.id)

  console.log('\nMatriculados')
  console.log(`  creados          ${result.created}`)
  console.log(`  ya lo estaban    ${result.alreadyEnrolled}`)
  console.log(`  bloqueados       ${result.blocked}`)
  if (result.blocked) {
    console.log('\n  Un bloqueado no es un error: es un lead sin consentimiento de correo')
    console.log('  o sin teléfono. Se queda en la secuencia y no se le escribe.')
  }
  console.log('\nLa secuencia queda activa. El worker la ejecuta en el siguiente ciclo.')
  console.log('Comprueba que el worker está vivo:  node scripts/check-alerts.mjs\n')
}

main()
  .catch(error => {
    console.error('\nNo se pudo matricular:', (error as Error).message, '\n')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
