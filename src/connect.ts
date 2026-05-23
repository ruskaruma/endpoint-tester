import { loadEndpoints } from "./load-endpoints";
import type { EndpointDefinition } from "./types";

/** Apps that share GOOGLE_ACCESS_TOKEN in the sample endpoints.json. */
const GOOGLE_APPS = new Set(["gmail", "googlecalendar"]);

/**
 * Reads key=value pairs from .env (comments and blank lines skipped).
 * Provided starter helper — you may extend this for additional auth patterns.
 */
export async function loadEnv(
  path = ".env"
): Promise<Record<string, string>> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(
      `Missing ${path}. Copy .env.example to .env and add your API credentials.`
    );
  }

  const env: Record<string, string> = {};
  for (const line of (await file.text()).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return env;
}

function envToken(env: Record<string, string>, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function tokenForApp(app: string, env: Record<string, string>): string | null {
  const perApp = envToken(env, `${app.toUpperCase()}_ACCESS_TOKEN`);
  if (perApp) return perApp;

  if (GOOGLE_APPS.has(app)) {
    return (
      envToken(env, "GOOGLE_ACCESS_TOKEN") ?? envToken(env, "GMAIL_ACCESS_TOKEN")
    );
  }

  return envToken(env, "ACCESS_TOKEN") ?? envToken(env, "API_TOKEN");
}

/**
 * Builds auth headers for an endpoint's app.
 * Supports bearer, API-key header, basic auth, and none via .env naming conventions.
 * See .env.example for variable names.
 */
export function authHeadersForApp(
  app: string,
  env: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const authMode = (env[`${app.toUpperCase()}_AUTH`] ?? env.AUTH_MODE ?? "bearer")
    .toLowerCase()
    .trim();

  if (authMode === "none") return headers;

  if (authMode === "basic") {
    const user = env[`${app.toUpperCase()}_USER`] ?? env.API_USER ?? "";
    const pass = env[`${app.toUpperCase()}_PASS`] ?? env.API_PASS ?? "";
    headers.Authorization = `Basic ${btoa(`${user}:${pass}`)}`;
    return headers;
  }

  if (authMode === "api_key_header") {
    const headerName =
      env[`${app.toUpperCase()}_API_KEY_HEADER`] ?? env.API_KEY_HEADER ?? "X-API-Key";
    const key =
      envToken(env, `${app.toUpperCase()}_API_KEY`) ?? envToken(env, "API_KEY");
    if (key) headers[headerName] = key;
    return headers;
  }

  if (authMode === "api_key_query") {
    return headers;
  }

  const token = tokenForApp(app, env);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/** Query params when AUTH_MODE=api_key_query for that app. */
export function authQueryParamsForApp(
  app: string,
  env: Record<string, string>
): Record<string, string> {
  const authMode = (env[`${app.toUpperCase()}_AUTH`] ?? env.AUTH_MODE ?? "bearer")
    .toLowerCase()
    .trim();

  if (authMode !== "api_key_query") return {};

  const paramName =
    env[`${app.toUpperCase()}_API_KEY_PARAM`] ?? env.API_KEY_PARAM ?? "apikey";
  const key =
    envToken(env, `${app.toUpperCase()}_API_KEY`) ?? envToken(env, "API_KEY");
  if (!key) return {};
  return { [paramName]: key };
}

/** Substitutes {pathParam} placeholders and appends query string parameters. */
export function buildRequestUrl(
  endpoint: EndpointDefinition,
  options: {
    pathValues?: Record<string, string>;
    query?: Record<string, string | number | boolean>;
    env?: Record<string, string>;
  } = {}
): string {
  let path = endpoint.path;
  for (const [name, value] of Object.entries(options.pathValues ?? {})) {
    path = path.replaceAll(`{${name}}`, encodeURIComponent(value));
  }

  const url = new URL(path, endpoint.base_url.replace(/\/$/, "") + "/");

  const mergedQuery = {
    ...authQueryParamsForApp(endpoint.app, options.env ?? {}),
    ...options.query,
  };
  for (const [key, value] of Object.entries(mergedQuery)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function pickProbeEndpoint(
  endpoints: EndpointDefinition[]
): EndpointDefinition | undefined {
  return (
    endpoints.find((e) => e.tool_slug === "GMAIL_GET_PROFILE") ??
    endpoints.find(
      (e) =>
        e.method === "GET" &&
        e.parameters.path.length === 0 &&
        e.parameters.body === null
    )
  );
}

/** Connectivity check: `bun src/connect.ts` */
async function main() {
  const env = await loadEnv();
  console.log("Loaded .env keys:", Object.keys(env).join(", ") || "(none)");

  const probe = pickProbeEndpoint(loadEndpoints());
  if (!probe) {
    console.warn("\nNo probe endpoint found in endpoints.json.\n");
    return;
  }

  const token = tokenForApp(probe.app, env);
  if (!token) {
    console.warn(
      `\nNo access token for app "${probe.app}". Set GOOGLE_ACCESS_TOKEN or ${probe.app.toUpperCase()}_ACCESS_TOKEN in .env`
    );
    console.warn("See PREPARATION.md\n");
    return;
  }

  const url = buildRequestUrl(probe, { env });
  console.log(`\nProbing: ${probe.method} ${url}`);

  const res = await fetch(url, {
    method: probe.method,
    headers: authHeadersForApp(probe.app, env),
  });

  if (res.ok) {
    const data = (await res.json()) as Record<string, unknown>;
    const hint =
      typeof data.emailAddress === "string"
        ? `email=${data.emailAddress}`
        : `keys=${Object.keys(data).slice(0, 5).join(", ")}`;
    console.log(`\n✓ Auth works for ${probe.app} (${probe.tool_slug}). ${hint}`);
  } else {
    const text = await res.text();
    console.error(`\n✗ Probe failed: HTTP ${res.status}`);
    console.error(text.slice(0, 500));
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
