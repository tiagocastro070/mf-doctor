import { execSync } from "node:child_process";
import { confirm, select } from "@inquirer/prompts";
import pc from "picocolors";
import type { FederationParticipant } from "../core/types.js";
import type {
  ActionItem,
  ExtendedResult,
  PackageManager,
} from "./formatters.js";
import { collectActionItems, detectPackageManager } from "./formatters.js";

/**
 * A fixable action item with additional metadata for execution.
 */
type FixableAction = {
  participantName: string;
  projectRoot: string;
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  severity: ActionItem["severity"];
};

/**
 * Extracts fixable version bump actions from action items.
 * Only version bumps (with commands) are considered fixable.
 */
function extractFixableActions(
  result: ExtendedResult,
  pm: PackageManager,
): Map<string, FixableAction[]> {
  const actionsByParticipant = collectActionItems(result, pm);
  const fixableByParticipant = new Map<string, FixableAction[]>();

  const participantMap = new Map<string, FederationParticipant>();
  for (const p of result.graph.participants) {
    participantMap.set(p.name, p);
  }

  for (const [participantName, actions] of actionsByParticipant) {
    const participant = participantMap.get(participantName);
    if (!participant) continue;

    const fixableActions: FixableAction[] = [];

    for (const action of actions) {
      if (!action.command) continue;

      const versionMatch = action.description.match(/^(.+?) (\S+) → (\S+)$/);
      if (versionMatch) {
        const [, packageName, currentVersion, targetVersion] = versionMatch;
        fixableActions.push({
          participantName,
          projectRoot: participant.projectRoot,
          packageName,
          currentVersion,
          targetVersion,
          severity: action.severity,
        });
      }
    }

    if (fixableActions.length > 0) {
      fixableByParticipant.set(participantName, fixableActions);
    }
  }

  return fixableByParticipant;
}

/**
 * Generates the install command for approved packages.
 */
function buildInstallCommand(
  pm: PackageManager,
  packages: Array<{ name: string; version: string }>,
): string {
  const pkgSpecs = packages.map((p) => `${p.name}@^${p.version}`).join(" ");

  switch (pm) {
    case "pnpm":
      return `pnpm add ${pkgSpecs}`;
    case "yarn":
      return `yarn add ${pkgSpecs}`;
    default:
      return `npm install ${pkgSpecs}`;
  }
}

/**
 * Executes an install command in a specific directory.
 */
function executeInstall(
  command: string,
  cwd: string,
): { success: boolean; error?: string } {
  try {
    execSync(command, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message.split("\n")[0] };
  }
}

/**
 * Prompt response types.
 */
type PromptResponse = "yes" | "no" | "all" | "skip";

/**
 * Prompts user for a single fix action.
 */
async function promptForFix(
  action: FixableAction,
  allowAll: boolean,
): Promise<PromptResponse> {
  const choices: Array<{ name: string; value: PromptResponse }> = [
    { name: "Yes", value: "yes" },
    { name: "No", value: "no" },
  ];

  if (allowAll) {
    choices.push({ name: "Yes to all remaining", value: "all" });
    choices.push({ name: "Skip remaining", value: "skip" });
  }

  const response = await select({
    message: `Update ${pc.cyan(action.packageName)} ${pc.dim(action.currentVersion)} → ${pc.green(action.targetVersion)}?`,
    choices,
    default: "yes",
  });

  return response;
}

/**
 * Summary of fixes applied.
 */
type FixSummary = {
  participantsUpdated: number;
  packagesChanged: number;
  errors: Array<{ participant: string; error: string }>;
};

/**
 * Runs the interactive fix flow.
 *
 * @param result - The analysis result
 * @returns Summary of fixes applied, or null if user declined
 */
export async function runInteractiveFix(
  result: ExtendedResult,
): Promise<FixSummary | null> {
  const pm = detectPackageManager(result.graph.workspaceRoot);
  const fixableByParticipant = extractFixableActions(result, pm);

  if (fixableByParticipant.size === 0) {
    return null;
  }

  const totalFixable = Array.from(fixableByParticipant.values()).reduce(
    (sum, actions) => sum + actions.length,
    0,
  );

  console.log("");
  console.log(pc.dim("─".repeat(50)));
  console.log("");

  const shouldFix = await confirm({
    message: `Fix ${totalFixable} version issue${totalFixable > 1 ? "s" : ""} interactively?`,
    default: true,
  });

  if (!shouldFix) {
    return null;
  }

  console.log("");

  const summary: FixSummary = {
    participantsUpdated: 0,
    packagesChanged: 0,
    errors: [],
  };

  let skipAll = false;
  let approveAll = false;

  for (const [participantName, actions] of fixableByParticipant) {
    if (skipAll) break;

    console.log(pc.bold(participantName) + ":");

    const approvedPackages: Array<{ name: string; version: string }> = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      if (skipAll) break;

      if (approveAll) {
        approvedPackages.push({
          name: action.packageName,
          version: action.targetVersion,
        });
        console.log(
          `  ${pc.green("✓")} ${action.packageName} ${pc.dim(action.currentVersion)} → ${pc.green(action.targetVersion)}`,
        );
        continue;
      }

      const allowAllOptions =
        i < actions.length - 1 ||
        Array.from(fixableByParticipant.keys()).indexOf(participantName) <
          fixableByParticipant.size - 1;

      const response = await promptForFix(action, allowAllOptions);

      switch (response) {
        case "yes":
          approvedPackages.push({
            name: action.packageName,
            version: action.targetVersion,
          });
          break;
        case "no":
          console.log(`  ${pc.dim("○")} Skipped ${action.packageName}`);
          break;
        case "all":
          approveAll = true;
          approvedPackages.push({
            name: action.packageName,
            version: action.targetVersion,
          });
          break;
        case "skip":
          skipAll = true;
          break;
      }
    }

    if (approvedPackages.length > 0) {
      const projectRoot = actions[0].projectRoot;
      const command = buildInstallCommand(pm, approvedPackages);

      console.log("");
      console.log(`  ${pc.dim("Running:")} ${pc.dim(command)}`);

      const result = executeInstall(command, projectRoot);

      if (result.success) {
        console.log(
          `  ${pc.green("✓")} Updated ${approvedPackages.length} package${approvedPackages.length > 1 ? "s" : ""}`,
        );
        summary.participantsUpdated++;
        summary.packagesChanged += approvedPackages.length;
      } else {
        console.log(`  ${pc.red("✗")} Failed: ${result.error}`);
        summary.errors.push({
          participant: participantName,
          error: result.error ?? "Unknown error",
        });
      }
    }

    console.log("");
  }

  console.log(pc.dim("─".repeat(50)));
  console.log("");

  if (summary.participantsUpdated > 0 || summary.errors.length > 0) {
    const parts: string[] = [];
    if (summary.participantsUpdated > 0) {
      parts.push(
        `${pc.green(summary.participantsUpdated)} participant${summary.participantsUpdated > 1 ? "s" : ""} updated`,
      );
      parts.push(
        `${pc.green(summary.packagesChanged)} package${summary.packagesChanged > 1 ? "s" : ""} changed`,
      );
    }
    if (summary.errors.length > 0) {
      parts.push(
        `${pc.red(summary.errors.length)} error${summary.errors.length > 1 ? "s" : ""}`,
      );
    }
    console.log(parts.join(", ") + ".");
    console.log("");
  }

  return summary;
}

/**
 * Checks if interactive mode should be enabled.
 *
 * @param isInteractiveFlag - Value of --no-interactive flag (false = disabled)
 * @param format - Output format (json disables interactive)
 * @returns true if interactive mode should run
 */
export function shouldRunInteractive(
  isInteractiveFlag: boolean,
  format: string,
): boolean {
  if (!isInteractiveFlag) {
    return false;
  }

  if (format === "json") {
    return false;
  }

  if (!process.stdout.isTTY) {
    return false;
  }

  return true;
}

/**
 * Checks if there are any fixable issues.
 */
export function hasFixableIssues(result: ExtendedResult): boolean {
  const pm = detectPackageManager(result.graph.workspaceRoot);
  const fixableByParticipant = extractFixableActions(result, pm);
  return fixableByParticipant.size > 0;
}
