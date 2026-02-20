import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { sharedConfigMismatchAnalyzer } from "./sharedConfigMismatch.js";
import { getProjectGraph } from "../analyze.js";
import type {
  ProjectGraph,
  FederationParticipant,
  SharedConfig,
} from "../types.js";

const EXAMPLE_WORKSPACE = join(process.cwd(), "examples/rsbuild-basic");

function createMockParticipant(
  name: string,
  shared: Record<string, SharedConfig | string>,
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

describe("sharedConfigMismatchAnalyzer", () => {
  describe("with example workspace", () => {
    it("detects requiredVersion mismatch in example workspace", async () => {
      const graph = await getProjectGraph(EXAMPLE_WORKSPACE);
      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      expect(result.analyzerId).toBe("shared-config-mismatch");

      const versionFindings = result.findings.filter(
        (f) =>
          (f.message.includes("requiredVersion") ||
            f.message.includes("RequiredVersion")) &&
          (f.severity === "MEDIUM" || f.severity === "HIGH"),
      );
      expect(versionFindings.length).toBeGreaterThan(0);
    });
  });

  describe("singleton mismatch detection", () => {
    it("returns no findings when all singleton settings match", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { singleton: true },
        }),
        createMockParticipant("remote-a", {
          react: { singleton: true },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const singletonFindings = result.findings.filter((f) =>
        f.message.includes("singleton"),
      );
      expect(singletonFindings).toHaveLength(0);
    });

    it("detects singleton mismatch", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { singleton: true },
        }),
        createMockParticipant("remote-a", {
          react: { singleton: false },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const singletonFinding = result.findings.find(
        (f) => f.message.includes("singleton") && f.severity === "HIGH",
      );
      expect(singletonFinding).toBeDefined();
      expect(singletonFinding!.details).toHaveProperty("singletonTrue");
      expect(singletonFinding!.details).toHaveProperty("singletonFalse");
    });

    it("ignores undefined singleton values", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { singleton: true },
        }),
        createMockParticipant("remote-a", {
          react: { requiredVersion: "^18.0.0" },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const singletonFindings = result.findings.filter((f) =>
        f.message.includes("singleton"),
      );
      expect(singletonFindings).toHaveLength(0);
    });
  });

  describe("eager mismatch detection", () => {
    it("returns no findings when all eager settings match", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { eager: true },
        }),
        createMockParticipant("remote-a", {
          react: { eager: true },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const eagerFindings = result.findings.filter((f) =>
        f.message.includes("eager"),
      );
      expect(eagerFindings).toHaveLength(0);
    });

    it("detects eager mismatch", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { eager: true },
        }),
        createMockParticipant("remote-a", {
          react: { eager: false },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const eagerFinding = result.findings.find(
        (f) => f.message.includes("eager") && f.severity === "MEDIUM",
      );
      expect(eagerFinding).toBeDefined();
      expect(eagerFinding!.details).toHaveProperty("eagerTrue");
      expect(eagerFinding!.details).toHaveProperty("eagerFalse");
    });
  });

  describe("requiredVersion mismatch detection", () => {
    it("returns no findings when all versions match", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { requiredVersion: "^18.0.0" },
        }),
        createMockParticipant("remote-a", {
          react: { requiredVersion: "^18.0.0" },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const versionFindings = result.findings.filter((f) =>
        f.message.includes("requiredVersion"),
      );
      expect(versionFindings).toHaveLength(0);
    });

    it("detects incompatible requiredVersion ranges as HIGH", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { requiredVersion: "^18.3.0" },
        }),
        createMockParticipant("remote-a", {
          react: { requiredVersion: "18.2.0" },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const versionFinding = result.findings.find(
        (f) =>
          (f.message.includes("requiredVersion") ||
            f.message.includes("RequiredVersion")) &&
          f.message.includes("react"),
      );
      expect(versionFinding).toBeDefined();
      expect(versionFinding!.severity).toBe("HIGH");
      expect(versionFinding!.details).toHaveProperty(
        "incompatibleRanges",
        true,
      );
      expect(versionFinding!.details).toHaveProperty("versions");
    });

    it("handles string shorthand for shared config", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          lodash: "^4.17.0",
        }),
        createMockParticipant("remote-a", {
          lodash: "^4.18.0",
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const versionFinding = result.findings.find((f) =>
        f.message.includes("lodash"),
      );
      expect(versionFinding).toBeDefined();
    });

    it("reports HIGH when requiredVersion ranges are incompatible", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { requiredVersion: "^17.0.0" },
        }),
        createMockParticipant("remote-a", {
          react: { requiredVersion: "^19.0.0" },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const versionFindings = result.findings.filter(
        (f) =>
          f.message.includes("requiredVersion") ||
          f.message.includes("RequiredVersion"),
      );
      expect(versionFindings).toHaveLength(1);
      expect(versionFindings[0].severity).toBe("HIGH");
      expect(versionFindings[0].message).toContain("incompatible");
      expect(versionFindings[0].details).toHaveProperty(
        "incompatibleRanges",
        true,
      );
      expect(versionFindings[0].details).toHaveProperty("versions");
    });

    it("reports MEDIUM when ranges overlap but strings differ", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { requiredVersion: "^18.0.0" },
        }),
        createMockParticipant("remote-a", {
          react: { requiredVersion: "^18.2.0" },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const versionFinding = result.findings.find(
        (f) =>
          f.message.includes("requiredVersion") &&
          f.message.includes("react") &&
          f.severity === "MEDIUM",
      );
      expect(versionFinding).toBeDefined();
      expect(versionFinding!.details).not.toHaveProperty("incompatibleRanges");
    });

    it("reports MEDIUM for exact version and overlapping range", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { requiredVersion: "18.2.0" },
        }),
        createMockParticipant("remote-a", {
          react: { requiredVersion: "^18.0.0" },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const versionFinding = result.findings.find(
        (f) => f.message.includes("requiredVersion") && f.severity === "MEDIUM",
      );
      expect(versionFinding).toBeDefined();
      expect(versionFinding!.message).toContain("18.2.0");
      expect(versionFinding!.message).toContain("^18.0.0");
    });
  });

  describe("missing shared detection", () => {
    it("detects when singleton package is not shared by all", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { singleton: true },
        }),
        createMockParticipant("remote-a", {}),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const missingFinding = result.findings.find(
        (f) => f.message.includes("not all") && f.severity === "LOW",
      );
      expect(missingFinding).toBeDefined();
      expect(missingFinding!.details).toHaveProperty("sharedBy");
      expect(missingFinding!.details).toHaveProperty("notSharedBy");
    });

    it("ignores non-singleton packages", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          lodash: { requiredVersion: "^4.17.0" },
        }),
        createMockParticipant("remote-a", {}),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const missingFinding = result.findings.find(
        (f) => f.message.includes("not all") && f.message.includes("lodash"),
      );
      expect(missingFinding).toBeUndefined();
    });
  });

  describe("finding details", () => {
    it("includes suggestions for singleton mismatch", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          react: { singleton: true },
        }),
        createMockParticipant("remote-a", {
          react: { singleton: false },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const finding = result.findings.find((f) => f.severity === "HIGH");
      expect(finding!.suggestions).toBeDefined();
      expect(finding!.suggestions!.length).toBeGreaterThan(0);
    });

    it("includes package name in details", () => {
      const graph = createMockGraph([
        createMockParticipant("shell", {
          "custom-lib": { singleton: true },
        }),
        createMockParticipant("remote-a", {
          "custom-lib": { singleton: false },
        }),
      ]);

      const result = sharedConfigMismatchAnalyzer.analyze(graph);

      const finding = result.findings.find((f) => f.severity === "HIGH");
      expect(finding!.details).toHaveProperty("package", "custom-lib");
    });
  });
});
