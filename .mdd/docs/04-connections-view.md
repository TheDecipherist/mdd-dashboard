---
id: 04-connections-view
title: Connections View — Primary Dashboard View Mode
area: Dashboard > View Modes > Connections
edition: mdd-dashboard
depends_on: [01-mdd-dashboard-package, 02-doc-viewer, 03-projects-listing]
source_files:
  - src/connections-parser.ts
  - src/server.ts
  - src/template.ts
routes:
  - GET /api/connections
models: []
test_files:
  - tests/connections-parser.test.ts
data_flow: greenfield
last_synced: 2026-05-14
status: complete
phase: all
mdd_version: 1
tags: [dashboard, view-mode, connections, path-tree, dependency-graph, ux, canvas, area]
known_issues: []
---

# 04 — Connections View — Primary Dashboard View Mode

## Purpose

Large MDD projects (50+ docs) are nearly impossible to understand in the current force/tree graph because of overlapping nodes and visual noise. The Connections view parses each project's `.mdd/connections.md` file — which is pre-computed by the MDD system and encodes the project's area taxonomy, dependency graph, and source file overlap — and renders it as a beautiful, immediately-readable canvas: a collapsible path tree on the left, and a clean card-based dependency graph on the main canvas with visual source-overlap indicators. This view becomes the default landing view whenever `connections.md` is present.

## Architecture

```
Boot
 └── fetch /api/connections
       ├── 200 OK → ConnectionsData → set viewMode='connections' → render Connections view
       └── 404   → viewMode='graph' (existing behaviour, no change)

Connections view layout:
 ┌─────────────────────────────────────────────────────────┐
 │  [toolbar: View: Connections ↔ Graph]  [Layout] [Fit]   │
 ├──────────────┬──────────────────────────────────────────┤
 │  PATH TREE   │         DEPENDENCY CANVAS                │
 │  (240px)     │                                          │
 │  Dashboard/  │   ┌────────────┐   ┌────────────┐       │
 │  ├ Core ●    │   │ 01 Core    │   │ 02 Viewer  │       │
 │  ├ Viewer ○  │   │ complete   │ ← │ draft      │       │
 │  └ Picker ●  │   └────────────┘   └────────────┘       │
 │              │         ↑                                │
 │              │   ┌────────────┐                         │
 │              │   │ 03 Picker  │                         │
 │              │   │ complete   │                         │
 │              │   └────────────┘                         │
 └──────────────┴──────────────────────────────────────────┘

Source overlap — not a table:
  - Each card has a small badge: "⚡ 2 shared files"
  - Hover card → dotted highlight edges appear to all docs sharing source files
  - No separate panel needed — overlap lives in the canvas interaction layer
```

**Key global state added to template.ts:**
```javascript
let viewMode = 'graph';          // 'graph' | 'connections'
let connectionsData = null;      // ConnectionsData | null
```

## Data Model

### `/api/connections` response — `ConnectionsData`

```typescript
interface ConnectionsData {
  generated: string;           // ISO date — shown as staleness indicator
  docCount: number;
  connectionCount: number;
  overlapCount: number;
  pathTree: PathNode[];        // nested area tree for left sidebar
  nodes: DepNode[];            // parsed from mermaid block
  edges: DepEdge[];            // parsed from mermaid block
  sourceOverlap: OverlapEntry[];
  warnings: string[];
}

interface PathNode {
  label: string;               // area name (branch) or doc title (leaf)
  id?: string;                 // present on leaf nodes only (doc id)
  status?: string;             // present on leaf nodes only
  children?: PathNode[];       // present on branch nodes only
}

interface DepNode {
  id: string;                  // e.g. "N01" (from mermaid)
  docId: string;               // e.g. "01-mdd-dashboard-package"
  label: string;               // human title
  status: string;              // complete | draft | in_progress | deprecated
}

interface DepEdge {
  source: string;              // mermaid node id e.g. "N02"
  target: string;              // mermaid node id e.g. "N01"
}

interface OverlapEntry {
  file: string;
  referencedBy: string[];      // doc ids
}
```

### Mermaid parsing rules (`src/connections-parser.ts`)

Parse the `## Dependency Graph` fenced code block line by line:
- `classDef <status> fill:<color>` → ignored (we derive color from status string)
- `N01["<label>"]:::<status>` → DepNode
- `N01["<label>"]` (no class) → DepNode with status `'unknown'`
- `N02 --> N01` → DepEdge { source: 'N02', target: 'N01' }

Parse the `## Path Tree` fenced code block:
- Top-level lines ending in `/` → branch nodes (areas)
- Indented lines (├──, └──) → leaf nodes with `id` and `status` extracted from trailing tokens

Parse `## Source File Overlap` markdown table:
- Skip header and separator rows
- Each data row → OverlapEntry { file, referencedBy: ids split by `, ` }

Parse `## Warnings`:
- Each bullet → string in warnings[]

### Card layout on canvas

Cards replace circles for the Connections view. Each card is an HTML `<div>` (not SVG) absolutely positioned on the canvas:

```
┌─────────────────────────────┐
│ ● complete   ⚡ 2 shared    │  ← status dot + overlap badge
│ 01-mdd-dashboard-package    │  ← doc id (small, muted)
│ Core Package                │  ← title (large)
│ Dashboard > View Modes      │  ← area breadcrumb (tiny, muted)
└─────────────────────────────┘
```

Arrows between cards are SVG `<path>` elements drawn in a sibling `<svg>` overlay that covers the same canvas area.

## API Endpoints

### `GET /api/connections`

- **Auth required**: No
- **Response 200**: `ConnectionsData` JSON
- **Response 404**: `{ error: 'no connections.md' }` — when `.mdd/connections.md` does not exist
- **Response 500**: `{ error: 'parse error', message: string }` — if file is malformed

The server reads `.mdd/connections.md` from the project root (same root used for `.mdd/docs/`), parses it using `parseConnections()` from `src/connections-parser.ts`, and returns the result. No caching — the file is small and reads are fast. The watcher already triggers SSE `graph-reload` events on `.mdd/` changes, which causes the client to re-fetch `/api/connections` automatically.

## Business Rules

1. **Auto-default**: On dashboard boot, `fetch('/api/connections')` is called. If 200, `viewMode` is set to `'connections'` before first render. If 404, `viewMode` stays `'graph'`.

2. **Staleness indicator**: If `ConnectionsData.generated` is more than 1 day older than today, show a small amber `⚠ regenerate` badge next to the view name in the toolbar. Never block usage.

3. **Missing `area` / flat tree**: If all docs in `connections.md` have no area grouping (Path Tree shows no subdirectories), render a single `Uncategorized/` root in the path tree containing all docs alphabetically.

4. **Source overlap — visual only**: Overlap data is never shown as a table. It manifests as:
   - A `⚡ N shared` badge on each card (where N = number of source files shared with ≥1 other doc)
   - On card hover: dotted teal edges drawn from that card to every doc that shares at least one source file
   - Badge is hidden when N = 0

5. **Card click**: Opens the doc viewer panel (same behaviour as clicking a node in graph view). The viewer is already implemented in `02-doc-viewer` and called via `openDocPanel(docId)`.

6. **Path tree click**: Clicking a leaf node in the tree selects and highlights the corresponding card on the canvas (scrolls into view if off-screen). Clicking a branch node collapses/expands that area.

7. **View toggle**: A "View" button in the toolbar cycles between `connections` and `graph`. When switching to `graph`, the existing D3 force simulation resumes. When switching to `connections`, D3 simulation is paused and the HTML card canvas is shown.

8. **Filter compatibility**: The existing search and status/type filter chips apply in Connections view — cards that don't match filters are hidden (opacity 0, not removed from layout, same rule as graph view).

9. **No connections.md**: When in `graph` mode and no `connections.md` exists, a small toolbar hint appears: `"💡 Generate connections.md for a better view"`. Does not block anything.

## Data Flow

Greenfield — no existing parallel computations. Full chain:

```
.mdd/connections.md (generated by MDD system, not by dashboard)
  → GET /api/connections
  → parseConnections() in src/connections-parser.ts
  → ConnectionsData JSON
  → Client boot: if 200 → viewMode = 'connections'
  → renderConnectionsView(data)
      → renderPathTree(data.pathTree) → left sidebar DOM
      → renderDepGraph(data.nodes, data.edges) → card + SVG overlay
      → indexOverlap(data.sourceOverlap) → per-card badge + hover handler
  → watcher detects .mdd/connections.md change
  → SSE graph-reload event
  → client re-fetches /api/connections → re-renders
```

## Dependencies

- **01-mdd-dashboard-package**: base server, template shell, D3 setup, filter system, SSE watcher — all reused
- **02-doc-viewer**: `openDocPanel(docId)` is called when a card or tree leaf is clicked
- **03-projects-listing**: project root path (resolved by CLI before server starts) is the same root used to locate `.mdd/connections.md`

## Known Issues

(none — new feature)
