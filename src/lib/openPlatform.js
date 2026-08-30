// Presentación compartida por el catálogo y el runner. Mantenerla fuera de
// una página evita que el runner cargue el módulo completo del catálogo solo
// para reutilizar dos constantes.
export const MICROAPP_CATEGORY_META = {
  research: { label: 'Investigar', color: 'var(--cyan)' },
  sales: { label: 'Vender', color: 'var(--success)' },
  content: { label: 'Crear contenido', color: 'var(--pink)' },
  studio: { label: 'Producir vídeo', color: 'var(--violet)' },
  data: { label: 'Datos', color: 'var(--warn)' },
  success: { label: 'Clientes', color: 'var(--accent)' },
}

export const MICROAPP_COLLECTION_META = {
  'revenue-agency': { label: 'Revenue & Agency', shortLabel: 'Revenue', color: 'var(--success)' },
  'intelligence-growth': { label: 'Intelligence & Growth', shortLabel: 'Growth', color: 'var(--cyan)' },
  'media-aiops': { label: 'Media & AI Operations', shortLabel: 'Media + Ops', color: 'var(--violet)' },
  'growth-sales': { label: 'Growth & Sales', shortLabel: 'Ventas', color: 'var(--success)' },
  'ads-content': { label: 'Ads & Content', shortLabel: 'Ads + Contenido', color: 'var(--pink)' },
  'studio-ops': { label: 'Studio & Operations', shortLabel: 'Studio + Ops', color: 'var(--violet)' },
  'platform-core': { label: 'Vendrava Core', shortLabel: 'Core', color: 'var(--accent)' },
  existing: { label: 'Catálogo anterior', shortLabel: 'Anteriores', color: 'var(--muted)' },
}

export function microappCategoryMeta(category) {
  return MICROAPP_CATEGORY_META[category] || { label: category || '—', color: 'var(--muted)' }
}

export function microappCollectionMeta(collection) {
  return MICROAPP_COLLECTION_META[collection] || { label: collection || 'Catálogo', shortLabel: collection || 'Catálogo', color: 'var(--muted)' }
}
