import { apiFetch } from '../../lib/api'

const ROOT = '/api/backoffice'

function errorFrom(payload, fallback) {
  return payload?.error?.message || payload?.error || payload?.message || fallback
}

async function send(path, options) {
  const response = await apiFetch(`${ROOT}${path}`, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(errorFrom(payload, 'No pudimos completar la operación.'))
    error.status = response.status
    error.code = payload?.code
    throw error
  }
  return payload
}

function query(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function get(path, params) {
  return send(`${path}${query(params)}`)
}

export function post(path, body) {
  return send(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
}

export function patch(path, body) {
  return send(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) })
}

export const backOffice = {
  overview: () => get('/overview'),
  permissions: () => get('/permissions'),

  organizations: params => get('/organizations', params),
  organization: id => get(`/organizations/${encodeURIComponent(id)}`),
  createOrganization: body => post('/organizations', body),
  updateOrganization: (id, body) => patch(`/organizations/${encodeURIComponent(id)}`, body),
  adjustWallet: (id, body) => post(`/organizations/${encodeURIComponent(id)}/wallet`, body),

  users: params => get('/users', params),
  user: id => get(`/users/${encodeURIComponent(id)}`),
  updateUser: (id, body) => patch(`/users/${encodeURIComponent(id)}`, body),
  resetPassword: (id, body) => post(`/users/${encodeURIComponent(id)}/password-reset`, body),
  revokeUserSessions: (id, body) => post(`/users/${encodeURIComponent(id)}/revoke-sessions`, body),

  addMembership: body => post('/memberships', body),
  setMembershipRole: body => patch('/memberships/role', body),
  setMembershipStatus: body => patch('/memberships/status', body),
  removeMembership: body => post('/memberships/remove', body),

  sessions: params => get('/sessions', params),
  revokeSession: (id, body) => post(`/sessions/${encodeURIComponent(id)}/revoke`, body),
  apiKeys: params => get('/api-keys', params),
  revokeApiKey: (id, body) => post(`/api-keys/${encodeURIComponent(id)}/revoke`, body),

  audit: params => get('/audit', params),

  impersonate: body => post('/impersonate', body),
  stopImpersonation: id => post(`/impersonate/${encodeURIComponent(id)}/stop`),
}

// --- Formato ---------------------------------------------------------------

const numberFormat = new Intl.NumberFormat('es-ES')

export function formatNumber(value) {
  return numberFormat.format(Number(value) || 0)
}

export function formatMoney(cents, currency = 'EUR') {
  const amount = (Number(cents) || 0) / 100
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount)
  } catch {
    // Una organización con una divisa fuera de ISO 4217 no debe romper la tabla.
    return `${numberFormat.format(amount)} ${currency}`
  }
}

export function formatDate(value, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

export function relativeTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  const formatter = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(seconds, 'second')
}

export function sessionState(session) {
  if (session.revokedAt) return { label: 'Revocada', tone: 'muted' }
  if (new Date(session.expiresAt) <= new Date()) return { label: 'Caducada', tone: 'muted' }
  if (session.impersonator) return { label: 'Suplantación', tone: 'warn' }
  return { label: 'Activa', tone: 'ok' }
}
