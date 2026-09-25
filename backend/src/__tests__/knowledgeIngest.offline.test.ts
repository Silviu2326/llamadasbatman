process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/test'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import {
  assertKnowledgeFileHeader,
  createKnowledgeBase,
  KnowledgeError,
  listKnowledgeBase,
  type KnowledgeDeps,
} from '../services/knowledge.service'
import { extractRadarDocument } from '../services/radarDocument'

// Mismas fixtures que radarKnowledge.test.ts: un DOCX mínimo y un PDF de una página.
async function docxFixture(): Promise<Buffer> {
  const Zip = require('jszip'); const zip = new Zip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Catálogo de servicios de software para peluquerías. Plan profesional 49 EUR al mes.</w:t></w:r></w:p></w:body></w:document>')
  return zip.generateAsync({ type: 'nodebuffer' })
}

function pdfFixture(): Buffer {
  const stream = 'BT /F1 14 Tf 30 750 Td (Software para peluquerias. Plan profesional 49 EUR al mes.) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

function stubCreate(t: any) {
  const original = prisma.knowledgeBase.create
  const created: any[] = []
  prisma.knowledgeBase.create = (async (args: any) => {
    created.push(args.data)
    return { id: `kb-${created.length}`, createdAt: new Date(), updatedAt: new Date(), isActive: true, slug: null, publishedAt: null, ...args.data }
  }) as any
  t.after(() => { prisma.knowledgeBase.create = original })
  return created
}

const noNetwork: KnowledgeDeps = {
  extract: extractRadarDocument,
  crawl: async () => { throw new Error('no debe rastrear') },
  assertPublicUrl: async () => { throw new Error('no debe validar') },
  archive: null,
}

test('un DOCX subido en base64 llega al agente como texto extraído, no como «Archivo importado»', async t => {
  const created = stubCreate(t)
  const archived: any[] = []
  const item = await createKnowledgeBase('org-a', {
    name: 'Catálogo',
    file: { name: 'catalogo.docx', contentBase64: (await docxFixture()).toString('base64') },
  }, { ...noNetwork, archive: async input => { archived.push(input); return { id: 'asset-1' } } })
  assert.equal(created[0].sourceType, 'upload')
  assert.match(created[0].content, /Catálogo de servicios/)
  assert.doesNotMatch(created[0].content, /Archivo importado/)
  assert.equal(created[0].fileUrl, 'asset://asset-1', 'el binario se archiva como asset, nunca como data-URL')
  assert.equal(archived[0].mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(item.extraction?.format, 'docx')
  assert.ok((item.extraction?.chars ?? 0) > 40)
})

test('un PDF real se extrae; si el archivo no se puede archivar, el texto se guarda igual con aviso', async t => {
  const created = stubCreate(t)
  const item = await createKnowledgeBase('org-a', {
    name: 'Tarifas',
    file: { name: 'tarifas.pdf', contentBase64: pdfFixture().toString('base64') },
  }, { ...noNetwork, archive: async () => { throw new Error('S3 no configurado') } })
  assert.match(created[0].content, /49 EUR/)
  assert.equal(created[0].fileUrl, null)
  assert.ok(item.extraction?.warnings.some(warning => /original no se pudo archivar/.test(warning)))
})

test('una data-URL de un cliente antiguo se convierte en archivo y se extrae', async t => {
  const created = stubCreate(t)
  const dataUrl = `data:application/pdf;base64,${pdfFixture().toString('base64')}`
  await createKnowledgeBase('org-a', { name: 'Tarifas', type: 'document', content: 'Archivo importado: tarifas.pdf', fileUrl: dataUrl }, noNetwork)
  assert.match(created[0].content, /49 EUR/)
  assert.equal(created[0].fileUrl, null)
})

test('rechaza tamaño, cabecera falsa, .doc antiguo y formato no admitido antes de extraer', async t => {
  stubCreate(t)
  let extractions = 0
  const deps: KnowledgeDeps = { ...noNetwork, extract: async () => { extractions += 1; return { text: 'x', warnings: [], format: 'pdf' } } }
  const tooBig = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41).toString('base64')
  await assert.rejects(createKnowledgeBase('org-a', { name: 'Grande', file: { name: 'grande.txt', contentBase64: tooBig } }, deps), (error: any) => error instanceof KnowledgeError && error.code === 'KNOWLEDGE_FILE_TOO_LARGE' && error.status === 413)
  await assert.rejects(createKnowledgeBase('org-a', { name: 'Falso', file: { name: 'falso.pdf', contentBase64: Buffer.from('not pdf').toString('base64') } }, deps), (error: any) => error.code === 'KNOWLEDGE_FILE_HEADER')
  await assert.rejects(createKnowledgeBase('org-a', { name: 'Falso', file: { name: 'falso.docx', contentBase64: Buffer.from('not zip').toString('base64') } }, deps), (error: any) => error.code === 'KNOWLEDGE_FILE_HEADER')
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)])
  await assert.rejects(createKnowledgeBase('org-a', { name: 'Viejo', file: { name: 'viejo.doc', contentBase64: ole.toString('base64') } }, deps), (error: any) => error.code === 'KNOWLEDGE_FILE_LEGACY_DOC' && error.status === 415)
  await assert.rejects(createKnowledgeBase('org-a', { name: 'Macro', file: { name: 'macro.xlsm', contentBase64: Buffer.from('x').toString('base64') } }, deps), (error: any) => error.code === 'KNOWLEDGE_FILE_FORMAT')
  await assert.rejects(createKnowledgeBase('org-a', { name: 'Vacío', file: { name: 'vacio.txt', contentBase64: Buffer.alloc(0).toString('base64') } }, deps), (error: any) => error.code === 'KNOWLEDGE_FILE_EMPTY' || error.code === 'KNOWLEDGE_FILE_TOO_LARGE')
  assert.equal(extractions, 0, 'ninguno de los rechazos debe llegar al proceso hijo')
  assert.equal(assertKnowledgeFileHeader(Buffer.from('hola'), 'notas.md'), 'md')
})

test('un artículo de tipo url rastrea la web pública validada y guarda su texto', async t => {
  const created = stubCreate(t)
  const validated: string[] = []
  const crawled: string[] = []
  const deps: KnowledgeDeps = {
    ...noNetwork,
    assertPublicUrl: async url => { validated.push(url); return new URL(url) },
    crawl: async website => {
      crawled.push(website)
      return [
        { url: 'https://sonrisa.es/', title: 'Clínica Sonrisa', text: 'Atendemos urgencias el mismo día.', html: '' },
        { url: 'https://sonrisa.es/precios', title: 'Tarifas', text: 'Primera revisión por 49 euros.', html: '' },
      ]
    },
  }
  const item = await createKnowledgeBase('org-a', { name: 'Web', type: 'url', sourceUrl: 'sonrisa.es' }, deps)
  assert.deepEqual(validated, ['https://sonrisa.es'])
  assert.deepEqual(crawled, ['https://sonrisa.es'])
  assert.equal(created[0].sourceType, 'url')
  assert.equal(created[0].sourceUrl, 'https://sonrisa.es')
  assert.match(created[0].content, /## Clínica Sonrisa/)
  assert.match(created[0].content, /49 euros/)
  assert.doesNotMatch(created[0].content, /^https:\/\/sonrisa\.es$/, 'antes se guardaba la propia URL como contenido')
  assert.equal(item.extraction?.pages, 2)
})

test('una URL bloqueada o inaccesible no crea nada', async t => {
  const created = stubCreate(t)
  await assert.rejects(
    createKnowledgeBase('org-a', { name: 'Interna', type: 'url', content: 'http://10.0.0.1/admin' }, { ...noNetwork, assertPublicUrl: async () => { throw new Error('AUDIT_URL_BLOCKED') } }),
    (error: any) => error.code === 'KNOWLEDGE_URL_BLOCKED' && error.status === 400,
  )
  await assert.rejects(
    createKnowledgeBase('org-a', { name: 'Caída', type: 'url', sourceUrl: 'https://caida.example' }, { ...noNetwork, assertPublicUrl: async () => undefined, crawl: async () => [] }),
    (error: any) => error.code === 'KNOWLEDGE_URL_UNREACHABLE' && error.status === 422,
  )
  assert.equal(created.length, 0)
})

test('el listado excluye fileUrl y recorta el contenido a una vista previa', async t => {
  const original = prisma.knowledgeBase.findMany
  let query: any
  prisma.knowledgeBase.findMany = (async (args: any) => {
    query = args
    return [{ id: 'kb-1', orgId: 'org-a', name: 'Largo', type: 'document', sourceType: 'upload', sourceUrl: null, isActive: true, slug: null, publishedAt: null, createdAt: new Date(), updatedAt: new Date(), content: 'x'.repeat(5_000) }]
  }) as any
  t.after(() => { prisma.knowledgeBase.findMany = original })
  const [row] = await listKnowledgeBase('org-a')
  assert.equal(query.select.fileUrl, undefined)
  assert.equal(query.where.orgId, 'org-a')
  assert.equal(row!.contentChars, 5_000)
  assert.equal(row!.contentTruncated, true)
  assert.ok(row!.content.length < 2_100)
  assert.equal('fileUrl' in row!, false)
})
