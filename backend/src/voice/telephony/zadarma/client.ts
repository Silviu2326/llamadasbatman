/** The address comes only from deployment configuration, never a caller. */
export function zadarmaGatewayUrl(value: string): string {
  const url = new URL(value)
  const local = url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)
  if ((!local && url.protocol !== 'https:') || url.username || url.password
    || url.search || url.hash) throw new Error('ZADARMA_GATEWAY_REQUIRES_HTTPS_OR_LOOPBACK')
  return url.href.replace(/\/+$/, '')
}

export function zadarmaGatewayRequest(path: string, init: RequestInit = {}) {
  const token = process.env.ZADARMA_GATEWAY_TOKEN
  if (!token || token.length < 32) throw new Error('ZADARMA_GATEWAY_TOKEN_MISSING')
  const base = zadarmaGatewayUrl(process.env.ZADARMA_GATEWAY_URL ?? 'http://127.0.0.1:9093')
  return fetch(`${base}${path}`, {
    ...init, redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
}
