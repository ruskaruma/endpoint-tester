import { runAgent } from "./agent";
import { loadEndpoints } from "./load-endpoints";
import type { EndpointDefinition, TestReport } from "./types";

/**
 * Runner script — do NOT modify this file.
 *
 * Loads endpoint definitions, calls your runAgent(), validates output, writes report.json.
 *
 * Usage: bun src/run.ts
 */

function validateReport(
  report: TestReport,
  inputEndpoints: EndpointDefinition[]
): string[] {
  const errors: string[] = [];

  if (report.total_endpoints !== inputEndpoints.length) {
    errors.push(
      `total_endpoints is ${report.total_endpoints}, expected ${inputEndpoints.length}`
    );
  }

  const inputBySlug = new Map(inputEndpoints.map((e) => [e.tool_slug, e]));
  const reportSlugs = new Set<string>();

  for (const result of report.results) {
    if (reportSlugs.has(result.tool_slug)) {
      errors.push(`Duplicate result for endpoint: ${result.tool_slug}`);
    }
    reportSlugs.add(result.tool_slug);

    const input = inputBySlug.get(result.tool_slug);
    if (!input) {
      errors.push(`Unexpected result for unknown endpoint: ${result.tool_slug}`);
      continue;
    }

    const validStatuses = [
      "valid",
      "invalid_endpoint",
      "insufficient_scopes",
      "error",
    ];
    if (!validStatuses.includes(result.status)) {
      errors.push(
        `Invalid status "${result.status}" for ${result.tool_slug}. Must be one of: ${validStatuses.join(", ")}`
      );
    }
    if (!("response_body" in result)) {
      errors.push(`Missing response_body for ${result.tool_slug}`);
    }
    if (typeof result.attempts !== "number" || result.attempts < 1) {
      errors.push(
        `Invalid attempts for ${result.tool_slug} (expected a positive number)`
      );
    }
    if (!result.app) {
      errors.push(`Missing app for ${result.tool_slug}`);
    }
    if (!Array.isArray(result.required_scopes)) {
      errors.push(`Missing required_scopes for ${result.tool_slug}`);
    }
    if (result.method !== input.method || result.path !== input.path) {
      errors.push(
        `${result.tool_slug}: method/path in report must match endpoints.json`
      );
    }
    if (result.app !== input.app) {
      errors.push(`${result.tool_slug}: app in report must match endpoints.json`);
    }
  }

  for (const slug of inputBySlug.keys()) {
    if (!reportSlugs.has(slug)) {
      errors.push(`Missing result for endpoint: ${slug}`);
    }
  }

  const summaryTotal =
    report.summary.valid +
    report.summary.invalid_endpoint +
    report.summary.insufficient_scopes +
    report.summary.error;
  if (summaryTotal !== report.results.length) {
    errors.push(
      `Summary counts (${summaryTotal}) don't match results length (${report.results.length})`
    );
  }

  return errors;
}

async function main() {
  console.log("Loading endpoint definitions...");
  const allEndpoints = loadEndpoints();
  console.log(`Found ${allEndpoints.length} endpoints to test.\n`);

  console.log("Running agent...\n");
  const startTime = Date.now();

  const report = await runAgent({ endpoints: allEndpoints });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nAgent completed in ${elapsed}s.`);

  const validationErrors = validateReport(report, allEndpoints);
  if (validationErrors.length > 0) {
    console.error("\n=== Report Validation Errors ===");
    for (const err of validationErrors) {
      console.error(`  ✗ ${err}`);
    }
    console.error("\nYour report has format issues. Fix them and re-run.\n");
    process.exit(1);
  }

  console.log("✓ Report validation passed.");

  console.log("\n=== Results Summary ===");
  console.log(`  Valid:               ${report.summary.valid}`);
  console.log(`  Invalid endpoint:    ${report.summary.invalid_endpoint}`);
  console.log(`  Insufficient scopes: ${report.summary.insufficient_scopes}`);
  console.log(`  Error:               ${report.summary.error}`);
  console.log(`  Total:               ${report.results.length}`);

  const reportPath = "report.json";
  await Bun.write(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Not implemented")) {
    console.error("\n✗ runAgent() is not implemented yet.");
    console.error("  Edit src/agent.ts, then run: bun src/run.ts\n");
  } else {
    console.error("Fatal error:", err);
  }
  process.exit(1);
});
