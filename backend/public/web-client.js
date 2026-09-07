/*! Vendrava Web Client v1.1 — capa universal de señales.
 *
 * Qué hace: registra vistas de página, envíos de formulario, clics en teléfono,
 * email, enlaces salientes y elementos marcados con data-vendrava-event, y
 * expone window.VendravaWeb.track(nombre) para eventos propios.
 *
 * Qué NO hace: nunca lee ni envía valores de formularios, cookies, IPs ni
 * identificadores de persona. El siteKey es público y solo asocia señales al
 * dominio que lo instaló; el servidor descarta eventos de otros orígenes.
 *
 * Instalación: <script defer src=".../web-client.js"
 *   data-vendrava-site="wk_..." data-vendrava-endpoint="https://.../api/web-events/collect"></script>
 */
(function () {
  'use strict'
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.VendravaWeb && window.VendravaWeb.__loaded) return

  var script = document.currentScript || (function () {
    var all = document.getElementsByTagName('script')
    for (var i = all.length - 1; i >= 0; i -= 1) {
      if (all[i].getAttribute('data-vendrava-site')) return all[i]
    }
    return null
  })()
  var siteKey = script && script.getAttribute('data-vendrava-site')
  var endpoint = script && script.getAttribute('data-vendrava-endpoint')
  if (!siteKey || !endpoint) return

  var EVENT_RE = /^[a-z0-9_.-]{1,80}$/
  var debug = script.getAttribute('data-vendrava-debug') === 'true'
  var lastPath = null
  var lastPageViewAt = 0

  function log() {
    if (debug && window.console && console.debug) console.debug.apply(console, ['[vendrava]'].concat([].slice.call(arguments)))
  }

  function currentPath() {
    return (window.location.pathname || '/').slice(0, 1000)
  }

  function buildUrl(eventName) {
    var url = endpoint + (endpoint.indexOf('?') === -1 ? '?' : '&')
    url += 'siteKey=' + encodeURIComponent(siteKey)
    url += '&event=' + encodeURIComponent(eventName)
    url += '&path=' + encodeURIComponent(currentPath())
    if (document.referrer) url += '&referrer=' + encodeURIComponent(document.referrer.slice(0, 1000))
    return url
  }

  function send(eventName) {
    var name = String(eventName || '').toLowerCase().trim()
    if (!EVENT_RE.test(name)) { log('evento descartado', eventName); return false }
    var url = buildUrl(name)
    try {
      // Image GET: funciona sin CORS y sobrevive a la descarga de la página
      // mejor que fetch sin keepalive. sendBeacon obliga a POST y el endpoint
      // es GET a propósito (sin cuerpo = sin sitio donde colar datos).
      var beacon = new Image(1, 1)
      beacon.src = url
    } catch (error) {
      log('no se pudo enviar', error)
      return false
    }
    log('enviado', name)
    return true
  }

  function pageView() {
    var path = currentPath()
    var now = Date.now()
    // Evita duplicados cuando pushState + popstate disparan seguidos.
    if (path === lastPath && now - lastPageViewAt < 500) return
    lastPath = path
    lastPageViewAt = now
    send('page_view')
  }

  function closestAnchor(node) {
    while (node && node !== document) {
      if (node.tagName === 'A' && node.getAttribute('href')) return node
      node = node.parentNode
    }
    return null
  }

  function closestTracked(node) {
    while (node && node !== document) {
      if (node.getAttribute && node.getAttribute('data-vendrava-event')) return node
      node = node.parentNode
    }
    return null
  }

  document.addEventListener('submit', function (event) {
    var form = event.target
    if (!form || form.tagName !== 'FORM') return
    var custom = form.getAttribute('data-vendrava-event')
    send(custom || 'form_submit')
  }, true)

  document.addEventListener('click', function (event) {
    var tracked = closestTracked(event.target)
    if (tracked) send(tracked.getAttribute('data-vendrava-event'))
    var anchor = closestAnchor(event.target)
    if (!anchor) return
    var href = anchor.getAttribute('href') || ''
    if (/^tel:/i.test(href)) send('click_phone')
    else if (/^mailto:/i.test(href)) send('click_email')
    else if (/^https?:\/\//i.test(href)) {
      try {
        if (new URL(href, window.location.href).host !== window.location.host) send('click_outbound')
      } catch (error) { /* href inválido: nada que registrar */ }
    }
  }, true)

  // Navegación SPA: pushState/replaceState no disparan load.
  function wrapHistory(method) {
    var original = window.history[method]
    if (typeof original !== 'function') return
    window.history[method] = function () {
      var result = original.apply(this, arguments)
      window.setTimeout(pageView, 0)
      return result
    }
  }
  wrapHistory('pushState')
  wrapHistory('replaceState')
  window.addEventListener('popstate', function () { window.setTimeout(pageView, 0) })

  window.VendravaWeb = {
    __loaded: true,
    siteKey: siteKey,
    track: function (eventName) { return send(eventName) },
    pageView: pageView,
  }

  // Permite encolar llamadas antes de que cargue el script:
  // window.vendravaq = [['track','cta_click']]
  var queue = window.vendravaq
  if (queue && queue.length) {
    for (var i = 0; i < queue.length; i += 1) {
      var entry = queue[i]
      if (entry && entry[0] === 'track') send(entry[1])
    }
  }
  window.vendravaq = { push: function (entry) { if (entry && entry[0] === 'track') send(entry[1]) } }

  if (document.readyState === 'complete' || document.readyState === 'interactive') pageView()
  else document.addEventListener('DOMContentLoaded', pageView)
})()
