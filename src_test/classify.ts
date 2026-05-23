import type { EndpointStatus } from "../src/types";

export function classifyHttpStatus(status: number): EndpointStatus {
  if (status >= 200 && status < 300) return "valid";
  if (status === 404 || status === 405) return "invalid_endpoint";
  if (status === 401 || status === 403) return "insufficient_scopes";
  return "error";
}

export function shouldRetryWithFix(
  status: number,
  attempt: number,
  maxAttempts: number
): boolean {
  if (attempt >= maxAttempts) return false;
  return status === 400 || status === 422;
}
