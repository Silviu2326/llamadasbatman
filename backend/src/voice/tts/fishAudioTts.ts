import { decode, encode } from "@msgpack/msgpack";
import WebSocket from "ws";
import { TTS_SAMPLE_RATE } from "../pipelines/vendravaProtocol";

export interface FishAudioOptions {
  apiKey: string;
  model?: "s2.1-pro" | "s2.1-pro-free" | "s2-pro";
  voiceId?: string;
  speed: number;
  onAudio: (chunk: Buffer) => void;
  onError: (error: Error) => void;
}

interface FishEvent {
  event?: string;
  audio?: Uint8Array | Buffer;
  reason?: string;
  message?: string;
}

interface TextQueue {
  iterable: AsyncIterable<string>;
  push(text: string): void;
  close(): void;
}

function createTextQueue(): TextQueue {
  const pending: string[] = [];
  const waiters: Array<(result: IteratorResult<string>) => void> = [];
  let closed = false;

  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            if (pending.length) return Promise.resolve({ value: pending.shift()!, done: false });
            if (closed) return Promise.resolve({ value: undefined, done: true });
            return new Promise<IteratorResult<string>>(resolve => waiters.push(resolve));
          },
        };
      },
    },
    push(text) {
      if (closed || !text.trim()) return;
      const resolve = waiters.shift();
      if (resolve) resolve({ value: text, done: false });
      else pending.push(text);
    },
    close() {
      if (closed) return;
      closed = true;
      while (waiters.length) waiters.shift()!({ value: undefined, done: true });
    },
  };
}

/**
 * Fish Audio S2.1 Pro realtime TTS adapter.
 *
 * The public Fish SDK currently types the realtime backend selector around its
 * older S1 names, so this adapter uses the documented MsgPack WebSocket wire
 * protocol directly and pins the production backend to s2.1-pro.
 */
export class FishAudioSpeechTask {
  private socket?: WebSocket;
  private readyPromise?: Promise<void>;
  private resolveReady?: () => void;
  private rejectReady?: (error: Error) => void;
  private finishPromise?: Promise<void>;
  private resolveFinished?: () => void;
  private queue = createTextQueue();
  private cancelled = false;
  private ready = false;

  constructor(private readonly options: FishAudioOptions) {}

  connect(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.finishPromise = new Promise<void>(resolve => {
      this.resolveFinished = resolve;
    });

    const socket = new WebSocket("wss://api.fish.audio/v1/tts/live", {
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        model: this.options.model || "s2.1-pro",
      },
    });
    this.socket = socket;

    const timeout = setTimeout(() => {
      this.fail(new Error("Fish Audio connection timed out."));
      socket.terminate();
    }, 10_000);

    socket.on("open", () => {
      socket.send(encode({
        event: "start",
        request: {
          text: "",
          ...(this.options.voiceId ? { reference_id: this.options.voiceId } : {}),
          format: "pcm",
          sample_rate: TTS_SAMPLE_RATE,
          prosody: { speed: this.options.speed, volume: 0 },
          latency: "balanced",
          chunk_length: 100,
          normalize: true,
        },
      }));
      this.ready = true;
      clearTimeout(timeout);
      this.resolveReady?.();
      void this.pumpText();
    });

    socket.on("message", (raw, isBinary) => {
      if (!isBinary || this.cancelled) return;
      try {
        const event = decode(raw as Uint8Array) as FishEvent;
        if (event.event === "audio" && event.audio) {
          this.options.onAudio(Buffer.from(event.audio));
        } else if (event.event === "finish") {
          if (event.reason === "error") this.fail(new Error(event.message || "Fish Audio task failed."));
          else this.resolveFinished?.();
        }
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error("Fish Audio returned an unreadable event."));
      }
    });

    socket.on("error", error => this.fail(error));
    socket.on("close", () => {
      clearTimeout(timeout);
      if (!this.cancelled && !this.ready) this.rejectReady?.(new Error("Fish Audio closed before the speech task started."));
      this.resolveFinished?.();
    });

    return this.readyPromise;
  }

  async sendText(text: string): Promise<void> {
    if (!text.trim() || this.cancelled) return;
    await this.connect();
    this.queue.push(text.trim());
  }

  async finish(): Promise<void> {
    if (this.cancelled) return;
    await this.connect();
    this.queue.close();
    const finished = this.finishPromise ?? Promise.resolve();
    await Promise.race([
      finished,
      new Promise<void>(resolve => setTimeout(resolve, 20_000)),
    ]);
    this.socket?.close();
  }

  cancel(): void {
    this.cancelled = true;
    this.queue.close();
    this.resolveFinished?.();
    this.socket?.terminate();
  }

  private async pumpText(): Promise<void> {
    try {
      for await (const text of this.queue.iterable) {
        if (this.cancelled || this.socket?.readyState !== WebSocket.OPEN) return;
        this.socket.send(encode({ event: "text", text }));
      }
      if (!this.cancelled && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(encode({ event: "stop" }));
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error("Fish Audio text stream failed."));
    }
  }

  private fail(error: Error): void {
    if (this.cancelled) return;
    this.rejectReady?.(error);
    this.resolveFinished?.();
    this.options.onError(error);
  }
}
