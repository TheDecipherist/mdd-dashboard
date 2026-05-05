import { describe, it, expect } from 'vitest'
import { parseFrontmatter, buildGraph } from '../src/parser.js'
import type { FrontmatterCacheEntry } from '../src/graph.js'

const VALID_FRONTMATTER = `---
id: 01-feature
title: My Feature
type: feature
status: complete
edition: my-project
depends_on:
  - 02-other
initiative: my-initiative
wave: my-wave
wave_status: active
known_issues:
  - issue one
  - issue two
last_synced: "2026-01-01"
mdd_version: 1
source_files:
  - src/foo.ts
routes:
  - GET /api/foo
---

# Body content that should be ignored
`

describe('parser — frontmatter parsing', () => {
  it('should return a valid NodeData shape from well-formed frontmatter', () => {
    const entry = parseFrontmatter(VALID_FRONTMATTER, 'docs/01-feature.md', 1000)
    expect(entry).toHaveProperty('mtime', 1000)
    expect(entry).toHaveProperty('data')
    expect(entry.data).toHaveProperty('id', '01-feature')
    expect(entry.data.git).toBeNull()
  })

  it('should extract all required NodeData fields from frontmatter', () => {
    const { data } = parseFrontmatter(VALID_FRONTMATTER, 'docs/01-feature.md', 1000)
    expect(data.id).toBe('01-feature')
    expect(data.title).toBe('My Feature')
    expect(data.type).toBe('feature')
    expect(data.status).toBe('complete')
    expect(data.edition).toBe('my-project')
    expect(data.depends_on).toEqual(['02-other'])
    expect(data.initiative).toBe('my-initiative')
    expect(data.wave).toBe('my-wave')
    expect(data.wave_status).toBe('active')
    expect(data.known_issues_count).toBe(2)
    expect(data.last_synced).toBe('2026-01-01')
    expect(data.mdd_version).toBe(1)
    expect(data.source_files).toEqual(['src/foo.ts'])
    expect(data.routes).toEqual(['GET /api/foo'])
    expect(data.folder).toBe('docs')
    expect(data.filepath).toBe('docs/01-feature.md')
  })

  it('should set git to null on freshly parsed nodes (Tier 3 not yet run)', () => {
    const { data } = parseFrontmatter(VALID_FRONTMATTER, 'docs/01-feature.md', 1000)
    expect(data.git).toBeNull()
  })

  it('should return an error node when frontmatter YAML is malformed', () => {
    const malformed = `---\nid: [unclosed\ntitle: bad\n---\n`
    const entry = parseFrontmatter(malformed, 'docs/bad.md', 1000)
    expect(entry.data.type).toBe('error')
    expect(entry.data.title).toMatch(/^Parse error:/)
    expect(entry.data.git).toBeNull()
  })

  it('should tolerate a doc with missing optional frontmatter fields', () => {
    const minimal = `---\nid: 03-minimal\ntitle: Minimal\n---\n`
    const { data } = parseFrontmatter(minimal, 'docs/03-minimal.md', 1000)
    expect(data.initiative).toBeNull()
    expect(data.wave).toBeNull()
    expect(data.wave_status).toBeNull()
    expect(data.source_files).toEqual([])
    expect(data.routes).toEqual([])
    expect(data.depends_on).toEqual([])
    expect(data.known_issues_count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Helpers for graph tests
// ---------------------------------------------------------------------------

function makeEntry(id: string, overrides: Partial<{
  folder: 'docs' | 'initiatives' | 'waves' | 'ops'
  depends_on: string[]
  initiative: string | null
  wave: string | null
}>): FrontmatterCacheEntry {
  const folder = overrides.folder ?? 'docs'
  const filepath = `${folder}/${id}.md`
  const content = `---
id: ${id}
title: ${id}
type: feature
status: draft
${overrides.depends_on ? 'depends_on:\n' + overrides.depends_on.map(d => `  - ${d}`).join('\n') : 'depends_on: []'}
${overrides.initiative ? `initiative: ${overrides.initiative}` : ''}
${overrides.wave ? `wave: ${overrides.wave}` : ''}
---
`
  return parseFrontmatter(content, filepath, 1000)
}

describe('parser — graph building', () => {
  describe('depends_on edge inference', () => {
    it('should create one edge per id in depends_on[] for a feature doc', () => {
      const cache = new Map([
        ['/a.md', makeEntry('doc-a', { depends_on: ['doc-b'] })],
        ['/b.md', makeEntry('doc-b', {})],
      ])
      const { edges } = buildGraph(cache)
      const edge = edges.find(e => e.source === 'doc-a' && e.target === 'doc-b')
      expect(edge).toBeDefined()
      expect(edge?.type).toBe('depends_on')
      expect(edge?.broken).toBe(false)
    })

    it('should set broken: true when a depends_on target id is not in nodeMap', () => {
      const cache = new Map([
        ['/a.md', makeEntry('doc-a', { depends_on: ['missing-id'] })],
      ])
      const { edges } = buildGraph(cache)
      const edge = edges.find(e => e.target === 'missing-id')
      expect(edge?.broken).toBe(true)
    })

    it('should not create depends_on edges for docs with an empty depends_on array', () => {
      const cache = new Map([
        ['/a.md', makeEntry('doc-a', {})],
      ])
      const { edges } = buildGraph(cache)
      expect(edges.filter(e => e.type === 'depends_on')).toHaveLength(0)
    })
  })

  describe('initiative_wave edge inference', () => {
    it('should create an initiative→wave edge for a wave doc with an initiative field', () => {
      const cache = new Map([
        ['/w.md', makeEntry('my-wave', { folder: 'waves', initiative: 'my-init' })],
        ['/i.md', makeEntry('my-init', { folder: 'initiatives' })],
      ])
      const { edges } = buildGraph(cache)
      const edge = edges.find(e => e.type === 'initiative_wave')
      expect(edge).toBeDefined()
      expect(edge?.source).toBe('my-init')
      expect(edge?.target).toBe('my-wave')
      expect(edge?.broken).toBe(false)
    })

    it('should set broken: true when the initiative id is not in nodeMap', () => {
      const cache = new Map([
        ['/w.md', makeEntry('my-wave', { folder: 'waves', initiative: 'ghost-init' })],
      ])
      const { edges } = buildGraph(cache)
      const edge = edges.find(e => e.type === 'initiative_wave')
      expect(edge?.broken).toBe(true)
    })

    it('should not create initiative_wave edges for non-wave docs', () => {
      const cache = new Map([
        ['/d.md', makeEntry('doc-a', { folder: 'docs', initiative: 'some-init' })],
      ])
      const { edges } = buildGraph(cache)
      expect(edges.filter(e => e.type === 'initiative_wave')).toHaveLength(0)
    })
  })

  describe('wave_feature edge inference', () => {
    it('should create a wave→feature edge for a feature doc with a wave field', () => {
      const cache = new Map([
        ['/d.md', makeEntry('doc-a', { folder: 'docs', wave: 'my-wave' })],
        ['/w.md', makeEntry('my-wave', { folder: 'waves' })],
      ])
      const { edges } = buildGraph(cache)
      const edge = edges.find(e => e.type === 'wave_feature')
      expect(edge).toBeDefined()
      expect(edge?.source).toBe('my-wave')
      expect(edge?.target).toBe('doc-a')
      expect(edge?.broken).toBe(false)
    })

    it('should set broken: true when the wave id is not in nodeMap', () => {
      const cache = new Map([
        ['/d.md', makeEntry('doc-a', { folder: 'docs', wave: 'ghost-wave' })],
      ])
      const { edges } = buildGraph(cache)
      const edge = edges.find(e => e.type === 'wave_feature')
      expect(edge?.broken).toBe(true)
    })

    it('should not create wave_feature edges for docs without a wave field', () => {
      const cache = new Map([
        ['/d.md', makeEntry('doc-a', { folder: 'docs' })],
      ])
      const { edges } = buildGraph(cache)
      expect(edges.filter(e => e.type === 'wave_feature')).toHaveLength(0)
    })
  })
})
