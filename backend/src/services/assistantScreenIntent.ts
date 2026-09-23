// Only direct, unambiguous navigation requests use this local path. All other
// requests go through the model; this does not interpret documents or tool output.
export function assistantWorkflowIntent(message: string) {
  const objective = message.trim()
  const plain = objective.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/^(?:prepara|configura|crea) (?:un |el |mi )?(?:objetivo|flujo|rutina)\b/.test(plain)
    || /^(?:busca|encuentra|buscar|encontrar)\b/.test(plain) && /\b(?:crm|duplicados|seguimientos?|proveedores|oportunidades|influencers)\b/.test(plain)) {
    return { objective: objective.slice(0, 1000) }
  }
  return null
}

export function assistantScreenIntent(message: string, selected?: { type: string; id: string }) {
  const text = message.trim().replace(/[.!]$/, '')
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const section = plain.match(/^(?:abre|abrir|muestra|muestrame|ir a|ve a|llevame a) (?:el |la |los |las )?(crm|calendario|inteligencia|inicio|resumen|llamadas|agentes|documentos|plan|analisis)$/)?.[1]
  const sections: Record<string, string> = { crm: 'crm', calendario: 'calendar', inteligencia: 'intelligence', inicio: 'dashboard', resumen: 'dashboard', llamadas: 'calls', agentes: 'agents', documentos: 'resources', plan: 'plan', analisis: 'insights' }
  if (section) return { name: 'open_section', args: { section: sections[section] } }
  if (/^(?:abre|abrir|prepara|preparar) (?:el |un )?(?:formulario de )?(?:nuevo contacto|contacto nuevo)$/.test(plain)) return { name: 'fill_contact_form', args: {} }
  if (/^(?:abre|muestra|selecciona) (?:este|el) contacto$/.test(plain) && selected?.type === 'lead') return { name: 'open_contact', args: { leadId: selected.id } }
  const contacts = plain.match(/^(?:muestra|muestrame|filtra) (?:los )?contactos(?: (nuevos|contactados|cualificados|convertidos))?$/)
  if (contacts) return { name: 'show_crm', args: contacts[1] ? { status: ({ nuevos: 'new', contactados: 'contacted', cualificados: 'qualified', convertidos: 'converted' } as Record<string, string>)[contacts[1]] } : {} }
  const search = text.match(/^(?:busca|buscar|filtra|muestra) contactos (?:de |por |que contengan )?(.{1,200})$/i)
  if (search) return { name: 'show_crm', args: { search: search[1].trim() } }
  if (/^(?:muestra|muestrame|abre) (?:mis |las )?tareas pendientes$/.test(plain)) return { name: 'show_calendar', args: { type: 'task', status: 'pending' } }
  const radar = text.match(/^(?:abre|abrir|configura|configurar) (?:el |mi )?radar(?: en (.{2,200}))?$/i)
  if (radar) return { name: 'open_radar', args: radar[1] ? { location: radar[1] } : {} }
  return null
}
