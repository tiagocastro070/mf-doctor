import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  discoverParticipants,
  discoverFromWorkspaceFile,
} from "./discovery.js";
import { loadWorkspaceFile } from "./workspaceFile.js";
import { getExtractor } from "./extractors/index.js";
import { buildProjectGraph, applyHostOverrides } from "./projectGraph.js";
import { getResolvedVersions } from "./lockfile/index.js";
import { analyzers } from "./analyzers/index.js";
import type { CheckConfig } from "./config.js";
import type {
  FederationParticipant,
  ProjectGraph,
  FullAnalysisResult,
  AnalyzeResult,
  FindingSeverity,
} from "./types.js";

/**
 * Result of a git pull operation for a single repository.
 */
export type PullResult = {
  path: string;
  success: boolean;
  message: string;
};

/**
 * Callback invoked when a repository pull completes.
 */
export type PullProgressCallback = (result: PullResult) => void;

/**
 * Options for the analyze function.
 */
export type AnalyzeOptions = {
  /** Specific analyzer IDs to run. If empty/undefined, runs all analyzers. */
  analyzerIds?: string[];
  /** Path to a .code-workspace file for polyrepo discovery. */
  workspaceFile?: string;
  /** Pull latest changes from git before analyzing. */
  pull?: boolean;
  /** Callback for pull progress updates. */
  onPullProgress?: PullProgressCallback;
  /** Participant names to explicitly mark as hosts (for runtime-loaded remotes). */
  hosts?: string[];
  /** Per-analyzer config (e.g. from mf-doctor.config). */
  checks?: Record<string, CheckConfig>;
  /** True when analyzerIds were explicitly provided via CLI (e.g. --analyzers). */
  analyzerIdsExplicit?: boolean;
};

/**
 * Checks if a directory is a git repository.
 */
function isGitRepository(dir: string): boolean {
  return existsSync(resolve(dir, ".git"));
}

/**
 * Pulls latest changes from git for a single repository.
 */
function pullRepository(repoPath: string): PullResult {
  if (!isGitRepository(repoPath)) {
    return {
      path: repoPath,
      success: false,
      message: "Not a git repository",
    };
  }

  try {
    const output = execSync("git pull", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      path: repoPath,
      success: true,
      message: output.trim() || "Already up to date",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      path: repoPath,
      success: false,
      message: message.split("\n")[0],
    };
  }
}

/**
 * Pulls latest changes from all repositories.
 * For workspace file mode: pulls each folder in the workspace file.
 * For monorepo mode: pulls the workspace root.
 */
function pullRepositories(
  workspaceRoot: string,
  workspaceFile?: string,
  onProgress?: PullProgressCallback,
): PullResult[] {
  const results: PullResult[] = [];
  const paths: string[] = [];

  if (workspaceFile) {
    const workspace = loadWorkspaceFile(workspaceFile);
    for (const folder of workspace.folders) {
      paths.push(folder.path);
    }
  } else {
    paths.push(workspaceRoot);
  }

  for (const path of paths) {
    const result = pullRepository(path);
    results.push(result);
    onProgress?.(result);
  }

  return results;
}

/**
 * Attaches federation configs to discovered participants.
 * Uses the extractor registry to select the appropriate extractor based on bundler type.
 */
function attachConfigs(
  participants: FederationParticipant[],
): FederationParticipant[] {
  return participants.map((participant) => {
    const extractor = getExtractor(participant.bundler);

    if (!extractor) {
      return {
        ...participant,
        parseStatus: "partial" as const,
        parseWarnings: [`Unsupported bundler: ${participant.bundler}`],
      };
    }

    const result = extractor.extractFederationConfig(
      participant.configPath,
      participant.name,
      participant.projectRoot,
    );

    return {
      ...participant,
      federationConfig: result.config,
      parseStatus: result.isPartial ? "partial" : "complete",
      parseWarnings: result.warnings.length > 0 ? result.warnings : undefined,
    };
  });
}

/**
 * Enriches participants with resolved dependency versions from the lockfile when present.
 */
function enrichResolvedVersions(
  participants: FederationParticipant[],
  effectiveWorkspaceRoot: string,
): FederationParticipant[] {
  return participants.map((participant) => {
    const resolved = getResolvedVersions(
      effectiveWorkspaceRoot,
      participant.projectRoot,
      participant.dependencies,
      participant.devDependencies,
    );
    return {
      ...participant,
      resolvedDependencies:
        Object.keys(resolved.dependencies).length > 0
          ? resolved.dependencies
          : undefined,
      resolvedDevDependencies:
        Object.keys(resolved.devDependencies).length > 0
          ? resolved.devDependencies
          : undefined,
    };
  });
}

const ORPHAN_EXPOSE_ID = "orphan-expose";

/**
 * Runs all analyzers on the project graph and collects results.
 */
function runAnalyzers(
  graph: ProjectGraph,
  analyzerIds: string[] | undefined,
  runOptions: {
    checks?: Record<string, CheckConfig>;
    analyzerIdsExplicit?: boolean;
  },
): AnalyzeResult[] {
  const results: AnalyzeResult[] = [];

  const hasRuntimeRemotes = graph.participants.some(
    (p) => p.runtimeRemotes === true,
  );

  let analyzersToRun =
    analyzerIds && analyzerIds.length > 0
      ? analyzers.filter((a) => analyzerIds.includes(a.id))
      : analyzers;

  if (
    hasRuntimeRemotes &&
    !runOptions.analyzerIdsExplicit &&
    !runOptions.checks?.[ORPHAN_EXPOSE_ID]?.allowWithRuntimeRemotes
  ) {
    analyzersToRun = analyzersToRun.filter((a) => a.id !== ORPHAN_EXPOSE_ID);
  }

  for (const analyzer of analyzersToRun) {
    const startTime = performance.now();
    const result = analyzer.analyze(graph);
    const durationMs = performance.now() - startTime;

    results.push({
      ...result,
      durationMs,
    });
  }

  return results;
}

/**
 * Computes summary statistics from analyzer results.
 */
function computeSummary(results: AnalyzeResult[]): {
  totalFindings: number;
  findingsBySeverity: Record<FindingSeverity, number>;
} {
  const findingsBySeverity: Record<FindingSeverity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
  };

  let totalFindings = 0;

  for (const result of results) {
    for (const finding of result.findings) {
      totalFindings++;
      findingsBySeverity[finding.severity]++;
    }
  }

  return { totalFindings, findingsBySeverity };
}

/**
 * Main analysis pipeline.
 *
 * This function:
 * 1. Discovers all federation participants in the workspace
 * 2. Attaches federation configs to each participant
 * 3. Builds the project graph (participants + dependency edges)
 * 4. Runs all registered analyzers
 * 5. Returns the combined analysis result
 *
 * @param workspaceRoot - Path to the workspace root directory
 * @param options - Optional configuration for the analysis
 * @returns The full analysis result including graph, findings, and summary
 */
export async function analyze(
  workspaceRoot: string,
  options: AnalyzeOptions = {},
): Promise<FullAnalysisResult> {
  const startTime = performance.now();
  const absoluteRoot = resolve(workspaceRoot);

  if (options.pull) {
    pullRepositories(
      absoluteRoot,
      options.workspaceFile,
      options.onPullProgress,
    );
  }

  let discoveredParticipants: FederationParticipant[];
  let effectiveWorkspaceRoot: string;

  if (options.workspaceFile) {
    const result = await discoverFromWorkspaceFile(options.workspaceFile);
    discoveredParticipants = result.participants;
    effectiveWorkspaceRoot = dirname(resolve(options.workspaceFile));
  } else {
    discoveredParticipants = await discoverParticipants(absoluteRoot);
    effectiveWorkspaceRoot = absoluteRoot;
  }

  const participantsWithConfigs = attachConfigs(discoveredParticipants);

  const participantsWithOverrides = applyHostOverrides(
    participantsWithConfigs,
    options.hosts ?? [],
  );

  const participantsEnriched = enrichResolvedVersions(
    participantsWithOverrides,
    effectiveWorkspaceRoot,
  );

  const graph = buildProjectGraph(effectiveWorkspaceRoot, participantsEnriched);

  const results = runAnalyzers(graph, options.analyzerIds, {
    checks: options.checks,
    analyzerIdsExplicit: options.analyzerIdsExplicit,
  });

  const { totalFindings, findingsBySeverity } = computeSummary(results);

  const totalDurationMs = performance.now() - startTime;

  return {
    graph,
    results,
    totalFindings,
    findingsBySeverity,
    totalDurationMs,
  };
}

/**
 * Quick check to see if a workspace has any federation participants.
 */
export async function hasFederationParticipants(
  workspaceRoot: string,
): Promise<boolean> {
  try {
    const participants = await discoverParticipants(resolve(workspaceRoot));
    return participants.length > 0;
  } catch {
    return false;
  }
}

/**
 * Gets just the project graph without running analyzers.
 * Useful for visualization or debugging.
 *
 * @param workspaceRoot - Path to the workspace root directory
 * @param workspaceFile - Optional path to a .code-workspace file for polyrepo discovery
 * @returns The project graph
 */
export async function getProjectGraph(
  workspaceRoot: string,
  workspaceFile?: string,
): Promise<ProjectGraph> {
  const absoluteRoot = resolve(workspaceRoot);

  let discoveredParticipants: FederationParticipant[];
  let effectiveWorkspaceRoot: string;

  if (workspaceFile) {
    const result = await discoverFromWorkspaceFile(workspaceFile);
    discoveredParticipants = result.participants;
    effectiveWorkspaceRoot = dirname(resolve(workspaceFile));
  } else {
    discoveredParticipants = await discoverParticipants(absoluteRoot);
    effectiveWorkspaceRoot = absoluteRoot;
  }

  const participantsWithConfigs = attachConfigs(discoveredParticipants);
  const participantsWithOverrides = applyHostOverrides(
    participantsWithConfigs,
    [],
  );
  const participantsEnriched = enrichResolvedVersions(
    participantsWithOverrides,
    effectiveWorkspaceRoot,
  );
  return buildProjectGraph(effectiveWorkspaceRoot, participantsEnriched);
}
