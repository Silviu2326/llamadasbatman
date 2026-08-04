import fs from 'fs'
import path from 'path'

const SESSIONS_DIR = path.join(process.cwd(), 'sessions')

export class SessionLogger {
  readonly dir: string
  private startMs: number
  private stream: fs.WriteStream
  private _activeTurn: { role: string; sampleRate: number; chunks: Buffer[] } | null = null
  private _turnIndex = 0

  constructor(callSid: string, meta: Record<string, unknown>) {
    const stamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '').slice(0, 15)
    this.dir = path.join(SESSIONS_DIR, `${stamp}_${callSid}`)
    fs.mkdirSync(this.dir, { recursive: true })
    this.startMs = Date.now()

    fs.writeFileSync(
      path.join(this.dir, 'session.json'),
      JSON.stringify({ startedAt: new Date().toISOString(), callSid, ...meta }, null, 2),
    )

    this.stream = fs.createWriteStream(path.join(this.dir, 'turns.jsonl'), { flags: 'a' })
    console.log('[LOG] session dir: %s', this.dir)
  }

  log(event: Record<string, unknown>): void {
    const entry = { elapsedMs: Date.now() - this.startMs, ...event }
    this.stream.write(JSON.stringify(entry) + '\n')
  }

  /** Start collecting audio for a new turn */
  startTurn(role: string, sampleRate: number): void {
    if (this._activeTurn?.chunks.length) this.flushTurn()
    this._activeTurn = { role, sampleRate, chunks: [] }
  }

  /** Add an audio chunk to the current active turn */
  addChunk(buf: Buffer): void {
    this._activeTurn?.chunks.push(buf)
  }

  /** Write the current turn audio as a WAV file */
  flushTurn(): void {
    if (!this._activeTurn || !this._activeTurn.chunks.length) {
      this._activeTurn = null
      return
    }
    const i = ++this._turnIndex
    const fname = `turn_${String(i).padStart(3, '0')}_${this._activeTurn.role}.wav`
    writeWav(path.join(this.dir, fname), this._activeTurn.chunks, this._activeTurn.sampleRate)
    this._activeTurn = null
  }

  close(): void {
    this.flushTurn()
    this.stream.end()

    try {
      const raw = fs.readFileSync(path.join(this.dir, 'turns.jsonl'), 'utf8')
      const turns = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
      const agentTurns     = turns.filter(t => t.role === 'agente')
      const prospectoTurns = turns.filter(t => t.role === 'prospecto')
      const latencies      = agentTurns.map(t => t.latency?.total).filter(Boolean) as number[]

      const summary = {
        durationMs: Date.now() - this.startMs,
        agentTurns: agentTurns.length,
        prospectoTurns: prospectoTurns.length,
        interruptions: turns.filter(t => t.event === 'interrupt').length,
        avgProspectoConf: avg(prospectoTurns.map(t => t.confidence).filter(Boolean) as number[]),
        avgProspectoWpm:  avg(prospectoTurns.map(t => t.wpm).filter(Boolean) as number[]),
        avgLatencyMs: avg(latencies),
        minLatencyMs: latencies.length ? Math.min(...latencies) : null,
        maxLatencyMs: latencies.length ? Math.max(...latencies) : null,
      }

      fs.writeFileSync(path.join(this.dir, 'summary.json'), JSON.stringify(summary, null, 2))
      console.log('[LOG] session closed — %d turns, %d audio files, dir: %s', turns.length, this._turnIndex, this.dir)
    } catch {
      // non-fatal
    }
  }
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

function writeWav(filePath: string, chunks: Buffer[], sampleRate: number): void {
  const data   = Buffer.concat(chunks)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)             // PCM chunk size
  header.writeUInt16LE(1, 20)              // PCM format
  header.writeUInt16LE(1, 22)              // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byte rate (mono 16-bit)
  header.writeUInt16LE(2, 32)              // block align
  header.writeUInt16LE(16, 34)             // bit depth
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  fs.writeFileSync(filePath, Buffer.concat([header, data]))
}
