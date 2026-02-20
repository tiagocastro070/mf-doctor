import { existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import ts from "typescript";
import type { Extractor, ExtractionResult } from "./types.js";
import {
  parseConfigFile,
  extractFromObjectLiteral,
  createEmptyConfig,
  getConstructorName,
} from "./astUtils.js";
import { registerExtractor } from "./registry.js";

/**
 * Supported webpack config file names in order of preference.
 * TypeScript files are preferred over JavaScript.
 */
export const WEBPACK_CONFIG_PATTERNS = [
  "webpack.config.ts",
  "webpack.config.js",
  "webpack.config.mjs",
] as const;

export type WebpackConfigFileName = (typeof WEBPACK_CONFIG_PATTERNS)[number];

/**
 * Result of locating a webpack config file.
 */
export type WebpackConfigLocation = {
  /** Absolute path to the config file */
  configPath: string;
  /** The config file name (e.g., "webpack.config.js") */
  fileName: WebpackConfigFileName;
  /** Whether the file uses TypeScript */
  isTypeScript: boolean;
  /** Whether the file uses ESM syntax (.mjs) */
  isESM: boolean;
};

/**
 * Known constructor names for Module Federation plugin in webpack.
 */
const MODULE_FEDERATION_CONSTRUCTOR_NAMES = ["ModuleFederationPlugin"];

/**
 * Locates the webpack config file in a project directory.
 *
 * Searches for config files in the following order:
 * 1. webpack.config.ts (TypeScript, preferred)
 * 2. webpack.config.js (JavaScript)
 * 3. webpack.config.mjs (JavaScript ESM)
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns The config location info, or null if not found
 */
export function locateWebpackConfig(
  projectRoot: string,
): WebpackConfigLocation | null {
  if (!existsSync(projectRoot)) {
    return null;
  }

  const files = readdirSync(projectRoot);

  for (const configFile of WEBPACK_CONFIG_PATTERNS) {
    if (files.includes(configFile)) {
      const configPath = join(projectRoot, configFile);
      const isTypeScript = configFile.endsWith(".ts");
      const isESM = configFile.endsWith(".mjs");

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
 * Checks if a directory contains a webpack config file.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns true if a webpack config file exists
 */
export function hasWebpackConfig(projectRoot: string): boolean {
  return locateWebpackConfig(projectRoot) !== null;
}

/**
 * Gets just the config path without additional metadata.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns The absolute path to the config file, or null if not found
 */
export function getWebpackConfigPath(projectRoot: string): string | null {
  const location = locateWebpackConfig(projectRoot);
  return location?.configPath ?? null;
}

/**
 * Finds Module Federation plugin instantiations in the AST.
 * Webpack uses `new ModuleFederationPlugin({...})` syntax.
 * Handles both direct instantiation and property access (e.g., container.ModuleFederationPlugin).
 */
function findModuleFederationPlugins(
  sourceFile: ts.SourceFile,
): ts.NewExpression[] {
  const plugins: ts.NewExpression[] = [];

  function visit(node: ts.Node) {
    if (ts.isNewExpression(node)) {
      const constructorName = getConstructorName(node.expression);
      if (
        constructorName &&
        MODULE_FEDERATION_CONSTRUCTOR_NAMES.includes(constructorName)
      ) {
        plugins.push(node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return plugins;
}

/**
 * Extracts Module Federation configuration from a webpack config file.
 *
 * @param configPath - Absolute path to the webpack config file
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
  const mfPlugins = findModuleFederationPlugins(sourceFile);

  if (mfPlugins.length === 0) {
    return {
      config: createEmptyConfig(participantName, projectRoot),
      warnings: ["No ModuleFederationPlugin instantiation found in config"],
      isPartial: true,
    };
  }

  if (mfPlugins.length > 1) {
    warnings.push(
      `Found ${mfPlugins.length} ModuleFederationPlugin instances, using first one`,
    );
  }

  const newExpr = mfPlugins[0];
  if (!newExpr.arguments || newExpr.arguments.length === 0) {
    warnings.push("ModuleFederationPlugin instantiated without arguments");
    return {
      config: createEmptyConfig(participantName, projectRoot),
      warnings,
      isPartial: true,
    };
  }

  const configArg = newExpr.arguments[0];
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
 * @returns Extraction result or null if no webpack config found
 */
export function extractFromProject(
  projectRoot: string,
  participantName?: string,
): ExtractionResult | null {
  const configLocation = locateWebpackConfig(projectRoot);
  if (!configLocation) {
    return null;
  }

  const name = participantName ?? basename(projectRoot);
  return extractFederationConfig(configLocation.configPath, name, projectRoot);
}

/**
 * The webpack extractor instance.
 */
export const webpackExtractor: Extractor = {
  bundler: "webpack",
  configPatterns: WEBPACK_CONFIG_PATTERNS,
  extractFederationConfig,
};

registerExtractor(webpackExtractor);
