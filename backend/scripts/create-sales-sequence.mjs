#!/usr/bin/env node
/**
 * Crea las secuencias de captación del plan de EE. UU.
 *
 * El formulario de Growth Hub no envía pasos (`GrowthHubPage.jsx` manda solo
 * nombre, descripción, estado y tipo), así que una secuencia creada desde la
 * interfaz nace sin pasos y falla al matricular con `SEQUENCE_STEPS_INVALID`.
 * Hasta que exista ese editor, las secuencias se crean aquí.
 *
 * Dos secuencias, las del plan:
 *   A · techadores — correo primero; la llamada solo llega si contestan "YES",
 *       que es el consentimiento por escrito que exige la TCPA.
 *   C · agencias   — llamada primero; son fijos de empresa verificados, el único
 *       caso en que `canCall` permite llamada en frío.
 *
 * Se crean en estado `draft`: no corre nada hasta la primera matriculación, que
 * es la que las activa (`salesSequence.service.ts:210`).
 *
 * Uso:
 *   node --env-file=.env scripts/create-sales-sequence.mjs <orgId> [a|c|both] [--force]
 */
import { PrismaClient } from '@prisma/client'

// Espejo de SalesSequenceStepConfig y de las reglas de readConfig(), para fallar
// aquí y no dentro del worker con la secuencia ya publicada.
const STEP_TYPES = ['email', 'task', 'meeting', 'call', 'whatsapp', 'ai_email']
const MAX_STEPS = 20

const SEQUENCES = {
  a: {
    name: 'USA · Roofers — audit to booked call',
    description:
      'Correo con la auditoría, la llamada del agente solo tras el "YES". ' +
      'El YES es consentimiento por escrito (E-SIGN) y queda en el hilo.',
    steps: [
      {
        key: 'a1-report',
        type: 'ai_email',
        delayDays: 0,
        purpose:
          'Send the free website audit. Open with the single worst measured number from the audit — ' +
          'no greeting, no "I hope this finds you well". Include the public report link. ' +
          'Close with: reply YES and our AI assistant calls you within the minute. Max 90 words.',
      },
      {
        key: 'a2-bump',
        type: 'ai_email',
        delayDays: 3,
        purpose:
          'Same thread. Three lines. One NEW finding from the audit, not a repeat. ' +
          'Same YES call to action. Max 40 words.',
      },
      { key: 'a3-call', type: 'call', delayDays: 1 },
      {
        key: 'a4-case',
        type: 'ai_email',
        delayDays: 4,
        purpose:
          'Roofer case study. Talk about booked jobs and callback speed, never about design or technology.',
      },
      { key: 'a5-call', type: 'call', delayDays: 2 },
      {
        key: 'a6-breakup',
        type: 'ai_email',
        delayDays: 5,
        purpose:
          'Breakup email. Give the report away with no strings attached. ' +
          'Historically the highest reply rate of the whole sequence.',
      },
    ],
  },
  c: {
    name: 'USA · Agencies — white-label',
    description:
      'Llamada en frío a fijo de empresa verificado. La llamada es la demostración: ' +
      'el que la recibe está oyendo el producto que puede revender.',
    steps: [
      { key: 'c1-call', type: 'call', delayDays: 0 },
      {
        key: 'c2-numbers',
        type: 'ai_email',
        delayDays: 1,
        purpose:
          'Follow the call. Subject is the margin: they sell at 1200, they pay 450. ' +
          'No build, no hosting, no support tickets. Link to the demo line they can call themselves.',
      },
      { key: 'c3-call', type: 'call', delayDays: 3 },
      {
        key: 'c4-proof',
        type: 'ai_email',
        delayDays: 3,
        purpose:
          'What their client actually gets: every lead called back in under a minute, 24/7, ' +
          'under the agency own brand. Mention onboarding takes two hours.',
      },
      {
        key: 'c5-breakup',
        type: 'ai_email',
        delayDays: 4,
        purpose: 'Breakup. Offer the demo line one last time and close the file.',
      },
    ],
  },
}

function validate(name, steps) {
  if (!steps.length || steps.length > MAX_STEPS) {
    throw new Error(`${name}: la secuencia necesita entre 1 y ${MAX_STEPS} pasos.`)
  }
  const keys = new Set()
  for (const [index, step] of steps.entries()) {
    const position = index + 1
    if (!STEP_TYPES.includes(step.type)) {
      throw new Error(`${name}: tipo de paso no soportado en la posición ${position}: ${step.type}`)
    }
    if (!Number.isInteger(step.delayDays) || step.delayDays < 0 || step.delayDays > 365) {
      throw new Error(`${name}: el retraso del paso ${position} debe ser un entero entre 0 y 365 días.`)
    }
    // `email` y `whatsapp` exigen plantilla del proveedor. Aquí no se usan a
    // propósito: `ai_email` escribe el correo y no depende de Mautic.
    if ((step.type === 'email' || step.type === 'whatsapp') && !step.templateExternalId) {
      throw new Error(`${name}: el paso ${position} (${step.type}) necesita templateExternalId.`)
    }
    if (keys.has(step.key)) throw new Error(`${name}: la clave "${step.key}" está repetida.`)
    keys.add(step.key)
  }
}

function summarise(steps) {
  let day = 0
  return steps
    .map(step => {
      day += step.delayDays
      return `    día ${String(day).padStart(2)} · ${step.type.padEnd(8)} · ${step.key}`
    })
    .join('\n')
}

const [, , rawOrgId, rawWhich = 'both', ...rest] = process.argv
const orgId = String(rawOrgId ?? '').trim()
const which = String(rawWhich).trim().toLowerCase()
const force = rest.includes('--force')

if (!orgId) {
  console.error('Uso: node --env-file=.env scripts/create-sales-sequence.mjs <orgId> [a|c|both] [--force]')
  process.exit(1)
}
if (!['a', 'c', 'both'].includes(which)) {
  console.error(`Secuencia no válida: ${which}. Opciones: a, c, both`)
  process.exit(1)
}

const selected = which === 'both' ? ['a', 'c'] : [which]
for (const key of selected) validate(SEQUENCES[key].name, SEQUENCES[key].steps)

const prisma = new PrismaClient()

try {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true } })
  if (!org) {
    console.error(`No existe la organización ${orgId}. Créala antes con: npm run org:create`)
    process.exit(1)
  }

  console.log(`\nOrganización: ${org.name} (${org.id})\n`)

  for (const key of selected) {
    const definition = SEQUENCES[key]

    const existing = await prisma.growthProgram.findFirst({
      where: { orgId, type: 'sales_sequence', name: definition.name, archivedAt: null },
      select: { id: true, status: true },
    })

    if (existing && !force) {
      console.log(`↷ ${definition.name}`)
      console.log(`    ya existe (${existing.id}, ${existing.status}). Usa --force para crear otra.\n`)
      continue
    }

    const program = await prisma.growthProgram.create({
      data: {
        orgId,
        type: 'sales_sequence',
        name: definition.name,
        description: definition.description,
        status: 'draft',
        // `leadIds` vacío a propósito: la matriculación decide a quién entra.
        config: { leadIds: [], steps: definition.steps },
      },
      select: { id: true, name: true },
    })

    console.log(`✓ ${program.name}`)
    console.log(`    id: ${program.id}`)
    console.log(summarise(definition.steps))
    console.log()
  }

  console.log('Creadas en estado `draft`: no se envía nada hasta la primera matriculación.')
  console.log('Matricular:  POST /api/growth-programs/:id/enroll  { "leadIds": [...] }')
  console.log('Empieza con 10 leads de prueba antes de soltar la lista entera.\n')
  console.log('Antes del primer envío masivo, comprueba el entorno:')
  console.log('  node --env-file=.env scripts/preflight-usa.mjs\n')
} catch (error) {
  console.error('No se pudieron crear las secuencias:', error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
