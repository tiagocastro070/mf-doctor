import { existsSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import type {
  FullAnalysisResult,
  Finding,
  FederationParticipant,
  ProjectGraph,
  FindingSeverity,
} from "../core/types.js";

/**
 * Supported package managers.
 */
export type PackageManager = "npm" | "yarn" | "pnpm";

/**
 * Detects the package manager used in the workspace.
 */
export function detectPackageManager(workspaceRoot: string): PackageManager {
  if (existsSync(join(workspaceRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(workspaceRoot, "yarn.lock"))) {
    return "yarn";
  }
  return "npm";
}

/**
 * Generates the install command for a package manager.
 */
export function getInstallCommand(
  pm: PackageManager,
  packages: string[],
): string {
  const pkgList = packages.join(" ");
  switch (pm) {
    case "pnpm":
      return `pnpm add ${pkgList}`;
    case "yarn":
      return `yarn add ${pkgList}`;
    default:
      return `npm install ${pkgList}`;
  }
}

/**
 * Formats the analysis result as JSON.
 */
export function formatJson(
  result: FullAnalysisResult & { ignoredCount?: number },
): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Severity icons and styling.
 */
const SEVERITY_CONFIG = {
  HIGH: { icon: "●", color: pc.red, bgColor: pc.bgRed, label: "HIGH" },
  MEDIUM: { icon: "◐", color: pc.yellow, bgColor: pc.bgYellow, label: "MED" },
  LOW: { icon: "○", color: pc.blue, bgColor: pc.bgBlue, label: "LOW" },
} as const;

/**
 * Formats a severity badge with icon.
 */
function formatSeverityBadge(severity: Finding["severity"]): string {
  const config = SEVERITY_CONFIG[severity];
  return config.color(`${config.icon} ${config.label}`);
}

/**
 * Formats a single finding with improved layout.
 */
function formatFinding(finding: Finding): string {
  const lines: string[] = [];
  const config = SEVERITY_CONFIG[finding.severity];

  lines.push(`    ${formatSeverityBadge(finding.severity)}`);
  lines.push(`    ${config.color("│")} ${finding.message}`);

  if (finding.participants.length > 0) {
    const participantList = finding.participants
      .map((p) => pc.cyan(p))
      .join(pc.dim(", "));
    lines.push(
      `    ${config.color("│")} ${pc.dim("Affects:")} ${participantList}`,
    );
  }

  if (finding.suggestions && finding.suggestions.length > 0) {
    lines.push(`    ${config.color("│")}`);
    lines.push(`    ${config.color("╰")} ${pc.dim("Fix:")}`);
    for (const suggestion of finding.suggestions) {
      lines.push(`      ${pc.dim("→")} ${suggestion}`);
    }
  } else {
    lines.push(`    ${config.color("╰")}${pc.dim("─".repeat(40))}`);
  }

  return lines.join("\n");
}

/**
 * Determines the role of a participant (host or remote).
 */
function getParticipantRole(participant: FederationParticipant): {
  role: "host" | "remote";
  isRuntimeRemotes: boolean;
} {
  const hasStaticRemotes =
    Object.keys(participant.federationConfig.remotes).length > 0;

  if (hasStaticRemotes || participant.hostOverride) {
    return {
      role: "host",
      isRuntimeRemotes: participant.runtimeRemotes ?? false,
    };
  }

  return {
    role: "remote",
    isRuntimeRemotes: false,
  };
}

/**
 * Formats participant info in a compact card style.
 */
function formatParticipant(participant: FederationParticipant): string {
  const lines: string[] = [];
  const config = participant.federationConfig;

  const statusIcon =
    participant.parseStatus === "complete" ? pc.green("●") : pc.yellow("◐");

  const { role, isRuntimeRemotes } = getParticipantRole(participant);
  let roleBadge = role === "host" ? pc.magenta("HOST") : pc.cyan("REMOTE");
  if (isRuntimeRemotes) {
    roleBadge += pc.dim(" (runtime remotes)");
  }

  lines.push(
    `  ${statusIcon} ${pc.bold(participant.name)} ${pc.dim(
      "·",
    )} ${roleBadge} ${pc.dim(`[${participant.bundler}]`)}`,
  );

  const details: string[] = [];

  if (config.name) {
    details.push(`${pc.dim("name:")} ${config.name}`);
  }

  const exposesCount = Object.keys(config.exposes).length;
  const remotesCount = Object.keys(config.remotes).length;
  const sharedCount = Object.keys(config.shared).length;

  if (exposesCount > 0) {
    details.push(
      `${pc.dim("exposes:")} ${Object.keys(config.exposes).join(", ")}`,
    );
  }

  if (remotesCount > 0) {
    details.push(
      `${pc.dim("consumes:")} ${Object.keys(config.remotes).join(", ")}`,
    );
  } else if (isRuntimeRemotes) {
    details.push(`${pc.dim("consumes:")} ${pc.yellow("runtime-resolved")}`);
  }

  details.push(`${pc.dim("shared:")} ${sharedCount}`);

  lines.push(`    ${details.join(pc.dim(" · "))}`);

  if (participant.parseWarnings && participant.parseWarnings.length > 0) {
    lines.push(
      `    ${pc.yellow("⚠")} ${
        participant.parseWarnings.length
      } parse warning(s)`,
    );
  }

  return lines.join("\n");
}

/**
 * Formats the graph edges as a visual tree.
 */
function formatEdges(graph: ProjectGraph): string {
  const lines: string[] = [];

  const edgesByHost = new Map<string, Array<{ to: string; key: string }>>();

  for (const edge of graph.edges) {
    if (!edgesByHost.has(edge.from)) {
      edgesByHost.set(edge.from, []);
    }
    edgesByHost.get(edge.from)!.push({ to: edge.to, key: edge.remoteKey });
  }

  for (const [host, remotes] of edgesByHost) {
    lines.push(`  ${pc.magenta("◆")} ${pc.bold(host)}`);
    remotes.forEach((remote, idx) => {
      const isLast = idx === remotes.length - 1;
      const prefix = isLast ? "└" : "├";
      lines.push(
        `    ${pc.dim(prefix + "──")} ${pc.cyan(remote.to)} ${pc.dim(
          `as ${remote.key}`,
        )}`,
      );
    });
  }

  const runtimeHosts = graph.participants.filter(
    (p) => p.runtimeRemotes && !edgesByHost.has(p.name),
  );

  for (const host of runtimeHosts) {
    lines.push(`  ${pc.magenta("◆")} ${pc.bold(host.name)}`);
    lines.push(
      `    ${pc.dim("└──")} ${pc.yellow(
        "remotes loaded at runtime (edges unknown)",
      )}`,
    );
  }

  if (lines.length === 0) {
    return `  ${pc.dim("No remote dependencies")}`;
  }

  return lines.join("\n");
}

/**
 * Extended result type that includes ignored count.
 */
export type ExtendedResult = FullAnalysisResult & { ignoredCount?: number };

/**
 * Formats the summary header with stats.
 */
function formatSummaryHeader(result: ExtendedResult): string {
  const lines: string[] = [];

  const highCount = result.findingsBySeverity.HIGH;
  const mediumCount = result.findingsBySeverity.MEDIUM;
  const lowCount = result.findingsBySeverity.LOW;
  const ignoredCount = result.ignoredCount ?? 0;

  if (result.totalFindings === 0 && ignoredCount === 0) {
    lines.push(`  ${pc.green("✓")} ${pc.bold(pc.green("All checks passed!"))}`);
    return lines.join("\n");
  }

  if (result.totalFindings === 0 && ignoredCount > 0) {
    lines.push(
      `  ${pc.green("✓")} ${pc.bold(pc.green("All checks passed!"))} ${pc.dim(
        `(${ignoredCount} ignored)`,
      )}`,
    );
    return lines.join("\n");
  }

  const badges: string[] = [];
  if (highCount > 0) {
    badges.push(pc.red(`● ${highCount} HIGH`));
  }
  if (mediumCount > 0) {
    badges.push(pc.yellow(`◐ ${mediumCount} MED`));
  }
  if (lowCount > 0) {
    badges.push(pc.blue(`○ ${lowCount} LOW`));
  }
  if (ignoredCount > 0) {
    badges.push(pc.dim(`⊘ ${ignoredCount} ignored`));
  }

  lines.push(`  ${badges.join(pc.dim("  ·  "))}`);

  return lines.join("\n");
}

/**
 * Creates a section header.
 */
function sectionHeader(emoji: string, title: string): string {
  return `${pc.bold(`${emoji} ${title}`)}`;
}

/**
 * Creates a horizontal divider.
 */
function divider(): string {
  return pc.dim("─".repeat(50));
}

/**
 * Shared config info for a participant.
 */
type ParticipantSharedInfo = {
  version: string | null;
  singleton: boolean | undefined;
  eager: boolean | undefined;
};

/**
 * Collects all shared package names across all participants.
 */
function getAllSharedPackages(graph: ProjectGraph): Set<string> {
  const packages = new Set<string>();
  for (const participant of graph.participants) {
    for (const pkgName of Object.keys(participant.federationConfig.shared)) {
      packages.add(pkgName);
    }
  }
  return packages;
}

/**
 * Normalizes a version string for display.
 */
function normalizeVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, "").trim();
}

function getEffectiveVersion(
  participant: FederationParticipant,
  packageName: string,
): string | null {
  const resolved = participant.resolvedDependencies?.[packageName];
  if (resolved) return resolved;
  const declared = participant.dependencies[packageName] ?? null;
  return declared ? normalizeVersion(declared) : null;
}

/**
 * Gets shared config info for a package from a participant.
 */
function getSharedInfo(
  participant: FederationParticipant,
  packageName: string,
): ParticipantSharedInfo {
  const sharedEntry = participant.federationConfig.shared[packageName];
  const depVersion = getEffectiveVersion(participant, packageName);

  if (!sharedEntry) {
    return {
      version: depVersion,
      singleton: undefined,
      eager: undefined,
    };
  }

  if (typeof sharedEntry === "string") {
    return {
      version: depVersion,
      singleton: undefined,
      eager: undefined,
    };
  }

  return {
    version: depVersion,
    singleton: sharedEntry.singleton,
    eager: sharedEntry.eager,
  };
}

/**
 * Pads a string to a fixed width.
 */
function padEnd(str: string, width: number): string {
  const visibleLength = str.replace(/\x1b\[[0-9;]*m/g, "").length;
  const padding = Math.max(0, width - visibleLength);
  return str + " ".repeat(padding);
}

/**
 * Pads a string to center it within a fixed width.
 */
function padCenter(str: string, width: number): string {
  const visibleLength = str.replace(/\x1b\[[0-9;]*m/g, "").length;
  const totalPadding = Math.max(0, width - visibleLength);
  const leftPad = Math.floor(totalPadding / 2);
  const rightPad = totalPadding - leftPad;
  return " ".repeat(leftPad) + str + " ".repeat(rightPad);
}

/**
 * Checks if a shared package has any issues.
 */
function getPackageIssues(graph: ProjectGraph, packageName: string): string[] {
  const issues: string[] = [];
  const versions = new Set<string>();
  const singletonValues = new Set<boolean>();
  let hasPackageCount = 0;

  for (const participant of graph.participants) {
    const info = getSharedInfo(participant, packageName);
    if (info.version) {
      versions.add(info.version);
    }
    if (participant.federationConfig.shared[packageName] !== undefined) {
      hasPackageCount++;
      if (info.singleton !== undefined) {
        singletonValues.add(info.singleton);
      }
    }
  }

  if (versions.size > 1) {
    issues.push("version drift");
  }
  if (singletonValues.size > 1) {
    issues.push("singleton mismatch");
  }
  if (hasPackageCount > 0 && hasPackageCount < graph.participants.length) {
    issues.push("not shared by all");
  }

  return issues;
}

/**
 * Formats the shared dependencies matrix table.
 */
function formatSharedDependencies(graph: ProjectGraph): string {
  const lines: string[] = [];
  const sharedPackages = getAllSharedPackages(graph);

  if (sharedPackages.size === 0) {
    lines.push(`  ${pc.dim("No shared dependencies configured")}`);
    return lines.join("\n");
  }

  const maxNameLength = Math.max(
    ...graph.participants.map((p) => p.name.length),
    11,
  );
  const colWidths = {
    participant: Math.min(maxNameLength + 2, 28),
    version: 10,
    singleton: 9,
    eager: 7,
  };

  for (const packageName of Array.from(sharedPackages).sort()) {
    lines.push(`  ${pc.bold(packageName)}`);

    const headerRow =
      pc.dim("  ┌") +
      pc.dim("─".repeat(colWidths.participant)) +
      pc.dim("┬") +
      pc.dim("─".repeat(colWidths.version)) +
      pc.dim("┬") +
      pc.dim("─".repeat(colWidths.singleton)) +
      pc.dim("┬") +
      pc.dim("─".repeat(colWidths.eager)) +
      pc.dim("┐");
    lines.push(headerRow);

    const headerLabels =
      pc.dim("  │") +
      padEnd(" Participant", colWidths.participant) +
      pc.dim("│") +
      padCenter("Version", colWidths.version) +
      pc.dim("│") +
      padCenter("singleton", colWidths.singleton) +
      pc.dim("│") +
      padCenter("eager", colWidths.eager) +
      pc.dim("│");
    lines.push(headerLabels);

    const separatorRow =
      pc.dim("  ├") +
      pc.dim("─".repeat(colWidths.participant)) +
      pc.dim("┼") +
      pc.dim("─".repeat(colWidths.version)) +
      pc.dim("┼") +
      pc.dim("─".repeat(colWidths.singleton)) +
      pc.dim("┼") +
      pc.dim("─".repeat(colWidths.eager)) +
      pc.dim("┤");
    lines.push(separatorRow);

    const allVersions = new Set<string>();
    for (const participant of graph.participants) {
      const info = getSharedInfo(participant, packageName);
      if (info.version) {
        allVersions.add(info.version);
      }
    }
    const hasVersionDrift = allVersions.size > 1;

    for (const participant of graph.participants) {
      const info = getSharedInfo(participant, packageName);
      const hasShared =
        participant.federationConfig.shared[packageName] !== undefined;

      let versionStr = info.version ?? pc.dim("-");
      if (hasVersionDrift && info.version) {
        versionStr = pc.yellow(info.version);
      }

      let singletonStr: string;
      if (!hasShared) {
        singletonStr = pc.dim("-");
      } else if (info.singleton === true) {
        singletonStr = pc.green("true");
      } else if (info.singleton === false) {
        singletonStr = pc.red("false");
      } else {
        singletonStr = pc.dim("-");
      }

      let eagerStr: string;
      if (!hasShared) {
        eagerStr = pc.dim("-");
      } else if (info.eager === true) {
        eagerStr = "true";
      } else if (info.eager === false) {
        eagerStr = "false";
      } else {
        eagerStr = pc.dim("-");
      }

      const participantName =
        participant.name.length > colWidths.participant - 2
          ? participant.name.slice(0, colWidths.participant - 4) + "…"
          : participant.name;

      const row =
        pc.dim("  │") +
        padEnd(" " + participantName, colWidths.participant) +
        pc.dim("│") +
        padCenter(versionStr, colWidths.version) +
        pc.dim("│") +
        padCenter(singletonStr, colWidths.singleton) +
        pc.dim("│") +
        padCenter(eagerStr, colWidths.eager) +
        pc.dim("│");
      lines.push(row);
    }

    const footerRow =
      pc.dim("  └") +
      pc.dim("─".repeat(colWidths.participant)) +
      pc.dim("┴") +
      pc.dim("─".repeat(colWidths.version)) +
      pc.dim("┴") +
      pc.dim("─".repeat(colWidths.singleton)) +
      pc.dim("┴") +
      pc.dim("─".repeat(colWidths.eager)) +
      pc.dim("┘");
    lines.push(footerRow);

    const issues = getPackageIssues(graph, packageName);
    if (issues.length > 0) {
      lines.push(
        `  ${pc.yellow("⚠")} ${pc.dim("Issues:")} ${issues.join(", ")}`,
      );
    } else {
      lines.push(`  ${pc.green("✓")} ${pc.dim("No issues")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Action item for a participant.
 */
export type ActionItem = {
  severity: FindingSeverity;
  description: string;
  command?: string;
};

/**
 * Collects action items per participant from findings.
 */
export function collectActionItems(
  result: ExtendedResult,
  pm: PackageManager,
): Map<string, ActionItem[]> {
  const actionsByParticipant = new Map<string, ActionItem[]>();

  for (const participant of result.graph.participants) {
    actionsByParticipant.set(participant.name, []);
  }

  for (const analyzerResult of result.results) {
    for (const finding of analyzerResult.findings) {
      const details = finding.details as Record<string, unknown> | undefined;

      if (finding.id === "react-version-drift" && details) {
        const packageName = details.package as string;
        const versions = details.versions as Record<string, string[]>;

        const allVersions = Object.keys(versions).sort();
        if (allVersions.length <= 1) continue;

        const versionCounts = Object.entries(versions).map(
          ([v, participants]) => ({
            version: v,
            count: participants.length,
          }),
        );
        versionCounts.sort((a, b) => b.count - a.count);
        const majorityVersion = versionCounts[0].version;

        for (const [version, participants] of Object.entries(versions)) {
          if (version !== majorityVersion) {
            for (const participantName of participants) {
              const actions = actionsByParticipant.get(participantName);
              if (actions) {
                actions.push({
                  severity: finding.severity,
                  description: `${packageName} ${version} → ${majorityVersion}`,
                  command: getInstallCommand(pm, [
                    `${packageName}@^${majorityVersion}`,
                  ]),
                });
              }
            }
          }
        }
      }

      if (finding.id === "shared-config-mismatch" && details) {
        const packageName = details.package as string;
        const property = details.property as string;

        if (property === "singleton") {
          const falseParticipants = details.singletonFalse as
            | string[]
            | undefined;
          if (falseParticipants) {
            for (const participantName of falseParticipants) {
              const actions = actionsByParticipant.get(participantName);
              if (actions) {
                actions.push({
                  severity: finding.severity,
                  description: `Set singleton: true for ${packageName}`,
                });
              }
            }
          }
        }

        if (property === "requiredVersion") {
          const versions = details.versions as
            | Record<string, string>
            | undefined;
          const incompatibleRanges = details.incompatibleRanges === true;
          if (versions) {
            if (incompatibleRanges) {
              for (const participantName of Object.keys(versions)) {
                const actions = actionsByParticipant.get(participantName);
                if (actions) {
                  actions.push({
                    severity: finding.severity,
                    description: `Align requiredVersion for ${packageName} so ranges overlap`,
                  });
                }
              }
            } else {
              const versionList = Object.values(versions);
              const versionCounts = new Map<string, number>();
              for (const v of versionList) {
                versionCounts.set(v, (versionCounts.get(v) ?? 0) + 1);
              }
              let majorityVersion = versionList[0];
              let maxCount = 0;
              for (const [v, count] of versionCounts) {
                if (count > maxCount) {
                  maxCount = count;
                  majorityVersion = v;
                }
              }

              for (const [participantName, version] of Object.entries(
                versions,
              )) {
                if (version !== majorityVersion) {
                  const actions = actionsByParticipant.get(participantName);
                  if (actions) {
                    actions.push({
                      severity: finding.severity,
                      description: `Update requiredVersion for ${packageName}: ${version} → ${majorityVersion}`,
                    });
                  }
                }
              }
            }
          }
        }

        if (property === "eager") {
          continue;
        }

        const notSharedBy = details.notSharedBy as string[] | undefined;
        if (notSharedBy) {
          for (const participantName of notSharedBy) {
            const actions = actionsByParticipant.get(participantName);
            if (actions) {
              actions.push({
                severity: finding.severity,
                description: `Add ${packageName} to shared config`,
              });
            }
          }
        }
      }
    }
  }

  return actionsByParticipant;
}

/**
 * Formats the action items by project section.
 */
function formatActionItems(result: ExtendedResult, pm: PackageManager): string {
  const lines: string[] = [];
  const actionsByParticipant = collectActionItems(result, pm);

  const isHost = (p: FederationParticipant) =>
    Object.keys(p.federationConfig.remotes).length > 0 || p.hostOverride;

  const sortedParticipants = [...result.graph.participants].sort((a, b) => {
    const aActions = actionsByParticipant.get(a.name)?.length ?? 0;
    const bActions = actionsByParticipant.get(b.name)?.length ?? 0;
    if (aActions !== bActions) return bActions - aActions;
    if (isHost(a) && !isHost(b)) return -1;
    if (!isHost(a) && isHost(b)) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const participant of sortedParticipants) {
    const actions = actionsByParticipant.get(participant.name) ?? [];
    const uniqueActions = actions.filter(
      (action, index, self) =>
        index === self.findIndex((a) => a.description === action.description),
    );

    const participantIsHost = isHost(participant);

    if (uniqueActions.length === 0) {
      if (participantIsHost) {
        lines.push(`  ${pc.bold(participant.name)}`);
        lines.push(`  └── ${pc.green("✓")} Reference participant (host)`);
      } else {
        lines.push(`  ${pc.bold(participant.name)}`);
        lines.push(`  └── ${pc.green("✓")} No changes needed`);
      }
    } else {
      const issueWord = uniqueActions.length === 1 ? "issue" : "issues";
      lines.push(
        `  ${pc.bold(participant.name)} ${pc.dim(
          `(${uniqueActions.length} ${issueWord})`,
        )}`,
      );
      lines.push(`  │`);

      uniqueActions.forEach((action, idx) => {
        const isLast = idx === uniqueActions.length - 1;
        const prefix = isLast ? "└" : "├";
        const continuePrefix = isLast ? " " : "│";

        const severityIcon = SEVERITY_CONFIG[action.severity].icon;
        const severityColor = SEVERITY_CONFIG[action.severity].color;

        lines.push(
          `  ${prefix}── ${severityColor(severityIcon)} ${action.description}`,
        );
        if (action.command) {
          lines.push(`  ${continuePrefix}   ${pc.dim(action.command)}`);
        }
      });
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Formats the analysis result as pretty human-readable output.
 */
export function formatPretty(result: ExtendedResult): string {
  const lines: string[] = [];
  const pm = detectPackageManager(result.graph.workspaceRoot);

  lines.push("");
  lines.push(pc.bold(pc.cyan("┌" + "─".repeat(48) + "┐")));
  lines.push(
    pc.bold(pc.cyan("│")) +
      pc.bold("        mf-doctor · Module Federation Analyzer      ") +
      pc.bold(pc.cyan("│")),
  );
  lines.push(pc.bold(pc.cyan("└" + "─".repeat(48) + "┘")));
  lines.push("");

  lines.push(sectionHeader("📦", "WORKSPACE"));
  lines.push(`  ${pc.dim("Path:")} ${result.graph.workspaceRoot}`);
  lines.push(
    `  ${pc.dim("Stats:")} ${result.graph.participants.length} participants · ${
      result.graph.edges.length
    } dependencies`,
  );
  lines.push("");

  lines.push(divider());
  lines.push("");

  lines.push(sectionHeader("🔧", "PARTICIPANTS"));
  lines.push("");
  for (const participant of result.graph.participants) {
    lines.push(formatParticipant(participant));
  }
  lines.push("");

  lines.push(divider());
  lines.push("");

  lines.push(sectionHeader("🔗", "DEPENDENCY GRAPH"));
  lines.push("");
  lines.push(formatEdges(result.graph));
  lines.push("");

  lines.push(divider());
  lines.push("");

  lines.push(sectionHeader("📊", "SHARED DEPENDENCIES"));
  lines.push("");
  lines.push(formatSharedDependencies(result.graph));

  lines.push(divider());
  lines.push("");

  lines.push(sectionHeader("🔍", "ANALYSIS RESULTS"));
  lines.push("");
  lines.push(formatSummaryHeader(result));
  lines.push("");

  if (result.totalFindings > 0) {
    for (const analyzerResult of result.results) {
      if (analyzerResult.findings.length === 0) continue;

      const analyzerName = analyzerResult.analyzerId
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");

      lines.push(`  ${pc.bold(pc.underline(analyzerName))}`);
      lines.push("");

      for (const finding of analyzerResult.findings) {
        lines.push(formatFinding(finding));
        lines.push("");
      }
    }

    lines.push(divider());
    lines.push("");

    lines.push(sectionHeader("🛠 ", "ACTION ITEMS BY PROJECT"));
    lines.push("");
    lines.push(formatActionItems(result, pm));
  }

  lines.push(divider());
  lines.push("");
  lines.push(pc.dim(`Completed in ${result.totalDurationMs.toFixed(0)}ms`));
  lines.push("");

  return lines.join("\n");
}

/**
 * Formats an error message for CLI output.
 */
export function formatError(error: Error): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`${pc.red("✖")} ${pc.bold(pc.red("Error"))} ${error.message}`);
  lines.push("");

  return lines.join("\n");
}
