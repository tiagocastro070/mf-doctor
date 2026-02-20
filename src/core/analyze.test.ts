import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  analyze,
  hasFederationParticipants,
  getProjectGraph,
} from "./analyze.js";

const EXAMPLE_WORKSPACE = join(process.cwd(), "examples/rsbuild-basic");

describe("analyze", () => {
  it("works on example workspace and detects React drift", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    expect(result.graph.participants).toHaveLength(4);
    expect(result.graph.workspaceRoot).toBe(EXAMPLE_WORKSPACE);

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.totalFindings).toBeGreaterThan(0);
    expect(result.findingsBySeverity.HIGH).toBeGreaterThan(0);

    const reactDriftResult = result.results.find(
      (r) => r.analyzerId === "react-version-drift",
    );
    expect(reactDriftResult).toBeDefined();

    const highSeverityFinding = reactDriftResult!.findings.find(
      (f) => f.severity === "HIGH",
    );
    expect(highSeverityFinding).toBeDefined();
    expect(highSeverityFinding!.message).toContain("Multiple react versions");

    expect(result.totalDurationMs).toBeGreaterThan(0);
  });

  it("discovers and attaches configs to all participants", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    const participantNames = result.graph.participants
      .map((p) => p.name)
      .sort();
    expect(participantNames).toEqual([
      "@rsbuild-basic/remote-a",
      "@rsbuild-basic/remote-b",
      "@rsbuild-basic/remote-c",
      "@rsbuild-basic/shell",
    ]);

    for (const participant of result.graph.participants) {
      expect(participant.federationConfig.name).toBeTruthy();
      expect(participant.parseStatus).toBe("complete");
    }
  });

  it("extracts federation config correctly for shell", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    const shell = result.graph.participants.find(
      (p) => p.name === "@rsbuild-basic/shell",
    );
    expect(shell).toBeDefined();
    expect(shell!.federationConfig.name).toBe("shell");
    expect(shell!.federationConfig.remotes).toEqual({
      remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
      remoteB: "remoteB@http://localhost:3002/mf-manifest.json",
    });
    expect(shell!.federationConfig.exposes).toEqual({});
  });

  it("extracts federation config correctly for remotes", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    const remoteA = result.graph.participants.find(
      (p) => p.name === "@rsbuild-basic/remote-a",
    );
    expect(remoteA).toBeDefined();
    expect(remoteA!.federationConfig.name).toBe("remoteA");
    expect(remoteA!.federationConfig.exposes).toEqual({
      "./Button": "./src/Button",
    });
    expect(remoteA!.federationConfig.remotes).toEqual({});

    const remoteB = result.graph.participants.find(
      (p) => p.name === "@rsbuild-basic/remote-b",
    );
    expect(remoteB).toBeDefined();
    expect(remoteB!.federationConfig.name).toBe("remoteB");
    expect(remoteB!.federationConfig.exposes).toEqual({
      "./Card": "./src/Card",
      "./Button": "./src/Button",
    });
  });

  it("builds correct graph edges", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    expect(result.graph.edges).toHaveLength(4);

    const shellToRemoteA = result.graph.edges.find(
      (e) => e.remoteKey === "remoteA",
    );
    expect(shellToRemoteA).toBeDefined();
    expect(shellToRemoteA!.from).toBe("@rsbuild-basic/shell");
    expect(shellToRemoteA!.to).toBe("@rsbuild-basic/remote-a");

    const shellToRemoteB = result.graph.edges.find(
      (e) => e.remoteKey === "remoteB",
    );
    expect(shellToRemoteB).toBeDefined();
    expect(shellToRemoteB!.from).toBe("@rsbuild-basic/shell");
    expect(shellToRemoteB!.to).toBe("@rsbuild-basic/remote-b");

    const remoteBToRemoteC = result.graph.edges.find(
      (e) => e.remoteKey === "remoteC",
    );
    expect(remoteBToRemoteC).toBeDefined();
    expect(remoteBToRemoteC!.from).toBe("@rsbuild-basic/remote-b");
    expect(remoteBToRemoteC!.to).toBe("@rsbuild-basic/remote-c");

    const remoteCToShell = result.graph.edges.find(
      (e) => e.from === "@rsbuild-basic/remote-c" && e.remoteKey === "shell",
    );
    expect(remoteCToShell).toBeDefined();
    expect(remoteCToShell!.to).toBe("@rsbuild-basic/shell");
  });

  it("extracts shared config with version info", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    const remoteA = result.graph.participants.find(
      (p) => p.name === "@rsbuild-basic/remote-a",
    );
    expect(remoteA!.federationConfig.shared["react"]).toEqual({
      singleton: true,
      requiredVersion: "18.2.0",
    });
  });

  it("detects no orphan exposes (all remotes are consumed)", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    const orphanExposeResult = result.results.find(
      (r) => r.analyzerId === "orphan-expose",
    );
    expect(orphanExposeResult).toBeDefined();
    expect(orphanExposeResult!.findings).toHaveLength(0);
  });

  it("detects circular dependency in example workspace", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    const circularResult = result.results.find(
      (r) => r.analyzerId === "circular-dependency",
    );
    expect(circularResult).toBeDefined();
    expect(circularResult!.findings).toHaveLength(1);

    const finding = circularResult!.findings[0];
    expect(finding.severity).toBe("HIGH");
    expect(finding.message).toContain("Circular dependency");
    expect(finding.participants).toContain("@rsbuild-basic/shell");
    expect(finding.participants).toContain("@rsbuild-basic/remote-b");
    expect(finding.participants).toContain("@rsbuild-basic/remote-c");
    expect(finding.details).toHaveProperty("cyclePath");
    expect(finding.details).toHaveProperty("cycleLength", 3);
  });

  it("detects missing-shared for date-fns in example workspace", async () => {
    const result = await analyze(EXAMPLE_WORKSPACE);

    const missingSharedResult = result.results.find(
      (r) => r.analyzerId === "missing-shared",
    );
    expect(missingSharedResult).toBeDefined();
    expect(missingSharedResult!.findings.length).toBeGreaterThan(0);

    const dateFnsFinding = missingSharedResult!.findings.find((f) =>
      f.message.includes("date-fns"),
    );
    expect(dateFnsFinding).toBeDefined();
    expect(dateFnsFinding!.severity).toBe("MEDIUM");
    expect(dateFnsFinding!.message).toContain("3/4 participants");
    expect(dateFnsFinding!.participants).toContain("@rsbuild-basic/shell");
    expect(dateFnsFinding!.participants).toContain("@rsbuild-basic/remote-a");
    expect(dateFnsFinding!.participants).toContain("@rsbuild-basic/remote-b");
    expect(dateFnsFinding!.details).toHaveProperty("dependency", "date-fns");
  });
});

describe("hasFederationParticipants", () => {
  it("returns true for example workspace", async () => {
    const result = await hasFederationParticipants(EXAMPLE_WORKSPACE);
    expect(result).toBe(true);
  });

  it("returns false for non-existent path", async () => {
    const result = await hasFederationParticipants("/non/existent/path");
    expect(result).toBe(false);
  });
});

describe("getProjectGraph", () => {
  it("returns project graph without running analyzers", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);

    expect(graph.workspaceRoot).toBe(EXAMPLE_WORKSPACE);
    expect(graph.participants).toHaveLength(4);
    expect(graph.edges).toHaveLength(4);

    for (const participant of graph.participants) {
      expect(participant.federationConfig.name).toBeTruthy();
    }
  });
});
