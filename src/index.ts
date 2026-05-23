import { loadEndpoints } from "./load-endpoints";

const all = loadEndpoints();
const byApp = new Map<string, (typeof all)[number][]>();
for (const ep of all) {
  const list = byApp.get(ep.app) ?? [];
  list.push(ep);
  byApp.set(ep.app, list);
}

console.log(`\n=== Endpoint Summary ===\n`);
console.log(`Total endpoints: ${all.length}\n`);

for (const [app, eps] of byApp) {
  const base = eps[0]?.base_url ?? "";
  console.log(`--- ${app} (${base}) ---`);
  for (const ep of eps) {
    const pathParams =
      ep.parameters.path.length > 0
        ? `  [path: ${ep.parameters.path.map((p) => p.name).join(", ")}]`
        : "";
    const body = ep.parameters.body ? "  [has body]" : "";
    console.log(
      `  ${ep.method.padEnd(6)} ${ep.path.padEnd(52)} ${ep.tool_slug}${pathParams}${body}`
    );
  }
  console.log();
}

console.log("Required scopes (union):");
const scopes = new Set(all.flatMap((e) => e.required_scopes));
for (const scope of scopes) {
  console.log(`  ${scope}`);
}
console.log();
