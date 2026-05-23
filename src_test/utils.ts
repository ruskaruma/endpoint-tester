import type { EndpointDefinition, EndpointReport, EndpointStatus } from "../src/types";
import type { RequestPlan } from "./http";

const MAX_BODY_CHARS = 4000;

export function needsLlmPlanning(ep: EndpointDefinition): boolean {
  const requiredPath = ep.parameters.path.some((p) => p.required);
  const requiredBody =
    ep.parameters.body?.fields.some((f) => f.required) ?? false;
  return requiredPath || requiredBody;
}

export function defaultQuery(
  ep: EndpointDefinition
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  for (const param of ep.parameters.query) {
    if (param.name === "maxResults" && param.type === "integer") {
      query.maxResults = 5;
    }
  }
  return query;
}

export function summarizeStatus(
  status: EndpointStatus,
  httpStatus: number | null,
  detail: string
): string {
  return `${status} (HTTP ${httpStatus ?? "n/a"}): ${detail}`;
}

export function sanitizeForReport(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const redacted = text
    .replace(/[A-Za-z0-9_-]{50,}/g, "[redacted:long_token]")
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[redacted:email]"
    );
  if (redacted.length <= MAX_BODY_CHARS) {
    try {
      return JSON.parse(redacted);
    } catch {
      return redacted;
    }
  }
  return `${redacted.slice(0, MAX_BODY_CHARS)}… [truncated]`;
}

export function buildSummary(results: EndpointReport[]) {
  return {
    valid: results.filter((r) => r.status === "valid").length,
    invalid_endpoint: results.filter((r) => r.status === "invalid_endpoint")
      .length,
    insufficient_scopes: results.filter((r) => r.status === "insufficient_scopes")
      .length,
    error: results.filter((r) => r.status === "error").length,
  };
}

export function mergePlan(
  base: RequestPlan,
  patch: Partial<RequestPlan>
): RequestPlan {
  return {
    pathValues: { ...base.pathValues, ...patch.pathValues },
    query: { ...base.query, ...patch.query },
    body: patch.body !== undefined ? patch.body : base.body,
  };
}

export function parseJsonFromLlm(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  return JSON.parse(candidate);
}
