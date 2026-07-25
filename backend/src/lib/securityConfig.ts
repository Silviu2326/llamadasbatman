const MIN_SECRET_LENGTH = 32

const INSECURE_SECRET_VALUES = new Set([
  'changeme_secret',
  'change_me_secret',
  'change_me_refresh',
  'change_me_voice_secret',
  'secret',
  'password',
])

export function isProduction() {
  return process.env.NODE_ENV === 'production'
}

/** Security-critical secrets must be explicit and cannot have known defaults. */
export function requireStrongSecret(name: string): string {
  const value = process.env[name]?.trim()
  if (!value || value.length < MIN_SECRET_LENGTH || INSECURE_SECRET_VALUES.has(value.toLowerCase())) {
    throw new Error(`${name} debe configurarse con un secreto aleatorio de al menos ${MIN_SECRET_LENGTH} caracteres`)
  }
  return value
}

function validatedOrigin(value: string): string {
  const parsed = new URL(value.trim())
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`Origen CORS inválido: ${value}`)
  }
  return parsed.origin
}

/** Explicit browser origin allowlist; wildcards are deliberately unsupported. */
export function getCorsOrigins(): Set<string> {
  const raw = process.env.CORS_ORIGINS?.trim() || process.env.APP_URL?.trim()
  const fallback = isProduction() ? '' : 'http://localhost:5173,http://127.0.0.1:5173'
  const values = (raw || fallback).split(',').map(value => value.trim()).filter(Boolean)
  if (!values.length) throw new Error('CORS_ORIGINS o APP_URL debe configurarse en producción')
  return new Set(values.map(validatedOrigin))
}

export function getAppUrl(): URL {
  const raw = process.env.APP_URL?.trim() || (isProduction() ? '' : 'http://localhost:5173')
  if (!raw) throw new Error('APP_URL debe configurarse en producción')
  return new URL(validatedOrigin(raw))
}

export function getMetaOAuthCallbackUrl(): string {
  const explicit = process.env.META_OAUTH_REDIRECT_URI?.trim()
  if (explicit) {
    const parsed = new URL(explicit)
    if (isProduction() && parsed.protocol !== 'https:') throw new Error('META_OAUTH_REDIRECT_URI debe usar HTTPS en producción')
    if (parsed.pathname !== '/api/meta/accounts/oauth/callback' || parsed.search || parsed.hash) {
      throw new Error('META_OAUTH_REDIRECT_URI debe apuntar exactamente a /api/meta/accounts/oauth/callback')
    }
    return parsed.toString()
  }

  const host = process.env.PUBLIC_HOST?.trim()
  if (!host) {
    if (isProduction()) throw new Error('META_OAUTH_REDIRECT_URI o PUBLIC_HOST debe configurarse para OAuth de Meta')
    return 'http://localhost:3000/api/meta/accounts/oauth/callback'
  }

  const base = new URL(host.includes('://') ? host : `https://${host}`)
  if (isProduction() && base.protocol !== 'https:') throw new Error('PUBLIC_HOST debe usar HTTPS en producción')
  return new URL('/api/meta/accounts/oauth/callback', base).toString()
}
