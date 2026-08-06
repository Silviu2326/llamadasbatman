import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAuditLog } from '../lib/audit'
import { findSensitiveContent, newSensitiveClaims } from '../lib/sensitiveContent'
import { recordDecision } from './adDecision.service'
import { getPolicy } from './adPolicy.service'
import { getOrganicDataQuality } from './organicDataQuality.service'
import { getModule } from '../data/verticalModules'
import * as googleIntegration from './organicGoogleIntegration.service'
import * as ingest from './organicGoogleIngest.service'
import * as seo from './seoAgency.service'

/**
 * Autonomía limitada del orgánico — fase 4 de `docs/vendrava/organico.md` §9 y §11.
 *
 * Tres reglas gobiernan este servicio y ninguna es negociable:
 *
 * 1. **La lista de §9 es cerrada y la lista negra gana.** N3 solo puede tocar
 *    lo mecánico y lo previamente aprobado. Publicar contenido nuevo, citar a
 *    un cliente, importar prospectos, llamar o hablar de precios exige una
 *    persona siempre, aunque la organización esté en N3.
 *
 * 2. **Un solo kill switch.** El freno de emergencia es el de
 *    `AdOptimizationPolicy`, el mismo que para Ads (§14: "una sola auditoría,
 *    un solo kill switch"). Un freno que solo detiene la mitad del sistema no
 *    es un freno. Aquí se **lee**, no se duplica.
 *
 * 3. **La degradación es automática.** Ante datos obsoletos o cobertura de
 *    atribución baja se vuelve a N1 sin esperar a que alguien lo note; eso vive
 *    en `adRuleAutonomy.service.ts`, que ya lo hacía para Ads y ahora también
 *    distingue las reglas orgánicas.
 *
 * Y una decisión de arquitectura heredada: **no hay motor paralelo** (§10). Una
 * acción autónoma es una `AdDecision` con `channel` orgánico y su `AdAction`,
 * igual que en Ads. Lo que cambia es lo que se ejecuta, no dónde se registra.
 */

export const AUTONOMY_POLICY_VERSION = 'organic-autonomy-v1'
export const AUTONOMY_POLICY_KEY = 'organic_autonomy'

export type AutonomyLevel = 'N1' | 'N2' | 'N3'

/**
 * Delegable a N3 con modo sombra previo (§9). Es la lista literal del
 * documento: nada mecánico se añade aquí sin escribirlo antes allí.
 */
export const AUTONOMOUS_KINDS = {
  /** Reprogramar la fecha/hora de un post ya aprobado. */
  RESCHEDULE_POST: 'reschedule_post',
  /** Re-sincronización programada de una fuente ya conectada. */
  RESYNC_SOURCE: 'resync_source',
  /** Re-auditoría programada de la web. */
  REAUDIT_SEO: 'reaudit_seo',
  /** Refresco de un artículo existente sin cambiar sus afirmaciones. */
  REFRESH_ARTICLE: 'refresh_article',
  /** Respuesta a reseña con plantilla previamente aprobada. */
  REPLY_REVIEW: 'reply_review',
  /** Pieza de formato aprobado sobre datos confirmados de un conector. */
  VERTICAL_EVENT_PIECE: 'vertical_event_piece',
} as const

/** Siempre requiere aprobación humana (§9). La lista negra manda. */
export const HUMAN_ONLY_KINDS = {
  PUBLISH_NEW_FORMAT: 'publish_new_format',
  CUSTOMER_QUOTE: 'customer_quote',
  PERSON_MEDIA: 'person_media',
  IMPORT_PROSPECTS: 'import_prospects',
  OUTBOUND_CALL: 'outbound_call',
  PRICING_OR_LEGAL_CLAIM: 'pricing_or_legal_claim',
  SENSITIVE_VERTICAL: 'sensitive_vertical',
} as const

const AUTONOMOUS_SET = new Set<string>(Object.values(AUTONOMOUS_KINDS))
const HUMAN_ONLY_SET = new Set<string>(Object.values(HUMAN_ONLY_KINDS))

/** `AdRuleAutonomy` es por regla; una acción orgánica es su propia regla. */
export function ruleKeyForKind(kind: string): string {
  return `organic_autonomy_${kind}`
}

export function isOrganicAutonomyRule(ruleKey: string): boolean {
  return ruleKey.startsWith('organic_autonomy_')
}

/**
 * Reglas cuyo trabajo es devolver la frescura a los datos. Se libran de la
 * degradación por datos obsoletos por el mismo motivo que del guardarraíl:
 * degradar la reparación garantiza que la avería siga ahí.
 */
export function isDataRepairRule(ruleKey: string): boolean {
  return Object.entries(KINDS).some(([kind, definition]) => definition.repairsData && ruleKeyForKind(kind) === ruleKey)
}

// ─── Configuración ───────────────────────────────────────────────────────────

export interface OrganicAutonomyConfig {
  level: AutonomyLevel
  shadowMode: boolean
  /** Techo diario de acciones autónomas orgánicas. */
  maxActionsPerDay: number
  /** Minutos mínimos entre dos acciones del mismo tipo. */
  cooldownMinutes: number
  /** Cobertura de atribución por debajo de la cual no se actúa solo. */
  minAttributionCoveragePct: number
}

const DEFAULT_CONFIG: OrganicAutonomyConfig = {
  // Por defecto no hay autonomía. Se concede, no se hereda.
  level: 'N1',
  shadowMode: true,
  maxActionsPerDay: 3,
  cooldownMinutes: 120,
  minAttributionCoveragePct: 70,
}

export async function getAutonomyConfig(orgId: string): Promise<OrganicAutonomyConfig> {
  const policy = await prisma.governancePolicy.findUnique({
    where: { orgId_key: { orgId, key: AUTONOMY_POLICY_KEY } },
  })
  if (!policy || !policy.enabled) return DEFAULT_CONFIG

  const config = (policy.config ?? {}) as Partial<OrganicAutonomyConfig>
  return {
    level: config.level === 'N3' || config.level === 'N2' ? config.level : DEFAULT_CONFIG.level,
    // El modo sombra solo se desactiva explícitamente: cualquier otro valor
    // mantiene N3 escribiendo lo que haría sin llegar a hacerlo.
    shadowMode: config.shadowMode !== false,
    maxActionsPerDay: typeof config.maxActionsPerDay === 'number' ? config.maxActionsPerDay : DEFAULT_CONFIG.maxActionsPerDay,
    cooldownMinutes: typeof config.cooldownMinutes === 'number' ? config.cooldownMinutes : DEFAULT_CONFIG.cooldownMinutes,
    minAttributionCoveragePct: typeof config.minAttributionCoveragePct === 'number'
      ? config.minAttributionCoveragePct
      : DEFAULT_CONFIG.minAttributionCoveragePct,
  }
}

export class AutonomyBlockedError extends Error {
  readonly statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'AutonomyBlockedError'
  }
}

export class AutonomyNotActionableError extends Error {
  readonly statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'AutonomyNotActionableError'
  }
}

/**
 * Cambiar el nivel es un acto de gobierno, no una preferencia: queda auditado y
 * se niega si el freno está echado o si los datos no aguantan una decisión.
 */
export async function setAutonomyConfig(
  orgId: string,
  actorUserId: string,
  patch: Partial<OrganicAutonomyConfig>,
) {
  const current = await getAutonomyConfig(orgId)
  const next: OrganicAutonomyConfig = { ...current, ...patch }

  const raisesAutonomy = next.level !== 'N1' && next.level !== current.level
  const leavesShadow = current.shadowMode && next.shadowMode === false
  if (raisesAutonomy || leavesShadow) {
    const policy = await getPolicy(orgId)
    if (policy.killSwitchEnabled) {
      throw new AutonomyBlockedError(
        'La autonomía está parada para toda la organización. Reanúdala explícitamente antes de subir el nivel o salir del modo sombra.',
      )
    }
    const project = await prisma.organicProject.findUnique({ where: { orgId }, select: { id: true } })
    const quality = await getOrganicDataQuality(orgId, project?.id ?? null)
    if (quality.status === 'unreliable' || quality.status === 'stale') {
      throw new AutonomyBlockedError(
        `No se puede subir la autonomía orgánica con la integridad de datos en "${quality.status}".`,
      )
    }
  }

  const saved = await prisma.governancePolicy.upsert({
    where: { orgId_key: { orgId, key: AUTONOMY_POLICY_KEY } },
    create: { orgId, key: AUTONOMY_POLICY_KEY, enabled: true, config: next as unknown as Prisma.InputJsonObject, updatedById: actorUserId },
    update: { config: next as unknown as Prisma.InputJsonObject, updatedById: actorUserId, enabled: true },
  })

  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'organic.autonomy.policy_updated',
    entityType: 'GovernancePolicy',
    entityId: saved.id,
    before: current,
    after: next,
  })
  return next
}

// ─── Ejecutores: qué se puede hacer de verdad hoy ────────────────────────────

export type ExecutionContext = {
  orgId: string
  actorUserId: string | null
  payload: Record<string, unknown>
  target: string | null
}

export type ExecutionResult = {
  detail: string
  data?: Record<string, unknown>
}

type KindDefinition = {
  label: string
  /** Qué canal del embudo debería mover, para el registro de la decisión. */
  channel: string
  /** Efectos que no se recuperan aunque se compense (§10.3 de `ads.md`). */
  irreversibleEffects: string[]
  /**
   * `null` cuando la acción está en la lista de §9 pero **todavía no se puede
   * ejecutar**. Se declara aquí, en el único sitio que hay que tocar cuando la
   * pieza que falta exista, en vez de descubrirse leyendo un registro de sombra
   * lleno de acciones que nunca habrían hecho nada.
   */
  execute: ((context: ExecutionContext) => Promise<ExecutionResult>) | null
  unavailableReason?: string
  /**
   * La acción **repara** la frescura de los datos en vez de apoyarse en ella.
   *
   * Importa porque el guardarraíl de integridad diría que no se puede actuar
   * con las fuentes obsoletas, y eso bloquearía justo la acción que existe para
   * dejar de estarlo: el sistema se quedaría atascado esperando a que alguien
   * se diera cuenta a mano. Una re-sincronización no publica nada ni gasta
   * dinero; lo peor que puede pasar es que vuelva a fallar y quede registrado.
   */
  repairsData?: boolean
}

/** Días de antigüedad de una sincronización antes de proponer repetirla. */
const RESYNC_AFTER_HOURS = 48
/** Días desde la última auditoría antes de proponer repetirla. */
const REAUDIT_AFTER_DAYS = 7
/** Ventana que se re-sincroniza de Search Console. */
const RESYNC_WINDOW_DAYS = 30
/** Aprobaciones acumuladas de un formato antes de que N3 lo genere solo (§9). */
const APPROVALS_BEFORE_FORMAT_IS_TRUSTED = 3

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const KINDS: Record<string, KindDefinition> = {
  [AUTONOMOUS_KINDS.RESYNC_SOURCE]: {
    label: 'Re-sincronizar una fuente de Google',
    channel: 'search',
    irreversibleEffects: [],
    repairsData: true,
    async execute({ orgId, actorUserId, payload }) {
      const provider = typeof payload.provider === 'string' ? payload.provider : 'search_console'
      const end = new Date()
      const start = new Date(end.getTime() - RESYNC_WINDOW_DAYS * 86_400_000)
      const range = { startDate: isoDay(start), endDate: isoDay(end) }

      if (provider === 'ga4') {
        const result = await ingest.syncGa4Traffic(orgId, actorUserId, range)
        return {
          detail: `Analytics re-sincronizado: ${result.rows} días de tráfico y ${result.sessions} sesiones orgánicas.`,
          data: { rows: result.rows, sessions: result.sessions, skippedPaid: result.skippedPaid },
        }
      }
      if (provider === 'google_business_profile') {
        const result = await ingest.syncBusinessProfile(orgId, actorUserId, range)
        return {
          detail: `Perfil de Empresa re-sincronizado: ${result.views} vistas de ficha y ${result.calls} llamadas en ${result.rows} días.`,
          data: { rows: result.rows, views: result.views, calls: result.calls, reviews: result.reviews.status },
        }
      }
      const result = await googleIntegration.syncSearchConsoleQueries(orgId, actorUserId, { ...range, rowLimit: 1_000 })
      return {
        detail: `Search Console re-sincronizado: ${result.rows} filas leídas y ${result.upserted} consultas actualizadas.`,
        data: { rows: result.rows, upserted: result.upserted },
      }
    },
  },

  [AUTONOMOUS_KINDS.REAUDIT_SEO]: {
    label: 'Re-auditar la web',
    channel: 'search',
    irreversibleEffects: [],
    repairsData: true,
    async execute({ orgId, payload }) {
      const url = typeof payload.url === 'string' ? payload.url : null
      if (!url) throw new Error('La acción no lleva la URL que hay que auditar.')
      // `skipAi`: la re-auditoría vigila salud técnica, no reescribe el plan.
      // Un LLM aquí convertiría una comprobación mecánica en contenido nuevo,
      // que es justo lo que N3 no puede hacer.
      const report = await seo.generateSeoReport({
        url,
        business: typeof payload.business === 'string' ? payload.business : undefined,
        sector: typeof payload.sector === 'string' ? payload.sector : undefined,
        city: typeof payload.city === 'string' ? payload.city : undefined,
      }, { skipAi: true })
      await seo.saveReport(orgId, report, true)
      return {
        detail: `Auditoría repetida sobre ${url}: score ${report.score}${report.webAlive ? '' : ' · la web no respondió'}.`,
        data: { score: report.score, webAlive: report.webAlive },
      }
    },
  },

  [AUTONOMOUS_KINDS.REFRESH_ARTICLE]: {
    label: 'Refrescar un artículo caducado',
    channel: 'search',
    irreversibleEffects: [
      'La versión anterior del artículo se restaura desde la compensación, pero las visitas servidas con el texto refrescado no se deshacen.',
    ],
    async execute({ orgId, target, payload }) {
      if (!target) throw new Error('La acción no lleva el artículo que hay que refrescar.')
      const before = typeof payload.previousContent === 'string' ? payload.previousContent : ''
      const result = await seo.refreshArticle(orgId, target)
      if (!result) throw new Error('El artículo ya no existe o está inactivo.')

      const after = await prisma.knowledgeBase.findFirst({
        where: { id: target, orgId },
        select: { content: true },
      })
      // §9 delega el refresco "sin cambiar sus afirmaciones". El modelo puede
      // incumplirlo, así que se comprueba después y se revierte: la frontera la
      // decide el texto resultante, no la buena intención del prompt.
      const added = newSensitiveClaims(before, after?.content ?? '')
      if (added.length) {
        await prisma.knowledgeBase.update({ where: { id: target }, data: { content: before } })
        throw new AutonomyBlockedError(
          `El refresco introdujo afirmaciones nuevas (${added.join(', ')}): se ha restaurado la versión anterior y hace falta una persona.`,
        )
      }
      return { detail: `Artículo "${result.name}" refrescado sin introducir afirmaciones nuevas.`, data: { articleId: result.articleId } }
    },
  },

  [AUTONOMOUS_KINDS.VERTICAL_EVENT_PIECE]: {
    label: 'Generar la pieza de un acontecimiento confirmado',
    channel: 'social',
    irreversibleEffects: [],
    async execute({ orgId, target, payload }) {
      if (!target) throw new Error('La acción no lleva la oportunidad de origen.')
      const opportunity = await prisma.organicOpportunity.findFirst({
        where: { id: target, orgId },
        select: { id: true, projectId: true, title: true, metadata: true },
      })
      if (!opportunity) throw new Error('La oportunidad del acontecimiento ya no existe.')

      const format = typeof payload.format === 'string' ? payload.format : 'post'
      const body = renderConfirmedEventPiece(opportunity.title, (opportunity.metadata ?? {}) as Record<string, unknown>)
      const asset = await prisma.organicAsset.create({
        data: {
          orgId,
          projectId: opportunity.projectId,
          opportunityId: opportunity.id,
          type: format,
          title: opportunity.title,
          // Nace como borrador: N3 genera la pieza con datos confirmados, pero
          // el paso a público sigue siendo de una persona mientras no exista un
          // camino de publicación auditado (§9).
          status: 'draft',
          content: { body, generatedBy: 'organic_autonomy', policyVersion: AUTONOMY_POLICY_VERSION } as object,
        },
      })
      await prisma.organicOpportunity.update({ where: { id: opportunity.id }, data: { status: 'in_progress' } })
      return { detail: `Pieza "${format}" generada con los datos confirmados del acontecimiento.`, data: { assetId: asset.id } }
    },
  },

  [AUTONOMOUS_KINDS.RESCHEDULE_POST]: {
    label: 'Reprogramar un post aprobado',
    channel: 'social',
    irreversibleEffects: [],
    execute: null,
    // Metricool guarda la fecha del borrador y `metricoolSync.service.ts` solo
    // sabe crearlos (`createDraftPost`); no hay ninguna llamada de
    // actualización, y `ContentPiece` no guarda fecha de programación. Mover la
    // hora exige una API de edición que hoy no existe.
    unavailableReason: 'No hay forma de mover la fecha de un borrador ya creado en Metricool: falta la llamada de actualización.',
  },

  [AUTONOMOUS_KINDS.REPLY_REVIEW]: {
    label: 'Responder una reseña con plantilla aprobada',
    channel: 'gbp',
    irreversibleEffects: [],
    execute: null,
    // Las reseñas sin responder ya entran como oportunidades del canal `gbp`
    // cuando Google concede el acceso a su API v4. Lo que falta es el otro
    // lado: publicar la respuesta es una escritura en esa misma API v4
    // restringida, y no hay plantillas aprobadas contra las que comparar.
    unavailableReason: 'Leer reseñas ya funciona, pero responderlas exige escribir en la API v4 restringida de Google y un catálogo de plantillas aprobadas que todavía no existe.',
  },
}

/**
 * Texto de una pieza a partir de un acontecimiento confirmado.
 *
 * Solo reordena los datos que llegaron del conector: no inventa una línea. Es
 * la diferencia entre "el marcador de un partido confirmado" que §9 delega y
 * contenido nuevo, que nunca es delegable.
 */
export function renderConfirmedEventPiece(title: string, metadata: Record<string, unknown>): string {
  const payload = (metadata.payload ?? {}) as Record<string, unknown>
  const facts = Object.entries(payload)
    .filter(([, value]) => value != null && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${String(value)}`)
  return [title, ...facts].join('\n')
}

export function kindDefinition(kind: string): KindDefinition | null {
  return KINDS[kind] ?? null
}

/** Catálogo completo de §9, con lo que hoy se puede ejecutar y lo que no. */
export function listKinds() {
  return Object.entries(KINDS).map(([kind, definition]) => ({
    kind,
    label: definition.label,
    channel: definition.channel,
    executable: Boolean(definition.execute),
    unavailableReason: definition.unavailableReason ?? null,
  }))
}

// ─── Guardarraíles ───────────────────────────────────────────────────────────

export interface GuardrailCheck {
  rule: string
  passed: boolean
  detail: string
}

export interface ProposedAction {
  kind: string
  title: string
  /** Qué haría, en una frase, para el registro de sombra. */
  summary: string
  scope: string
  target: string | null
  payload: Record<string, unknown>
  evidence: Record<string, unknown>
}

/**
 * Cobertura de atribución orgánica: qué porcentaje de los leads del período
 * tiene un canal identificado. `null` cuando no hay leads que medir — que no es
 * lo mismo que cobertura cero.
 */
export async function attributionCoverage(orgId: string, projectId: string): Promise<number | null> {
  const snapshots = await prisma.organicChannelSnapshot.findMany({
    where: { orgId, projectId },
    orderBy: { computedAt: 'desc' },
    take: 20,
  })
  if (!snapshots.length) return null
  const latestPeriod = snapshots[0].periodKey
  const period = snapshots.filter(item => item.periodKey === latestPeriod)
  const total = period.reduce((sum, item) => sum + (item.leads ?? 0), 0)
  if (!total) return null
  const unattributed = period.find(item => item.channel === 'unattributed')?.leads ?? 0
  return Math.round(((total - unattributed) / total) * 100)
}

/**
 * Evalúa los guardarraíles de §9 y §10.3 uno a uno. Devuelve todos los
 * resultados, no solo el primero que falla: quien lee la decisión tiene que ver
 * qué se comprobó, no solo qué la bloqueó.
 */
export async function evaluateGuardrails(
  orgId: string,
  action: ProposedAction,
  config: OrganicAutonomyConfig,
): Promise<{ checks: GuardrailCheck[]; blockedReason: string | null }> {
  const checks: GuardrailCheck[] = []
  const definition = KINDS[action.kind] ?? null

  // 1. Lista negra antes que lista blanca.
  const humanOnly = HUMAN_ONLY_SET.has(action.kind)
  checks.push({
    rule: 'kind_allowed',
    passed: !humanOnly && AUTONOMOUS_SET.has(action.kind),
    detail: humanOnly
      ? `«${action.kind}» requiere aprobación humana siempre (§9).`
      : AUTONOMOUS_SET.has(action.kind)
        ? `«${action.kind}» está en la lista delegable de §9.`
        : `«${action.kind}» no está en la lista delegable de §9.`,
  })

  // 2. El freno de emergencia es el de la organización, compartido con Ads.
  const policy = await getPolicy(orgId)
  checks.push({
    rule: 'kill_switch',
    passed: !policy.killSwitchEnabled,
    detail: policy.killSwitchEnabled
      ? `La autonomía está parada: ${policy.killSwitchReason ?? 'sin motivo registrado'}.`
      : 'La organización no tiene la parada de emergencia activada.',
  })

  // 3. Integridad de los datos orgánicos.
  const project = await prisma.organicProject.findUnique({ where: { orgId }, select: { id: true } })
  const quality = await getOrganicDataQuality(orgId, project?.id ?? null)
  const staleIsFine = quality.status === 'stale' && Boolean(definition?.repairsData)
  checks.push({
    rule: 'data_quality',
    passed: quality.status !== 'unreliable' && (quality.status !== 'stale' || staleIsFine),
    detail: staleIsFine
      ? `Las fuentes están obsoletas y esta acción existe precisamente para ponerlas al día: no bloquea.`
      : `Integridad de las fuentes orgánicas: ${quality.status}.`,
  })

  // 4. Cobertura de atribución. Sin leads que medir no hay nada que repartir
  // mal, así que no bloquea; con cobertura medida y baja, sí.
  const coverage = project ? await attributionCoverage(orgId, project.id) : null
  checks.push({
    rule: 'attribution_coverage',
    passed: coverage == null || coverage >= config.minAttributionCoveragePct,
    detail: coverage == null
      ? 'Todavía no hay leads suficientes para medir la cobertura de atribución.'
      : `Cobertura de atribución del ${coverage} %; el mínimo para actuar solo es ${config.minAttributionCoveragePct} %.`,
  })

  // 5. Techo diario, contando solo las acciones orgánicas.
  const since = new Date(Date.now() - 86_400_000)
  const recent = await prisma.adAction.findMany({
    where: { orgId, createdAt: { gte: since }, decision: { channel: { not: 'ads' } } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, kind: true },
  })
  checks.push({
    rule: 'max_actions_per_day',
    passed: recent.length < config.maxActionsPerDay,
    detail: `${recent.length} acciones orgánicas en las últimas 24 h; el límite es ${config.maxActionsPerDay}.`,
  })

  // 6. Cooldown por tipo: dos re-sincronizaciones seguidas no aportan nada y
  // sí gastan cuota de la API de quien nos la presta.
  const lastOfKind = recent.find(item => item.kind === action.kind)
  const minutesSince = lastOfKind ? (Date.now() - lastOfKind.createdAt.getTime()) / 60_000 : null
  checks.push({
    rule: 'cooldown',
    passed: minutesSince == null || minutesSince >= config.cooldownMinutes,
    detail: minutesSince == null
      ? 'No hay ninguna acción reciente de este tipo.'
      : `La última acción de este tipo fue hace ${Math.round(minutesSince)} min; el mínimo es ${config.cooldownMinutes} min.`,
  })

  // 7. El contenido puede ser sensible aunque el tipo esté permitido.
  const sensitive = findSensitiveContent(JSON.stringify({ title: action.title, summary: action.summary, payload: action.payload }))
  checks.push({
    rule: 'content_not_sensitive',
    passed: !sensitive,
    detail: sensitive
      ? `El contenido ${sensitive.reason}: decide una persona (§9).`
      : 'El contenido no toca precios, garantías, legales ni prueba social.',
  })

  // 8. Que exista un camino real de ejecución. Declararlo aquí evita aprobar
  // una acción que después no haría nada.
  checks.push({
    rule: 'executor_available',
    passed: Boolean(definition?.execute),
    detail: definition?.execute
      ? `«${action.kind}» tiene ejecución implementada.`
      : definition?.unavailableReason ?? `«${action.kind}» no tiene ejecución implementada.`,
  })

  const blocked = checks.find(check => !check.passed)
  return { checks, blockedReason: blocked ? blocked.detail : null }
}

// ─── Nivel efectivo por tipo de acción ───────────────────────────────────────

const LEVEL_ORDER: Record<AutonomyLevel, number> = { N1: 0, N2: 1, N3: 2 }

/**
 * El nivel efectivo es el menor entre el que concedió la organización y el que
 * esa acción concreta se ha ganado. Que el kill switch por gasto haya
 * demostrado ser fiable no dice nada sobre una acción escrita ayer.
 */
export async function effectiveLevel(orgId: string, kind: string, config: OrganicAutonomyConfig): Promise<{
  level: AutonomyLevel
  orgLevel: AutonomyLevel
  ruleLevel: AutonomyLevel
}> {
  // Se lee sin crear la fila: la ausencia de historial es exactamente N1, y
  // crear filas al leer haría que `adRuleAutonomy` dependiera de este servicio
  // y este de aquel. La promoción sí la escribe, desde su propio servicio.
  const rule = await prisma.adRuleAutonomy.findUnique({
    where: { orgId_ruleKey: { orgId, ruleKey: ruleKeyForKind(kind) } },
    select: { autonomyLevel: true },
  })
  const ruleLevel = (rule?.autonomyLevel === 'N3' || rule?.autonomyLevel === 'N2' ? rule.autonomyLevel : 'N1') as AutonomyLevel
  const level = LEVEL_ORDER[ruleLevel] < LEVEL_ORDER[config.level] ? ruleLevel : config.level
  return { level, orgLevel: config.level, ruleLevel }
}

// ─── Decisión ────────────────────────────────────────────────────────────────

/**
 * Registra la decisión sobre una acción propuesta y, si procede, la ejecuta.
 *
 * - guardarraíl en rojo → `blocked`, nunca se ejecuta;
 * - N1 → `advisory`: Vendrava explica y espera una persona;
 * - N2 → `pending_approval`: la persona la aprueba con un clic;
 * - N3 en sombra → `shadow`: se escribe lo que **haría**, sin hacerlo;
 * - N3 en vivo → se ejecuta y queda `executed` o `failed`.
 */
export async function decide(orgId: string, action: ProposedAction) {
  const config = await getAutonomyConfig(orgId)
  const definition = KINDS[action.kind]
  if (!definition) throw new AutonomyNotActionableError(`Tipo de acción desconocido: ${action.kind}`)

  const { checks, blockedReason } = await evaluateGuardrails(orgId, action, config)
  const { level, orgLevel, ruleLevel } = await effectiveLevel(orgId, action.kind, config)

  const status = blockedReason
    ? 'blocked'
    : level === 'N3'
      ? (config.shadowMode ? 'shadow' : 'approved')
      : level === 'N2'
        ? 'pending_approval'
        : 'advisory'

  const decision = await recordDecision({
    orgId,
    campaignId: null,
    diagnosis: `autonomy:${action.kind}`,
    ruleKey: ruleKeyForKind(action.kind),
    ruleVersion: AUTONOMY_POLICY_VERSION,
    dedupeKey: `${ruleKeyForKind(action.kind)}:${action.target ?? action.scope}:${isoDay(new Date())}`,
    severity: 'info',
    confidence: blockedReason ? 'low' : 'medium',
    confidenceReason: blockedReason
      ? `Bloqueada por un guardarraíl: ${blockedReason}`
      : `Nivel efectivo ${level} (organización ${orgLevel}, esta acción ${ruleLevel}).`,
    title: definition.label,
    explanation: action.summary,
    // Se describe lo que haría, nunca lo que "habría ahorrado" (§10.2 de ads).
    recommendation: level === 'N3' && config.shadowMode
      ? `En modo sombra: Vendrava habría ejecutado «${definition.label}» sin tocar nada.`
      : `Vendrava puede ejecutar «${definition.label}» cuando una persona lo apruebe.`,
    hypotheticalAction: { kind: action.kind, scope: action.scope, target: action.target, payload: action.payload },
    evidence: { ...action.evidence, guardrails: checks, policyVersion: AUTONOMY_POLICY_VERSION },
    cohortStatus: 'insufficient',
    signalUsed: null,
    channel: definition.channel,
    status,
    mode: status === 'approved' ? 'live' : 'shadow',
    autonomyLevel: level,
    // Un rechazo humano silencia el mismo asunto una semana: repetir mañana la
    // misma propuesta que alguien acaba de rechazar es acoso, no vigilancia.
    suppressDays: 7,
  })

  // `recordDecision` puede devolver una decisión anterior en vez de la que se
  // acaba de escribir: si una persona rechazó este mismo asunto hace poco, la
  // ventana de silencio devuelve aquella. Comparar el estado devuelto con el
  // que se pidió es lo que evita ejecutar —o reescribirle el motivo a— una
  // decisión que ya resolvió alguien.
  if (decision.status !== status) return { decision, action: null, result: null }

  // N3 en vivo ejecuta en la misma pasada: es lo que significa "automático".
  if (status === 'approved') {
    return executeDecision(orgId, decision.id, null)
  }
  if (blockedReason) {
    // El motivo va también a `decisionNote` porque es lo que lee la tarjeta:
    // enterrarlo solo en la evidencia obliga a desplegar el detalle para saber
    // por qué no se hizo nada.
    const blockedDecision = await prisma.adDecision.update({
      where: { id: decision.id },
      data: { decisionNote: blockedReason },
    })
    return { decision: blockedDecision, action: null, result: null }
  }
  return { decision, action: null, result: null }
}

// ─── Ejecución ───────────────────────────────────────────────────────────────

/**
 * Ejecuta una decisión ya aprobada. Los guardarraíles se vuelven a evaluar aquí
 * aunque ya pasaran al decidir: entre la aprobación y la ejecución alguien pudo
 * tirar del freno, y el estado que manda es el del momento de actuar.
 */
export async function executeDecision(orgId: string, decisionId: string, actorUserId: string | null) {
  const decision = await prisma.adDecision.findFirst({ where: { id: decisionId, orgId } })
  if (!decision) return null
  if (!['advisory', 'shadow', 'pending_approval', 'approved'].includes(decision.status)) {
    throw new AutonomyNotActionableError(`La decisión ya está en estado "${decision.status}".`)
  }
  const hypothetical = (decision.hypotheticalAction ?? {}) as Record<string, unknown>
  const kind = typeof hypothetical.kind === 'string' ? hypothetical.kind : ''
  const definition = KINDS[kind]
  if (!definition) throw new AutonomyNotActionableError('Esta decisión no propone ninguna acción orgánica ejecutable.')

  const config = await getAutonomyConfig(orgId)
  const payload = (hypothetical.payload ?? {}) as Record<string, unknown>
  const target = typeof hypothetical.target === 'string' ? hypothetical.target : null
  const { checks, blockedReason } = await evaluateGuardrails(orgId, {
    kind,
    title: decision.title,
    summary: decision.explanation,
    scope: typeof hypothetical.scope === 'string' ? hypothetical.scope : 'organic',
    target,
    payload,
    evidence: {},
  }, config)

  if (blockedReason) {
    const updated = await prisma.adDecision.update({
      where: { id: decision.id },
      data: { status: 'blocked', decisionNote: blockedReason, decidedAt: new Date(), actorUserId },
    })
    await writeAuditLog({
      orgId,
      actorUserId,
      actorType: actorUserId ? 'user' : 'system',
      action: 'organic.autonomy.blocked',
      entityType: 'AdDecision',
      entityId: decision.id,
      after: { kind, blockedReason },
    })
    return { decision: updated, action: null, result: null, blockedReason }
  }

  const action = await prisma.adAction.create({
    data: {
      orgId,
      decisionId: decision.id,
      campaignId: null,
      kind,
      scope: typeof hypothetical.scope === 'string' ? hypothetical.scope : 'organic',
      target,
      payload: payload as object,
      mode: 'live',
      status: 'executing',
      guardrailChecks: checks as unknown as Prisma.InputJsonArray,
      // Lo que importa no es qué se puede deshacer sino qué no se recupera.
      irreversibleEffects: definition.irreversibleEffects,
      approvedByUserId: actorUserId,
      approvedAt: new Date(),
    },
  })

  const startedAt = Date.now()
  try {
    const result = await definition.execute!({ orgId, actorUserId, payload, target })
    const [updatedAction] = await prisma.$transaction([
      prisma.adAction.update({
        where: { id: action.id },
        data: { status: 'executed', executedAt: new Date(), providerResponse: result.detail },
      }),
      prisma.adActionResult.create({
        data: {
          orgId,
          actionId: action.id,
          operation: 'execute',
          outcome: 'ok',
          requestPayload: payload as object,
          providerResponse: result.detail,
          durationMs: Date.now() - startedAt,
          remoteStateAfter: (result.data ?? {}) as object,
        },
      }),
      prisma.adDecision.update({
        where: { id: decision.id },
        data: { status: 'executed', decidedAt: new Date(), actorUserId, decisionNote: result.detail },
      }),
    ])
    await writeAuditLog({
      orgId,
      actorUserId,
      actorType: actorUserId ? 'user' : 'system',
      action: 'organic.autonomy.executed',
      entityType: 'AdAction',
      entityId: action.id,
      after: { kind, detail: result.detail, level: decision.autonomyLevel },
    })
    return { decision: null, action: updatedAction, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al ejecutar la acción.'
    // Un fallo se guarda como fallo: la tasa de error es lo que después degrada
    // la regla sola (`adRuleAutonomy.service.ts`).
    const [updatedAction] = await prisma.$transaction([
      prisma.adAction.update({
        where: { id: action.id },
        data: { status: 'failed', errorCode: error instanceof AutonomyBlockedError ? 'guardrail_blocked' : 'execution_error', providerResponse: message },
      }),
      prisma.adActionResult.create({
        data: {
          orgId,
          actionId: action.id,
          operation: 'execute',
          outcome: error instanceof AutonomyBlockedError ? 'guardrail_blocked' : 'provider_error',
          requestPayload: payload as object,
          providerResponse: message,
          durationMs: Date.now() - startedAt,
        },
      }),
      prisma.adDecision.update({
        where: { id: decision.id },
        data: { status: 'blocked', decisionNote: message, decidedAt: new Date(), actorUserId },
      }),
    ])
    await writeAuditLog({
      orgId,
      actorUserId,
      actorType: actorUserId ? 'user' : 'system',
      action: 'organic.autonomy.failed',
      entityType: 'AdAction',
      entityId: action.id,
      after: { kind, error: message },
    })
    return { decision: null, action: updatedAction, result: null, error: message }
  }
}

/** Aprobación con un clic (N2). Ejecuta y deja constancia de quién lo aprobó. */
export async function approveDecision(orgId: string, actorUserId: string, decisionId: string) {
  return executeDecision(orgId, decisionId, actorUserId)
}

/** Rechazo con motivo. Es el único aprendizaje que tiene el sistema en N1. */
export async function rejectDecision(orgId: string, actorUserId: string, decisionId: string, reason: string) {
  const decision = await prisma.adDecision.findFirst({ where: { id: decisionId, orgId } })
  if (!decision) return null
  if (!['advisory', 'shadow', 'pending_approval', 'blocked'].includes(decision.status)) {
    throw new AutonomyNotActionableError(`La decisión ya está en estado "${decision.status}".`)
  }
  const updated = await prisma.adDecision.update({
    where: { id: decision.id },
    data: { status: 'rejected', actorUserId, decidedAt: new Date(), decisionNote: reason },
  })
  await writeAuditLog({
    orgId,
    actorUserId,
    action: 'organic.autonomy.rejected',
    entityType: 'AdDecision',
    entityId: decision.id,
    before: decision,
    after: updated,
  })
  return updated
}

// ─── Candidatos ──────────────────────────────────────────────────────────────

/**
 * Convierte el estado real del sistema en acciones candidatas. Solo mira lo que
 * ya está medido: nada se propone "por si acaso".
 */
export async function proposeActions(orgId: string): Promise<ProposedAction[]> {
  const project = await prisma.organicProject.findUnique({ where: { orgId }, select: { id: true } })
  if (!project) return []

  const proposals: ProposedAction[] = []

  // 1. Re-sincronización: fuente conectada, recurso elegido y datos viejos. Se
  // propone una por fuente: que Search Console esté al día no dice nada sobre
  // si Analytics lleva una semana sin leerse.
  const integrations = await prisma.organicIntegration.findMany({
    where: { orgId, projectId: project.id, status: 'connected', externalPropertyId: { not: null } },
    select: { provider: true, externalPropertyId: true, lastSyncedAt: true },
  })
  const PROVIDER_LABEL: Record<string, string> = {
    search_console: 'Search Console',
    ga4: 'Analytics',
    google_business_profile: 'el Perfil de Empresa',
  }
  for (const integration of integrations) {
    const label = PROVIDER_LABEL[integration.provider]
    if (!label) continue
    const hours = integration.lastSyncedAt
      ? (Date.now() - integration.lastSyncedAt.getTime()) / 3_600_000
      : null
    if (hours != null && hours < RESYNC_AFTER_HOURS) continue
    proposals.push({
      kind: AUTONOMOUS_KINDS.RESYNC_SOURCE,
      title: `Re-sincronizar ${label}`,
      summary: hours == null
        ? `El recurso de ${label} está elegido pero nunca se ha sincronizado: sin esos datos el embudo empieza vacío.`
        : `Los datos de ${label} tienen ${Math.round(hours)} h. Repetir la sincronización los pone al día sin tocar nada más.`,
      scope: integration.provider,
      target: integration.externalPropertyId,
      payload: { provider: integration.provider, property: integration.externalPropertyId, windowDays: RESYNC_WINDOW_DAYS },
      evidence: { provider: integration.provider, lastSyncedAt: integration.lastSyncedAt, hoursSinceSync: hours == null ? null : Math.round(hours) },
    })
  }

  // 2. Re-auditoría: hay proyecto SEO y su último informe ya no vale.
  const seoProjects = await prisma.seoProject.findMany({
    where: { orgId },
    select: { url: true, business: true, sector: true, city: true },
    take: 3,
  })
  for (const seoProject of seoProjects) {
    const lastReport = await prisma.seoReport.findFirst({
      where: { orgId, url: seoProject.url },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const days = lastReport ? (Date.now() - lastReport.createdAt.getTime()) / 86_400_000 : null
    if (days != null && days < REAUDIT_AFTER_DAYS) continue
    proposals.push({
      kind: AUTONOMOUS_KINDS.REAUDIT_SEO,
      title: `Re-auditar ${seoProject.url}`,
      summary: days == null
        ? `${seoProject.url} no tiene ninguna auditoría guardada: la primera establece la línea base.`
        : `La última auditoría de ${seoProject.url} tiene ${Math.round(days)} días. Repetirla comprueba salud técnica sin reescribir el plan.`,
      scope: 'seo_project',
      target: seoProject.url,
      payload: {
        url: seoProject.url,
        business: seoProject.business ?? undefined,
        sector: seoProject.sector ?? undefined,
        city: seoProject.city ?? undefined,
      },
      evidence: { lastReportAt: lastReport?.createdAt ?? null, daysSinceReport: days == null ? null : Math.round(days) },
    })
  }

  // 3. Refresco de artículos caducados (90+ días sin tocar).
  const stale = await seo.listStaleArticles(orgId)
  for (const article of stale.slice(0, 1)) {
    const current = await prisma.knowledgeBase.findFirst({
      where: { id: article.id, orgId },
      select: { content: true },
    })
    proposals.push({
      kind: AUTONOMOUS_KINDS.REFRESH_ARTICLE,
      title: `Refrescar "${article.name}"`,
      summary: `El artículo lleva desde ${isoDay(article.updatedAt)} sin tocarse. El refresco actualiza la redacción y se revierte solo si introduce alguna afirmación nueva.`,
      scope: 'article',
      target: article.id,
      payload: { articleId: article.id, previousContent: current?.content ?? '' },
      evidence: { updatedAt: article.updatedAt },
    })
  }

  // 4. Piezas de acontecimientos verticales confirmados con regla en `auto`.
  const opportunities = await prisma.organicOpportunity.findMany({
    where: { orgId, projectId: project.id, sourceKind: 'vertical_event', status: 'open' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  for (const opportunity of opportunities) {
    const proposal = await verticalEventProposal(orgId, project.id, opportunity)
    if (proposal) proposals.push(proposal)
  }

  return proposals
}

/**
 * Una pieza de conector solo se propone cuando se cumplen las tres condiciones
 * de §9 a la vez: la regla del onboarding la autorizó, el acontecimiento no es
 * sensible y el formato ya acumula aprobaciones humanas. Falla una y la pieza
 * sigue pasando por la sala de aprobación.
 */
async function verticalEventProposal(
  orgId: string,
  projectId: string,
  opportunity: { id: string; title: string; connectorId: string | null; metadata: Prisma.JsonValue },
): Promise<ProposedAction | null> {
  const metadata = (opportunity.metadata ?? {}) as Record<string, unknown>
  const eventKey = typeof metadata.eventKey === 'string' ? metadata.eventKey : null
  if (!eventKey) return null
  if (metadata.approvalPolicy !== 'auto') return null

  const connector = opportunity.connectorId
    ? await prisma.verticalConnector.findFirst({ where: { id: opportunity.connectorId, orgId }, select: { moduleKey: true } })
    : null
  if (!connector) return null

  const rule = await prisma.organicContentRule.findUnique({
    where: { projectId_moduleKey_eventKey: { projectId, moduleKey: connector.moduleKey, eventKey } },
  })
  if (!rule || !rule.isActive || rule.approvalPolicy !== 'auto' || rule.sensitive) return null

  // El módulo puede marcar el acontecimiento como sensible aunque la regla diga
  // `auto`: el vertical manda sobre la configuración (§8).
  const moduleEvent = getModule(connector.moduleKey)?.events.find(item => item.key === eventKey)
  if (moduleEvent?.sensitive) return null

  const format = rule.formats[0] ?? 'post'
  const approvals = await approvedFormatCount(orgId, format)
  if (approvals < APPROVALS_BEFORE_FORMAT_IS_TRUSTED) return null

  // Ya generada: la deduplicación real es que no exista otra pieza suya.
  const existing = await prisma.organicAsset.findFirst({ where: { orgId, opportunityId: opportunity.id } })
  if (existing) return null

  return {
    kind: AUTONOMOUS_KINDS.VERTICAL_EVENT_PIECE,
    title: `Generar ${format} de "${opportunity.title}"`,
    summary:
      `El acontecimiento «${rule.label}» llegó confirmado por el conector y su regla autoriza generación automática. ` +
      `El formato "${format}" acumula ${approvals} aprobaciones humanas. La pieza usa solo los datos recibidos.`,
    scope: 'opportunity',
    target: opportunity.id,
    payload: { format, eventKey, moduleKey: connector.moduleKey },
    evidence: { eventKey, moduleKey: connector.moduleKey, approvedFormatCount: approvals, ruleId: rule.id },
  }
}

/**
 * Cuántas piezas de ese formato ha aprobado una persona. Es lo que convierte
 * "formato previamente aprobado" de §9 en un número comprobable.
 */
export async function approvedFormatCount(orgId: string, format: string): Promise<number> {
  return prisma.contentPiece.count({
    where: { orgId, format, status: { in: ['approved', 'published'] } },
  })
}

// ─── Pasada completa ─────────────────────────────────────────────────────────

/**
 * Propone, decide y —solo en N3 en vivo— ejecuta. La ejecuta el job diario y
 * también el botón de la sala de autonomía.
 */
export async function runAutonomyPass(orgId: string) {
  const config = await getAutonomyConfig(orgId)
  const proposals = await proposeActions(orgId)

  let decided = 0
  let executed = 0
  let blocked = 0
  let skipped = 0

  for (const proposal of proposals) {
    // Un asunto con decisión abierta no se vuelve a plantear: duplicar la cola
    // es la forma más rápida de que nadie la lea.
    const open = await prisma.adDecision.findFirst({
      where: {
        orgId,
        ruleKey: ruleKeyForKind(proposal.kind),
        status: { in: ['advisory', 'shadow', 'pending_approval'] },
        dedupeKey: { startsWith: `${ruleKeyForKind(proposal.kind)}:${proposal.target ?? proposal.scope}:` },
      },
      select: { id: true },
    })
    if (open) {
      skipped += 1
      continue
    }

    const outcome = await decide(orgId, proposal)
    decided += 1
    if (outcome?.action?.status === 'executed') executed += 1
    if (outcome?.decision?.status === 'blocked') blocked += 1
  }

  return { level: config.level, shadowMode: config.shadowMode, proposed: proposals.length, decided, executed, blocked, skipped }
}

// ─── Lectura para la pantalla ────────────────────────────────────────────────

/** Estado completo de la sala de autonomía (§9 y §11 fase 4). */
export async function getAutonomyState(orgId: string) {
  const [config, policy, project] = await Promise.all([
    getAutonomyConfig(orgId),
    getPolicy(orgId),
    prisma.organicProject.findUnique({ where: { orgId }, select: { id: true } }),
  ])

  const [quality, coverage, decisions, rules] = await Promise.all([
    getOrganicDataQuality(orgId, project?.id ?? null),
    project ? attributionCoverage(orgId, project.id) : Promise.resolve(null),
    prisma.adDecision.findMany({
      where: { orgId, diagnosis: { startsWith: 'autonomy:' } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { actions: { select: { id: true, status: true, executedAt: true, providerResponse: true } } },
    }),
    prisma.adRuleAutonomy.findMany({ where: { orgId, ruleKey: { startsWith: 'organic_autonomy_' } } }),
  ])

  const ruleByKind = new Map(rules.map(rule => [rule.ruleKey, rule]))

  return {
    config,
    /** El freno es el de la organización: se enseña aquí y se acciona en Ads. */
    killSwitch: {
      enabled: policy.killSwitchEnabled,
      reason: policy.killSwitchReason,
      at: policy.killSwitchAt,
      sharedWith: 'ads',
    },
    dataQuality: { status: quality.status, attributionCoveragePct: coverage },
    kinds: listKinds().map(item => {
      const rule = ruleByKind.get(ruleKeyForKind(item.kind))
      return {
        ...item,
        ruleLevel: rule?.autonomyLevel ?? 'N1',
        degradedAt: rule?.degradedAt ?? null,
        degradedReason: rule?.degradedReason ?? null,
        effectiveLevel: LEVEL_ORDER[(rule?.autonomyLevel ?? 'N1') as AutonomyLevel] < LEVEL_ORDER[config.level]
          ? (rule?.autonomyLevel ?? 'N1')
          : config.level,
      }
    }),
    decisions: decisions.map(decision => ({
      id: decision.id,
      kind: decision.diagnosis.replace('autonomy:', ''),
      title: decision.title,
      explanation: decision.explanation,
      recommendation: decision.recommendation,
      status: decision.status,
      level: decision.autonomyLevel,
      note: decision.decisionNote,
      createdAt: decision.createdAt,
      decidedAt: decision.decidedAt,
      guardrails: ((decision.evidence ?? {}) as { guardrails?: GuardrailCheck[] }).guardrails ?? [],
      execution: decision.actions[0] ?? null,
    })),
    policyVersion: AUTONOMY_POLICY_VERSION,
  }
}
