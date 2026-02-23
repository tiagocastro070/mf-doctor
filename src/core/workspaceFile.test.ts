import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadWorkspaceFile } from "./workspaceFile.js";

describe("workspaceFile", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `mf-doctor-workspace-file-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("loadWorkspaceFile", () => {
    it("loads a valid workspace file with absolute paths", () => {
      const workspaceFilePath = join(testDir, "test.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: [
            { path: "/absolute/path/to/project-a" },
            { path: "/absolute/path/to/project-b", name: "Project B" },
          ],
        }),
      );

      const result = loadWorkspaceFile(workspaceFilePath);

      expect(result.filePath).toBe(workspaceFilePath);
      expect(result.folders).toHaveLength(2);
      expect(result.folders[0].path).toBe("/absolute/path/to/project-a");
      expect(result.folders[0].name).toBeUndefined();
      expect(result.folders[1].path).toBe("/absolute/path/to/project-b");
      expect(result.folders[1].name).toBe("Project B");
    });

    it("resolves relative paths against workspace file location", () => {
      const workspaceFilePath = join(testDir, "test.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: [
            { path: "./project-a" },
            { path: "../sibling-project" },
            { path: "project-b" },
          ],
        }),
      );

      const result = loadWorkspaceFile(workspaceFilePath);

      expect(result.folders[0].path).toBe(join(testDir, "project-a"));
      expect(result.folders[1].path).toBe(
        join(testDir, "..", "sibling-project"),
      );
      expect(result.folders[2].path).toBe(join(testDir, "project-b"));
    });

    it("handles empty folders array", () => {
      const workspaceFilePath = join(testDir, "empty.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: [],
        }),
      );

      const result = loadWorkspaceFile(workspaceFilePath);

      expect(result.folders).toEqual([]);
    });

    it("throws error when file does not exist", () => {
      const nonExistentPath = join(testDir, "nonexistent.code-workspace");

      expect(() => loadWorkspaceFile(nonExistentPath)).toThrow(
        /Workspace file not found/,
      );
    });

    it("throws error when file is not valid JSON", () => {
      const workspaceFilePath = join(testDir, "invalid.code-workspace");
      writeFileSync(workspaceFilePath, "{ invalid json }");

      expect(() => loadWorkspaceFile(workspaceFilePath)).toThrow(
        /Invalid JSON in workspace file/,
      );
    });

    it("throws error when content is not an object", () => {
      const workspaceFilePath = join(testDir, "null.code-workspace");
      writeFileSync(workspaceFilePath, "null");

      expect(() => loadWorkspaceFile(workspaceFilePath)).toThrow(
        /expected an object/,
      );
    });

    it("throws error when folders is not an array", () => {
      const workspaceFilePath = join(testDir, "bad-folders.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: "not-an-array",
        }),
      );

      expect(() => loadWorkspaceFile(workspaceFilePath)).toThrow(
        /'folders' must be an array/,
      );
    });

    it("throws error when folder entry is not an object", () => {
      const workspaceFilePath = join(testDir, "bad-entry.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: ["string-instead-of-object"],
        }),
      );

      expect(() => loadWorkspaceFile(workspaceFilePath)).toThrow(
        /folders\[0\] must be an object/,
      );
    });

    it("throws error when folder path is missing", () => {
      const workspaceFilePath = join(testDir, "no-path.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: [{ name: "Project" }],
        }),
      );

      expect(() => loadWorkspaceFile(workspaceFilePath)).toThrow(
        /folders\[0\]\.path must be a non-empty string/,
      );
    });

    it("throws error when folder path is empty string", () => {
      const workspaceFilePath = join(testDir, "empty-path.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: [{ path: "  " }],
        }),
      );

      expect(() => loadWorkspaceFile(workspaceFilePath)).toThrow(
        /folders\[0\]\.path must be a non-empty string/,
      );
    });

    it("throws error when folder name is not a string", () => {
      const workspaceFilePath = join(testDir, "bad-name.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: [{ path: "/some/path", name: 123 }],
        }),
      );

      expect(() => loadWorkspaceFile(workspaceFilePath)).toThrow(
        /folders\[0\]\.name must be a string/,
      );
    });

    it("ignores extra properties in workspace file", () => {
      const workspaceFilePath = join(testDir, "extra-props.code-workspace");
      writeFileSync(
        workspaceFilePath,
        JSON.stringify({
          folders: [{ path: "/project" }],
          settings: { "editor.fontSize": 14 },
          extensions: { recommendations: ["some.extension"] },
        }),
      );

      const result = loadWorkspaceFile(workspaceFilePath);

      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].path).toBe("/project");
    });
  });
});
