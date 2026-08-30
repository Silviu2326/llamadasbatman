export class StreamingPcm16Encoder {
  private input: number[] = [];
  private readPosition = 0;
  private output: number[] = [];

  constructor(
    private readonly inputRate: number,
    private readonly outputRate = 16_000,
    private readonly frameSamples = 1_600,
  ) {
    if (inputRate < outputRate) {
      throw new Error("Microphone sample rate is lower than the requested STT rate.");
    }
  }

  push(samples: Float32Array): ArrayBuffer[] {
    for (const sample of samples) this.input.push(sample);
    const ratio = this.inputRate / this.outputRate;

    while (this.readPosition + 1 < this.input.length) {
      const index = Math.floor(this.readPosition);
      const fraction = this.readPosition - index;
      const first = this.input[index] ?? 0;
      const second = this.input[index + 1] ?? first;
      const interpolated = first + (second - first) * fraction;
      this.output.push(Math.max(-1, Math.min(1, interpolated)));
      this.readPosition += ratio;
    }

    const consumed = Math.floor(this.readPosition);
    if (consumed > 0) {
      this.input.splice(0, consumed);
      this.readPosition -= consumed;
    }

    return this.takeFrames(false);
  }

  flush(): ArrayBuffer[] {
    return this.takeFrames(true);
  }

  private takeFrames(includePartial: boolean): ArrayBuffer[] {
    const frames: ArrayBuffer[] = [];
    while (this.output.length >= this.frameSamples || (includePartial && this.output.length)) {
      const count = Math.min(this.frameSamples, this.output.length);
      const frame = new ArrayBuffer(count * 2);
      const view = new DataView(frame);
      for (let index = 0; index < count; index += 1) {
        const sample = this.output[index] ?? 0;
        const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(index * 2, Math.round(pcm), true);
      }
      this.output.splice(0, count);
      frames.push(frame);
    }
    return frames;
  }
}
