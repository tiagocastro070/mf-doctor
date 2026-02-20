import type { FederationParticipant, ProjectGraph } from "./types.js";

/**
 * Extracts the remote name from a remote URL.
 * e.g., "remoteA@http://localhost:3001/mf-manifest.json" -> "remoteA"
 */
function extractRemoteName(remoteUrl: string): string | null {
  const atIndex = remoteUrl.indexOf("@");
  if (atIndex > 0) {
    return remoteUrl.substring(0, atIndex);
  }
  return null;
}

/**
 * Builds a ProjectGraph from a list of discovered participants.
 *
 * The graph includes:
 * - All participants with their federation configs
 * - Edges representing remote dependencies between participants
 *
 * @param workspaceRoot - Absolute path to the workspace root
 * @param participants - Array of discovered federation participants
 * @returns The complete ProjectGraph
 */
export function buildProjectGraph(
  workspaceRoot: string,
  participants: FederationParticipant[],
): ProjectGraph {
  const edges: ProjectGraph["edges"] = [];

  const participantsByFederationName = new Map<string, FederationParticipant>();
  for (const participant of participants) {
    const federationName = participant.federationConfig.name;
    if (federationName) {
      participantsByFederationName.set(federationName, participant);
    }
  }

  for (const participant of participants) {
    const remotes = participant.federationConfig.remotes;

    for (const [remoteKey, remoteUrl] of Object.entries(remotes)) {
      const remoteName = extractRemoteName(remoteUrl);

      if (remoteName && participantsByFederationName.has(remoteName)) {
        edges.push({
          from: participant.name,
          to: participantsByFederationName.get(remoteName)!.name,
          remoteKey,
        });
      }
    }
  }

  return {
    workspaceRoot,
    participants,
    edges,
  };
}

/**
 * Gets all participants that expose modules (remotes).
 */
export function getRemoteParticipants(
  graph: ProjectGraph,
): FederationParticipant[] {
  return graph.participants.filter(
    (p) => Object.keys(p.federationConfig.exposes).length > 0,
  );
}

/**
 * Gets all participants that consume remotes (hosts/shells).
 * Includes participants with static remotes OR those marked as hosts via override.
 */
export function getHostParticipants(
  graph: ProjectGraph,
): FederationParticipant[] {
  return graph.participants.filter(
    (p) => Object.keys(p.federationConfig.remotes).length > 0 || p.hostOverride,
  );
}

/**
 * Gets the participants that a given participant depends on (consumes as remotes).
 */
export function getDependencies(
  graph: ProjectGraph,
  participantName: string,
): FederationParticipant[] {
  const edges = graph.edges.filter((e) => e.from === participantName);
  const dependencyNames = new Set(edges.map((e) => e.to));

  return graph.participants.filter((p) => dependencyNames.has(p.name));
}

/**
 * Gets the participants that depend on a given participant (consume it as a remote).
 */
export function getDependents(
  graph: ProjectGraph,
  participantName: string,
): FederationParticipant[] {
  const edges = graph.edges.filter((e) => e.to === participantName);
  const dependentNames = new Set(edges.map((e) => e.from));

  return graph.participants.filter((p) => dependentNames.has(p.name));
}

/**
 * Applies host overrides to participants.
 * Marks participants matching the override names as hosts even if they have no static remotes.
 * Also sets runtimeRemotes flag for override hosts with empty remotes.
 *
 * @param participants - Array of discovered participants
 * @param hostOverrides - Array of participant names to mark as hosts
 * @returns Updated participants with host overrides applied
 */
export function applyHostOverrides(
  participants: FederationParticipant[],
  hostOverrides: string[],
): FederationParticipant[] {
  if (hostOverrides.length === 0) {
    return participants;
  }

  const overrideSet = new Set(hostOverrides);

  return participants.map((participant) => {
    const isOverride = overrideSet.has(participant.name);
    if (!isOverride) {
      return participant;
    }

    const hasStaticRemotes =
      Object.keys(participant.federationConfig.remotes).length > 0;

    return {
      ...participant,
      hostOverride: true,
      runtimeRemotes: !hasStaticRemotes,
    };
  });
}
