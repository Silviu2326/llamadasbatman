// Parseo puro de archivos de importación (CSV/XLSX, cabeceras flexibles).
process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/offline'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectDelimiter, ImportParseError, mapImportHeaders, normalizeHeader, parseConsentFlag, parseImportCsv, parseImportXlsx, looksLikeXlsx,
} from '../services/leadImportParser'

test('normalizeHeader quita acentos, BOM y espacios', () => {
  assert.equal(normalizeHeader('﻿Teléfono'), 'telefono')
  assert.equal(normalizeHeader(' Correo electrónico '), 'correo_electronico')
  assert.equal(normalizeHeader('E-mail'), 'e_mail')
  assert.equal(normalizeHeader('Consent voice'), 'consent_voice')
})

test('mapImportHeaders acepta alias en español e inglés y lista las no reconocidas', () => {
  const { mapping, unmapped } = mapImportHeaders(['Nombre', 'Teléfono', 'Correo', 'Empresa', 'consent_voice', 'Notas'])
  assert.equal(mapping.name, 'Nombre')
  assert.equal(mapping.phone, 'Teléfono')
  assert.equal(mapping.email, 'Correo')
  assert.equal(mapping.company, 'Empresa')
  assert.equal(mapping.consentVoice, 'consent_voice')
  assert.deepEqual(unmapped, ['Notas'])
})

test('parseConsentFlag entiende true/sí/1 y no/false/0; lo demás es indefinido', () => {
  assert.equal(parseConsentFlag('true'), true)
  assert.equal(parseConsentFlag('Sí'), true)
  assert.equal(parseConsentFlag('si'), true)
  assert.equal(parseConsentFlag(1), true)
  assert.equal(parseConsentFlag('no'), false)
  assert.equal(parseConsentFlag('0'), false)
  assert.equal(parseConsentFlag(''), undefined)
  assert.equal(parseConsentFlag('quizás'), undefined)
  // Una marca genérica no es una declaración de consentimiento de voz.
  assert.equal(parseConsentFlag('x'), undefined)
  assert.equal(parseConsentFlag('ok'), undefined)
  assert.equal(parseConsentFlag('s'), undefined)
  assert.equal(parseConsentFlag('granted'), true)
})

test('mapImportHeaders no toma «consent»/«consentimiento» a secas como consentimiento de voz', () => {
  const { mapping, unmapped } = mapImportHeaders(['Nombre', 'consent', 'Consentimiento', 'consentimiento voz'])
  assert.equal(mapping.consentVoice, 'consentimiento voz')
  assert.deepEqual(unmapped, ['consent', 'Consentimiento'])
  assert.equal(mapImportHeaders(['Nombre', 'Consentimiento']).mapping.consentVoice, undefined)
})

test('detectDelimiter reconoce ; , y tabulador', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';')
  assert.equal(detectDelimiter('a,b,c'), ',')
  assert.equal(detectDelimiter('a\tb\tc'), '\t')
  assert.equal(detectDelimiter('solo'), ',')
})

test('parseImportCsv: CSV español con ; y consentimiento por fila', () => {
  const csv = '﻿Nombre;Teléfono;Correo;Empresa;consent_voice;consent_source;consent_evidence\n' +
    'Ana Pérez;600 111 222;ANA@x.es;Panadería Ana;sí;formulario web;Acepto llamadas 2026-09-01\n' +
    'Luis;+34 600 333 444;;;no;;\n' +
    'Sin consentimiento;600555666;;;;;\n'
  const parsed = parseImportCsv(csv)
  assert.equal(parsed.rows.length, 3)
  assert.deepEqual(parsed.rows[0], {
    name: 'Ana Pérez', phone: '600 111 222', email: 'ANA@x.es', company: 'Panadería Ana',
    consentVoice: true, consentSource: 'formulario web', consentEvidence: 'Acepto llamadas 2026-09-01',
  })
  assert.equal(parsed.rows[1].consentVoice, false)
  assert.equal(parsed.rows[1].email, undefined)
  assert.equal(parsed.rows[2].consentVoice, undefined)
  assert.equal(parsed.mapping.phone, 'Teléfono')
})

test('parseImportCsv: cabeceras inglesas con coma (formato anterior) siguen funcionando', () => {
  const parsed = parseImportCsv('name,phone,email,company\nBob,+34600000000,bob@x.com,ACME\n')
  assert.deepEqual(parsed.rows, [{ name: 'Bob', phone: '+34600000000', email: 'bob@x.com', company: 'ACME' }])
  assert.deepEqual(parsed.unmappedHeaders, [])
})

test('parseImportCsv: nombre compuesto por nombre + apellidos', () => {
  const parsed = parseImportCsv('first_name,apellidos,phone\nAna,García López,600111222\n')
  assert.equal(parsed.rows[0].name, 'Ana García López')
})

test('parseImportCsv: sin columna de nombre o vacío → ImportParseError', () => {
  assert.throws(() => parseImportCsv('phone,email\n600111222,a@b.c\n'), (err: any) => err instanceof ImportParseError && err.code === 'missing_name_column')
  assert.throws(() => parseImportCsv('name,phone\n'), (err: any) => err instanceof ImportParseError && err.code === 'empty')
})

test('parseImportXlsx lee la primera hoja con las mismas cabeceras flexibles', async () => {
  const mod: any = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Leads')
  sheet.addRow(['Nombre', 'Teléfono', 'Email', 'Empresa', 'Consentimiento voz'])
  sheet.addRow(['Ana', 600111222, 'ana@x.es', 'Panadería', 'sí'])
  sheet.addRow([])
  sheet.addRow(['Luis', '+34 600 333 444', '', 'Bar Luis', ''])
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  assert.equal(looksLikeXlsx('leads.xlsx'), true)
  assert.equal(looksLikeXlsx('leads.csv', buffer), true) // cabecera ZIP
  assert.equal(looksLikeXlsx('leads.csv', Buffer.from('name,phone')), false)

  const parsed = await parseImportXlsx(buffer)
  assert.equal(parsed.rows.length, 2)
  assert.deepEqual(parsed.rows[0], { name: 'Ana', phone: '600111222', email: 'ana@x.es', company: 'Panadería', consentVoice: true })
  assert.deepEqual(parsed.rows[1], { name: 'Luis', phone: '+34 600 333 444', company: 'Bar Luis' })
})
