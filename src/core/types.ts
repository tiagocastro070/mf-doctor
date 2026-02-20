/**
 * Severity levels for analysis findings.
 */
export type FindingSeverity = "LOW" | "MEDIUM" | "HIGH";

/**
 * Represents an issue detected by an analyzer.
 */
export type Finding = {
  /** Unique identifier for the finding type (e.g., 'react-version-drift') */
  id: string;
  /** Severity level of the finding */
  severity: FindingSeverity;
  /** Human-readable description of the issue */
  message: string;
  /** Names of participants involved in this finding */
  participants: string[];
  /** Additional structured data about the finding */
  details?: Record<string, unknown>;
  /** Suggested actions to resolve the issue */
  suggestions?: string[];
};

/**
 * Configuration options for a shared module.
 * Aligned with Module Federation's SharedConfig interface.
 */
export type SharedConfig = {
  /** Allow only a single version of the shared module */
  singleton?: boolean;
  /** Required version constraint */
  requiredVersion?: string | false;
  /** Load the shared module eagerly instead of lazily */
  eager?: boolean;
  /** Share scope name */
  shareScope?: string;
  /** Custom import path or false to disable */
  import?: string | false;
  /** Strict version matching */
  strictVersion?: boolean;
  /** Version of the provided module */
  version?: string | false;
};

/**
 * Normalized Module Federation configuration extracted from a build config.
 * This is the bundler-agnostic representation used for analysis.
 */
export type NormalizedFederationConfig = {
  /** Display name of the participant (often derived from folder or package name) */
  participantName: string;
  /** Absolute path to the project root directory */
  projectRoot: string;
  /** The 'name' field from the Module Federation plugin config */
  name: string;
  /** Modules exposed by this participant: { exposeName: modulePath } */
  exposes: Record<string, string>;
  /** Remote modules consumed by this participant: { remoteName: remoteUrl } */
  remotes: Record<string, string>;
  /** Shared module configurations: { packageName: SharedConfig | string } */
  shared: Record<string, SharedConfig | string>;
};

/**
 * Represents a federation participant (shell or remote) in the workspace.
 */
export type FederationParticipant = {
  /** Unique name for this participant */
  name: string;
  /** Absolute path to the project root */
  projectRoot: string;
  /** Path to the build config file (e.g., rsbuild.config.ts) */
  configPath: string;
  /** Type of bundler used */
  bundler: "rsbuild" | "webpack" | "rspack" | "unknown";
  /** Extracted and normalized federation configuration */
  federationConfig: NormalizedFederationConfig;
  /** Package.json dependencies for version analysis */
  dependencies: Record<string, string>;
  /** Package.json devDependencies */
  devDependencies: Record<string, string>;
  /** Resolved versions from lockfile (exact versions, e.g. "18.2.0") when available */
  resolvedDependencies?: Record<string, string>;
  /** Resolved devDependency versions from lockfile when available */
  resolvedDevDependencies?: Record<string, string>;
  /** Whether the config was fully parseable or partially dynamic */
  parseStatus: "complete" | "partial";
  /** Warnings encountered during parsing */
  parseWarnings?: string[];
  /** Whether this participant was explicitly marked as a host via config/CLI override */
  hostOverride?: boolean;
  /** Whether remotes are loaded at runtime (unknown at static analysis time) */
  runtimeRemotes?: boolean;
};

/**
 * Represents the complete federation topology of a workspace.
 */
export type ProjectGraph = {
  /** Absolute path to the workspace root */
  workspaceRoot: string;
  /** All discovered federation participants */
  participants: FederationParticipant[];
  /** Topology edges: which participant consumes which remotes */
  edges: Array<{
    /** Consumer participant name */
    from: string;
    /** Remote participant name */
    to: string;
    /** Remote key used in the consumer's config */
    remoteKey: string;
  }>;
};

/**
 * Result returned by an analyzer.
 */
export type AnalyzeResult = {
  /** Identifier of the analyzer that produced this result */
  analyzerId: string;
  /** Findings detected by the analyzer */
  findings: Finding[];
  /** Time taken to run the analyzer in milliseconds */
  durationMs?: number;
};

/**
 * An analyzer is a pure function that inspects the project graph
 * and returns findings about potential issues.
 */
export type Analyzer = {
  /** Unique identifier for this analyzer */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this analyzer checks */
  description: string;
  /** The analysis function */
  analyze: (graph: ProjectGraph) => AnalyzeResult;
};

/**
 * Combined result of running all analyzers.
 */
export type FullAnalysisResult = {
  /** The project graph that was analyzed */
  graph: ProjectGraph;
  /** Results from each analyzer */
  results: AnalyzeResult[];
  /** Total number of findings across all analyzers */
  totalFindings: number;
  /** Count of findings by severity */
  findingsBySeverity: Record<FindingSeverity, number>;
  /** Total analysis duration in milliseconds */
  totalDurationMs: number;
};
