# MFDOC

Static analyzer for Module Federation setups. Discovers federation participants, extracts config, and runs checks to catch version drift, shared-config mismatches, and other issues before they hit production.

---

## Quick start

```bash
npx mfdoc analyze .
```

Analyze another path: `npx mfdoc analyze path/to/workspace`

**Requirements:** Node.js 18+

---

## Installation

| Method                           | Command                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Project dependency (recommended) | `npm install -D mfdoc`                                                                    |
| One-off run                      | `npx mfdoc analyze .`                                                                     |
| From source                      | `npm install` → `npm run build` → `node dist/cli/index.js analyze examples/rsbuild-basic` |

---

## What it does

- **Discovers** federation participants (shell + remotes) in the workspace
- **Extracts** Module Federation config from bundler configs (rsbuild, rspack, webpack)
- **Runs analyzers** and reports:
  - React version drift (uses resolved versions from lockfile when present for accuracy)
  - Shared config mismatches
  - Missing shared dependencies
  - Duplicate expose names
  - Orphan exposes
  - Circular dependencies
  - Shared dependency candidates
- **Output:** human-friendly CLI and/or JSON for CI

### Design

- **Bundler-agnostic core** — Core works on a normalized config representation; rsbuild/rspack/webpack support is via extractors.
- **Static, best-effort parsing** — Config files are parsed as TS/JS; highly dynamic configs are flagged as partially analyzable.
- **Composable analyzers** — Each check is a pure function; easy to extend.

---

## Problems it addresses

- **Version drift** — Shell and remotes on different React (or other shared) versions → duplicated bundles, hook issues, subtle bugs. When a lockfile (`package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`) is present, version drift and the shared-deps matrix use resolved versions for greater accuracy.
- **Inconsistent shared config** — Same package with different `singleton`, `requiredVersion`, or `eager` across participants → unpredictable resolution. Incompatible `requiredVersion` ranges (no overlapping version) are reported as HIGH; different but compatible ranges as MEDIUM.
- **Low visibility** — Hard to see which apps participate, what they expose, and who consumes whom.
- **Config opacity** — Values hidden behind helpers, spreads, or env logic; “dev server starts” is not a guarantee.

---

## CLI

### Options

| Option                          | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| `-f, --format <pretty\|json>`   | Output style (default: `pretty`)                                   |
| `-a, --analyzers <ids>`         | Comma-separated analyzer IDs to run (default: all)                 |
| `-w, --workspace <file>`        | Path to `.code-workspace` for polyrepo discovery                   |
| `--fail-on <LOW\|MEDIUM\|HIGH>` | Exit non-zero when findings meet/exceed severity (default: `HIGH`) |
| `--host <name>`                 | Mark participant as host (runtime-loaded remotes). Repeatable.     |
| `--no-config`                   | Ignore `mfdoc.config.*`                                            |
| `--no-ignore`                   | Ignore `.mfdoc-ignore.json`                                        |

### Analyzer IDs

`react-version-drift`, `shared-config-mismatch`, `shared-dependency-candidate`, `missing-shared`, `duplicate-expose-name`, `orphan-expose`, `circular-dependency`

Example: `mfdoc analyze . -a react-version-drift,shared-config-mismatch`

---

## Configuration

Optional: `mfdoc.config.ts` (or `.mts` / `.js` / `.mjs` / `.cjs`) in the workspace root.

```ts
export default {
  severityThreshold: "MEDIUM",
  checks: {
    "react-version-drift": { enabled: true },
    "shared-config-mismatch": { enabled: true },
  },
  ignore: ["apps/legacy/**"],
  hosts: ["shell-ui"],
};
```

---

## Ignoring findings

`.mfdoc-ignore.json` in the workspace root:

```json
{
  "ignoreFindings": [
    {
      "id": "react-version-drift",
      "participants": ["remote-b"],
      "reason": "Aligned in next sprint"
    }
  ]
}
```

---

## Polyrepo / multi-root workspaces

For setups where shell and remotes live in separate repos, use a VS Code / Cursor `.code-workspace` file:

```bash
mfdoc analyze --workspace ./my-federation.code-workspace
```

Example workspace:

```json
{
  "folders": [
    { "path": "/Users/dev/gitlab/org/shell-app" },
    { "path": "/Users/dev/gitlab/org/team-a/remote-dashboard" },
    { "path": "/Users/dev/gitlab/org/team-b/remote-checkout" }
  ]
}
```

Each folder is scanned for bundler configs; nested `workspaces` in a folder’s `package.json` are also discovered.

---

## Runtime-loaded remotes (host override)

When remotes are loaded at runtime (e.g. from env or a manifest), the build-time `remotes` may be empty. Mark hosts explicitly:

**CLI:** `mfdoc analyze . --host shell-ui --host admin-shell`  
**Config:** `hosts: ["shell-ui", "admin-shell"]`

CLI and config hosts are merged.

- In output: participant is labeled `HOST (runtime remotes)`; dependency graph shows “remotes loaded at runtime (edges unknown)”.
- In JSON: participant has `hostOverride: true` and `runtimeRemotes: true`.
- Analyzers that depend on host–remote edges may be less accurate for these setups.

---

## CI

- JSON: `mfdoc analyze --format json --fail-on MEDIUM | jq`
- Exit code `0` when no findings at or above the threshold (after ignores); otherwise `1`.

---

## License

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.
