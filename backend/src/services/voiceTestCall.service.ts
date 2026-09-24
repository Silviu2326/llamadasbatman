import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { canCall, normalizeE164 } from '../voice/compliance'
import { isZadarmaGatewayCallError, startOutboundCall } from '../voice/telephony/outbound'
import { findActiveVoiceConsent } from './voiceConsent.service'
import { requestedInternalVoiceTest, isLicensedFishOfficialVoice } from './internalVoiceTestRequest.service'

/**
 * Llamadas de prueba de un agente que todavía está en borrador.
 *
 * Publicar exige una llamada real evaluada (`agents.service.ts`, check `test`),
 * pero `leadCallDispatch` y la pasarela Zadarma solo marcan con un agente
 * `active` dentro de una campaña activa. Sin una ruta explícita el requisito no
 * se puede cumplir nunca; con una ruta descuidada se convierte en un atajo para
 * llamar a cualquier prospecto sin campaña. De ahí las dos reglas de este
 * módulo:
 *
 * 1. El destino sale de `VoiceTestNumber`: un teléfono propio de la
 *    organización, declarado por escrito por quien lo da de alta, nunca un
 *    número que llegue en la petición ni un teléfono que ya sea de un lead.
 * 2. El agente debe cumplir todos los requisitos de publicación menos la propia
 *    prueba — voz, instrucciones, número de salida y consentimiento de voz
 *    vigente. Una microprueba solicitada por el titular puede usar, durante
 *    como máximo una hora, una voz oficial cuya licencia verifica el proveedor.
 *    Esa solicitud no crea un consentimiento personal ni publica el agente.
 *
 * El agente sigue en `draft` durante y después de la prueba. Lo único que la
 * prueba desbloquea es poder evaluarla.
 */

export const MAX_TEST_NUMBERS = 3
export const MAX_TEST_CALLS_PER_DAY = 10
const MIN_ATTESTATION_LENGTH = 20

export type TestCallBlock =
  | 'agent_not_found' | 'agent_not_testable' | 'voice_missing' | 'instructions_missing'
  | 'phone_missing' | 'consent_missing' | 'direction_inbound'
  | 'number_not_found' | 'number_revoked' | 'number_without_phone'
  | 'daily_limit' | 'compliance'

export const TEST_CALL_BLOCK_LABELS: Record<TestCallBlock, string> = {
  agent_not_found: 'El agente no existe en esta organización.',
  agent_not_testable: 'Un agente archivado, pausado o desactivado no puede hacer pruebas.',
  voice_missing: 'Falta elegir la voz del agente.',
  instructions_missing: 'Faltan las instrucciones del agente.',
  phone_missing: 'Falta el número desde el que llama el agente.',
  consent_missing: 'Falta el consentimiento de voz vigente. La prueba usa la misma voz que una llamada real.',
  direction_inbound: 'Este agente solo atiende llamadas entrantes.',
  number_not_found: 'El número de prueba no existe en esta organización.',
  number_revoked: 'El número de prueba está revocado.',
  number_without_phone: 'El contacto interno del número de prueba no tiene teléfono.',
  daily_limit: `Se ha alcanzado el máximo de ${MAX_TEST_CALLS_PER_DAY} llamadas de prueba al día.`,
  compliance: 'Cumplimiento bloquea la llamada (horario, cuota, baja o consentimiento del destino).',
}

export type TestCallGate =
  | { allowed: false; reason: TestCallBlock; detail?: string }
  | {
      allowed: true
      phone: string
      agent: { id: string; phoneNumber: string | null; systemPrompt: string | null; voiceId: string | null }
      lead: { id: string; company: string | null; name: string }
      testNumber: { id: string; label: string }
    }

function startOfToday(now: Date) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}

export async function countTestCallsToday(orgId: string, now = new Date()) {
  return prisma.call.count({ where: { orgId, isTest: true, createdAt: { gte: startOfToday(now) } } })
}

/**
 * Puerta única de la llamada de prueba. La usan tanto la API como la pasarela
 * telefónica: la pasarela vuelve a comprobarlo todo contra la base de datos
 * porque es quien marca, y no se fía de quien la llama.
 */
export async function assertVoiceTestCallAllowed(
  orgId: string,
  agentId: string,
  leadId: string,
  // `checkCompliance` se inyecta solo en pruebas: horario legal, cuota y bajas
  // dependen del reloj y del plan, y hay que poder fijarlos.
  options: { now?: Date; checkCompliance?: typeof canCall } = {},
): Promise<TestCallGate> {
  const now = options.now ?? new Date()
  const checkCompliance = options.checkCompliance ?? canCall
  const [agent, testNumber] = await Promise.all([
    prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true, voiceId: true, systemPrompt: true, phoneNumber: true, callDirection: true, lifecycleStatus: true, isActive: true } }),
    prisma.voiceTestNumber.findFirst({ where: { orgId, leadId }, include: { lead: { select: { id: true, name: true, phone: true, company: true } } } }),
  ])
  if (!agent) return { allowed: false, reason: 'agent_not_found' }
  // Draft y active son los dos estados en los que tiene sentido probar. Un
  // agente archivado o pausado lo está por una decisión que la prueba no revoca.
  if (!agent.isActive || (agent.lifecycleStatus !== 'draft' && agent.lifecycleStatus !== 'active')) return { allowed: false, reason: 'agent_not_testable' }
  if (!agent.voiceId) return { allowed: false, reason: 'voice_missing' }
  if (!agent.systemPrompt?.trim()) return { allowed: false, reason: 'instructions_missing' }
  if (!agent.phoneNumber) return { allowed: false, reason: 'phone_missing' }
  if (agent.callDirection === 'inbound') return { allowed: false, reason: 'direction_inbound' }
  if (!await findActiveVoiceConsent(orgId, agent.id, agent.voiceId, now)) {
    const request = testNumber && await requestedInternalVoiceTest(orgId, leadId, agent.id, testNumber.phone, agent.voiceId)
    if (request?.catalogVoice !== true || !await isLicensedFishOfficialVoice(agent.voiceId)) return { allowed: false, reason: 'consent_missing' }
  }

  if (!testNumber) return { allowed: false, reason: 'number_not_found' }
  if (testNumber.revokedAt) return { allowed: false, reason: 'number_revoked' }
  const phone = normalizeE164(testNumber.lead.phone ?? '')
  // El teléfono vive en el lead y el alta lo escribe en los dos sitios. Si
  // divergen, alguien tocó uno de los dos: no se marca a ciegas.
  if (!phone || phone !== testNumber.phone) return { allowed: false, reason: 'number_without_phone' }

  if (await countTestCallsToday(orgId, now) >= MAX_TEST_CALLS_PER_DAY) return { allowed: false, reason: 'daily_limit' }
  const compliance = await checkCompliance(orgId, phone, testNumber.lead.id, { internalTestAgentId: agent.id })
  if (!compliance.allowed) return { allowed: false, reason: 'compliance', detail: compliance.reason }

  return {
    allowed: true, phone, agent,
    lead: { id: testNumber.lead.id, name: testNumber.lead.name, company: testNumber.lead.company },
    testNumber: { id: testNumber.id, label: testNumber.label },
  }
}

export async function listVoiceTestNumbers(orgId: string) {
  const numbers = await prisma.voiceTestNumber.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, phone: true, label: true, attestation: true, leadId: true, revokedAt: true, createdAt: true },
  })
  return numbers.map(item => ({ ...item, active: !item.revokedAt }))
}

export type RegisterTestNumberResult =
  | { status: 'ok'; number: { id: string; phone: string; label: string } }
  | { status: 'invalid_phone' | 'invalid_attestation' | 'phone_belongs_to_lead' | 'optout' | 'limit_reached' | 'already_registered' }

/**
 * Da de alta un teléfono propio como destino de pruebas. Crea el contacto
 * interno que representa al destino y su consentimiento de contacto por voz:
 * quien da de alta el número declara que es suyo o que tiene permiso de su
 * titular, y esa declaración queda guardada como evidencia.
 */
export async function registerVoiceTestNumber(
  orgId: string,
  actorUserId: string | undefined,
  input: { phone: string; label: string; attestation: string },
): Promise<RegisterTestNumberResult> {
  const phone = normalizeE164(input.phone)
  if (!phone) return { status: 'invalid_phone' }
  const attestation = input.attestation.trim()
  if (attestation.length < MIN_ATTESTATION_LENGTH) return { status: 'invalid_attestation' }
  const label = input.label.trim() || `Prueba ${phone}`

  if (await prisma.optOut.findUnique({ where: { orgId_phone: { orgId, phone } } })) return { status: 'optout' }

  const existing = await prisma.voiceTestNumber.findFirst({ where: { orgId, phone } })
  if (existing && !existing.revokedAt) return { status: 'already_registered' }

  // Un número que ya es de un prospecto no puede entrar por aquí: sería llamar
  // a un lead sin campaña y sin agente publicado.
  const leadWithPhone = await prisma.lead.findFirst({
    where: { orgId, phone, ...(existing ? { id: { not: existing.leadId } } : {}) },
    select: { id: true },
  })
  if (leadWithPhone) return { status: 'phone_belongs_to_lead' }

  if (!existing && await prisma.voiceTestNumber.count({ where: { orgId, revokedAt: null } }) >= MAX_TEST_NUMBERS) {
    return { status: 'limit_reached' }
  }

  const created = await prisma.$transaction(async tx => {
    const lead = existing
      ? await tx.lead.update({ where: { id: existing.leadId }, data: { name: label, phone } })
      : await tx.lead.create({
          data: { orgId, name: label, phone, source: 'internal_test', tags: ['prueba-interna'], campaignId: null },
        })
    await tx.contactConsent.upsert({
      where: { orgId_leadId_channel_purpose: { orgId, leadId: lead.id, channel: 'voice', purpose: 'contact' } },
      create: { orgId, leadId: lead.id, channel: 'voice', purpose: 'contact', status: 'granted', source: 'voice_test_number_attestation', evidence: attestation, occurredAt: new Date() },
      update: { status: 'granted', source: 'voice_test_number_attestation', evidence: attestation, occurredAt: new Date() },
    })
    const number = existing
      ? await tx.voiceTestNumber.update({ where: { id: existing.id }, data: { label, attestation, revokedAt: null, createdById: actorUserId ?? null } })
      : await tx.voiceTestNumber.create({ data: { orgId, phone, label, attestation, leadId: lead.id, createdById: actorUserId ?? null } })
    await tx.auditLog.create({
      data: {
        orgId, actorUserId, action: 'voice.test_number.register', entityType: 'VoiceTestNumber', entityId: number.id,
        after: { phone, label, attestation } as unknown as Prisma.InputJsonValue,
      },
    })
    return number
  })

  return { status: 'ok', number: { id: created.id, phone: created.phone, label: created.label } }
}

export async function revokeVoiceTestNumber(orgId: string, id: string, actorUserId?: string) {
  const number = await prisma.voiceTestNumber.findFirst({ where: { id, orgId } })
  if (!number) return false
  await prisma.$transaction(async tx => {
    await tx.voiceTestNumber.update({ where: { id }, data: { revokedAt: new Date() } })
    await tx.contactConsent.updateMany({
      where: { orgId, leadId: number.leadId, channel: 'voice', purpose: 'contact' },
      data: { status: 'revoked', occurredAt: new Date() },
    })
    await tx.auditLog.create({
      data: { orgId, actorUserId, action: 'voice.test_number.revoke', entityType: 'VoiceTestNumber', entityId: id, before: { phone: number.phone } as unknown as Prisma.InputJsonValue },
    })
  })
  return true
}

export type StartTestCallResult =
  | { status: 'started'; sid?: string; to: string; callDescription: string }
  | { status: 'blocked'; reason: TestCallBlock; message: string }
  | { status: 'failed'; message: string; code?: string | null; cause?: string }

export async function startVoiceTestCall(orgId: string, agentId: string, testNumberId: string, actorUserId?: string): Promise<StartTestCallResult> {
  const testNumber = await prisma.voiceTestNumber.findFirst({ where: { id: testNumberId, orgId }, select: { leadId: true } })
  if (!testNumber) return { status: 'blocked', reason: 'number_not_found', message: TEST_CALL_BLOCK_LABELS.number_not_found }

  const gate = await assertVoiceTestCallAllowed(orgId, agentId, testNumber.leadId)
  if (!gate.allowed) {
    return { status: 'blocked', reason: gate.reason, message: gate.detail ? `${TEST_CALL_BLOCK_LABELS[gate.reason]} (${gate.detail})` : TEST_CALL_BLOCK_LABELS[gate.reason] }
  }

  await prisma.auditLog.create({
    data: { orgId, actorUserId, action: 'voice.test_call.start', entityType: 'Agent', entityId: agentId, after: { testNumberId, phone: gate.phone } as unknown as Prisma.InputJsonValue },
  })

  try {
    const result = await startOutboundCall({
      mode: 'test', orgId, agentId, leadId: gate.lead.id, toNumber: gate.phone,
      businessName: gate.lead.company ?? undefined,
    })
    return { status: 'started', sid: result.sid, to: result.to, callDescription: gate.testNumber.label }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    console.warn(`[VoiceTestCall] agente ${agentId} — la pasarela rechazó la prueba: ${message}`)
    // Código y causa tipados de la pasarela (busy/no_answer/rejected) para que
    // la ficha explique el fallo en vez de mostrar el código crudo.
    if (isZadarmaGatewayCallError(error)) return { status: 'failed', message, code: error.code, cause: error.cause }
    return { status: 'failed', message }
  }
}
