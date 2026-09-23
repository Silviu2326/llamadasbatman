import test from 'node:test'
import assert from 'node:assert/strict'
import { crc32, createStudioZip } from './studioZip.js'

test('ZIP produces valid local headers, content, CRC and central directory', async () => {
  const data = new TextEncoder().encode('123456789')
  assert.equal(crc32(data), 0xcbf43926)
  const blob = await createStudioZip([new File([data], '../vídeo.txt')])
  const buffer = await blob.arrayBuffer(), view = new DataView(buffer)
  assert.equal(view.getUint32(0, true), 0x04034b50)
  assert.equal(view.getUint32(14, true), 0xcbf43926)
  const nameLength = view.getUint16(26, true)
  const name = new TextDecoder().decode(new Uint8Array(buffer, 30, nameLength))
  assert.ok(!name.includes('/'))
  assert.equal(new TextDecoder().decode(new Uint8Array(buffer, 30 + nameLength, data.length)), '123456789')
  const end = buffer.byteLength - 22
  assert.equal(view.getUint32(end, true), 0x06054b50)
  assert.equal(view.getUint16(end + 10, true), 1)
  assert.equal(view.getUint32(view.getUint32(end + 16, true), true), 0x02014b50)
})
test('ZIP rejects empty exports, excessive files and excessive data before reading', async () => {
  await assert.rejects(createStudioZip([]), /Selecciona/)
  await assert.rejects(createStudioZip(Array(26).fill(new File(['a'], 'a.txt'))), /Selecciona/)
  await assert.rejects(createStudioZip([{ size: 101 * 1024 * 1024 }]), /100 MB/)
})
