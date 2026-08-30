import WebSocket from "ws";
import { TTS_SAMPLE_RATE } from "../pipelines/vendravaProtocol";

interface MiniMaxSpeechOptions {
  apiKey: string;
  voiceId: string;
  model: "speech-2.8-turbo" | "speech-2.8-hd";
  speed: number;
  onAudio: (chunk: Buffer) => void;
  onError: (error: Error) => void;
}

interface MiniMaxEvent {
  event?: string;
  is_final?: boolean;
  data?: { audio?: string };
  base_resp?: { status_code?: number; status_msg?: string };
}

export class MiniMaxSpeechTask {
  private socket?: WebSocket;
  private readyPromise?: Promise<void>;
  private resolveReady?: () => void;
  private rejectReady?: (error: Error) => void;
  private finishPromise?: Promise<void>;
  private resolveFinished?: () => void;
  private cancelled = false;
  private ready = false;

  constructor(private readonly options: MiniMaxSpeechOptions) {}

  connect(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.finishPromise = new Promise<void>((resolve) => {
      this.resolveFinished = resolve;
    });

    const socket = new WebSocket("wss://api.minimax.io/ws/v1/t2a_v2", {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
    });
    this.socket = socket;

    const timeout = setTimeout(() => {
      const error = new Error("MiniMax connection timed out.");
      this.rejectReady?.(error);
      socket.terminate();
    }, 10_000);

    socket.on("message", (raw, isBinary) => {
      if (isBinary || this.cancelled) return;
      let event: MiniMaxEvent;
      try {
        event = JSON.parse(raw.toString()) as MiniMaxEvent;
      } catch {
        this.fail(new Error("MiniMax returned an unreadable event."));
        return;
      }

      const statusCode = event.base_resp?.status_code ?? 0;
      if (statusCode !== 0 || event.event === "task_failed") {
        this.fail(
          new Error(event.base_resp?.status_msg || `MiniMax task failed (${statusCode}).`),
        );
        return;
      }

      if (event.event === "connected_success") {
        socket.send(
          JSON.stringify({
            event: "task_start",
            model: this.options.model,
            language_boost: "English",
            voice_setting: {
              voice_id: this.options.voiceId,
              speed: this.options.speed,
              vol: 1,
              pitch: 0,
              english_normalization: true,
            },
            audio_setting: {
              sample_rate: TTS_SAMPLE_RATE,
              bitrate: 128000,
              format: "pcm",
              channel: 1,
            },
          }),
        );
      } else if (event.event === "task_started") {
        clearTimeout(timeout);
        this.ready = true;
        this.resolveReady?.();
      }

      const hexAudio = event.data?.audio;
      if (hexAudio) this.options.onAudio(Buffer.from(hexAudio, "hex"));

      if (event.event === "task_finished") {
        this.resolveFinished?.();
      }
    });

    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => {
      clearTimeout(timeout);
      if (!this.cancelled && !this.ready) {
        this.rejectReady?.(new Error("MiniMax closed before the speech task started."));
      }
      this.resolveFinished?.();
    });

    return this.readyPromise;
  }

  async sendText(text: string): Promise<void> {
    if (!text.trim() || this.cancelled) return;
    await this.connect();
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("MiniMax socket is not open.");
    }
    this.socket.send(JSON.stringify({ event: "task_continue", text: text.trim() }));
  }

  async finish(): Promise<void> {
    if (this.cancelled) return;
    await this.connect();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event: "task_finish" }));
    }
    const finished = this.finishPromise ?? Promise.resolve();
    await Promise.race([
      finished,
      new Promise<void>((resolve) => setTimeout(resolve, 20_000)),
    ]);
    this.socket?.close();
  }

  cancel(): void {
    this.cancelled = true;
    this.resolveFinished?.();
    this.socket?.terminate();
  }

  private fail(error: Error): void {
    if (this.cancelled) return;
    this.rejectReady?.(error);
    this.resolveFinished?.();
    this.options.onError(error);
  }
}
