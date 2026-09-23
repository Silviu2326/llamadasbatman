const SECTIONS = { dashboard: '/dashboard', crm: '/ventas', calendar: '/calendario', intelligence: '/inteligencia', calls: '/llamadas', agents: '/agentes', resources: '/recursos-ia', plan: '/plan', insights: '/insights' }
const OPERATIONS = {
  show_crm: { section: 'crm', screen: 'crm', keys: ['search', 'status'] },
  open_contact: { section: 'crm', screen: 'crm', keys: ['leadId'] },
  fill_contact_form: { section: 'crm', screen: 'crm', keys: ['name', 'email', 'phone', 'company'] },
  show_calendar: { section: 'calendar', screen: 'calendar', keys: ['search', 'type', 'status'] },
  open_radar: { section: 'intelligence', screen: 'radar', keys: ['name', 'location'] },
}
let active = null, route = '', workspace = ''
export function setAssistantRoute(value, actorKey) {
  route = value
  if (workspace !== actorKey) { workspace = actorKey; active = null }
}
export function registerAssistantScreen(screen, getContext, run) {
  const entry = { screen, getContext, run, workspace }; active = entry
  return () => { if (active === entry) active = null }
}
export function assistantScreenContext() {
  const info = active?.workspace === workspace ? active.getContext() : null
  return { route, ...(info?.selected ? { selected: info.selected } : {}), ...(info?.filters ? { filters: info.filters } : {}) }
}
export function screenCommandTarget(command, availableModules) {
  if (!command || typeof command !== 'object' || !command.args || typeof command.args !== 'object' || Array.isArray(command.args)) throw new Error('Operación de pantalla inválida.')
  const { name, args } = command
  const operation = name === 'open_section' ? { section: args.section, keys: ['section'] } : OPERATIONS[name]
  if (!operation || !Object.hasOwn(SECTIONS, operation.section)) throw new Error('Esta operación de pantalla no está conectada.')
  if (Object.keys(args).some(key => !operation.keys.includes(key)) || Object.values(args).some(value => typeof value !== 'string' || value.length > 254)) throw new Error('Los datos de la operación no son válidos.')
  if (name === 'open_contact' && !/^[a-zA-Z0-9_-]{1,128}$/.test(args.leadId || '')) throw new Error('El contacto no es válido.')
  if (name === 'show_crm' && args.status && !['new', 'contacted', 'qualified', 'unqualified', 'converted'].includes(args.status)) throw new Error('Estado de contacto inválido.')
  if (name === 'show_calendar' && ((args.status && !['all', 'pending', 'completed', 'cancelled'].includes(args.status)) || (args.type && !['all', 'meeting', 'task'].includes(args.type)))) throw new Error('Filtro de calendario inválido.')
  if (!availableModules.some(module => module.id === operation.section)) throw new Error('Esta sección no está disponible con tus permisos actuales.')
  return { ...operation, path: SECTIONS[operation.section] }
}
async function waitFor(check, signal) {
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    const value = check(); if (value) return value
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  throw new Error('La pantalla no ha confirmado la operación. Comprueba su estado antes de repetirla.')
}
export async function performAssistantScreenCommand(command, { navigate, availableModules, onStart, signal }) {
  const target = screenCommandTarget(command, availableModules), actor = workspace
  if (active?.workspace === actor && active.getContext().form) throw new Error('Hay un formulario abierto. Guarda o cierra sus cambios antes de cambiar de pantalla.')
  onStart?.(); navigate(target.path)
  await waitFor(() => { if (workspace !== actor) throw new Error('La empresa activa ha cambiado. Repite la petición en la empresa correcta.'); return route === target.path }, signal)
  if (!target.screen) return `Sección abierta: ${availableModules.find(module => module.id === target.section)?.label || target.section}.`
  const entry = await waitFor(() => active?.screen === target.screen && active.workspace === actor ? active : null, signal)
  const outcome = await entry.run(command)
  await waitFor(() => { if (active !== entry || workspace !== actor) throw new Error('La pantalla cambió durante la operación.'); return outcome.verify(entry.getContext()) }, signal)
  return outcome.message
}
export function refreshAssistantScreen() {
  if (active?.workspace === workspace) Promise.resolve(active.run({ name: 'refresh', args: {} })).catch(() => {})
}
