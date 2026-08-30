import type { EvidenceItem, FollowUpAction, MicroappResult } from './types'

type ContractDetails = Record<string, unknown>

export class MicroappQualityError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details?: ContractDetails

  constructor(code: string, message: string, details?: ContractDetails) {
    super(message)
    this.name = 'MicroappQualityError'
    this.code = code
    this.statusCode = 500
    this.details = details
  }
}

function fail(code: string, microappId: string, message: string, details?: ContractDetails): never {
  throw new MicroappQualityError(code, `${microappId}: ${message}`, details)
}

export function validateMicroappEstimate(microappId: string, value: unknown): { cents: number } {
  const cents = value && typeof value === 'object' ? (value as { cents?: unknown }).cents : undefined
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents < 0) {
    fail('MICROAPP_ESTIMATE_INVALID', microappId, 'estimateCost debe devolver céntimos finitos y no negativos', { cents })
  }
  // Evita que un adapter defectuoso reserve una cifra fuera del rango
  // operativo. No redondeamos: el ledger admite céntimos fraccionarios.
  if (cents > 100_000_000) {
    fail('MICROAPP_ESTIMATE_INVALID', microappId, 'estimateCost supera el límite operativo', { cents })
  }
  return { cents }
}

function validateEvidence(microappId: string, item: EvidenceItem, index: number): void {
  if (!item || typeof item !== 'object') fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] no es un objeto`)
  if (typeof item.claim !== 'string' || item.claim.trim().length < 5) {
    fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] no explica qué demuestra`)
  }
  if (item.claim.length > 4_000) {
    fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] supera 4.000 caracteres`)
  }
  if (!['high', 'medium', 'low'].includes(item.confidence)) {
    fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] no declara una confianza válida`)
  }
  const hasUrl = typeof item.sourceUrl === 'string' && item.sourceUrl.trim().length > 0
  const hasRef = Boolean(item.sourceRef?.kind?.trim() && item.sourceRef?.id?.trim())
  if (!hasUrl && !hasRef) {
    fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] no enlaza una fuente o referencia interna`)
  }
  if (hasUrl) {
    try {
      const parsed = new URL(item.sourceUrl as string)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol')
      if (parsed.username || parsed.password) throw new Error('credentials')
    } catch {
      fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] contiene una URL no válida`)
    }
  }
  if (item.fetchedAt && Number.isNaN(Date.parse(item.fetchedAt))) {
    fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] contiene fetchedAt inválido`)
  }
  if (item.fetchedAt && Date.parse(item.fetchedAt) > Date.now() + 5 * 60_000) {
    fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] declara una fecha futura`)
  }
  if (item.sourceRef && (
    typeof item.sourceRef.kind !== 'string'
    || typeof item.sourceRef.id !== 'string'
    || item.sourceRef.kind.length > 128
    || item.sourceRef.id.length > 512
  )) {
    fail('MICROAPP_EVIDENCE_INVALID', microappId, `evidence[${index}] contiene una referencia interna desproporcionada`)
  }
}

function validateAction(microappId: string, action: FollowUpAction, index: number): void {
  if (!action || typeof action !== 'object') fail('MICROAPP_ACTION_INVALID', microappId, `suggestedActions[${index}] no es un objeto`)
  if (typeof action.kind !== 'string' || action.kind.trim().length < 3) {
    fail('MICROAPP_ACTION_INVALID', microappId, `suggestedActions[${index}] no declara kind`)
  }
  if (typeof action.label !== 'string' || action.label.trim().length < 5) {
    fail('MICROAPP_ACTION_INVALID', microappId, `suggestedActions[${index}] no tiene una etiqueta accionable`)
  }
  if (action.kind.length > 128 || action.label.length > 500) {
    fail('MICROAPP_ACTION_INVALID', microappId, `suggestedActions[${index}] supera el tamaño permitido`)
  }
  if (action.params !== undefined) {
    if (!action.params || typeof action.params !== 'object' || Array.isArray(action.params)) {
      fail('MICROAPP_ACTION_INVALID', microappId, `suggestedActions[${index}].params debe ser un objeto`)
    }
    let serialized = ''
    try { serialized = JSON.stringify(action.params) } catch {
      fail('MICROAPP_ACTION_INVALID', microappId, `suggestedActions[${index}].params no es serializable`)
    }
    if (serialized.length > 64_000) fail('MICROAPP_ACTION_INVALID', microappId, `suggestedActions[${index}].params supera 64 KB`)
  }
}

function validateAgenticResult(microappId: string, result: MicroappResult): void {
  const council = result.agentic
  if (!council) return
  if (council.profile?.microappId !== microappId) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'el consejo pertenece a otra microapp')
  }
  if (!Number.isInteger(council.requestedRounds) || council.requestedRounds < 1 || council.requestedRounds > 3) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'requestedRounds está fuera de rango')
  }
  if (!['council', 'closed_loop'].includes(council.strategy) || !Number.isInteger(council.qualityThreshold) || council.qualityThreshold < 60 || council.qualityThreshold > 100) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'strategy o qualityThreshold no son válidos')
  }
  if (!Array.isArray(council.rounds) || council.rounds.length !== council.completedRounds || council.completedRounds < 1 || council.completedRounds > council.requestedRounds) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'la traza de rondas no coincide con completedRounds')
  }
  const profileRoles = council.profile?.roles
  if (!Array.isArray(profileRoles) || profileRoles.length < 1 || profileRoles.length > 10) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'el perfil del consejo no contiene roles válidos')
  }
  const roleIds = profileRoles.map(role => role?.id)
  if (roleIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(roleIds).size !== roleIds.length) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'el perfil del consejo contiene roles inválidos o duplicados')
  }
  for (const [index, round] of council.rounds.entries()) {
    if (round.round !== index + 1 || !Array.isArray(round.reviews) || round.reviews.length !== roleIds.length) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, `la ronda ${index + 1} no coincide con el consejo declarado`)
    }
    if (round.reviews.some(review => !review || typeof review !== 'object'
      || !['pass', 'revise', 'block'].includes(review.verdict)
      || !Array.isArray(review.findings))) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, `la ronda ${index + 1} contiene una revisión inválida`)
    }
    const reviewRoleIds = round.reviews.map(review => review.roleId)
    if (new Set(reviewRoleIds).size !== roleIds.length || reviewRoleIds.some(id => !roleIds.includes(id))) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, `la ronda ${index + 1} contiene revisores ausentes o duplicados`)
    }
    if (round.reviews.some(review => !Number.isFinite(review.score) || review.score < 0 || review.score > 100)) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, `la ronda ${index + 1} contiene scores inválidos`)
    }
    const calculatedScore = Math.round((round.reviews.reduce((sum, review) => sum + review.score, 0) / round.reviews.length) * 10) / 10
    if (!Number.isFinite(round.synthesis?.score) || Math.abs(round.synthesis.score - calculatedScore) > 0.001) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, `el score de la ronda ${index + 1} no coincide con sus revisiones`)
    }
    const blocked = round.reviews.some(review => review.verdict === 'block' || review.findings.some(finding => finding.severity === 'critical'))
    const needsRevision = round.reviews.some(review => review.verdict === 'revise' || review.findings.some(finding => finding.severity === 'high'))
    const expectedStatus = blocked ? 'blocked'
      : calculatedScore >= council.qualityThreshold && !needsRevision ? 'ready'
        : 'revise'
    if (round.synthesis.status !== expectedStatus) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, `el estado de la ronda ${index + 1} contradice sus revisiones`)
    }
    if (index < council.rounds.length - 1 && round.synthesis.status === 'blocked') {
      fail('MICROAPP_AGENTIC_INVALID', microappId, 'el consejo continuó después de una ronda bloqueada')
    }
  }
  if (council.completedRounds < Math.min(2, council.requestedRounds) && council.rounds.at(-1)?.synthesis.status !== 'blocked') {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'el consejo terminó antes de las rondas mínimas sin bloqueo')
  }
  if (!Number.isFinite(council.final?.score) || council.final.score < 0 || council.final.score > 100) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'el score final está fuera de rango')
  }
  if (!['ready', 'human_review', 'blocked'].includes(council.final?.status)) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'el estado final no es válido')
  }
  if (!Array.isArray(council.revisions) || council.revisions.length > Math.max(0, council.requestedRounds - 1)) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'la traza de revisiones es incoherente')
  }
  const revisionRounds = new Set<number>()
  for (const revision of council.revisions) {
    const validHash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    if (!revision || typeof revision !== 'object' || !['applied', 'rejected'].includes(revision.status)
      || !Array.isArray(revision.appliedChanges) || !Array.isArray(revision.unresolvedChanges)) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, 'la traza contiene una revisión inválida')
    }
    if (!Number.isInteger(revision.afterRound) || revision.afterRound < 1 || revision.afterRound >= council.requestedRounds || revisionRounds.has(revision.afterRound)) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, 'la traza contiene una revisión fuera de ronda o duplicada')
    }
    revisionRounds.add(revision.afterRound)
    if (!validHash(revision.beforeHash)) fail('MICROAPP_AGENTIC_INVALID', microappId, 'una revisión contiene beforeHash inválido')
    if (revision.status === 'applied' && (!validHash(revision.afterHash) || revision.afterHash === revision.beforeHash)) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, 'una revisión aplicada no demuestra un cambio real')
    }
    if (revision.status === 'rejected' && revision.afterHash !== undefined) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, 'una revisión rechazada no puede declarar afterHash')
    }
    const sourceRound = council.rounds[revision.afterRound - 1]
    if (!sourceRound || sourceRound.synthesis.status === 'blocked'
      || (sourceRound.synthesis.status !== 'revise' && sourceRound.synthesis.requiredChanges.length === 0)) {
      fail('MICROAPP_AGENTIC_INVALID', microappId, 'una revisión no corresponde a una ronda con cambios pendientes')
    }
  }
  if (council.strategy === 'council' && council.revisions.length > 0) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'strategy=council no puede declarar revisiones editoriales')
  }
  if (council.strategy === 'closed_loop') {
    for (const round of council.rounds.slice(0, -1)) {
      const needsEditor = round.synthesis.status === 'revise' || round.synthesis.requiredChanges.length > 0
      if (round.synthesis.status !== 'blocked' && needsEditor && !revisionRounds.has(round.round)) {
        fail('MICROAPP_AGENTIC_INVALID', microappId, `falta la revisión cerrada tras la ronda ${round.round}`)
      }
    }
  }
  if (council.final.status === 'ready' && council.revisions.some(revision => revision.status === 'rejected' || revision.unresolvedChanges.length > 0)) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'un resultado con revisiones fallidas o pendientes no puede declararse listo')
  }
  const last = council.rounds.at(-1)!
  if (council.final.score !== last.synthesis.score) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'el score final no coincide con la última ronda')
  }
  const revisionFailedClosed = council.revisions.some(revision => revision.status === 'rejected')
  const unresolvedChanges = council.revisions.some(revision => revision.unresolvedChanges.length > 0)
  const expectedFinal = last.synthesis.status === 'blocked' ? 'blocked'
    : last.synthesis.status === 'ready' && !revisionFailedClosed && !unresolvedChanges ? 'ready'
      : 'human_review'
  if (council.final.status !== expectedFinal) {
    fail('MICROAPP_AGENTIC_INVALID', microappId, 'el estado final contradice la última ronda o sus revisiones')
  }
}

export function validateMicroappResultEnvelope(microappId: string, value: unknown): MicroappResult {
  if (!value || typeof value !== 'object') fail('MICROAPP_RESULT_INVALID', microappId, 'run debe devolver un objeto')
  const result = value as MicroappResult
  if (!Array.isArray(result.evidence) || result.evidence.length === 0) {
    fail('MICROAPP_EVIDENCE_INVALID', microappId, 'run debe devolver al menos una evidencia trazable')
  }
  if (result.evidence.length > 250) fail('MICROAPP_EVIDENCE_INVALID', microappId, 'run devolvió más de 250 evidencias')
  result.evidence.forEach((item, index) => validateEvidence(microappId, item, index))
  const evidenceKeys = result.evidence.map(item => `${item.claim.trim()}|${item.sourceUrl ?? ''}|${item.sourceRef?.kind ?? ''}:${item.sourceRef?.id ?? ''}`)
  if (new Set(evidenceKeys).size !== evidenceKeys.length) fail('MICROAPP_EVIDENCE_INVALID', microappId, 'evidence contiene entradas duplicadas')

  if (result.assets !== undefined) {
    if (!Array.isArray(result.assets) || result.assets.some(assetId => typeof assetId !== 'string' || !assetId.trim())) {
      fail('MICROAPP_ASSETS_INVALID', microappId, 'assets debe contener identificadores no vacíos')
    }
    if (new Set(result.assets).size !== result.assets.length) {
      fail('MICROAPP_ASSETS_INVALID', microappId, 'assets contiene identificadores duplicados')
    }
    if (result.assets.length > 100 || result.assets.some(assetId => assetId.length > 512)) {
      fail('MICROAPP_ASSETS_INVALID', microappId, 'assets supera el límite operativo')
    }
  }

  if (result.suggestedActions !== undefined) {
    if (!Array.isArray(result.suggestedActions)) fail('MICROAPP_ACTION_INVALID', microappId, 'suggestedActions debe ser una lista')
    if (result.suggestedActions.length > 50) fail('MICROAPP_ACTION_INVALID', microappId, 'suggestedActions supera el límite operativo')
    result.suggestedActions.forEach((action, index) => validateAction(microappId, action, index))
    const keys = result.suggestedActions.map(action => `${action.kind}:${action.label}`)
    if (new Set(keys).size !== keys.length) fail('MICROAPP_ACTION_INVALID', microappId, 'suggestedActions contiene acciones duplicadas')
  }
  validateAgenticResult(microappId, result)
  return result
}
