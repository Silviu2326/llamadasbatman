import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROGRAM_NAME_MIN_LENGTH,
  areaFromType,
  canToggleProgram,
  countByArea,
  errorMessageFrom,
  filterPrograms,
  filtersRevealing,
  normalizePrograms,
  readableType,
  replaceProgram,
  validateProgramName,
} from './growthPrograms.js'

const programs = normalizePrograms({
  programs: [
    { id: '1', name: 'Guía experta', type: 'lead_magnet', status: 'active' },
    { id: '2', name: 'Newsletter mensual', type: 'newsletter', status: 'draft', description: 'Relación con contactos' },
    { id: '3', name: 'Seguimiento', type: 'sales_sequence', status: 'paused' },
    { id: '4', name: 'Viejo', type: 'nps', status: 'archived', archivedAt: '2026-09-01T00:00:00Z' },
  ],
})

test('normalizePrograms acepta varias formas, asigna área y descarta archivados', () => {
  assert.deepEqual(programs.map(program => [program.id, program.area]), [['1', 'acquisition'], ['2', 'newsletter'], ['3', 'sales']])
  assert.equal(normalizePrograms([{ id: 'x', type: 'desconocido' }])[0].area, 'automation')
  assert.equal(normalizePrograms({ data: [{ id: 'y', type: 'nps' }] })[0].area, 'retention')
  assert.deepEqual(normalizePrograms(null), [])
  assert.deepEqual(normalizePrograms({ programs: 'nope' }), [])
  assert.deepEqual(normalizePrograms([null, 3]), [])
})

test('filterPrograms: área y estado "all" muestran todo; búsqueda sin mayúsculas incluye la etiqueta del formato', () => {
  assert.equal(filterPrograms(programs).length, 3)
  assert.deepEqual(filterPrograms(programs, { area: 'newsletter' }).map(p => p.id), ['2'])
  assert.deepEqual(filterPrograms(programs, { status: 'paused' }).map(p => p.id), ['3'])
  assert.deepEqual(filterPrograms(programs, { query: 'RELACIÓN', localeTag: 'es-ES' }).map(p => p.id), ['2'])
  assert.deepEqual(filterPrograms(programs, { query: 'secuencia comercial' }).map(p => p.id), ['3'])
  // Un programa sin estado cuenta como borrador.
  assert.equal(filterPrograms([{ id: 'z', area: 'sales' }], { status: 'draft' }).length, 1)
})

test('filtersRevealing restablece filtros que ocultarían un programa recién creado', () => {
  const created = normalizePrograms([{ id: '5', name: 'NPS', type: 'nps', status: 'draft' }])[0]
  assert.deepEqual(filtersRevealing(created, { area: 'acquisition', status: 'all', query: '' }), { area: 'all', status: 'all', query: '' })
  assert.deepEqual(filtersRevealing(created, { area: 'all', status: 'active', query: '' }), { area: 'all', status: 'all', query: '' })
  assert.deepEqual(filtersRevealing(created, { area: 'all', status: 'all', query: 'otra cosa' }), { area: 'all', status: 'all', query: '' })
  const keep = { area: 'retention', status: 'draft', query: 'nps' }
  assert.equal(filtersRevealing(created, keep), keep)
})

test('validateProgramName replica el mínimo de 2 caracteres del backend', () => {
  assert.equal(PROGRAM_NAME_MIN_LENGTH, 2)
  assert.match(validateProgramName(''), /Escribe/)
  assert.match(validateProgramName('   '), /Escribe/)
  assert.match(validateProgramName(' a '), /al menos 2/)
  assert.equal(validateProgramName('ab'), '')
  assert.equal(validateProgramName(null).length > 0, true)
  assert.match(validateProgramName('x'.repeat(161)), /160/)
})

test('replaceProgram actualiza en sitio o quita el programa si quedó archivado', () => {
  const updated = replaceProgram(programs, '2', { id: '2', status: 'active', type: 'newsletter' })
  assert.equal(updated.find(p => p.id === '2').status, 'active')
  assert.equal(updated.find(p => p.id === '2').area, 'newsletter')
  assert.deepEqual(replaceProgram(programs, '2', { id: '2', status: 'archived', archivedAt: 'x' }).map(p => p.id), ['1', '3'])
  assert.deepEqual(replaceProgram(programs, '2', null).map(p => p.id), ['1', '3'])
})

test('helpers de estado, conteo, etiquetas y mensajes de error', () => {
  assert.equal(canToggleProgram({ status: 'active' }), true)
  assert.equal(canToggleProgram({}), true)
  assert.equal(canToggleProgram({ status: 'completed' }), false)
  assert.deepEqual(countByArea(programs), { acquisition: 1, newsletter: 1, sales: 1 })
  assert.equal(areaFromType('webinar'), 'acquisition')
  assert.equal(readableType('custom_thing'), 'custom thing')
  assert.equal(errorMessageFrom({ error: 'Programa archivado' }, 'x'), 'Programa archivado')
  assert.equal(errorMessageFrom({ error: 'Datos de entrada no válidos', fields: { name: ['Muy corto'] } }, 'x'), 'Datos de entrada no válidos: Muy corto')
  assert.equal(errorMessageFrom(null, 'fallback'), 'fallback')
})
