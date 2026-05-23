import type { EndpointDefinition } from "../src/types";
import { ResponseCache, tryHeuristicPathValues } from "./cache";
import type { RequestPlan } from "./http";
import { hasLlmConfigured, planWave2Batch } from "./llm";
import { defaultQuery, mergePlan } from "./utils";

export function needsRequiredBody(ep: EndpointDefinition): boolean {
  return Boolean(ep.parameters.body?.fields.some((f) => f.required));
}

export function hasRequiredPathValues(
  ep: EndpointDefinition,
  plan: RequestPlan
): boolean {
  for (const p of ep.parameters.path) {
    if (!p.required) continue;
    if (!plan.pathValues?.[p.name]) return false;
  }
  return true;
}

function basePlan(
  ep: EndpointDefinition,
  cache: ResponseCache
): RequestPlan {
  return {
    query: defaultQuery(ep),
    pathValues: tryHeuristicPathValues(ep, cache),
  };
}

/**
 * Build request plans for Wave 2:
 * 1. Heuristics for path IDs (fast, deterministic)
 * 2. One batched Anthropic call only for endpoints still missing path or needing body
 */
export async function buildWave2Plans(
  env: Record<string, string>,
  wave2: EndpointDefinition[],
  cache: ResponseCache
): Promise<Map<string, RequestPlan>> {
  const plans = new Map<string, RequestPlan>();
  const needsLlm: EndpointDefinition[] = [];

  for (const ep of wave2) {
    const plan = basePlan(ep, cache);
    const pathOk = hasRequiredPathValues(ep, plan);
    const bodyRequired = needsRequiredBody(ep);

    if (bodyRequired || (ep.parameters.path.some((p) => p.required) && !pathOk)) {
      needsLlm.push(ep);
      plans.set(ep.tool_slug, plan);
    } else {
      plans.set(ep.tool_slug, plan);
    }
  }

  if (needsLlm.length === 0) return plans;

  if (!hasLlmConfigured(env)) {
    return plans;
  }

  const batch = await planWave2Batch(
    env,
    needsLlm,
    cache.summarizeForLlm()
  );

  for (const ep of needsLlm) {
    const existing = plans.get(ep.tool_slug) ?? basePlan(ep, cache);
    const fromLlm = batch.get(ep.tool_slug);
    plans.set(ep.tool_slug, fromLlm ? mergePlan(existing, fromLlm) : existing);
  }

  return plans;
}
