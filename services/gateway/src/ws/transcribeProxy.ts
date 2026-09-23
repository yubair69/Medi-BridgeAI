/**
 * WebSocket routing proxy: client <-> gateway <-> speech-pipeline.
 *
 * Gateway boundary rule (AGENT_INSTRUCTIONS.md Section 2): this service owns
 * WS session mgmt/routing and must NOT do ML inference or clinical logic --
 * it forwards binary audio frames upstream and JSON transcript events back
 * verbatim, with no interpretation of either.
 */

import type { FastifyInstance } from "fastify";
import { WebSocket as UpstreamWebSocket, type RawData } from "ws";

export interface TranscribeProxyOptions {
  upstreamUrl: string;
}

export async function registerTranscribeProxy(
  app: FastifyInstance,
  options: TranscribeProxyOptions,
): Promise<void> {
  app.get("/ws/transcribe", { websocket: true }, (clientSocket) => {
    const upstream = new UpstreamWebSocket(options.upstreamUrl);
    const pendingFromClient: Buffer[] = [];
    let upstreamOpen = false;
    let clientPackets = 0;
    let clientBytes = 0;

    upstream.on("open", () => {
      upstreamOpen = true;
      app.log.info("transcribeProxy: upstream connection established to speech-pipeline");
      for (const chunk of pendingFromClient.splice(0)) {
        upstream.send(chunk);
      }
    });

    upstream.on("message", (data: RawData) => {
      clientSocket.send(data.toString());
    });

    upstream.on("close", () => {
      if (clientSocket.readyState === clientSocket.OPEN) {
        clientSocket.close();
      }
    });

    upstream.on("error", (err: Error) => {
      // Fail loud, not silent (Blueprint Section 1 Principle 3): tell the
      // client the speech-pipeline is unreachable instead of dropping
      // audio into a void.
      if (clientSocket.readyState === clientSocket.OPEN) {
        clientSocket.send(
            JSON.stringify({
            type: "error",
            utterance_id: "n/a",
            error: `speech-pipeline unavailable: ${err.message}`,
          }),
        );
        clientSocket.close(1011);
      }
    });

    clientSocket.on("message", (data: RawData) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      clientPackets++;
      clientBytes += buf.byteLength;
      if (clientPackets === 1 || clientPackets % 100 === 0) {
        app.log.info(
          `transcribeProxy: forwarded ${clientPackets} packets (${clientBytes} bytes) to speech-pipeline`,
        );
      }
      if (upstreamOpen) {
        upstream.send(buf);
      } else {
        pendingFromClient.push(buf);
      }
    });

    clientSocket.on("close", () => {
      upstream.close();
    });
  });
}
