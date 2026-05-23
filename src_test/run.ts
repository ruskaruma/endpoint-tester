import { loadEndpoints } from "../src/load-endpoints";
import { runAgent } from "./agent";
import { validateReport } from "./validate";

/**
 * Your implementation runner — does not touch src/run.ts (friend assignment).
 *
 * Usage: bun run run:test
 */
async function main() {
  console.log("Loading endpoint definitions...");
  const allEndpoints = loadEndpoints();
  console.log(`Found ${allEndpoints.length} endpoints to test.\n`);

  console.log("Running src_test agent...\n");
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
    console.error("\nFix report format and re-run.\n");
    process.exit(1);
  }

  console.log("✓ Report validation passed.");

  console.log("\n=== Results Summary ===");
  console.log(`  Valid:               ${report.summary.valid}`);
  console.log(`  Invalid endpoint:    ${report.summary.invalid_endpoint}`);
  console.log(`  Insufficient scopes: ${report.summary.insufficient_scopes}`);
  console.log(`  Error:               ${report.summary.error}`);
  console.log(`  Total:               ${report.results.length}`);

  const reportPath = "report-test.json";
  await Bun.write(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
