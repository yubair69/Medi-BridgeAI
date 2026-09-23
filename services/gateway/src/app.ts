import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import { healthRoutes } from "./routes/health";
import { registerMemoryProxy } from "./routes/memory";
import { registerVisionProxy } from "./routes/vision";
import { registerCdsProxy } from "./routes/cds";
import { registerPatientTtsProxy } from "./routes/patientTts";
import { requireAuth } from "./middleware/requireAuth";
import { registerTranscribeProxy } from "./ws/transcribeProxy";

export interface BuildAppOptions {
  jwtSecret: string;
  speechPipelineWsUrl: string;
  orchestratorUrl: string;
  visionServiceUrl?: string;
  clinicalNlpUrl?: string;
  speechPipelineHttpUrl?: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(websocketPlugin);
  await app.register(healthRoutes);
  await registerTranscribeProxy(app, { upstreamUrl: options.speechPipelineWsUrl });
  await registerMemoryProxy(app, { orchestratorUrl: options.orchestratorUrl });
  await registerVisionProxy(app, { visionServiceUrl: options.visionServiceUrl ?? "http://localhost:8003" });

  const speechHttp =
    options.speechPipelineHttpUrl ??
    options.speechPipelineWsUrl.replace(/^wss?/, (m) => (m === "wss" ? "https" : "http")).replace(/\/ws\/transcribe$/, "");
  await registerCdsProxy(app, { clinicalNlpUrl: options.clinicalNlpUrl ?? "http://localhost:8002" });
  await registerPatientTtsProxy(app, { speechPipelineHttpUrl: speechHttp });

  // Example of a route boundary that will require auth once real session
  // routes exist (Phase 3+). Registered now so the auth stub has coverage.
  app.get("/session/whoami", { preHandler: requireAuth(options.jwtSecret) }, async (request) => {
    return request.session;
  });

  return app;
}
