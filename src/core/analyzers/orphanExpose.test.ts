import { describe, it, expect } from "vitest";
import { orphanExposeAnalyzer } from "./orphanExpose.js";
import type { ProjectGraph, FederationParticipant } from "../types.js";

function createMockParticipant(
  name: string,
  exposes: Record<string, string>,
  remotes: Record<string, string> = {},
  federationName?: string,
): FederationParticipant {
  return {
    name,
    projectRoot: `/mock/${name}`,
    configPath: `/mock/${name}/rsbuild.config.ts`,
    bundler: "rsbuild",
    federationConfig: {
      participantName: name,
      projectRoot: `/mock/${name}`,
      name: federationName ?? name.replace("@", "").replace("/", "-"),
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

describe("orphanExposeAnalyzer", () => {
  describe("basic detection", () => {
    it("returns no findings when all remotes have consumers", () => {
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

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.analyzerId).toBe("orphan-expose");
      expect(result.findings).toHaveLength(0);
    });

    it("detects orphan when remote has exposes but no consumers", () => {
      const shell = createMockParticipant("shell", {}, {});
      const orphanRemote = createMockParticipant("orphan-remote", {
        "./Widget": "./src/Widget",
      });

      const graph = createMockGraph([shell, orphanRemote], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("LOW");
      expect(result.findings[0].message).toContain("orphan-remote");
      expect(result.findings[0].message).toContain("1 module(s)");
      expect(result.findings[0].participants).toEqual(["orphan-remote"]);
    });

    it("detects multiple orphan remotes", () => {
      const shell = createMockParticipant("shell", {}, {});
      const orphanA = createMockParticipant("orphan-a", {
        "./Button": "./src/Button",
      });
      const orphanB = createMockParticipant("orphan-b", {
        "./Card": "./src/Card",
        "./Input": "./src/Input",
      });

      const graph = createMockGraph([shell, orphanA, orphanB], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(2);

      const findingA = result.findings.find((f) =>
        f.message.includes("orphan-a"),
      );
      const findingB = result.findings.find((f) =>
        f.message.includes("orphan-b"),
      );

      expect(findingA).toBeDefined();
      expect(findingA!.message).toContain("1 module(s)");

      expect(findingB).toBeDefined();
      expect(findingB!.message).toContain("2 module(s)");
    });

    it("only reports remotes without consumers, not those with consumers", () => {
      const shell = createMockParticipant(
        "shell",
        {},
        {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        },
      );
      const consumedRemote = createMockParticipant(
        "consumed-remote",
        { "./Button": "./src/Button" },
        {},
        "remoteA",
      );
      const orphanRemote = createMockParticipant("orphan-remote", {
        "./Widget": "./src/Widget",
      });

      const graph = createMockGraph(
        [shell, consumedRemote, orphanRemote],
        [{ from: "shell", to: "consumed-remote", remoteKey: "remoteA" }],
      );

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].participants).toEqual(["orphan-remote"]);
    });
  });

  describe("edge cases", () => {
    it("returns no findings when there are no remotes", () => {
      const shell = createMockParticipant(
        "shell",
        {},
        {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        },
      );

      const graph = createMockGraph([shell], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("returns no findings when graph has no participants", () => {
      const graph = createMockGraph([], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("returns no findings when a participant has empty exposes", () => {
      const shell = createMockParticipant("shell", {}, {});
      const emptyRemote = createMockParticipant("empty-remote", {});

      const graph = createMockGraph([shell, emptyRemote], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("handles multiple hosts consuming the same remote", () => {
      const shell1 = createMockParticipant(
        "shell-1",
        {},
        { remoteA: "remoteA@http://localhost:3001/mf-manifest.json" },
      );
      const shell2 = createMockParticipant(
        "shell-2",
        {},
        { remoteA: "remoteA@http://localhost:3001/mf-manifest.json" },
      );
      const remoteA = createMockParticipant(
        "remote-a",
        { "./Button": "./src/Button" },
        {},
        "remoteA",
      );

      const graph = createMockGraph(
        [shell1, shell2, remoteA],
        [
          { from: "shell-1", to: "remote-a", remoteKey: "remoteA" },
          { from: "shell-2", to: "remote-a", remoteKey: "remoteA" },
        ],
      );

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });
  });

  describe("finding details", () => {
    it("includes expose keys in details", () => {
      const shell = createMockParticipant("shell", {}, {});
      const orphanRemote = createMockParticipant("orphan-remote", {
        "./Button": "./src/Button.tsx",
        "./Card": "./src/Card.tsx",
        "./Input": "./src/Input.tsx",
      });

      const graph = createMockGraph([shell, orphanRemote], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty("exposeKeys");
      const exposeKeys = result.findings[0].details!.exposeKeys as string[];
      expect(exposeKeys).toContain("./Button");
      expect(exposeKeys).toContain("./Card");
      expect(exposeKeys).toContain("./Input");
    });

    it("includes expose count in details", () => {
      const shell = createMockParticipant("shell", {}, {});
      const orphanRemote = createMockParticipant("orphan-remote", {
        "./Button": "./src/Button",
        "./Card": "./src/Card",
      });

      const graph = createMockGraph([shell, orphanRemote], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty("exposeCount", 2);
    });

    it("includes remote name in details", () => {
      const shell = createMockParticipant("shell", {}, {});
      const orphanRemote = createMockParticipant("orphan-remote", {
        "./Widget": "./src/Widget",
      });

      const graph = createMockGraph([shell, orphanRemote], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty(
        "remote",
        "orphan-remote",
      );
    });

    it("includes federation name in details", () => {
      const shell = createMockParticipant("shell", {}, {});
      const orphanRemote = createMockParticipant(
        "@scope/orphan-remote",
        { "./Widget": "./src/Widget" },
        {},
        "orphanRemote",
      );

      const graph = createMockGraph([shell, orphanRemote], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty(
        "federationName",
        "orphanRemote",
      );
    });

    it("includes suggestions", () => {
      const shell = createMockParticipant("shell", {}, {});
      const orphanRemote = createMockParticipant("orphan-remote", {
        "./Widget": "./src/Widget",
      });

      const graph = createMockGraph([shell, orphanRemote], []);

      const result = orphanExposeAnalyzer.analyze(graph);

      expect(result.findings[0].suggestions).toBeDefined();
      expect(result.findings[0].suggestions!.length).toBeGreaterThan(0);
      expect(
        result.findings[0].suggestions!.some((s) => s.includes("host")),
      ).toBe(true);
    });
  });
});
