import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { analyze } from "../core/analyze.js";
import { formatJson } from "./formatters.js";
import { loadIgnoreFile, applyIgnoreRules } from "../core/ignore.js";

const EXAMPLE_WORKSPACE = join(process.cwd(), "examples/rsbuild-basic");

describe("formatJson", () => {
  it("produces parseable JSON with expected structure", async () => {
    const rawResult = await analyze(EXAMPLE_WORKSPACE);
    const ignoreConfig = loadIgnoreFile(EXAMPLE_WORKSPACE);
    const filterResult = applyIgnoreRules(
      rawResult.results.flatMap((r) => r.findings),
      ignoreConfig,
    );
    const filteredResults = rawResult.results.map((r) => ({
      ...r,
      findings: r.findings.filter((f) =>
        filterResult.findings.some(
          (ff) => ff.id === f.id && ff.message === f.message,
        ),
      ),
    }));
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const f of filterResult.findings) {
      counts[f.severity]++;
    }
    const result = {
      ...rawResult,
      results: filteredResults,
      totalFindings: filterResult.findings.length,
      findingsBySeverity: counts,
      ignoredCount: filterResult.ignoredCount,
    };

    const out = formatJson(result);
    const parsed = JSON.parse(out) as Record<string, unknown>;

    expect(parsed).toHaveProperty("graph");
    expect(parsed).toHaveProperty("results");
    expect(parsed).toHaveProperty("totalFindings");
    expect(parsed).toHaveProperty("findingsBySeverity");
    expect(parsed).toHaveProperty("totalDurationMs");
    expect(parsed).toHaveProperty("ignoredCount");

    expect(parsed.graph).toBeDefined();
    expect(typeof parsed.graph).toBe("object");
    expect((parsed.graph as Record<string, unknown>).workspaceRoot).toBe(
      EXAMPLE_WORKSPACE,
    );
    expect(
      Array.isArray((parsed.graph as Record<string, unknown>).participants),
    ).toBe(true);
    expect(Array.isArray((parsed.graph as Record<string, unknown>).edges)).toBe(
      true,
    );

    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.totalFindings).toBe(filterResult.findings.length);
    expect(parsed.findingsBySeverity).toEqual({
      LOW: expect.any(Number),
      MEDIUM: expect.any(Number),
      HIGH: expect.any(Number),
    });
    expect(parsed.totalDurationMs).toBeGreaterThan(0);
    expect(parsed.ignoredCount).toBe(filterResult.ignoredCount);
  });

  it("serializes findings with id, severity, message, participants, details, suggestions", async () => {
    const rawResult = await analyze(EXAMPLE_WORKSPACE);
    const result = {
      ...rawResult,
      totalFindings: rawResult.results.reduce(
        (n, r) => n + r.findings.length,
        0,
      ),
      findingsBySeverity: rawResult.findingsBySeverity,
      ignoredCount: 0,
    };

    const out = formatJson(result);
    const parsed = JSON.parse(out) as {
      results: Array<{
        analyzerId: string;
        findings: Array<{
          id: string;
          severity: string;
          message: string;
          participants: string[];
          details?: Record<string, unknown>;
          suggestions?: string[];
        }>;
      }>;
    };

    const withFindings = parsed.results.filter((r) => r.findings.length > 0);
    expect(withFindings.length).toBeGreaterThan(0);

    const firstFinding = withFindings[0].findings[0];
    expect(firstFinding).toHaveProperty("id");
    expect(firstFinding).toHaveProperty("severity");
    expect(firstFinding).toHaveProperty("message");
    expect(firstFinding).toHaveProperty("participants");
    expect(Array.isArray(firstFinding.participants)).toBe(true);
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(firstFinding.severity);
  });
});
