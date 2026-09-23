import type { FastifyInstance } from "fastify";

export interface CdsProxyOptions {
  clinicalNlpUrl: string;
}

export async function registerCdsProxy(app: FastifyInstance, options: CdsProxyOptions): Promise<void> {
  const base = options.clinicalNlpUrl.replace(/\/$/, "");

  app.post("/cds/check-interactions", async (request, reply) => {
    try {
      const upstream = await fetch(`${base}/cds/check-interactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const body = await upstream.json();
      return reply.status(upstream.status).send(body);
    } catch (err) {
      return reply.status(503).send({
        error: "clinical_nlp_unavailable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
