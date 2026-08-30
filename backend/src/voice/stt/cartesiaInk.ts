import WebSocket from "ws";

export type CartesiaTurnEvent =
  | { type: "connected"; request_id?: string }
  | { type: "turn.start"; request_id?: string }
  | { type: "turn.update"; transcript: string; request_id?: string }
  | { type: "turn.eager_end"; transcript: string; request_id?: string }
  | { type: "turn.resume"; request_id?: string }
  | { type: "turn.end"; transcript: string; request_id?: string }
  | { type: "error"; message: string; title?: string; error_code?: string };

export interface CartesiaOptions {
  apiKey: string;
  version: string;
  model?: string;
  turnTaking?: "fast" | "balanced" | "natural";
  onEvent: (event: CartesiaTurnEvent) => void;
  onError: (error: Error) => void;
}

export class CartesiaRealtime {
  private socket?: WebSocket;
  private queuedAudio: Buffer[] = [];
  private closing = false;

  constructor(private readonly options: CartesiaOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const endpoint = new URL("wss://api.cartesia.ai/stt/turns/websocket");
      endpoint.searchParams.set("model", this.options.model || "ink-2");
      endpoint.searchParams.set("encoding", "pcm_s16le");
      endpoint.searchParams.set("sample_rate", "16000");

      const socket = new WebSocket(endpoint, {
        headers: {
          "X-API-Key": this.options.apiKey,
          "Cartesia-Version": this.options.version,
        },
      });
      this.socket = socket;

      const connectTimeout = setTimeout(() => {
        reject(new Error("Cartesia connection timed out."));
        socket.terminate();
      }, 10_000);

      socket.once("open", () => {
        clearTimeout(connectTimeout);
        socket.send(
          JSON.stringify({
            type: "config",
            turn: {
              start_threshold: 0.8,
              eager_end_threshold: this.options.turnTaking === "fast" ? 0.32 : 0.4,
              end_threshold: 0.2,
              end_timeout_ms: this.options.turnTaking === "fast" ? 1200 : this.options.turnTaking === "natural" ? 2400 : 1800,
            },
          }),
        );
        for (const chunk of this.queuedAudio) socket.send(chunk);
        this.queuedAudio = [];
        resolve();
      });

      socket.on("message", (data, isBinary) => {
        if (isBinary) return;
        try {
          const event = JSON.parse(data.toString()) as CartesiaTurnEvent;
          this.options.onEvent(event);
          if (event.type === "error") {
            this.options.onError(new Error(event.message));
          }
        } catch {
          this.options.onError(new Error("Cartesia returned an unreadable event."));
        }
      });

      socket.on("error", (error) => {
        clearTimeout(connectTimeout);
        this.options.onError(error);
        reject(error);
      });

      socket.on("close", () => {
        if (!this.closing) {
          this.options.onError(new Error("Cartesia closed the transcription stream."));
        }
      });
    });
  }

  sendAudio(chunk: Buffer): void {
    if (this.closing) return;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
      return;
    }

    // Two seconds of 100 ms frames is enough to bridge normal connection setup.
    this.queuedAudio.push(chunk);
    if (this.queuedAudio.length > 20) this.queuedAudio.shift();
  }

  closeGracefully(): void {
    if (!this.socket || this.closing) return;
    this.closing = true;
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "close" }));
      setTimeout(() => this.socket?.close(), 1200).unref();
    } else {
      this.socket.terminate();
    }
  }

  cancel(): void {
    this.closing = true;
    this.queuedAudio = [];
    this.socket?.terminate();
  }
}
