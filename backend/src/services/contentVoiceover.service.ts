import { saveGeneratedFile } from './generatedMedia.service'

/**
 * Locución del guion de Reel — idea 8, `roadmap.md` fase 2.
 *
 * Reutiliza el **stack TTS propio** que ya locuta las llamadas, con una
 * diferencia de fondo: allí la síntesis es en streaming y por frases, porque
 * alguien está esperando al otro lado del teléfono; aquí es un archivo entero
 * que se descarga después. Por eso no se reusa `TtsRouter` —está construido
 * alrededor del turno de conversación— sino los mismos dos proveedores en una
 * llamada de una sola pasada.
 *
 * Orden de preferencia deliberado:
 *
 * 1. **Chatterbox local**, que es el stack propio y no cuesta por carácter.
 * 2. **ElevenLabs**, solo si el local no responde.
 * 3. **Nada, y se dice por qué.** Una pieza de locución sin audio es un guion
 *    con un aviso; inventarse que hay audio sería peor.
 */

const CHATTERBOX_TIMEOUT_MS = 60_000
const ELEVENLABS_TIMEOUT_MS = 60_000
/** Un Reel de 30–45 s son unos 900 caracteres; por encima es otro formato. */
const MAX_CHARACTERS = 1_200

export interface VoiceoverResult {
  audioUrl: string
  provider: 'chatterbox' | 'elevenlabs'
  /** Duración estimada por longitud del texto, no medida sobre el audio. */
  estimatedSeconds: number
  format: 'wav' | 'mp3'
}

export interface VoiceoverFailure {
  audioUrl: null
  reason: string
}

/** Texto locutable de un guion de Reel: hook, desarrollo y cierre, seguidos. */
export function voiceoverScript(body: { hook?: string; body?: string; cta?: string }) {
  return [body.hook, body.body, body.cta]
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_CHARACTERS)
}

/** ~15 caracteres por segundo a ritmo de locución en español. */
export function estimateSeconds(text: string) {
  return Math.max(1, Math.round(text.length / 15))
}

/**
 * Cabecera WAV para el PCM16 mono que devuelve Chatterbox. Sin ella el archivo
 * son muestras sueltas que ningún navegador sabe reproducir.
 */
export function wavFromPcm16(pcm: Buffer, sampleRate = 24_000) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)          // tamaño del bloque fmt
  header.writeUInt16LE(1, 20)           // PCM sin comprimir
  header.writeUInt16LE(1, 22)           // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // bytes por segundo (16 bits mono)
  header.writeUInt16LE(2, 32)           // alineación de bloque
  header.writeUInt16LE(16, 34)          // bits por muestra
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function synthesizeLocal(text: string): Promise<Buffer | null> {
  const baseUrl = process.env.CHATTERBOX_URL ?? 'http://127.0.0.1:8600'
  try {
    const response = await fetchWithTimeout(`${baseUrl}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: process.env.CHATTERBOX_VOICE ?? 'default' }),
    }, CHATTERBOX_TIMEOUT_MS)
    if (!response.ok) return null
    const pcm = Buffer.from(await response.arrayBuffer())
    return pcm.length ? wavFromPcm16(pcm) : null
  } catch {
    return null
  }
}

async function synthesizeRemote(text: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!apiKey || !voiceId) return null

  try {
    const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }, ELEVENLABS_TIMEOUT_MS)
    if (!response.ok) return null
    const audio = Buffer.from(await response.arrayBuffer())
    return audio.length ? audio : null
  } catch {
    return null
  }
}

/**
 * Locuta un guion y devuelve la URL pública del audio. Nunca lanza: que no haya
 * locución no puede tumbar la generación de las otras cinco piezas.
 */
export async function synthesizeVoiceover(script: string): Promise<VoiceoverResult | VoiceoverFailure> {
  const text = script.trim()
  if (!text) return { audioUrl: null, reason: 'El guion está vacío: no hay nada que locutar.' }

  const local = await synthesizeLocal(text)
  const audio = local ?? (await synthesizeRemote(text))
  if (!audio) {
    return {
      audioUrl: null,
      reason: 'No hay motor de voz disponible: arranca el servidor Chatterbox (CHATTERBOX_URL) o configura ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID.',
    }
  }

  const format = local ? 'wav' : 'mp3'
  const saved = await saveGeneratedFile(audio, format)
  if (!saved) {
    // El audio existe pero no hay dónde publicarlo. Es un fallo de
    // configuración, no del motor, y se dice como tal.
    return { audioUrl: null, reason: 'Falta PUBLIC_HOST: el audio se generó pero no se puede servir con una URL pública.' }
  }

  return {
    audioUrl: saved.publicUrl,
    provider: local ? 'chatterbox' : 'elevenlabs',
    estimatedSeconds: estimateSeconds(text),
    format,
  }
}
