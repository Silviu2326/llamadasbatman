import { test } from 'node:test'
import assert from 'node:assert/strict'
import messages from './ads.js'

// es y en deben tener exactamente las mismas claves (recursivo): una clave que
// falte en un idioma se vería como `undefined` en la interfaz.
function flatten(value, prefix = '') {
  if (Array.isArray(value)) return [prefix]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key))
  }
  return [prefix]
}

test('ads.js: es y en comparten la misma estructura de claves', () => {
  const es = flatten(messages.es).sort()
  const en = flatten(messages.en).sort()
  const onlyEs = es.filter(key => !en.includes(key))
  const onlyEn = en.filter(key => !es.includes(key))
  assert.deepEqual(onlyEs, [], `claves solo en es: ${onlyEs.join(', ')}`)
  assert.deepEqual(onlyEn, [], `claves solo en en: ${onlyEn.join(', ')}`)
  assert.ok(es.length > 300)
})

test('ads.js: cada valor es texto no vacío y los placeholders coinciden', () => {
  const walk = (value, path, other) => {
    if (Array.isArray(value)) {
      assert.ok(Array.isArray(other) && other.length === value.length, `${path}: los arrays deben tener la misma longitud`)
      return
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, other?.[key])
      return
    }
    assert.equal(typeof value, 'string', `${path} debe ser texto`)
    assert.ok(value.trim().length > 0, `${path} está vacío`)
    const vars = text => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort()
    assert.deepEqual(vars(value), vars(other), `${path}: los placeholders difieren entre es y en`)
  }
  walk(messages.es, 'es', messages.en)
})

test('ads.js: los tres espacios de nombres existen', () => {
  for (const locale of ['es', 'en']) {
    assert.ok(messages[locale].ads && messages[locale].adsWizard && messages[locale].metaConnect, locale)
  }
})
