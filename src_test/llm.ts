import type { EndpointDefinition } from "../src/types";
import { Semaphore, concurrencyFromEnv } from "./semaphore";
import { parseJsonFromLlm } from "./utils";
import type { RequestPlan } from "./http";

const ANTHROPIC_VERSION = "2023-06-01";

let llmSemaphore: Semaphore | null = null;

function withLlmSlot<T>(
  env: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  if (!llmSemaphore) {
    llmSemaphore = new Semaphore(
      concurrencyFromEnv(env, "LLM_CONCURRENCY", 2)
    );
  }
  return llmSemaphore.use(fn);
}

export function hasLlmConfigured(env: Record<string, string>): boolean {
  return Boolean(env.LLM_API_KEY?.trim() && env.LLM_API_URL?.trim());
}

async function completeJson(
  env: Record<string, string>,
  userPrompt: string
): Promise<Record<string, unknown>> {
  return withLlmSlot(env, () => completeJsonInner(env, userPrompt));
}

async function completeJsonInner(
  env: Record<string, string>,
  userPrompt: string
): Promise<Record<string, unknown>> {
  const apiKey = env.LLM_API_KEY?.trim();
  const apiUrl = env.LLM_API_URL?.trim();
  const model = env.LLM_MODEL?.trim() || "claude-sonnet-4-20250514";

  if (!apiKey || !apiUrl) {
    throw new Error(
      "LLM not configured. Set LLM_API_KEY and LLM_API_URL in .env (see .env.example)."
    );
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}: ${raw.slice(0, 500)}`);
  }

  const data = JSON.parse(raw) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  if (!text) throw new Error("Anthropic returned empty content");

  const parsed = parseJsonFromLlm(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM response was not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** One Anthropic call for all Wave 2 endpoints that still need bodies or path IDs. */
export async function planWave2Batch(
  env: Record<string, string>,
  endpoints: EndpointDefinition[],
  cacheSummary: string
): Promise<Map<string, RequestPlan>> {
  const endpointBlocks = endpoints
    .map((ep) => {
      const pathParams = ep.parameters.path
        .map((p) => `  - ${p.name} (required=${p.required}): ${p.description}`)
        .join("\n");
      const bodyFields = ep.parameters.body?.fields
        .map((f) => `  - ${f.name} (required=${f.required}): ${f.description}`)
        .join("\n");
      return `### ${ep.tool_slug}
method: ${ep.method}
path: ${ep.path}
description: ${ep.description}
path params:
${pathParams || "  (none)"}
body fields:
${bodyFields || "  (none)"}`;
    })
    .join("\n\n");

  const prompt = `You plan minimal valid HTTP requests to test REST endpoints. Return ONLY valid JSON.

Prior successful responses:
${cacheSummary}

Endpoints to plan (use real IDs from prior responses; minimal bodies; maxResults 5 for lists):
${endpointBlocks}

Return JSON:
{
  "plans": {
    "TOOL_SLUG": {
      "pathValues": { "paramName": "value" },
      "query": { "maxResults": 5 },
      "body": { }
    }
  }
}

Include only slugs listed above. For Gmail "raw" use minimal base64url RFC2822. Keep payloads small.`;

  const json = await completeJson(env, prompt);
  const plansRaw = json.plans;
  const out = new Map<string, RequestPlan>();

  if (!plansRaw || typeof plansRaw !== "object") return out;

  for (const ep of endpoints) {
    const entry = (plansRaw as Record<string, unknown>)[ep.tool_slug];
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    out.set(ep.tool_slug, {
      pathValues: asStringRecord(row.pathValues),
      query: asQueryRecord(row.query),
      body: row.body,
    });
  }

  return out;
}

export async function suggestRetryFix(
  env: Record<string, string>,
  ep: EndpointDefinition,
  lastPlan: RequestPlan,
  lastStatus: number,
  lastBody: unknown
): Promise<Partial<RequestPlan>> {
  const prompt = `An API test request failed. Return ONLY valid JSON with fixes.

Endpoint: ${ep.tool_slug} ${ep.method} ${ep.path}
Last request plan: ${JSON.stringify(lastPlan)}
HTTP status: ${lastStatus}
Response: ${JSON.stringify(lastBody).slice(0, 3000)}

Return JSON with any of: pathValues, query, body — only fields that should change to fix a bad request (400/422).`;

  const json = await completeJson(env, prompt);
  return {
    pathValues: asStringRecord(json.pathValues),
    query: asQueryRecord(json.query),
    body: json.body,
  };
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function asQueryRecord(
  value: unknown
): Record<string, string | number | boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined && v !== null) out[k] = v as string | number | boolean;
  }
  return Object.keys(out).length ? out : undefined;
}
