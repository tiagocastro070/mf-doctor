import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

type NpmLockPackages = Record<
  string,
  {
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }
>;

type NpmLockfile = {
  lockfileVersion?: number;
  packages?: NpmLockPackages;
};

const EXACT_VERSION_REGEX = /^\d+\.\d+\.\d+(-[^+\s]+)?(\+[^\s]*)?$/;

function isExactVersion(version: string): boolean {
  return EXACT_VERSION_REGEX.test(version.trim());
}

function getRelativePath(workspaceRoot: string, projectRoot: string): string {
  const rel = relative(workspaceRoot, projectRoot);
  return rel.replace(/\\/g, "/") || ".";
}

export function resolveNpm(
  workspaceRoot: string,
  projectRoot: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const lockPath = join(workspaceRoot, "package-lock.json");
  if (!existsSync(lockPath)) {
    return { dependencies: {}, devDependencies: {} };
  }

  let data: NpmLockfile;
  try {
    const content = readFileSync(lockPath, "utf-8");
    data = JSON.parse(content) as NpmLockfile;
  } catch {
    return { dependencies: {}, devDependencies: {} };
  }

  const packages = data.packages;
  if (!packages || typeof packages !== "object") {
    return { dependencies: {}, devDependencies: {} };
  }

  const relativePath = getRelativePath(workspaceRoot, projectRoot);
  const workspaceEntry = packages[relativePath];
  const resolvedDeps: Record<string, string> = {};
  const resolvedDevDeps: Record<string, string> = {};

  const resolveDep = (depName: string, isDev: boolean): string | null => {
    const nodeModulesKey =
      relativePath === "."
        ? `node_modules/${depName}`
        : `${relativePath}/node_modules/${depName}`;
    const entry = packages[nodeModulesKey];
    if (entry && typeof entry.version === "string") {
      return entry.version;
    }
    const fromWorkspace = workspaceEntry
      ? (isDev
          ? workspaceEntry.devDependencies
          : workspaceEntry.dependencies)?.[depName]
      : undefined;
    if (fromWorkspace && isExactVersion(fromWorkspace)) {
      return fromWorkspace.trim();
    }
    return null;
  };

  for (const name of Object.keys(dependencies)) {
    const v = resolveDep(name, false);
    if (v) resolvedDeps[name] = v;
  }
  for (const name of Object.keys(devDependencies)) {
    const v = resolveDep(name, true);
    if (v) resolvedDevDeps[name] = v;
  }

  return { dependencies: resolvedDeps, devDependencies: resolvedDevDeps };
}
