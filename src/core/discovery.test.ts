import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverParticipants,
  discoverWorkspace,
  discoverFromWorkspaceFile,
} from "./discovery.js";

const TEST_DIR = join(tmpdir(), "mf-doctor-test-" + Date.now());

function createTestWorkspace(structure: {
  root: Record<string, unknown>;
  packages: Array<{
    name: string;
    packageJson: Record<string, unknown>;
    files?: string[];
  }>;
}): string {
  const workspaceRoot = join(
    TEST_DIR,
    "workspace-" + Math.random().toString(36).slice(2),
  );
  mkdirSync(workspaceRoot, { recursive: true });

  writeFileSync(
    join(workspaceRoot, "package.json"),
    JSON.stringify(structure.root, null, 2),
  );

  for (const pkg of structure.packages) {
    const pkgDir = join(workspaceRoot, "packages", pkg.name);
    mkdirSync(pkgDir, { recursive: true });

    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify(pkg.packageJson, null, 2),
    );

    for (const file of pkg.files || []) {
      const filePath = join(pkgDir, file);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, "// placeholder");
    }
  }

  return workspaceRoot;
}

describe("discoverParticipants", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("with valid workspaces", () => {
    it("discovers participants from example rsbuild-basic workspace", async () => {
      const exampleWorkspace = join(process.cwd(), "examples/rsbuild-basic");

      const participants = await discoverParticipants(exampleWorkspace);

      expect(participants).toHaveLength(4);

      const names = participants.map((p) => p.name).sort();
      expect(names).toEqual([
        "@rsbuild-basic/remote-a",
        "@rsbuild-basic/remote-b",
        "@rsbuild-basic/remote-c",
        "@rsbuild-basic/shell",
      ]);

      for (const participant of participants) {
        expect(participant.bundler).toBe("rsbuild");
        expect(participant.configPath).toContain("rsbuild.config.ts");
        expect(participant.parseStatus).toBe("partial");
        expect(participant.dependencies).toHaveProperty("react");
      }
    });

    it("discovers participants with npm workspaces array format", async () => {
      const workspaceRoot = createTestWorkspace({
        root: {
          name: "test-workspace",
          workspaces: ["packages/*"],
        },
        packages: [
          {
            name: "app-a",
            packageJson: {
              name: "@test/app-a",
              dependencies: { react: "^18.0.0" },
            },
            files: ["rsbuild.config.ts"],
          },
          {
            name: "app-b",
            packageJson: { name: "@test/app-b" },
            files: ["rsbuild.config.js"],
          },
        ],
      });

      const participants = await discoverParticipants(workspaceRoot);

      expect(participants).toHaveLength(2);
      expect(participants.map((p) => p.name).sort()).toEqual([
        "@test/app-a",
        "@test/app-b",
      ]);
    });

    it("discovers participants with yarn workspaces { packages } format", async () => {
      const workspaceRoot = createTestWorkspace({
        root: {
          name: "yarn-workspace",
          workspaces: { packages: ["packages/*"] },
        },
        packages: [
          {
            name: "lib",
            packageJson: { name: "@yarn/lib" },
            files: ["webpack.config.js"],
          },
        ],
      });

      const participants = await discoverParticipants(workspaceRoot);

      expect(participants).toHaveLength(1);
      expect(participants[0].name).toBe("@yarn/lib");
      expect(participants[0].bundler).toBe("webpack");
    });

    it("detects different bundler types correctly", async () => {
      const workspaceRoot = createTestWorkspace({
        root: {
          name: "multi-bundler",
          workspaces: ["packages/*"],
        },
        packages: [
          {
            name: "rsbuild-app",
            packageJson: { name: "rsbuild-app" },
            files: ["rsbuild.config.ts"],
          },
          {
            name: "webpack-app",
            packageJson: { name: "webpack-app" },
            files: ["webpack.config.js"],
          },
          {
            name: "rspack-app",
            packageJson: { name: "rspack-app" },
            files: ["rspack.config.ts"],
          },
        ],
      });

      const participants = await discoverParticipants(workspaceRoot);

      expect(participants).toHaveLength(3);

      const bundlerMap = Object.fromEntries(
        participants.map((p) => [p.name, p.bundler]),
      );
      expect(bundlerMap["rsbuild-app"]).toBe("rsbuild");
      expect(bundlerMap["webpack-app"]).toBe("webpack");
      expect(bundlerMap["rspack-app"]).toBe("rspack");
    });

    it("skips packages without bundler configs", async () => {
      const workspaceRoot = createTestWorkspace({
        root: {
          name: "mixed-workspace",
          workspaces: ["packages/*"],
        },
        packages: [
          {
            name: "with-config",
            packageJson: { name: "with-config" },
            files: ["rsbuild.config.ts"],
          },
          {
            name: "no-config",
            packageJson: { name: "no-config" },
            files: ["index.js"],
          },
          {
            name: "library",
            packageJson: { name: "library" },
            files: ["src/index.ts"],
          },
        ],
      });

      const participants = await discoverParticipants(workspaceRoot);

      expect(participants).toHaveLength(1);
      expect(participants[0].name).toBe("with-config");
    });

    it("uses directory name when package.json has no name", async () => {
      const workspaceRoot = createTestWorkspace({
        root: {
          name: "unnamed-packages",
          workspaces: ["packages/*"],
        },
        packages: [
          {
            name: "my-app",
            packageJson: { version: "1.0.0" },
            files: ["rsbuild.config.ts"],
          },
        ],
      });

      const participants = await discoverParticipants(workspaceRoot);

      expect(participants).toHaveLength(1);
      expect(participants[0].name).toBe("my-app");
    });

    it("extracts dependencies and devDependencies", async () => {
      const workspaceRoot = createTestWorkspace({
        root: {
          name: "deps-test",
          workspaces: ["packages/*"],
        },
        packages: [
          {
            name: "app",
            packageJson: {
              name: "app",
              dependencies: { react: "^18.2.0", lodash: "^4.17.0" },
              devDependencies: { typescript: "^5.0.0", vitest: "^1.0.0" },
            },
            files: ["rsbuild.config.ts"],
          },
        ],
      });

      const participants = await discoverParticipants(workspaceRoot);

      expect(participants[0].dependencies).toEqual({
        react: "^18.2.0",
        lodash: "^4.17.0",
      });
      expect(participants[0].devDependencies).toEqual({
        typescript: "^5.0.0",
        vitest: "^1.0.0",
      });
    });
  });

  describe("error handling for malformed repos", () => {
    it("throws error when package.json is missing", async () => {
      const emptyDir = join(TEST_DIR, "empty-" + Date.now());
      mkdirSync(emptyDir, { recursive: true });

      await expect(discoverParticipants(emptyDir)).rejects.toThrow(
        /No package\.json found/,
      );
    });

    it("throws error when workspaces field is missing", async () => {
      const workspaceRoot = join(TEST_DIR, "no-workspaces-" + Date.now());
      mkdirSync(workspaceRoot, { recursive: true });

      writeFileSync(
        join(workspaceRoot, "package.json"),
        JSON.stringify({ name: "no-workspaces" }),
      );

      await expect(discoverParticipants(workspaceRoot)).rejects.toThrow(
        /No workspaces defined/,
      );
    });

    it("throws error when workspaces is empty array", async () => {
      const workspaceRoot = join(TEST_DIR, "empty-workspaces-" + Date.now());
      mkdirSync(workspaceRoot, { recursive: true });

      writeFileSync(
        join(workspaceRoot, "package.json"),
        JSON.stringify({ name: "empty-workspaces", workspaces: [] }),
      );

      await expect(discoverParticipants(workspaceRoot)).rejects.toThrow(
        /No workspaces defined/,
      );
    });

    it("throws error when package.json is invalid JSON", async () => {
      const workspaceRoot = join(TEST_DIR, "invalid-json-" + Date.now());
      mkdirSync(workspaceRoot, { recursive: true });

      writeFileSync(join(workspaceRoot, "package.json"), "{ invalid json }");

      await expect(discoverParticipants(workspaceRoot)).rejects.toThrow(
        /No package\.json found/,
      );
    });

    it("returns empty array when no packages match glob pattern", async () => {
      const workspaceRoot = join(TEST_DIR, "no-matches-" + Date.now());
      mkdirSync(workspaceRoot, { recursive: true });

      writeFileSync(
        join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "no-matches",
          workspaces: ["apps/*"],
        }),
      );

      const participants = await discoverParticipants(workspaceRoot);
      expect(participants).toEqual([]);
    });

    it("gracefully handles packages with missing package.json", async () => {
      const workspaceRoot = join(TEST_DIR, "missing-pkg-json-" + Date.now());
      const packagesDir = join(workspaceRoot, "packages");
      const appDir = join(packagesDir, "broken-app");

      mkdirSync(appDir, { recursive: true });

      writeFileSync(
        join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "workspace",
          workspaces: ["packages/*"],
        }),
      );

      writeFileSync(join(appDir, "rsbuild.config.ts"), "// config");

      const participants = await discoverParticipants(workspaceRoot);
      expect(participants).toEqual([]);
    });
  });
});

describe("discoverWorkspace", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("returns extended metadata about the workspace", async () => {
    const workspaceRoot = createTestWorkspace({
      root: {
        name: "metadata-test",
        workspaces: ["packages/*"],
      },
      packages: [
        {
          name: "app",
          packageJson: { name: "app" },
          files: ["rsbuild.config.ts"],
        },
        {
          name: "lib",
          packageJson: { name: "lib" },
          files: [],
        },
      ],
    });

    const result = await discoverWorkspace(workspaceRoot);

    expect(result.workspaceRoot).toBe(workspaceRoot);
    expect(result.workspacePatterns).toEqual(["packages/*"]);
    expect(result.totalPackagesScanned).toBe(2);
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].name).toBe("app");
  });

  it("works with the example workspace", async () => {
    const exampleWorkspace = join(process.cwd(), "examples/rsbuild-basic");

    const result = await discoverWorkspace(exampleWorkspace);

    expect(result.workspacePatterns).toEqual(["apps/*"]);
    expect(result.totalPackagesScanned).toBe(4);
    expect(result.participants).toHaveLength(4);
  });
});

describe("discoverFromWorkspaceFile", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  function createPolyrepoSetup(): {
    workspaceFilePath: string;
    projectA: string;
    projectB: string;
    monorepoRoot: string;
  } {
    const baseDir = join(
      TEST_DIR,
      "polyrepo-" + Math.random().toString(36).slice(2),
    );

    const projectA = join(baseDir, "org", "project-a");
    mkdirSync(projectA, { recursive: true });
    writeFileSync(
      join(projectA, "package.json"),
      JSON.stringify({
        name: "@org/project-a",
        dependencies: { react: "^18.0.0" },
      }),
    );
    writeFileSync(join(projectA, "rsbuild.config.ts"), "// config");

    const projectB = join(baseDir, "org", "team-x", "project-b");
    mkdirSync(projectB, { recursive: true });
    writeFileSync(
      join(projectB, "package.json"),
      JSON.stringify({
        name: "@org/project-b",
        dependencies: { react: "^18.0.0" },
      }),
    );
    writeFileSync(join(projectB, "webpack.config.js"), "// config");

    const monorepoRoot = join(baseDir, "monorepo");
    const monorepoApp = join(monorepoRoot, "apps", "shell");
    mkdirSync(monorepoApp, { recursive: true });
    writeFileSync(
      join(monorepoRoot, "package.json"),
      JSON.stringify({
        name: "monorepo",
        workspaces: ["apps/*"],
      }),
    );
    writeFileSync(
      join(monorepoApp, "package.json"),
      JSON.stringify({
        name: "@monorepo/shell",
        dependencies: { react: "^18.0.0" },
      }),
    );
    writeFileSync(join(monorepoApp, "rsbuild.config.ts"), "// config");

    const workspaceFilePath = join(baseDir, "federation.code-workspace");
    writeFileSync(
      workspaceFilePath,
      JSON.stringify({
        folders: [
          { path: "./org/project-a" },
          { path: "./org/team-x/project-b" },
          { path: "./monorepo" },
        ],
      }),
    );

    return { workspaceFilePath, projectA, projectB, monorepoRoot };
  }

  it("discovers participants from workspace file folders", async () => {
    const { workspaceFilePath } = createPolyrepoSetup();

    const result = await discoverFromWorkspaceFile(workspaceFilePath);

    expect(result.workspaceFilePath).toBe(workspaceFilePath);
    expect(result.totalFolders).toBe(3);
    expect(result.participants.length).toBeGreaterThanOrEqual(3);

    const names = result.participants.map((p) => p.name).sort();
    expect(names).toContain("@org/project-a");
    expect(names).toContain("@org/project-b");
    expect(names).toContain("@monorepo/shell");
  });

  it("discovers direct participants from folder roots", async () => {
    const { workspaceFilePath, projectA, projectB } = createPolyrepoSetup();

    const result = await discoverFromWorkspaceFile(workspaceFilePath);

    const projectAParticipant = result.participants.find(
      (p) => p.name === "@org/project-a",
    );
    const projectBParticipant = result.participants.find(
      (p) => p.name === "@org/project-b",
    );

    expect(projectAParticipant).toBeDefined();
    expect(projectAParticipant!.projectRoot).toBe(projectA);
    expect(projectAParticipant!.bundler).toBe("rsbuild");

    expect(projectBParticipant).toBeDefined();
    expect(projectBParticipant!.projectRoot).toBe(projectB);
    expect(projectBParticipant!.bundler).toBe("webpack");
  });

  it("expands nested workspaces within folders", async () => {
    const { workspaceFilePath } = createPolyrepoSetup();

    const result = await discoverFromWorkspaceFile(workspaceFilePath);

    const shellParticipant = result.participants.find(
      (p) => p.name === "@monorepo/shell",
    );

    expect(shellParticipant).toBeDefined();
    expect(shellParticipant!.bundler).toBe("rsbuild");
  });

  it("skips non-existent folders gracefully", async () => {
    const baseDir = join(
      TEST_DIR,
      "missing-folders-" + Math.random().toString(36).slice(2),
    );
    mkdirSync(baseDir, { recursive: true });

    const existingProject = join(baseDir, "existing");
    mkdirSync(existingProject, { recursive: true });
    writeFileSync(
      join(existingProject, "package.json"),
      JSON.stringify({ name: "existing" }),
    );
    writeFileSync(join(existingProject, "rsbuild.config.ts"), "// config");

    const workspaceFilePath = join(baseDir, "test.code-workspace");
    writeFileSync(
      workspaceFilePath,
      JSON.stringify({
        folders: [{ path: "./existing" }, { path: "./non-existent" }],
      }),
    );

    const result = await discoverFromWorkspaceFile(workspaceFilePath);

    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].name).toBe("existing");
  });

  it("avoids duplicate participants when folder is both direct and in nested workspace", async () => {
    const baseDir = join(
      TEST_DIR,
      "duplicates-" + Math.random().toString(36).slice(2),
    );

    const monorepoRoot = join(baseDir, "monorepo");
    const app = join(monorepoRoot, "apps", "app");
    mkdirSync(app, { recursive: true });

    writeFileSync(
      join(monorepoRoot, "package.json"),
      JSON.stringify({
        name: "monorepo",
        workspaces: ["apps/*"],
      }),
    );
    writeFileSync(
      join(app, "package.json"),
      JSON.stringify({ name: "@mono/app" }),
    );
    writeFileSync(join(app, "rsbuild.config.ts"), "// config");

    const workspaceFilePath = join(baseDir, "test.code-workspace");
    writeFileSync(
      workspaceFilePath,
      JSON.stringify({
        folders: [{ path: "./monorepo" }, { path: "./monorepo/apps/app" }],
      }),
    );

    const result = await discoverFromWorkspaceFile(workspaceFilePath);

    const appParticipants = result.participants.filter(
      (p) => p.name === "@mono/app",
    );
    expect(appParticipants).toHaveLength(1);
  });

  it("handles folders without package.json", async () => {
    const baseDir = join(
      TEST_DIR,
      "no-pkg-json-" + Math.random().toString(36).slice(2),
    );

    const emptyFolder = join(baseDir, "empty");
    mkdirSync(emptyFolder, { recursive: true });
    writeFileSync(join(emptyFolder, "rsbuild.config.ts"), "// config");

    const workspaceFilePath = join(baseDir, "test.code-workspace");
    writeFileSync(
      workspaceFilePath,
      JSON.stringify({
        folders: [{ path: "./empty" }],
      }),
    );

    const result = await discoverFromWorkspaceFile(workspaceFilePath);

    expect(result.participants).toHaveLength(0);
  });
});
