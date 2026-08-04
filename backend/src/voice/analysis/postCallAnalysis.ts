import fs from 'fs'
import path from 'path'

// Analisis post-llamada con un LLM de audio (Qwen3-Omni via vLLM/endpoint compatible
// OpenAI). Escucha el audio real del prospecto (tono, sarcasmo, frustracion) ademas
// del transcript, y escribe analysis.json en el directorio de la sesion.
// Se activa solo con QWEN_OMNI_URL definido; nunca esta en el camino critico.

const WAV_HEADER_BYTES = 44
const MAX_AUDIO_BYTES = 8 * 1024 * 1024 // ~4 min de PCM16 16 kHz; suficiente para valorar la llamada

const PROMPT = `Eres un analista de llamadas comerciales. Escucha el audio del prospecto y lee el transcript completo de la llamada.
Responde SOLO con un JSON valido con esta forma exacta:
{"resumen": "...", "emocion_dominante": "...", "tono_timeline": [{"momento": "...", "observacion": "..."}], "lead_score": 0-100, "senales_compra": ["..."], "objeciones": ["..."], "proximos_pasos": ["..."]}
Basa la emocion y el tono en lo que OYES (ritmo, tension, dudas, ironia), no solo en las palabras.`

/** Concatena WAVs PCM16 mono del mismo sample rate en uno solo. */
export function concatWavs(wavs: Buffer[], sampleRate: number): Buffer {
  const data = Buffer.concat(wavs.map(w => w.subarray(WAV_HEADER_BYTES)))
  const header = Buffer.alloc(WAV_HEADER_BYTES)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

function readTranscript(sessionDir: string): string {
  try {
    const raw = fs.readFileSync(path.join(sessionDir, 'turns.jsonl'), 'utf8')
    return raw.trim().split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) } catch { return null } })
      .filter((t): t is { role?: string; text?: string } => Boolean(t?.role && t?.text))
      .map(t => `${t.role}: ${t.text}`)
      .join('\n')
  } catch {
    return ''
  }
}

function prospectAudio(sessionDir: string): Buffer | null {
  const files = fs.readdirSync(sessionDir)
    .filter(f => /^turn_\d+_prospecto\.wav$/.test(f))
    .sort()
  if (!files.length) return null
  const wavs: Buffer[] = []
  let bytes = 0
  for (const f of files) {
    const wav = fs.readFileSync(path.join(sessionDir, f))
    bytes += wav.length
    if (bytes > MAX_AUDIO_BYTES) break
    wavs.push(wav)
  }
  return wavs.length ? concatWavs(wavs, 16000) : null
}

export function parseModelJson(content: string): Record<string, unknown> | null {
  const stripped = content.replace(/```(?:json)?/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try { return JSON.parse(stripped.slice(start, end + 1)) } catch { return null }
}

export async function analyzePostCall(sessionDir: string): Promise<void> {
  const baseUrl = process.env.QWEN_OMNI_URL?.trim()
  if (!baseUrl) return
  try {
    const transcript = readTranscript(sessionDir)
    const audio = prospectAudio(sessionDir)
    if (!transcript && !audio) return

    const content: unknown[] = [{ type: 'text', text: `${PROMPT}\n\nTRANSCRIPT:\n${transcript || '(sin transcript)'}` }]
    if (audio) content.push({ type: 'input_audio', input_audio: { data: audio.toString('base64'), format: 'wav' } })

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.QWEN_OMNI_API_KEY ? { Authorization: `Bearer ${process.env.QWEN_OMNI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.QWEN_OMNI_MODEL ?? 'Qwen/Qwen3-Omni-30B-A3B-Instruct',
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      console.warn('[ANALYSIS] Qwen3-Omni HTTP %d', res.status)
      return
    }
    const body: any = await res.json()
    const analysis = parseModelJson(body?.choices?.[0]?.message?.content ?? '')
    if (!analysis) {
      console.warn('[ANALYSIS] Qwen3-Omni respondio sin JSON parseable')
      return
    }
    fs.writeFileSync(
      path.join(sessionDir, 'analysis.json'),
      JSON.stringify({ analyzedAt: new Date().toISOString(), model: process.env.QWEN_OMNI_MODEL ?? 'Qwen/Qwen3-Omni-30B-A3B-Instruct', ...analysis }, null, 2),
    )
    console.log('[ANALYSIS] analysis.json escrito en %s', sessionDir)
  } catch (e: any) {
    console.warn('[ANALYSIS] post-call fallo (no fatal):', e?.message ?? e)
  }
}
