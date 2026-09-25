// Réplica del quality gate en el navegador: mismos ids, valores y umbrales que
// backend/src/services/seoQuality.ts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSeoArticleQuality } from './seoQuality.js'

test('evaluateSeoArticleQuality devuelve los siete checks con el mismo contrato que el backend', () => {
  const result = evaluateSeoArticleQuality({
    title: 'Fisioterapia deportiva en Madrid | Clínica Movimiento',
    metaDescription: 'Descubre cómo la fisioterapia deportiva en Madrid puede ayudarte a recuperar movilidad, prevenir lesiones y volver a entrenar con seguridad.',
    h1: 'Fisioterapia deportiva en Madrid',
    outline: ['a', 'b', 'c', 'd'],
    keyword: 'fisioterapia deportiva', audience: 'deportistas', cta: 'pide cita', mode: 'activa',
  })
  assert.equal(result.passed, true)
  assert.deepEqual(result.checks.map(check => check.id), ['title', 'meta', 'keyword', 'h1', 'outline', 'audience', 'cta'])
  const failed = evaluateSeoArticleQuality({ title: 'Corto', keyword: 'x' })
  assert.equal(failed.passed, false)
  assert.equal(failed.checks.find(check => check.id === 'title').value, '5/60')
  assert.equal(failed.checks.find(check => check.id === 'keyword').value, 'pending')
})
