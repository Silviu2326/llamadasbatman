import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractRadarDocument } from '../services/radarDocument'
import { detectRadarOptions, resolveRadarKnowledge, importRadarWebsite, getRadarKnowledge } from '../services/radarKnowledge.service'
import { radarKnowledgeSchema } from '../services/radarKnowledge.schema'
import { prisma } from '../lib/prisma'

test('lee un Excel real con hojas, nombres y precios sin ejecutar fórmulas', async () => {
  const ExcelJS = require('exceljs'); const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Tarifas'); sheet.addRow(['Servicio', 'Precio', 'Moneda']); sheet.addRow(['Software para peluquerías', 49.5, 'EUR'])
  const result = await extractRadarDocument(Buffer.from(await workbook.xlsx.writeBuffer()), 'catalogo.xlsx')
  assert.match(result.text, /HOJA: Tarifas/); assert.match(result.text, /Software para peluquerías \| 49.5 \| EUR/)
  assert.ok(result.warnings.some(warning => warning.includes('fórmulas')))
  const detected = detectRadarOptions([{ id: 'source', name: 'catalogo.xlsx', text: result.text }])
  assert.equal(detected.suggestedType, 'software'); assert.equal(detected.services[0].priceCents, 4950)
})
test('lee Word real y texto, rechaza archivos vacíos, falsos y formatos no admitidos', async () => {
  const Zip = require('jszip'); const zip = new Zip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Catálogo de servicios de software para peluquerías</w:t></w:r></w:p></w:body></w:document>')
  assert.match((await extractRadarDocument(await zip.generateAsync({ type: 'nodebuffer' }), 'catalogo.docx')).text, /Catálogo de servicios/)
  assert.match((await extractRadarDocument(Buffer.from('Servicio;Precio\nAgenda;49 EUR'), 'tarifas.csv')).text, /49 EUR/)
  await assert.rejects(extractRadarDocument(Buffer.from('not pdf'), 'catalogo.pdf'), /PDF válido/)
  await assert.rejects(extractRadarDocument(Buffer.alloc(0), 'vacio.txt'), /10 MB/)
  await assert.rejects(extractRadarDocument(Buffer.from('x'), 'macro.xlsm'), /Formato/)
})
test('extrae texto de PDF real con una tarifa explícita', async () => {
  const stream = 'BT /F1 14 Tf 30 750 Td (Software para peluquerias. Plan profesional 49 EUR al mes.) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  assert.match((await extractRadarDocument(Buffer.from(pdf), 'tarifas.pdf')).text, /49 EUR/)
})
test('solo propone precios explícitos y aísla las fuentes por organización', async t => {
  const result = detectRadarOptions([{ id: 'doc-1', name: 'Tarifas', text: 'Software para peluquerías\nImplantación 1.250,50 EUR\nPlan básico 29,90 €\nSin precio publicado' }])
  assert.deepEqual(result.services.map(service => service.priceCents), [125050, 2990])
  assert.equal(result.services[0].sourceName, 'Tarifas')
  const original = prisma.microappConfig.findMany
  prisma.microappConfig.findMany = (async (query: any) => { assert.equal(query.where.orgId, 'org-1'); return [] }) as any
  t.after(() => { prisma.microappConfig.findMany = original })
  const profile = radarKnowledgeSchema.parse({ sourceIds: ['another-org-source'] })
  await assert.rejects(resolveRadarKnowledge('org-1', profile), /organización/)
  assert.equal(radarKnowledgeSchema.safeParse({ services: [{ name: 'Servicio', priceCents: -1 }] }).success, false)
})

test('incluye tarifas y un extracto de cada fuente seleccionada en el contexto del radar', async t => {
  const original = prisma.microappConfig.findMany
  prisma.microappConfig.findMany = (async (query: any) => {
    assert.equal(query.where.orgId, 'org-1')
    return Array.from({ length: 20 }, (_, i) => ({ id: `doc-${i}`, createdAt: new Date(), values: { name: `Catálogo ${i}`, text: `SERVICIO-${i} ` + 'contenido '.repeat(6000), kind: 'txt', warnings: [] } }))
  }) as any
  t.after(() => { prisma.microappConfig.findMany = original })
  const result = await resolveRadarKnowledge('org-1', radarKnowledgeSchema.parse({ sourceIds: Array.from({ length: 20 }, (_, i) => `doc-${i}`), services: [{ name: 'Implantación', priceCents: 125050, billing: 'project' }] }))
  assert.match(result, /125050/)
  for (let i = 0; i < 20; i++) assert.ok(result.includes(`SERVICIO-${i} `))
  assert.ok(result.length <= 50000)
})

test('la importación web rechaza destinos locales', async () => {
  await assert.rejects(importRadarWebsite('org-1', 'http://127.0.0.1'), /pública|privad|local|permit|bloquead|leer/i)
})

test('recupera el perfil guardado sin volver a seleccionar fuentes eliminadas', async t => {
  const originalFind = prisma.microappConfig.findMany
  const originalUnique = prisma.microappConfig.findUnique
  prisma.microappConfig.findUnique = (async () => ({ values: { sourceIds: ['kept', 'removed'], services: [{ name: 'Plan', priceCents: 4990 }] } })) as any
  prisma.microappConfig.findMany = (async () => [{ id: 'kept', createdAt: new Date(), values: { name: 'Tarifas', text: 'Plan 49,90 EUR', kind: 'txt', warnings: [] } }]) as any
  t.after(() => { prisma.microappConfig.findMany = originalFind; prisma.microappConfig.findUnique = originalUnique })
  const result = await getRadarKnowledge('org-1')
  assert.deepEqual(result.profile?.sourceIds, ['kept'])
  assert.equal(result.profile?.services[0].priceCents, 4990)
  assert.equal(result.sources[0].text, undefined)
  assert.match(result.sources[0].preview, /49,90 EUR/)
})
