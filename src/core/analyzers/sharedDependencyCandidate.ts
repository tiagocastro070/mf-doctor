import type {
  Analyzer,
  AnalyzeResult,
  Finding,
  ProjectGraph,
  FederationParticipant,
} from "../types.js";
import { getHostParticipants } from "../projectGraph.js";

const ANALYZER_ID = "shared-dependency-candidate";

const DEV_ONLY_DEPENDENCIES = new Set([
  "typescript",
  "eslint",
  "prettier",
  "vitest",
  "jest",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "ts-node",
  "tsx",
  "@vitejs/plugin-react",
  "@rspack/cli",
  "@rsbuild/core",
  "webpack",
  "webpack-cli",
  "vite",
  "rollup",
  "esbuild",
  "husky",
  "lint-staged",
  "commitlint",
]);

type DependencyInfo = {
  name: string;
  remoteCount: number;
  totalRemotes: number;
  remotesWithDep: string[];
  hostHasDependency: boolean;
  hostSharesDependency: boolean;
  hostName: string;
};

type AnalyzerOptions = {
  threshold: number;
};

const DEFAULT_OPTIONS: AnalyzerOptions = {
  threshold: 1.0,
};

/**
 * Gets the downstream remotes for a host participant via the graph edges.
 */
function getDownstreamRemotes(
  graph: ProjectGraph,
  host: FederationParticipant,
): FederationParticipant[] {
  const remoteNames = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.from === host.name) {
      remoteNames.add(edge.to);
    }
  }

  return graph.participants.filter((p) => remoteNames.has(p.name));
}

/**
 * Checks if a participant has a dependency in their package.json.
 */
function hasDependency(
  participant: FederationParticipant,
  depName: string,
): boolean {
  return (
    depName in participant.dependencies ||
    depName in participant.devDependencies
  );
}

/**
 * Checks if a dependency is in the shared config.
 */
function isShared(
  participant: FederationParticipant,
  depName: string,
): boolean {
  return depName in participant.federationConfig.shared;
}

/**
 * Checks if a dependency should be excluded from analysis.
 */
function shouldExclude(depName: string): boolean {
  if (DEV_ONLY_DEPENDENCIES.has(depName)) {
    return true;
  }

  if (depName.startsWith("@types/")) {
    return true;
  }

  if (
    depName.includes("eslint") ||
    depName.includes("prettier") ||
    depName.includes("stylelint")
  ) {
    return true;
  }

  return false;
}

/**
 * Collects all unique dependencies from a set of remotes.
 */
function collectRemoteDependencies(
  remotes: FederationParticipant[],
): Map<string, string[]> {
  const depToRemotes = new Map<string, string[]>();

  for (const remote of remotes) {
    const allDeps = [
      ...Object.keys(remote.dependencies),
      ...Object.keys(remote.devDependencies),
    ];

    for (const dep of allDeps) {
      if (shouldExclude(dep)) {
        continue;
      }

      if (!depToRemotes.has(dep)) {
        depToRemotes.set(dep, []);
      }
      depToRemotes.get(dep)!.push(remote.name);
    }
  }

  return depToRemotes;
}

/**
 * Analyzes dependencies for a single host and its remotes.
 */
function analyzeHostDependencies(
  graph: ProjectGraph,
  host: FederationParticipant,
  options: AnalyzerOptions,
): DependencyInfo[] {
  const remotes = getDownstreamRemotes(graph, host);

  if (remotes.length === 0) {
    return [];
  }

  const remoteDeps = collectRemoteDependencies(remotes);
  const candidates: DependencyInfo[] = [];

  for (const [depName, remotesWithDep] of remoteDeps) {
    const ratio = remotesWithDep.length / remotes.length;

    if (ratio < options.threshold) {
      continue;
    }

    const hostHasDep = hasDependency(host, depName);
    const hostShares = isShared(host, depName);

    if (hostShares) {
      continue;
    }

    candidates.push({
      name: depName,
      remoteCount: remotesWithDep.length,
      totalRemotes: remotes.length,
      remotesWithDep,
      hostHasDependency: hostHasDep,
      hostSharesDependency: hostShares,
      hostName: host.name,
    });
  }

  return candidates;
}

/**
 * Creates a finding for a dependency that could be shared.
 */
function createFinding(info: DependencyInfo): Finding {
  const scenario = info.hostHasDependency
    ? "add-to-shared"
    : "install-and-share";
  const allParticipants = [info.hostName, ...info.remotesWithDep];

  const coverageText =
    info.remoteCount === info.totalRemotes
      ? "all"
      : `${info.remoteCount}/${info.totalRemotes}`;

  let message: string;
  let suggestions: string[];

  if (scenario === "install-and-share") {
    message = `"${info.name}" is installed in ${coverageText} remotes but not on host "${info.hostName}". Consider installing it on the host and sharing it downstream.`;
    suggestions = [
      `Install "${info.name}" on "${info.hostName}" and add it to the shared config`,
      `Add "${info.name}" to the shared config of all remotes to receive it from the host`,
      "This can reduce bundle duplication across remotes",
    ];
  } else {
    message = `"${info.name}" is installed in ${coverageText} remotes and on host "${info.hostName}", but not shared. Consider sharing it from the host.`;
    suggestions = [
      `Add "${info.name}" to the shared config of "${info.hostName}"`,
      `Add "${info.name}" to the shared config of all remotes to receive it from the host`,
      "This can reduce bundle duplication and ensure version consistency",
    ];
  }

  return {
    id: ANALYZER_ID,
    severity: "LOW",
    message,
    participants: allParticipants,
    details: {
      dependency: info.name,
      remoteCount: info.remoteCount,
      totalRemotes: info.totalRemotes,
      remotesWithDep: info.remotesWithDep,
      hostHasDependency: info.hostHasDependency,
      hostSharesDependency: info.hostSharesDependency,
      scenario,
    },
    suggestions,
  };
}

/**
 * Analyzer that identifies dependencies common across remotes that could be
 * optimized by sharing from the host.
 *
 * This analyzer detects two scenarios:
 * 1. Dependency is installed on all/most remotes but not on the host
 *    → Suggest installing on host and sharing downstream
 * 2. Dependency is installed on all/most remotes AND on the host, but not shared
 *    → Suggest adding to shared config
 *
 * Benefits of sharing common dependencies from the host:
 * - Reduced bundle size across remotes (single copy instead of multiple)
 * - Guaranteed version consistency
 * - Faster load times for users
 */
export const sharedDependencyCandidateAnalyzer: Analyzer = {
  id: ANALYZER_ID,
  name: "Shared Dependency Candidate",
  description:
    "Identifies dependencies common across remotes that could be shared from the host",

  analyze(graph: ProjectGraph): AnalyzeResult {
    const findings: Finding[] = [];
    const hosts = getHostParticipants(graph);
    const options = DEFAULT_OPTIONS;

    for (const host of hosts) {
      const candidates = analyzeHostDependencies(graph, host, options);

      for (const candidate of candidates) {
        findings.push(createFinding(candidate));
      }
    }

    return {
      analyzerId: ANALYZER_ID,
      findings,
    };
  },
};

/**
 * Creates the analyzer with custom options.
 * This allows configuring the threshold for what percentage of remotes
 * must have a dependency for it to be flagged.
 */
export function createSharedDependencyCandidateAnalyzer(
  options: Partial<AnalyzerOptions> = {},
): Analyzer {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  return {
    ...sharedDependencyCandidateAnalyzer,
    analyze(graph: ProjectGraph): AnalyzeResult {
      const findings: Finding[] = [];
      const hosts = getHostParticipants(graph);

      for (const host of hosts) {
        const candidates = analyzeHostDependencies(graph, host, mergedOptions);

        for (const candidate of candidates) {
          findings.push(createFinding(candidate));
        }
      }

      return {
        analyzerId: ANALYZER_ID,
        findings,
      };
    },
  };
}
