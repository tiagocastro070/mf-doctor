import { discoverWorkspace } from "../src/core/discovery.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const exampleWorkspace = join(__dirname, "../examples/rsbuild-basic");

  console.log("Discovering participants in:", exampleWorkspace);
  console.log("---");

  try {
    const result = await discoverWorkspace(exampleWorkspace);

    console.log("Workspace Root:", result.workspaceRoot);
    console.log("Workspace Patterns:", result.workspacePatterns);
    console.log("Total Packages Scanned:", result.totalPackagesScanned);
    console.log("Participants Found:", result.participants.length);
    console.log("---");

    for (const participant of result.participants) {
      console.log(`\nParticipant: ${participant.name}`);
      console.log(`  Project Root: ${participant.projectRoot}`);
      console.log(`  Config Path: ${participant.configPath}`);
      console.log(`  Bundler: ${participant.bundler}`);
      console.log(`  Parse Status: ${participant.parseStatus}`);
      console.log(
        `  Dependencies: ${Object.keys(participant.dependencies).join(", ") || "(none)"}`,
      );
      console.log(
        `  DevDependencies: ${Object.keys(participant.devDependencies).length} packages`,
      );
    }

    console.log("\n---");
    console.log("✓ Discovery completed successfully!");
  } catch (error) {
    console.error("✗ Discovery failed:", error);
    process.exit(1);
  }
}

main();
