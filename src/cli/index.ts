#!/usr/bin/env node

import { Command } from "commander";
import { resolve, basename, dirname } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import pc from "picocolors";
import { analyze, getProjectGraph } from "../core/analyze.js";
import type { PullResult } from "../core/analyze.js";
import { loadConfig, getEnabledAnalyzerIds } from "../core/config.js";
import { loadIgnoreFile, applyIgnoreRules } from "../core/ignore.js";
import { analyzers } from "../core/analyzers/index.js";
import { applyHostOverrides } from "../core/projectGraph.js";
import { formatPretty, formatJson, formatError } from "./formatters.js";
import { generateAsciiGraph, generateMermaidGraph } from "./visualize.js";
import {
  runInteractiveFix,
  shouldRunInteractive,
  hasFixableIssues,
} from "./interactiveFix.js";
import type {
  FindingSeverity,
  Finding,
  FullAnalysisResult,
} from "../core/types.js";

const program = new Command();

/**
 * Severity levels in order from lowest to highest.
 */
const SEVERITY_ORDER: FindingSeverity[] = ["LOW", "MEDIUM", "HIGH"];

/**
 * Checks if any findings meet or exceed the specified severity threshold.
 */
function hasFailingSeverity(
  findingsBySeverity: Record<FindingSeverity, number>,
  failOn: FindingSeverity,
): boolean {
  const thresholdIndex = SEVERITY_ORDER.indexOf(failOn);

  for (let i = thresholdIndex; i < SEVERITY_ORDER.length; i++) {
    const severity = SEVERITY_ORDER[i];
    if (findingsBySeverity[severity] > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Validates the severity level input.
 */
function parseSeverity(value: string): FindingSeverity {
  const upper = value.toUpperCase() as FindingSeverity;
  if (!SEVERITY_ORDER.includes(upper)) {
    throw new Error(
      `Invalid severity: ${value}. Must be one of: ${SEVERITY_ORDER.join(", ")}`,
    );
  }
  return upper;
}

/**
 * Recalculates findingsBySeverity counts from filtered findings.
 */
function recalculateSeverityCounts(
  findings: Finding[],
): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
  };

  for (const finding of findings) {
    counts[finding.severity]++;
  }

  return counts;
}

/**
 * Merges hosts from config and CLI options, removing duplicates.
 */
function mergeHosts(configHosts: string[], cliHosts: string[]): string[] {
  return [...new Set([...configHosts, ...cliHosts])];
}

type AnalyzeOptions = {
  format: string;
  analyzers?: string;
  failOn?: string;
  config: boolean;
  ignore: boolean;
  workspace?: string;
  pull?: boolean;
  host?: string[];
  interactive: boolean;
};

/**
 * Formats the list of available analyzers for help output.
 */
function formatAnalyzersHelp(): string {
  const maxIdLength = Math.max(...analyzers.map((a) => a.id.length));
  const lines = analyzers.map((a) => {
    const paddedId = a.id.padEnd(maxIdLength + 2);
    return `  ${paddedId}${a.description}`;
  });

  return [
    "",
    "Available Analyzers:",
    ...lines,
    "",
    'Use "mf-doctor analyze --analyzers <id>,<id>" to run specific analyzers.',
  ].join("\n");
}

program
  .name("mf-doctor")
  .description("Static analyzer for Module Federation setups")
  .version("0.0.0")
  .addHelpCommand("help [command]", "Display help for a command")
  .addHelpText("after", formatAnalyzersHelp);

program
  .command("analyze")
  .description("Analyze a Module Federation workspace")
  .argument("[path]", "Path to workspace root", ".")
  .option("-f, --format <format>", "Output format: pretty or json", "pretty")
  .option(
    "-a, --analyzers <ids>",
    "Comma-separated list of analyzer IDs to run",
  )
  .option(
    "--fail-on <severity>",
    "Exit with non-zero if findings at or above this severity exist (LOW, MEDIUM, HIGH)",
  )
  .option("--no-config", "Ignore mf-doctor.config.* file")
  .option("--no-ignore", "Ignore .mf-doctor-ignore.json file")
  .option(
    "-w, --workspace <file>",
    "Path to a .code-workspace file for polyrepo discovery",
  )
  .option("--pull", "Pull latest changes from git before analyzing")
  .option(
    "--host <name>",
    "Mark participant as host (for runtime-loaded remotes). Can be used multiple times.",
    (value: string, previous: string[]) => previous.concat([value]),
    [] as string[],
  )
  .option("--no-interactive", "Disable interactive fix prompts (useful for CI)")
  .action(async (path: string, options: AnalyzeOptions) => {
    try {
      const workspaceRoot = resolve(path);
      const format = options.format.toLowerCase();

      if (format !== "pretty" && format !== "json") {
        console.error(
          formatError(
            new Error(`Invalid format: ${format}. Use 'pretty' or 'json'.`),
          ),
        );
        process.exit(1);
      }

      const config =
        options.config === false
          ? {
              checks: {},
              severityThreshold: "HIGH" as FindingSeverity,
              ignore: [],
              hosts: [],
              configPath: null,
            }
          : await loadConfig(workspaceRoot);

      const hosts = mergeHosts(config.hosts, options.host ?? []);

      const ignoreConfig =
        options.ignore === false
          ? { entries: [], filePath: null }
          : loadIgnoreFile(workspaceRoot);

      let failOnSeverity: FindingSeverity;
      try {
        failOnSeverity = options.failOn
          ? parseSeverity(options.failOn)
          : config.severityThreshold;
      } catch (err) {
        console.error(
          formatError(err instanceof Error ? err : new Error(String(err))),
        );
        process.exit(1);
      }

      const allAnalyzerIds = analyzers.map((a) => a.id);
      let analyzerIds: string[] | undefined;

      if (options.analyzers) {
        analyzerIds = options.analyzers.split(",").map((id) => id.trim());
      } else {
        const enabledIds = getEnabledAnalyzerIds(config, allAnalyzerIds);
        if (enabledIds.length < allAnalyzerIds.length) {
          analyzerIds = enabledIds;
        }
      }

      const handlePullProgress = (result: PullResult): void => {
        const repoName = basename(result.path);
        if (result.success) {
          console.log(
            `${pc.green("✓")} ${pc.dim(repoName)}: ${result.message}`,
          );
        } else {
          console.log(
            `${pc.yellow("⚠")} ${pc.dim(repoName)}: ${result.message}`,
          );
        }
      };

      if (options.pull) {
        console.log(`\n${pc.cyan("Pulling latest changes...")}\n`);
      }

      const rawResult = await analyze(workspaceRoot, {
        analyzerIds,
        workspaceFile: options.workspace,
        pull: options.pull,
        onPullProgress: handlePullProgress,
        hosts,
      });

      const allFindings = rawResult.results.flatMap((r) => r.findings);
      const filterResult = applyIgnoreRules(allFindings, ignoreConfig);

      const filteredResults = rawResult.results.map((r) => ({
        ...r,
        findings: r.findings.filter((f) =>
          filterResult.findings.some(
            (ff) => ff.id === f.id && ff.message === f.message,
          ),
        ),
      }));

      const result: FullAnalysisResult & { ignoredCount: number } = {
        ...rawResult,
        results: filteredResults,
        totalFindings: filterResult.findings.length,
        findingsBySeverity: recalculateSeverityCounts(filterResult.findings),
        ignoredCount: filterResult.ignoredCount,
      };

      if (format === "json") {
        console.log(formatJson(result));
      } else {
        const configInfo: string[] = [];
        if (config.configPath) {
          configInfo.push(`config: ${config.configPath}`);
        }
        if (ignoreConfig.filePath) {
          configInfo.push(`ignore: ${ignoreConfig.filePath}`);
        }
        if (configInfo.length > 0) {
          console.log(`\n${pc.dim(`Using ${configInfo.join(", ")}`)}`);
        }
        console.log(formatPretty(result));

        if (
          shouldRunInteractive(options.interactive, format) &&
          hasFixableIssues(result)
        ) {
          await runInteractiveFix(result);
        }
      }

      const shouldFail = hasFailingSeverity(
        result.findingsBySeverity,
        failOnSeverity,
      );
      process.exit(shouldFail ? 1 : 0);
    } catch (error) {
      console.error(
        formatError(error instanceof Error ? error : new Error(String(error))),
      );
      process.exit(1);
    }
  });

type GraphOptions = {
  format: string;
  output?: string;
  workspace?: string;
  host?: string[];
};

program
  .command("graph")
  .description("Visualize the Module Federation dependency topology")
  .argument("[path]", "Path to workspace root", ".")
  .option("-f, --format <format>", "Output format: ascii or mermaid", "ascii")
  .option(
    "-o, --output <file>",
    "Output file path (required for mermaid, optional for ascii)",
  )
  .option(
    "-w, --workspace <file>",
    "Path to a .code-workspace file for polyrepo discovery",
  )
  .option(
    "--host <name>",
    "Mark participant as host (for runtime-loaded remotes). Can be used multiple times.",
    (value: string, previous: string[]) => previous.concat([value]),
    [] as string[],
  )
  .action(async (path: string, options: GraphOptions) => {
    try {
      const workspaceRoot = resolve(path);
      const format = options.format.toLowerCase();

      if (format !== "ascii" && format !== "mermaid") {
        console.error(
          formatError(
            new Error(`Invalid format: ${format}. Use 'ascii' or 'mermaid'.`),
          ),
        );
        process.exit(1);
      }

      if (format === "mermaid" && !options.output) {
        console.error(
          formatError(
            new Error(
              "Output file (-o, --output) is required for mermaid format.",
            ),
          ),
        );
        process.exit(1);
      }

      let graph = await getProjectGraph(workspaceRoot, options.workspace);

      if (options.host && options.host.length > 0) {
        const updatedParticipants = applyHostOverrides(
          graph.participants,
          options.host,
        );
        graph = { ...graph, participants: updatedParticipants };
      }

      let output: string;
      if (format === "mermaid") {
        output = generateMermaidGraph(graph);
      } else {
        const useColors = !options.output;
        output = generateAsciiGraph(graph, useColors);
      }

      if (options.output) {
        const outputPath = resolve(options.output);
        const outputDir = dirname(outputPath);

        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        writeFileSync(outputPath, output, "utf-8");
        console.log(`${pc.green("✓")} Graph saved to ${pc.cyan(outputPath)}`);
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error(
        formatError(error instanceof Error ? error : new Error(String(error))),
      );
      process.exit(1);
    }
  });

program.parse();
