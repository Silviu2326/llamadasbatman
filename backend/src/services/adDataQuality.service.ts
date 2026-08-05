import { prisma } from '../lib/prisma'
import { META_OAUTH_SCOPES } from './metaAdAccount.service'
import { getCapiHealth } from './metaConversions.service'

/**
 * Fase 0 de `docs/xarly/ads.md`: antes de mostrar una métrica profunda o de
 * permitir una decisión, hay que poder afirmar qué datos tenemos y cuáles no.
 *
 * La regla que gobierna todo este servicio: `null` significa "no se ha
 * medido", `0` significa "se midió y salió cero". Donde hoy no existe la
 * instrumentación para medir algo — la tasa de duplicados, por ejemplo — se
 * devuelve `null` y se explica por qué en `issues`. Rellenarlo con un cero
 * tranquilizador es peor que dejarlo vacío.
 */

export type DataQualityStatus = 'ready' | 'partial' | 'stale' | 'unreliable'

export type DataQualityIssue = {
  code: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  /** Qué puede hacer la persona para resolverlo. */
  action?: string
}

/** Ventana de análisis por defecto: suficiente para dos ciclos semanales. */
const DEFAULT_WINDOW_DAYS = 30

/**
 * Los Insights se sincronizan cada 2 h (`jobs/adInsightsSync.ts`). Se tolera
 * el doble antes de avisar, y ocho veces antes de considerar los datos
 * obsoletos y bloquear decisiones automáticas.
 */
const FRESHNESS_WARN_MINUTES = 4 * 60
const FRESHNESS_STALE_MINUTES = 16 * 60

/** Cobertura de atribución por debajo de la cual no se comparan campañas. */
const ATTRIBUTION_MIN_PCT = 70

/**
 * Capacidades reales que necesita cada parte del circuito. `ads_management`
 * cubre lectura y escritura de anuncios, incluidos Insights; los leads exigen
 * su propio permiso y CAPI necesita además un pixel configurado.
 */
const REQUIRED_SCOPES = {
  insights: ['ads_management'],
  leads: ['leads_retrieval'],
  capi: ['ads_management'],
} as const

function percentage(part: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((part / total) * 100)
}

function minutesSince(date: Date | null | undefined): number | null {
  if (!date) return null
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000))
}

/**
 * Calcula el estado de calidad y lo persiste. Es idempotente: se puede llamar
 * desde el job periódico o desde la propia carga de `/ads`.
 */
export async function evaluateDataQuality(orgId: string, options: { windowDays?: number } = {}) {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS
  const since = new Date(Date.now() - windowDays * 86_400_000)
  const issues: DataQualityIssue[] = []

  const [org, account, lastSnapshot] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { currency: true, timezone: true } }),
    prisma.metaAdAccount.findFirst({
      where: { orgId },
      orderBy: { connectedAt: 'desc' },
      select: {
        status: true,
        scopes: true,
        metaPageId: true,
        metaPixelId: true,
        metaBusinessId: true,
        lastValidatedAt: true,
        accessTokenExpiresAt: true,
        lastError: true,
      },
    }),
    prisma.adInsightSnapshot.findFirst({
      where: { orgId },
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true },
    }),
  ])

  // ── Permisos y activos ────────────────────────────────────────────────────
  const accountStatus = account?.status ?? 'disconnected'
  const scopes = account?.scopes ?? []
  const isLive = accountStatus === 'connected'

  const hasScopes = (required: readonly string[]) => isLive && required.every(scope => scopes.includes(scope))
  const missingScopes = isLive ? META_OAUTH_SCOPES.filter(scope => !scopes.includes(scope)) : []

  const missingAssets: string[] = []
  if (isLive) {
    if (!account?.metaPageId) missingAssets.push('page')
    if (!account?.metaPixelId) missingAssets.push('pixel')
    if (!account?.metaBusinessId) missingAssets.push('business')
  }

  const permissions = {
    insights: hasScopes(REQUIRED_SCOPES.insights),
    leads: hasScopes(REQUIRED_SCOPES.leads),
    // CAPI necesita permiso y pixel: sin pixel no hay a dónde enviar la señal.
    capi: hasScopes(REQUIRED_SCOPES.capi) && Boolean(account?.metaPixelId),
  }

  if (!account) {
    issues.push({
      code: 'meta_not_connected',
      severity: 'critical',
      message: 'No hay ninguna cuenta de Meta conectada, así que no se puede medir ninguna campaña.',
      action: 'Conectar Meta',
    })
  } else if (accountStatus === 'revoked') {
    issues.push({
      code: 'meta_revoked',
      severity: 'critical',
      message: 'Meta revocó el acceso: no llegan ni Insights ni leads nuevos.',
      action: 'Volver a conectar la cuenta',
    })
  } else if (accountStatus === 'error') {
    issues.push({
      code: 'meta_error',
      severity: 'critical',
      message: account.lastError
        ? `La última llamada a Meta falló: ${account.lastError}`
        : 'La última llamada a Meta falló.',
      action: 'Revisar la conexión',
    })
  }

  if (missingScopes.length) {
    issues.push({
      code: 'meta_missing_scopes',
      severity: 'warning',
      message: `La conexión existe pero le faltan permisos: ${missingScopes.join(', ')}.`,
      action: 'Volver a autorizar con todos los permisos',
    })
  }
  if (isLive && !account?.metaPixelId) {
    issues.push({
      code: 'meta_missing_pixel',
      severity: 'warning',
      message: 'Sin pixel configurado no se puede devolver a Meta la señal de cualificación ni de venta.',
      action: 'Configurar el pixel',
    })
  }
  if (account?.accessTokenExpiresAt && account.accessTokenExpiresAt.getTime() < Date.now()) {
    issues.push({
      code: 'meta_token_expired',
      severity: 'critical',
      message: 'El token de acceso ha caducado.',
      action: 'Volver a conectar la cuenta',
    })
  }

  // ── Frescura de Insights ──────────────────────────────────────────────────
  const snapshotDelayMinutes = minutesSince(lastSnapshot?.capturedAt)
  const hasCampaigns = await prisma.campaign.count({
    where: { orgId, OR: [{ metaCampaignId: { not: null } }, { adStatus: { not: null } }] },
  })

  if (hasCampaigns > 0 && snapshotDelayMinutes == null) {
    issues.push({
      code: 'no_snapshots',
      severity: 'warning',
      message: 'Hay campañas registradas pero todavía no se ha recogido ningún dato de Meta.',
      action: 'Sincronizar ahora',
    })
  } else if (snapshotDelayMinutes != null && snapshotDelayMinutes > FRESHNESS_STALE_MINUTES) {
    issues.push({
      code: 'snapshots_stale',
      severity: 'critical',
      message: `El último dato de Meta tiene ${Math.round(snapshotDelayMinutes / 60)} h. Las decisiones automáticas quedan bloqueadas.`,
      action: 'Sincronizar ahora',
    })
  } else if (snapshotDelayMinutes != null && snapshotDelayMinutes > FRESHNESS_WARN_MINUTES) {
    issues.push({
      code: 'snapshots_delayed',
      severity: 'warning',
      message: `El último dato de Meta tiene ${Math.round(snapshotDelayMinutes / 60)} h.`,
      action: 'Sincronizar ahora',
    })
  }

  // ── Atribución ────────────────────────────────────────────────────────────
  // Denominador: leads que dicen venir de Meta. Un lead orgánico sin campaña
  // no es un fallo de atribución y no debe penalizar la cobertura.
  const [paidLeads, paidLeadsWithCampaign] = await Promise.all([
    prisma.lead.count({ where: { orgId, createdAt: { gte: since }, source: { startsWith: 'meta' } } }),
    prisma.lead.count({
      where: { orgId, createdAt: { gte: since }, source: { startsWith: 'meta' }, campaignId: { not: null } },
    }),
  ])

  const attributionCoveragePct = percentage(paidLeadsWithCampaign, paidLeads)
  const unattributedLeads = paidLeads - paidLeadsWithCampaign

  if (unattributedLeads > 0) {
    issues.push({
      code: 'leads_without_campaign',
      severity: 'warning',
      message: `${unattributedLeads} lead${unattributedLeads === 1 ? '' : 's'} de Meta sin campaña identificable: su gasto no se puede evaluar.`,
      // metaLeadWebhook resuelve la campaña por Campaign.metaAdId; si el
      // anuncio no está registrado, el lead entra huérfano y ya no se puede
      // reconciliar porque el ad_id no se guarda en ningún sitio.
      action: 'Revisar que cada anuncio publicado tenga su campaña registrada',
    })
  }
  if (attributionCoveragePct != null && attributionCoveragePct < ATTRIBUTION_MIN_PCT) {
    issues.push({
      code: 'attribution_below_threshold',
      severity: 'critical',
      message: `Solo el ${attributionCoveragePct} % de los leads de Meta se puede atribuir a una campaña. Por debajo del ${ATTRIBUTION_MIN_PCT} % no se pueden comparar campañas entre sí.`,
    })
  }

  // Cobertura a nivel de anuncio: leads de Meta que además saben de qué
  // anuncio concreto vinieron. Los leads anteriores a que se guardara
  // `metaAdId` seguirán sin él: es una laguna histórica, no un fallo actual.
  const paidLeadsWithAd = await prisma.lead.count({
    where: { orgId, createdAt: { gte: since }, source: { startsWith: 'meta' }, metaAdId: { not: null } },
  })
  const adLevelCoveragePct = percentage(paidLeadsWithAd, paidLeads)
  if (adLevelCoveragePct != null && adLevelCoveragePct < 80) {
    issues.push({
      code: 'ad_level_attribution_partial',
      severity: 'info',
      message: `Solo el ${adLevelCoveragePct} % de los leads de Meta identifica su anuncio concreto; el resto solo llega a nivel de campaña.`,
    })
  }

  const capi = await getCapiHealth(orgId, windowDays)

  // ── Duplicados ────────────────────────────────────────────────────────────
  // Sale de los reintentos que llegaron con un eventId ya visto y se
  // descartaron (`AdConversionSignal.duplicateAttempts`). Sigue siendo `null`
  // mientras no haya ningún envío del que poder opinar.
  const duplicateRatePct = capi.duplicateRatePct

  // ── Consentimiento ────────────────────────────────────────────────────────
  const [leadsInWindow, leadsWithConsent, revokedConsents] = await Promise.all([
    prisma.lead.count({ where: { orgId, createdAt: { gte: since } } }),
    prisma.lead.count({
      where: { orgId, createdAt: { gte: since }, contactConsents: { some: { status: 'granted' } } },
    }),
    prisma.contactConsent.count({ where: { orgId, status: 'revoked' } }),
  ])

  const consentCoveragePct = percentage(leadsWithConsent, leadsInWindow)
  const consentStatus = consentCoveragePct == null
    ? 'unknown'
    : consentCoveragePct >= 95
      ? 'ready'
      : 'partial'

  if (consentStatus === 'partial') {
    issues.push({
      code: 'consent_partial',
      severity: 'warning',
      message: `Solo el ${consentCoveragePct} % de los leads tiene consentimiento registrado. Sin él no se pueden enviar sus datos a Meta.`,
    })
  }

  // ── Conversions API ───────────────────────────────────────────────────────
  // Sale de entregas reales, no de si hay un pixel escrito en la
  // configuración: un pixel guardado no demuestra que la señal esté llegando.
  const capiStatus = !isLive
    ? 'unknown'
    : capi.status === 'unknown' && !account?.metaPixelId
      ? 'not_configured'
      : capi.status

  if (capi.failed > 0) {
    issues.push({
      code: 'capi_failures',
      severity: 'warning',
      message: `${capi.failed} señal${capi.failed === 1 ? '' : 'es'} de conversión no ha llegado a Meta. Sin ellas, Meta optimiza sin saber quién cualificó ni quién compró.`,
      action: 'Revisar el pixel y los permisos',
    })
  }
  if (capi.skippedNoConsent > 0) {
    issues.push({
      code: 'capi_blocked_by_consent',
      severity: 'info',
      message: `${capi.skippedNoConsent} señal${capi.skippedNoConsent === 1 ? '' : 'es'} no se ha enviado por falta de consentimiento. Es el comportamiento correcto, pero reduce lo que Meta puede aprender.`,
    })
  }

  // ── Veredicto ─────────────────────────────────────────────────────────────
  const hasCritical = issues.some(issue => issue.severity === 'critical')
  const hasWarning = issues.some(issue => issue.severity === 'warning')
  const isStale = snapshotDelayMinutes != null && snapshotDelayMinutes > FRESHNESS_STALE_MINUTES

  let status: DataQualityStatus
  if (!isLive || (attributionCoveragePct != null && attributionCoveragePct < ATTRIBUTION_MIN_PCT)) {
    status = 'unreliable'
  } else if (isStale) {
    status = 'stale'
  } else if (hasCritical || hasWarning) {
    status = 'partial'
  } else {
    status = 'ready'
  }

  // `unreliable` impide comparar campañas; `stale` solo impide que el sistema
  // actúe por su cuenta, porque los datos son buenos pero viejos.
  const blocksDeepMetrics = status === 'unreliable'
  const blocksAutomation = status === 'unreliable' || status === 'stale'

  const payload = {
    status,
    computedAt: new Date(),
    accountStatus,
    permissionsInsights: permissions.insights,
    permissionsLeads: permissions.leads,
    permissionsCapi: permissions.capi,
    missingScopes: [...missingScopes],
    missingAssets,
    lastValidatedAt: account?.lastValidatedAt ?? null,
    lastSnapshotAt: lastSnapshot?.capturedAt ?? null,
    snapshotDelayMinutes,
    attributionCoveragePct,
    adLevelCoveragePct,
    unattributedLeads: paidLeads > 0 ? unattributedLeads : null,
    duplicateRatePct,
    consentStatus,
    consentCoveragePct,
    consentRevoked: revokedConsents,
    capiStatus,
    currency: org?.currency ?? 'EUR',
    timezone: org?.timezone ?? 'Europe/Madrid',
    blocksDeepMetrics,
    blocksAutomation,
    issues,
  }

  await prisma.adDataQualityStatus.upsert({
    where: { orgId },
    create: { orgId, ...payload },
    update: payload,
  })

  return payload
}

/**
 * Devuelve el último estado calculado. Si nunca se ha calculado o el
 * diagnóstico es más viejo que `maxAgeMinutes`, lo recalcula: un informe de
 * integridad caducado no sirve para decidir si confiar en los datos.
 */
export async function getDataQuality(orgId: string, options: { maxAgeMinutes?: number } = {}) {
  const maxAgeMinutes = options.maxAgeMinutes ?? 30
  const stored = await prisma.adDataQualityStatus.findUnique({ where: { orgId } })
  const age = minutesSince(stored?.computedAt)
  if (!stored || age == null || age > maxAgeMinutes) return evaluateDataQuality(orgId)
  return {
    ...stored,
    issues: (stored.issues as unknown as DataQualityIssue[]) ?? [],
  }
}
