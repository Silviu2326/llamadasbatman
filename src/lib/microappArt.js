// Arte visual del catálogo de microapps. El hero se genera específicamente
// para esta pantalla y las imágenes por categoría mantienen una entrada
// editorial consistente en cada tarjeta. Módulo separado de openPlatform.js
// para que las imágenes solo entren en el chunk de las páginas que pintan arte.
import researchArt from '../assets/microapps/research.png'
import salesArt from '../assets/microapps/sales.png'
import contentArt from '../assets/microapps/content.png'
import studioArt from '../assets/microapps/studio.png'
import dataArt from '../assets/microapps/data.png'
import successArt from '../assets/microapps/success.png'
import catalogHero from '../assets/microapps/catalog-hero-v2.png'
import packRevenueAgency from '../assets/microapps/pack-revenue-agency.png'
import packIntelligenceGrowth from '../assets/microapps/pack-intelligence-growth.png'
import packGrowthSales from '../assets/microapps/pack-growth-sales.png'
import packAdsContent from '../assets/microapps/pack-ads-content.png'
import packMediaAiops from '../assets/microapps/pack-media-aiops.png'
import packStudioOps from '../assets/microapps/pack-studio-ops.png'
import packPlatformCore from '../assets/microapps/pack-platform-core.png'
import jobsHero from '../assets/microapps/jobs-hero.png'
import assetsHero from '../assets/microapps/assets-hero.png'
import marketplaceHero from '../assets/microapps/marketplace-hero.png'
import capabilitiesHero from '../assets/microapps/capabilities-hero.png'

export const MICROAPP_CATEGORY_ART = {
  research: researchArt,
  sales: salesArt,
  content: contentArt,
  studio: studioArt,
  data: dataArt,
  success: successArt,
}

// Portada por pack editorial (claves de MICROAPP_COLLECTION_META); el catálogo
// «existing» reutiliza la portada core para no pagar una imagen sin identidad.
export const MICROAPP_COLLECTION_ART = {
  'revenue-agency': packRevenueAgency,
  'intelligence-growth': packIntelligenceGrowth,
  'growth-sales': packGrowthSales,
  'ads-content': packAdsContent,
  'media-aiops': packMediaAiops,
  'studio-ops': packStudioOps,
  'platform-core': packPlatformCore,
  existing: packPlatformCore,
}

export const MICROAPPS_CATALOG_HERO = catalogHero
export const JOBS_CENTER_HERO = jobsHero
export const ASSETS_LIBRARY_HERO = assetsHero
export const MARKETPLACE_HERO = marketplaceHero
export const CAPABILITIES_HUB_HERO = capabilitiesHero
// El Studio de Cine reutiliza el arte de la categoría: es el mismo motivo de
// tira de fotogramas y evita pagar una generación nueva para una sola cabecera.
export const STUDIO_HERO = studioArt

export function microappCategoryArt(category) {
  return MICROAPP_CATEGORY_ART[category] || successArt
}

export function microappCollectionArt(collection) {
  return MICROAPP_COLLECTION_ART[collection] || packPlatformCore
}
