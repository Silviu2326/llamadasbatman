/* Vendrava Web Client — capa universal mínima.
 * No lee ni envía valores de formularios. El siteKey es público y solo sirve
 * para asociar señales operativas al dominio que lo instaló. */
(() => {
  const script = document.currentScript
  const siteKey = script?.dataset?.vendravaSite
  const endpoint = script?.dataset?.vendravaEndpoint
  if (!siteKey || !endpoint) return

  const send = (event, extras = {}) => {
    const url = new URL(endpoint)
    url.searchParams.set('siteKey', siteKey)
    url.searchParams.set('event', event)
    url.searchParams.set('path', window.location.pathname.slice(0, 1000))
    if (document.referrer) url.searchParams.set('referrer', document.referrer.slice(0, 1000))
    // Los extras están reservados para señales no sensibles; se ignoran por
    // ahora para evitar que una integración envíe accidentalmente PII.
    void extras
    const beacon = new Image()
    beacon.src = url.toString()
  }

  window.VendravaWeb = window.VendravaWeb || {}
  window.VendravaWeb.track = send
  send('page_view')
  document.addEventListener('submit', event => {
    if (event.target instanceof HTMLFormElement) send('form_submit')
  }, { capture: true, passive: true })
})()
