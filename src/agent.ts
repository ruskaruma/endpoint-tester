import type { EndpointDefinition, TestReport } from "./types";

/**
 * Implement your endpoint-testing agent here.
 *
 * Signature (do not change):
 *   runAgent({ endpoints }) → TestReport
 *
 * Building blocks (provided):
 *   - loadEndpoints() from ./load-endpoints.ts
 *   - loadEnv, authHeadersForApp, buildRequestUrl from ./connect.ts
 *   - fetch() for HTTP and for your LLM API
 *
 * Deliverables:
 *   - This file (agent implementation)
 *   - report.json via: bun run run
 *   - ARCHITECTURE.md at repo root
 */
export async function runAgent(params: {
  endpoints: EndpointDefinition[];
}): Promise<TestReport> {
  void params;
  throw new Error("Not implemented — build your agent in src/agent.ts");
}
