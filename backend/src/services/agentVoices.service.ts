export class VoiceCatalogError extends Error {
  constructor(message: string, public readonly statusCode: number) { super(message) }
}

// Return only public, playable models; never expose account-owned private models.
export function publicVoice(model: any) {
  if (model?.visibility !== 'public' || model.type !== 'tts' || model.state !== 'trained' || model.dmca_taken_down || typeof model._id !== 'string') return null
  const sample = Array.isArray(model.samples) ? model.samples.find((item: any) => {
    try { const url = new URL(item.audio); return url.protocol === 'https:' && url.hostname === 'platform.r2.fish.audio' } catch { return false }
  }) : null
  return {
    id: model._id, name: String(model.title || 'Voz sin nombre'),
    languages: Array.isArray(model.languages) ? model.languages.filter((item: unknown) => typeof item === 'string') : [],
    tags: Array.isArray(model.tags) ? model.tags.filter((item: unknown) => typeof item === 'string').slice(0, 12) : [],
    author: String(model.author?.nickname || 'Comunidad'), licensed: model.licensed === true,
    previewUrl: sample?.audio || null,
  }
}

export async function listAgentVoices(query: { language?: string; search?: string; page: number }) {
  const key = process.env.FISH_API_KEY?.trim()
  if (!key) throw new VoiceCatalogError('El catálogo de voces aún no está conectado. Revisa la conexión con Fish Audio en el servidor.', 503)
  const params = new URLSearchParams({ page_size: '12', page_number: String(query.page), sort_by: 'score' })
  if (query.language) params.set('language', query.language)
  if (query.search) params.set('title', query.search)
  try {
    const response = await fetch(`https://api.fish.audio/model?${params}`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new VoiceCatalogError('No se pudo cargar el catálogo de voces. Inténtalo de nuevo en unos momentos.', 502)
    const body = await response.json() as { items?: unknown[]; has_more?: boolean }
    if (!Array.isArray(body.items)) throw new VoiceCatalogError('El catálogo devolvió una respuesta incompleta. Inténtalo de nuevo.', 502)
    return { voices: body.items.map(publicVoice).filter(Boolean), hasMore: body.has_more === true }
  } catch (error) {
    if (error instanceof VoiceCatalogError) throw error
    throw new VoiceCatalogError('No se pudo conectar con el catálogo de voces. Vuelve a intentarlo.', 502)
  }
}
