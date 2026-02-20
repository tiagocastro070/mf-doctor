import type { Extractor, BundlerType } from "./types.js";

/**
 * Registry of bundler-specific extractors.
 * Extractors self-register when imported.
 */
const extractors: Map<BundlerType, Extractor> = new Map();

/**
 * Registers an extractor for a specific bundler type.
 * Called by each extractor module on import.
 *
 * @param extractor - The extractor to register
 */
export function registerExtractor(extractor: Extractor): void {
  if (extractors.has(extractor.bundler)) {
    console.warn(
      `Extractor for bundler "${extractor.bundler}" is already registered. Overwriting.`,
    );
  }
  extractors.set(extractor.bundler, extractor);
}

/**
 * Gets the extractor for a specific bundler type.
 *
 * @param bundler - The bundler type to get the extractor for
 * @returns The extractor, or null if not registered
 */
export function getExtractor(bundler: string): Extractor | null {
  return extractors.get(bundler as BundlerType) ?? null;
}

/**
 * Gets a list of all registered bundler types.
 *
 * @returns Array of supported bundler type names
 */
export function getSupportedBundlers(): BundlerType[] {
  return Array.from(extractors.keys());
}

/**
 * Checks if an extractor is registered for a bundler type.
 *
 * @param bundler - The bundler type to check
 * @returns true if an extractor is registered
 */
export function hasExtractor(bundler: string): boolean {
  return extractors.has(bundler as BundlerType);
}

/**
 * Clears all registered extractors.
 * Primarily useful for testing.
 */
export function clearExtractors(): void {
  extractors.clear();
}

/**
 * Gets all config file patterns from registered extractors.
 * Used by discovery to detect bundler configs without hardcoding patterns.
 *
 * @returns Map of bundler type to their config file patterns
 */
export function getAllConfigPatterns(): Map<BundlerType, readonly string[]> {
  const patterns = new Map<BundlerType, readonly string[]>();
  for (const [bundler, extractor] of extractors) {
    patterns.set(bundler, extractor.configPatterns);
  }
  return patterns;
}
