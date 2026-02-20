import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { generateAsciiGraph, generateMermaidGraph } from "./visualize.js";
import { getProjectGraph } from "../core/analyze.js";
import { buildProjectGraph } from "../core/projectGraph.js";
import type { FederationParticipant } from "../core/types.js";

const EXAMPLE_WORKSPACE = join(process.cwd(), "examples/rsbuild-basic");

/**
 * Helper to create a test participant.
 */
function createParticipant(
  name: string,
  options: {
    exposes?: Record<string, string>;
    remotes?: Record<string, string>;
    shared?: Record<string, string>;
    bundler?: "rsbuild" | "webpack" | "rspack" | "unknown";
    hostOverride?: boolean;
    runtimeRemotes?: boolean;
  } = {},
): FederationParticipant {
  return {
    name,
    projectRoot: `/test/${name}`,
    configPath: `/test/${name}/rsbuild.config.ts`,
    bundler: options.bundler ?? "rsbuild",
    federationConfig: {
      participantName: name,
      projectRoot: `/test/${name}`,
      name,
      exposes: options.exposes ?? {},
      remotes: options.remotes ?? {},
      shared: options.shared ?? {},
    },
    dependencies: {},
    devDependencies: {},
    parseStatus: "complete",
    hostOverride: options.hostOverride,
    runtimeRemotes: options.runtimeRemotes,
  };
}

describe("generateAsciiGraph", () => {
  it("generates ASCII graph for rsbuild-basic example", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
    const output = generateAsciiGraph(graph, false);

    expect(output).toContain("Module Federation Topology");
    expect(output).toContain("@rsbuild-basic/shell");
    expect(output).toContain("@rsbuild-basic/remote-a");
    expect(output).toContain("@rsbuild-basic/remote-b");
    expect(output).toContain("HOST");
    expect(output).toContain("REMOTE");
  });

  it("handles empty graph", () => {
    const graph = buildProjectGraph("/test", []);
    const output = generateAsciiGraph(graph, false);

    expect(output).toContain("Module Federation Topology");
    expect(output).toContain("No federation participants found");
  });

  it("shows host consuming remotes", () => {
    const participants = [
      createParticipant("shell", {
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
          remoteB: "remoteB@http://localhost:3002/mf-manifest.json",
        },
      }),
      createParticipant("remote-a", {
        exposes: { "./Button": "./src/Button.tsx" },
      }),
      createParticipant("remote-b", {
        exposes: { "./utils": "./src/utils.ts" },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);
    graph.edges = [
      { from: "shell", to: "remote-a", remoteKey: "remoteA" },
      { from: "shell", to: "remote-b", remoteKey: "remoteB" },
    ];

    const output = generateAsciiGraph(graph, false);

    expect(output).toContain("shell");
    expect(output).toContain("HOST");
    expect(output).toContain("remote-a");
    expect(output).toContain("remote-b");
    expect(output).toContain("remoteA");
    expect(output).toContain("remoteB");
  });

  it("shows runtime remotes indicator", () => {
    const participants = [
      createParticipant("shell", {
        hostOverride: true,
        runtimeRemotes: true,
      }),
    ];
    const graph = buildProjectGraph("/test", participants);

    const output = generateAsciiGraph(graph, false);

    expect(output).toContain("runtime");
  });

  it("shows exposed modules", () => {
    const participants = [
      createParticipant("remote-a", {
        exposes: {
          "./Button": "./src/Button.tsx",
          "./Card": "./src/Card.tsx",
        },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);

    const output = generateAsciiGraph(graph, false);

    expect(output).toContain("exposes:");
    expect(output).toContain("./Button");
    expect(output).toContain("./Card");
  });

  it("shows bundler type", () => {
    const participants = [
      createParticipant("webpack-app", { bundler: "webpack" }),
      createParticipant("rsbuild-app", { bundler: "rsbuild" }),
    ];
    const graph = buildProjectGraph("/test", participants);

    const output = generateAsciiGraph(graph, false);

    expect(output).toContain("[webpack]");
    expect(output).toContain("[rsbuild]");
  });

  it("shows summary with participant and edge counts", () => {
    const participants = [
      createParticipant("shell", {
        remotes: { remoteA: "remoteA@http://localhost:3001" },
      }),
      createParticipant("remote-a", {
        exposes: { "./Button": "./src/Button.tsx" },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);
    graph.edges = [{ from: "shell", to: "remote-a", remoteKey: "remoteA" }];

    const output = generateAsciiGraph(graph, false);

    expect(output).toContain("2 participants");
    expect(output).toContain("1 edges");
  });
});

describe("generateMermaidGraph", () => {
  it("generates Mermaid graph for rsbuild-basic example", async () => {
    const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
    const output = generateMermaidGraph(graph);

    expect(output).toContain("```mermaid");
    expect(output).toContain("flowchart TD");
    expect(output).toContain("```");
    expect(output).toContain("Hosts");
    expect(output).toContain("Remotes");
  });

  it("handles empty graph", () => {
    const graph = buildProjectGraph("/test", []);
    const output = generateMermaidGraph(graph);

    expect(output).toContain("```mermaid");
    expect(output).toContain("No federation participants found");
    expect(output).toContain("```");
  });

  it("creates proper node IDs without special characters", () => {
    const participants = [
      createParticipant("@scope/my-app", {
        remotes: { remote: "remote@http://localhost:3001" },
      }),
      createParticipant("remote-a", {
        exposes: { "./Button": "./src/Button.tsx" },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);
    graph.edges = [
      { from: "@scope/my-app", to: "remote-a", remoteKey: "remote" },
    ];

    const output = generateMermaidGraph(graph);

    expect(output).toContain("_scope_my_app");
    expect(output).toContain("remote_a");
    expect(output).not.toContain("@scope/my-app[");
  });

  it("creates edges with labels", () => {
    const participants = [
      createParticipant("shell", {
        remotes: { remoteA: "remoteA@http://localhost:3001" },
      }),
      createParticipant("remote-a", {
        exposes: { "./Button": "./src/Button.tsx" },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);
    graph.edges = [{ from: "shell", to: "remote-a", remoteKey: "remoteA" }];

    const output = generateMermaidGraph(graph);

    expect(output).toContain('-->|"remoteA"|');
  });

  it("creates subgraphs for hosts and remotes", () => {
    const participants = [
      createParticipant("shell", {
        remotes: { remoteA: "remoteA@http://localhost:3001" },
      }),
      createParticipant("remote-a", {
        exposes: { "./Button": "./src/Button.tsx" },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);
    graph.edges = [{ from: "shell", to: "remote-a", remoteKey: "remoteA" }];

    const output = generateMermaidGraph(graph);

    expect(output).toContain("subgraph hosts [Hosts / Shells]");
    expect(output).toContain("subgraph remotes [Remotes]");
    expect(output).toContain("end");
  });

  it("shows bundler info in node labels", () => {
    const participants = [
      createParticipant("shell", {
        bundler: "webpack",
        remotes: { remote: "remote@http://localhost:3001" },
      }),
      createParticipant("remote", {
        bundler: "rsbuild",
        exposes: { "./Button": "./src/Button.tsx" },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);
    graph.edges = [{ from: "shell", to: "remote", remoteKey: "remote" }];

    const output = generateMermaidGraph(graph);

    expect(output).toContain("webpack");
    expect(output).toContain("rsbuild");
  });

  it("shows exposed modules in remote node labels", () => {
    const participants = [
      createParticipant("remote-a", {
        exposes: {
          "./Button": "./src/Button.tsx",
          "./Card": "./src/Card.tsx",
        },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);

    const output = generateMermaidGraph(graph);

    expect(output).toContain("exposes:");
  });

  it("shows consumed remotes in host node labels", () => {
    const participants = [
      createParticipant("shell", {
        remotes: {
          remoteA: "remoteA@http://localhost:3001",
          remoteB: "remoteB@http://localhost:3002",
        },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);

    const output = generateMermaidGraph(graph);

    expect(output).toContain("consumes:");
  });

  it("escapes special characters in labels", () => {
    const participants = [
      createParticipant("app<test>", {
        exposes: { "./Button": "./src/Button.tsx" },
      }),
    ];
    const graph = buildProjectGraph("/test", participants);

    const output = generateMermaidGraph(graph);

    expect(output).toContain("&lt;");
    expect(output).toContain("&gt;");
    expect(output).not.toContain('["app<test>"]');
  });
});
