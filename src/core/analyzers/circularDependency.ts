import type {
  Analyzer,
  AnalyzeResult,
  Finding,
  ProjectGraph,
} from "../types.js";

const ANALYZER_ID = "circular-dependency";

/**
 * Information about a detected cycle in the dependency graph.
 */
type CycleInfo = {
  /** Participant names in cycle order (first and last are the same) */
  path: string[];
  /** Edges that form the cycle */
  edges: Array<{ from: string; to: string; remoteKey: string }>;
};

/**
 * Builds an adjacency list from the graph edges for efficient traversal.
 */
function buildAdjacencyList(
  graph: ProjectGraph,
): Map<string, Array<{ to: string; remoteKey: string }>> {
  const adjacencyList = new Map<
    string,
    Array<{ to: string; remoteKey: string }>
  >();

  for (const participant of graph.participants) {
    adjacencyList.set(participant.name, []);
  }

  for (const edge of graph.edges) {
    const neighbors = adjacencyList.get(edge.from);
    if (neighbors) {
      neighbors.push({ to: edge.to, remoteKey: edge.remoteKey });
    }
  }

  return adjacencyList;
}

/**
 * Finds all cycles in the dependency graph using DFS.
 * Uses a color-based approach:
 * - WHITE (0): Not visited
 * - GRAY (1): Currently in the DFS stack (being explored)
 * - BLACK (2): Fully explored
 */
function findCycles(graph: ProjectGraph): CycleInfo[] {
  const adjacencyList = buildAdjacencyList(graph);
  const cycles: CycleInfo[] = [];
  const seenCycles = new Set<string>();

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  for (const participant of graph.participants) {
    color.set(participant.name, WHITE);
  }

  function dfs(
    node: string,
    path: string[],
    pathEdges: Array<{ from: string; to: string; remoteKey: string }>,
  ): void {
    color.set(node, GRAY);
    path.push(node);

    const neighbors = adjacencyList.get(node) || [];
    for (const { to: neighbor, remoteKey } of neighbors) {
      const neighborColor = color.get(neighbor);

      if (neighborColor === GRAY) {
        // Found a cycle - extract the cycle portion from path
        const cycleStartIndex = path.indexOf(neighbor);
        const cyclePath = [...path.slice(cycleStartIndex), neighbor];

        // Extract edges for this cycle
        const cycleEdges: Array<{
          from: string;
          to: string;
          remoteKey: string;
        }> = [];
        for (let i = cycleStartIndex; i < path.length; i++) {
          const from = path[i];
          const to = i === path.length - 1 ? neighbor : path[i + 1];
          const edge = pathEdges.find((e) => e.from === from && e.to === to);
          if (edge) {
            cycleEdges.push(edge);
          } else if (from === path[path.length - 1] && to === neighbor) {
            // This is the closing edge
            cycleEdges.push({ from, to, remoteKey });
          }
        }

        // Add the closing edge
        if (cycleEdges.length < cyclePath.length - 1) {
          cycleEdges.push({
            from: path[path.length - 1],
            to: neighbor,
            remoteKey,
          });
        }

        // Normalize cycle for deduplication (start from lexicographically smallest)
        const cycleNodes = cyclePath.slice(0, -1);
        const minIndex = cycleNodes.indexOf(
          cycleNodes.reduce((min, curr) => (curr < min ? curr : min)),
        );
        const normalizedCycle = [
          ...cycleNodes.slice(minIndex),
          ...cycleNodes.slice(0, minIndex),
        ].join(" -> ");

        if (!seenCycles.has(normalizedCycle)) {
          seenCycles.add(normalizedCycle);
          cycles.push({ path: cyclePath, edges: cycleEdges });
        }
      } else if (neighborColor === WHITE) {
        pathEdges.push({ from: node, to: neighbor, remoteKey });
        dfs(neighbor, path, pathEdges);
        pathEdges.pop();
      }
    }

    path.pop();
    color.set(node, BLACK);
  }

  for (const participant of graph.participants) {
    if (color.get(participant.name) === WHITE) {
      dfs(participant.name, [], []);
    }
  }

  return cycles;
}

/**
 * Creates a finding for a detected cycle.
 */
function createCycleFinding(cycle: CycleInfo): Finding {
  const pathDisplay = cycle.path.join(" -> ");
  const participants = [...new Set(cycle.path.slice(0, -1))];

  return {
    id: ANALYZER_ID,
    severity: "HIGH",
    message: `Circular dependency detected: ${pathDisplay}`,
    participants,
    details: {
      cyclePath: cycle.path,
      cycleLength: cycle.path.length - 1,
      edges: cycle.edges,
    },
    suggestions: [
      "Refactor to remove the cycle by extracting shared code into a separate remote",
      "Review the dependency direction - typically hosts consume remotes, not vice versa",
      "Consider if one of the dependencies can be removed or inverted",
    ],
  };
}

/**
 * Analyzer that detects circular dependencies in the federation topology.
 *
 * A circular dependency occurs when following remote dependencies leads
 * back to a previously visited participant, creating a cycle like:
 * Host -> RemoteA -> RemoteB -> Host
 *
 * Circular dependencies can cause:
 * - Initialization order issues at runtime
 * - Infinite loading loops
 * - Difficulty reasoning about the application structure
 * - Build-time complications
 *
 * While Module Federation technically supports circular references in some
 * cases, they are generally a code smell indicating architectural issues.
 */
export const circularDependencyAnalyzer: Analyzer = {
  id: ANALYZER_ID,
  name: "Circular Dependency",
  description:
    "Detects circular dependencies in the federation topology that can cause runtime issues",

  analyze(graph: ProjectGraph): AnalyzeResult {
    const findings: Finding[] = [];
    const cycles = findCycles(graph);

    for (const cycle of cycles) {
      findings.push(createCycleFinding(cycle));
    }

    return {
      analyzerId: ANALYZER_ID,
      findings,
    };
  },
};
