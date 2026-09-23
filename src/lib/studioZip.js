// Standard ZIP (stored entries), no external service and no executable code.
const encoder = new TextEncoder()
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  let crc = n
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})
export function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
export async function createStudioZip(files) {
  if (!files.length || files.length > 25) throw new Error('Selecciona entre 1 y 25 archivos.')
  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) throw new Error('El ZIP admite hasta 100 MB de archivos.')
  const parts = [], central = []
  let offset = 0, centralSize = 0
  for (const [index, file] of files.entries()) {
    const name = encoder.encode(`${String(index + 1).padStart(2, '0')}-${(file.name || 'archivo').replace(/[\\/\x00-\x1f:*?"<>|]/g, '_').slice(0, 140)}`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const checksum = crc32(bytes)
    const local = new Uint8Array(30), localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x800, true)
    localView.setUint16(12, 33, true); localView.setUint32(14, checksum, true)
    localView.setUint32(18, bytes.length, true); localView.setUint32(22, bytes.length, true); localView.setUint16(26, name.length, true)
    const directory = new Uint8Array(46), view = new DataView(directory.buffer)
    view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x800, true)
    view.setUint16(14, 33, true); view.setUint32(16, checksum, true); view.setUint32(20, bytes.length, true); view.setUint32(24, bytes.length, true)
    view.setUint16(28, name.length, true); view.setUint32(42, offset, true)
    parts.push(local, name, bytes); central.push(directory, name)
    offset += local.length + name.length + bytes.length; centralSize += directory.length + name.length
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true)
  view.setUint32(12, centralSize, true); view.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

export function downloadStudioBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
