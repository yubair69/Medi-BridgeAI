/**
 * Proxy to vision-service (Blueprint Phase 8: camera consent + frame analysis).
 * Routing only — no reinterpretation of vision-service response bodies.
 * Vision features degrade gracefully when the service is unreachable
 * (Blueprint §1 Principle 3: fail loud on audio pipeline; vision is
 * supplemental — 503 is surfaced but does not block the consultation).
 */

import type { FastifyInstance } from "fastify";

export interface VisionProxyOptions {
  visionServiceUrl: string;
}

export async function registerVisionProxy(app: FastifyInstance, options: VisionProxyOptions): Promise<void> {
  const base = options.visionServiceUrl.replace(/\/$/, "");

  app.post("/sessions/:sessionId/vision/consent", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      const upstream = await fetch(`${base}/sessions/${encodeURIComponent(sessionId)}/consent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const body = await upstream.json();
      return reply.status(upstream.status).send(body);
    } catch (err) {
      return reply.status(503).send({
        error: "vision_service_unavailable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/sessions/:sessionId/vision/frame", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      const upstream = await fetch(`${base}/analyze/frame`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(request.body as object), session_id: sessionId }),
      });
      const body = await upstream.json();
      return reply.status(upstream.status).send(body);
    } catch (err) {
      return reply.status(503).send({
        error: "vision_service_unavailable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/sessions/:sessionId/vision/state", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      const upstream = await fetch(`${base}/sessions/${encodeURIComponent(sessionId)}/detection-state`);
      const body = await upstream.json();
      return reply.status(upstream.status).send(body);
    } catch (err) {
      return reply.status(503).send({
        error: "vision_service_unavailable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
