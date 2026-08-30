import WebSocket from "ws";

export type DeepgramFluxTurnEvent =
  | { type: "connected" }
  | { type: "turn.start"; transcript: string }
  | { type: "turn.update"; transcript: string }
  | { type: "turn.eager_end"; transcript: string }
  | { type: "turn.resume"; transcript: string }
  | { type: "turn.end"; transcript: string }
  | { type: "error"; message: string };

export interface DeepgramFluxOptions {
  apiKey: string;
  language: "en" | "es";
  model?: string;
  turnTaking?: "fast" | "balanced" | "natural";
  onEvent: (event: DeepgramFluxTurnEvent) => void;
  onError: (error: Error) => void;
}

interface DeepgramMessage {
  type?: string;
  event?: string;
  transcript?: string;
  description?: string;
  message?: string;
}

/**
 * Deepgram Flux Multilingual adapter.
 *
 * Flux's state machine is intentionally translated to the old internal
 * contract: StartOfTurn/Update/EagerEndOfTurn/TurnResumed/EndOfTurn become
 * turn.start/turn.update/turn.eager_end/turn.resume/turn.end. That keeps the
 * speculative generation and barge-in logic independent from the STT vendor.
 */
export class DeepgramFluxRealtime {
  private socket?: WebSocket;
  private queuedAudio: Buffer[] = [];
  private closing = false;

  constructor(private readonly options: DeepgramFluxOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const endpoint = new URL("wss://api.deepgram.com/v2/listen");
      endpoint.searchParams.set("model", this.options.model || "flux-general-multi");
      endpoint.searchParams.append("language_hint", this.options.language);
      endpoint.searchParams.set("encoding", "linear16");
      endpoint.searchParams.set("sample_rate", "16000");

      const socket = new WebSocket(endpoint, {
        headers: { Authorization: `Token ${this.options.apiKey}` },
      });
      this.socket = socket;

      const connectTimeout = setTimeout(() => {
        const error = new Error("Deepgram Flux connection timed out.");
        reject(error);
        socket.terminate();
      }, 10_000);

      socket.once("open", () => {
        clearTimeout(connectTimeout);
        socket.send(JSON.stringify({
          type: "Configure",
          thresholds: {
            eot_threshold: this.options.turnTaking === "fast" ? 0.62 : this.options.turnTaking === "natural" ? 0.78 : 0.7,
            eager_eot_threshold: this.options.turnTaking === "fast" ? 0.32 : 0.4,
            eot_timeout_ms: this.options.turnTaking === "fast" ? 1200 : this.options.turnTaking === "natural" ? 2400 : 1800,
          },
        }));
        for (const chunk of this.queuedAudio) socket.send(chunk);
        this.queuedAudio = [];
        this.options.onEvent({ type: "connected" });
        resolve();
      });

      socket.on("message", (data, isBinary) => {
        if (isBinary) return;
        let message: DeepgramMessage;
        try {
          message = JSON.parse(data.toString()) as DeepgramMessage;
        } catch {
          this.fail(new Error("Deepgram returned an unreadable event."));
          return;
        }

        const event = message.event || message.type;
        const transcript = typeof message.transcript === "string" ? message.transcript : "";
        switch (event) {
          case "StartOfTurn":
            this.options.onEvent({ type: "turn.start", transcript });
            break;
          case "Update":
            this.options.onEvent({ type: "turn.update", transcript });
            break;
          case "EagerEndOfTurn":
            this.options.onEvent({ type: "turn.eager_end", transcript });
            break;
          case "TurnResumed":
            this.options.onEvent({ type: "turn.resume", transcript });
            break;
          case "EndOfTurn":
            this.options.onEvent({ type: "turn.end", transcript });
            break;
          case "Error":
          case "ConfigureFailure":
            this.fail(new Error(message.description || message.message || "Deepgram Flux rejected the stream."));
            break;
        }
      });

      socket.on("error", error => {
        clearTimeout(connectTimeout);
        this.options.onError(error);
        reject(error);
      });

      socket.on("close", () => {
        clearTimeout(connectTimeout);
        if (!this.closing) this.options.onError(new Error("Deepgram closed the transcription stream."));
      });
    });
  }

  sendAudio(chunk: Buffer): void {
    if (this.closing) return;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
      return;
    }

    // Keep a short bridge while the WebSocket handshake completes.
    this.queuedAudio.push(chunk);
    if (this.queuedAudio.length > 20) this.queuedAudio.shift();
  }

  closeGracefully(): void {
    if (!this.socket || this.closing) return;
    this.closing = true;
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "CloseStream" }));
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

  private fail(error: Error): void {
    if (this.closing) return;
    this.options.onEvent({ type: "error", message: error.message });
    this.options.onError(error);
  }
}
