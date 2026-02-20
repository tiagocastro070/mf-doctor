import type {
  Analyzer,
  AnalyzeResult,
  Finding,
  ProjectGraph,
} from "../types.js";
import { getRemoteParticipants } from "../projectGraph.js";

const ANALYZER_ID = "duplicate-expose-name";

/**
 * Information about a remote that exposes a particular key.
 */
type ExposeInfo = {
  participantName: string;
  modulePath: string;
};

/**
 * Collects all expose keys across remotes and groups them by key.
 * Returns a map of expose key to the list of remotes that expose it.
 */
function collectExposesByKey(graph: ProjectGraph): Map<string, ExposeInfo[]> {
  const exposesByKey = new Map<string, ExposeInfo[]>();
  const remotes = getRemoteParticipants(graph);

  for (const remote of remotes) {
    const exposes = remote.federationConfig.exposes;

    for (const [exposeKey, modulePath] of Object.entries(exposes)) {
      const existing = exposesByKey.get(exposeKey) || [];
      existing.push({
        participantName: remote.name,
        modulePath,
      });
      exposesByKey.set(exposeKey, existing);
    }
  }

  return exposesByKey;
}

/**
 * Creates a finding for a duplicate expose key.
 */
function createDuplicateFinding(
  exposeKey: string,
  exposes: ExposeInfo[],
): Finding {
  const participants = exposes.map((e) => e.participantName);
  const exposePaths: Record<string, string> = {};

  for (const expose of exposes) {
    exposePaths[expose.participantName] = expose.modulePath;
  }

  return {
    id: ANALYZER_ID,
    severity: "MEDIUM",
    message: `Duplicate expose key "${exposeKey}" found in multiple remotes: ${participants.join(", ")}`,
    participants,
    details: {
      exposeKey,
      remotes: participants,
      exposePaths,
    },
    suggestions: [
      `Rename one of the exposes to avoid confusion (e.g., "${exposeKey}A", "${exposeKey.replace("./", "./Primary")}")`,
      "Use distinct naming conventions per remote to prevent collisions",
      "Consider if these modules should be consolidated into a single remote",
    ],
  };
}

/**
 * Analyzer that detects when multiple remotes expose the same key.
 *
 * When multiple remotes expose the same key (e.g., both expose "./Button"),
 * it can cause:
 * - Developer confusion about which remote provides a given module
 * - Potential runtime issues if imports are misconfigured
 * - Naming collisions that indicate a design problem
 *
 * While Module Federation technically allows this (consumers must use
 * remote-specific imports like "remoteA/Button" vs "remoteB/Button"),
 * duplicate expose keys often indicate poor naming conventions or
 * modules that should be consolidated.
 */
export const duplicateExposeNameAnalyzer: Analyzer = {
  id: ANALYZER_ID,
  name: "Duplicate Expose Name",
  description:
    "Detects when multiple remotes expose the same key, which can cause confusion and shadowing issues",

  analyze(graph: ProjectGraph): AnalyzeResult {
    const findings: Finding[] = [];
    const exposesByKey = collectExposesByKey(graph);

    for (const [exposeKey, exposes] of exposesByKey) {
      if (exposes.length > 1) {
        findings.push(createDuplicateFinding(exposeKey, exposes));
      }
    }

    return {
      analyzerId: ANALYZER_ID,
      findings,
    };
  },
};
