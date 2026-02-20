import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { reactVersionDriftAnalyzer } from "./reactVersionDrift.js";
import { getProjectGraph, analyze } from "../analyze.js";
import type { ProjectGraph, FederationParticipant } from "../types.js";

const EXAMPLE_WORKSPACE = join(process.cwd(), "examples/rsbuild-basic");

function createMockParticipant(
  name: string,
  reactVersion: string | null,
  options?: {
    resolvedDependencies?: Record<string, string>;
    resolvedDevDependencies?: Record<string, string>;
  },
): FederationParticipant {
  return {
    name,
    projectRoot: `/mock/${name}`,
    configPath: `/mock/${name}/rsbuild.config.ts`,
    bundler: "rsbuild",
    federationConfig: {
      participantName: name,
      projectRoot: `/mock/${name}`,
      name: name.replace("@", "").replace("/", "-"),
      exposes: {},
      remotes: {},
      shared: {},
    },
    dependencies: reactVersion
      ? { react: reactVersion, "react-dom": reactVersion }
      : {},
    devDependencies: {},
    resolvedDependencies: options?.resolvedDependencies,
    resolvedDevDependencies: options?.resolvedDevDependencies,
    parseStatus: "complete",
  };
}

function createMockGraph(participants: FederationParticipant[]): ProjectGraph {
  return {
    workspaceRoot: "/mock",
    participants,
    edges: [],
  };
}

describe("reactVersionDriftAnalyzer", () => {
  describe("with example workspace", () => {
    it("detects React version drift in example workspace", async () => {
      const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
      const result = reactVersionDriftAnalyzer.analyze(graph);

      expect(result.analyzerId).toBe("react-version-drift");
      expect(result.findings.length).toBeGreaterThan(0);

      const driftFinding = result.findings.find(
        (f) => f.severity === "HIGH" && f.message.includes("react"),
      );
      expect(driftFinding).toBeDefined();
      expect(driftFinding!.message).toContain("Multiple");
      expect(driftFinding!.participants).toHaveLength(4);
    });

    it("detects drift via full analyze pipeline", async () => {
      const result = await analyze(EXAMPLE_WORKSPACE);

      expect(result.totalFindings).toBeGreaterThan(0);
      expect(result.findingsBySeverity.HIGH).toBeGreaterThan(0);

      const reactDriftResult = result.results.find(
        (r) => r.analyzerId === "react-version-drift",
      );
      expect(reactDriftResult).toBeDefined();
      expect(reactDriftResult!.findings.length).toBeGreaterThan(0);
    });
  });

  describe("version detection", () => {
    it("returns no findings when all versions match", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", "^18.3.1"),
        createMockParticipant("remote-a", "^18.3.1"),
        createMockParticipant("remote-b", "^18.3.1"),
      ]);

      const result = reactVersionDriftAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("detects drift when versions differ", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", "^18.3.1"),
        createMockParticipant("remote-a", "18.2.0"),
        createMockParticipant("remote-b", "^18.3.1"),
      ]);

      const result = reactVersionDriftAnalyzer.analyze(graph);

      const highFindings = result.findings.filter((f) => f.severity === "HIGH");
      expect(highFindings.length).toBeGreaterThan(0);

      const reactFinding = highFindings.find((f) =>
        f.message.includes("react"),
      );
      expect(reactFinding).toBeDefined();
      expect(reactFinding!.message).toContain("18.2.0");
      expect(reactFinding!.message).toContain("18.3.1");
    });

    it("normalizes version prefixes for comparison", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", "^18.3.1"),
        createMockParticipant("remote-a", "~18.3.1"),
        createMockParticipant("remote-b", "18.3.1"),
      ]);

      const result = reactVersionDriftAnalyzer.analyze(graph);

      const highFindings = result.findings.filter((f) => f.severity === "HIGH");
      expect(highFindings).toHaveLength(0);
    });

    it("handles participants without React dependency", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", "^18.3.1"),
        createMockParticipant("library", null),
      ]);

      const result = reactVersionDriftAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("detects drift when resolved versions differ but declared ranges match", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", "^18.0.0", {
          resolvedDependencies: { react: "18.0.1", "react-dom": "18.0.1" },
        }),
        createMockParticipant("remote-a", "^18.0.0", {
          resolvedDependencies: { react: "18.2.0", "react-dom": "18.2.0" },
        }),
      ]);

      const result = reactVersionDriftAnalyzer.analyze(graph);

      const highFindings = result.findings.filter((f) => f.severity === "HIGH");
      expect(highFindings.length).toBeGreaterThan(0);
      const reactFinding = highFindings.find((f) =>
        f.message.includes("react"),
      );
      expect(reactFinding).toBeDefined();
      expect(reactFinding!.message).toContain("18.0.1");
      expect(reactFinding!.message).toContain("18.2.0");
    });
  });

  describe("finding details", () => {
    it("includes version grouping in details", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", "^18.3.1"),
        createMockParticipant("remote-a", "18.2.0"),
      ]);

      const result = reactVersionDriftAnalyzer.analyze(graph);

      const finding = result.findings.find((f) => f.severity === "HIGH");
      expect(finding).toBeDefined();
      expect(finding!.details).toHaveProperty("versions");
      expect(finding!.details).toHaveProperty("package");
    });

    it("includes suggestions for fixing drift", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", "^18.3.1"),
        createMockParticipant("remote-a", "18.2.0"),
      ]);

      const result = reactVersionDriftAnalyzer.analyze(graph);

      const finding = result.findings.find((f) => f.severity === "HIGH");
      expect(finding!.suggestions).toBeDefined();
      expect(finding!.suggestions!.length).toBeGreaterThan(0);
    });
  });
});
