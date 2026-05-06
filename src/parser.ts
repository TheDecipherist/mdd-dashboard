import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import type {
  NodeData,
  NodeFolder,
  EdgeData,
  GraphCache,
  FrontmatterCacheEntry,
} from './graph.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveFolder(filepath: string): NodeFolder {
  const first = filepath.split('/')[0] ?? ''
  switch (first) {
    case 'docs':
      return 'docs'
    case 'initiatives':
      return 'initiatives'
    case 'waves':
      return 'waves'
    case 'ops':
      return 'ops'
    default:
      return 'docs'
  }
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  return []
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

export function parseFrontmatter(
  content: string,
  filepath: string,
  mtime: number,
): FrontmatterCacheEntry {
  const folder = deriveFolder(filepath)

  // Default node shape used for both error nodes and missing-field fallback
  const defaults: Omit<NodeData, 'id' | 'title' | 'type' | 'folder' | 'filepath'> = {
    status: 'draft',
    depends_on: [],
    initiative: null,
    wave: null,
    wave_status: null,
    known_issues_count: 0,
    last_synced: '',
    mdd_version: 0,
    source_files: [],
    routes: [],
    edition: '',
    phase: '',
    icon: '',
    git: null,
  }

  let fm: Record<string, unknown>
  try {
    const parsed = matter(content)
    fm = parsed.data as Record<string, unknown>
  } catch (err) {
    // Malformed YAML — return an error node, never throw
    const errorNode: NodeData = {
      id: filepath,
      filepath,
      folder,
      title: `Parse error: ${path.basename(filepath)}`,
      type: 'error',
      ...defaults,
    }
    return { mtime, data: errorNode }
  }

  const knownIssues = Array.isArray(fm['known_issues']) ? fm['known_issues'] : []

  const node: NodeData = {
    id: typeof fm['id'] === 'string' ? fm['id'] : filepath,
    filepath,
    folder,
    title: typeof fm['title'] === 'string' ? fm['title'] : path.basename(filepath),
    type: (() => {
      const t = fm['type']
      if (
        t === 'feature' ||
        t === 'task' ||
        t === 'initiative' ||
        t === 'wave' ||
        t === 'ops' ||
        t === 'error'
      ) {
        return t
      }
      return 'feature'
    })(),
    status: typeof fm['status'] === 'string' ? fm['status'] : defaults.status,
    depends_on: toStringArray(fm['depends_on']),
    initiative: toNullableString(fm['initiative']),
    wave: toNullableString(fm['wave']),
    wave_status: toNullableString(fm['wave_status']),
    known_issues_count: knownIssues.length,
    last_synced: typeof fm['last_synced'] === 'string' ? fm['last_synced'] : defaults.last_synced,
    mdd_version:
      typeof fm['mdd_version'] === 'number' ? fm['mdd_version'] : defaults.mdd_version,
    source_files: toStringArray(fm['source_files']),
    routes: toStringArray(fm['routes']),
    edition: typeof fm['edition'] === 'string' ? fm['edition'] : defaults.edition,
    phase: typeof fm['phase'] === 'string' ? fm['phase'] : defaults.phase,
    icon: typeof fm['icon'] === 'string' ? fm['icon'] : defaults.icon,
    git: null,
  }

  return { mtime, data: node }
}

// ---------------------------------------------------------------------------
// buildGraph
// ---------------------------------------------------------------------------

export function buildGraph(cache: Map<string, FrontmatterCacheEntry>): GraphCache {
  // Build nodeMap keyed by node id
  const nodeMap = new Map<string, NodeData>()
  for (const entry of cache.values()) {
    nodeMap.set(entry.data.id, entry.data)
  }

  const edges: EdgeData[] = []

  for (const node of nodeMap.values()) {
    // depends_on edges
    for (const depId of node.depends_on) {
      edges.push({
        source: node.id,
        target: depId,
        type: 'depends_on',
        broken: !nodeMap.has(depId),
      })
    }

    // initiative_wave edges — only for wave-folder nodes with an initiative field
    if (node.folder === 'waves' && node.initiative !== null) {
      edges.push({
        source: node.initiative,
        target: node.id,
        type: 'initiative_wave',
        broken: !nodeMap.has(node.initiative),
      })
    }

    // wave_feature edges — only for docs/ops nodes with a wave field
    if ((node.folder === 'docs' || node.folder === 'ops') && node.wave !== null) {
      edges.push({
        source: node.wave,
        target: node.id,
        type: 'wave_feature',
        broken: !nodeMap.has(node.wave),
      })
    }
  }

  return { nodes: [...nodeMap.values()], edges }
}

// ---------------------------------------------------------------------------
// loadAllDocs
// ---------------------------------------------------------------------------

async function collectMdFiles(dir: string): Promise<string[]> {
  // Use fs.readdir with recursive option (Node 20+)
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => {
      // In Node 20 with recursive, e.parentPath (or e.path) holds the directory
      const parent = (e as { parentPath?: string; path?: string }).parentPath ?? (e as { path?: string }).path ?? dir
      return path.join(parent, e.name)
    })
}

export async function loadAllDocs(
  mddDir: string,
): Promise<Map<string, FrontmatterCacheEntry>> {
  const absolutePaths = await collectMdFiles(mddDir)

  const entries = await Promise.all(
    absolutePaths.map(async (absPath) => {
      const [stat, content] = await Promise.all([
        fs.stat(absPath),
        fs.readFile(absPath, 'utf-8'),
      ])
      const filepath = path.relative(mddDir, absPath)
      const entry = parseFrontmatter(content, filepath, stat.mtimeMs)
      return [absPath, entry] as const
    }),
  )

  const resultMap = new Map<string, FrontmatterCacheEntry>()
  for (const [absPath, entry] of entries) {
    resultMap.set(absPath, entry)
  }
  return resultMap
}
