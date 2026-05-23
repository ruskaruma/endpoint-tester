/**
 * Structural sanity check for the assignment starter kit.
 * Usage: bun src/check.ts
 */
import { loadEndpoints } from "./load-endpoints";

const endpoints = loadEndpoints();
const errors: string[] = [];

const slugs = endpoints.map((e) => e.tool_slug);
const slugSet = new Set(slugs);
if (slugSet.size !== slugs.length) {
  errors.push("Duplicate tool_slug values in endpoints.json");
}

for (const ep of endpoints) {
  if (!ep.base_url.startsWith("http")) {
    errors.push(`${ep.tool_slug}: invalid base_url`);
  }
  if (!ep.path.startsWith("/")) {
    errors.push(`${ep.tool_slug}: path should start with /`);
  }
  const placeholders = ep.path.match(/\{[^}]+\}/g) ?? [];
  const pathParamNames = new Set(ep.parameters.path.map((p) => p.name));
  for (const ph of placeholders) {
    const name = ph.slice(1, -1);
    if (!pathParamNames.has(name)) {
      errors.push(
        `${ep.tool_slug}: path has {${name}} but parameters.path does not declare it`
      );
    }
  }
}

console.log("=== Starter kit check ===\n");
console.log(`Endpoints loaded: ${endpoints.length}`);
console.log(`Apps: ${[...new Set(endpoints.map((e) => e.app))].join(", ")}\n`);

if (errors.length > 0) {
  console.error("Errors:");
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log("✓ endpoints.json structure looks valid.");
console.log("\nNext: implement src/agent.ts, then run: bun src/run.ts");
