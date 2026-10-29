/**
 * Public API for mf-doctor.
 *
 * This entry point is what the `exports` map in package.json points at, so
 * integrations (ESLint plugins, CI services, IDE extensions) can run the same
 * analysis engine as the CLI without shelling out.
 *
 * @example
 * ```ts
 * import { analyze } from "mf-doctor";
 *
 * const result = await analyze(process.cwd());
 * if (result.findingsBySeverity.HIGH > 0) process.exit(1);
 * ```
 */
export {
  analyze,
  getProjectGraph,
  hasFederationParticipants,
} from "./analyze.js";
export type {
  AnalyzeOptions,
  PullProgressCallback,
  PullResult,
} from "./analyze.js";

export { analyzers, getAnalyzer, getAnalyzerIds } from "./analyzers/index.js";

export { loadConfig } from "./config.js";
export type {
  CheckConfig,
  MfDoctorConfig,
  ResolvedConfig,
} from "./config.js";

export type {
  AnalyzeResult,
  Analyzer,
  FederationParticipant,
  Finding,
  FindingSeverity,
  FullAnalysisResult,
  NormalizedFederationConfig,
  ProjectGraph,
  SharedConfig,
} from "./types.js";
