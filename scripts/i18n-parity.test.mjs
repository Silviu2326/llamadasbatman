import assert from 'node:assert/strict'
import test from 'node:test'
import { SUPPORTED_LOCALES, messages } from '../src/i18n/index.js'

function leafKeys(node, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) leafKeys(value, path, out)
    else out.add(path)
  }
  return out
}

test('los diccionarios de todos los locales tienen las mismas claves hoja', () => {
  const [base, ...rest] = SUPPORTED_LOCALES
  const baseKeys = leafKeys(messages[base])
  for (const locale of rest) {
    const keys = leafKeys(messages[locale])
    assert.deepEqual([...baseKeys].filter(k => !keys.has(k)), [], `claves de ${base} ausentes en ${locale}`)
    assert.deepEqual([...keys].filter(k => !baseKeys.has(k)), [], `claves de ${locale} ausentes en ${base}`)
  }
})

test('ninguna traducción está vacía', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of leafKeys(messages[locale])) {
      const value = key.split('.').reduce((node, part) => node?.[part], messages[locale])
      const texts = Array.isArray(value) ? value : [value]
      for (const text of texts) assert.ok(String(text).trim().length > 0, `${locale}:${key} está vacía`)
    }
  }
})
