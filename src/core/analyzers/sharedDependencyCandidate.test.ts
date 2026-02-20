import { describe, it, expect } from "vitest";
import {
  sharedDependencyCandidateAnalyzer,
  createSharedDependencyCandidateAnalyzer,
} from "./sharedDependencyCandidate.js";
import type {
  ProjectGraph,
  FederationParticipant,
  SharedConfig,
} from "../types.js";

function createMockParticipant(
  name: string,
  options: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    shared?: Record<string, SharedConfig | string>;
    remotes?: Record<string, string>;
    exposes?: Record<string, string>;
  } = {},
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
      exposes: options.exposes ?? {},
      remotes: options.remotes ?? {},
      shared: options.shared ?? {},
    },
    dependencies: options.dependencies ?? {},
    devDependencies: options.devDependencies ?? {},
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

describe("sharedDependencyCandidateAnalyzer", () => {
  describe("scenario: remotes have dependency, host does not", () => {
    it("detects dependency in all remotes but not on host", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0" },
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
          remoteB: "remoteB@http://localhost:3002/mf-manifest.json",
        },
      });

      const remoteA = createMockParticipant("remote-a", {
        dependencies: { react: "^18.0.0", tailwindcss: "^3.4.0" },
        exposes: { "./Button": "./src/Button.tsx" },
      });
      remoteA.federationConfig.name = "remoteA";

      const remoteB = createMockParticipant("remote-b", {
        dependencies: { react: "^18.0.0", tailwindcss: "^3.4.0" },
        exposes: { "./Card": "./src/Card.tsx" },
      });
      remoteB.federationConfig.name = "remoteB";

      const graph = createMockGraph(
        [host, remoteA, remoteB],
        [
          { from: "shell", to: "remote-a", remoteKey: "remoteA" },
          { from: "shell", to: "remote-b", remoteKey: "remoteB" },
        ],
      );

      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      const tailwindFinding = result.findings.find(
        (f) =>
          (f.details as Record<string, unknown>).dependency === "tailwindcss",
      );

      expect(tailwindFinding).toBeDefined();
      expect(tailwindFinding!.severity).toBe("LOW");
      expect(tailwindFinding!.message).toContain("tailwindcss");
      expect(tailwindFinding!.message).toContain("not on host");
      expect(tailwindFinding!.details).toMatchObject({
        dependency: "tailwindcss",
        remoteCount: 2,
        totalRemotes: 2,
        hostHasDependency: false,
        hostSharesDependency: false,
        scenario: "install-and-share",
      });
      expect(tailwindFinding!.suggestions).toBeDefined();
      expect(tailwindFinding!.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe("scenario: remotes and host have dependency, but not shared", () => {
    it("detects dependency on host and remotes but not shared", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0", lodash: "^4.17.0" },
        shared: { react: { singleton: true } },
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
          remoteB: "remoteB@http://localhost:3002/mf-manifest.json",
        },
      });

      const remoteA = createMockParticipant("remote-a", {
        dependencies: { react: "^18.0.0", lodash: "^4.17.0" },
        exposes: { "./Button": "./src/Button.tsx" },
      });
      remoteA.federationConfig.name = "remoteA";

      const remoteB = createMockParticipant("remote-b", {
        dependencies: { react: "^18.0.0", lodash: "^4.17.0" },
        exposes: { "./Card": "./src/Card.tsx" },
      });
      remoteB.federationConfig.name = "remoteB";

      const graph = createMockGraph(
        [host, remoteA, remoteB],
        [
          { from: "shell", to: "remote-a", remoteKey: "remoteA" },
          { from: "shell", to: "remote-b", remoteKey: "remoteB" },
        ],
      );

      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      const lodashFinding = result.findings.find(
        (f) => (f.details as Record<string, unknown>).dependency === "lodash",
      );

      expect(lodashFinding).toBeDefined();
      expect(lodashFinding!.message).toContain("lodash");
      expect(lodashFinding!.message).toContain("not shared");
      expect(lodashFinding!.details).toMatchObject({
        dependency: "lodash",
        hostHasDependency: true,
        hostSharesDependency: false,
        scenario: "add-to-shared",
      });
    });
  });

  describe("no findings when already shared", () => {
    it("returns no findings when dependency is already shared from host", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0", lodash: "^4.17.0" },
        shared: { react: { singleton: true }, lodash: { singleton: false } },
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        },
      });

      const remoteA = createMockParticipant("remote-a", {
        dependencies: { react: "^18.0.0", lodash: "^4.17.0" },
        exposes: { "./Button": "./src/Button.tsx" },
      });
      remoteA.federationConfig.name = "remoteA";

      const graph = createMockGraph(
        [host, remoteA],
        [{ from: "shell", to: "remote-a", remoteKey: "remoteA" }],
      );

      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      const lodashFinding = result.findings.find(
        (f) => (f.details as Record<string, unknown>).dependency === "lodash",
      );

      expect(lodashFinding).toBeUndefined();
    });
  });

  describe("excludes dev-only dependencies", () => {
    it("does not flag typescript, eslint, or other dev tools", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0" },
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        },
      });

      const remoteA = createMockParticipant("remote-a", {
        dependencies: { react: "^18.0.0" },
        devDependencies: {
          typescript: "^5.0.0",
          eslint: "^8.0.0",
          prettier: "^3.0.0",
          vitest: "^1.0.0",
          "@types/react": "^18.0.0",
        },
        exposes: { "./Button": "./src/Button.tsx" },
      });
      remoteA.federationConfig.name = "remoteA";

      const graph = createMockGraph(
        [host, remoteA],
        [{ from: "shell", to: "remote-a", remoteKey: "remoteA" }],
      );

      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      const devToolFindings = result.findings.filter((f) => {
        const dep = (f.details as Record<string, unknown>).dependency as string;
        return [
          "typescript",
          "eslint",
          "prettier",
          "vitest",
          "@types/react",
        ].includes(dep);
      });

      expect(devToolFindings).toHaveLength(0);
    });

    it("excludes eslint plugins and configs", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0" },
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        },
      });

      const remoteA = createMockParticipant("remote-a", {
        dependencies: { react: "^18.0.0" },
        devDependencies: {
          "eslint-plugin-react": "^7.0.0",
          "eslint-config-prettier": "^9.0.0",
        },
        exposes: { "./Button": "./src/Button.tsx" },
      });
      remoteA.federationConfig.name = "remoteA";

      const graph = createMockGraph(
        [host, remoteA],
        [{ from: "shell", to: "remote-a", remoteKey: "remoteA" }],
      );

      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      const eslintFindings = result.findings.filter((f) => {
        const dep = (f.details as Record<string, unknown>).dependency as string;
        return dep.includes("eslint");
      });

      expect(eslintFindings).toHaveLength(0);
    });
  });

  describe("threshold configuration", () => {
    it("respects custom threshold", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0" },
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
          remoteB: "remoteB@http://localhost:3002/mf-manifest.json",
          remoteC: "remoteC@http://localhost:3003/mf-manifest.json",
        },
      });

      const remoteA = createMockParticipant("remote-a", {
        dependencies: { react: "^18.0.0", "date-fns": "^3.0.0" },
        exposes: { "./Button": "./src/Button.tsx" },
      });
      remoteA.federationConfig.name = "remoteA";

      const remoteB = createMockParticipant("remote-b", {
        dependencies: { react: "^18.0.0", "date-fns": "^3.0.0" },
        exposes: { "./Card": "./src/Card.tsx" },
      });
      remoteB.federationConfig.name = "remoteB";

      const remoteC = createMockParticipant("remote-c", {
        dependencies: { react: "^18.0.0" },
        exposes: { "./Modal": "./src/Modal.tsx" },
      });
      remoteC.federationConfig.name = "remoteC";

      const graph = createMockGraph(
        [host, remoteA, remoteB, remoteC],
        [
          { from: "shell", to: "remote-a", remoteKey: "remoteA" },
          { from: "shell", to: "remote-b", remoteKey: "remoteB" },
          { from: "shell", to: "remote-c", remoteKey: "remoteC" },
        ],
      );

      const defaultAnalyzer = sharedDependencyCandidateAnalyzer;
      const defaultResult = defaultAnalyzer.analyze(graph);

      const dateFnsDefaultFinding = defaultResult.findings.find(
        (f) => (f.details as Record<string, unknown>).dependency === "date-fns",
      );
      expect(dateFnsDefaultFinding).toBeUndefined();

      const customAnalyzer = createSharedDependencyCandidateAnalyzer({
        threshold: 0.6,
      });
      const customResult = customAnalyzer.analyze(graph);

      const dateFnsCustomFinding = customResult.findings.find(
        (f) => (f.details as Record<string, unknown>).dependency === "date-fns",
      );
      expect(dateFnsCustomFinding).toBeDefined();
      expect(dateFnsCustomFinding!.details).toMatchObject({
        remoteCount: 2,
        totalRemotes: 3,
      });
    });
  });

  describe("no remotes scenario", () => {
    it("returns no findings when host has no remotes", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0" },
        remotes: {},
      });
      host.hostOverride = true;

      const graph = createMockGraph([host], []);

      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      expect(result.findings).toHaveLength(0);
    });
  });

  describe("finding details", () => {
    it("includes all participants in finding", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0" },
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
          remoteB: "remoteB@http://localhost:3002/mf-manifest.json",
        },
      });

      const remoteA = createMockParticipant("remote-a", {
        dependencies: { react: "^18.0.0", axios: "^1.0.0" },
        exposes: { "./Button": "./src/Button.tsx" },
      });
      remoteA.federationConfig.name = "remoteA";

      const remoteB = createMockParticipant("remote-b", {
        dependencies: { react: "^18.0.0", axios: "^1.0.0" },
        exposes: { "./Card": "./src/Card.tsx" },
      });
      remoteB.federationConfig.name = "remoteB";

      const graph = createMockGraph(
        [host, remoteA, remoteB],
        [
          { from: "shell", to: "remote-a", remoteKey: "remoteA" },
          { from: "shell", to: "remote-b", remoteKey: "remoteB" },
        ],
      );

      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      const axiosFinding = result.findings.find(
        (f) => (f.details as Record<string, unknown>).dependency === "axios",
      );

      expect(axiosFinding).toBeDefined();
      expect(axiosFinding!.participants).toContain("shell");
      expect(axiosFinding!.participants).toContain("remote-a");
      expect(axiosFinding!.participants).toContain("remote-b");
    });

    it("includes remotesWithDep in details", () => {
      const host = createMockParticipant("shell", {
        dependencies: { react: "^18.0.0" },
        remotes: {
          remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        },
      });

      const remoteA = createMockParticipant("remote-a", {
        dependencies: { react: "^18.0.0", zustand: "^4.0.0" },
        exposes: { "./Button": "./src/Button.tsx" },
      });
      remoteA.federationConfig.name = "remoteA";

      const graph = createMockGraph(
        [host, remoteA],
        [{ from: "shell", to: "remote-a", remoteKey: "remoteA" }],
      );

      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      const zustandFinding = result.findings.find(
        (f) => (f.details as Record<string, unknown>).dependency === "zustand",
      );

      expect(zustandFinding).toBeDefined();
      expect(
        (zustandFinding!.details as Record<string, unknown>).remotesWithDep,
      ).toEqual(["remote-a"]);
    });
  });

  describe("analyzer metadata", () => {
    it("has correct id and metadata", () => {
      expect(sharedDependencyCandidateAnalyzer.id).toBe(
        "shared-dependency-candidate",
      );
      expect(sharedDependencyCandidateAnalyzer.name).toBe(
        "Shared Dependency Candidate",
      );
      expect(sharedDependencyCandidateAnalyzer.description).toBeDefined();
    });

    it("returns correct analyzerId in result", () => {
      const graph = createMockGraph([], []);
      const result = sharedDependencyCandidateAnalyzer.analyze(graph);

      expect(result.analyzerId).toBe("shared-dependency-candidate");
    });
  });
});
