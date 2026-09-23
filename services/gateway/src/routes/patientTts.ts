import type { FastifyInstance } from "fastify";

export interface PatientTtsProxyOptions {
  speechPipelineHttpUrl: string;
}

export async function registerPatientTtsProxy(
  app: FastifyInstance,
  options: PatientTtsProxyOptions,
): Promise<void> {
  const base = options.speechPipelineHttpUrl.replace(/\/$/, "");

  app.post("/tts/patient-instructions", async (request, reply) => {
    try {
      const upstream = await fetch(`${base}/tts/patient-instructions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const body = await upstream.json();
      return reply.status(upstream.status).send(body);
    } catch (err) {
      return reply.status(503).send({
        error: "speech_pipeline_unavailable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
