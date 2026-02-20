import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  isAnalyzerEnabled,
  getEnabledAnalyzerIds,
} from "./config.js";
import type { ResolvedConfig } from "./config.js";

describe("config", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `mfdoc-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("loadConfig", () => {
    it("returns defaults when no config file exists", async () => {
      const config = await loadConfig(testDir);

      expect(config).toEqual({
        checks: {},
        severityThreshold: "HIGH",
        ignore: [],
        hosts: [],
        configPath: null,
      });
    });

    it("loads mfdoc.config.js", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(
        configPath,
        `export default {
          checks: { "react-version-drift": { enabled: false } },
          severityThreshold: "MEDIUM"
        };`,
      );

      const config = await loadConfig(testDir);

      expect(config.checks).toEqual({
        "react-version-drift": { enabled: false },
      });
      expect(config.severityThreshold).toBe("MEDIUM");
      expect(config.configPath).toBe(configPath);
    });

    it("loads mfdoc.config.mjs", async () => {
      const configPath = join(testDir, "mfdoc.config.mjs");
      writeFileSync(
        configPath,
        `export default {
          severityThreshold: "LOW"
        };`,
      );

      const config = await loadConfig(testDir);

      expect(config.severityThreshold).toBe("LOW");
      expect(config.configPath).toBe(configPath);
    });

    it("prefers .ts over .js", async () => {
      const tsPath = join(testDir, "mfdoc.config.ts");
      const jsPath = join(testDir, "mfdoc.config.js");

      writeFileSync(tsPath, `export default { severityThreshold: "LOW" };`);
      writeFileSync(jsPath, `export default { severityThreshold: "HIGH" };`);

      const config = await loadConfig(testDir);

      expect(config.severityThreshold).toBe("LOW");
      expect(config.configPath).toBe(tsPath);
    });

    it("loads ignore patterns", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(
        configPath,
        `export default {
          ignore: ["**/node_modules/**", "**/dist/**"]
        };`,
      );

      const config = await loadConfig(testDir);

      expect(config.ignore).toEqual(["**/node_modules/**", "**/dist/**"]);
    });

    it("throws on invalid severityThreshold", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(
        configPath,
        `export default { severityThreshold: "INVALID" };`,
      );

      await expect(loadConfig(testDir)).rejects.toThrow(
        "Invalid 'severityThreshold'",
      );
    });

    it("throws on invalid checks type", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(configPath, `export default { checks: "not-an-object" };`);

      await expect(loadConfig(testDir)).rejects.toThrow("Invalid 'checks'");
    });

    it("throws on invalid ignore type", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(configPath, `export default { ignore: "not-an-array" };`);

      await expect(loadConfig(testDir)).rejects.toThrow("Invalid 'ignore'");
    });

    it("loads hosts configuration", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(
        configPath,
        `export default {
          hosts: ["shell-ui", "dashboard"]
        };`,
      );

      const config = await loadConfig(testDir);

      expect(config.hosts).toEqual(["shell-ui", "dashboard"]);
    });

    it("defaults hosts to empty array when not specified", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(configPath, `export default { severityThreshold: "LOW" };`);

      const config = await loadConfig(testDir);

      expect(config.hosts).toEqual([]);
    });

    it("throws on invalid hosts type", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(configPath, `export default { hosts: "not-an-array" };`);

      await expect(loadConfig(testDir)).rejects.toThrow("Invalid 'hosts'");
    });

    it("throws on non-string items in hosts array", async () => {
      const configPath = join(testDir, "mfdoc.config.js");
      writeFileSync(configPath, `export default { hosts: ["valid", 123] };`);

      await expect(loadConfig(testDir)).rejects.toThrow(
        "expected array of strings",
      );
    });
  });

  describe("isAnalyzerEnabled", () => {
    it("returns true for unlisted analyzers", () => {
      const config: ResolvedConfig = {
        checks: {},
        severityThreshold: "HIGH",
        ignore: [],
        hosts: [],
        configPath: null,
      };

      expect(isAnalyzerEnabled(config, "react-version-drift")).toBe(true);
      expect(isAnalyzerEnabled(config, "shared-config-mismatch")).toBe(true);
    });

    it("returns false when explicitly disabled", () => {
      const config: ResolvedConfig = {
        checks: { "react-version-drift": { enabled: false } },
        severityThreshold: "HIGH",
        ignore: [],
        hosts: [],
        configPath: null,
      };

      expect(isAnalyzerEnabled(config, "react-version-drift")).toBe(false);
      expect(isAnalyzerEnabled(config, "shared-config-mismatch")).toBe(true);
    });

    it("returns true when explicitly enabled", () => {
      const config: ResolvedConfig = {
        checks: { "react-version-drift": { enabled: true } },
        severityThreshold: "HIGH",
        ignore: [],
        hosts: [],
        configPath: null,
      };

      expect(isAnalyzerEnabled(config, "react-version-drift")).toBe(true);
    });
  });

  describe("getEnabledAnalyzerIds", () => {
    it("returns all analyzers when none disabled", () => {
      const config: ResolvedConfig = {
        checks: {},
        severityThreshold: "HIGH",
        ignore: [],
        hosts: [],
        configPath: null,
      };

      const allIds = ["react-version-drift", "shared-config-mismatch"];
      const enabled = getEnabledAnalyzerIds(config, allIds);

      expect(enabled).toEqual(allIds);
    });

    it("filters out disabled analyzers", () => {
      const config: ResolvedConfig = {
        checks: { "react-version-drift": { enabled: false } },
        severityThreshold: "HIGH",
        ignore: [],
        hosts: [],
        configPath: null,
      };

      const allIds = ["react-version-drift", "shared-config-mismatch"];
      const enabled = getEnabledAnalyzerIds(config, allIds);

      expect(enabled).toEqual(["shared-config-mismatch"]);
    });

    it("filters out multiple disabled analyzers", () => {
      const config: ResolvedConfig = {
        checks: {
          "react-version-drift": { enabled: false },
          "shared-config-mismatch": { enabled: false },
        },
        severityThreshold: "HIGH",
        ignore: [],
        hosts: [],
        configPath: null,
      };

      const allIds = [
        "react-version-drift",
        "shared-config-mismatch",
        "other-analyzer",
      ];
      const enabled = getEnabledAnalyzerIds(config, allIds);

      expect(enabled).toEqual(["other-analyzer"]);
    });
  });
});
