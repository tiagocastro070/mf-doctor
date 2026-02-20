import type {
  Analyzer,
  AnalyzeResult,
  Finding,
  ProjectGraph,
  FederationParticipant,
} from "../types.js";
import { getRemoteParticipants } from "../projectGraph.js";

const ANALYZER_ID = "orphan-expose";

/**
 * Gets the set of participant names that are consumed by at least one host.
 */
function getConsumedParticipantNames(graph: ProjectGraph): Set<string> {
  return new Set(graph.edges.map((edge) => edge.to));
}

/**
 * Finds remotes that have exposes but are not consumed by any host.
 */
function getOrphanRemotes(graph: ProjectGraph): FederationParticipant[] {
  const remotes = getRemoteParticipants(graph);
  const consumedNames = getConsumedParticipantNames(graph);

  return remotes.filter((remote) => !consumedNames.has(remote.name));
}

/**
 * Creates a finding for an orphan remote.
 */
function createOrphanFinding(remote: FederationParticipant): Finding {
  const exposeKeys = Object.keys(remote.federationConfig.exposes);
  const exposeCount = exposeKeys.length;

  return {
    id: ANALYZER_ID,
    severity: "LOW",
    message: `Remote "${remote.name}" exposes ${exposeCount} module(s) but is not consumed by any host`,
    participants: [remote.name],
    details: {
      remote: remote.name,
      federationName: remote.federationConfig.name,
      exposeCount,
      exposeKeys,
    },
    suggestions: [
      `Add "${remote.federationConfig.name}" to a host's remotes configuration`,
      "Remove unused exposes if the remote is no longer needed",
      "Verify the federation name matches what hosts expect in their remotes config",
    ],
  };
}

/**
 * Analyzer that detects remotes with exposes that no host consumes.
 *
 * An orphan expose occurs when a remote:
 * - Has modules in its `exposes` configuration
 * - Is not referenced in any host's `remotes` configuration
 *
 * This can indicate:
 * - Dead code that should be removed
 * - A misconfigured remote name that doesn't match the host's expected name
 * - A remote that was added but forgotten to be wired up
 *
 * While not a breaking issue, orphan exposes add complexity and confusion
 * to the federation topology.
 */
export const orphanExposeAnalyzer: Analyzer = {
  id: ANALYZER_ID,
  name: "Orphan Expose",
  description:
    "Detects remotes with exposes that no host consumes, indicating dead code or misconfiguration",

  analyze(graph: ProjectGraph): AnalyzeResult {
    const findings: Finding[] = [];
    const orphanRemotes = getOrphanRemotes(graph);

    for (const remote of orphanRemotes) {
      findings.push(createOrphanFinding(remote));
    }

    return {
      analyzerId: ANALYZER_ID,
      findings,
    };
  },
};
