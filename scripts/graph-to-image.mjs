#!/usr/bin/env node
/**
 * Generates mfdoc-topology.svg from the rsbuild-basic example.
 * Run: node scripts/graph-to-image.mjs
 * Requires: npm run build, and @mermaid-js/mermaid-cli (npx)
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const topologyPath = join(root, "topology.mmd");
const outputPath = join(root, "../mfdoc-documentation/static/img/mfdoc-topology.svg");

// Generate mermaid via mfdoc
execSync(`node dist/cli/index.js graph examples/rsbuild-basic -f mermaid -o topology.mmd`, {
  cwd: root,
  stdio: "inherit",
});

// Strip ```mermaid and ``` wrappers for mmdc
let content = readFileSync(topologyPath, "utf8");
content = content.replace(/^```mermaid\n/, "").replace(/\n```\s*$/, "");
writeFileSync(topologyPath, content);

// Convert to SVG
execSync(
  `npx @mermaid-js/mermaid-cli -i topology.mmd -o "${outputPath}" -b transparent`,
  { cwd: root, stdio: "inherit" },
);

console.log(`\n✓ Image saved to ${outputPath}`);
