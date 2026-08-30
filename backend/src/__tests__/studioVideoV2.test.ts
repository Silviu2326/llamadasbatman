import assert from 'node:assert/strict'
import test from 'node:test'
import { cancelRunwayTask, parseRunwayTask } from '../providers/adapters/runway'
import { buildFfmpegArgs } from '../services/studioPost.service'
import { simplePdf, storyboardBudgetAdjustment, studioUtmContent } from '../services/studio.service'
import { readResponseBufferLimited } from '../lib/integrationRuntime'
import { openAiImageSize } from '../providers/adapters/openaiImage'

test('Runway: normaliza estados terminales y URLs HTTPS', () => {
  const succeeded = parseRunwayTask({
    id: '497f6eca-6276-4993-bfeb-53cbbbba6f08',
    status: 'SUCCEEDED',
    output: ['https://cdn.runway.test/result.mp4', 'http://inseguro.test/result.mp4'],
    progress: 1,
  })
  assert.equal(succeeded.state, 'succeeded')
  assert.deepEqual(succeeded.outputUrls, ['https://cdn.runway.test/result.mp4'])
  assert.equal(succeeded.progress, 100)

  assert.equal(parseRunwayTask({ id: 'x', status: 'FAILED', failureCode: 'SAFETY' }).state, 'failed')
  assert.equal(parseRunwayTask({ id: 'x', status: 'CANCELED' }).state, 'canceled')
  assert.equal(parseRunwayTask({ id: 'x', status: 'RUNNING', progress: 0.42 }).progress, 42)
})

test('Runway: DELETE de cancelación acepta 204 y 404 idempotente', async () => {
  const previous = globalThis.fetch
  const calls: Array<{ url: string; method?: string }> = []
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method })
      return new Response(null, { status: calls.length === 1 ? 204 : 404 })
    }) as typeof fetch
    await cancelRunwayTask('secret', '497f6eca-6276-4993-bfeb-53cbbbba6f08')
    await cancelRunwayTask('secret', '497f6eca-6276-4993-bfeb-53cbbbba6f08')
    assert.equal(calls.length, 2)
    assert.equal(calls[0]?.method, 'DELETE')
    assert.match(calls[0]?.url ?? '', /\/v1\/tasks\/497f6eca/)
  } finally {
    globalThis.fetch = previous
  }
})

test('storyboard: la conciliación sustituye la reserva por coste real o la libera', () => {
  assert.equal(storyboardBudgetAdjustment(10, 7), -3)
  assert.equal(storyboardBudgetAdjustment(10, 14), 4)
  assert.equal(storyboardBudgetAdjustment(10, null), -10)
})

test('storyboard: OpenAI usa el lienzo nativo más próximo al formato pedido', () => {
  assert.equal(openAiImageSize('1:1'), '1024x1024')
  assert.equal(openAiImageSize('9:16'), '1024x1536')
  assert.equal(openAiImageSize('4:5'), '1024x1536')
  assert.equal(openAiImageSize('16:9'), '1536x1024')
})

test('FFmpeg: concatena por filtros, sin shell ni argumentos de usuario', () => {
  const args = buildFfmpegArgs({
    videos: ['C:\\tmp\\take-0.mp4', 'C:\\tmp\\take-1.mp4'],
    audio: 'C:\\tmp\\music.mp3',
    subtitles: 'C:\\tmp\\captions.srt',
    output: 'C:\\tmp\\master.mp4',
    preset: 'vertical',
  })
  assert.deepEqual(args.slice(0, 3), ['-hide_banner', '-nostdin', '-y'])
  assert.ok(args.includes('-filter_complex'))
  assert.match(args[args.indexOf('-filter_complex') + 1]!, /scale=720:1280/)
  assert.match(args[args.indexOf('-filter_complex') + 1]!, /concat=n=2:v=1:a=0/)
  assert.ok(args.includes('mov_text'))
  assert.ok(args.includes('-fs'))
  assert.ok(args.includes('-threads'))
  assert.equal(args.at(-1), 'C:\\tmp\\master.mp4')
  assert.ok(!args.includes('-f concat'))
})

test('descarga de resultados corta el body al superar el límite', async () => {
  const response = new Response(Buffer.alloc(32), { headers: { 'content-length': '32' } })
  await assert.rejects(readResponseBufferLimited(response, 16), /RESPONSE_BODY_TOO_LARGE/)
})

test('FFmpeg: rechaza exportaciones sin clips', () => {
  assert.throws(() => buildFfmpegArgs({ videos: [], output: 'out.mp4', preset: 'vertical' }), /Número de clips inválido/)
})

test('PDF Studio: genera un PDF autocontenido con xref y catálogo', () => {
  const pdf = simplePdf(['Producción Demo', 'Plano 1: apertura del producto'])
  const text = pdf.toString('latin1')
  assert.ok(text.startsWith('%PDF-1.4'))
  assert.match(text, /\/Type \/Catalog/)
  assert.match(text, /xref/)
  assert.match(text, /%%EOF/)
})

test('publicación Studio usa un UTM estable y específico del master', () => {
  assert.equal(studioUtmContent('prod_1', 'asset_9'), 'studio_prod_1_asset_9')
  assert.notEqual(studioUtmContent('prod_1', 'asset_9'), studioUtmContent('prod_1', 'asset_10'))
})
