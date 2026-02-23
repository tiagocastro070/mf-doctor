import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  locateRsbuildConfig,
  hasRsbuildConfig,
  getRsbuildConfigPath,
  RSBUILD_CONFIG_PATTERNS,
  extractFederationConfig,
  extractFromProject,
} from "./rsbuildExtractor.js";

const TEST_DIR = join(tmpdir(), "mf-doctor-rsbuild-test-" + Date.now());

function createTestProject(files: string[]): string {
  const projectRoot = join(
    TEST_DIR,
    "project-" + Math.random().toString(36).slice(2),
  );
  mkdirSync(projectRoot, { recursive: true });

  for (const file of files) {
    writeFileSync(join(projectRoot, file), "// placeholder config");
  }

  return projectRoot;
}

describe("locateRsbuildConfig", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("with example workspace", () => {
    it("returns correct path for shell", () => {
      const shellRoot = join(
        process.cwd(),
        "examples/rsbuild-basic/apps/shell",
      );
      const result = locateRsbuildConfig(shellRoot);

      expect(result).not.toBeNull();
      expect(result!.configPath).toBe(join(shellRoot, "rsbuild.config.ts"));
      expect(result!.fileName).toBe("rsbuild.config.ts");
      expect(result!.isTypeScript).toBe(true);
      expect(result!.isESM).toBe(false);
    });

    it("returns correct path for remote-a", () => {
      const remoteARoot = join(
        process.cwd(),
        "examples/rsbuild-basic/apps/remote-a",
      );
      const result = locateRsbuildConfig(remoteARoot);

      expect(result).not.toBeNull();
      expect(result!.configPath).toBe(join(remoteARoot, "rsbuild.config.ts"));
      expect(result!.fileName).toBe("rsbuild.config.ts");
    });

    it("returns correct path for remote-b", () => {
      const remoteBRoot = join(
        process.cwd(),
        "examples/rsbuild-basic/apps/remote-b",
      );
      const result = locateRsbuildConfig(remoteBRoot);

      expect(result).not.toBeNull();
      expect(result!.configPath).toBe(join(remoteBRoot, "rsbuild.config.ts"));
      expect(result!.fileName).toBe("rsbuild.config.ts");
    });
  });

  describe("config file priority", () => {
    it("prefers rsbuild.config.ts over other formats", () => {
      const projectRoot = createTestProject([
        "rsbuild.config.ts",
        "rsbuild.config.js",
        "rsbuild.config.mjs",
      ]);

      const result = locateRsbuildConfig(projectRoot);

      expect(result!.fileName).toBe("rsbuild.config.ts");
    });

    it("prefers rsbuild.config.mts over JS formats", () => {
      const projectRoot = createTestProject([
        "rsbuild.config.mts",
        "rsbuild.config.js",
        "rsbuild.config.cjs",
      ]);

      const result = locateRsbuildConfig(projectRoot);

      expect(result!.fileName).toBe("rsbuild.config.mts");
      expect(result!.isTypeScript).toBe(true);
      expect(result!.isESM).toBe(true);
    });

    it("prefers rsbuild.config.js over cjs and mjs", () => {
      const projectRoot = createTestProject([
        "rsbuild.config.js",
        "rsbuild.config.cjs",
        "rsbuild.config.mjs",
      ]);

      const result = locateRsbuildConfig(projectRoot);

      expect(result!.fileName).toBe("rsbuild.config.js");
      expect(result!.isTypeScript).toBe(false);
      expect(result!.isESM).toBe(false);
    });

    it("prefers rsbuild.config.cjs over mjs", () => {
      const projectRoot = createTestProject([
        "rsbuild.config.cjs",
        "rsbuild.config.mjs",
      ]);

      const result = locateRsbuildConfig(projectRoot);

      expect(result!.fileName).toBe("rsbuild.config.cjs");
      expect(result!.isTypeScript).toBe(false);
      expect(result!.isESM).toBe(false);
    });

    it("finds rsbuild.config.mjs when only option", () => {
      const projectRoot = createTestProject(["rsbuild.config.mjs"]);

      const result = locateRsbuildConfig(projectRoot);

      expect(result!.fileName).toBe("rsbuild.config.mjs");
      expect(result!.isTypeScript).toBe(false);
      expect(result!.isESM).toBe(true);
    });
  });

  describe("each config file type", () => {
    for (const configFile of RSBUILD_CONFIG_PATTERNS) {
      it(`finds ${configFile}`, () => {
        const projectRoot = createTestProject([configFile]);

        const result = locateRsbuildConfig(projectRoot);

        expect(result).not.toBeNull();
        expect(result!.fileName).toBe(configFile);
        expect(result!.configPath).toBe(join(projectRoot, configFile));
      });
    }
  });

  describe("metadata correctness", () => {
    it("correctly identifies TypeScript files", () => {
      const tsProject = createTestProject(["rsbuild.config.ts"]);
      const mtsProject = createTestProject(["rsbuild.config.mts"]);

      expect(locateRsbuildConfig(tsProject)!.isTypeScript).toBe(true);
      expect(locateRsbuildConfig(mtsProject)!.isTypeScript).toBe(true);
    });

    it("correctly identifies non-TypeScript files", () => {
      const jsProject = createTestProject(["rsbuild.config.js"]);
      const cjsProject = createTestProject(["rsbuild.config.cjs"]);
      const mjsProject = createTestProject(["rsbuild.config.mjs"]);

      expect(locateRsbuildConfig(jsProject)!.isTypeScript).toBe(false);
      expect(locateRsbuildConfig(cjsProject)!.isTypeScript).toBe(false);
      expect(locateRsbuildConfig(mjsProject)!.isTypeScript).toBe(false);
    });

    it("correctly identifies ESM files", () => {
      const mtsProject = createTestProject(["rsbuild.config.mts"]);
      const mjsProject = createTestProject(["rsbuild.config.mjs"]);

      expect(locateRsbuildConfig(mtsProject)!.isESM).toBe(true);
      expect(locateRsbuildConfig(mjsProject)!.isESM).toBe(true);
    });

    it("correctly identifies non-ESM files", () => {
      const tsProject = createTestProject(["rsbuild.config.ts"]);
      const jsProject = createTestProject(["rsbuild.config.js"]);
      const cjsProject = createTestProject(["rsbuild.config.cjs"]);

      expect(locateRsbuildConfig(tsProject)!.isESM).toBe(false);
      expect(locateRsbuildConfig(jsProject)!.isESM).toBe(false);
      expect(locateRsbuildConfig(cjsProject)!.isESM).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns null for non-existent directory", () => {
      const result = locateRsbuildConfig("/non/existent/path");
      expect(result).toBeNull();
    });

    it("returns null for empty directory", () => {
      const projectRoot = createTestProject([]);
      const result = locateRsbuildConfig(projectRoot);
      expect(result).toBeNull();
    });

    it("returns null when no rsbuild config exists", () => {
      const projectRoot = createTestProject([
        "package.json",
        "webpack.config.js",
        "vite.config.ts",
      ]);

      const result = locateRsbuildConfig(projectRoot);
      expect(result).toBeNull();
    });

    it("ignores similarly named files", () => {
      const projectRoot = createTestProject([
        "rsbuild.config.json",
        "rsbuild.config.yaml",
        "my-rsbuild.config.ts",
      ]);

      const result = locateRsbuildConfig(projectRoot);
      expect(result).toBeNull();
    });
  });
});

describe("hasRsbuildConfig", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("returns true when config exists", () => {
    const projectRoot = createTestProject(["rsbuild.config.ts"]);
    expect(hasRsbuildConfig(projectRoot)).toBe(true);
  });

  it("returns false when no config exists", () => {
    const projectRoot = createTestProject(["package.json"]);
    expect(hasRsbuildConfig(projectRoot)).toBe(false);
  });

  it("returns false for non-existent directory", () => {
    expect(hasRsbuildConfig("/non/existent/path")).toBe(false);
  });
});

describe("getRsbuildConfigPath", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("returns path when config exists", () => {
    const projectRoot = createTestProject(["rsbuild.config.ts"]);
    const path = getRsbuildConfigPath(projectRoot);

    expect(path).toBe(join(projectRoot, "rsbuild.config.ts"));
  });

  it("returns null when no config exists", () => {
    const projectRoot = createTestProject(["package.json"]);
    expect(getRsbuildConfigPath(projectRoot)).toBeNull();
  });
});

function createTestProjectWithConfig(configContent: string): string {
  const projectRoot = join(
    TEST_DIR,
    "extract-" + Math.random().toString(36).slice(2),
  );
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, "rsbuild.config.ts"), configContent);
  return projectRoot;
}

describe("extractFederationConfig", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("with example workspace", () => {
    it("extracts shell config correctly", () => {
      const shellRoot = join(
        process.cwd(),
        "examples/rsbuild-basic/apps/shell",
      );
      const configPath = join(shellRoot, "rsbuild.config.ts");

      const result = extractFederationConfig(configPath, "shell", shellRoot);

      expect(result.config.name).toBe("shell");
      expect(result.config.participantName).toBe("shell");
      expect(result.config.projectRoot).toBe(shellRoot);
      expect(result.config.remotes).toEqual({
        remoteA: "remoteA@http://localhost:3001/mf-manifest.json",
        remoteB: "remoteB@http://localhost:3002/mf-manifest.json",
      });
      expect(result.config.exposes).toEqual({});
      expect(result.config.shared).toHaveProperty("react");
      expect(result.config.shared).toHaveProperty("react-dom");
      expect(result.isPartial).toBe(false);
    });

    it("extracts remote-a config correctly", () => {
      const remoteARoot = join(
        process.cwd(),
        "examples/rsbuild-basic/apps/remote-a",
      );
      const configPath = join(remoteARoot, "rsbuild.config.ts");

      const result = extractFederationConfig(
        configPath,
        "remote-a",
        remoteARoot,
      );

      expect(result.config.name).toBe("remoteA");
      expect(result.config.exposes).toEqual({
        "./Button": "./src/Button",
      });
      expect(result.config.remotes).toEqual({});
      expect(result.config.shared).toHaveProperty("react");

      const reactConfig = result.config.shared["react"];
      expect(reactConfig).toEqual({
        singleton: true,
        requiredVersion: "18.2.0",
      });
    });

    it("extracts remote-b config correctly", () => {
      const remoteBRoot = join(
        process.cwd(),
        "examples/rsbuild-basic/apps/remote-b",
      );
      const configPath = join(remoteBRoot, "rsbuild.config.ts");

      const result = extractFederationConfig(
        configPath,
        "remote-b",
        remoteBRoot,
      );

      expect(result.config.name).toBe("remoteB");
      expect(result.config.exposes).toEqual({
        "./Card": "./src/Card",
        "./Button": "./src/Button",
      });
      expect(result.config.shared["react"]).toEqual({
        singleton: true,
        requiredVersion: "^18.3.1",
      });
    });
  });

  describe("config parsing", () => {
    it("extracts name from config", () => {
      const projectRoot = createTestProjectWithConfig(`
        import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
        export default {
          plugins: [
            pluginModuleFederation({
              name: 'my-app',
            }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.config.name).toBe("my-app");
    });

    it("extracts exposes from config", () => {
      const projectRoot = createTestProjectWithConfig(`
        import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
        pluginModuleFederation({
          name: 'remote',
          exposes: {
            './Button': './src/Button',
            './Card': './src/components/Card',
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.config.exposes).toEqual({
        "./Button": "./src/Button",
        "./Card": "./src/components/Card",
      });
    });

    it("extracts remotes from config", () => {
      const projectRoot = createTestProjectWithConfig(`
        pluginModuleFederation({
          name: 'shell',
          remotes: {
            app1: 'app1@http://localhost:3001/remoteEntry.js',
            app2: 'app2@http://localhost:3002/remoteEntry.js',
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.config.remotes).toEqual({
        app1: "app1@http://localhost:3001/remoteEntry.js",
        app2: "app2@http://localhost:3002/remoteEntry.js",
      });
    });

    it("extracts shared config with full options", () => {
      const projectRoot = createTestProjectWithConfig(`
        pluginModuleFederation({
          name: 'app',
          shared: {
            react: {
              singleton: true,
              requiredVersion: '^18.0.0',
              eager: false,
            },
            lodash: {
              singleton: false,
              strictVersion: true,
            },
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.config.shared["react"]).toEqual({
        singleton: true,
        requiredVersion: "^18.0.0",
        eager: false,
      });
      expect(result.config.shared["lodash"]).toEqual({
        singleton: false,
        strictVersion: true,
      });
    });

    it("handles quoted property names", () => {
      const projectRoot = createTestProjectWithConfig(`
        pluginModuleFederation({
          name: 'app',
          shared: {
            'react-dom': { singleton: true },
            '@scope/package': { singleton: true },
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.config.shared).toHaveProperty("react-dom");
      expect(result.config.shared).toHaveProperty("@scope/package");
    });

    it("handles shared as array of strings", () => {
      const projectRoot = createTestProjectWithConfig(`
        pluginModuleFederation({
          name: 'app',
          shared: ['react', 'react-dom', 'lodash'],
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.config.shared).toEqual({
        react: "react",
        "react-dom": "react-dom",
        lodash: "lodash",
      });
    });
  });

  describe("edge cases and warnings", () => {
    it("returns isPartial when no MF call found", () => {
      const projectRoot = createTestProjectWithConfig(`
        export default {
          plugins: [],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.isPartial).toBe(true);
      expect(result.warnings).toContain(
        "No pluginModuleFederation call found in config",
      );
    });

    it("warns about spread operators", () => {
      const projectRoot = createTestProjectWithConfig(`
        const baseConfig = { singleton: true };
        pluginModuleFederation({
          name: 'app',
          shared: {
            react: { ...baseConfig },
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.warnings.some((w) => w.includes("Spread"))).toBe(true);
    });

    it("warns about dynamic values", () => {
      const projectRoot = createTestProjectWithConfig(`
        const appName = process.env.APP_NAME;
        pluginModuleFederation({
          name: appName,
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.isPartial).toBe(true);
      expect(result.warnings.some((w) => w.includes("Dynamic"))).toBe(true);
    });

    it("returns empty config for non-existent file", () => {
      const result = extractFederationConfig(
        "/non/existent/path/rsbuild.config.ts",
        "participant",
        "/non/existent/path",
      );

      expect(result.isPartial).toBe(true);
      expect(result.warnings.some((w) => w.includes("not found"))).toBe(true);
    });

    it("handles multiple MF calls (uses first)", () => {
      const projectRoot = createTestProjectWithConfig(`
        pluginModuleFederation({ name: 'first' });
        pluginModuleFederation({ name: 'second' });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rsbuild.config.ts"),
        "participant",
        projectRoot,
      );

      expect(result.config.name).toBe("first");
      expect(result.warnings.some((w) => w.includes("2"))).toBe(true);
    });
  });
});

describe("extractFromProject", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("extracts config from example shell project", () => {
    const shellRoot = join(process.cwd(), "examples/rsbuild-basic/apps/shell");

    const result = extractFromProject(shellRoot, "@rsbuild-basic/shell");

    expect(result).not.toBeNull();
    expect(result!.config.name).toBe("shell");
    expect(result!.config.participantName).toBe("@rsbuild-basic/shell");
  });

  it("returns null for project without rsbuild config", () => {
    const projectRoot = join(
      TEST_DIR,
      "no-config-" + Math.random().toString(36).slice(2),
    );
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, "package.json"), "{}");

    const result = extractFromProject(projectRoot);

    expect(result).toBeNull();
  });

  it("uses directory name as participant name by default", () => {
    const projectRoot = createTestProjectWithConfig(`
      pluginModuleFederation({ name: 'my-app' });
    `);

    const result = extractFromProject(projectRoot);

    expect(result).not.toBeNull();
    expect(result!.config.participantName).toMatch(/^extract-/);
  });
});
