// es y en deben tener exactamente las mismas claves (recorrido recursivo):
// una clave que solo existe en un idioma cae al español en silencio.
// Sin framework: node --test src/i18n/messages/captacion.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import messages from './captacion.js'

function flatten(value, prefix = '', out = []) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object') flatten(child, path, out)
    else {
      assert.equal(typeof child, 'string', `${path} debe ser una cadena`)
      assert.ok(child.trim(), `${path} no puede estar vacía`)
      out.push(path)
    }
  }
  return out
}

test('es y en tienen exactamente las mismas claves', () => {
  const es = flatten(messages.es).sort()
  const en = flatten(messages.en).sort()
  assert.deepEqual(en, es)
  assert.ok(es.length > 100)
})

test('las claves viven en los espacios de Captación', () => {
  assert.deepEqual(Object.keys(messages.es).sort(), ['campaignDetail', 'campaigns', 'captacion', 'funnels'])
})

test('las interpolaciones coinciden entre idiomas', () => {
  const vars = text => (String(text).match(/\{\{\w+\}\}/g) || []).sort()
  const walk = (es, en, path = '') => {
    for (const key of Object.keys(es)) {
      if (es[key] && typeof es[key] === 'object') walk(es[key], en[key], `${path}${key}.`)
      else assert.deepEqual(vars(en[key]), vars(es[key]), `${path}${key}`)
    }
  }
  walk(messages.es, messages.en)
})
