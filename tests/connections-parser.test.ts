import { describe, it, expect } from 'vitest'
import { parseConnections } from '../src/connections-parser.js'

// ─── fixtures ────────────────────────────────────────────────────────────────

const FULL_CONNECTIONS = `---
generated: 2026-05-14
doc_count: 3
connection_count: 2
overlap_count: 2
---

# MDD Connections

## Path Tree

\`\`\`
Dashboard/
├── Core Package  01-mdd-dashboard-package  complete
├── Doc Viewer  02-doc-viewer  draft
└── Project Picker  03-projects-listing  complete
\`\`\`

## Dependency Graph

\`\`\`mermaid
graph TD
  N01["01-mdd-dashboard-package"]:::complete
  N02["02-doc-viewer"]:::draft
  N03["03-projects-listing"]:::complete
  N02 --> N01
  N03 --> N01
  classDef complete fill:#00e5cc,color:#000
  classDef in_progress fill:#ffaa00,color:#000
  classDef draft fill:#888,color:#fff
  classDef deprecated fill:#555,color:#aaa
\`\`\`

## Source File Overlap

| Source File | Referenced By |
|-------------|--------------|
| src/template.ts | 01-mdd-dashboard-package, 02-doc-viewer |
| src/server.ts | 01-mdd-dashboard-package, 02-doc-viewer |

## Warnings

(none)
`

const MULTI_AREA_TREE = `---
generated: 2026-05-14
doc_count: 5
connection_count: 6
overlap_count: 2
---

# MDD Connections

## Path Tree

\`\`\`
Tooling/
  ├── Dashboard  02-dashboards-showcase  complete
  └── Install    03-install-local-flag   complete
Extraction/
  ├── Archive Detection  01-archive-detection  draft
  └── Cleanup            02-archive-cleanup    in_progress
\`\`\`

## Dependency Graph

\`\`\`mermaid
graph TD
  N01["01-archive-detection"]:::draft
  N02["02-archive-cleanup"]:::in_progress
  N02 --> N01
\`\`\`

## Source File Overlap

| Source File | Referenced By |
|-------------|--------------|
| peelx.py | 01-archive-detection, 02-archive-cleanup |

## Warnings

- 02-archive-cleanup depends_on 01-archive-detection which has no tests
`

const FLAT_TREE = `---
generated: 2026-05-14
doc_count: 2
connection_count: 1
overlap_count: 0
---

# MDD Connections

## Path Tree

\`\`\`
Feature Alpha  01-feature-alpha  complete
Feature Beta   02-feature-beta   draft
\`\`\`

## Dependency Graph

\`\`\`mermaid
graph TD
  N01["01-feature-alpha"]:::complete
  N02["02-feature-beta"]:::draft
  N02 --> N01
\`\`\`

## Source File Overlap

(none)

## Warnings

(none)
`

const NODE_NO_STATUS = `---
generated: 2026-05-14
doc_count: 1
connection_count: 0
overlap_count: 0
---

# MDD Connections

## Path Tree

\`\`\`
Misc/
  └── Feature  01-feature  unknown
\`\`\`

## Dependency Graph

\`\`\`mermaid
graph TD
  N01["01-feature"]
\`\`\`

## Source File Overlap

(none)

## Warnings

(none)
`

const MINIMAL = `---
generated: 2026-01-01
doc_count: 0
connection_count: 0
overlap_count: 0
---

# MDD Connections

## Path Tree

\`\`\`
(empty)
\`\`\`

## Dependency Graph

\`\`\`mermaid
graph TD
\`\`\`

## Source File Overlap

(none)

## Warnings

(none)
`

// ─── frontmatter ─────────────────────────────────────────────────────────────

describe('parseConnections — frontmatter', () => {
  it('should parse generated date', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    expect(result.generated).toBe('2026-05-14')
  })

  it('should parse doc_count, connection_count, overlap_count as numbers', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    expect(result.docCount).toBe(3)
    expect(result.connectionCount).toBe(2)
    expect(result.overlapCount).toBe(2)
  })
})

// ─── path tree ───────────────────────────────────────────────────────────────

describe('parseConnections — path tree', () => {
  it('should parse a single-area tree into one root PathNode with children', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    expect(result.pathTree).toHaveLength(1)
    expect(result.pathTree[0]?.label).toBe('Dashboard')
    expect(result.pathTree[0]?.children).toHaveLength(3)
  })

  it('should parse multiple areas into multiple root PathNodes', () => {
    const result = parseConnections(MULTI_AREA_TREE)
    expect(result.pathTree).toHaveLength(2)
    expect(result.pathTree[0]?.label).toBe('Tooling')
    expect(result.pathTree[1]?.label).toBe('Extraction')
  })

  it('should extract doc id and status from leaf nodes', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    const children = result.pathTree[0]?.children ?? []
    expect(children[0]).toMatchObject({ label: 'Core Package', id: '01-mdd-dashboard-package', status: 'complete' })
    expect(children[1]).toMatchObject({ label: 'Doc Viewer', id: '02-doc-viewer', status: 'draft' })
  })

  it('should collect flat (no-area) docs under a single Uncategorized root', () => {
    const result = parseConnections(FLAT_TREE)
    expect(result.pathTree).toHaveLength(1)
    expect(result.pathTree[0]?.label).toBe('Uncategorized')
    const children = result.pathTree[0]?.children ?? []
    expect(children).toHaveLength(2)
    expect(children[0]).toMatchObject({ id: '01-feature-alpha', status: 'complete' })
  })

  it('should return empty array when Path Tree section is missing', () => {
    const noTree = FULL_CONNECTIONS.replace('## Path Tree', '## Removed Section')
    const result = parseConnections(noTree)
    expect(result.pathTree).toEqual([])
  })
})

// ─── mermaid nodes ───────────────────────────────────────────────────────────

describe('parseConnections — mermaid nodes', () => {
  it('should parse node id, docId label, and status from class annotation', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    expect(result.nodes).toHaveLength(3)
    expect(result.nodes[0]).toMatchObject({ id: 'N01', docId: '01-mdd-dashboard-package', status: 'complete' })
    expect(result.nodes[1]).toMatchObject({ id: 'N02', docId: '02-doc-viewer', status: 'draft' })
  })

  it('should parse in_progress status correctly', () => {
    const result = parseConnections(MULTI_AREA_TREE)
    const inProgress = result.nodes.find(n => n.id === 'N02')
    expect(inProgress?.status).toBe('in_progress')
  })

  it('should default status to "unknown" when no class annotation present', () => {
    const result = parseConnections(NODE_NO_STATUS)
    expect(result.nodes[0]).toMatchObject({ id: 'N01', status: 'unknown' })
  })

  it('should skip classDef lines — they must not appear as nodes', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    const hasClassDef = result.nodes.some(n => n.docId.startsWith('classDef') || n.id.startsWith('classDef'))
    expect(hasClassDef).toBe(false)
  })

  it('should return empty nodes array when Dependency Graph section is missing', () => {
    const noGraph = FULL_CONNECTIONS.replace('## Dependency Graph', '## Removed Section')
    const result = parseConnections(noGraph)
    expect(result.nodes).toEqual([])
  })
})

// ─── mermaid edges ───────────────────────────────────────────────────────────

describe('parseConnections — mermaid edges', () => {
  it('should parse --> edges into DepEdge objects with source and target', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    expect(result.edges).toHaveLength(2)
    expect(result.edges[0]).toEqual({ source: 'N02', target: 'N01' })
    expect(result.edges[1]).toEqual({ source: 'N03', target: 'N01' })
  })

  it('should return empty edges array when no --> lines exist', () => {
    const result = parseConnections(NODE_NO_STATUS)
    expect(result.edges).toEqual([])
  })

  it('should not produce duplicate edges for repeated --> lines', () => {
    const withDupe = FULL_CONNECTIONS.replace(
      'N02 --> N01\n  N03 --> N01',
      'N02 --> N01\n  N02 --> N01\n  N03 --> N01'
    )
    const result = parseConnections(withDupe)
    const n02Edges = result.edges.filter(e => e.source === 'N02' && e.target === 'N01')
    expect(n02Edges).toHaveLength(1)
  })
})

// ─── source overlap ──────────────────────────────────────────────────────────

describe('parseConnections — source overlap', () => {
  it('should parse each table row into an OverlapEntry with file and referencedBy array', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    expect(result.sourceOverlap).toHaveLength(2)
    expect(result.sourceOverlap[0]).toEqual({
      file: 'src/template.ts',
      referencedBy: ['01-mdd-dashboard-package', '02-doc-viewer'],
    })
  })

  it('should return empty array when Source File Overlap has no data rows', () => {
    const result = parseConnections(FLAT_TREE)
    expect(result.sourceOverlap).toEqual([])
  })

  it('should return empty array when Source File Overlap section contains only "(none)"', () => {
    const result = parseConnections(NODE_NO_STATUS)
    expect(result.sourceOverlap).toEqual([])
  })
})

// ─── warnings ────────────────────────────────────────────────────────────────

describe('parseConnections — warnings', () => {
  it('should parse bullet-point warnings into a string array', () => {
    const result = parseConnections(MULTI_AREA_TREE)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('02-archive-cleanup')
  })

  it('should return empty array when Warnings section contains only "(none)"', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    expect(result.warnings).toEqual([])
  })
})

// ─── full output shape ────────────────────────────────────────────────────────

describe('parseConnections — full ConnectionsData shape', () => {
  it('should return a complete ConnectionsData object from a well-formed file', () => {
    const result = parseConnections(FULL_CONNECTIONS)
    expect(result).toMatchObject({
      generated: '2026-05-14',
      docCount: 3,
      connectionCount: 2,
      overlapCount: 2,
    })
    expect(Array.isArray(result.pathTree)).toBe(true)
    expect(Array.isArray(result.nodes)).toBe(true)
    expect(Array.isArray(result.edges)).toBe(true)
    expect(Array.isArray(result.sourceOverlap)).toBe(true)
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('should not throw on a minimal valid connections.md', () => {
    expect(() => parseConnections(MINIMAL)).not.toThrow()
    const result = parseConnections(MINIMAL)
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.sourceOverlap).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('should not throw on a malformed mermaid line — skip the line instead', () => {
    const malformed = FULL_CONNECTIONS.replace(
      'N02 --> N01',
      'N02 --> N01\n  THIS IS NOT VALID MERMAID !!!'
    )
    expect(() => parseConnections(malformed)).not.toThrow()
    const result = parseConnections(malformed)
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
  })
})
