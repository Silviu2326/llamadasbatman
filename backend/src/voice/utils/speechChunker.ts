/**
 * Turns a token stream into short, speakable phrases. The first phrase is kept
 * intentionally small for low TTFA; later chunks still prefer punctuation so
 * Fish Audio receives natural prosodic units instead of arbitrary token slices.
 */
export class SpeechChunker {
  private buffer = "";
  private emitted = 0;

  constructor(
    private readonly minimum = 18,
    private readonly maximum = 64,
  ) {}

  // ponytail: only the opener has to be tiny — it sets TTFA. Every later chunk is
  // synthesized in isolation, so short ones reset Fish Audio's prosody mid-sentence.
  // Shrink the multipliers if first-audio latency regresses.
  private get min(): number {
    return this.emitted === 0 ? this.minimum : this.minimum * 3;
  }

  private get max(): number {
    return this.emitted === 0 ? this.maximum : Math.round(this.maximum * 2.5);
  }

  push(delta: string): string[] {
    this.buffer += delta;
    return this.takeReadyChunks();
  }

  flush(): string[] {
    const final = this.buffer.trim();
    this.buffer = "";
    return final ? [final] : [];
  }

  private takeReadyChunks(): string[] {
    const chunks: string[] = [];

    while (this.buffer.trimStart().length >= this.min) {
      this.buffer = this.buffer.trimStart();
      const boundary = this.findNaturalBoundary();

      if (boundary === -1) {
        if (this.buffer.length < this.max) break;
        const split = this.findWhitespaceSplit();
        const chunk = this.buffer.slice(0, split).trim();
        this.buffer = this.buffer.slice(split);
        if (chunk) {
          chunks.push(chunk);
          this.emitted += 1;
        }
        continue;
      }

      const chunk = this.buffer.slice(0, boundary).trim();
      this.buffer = this.buffer.slice(boundary);
      if (chunk) {
        chunks.push(chunk);
        this.emitted += 1;
      }
    }

    return chunks;
  }

  private findNaturalBoundary(): number {
    const segment = this.buffer.slice(this.min - 1, this.max + 8);
    const match = /[.!?](?:[\"’”])?\s|[,;:](?:[\"’”])?\s/.exec(segment);
    if (!match || match.index === undefined) return -1;
    return this.min - 1 + match.index + match[0].length;
  }

  private findWhitespaceSplit(): number {
    const preferred = this.buffer.lastIndexOf(" ", this.max);
    return preferred >= this.min ? preferred + 1 : this.max;
  }
}
