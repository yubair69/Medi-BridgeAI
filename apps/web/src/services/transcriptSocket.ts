import type { TranscriptEvent } from "@medibridge/shared-types";

export interface TranscriptSocketOptions {
  url: string;
  onEvent: (event: TranscriptEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  WebSocketImpl?: typeof WebSocket;
}

/** Thin wrapper around the browser WebSocket, injectable for testing.
 * Malformed server messages produce a visible error event rather than
 * throwing/being silently dropped (Blueprint Section 1 Principle 3). */
export class TranscriptSocket {
  private socket: WebSocket | null = null;
  private pendingChunks: ArrayBuffer[] = [];

  constructor(private readonly options: TranscriptSocketOptions) {}

  connect(): void {
    const Impl = this.options.WebSocketImpl ?? WebSocket;
    const socket = new Impl(this.options.url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      for (const pending of this.pendingChunks.splice(0)) {
        socket.send(pending);
      }
      this.options.onOpen?.();
    };
    socket.onclose = () => {
      this.pendingChunks = [];
      this.options.onClose?.();
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as TranscriptEvent;
        this.options.onEvent(parsed);
      } catch {
        this.options.onEvent({
          type: "error",
          utterance_id: "n/a",
          session_id: "n/a",
          segment: null,
          error: "Received a malformed transcript event from the server",
          latency_ms: null,
          translation: null,
          translation_error: null,
          tts: null,
          tts_error: null,
          speaker: null,
          speaker_error: null,
          back_translation: null,
          back_translation_error: null,
          miscommunication: null,
          miscommunication_error: null,
          confidence_v2: null,
          confidence_band: null,
          entities: null,
          entities_error: null,
          translation_entities: null,
          translation_entities_error: null,
          emergency: null,
          emergency_error: null,
          emotion: null,
          emotion_error: null,
          risk: null,
          risk_error: null,
        });
      }
    };
    this.socket = socket;
  }

  sendChunk(chunk: ArrayBuffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
    } else if (this.socket?.readyState === WebSocket.CONNECTING) {
      if (this.pendingChunks.length < 50) {
        this.pendingChunks.push(chunk);
      }
    }
  }

  close(): void {
    this.pendingChunks = [];
    this.socket?.close();
    this.socket = null;
  }
}
