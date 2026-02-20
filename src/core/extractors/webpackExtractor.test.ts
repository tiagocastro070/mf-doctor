import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  locateWebpackConfig,
  hasWebpackConfig,
  getWebpackConfigPath,
  WEBPACK_CONFIG_PATTERNS,
  extractFederationConfig,
  extractFromProject,
} from "./webpackExtractor.js";

const TEST_DIR = join(tmpdir(), "mfdoc-webpack-test-" + Date.now());

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

describe("locateWebpackConfig", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("config file priority", () => {
    it("prefers webpack.config.ts over other formats", () => {
      const projectRoot = createTestProject([
        "webpack.config.ts",
        "webpack.config.js",
        "webpack.config.mjs",
      ]);

      const result = locateWebpackConfig(projectRoot);

      expect(result!.fileName).toBe("webpack.config.ts");
      expect(result!.isTypeScript).toBe(true);
    });

    it("prefers webpack.config.js over mjs", () => {
      const projectRoot = createTestProject([
        "webpack.config.js",
        "webpack.config.mjs",
      ]);

      const result = locateWebpackConfig(projectRoot);

      expect(result!.fileName).toBe("webpack.config.js");
      expect(result!.isTypeScript).toBe(false);
      expect(result!.isESM).toBe(false);
    });

    it("finds webpack.config.mjs when only option", () => {
      const projectRoot = createTestProject(["webpack.config.mjs"]);

      const result = locateWebpackConfig(projectRoot);

      expect(result!.fileName).toBe("webpack.config.mjs");
      expect(result!.isTypeScript).toBe(false);
      expect(result!.isESM).toBe(true);
    });
  });

  describe("each config file type", () => {
    for (const configFile of WEBPACK_CONFIG_PATTERNS) {
      it(`finds ${configFile}`, () => {
        const projectRoot = createTestProject([configFile]);

        const result = locateWebpackConfig(projectRoot);

        expect(result).not.toBeNull();
        expect(result!.fileName).toBe(configFile);
        expect(result!.configPath).toBe(join(projectRoot, configFile));
      });
    }
  });

  describe("edge cases", () => {
    it("returns null for non-existent directory", () => {
      const result = locateWebpackConfig("/non/existent/path");
      expect(result).toBeNull();
    });

    it("returns null for empty directory", () => {
      const projectRoot = createTestProject([]);
      const result = locateWebpackConfig(projectRoot);
      expect(result).toBeNull();
    });

    it("returns null when no webpack config exists", () => {
      const projectRoot = createTestProject([
        "package.json",
        "rsbuild.config.ts",
        "vite.config.ts",
      ]);

      const result = locateWebpackConfig(projectRoot);
      expect(result).toBeNull();
    });

    it("ignores similarly named files", () => {
      const projectRoot = createTestProject([
        "webpack.config.json",
        "webpack.config.yaml",
        "my-webpack.config.js",
      ]);

      const result = locateWebpackConfig(projectRoot);
      expect(result).toBeNull();
    });
  });
});

describe("hasWebpackConfig", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("returns true when config exists", () => {
    const projectRoot = createTestProject(["webpack.config.js"]);
    expect(hasWebpackConfig(projectRoot)).toBe(true);
  });

  it("returns false when no config exists", () => {
    const projectRoot = createTestProject(["package.json"]);
    expect(hasWebpackConfig(projectRoot)).toBe(false);
  });

  it("returns false for non-existent directory", () => {
    expect(hasWebpackConfig("/non/existent/path")).toBe(false);
  });
});

describe("getWebpackConfigPath", () => {
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("returns path when config exists", () => {
    const projectRoot = createTestProject(["webpack.config.js"]);
    const path = getWebpackConfigPath(projectRoot);

    expect(path).toBe(join(projectRoot, "webpack.config.js"));
  });

  it("returns null when no config exists", () => {
    const projectRoot = createTestProject(["package.json"]);
    expect(getWebpackConfigPath(projectRoot)).toBeNull();
  });
});

function createTestProjectWithConfig(configContent: string): string {
  const projectRoot = join(
    TEST_DIR,
    "extract-" + Math.random().toString(36).slice(2),
  );
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, "webpack.config.js"), configContent);
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
        "examples/webpack-basic/apps/shell",
      );
      const configPath = join(shellRoot, "webpack.config.js");

      const result = extractFederationConfig(configPath, "shell", shellRoot);

      expect(result.config.name).toBe("shell");
      expect(result.config.participantName).toBe("shell");
      expect(result.config.projectRoot).toBe(shellRoot);
      expect(result.config.remotes).toEqual({
        remoteA: "remoteA@http://localhost:3001/remoteEntry.js",
        remoteB: "remoteB@http://localhost:3002/remoteEntry.js",
      });
      expect(result.config.exposes).toEqual({});
      expect(result.config.shared).toHaveProperty("react");
      expect(result.config.shared).toHaveProperty("react-dom");
      expect(result.isPartial).toBe(false);
    });

    it("extracts remote-a config correctly", () => {
      const remoteARoot = join(
        process.cwd(),
        "examples/webpack-basic/apps/remote-a",
      );
      const configPath = join(remoteARoot, "webpack.config.js");

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
        "examples/webpack-basic/apps/remote-b",
      );
      const configPath = join(remoteBRoot, "webpack.config.js");

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
    it("extracts name from new ModuleFederationPlugin config", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('webpack').container;
        module.exports = {
          plugins: [
            new ModuleFederationPlugin({
              name: 'my-app',
            }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "webpack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.config.name).toBe("my-app");
      expect(result.isPartial).toBe(false);
    });

    it("extracts exposes from config", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('webpack').container;
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
        join(projectRoot, "webpack.config.js"),
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
        const { ModuleFederationPlugin } = require('webpack').container;
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
        join(projectRoot, "webpack.config.js"),
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
        const { ModuleFederationPlugin } = require('webpack').container;
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
        join(projectRoot, "webpack.config.js"),
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
        const { ModuleFederationPlugin } = require('webpack').container;
        new ModuleFederationPlugin({
          name: 'app',
          shared: {
            'react-dom': { singleton: true },
            '@scope/package': { singleton: true },
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "webpack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.config.shared).toHaveProperty("react-dom");
      expect(result.config.shared).toHaveProperty("@scope/package");
    });

    it("handles shared as array of strings", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('webpack').container;
        new ModuleFederationPlugin({
          name: 'app',
          shared: ['react', 'react-dom', 'lodash'],
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "webpack.config.js"),
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
        const { container } = require('webpack');
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
        join(projectRoot, "webpack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.config.name).toBe("my-remote");
      expect(result.config.exposes).toEqual({
        "./Header": "./src/Header",
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
        join(projectRoot, "webpack.config.js"),
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
        const { ModuleFederationPlugin } = require('webpack').container;
        const baseConfig = { singleton: true };
        new ModuleFederationPlugin({
          name: 'app',
          shared: {
            react: { ...baseConfig },
          },
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "webpack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.warnings.some((w) => w.includes("Spread"))).toBe(true);
    });

    it("warns about dynamic values", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('webpack').container;
        const appName = process.env.APP_NAME;
        new ModuleFederationPlugin({
          name: appName,
        });
      `);

      const result = extractFederationConfig(
        join(projectRoot, "webpack.config.js"),
        "participant",
        projectRoot,
      );

      expect(result.isPartial).toBe(true);
      expect(result.warnings.some((w) => w.includes("Dynamic"))).toBe(true);
    });

    it("returns empty config for non-existent file", () => {
      const result = extractFederationConfig(
        "/non/existent/path/webpack.config.js",
        "participant",
        "/non/existent/path",
      );

      expect(result.isPartial).toBe(true);
      expect(result.warnings.some((w) => w.includes("not found"))).toBe(true);
    });

    it("handles multiple MF plugins (uses first)", () => {
      const projectRoot = createTestProjectWithConfig(`
        const { ModuleFederationPlugin } = require('webpack').container;
        module.exports = {
          plugins: [
            new ModuleFederationPlugin({ name: 'first' }),
            new ModuleFederationPlugin({ name: 'second' }),
          ],
        };
      `);

      const result = extractFederationConfig(
        join(projectRoot, "webpack.config.js"),
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

  it("returns null for project without webpack config", () => {
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
      const { ModuleFederationPlugin } = require('webpack').container;
      new ModuleFederationPlugin({ name: 'my-app' });
    `);

    const result = extractFromProject(projectRoot);

    expect(result).not.toBeNull();
    expect(result!.config.participantName).toMatch(/^extract-/);
  });

  it("uses provided participant name", () => {
    const projectRoot = createTestProjectWithConfig(`
      const { ModuleFederationPlugin } = require('webpack').container;
      new ModuleFederationPlugin({ name: 'my-app' });
    `);

    const result = extractFromProject(projectRoot, "custom-name");

    expect(result).not.toBeNull();
    expect(result!.config.participantName).toBe("custom-name");
  });
});
