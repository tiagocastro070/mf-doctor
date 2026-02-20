import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  buildProjectGraph,
  getRemoteParticipants,
  getHostParticipants,
  getDependencies,
  getDependents,
  applyHostOverrides,
} from "./projectGraph.js";
import type { FederationParticipant } from "./types.js";
import { getProjectGraph } from "./analyze.js";

const EXAMPLE_WORKSPACE = join(process.cwd(), "examples/rsbuild-basic");

describe("buildProjectGraph", () => {
  it("creates edges from shell to remotes", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);

    expect(graph.edges).toHaveLength(4);

    const fromShell = graph.edges.filter(
      (e) => e.from === "@rsbuild-basic/shell",
    );
    expect(fromShell).toHaveLength(2);
  });

  it("handles empty participants array", () => {
    const graph = buildProjectGraph("/test", []);

    expect(graph.workspaceRoot).toBe("/test");
    expect(graph.participants).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});

describe("getRemoteParticipants", () => {
  it("returns participants that expose modules", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
    const remotes = getRemoteParticipants(graph);

    expect(remotes).toHaveLength(3);
    const names = remotes.map((r) => r.name).sort();
    expect(names).toEqual([
      "@rsbuild-basic/remote-a",
      "@rsbuild-basic/remote-b",
      "@rsbuild-basic/remote-c",
    ]);
  });
});

describe("getHostParticipants", () => {
  it("returns participants that consume remotes", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
    const hosts = getHostParticipants(graph);

    expect(hosts).toHaveLength(3);
    const names = hosts.map((h) => h.name).sort();
    expect(names).toEqual([
      "@rsbuild-basic/remote-b",
      "@rsbuild-basic/remote-c",
      "@rsbuild-basic/shell",
    ]);
  });
});

describe("getDependencies", () => {
  it("returns dependencies for shell", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
    const deps = getDependencies(graph, "@rsbuild-basic/shell");

    expect(deps).toHaveLength(2);
    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual([
      "@rsbuild-basic/remote-a",
      "@rsbuild-basic/remote-b",
    ]);
  });

  it("returns empty array for remotes", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
    const deps = getDependencies(graph, "@rsbuild-basic/remote-a");

    expect(deps).toEqual([]);
  });
});

describe("getDependents", () => {
  it("returns dependents for remote-a", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
    const dependents = getDependents(graph, "@rsbuild-basic/remote-a");

    expect(dependents).toHaveLength(1);
    expect(dependents[0].name).toBe("@rsbuild-basic/shell");
  });

  it("returns remote-c as dependent of shell (circular dependency)", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
    const dependents = getDependents(graph, "@rsbuild-basic/shell");

    expect(dependents).toHaveLength(1);
    expect(dependents[0].name).toBe("@rsbuild-basic/remote-c");
  });
});

describe("applyHostOverrides", () => {
  const createParticipant = (
    name: string,
    remotes: Record<string, string> = {},
  ): FederationParticipant => ({
    name,
    projectRoot: `/test/${name}`,
    configPath: `/test/${name}/rsbuild.config.ts`,
    bundler: "rsbuild",
    federationConfig: {
      participantName: name,
      projectRoot: `/test/${name}`,
      name,
      exposes: {},
      remotes,
      shared: {},
    },
    dependencies: {},
    devDependencies: {},
    parseStatus: "complete",
  });

  it("returns participants unchanged when no overrides provided", () => {
    const participants = [
      createParticipant("shell", { remote: "remote@http://localhost:3001" }),
      createParticipant("remote"),
    ];

    const result = applyHostOverrides(participants, []);

    expect(result).toEqual(participants);
    expect(result[0].hostOverride).toBeUndefined();
    expect(result[1].hostOverride).toBeUndefined();
  });

  it("marks participant as host override with empty remotes", () => {
    const participants = [
      createParticipant("shell"),
      createParticipant("remote"),
    ];

    const result = applyHostOverrides(participants, ["shell"]);

    expect(result[0].hostOverride).toBe(true);
    expect(result[0].runtimeRemotes).toBe(true);
    expect(result[1].hostOverride).toBeUndefined();
    expect(result[1].runtimeRemotes).toBeUndefined();
  });

  it("marks participant as host override with existing remotes (runtimeRemotes = false)", () => {
    const participants = [
      createParticipant("shell", { remote: "remote@http://localhost:3001" }),
      createParticipant("remote"),
    ];

    const result = applyHostOverrides(participants, ["shell"]);

    expect(result[0].hostOverride).toBe(true);
    expect(result[0].runtimeRemotes).toBe(false);
  });

  it("handles multiple host overrides", () => {
    const participants = [
      createParticipant("shell-a"),
      createParticipant("shell-b"),
      createParticipant("remote"),
    ];

    const result = applyHostOverrides(participants, ["shell-a", "shell-b"]);

    expect(result[0].hostOverride).toBe(true);
    expect(result[0].runtimeRemotes).toBe(true);
    expect(result[1].hostOverride).toBe(true);
    expect(result[1].runtimeRemotes).toBe(true);
    expect(result[2].hostOverride).toBeUndefined();
  });

  it("ignores override names that do not match any participant", () => {
    const participants = [
      createParticipant("shell"),
      createParticipant("remote"),
    ];

    const result = applyHostOverrides(participants, ["nonexistent"]);

    expect(result[0].hostOverride).toBeUndefined();
    expect(result[1].hostOverride).toBeUndefined();
  });
});

describe("getHostParticipants with overrides", () => {
  const createParticipant = (
    name: string,
    options: {
      remotes?: Record<string, string>;
      hostOverride?: boolean;
    } = {},
  ): FederationParticipant => ({
    name,
    projectRoot: `/test/${name}`,
    configPath: `/test/${name}/rsbuild.config.ts`,
    bundler: "rsbuild",
    federationConfig: {
      participantName: name,
      projectRoot: `/test/${name}`,
      name,
      exposes: {},
      remotes: options.remotes ?? {},
      shared: {},
    },
    dependencies: {},
    devDependencies: {},
    parseStatus: "complete",
    hostOverride: options.hostOverride,
  });

  it("includes participants with static remotes (default behavior)", () => {
    const graph = buildProjectGraph("/test", [
      createParticipant("shell", {
        remotes: { remote: "remote@http://localhost:3001" },
      }),
      createParticipant("remote"),
    ]);

    const hosts = getHostParticipants(graph);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].name).toBe("shell");
  });

  it("includes participants with hostOverride even without remotes", () => {
    const graph = buildProjectGraph("/test", [
      createParticipant("shell", { hostOverride: true }),
      createParticipant("remote"),
    ]);

    const hosts = getHostParticipants(graph);

    expect(hosts).toHaveLength(1);
    expect(hosts[0].name).toBe("shell");
  });

  it("includes both static hosts and override hosts", () => {
    const graph = buildProjectGraph("/test", [
      createParticipant("shell-static", {
        remotes: { remote: "remote@http://localhost:3001" },
      }),
      createParticipant("shell-runtime", { hostOverride: true }),
      createParticipant("remote"),
    ]);

    const hosts = getHostParticipants(graph);

    expect(hosts).toHaveLength(2);
    const names = hosts.map((h) => h.name).sort();
    expect(names).toEqual(["shell-runtime", "shell-static"]);
  });
});
