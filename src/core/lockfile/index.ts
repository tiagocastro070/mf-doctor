import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveNpm } from "./npm.js";
import { resolvePnpm } from "./pnpm.js";
import { resolveYarn } from "./yarn.js";

export type ResolvedVersions = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

function detectLockfile(root: string): "npm" | "pnpm" | "yarn" | null {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return null;
}

/**
 * Resolves dependency versions from the lockfile.
 * Tries workspaceRoot first, then projectRoot (for polyrepo where each folder has its own lockfile).
 * Returns only packages that could be resolved; missing entries mean "use declared".
 */
export function getResolvedVersions(
  workspaceRoot: string,
  projectRoot: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
): ResolvedVersions {
  const lockfileRoot = detectLockfile(workspaceRoot)
    ? workspaceRoot
    : detectLockfile(projectRoot)
      ? projectRoot
      : null;
  if (!lockfileRoot) {
    return { dependencies: {}, devDependencies: {} };
  }

  const lockType = detectLockfile(lockfileRoot)!;
  switch (lockType) {
    case "npm":
      return resolveNpm(
        lockfileRoot,
        projectRoot,
        dependencies,
        devDependencies,
      );
    case "pnpm":
      return resolvePnpm(
        lockfileRoot,
        projectRoot,
        dependencies,
        devDependencies,
      );
    case "yarn":
      return resolveYarn(
        lockfileRoot,
        projectRoot,
        dependencies,
        devDependencies,
      );
    default:
      return { dependencies: {}, devDependencies: {} };
  }
}
