import { describe, it, expect, beforeEach } from "vitest";
import {
  getExtractor,
  getSupportedBundlers,
  hasExtractor,
  registerExtractor,
  clearExtractors,
} from "./registry.js";
import type { Extractor } from "./types.js";

describe("extractor registry", () => {
  beforeEach(() => {
    clearExtractors();
  });

  describe("registerExtractor", () => {
    it("registers an extractor", () => {
      const mockExtractor: Extractor = {
        bundler: "rsbuild",
        configPatterns: ["rsbuild.config.ts"],
        extractFederationConfig: () => ({
          config: {
            participantName: "test",
            projectRoot: "/test",
            name: "test",
            exposes: {},
            remotes: {},
            shared: {},
          },
          warnings: [],
          isPartial: false,
        }),
      };

      registerExtractor(mockExtractor);

      expect(hasExtractor("rsbuild")).toBe(true);
      expect(getExtractor("rsbuild")).toBe(mockExtractor);
    });

    it("overwrites existing extractor for same bundler", () => {
      const extractor1: Extractor = {
        bundler: "webpack",
        configPatterns: ["webpack.config.js"],
        extractFederationConfig: () => ({
          config: {
            participantName: "test1",
            projectRoot: "/test",
            name: "test1",
            exposes: {},
            remotes: {},
            shared: {},
          },
          warnings: [],
          isPartial: false,
        }),
      };

      const extractor2: Extractor = {
        bundler: "webpack",
        configPatterns: ["webpack.config.ts"],
        extractFederationConfig: () => ({
          config: {
            participantName: "test2",
            projectRoot: "/test",
            name: "test2",
            exposes: {},
            remotes: {},
            shared: {},
          },
          warnings: [],
          isPartial: false,
        }),
      };

      registerExtractor(extractor1);
      registerExtractor(extractor2);

      const result = getExtractor("webpack");
      expect(result?.configPatterns).toEqual(["webpack.config.ts"]);
    });
  });

  describe("getExtractor", () => {
    it("returns null for unregistered bundler", () => {
      expect(getExtractor("unknown-bundler")).toBeNull();
    });

    it("returns registered extractor", () => {
      const mockExtractor: Extractor = {
        bundler: "rspack",
        configPatterns: ["rspack.config.ts"],
        extractFederationConfig: () => ({
          config: {
            participantName: "test",
            projectRoot: "/test",
            name: "test",
            exposes: {},
            remotes: {},
            shared: {},
          },
          warnings: [],
          isPartial: false,
        }),
      };

      registerExtractor(mockExtractor);

      expect(getExtractor("rspack")).toBe(mockExtractor);
    });
  });

  describe("getSupportedBundlers", () => {
    it("returns empty array when no extractors registered", () => {
      expect(getSupportedBundlers()).toEqual([]);
    });

    it("returns all registered bundler types", () => {
      const rsbuildExtractor: Extractor = {
        bundler: "rsbuild",
        configPatterns: ["rsbuild.config.ts"],
        extractFederationConfig: () => ({
          config: {
            participantName: "test",
            projectRoot: "/test",
            name: "test",
            exposes: {},
            remotes: {},
            shared: {},
          },
          warnings: [],
          isPartial: false,
        }),
      };

      const webpackExtractor: Extractor = {
        bundler: "webpack",
        configPatterns: ["webpack.config.js"],
        extractFederationConfig: () => ({
          config: {
            participantName: "test",
            projectRoot: "/test",
            name: "test",
            exposes: {},
            remotes: {},
            shared: {},
          },
          warnings: [],
          isPartial: false,
        }),
      };

      registerExtractor(rsbuildExtractor);
      registerExtractor(webpackExtractor);

      const bundlers = getSupportedBundlers();
      expect(bundlers).toContain("rsbuild");
      expect(bundlers).toContain("webpack");
      expect(bundlers.length).toBe(2);
    });
  });

  describe("hasExtractor", () => {
    it("returns false for unregistered bundler", () => {
      expect(hasExtractor("vite")).toBe(false);
    });

    it("returns true for registered bundler", () => {
      const mockExtractor: Extractor = {
        bundler: "rsbuild",
        configPatterns: ["rsbuild.config.ts"],
        extractFederationConfig: () => ({
          config: {
            participantName: "test",
            projectRoot: "/test",
            name: "test",
            exposes: {},
            remotes: {},
            shared: {},
          },
          warnings: [],
          isPartial: false,
        }),
      };

      registerExtractor(mockExtractor);

      expect(hasExtractor("rsbuild")).toBe(true);
    });
  });

  describe("clearExtractors", () => {
    it("removes all registered extractors", () => {
      const mockExtractor: Extractor = {
        bundler: "rsbuild",
        configPatterns: ["rsbuild.config.ts"],
        extractFederationConfig: () => ({
          config: {
            participantName: "test",
            projectRoot: "/test",
            name: "test",
            exposes: {},
            remotes: {},
            shared: {},
          },
          warnings: [],
          isPartial: false,
        }),
      };

      registerExtractor(mockExtractor);
      expect(hasExtractor("rsbuild")).toBe(true);

      clearExtractors();
      expect(hasExtractor("rsbuild")).toBe(false);
      expect(getSupportedBundlers()).toEqual([]);
    });
  });
});

describe("built-in extractors", () => {
  it("has rsbuild and webpack extractors registered by default", async () => {
    await import("./index.js");

    expect(hasExtractor("rsbuild")).toBe(true);
    expect(hasExtractor("webpack")).toBe(true);
  });
});
