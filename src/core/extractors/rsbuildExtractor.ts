import { existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import ts from "typescript";
import type { Extractor, ExtractionResult } from "./types.js";
import {
  parseConfigFile,
  extractFromObjectLiteral,
  createEmptyConfig,
  getFunctionName,
} from "./astUtils.js";
import { registerExtractor } from "./registry.js";

/**
 * Supported rsbuild config file names in order of preference.
 * TypeScript files are preferred over JavaScript.
 */
export const RSBUILD_CONFIG_PATTERNS = [
  "rsbuild.config.ts",
  "rsbuild.config.mts",
  "rsbuild.config.js",
  "rsbuild.config.cjs",
  "rsbuild.config.mjs",
] as const;

export type RsbuildConfigFileName = (typeof RSBUILD_CONFIG_PATTERNS)[number];

/**
 * Result of locating an rsbuild config file.
 */
export type RsbuildConfigLocation = {
  /** Absolute path to the config file */
  configPath: string;
  /** The config file name (e.g., "rsbuild.config.ts") */
  fileName: RsbuildConfigFileName;
  /** Whether the file uses TypeScript */
  isTypeScript: boolean;
  /** Whether the file uses ESM syntax (.mts, .mjs) */
  isESM: boolean;
};

/**
 * Known function names for Module Federation plugin calls in rsbuild.
 */
const MODULE_FEDERATION_FUNCTION_NAMES = [
  "pluginModuleFederation",
  "moduleFederationPlugin",
  "ModuleFederationPlugin",
];

/**
 * Locates the rsbuild config file in a project directory.
 *
 * Searches for config files in the following order:
 * 1. rsbuild.config.ts (TypeScript, preferred)
 * 2. rsbuild.config.mts (TypeScript ESM)
 * 3. rsbuild.config.js (JavaScript)
 * 4. rsbuild.config.cjs (CommonJS)
 * 5. rsbuild.config.mjs (JavaScript ESM)
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns The config location info, or null if not found
 */
export function locateRsbuildConfig(
  projectRoot: string,
): RsbuildConfigLocation | null {
  if (!existsSync(projectRoot)) {
    return null;
  }

  const files = readdirSync(projectRoot);

  for (const configFile of RSBUILD_CONFIG_PATTERNS) {
    if (files.includes(configFile)) {
      const configPath = join(projectRoot, configFile);
      const isTypeScript =
        configFile.endsWith(".ts") || configFile.endsWith(".mts");
      const isESM = configFile.endsWith(".mts") || configFile.endsWith(".mjs");

      return {
        configPath,
        fileName: configFile,
        isTypeScript,
        isESM,
      };
    }
  }

  return null;
}

/**
 * Checks if a directory contains an rsbuild config file.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns true if an rsbuild config file exists
 */
export function hasRsbuildConfig(projectRoot: string): boolean {
  return locateRsbuildConfig(projectRoot) !== null;
}

/**
 * Gets just the config path without additional metadata.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns The absolute path to the config file, or null if not found
 */
export function getRsbuildConfigPath(projectRoot: string): string | null {
  const location = locateRsbuildConfig(projectRoot);
  return location?.configPath ?? null;
}

/**
 * Finds Module Federation plugin calls in the AST.
 * Rsbuild uses function calls like pluginModuleFederation({...}).
 */
function findModuleFederationCalls(
  sourceFile: ts.SourceFile,
): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const funcName = getFunctionName(node.expression);
      if (funcName && MODULE_FEDERATION_FUNCTION_NAMES.includes(funcName)) {
        calls.push(node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

/**
 * Extracts Module Federation configuration from an rsbuild config file.
 *
 * @param configPath - Absolute path to the rsbuild config file
 * @param participantName - Name to use for the participant
 * @param projectRoot - Absolute path to the project root
 * @returns Extraction result with config and any warnings
 */
export function extractFederationConfig(
  configPath: string,
  participantName: string,
  projectRoot: string,
): ExtractionResult {
  const warnings: string[] = [];

  if (!existsSync(configPath)) {
    return {
      config: createEmptyConfig(participantName, projectRoot),
      warnings: [`Config file not found: ${configPath}`],
      isPartial: true,
    };
  }

  const sourceFile = parseConfigFile(configPath);
  const mfCalls = findModuleFederationCalls(sourceFile);

  if (mfCalls.length === 0) {
    return {
      config: createEmptyConfig(participantName, projectRoot),
      warnings: ["No pluginModuleFederation call found in config"],
      isPartial: true,
    };
  }

  if (mfCalls.length > 1) {
    warnings.push(
      `Found ${mfCalls.length} pluginModuleFederation calls, using first one`,
    );
  }

  const callExpr = mfCalls[0];
  if (callExpr.arguments.length === 0) {
    warnings.push("pluginModuleFederation called without arguments");
    return {
      config: createEmptyConfig(participantName, projectRoot),
      warnings,
      isPartial: true,
    };
  }

  const configArg = callExpr.arguments[0];
  if (!ts.isObjectLiteralExpression(configArg)) {
    warnings.push("First argument is not an object literal");
    return {
      config: createEmptyConfig(participantName, projectRoot),
      warnings,
      isPartial: true,
    };
  }

  const extractedConfig = extractFromObjectLiteral(
    configArg,
    participantName,
    projectRoot,
    warnings,
  );

  if (!extractedConfig) {
    return {
      config: createEmptyConfig(participantName, projectRoot),
      warnings,
      isPartial: true,
    };
  }

  const isPartial = warnings.length > 0 || !extractedConfig.name;

  return {
    config: extractedConfig,
    warnings,
    isPartial,
  };
}

/**
 * Extracts federation config from a project directory.
 *
 * @param projectRoot - Absolute path to the project root
 * @param participantName - Optional name override for the participant
 * @returns Extraction result or null if no rsbuild config found
 */
export function extractFromProject(
  projectRoot: string,
  participantName?: string,
): ExtractionResult | null {
  const configLocation = locateRsbuildConfig(projectRoot);
  if (!configLocation) {
    return null;
  }

  const name = participantName ?? basename(projectRoot);
  return extractFederationConfig(configLocation.configPath, name, projectRoot);
}

/**
 * The rsbuild extractor instance.
 */
export const rsbuildExtractor: Extractor = {
  bundler: "rsbuild",
  configPatterns: RSBUILD_CONFIG_PATTERNS,
  extractFederationConfig,
};

registerExtractor(rsbuildExtractor);
