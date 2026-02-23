import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Finding } from "./types.js";

/**
 * An entry in the ignore file that suppresses specific findings.
 */
export type IgnoreEntry = {
  /** The finding ID to ignore (e.g. "react-version-drift") */
  id: string;
  /** Optional: Only ignore for specific participants. If omitted, ignores for all. */
  participants?: string[];
  /** Documentation for why this finding is ignored */
  reason?: string;
};

/**
 * The structure of .mf-doctor-ignore.json
 */
export type IgnoreFile = {
  ignoreFindings?: IgnoreEntry[];
};

/**
 * Result of loading the ignore file.
 */
export type IgnoreConfig = {
  entries: IgnoreEntry[];
  filePath: string | null;
};

/**
 * Result of applying ignore rules to findings.
 */
export type FilteredFindings = {
  findings: Finding[];
  ignoredCount: number;
  ignoredFindings: Array<{
    finding: Finding;
    reason?: string;
  }>;
};

const IGNORE_FILE_NAME = ".mf-doctor-ignore.json";

/**
 * Loads the ignore file from a workspace.
 *
 * @param workspaceRoot - Path to the workspace root
 * @returns Parsed ignore configuration
 */
export function loadIgnoreFile(workspaceRoot: string): IgnoreConfig {
  const absoluteRoot = resolve(workspaceRoot);
  const filePath = join(absoluteRoot, IGNORE_FILE_NAME);

  if (!existsSync(filePath)) {
    return { entries: [], filePath: null };
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as IgnoreFile;

    validateIgnoreFile(parsed, filePath);

    return {
      entries: parsed.ignoreFindings ?? [],
      filePath,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validates the ignore file structure.
 */
function validateIgnoreFile(parsed: unknown, filePath: string): void {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Invalid ${IGNORE_FILE_NAME}: expected an object`);
  }

  const file = parsed as Record<string, unknown>;

  if (file.ignoreFindings !== undefined) {
    if (!Array.isArray(file.ignoreFindings)) {
      throw new Error(
        `Invalid 'ignoreFindings' in ${filePath}: expected an array`,
      );
    }

    for (let i = 0; i < file.ignoreFindings.length; i++) {
      const entry = file.ignoreFindings[i];
      validateIgnoreEntry(entry, i, filePath);
    }
  }
}

/**
 * Validates a single ignore entry.
 */
function validateIgnoreEntry(
  entry: unknown,
  index: number,
  filePath: string,
): void {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(
      `Invalid entry at ignoreFindings[${index}] in ${filePath}: expected an object`,
    );
  }

  const e = entry as Record<string, unknown>;

  if (typeof e.id !== "string" || e.id.trim() === "") {
    throw new Error(
      `Invalid entry at ignoreFindings[${index}] in ${filePath}: 'id' must be a non-empty string`,
    );
  }

  if (e.participants !== undefined) {
    if (!Array.isArray(e.participants)) {
      throw new Error(
        `Invalid entry at ignoreFindings[${index}] in ${filePath}: 'participants' must be an array`,
      );
    }
    for (const p of e.participants) {
      if (typeof p !== "string") {
        throw new Error(
          `Invalid entry at ignoreFindings[${index}] in ${filePath}: 'participants' must contain strings`,
        );
      }
    }
  }

  if (e.reason !== undefined && typeof e.reason !== "string") {
    throw new Error(
      `Invalid entry at ignoreFindings[${index}] in ${filePath}: 'reason' must be a string`,
    );
  }
}

/**
 * Checks if a finding matches an ignore entry.
 */
function matchesIgnoreEntry(finding: Finding, entry: IgnoreEntry): boolean {
  if (finding.id !== entry.id) {
    return false;
  }

  if (!entry.participants || entry.participants.length === 0) {
    return true;
  }

  const entryParticipants = new Set(entry.participants);
  const findingParticipants = new Set(finding.participants);

  for (const p of entryParticipants) {
    if (findingParticipants.has(p)) {
      return true;
    }
  }

  return false;
}

/**
 * Finds the ignore entry that matches a finding.
 */
function findMatchingEntry(
  finding: Finding,
  entries: IgnoreEntry[],
): IgnoreEntry | null {
  for (const entry of entries) {
    if (matchesIgnoreEntry(finding, entry)) {
      return entry;
    }
  }
  return null;
}

/**
 * Applies ignore rules to filter out suppressed findings.
 *
 * @param findings - All findings from analysis
 * @param ignoreConfig - Loaded ignore configuration
 * @returns Filtered findings with ignore statistics
 */
export function applyIgnoreRules(
  findings: Finding[],
  ignoreConfig: IgnoreConfig,
): FilteredFindings {
  if (ignoreConfig.entries.length === 0) {
    return {
      findings,
      ignoredCount: 0,
      ignoredFindings: [],
    };
  }

  const result: Finding[] = [];
  const ignored: FilteredFindings["ignoredFindings"] = [];

  for (const finding of findings) {
    const matchingEntry = findMatchingEntry(finding, ignoreConfig.entries);

    if (matchingEntry) {
      ignored.push({
        finding,
        reason: matchingEntry.reason,
      });
    } else {
      result.push(finding);
    }
  }

  return {
    findings: result,
    ignoredCount: ignored.length,
    ignoredFindings: ignored,
  };
}
