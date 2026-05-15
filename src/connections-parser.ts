import matter from 'gray-matter'

export interface PathNode {
  label: string
  id?: string
  status?: string
  children?: PathNode[]
}

export interface DepNode {
  id: string      // mermaid id e.g. "N01"
  docId: string   // doc id e.g. "01-mdd-dashboard-package"
  label: string
  status: string
}

export interface DepEdge {
  source: string  // mermaid id e.g. "N02"
  target: string  // mermaid id e.g. "N01"
}

export interface OverlapEntry {
  file: string
  referencedBy: string[]
}

export interface ConnectionsData {
  generated: string
  docCount: number
  connectionCount: number
  overlapCount: number
  pathTree: PathNode[]
  nodes: DepNode[]
  edges: DepEdge[]
  sourceOverlap: OverlapEntry[]
  warnings: string[]
}

export function parseConnections(raw: string): ConnectionsData {
  const { data, content } = matter(raw)

  const mermaid = parseMermaid(extractSection(content, 'Dependency Graph'))

  return {
    generated: formatDate(data['generated']),
    docCount: Number(data['doc_count'] ?? 0),
    connectionCount: Number(data['connection_count'] ?? 0),
    overlapCount: Number(data['overlap_count'] ?? 0),
    pathTree: parsePathTree(extractSection(content, 'Path Tree')),
    nodes: mermaid.nodes,
    edges: mermaid.edges,
    sourceOverlap: parseOverlap(extractSection(content, 'Source File Overlap')),
    warnings: parseWarnings(extractSection(content, 'Warnings')),
  }
}

function formatDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split('T')[0] ?? ''
  return String(value ?? '')
}

// ─── section extraction ───────────────────────────────────────────────────────

function extractSection(content: string, heading: string): string {
  const lines = content.split('\n')
  let inSection = false
  const result: string[] = []

  for (const line of lines) {
    if (line.startsWith(`## ${heading}`)) {
      inSection = true
      continue
    }
    if (inSection && line.startsWith('## ')) break
    if (inSection) result.push(line)
  }

  return result.join('\n').trim()
}

function extractCodeBlock(section: string): string {
  const match = /```(?:\w+)?\n([\s\S]*?)```/.exec(section)
  return match ? (match[1] ?? '').trim() : ''
}

// ─── path tree ────────────────────────────────────────────────────────────────

function parsePathTree(section: string): PathNode[] {
  const raw = extractCodeBlock(section)
  if (!raw) return []

  const lines = raw.split('\n').filter(l => l.trim().length > 0)
  const areaRoots: PathNode[] = []
  const flatLeaves: PathNode[] = []
  let currentRoot: PathNode | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.endsWith('/')) {
      const label = trimmed.slice(0, -1).trim()
      currentRoot = { label, children: [] }
      areaRoots.push(currentRoot)
      continue
    }

    // Strip tree-drawing characters: ├ └ │ ─ and leading whitespace
    const stripped = trimmed.replace(/^[├└│─\s]+/, '').trim()
    if (!stripped) continue

    const leaf = parseLeafTokens(stripped)

    if (currentRoot) {
      currentRoot.children = currentRoot.children ?? []
      currentRoot.children.push(leaf)
    } else {
      flatLeaves.push(leaf)
    }
  }

  if (flatLeaves.length > 0) {
    areaRoots.push({ label: 'Uncategorized', children: flatLeaves })
  }

  return areaRoots
}

function parseLeafTokens(stripped: string): PathNode {
  const tokens = stripped.split(/\s+/)
  if (tokens.length >= 3) {
    const status = tokens[tokens.length - 1] ?? ''
    const id = tokens[tokens.length - 2] ?? ''
    if (/^\d{2}-/.test(id)) {
      const label = tokens.slice(0, tokens.length - 2).join(' ')
      return { label, id, status }
    }
  }
  return { label: stripped }
}

// ─── mermaid ──────────────────────────────────────────────────────────────────

function parseMermaid(section: string): { nodes: DepNode[]; edges: DepEdge[] } {
  const raw = extractCodeBlock(section)
  if (!raw) return { nodes: [], edges: [] }

  const nodes: DepNode[] = []
  const edges: DepEdge[] = []
  const seenEdges = new Set<string>()

  const NODE_RE = /^\s*(\w+)\["([^"]+)"\](?::::(\w+))?/
  const EDGE_RE = /^\s*(\w+)\s+-->\s+(\w+)/

  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t === 'graph TD' || t.startsWith('classDef ')) continue

    const nodeMatch = NODE_RE.exec(line)
    if (nodeMatch) {
      const id = nodeMatch[1] ?? ''
      const docId = nodeMatch[2] ?? ''
      const status = nodeMatch[3] ?? 'unknown'
      nodes.push({ id, docId, label: docId, status })
      continue
    }

    const edgeMatch = EDGE_RE.exec(line)
    if (edgeMatch) {
      const source = edgeMatch[1] ?? ''
      const target = edgeMatch[2] ?? ''
      const key = `${source}-->${target}`
      if (!seenEdges.has(key)) {
        seenEdges.add(key)
        edges.push({ source, target })
      }
    }
  }

  return { nodes, edges }
}

// ─── source overlap ───────────────────────────────────────────────────────────

function parseOverlap(section: string): OverlapEntry[] {
  const result: OverlapEntry[] = []

  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue
    if (/Source File|---/.test(line)) continue

    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0)
    if (cells.length < 2) continue

    const file = cells[0] ?? ''
    const referencedBy = (cells[1] ?? '').split(',').map(s => s.trim()).filter(s => s.length > 0)
    result.push({ file, referencedBy })
  }

  return result
}

// ─── warnings ────────────────────────────────────────────────────────────────

function parseWarnings(section: string): string[] {
  return section
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2))
}
