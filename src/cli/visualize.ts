import pc from "picocolors";
import type { ProjectGraph, FederationParticipant } from "../core/types.js";

import {
  getHostParticipants,
  getRemoteParticipants,
} from "../core/projectGraph.js";

/**
 * Escapes special characters for Mermaid labels.
 */
function escapeMermaidLabel(text: string): string {
  return text
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Creates a safe node ID for Mermaid (no spaces or special chars).
 */
function toNodeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Generates an ASCII art representation of the Module Federation topology.
 *
 * @param graph - The project graph to visualize
 * @param useColors - Whether to use terminal colors (default: true)
 * @returns ASCII art string
 */
export function generateAsciiGraph(
  graph: ProjectGraph,
  useColors: boolean = true,
): string {
  const lines: string[] = [];
  const c = useColors
    ? pc
    : {
        bold: (s: string) => s,
        dim: (s: string) => s,
        magenta: (s: string) => s,
        cyan: (s: string) => s,
        yellow: (s: string) => s,
        green: (s: string) => s,
      };

  lines.push(c.bold("Module Federation Topology"));
  lines.push(c.dim("═".repeat(50)));
  lines.push("");

  if (graph.participants.length === 0) {
    lines.push(c.dim("No federation participants found."));
    return lines.join("\n");
  }

  const hosts = getHostParticipants(graph);
  const remotes = getRemoteParticipants(graph);

  const edgesByHost = new Map<string, Array<{ to: string; key: string }>>();
  for (const edge of graph.edges) {
    if (!edgesByHost.has(edge.from)) {
      edgesByHost.set(edge.from, []);
    }
    edgesByHost.get(edge.from)!.push({ to: edge.to, key: edge.remoteKey });
  }

  const participantsByName = new Map<string, FederationParticipant>();
  for (const p of graph.participants) {
    participantsByName.set(p.name, p);
  }

  const formatBox = (
    participant: FederationParticipant,
    role: "host" | "remote",
  ): string[] => {
    const boxLines: string[] = [];
    const roleLabel = role === "host" ? c.magenta("HOST") : c.cyan("REMOTE");
    const name = c.bold(participant.name);
    const bundler = c.dim(`[${participant.bundler}]`);

    const exposes = Object.keys(participant.federationConfig.exposes);
    const remoteKeys = Object.keys(participant.federationConfig.remotes);

    const contentLines: string[] = [];
    contentLines.push(`${name} ${roleLabel} ${bundler}`);

    if (exposes.length > 0) {
      const exposesStr =
        exposes.length <= 3
          ? exposes.join(", ")
          : `${exposes.slice(0, 3).join(", ")} +${exposes.length - 3} more`;
      contentLines.push(`${c.dim("exposes:")} ${exposesStr}`);
    }

    if (remoteKeys.length > 0) {
      const remotesStr =
        remoteKeys.length <= 3
          ? remoteKeys.join(", ")
          : `${remoteKeys.slice(0, 3).join(", ")} +${remoteKeys.length - 3} more`;
      contentLines.push(`${c.dim("consumes:")} ${remotesStr}`);
    } else if (participant.runtimeRemotes) {
      contentLines.push(
        `${c.dim("consumes:")} ${c.yellow("runtime-resolved")}`,
      );
    }

    const maxLen = Math.max(...contentLines.map((l) => stripAnsi(l).length));
    const boxWidth = Math.max(maxLen + 4, 30);

    boxLines.push(`┌${"─".repeat(boxWidth - 2)}┐`);
    for (const line of contentLines) {
      const padding = boxWidth - 4 - stripAnsi(line).length;
      boxLines.push(`│ ${line}${" ".repeat(Math.max(0, padding))} │`);
    }
    boxLines.push(`└${"─".repeat(boxWidth - 2)}┘`);

    return boxLines;
  };

  if (hosts.length > 0) {
    lines.push(c.bold("Hosts / Shells"));
    lines.push(c.dim("─".repeat(30)));

    for (const host of hosts) {
      const boxLines = formatBox(host, "host");
      for (const line of boxLines) {
        lines.push(`  ${line}`);
      }

      const edges = edgesByHost.get(host.name) ?? [];
      if (edges.length > 0) {
        lines.push(`  ${c.dim("│")}`);
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          const isLast = i === edges.length - 1;
          const prefix = isLast ? "└" : "├";
          lines.push(
            `  ${c.dim(prefix + "──▶")} ${c.cyan(edge.to)} ${c.dim(`as ${edge.key}`)}`,
          );
        }
      } else if (host.runtimeRemotes) {
        lines.push(`  ${c.dim("│")}`);
        lines.push(
          `  ${c.dim("└──▶")} ${c.yellow("remotes loaded at runtime (edges unknown)")}`,
        );
      }
      lines.push("");
    }
  }

  const standaloneRemotes = remotes.filter(
    (r) => !hosts.some((h) => h.name === r.name),
  );

  if (standaloneRemotes.length > 0) {
    lines.push(c.bold("Remotes"));
    lines.push(c.dim("─".repeat(30)));

    for (const remote of standaloneRemotes) {
      const boxLines = formatBox(remote, "remote");
      for (const line of boxLines) {
        lines.push(`  ${line}`);
      }

      const dependents = graph.edges
        .filter((e) => e.to === remote.name)
        .map((e) => e.from);

      if (dependents.length > 0) {
        lines.push(
          `  ${c.dim("consumed by:")} ${dependents.map((d) => c.magenta(d)).join(", ")}`,
        );
      }
      lines.push("");
    }
  }

  const orphans = graph.participants.filter(
    (p) =>
      !hosts.some((h) => h.name === p.name) &&
      !standaloneRemotes.some((r) => r.name === p.name),
  );

  if (orphans.length > 0) {
    lines.push(c.bold("Other Participants"));
    lines.push(c.dim("─".repeat(30)));

    for (const orphan of orphans) {
      lines.push(
        `  ${c.dim("○")} ${orphan.name} ${c.dim(`[${orphan.bundler}]`)}`,
      );
    }
    lines.push("");
  }

  lines.push(c.dim("─".repeat(50)));
  lines.push(
    `${c.dim("Total:")} ${graph.participants.length} participants, ${graph.edges.length} edges`,
  );

  return lines.join("\n");
}

/**
 * Generates a Mermaid flowchart representation of the Module Federation topology.
 *
 * @param graph - The project graph to visualize
 * @returns Mermaid diagram string
 */
export function generateMermaidGraph(graph: ProjectGraph): string {
  const lines: string[] = [];

  lines.push("```mermaid");
  lines.push("flowchart TD");

  if (graph.participants.length === 0) {
    lines.push("    empty[No federation participants found]");
    lines.push("```");
    return lines.join("\n");
  }

  const hosts = getHostParticipants(graph);
  const remotes = getRemoteParticipants(graph);

  const hostNames = new Set(hosts.map((h) => h.name));
  const remoteOnlyParticipants = remotes.filter((r) => !hostNames.has(r.name));

  const otherParticipants = graph.participants.filter(
    (p) =>
      !hostNames.has(p.name) &&
      !remoteOnlyParticipants.some((r) => r.name === p.name),
  );

  if (hosts.length > 0) {
    lines.push("    subgraph hosts [Hosts / Shells]");
    for (const host of hosts) {
      const nodeId = toNodeId(host.name);
      const remoteKeys = Object.keys(host.federationConfig.remotes);
      let label = `${escapeMermaidLabel(host.name)}`;
      label += `<br/>${host.bundler}`;
      if (remoteKeys.length > 0) {
        const remotesStr =
          remoteKeys.length <= 2
            ? remoteKeys.join(", ")
            : `${remoteKeys.length} remotes`;
        label += `<br/>consumes: ${escapeMermaidLabel(remotesStr)}`;
      } else if (host.runtimeRemotes) {
        label += `<br/>consumes: runtime`;
      }
      lines.push(`        ${nodeId}["${label}"]`);
    }
    lines.push("    end");
  }

  if (remoteOnlyParticipants.length > 0) {
    lines.push("    subgraph remotes [Remotes]");
    for (const remote of remoteOnlyParticipants) {
      const nodeId = toNodeId(remote.name);
      const exposes = Object.keys(remote.federationConfig.exposes);
      let label = `${escapeMermaidLabel(remote.name)}`;
      label += `<br/>${remote.bundler}`;
      if (exposes.length > 0) {
        const exposesStr =
          exposes.length <= 2
            ? exposes.join(", ")
            : `${exposes.length} modules`;
        label += `<br/>exposes: ${escapeMermaidLabel(exposesStr)}`;
      }
      lines.push(`        ${nodeId}["${label}"]`);
    }
    lines.push("    end");
  }

  if (otherParticipants.length > 0) {
    lines.push("    subgraph other [Other Participants]");
    for (const participant of otherParticipants) {
      const nodeId = toNodeId(participant.name);
      const label = `${escapeMermaidLabel(participant.name)}<br/>${participant.bundler}`;
      lines.push(`        ${nodeId}["${label}"]`);
    }
    lines.push("    end");
  }

  for (const edge of graph.edges) {
    const fromId = toNodeId(edge.from);
    const toId = toNodeId(edge.to);
    const label = escapeMermaidLabel(edge.remoteKey);
    lines.push(`    ${fromId} -->|"${label}"| ${toId}`);
  }

  lines.push("```");

  return lines.join("\n");
}

/**
 * Strips ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}
