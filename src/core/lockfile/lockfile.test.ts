import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getResolvedVersions } from "./index.js";

const TEST_DIR = join(tmpdir(), "mf-doctor-lockfile-test-" + Date.now());

describe("getResolvedVersions", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("returns empty when no lockfile exists", () => {
    const workspaceRoot = join(TEST_DIR, "no-lock");
    mkdirSync(workspaceRoot, { recursive: true });
    const projectRoot = join(workspaceRoot, "apps/app");
    mkdirSync(projectRoot, { recursive: true });

    const result = getResolvedVersions(
      workspaceRoot,
      projectRoot,
      { react: "^18.0.0" },
      {},
    );

    expect(result.dependencies).toEqual({});
    expect(result.devDependencies).toEqual({});
  });

  describe("npm (package-lock.json v3)", () => {
    it("resolves dependency version from workspace package entry", () => {
      const workspaceRoot = join(TEST_DIR, "npm-workspace");
      mkdirSync(workspaceRoot, { recursive: true });
      const lock = {
        name: "root",
        lockfileVersion: 3,
        packages: {
          "": { name: "root" },
          "apps/remote-a": {
            name: "remote-a",
            dependencies: { react: "^18.0.0" },
          },
          "apps/remote-a/node_modules/react": {
            version: "18.2.0",
          },
        },
      };
      writeFileSync(
        join(workspaceRoot, "package-lock.json"),
        JSON.stringify(lock, null, 2),
      );
      const projectRoot = join(workspaceRoot, "apps", "remote-a");

      const result = getResolvedVersions(
        workspaceRoot,
        projectRoot,
        { react: "^18.0.0" },
        {},
      );

      expect(result.dependencies.react).toBe("18.2.0");
      expect(result.devDependencies).toEqual({});
    });

    it("resolves devDependency from lockfile", () => {
      const workspaceRoot = join(TEST_DIR, "npm-dev");
      mkdirSync(workspaceRoot, { recursive: true });
      const lock = {
        lockfileVersion: 3,
        packages: {
          "packages/app": {
            devDependencies: { typescript: "^5.0.0" },
          },
          "packages/app/node_modules/typescript": {
            version: "5.3.0",
          },
        },
      };
      writeFileSync(
        join(workspaceRoot, "package-lock.json"),
        JSON.stringify(lock, null, 2),
      );
      const projectRoot = join(workspaceRoot, "packages", "app");

      const result = getResolvedVersions(
        workspaceRoot,
        projectRoot,
        {},
        { typescript: "^5.0.0" },
      );

      expect(result.devDependencies.typescript).toBe("5.3.0");
    });

    it("returns empty on unparseable lockfile", () => {
      const workspaceRoot = join(TEST_DIR, "npm-bad");
      mkdirSync(workspaceRoot, { recursive: true });
      writeFileSync(join(workspaceRoot, "package-lock.json"), "not json");
      const projectRoot = join(workspaceRoot, "apps", "app");
      mkdirSync(projectRoot, { recursive: true });

      const result = getResolvedVersions(
        workspaceRoot,
        projectRoot,
        { react: "^18.0.0" },
        {},
      );

      expect(result.dependencies).toEqual({});
      expect(result.devDependencies).toEqual({});
    });
  });

  describe("pnpm (pnpm-lock.yaml)", () => {
    it("resolves from importers section", () => {
      const workspaceRoot = join(TEST_DIR, "pnpm-workspace");
      mkdirSync(workspaceRoot, { recursive: true });
      const lock = `
lockfileVersion: "6.0"

importers:
  .:
    dependencies: {}
  apps/shell:
    dependencies:
      react:
        specifier: "^18.0.0"
        version: 18.2.0
    devDependencies:
      typescript:
        specifier: "^5.0.0"
        version: 5.3.0
`;
      writeFileSync(join(workspaceRoot, "pnpm-lock.yaml"), lock.trim());
      const projectRoot = join(workspaceRoot, "apps", "shell");

      const result = getResolvedVersions(
        workspaceRoot,
        projectRoot,
        { react: "^18.0.0" },
        { typescript: "^5.0.0" },
      );

      expect(result.dependencies.react).toBe("18.2.0");
      expect(result.devDependencies.typescript).toBe("5.3.0");
    });
  });

  describe("yarn (yarn.lock)", () => {
    it("resolves from lockfile key package@range", () => {
      const workspaceRoot = join(TEST_DIR, "yarn-workspace");
      mkdirSync(workspaceRoot, { recursive: true });
      const lock = `
# yarn.lock
react@^18.0.0:
  version "18.2.0"
  resolved "https://registry.npmjs.org/react/-/react-18.2.0.tgz"
  integrity sha512-abc123
`;
      writeFileSync(join(workspaceRoot, "yarn.lock"), lock.trim());
      const projectRoot = join(workspaceRoot, "packages", "app");
      mkdirSync(projectRoot, { recursive: true });

      const result = getResolvedVersions(
        workspaceRoot,
        projectRoot,
        { react: "^18.0.0" },
        {},
      );

      expect(result.dependencies.react).toBe("18.2.0");
    });
  });

  it("tries projectRoot when workspaceRoot has no lockfile (polyrepo)", () => {
    const workspaceRoot = join(TEST_DIR, "polyrepo");
    mkdirSync(workspaceRoot, { recursive: true });
    const projectRoot = join(workspaceRoot, "folder-a");
    mkdirSync(projectRoot, { recursive: true });
    const lock = {
      lockfileVersion: 3,
      packages: {
        "": {},
        "node_modules/react": { version: "18.2.0" },
      },
    };
    writeFileSync(
      join(projectRoot, "package-lock.json"),
      JSON.stringify(lock, null, 2),
    );

    const result = getResolvedVersions(
      workspaceRoot,
      projectRoot,
      { react: "^18.0.0" },
      {},
    );

    expect(result.dependencies.react).toBe("18.2.0");
  });
});
