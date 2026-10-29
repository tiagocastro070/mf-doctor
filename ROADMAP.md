# mf-doctor product roadmap (draft)

Status: proposal for maintainer review. Planning horizon starts after the 1.1.3 release and PR #3 (open, not merged, when this refresh was prepared on 2026-10-29). The supplied 2026-10-28 gap analysis is historical baseline evidence; delivered work below and current PR scope supersede it where noted. This is a prioritization proposal, not approval to merge or release roadmap items.

## Product and market scan

mf-doctor is a static, cross-project configuration analyzer. Its strongest potential position is to find integration risks across a host and its remotes before build/runtime, across bundlers and package boundaries, with portable CLI output. The gap analysis reports seven analyzers, rsbuild/rspack/webpack extraction, 339 tests and no public issue backlog. That means there is little direct public issue evidence; demand signals below are documented recurring failure modes and ecosystem coverage, not a claim of measured demand for mf-doctor.

| Alternative | What it covers | Gap/opportunity for mf-doctor |
|---|---|---|
| Official Module Federation diagnostics/debug | Runtime/build troubleshooting and debug logs; runtime troubleshooting calls out shared config, shareScope, singleton, strictVersion, requiredVersion, eager, and remote entry mismatches. [Debug mode](https://module-federation.io/guide/debug/mode), [runtime troubleshooting](https://module-federation.io/guide/troubleshooting/runtime) | Valuable after execution and within MF runtime context; mf-doctor can statically inspect multiple local projects and report before deploy. Complement, do not compete with runtime diagnosis. |
| `@module-federation/enhanced` | Official build/runtime plugins, CLI for federation types (`mf dts`), runtime plugin hooks for customizing remote loading, shared resolution, and recovery. [npm package/CLI](https://www.npmjs.com/package/%40module-federation/enhanced), [runtime plugins](https://module-federation.io/guide/runtime/runtime-plugins) | It owns federation implementation and runtime features rather than a general cross-repo lint policy. Static cross-app consistency and CI review output remain a distinct niche. |
| Nx Module Federation | Workspace generators, project graph, orchestration, affected builds and dependency version strategy. Current docs describe official plugin integration; Nx v24 removed its legacy MF wrappers. [Nx MF docs](https://nx.dev/docs/technologies/module-federation), [migration](https://nx.dev/docs/kb/migrate-from-nx-module-federation) | Strong for Nx workspace topology/task execution, but not a portable standalone analyzer across arbitrary repos/bundlers. Nx config extraction is a high-value mf-doctor coverage bet. |
| ESLint / bundler analyzers | ESLint is strongest for source-level rules; webpack and bundler tooling validate their own compilation/config domain. | No verified, broadly adopted cross-project Module Federation config analyzer surfaced in this scan. Verify this before positioning as a unique category. Avoid duplicating compiler diagnostics or source lint rules. |

## Delivered / already covered

- **1.1.3: trust fixes shipped.** `--version`, Node engines, package tarball and PR CI fixes reported shipped in 1.1.3. Do not re-plan these as v1.2 work.
- **PR #3 (open, not merged):** public core exports/types, per-check severity overrides, cycle default severity HIGH → MEDIUM, and fixes gated behind `--fix` with non-mutating default. This covers the core API, severity override foundation, and safe-default work if/when merged and released.
- **Example behavior:** keep `examples/rsbuild-basic` as an intentional findings fixture; it exits 1 by design. `examples/README.md` explains this and demonstrates filtering/output. Acceptance criteria below preserve this intent.

## Prioritised roadmap

Effort: S <= 1 week, M = 1–3 weeks, L = 3+ weeks for one maintainer including docs and compatibility. Demand evidence is explicitly labeled as proxy where no mf-doctor issue exists. Every item should land through a PR for user review; none of these items is approved for merge or release by this document.

| Priority / target | Item; type | Problem solved and demand evidence | Impact | Effort | Acceptance criteria |
|---|---|---|---|---|---|
| P0 / v1.2 | Nx workspace extractor (differentiator; new coverage) | Nx docs show MF topology and project graph are central to workspace operation; Nx migration to official plugins adds configuration variation. [Nx docs](https://nx.dev/docs/technologies/module-federation) | Covers high-value multi-app workspaces and catches cross-project issues. | M | Parse documented current Nx + official plugin patterns; map project roots/host/remotes; unsupported/dynamic forms yield actionable partial-coverage diagnostic; fixture tests. |
| P1 / v1.2 | Object remotes and federation config normalization (table stakes; coverage) | Ecosystem configs use object/array and newer manifest forms; official runtime troubleshooting calls out remote entry/global mismatches. [Runtime troubleshooting](https://module-federation.io/guide/troubleshooting/runtime) | Fewer false negatives and more accurate remote graph. | M | Normalize supported object and string remotes into same internal model; preserve current CLI/JSON fields; fixtures cover aliases, manifest entry and unsupported expressions. |
| P1 / v1.3 | SARIF output (table stakes for GitHub CI; new feature) | GitHub code scanning accepts SARIF; code-scanning results can annotate findings in pull requests. [GitHub SARIF upload](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning) | Native, actionable CI findings and annotations. | M | `--format sarif` emits valid SARIF 2.1.0; stable rule IDs, file/line where available, severity mapping; golden fixtures and documented upload workflow; existing JSON/text unchanged. |
| P1 / v1.3 | Stable JSON schema and finding locations (table stakes; fix/enabler) | Machine users need robust integrations; no public demand count available. | Makes CI and future editor integrations dependable. | M | Add schemaVersion, stable finding code and optional location; keep prior JSON fields and document additive compatibility; contract tests. |
| P2 / v1.3 | Baselines / changed-only mode (table stakes; new CI workflow) | Severity overrides are covered by PR #3; a baseline is still needed for teams adopting CI incrementally. | Lets teams adopt incrementally without suppressing new findings. | M | Baseline keyed to stable fingerprints; changed-only mode; deterministic output; unknown config keys reported; JSON compatibility maintained. |
| P2 / v1.4 | Vite extractor: official federation plugin first (differentiator; coverage) | Nx current template documents Vite with official Federation plugin, signaling active usage. [Nx introduction](https://nx.dev/docs/technologies/module-federation/introduction) | Extends reach beyond current webpack family. | M | Support documented `@module-federation/vite` config patterns; explicitly identify unsupported dynamic config; tests and guide. Evaluate OriginJS separately after real fixture validation. |
| P2 / v1.4 | Better static resolution of imports/constants (differentiator; accuracy) | Gap analysis identifies partial results when config values are imported or referenced by identifiers. | Reduces unhelpful unknowns without executing arbitrary user config. | L | Resolve bounded JSON/TS object literal and local constant/import cases; never execute project code; show provenance and unresolved reason; cycle/alias guard tests. |
| P3 / v2.0 | Rule packs / plugin API (differentiator; new platform) | A public core API can enable organization-specific policy; external plugin demand is unverified. | Enables extensibility without bloating built-in rules. | L | Versioned analyzer contract, isolated loading policy, deterministic output, compatibility docs and at least one maintained example plugin. Ship only after library/API adoption signal. |
| P3 / v2.0 | VS Code diagnostics or ESLint adapter (differentiator; new UX) | No verified issue/request volume. A stable core and locations are prerequisites; runtime plugins already handle runtime-specific behaviors. | Shorter feedback loop for teams if CLI adoption is established. | L | Separate optional package; diagnostics map to stable codes/locations; no mandatory editor/runtime dependencies; user study or adoption evidence before release. |

### Table stakes vs differentiators

Table stakes: trustworthy version/engine/package metadata, safe defaults (pending PR #3 merge/release), representative config coverage, stable machine output, CI-friendly SARIF, low-noise configurable findings. Differentiators: cross-project graph analysis across bundlers and Nx, explainable static resolution, and reusable policy API. Official runtime diagnostics and build plugins should remain complementary sources of context.

## Three bets for a solo maintainer

1. **Nx plus official-plugin config coverage:** strongest evidence-backed coverage bet for workspace topology; start with bounded patterns.
2. **SARIF plus stable finding IDs/locations:** turns existing findings into actionable GitHub CI annotations and unlocks integrations.
3. **One Vite extractor, official plugin first:** expands supported bundler reach using a documented Nx template signal; validate target-user demand before adding OriginJS.

## What to cut or defer

- Defer VS Code and ESLint adapters until the core API, stable IDs and locations exist and users ask for them; maintaining several integration surfaces is expensive.
- Defer runtime manifest comparison and production observability: it overlaps official runtime/debug tooling and expands scope beyond a static analyzer. Revisit only with concrete user demand.
- Do not build both OriginJS and official Vite extractors at once; validate one supported config family with fixtures first.
- Do not resolve arbitrary TypeScript by executing configs. Keep static analysis bounded and report uncertainty.
- Do not add many one-off rules before severity overrides and baseline support; rule count without noise control weakens adoption.
- Defer coverage gates and broad OS matrices if they slow core compatibility work; retain a small supported Node/OS CI matrix.
- No paid cloud service, hosted dashboard, telemetry requirement, proprietary license, or auto-editing by default under the stated constraints.

## Open questions to verify before scheduling

- Which Vite federation plugin is most common in target users' repos: official `@module-federation/vite`, OriginJS, or both? Nx documents an official-plugin Vite template, but mf-doctor usage data was not supplied.
- Is Nx extractor demand reflected in actual customer/maintainer requests? It is a competitor-coverage inference from Nx docs, not direct mf-doctor issue evidence.
- Is a `v2.0` plugin API worth maintaining? Gate on library/API adoption and outside contributions.
