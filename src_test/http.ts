import { authHeadersForApp, buildRequestUrl } from "../src/connect";
import type { EndpointDefinition } from "../src/types";

export type RequestPlan = {
  pathValues?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
};

export type CallResult = {
  status: number;
  body: unknown;
  rawText: string;
};

export async function callEndpoint(
  ep: EndpointDefinition,
  env: Record<string, string>,
  plan: RequestPlan
): Promise<CallResult> {
  const url = buildRequestUrl(ep, {
    env,
    pathValues: plan.pathValues,
    query: plan.query,
  });

  const headers: Record<string, string> = {
    ...authHeadersForApp(ep.app, env),
  };

  let bodyPayload: string | undefined;
  if (
    plan.body !== undefined &&
    plan.body !== null &&
    ["POST", "PUT", "PATCH"].includes(ep.method.toUpperCase())
  ) {
    headers["Content-Type"] =
      ep.parameters.body?.content_type ?? "application/json";
    bodyPayload = JSON.stringify(plan.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: ep.method,
      headers,
      body: bodyPayload,
      signal: controller.signal,
    });

    const rawText = await res.text();
    let body: unknown = rawText || null;
    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch {
      body = { _raw: rawText.slice(0, 2000) };
    }

    return { status: res.status, body, rawText };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 0, body: { error: message }, rawText: message };
  } finally {
    clearTimeout(timeout);
  }
}
