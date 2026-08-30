#!/usr/bin/env node
/**
 * Comprobación previa a la campaña de EE. UU.
 *
 * Automatiza la lista de la sección 12 de PLAN_ACCION_60_DIAS_DETALLADO.md, que
 * es la parte comprobable por código: variables de entorno, credenciales, estado
 * del worker y datos que tienen que estar en la base antes de marcar un número.
 *
 * Existe porque el fallo caro de esta campaña es silencioso: sin `REDIS_URL` ni
 * worker, `enqueueLeadCall` devuelve `false` sin ruido y la API sigue
 * respondiendo que está sana. Y porque `Agent.language` viene por defecto en
 * `es`, así que un agente creado desde la interfaz no llama —el motor lo rechaza
 * con `voice_language_unsupported`— sin que nadie se entere hasta contar cero
 * llamadas al final del día.
 *
 * Uso:
 *   node --env-file=.env scripts/preflight-usa.mjs [orgId]
 *
 * Sale con código 1 si hay algún bloqueante. Los avisos no bloquean.
 */
import { PrismaClient } from '@prisma/client'

const [, , rawOrgId] = process.argv
const orgId = String(rawOrgId ?? '').trim() || null

const results = []
const ok = (area, detail) => results.push({ level: 'ok', area, detail })
const warn = (area, detail, fix) => results.push({ level: 'warn', area, detail, fix })
const fail = (area, detail, fix) => results.push({ level: 'fail', area, detail, fix })

const env = key => process.env[key]?.trim() || ''

// ---------------------------------------------------------------- 1. Entorno

// Valores que la campaña de EE. UU. da por supuestos. El motivo importa más que
// el valor: cada uno corresponde a una obligación legal o a un fallo silencioso.
const EXPECTED = [
  {
    key: 'DEFAULT_PHONE_COUNTRY_CODE',
    want: '1',
    level: 'fail',
    why: 'El repositorio viene con 52 (México). Los números se normalizarían mal.',
  },
  {
    key: 'REQUIRE_VOICE_CONSENT',
    want: 'true',
    level: 'fail',
    why: 'Sin esto se llama aunque no haya consentimiento registrado. 500 $ por llamada.',
  },
  {
    key: 'VOICE_EMOTION_RECOGNITION_ENABLED',
    want: 'false',
    level: 'fail',
    // El código activa con `=== 'true'`, así que sin definir ya está apagado.
    okIfUnset: true,
    why: 'Illinois (BIPA) trata la huella de voz como dato biométrico: 1.000-5.000 $ por persona.',
  },
  {
    key: 'DISCLOSE_AI',
    want: 'true',
    level: 'fail',
    // `disclosureLine()` solo calla con un 'false' explícito.
    okIfUnset: true,
    why: 'Obligatorio en California, Utah y Colorado, y es lo que evita las quejas.',
  },
  {
    key: 'ALLOW_COLD_CALL_BUSINESS_LANDLINE',
    want: 'true',
    level: 'warn',
    why: 'Apagado no existe la pista de agencias: canCall bloquea toda llamada sin consentimiento.',
  },
  {
    key: 'BRAVE_SEARCH_COUNTRY',
    want: 'US',
    level: 'warn',
    why: 'En ES la investigación previa al correo busca en el mercado equivocado.',
  },
]

for (const { key, want, level, why, okIfUnset } of EXPECTED) {
  const value = env(key)
  if (!value) {
    // Hay flags cuya ausencia ya es el valor seguro porque el código exige un
    // valor explícito para activarlas. Ahí no se avisa: se deja constancia.
    if (okIfUnset) {
      ok('entorno', `${key} sin definir (equivale a ${want})`)
      continue
    }
    const report = level === 'fail' ? fail : warn
    report('entorno', `${key} sin definir`, `Ponlo en ${want}. ${why}`)
  } else if (value.toLowerCase() !== want.toLowerCase()) {
    const report = level === 'fail' ? fail : warn
    report('entorno', `${key}=${value}`, `Debería ser ${want}. ${why}`)
  } else {
    ok('entorno', `${key}=${value}`)
  }
}

const hourStart = Number(env('CALL_HOUR_START') || NaN)
const hourEnd = Number(env('CALL_HOUR_END') || NaN)
if (!Number.isInteger(hourStart) || !Number.isInteger(hourEnd)) {
  warn('entorno', 'CALL_HOUR_START/END sin definir', 'Pon 9 y 19: deja margen sobre la franja legal 8-21 h.')
} else if (hourStart < 8 || hourEnd > 21) {
  fail(
    'entorno',
    `Franja de llamada ${hourStart}-${hourEnd} fuera de la ley`,
    'La franja federal es 8-21 h hora de quien recibe. Florida la estrecha a 8-20 h.'
  )
} else {
  ok('entorno', `Franja de llamada ${hourStart}-${hourEnd} h local`)
}

// ----------------------------------------------------------- 2. Credenciales

const CREDENTIALS = [
  ['REDIS_URL', 'fail', 'Sin Redis no se despacha ni una llamada, y en silencio.'],
  ['TWILIO_ACCOUNT_SID', 'fail', 'Llamadas y consulta de tipo de línea.'],
  ['TWILIO_AUTH_TOKEN', 'fail', 'Llamadas y consulta de tipo de línea.'],
  ['GOOGLE_PLACES_API_KEY', 'fail', 'Sin esto no hay listas.'],
  ['EMAIL_VERIFIER_API_KEY', 'fail', 'Sin verificar, el rebote sube al 8-10 % y quema los buzones.'],
  ['RESEND_API_KEY', 'fail', 'Envío de correo.'],
  ['EMAIL_FROM', 'fail', 'Remitente del correo.'],
  ['DEEPSEEK_API_KEY', 'fail', 'Escribe los correos de la secuencia.'],
  ['CARTESIA_API_KEY', 'fail', 'El oído del agente.'],
  ['CEREBRAS_API_KEY', 'fail', 'El cerebro del agente.'],
  ['MINIMAX_API_KEY', 'fail', 'La voz del agente.'],
  ['HUMAN_TRANSFER_NUMBER', 'warn', 'Sin esto no se puede transferir a una persona cuando la piden.'],
  ['BRAVE_SEARCH_API_KEY', 'warn', 'Investiga cada negocio antes de escribirle.'],
  ['PSI_API_KEY', 'warn', 'Core Web Vitals reales en la auditoría: es el dato duro del correo.'],
  ['STRIPE_SECRET_KEY', 'warn', 'Sin esto no se cobra.'],
]

for (const [key, level, why] of CREDENTIALS) {
  if (env(key)) ok('credenciales', key)
  else (level === 'fail' ? fail : warn)('credenciales', `${key} sin configurar`, why)
}

// `priceIdForPlan` lee STRIPE_PRICE_<PLAN>, así que el plan `agency` de la marca
// blanca solo necesita su variable: no hace falta tocar código.
if (env('STRIPE_SECRET_KEY')) {
  const plans = Object.keys(process.env)
    .filter(key => key.startsWith('STRIPE_PRICE_') && process.env[key]?.trim())
    .map(key => key.slice('STRIPE_PRICE_'.length).toLowerCase())
  if (!plans.includes('pro')) warn('cobro', 'Falta STRIPE_PRICE_PRO', 'Es el mensual del producto A (1.200 $).')
  if (!plans.includes('agency')) {
    warn('cobro', 'Falta STRIPE_PRICE_AGENCY', 'Es el mensual del producto C (450 $). El plan `agency` ya existe.')
  }
  if (plans.length) ok('cobro', `Planes con precio: ${plans.join(', ')}`)
}

if (env('BACKGROUND_WORKERS_ENABLED').toLowerCase() === 'false') {
  fail('worker', 'BACKGROUND_WORKERS_ENABLED=false', 'Con esto apagado no corre ninguna secuencia ni llamada.')
} else {
  ok('worker', 'BACKGROUND_WORKERS_ENABLED activo')
}

// -------------------------------------------------------- 3. Estado en base

const prisma = new PrismaClient()
let dbReachable = false

try {
  await prisma.$queryRaw`SELECT 1`
  dbReachable = true
  ok('base de datos', 'Conexión correcta')
} catch (error) {
  fail('base de datos', `No se pudo conectar: ${error.message}`, 'Revisa DATABASE_URL.')
}

if (dbReachable) {
  // Un agente en español no llama: el motor lo rechaza con
  // `voice_language_unsupported`. Y `language` viene por defecto en 'es'.
  const agents = await prisma.agent.findMany({
    where: { isActive: true, ...(orgId ? { orgId } : {}) },
    select: { id: true, name: true, language: true, orgId: true },
  })

  if (!agents.length) {
    warn('agentes', 'No hay ningún agente activo', 'Crea el agente antes de matricular leads en la secuencia.')
  } else {
    const notEnglish = agents.filter(agent => !/^en\b/i.test(agent.language ?? ''))
    if (notEnglish.length) {
      fail(
        'agentes',
        `${notEnglish.length} de ${agents.length} agentes activos no están en inglés: ` +
          notEnglish.map(agent => `${agent.name} (${agent.language})`).join(', '),
        'El motor de voz solo soporta inglés. Pon language="en" o esos agentes no llamarán.'
      )
    } else {
      ok('agentes', `${agents.length} agentes activos, todos en inglés`)
    }
  }

  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, plan: true },
    })
    if (!org) {
      fail('organización', `No existe ${orgId}`, 'Créala con: npm run org:create')
    } else {
      ok('organización', `${org.name} · plan ${org.plan}`)
      if (org.plan !== 'agency') {
        warn(
          'organización',
          `El plan es ${org.plan}`,
          'La marca blanca (producto C) necesita el plan `agency`, que es el que trae el entitlement multiworkspace.'
        )
      }

      const sequences = await prisma.growthProgram.count({
        where: { orgId, type: 'sales_sequence', archivedAt: null },
      })
      if (!sequences) {
        fail('secuencias', 'No hay ninguna secuencia', 'Créalas con: npm run sequence:create -- <orgId>')
      } else {
        ok('secuencias', `${sequences} secuencias creadas`)
      }

      // El guion abre con un dato medido de la web del prospecto. Sin auditoría
      // guardada, el agente no lo tiene y las reglas de voz le prohíben
      // inventárselo: se queda sin apertura.
      const [audited, callable] = await Promise.all([
        prisma.leadAudit.count({ where: { orgId } }),
        prisma.lead.count({ where: { orgId, tags: { has: 'route:call' } } }),
      ])
      if (callable && !audited) {
        fail(
          'auditorías',
          `${callable} leads llamables y ninguna auditoría guardada`,
          'Importa con autoAudit activado: sin auditoría el agente no puede abrir con el dato de su web.'
        )
      } else if (audited) {
        ok('auditorías', `${audited} auditorías guardadas`)
      }

      const [total, routeCall, routeEmail] = await Promise.all([
        prisma.lead.count({ where: { orgId } }),
        Promise.resolve(callable),
        prisma.lead.count({ where: { orgId, tags: { has: 'route:email' } } }),
      ])
      if (!total) {
        warn('leads', 'No hay leads cargados', 'Importa la lista con Prospect Finder antes de matricular.')
      } else if (!routeCall && !routeEmail) {
        warn(
          'leads',
          `${total} leads sin enriquecer`,
          'Lanza leadEnrichment: sin tipo de línea no se sabe a quién se puede llamar en frío.'
        )
      } else {
        ok('leads', `${total} leads · ${routeCall} llamables en frío · ${routeEmail} por correo primero`)
      }
    }
  } else {
    warn('organización', 'Sin orgId', 'Pasa el id como argumento para comprobar secuencias, plan y leads.')
  }
}

await prisma.$disconnect()

// ------------------------------------------------------------------ Informe

const ICON = { ok: '  ✓', warn: '  !', fail: '  ✗' }
const areas = [...new Set(results.map(result => result.area))]

console.log('\nComprobación previa — campaña EE. UU.\n')
for (const area of areas) {
  console.log(area.toUpperCase())
  for (const result of results.filter(item => item.area === area)) {
    console.log(`${ICON[result.level]} ${result.detail}`)
    if (result.fix) console.log(`      → ${result.fix}`)
  }
  console.log()
}

const failures = results.filter(result => result.level === 'fail')
const warnings = results.filter(result => result.level === 'warn')

console.log(`${results.filter(r => r.level === 'ok').length} correctos · ${warnings.length} avisos · ${failures.length} bloqueantes`)

if (failures.length) {
  console.log('\n🔴 No arranques la campaña. Resuelve los bloqueantes primero.\n')
  process.exitCode = 1
} else if (warnings.length) {
  console.log('\n🟠 Se puede arrancar, pero repasa los avisos.\n')
} else {
  console.log('\n🟢 Entorno listo.\n')
}

console.log('Esto no comprueba el heartbeat del worker, que vive en Redis. Míralo aparte:')
console.log('  GET /health/workers   (con el token de observabilidad)\n')
