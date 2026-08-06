/**
 * Telemetría de la landing pública — docs/vendrava/landings.md §7.
 *
 * Envía comportamiento, nunca contenido: qué campo se tocó y si quedó relleno,
 * jamás lo que se escribió en él. El servidor deduplica por sesión, tipo y
 * campo, así que reenviar un lote tras un fallo de red es inofensivo.
 */

/** Un lote pequeño llega antes de que el usuario cierre la pestaña. */
const BATCH_SIZE = 8
const FLUSH_DELAY_MS = 3000

function postEvents(slug, body, useBeacon) {
  const url = `/api/public/landing/${slug}/events`
  const payload = JSON.stringify(body)

  // `sendBeacon` sobrevive al cierre de la pestaña; `fetch` normal no. Solo se
  // usa al descargar la página porque no informa de errores.
  if (useBeacon && navigator.sendBeacon) {
    try {
      return navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
    } catch {
      // Cae al fetch de abajo.
    }
  }

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // La telemetría nunca puede romper la landing: un lote perdido es un dato
    // menos, no un error para el visitante.
  })
}

export function createLandingTelemetry({ slug, tracking, enabled = true }) {
  if (!enabled || !slug || !tracking?.sessionId) {
    return { track() {}, flush() {}, dispose() {} }
  }

  let queue = []
  let timer = null
  let disposed = false

  function flush(useBeacon = false) {
    if (timer) {
      window.clearTimeout(timer)
      timer = null
    }
    if (!queue.length) return
    const events = queue
    queue = []
    postEvents(slug, { ...tracking, events }, useBeacon)
  }

  function track(type, payload = {}) {
    if (disposed) return
    queue.push({ type, occurredAt: new Date().toISOString(), ...payload })
    if (queue.length >= BATCH_SIZE) {
      flush()
      return
    }
    if (!timer) timer = window.setTimeout(() => flush(), FLUSH_DELAY_MS)
  }

  // `visibilitychange` es el evento fiable en móvil: `beforeunload` no dispara
  // cuando el sistema descarta la pestaña en segundo plano.
  function handleHide() {
    if (document.visibilityState === 'hidden') flush(true)
  }

  document.addEventListener('visibilitychange', handleHide)
  window.addEventListener('pagehide', handleHide)

  return {
    track,
    flush,
    dispose() {
      if (disposed) return
      disposed = true
      document.removeEventListener('visibilitychange', handleHide)
      window.removeEventListener('pagehide', handleHide)
      flush(true)
    },
  }
}

/**
 * Marcas de scroll de §7.1. Devuelve una función de limpieza.
 *
 * Se mide sobre el alto desplazable real: en una landing corta que cabe entera
 * en pantalla no hay scroll posible, y contarla como "nadie pasa del hero"
 * culparía al contenido de una limitación de la medición.
 */
export function observeScrollDepth(onDepth) {
  const reached = new Set()

  function check() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight
    if (scrollable <= 0) return
    const depth = ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100
    for (const mark of [50, 90]) {
      if (depth >= mark && !reached.has(mark)) {
        reached.add(mark)
        onDepth(mark)
      }
    }
  }

  window.addEventListener('scroll', check, { passive: true })
  check()
  return () => window.removeEventListener('scroll', check)
}
