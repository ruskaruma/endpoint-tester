import { loadEnv } from "../src/connect";
import type { EndpointDefinition, TestReport } from "../src/types";
import { ResponseCache } from "./cache";
import { buildWave2Plans } from "./planner";
import { concurrencyFromEnv, mapWithConcurrency } from "./semaphore";
import { testOneEndpoint } from "./test-one";
import { buildSummary, needsLlmPlanning } from "./utils";

/**
 * Reference implementation in src_test/ — friends keep stub in src/agent.ts.
 *
 * Flow: Wave 1 (semaphore-limited HTTP) → batch plan Wave 2 → Wave 2 (semaphore-limited HTTP).
 */
export async function runAgent(params: {
  endpoints: EndpointDefinition[];
}): Promise<TestReport> {
  const env = await loadEnv();
  const cache = new ResponseCache();
  const httpConcurrency = concurrencyFromEnv(env, "HTTP_CONCURRENCY", 4);

  const wave1 = params.endpoints.filter((ep) => !needsLlmPlanning(ep));
  const wave2 = params.endpoints.filter((ep) => needsLlmPlanning(ep));

  const wave1Results = await mapWithConcurrency(
    wave1,
    httpConcurrency,
    (ep) => testOneEndpoint(ep, env, cache)
  );

  const wave2Plans = await buildWave2Plans(env, wave2, cache);

  const wave2Results = await mapWithConcurrency(
    wave2,
    httpConcurrency,
    (ep) =>
      testOneEndpoint(ep, env, cache, wave2Plans.get(ep.tool_slug))
  );

  const bySlug = new Map(
    [...wave1Results, ...wave2Results].map((r) => [r.tool_slug, r])
  );
  const ordered = params.endpoints.map((ep) => bySlug.get(ep.tool_slug)!);

  return {
    total_endpoints: params.endpoints.length,
    results: ordered,
    summary: buildSummary(ordered),
  };
}
