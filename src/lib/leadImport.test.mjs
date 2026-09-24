// Lógica pura del modal de importación. Sin framework:
// node --test src/lib/leadImport.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildImportQuery, classifyImportError, describeImportError, detectStalledImport,
  importFileKind, importProgress, stalledImportMessage, summarizeImportErrors,
} from './leadImport.js'

test('importFileKind distingue csv y xlsx', () => {
  assert.equal(importFileKind('leads.CSV'), 'csv')
  assert.equal(importFileKind('leads.xlsx'), 'xlsx')
  assert.equal(importFileKind('leads.xls'), null)
  assert.equal(importFileKind(''), null)
})

test('buildImportQuery solo envía consentimiento si la casilla está marcada', () => {
  const plain = new URLSearchParams(buildImportQuery({ campaignId: 'c1' }))
  assert.equal(plain.get('campaignId'), 'c1')
  assert.equal(plain.get('autoCall'), 'false')
  assert.equal(plain.has('consentVoice'), false)
  assert.equal(plain.has('attachExisting'), false)

  const ignored = new URLSearchParams(buildImportQuery({ campaignId: 'c1', consentVoice: false, consentSource: 'contrato', consentEvidence: 'x' }))
  assert.equal(ignored.has('consentSource'), false)

  const full = new URLSearchParams(buildImportQuery({ campaignId: 'c1', autoCall: true, consentVoice: true, consentSource: ' contrato ', consentEvidence: 'Cláusula 3', attachExisting: true }))
  assert.equal(full.get('autoCall'), 'true')
  assert.equal(full.get('consentVoice'), 'true')
  assert.equal(full.get('consentSource'), 'contrato')
  assert.equal(full.get('consentEvidence'), 'Cláusula 3')
  assert.equal(full.get('attachExisting'), 'true')
})

test('importProgress calcula porcentaje y estados', () => {
  assert.deepEqual(importProgress(null), { percent: 0, done: false, failed: false, running: false })
  assert.deepEqual(importProgress({ status: 'processing', totalRows: 40, processedRows: 10 }), { percent: 25, done: false, failed: false, running: true })
  assert.deepEqual(importProgress({ status: 'completed', totalRows: 0, processedRows: 0 }), { percent: 100, done: true, failed: false, running: false })
  assert.equal(importProgress({ status: 'failed', totalRows: 3, processedRows: 3 }).failed, true)
})

test('detectStalledImport avisa cuando no hay progreso en un minuto y calla si terminó', () => {
  const t0 = 1_000_000
  const pending = { status: 'pending', totalRows: 10, processedRows: 0 }
  assert.equal(detectStalledImport({ job: pending, lastProgressAt: t0, now: t0 + 30_000 }), false)
  assert.equal(detectStalledImport({ job: pending, lastProgressAt: t0, now: t0 + 60_000 }), true)
  assert.equal(detectStalledImport({ job: { ...pending, status: 'completed' }, lastProgressAt: t0, now: t0 + 90_000 }), false)
  assert.equal(detectStalledImport({ job: null, lastProgressAt: t0, now: t0 + 90_000 }), false)
  assert.match(stalledImportMessage(pending), /worker de importaciones/)
  assert.match(stalledImportMessage({ ...pending, status: 'processing' }), /sin avanzar/)
})

test('los errores por fila se clasifican y se explican', () => {
  assert.equal(classifyImportError('invalid_phone: abc'), 'invalidPhone')
  assert.equal(classifyImportError('already_exists: mismo teléfono (lead x)'), 'alreadyExists')
  assert.equal(classifyImportError('duplicate_in_file'), 'duplicateInFile')
  assert.equal(classifyImportError('name es requerido'), 'other')
  assert.match(describeImportError('invalid_phone: abc'), /Teléfono no válido \(abc\)/)
  assert.match(describeImportError('already_exists: mismo email (lead x)'), /Ya existía en el CRM \(mismo email\)/)
  assert.match(describeImportError('duplicate_in_file'), /Repetido dentro del archivo/)
  assert.equal(describeImportError('name es requerido'), 'name es requerido')
  assert.deepEqual(summarizeImportErrors([{ message: 'invalid_phone: 1' }, { message: 'already_exists: x' }, { message: 'duplicate_in_file' }, { message: 'otro' }, null]), { invalidPhone: 1, alreadyExists: 1, duplicateInFile: 1, other: 2 })
})
