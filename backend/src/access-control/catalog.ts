/**
 * Catálogo RBAC estático de Vendrava.
 *
 * Los permisos describen capacidades del servidor, no elementos de UI. El
 * alcance máximo concedido a cada rol se expresa por separado para poder
 * distinguir operaciones sobre datos propios, del equipo o de toda la
 * organización sin confiar en filtros enviados por el navegador.
 */

export const APP_ROLES = [
  'owner',
  'admin',
  'revenue_ops',
  'sales_manager',
  'sales_rep',
  'marketing_growth',
  'analyst',
  'compliance',
  'finance_controller',
  'guest',
] as const

export const LEGACY_ROLES = ['agent', 'viewer'] as const
export const ROLE_KEYS = [...APP_ROLES, ...LEGACY_ROLES] as const

export type AppRole = (typeof APP_ROLES)[number]
export type LegacyRole = (typeof LEGACY_ROLES)[number]
export type KnownRole = (typeof ROLE_KEYS)[number]

export const PERMISSIONS = [
  'dashboard.read',
  'action_center.read',
  'action_center.write',
  'leads.read',
  'leads.write',
  'leads.export',
  'leads.contact',
  'leads.contact.approve',
  'accounts.read',
  'accounts.write',
  'calls.read',
  'calls.write',
  'conversations.read',
  'conversations.write',
  'campaigns.read',
  'campaigns.write',
  'campaigns.publish',
  'campaigns.approve',
  'ads.read',
  'ads.write',
  'social.read',
  'social.write',
  'social.approve',
  'funnels.read',
  'funnels.write',
  'agents.read',
  'agents.manage',
  'playbooks.read',
  'playbooks.write',
  'playbooks.approve',
  'playbooks.manage_global',
  'automations.read',
  'automations.write',
  'automations.publish',
  'knowledge.read',
  'knowledge.write',
  'meetings.read',
  'meetings.write',
  'pipeline.read',
  'pipeline.write',
  'pipeline.reopen',
  'tasks.read',
  'tasks.write',
  'growth.read',
  'growth.write',
  'organic.read',
  'organic.manage',
  'organic.publish',
  'organic.approve',
  'organic.integrations.read',
  'organic.integrations.manage',
  'experiments.read',
  'experiments.write',
  'experiments.start',
  'memory.read',
  'memory.propose',
  'memory.approve',
  'governance.read',
  'governance.write',
  'integrations.read',
  'integrations.manage',
  'organization.read',
  'organization.manage',
  'users.read',
  'users.manage',
  'roles.read',
  'roles.manage',
  'audit.read',
  'costs.read',
  'costs.request',
  'costs.approve',
  'data.export_sensitive',
  'access_control.read',
  'access_control.manage',
  'access_request.create',
  'access_request.create.role_elevation',
  'access_request.create.paid_experiment',
  'access_request.create.playbook_change',
  'access_request.approve.role_elevation',
  'access_request.approve.paid_experiment',
  'access_request.approve.playbook_change',
] as const

export type Permission = (typeof PERMISSIONS)[number]
export type PermissionResource = Permission extends `${infer Resource}.${string}` ? Resource : never
export type PermissionAction = Permission extends `${string}.${infer Action}` ? Action : never
export type PermissionScope = 'own' | 'team' | 'org'

export type PermissionGrant = Readonly<{
  permission: Permission
  /** Alcance máximo. Los servicios siguen obligados a filtrar por orgId. */
  scope: PermissionScope
}>

export type RoleDefinition = Readonly<{
  key: KnownRole
  label: string
  description: string
  legacy?: boolean
}>

export const ROLE_CATALOG: Readonly<Record<KnownRole, RoleDefinition>> = {
  owner: { key: 'owner', label: 'Propietario', description: 'Gobierno, aprobaciones y control último de la organización.' },
  admin: { key: 'admin', label: 'Administrador', description: 'Configuración técnica, usuarios e integraciones sin aprobar su propia elevación.' },
  revenue_ops: { key: 'revenue_ops', label: 'Operaciones de revenue', description: 'Procesos, datos, automatización y experimentación comercial.' },
  sales_manager: { key: 'sales_manager', label: 'Responsable de ventas', description: 'Dirección del equipo comercial, pipeline y aprobaciones de contenido.' },
  sales_rep: { key: 'sales_rep', label: 'Comercial', description: 'Ejecución comercial sobre su cartera y tareas asignadas.' },
  marketing_growth: { key: 'marketing_growth', label: 'Marketing / Growth', description: 'Adquisición, campañas, contenido y experimentación.' },
  analyst: { key: 'analyst', label: 'Analista', description: 'Lectura de métricas agregadas sin mutaciones ni exportaciones sensibles.' },
  compliance: { key: 'compliance', label: 'Cumplimiento', description: 'Consentimiento, auditoría y revisión de cambios regulados.' },
  finance_controller: { key: 'finance_controller', label: 'Control financiero', description: 'Visibilidad de costes y aprobación de gasto sin capacidad de solicitarlo.' },
  guest: { key: 'guest', label: 'Invitado', description: 'Acceso mínimo a un resumen no operativo.' },
  agent: { key: 'agent', label: 'Agente (legacy)', description: 'Compatibilidad temporal con el operador general anterior.', legacy: true },
  viewer: { key: 'viewer', label: 'Lector (legacy)', description: 'Compatibilidad temporal con el lector anterior.', legacy: true },
}

const org = (...permissions: Permission[]): PermissionGrant[] => permissions.map((permission) => ({ permission, scope: 'org' }))
const team = (...permissions: Permission[]): PermissionGrant[] => permissions.map((permission) => ({ permission, scope: 'team' }))
const own = (...permissions: Permission[]): PermissionGrant[] => permissions.map((permission) => ({ permission, scope: 'own' }))

const BUSINESS_READ: Permission[] = [
  'dashboard.read', 'action_center.read', 'leads.read', 'accounts.read', 'calls.read', 'conversations.read',
  'campaigns.read', 'ads.read', 'social.read', 'funnels.read', 'agents.read',
  'playbooks.read', 'automations.read', 'knowledge.read', 'meetings.read',
  'pipeline.read', 'tasks.read', 'growth.read', 'experiments.read', 'memory.read',
]

/**
 * Matriz deliberadamente explícita. Un permiso nuevo queda denegado para todos
 * hasta que se añada a un rol después de revisión.
 */
export const ROLE_GRANTS: Readonly<Record<KnownRole, readonly PermissionGrant[]>> = {
  // El propietario conserva capacidad de emergencia completa. La separación
  // de funciones para este rol se aplica por actor en el workflow persistente:
  // nunca puede aprobar una solicitud creada por él mismo.
  owner: org(...PERMISSIONS),

  admin: org(
    ...BUSINESS_READ,
    'leads.write', 'accounts.write', 'calls.write', 'conversations.write',
    'campaigns.write', 'social.write', 'funnels.write', 'agents.manage',
    'automations.write', 'knowledge.write', 'meetings.write', 'pipeline.write',
    'pipeline.reopen', 'tasks.write', 'growth.write', 'integrations.read',
    'integrations.manage', 'organization.read', 'organization.manage', 'users.read',
    'users.manage', 'roles.read', 'audit.read', 'costs.read', 'access_control.read',
    'organic.read', 'organic.manage', 'organic.publish',
    'organic.integrations.read', 'organic.integrations.manage',
    'playbooks.manage_global',
    'access_request.create', 'access_request.create.role_elevation', 'data.export_sensitive',
  ),

  revenue_ops: org(
    ...BUSINESS_READ,
    'leads.write', 'leads.export', 'accounts.write', 'calls.write',
    'conversations.write', 'campaigns.write', 'campaigns.publish', 'funnels.write',
    'agents.manage', 'playbooks.write', 'automations.write', 'automations.publish',
    'knowledge.write', 'meetings.write', 'pipeline.write', 'pipeline.reopen',
    'tasks.write', 'growth.write', 'experiments.write', 'experiments.start',
    'memory.propose', 'integrations.read', 'organization.read', 'users.read',
    'costs.read', 'costs.request', 'access_control.read', 'access_request.create',
    'organic.read', 'organic.manage', 'organic.publish', 'organic.integrations.read',
    'access_request.create.paid_experiment', 'access_request.create.playbook_change',
    'data.export_sensitive',
  ),

  sales_manager: [
    ...org('dashboard.read', 'action_center.read', 'action_center.write', 'playbooks.read', 'playbooks.approve', 'knowledge.read',
      'pipeline.read', 'experiments.read', 'memory.read', 'memory.approve',
      'organization.read', 'users.read', 'access_control.read',
      'access_request.create', 'access_request.create.paid_experiment',
      'access_request.approve.playbook_change'),
    ...team('leads.read', 'leads.write', 'leads.export', 'leads.contact', 'accounts.read',
      'accounts.write', 'calls.read', 'calls.write', 'conversations.read',
      'conversations.write', 'meetings.read', 'meetings.write', 'pipeline.write',
      'pipeline.reopen', 'tasks.read', 'tasks.write'),
  ],

  sales_rep: own(
    'dashboard.read', 'action_center.read', 'action_center.write', 'leads.read', 'leads.write', 'leads.contact', 'accounts.read',
    'calls.read', 'calls.write', 'conversations.read', 'conversations.write',
    'playbooks.read', 'knowledge.read', 'meetings.read', 'meetings.write',
    'pipeline.read', 'pipeline.write', 'tasks.read', 'tasks.write',
    'access_request.create', 'access_request.create.playbook_change',
  ),

  marketing_growth: org(
    'dashboard.read', 'action_center.read', 'action_center.write', 'leads.read', 'campaigns.read', 'campaigns.write',
    'campaigns.publish', 'ads.read', 'ads.write', 'social.read', 'social.write',
    'funnels.read', 'funnels.write', 'agents.read', 'playbooks.read',
    'playbooks.write', 'automations.read', 'automations.write', 'automations.publish',
    'knowledge.read', 'knowledge.write', 'growth.read', 'growth.write',
    'experiments.read', 'experiments.write', 'experiments.start', 'memory.read',
    'memory.propose', 'integrations.read', 'organization.read', 'costs.read',
    'costs.request', 'access_request.create',
    'organic.read', 'organic.manage', 'organic.publish', 'organic.integrations.read',
    'access_request.create.paid_experiment', 'access_request.create.playbook_change',
  ),

  analyst: org(
    'dashboard.read', 'action_center.read', 'campaigns.read', 'ads.read', 'social.read', 'funnels.read',
    'pipeline.read', 'growth.read', 'experiments.read', 'organization.read',
    'organic.read', 'organic.integrations.read',
  ),

  compliance: org(
    'dashboard.read', 'action_center.read', 'leads.read', 'accounts.read', 'calls.read',
    'conversations.read', 'campaigns.read', 'playbooks.read', 'knowledge.read',
    'memory.read', 'governance.read', 'governance.write',
    'organization.read', 'users.read', 'roles.read', 'audit.read',
    'data.export_sensitive', 'access_control.read',
    'campaigns.approve', 'social.approve', 'leads.contact.approve',
    'organic.read', 'organic.approve', 'organic.integrations.read',
  ),

  finance_controller: org(
    'dashboard.read', 'action_center.read', 'campaigns.read', 'ads.read', 'growth.read', 'experiments.read',
    'organization.read', 'audit.read', 'costs.read', 'costs.approve',
    'organic.read',
    'access_request.approve.paid_experiment',
  ),

  guest: own('dashboard.read'),

  // Legacy: conserva la amplitud operativa anterior, pero nunca hereda
  // aprobaciones de gasto, playbooks o elevación de privilegios.
  agent: org(
    ...BUSINESS_READ,
    'leads.write', 'leads.export', 'leads.contact', 'accounts.write', 'calls.write',
    'conversations.write', 'campaigns.write', 'campaigns.publish', 'ads.write',
    'social.write', 'funnels.write', 'agents.manage', 'playbooks.write',
    'automations.write', 'automations.publish', 'knowledge.write', 'meetings.write',
    'pipeline.write', 'pipeline.reopen', 'tasks.write', 'growth.write',
    'experiments.write', 'experiments.start', 'memory.propose', 'integrations.read',
    'integrations.manage', 'organization.read', 'users.read', 'costs.read',
    'organic.read', 'organic.manage', 'organic.publish', 'organic.integrations.read',
    'organic.integrations.manage',
    'costs.request', 'access_control.read', 'access_request.create',
    'access_request.create.paid_experiment', 'access_request.create.playbook_change',
  ),

  viewer: org(...BUSINESS_READ, 'organization.read', 'organic.read', 'organic.integrations.read'),
}

export const ROLE_PERMISSIONS: Readonly<Record<KnownRole, readonly Permission[]>> = Object.fromEntries(
  ROLE_KEYS.map((role) => [role, Object.freeze(ROLE_GRANTS[role].map(({ permission }) => permission))]),
) as Record<KnownRole, readonly Permission[]>
