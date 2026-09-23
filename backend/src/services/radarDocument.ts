import { spawn } from 'node:child_process'
import { extname } from 'node:path'

export const RADAR_FILE_BYTES = 10 * 1024 * 1024
let activeExtractions = 0
export type DocumentText = { text: string; warnings: string[]; format: string }

/** Runs in an isolated process with a memory limit; no macros or spreadsheet formula evaluation. */
export async function extractDocumentUnsafe(buffer: Buffer, filename: string): Promise<DocumentText> {
  const format = extname(filename).slice(1).toLowerCase()
  let text = ''; const warnings: string[] = []
  if (['xlsx', 'docx'].includes(format)) {
    if (buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('El archivo no contiene un documento Office válido.')
    let expanded = 0; let entries = 0
    for (let offset = 0; offset + 46 < buffer.length; offset++) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) continue
      expanded += buffer.readUInt32LE(offset + 24); entries++
      if (expanded > 40 * 1024 * 1024 || entries > 2000) throw new Error('El documento descomprimido es demasiado grande. Divide el catálogo en archivos más pequeños.')
    }
  }
  if (format === 'xlsx') {
    const ExcelJS = require('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const lines: string[] = []; let rows = 0
    for (const sheet of workbook.worksheets.slice(0, 12)) {
      lines.push(`HOJA: ${sheet.name}`)
      sheet.eachRow((row: any) => {
        if (rows++ >= 2000) return
        const cells: string[] = []
        row.eachCell({ includeEmpty: true }, (cell: any, column: number) => { if (column <= 40) cells.push(cell.text || '') })
        lines.push(cells.join(' | '))
      })
    }
    text = lines.join('\n')
    if (rows > 2000 || workbook.worksheets.length > 12) warnings.push('Vista limitada a 12 hojas y 2.000 filas. Divide el archivo para analizarlo completo.')
    warnings.push('Las fórmulas no se recalculan; se leen los valores guardados en Excel.')
  } else if (format === 'docx') {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer }); text = result.value
    if (result.messages.length) warnings.push('Algunos elementos del documento no se pudieron convertir a texto.')
  } else if (format === 'pdf') {
    if (buffer.subarray(0, 4).toString() !== '%PDF') throw new Error('El archivo no contiene un PDF válido.')
    const { PDFParse } = require('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try { const result = await parser.getText({ first: 30 }); text = result.text; if (result.total > 30) warnings.push('Se han leído las primeras 30 páginas. Divide el catálogo para leer el resto.') } finally { await parser.destroy() }
    if (text.replace(/--\s*\d+ of \d+\s*--/g, '').trim().length < 20) throw new Error('Este PDF no contiene texto legible. Si es un escaneo, expórtalo con OCR o sube la versión Excel/Word.')
  } else if (['txt', 'md', 'csv', 'json'].includes(format)) {
    text = buffer.toString('utf8').replace(/^\uFEFF/, '')
    if (text.includes('\u0000')) throw new Error('Guarda el documento de texto en UTF-8 antes de subirlo.')
  } else throw new Error('Formato no compatible. Usa PDF, XLSX, DOCX, CSV, TXT, MD o JSON.')
  text = text.replace(/\u0000/g, '').trim()
  if (!text) throw new Error('No se ha encontrado contenido legible en el archivo.')
  if (text.length > 60000) warnings.push('El texto supera el límite de lectura de 60.000 caracteres. Se conserva el original; divide el archivo para analizar todo su contenido.')
  return { text: text.slice(0, 60000), warnings, format }
}

export function extractRadarDocument(buffer: Buffer, filename: string): Promise<DocumentText> {
  if (!buffer.length || buffer.length > RADAR_FILE_BYTES) return Promise.reject(new Error('Cada archivo debe ocupar entre 1 byte y 10 MB.'))
  if (!/\.(pdf|xlsx|docx|csv|txt|md|json)$/i.test(filename)) return Promise.reject(new Error('Formato no compatible. Usa PDF, XLSX, DOCX, CSV, TXT, MD o JSON.'))
  if (activeExtractions >= 3) return Promise.reject(new Error('Se están leyendo otros documentos. Vuelve a intentarlo en unos segundos.'))
  activeExtractions++
  return new Promise((resolve, reject) => {
    const code = `let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',async()=>{const data=JSON.parse(input);try{if(data.register)require(data.register);const value=await require(data.modulePath).extractDocumentUnsafe(Buffer.from(data.bytes,'base64'),data.filename);process.stdout.write(JSON.stringify({value}));}catch(error){process.stdout.write(JSON.stringify({error:error.message}));}});`
    const child = spawn(process.execPath, ['--max-old-space-size=256', '-e', code], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('El documento tarda demasiado en procesarse. Divide el archivo y vuelve a intentarlo.')) }, 30000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 500000) { child.kill(); reject(new Error('El texto extraído supera el límite de lectura.')) } })
    child.stderr.resume()
    child.stdin.on('error', () => undefined)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', status => {
      activeExtractions--
      clearTimeout(timer)
      if (status !== 0) { reject(new Error('No se pudo procesar el archivo dentro del límite de memoria.')); return }
      try { const result = JSON.parse(output); result.error ? reject(new Error(result.error)) : resolve(result.value) } catch { reject(new Error('El lector no devolvió un documento válido.')) }
    })
    child.stdin.end(JSON.stringify({ bytes: buffer.toString('base64'), filename, modulePath: __filename, register: __filename.endsWith('.ts') ? require.resolve('tsx/cjs') : null }))
  })
}
