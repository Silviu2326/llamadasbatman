import { VoiceCatalogError } from './agentVoices.service'

export const MAX_VOICE_BYTES = 10 * 1024 * 1024
export class VoiceUploadError extends VoiceCatalogError {
  constructor(message: string, statusCode: number, public readonly uncertain = false) { super(message, statusCode) }
}

export function decodeVoiceAudio(base64: string) {
  if (!base64 || base64.length % 4 !== 0 || base64.length > Math.ceil(MAX_VOICE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new VoiceUploadError('El audio no es válido o supera los 10 MB.', 400)
  }
  const audio = Buffer.from(base64, 'base64')
  if (audio.toString('base64') !== base64) throw new VoiceUploadError('El audio no es válido.', 400)
  if (audio.length < 128 || audio.length > MAX_VOICE_BYTES) throw new VoiceUploadError('El audio está vacío, incompleto o supera los 10 MB.', 400)
  if (audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE') return { audio, mime: 'audio/wav', extension: 'wav' }
  if (audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0)) return { audio, mime: 'audio/mpeg', extension: 'mp3' }
  throw new VoiceUploadError('Elige una grabación en formato MP3 o WAV.', 400)
}

function headers() {
  const key = process.env.FISH_API_KEY?.trim()
  if (!key) throw new VoiceUploadError('La creación de voces no está conectada. Revisa Fish Audio en el servidor.', 503)
  return { Authorization: `Bearer ${key}` }
}

export function voiceUploadConfigured() { headers() }

export async function createPrivateVoice(title: string, file: ReturnType<typeof decodeVoiceAudio>) {
  const auth = headers()
  const form = new FormData()
  form.set('title', title)
  form.set('type', 'tts')
  form.set('train_mode', 'fast')
  form.set('visibility', 'private')
  form.set('enhance_audio_quality', 'true')
  form.set('generate_sample', 'false')
  form.set('voices', new Blob([new Uint8Array(file.audio)], { type: file.mime }), `voice.${file.extension}`)
  try {
    // Multipart contract matches Fish Audio's official voices.ivc SDK. Do not
    // retry POST: a lost response may still have created a private model.
    const response = await fetch('https://api.fish.audio/model', { method: 'POST', headers: auth, body: form, signal: AbortSignal.timeout(120_000) })
    if (!response.ok) {
      const messages: Record<number, string> = { 400: 'Fish Audio no pudo utilizar esta grabación. Prueba un audio con una sola voz y sin ruido.', 401: 'La conexión con Fish Audio necesita revisión.', 402: 'La cuenta de voz no tiene saldo disponible.', 403: 'La cuenta conectada no permite crear esta voz.', 413: 'La grabación supera el tamaño permitido.', 422: 'Fish Audio no pudo utilizar esta grabación. Prueba otro MP3 o WAV.', 429: 'Hay demasiadas solicitudes. Espera un momento antes de reintentar.' }
      throw new VoiceUploadError(messages[response.status] || 'No se ha podido confirmar la creación de la voz.', response.status === 402 ? 402 : 502, response.status >= 500 || response.status === 408)
    }
    const model = await response.json() as any
    if (!/^[a-f0-9]{32}$/i.test(model?._id) || model.visibility !== 'private') throw new VoiceUploadError('No se ha podido confirmar la creación de la voz.', 502, true)
    return model
  } catch (error) {
    if (error instanceof VoiceUploadError) throw error
    throw new VoiceUploadError('Estamos comprobando si la voz se ha creado. No vuelvas a subir el audio.', 502, true)
  }
}

export async function findPrivateVoice(title: string, voiceId?: string | null) {
  const url = voiceId ? `https://api.fish.audio/model/${encodeURIComponent(voiceId)}` : `https://api.fish.audio/model?${new URLSearchParams({ self: 'true', title, page_size: '100' })}`
  const response = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new VoiceUploadError('Todavía no se ha podido comprobar la voz. Inténtalo de nuevo.', 502, true)
  const body = await response.json() as any
  const model = voiceId ? body : body.items?.find((item: any) => item.title === title)
  return model?.visibility === 'private' && model.title === title ? model : null
}
