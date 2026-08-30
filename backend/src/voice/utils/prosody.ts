import type { EmotionReading } from "../pipelines/vendravaProtocol";

/**
 * Reads how the caller sounded from signals the pipeline already carries: the raw
 * 16 kHz PCM the browser streams, the turn timestamps, and the barge-in count.
 *
 * ponytail: no pitch tracking — energy, tempo and hesitation already separate
 * rushed/tense from tired/disengaged, which is what the guru acts on. Pitch and
 * valence are what a real prosody model (Hume) is for; swap it in behind
 * EmotionReading and nothing downstream changes.
 */
export class ProsodyMeter {
  private collecting = false;
  private samples = 0;
  private energy = 0;
  private startedAt = 0;
  private interruptions = 0;
  private replyDelayMs?: number;

  constructor(private readonly sampleRate = 16_000) {}

  beginTurn(now: number, agentFinishedAt?: number): void {
    this.collecting = true;
    this.samples = 0;
    this.energy = 0;
    this.startedAt = now;
    this.replyDelayMs =
      agentFinishedAt !== undefined ? Math.max(0, now - agentFinishedAt) : undefined;
  }

  countInterruption(): void {
    this.interruptions += 1;
  }

  pushAudio(frame: Buffer): void {
    if (!this.collecting) return;
    for (let offset = 0; offset + 1 < frame.length; offset += 2) {
      const sample = frame.readInt16LE(offset) / 32768;
      this.energy += sample * sample;
    }
    this.samples += frame.length >> 1;
  }

  endTurn(now: number, transcript: string): EmotionReading {
    this.collecting = false;
    const spokenSeconds = Math.max(0.001, this.samples / this.sampleRate);
    const turnSeconds = Math.max(0.001, (now - this.startedAt) / 1000);
    const rms = this.samples ? Math.sqrt(this.energy / this.samples) : 0;
    const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

    // The browser runs AGC, so absolute level is already normalised. 0.16 RMS is
    // about a confident speaking voice; scale that to the middle of the range.
    const arousal = Math.min(1, rms * 3.2);
    const wordsPerMinute = words ? Math.round((words / Math.min(spokenSeconds, turnSeconds)) * 60) : 0;

    return {
      source: "derived",
      arousal: Number(arousal.toFixed(2)),
      wordsPerMinute,
      replyDelayMs: this.replyDelayMs === undefined ? undefined : Math.round(this.replyDelayMs),
      interruptions: this.interruptions,
      label: describe(arousal, wordsPerMinute, this.replyDelayMs, this.interruptions),
    };
  }

  reset(): void {
    this.collecting = false;
    this.interruptions = 0;
    this.replyDelayMs = undefined;
  }
}

export function describe(
  arousal: number,
  wordsPerMinute: number,
  replyDelayMs: number | undefined,
  interruptions: number,
): string {
  const cues: string[] = [];

  if (wordsPerMinute >= 190) cues.push("talking fast");
  else if (wordsPerMinute > 0 && wordsPerMinute <= 110) cues.push("talking slowly");

  if (arousal >= 0.7) cues.push("loud and emphatic");
  else if (arousal > 0 && arousal <= 0.22) cues.push("quiet, low energy");

  if (replyDelayMs !== undefined) {
    if (replyDelayMs >= 1500) cues.push("hesitated before answering");
    else if (replyDelayMs <= 250) cues.push("answered instantly");
  }

  if (interruptions >= 2) cues.push(`has cut in ${interruptions} times`);

  return cues.length ? cues.join(", ") : "steady, neutral delivery";
}
