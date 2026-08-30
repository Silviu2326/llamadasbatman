import { VISION_MICROAPPS } from './visionCatalog'

export type CatalogEdition = 'vision-66' | 'platform-core'

const visionMetadata = new Map<string, { number: number; collection: string; catalogEdition: 'vision-66' }>(VISION_MICROAPPS.map(item => [item.id, {
  number: item.number,
  collection: item.number <= 29 ? 'growth-sales' : item.number <= 48 ? 'ads-content' : 'studio-ops',
  catalogEdition: 'vision-66' as const,
}]))

// Las 21 recetas que preceden a los dos catálogos editoriales también son
// producto mantenido. Enumerarlas evita que una microapp accidental o de test
// se publique bajo una colección de confianza por simple fallback.
const PLATFORM_CORE_IDS = new Set<string>([
  'ad-factory',
  'audiovisual-qc-inspector',
  'authorized-presenter',
  'call-prep',
  'character-continuity-guardian',
  'cinema-concepts',
  'company-research-360',
  'content-multiplier',
  'contextual-broll-generator',
  'magnific-enhancer',
  'model-picker',
  'podcast-guest-research',
  'product-continuity-guardian',
  'prospect-diagnosis',
  'provider-benchmark',
  'soundtrack-sfx-designer',
  'storyboard-shotlist',
  'trailers-cutdowns',
  'virtual-camera-director',
  'visual-localization-dubbing',
  'voice-of-customer',
])

export function previousCatalogMetadata(id: string): { number: number | null; collection: string; catalogEdition: CatalogEdition } | null {
  const vision = visionMetadata.get(id)
  if (vision) return vision
  if (PLATFORM_CORE_IDS.has(id)) return { number: null, collection: 'platform-core', catalogEdition: 'platform-core' }
  return null
}
