import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  locateRspackConfig,
  hasRspackConfig,
  getRspackConfigPath,
  RSPACK_CONFIG_PATTERNS,
  extractFederationConfig,
  extractFromProject,
} from "./rspackExtractor.js";

const TEST_DIR = join(tmpdir(), "mf-doctor-rspack-test-" + Date.now());

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

describe("locateRspackConfig", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("config file priority", () => {
    it("prefers rspack.config.ts over other formats", () => {
      const projectRoot = createTestProject([
        "rspack.config.ts",
        "rspack.config.js",
        "rspack.config.mjs",
      ]);

      const result = locateRspackConfig(projectRoot);

      expect(result!.fileName).toBe("rspack.config.ts");
      expect(result!.isTypeScript).toBe(true);
    });

    it("prefers rspack.config.js over mjs", () => {
      const projectRoot = createTestProject([
        "rspack.config.js",
        "rspack.config.mjs",
      ]);

      const result = locateRspackConfig(projectRoot);

      expect(result!.fileName).toBe("rspack.config.js");
      expect(result!.isTypeScript).toBe(false);
      expect(result!.isESM).toBe(false);
    });

    it("finds rspack.config.mjs when only option", () => {
      const projectRoot = createTestProject(["rspack.config.mjs"]);

      const result = locateRspackConfig(projectRoot);

      expect(result!.fileName).toBe("rspack.config.mjs");
      expect(result!.isTypeScript).toBe(false);
      expect(result!.isESM).toBe(true);
    });
  });

  describe("each config file type", () => {
    for (const configFile of RSPACK_CONFIG_PATTERNS) {
      it(`finds ${configFile}`, () => {
        const projectRoot = createTestProject([configFile]);

        const result = locateRspackConfig(projectRoot);

        expect(result).not.toBeNull();
        expect(result!.fileName).toBe(configFile);
        expect(result!.configPath).toBe(join(projectRoot, configFile));
      });
    }
  });

  describe("edge cases", () => {
    it("returns null for non-existent directory", () => {
      const result = locateRspackConfig("/non/existent/path");
      expect(result).toBeNull();
    });

    it("returns null for empty directory", () => {
      const projectRoot = createTestProject([]);
      const result = locateRspackConfig(projectRoot);
      expect(result).toBeNull();
    });

    it("returns null when no rspack config exists", () => {
      const projectRoot = createTestProject([
        "package.json",
        "rsbuild.config.ts",
        "webpack.config.js",
      ]);

      const result = locateRspackConfig(projectRoot);
      expect(result).toBeNull();
    });

    it("ignores similarly named files", () => {
      const projectRoot = createTestProject([
        "rspack.config.json",
        "rspack.config.yaml",
        "my-rspack.config.js",
      ]);

      const result = locateRspackConfig(projectRoot);
      expect(result).toBeNull();
    });
  });
});

describe("hasRspackConfig", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("returns true when config exists", () => {
    const projectRoot = createTestProject(["rspack.config.js"]);
    expect(hasRspackConfig(projectRoot)).toBe(true);
  });

  it("returns false when no config exists", () => {
    const projectRoot = createTestProject(["package.json"]);
    expect(hasRspackConfig(projectRoot)).toBe(false);
  });

  it("returns false for non-existent directory", () => {
    expect(hasRspackConfig("/non/existent/path")).toBe(false);
  });
});

describe("getRspackConfigPath", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("returns path when config exists", () => {
    const projectRoot = createTestProject(["rspack.config.js"]);
    const path = getRspackConfigPath(projectRoot);

    expect(path).toBe(join(projectRoot, "rspack.config.js"));
  });

  it("returns null when no config exists", () => {
    const projectRoot = createTestProject(["package.json"]);
    expect(getRspackConfigPath(projectRoot)).toBeNull();
  });
});

function createTestProjectWithConfig(configContent: string): string {
  const projectRoot = join(
    TEST_DIR,
    "extract-" + Math.random().toString(36).slice(2),
  );
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, "rspack.config.js"), configContent);
  return projectRoot;
}

describe("extractFederationConfig", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("config parsing", () => {
    it("extracts name from new ModuleFederationPlugin config", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        module.exports = {
          plugins: [
            new ModuleFederationPlugin({
              name: 'my-app',
            }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.config.name).toBe("my-app");
      expect(result.isPartial).toBe(false);
    });

    it("extracts exposes from config", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        module.exports = {
          plugins: [
            new ModuleFederationPlugin({
              name: 'remote',
              exposes: {
                './Button': './src/Button',
                './Card': './src/components/Card',
              },
            }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
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
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        module.exports = {
          plugins: [
            new ModuleFederationPlugin({
              name: 'shell',
              remotes: {
                app1: 'app1@http://localhost:3001/remoteEntry.js',
                app2: 'app2@http://localhost:3002/remoteEntry.js',
              },
            }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
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
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        module.exports = {
          plugins: [
            new ModuleFederationPlugin({
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
            }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
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
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        new ModuleFederationPlugin({
          name: 'app',
          shared: {
            'react-dom': { singleton: true },
            '@scope/package': { singleton: true },
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.config.shared).toHaveProperty("react-dom");
      expect(result.config.shared).toHaveProperty("@scope/package");
    });

    it("handles shared as array of strings", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        new ModuleFederationPlugin({
          name: 'app',
          shared: ['react', 'react-dom', 'lodash'],
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.config.shared).toEqual({
        react: "react",
        "react-dom": "react-dom",
        lodash: "lodash",
      });
    });

    it("handles destructured import style", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { container } = require('@rspack/core');
        const { ModuleFederationPlugin } = container;
        
        module.exports = {
          plugins: [
            new ModuleFederationPlugin({
              name: 'my-remote',
              exposes: {
                './Header': './src/Header',
              },
            }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.config.name).toBe("my-remote");
      expect(result.config.exposes).toEqual({
        "./Header": "./src/Header",
      });
    });

    it("handles rspack ESM import style", () => {
      const projectRoot = createTestProjectWithConfig(`
        import { container } from '@rspack/core';
        const { ModuleFederationPlugin } = container;
        
        export default {
          plugins: [
            new ModuleFederationPlugin({
              name: 'esm-app',
              exposes: {
                './Widget': './src/Widget',
              },
            }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.config.name).toBe("esm-app");
      expect(result.config.exposes).toEqual({
        "./Widget": "./src/Widget",
      });
    });
  });

  describe("edge cases and warnings", () => {
    it("returns isPartial when no MF plugin found", () => {
      const projectRoot = createTestProjectWithConfig(`
        module.exports = {
          plugins: [],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.isPartial).toBe(true);
      expect(result.warnings).toContain(
        "No ModuleFederationPlugin instantiation found in config",
      );
    });

    it("warns about spread operators", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        const baseConfig = { singleton: true };
        new ModuleFederationPlugin({
          name: 'app',
          shared: {
            react: { ...baseConfig },
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.warnings.some((w) => w.includes("Spread"))).toBe(true);
    });

    it("warns about dynamic values", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        const appName = process.env.APP_NAME;
        new ModuleFederationPlugin({
          name: appName,
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.isPartial).toBe(true);
      expect(result.warnings.some((w) => w.includes("Dynamic"))).toBe(true);
    });

    it("returns empty config for non-existent file", () => {
      const result = extractFederationConfig(
        "/non/existent/path/rspack.config.js",
        "participant",
        "/non/existent/path",
      );

      expect(result.isPartial).toBe(true);
      expect(result.warnings.some((w) => w.includes("not found"))).toBe(true);
    });

    it("handles multiple MF plugins (uses first)", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('@rspack/core').container;
        module.exports = {
          plugins: [
            new ModuleFederationPlugin({ name: 'first' }),
            new ModuleFederationPlugin({ name: 'second' }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "rspack.config.js"),
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

  it("returns null for project without rspack config", () => {
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
      const { ModuleFederationPlugin } = require('@rspack/core').container;
      new ModuleFederationPlugin({ name: 'my-app' });
    `);

    const result = extractFromProject(projectRoot);

    expect(result).not.toBeNull();
    expect(result!.config.participantName).toMatch(/^extract-/);
  });

  it("uses provided participant name", () => {
    const projectRoot = createTestProjectWithConfig(`
      const { ModuleFederationPlugin } = require('@rspack/core').container;
      new ModuleFederationPlugin({ name: 'my-app' });
    `);

    const result = extractFromProject(projectRoot, "custom-name");

    expect(result).not.toBeNull();
    expect(result!.config.participantName).toBe("custom-name");
  });
});
