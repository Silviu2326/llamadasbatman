export type PostizIntegrationDescriptor = {
  id: string
  identifier?: string
  providerIdentifier?: string
  disabled?: boolean
}

export type PostizMedia = { id: string; path: string }

export type PostizDraftInput = {
  platform: string
  content: string
  image?: PostizMedia[]
}

export type PostizDraftPayload = {
  type: 'draft'
  date: string
  shortLink: false
  tags: []
  posts: Array<{
    integration: { id: string }
    value: Array<{ content: string; image: PostizMedia[] }>
    settings: { __type: string }
  }>
}

export function normalizePostizIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return normalized === 'twitter' || normalized === 'twitter_x' ? 'x' : normalized
}

export function resolvePostizIntegration(
  integrations: readonly PostizIntegrationDescriptor[],
  requested: string,
): PostizIntegrationDescriptor | null {
  const direct = integrations.find(item => item.id === requested && item.disabled !== true)
  if (direct) return direct
  const identifier = normalizePostizIdentifier(requested)
  return integrations.find(item => item.disabled !== true && [item.identifier, item.providerIdentifier]
    .filter((value): value is string => typeof value === 'string')
    .some(value => normalizePostizIdentifier(value) === identifier)) ?? null
}

/** Pure, official Postiz Public API draft payload builder. */
export function buildPostizDraftPayload(
  integrations: readonly PostizIntegrationDescriptor[],
  requestedPosts: readonly PostizDraftInput[],
  date = new Date(),
): PostizDraftPayload | null {
  if (!requestedPosts.length || Number.isNaN(date.getTime())) return null
  const posts = requestedPosts.map(item => {
    const integration = resolvePostizIntegration(integrations, item.platform)
    if (!integration?.id) return null
    const provider = integration.identifier || integration.providerIdentifier || normalizePostizIdentifier(item.platform) || 'social'
    return {
      integration: { id: integration.id },
      value: [{ content: item.content.trim(), image: item.image ?? [] }],
      settings: { __type: normalizePostizIdentifier(provider) || 'social' },
    }
  })
  if (posts.some(item => item === null)) return null
  return {
    type: 'draft',
    date: date.toISOString(),
    shortLink: false,
    tags: [],
    posts: posts as PostizDraftPayload['posts'],
  }
}

