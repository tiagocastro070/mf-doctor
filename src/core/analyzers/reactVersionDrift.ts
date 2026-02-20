import type {
  Analyzer,
  AnalyzeResult,
  Finding,
  ProjectGraph,
  FederationParticipant,
} from "../types.js";

const ANALYZER_ID = "react-version-drift";

type VersionInfo = {
  participant: string;
  packageVersion: string | null;
};

/**
 * Extracts the effective version of a package from a participant (resolved from lockfile when available, else declared).
 */
function getPackageVersion(
  participant: FederationParticipant,
  packageName: string,
): string | null {
  const resolved =
    participant.resolvedDependencies?.[packageName] ??
    participant.resolvedDevDependencies?.[packageName];
  if (resolved) return resolved;
  const declared =
    participant.dependencies[packageName] ??
    participant.devDependencies[packageName] ??
    null;
  return declared ? normalizeVersion(declared) : null;
}

/**
 * Collects version information for a package across all participants.
 */
function collectVersionInfo(
  graph: ProjectGraph,
  packageName: string,
): VersionInfo[] {
  return graph.participants.map((participant) => ({
    participant: participant.name,
    packageVersion: getPackageVersion(participant, packageName),
  }));
}

/**
 * Normalizes a version string for comparison.
 * Removes common prefixes like ^, ~, >=, etc.
 */
function normalizeVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, "").trim();
}

/**
 * Gets unique versions from version info (already resolved or normalized).
 */
function getUniqueVersions(versionInfos: VersionInfo[]): Set<string> {
  const versions = new Set<string>();
  for (const info of versionInfos) {
    if (info.packageVersion) {
      versions.add(info.packageVersion);
    }
  }
  return versions;
}

/**
 * Groups participants by their effective version.
 */
function groupByVersion(
  versionInfos: VersionInfo[],
): Map<string, VersionInfo[]> {
  const groups = new Map<string, VersionInfo[]>();

  for (const info of versionInfos) {
    const version = info.packageVersion ?? "unknown";

    if (!groups.has(version)) {
      groups.set(version, []);
    }
    groups.get(version)!.push(info);
  }

  return groups;
}

/**
 * Creates a finding for React version drift.
 */
function createDriftFinding(
  packageName: string,
  versionInfos: VersionInfo[],
  uniqueVersions: Set<string>,
): Finding {
  const versionGroups = groupByVersion(versionInfos);

  const details: Record<string, unknown> = {
    package: packageName,
    versions: Object.fromEntries(
      Array.from(versionGroups.entries()).map(([version, infos]) => [
        version,
        infos.map((i) => i.participant),
      ]),
    ),
  };

  const versionList = Array.from(uniqueVersions).sort().join(", ");

  return {
    id: ANALYZER_ID,
    severity: "HIGH",
    message: `Multiple ${packageName} versions detected: ${versionList}. This can cause duplicate bundles, hook violations, and runtime errors.`,
    participants: versionInfos.map((i) => i.participant),
    details,
    suggestions: [
      `Align all participants to the same ${packageName} version`,
      `Ensure shared config uses consistent requiredVersion across all participants`,
      `Consider using a workspace-level dependency constraint`,
    ],
  };
}

/**
 * Analyzer that detects React version drift across federation participants.
 *
 * React and react-dom must be the same version across all participants
 * to avoid:
 * - Duplicate React bundles in the final application
 * - "Invalid hook call" errors when hooks are called across different React instances
 * - Subtle runtime bugs from mismatched React internals
 */
export const reactVersionDriftAnalyzer: Analyzer = {
  id: ANALYZER_ID,
  name: "React Version Drift",
  description:
    "Detects when different participants use different versions of React or react-dom",

  analyze(graph: ProjectGraph): AnalyzeResult {
    const findings: Finding[] = [];

    for (const packageName of ["react", "react-dom"]) {
      const versionInfos = collectVersionInfo(graph, packageName);

      const participantsWithPackage = versionInfos.filter(
        (i) => i.packageVersion !== null,
      );

      if (participantsWithPackage.length === 0) {
        continue;
      }

      const uniqueVersions = getUniqueVersions(participantsWithPackage);

      if (uniqueVersions.size > 1) {
        findings.push(
          createDriftFinding(
            packageName,
            participantsWithPackage,
            uniqueVersions,
          ),
        );
      }
    }

    return {
      analyzerId: ANALYZER_ID,
      findings,
    };
  },
};
