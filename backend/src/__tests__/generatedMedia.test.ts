import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectImageType, publicMediaBaseUrl, readGeneratedImage, saveGeneratedImage, saveUploadedImage } from '../services/generatedMedia.service'

const PNG_HEADER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('resto')])
const JPG_HEADER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('resto')])
const WEBP_HEADER = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPresto')])

test('guarda la imagen generada y la sirve solo con nombres válidos', async () => {
  const previous = process.env.PUBLIC_HOST
  process.env.PUBLIC_HOST = 'https://backend.example.test/'
  try {
    assert.equal(publicMediaBaseUrl(), 'https://backend.example.test/api/public/media')

    const saved = await saveGeneratedImage(Buffer.from('png-bytes').toString('base64'))
    assert.ok(saved)
    assert.match(saved!.fileName, /^[a-f0-9-]{36}\.png$/)
    assert.equal(saved!.publicUrl, `https://backend.example.test/api/public/media/${saved!.fileName}`)

    const roundTrip = await readGeneratedImage(saved!.fileName)
    assert.equal(roundTrip?.toString(), 'png-bytes')

    // Nombres fuera del patrón UUID.ext nunca tocan disco (path traversal).
    assert.equal(await readGeneratedImage('../secrets.png'), null)
    assert.equal(await readGeneratedImage('no-existe.png'), null)
    assert.equal(await readGeneratedImage(`${saved!.fileName}.txt`), null)

    // Las subidas del navegador se validan por magic bytes, no por extensión.
    assert.equal(detectImageType(PNG_HEADER), 'png')
    assert.equal(detectImageType(JPG_HEADER), 'jpg')
    assert.equal(detectImageType(WEBP_HEADER), 'webp')
    assert.equal(detectImageType(Buffer.from('<html>no soy imagen</html>')), null)
    assert.equal(await saveUploadedImage(Buffer.from('<svg onload=alert(1)>')), null)
    const uploaded = await saveUploadedImage(JPG_HEADER)
    assert.match(uploaded!.fileName, /\.jpg$/)
    assert.equal((await readGeneratedImage(uploaded!.fileName))?.equals(JPG_HEADER), true)
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_HOST
    else process.env.PUBLIC_HOST = previous
  }
})

test('sin PUBLIC_HOST no se guarda nada ni se inventa una URL', async () => {
  const previous = process.env.PUBLIC_HOST
  delete process.env.PUBLIC_HOST
  try {
    assert.equal(publicMediaBaseUrl(), null)
    assert.equal(await saveGeneratedImage(Buffer.from('x').toString('base64')), null)
  } finally {
    if (previous !== undefined) process.env.PUBLIC_HOST = previous
  }
})
