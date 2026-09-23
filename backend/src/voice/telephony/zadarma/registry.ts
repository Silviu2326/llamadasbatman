import { randomUUID } from 'node:crypto'
import type { SipVoiceCall } from './audioServer'

type Entry = {
  key: string; deadline: NodeJS.Timeout; claimed: boolean
  start: (hangup: () => void) => Promise<SipVoiceCall>
  hangup?: () => void
}

/** One-use UUID capability, created before dialing and never supplied by a caller. */
export class SipCallRegistry {
  private entries = new Map<string, Entry>()
  constructor(private maxConcurrent = 1, private pendingMs = 65_000) {}
  reserve(key: string, start: Entry['start']): string {
    if ([...this.entries.values()].some(item => item.key === key)) throw new Error('ZADARMA_LEAD_ALREADY_CALLING')
    if (this.entries.size >= this.maxConcurrent) throw new Error('ZADARMA_CAPACITY_REACHED')
    const id = randomUUID()
    const deadline = setTimeout(() => this.release(id), this.pendingMs)
    deadline.unref()
    this.entries.set(id, { key, start, deadline, claimed: false })
    return id
  }
  async claim(id: string, hangup: () => void): Promise<SipVoiceCall> {
    const entry = this.entries.get(id)
    if (!entry || entry.claimed) throw new Error('ZADARMA_UNKNOWN_OR_USED_SESSION')
    entry.claimed = true // Atomic before any asynchronous work.
    entry.hangup = hangup
    clearTimeout(entry.deadline)
    try {
      const call = await entry.start(hangup)
      return { ...call, finish: async reason => {
        try { await call.finish(reason) } finally { this.release(id) }
      } }
    } catch (error) { this.release(id); throw error }
  }
  release(id: string): void {
    const entry = this.entries.get(id)
    if (entry) clearTimeout(entry.deadline)
    this.entries.delete(id)
  }
  cancel(id: string): void {
    this.entries.get(id)?.hangup?.()
    this.release(id)
  }
  get size(): number { return this.entries.size }
}
