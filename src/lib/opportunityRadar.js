export const RADAR_TYPES = [
  { id: 'clients', label: 'Clientes', lens: 'demand_growth', placeholder: 'Peluquerías, restaurantes, clínicas…' },
  { id: 'properties', label: 'Inmuebles', lens: 'demand_growth', placeholder: 'Pisos en venta de particulares…' },
  { id: 'suppliers', label: 'Proveedores', lens: 'costs_suppliers', placeholder: 'Distribuidores de productos, materiales…' },
  { id: 'influencers', label: 'Influencers', lens: 'partnerships', placeholder: 'Creadores de belleza, moda, gastronomía…' },
  { id: 'partners', label: 'Socios', lens: 'partnerships', placeholder: 'Agencias, distribuidores, colaboradores…' },
]
export const radarType = kind => RADAR_TYPES.find(type => type.id === kind)
export const radarObjectives = radar => radar.objectives || [{ kind: radar.kind, target: radar.target, criteria: radar.criteria || '' }]
export function withRadarObjectives(radar, objectives) {
  const first = objectives[0] || { kind: 'clients', target: '', criteria: '' }
  return { ...radar, kind: first.kind, target: first.target, criteria: first.criteria, objectives }
}
export const radarSummary = radar => radarObjectives(radar).map(item => radarType(item.kind)?.label).join(' + ')
export const radarHasBusinessInfo = (context, draft) => Boolean(context?.intelligenceReadiness?.canResearch || draft.companyKnowledge?.sourceIds?.length || draft.companyKnowledge?.services?.some(service => service.name.trim()) || draft.companyKnowledge?.notes?.trim().length >= 10)
export function safeRadarUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
}
export function radarRows(runs) {
  const seen = new Set()
  return runs.flatMap(run => {
    const data = run.result?.data
    if (!Array.isArray(data?.candidates) || !run.input?.radar) return []
    const sources = new Set((data.sources || []).map(source => source.url))
    return data.candidates.flatMap(item => {
      const url = safeRadarUrl(item.sourceUrl)
      const key = `${item.kind}|${url}|${item.name?.toLowerCase()}`
      if (!url || !sources.has(item.sourceUrl) || !item.name || !radarType(item.kind) || seen.has(key)) return []
      seen.add(key)
      return [{ ...item, sourceUrl: url, key, runId: run.id, detectedAt: item.detectedAt || run.createdAt, stale: !!run.staleAt && Date.parse(run.staleAt) <= Date.now() }]
    })
  })
}
const cell = value => `"${String(value ?? '').replace(/^[\s]*[=+@-]/, match => `'${match}`).replace(/"/g, '""')}"`
export function radarCsv(rows) {
  return '\uFEFF' + [
    ['Oportunidad', 'Tipo', 'Ubicación', 'Posible encaje', 'Detalle publicado', 'Fuente', 'Detectada', 'Estado'],
    ...rows.map(row => [row.name, radarType(row.kind)?.label, row.location, row.rationale, row.detail, row.sourceUrl, row.detectedAt, 'Por validar']),
  ].map(values => values.map(cell).join(';')).join('\r\n')
}
