import type {
  EndpointDefinition,
  EndpointReport,
  EndpointStatus,
} from "../src/types";
import { classifyHttpStatus, shouldRetryWithFix } from "./classify";
import { ResponseCache } from "./cache";
import { callEndpoint, type RequestPlan } from "./http";
import { hasLlmConfigured, suggestRetryFix } from "./llm";
import {
  hasRequiredPathValues,
  needsRequiredBody,
} from "./planner";
import {
  defaultQuery,
  mergePlan,
  sanitizeForReport,
  summarizeStatus,
} from "./utils";

const MAX_ATTEMPTS = 3;

export async function testOneEndpoint(
  ep: EndpointDefinition,
  env: Record<string, string>,
  cache: ResponseCache,
  initialPlan?: RequestPlan
): Promise<EndpointReport> {
  let plan: RequestPlan = initialPlan ?? {
    query: defaultQuery(ep),
    pathValues: {},
  };

  if (initialPlan && needsRequiredBody(ep) && initialPlan.body === undefined) {
    return errorReport(
      ep,
      null,
      1,
      "POST body required but not in plan (configure LLM or fix batch plan)"
    );
  }

  if (
    initialPlan &&
    ep.parameters.path.some((p) => p.required) &&
    !hasRequiredPathValues(ep, plan)
  ) {
    return errorReport(
      ep,
      null,
      1,
      "Required path parameters missing from plan"
    );
  }

  let lastStatus: number | null = null;
  let lastBody: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callEndpoint(ep, env, plan);
    lastStatus = result.status;
    lastBody = result.body;

    if (result.status === 0) {
      return buildReport(
        ep,
        "error",
        0,
        attempt,
        summarizeStatus("error", 0, `Network error: ${result.rawText}`),
        result.body
      );
    }

    const status = classifyHttpStatus(result.status);

    if (status === "valid") {
      cache.set({
        tool_slug: ep.tool_slug,
        method: ep.method,
        path: ep.path,
        http_status: result.status,
        body: result.body,
      });
      return buildReport(
        ep,
        status,
        result.status,
        attempt,
        summarizeStatus(
          status,
          result.status,
          describeSuccess(ep, result.body)
        ),
        result.body
      );
    }

    if (status === "invalid_endpoint" || status === "insufficient_scopes") {
      return buildReport(
        ep,
        status,
        result.status,
        attempt,
        summarizeStatus(status, result.status, describeFailure(result.body)),
        result.body
      );
    }

    if (shouldRetryWithFix(result.status, attempt, MAX_ATTEMPTS)) {
      if (hasLlmConfigured(env)) {
        try {
          const fix = await suggestRetryFix(
            env,
            ep,
            plan,
            result.status,
            result.body
          );
          plan = mergePlan(plan, fix);
          continue;
        } catch {
          // fall through
        }
      }
    }

    return buildReport(
      ep,
      status,
      result.status,
      attempt,
      summarizeStatus(status, result.status, describeFailure(result.body)),
      result.body
    );
  }

  const finalStatus = classifyHttpStatus(lastStatus ?? 0);
  return buildReport(
    ep,
    finalStatus,
    lastStatus,
    MAX_ATTEMPTS,
    summarizeStatus(
      finalStatus,
      lastStatus,
      `Exhausted ${MAX_ATTEMPTS} attempts`
    ),
    lastBody
  );
}

function describeSuccess(ep: EndpointDefinition, body: unknown): string {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.messages)) {
      return `Returned ${obj.messages.length} message refs. Endpoint is working.`;
    }
    if (Array.isArray(obj.items)) {
      return `Returned ${obj.items.length} items. Endpoint is working.`;
    }
    if (typeof obj.emailAddress === "string") {
      return `Profile returned. Endpoint is working.`;
    }
  }
  return `${ep.method} ${ep.path} succeeded. Endpoint is working.`;
}

function describeFailure(body: unknown): string {
  if (body && typeof body === "object") {
    const err = body as Record<string, unknown>;
    if (err.error && typeof err.error === "object") {
      const nested = err.error as Record<string, unknown>;
      if (nested.message) return String(nested.message);
    }
    if (err.error) return String(err.error);
    if (err.message) return String(err.message);
  }
  return "Request did not succeed.";
}

function buildReport(
  ep: EndpointDefinition,
  status: EndpointStatus,
  httpStatus: number | null,
  attempts: number,
  summary: string,
  body: unknown
): EndpointReport {
  return {
    tool_slug: ep.tool_slug,
    method: ep.method,
    path: ep.path,
    app: ep.app,
    status,
    http_status_code: httpStatus,
    response_summary: summary,
    response_body: sanitizeForReport(body),
    required_scopes: ep.required_scopes,
    attempts,
  };
}

function errorReport(
  ep: EndpointDefinition,
  httpStatus: number | null,
  attempts: number,
  message: string
): EndpointReport {
  return buildReport(ep, "error", httpStatus, attempts, message, {
    error: message,
  });
}
