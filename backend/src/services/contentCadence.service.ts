import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { hasCapability } from '../access-control/entitlements'
import { refreshOpportunities, weekOf } from './contentOpportunity.service'
import { refreshOwnerVoice } from './ownerVoice.service'
import { sendTransactionalEmail } from './transactionalEmail.service'

/**
 * Cadencia semanal — `roadmap.md` fase 3 ("cron que regenera oportunidades cada
 * lunes y notifica").
 *
 * Hasta aquí el Radar solo se refrescaba a mano desde la pantalla, que es lo
 * que `semana.md` declaraba como límite. Este servicio es la parte que se puede
 * probar del lunes: a quién le toca, qué se recalcula y qué se avisa. El
 * arranque con Redis vive en `jobs/contentWeeklyRefresh.ts`.
 *
 * Tres decisiones:
 *
 * - **Una vez por semana y organización, no una por ejecución.** El análisis
 *   cuesta una llamada al modelo sobre todas las conversaciones de la semana;
 *   si el job se reintenta —o alguien reinicia el worker un lunes— no se paga
 *   dos veces. La marca vive en `Organization.settings.contentCadence`.
 * - **Solo organizaciones con material.** Sin llamadas transcritas ni hilos de
 *   inbox de la semana no hay nada que analizar, y gastar la llamada para
 *   guardar cero oportunidades es tirar dinero.
 * - **Se avisa de lo que hay, no de que "se ha ejecutado".** Si la semana no da
 *   oportunidades, no se manda correo: un aviso semanal de "cero" enseña a
 *   ignorar los avisos.
 */

export interface WeeklyRunResult {
  orgId: string
  skipped: 'already_run' | 'no_material' | null
  voiceUpdated: boolean
  created: number
  scanned: number
  notified: boolean
  error: string | null
}

interface CadenceMark {
  lastWeek: string
  created: number
  ranAt: string
}

/** Cuánto material hace falta para que valga la pena analizar la semana. */
const MIN_DOCUMENTS = 3

export function cadenceMarkOf(settings: unknown): CadenceMark | null {
  const mark = (settings as { contentCadence?: CadenceMark } | null)?.contentCadence
  return mark?.lastWeek ? mark : null
}

/** Ya se corrió esta semana: la marca guarda el lunes de la semana analizada. */
export function alreadyRanThisWeek(settings: unknown, now = new Date()) {
  const mark = cadenceMarkOf(settings)
  return mark?.lastWeek === weekOf(now).toISOString()
}

/**
 * Organizaciones a las que les toca el lunes: las que tienen la capacidad
 * `social` en su plan y material de la semana. El plan se comprueba aquí y no
 * en la ruta porque el cron no tiene usuario que lo autorice.
 */
export async function organizationsForWeeklyContent(now = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const organizations = await prisma.organization.findMany({ select: { id: true, plan: true } })

  const eligible: string[] = []
  for (const organization of organizations) {
    if (!hasCapability(organization.plan, 'social')) continue
    const [calls, conversations] = await Promise.all([
      prisma.call.count({ where: { orgId: organization.id, createdAt: { gte: since }, transcript: { not: null } } }),
      prisma.conversation.count({ where: { orgId: organization.id, createdAt: { gte: since } } }),
    ])
    if (calls + conversations >= MIN_DOCUMENTS) eligible.push(organization.id)
  }
  return eligible
}

/** Texto del aviso. Separado para poder leerlo sin montar un servidor de correo. */
export function weeklyNotice(created: number, scanned: number) {
  const plural = created === 1 ? 'oportunidad nueva' : 'oportunidades nuevas'
  return {
    subject: `${created} ${plural} de contenido esta semana`,
    body: `Vendrava ha analizado ${scanned} conversaciones de la última semana y ha encontrado ${created} ${plural} con evidencia suficiente.`,
  }
}

async function notifyOrg(orgId: string, created: number, scanned: number) {
  const owner = await prisma.user.findFirst({ where: { orgId, role: 'owner' }, select: { email: true } })
  const org = owner?.email ? null : await prisma.organization.findUnique({ where: { id: orgId }, select: { email: true } })
  const to = owner?.email ?? org?.email
  if (!to) return false

  const notice = weeklyNotice(created, scanned)
  await sendTransactionalEmail({
    to,
    subject: notice.subject,
    html: `<p>${notice.body}</p><p>Entra en Redes sociales para verlas y generar las campañas.</p><p style="color:#888;font-size:12px">Análisis semanal automático de Vendrava.</p>`,
  })
  return true
}

/**
 * El lunes de una organización: perfil de voz, oportunidades y aviso.
 *
 * El perfil de voz se recalcula primero y siempre, porque es determinista y no
 * cuesta: si el detector falla por falta de clave, al menos la voz queda al día.
 */
export async function runWeeklyContentRefresh(orgId: string, now = new Date()): Promise<WeeklyRunResult> {
  const result: WeeklyRunResult = {
    orgId, skipped: null, voiceUpdated: false, created: 0, scanned: 0, notified: false, error: null,
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } })
  if (alreadyRanThisWeek(org?.settings, now)) {
    result.skipped = 'already_run'
    return result
  }

  result.voiceUpdated = Boolean(await refreshOwnerVoice(orgId).catch(() => null))

  try {
    const refresh = await refreshOpportunities(orgId, now)
    result.created = refresh.created
    result.scanned = refresh.scanned
    if (!refresh.analyzed) result.skipped = 'no_material'
  } catch (error) {
    // Sin clave del modelo el detector no analiza. Se registra y **no** se marca
    // la semana como hecha: cuando la clave esté, el siguiente intento corre.
    result.error = error instanceof Error ? error.message : 'Error desconocido'
    return result
  }

  const settings = (org?.settings ?? {}) as Record<string, unknown>
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      settings: {
        ...settings,
        contentCadence: { lastWeek: weekOf(now).toISOString(), created: result.created, ranAt: now.toISOString() },
      } as unknown as Prisma.InputJsonObject,
    },
  })

  if (result.created > 0) {
    result.notified = await notifyOrg(orgId, result.created, result.scanned).catch(() => false)
  }

  return result
}

/** Pasada completa del lunes. Un fallo por organización no para las demás. */
export async function runWeeklyContentCadence(now = new Date()) {
  const orgIds = await organizationsForWeeklyContent(now)
  const results: WeeklyRunResult[] = []
  for (const orgId of orgIds) {
    try {
      results.push(await runWeeklyContentRefresh(orgId, now))
    } catch (error) {
      results.push({
        orgId, skipped: null, voiceUpdated: false, created: 0, scanned: 0, notified: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      })
    }
  }
  return results
}
