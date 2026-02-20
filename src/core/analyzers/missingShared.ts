import type {
  Analyzer,
  AnalyzeResult,
  Finding,
  ProjectGraph,
  FederationParticipant,
} from "../types.js";

const ANALYZER_ID = "missing-shared";

/**
 * Dependencies that are typically dev-only and shouldn't be shared at runtime.
 */
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
  "@rsbuild/plugin-react",
  "@module-federation/rsbuild-plugin",
  "webpack",
  "webpack-cli",
  "vite",
  "rollup",
  "esbuild",
  "husky",
  "lint-staged",
  "commitlint",
]);

/**
 * Information about a dependency used across participants.
 */
type DependencyUsage = {
  name: string;
  participants: string[];
  versions: Map<string, string[]>;
  isSharedByAny: boolean;
  sharedByParticipants: string[];
};

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
 * Gets the version of a dependency from a participant.
 */
function getDependencyVersion(
  participant: FederationParticipant,
  depName: string,
): string | null {
  return (
    participant.dependencies[depName] ??
    participant.devDependencies[depName] ??
    null
  );
}

/**
 * Checks if a participant has a dependency configured in shared.
 */
function hasInShared(
  participant: FederationParticipant,
  depName: string,
): boolean {
  return depName in participant.federationConfig.shared;
}

/**
 * Collects usage information for all dependencies across participants.
 */
function collectDependencyUsage(
  graph: ProjectGraph,
): Map<string, DependencyUsage> {
  const usageMap = new Map<string, DependencyUsage>();

  for (const participant of graph.participants) {
    const allDeps = new Set([
      ...Object.keys(participant.dependencies),
      ...Object.keys(participant.devDependencies),
    ]);

    for (const depName of allDeps) {
      if (shouldExclude(depName)) {
        continue;
      }

      if (!usageMap.has(depName)) {
        usageMap.set(depName, {
          name: depName,
          participants: [],
          versions: new Map(),
          isSharedByAny: false,
          sharedByParticipants: [],
        });
      }

      const usage = usageMap.get(depName)!;
      usage.participants.push(participant.name);

      const version = getDependencyVersion(participant, depName);
      if (version) {
        if (!usage.versions.has(version)) {
          usage.versions.set(version, []);
        }
        usage.versions.get(version)!.push(participant.name);
      }

      if (hasInShared(participant, depName)) {
        usage.isSharedByAny = true;
        usage.sharedByParticipants.push(participant.name);
      }
    }
  }

  return usageMap;
}

/**
 * Filters dependencies that are used by multiple participants but not shared.
 */
function findMissingShared(
  usageMap: Map<string, DependencyUsage>,
  minParticipants: number,
): DependencyUsage[] {
  const missing: DependencyUsage[] = [];

  for (const usage of usageMap.values()) {
    if (usage.participants.length >= minParticipants && !usage.isSharedByAny) {
      missing.push(usage);
    }
  }

  return missing.sort((a, b) => b.participants.length - a.participants.length);
}

/**
 * Creates a finding for a missing shared dependency.
 */
function createFinding(
  usage: DependencyUsage,
  totalParticipants: number,
): Finding {
  const participantCount = usage.participants.length;
  const versionCount = usage.versions.size;

  let versionInfo = "";
  if (versionCount > 1) {
    const versionList = Array.from(usage.versions.keys()).sort().join(", ");
    versionInfo = ` (${versionCount} different versions: ${versionList})`;
  }

  return {
    id: ANALYZER_ID,
    severity: "MEDIUM",
    message: `"${usage.name}" is used by ${participantCount}/${totalParticipants} participants but not in any shared config${versionInfo}`,
    participants: usage.participants,
    details: {
      dependency: usage.name,
      participantCount,
      totalParticipants,
      participants: usage.participants,
      versionCount,
      versions: Object.fromEntries(usage.versions),
    },
    suggestions: [
      `Add "${usage.name}" to the shared config of all participants that use it`,
      "Consider setting singleton: true if the library maintains global state",
      "Use consistent requiredVersion across all participants to prevent version conflicts",
    ],
  };
}

/**
 * Analyzer that detects dependencies used across multiple participants
 * but not configured in any shared config.
 *
 * When a dependency is used by multiple federation participants but not
 * shared, each participant bundles its own copy, leading to:
 * - Increased bundle sizes
 * - Potential version mismatches causing runtime errors
 * - Memory overhead from multiple instances
 *
 * This is different from sharedDependencyCandidateAnalyzer which focuses
 * on host-remote relationships. This analyzer looks globally at all
 * participants to find dependencies that should probably be shared.
 */
export const missingSharedAnalyzer: Analyzer = {
  id: ANALYZER_ID,
  name: "Missing Shared",
  description:
    "Detects dependencies used across participants but not configured in any shared config",

  analyze(graph: ProjectGraph): AnalyzeResult {
    const findings: Finding[] = [];

    if (graph.participants.length < 2) {
      return { analyzerId: ANALYZER_ID, findings };
    }

    const usageMap = collectDependencyUsage(graph);
    const minParticipants = 2;
    const missingShared = findMissingShared(usageMap, minParticipants);

    for (const usage of missingShared) {
      findings.push(createFinding(usage, graph.participants.length));
    }

    return {
      analyzerId: ANALYZER_ID,
      findings,
    };
  },
};
