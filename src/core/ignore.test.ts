import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadIgnoreFile, applyIgnoreRules } from "./ignore.js";
import type { IgnoreConfig } from "./ignore.js";
import type { Finding } from "./types.js";

describe("ignore", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `mf-doctor-ignore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("loadIgnoreFile", () => {
    it("returns empty entries when no ignore file exists", () => {
      const config = loadIgnoreFile(testDir);

      expect(config).toEqual({
        entries: [],
        filePath: null,
      });
    });

    it("loads valid ignore file", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(
        filePath,
        JSON.stringify({
          ignoreFindings: [
            {
              id: "react-version-drift",
              participants: ["@remote-a"],
              reason: "temporary drift",
            },
          ],
        }),
      );

      const config = loadIgnoreFile(testDir);

      expect(config.entries).toHaveLength(1);
      expect(config.entries[0]).toEqual({
        id: "react-version-drift",
        participants: ["@remote-a"],
        reason: "temporary drift",
      });
      expect(config.filePath).toBe(filePath);
    });

    it("loads ignore file with minimal entry (id only)", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(
        filePath,
        JSON.stringify({
          ignoreFindings: [{ id: "shared-config-mismatch" }],
        }),
      );

      const config = loadIgnoreFile(testDir);

      expect(config.entries).toHaveLength(1);
      expect(config.entries[0]).toEqual({ id: "shared-config-mismatch" });
    });

    it("handles empty ignoreFindings array", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(filePath, JSON.stringify({ ignoreFindings: [] }));

      const config = loadIgnoreFile(testDir);

      expect(config.entries).toEqual([]);
      expect(config.filePath).toBe(filePath);
    });

    it("handles empty object", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(filePath, JSON.stringify({}));

      const config = loadIgnoreFile(testDir);

      expect(config.entries).toEqual([]);
    });

    it("throws on invalid JSON", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(filePath, "{ invalid json }");

      expect(() => loadIgnoreFile(testDir)).toThrow("Invalid JSON");
    });

    it("throws when ignoreFindings is not an array", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(filePath, JSON.stringify({ ignoreFindings: "not-array" }));

      expect(() => loadIgnoreFile(testDir)).toThrow("expected an array");
    });

    it("throws when entry is missing id", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(
        filePath,
        JSON.stringify({ ignoreFindings: [{ reason: "no id" }] }),
      );

      expect(() => loadIgnoreFile(testDir)).toThrow(
        "'id' must be a non-empty string",
      );
    });

    it("throws when entry has empty id", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(
        filePath,
        JSON.stringify({ ignoreFindings: [{ id: "  " }] }),
      );

      expect(() => loadIgnoreFile(testDir)).toThrow(
        "'id' must be a non-empty string",
      );
    });

    it("throws when participants is not an array", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(
        filePath,
        JSON.stringify({
          ignoreFindings: [{ id: "test", participants: "@remote-a" }],
        }),
      );

      expect(() => loadIgnoreFile(testDir)).toThrow(
        "'participants' must be an array",
      );
    });

    it("throws when participants contains non-strings", () => {
      const filePath = join(testDir, ".mf-doctor-ignore.json");
      writeFileSync(
        filePath,
        JSON.stringify({
          ignoreFindings: [{ id: "test", participants: [123] }],
        }),
      );

      expect(() => loadIgnoreFile(testDir)).toThrow(
        "'participants' must contain strings",
      );
    });
  });

  describe("applyIgnoreRules", () => {
    const createFinding = (
      id: string,
      participants: string[],
      message = "test message",
    ): Finding => ({
      id,
      severity: "HIGH",
      message,
      participants,
    });

    it("returns all findings when no ignore entries", () => {
      const findings: Finding[] = [
        createFinding("react-version-drift", ["@shell", "@remote-a"]),
        createFinding("shared-config-mismatch", ["@remote-b"]),
      ];

      const config: IgnoreConfig = { entries: [], filePath: null };
      const result = applyIgnoreRules(findings, config);

      expect(result.findings).toEqual(findings);
      expect(result.ignoredCount).toBe(0);
      expect(result.ignoredFindings).toEqual([]);
    });

    it("ignores finding by id only (all participants)", () => {
      const findings: Finding[] = [
        createFinding("react-version-drift", ["@shell", "@remote-a"]),
        createFinding("shared-config-mismatch", ["@remote-b"]),
      ];

      const config: IgnoreConfig = {
        entries: [{ id: "react-version-drift" }],
        filePath: null,
      };

      const result = applyIgnoreRules(findings, config);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toBe("shared-config-mismatch");
      expect(result.ignoredCount).toBe(1);
    });

    it("ignores finding when participant matches", () => {
      const findings: Finding[] = [
        createFinding("react-version-drift", ["@shell", "@remote-a"]),
      ];

      const config: IgnoreConfig = {
        entries: [{ id: "react-version-drift", participants: ["@remote-a"] }],
        filePath: null,
      };

      const result = applyIgnoreRules(findings, config);

      expect(result.findings).toHaveLength(0);
      expect(result.ignoredCount).toBe(1);
    });

    it("does not ignore when participant does not match", () => {
      const findings: Finding[] = [
        createFinding("react-version-drift", ["@shell", "@remote-a"]),
      ];

      const config: IgnoreConfig = {
        entries: [{ id: "react-version-drift", participants: ["@remote-b"] }],
        filePath: null,
      };

      const result = applyIgnoreRules(findings, config);

      expect(result.findings).toHaveLength(1);
      expect(result.ignoredCount).toBe(0);
    });

    it("does not ignore when id does not match", () => {
      const findings: Finding[] = [
        createFinding("react-version-drift", ["@shell"]),
      ];

      const config: IgnoreConfig = {
        entries: [{ id: "shared-config-mismatch" }],
        filePath: null,
      };

      const result = applyIgnoreRules(findings, config);

      expect(result.findings).toHaveLength(1);
      expect(result.ignoredCount).toBe(0);
    });

    it("preserves reason in ignored findings", () => {
      const findings: Finding[] = [
        createFinding("react-version-drift", ["@shell"]),
      ];

      const config: IgnoreConfig = {
        entries: [{ id: "react-version-drift", reason: "known issue" }],
        filePath: null,
      };

      const result = applyIgnoreRules(findings, config);

      expect(result.ignoredFindings).toHaveLength(1);
      expect(result.ignoredFindings[0].reason).toBe("known issue");
      expect(result.ignoredFindings[0].finding.id).toBe("react-version-drift");
    });

    it("handles multiple ignore entries", () => {
      const findings: Finding[] = [
        createFinding("react-version-drift", ["@shell"]),
        createFinding("shared-config-mismatch", ["@remote-a"]),
        createFinding("other-finding", ["@remote-b"]),
      ];

      const config: IgnoreConfig = {
        entries: [
          { id: "react-version-drift" },
          { id: "shared-config-mismatch", participants: ["@remote-a"] },
        ],
        filePath: null,
      };

      const result = applyIgnoreRules(findings, config);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].id).toBe("other-finding");
      expect(result.ignoredCount).toBe(2);
    });

    it("matches any participant from entry list", () => {
      const findings: Finding[] = [
        createFinding("react-version-drift", ["@shell"]),
      ];

      const config: IgnoreConfig = {
        entries: [
          {
            id: "react-version-drift",
            participants: ["@remote-a", "@shell", "@remote-b"],
          },
        ],
        filePath: null,
      };

      const result = applyIgnoreRules(findings, config);

      expect(result.findings).toHaveLength(0);
      expect(result.ignoredCount).toBe(1);
    });
  });
});
