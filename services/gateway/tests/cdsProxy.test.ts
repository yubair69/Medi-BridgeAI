import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

let app: FastifyInstance | undefined;
let upstream: Server | undefined;

afterEach(async () => {
  await app?.close();
  upstream?.close();
  app = undefined;
  upstream = undefined;
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });
}

describe("gateway cds and patient tts proxy", () => {
  it("forwards POST /cds/check-interactions to clinical-nlp", async () => {
    upstream = createServer((req, res) => {
      expect(req.url).toBe("/cds/check-interactions");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ interactions: [], allergies: [], total_alerts: 0, has_critical: false }));
    });
    const upstreamPort = await listen(upstream);

    app = await buildApp({
      jwtSecret: "test-secret",
      speechPipelineWsUrl: "ws://localhost:0",
      orchestratorUrl: "http://localhost:0",
      clinicalNlpUrl: `http://127.0.0.1:${upstreamPort}`,
    });

    const response = await app.inject({
      method: "POST",
      url: "/cds/check-interactions",
      payload: { medications: ["Paracetamol"] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ interactions: [], allergies: [], total_alerts: 0, has_critical: false });
  });

  it("returns 503 when clinical-nlp is unreachable for CDS check", async () => {
    app = await buildApp({
      jwtSecret: "test-secret",
      speechPipelineWsUrl: "ws://localhost:0",
      orchestratorUrl: "http://localhost:0",
      clinicalNlpUrl: "http://127.0.0.1:1", // guaranteed unreachable port
    });

    const response = await app.inject({
      method: "POST",
      url: "/cds/check-interactions",
      payload: { medications: ["Paracetamol"] },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("clinical_nlp_unavailable");
  });

  it("forwards POST /tts/patient-instructions to speech-pipeline", async () => {
    upstream = createServer((req, res) => {
      expect(req.url).toBe("/tts/patient-instructions");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ audio_base64: "AQID", sample_rate: 16000, format: "pcm16", spoken_script: "नमस्ते" }));
    });
    const upstreamPort = await listen(upstream);

    app = await buildApp({
      jwtSecret: "test-secret",
      speechPipelineWsUrl: "ws://localhost:0",
      orchestratorUrl: "http://localhost:0",
      speechPipelineHttpUrl: `http://127.0.0.1:${upstreamPort}`,
    });

    const response = await app.inject({
      method: "POST",
      url: "/tts/patient-instructions",
      payload: { medications: ["Paracetamol"], language: "hi" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().spoken_script).toBe("नमस्ते");
  });
});
