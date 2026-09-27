import { useEffect } from 'react'

function shouldUsePleneva(hostname) {
  return ['app.pleneva.com', 'llamadasbatman.vercel.app', 'localhost', '127.0.0.1'].includes(hostname)
}

export default function AuthGateway({ mode, legacyPage }) {
  const host = window.location.hostname
  const redirect = shouldUsePleneva(host)
  useEffect(() => {
    if (!redirect) return
    const site = host === 'localhost' || host === '127.0.0.1'
      ? `http://${host}:3100`
      : 'https://www.pleneva.com'
    const destination = new URL(mode === 'register' ? '/registro' : '/login', site)
    if (mode === 'register') {
      const plan = new URLSearchParams(window.location.search).get('plan')
      if (plan && ['pro', 'completo', 'agency'].includes(plan)) destination.searchParams.set('plan', plan)
    }
    window.location.replace(destination.toString())
  }, [host, mode, redirect])

  if (!redirect) return legacyPage
  return <main className="login-page" aria-live="polite"><p>Abriendo el acceso de Pleneva…</p></main>
}