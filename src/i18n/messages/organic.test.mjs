// Las claves de es y en de organic.js deben coincidir una a una (recursivo):
// una clave solo en un idioma se vería como la propia clave en el otro.
import test from 'node:test'
import assert from 'node:assert/strict'
import messages from './organic.js'

function flatten(value, prefix = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key))
  }
  return [prefix]
}

test('organic.js: es y en tienen exactamente las mismas claves', () => {
  const es = flatten(messages.es).sort()
  const en = flatten(messages.en).sort()
  assert.ok(es.length > 0, 'no hay claves en es')
  assert.deepEqual(en.filter(key => !es.includes(key)), [], 'claves solo en en')
  assert.deepEqual(es.filter(key => !en.includes(key)), [], 'claves solo en es')
})

test('organic.js: todas las claves cuelgan de organic, prospects o webSeo y ningún valor está vacío', () => {
  for (const locale of ['es', 'en']) {
    assert.deepEqual(Object.keys(messages[locale]).sort(), ['organic', 'prospects', 'webSeo'])
    const walk = (value, path) => {
      if (value && typeof value === 'object') return Object.entries(value).forEach(([key, child]) => walk(child, `${path}.${key}`))
      assert.equal(typeof value, 'string', `${locale}:${path} no es string`)
      assert.ok(value.length > 0, `${locale}:${path} está vacío`)
    }
    walk(messages[locale], locale)
  }
})

test('organic.js: las variables {{x}} de cada mensaje coinciden entre idiomas', () => {
  const vars = text => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort()
  const collect = (value, prefix, out) => {
    if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => collect(child, `${prefix}.${key}`, out))
    else out.set(prefix, vars(value))
    return out
  }
  const es = collect(messages.es, '', new Map())
  const en = collect(messages.en, '', new Map())
  for (const [key, list] of es) assert.deepEqual(en.get(key), list, `variables distintas en ${key}`)
})
