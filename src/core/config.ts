import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FindingSeverity } from "./types.js";

/**
 * Configuration for an individual analyzer/check.
 */
export type CheckConfig = {
  enabled?: boolean;
};

/**
 * mfdoc configuration file format.
 */
export type MfdocConfig = {
  /** Configuration for individual checks/analyzers */
  checks?: Record<string, CheckConfig>;
  /** Severity threshold for exit code (default: HIGH) */
  severityThreshold?: FindingSeverity;
  /** Patterns to ignore when discovering participants */
  ignore?: string[];
  /** Participant names to explicitly mark as hosts (for runtime-loaded remotes) */
  hosts?: string[];
};

/**
 * Resolved configuration with defaults applied.
 */
export type ResolvedConfig = {
  checks: Record<string, CheckConfig>;
  severityThreshold: FindingSeverity;
  ignore: string[];
  /** Participant names explicitly marked as hosts (for runtime-loaded remotes) */
  hosts: string[];
  configPath: string | null;
};

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: ResolvedConfig = {
  checks: {},
  severityThreshold: "HIGH",
  ignore: [],
  hosts: [],
  configPath: null,
};

/**
 * Supported config file names in order of preference.
 */
const CONFIG_FILE_NAMES = [
  "mfdoc.config.ts",
  "mfdoc.config.mts",
  "mfdoc.config.js",
  "mfdoc.config.mjs",
  "mfdoc.config.cjs",
] as const;

/**
 * Finds the config file in a directory.
 */
function findConfigFile(directory: string): string | null {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = join(directory, fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Dynamically imports a config file.
 */
async function importConfigFile(configPath: string): Promise<MfdocConfig> {
  try {
    const fileUrl = pathToFileURL(configPath).href;
    const module = await import(fileUrl);
    return module.default ?? module;
  } catch (error) {
    throw new Error(
      `Failed to load config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Validates the configuration object.
 */
function validateConfig(config: unknown, configPath: string): MfdocConfig {
  if (typeof config !== "object" || config === null) {
    throw new Error(`Invalid config in ${configPath}: expected an object`);
  }

  const cfg = config as Record<string, unknown>;

  if (cfg.checks !== undefined && typeof cfg.checks !== "object") {
    throw new Error(`Invalid 'checks' in ${configPath}: expected an object`);
  }

  if (cfg.severityThreshold !== undefined) {
    const validSeverities: FindingSeverity[] = ["LOW", "MEDIUM", "HIGH"];
    if (!validSeverities.includes(cfg.severityThreshold as FindingSeverity)) {
      throw new Error(
        `Invalid 'severityThreshold' in ${configPath}: must be one of ${validSeverities.join(", ")}`,
      );
    }
  }

  if (cfg.ignore !== undefined && !Array.isArray(cfg.ignore)) {
    throw new Error(`Invalid 'ignore' in ${configPath}: expected an array`);
  }

  if (cfg.hosts !== undefined) {
    if (!Array.isArray(cfg.hosts)) {
      throw new Error(`Invalid 'hosts' in ${configPath}: expected an array`);
    }
    for (const host of cfg.hosts) {
      if (typeof host !== "string") {
        throw new Error(
          `Invalid 'hosts' in ${configPath}: expected array of strings`,
        );
      }
    }
  }

  return config as MfdocConfig;
}

/**
 * Merges user config with defaults.
 */
function mergeWithDefaults(
  userConfig: MfdocConfig,
  configPath: string | null,
): ResolvedConfig {
  return {
    checks: userConfig.checks ?? DEFAULT_CONFIG.checks,
    severityThreshold:
      userConfig.severityThreshold ?? DEFAULT_CONFIG.severityThreshold,
    ignore: userConfig.ignore ?? DEFAULT_CONFIG.ignore,
    hosts: userConfig.hosts ?? DEFAULT_CONFIG.hosts,
    configPath,
  };
}

/**
 * Loads the mfdoc configuration from a workspace.
 *
 * Searches for config files in this order:
 * 1. mfdoc.config.ts
 * 2. mfdoc.config.mts
 * 3. mfdoc.config.js
 * 4. mfdoc.config.mjs
 * 5. mfdoc.config.cjs
 *
 * @param workspaceRoot - Path to the workspace root
 * @returns Resolved configuration with defaults applied
 */
export async function loadConfig(
  workspaceRoot: string,
): Promise<ResolvedConfig> {
  const absoluteRoot = resolve(workspaceRoot);
  const configPath = findConfigFile(absoluteRoot);

  if (!configPath) {
    return { ...DEFAULT_CONFIG, configPath: null };
  }

  const rawConfig = await importConfigFile(configPath);
  const validatedConfig = validateConfig(rawConfig, configPath);

  return mergeWithDefaults(validatedConfig, configPath);
}

/**
 * Checks if an analyzer is enabled based on config.
 */
export function isAnalyzerEnabled(
  config: ResolvedConfig,
  analyzerId: string,
): boolean {
  const checkConfig = config.checks[analyzerId];

  if (!checkConfig) {
    return true;
  }

  return checkConfig.enabled !== false;
}

/**
 * Gets the list of enabled analyzer IDs based on config.
 */
export function getEnabledAnalyzerIds(
  config: ResolvedConfig,
  allAnalyzerIds: string[],
): string[] {
  return allAnalyzerIds.filter((id) => isAnalyzerEnabled(config, id));
}
