import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function parseYarnLock(content: string): Map<string, string> {
  const keyToVersion = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const keyMatch = line.match(/^"?([^"@]+@[^":]+)"?\s*:\s*$/);
    if (keyMatch) {
      const key = keyMatch[1].replace(/^"+|"+$/g, "").trim();
      i++;
      while (i < lines.length && /^\s/.test(lines[i])) {
        const versionMatch = lines[i].match(/version\s+"([^"]+)"/);
        if (versionMatch) {
          keyToVersion.set(key, versionMatch[1]);
          break;
        }
        i++;
      }
    }
    i++;
  }

  return keyToVersion;
}

export function resolveYarn(
  workspaceRoot: string,
  _projectRoot: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const lockPath = join(workspaceRoot, "yarn.lock");
  if (!existsSync(lockPath)) {
    return { dependencies: {}, devDependencies: {} };
  }

  let keyToVersion: Map<string, string>;
  try {
    const content = readFileSync(lockPath, "utf-8");
    keyToVersion = parseYarnLock(content);
  } catch {
    return { dependencies: {}, devDependencies: {} };
  }

  const resolvedDeps: Record<string, string> = {};
  const resolvedDevDeps: Record<string, string> = {};

  const resolveOne = (name: string, declaredRange: string): string | null => {
    const key = `${name}@${declaredRange}`;
    return keyToVersion.get(key) ?? null;
  };

  for (const [name, range] of Object.entries(dependencies)) {
    const v = resolveOne(name, range);
    if (v) resolvedDeps[name] = v;
  }
  for (const [name, range] of Object.entries(devDependencies)) {
    const v = resolveOne(name, range);
    if (v) resolvedDevDeps[name] = v;
  }

  return { dependencies: resolvedDeps, devDependencies: resolvedDevDeps };
}
