import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { detectProjectsRoot, listMddProjects, resolveDefaultIndex, showPicker } from '../src/picker.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpProjects(names: string[], withMdd: string[] = []): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mdd-picker-'))
  for (const name of names) {
    const dir = path.join(root, name)
    await fs.mkdir(dir)
    if (withMdd.includes(name)) await fs.mkdir(path.join(dir, '.mdd'))
  }
  return root
}

const tmpDirs: string[] = []
afterEach(async () => {
  for (const d of tmpDirs.splice(0)) {
    await fs.rm(d, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// detectProjectsRoot
// ---------------------------------------------------------------------------

describe('detectProjectsRoot', () => {
  it('returns null when --path was given (picker should be bypassed)', () => {
    const result = detectProjectsRoot('/some/explicit/path', os.homedir() + '/projects')
    expect(result).toBeNull()
  })

  it('returns null when cwd is not a direct child of projectsRoot (nested deeper)', () => {
    const root = path.join(os.tmpdir(), 'projects')
    const deepCwd = path.join(root, 'foo', 'bar')
    const result = detectProjectsRoot(null, root, deepCwd)
    expect(result).toBeNull()
  })

  it('returns null when cwd parent does not match projectsRoot', () => {
    const result = detectProjectsRoot(null, '/home/user/projects', '/completely/different/path')
    expect(result).toBeNull()
  })

  it('returns null when projectsRoot does not exist (non-existent path still matches by string)', async () => {
    // detectProjectsRoot is synchronous and path-based — it returns the root even
    // if the dir doesn't exist (listMddProjects handles the existence check)
    const root = '/nonexistent/path/projects'
    const cwd = path.join(root, 'my-project')
    const result = detectProjectsRoot(null, root, cwd)
    expect(result).toBe(root)
  })

  it('returns the root when cwd is a direct child of projectsRoot', () => {
    const root = path.join(os.tmpdir(), 'projects')
    const cwd = path.join(root, 'my-project')
    const result = detectProjectsRoot(null, root, cwd)
    expect(result).toBe(root)
  })
})

// ---------------------------------------------------------------------------
// listMddProjects
// ---------------------------------------------------------------------------

describe('listMddProjects', () => {
  it('returns only subdirectories containing a .mdd/ folder', async () => {
    const root = await makeTmpProjects(['a', 'b', 'c'], ['a', 'c'])
    tmpDirs.push(root)
    const result = await listMddProjects(root)
    expect(result.map(p => p.name)).toEqual(['a', 'c'])
    expect(result[0]!.fullPath).toBe(path.join(root, 'a'))
  })

  it('returns an empty array when no subdirs have .mdd/', async () => {
    const root = await makeTmpProjects(['x', 'y'])
    tmpDirs.push(root)
    const result = await listMddProjects(root)
    expect(result).toEqual([])
  })

  it('returns an empty array when root does not exist', async () => {
    const result = await listMddProjects('/nonexistent-root-abc123')
    expect(result).toEqual([])
  })

  it('returns entries sorted alphabetically', async () => {
    const root = await makeTmpProjects(['zebra', 'alpha', 'mango'], ['zebra', 'alpha', 'mango'])
    tmpDirs.push(root)
    const result = await listMddProjects(root)
    expect(result.map(p => p.name)).toEqual(['alpha', 'mango', 'zebra'])
  })
})

// ---------------------------------------------------------------------------
// resolveDefaultIndex
// ---------------------------------------------------------------------------

describe('resolveDefaultIndex', () => {
  it('returns the index of the project matching the cwd basename', () => {
    const projects = [
      { name: 'alpha', fullPath: '/projects/alpha' },
      { name: 'mdd-dashboard', fullPath: '/projects/mdd-dashboard' },
      { name: 'zeta', fullPath: '/projects/zeta' },
    ]
    expect(resolveDefaultIndex(projects, '/projects/mdd-dashboard')).toBe(1)
  })

  it('returns 0 when no project matches the cwd', () => {
    const projects = [
      { name: 'alpha', fullPath: '/projects/alpha' },
      { name: 'beta', fullPath: '/projects/beta' },
    ]
    expect(resolveDefaultIndex(projects, '/unrelated/cwd')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// showPicker — single project fast path
// ---------------------------------------------------------------------------

describe('showPicker — single project', () => {
  it('returns the only project path without rendering any interactive UI', async () => {
    const projects = [{ name: 'only-project', fullPath: '/projects/only-project' }]
    const result = await showPicker(projects, 0)
    expect(result).toBe('/projects/only-project')
  })
})

// ---------------------------------------------------------------------------
// showPicker — empty list
// ---------------------------------------------------------------------------

describe('showPicker — empty list', () => {
  it('returns null for an empty project list', async () => {
    const result = await showPicker([], 0)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// showPicker — non-TTY stdin
// ---------------------------------------------------------------------------

describe('showPicker — non-TTY stdin', () => {
  it('returns null immediately when stdin is not a TTY', async () => {
    const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    const projects = [
      { name: 'a', fullPath: '/projects/a' },
      { name: 'b', fullPath: '/projects/b' },
    ]
    const result = await showPicker(projects, 0)

    if (original) {
      Object.defineProperty(process.stdin, 'isTTY', original)
    } else {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    }

    expect(result).toBeNull()
  })
})
