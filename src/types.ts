/** A single endpoint definition as provided in endpoints.json (flattened with app + base_url). */
export type EndpointDefinition = {
  tool_slug: string;
  description: string;
  app: string;
  method: string;
  base_url: string;
  path: string;
  required_scopes: string[];
  parameters: {
    query: ParameterDef[];
    header: ParameterDef[];
    path: ParameterDef[];
    body: {
      content_type: string;
      fields: ParameterDef[];
    } | null;
  };
};

export type ParameterDef = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

/**
 * Classification result for a single endpoint.
 *
 * - "valid" — Endpoint exists and returned a 2xx response (at least one successful call).
 * - "invalid_endpoint" — Endpoint does not exist (404, method not allowed, etc.).
 * - "insufficient_scopes" — Endpoint exists but credentials lack permissions (401, 403).
 * - "error" — Something else went wrong (bad params, server error, timeout, etc.).
 */
export type EndpointStatus =
  | "valid"
  | "invalid_endpoint"
  | "insufficient_scopes"
  | "error";

/** Report for a single endpoint — one of these per endpoint tested */
export type EndpointReport = {
  tool_slug: string;
  method: string;
  path: string;
  app: string;
  status: EndpointStatus;
  http_status_code: number | null;
  /** Explain WHY this endpoint was classified this way — not just the status code. */
  response_summary: string;
  /** Response body or error detail. Truncate large payloads; redact sensitive data. */
  response_body: unknown;
  required_scopes: string[];
  /** Number of HTTP attempts made for this endpoint (including retries). */
  attempts: number;
};

/** The full test report — this is what your agent returns */
export type TestReport = {
  total_endpoints: number;
  results: EndpointReport[];
  summary: {
    valid: number;
    invalid_endpoint: number;
    insufficient_scopes: number;
    error: number;
  };
};
