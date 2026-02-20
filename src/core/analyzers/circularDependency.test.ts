import { describe, it, expect } from "vitest";
import { circularDependencyAnalyzer } from "./circularDependency.js";
import type { ProjectGraph, FederationParticipant } from "../types.js";

function createMockParticipant(
  name: string,
  exposes: Record<string, string> = {},
  remotes: Record<string, string> = {},
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
      exposes,
      remotes,
      shared: {},
    },
    dependencies: {},
    devDependencies: {},
    parseStatus: "complete",
  };
}

function createMockGraph(
  participants: FederationParticipant[],
  edges: ProjectGraph["edges"] = [],
): ProjectGraph {
  return {
    workspaceRoot: "/mock",
    participants,
    edges,
  };
}

describe("circularDependencyAnalyzer", () => {
  describe("acyclic graphs", () => {
    it("returns no findings for normal host -> remote pattern", () => {
      const shell = createMockParticipant(
        "shell",
        {},
        {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        },
      );
      const remoteA = createMockParticipant("remote-a", {
        "./Button": "./src/Button",
      });

      const graph = createMockGraph(
        [shell, remoteA],
        [{ from: "shell", to: "remote-a", remoteKey: "remoteA" }],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.analyzerId).toBe("circular-dependency");
      expect(result.findings).toHaveLength(0);
    });

    it("returns no findings for chain without cycle", () => {
      const shell = createMockParticipant("shell");
      const remoteA = createMockParticipant("remote-a");
      const remoteB = createMockParticipant("remote-b");

      const graph = createMockGraph(
        [shell, remoteA, remoteB],
        [
          { from: "shell", to: "remote-a", remoteKey: "remoteA" },
          { from: "remote-a", to: "remote-b", remoteKey: "remoteB" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("returns no findings when graph has no edges", () => {
      const shell = createMockParticipant("shell");
      const remoteA = createMockParticipant("remote-a");

      const graph = createMockGraph([shell, remoteA], []);

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("returns no findings for empty graph", () => {
      const graph = createMockGraph([], []);

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });
  });

  describe("cycle detection", () => {
    it("detects simple cycle: A -> B -> A", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");

      const graph = createMockGraph(
        [a, b],
        [
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "a", remoteKey: "remoteA" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("HIGH");
      expect(result.findings[0].message).toContain("Circular dependency");
      expect(result.findings[0].participants).toContain("a");
      expect(result.findings[0].participants).toContain("b");
    });

    it("detects longer cycle: A -> B -> C -> A", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");
      const c = createMockParticipant("c");

      const graph = createMockGraph(
        [a, b, c],
        [
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "c", remoteKey: "remoteC" },
          { from: "c", to: "a", remoteKey: "remoteA" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].participants).toHaveLength(3);
      expect(result.findings[0].details!.cycleLength).toBe(3);
    });

    it("detects self-referencing participant: A -> A", () => {
      const a = createMockParticipant("a");

      const graph = createMockGraph(
        [a],
        [{ from: "a", to: "a", remoteKey: "self" }],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain("a -> a");
      expect(result.findings[0].details!.cycleLength).toBe(1);
    });

    it("detects multiple independent cycles", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");
      const c = createMockParticipant("c");
      const d = createMockParticipant("d");

      const graph = createMockGraph(
        [a, b, c, d],
        [
          // Cycle 1: a -> b -> a
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "a", remoteKey: "remoteA" },
          // Cycle 2: c -> d -> c
          { from: "c", to: "d", remoteKey: "remoteD" },
          { from: "d", to: "c", remoteKey: "remoteC" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(2);
    });

    it("handles graph with cycle and non-cycle branches", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");
      const c = createMockParticipant("c");
      const d = createMockParticipant("d");

      const graph = createMockGraph(
        [a, b, c, d],
        [
          // Non-cycle branch
          { from: "a", to: "d", remoteKey: "remoteD" },
          // Cycle: a -> b -> c -> a
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "c", remoteKey: "remoteC" },
          { from: "c", to: "a", remoteKey: "remoteA" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].participants).toContain("a");
      expect(result.findings[0].participants).toContain("b");
      expect(result.findings[0].participants).toContain("c");
      expect(result.findings[0].participants).not.toContain("d");
    });
  });

  describe("finding details", () => {
    it("includes cycle path in details", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");

      const graph = createMockGraph(
        [a, b],
        [
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "a", remoteKey: "remoteA" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty("cyclePath");
      const cyclePath = result.findings[0].details!.cyclePath as string[];
      expect(cyclePath.length).toBeGreaterThan(2);
      expect(cyclePath[0]).toBe(cyclePath[cyclePath.length - 1]);
    });

    it("includes cycle length in details", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");
      const c = createMockParticipant("c");

      const graph = createMockGraph(
        [a, b, c],
        [
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "c", remoteKey: "remoteC" },
          { from: "c", to: "a", remoteKey: "remoteA" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty("cycleLength", 3);
    });

    it("includes edges in details", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");

      const graph = createMockGraph(
        [a, b],
        [
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "a", remoteKey: "remoteA" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty("edges");
      const edges = result.findings[0].details!.edges as Array<{
        from: string;
        to: string;
        remoteKey: string;
      }>;
      expect(edges.length).toBeGreaterThan(0);
    });

    it("includes suggestions", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");

      const graph = createMockGraph(
        [a, b],
        [
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "a", remoteKey: "remoteA" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings[0].suggestions).toBeDefined();
      expect(result.findings[0].suggestions!.length).toBeGreaterThan(0);
    });

    it("formats message with arrow-separated path", () => {
      const a = createMockParticipant("a");
      const b = createMockParticipant("b");
      const c = createMockParticipant("c");

      const graph = createMockGraph(
        [a, b, c],
        [
          { from: "a", to: "b", remoteKey: "remoteB" },
          { from: "b", to: "c", remoteKey: "remoteC" },
          { from: "c", to: "a", remoteKey: "remoteA" },
        ],
      );

      const result = circularDependencyAnalyzer.analyze(graph);

      expect(result.findings[0].message).toMatch(/->/);
    });
  });
});
