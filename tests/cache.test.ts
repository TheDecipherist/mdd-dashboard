import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  default: {
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}))

import fs from 'node:fs/promises'
import { Cache } from '../src/cache.js'

const mockStat = vi.mocked(fs.stat)
const mockReadFile = vi.mocked(fs.readFile)

const VALID_CONTENT = (id: string) => `---
id: ${id}
title: ${id}
type: feature
status: draft
depends_on: []
---
`

function makeEntry(id: string, mtime: number) {
  const cache = new Cache()
  const entries = new Map([[`/mdd/docs/${id}.md`, { mtime, data: { id, title: id, type: 'feature' as const, status: 'draft', depends_on: [], initiative: null, wave: null, wave_status: null, known_issues_count: 0, last_synced: '', mdd_version: 1, source_files: [], routes: [], edition: '', folder: 'docs' as const, filepath: `docs/${id}.md`, git: null } }]])
  cache.seed(entries)
  return cache
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cache — invalidation rules', () => {
  describe('frontmatter cache', () => {
    it('should not invalidate when file mtime is unchanged', async () => {
      const cache = makeEntry('doc-a', 1000)
      mockStat.mockResolvedValue({ mtimeMs: 1000 } as Awaited<ReturnType<typeof fs.stat>>)

      const before = cache.frontmatter.get('/mdd/docs/doc-a.md')
      await cache.invalidate('/mdd/docs/doc-a.md', '/mdd')

      // Same object reference — no re-parse
      expect(cache.frontmatter.get('/mdd/docs/doc-a.md')).toBe(before)
      expect(mockReadFile).not.toHaveBeenCalled()
    })

    it('should re-parse frontmatter and update entry when mtime changes', async () => {
      const cache = makeEntry('doc-a', 1000)
      mockStat.mockResolvedValue({ mtimeMs: 2000 } as Awaited<ReturnType<typeof fs.stat>>)
      mockReadFile.mockResolvedValue(VALID_CONTENT('doc-a') as never)

      await cache.invalidate('/mdd/docs/doc-a.md', '/mdd')

      const entry = cache.frontmatter.get('/mdd/docs/doc-a.md')
      expect(entry?.mtime).toBe(2000)
      expect(mockReadFile).toHaveBeenCalledOnce()
    })

    it('should add a new entry when a previously unseen filepath is invalidated', async () => {
      const cache = new Cache()
      mockStat.mockResolvedValue({ mtimeMs: 1000 } as Awaited<ReturnType<typeof fs.stat>>)
      mockReadFile.mockResolvedValue(VALID_CONTENT('new-doc') as never)

      await cache.invalidate('/mdd/docs/new-doc.md', '/mdd')

      expect(cache.frontmatter.has('/mdd/docs/new-doc.md')).toBe(true)
    })

    it('should remove the entry for a deleted file', () => {
      const cache = makeEntry('doc-a', 1000)
      cache.onFileDeleted('/mdd/docs/doc-a.md')
      expect(cache.frontmatter.has('/mdd/docs/doc-a.md')).toBe(false)
    })
  })

  describe('body cache', () => {
    it('should delete the body cache entry when its file mtime changes', async () => {
      const cache = makeEntry('doc-a', 1000)
      cache.body.set('doc-a', { mtime: 1000, html: '<p>old</p>' })
      mockStat.mockResolvedValue({ mtimeMs: 2000 } as Awaited<ReturnType<typeof fs.stat>>)
      mockReadFile.mockResolvedValue(VALID_CONTENT('doc-a') as never)

      await cache.invalidate('/mdd/docs/doc-a.md', '/mdd')

      expect(cache.body.has('doc-a')).toBe(false)
    })

    it('should delete the body cache entry when its file is deleted', () => {
      const cache = makeEntry('doc-a', 1000)
      cache.body.set('doc-a', { mtime: 1000, html: '<p>old</p>' })
      cache.onFileDeleted('/mdd/docs/doc-a.md')
      expect(cache.body.has('doc-a')).toBe(false)
    })

    it('should not delete body cache entries for unrelated files', async () => {
      const cache = makeEntry('doc-a', 1000)
      cache.body.set('doc-a', { mtime: 1000, html: '<p>a</p>' })
      cache.body.set('doc-b', { mtime: 1000, html: '<p>b</p>' })

      // Invalidate doc-a only
      mockStat.mockResolvedValue({ mtimeMs: 2000 } as Awaited<ReturnType<typeof fs.stat>>)
      mockReadFile.mockResolvedValue(VALID_CONTENT('doc-a') as never)
      await cache.invalidate('/mdd/docs/doc-a.md', '/mdd')

      expect(cache.body.has('doc-b')).toBe(true)
    })
  })

  describe('git cache', () => {
    it('should delete the git cache entry when its file mtime changes', async () => {
      const cache = makeEntry('doc-a', 1000)
      cache.git.set('doc-a', { commits: [], hasUncommittedChanges: false, loadedAt: 0 })
      mockStat.mockResolvedValue({ mtimeMs: 2000 } as Awaited<ReturnType<typeof fs.stat>>)
      mockReadFile.mockResolvedValue(VALID_CONTENT('doc-a') as never)

      await cache.invalidate('/mdd/docs/doc-a.md', '/mdd')

      expect(cache.git.has('doc-a')).toBe(false)
    })

    it('should delete the git cache entry when its file is deleted', () => {
      const cache = makeEntry('doc-a', 1000)
      cache.git.set('doc-a', { commits: [], hasUncommittedChanges: false, loadedAt: 0 })
      cache.onFileDeleted('/mdd/docs/doc-a.md')
      expect(cache.git.has('doc-a')).toBe(false)
    })
  })

  describe('graph cache', () => {
    it('should rebuild graphCache atomically after a frontmatter cache update', async () => {
      const cache = makeEntry('doc-a', 1000)
      const graphBefore = cache.graph

      mockStat.mockResolvedValue({ mtimeMs: 2000 } as Awaited<ReturnType<typeof fs.stat>>)
      mockReadFile.mockResolvedValue(VALID_CONTENT('doc-a') as never)
      await cache.invalidate('/mdd/docs/doc-a.md', '/mdd')

      // New object reference after rebuild
      expect(cache.graph).not.toBe(graphBefore)
      expect(cache.graph.nodes.some(n => n.id === 'doc-a')).toBe(true)
    })

    it('should remove the node from graphCache when its file is deleted', () => {
      const cache = makeEntry('doc-a', 1000)
      cache.onFileDeleted('/mdd/docs/doc-a.md')
      expect(cache.graph.nodes.some(n => n.id === 'doc-a')).toBe(false)
    })

    it('should add the new node to graphCache when a new file is detected', async () => {
      const cache = new Cache()
      mockStat.mockResolvedValue({ mtimeMs: 1000 } as Awaited<ReturnType<typeof fs.stat>>)
      mockReadFile.mockResolvedValue(VALID_CONTENT('brand-new') as never)

      await cache.invalidate('/mdd/docs/brand-new.md', '/mdd')

      expect(cache.graph.nodes.some(n => n.id === 'brand-new')).toBe(true)
    })
  })
})
