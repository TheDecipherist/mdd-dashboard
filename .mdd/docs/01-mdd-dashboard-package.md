---
id: 01-mdd-dashboard-package
title: MDD Dashboard npm Package
edition: mdd-dashboard
depends_on: []
source_files:
  - src/cli.ts
  - src/server.ts
  - src/parser.ts
  - src/watcher.ts
  - src/cache.ts
  - src/graph.ts
  - src/git.ts
  - src/template.ts
  - bin/mdd-dashboard.js
routes:
  - GET /
  - GET /api/data
  - GET /api/doc/:id
  - GET /api/git/:id
  - GET /events
models: []
test_files:
  - tests/parser.test.ts
  - tests/cache.test.ts
  - tests/git.test.ts
  - tests/server.test.ts
data_flow: greenfield
last_synced: 2026-05-05
status: complete
phase: all
mdd_version: 1
tags: [cli, d3, sse, graph, frontmatter, git, nodejs, http-server]
path: Dashboard/Core Package
known_issues: []
---

# 01 — MDD Dashboard npm Package

## Purpose

`mdd-dashboard` is a globally-installable CLI tool (`npm install -g mdd-dashboard`) that launches a D3-powered interactive browser dashboard for any MDD project. It reads `.mdd/**/*.md` frontmatter via a three-tier loading strategy (startup → lazy body → async git), serves a self-contained HTML/D3 dashboard over a native Node.js HTTP server, and live-reloads via SSE on file change.

## Architecture

```
CLI invocation
  └─ cli.ts           argv parsing, .mdd/ check, orchestrate startup
       ├─ parser.ts   frontmatter-only read + graph build (Tier 1)
       ├─ server.ts   native http server (/, /api/data, /api/doc/:id, /api/git/:id, /events)
       ├─ cache.ts    three-tier in-process Maps (frontmatter + body + git)
       ├─ watcher.ts  fs.watch → 100ms debounce per-filepath → cache invalidation → SSE delta push
       ├─ graph.ts    NodeData/EdgeData types + edge inference (depends_on, initiative_wave, wave_feature)
       ├─ git.ts      async child_process git log/status (Tier 3 — non-blocking)
       └─ template.ts self-contained HTML/JS/CSS string (D3 v7 CDN, marked CDN)

bin/mdd-dashboard.js  CJS shim: checks Node >=20, calls dist/cli.js
```

**Three-tier loading:**
- **Tier 1** (startup, <200ms for 100 docs): glob all `.mdd/**/*.md` in parallel via `Promise.all`, read frontmatter only (stop at second `---`), build in-memory graph. All reads parallel — no sequential awaits.
- **Tier 2** (lazy, on-demand): browser clicks a node → GET `/api/doc/:id` → server reads that one file, renders body to HTML. `marked` is **dynamically imported** (`await import('marked')`) on the very first Tier 2 request only — not at startup — so it does not add to startup time.
- **Tier 3** (async background, non-blocking): spawned immediately after Tier 1 via `child_process`. Does not block server start or browser open. Enriches graph with git data, then pushes `SSE graph-reload`. Git filters in the UI are hidden/disabled until this completes.

## Data Model

No database. All data derives from `.mdd/**/*.md` files.

### NodeData
```typescript
{
  id: string                  // "15-mdd-waves" — frontmatter id
  filepath: string            // relative: "docs/15-mdd-waves.md"
  folder: "docs" | "initiatives" | "waves" | "ops"
  title: string
  type: "feature" | "task" | "initiative" | "wave" | "ops"
  status: string              // complete | in_progress | draft | deprecated | active | planned | cancelled
  depends_on: string[]
  initiative: string | null
  wave: string | null
  wave_status: string | null
  known_issues_count: number  // length of known_issues[] array from frontmatter
  last_synced: string
  mdd_version: number
  source_files: string[]
  routes: string[]
  edition: string
  git?: {
    lastCommitHash: string
    lastCommitDate: string      // ISO 8601
    lastCommitMessage: string
    lastCommitAuthor: string
    commitCount: number
    hasUncommittedChanges: boolean
  } | null                      // null until Tier 3 completes
}
```

### EdgeData
```typescript
{
  source: string              // node id
  target: string              // node id
  type: "depends_on" | "initiative_wave" | "wave_feature"
  broken: boolean             // true if target id not found in nodeMap
}
```

### GitCommit
```typescript
{
  hash: string                // full SHA
  shortHash: string           // first 7 chars of hash
  date: string                // ISO 8601 from git log %aI
  relativeDate: string        // computed server-side: "2 days ago", "3 weeks ago"
  message: string             // commit subject from %s
  author: string              // author name from %an
}
```

`relativeDate` is computed in `git.ts` from the ISO date at parse time. Buckets: seconds → "just now", <60m → "N minutes ago", <24h → "N hours ago", <7d → "N days ago", <30d → "N weeks ago", <365d → "N months ago", else → "N years ago".

### Cache Maps
```typescript
frontmatterCache: Map<filepath, { mtime: number, data: NodeData }>
bodyCache:        Map<docId, { mtime: number, html: string }>
gitCache:         Map<docId, { commits: GitCommit[], hasUncommittedChanges: boolean, loadedAt: number }>
graphCache:       { nodes: NodeData[], edges: EdgeData[] }  // rebuilt atomically when frontmatterCache changes
```

## API Endpoints

All routes served by native Node.js `http` module — no Express/Fastify.

| Method | Route | Content-Type | Response | Notes |
|--------|-------|--------------|----------|-------|
| GET | `/` | `text/html; charset=utf-8` | Self-contained dashboard HTML | From `template.ts` |
| GET | `/api/data` | `application/json` | `{ nodes: NodeData[], edges: EdgeData[] }` | Served from `graphCache` — no disk read |
| GET | `/api/doc/:id` | `application/json` | `{ html: string }` | Tier 2 lazy load + bodyCache; 404 `{ error: "doc not found" }` |
| GET | `/api/git/:id` | `application/json` | `{ commits: GitCommit[], hasUncommittedChanges: boolean }` | 404 `{ error: "git not available" }` or `{ error: "doc not found" }` |
| GET | `/events` | `text/event-stream` | SSE stream | `Connection: keep-alive; Cache-Control: no-cache` |

**All `/api/*` routes** include `Access-Control-Allow-Origin: *` response header.

## Business Rules

### Startup Sequence
1. Resolve target dir: `--path` flag → `path.resolve(cwd, value)`, else `process.cwd()`
2. Check for `.mdd/` via `fs.stat(path.join(projectDir, '.mdd'))` — if absent: `process.stderr.write("Error: no .mdd/ directory found. Is this an MDD project?\n")` + `process.exit(1)`
3. Run Tier 1: glob `.mdd/**/*.md` in parallel, parse frontmatter only, build graphCache
4. Scan ports 7321–7340 for first free port via `net.createServer().listen(port)`; if all taken: stderr + `exit(1)`
5. Start HTTP server; print `MDD Dashboard running at http://localhost:<port> — press Ctrl+C to stop`
6. Open browser via `open` package (unless `--no-open`)
7. Register `SIGINT`/`SIGTERM` handlers: close server cleanly, `exit(0)`
8. Kick off Tier 3 git loading asynchronously (non-blocking, does not await)

### CLI Flags (hand-rolled argv parsing — no commander/yargs)
| Flag | Behaviour |
|------|-----------|
| `--port <n>` | Override starting port; still validates it's free |
| `--no-open` | Skip browser launch (CI / remote environments) |
| `--path <dir>` | Explicit project directory instead of cwd |
| `--help` | Print usage to stdout, `exit(0)` |
| `--version` | Print package version from `package.json`, `exit(0)` |

### Path Handling (critical — must work on any setup)
- All paths normalised via `path.resolve()` and `path.join()` — never string concatenation
- `.mdd/` detection uses `path.join(projectDir, '.mdd')` + `fs.stat` — never `str.endsWith('.mdd')`
- `--path` argument resolved via `fs.realpath` (follows symlinks) then `path.resolve`
- Relative `--path` values resolved against `process.cwd()` before use
- Glob patterns use forward-slash separator internally; `path.sep` used only for display output
- Paths with spaces supported — no shell `exec` string interpolation; all `child_process.spawn` calls use array args

### File Watching
- `fs.watch(mddDir, { recursive: true })`
- **Debounce: 100ms per filepath** using `clearTimeout` + `setTimeout` keyed per filepath (not a global debounce — simultaneous edits to different files each get their own 100ms window)
- On debounce fire:
  1. `fs.stat` the file to get current mtime
  2. Compare against `frontmatterCache.get(filepath)?.mtime`
  3. mtime unchanged → ignore (handles editor save-without-change)
  4. mtime changed → re-parse frontmatter, update `frontmatterCache`, delete `bodyCache` and `gitCache` entries for this id, rebuild `graphCache` atomically, push SSE delta
- On file delete: remove from all three caches, rebuild `graphCache`, push `node-remove`
- On new file: parse frontmatter, add to `frontmatterCache`, rebuild `graphCache`, push `node-add`

SSE delta event types:
| Type | When | Payload |
|------|------|---------|
| `node-update` | Single file changed | `{ type, id, node: NodeData }` |
| `node-add` | New file detected | `{ type, node: NodeData }` |
| `node-remove` | File deleted | `{ type, id }` |
| `graph-reload` | Multiple simultaneous changes or Tier 3 complete | `{ type }` — client re-fetches `/api/data` |

### Edge Inference (graph.ts)
- `depends_on` edges: for each feature/task doc, one edge per id in `depends_on[]`
- `initiative_wave` edges: for each wave doc with `initiative` field → edge initiative→wave
- `wave_feature` edges: for each feature/task doc with `wave` field → edge wave→feature
- Broken edge: target id not found in nodeMap → `broken: true`; rendered red dashed in UI

### Git Integration (git.ts)
Spawned **after** Tier 1, non-blocking. All file spawns run in parallel via `Promise.all`.

**Per `.mdd/**/*.md` file:**
```
git log --follow --format="%H|%aI|%s|%an" --max-count=100 -- <filepath>
```
Parse each line as `GitCommit`: `hash | date | message | author`. `shortHash` = first 7 chars of `hash`. `relativeDate` computed from `date` at parse time.

**Uncommitted changes (once, not per file):**
```
git status --short .mdd/
```
Any filepath listed in output → `hasUncommittedChanges: true` for that doc's `gitCache` entry.

**On completion:** enrich `frontmatterCache` entries with git data, rebuild `graphCache`, push `{ type: "graph-reload" }` SSE event.

**If git binary missing or cwd is not a git repo:** catch the spawn error, set `gitAvailable = false`. No crash. Git section in Advanced Filter panel shows "Not a git repository — git filters unavailable".

### Package Configuration
```json
{
  "name": "mdd-dashboard",
  "version": "0.1.0",
  "type": "module",
  "bin": { "mdd-dashboard": "./bin/mdd-dashboard.js" },
  "files": ["bin/", "dist/"],
  "engines": { "node": ">=20.0.0" },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "marked": "^12.0.0",
    "open": "^10.0.0"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

TypeScript config: `strict: true`, `noUncheckedIndexedAccess: true`, `target: "ES2022"`, `module: "Node16"`, `moduleResolution: "Node16"`, `outDir: "dist/"`. `module: Node16` + `moduleResolution: Node16` is required for correct ESM resolution on Node 20 — using `NodeNext` or `CommonJS` will break the CLI.

### D3 Dashboard — Visual Specification

#### Color Palette
| Token | Value |
|-------|-------|
| Background / canvas | `#0d1117` |
| Toolbar | `#161b22` with `border-bottom: #30363d` |
| Detail panel | `#161b22` |
| Primary text | `#e6edf3` |
| Muted text | `#8b949e` |
| Status — complete | `#22c55e` |
| Status — in_progress | `#f59e0b` |
| Status — active | `#0ea5e9` |
| Status — planned | `#8b5cf6` |
| Status — draft | `#6b7280` |
| Status — deprecated | `#374151` |
| Status — cancelled | `#ef4444` |

#### Node Rendering (SVG)
| Type | Radius | Fill | Stroke | Notes |
|------|--------|------|--------|-------|
| Initiative | r=28 | by status | thick stroke | |
| Wave | r=22 | sky-blue status variants | normal | |
| Feature | r=16 | by status | normal | |
| Task | r=14 | slate | dashed | |
| Ops | r=14 | orange | normal | |

Label: `<text>` below circle, max 18 chars, truncate with `…`, white 11px.

**Node badges** (always rendered on top of the circle):
- **Known-issues badge**: red circle r=7, top-right of node, white count text — only shown when `known_issues_count > 0`
- **Uncommitted-changes badge**: amber dot, bottom-right of node — shown when `git.hasUncommittedChanges === true`
- **Broken-dependency ring**: dashed red ring drawn around the node itself if any of its edges have `broken: true` (in addition to the red dashed edges)

#### D3 Force Simulation
```
forceManyBody:  strength -500
forceLink:      distance 80 for initiative_wave + wave_feature edges
                distance 140 for depends_on edges
forceCenter:    cx, cy of SVG viewport
forceCollide:   radius: initiative=40, wave=30, feature/task=20, ops=20
alphaDecay:     0.028
```

#### Layout Toggle (Force ↔ Tree)
- **Force mode**: `d3.forceSimulation` (default)
- **Tree mode**: `d3.tree()` hierarchical — initiative at top, waves below, features below that. Nodes without any initiative/wave context are clustered in a separate "Unassigned" column on the right.

#### Edge Rendering & Directional Flow Animation

All edges are SVG `<path>` elements with curved `linkArc` (quadratic bezier, curvature offset 30). Arrowhead markers defined in `<defs>`, one per edge type + one for broken. Arrow at the **target** end.

**Base styles (static, no interaction):**
| Class | Stroke | Width | Opacity | Dash |
|-------|--------|-------|---------|------|
| `edge-depends_on` | `#4b5563` | 1.5 | 0.6 | 6 3 |
| `edge-hierarchy` (initiative_wave + wave_feature) | `#7c3aed` / `#0ea5e9` | 1.5 | 0.5 | 4 6 |
| `edge-broken` | `#ef4444` | 2 | 0.8 | 4 4 |

**CSS flow animation (GPU-accelerated, zero JS cost during simulation ticks):**
```css
@keyframes flowForward  { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
@keyframes flowBackward { from { stroke-dashoffset: 0;  } to { stroke-dashoffset: 24; } }

.edge-depends_on { stroke-dasharray: 6 3; animation: flowForward  1.2s linear infinite; }
.edge-hierarchy  { stroke-dasharray: 4 6; animation: flowForward  2.5s linear infinite; }
.edge-broken     { stroke-dasharray: 4 4; animation: flowForward  0.6s linear infinite; }
```

Direction semantics: dots flow A→B on `depends_on` (A reaches toward B), parent→child on hierarchy edges, fast urgent pulse on broken edges.

**Hover state (node hovered):**
- Connected edges (to or from hovered node): opacity 1.0, stroke-width +0.5, `animation-duration` halved (faster = more energetic)
- All other edges: opacity 0.04, `animation-play-state: paused`

**Selection state (node clicked):**
- Outgoing edges (selected node as source): `flowForward`, stroke brightened 30%, stroke-width 2
- Incoming edges (selected node as target): `flowBackward` (direction reversed), stroke shifted to complementary hue, stroke-width 2 — this visual distinction lets the user read "what this depends on" vs "what depends on this" at a glance
- Unrelated edges: opacity 0.03, `animation-play-state: paused`

**Accessibility:** "Pause animations" button in toolbar (keyboard shortcut `P`). When paused, all edges revert to static `stroke-dasharray`, no animation. Preference persisted in `localStorage` and restored on page reload.

#### Interactions
| Action | Behaviour |
|--------|-----------|
| Hover node | Tooltip: title, status, last_synced, known_issues count. Connected edges highlight; others fade to 0.04 |
| Click node | Detail panel opens. Node gets selected ring. Graph stays fully interactive. |
| Double-click node | D3 zoom transition (500ms) to fit node + its immediate neighbours in viewport |
| Click canvas (empty) | Deselect node, close detail panel |
| Drag node | Pin node: sets `fx`/`fy`, restarts simulation with `alphaTarget 0.3` |
| Click pinned node | Unpin: sets `fx = null`, `fy = null` |
| Scroll / pinch | `d3.zoom()` with `scaleExtent [0.1, 4]` |

#### Filter System — Three Tiers

Filters are AND-ed across tiers. A node is **visible** if it satisfies ALL active filters simultaneously. Invisible nodes are set to `opacity: 0.05` — they are **NOT removed** from the force layout (removing nodes causes the graph to jump). Edges where either endpoint is invisible: `opacity: 0.02`.

**Tier A — Toolbar (always visible, instant):**
- **Search**: substring match on `title` + `id`, case-insensitive. Non-matching nodes → opacity 0.05. Clear (×) button resets. Active matching nodes get white stroke highlight.
- **Type chips**: `All | Features | Tasks | Waves | Initiatives | Ops`. Multiple chips selected = **OR** within the type dimension; **AND** with every other active filter.
- **Status dropdown**: `All | Complete | In Progress | Draft | Deprecated | Active | Planned | Cancelled`
- **Advanced Filters button**: opens Tier B panel. Shows a count badge of active advanced filters (hidden when 0).
- **Layout toggle**: Force / Tree
- **Pause animations toggle** (keyboard: `P`)

**Active filter chips bar** (below toolbar, hidden when no filters active): each active filter rendered as a removable chip — e.g. `status: complete ×`, `has issues ×`, `author: tim ×`. "Clear all" button on the right. Clicking a chip removes only that filter.

**Tier B — Advanced Filter Panel** (slides down below toolbar, all fields default to "Any"/empty):
All Tier B fields are AND-ed with each other and with all Tier A filters.

| Field | Control | Logic |
|-------|---------|-------|
| Edition | multi-select dropdown (dynamically populated) | OR within field |
| Initiative | select (dynamic) | exact match |
| Wave | select (dynamic) | exact match |
| Wave status | chips: Any / Planned / Active / Complete | exact match |
| Known issues | radio: Any / Has issues / No issues | boolean |
| Last synced after | date input (ISO, browser native) | `>=` |
| Last synced before | date input | `<=` |
| MDD version | number input | exact match |
| Has dependencies | radio: Any / Has depends_on / No depends_on | boolean |
| Source file path | text input | substring match against any item in `source_files[]` |
| Route contains | text input | substring match against any item in `routes[]` |

Panel header has "Clear advanced filters" link + close button.

**Tier C — Git Filters** (inside Tier B panel, below a "— Git —" divider):
Hidden and disabled until Tier 3 git loading completes. If not a git repo: shows "Not a git repository — git filters unavailable" in muted text. All Tier C filters are AND-ed with Tier A + B.

| Field | Control | Logic |
|-------|---------|-------|
| Changed in last N commits | button group: `5 \| 10 \| 25 \| 50 \| All` | node appears in last N commits across all docs |
| Modified since | date input (ISO) | `lastCommitDate >=` value |
| Author | select (dynamically populated from all authors in gitCache) | exact match |
| Has uncommitted changes | toggle chip | `hasUncommittedChanges === true` |

#### Mini-map
Fixed 160×120px SVG overlay, bottom-right corner. Background: `#0d1117` at opacity 0.85, border: `#30363d`. Shows all nodes as tiny dots (same status color as main graph) scaled to fit the bounding box. Blue-outline viewport rectangle is **draggable** — dragging it pans the main canvas. Hidden when node count < 10.

#### Live Reload (SSE Client)
```javascript
const evtSource = new EventSource('/events')
evtSource.onmessage = (e) => { /* dispatch by type */ }
```

| SSE event type | Client action |
|---------------|---------------|
| `node-update` | Find node by id, update its data in-place, re-bind D3, animate transition |
| `node-add` | Push to nodes array, restart simulation |
| `node-remove` | Splice from nodes + edges arrays, restart simulation |
| `graph-reload` | `fetch('/api/data')`, replace full graph, re-render — **preserve zoom state + pinned node positions by id** |

On SSE connection error: browser `EventSource` auto-reconnects (built-in retry). **Live indicator**: pulsing green dot in toolbar when connected; gray dot + "reconnecting..." text when disconnected.

#### Detail Panel
Right panel, 340px wide, slides in/out via CSS `transform` transition 300ms ease.

- **Header**: `<h2>` title, type badge, status badge, amber "modified" badge (shown only if `git.hasUncommittedChanges`)
- **Meta row**: `last_synced | mdd_version v<n> | edition`
- **Known issues**: red collapsible list — shown only when `known_issues_count > 0`
- **Depends on**: list of linked node ids as clickable chips — clicking a chip centers the graph on that node with a 500ms zoom transition and selects it
- **Source files**: monospace list
- **Git section** (shown only when git data is available for this node):
  - Last commit: `<relativeDate> — "<message>" by <author> [<shortHash>]`
  - Commit count: `N commits to this file`
  - **[View history]** button: fetches `/api/git/:id`, expands an inline scrollable commit list
- **Body**: full markdown rendered to HTML (fetched from `/api/doc/:id` on panel open, skeleton spinner while loading, cached in a client-side `Map<id, html>` for the session duration)

### Error Handling
| Condition | Behaviour |
|-----------|-----------|
| `.mdd/` not found at startup | `stderr "Error: no .mdd/ directory found. Is this an MDD project?"` + `exit(1)` |
| Malformed frontmatter | Warn to stderr, create error node: `{ title: "Parse error: <filename>", type: "error" }` |
| Broken `depends_on` ref | Edge flagged `broken: true`, rendered red dashed; node gets broken-dependency ring |
| Port scan exhausted (7321–7340) | `stderr "No free port found in range 7321-7340"` + `exit(1)` |
| Browser open fails | Log URL to stdout, do not crash server |
| File read error in watcher | Log to stderr, skip cache update for that file |
| `/api/doc/:id` not found | `404 { error: "doc not found" }` |
| `/api/git/:id`, git unavailable | `404 { error: "git not available" }` |
| `/api/git/:id`, doc not found | `404 { error: "doc not found" }` |
| git binary missing | `gitAvailable = false`; git filters hidden; no crash |
| Non-git directory | `gitAvailable = false`; git filters show explanatory message; no crash |
| Unhandled promise rejection | `process.on('unhandledRejection', (err) => { console.error(err); process.exit(1); })` in `cli.ts` |

## Data Flow

Greenfield — no existing code analysed.

## Completion Artifact — README.md

When Phase 7 is complete and all tests pass, generate `README.md` in the project root. It must cover:

### Required sections

**Header**: package name, one-line description, Node >=20 badge, npm version badge.

**Install & quick start**
```
npm install -g mdd-dashboard
cd ~/projects/my-mdd-project
mdd-dashboard
```
And the `npx` equivalent.

**CLI usage** — full flag reference table (`--port`, `--no-open`, `--path`, `--help`, `--version`) with a one-line description and example for each.

**Dashboard features** — bullet-point tour of what the user sees: force/tree layout toggle, three-tier filter system (toolbar → advanced panel → git filters), directional edge flow animations, live SSE reload, detail panel with body + git history, mini-map.

**Performance** — explain the three-tier loading model (frontmatter only at startup → lazy body → async git) and the <200ms startup goal, so users understand why the graph appears instantly even on large projects.

**Requirements** — Node >=20.0.0; works with any MDD project (any directory containing a `.mdd/` subdirectory).

**Development** (for contributors):
```
pnpm install
pnpm dev          # runs via tsx, no build step
pnpm build        # tsc → dist/
pnpm typecheck    # no-emit type check
pnpm test         # vitest
```

**Error reference** — short table of the CLI exit codes and messages a user might encounter (`.mdd/ not found`, port exhausted, etc.).

**License**.

### Tone and style
- Written for a developer who has never heard of MDD — no jargon without explanation
- Code blocks for every command; no prose-only instructions
- Keep it under 200 lines; link to `.mdd/docs/` for deeper architecture detail

## Dependencies

None. This is a standalone npm package (`gray-matter`, `marked`, `open` are runtime dependencies; no MDD project features to depend on).

## Known Issues

(none — new feature)
