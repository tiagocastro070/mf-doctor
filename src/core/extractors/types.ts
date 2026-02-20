import type { NormalizedFederationConfig } from "../types.js";

/**
 * Supported bundler types for Module Federation extraction.
 */
export type BundlerType = "rsbuild" | "webpack" | "rspack";

/**
 * Result of extracting federation config from a build config file.
 */
export type ExtractionResult = {
  /** The extracted and normalized federation configuration */
  config: NormalizedFederationConfig;
  /** Warnings encountered during extraction */
  warnings: string[];
  /** Whether the extraction was partial (dynamic values, spreads, etc.) */
  isPartial: boolean;
};

/**
 * Interface for bundler-specific federation config extractors.
 *
 * Each extractor knows how to parse a specific bundler's config format
 * and extract the Module Federation plugin configuration.
 */
export type Extractor = {
  /** The bundler type this extractor handles */
  bundler: BundlerType;

  /** Config file patterns this extractor can parse (e.g., "rsbuild.config.ts") */
  configPatterns: readonly string[];

  /**
   * Extracts Module Federation configuration from a build config file.
   *
   * @param configPath - Absolute path to the build config file
   * @param participantName - Name to use for the participant
   * @param projectRoot - Absolute path to the project root directory
   * @returns Extraction result with config, warnings, and partial status
   */
  extractFederationConfig(
    configPath: string,
    participantName: string,
    projectRoot: string,
  ): ExtractionResult;
};
