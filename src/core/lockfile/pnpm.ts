import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";

type ImporterDep = string | { version?: string; specifier?: string };
type ImporterDeps = Record<string, ImporterDep>;
type Importers = Record<
  string,
  { dependencies?: ImporterDeps; devDependencies?: ImporterDeps }
>;
type PnpmLockfile = { importers?: Importers };

function extractVersion(dep: ImporterDep): string | null {
  if (typeof dep === "string") return dep;
  if (dep && dep.version != null) return String(dep.version);
  return null;
}

function getRelativePath(workspaceRoot: string, projectRoot: string): string {
  const rel = relative(workspaceRoot, projectRoot);
  return rel.replace(/\\/g, "/") || ".";
}

export function resolvePnpm(
  workspaceRoot: string,
  projectRoot: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const lockPath = join(workspaceRoot, "pnpm-lock.yaml");
  if (!existsSync(lockPath)) {
    return { dependencies: {}, devDependencies: {} };
  }

  let data: PnpmLockfile;
  try {
    const content = readFileSync(lockPath, "utf-8");
    data = parseYaml(content) as PnpmLockfile;
  } catch {
    return { dependencies: {}, devDependencies: {} };
  }

  const importers = data.importers;
  if (!importers || typeof importers !== "object") {
    return { dependencies: {}, devDependencies: {} };
  }

  const relativePath = getRelativePath(workspaceRoot, projectRoot);
  const importer = importers[relativePath];
  if (!importer) {
    return { dependencies: {}, devDependencies: {} };
  }

  const resolvedDeps: Record<string, string> = {};
  const resolvedDevDeps: Record<string, string> = {};

  const depMap = importer.dependencies;
  if (depMap && typeof depMap === "object") {
    for (const name of Object.keys(dependencies)) {
      const v = extractVersion(depMap[name]);
      if (v) resolvedDeps[name] = v;
    }
  }

  const devMap = importer.devDependencies;
  if (devMap && typeof devMap === "object") {
    for (const name of Object.keys(devDependencies)) {
      const v = extractVersion(devMap[name]);
      if (v) resolvedDevDeps[name] = v;
    }
  }

  return { dependencies: resolvedDeps, devDependencies: resolvedDevDeps };
}
