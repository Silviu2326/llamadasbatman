import { StreamingPcm16Encoder } from "./pcm";

interface MicrophoneOptions {
  onAudio: (frame: ArrayBuffer) => void;
  onLevel: (telemetry: { level: number; peak: number; clipped: boolean }) => void;
}

export class BrowserMicrophone {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private capture?: AudioWorkletNode;
  private silentGain?: GainNode;
  private encoder?: StreamingPcm16Encoder;

  constructor(private readonly options: MicrophoneOptions) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.context = new AudioContext({ latencyHint: "interactive" });
    await this.context.audioWorklet.addModule("/pcm-capture.worklet.js");
    await this.context.resume();

    this.encoder = new StreamingPcm16Encoder(this.context.sampleRate);
    this.source = this.context.createMediaStreamSource(this.stream);
    this.capture = new AudioWorkletNode(this.context, "vendrava-pcm-capture");
    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;

    this.capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const samples = event.data;
      let sum = 0;
      let peak = 0;
      for (const sample of samples) {
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      this.options.onLevel({
        level: Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 5),
        peak,
        clipped: peak >= 0.985,
      });
      for (const frame of this.encoder?.push(samples) ?? []) this.options.onAudio(frame);
    };

    this.source.connect(this.capture);
    this.capture.connect(this.silentGain);
    this.silentGain.connect(this.context.destination);
  }

  stop(): void {
    for (const frame of this.encoder?.flush() ?? []) this.options.onAudio(frame);
    this.capture?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    void this.context?.close();
    this.options.onLevel({ level: 0, peak: 0, clipped: false });
    this.context = undefined;
    this.stream = undefined;
    this.capture = undefined;
    this.source = undefined;
    this.silentGain = undefined;
    this.encoder = undefined;
  }
}
