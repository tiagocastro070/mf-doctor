import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

/**
 * A folder entry in a VS Code / Cursor workspace file.
 */
export type WorkspaceFolder = {
  /** Path to the folder (absolute or relative to workspace file) */
  path: string;
  /** Optional display name for the folder */
  name?: string;
};

/**
 * Parsed structure of a .code-workspace file.
 */
export type WorkspaceFile = {
  folders: WorkspaceFolder[];
};

/**
 * Result of loading a workspace file with resolved paths.
 */
export type ResolvedWorkspaceFile = {
  /** Original workspace file path */
  filePath: string;
  /** Folders with absolute paths */
  folders: Array<{ path: string; name?: string }>;
};

/**
 * Validates that the parsed content is a valid workspace file.
 */
function validateWorkspaceFile(
  parsed: unknown,
  filePath: string,
): WorkspaceFile {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Invalid workspace file ${filePath}: expected an object`);
  }

  const file = parsed as Record<string, unknown>;

  if (!Array.isArray(file.folders)) {
    throw new Error(
      `Invalid workspace file ${filePath}: 'folders' must be an array`,
    );
  }

  for (let i = 0; i < file.folders.length; i++) {
    const folder = file.folders[i];

    if (typeof folder !== "object" || folder === null) {
      throw new Error(
        `Invalid workspace file ${filePath}: folders[${i}] must be an object`,
      );
    }

    const f = folder as Record<string, unknown>;

    if (typeof f.path !== "string" || f.path.trim() === "") {
      throw new Error(
        `Invalid workspace file ${filePath}: folders[${i}].path must be a non-empty string`,
      );
    }

    if (f.name !== undefined && typeof f.name !== "string") {
      throw new Error(
        `Invalid workspace file ${filePath}: folders[${i}].name must be a string`,
      );
    }
  }

  return file as unknown as WorkspaceFile;
}

/**
 * Loads and parses a VS Code / Cursor workspace file.
 *
 * @param filePath - Path to the .code-workspace file
 * @returns Parsed workspace file with resolved absolute folder paths
 * @throws Error if file doesn't exist, is invalid JSON, or has invalid structure
 */
export function loadWorkspaceFile(filePath: string): ResolvedWorkspaceFile {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Workspace file not found: ${absolutePath}`);
  }

  let content: string;
  try {
    content = readFileSync(absolutePath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read workspace file ${absolutePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid JSON in workspace file ${absolutePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const validated = validateWorkspaceFile(parsed, absolutePath);
  const workspaceDir = dirname(absolutePath);

  const resolvedFolders = validated.folders.map((folder) => ({
    path: resolve(workspaceDir, folder.path),
    name: folder.name,
  }));

  return {
    filePath: absolutePath,
    folders: resolvedFolders,
  };
}
