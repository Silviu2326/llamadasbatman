// Registro en memoria de microapps. Código compilado, no BD: cada microapp
// entra por PR con su manifiesto revisable. El marketplace (fase 3) moverá
// esto a manifiestos firmados en BD; hasta entonces la disciplina es esta.
import type { FollowUpAction, FollowUpKind, MicroappManifest, MicroappSurface } from './types'
import { hasPermission, isPermission } from '../access-control'

const microapps = new Map<string, MicroappManifest>()

export const MICROAPP_SURFACES: readonly MicroappSurface[] = [
  'lead', 'account', 'call', 'opportunity', 'conversation', 'meeting', 'campaign',
  'landing', 'asset', 'production', 'flow', 'client',
]

export const FOLLOW_UP_KINDS: readonly FollowUpKind[] = [
  'navigate', 'run_microapp', 'create_task', 'create_note', 'create_meeting',
  'send_email_draft', 'update_lead_field', 'update_stage', 'create_opportunity',
  'create_document', 'create_lead', 'create_asset', 'create_campaign_draft', 'request_approval', 'queue_call',
]

const LEGACY_FOLLOW_UP_MAP: Record<string, FollowUpKind> = {
  create_tasks: 'create_task', create_task: 'create_task',
  update_crm: 'update_lead_field', update_lead: 'update_lead_field',
  schedule_followup: 'create_meeting', schedule_meeting: 'create_meeting',
  send_email: 'send_email_draft', draft_email: 'send_email_draft',
  move_stage: 'update_stage', create_opportunity: 'create_opportunity',
  create_lead: 'create_lead',
  request_approval: 'request_approval', queue_call: 'queue_call',
  run_microapp: 'run_microapp', navigate: 'navigate',
}

export function isFollowUpKind(value: unknown): value is FollowUpKind {
  return typeof value === 'string' && FOLLOW_UP_KINDS.includes(value as FollowUpKind)
}

export function normalizeFollowUpAction(action: FollowUpAction): FollowUpAction {
  if (isFollowUpKind(action.kind)) return action
  const mapped = LEGACY_FOLLOW_UP_MAP[action.kind]
  if (mapped) return { ...action, kind: mapped }
  return {
    ...action,
    kind: 'navigate',
    params: { ...(action.params ?? {}), legacyKind: action.kind, route: action.params?.route ?? '/microapps' },
  }
}

function validateManifest(manifest: MicroappManifest): MicroappManifest {
  if (!manifest.id?.trim()) throw new Error('Una microapp necesita id')
  for (const permission of manifest.dataAccess) {
    if (!isPermission(permission)) throw new Error(`Permiso dataAccess desconocido en ${manifest.id}: ${permission}`)
  }
  if (manifest.placements) {
    for (const placement of manifest.placements) {
      if (!MICROAPP_SURFACES.includes(placement.surface)) throw new Error(`Surface inválida en ${manifest.id}: ${placement.surface}`)
      if (!placement.actionLabel.trim()) throw new Error(`placement sin actionLabel en ${manifest.id}`)
      // Org-wide recipes may be surfaced without an entity widget. All entity-bound
      // placements must have a single source of truth in uiSchema. Some recipes
      // bind a collection (for example leadIds) rather than one entity widget.
      const orgWide = manifest.id === 'voice-of-customer'
      const entityField = manifest.uiSchema.some(field => (
        field.widget === placement.surface
        || field.key === placement.surface
        || field.key === `${placement.surface}Id`
        || field.key === `${placement.surface}Ids`
      ))
      if (!orgWide && !entityField) {
        throw new Error(`placement ${placement.surface} de ${manifest.id} no tiene widget de entidad en uiSchema`)
      }
    }
  }
  return { ...manifest, followUps: manifest.followUps.map(normalizeFollowUpAction) }
}

export function registerMicroapp(manifest: MicroappManifest): void {
  if (microapps.has(manifest.id)) {
    throw new Error(`Microapp duplicada en el registro: ${manifest.id}`)
  }
  microapps.set(manifest.id, validateManifest(manifest))
}

export function getMicroapp(id: string): MicroappManifest | undefined {
  return microapps.get(id)
}

export function listMicroapps(): MicroappManifest[] {
  return [...microapps.values()].filter(manifest => manifest.visibility !== 'internal')
}

export function recommendMicroapps(params: { surface: MicroappSurface; role: unknown; hasProjection?: boolean }): MicroappManifest[] {
  return listMicroapps()
    .filter(manifest => manifest.placements?.some(placement => placement.surface === params.surface))
    .filter(manifest => manifest.dataAccess.every(permission => hasPermission(params.role, permission)))
    .sort((a, b) => {
      const aRole = a.placements?.find(item => item.surface === params.surface)?.role === 'primary' ? 0 : 1
      const bRole = b.placements?.find(item => item.surface === params.surface)?.role === 'primary' ? 0 : 1
      const aFresh = params.hasProjection && a.resultProjection ? 1 : 0
      const bFresh = params.hasProjection && b.resultProjection ? 1 : 0
      return (aRole - bRole) || (aFresh - bFresh) || a.name.localeCompare(b.name)
    })
}

// Solo para tests.
export function unregisterMicroappForTests(id: string): void {
  microapps.delete(id)
}
