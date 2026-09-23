import type { BuildAppOptions } from "../src/app";

/** Shared defaults for tests that don't exercise the transcribe/memory proxies themselves. */
export const TEST_APP_OPTIONS: BuildAppOptions = {
  jwtSecret: "test-secret",
  speechPipelineWsUrl: "ws://localhost:0/ws/transcribe",
  orchestratorUrl: "http://localhost:0",
  visionServiceUrl: "http://localhost:0",
};
