---
id: 02-doc-viewer
title: Doc Viewer — Fullscreen Interactive Document Panel
edition: mdd-dashboard
depends_on: [01-mdd-dashboard-package]
source_files:
  - src/template.ts
  - src/server.ts
routes:
  - GET /api/open
models: []
test_files:
  - tests/server.test.ts
data_flow: greenfield
last_synced: 2026-05-05
status: draft
phase: documentation
mdd_version: 5
known_issues: []
---

# 02 — Doc Viewer — Fullscreen Interactive Document Panel

## Purpose

Replaces the existing 340px right-side detail sidebar with a near-fullscreen overlay modal that gives the user a rich, readable view of any MDD document. The viewer renders markdown with syntax-highlighted code blocks, makes source files one-click-openable in VS Code, and keeps all navigation interactive so the user never needs to leave the dashboard.

## Architecture

The doc viewer is a pure front-end enhancement within `template.ts` plus one new server route in `server.ts`.

```
Node click
  → openViewer(n)          // replaces openDetail()
      → builds overlay HTML (metadata + skeleton body)
      → loadBody(id)
          → fetch /api/doc/:id → { html }
          → inject into #viewer-body
          → hljs.highlightAll()   // syntax highlight all <code> blocks
      → attachCopyButtons()       // add copy button to each <pre><code>

Source file click
  → fetch /api/open?file=<absolute-path>
      → server: child_process `code <path>` (fire-and-forget)

Dep chip click (inside viewer)
  → closeViewer()
  → jumpTo(id)             // focuses node on graph canvas

Esc key / backdrop click
  → closeViewer()
```

**Overlay layout (near-fullscreen):**

```
┌─ #viewer (fixed, inset 40px all sides, z-index 100) ────────────────────┐
│  ┌─ #viewer-header ────────────────────────────────────── [×] close ─┐  │
│  │  Title   [type] [status] [modified?]   last_synced · vN · edition │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌─ #viewer-sidebar (240px) ──┐  ┌─ #viewer-body (flex-grow) ────────┐  │
│  │  Depends On                │  │  Rendered markdown body            │  │
│  │   [chip] [chip]            │  │  with syntax-highlighted code      │  │
│  │                            │  │  blocks and copy buttons           │  │
│  │  Source Files              │  │                                    │  │
│  │   [📄 src/foo.ts ↗]       │  │                                    │  │
│  │   [📄 src/bar.ts ↗]       │  │                                    │  │
│  │                            │  │                                    │  │
│  │  Git                       │  │                                    │  │
│  │   abc1234 2d ago           │  │                                    │  │
│  │   "commit msg" by author   │  │                                    │  │
│  │   [View history]           │  │                                    │  │
│  └────────────────────────────┘  └────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
  #viewer-backdrop (fixed full-screen, semi-transparent, click → close)
```

## Data Model

No new data model. All data comes from existing `NodeData` (already in the graph) and `/api/doc/:id` (existing route).

New server route added:

```
GET /api/open?file=<url-encoded-absolute-path>
  → runs: code <path>  (child_process.spawn, fire-and-forget)
  → 204 No Content on success
  → 400 Bad Request if file param missing
  → 500 if spawn fails (still returns after fire — non-blocking)
```

## API Endpoints

### GET /api/open

Opens a file in VS Code on the host machine.

- **Auth:** none (localhost-only server)
- **Query params:** `file` — URL-encoded absolute path to the file
- **Response:** `204 No Content`
- **Error cases:**
  - Missing `file` param → `400 { error: 'file param required' }`
  - Empty file string → `400 { error: 'file param required' }`

Security note: the file path is passed as an array argument to `spawn`, never interpolated into a shell string, so there is no shell injection risk.

## Business Rules

1. **Overlay opens on node click** — replaces the sidebar; the sidebar `#detail` element is removed or kept hidden permanently.
2. **Backdrop and Esc close the viewer** — `keydown` handler on `document` for `Escape`; click on `#viewer-backdrop` closes the viewer.
3. **Syntax highlighting** — highlight.js is loaded from CDN (`<script>` tag in `<head>`). After `loadBody()` injects HTML into `#viewer-body`, `hljs.highlightAll()` is called scoped to `#viewer-body`.
4. **Copy button** — injected after syntax highlighting. Each `<pre><code>` block gets a `<button class="copy-btn">Copy</button>` absolutely positioned in the top-right corner of the `<pre>`. On click, `navigator.clipboard.writeText(code.innerText)` — button label changes to "Copied!" for 1.5s then resets.
5. **Source file links** — each source file renders as a `<button>` that calls `openFile(absolutePath)`. The absolute path is constructed server-side: the `source_files` field contains paths relative to the project root. The server knows `projectDir`; the client sends paths exactly as stored in the node data. The `/api/open` handler resolves relative-to-cwd paths if needed.
6. **Depends-on chips** — clicking a dep chip closes the viewer (`closeViewer()`) then calls `jumpTo(id)` which focuses and selects the target node. This is the same `jumpTo()` that already exists; it just needs to run after the overlay is closed.
7. **No-body nodes** — if `/api/doc/:id` returns empty HTML or the node has no body content, `#viewer-body` shows a muted "No document body" placeholder instead of a blank area.
8. **Git section** — same data as the old sidebar (last commit, commit count, view history) but now in the sidebar column of the overlay.
9. **View history** — clicking "View history" loads `/api/git/:id` and renders commits inline in the sidebar (same as before).

## Data Flow

- **Body HTML:** `cache.body` → `GET /api/doc/:id` → `{ html }` → `#viewer-body.innerHTML` → `hljs.highlightAll()` → copy buttons injected
- **Source files:** `NodeData.source_files[]` (from `/api/data`) → `<button data-file="...">` → click → `fetch('/api/open?file=...')` → server `spawn('code', [path])`
- **Depends-on:** `NodeData.depends_on[]` → `<span class="dep-chip" data-nid="...">` → click → `closeViewer()` + `jumpTo(id)`
- **Git metadata:** `NodeData.git` (from `/api/data`, Tier 3) + `/api/git/:id` (full history) → sidebar git section

## Dependencies

Depends on `01-mdd-dashboard-package` for all core infrastructure: the HTTP server, the cache/SSE system, the graph/node data model, and the `template.ts` rendering pipeline.

**New CDN dependency:** `highlight.js` — loaded via `<script>` and `<link>` from `cdn.jsdelivr.net`. No npm install required.

## Known Issues

(none)
