import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { analyze } from "./analyze.js";
import {
  analyzers,
  getAnalyzer,
  getAnalyzerIds,
  getProjectGraph,
  hasFederationParticipants,
  loadConfig,
} from "./index.js";
import type { Analyzer, Finding } from "./index.js";

const EXAMPLE_WORKSPACE = join(process.cwd(), "examples/rsbuild-basic");

describe("public API", () => {
  it("exposes the analysis entry points", () => {
    expect(typeof analyze).toBe("function");
    expect(typeof getProjectGraph).toBe("function");
    expect(typeof hasFederationParticipants).toBe("function");
    expect(typeof loadConfig).toBe("function");
  });

  it("exposes the analyzer registry", () => {
    expect(analyzers.length).toBeGreaterThan(0);
    expect(getAnalyzerIds()).toContain("circular-dependency");

    const analyzer: Analyzer | undefined = getAnalyzer("missing-shared");
    expect(analyzer?.id).toBe("missing-shared");
  });

  it("applies a per-check severity override", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE, {
      checks: { "circular-dependency": { severity: "LOW" } },
    });

    const circular = result.results.find(
      (r) => r.analyzerId === "circular-dependency",
    );
    expect(circular).toBeDefined();
    expect(circular!.findings.length).toBeGreaterThan(0);

    const findings: Finding[] = circular!.findings;
    for (const finding of findings) {
      expect(finding.severity).toBe("LOW");
    }
  });

  it("keeps the default severity when no override is set", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);
    const circular = result.results.find(
      (r) => r.analyzerId === "circular-dependency",
    );

    expect(circular!.findings[0].severity).toBe("MEDIUM");
  });
});
