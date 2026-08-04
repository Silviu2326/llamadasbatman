/**
 * Prospección de negocios por sector + ciudad vía Google Places API (Text Search).
 * Sustituye a un scraper propio (ScrapMarkt): misma cobertura, sin infraestructura
 * adicional — ver LEAD_GEN_AUDITORIA_SEO.md.
 */

export interface Prospect {
  placeId: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  rating: number | null
  userRatingCount: number | null
  mapsUri: string | null
  photosCount: number | null
  /** Estimación barata de oportunidad (0-100, sin fetch de la web) para ordenar/filtrar antes de auditar. */
  quickScore: number
}

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.photos',
].join(',')

/**
 * Score de oportunidad SIN auditar la web (solo datos de Places): útil para
 * ordenar/filtrar decenas de resultados antes de decidir a quién auditar de
 * verdad. Es deliberadamente más tosco que digitalAudit.leadOpportunityScore.
 */
function computeQuickScore(p: { website: string | null; rating: number | null; userRatingCount: number | null }): number {
  let score = 20
  if (!p.website) score += 40
  if (p.rating == null) score += 20
  else if (p.rating < 4) score += 15
  if (p.userRatingCount == null) score += 20
  else if (p.userRatingCount < 10) score += 15
  else if (p.userRatingCount < 50) score += 5
  return Math.max(0, Math.min(100, score))
}

export class ProspectingUnavailable extends Error {
  constructor(message: string, public readonly code: 'PROSPECTING_NOT_CONFIGURED' | 'PROSPECTING_UNAVAILABLE' = 'PROSPECTING_UNAVAILABLE') {
    super(message)
    this.name = 'ProspectingUnavailable'
  }
}

export async function searchProspects(opts: {
  sector: string
  city: string
  country?: string
  limit?: number
}): Promise<Prospect[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    throw new ProspectingUnavailable(
      'El buscador de negocios no está conectado. Pide a tu administrador que configure Google Places.',
      'PROSPECTING_NOT_CONFIGURED',
    )
  }

  const { sector, city, limit = 20 } = opts
  const res = await fetch(PLACES_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `${sector} en ${city}`, maxResultCount: Math.min(limit, 20) }),
  })

  if (!res.ok) {
    // El detalle del proveedor va al log, no a la pantalla: el cuerpo crudo de
    // Places es jerga interna y hasta ahora se le mostraba tal cual al usuario.
    console.error('[Prospecting] Places API %s: %s', res.status, await res.text().catch(() => ''))
    throw new ProspectingUnavailable('El buscador de negocios no responde ahora mismo. Inténtalo de nuevo en unos minutos.')
  }

  const data = (await res.json()) as { places?: any[] }
  return (data.places ?? []).map((p) => {
    const website = p.websiteUri ?? null
    const rating = p.rating ?? null
    const userRatingCount = p.userRatingCount ?? null
    return {
      placeId: p.id,
      name: p.displayName?.text ?? '—',
      address: p.formattedAddress ?? null,
      phone: p.internationalPhoneNumber ?? null,
      website,
      rating,
      userRatingCount,
      mapsUri: p.googleMapsUri ?? null,
      photosCount: Array.isArray(p.photos) ? p.photos.length : null,
      quickScore: computeQuickScore({ website, rating, userRatingCount }),
    }
  })
}
