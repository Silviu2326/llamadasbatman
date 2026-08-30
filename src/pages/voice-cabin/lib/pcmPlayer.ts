export class PcmQueuePlayer {
  private context?: AudioContext;
  private gain?: GainNode;
  // El simulador del CRM ya entrega Float32 a 24 kHz (simStream.onAudio).
  private sampleRate = 24_000;
  private nextStart = 0;
  private active = new Set<AudioBufferSourceNode>();
  private generation = 0;
  private muted = false;
  private phoneFilter = false;
  private entry?: AudioNode;

  constructor(
    private readonly onTelemetry: (telemetry: {
      active: boolean;
      bufferedMs: number;
      level: number;
    }) => void,
  ) {}

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.gain = this.context.createGain();
      this.gain.gain.value = this.muted ? 0 : 1;
      this.gain.connect(this.context.destination);
      this.rewire();
    }
    return this.context;
  }

  // ponytail: two biquads approximate the G.711 narrowband a real call goes through.
  // Add codec-level distortion (µ-law, packet loss) only if the ear test asks for it.
  private rewire(): void {
    const context = this.context;
    if (!context || !this.gain) return;
    if (!this.phoneFilter) {
      this.entry = this.gain;
      return;
    }
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 300;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3400;
    highpass.connect(lowpass).connect(this.gain);
    this.entry = highpass;
  }

  setPhoneFilter(enabled: boolean): void {
    if (enabled === this.phoneFilter) return;
    this.phoneFilter = enabled;
    this.rewire();
  }

  private report(active: boolean, level = 0): void {
    const bufferedMs = this.context
      ? Math.max(0, (this.nextStart - this.context.currentTime) * 1000)
      : 0;
    this.onTelemetry({ active, bufferedMs, level });
  }

  async resume(): Promise<void> {
    await this.ensureContext().resume();
  }

  configure(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }

  enqueue(data: ArrayBuffer): void {
    if (!data.byteLength) return;
    const context = this.ensureContext();
    const floats = new Float32Array(data);
    const audioBuffer = context.createBuffer(1, floats.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(floats);

    let energy = 0;
    for (const sample of floats) energy += sample * sample;
    const level = Math.min(1, Math.sqrt(energy / Math.max(1, floats.length)) * 4);

    const source = context.createBufferSource();
    const currentGeneration = this.generation;
    source.buffer = audioBuffer;
    source.connect(this.entry!);
    const startAt = Math.max(context.currentTime + 0.018, this.nextStart);
    source.start(startAt);
    this.nextStart = startAt + audioBuffer.duration;
    this.active.add(source);
    this.report(true, level);
    source.onended = () => {
      this.active.delete(source);
      if (currentGeneration === this.generation && this.active.size === 0) {
        this.nextStart = 0;
        this.report(false);
      } else if (currentGeneration === this.generation) {
        this.report(true, level);
      }
    };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.01);
    }
  }

  clear(): void {
    this.generation += 1;
    for (const source of this.active) {
      try {
        source.stop();
      } catch {
        // The source may already have ended between iteration and stop().
      }
    }
    this.active.clear();
    this.nextStart = 0;
    this.report(false);
  }

  close(): void {
    this.clear();
    void this.context?.close();
    this.context = undefined;
    this.gain = undefined;
    this.entry = undefined;
  }
}
