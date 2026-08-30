import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseAppDomain, widgetHtml, widgetScript } from '../services/whiteLabel.service'

test('normaliseAppDomain acepta hosts reales y descarta lo que no lo es', () => {
  assert.equal(normaliseAppDomain('App.TuAgencia.com'), 'app.tuagencia.com')
  assert.equal(normaliseAppDomain('https://app.tuagencia.com/panel'), 'app.tuagencia.com')
  assert.equal(normaliseAppDomain('app.tuagencia.com:8443'), 'app.tuagencia.com')
  // Sin punto no es un dominio: evita que "localhost" o un typo secuestren
  // la búsqueda por dominio, que es única en toda la base.
  assert.equal(normaliseAppDomain('localhost'), null)
  assert.equal(normaliseAppDomain('-mal.tuagencia.com'), null)
  assert.equal(normaliseAppDomain(''), null)
  assert.equal(normaliseAppDomain(undefined), null)
})

test('el widget apunta al prefijo real de las rutas (/api/white-label/public)', () => {
  const script = widgetScript('https://api.vendrava.app', 'vw_test')
  assert.match(script, /\/api\/white-label\/public\/widget\?key=/)
  const html = widgetHtml('https://api.vendrava.app', 'vw_test', {
    brandName: 'Agencia', logoUrl: null, primaryColor: '#112233', accentColor: '#445566',
    textColor: '#FFFFFF', widgetTitle: 'Hola', welcomeMessage: 'Bienvenido',
  })
  assert.match(html, /\/api\/white-label\/public\/message/)
  assert.ok(!html.includes('/api/public/white-label/'))
})
