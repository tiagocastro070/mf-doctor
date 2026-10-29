# Examples

These workspaces are fixtures for the analyzer, not starter templates.

## `rsbuild-basic`

**Intentionally contains findings.** It exists to show what `mf-doctor` reports,
so a default run exits with code `1`:

- `remote-a` pins `react@18.2.0` and `react-dom@18.2.0` while the shell and the
  other remotes use `^18.3.1` → version drift (`HIGH`).
- `remote-c` consumes `shell` while `shell` consumes `remote-b` and `remote-b`
  consumes `remote-c` → a three-participant cycle (`MEDIUM`).
- `date-fns` is used by three participants and shared by none → missing shared
  dependency (`MEDIUM`).

Useful commands:

```bash
# See the full report and exit 1
node dist/cli/index.js analyze examples/rsbuild-basic

# Only fail the run on HIGH findings
node dist/cli/index.js analyze examples/rsbuild-basic --fail-on HIGH

# Machine-readable output
node dist/cli/index.js analyze examples/rsbuild-basic --format json

# Print the topology
node dist/cli/index.js graph examples/rsbuild-basic
```

## `webpack-basic`

Same idea for the webpack extractor: a small shell plus remotes, used by the
extractor tests.
