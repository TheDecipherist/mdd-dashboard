import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

// vi.mock is hoisted above imports by Vitest's transform — this intercepts the
// spawn import inside git.ts before any test runs.
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { parseGitLog, computeRelativeDate, loadGitData } from '../src/git.js'

const mockSpawn = vi.mocked(spawn)

const SAMPLE_LINE = 'abc1234567890abcdef|2026-01-15T10:30:00+00:00|fix: update parser|Alice'
const NOW = new Date('2026-05-05T12:00:00Z').getTime()

// ---------------------------------------------------------------------------
// Spawn mock helpers
// ---------------------------------------------------------------------------

type MockProc = EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }

function makeMockProc(stdout: string, code: number, delay = 0): MockProc {
  const proc = new EventEmitter() as MockProc
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  setTimeout(() => {
    proc.stdout.emit('data', Buffer.from(stdout))
    proc.emit('close', code)
  }, delay)
  return proc
}

function makeEnoentProc(): MockProc {
  const proc = new EventEmitter() as MockProc
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
  setTimeout(() => proc.emit('error', err), 0)
  return proc
}

function makeErrorProc(errCode: string): MockProc {
  const proc = new EventEmitter() as MockProc
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  const err = Object.assign(new Error(`spawn ${errCode}`), { code: errCode })
  setTimeout(() => proc.emit('error', err), 0)
  return proc
}

beforeEach(() => {
  mockSpawn.mockReset()
})

// ---------------------------------------------------------------------------
// Log parsing
// ---------------------------------------------------------------------------

describe('git — log parsing', () => {
  it('should parse a single git log line into a GitCommit', () => {
    const commits = parseGitLog(SAMPLE_LINE)
    expect(commits).toHaveLength(1)
    const c = commits[0]!
    expect(c.hash).toBe('abc1234567890abcdef')
    expect(c.shortHash).toBe('abc1234')
    expect(c.date).toBe('2026-01-15T10:30:00+00:00')
    expect(c.message).toBe('fix: update parser')
    expect(c.author).toBe('Alice')
    expect(typeof c.relativeDate).toBe('string')
    expect(c.relativeDate.length).toBeGreaterThan(0)
  })

  it('should parse multiple git log lines into a GitCommit[]', () => {
    const lines = [
      'aaa0000|2026-05-05T11:00:00Z|newest commit|Bob',
      'bbb1111|2026-01-01T00:00:00Z|older commit|Alice',
    ].join('\n')
    const commits = parseGitLog(lines)
    expect(commits).toHaveLength(2)
    expect(commits[0]!.hash).toBe('aaa0000')
    expect(commits[1]!.hash).toBe('bbb1111')
  })

  it('should handle an empty git log output (file with no commits) without throwing', () => {
    expect(parseGitLog('')).toEqual([])
    expect(parseGitLog('   \n  \n')).toEqual([])
  })

  it('should cap results at 100 commits (--max-count=100 enforced)', () => {
    const lines = Array.from({ length: 150 }, (_, i) =>
      `hash${String(i).padStart(3, '0')}|2026-01-01T00:00:00Z|msg ${i}|Author`
    ).join('\n')
    expect(parseGitLog(lines)).toHaveLength(100)
  })
})

// ---------------------------------------------------------------------------
// relativeDate
// ---------------------------------------------------------------------------

describe('git — relativeDate computation', () => {
  it('should return "just now" for a date less than 60 seconds ago', () => {
    expect(computeRelativeDate(new Date(NOW - 30_000).toISOString(), NOW)).toBe('just now')
  })

  it('should return "N minutes ago" for dates within the last hour', () => {
    expect(computeRelativeDate(new Date(NOW - 10 * 60_000).toISOString(), NOW)).toBe('10 minutes ago')
  })

  it('should return "N hours ago" for dates within the last 24 hours', () => {
    expect(computeRelativeDate(new Date(NOW - 5 * 3_600_000).toISOString(), NOW)).toBe('5 hours ago')
  })

  it('should return "N days ago" for dates within the last 7 days', () => {
    expect(computeRelativeDate(new Date(NOW - 3 * 86_400_000).toISOString(), NOW)).toBe('3 days ago')
  })

  it('should return "N weeks ago" for dates within the last 30 days', () => {
    expect(computeRelativeDate(new Date(NOW - 14 * 86_400_000).toISOString(), NOW)).toBe('2 weeks ago')
  })

  it('should return "N months ago" for dates within the last 365 days', () => {
    expect(computeRelativeDate(new Date(NOW - 60 * 86_400_000).toISOString(), NOW)).toBe('2 months ago')
  })

  it('should return "N years ago" for dates over a year old', () => {
    expect(computeRelativeDate(new Date(NOW - 400 * 86_400_000).toISOString(), NOW)).toBe('1 years ago')
  })
})

// ---------------------------------------------------------------------------
// Uncommitted changes detection
// ---------------------------------------------------------------------------

describe('git — uncommitted changes detection', () => {
  it('should return hasUncommittedChanges: true for a file listed in git status --short', async () => {
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'status') return makeMockProc(' M .mdd/docs/01-feature.md\n', 0)
      return makeMockProc('', 0)
    })
    const file = '/repo/.mdd/docs/01-feature.md'
    const { entries } = await loadGitData('/repo/.mdd', [file], new Map([[file, '01-feature']]))
    expect(entries.get('01-feature')?.hasUncommittedChanges).toBe(true)
  })

  it('should return hasUncommittedChanges: false for a file not in git status output', async () => {
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'status') return makeMockProc(' M .mdd/docs/other-file.md\n', 0)
      return makeMockProc('', 0)
    })
    const file = '/repo/.mdd/docs/01-feature.md'
    const { entries } = await loadGitData('/repo/.mdd', [file], new Map([[file, '01-feature']]))
    expect(entries.get('01-feature')?.hasUncommittedChanges).toBe(false)
  })

  it('should spawn git status once for all files, not once per file', async () => {
    mockSpawn.mockImplementation(() => makeMockProc('', 0))
    const files = ['/repo/.mdd/docs/a.md', '/repo/.mdd/docs/b.md', '/repo/.mdd/docs/c.md']
    await loadGitData('/repo/.mdd', files, new Map(files.map((f, i) => [f, `doc-${i}`])))
    const statusCalls = mockSpawn.mock.calls.filter(
      ([, args]) => (args as string[])[0] === 'status'
    )
    expect(statusCalls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('git — error handling', () => {
  it('should return empty results and set gitAvailable: false when git binary is missing', async () => {
    mockSpawn.mockImplementation(() => makeEnoentProc())
    const file = '/repo/.mdd/docs/a.md'
    const { entries, gitAvailable } = await loadGitData('/repo/.mdd', [file], new Map([[file, 'doc-a']]))
    expect(gitAvailable).toBe(false)
    expect(entries.size).toBe(0)
  })

  it('should return empty results and set gitAvailable: false when cwd is not a git repo', async () => {
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'status') return makeMockProc('', 128)
      return makeMockProc('', 0)
    })
    const file = '/repo/.mdd/docs/a.md'
    const { entries, gitAvailable } = await loadGitData('/repo/.mdd', [file], new Map([[file, 'doc-a']]))
    expect(gitAvailable).toBe(false)
    expect(entries.size).toBe(0)
  })

  it('should load other files successfully even if one file git log fails', async () => {
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'status') return makeMockProc('', 0)
      const filepath = args[args.length - 1] as string
      if (filepath?.includes('bad.md')) return makeErrorProc('ESPAWN')
      return makeMockProc('abc1234|2026-01-01T00:00:00Z|good commit|Alice', 0)
    })
    const files = ['/repo/.mdd/docs/good.md', '/repo/.mdd/docs/bad.md']
    const docIds = new Map([
      ['/repo/.mdd/docs/good.md', 'good'],
      ['/repo/.mdd/docs/bad.md', 'bad'],
    ])
    const { entries, gitAvailable } = await loadGitData('/repo/.mdd', files, docIds)
    expect(gitAvailable).toBe(true)
    expect(entries.get('good')?.commits).toHaveLength(1)
    expect(entries.get('bad')?.commits).toEqual([])
  })
})
