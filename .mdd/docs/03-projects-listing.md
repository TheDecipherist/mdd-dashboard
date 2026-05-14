---
id: 03-projects-listing
title: Projects Listing — Interactive Terminal Project Picker
edition: mdd-dashboard
depends_on: [01-mdd-dashboard-package]
source_files:
  - src/picker.ts
  - src/cli.ts
routes: []
models: []
test_files:
  - src/picker.test.ts
data_flow: greenfield
last_synced: 2026-05-14
status: complete
phase: all
mdd_version: 1.3.1
tags: [cli, terminal, picker, readline, chalk, projects, interactive, ux, navigation]
known_issues: []
---

# 03 — Projects Listing: Interactive Terminal Project Picker

## Purpose

When `mdd-dashboard` is run from a directory that is a direct child of `~/projects` (or a custom root set via `--projects-root`), and `--path` was not specified, the CLI presents an interactive terminal picker listing all MDD-valid projects in that root. The user navigates with arrow keys and confirms with Enter, which opens the dashboard for the selected project. This eliminates the need to `cd` or pass `--path` manually.

## Architecture

The picker is a standalone module (`src/picker.ts`) with no external dependencies — it uses Node's built-in `readline` module for raw keypress detection and writes directly to `process.stdout` for rendering. It is invoked inside `main()` in `src/cli.ts` as the fallback when `--path` is not given and the CWD heuristic matches.

```
main() in cli.ts
  │
  ├─ args.projectDir given → use it directly (picker skipped)
  │
  └─ args.projectDir null
       │
       ├─ detectProjectsRoot(cwd, projectsRoot) → null → use cwd
       │
       └─ root found
            │
            ├─ listMddProjects(root) → [] → warn + use cwd
            ├─ listMddProjects(root) → [single] → use it directly (no UI)
            └─ listMddProjects(root) → [multiple] → showPicker(projects, defaultProject) → selected path
```

## Data Model

No database. The picker reads the filesystem:

| Source | Description |
|--------|-------------|
| `projectsRoot` | Resolved path of `~/projects` or `--projects-root` value |
| `projects[]` | Subdirectories of `projectsRoot` that contain a `.mdd/` directory |
| `defaultProject` | The entry whose name matches the CWD basename (pre-selected cursor) |

## API Endpoints

None — this is a pure CLI/terminal feature.

## Business Rules

1. **Trigger condition:** `--path` not given AND `process.cwd()` is a direct child of the resolved projects root (depth = 1 level).
2. **Projects root resolution order:**
   - `--projects-root <dir>` CLI flag (explicit override)
   - `~/projects` (default)
3. **Listing filter:** Only subdirectories containing a `.mdd/` subdirectory are shown.
4. **Default cursor:** The project whose basename equals `path.basename(process.cwd())`. If none match, cursor starts at the first entry.
5. **Single result:** Show no UI — use the one found project directly and print a one-line notice.
6. **No results:** Print a warning, fall back to `process.cwd()`. Existing `.mdd/` check in `main()` will still gate validity.
7. **`~/projects` missing:** Silently fall through to `process.cwd()` — no error.
8. **Ctrl+C during picker:** Call `process.exit(0)` cleanly.
9. **Terminal not interactive (`!process.stdin.isTTY`):** Skip picker, use `process.cwd()`.

## UI Design

```
Select a project  (↑ ↓ to move, Enter to open, Ctrl-C to exit)

  ○  another-project
  ●  mdd-dashboard          ← cursor (cyan + bold)
  ○  third-project
```

**Color scheme (chalk):**
- Header line: `chalk.gray` dim text
- Cursor row: `chalk.cyan.bold('●')` + `chalk.cyan.bold(name)`
- Non-selected: `chalk.dim('○')` + `chalk.white(name)`
- One-project notice: `chalk.green('✔')` + `chalk.white` text
- Fallback warnings: `chalk.yellow('⚠')`

Rendered inline; ANSI cursor movement clears and redraws on each keypress. Restores terminal state on exit.

## Data Flow

Greenfield — no existing data was analyzed. The picker's output (`selectedPath: string`) replaces the `process.cwd()` assignment at `cli.ts:106` and then flows into the unchanged remainder of `main()`.

## Dependencies

- `01-mdd-dashboard-package` — the CLI entry point (`src/cli.ts`) where the picker is integrated.

## Known Issues

(none — new feature)
