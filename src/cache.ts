import fs from 'node:fs/promises'
import { parseFrontmatter, buildGraph } from './parser.js'
import type {
  FrontmatterCacheEntry,
  BodyCacheEntry,
  GitCacheEntry,
  GraphCache,
} from './graph.js'

export type SseEventType = 'node-update' | 'node-add' | 'node-remove' | 'graph-reload'

export interface SseDelta {
  type: SseEventType
  id?: string
  node?: FrontmatterCacheEntry['data']
}

export type SseListener = (delta: SseDelta) => void

export class Cache {
  readonly frontmatter = new Map<string, FrontmatterCacheEntry>()
  readonly body = new Map<string, BodyCacheEntry>()
  readonly git = new Map<string, GitCacheEntry>()

  private _graph: GraphCache = { nodes: [], edges: [] }
  private _listeners = new Set<SseListener>()

  get graph(): GraphCache {
    return this._graph
  }

  private rebuildGraph(): void {
    this._graph = buildGraph(this.frontmatter)
  }

  // -------------------------------------------------------------------------
  // SSE listener registration
  // -------------------------------------------------------------------------

  addListener(fn: SseListener): void {
    this._listeners.add(fn)
  }

  removeListener(fn: SseListener): void {
    this._listeners.delete(fn)
  }

  private emit(delta: SseDelta): void {
    for (const fn of this._listeners) {
      fn(delta)
    }
  }

  // -------------------------------------------------------------------------
  // Seed: bulk-load from loadAllDocs result
  // -------------------------------------------------------------------------

  seed(entries: Map<string, FrontmatterCacheEntry>): void {
    for (const [filepath, entry] of entries) {
      this.frontmatter.set(filepath, entry)
    }
    this.rebuildGraph()
  }

  // -------------------------------------------------------------------------
  // Invalidate: called when watcher detects a changed or new file
  // -------------------------------------------------------------------------

  async invalidate(absolutePath: string, mddDir: string): Promise<void> {
    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(absolutePath)
    } catch {
      // File was deleted between the watch event and the stat — treat as delete
      this.onFileDeleted(absolutePath)
      return
    }

    const newMtime = stat.mtimeMs
    const existing = this.frontmatter.get(absolutePath)

    // mtime unchanged — ignore (editor save-without-change, etc.)
    if (existing !== undefined && existing.mtime === newMtime) {
      return
    }

    const content = await fs.readFile(absolutePath, 'utf-8')
    const relPath = absolutePath.startsWith(mddDir)
      ? absolutePath.slice(mddDir.length).replace(/^[\\/]/, '')
      : absolutePath
    const entry = parseFrontmatter(content, relPath, newMtime)

    const isNew = !this.frontmatter.has(absolutePath)
    this.frontmatter.set(absolutePath, entry)

    // Invalidate dependent caches for this document id
    this.body.delete(entry.data.id)
    this.git.delete(entry.data.id)

    this.rebuildGraph()

    if (isNew) {
      this.emit({ type: 'node-add', node: entry.data })
    } else {
      this.emit({ type: 'node-update', id: entry.data.id, node: entry.data })
    }
  }

  // -------------------------------------------------------------------------
  // onFileDeleted: called when watcher detects a deleted file
  // -------------------------------------------------------------------------

  onFileDeleted(absolutePath: string): void {
    const existing = this.frontmatter.get(absolutePath)
    if (existing === undefined) return

    const id = existing.data.id
    this.frontmatter.delete(absolutePath)
    this.body.delete(id)
    this.git.delete(id)
    this.rebuildGraph()
    this.emit({ type: 'node-remove', id })
  }

  // -------------------------------------------------------------------------
  // enrichWithGit: called after Tier 3 completes
  // -------------------------------------------------------------------------

  enrichWithGit(gitEntries: Map<string, GitCacheEntry>): void {
    for (const [docId, gitEntry] of gitEntries) {
      this.git.set(docId, gitEntry)

      // Find the frontmatter cache entry for this docId and update git field
      for (const [, fmEntry] of this.frontmatter) {
        if (fmEntry.data.id === docId) {
          fmEntry.data.git = {
            lastCommitHash: gitEntry.commits[0]?.hash ?? '',
            lastCommitDate: gitEntry.commits[0]?.date ?? '',
            lastCommitMessage: gitEntry.commits[0]?.message ?? '',
            lastCommitAuthor: gitEntry.commits[0]?.author ?? '',
            commitCount: gitEntry.commits.length,
            hasUncommittedChanges: gitEntry.hasUncommittedChanges,
          }
          break
        }
      }
    }
    this.rebuildGraph()
    this.emit({ type: 'graph-reload' })
  }
}
