import { describe, it, expect } from "vitest";
import { duplicateExposeNameAnalyzer } from "./duplicateExposeName.js";
import type { ProjectGraph, FederationParticipant } from "../types.js";

function createMockParticipant(
  name: string,
  exposes: Record<string, string>,
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

function createMockGraph(participants: FederationParticipant[]): ProjectGraph {
  return {
    workspaceRoot: "/mock",
    participants,
    edges: [],
  };
}

describe("duplicateExposeNameAnalyzer", () => {
  describe("basic detection", () => {
    it("returns no findings when each remote has unique expose keys", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/Button",
        }),
        createMockParticipant("remote-b", {
          "./Card": "./src/Card",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.analyzerId).toBe("duplicate-expose-name");
      expect(result.findings).toHaveLength(0);
    });

    it("detects when two remotes expose the same key", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/Button",
        }),
        createMockParticipant("remote-b", {
          "./Button": "./src/components/Button",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("MEDIUM");
      expect(result.findings[0].message).toContain("./Button");
      expect(result.findings[0].participants).toContain("remote-a");
      expect(result.findings[0].participants).toContain("remote-b");
    });

    it("detects multiple duplicate keys", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/Button",
          "./Input": "./src/Input",
        }),
        createMockParticipant("remote-b", {
          "./Button": "./src/Button",
          "./Input": "./src/Input",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(2);

      const buttonFinding = result.findings.find((f) =>
        f.message.includes("./Button"),
      );
      const inputFinding = result.findings.find((f) =>
        f.message.includes("./Input"),
      );

      expect(buttonFinding).toBeDefined();
      expect(inputFinding).toBeDefined();
    });

    it("detects when three or more remotes expose the same key", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/Button",
        }),
        createMockParticipant("remote-b", {
          "./Button": "./src/Button",
        }),
        createMockParticipant("remote-c", {
          "./Button": "./src/Button",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].participants).toHaveLength(3);
      expect(result.findings[0].participants).toContain("remote-a");
      expect(result.findings[0].participants).toContain("remote-b");
      expect(result.findings[0].participants).toContain("remote-c");
    });
  });

  describe("edge cases", () => {
    it("returns no findings when there are no remotes", () => {
      const graph = createMockGraph([
        createMockParticipant(
          "shell",
          {},
          {
            remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
          },
        ),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("returns no findings when remotes have empty exposes", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {}),
        createMockParticipant("remote-b", {}),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("returns no findings with a single remote", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/Button",
          "./Card": "./src/Card",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("handles mixed case - some duplicates, some unique", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/Button",
          "./UniqueA": "./src/UniqueA",
        }),
        createMockParticipant("remote-b", {
          "./Button": "./src/Button",
          "./UniqueB": "./src/UniqueB",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain("./Button");
    });
  });

  describe("finding details", () => {
    it("includes expose paths in details", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/components/Button.tsx",
        }),
        createMockParticipant("remote-b", {
          "./Button": "./src/ui/Button/index.ts",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty("exposePaths");
      const exposePaths = result.findings[0].details!.exposePaths as Record<
        string,
        string
      >;
      expect(exposePaths["remote-a"]).toBe("./src/components/Button.tsx");
      expect(exposePaths["remote-b"]).toBe("./src/ui/Button/index.ts");
    });

    it("includes suggestions", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/Button",
        }),
        createMockParticipant("remote-b", {
          "./Button": "./src/Button",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings[0].suggestions).toBeDefined();
      expect(result.findings[0].suggestions!.length).toBeGreaterThan(0);
    });

    it("includes exposeKey in details", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./MyComponent": "./src/MyComponent",
        }),
        createMockParticipant("remote-b", {
          "./MyComponent": "./src/MyComponent",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty(
        "exposeKey",
        "./MyComponent",
      );
    });

    it("includes remotes array in details", () => {
      const graph = createMockGraph([
        createMockParticipant("remote-a", {
          "./Button": "./src/Button",
        }),
        createMockParticipant("remote-b", {
          "./Button": "./src/Button",
        }),
      ]);

      const result = duplicateExposeNameAnalyzer.analyze(graph);

      expect(result.findings[0].details).toHaveProperty("remotes");
      const remotes = result.findings[0].details!.remotes as string[];
      expect(remotes).toContain("remote-a");
      expect(remotes).toContain("remote-b");
    });
  });
});
