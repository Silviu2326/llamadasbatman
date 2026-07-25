import { FastifyRequest } from 'fastify'

export type AppLocale = 'es' | 'en'

export function getRequestLocale(request: FastifyRequest): AppLocale {
  const header = String(request.headers['accept-language'] || '').toLowerCase()
  return header.split(',').some(value => value.trim().startsWith('en')) ? 'en' : 'es'
}

export function authError(locale: AppLocale, refresh = false) {
  if (refresh) return locale === 'en' ? 'Invalid refresh token' : 'Token de sesión no válido'
  return locale === 'en' ? 'Invalid credentials' : 'Credenciales no válidas'
}
