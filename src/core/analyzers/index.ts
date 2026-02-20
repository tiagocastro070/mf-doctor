import type { Analyzer } from "../types.js";
import { circularDependencyAnalyzer } from "./circularDependency.js";
import { duplicateExposeNameAnalyzer } from "./duplicateExposeName.js";
import { missingSharedAnalyzer } from "./missingShared.js";
import { orphanExposeAnalyzer } from "./orphanExpose.js";
import { reactVersionDriftAnalyzer } from "./reactVersionDrift.js";
import { sharedConfigMismatchAnalyzer } from "./sharedConfigMismatch.js";
import { sharedDependencyCandidateAnalyzer } from "./sharedDependencyCandidate.js";

/**
 * Registry of all available analyzers.
 * Analyzers are run in order during analysis.
 */
export const analyzers: Analyzer[] = [
  reactVersionDriftAnalyzer,
  sharedConfigMismatchAnalyzer,
  sharedDependencyCandidateAnalyzer,
  missingSharedAnalyzer,
  duplicateExposeNameAnalyzer,
  orphanExposeAnalyzer,
  circularDependencyAnalyzer,
];

/**
 * Gets an analyzer by its ID.
 */
export function getAnalyzer(id: string): Analyzer | undefined {
  return analyzers.find((a) => a.id === id);
}

/**
 * Gets all analyzer IDs.
 */
export function getAnalyzerIds(): string[] {
  return analyzers.map((a) => a.id);
}
