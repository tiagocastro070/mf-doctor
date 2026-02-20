import { describe, it, expect } from "vitest";
import { missingSharedAnalyzer } from "./missingShared.js";
import type {
  ProjectGraph,
  FederationParticipant,
  SharedConfig,
} from "../types.js";

function createMockParticipant(
  name: string,
  dependencies: Record<string, string> = {},
  shared: Record<string, SharedConfig | string> = {},
  devDependencies: Record<string, string> = {},
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
      shared,
    },
    dependencies,
    devDependencies,
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

describe("missingSharedAnalyzer", () => {
  describe("basic detection", () => {
    it("returns no findings when dependencies are already shared", () => {
      const participantA = createMockParticipant(
        "app-a",
        { lodash: "^4.17.21" },
        { lodash: { singleton: true } },
      );
      const participantB = createMockParticipant(
        "app-b",
        { lodash: "^4.17.21" },
        { lodash: { singleton: true } },
      );

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.analyzerId).toBe("missing-shared");
      expect(result.findings).toHaveLength(0);
    });

    it("detects dependency used by multiple participants but not shared", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.21",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("MEDIUM");
      expect(result.findings[0].message).toContain("lodash");
      expect(result.findings[0].message).toContain("2/2 participants");
      expect(result.findings[0].participants).toContain("app-a");
      expect(result.findings[0].participants).toContain("app-b");
    });

    it("detects multiple missing shared dependencies", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
        axios: "^1.0.0",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.21",
        axios: "^1.0.0",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(2);

      const lodashFinding = result.findings.find((f) =>
        f.message.includes("lodash"),
      );
      const axiosFinding = result.findings.find((f) =>
        f.message.includes("axios"),
      );

      expect(lodashFinding).toBeDefined();
      expect(axiosFinding).toBeDefined();
    });

    it("ignores dependencies used by only one participant", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });
      const participantB = createMockParticipant("app-b", { axios: "^1.0.0" });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("considers dependency shared if ANY participant has it in shared config", () => {
      const participantA = createMockParticipant(
        "app-a",
        { lodash: "^4.17.21" },
        { lodash: { singleton: true } },
      );
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.21",
      });
      const participantC = createMockParticipant("app-c", {
        lodash: "^4.17.21",
      });

      const graph = createMockGraph([participantA, participantB, participantC]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("returns no findings for single participant", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });

      const graph = createMockGraph([participantA]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("returns no findings for empty graph", () => {
      const graph = createMockGraph([]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("excludes dev-only dependencies like typescript", () => {
      const participantA = createMockParticipant("app-a", {
        typescript: "^5.0.0",
      });
      const participantB = createMockParticipant("app-b", {
        typescript: "^5.0.0",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("excludes @types packages", () => {
      const participantA = createMockParticipant("app-a", {
        "@types/lodash": "^4.14.0",
      });
      const participantB = createMockParticipant("app-b", {
        "@types/lodash": "^4.14.0",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("excludes eslint-related packages", () => {
      const participantA = createMockParticipant("app-a", {
        "eslint-config-custom": "^1.0.0",
      });
      const participantB = createMockParticipant("app-b", {
        "eslint-config-custom": "^1.0.0",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });

    it("handles devDependencies the same as dependencies", () => {
      const participantA = createMockParticipant(
        "app-a",
        {},
        {},
        { lodash: "^4.17.21" },
      );
      const participantB = createMockParticipant(
        "app-b",
        {},
        {},
        { lodash: "^4.17.21" },
      );

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain("lodash");
    });
  });

  describe("version detection", () => {
    it("reports single version when all participants use same version", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.21",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings[0].details!.versionCount).toBe(1);
      expect(result.findings[0].message).not.toContain("different versions");
    });

    it("reports multiple versions when participants use different versions", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.0",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings[0].details!.versionCount).toBe(2);
      expect(result.findings[0].message).toContain("2 different versions");
    });

    it("includes version details in finding", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.0",
      });
      const participantC = createMockParticipant("app-c", {
        lodash: "^4.17.21",
      });

      const graph = createMockGraph([participantA, participantB, participantC]);

      const result = missingSharedAnalyzer.analyze(graph);

      const versions = result.findings[0].details!.versions as Record<
        string,
        string[]
      >;
      expect(Object.keys(versions)).toHaveLength(2);
      expect(versions["^4.17.21"]).toContain("app-a");
      expect(versions["^4.17.21"]).toContain("app-c");
      expect(versions["^4.17.0"]).toContain("app-b");
    });
  });

  describe("finding details", () => {
    it("includes participant count in details", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.21",
      });
      const participantC = createMockParticipant("app-c", {});

      const graph = createMockGraph([participantA, participantB, participantC]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings[0].details!.participantCount).toBe(2);
      expect(result.findings[0].details!.totalParticipants).toBe(3);
    });

    it("includes dependency name in details", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.21",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings[0].details!.dependency).toBe("lodash");
    });

    it("includes suggestions", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.21",
      });

      const graph = createMockGraph([participantA, participantB]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings[0].suggestions).toBeDefined();
      expect(result.findings[0].suggestions!.length).toBeGreaterThan(0);
      expect(
        result.findings[0].suggestions!.some((s) =>
          s.includes("shared config"),
        ),
      ).toBe(true);
    });

    it("sorts findings by participant count descending", () => {
      const participantA = createMockParticipant("app-a", {
        lodash: "^4.17.21",
        axios: "^1.0.0",
      });
      const participantB = createMockParticipant("app-b", {
        lodash: "^4.17.21",
        axios: "^1.0.0",
      });
      const participantC = createMockParticipant("app-c", {
        lodash: "^4.17.21",
      });

      const graph = createMockGraph([participantA, participantB, participantC]);

      const result = missingSharedAnalyzer.analyze(graph);

      expect(result.findings[0].details!.participantCount).toBe(3);
      expect(result.findings[0].message).toContain("lodash");
      expect(result.findings[1].details!.participantCount).toBe(2);
      expect(result.findings[1].message).toContain("axios");
    });
  });
});
