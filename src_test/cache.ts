import type { EndpointDefinition } from "../src/types";

export type CacheEntry = {
  tool_slug: string;
  method: string;
  path: string;
  http_status: number;
  body: unknown;
};

const PREVIEW_CHARS = 2500;

export class ResponseCache {
  private entries: CacheEntry[] = [];

  set(entry: CacheEntry): void {
    const idx = this.entries.findIndex((e) => e.tool_slug === entry.tool_slug);
    if (idx >= 0) this.entries[idx] = entry;
    else this.entries.push(entry);
  }

  list(): CacheEntry[] {
    return [...this.entries];
  }

  summarizeForLlm(): string {
    if (this.entries.length === 0) {
      return "No prior successful responses in cache.";
    }
    return this.entries
      .map((e) => {
        const preview = JSON.stringify(e.body ?? {}).slice(0, PREVIEW_CHARS);
        return `- ${e.tool_slug} ${e.method} ${e.path} (HTTP ${e.http_status}): ${preview}`;
      })
      .join("\n");
  }
}

export function tryHeuristicPathValues(
  ep: EndpointDefinition,
  cache: ResponseCache
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const param of ep.parameters.path) {
    if (!param.required) continue;
    const value = findIdInCache(param.name, cache);
    if (value) out[param.name] = value;
  }
  return out;
}

function findIdInCache(paramName: string, cache: ResponseCache): string | null {
  for (const entry of cache.list()) {
    if (entry.http_status < 200 || entry.http_status >= 300) continue;
    const found = walkForField(entry.body, [paramName, "id"]);
    if (found) return found;
  }
  return null;
}

function walkForField(
  node: unknown,
  keys: string[],
  depth = 0
): string | null {
  if (depth > 8 || node === null || node === undefined) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = walkForField(item, keys, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const key of keys) {
      if (typeof obj[key] === "string" && obj[key]) return obj[key];
    }
    for (const value of Object.values(obj)) {
      const hit = walkForField(value, keys, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}
