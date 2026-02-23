import semver from "semver";
import type {
  Analyzer,
  AnalyzeResult,
  Finding,
  ProjectGraph,
  SharedConfig,
} from "../types.js";

const ANALYZER_ID = "shared-config-mismatch";

/**
 * Normalized shared config with all fields explicitly set.
 */
type NormalizedSharedConfig = {
  singleton: boolean | undefined;
  eager: boolean | undefined;
  requiredVersion: string | undefined;
  strictVersion: boolean | undefined;
  shareScope: string | undefined;
};

/**
 * Config info for a specific package from a participant.
 */
type ParticipantSharedConfig = {
  participantName: string;
  config: NormalizedSharedConfig;
  hasPackage: boolean;
};

/**
 * Normalizes a shared config entry to a consistent format.
 */
function normalizeSharedConfig(
  config: SharedConfig | string | undefined,
): NormalizedSharedConfig {
  if (!config) {
    return {
      singleton: undefined,
      eager: undefined,
      requiredVersion: undefined,
      strictVersion: undefined,
      shareScope: undefined,
    };
  }

  if (typeof config === "string") {
    return {
      singleton: undefined,
      eager: undefined,
      requiredVersion: config,
      strictVersion: undefined,
      shareScope: undefined,
    };
  }

  return {
    singleton: config.singleton,
    eager: config.eager,
    requiredVersion:
      config.requiredVersion === false
        ? undefined
        : config.requiredVersion?.toString(),
    strictVersion: config.strictVersion,
    shareScope: config.shareScope,
  };
}

/**
 * Collects shared config for a package across all participants.
 */
function collectSharedConfigs(
  graph: ProjectGraph,
  packageName: string,
): ParticipantSharedConfig[] {
  return graph.participants.map((participant) => {
    const sharedEntry = participant.federationConfig.shared[packageName];
    return {
      participantName: participant.name,
      config: normalizeSharedConfig(sharedEntry),
      hasPackage: sharedEntry !== undefined,
    };
  });
}

/**
 * Gets all unique shared package names across all participants.
 * Only includes packages that are runtime dependencies (in dependencies, not
 * exclusively devDependencies) of at least one participant. Dev-only packages
 * are not loaded into the browser, so we skip mismatch analysis for them.
 */
function getAllSharedPackages(graph: ProjectGraph): Set<string> {
  const packages = new Set<string>();

  for (const participant of graph.participants) {
    for (const packageName of Object.keys(
      participant.federationConfig.shared,
    )) {
      if (packageName in participant.dependencies) {
        packages.add(packageName);
      }
    }
  }

  return packages;
}

/**
 * Detects singleton mismatches.
 */
function detectSingletonMismatch(
  packageName: string,
  configs: ParticipantSharedConfig[],
): Finding | null {
  const withSingleton = configs.filter(
    (c) => c.hasPackage && c.config.singleton !== undefined,
  );

  if (withSingleton.length === 0) {
    return null;
  }

  const singletonValues = new Set(withSingleton.map((c) => c.config.singleton));

  if (singletonValues.size <= 1) {
    return null;
  }

  const trueParticipants = withSingleton
    .filter((c) => c.config.singleton === true)
    .map((c) => c.participantName);

  const falseParticipants = withSingleton
    .filter((c) => c.config.singleton === false)
    .map((c) => c.participantName);

  return {
    id: ANALYZER_ID,
    severity: "HIGH",
    message: `Inconsistent singleton setting for "${packageName}": some participants use singleton: true, others use singleton: false`,
    participants: withSingleton.map((c) => c.participantName),
    details: {
      package: packageName,
      property: "singleton",
      singletonTrue: trueParticipants,
      singletonFalse: falseParticipants,
    },
    suggestions: [
      `Set singleton: true for "${packageName}" in all participants to ensure a single instance`,
      "Singleton is recommended for stateful libraries like React, Redux, or shared contexts",
    ],
  };
}

/**
 * Detects eager mismatches.
 */
function detectEagerMismatch(
  packageName: string,
  configs: ParticipantSharedConfig[],
): Finding | null {
  const withEager = configs.filter(
    (c) => c.hasPackage && c.config.eager !== undefined,
  );

  if (withEager.length === 0) {
    return null;
  }

  const eagerValues = new Set(withEager.map((c) => c.config.eager));

  if (eagerValues.size <= 1) {
    return null;
  }

  const trueParticipants = withEager
    .filter((c) => c.config.eager === true)
    .map((c) => c.participantName);

  const falseParticipants = withEager
    .filter((c) => c.config.eager === false)
    .map((c) => c.participantName);

  return {
    id: ANALYZER_ID,
    severity: "MEDIUM",
    message: `Inconsistent eager setting for "${packageName}": some participants load eagerly, others lazily`,
    participants: withEager.map((c) => c.participantName),
    details: {
      package: packageName,
      property: "eager",
      eagerTrue: trueParticipants,
      eagerFalse: falseParticipants,
    },
    suggestions: [
      "Consider using consistent eager settings across all participants",
      "eager: true is typically needed when the shared module is used in the initial chunk",
    ],
  };
}

function requiredVersionRangesOverlap(
  configs: ParticipantSharedConfig[],
): boolean {
  const validRanges = configs
    .map((c) => c.config.requiredVersion!)
    .map((v) => semver.validRange(v))
    .filter((r): r is string => r != null && r !== "");

  if (validRanges.length <= 1) {
    return true;
  }

  for (let i = 0; i < validRanges.length; i++) {
    for (let j = i + 1; j < validRanges.length; j++) {
      if (!semver.intersects(validRanges[i], validRanges[j])) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Detects requiredVersion mismatches and incompatible ranges.
 */
function detectRequiredVersionMismatch(
  packageName: string,
  configs: ParticipantSharedConfig[],
): Finding | null {
  const withVersion = configs.filter(
    (c) => c.hasPackage && c.config.requiredVersion !== undefined,
  );

  if (withVersion.length <= 1) {
    return null;
  }

  const versionsByParticipant: Record<string, string> = {};
  for (const config of withVersion) {
    versionsByParticipant[config.participantName] =
      config.config.requiredVersion!;
  }

  const versions = new Set(withVersion.map((c) => c.config.requiredVersion));

  const overlap = requiredVersionRangesOverlap(withVersion);
  if (!overlap) {
    return {
      id: ANALYZER_ID,
      severity: "HIGH",
      message: `RequiredVersion ranges for "${packageName}" are incompatible; no single version satisfies all participants.`,
      participants: withVersion.map((c) => c.participantName),
      details: {
        package: packageName,
        property: "requiredVersion",
        versions: versionsByParticipant,
        incompatibleRanges: true,
      },
      suggestions: [
        "Align requiredVersion ranges so at least one version satisfies all participants",
        "Consider upgrading or downgrading so a single version can satisfy every app",
      ],
    };
  }

  if (versions.size <= 1) {
    return null;
  }

  return {
    id: ANALYZER_ID,
    severity: "MEDIUM",
    message: `Inconsistent requiredVersion for "${packageName}": ${Array.from(versions).join(", ")}`,
    participants: withVersion.map((c) => c.participantName),
    details: {
      package: packageName,
      property: "requiredVersion",
      versions: versionsByParticipant,
    },
    suggestions: [
      `Align requiredVersion for "${packageName}" across all participants`,
      "Consider using a caret range (^) for minor version flexibility",
    ],
  };
}

/**
 * Detects when a package is shared by some participants but not others.
 */
function detectMissingShared(
  packageName: string,
  configs: ParticipantSharedConfig[],
): Finding | null {
  const withPackage = configs.filter((c) => c.hasPackage);
  const withoutPackage = configs.filter((c) => !c.hasPackage);

  if (withPackage.length === 0 || withoutPackage.length === 0) {
    return null;
  }

  if (withPackage.length === configs.length) {
    return null;
  }

  const hasSingleton = withPackage.some((c) => c.config.singleton === true);

  if (!hasSingleton) {
    return null;
  }

  return {
    id: ANALYZER_ID,
    severity: "LOW",
    message: `"${packageName}" is shared by some participants but not all. This may cause duplicate bundles.`,
    participants: configs.map((c) => c.participantName),
    details: {
      package: packageName,
      sharedBy: withPackage.map((c) => c.participantName),
      notSharedBy: withoutPackage.map((c) => c.participantName),
    },
    suggestions: [
      `Consider adding "${packageName}" to the shared config of all participants`,
      "Ensure all participants that use this package include it in their shared config",
    ],
  };
}

/**
 * Analyzer that detects shared configuration mismatches across participants.
 *
 * Module Federation's shared config determines how dependencies are loaded
 * and shared at runtime. Inconsistent settings can cause:
 * - Multiple instances of singleton libraries (e.g., React contexts breaking)
 * - Unexpected loading behavior with eager vs lazy loading
 * - Version conflicts when requiredVersion constraints differ
 */
export const sharedConfigMismatchAnalyzer: Analyzer = {
  id: ANALYZER_ID,
  name: "Shared Config Mismatch",
  description:
    "Detects inconsistent shared configuration across federation participants",

  analyze(graph: ProjectGraph): AnalyzeResult {
    const findings: Finding[] = [];
    const sharedPackages = getAllSharedPackages(graph);

    for (const packageName of sharedPackages) {
      const configs = collectSharedConfigs(graph, packageName);

      const singletonMismatch = detectSingletonMismatch(packageName, configs);
      if (singletonMismatch) {
        findings.push(singletonMismatch);
      }

      const eagerMismatch = detectEagerMismatch(packageName, configs);
      if (eagerMismatch) {
        findings.push(eagerMismatch);
      }

      const versionMismatch = detectRequiredVersionMismatch(
        packageName,
        configs,
      );
      if (versionMismatch) {
        findings.push(versionMismatch);
      }

      const missingShared = detectMissingShared(packageName, configs);
      if (missingShared) {
        findings.push(missingShared);
      }
    }

    return {
      analyzerId: ANALYZER_ID,
      findings,
    };
  },
};
