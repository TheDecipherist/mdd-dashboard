import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}))

vi.mock('marked', () => ({
  marked: vi.fn().mockReturnValue('<p>rendered html</p>'),
}))

vi.mock('node:child_process', () => ({
  default: { spawn: vi.fn().mockReturnValue({ unref: vi.fn() }) },
  spawn: vi.fn().mockReturnValue({ unref: vi.fn() }),
}))

import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { Cache } from '../src/cache.js'
import { createServer } from '../src/server.js'

const mockReadFile = vi.mocked(fs.readFile)
const mockSpawn = vi.mocked(spawn)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function get(
  server: http.Server,
  path: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const { port } = server.address() as { port: number }
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += String(chunk) })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
  })
}

function startServer(cache: Cache, opts: { gitAvailable?: boolean } = {}): Promise<http.Server> {
  const server = createServer(cache, { gitAvailable: opts.gitAvailable ?? false })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })
}

function makeCache(id = 'test-doc', filepath = '/mdd/docs/test-doc.md'): Cache {
  const cache = new Cache()
  cache.seed(
    new Map([
      [
        filepath,
        {
          mtime: 1000,
          data: {
            id,
            title: 'Test Doc',
            type: 'feature' as const,
            status: 'draft',
            depends_on: [],
            initiative: null,
            wave: null,
            wave_status: null,
            known_issues_count: 0,
            last_synced: '2026-01-01',
            mdd_version: 1,
            source_files: [],
            routes: [],
            edition: '',
            folder: 'docs' as const,
            filepath: 'docs/test-doc.md',
            git: null,
          },
        },
      ],
    ]),
  )
  return cache
}

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET /api/data
// ---------------------------------------------------------------------------

describe('server — GET /api/data', () => {
  let server: http.Server

  beforeEach(async () => {
    server = await startServer(makeCache())
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it('should return 200 with application/json content-type', async () => {
    const { status, headers } = await get(server, '/api/data')
    expect(status).toBe(200)
    expect(headers['content-type']).toContain('application/json')
  })

  it('should return an object with nodes[] and edges[] arrays', async () => {
    const { body } = await get(server, '/api/data')
    const parsed = JSON.parse(body) as { nodes: unknown[]; edges: unknown[] }
    expect(Array.isArray(parsed.nodes)).toBe(true)
    expect(Array.isArray(parsed.edges)).toBe(true)
    expect(parsed.nodes.length).toBeGreaterThan(0)
  })

  it('should include Access-Control-Allow-Origin: * header', async () => {
    const { headers } = await get(server, '/api/data')
    expect(headers['access-control-allow-origin']).toBe('*')
  })

  it('should serve directly from graphCache without reading disk', async () => {
    await get(server, '/api/data')
    expect(mockReadFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// GET /api/doc/:id
// ---------------------------------------------------------------------------

describe('server — GET /api/doc/:id', () => {
  let server: http.Server
  let cache: Cache

  beforeEach(async () => {
    cache = makeCache()
    mockReadFile.mockResolvedValue('# Test\n\nContent.' as never)
    server = await startServer(cache)
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it('should return 200 with { html: string } for a known doc id', async () => {
    const { status, body } = await get(server, '/api/doc/test-doc')
    const parsed = JSON.parse(body) as { html: string }
    expect(status).toBe(200)
    expect(typeof parsed.html).toBe('string')
    expect(parsed.html.length).toBeGreaterThan(0)
    expect(parsed.html).toContain('<p>')
  })

  it('should include Access-Control-Allow-Origin: * header', async () => {
    const { headers } = await get(server, '/api/doc/test-doc')
    expect(headers['access-control-allow-origin']).toBe('*')
  })

  it('should return 404 { error: "doc not found" } for an unknown id', async () => {
    const { status, body } = await get(server, '/api/doc/nonexistent')
    const parsed = JSON.parse(body) as { error: string }
    expect(status).toBe(404)
    expect(parsed.error).toBe('doc not found')
  })

  it('should cache the rendered HTML on second request (no second disk read)', async () => {
    await get(server, '/api/doc/test-doc')
    await get(server, '/api/doc/test-doc')
    expect(mockReadFile).toHaveBeenCalledOnce()
  })

  it('should dynamically import marked on first request only', async () => {
    const { marked } = await import('marked')
    const mockMarked = vi.mocked(marked)

    await get(server, '/api/doc/test-doc')
    await get(server, '/api/doc/test-doc')

    // Body cache serves the second request — marked() is not called again
    expect(mockMarked).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// GET /api/git/:id
// ---------------------------------------------------------------------------

describe('server — GET /api/git/:id', () => {
  let server: http.Server

  afterEach(async () => {
    await stopServer(server)
  })

  it('should return { commits: GitCommit[], hasUncommittedChanges: boolean } for a known id', async () => {
    const cache = makeCache()
    cache.git.set('test-doc', {
      commits: [
        {
          hash: 'abc123',
          shortHash: 'abc1234',
          date: '2026-01-01T00:00:00Z',
          relativeDate: '4 months ago',
          message: 'init',
          author: 'Alice',
        },
      ],
      hasUncommittedChanges: false,
      loadedAt: 0,
    })
    server = await startServer(cache, { gitAvailable: true })

    const { status, body } = await get(server, '/api/git/test-doc')
    const parsed = JSON.parse(body) as { commits: unknown[]; hasUncommittedChanges: boolean }
    expect(status).toBe(200)
    expect(Array.isArray(parsed.commits)).toBe(true)
    expect(typeof parsed.hasUncommittedChanges).toBe('boolean')
  })

  it('should include Access-Control-Allow-Origin: * header', async () => {
    const cache = makeCache()
    cache.git.set('test-doc', { commits: [], hasUncommittedChanges: false, loadedAt: 0 })
    server = await startServer(cache, { gitAvailable: true })

    const { headers } = await get(server, '/api/git/test-doc')
    expect(headers['access-control-allow-origin']).toBe('*')
  })

  it('should return 404 { error: "git not available" } when git is unavailable', async () => {
    server = await startServer(makeCache(), { gitAvailable: false })

    const { status, body } = await get(server, '/api/git/test-doc')
    const parsed = JSON.parse(body) as { error: string }
    expect(status).toBe(404)
    expect(parsed.error).toBe('git not available')
  })

  it('should return 404 { error: "doc not found" } for an unknown doc id', async () => {
    server = await startServer(makeCache(), { gitAvailable: true })

    const { status, body } = await get(server, '/api/git/nonexistent')
    const parsed = JSON.parse(body) as { error: string }
    expect(status).toBe(404)
    expect(parsed.error).toBe('doc not found')
  })
})

// ---------------------------------------------------------------------------
// GET /events (SSE)
// ---------------------------------------------------------------------------

describe('server — GET /events (SSE)', () => {
  let server: http.Server
  let cache: Cache

  beforeEach(async () => {
    cache = makeCache()
    server = await startServer(cache)
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it('should respond with content-type text/event-stream', async () => {
    const { port } = server.address() as { port: number }
    const headers = await new Promise<http.IncomingHttpHeaders>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
        resolve(res.headers)
        req.destroy()
      })
      req.on('error', () => {})
    })
    expect(headers['content-type']).toContain('text/event-stream')
  })

  it('should include Connection: keep-alive and Cache-Control: no-cache headers', async () => {
    const { port } = server.address() as { port: number }
    const headers = await new Promise<http.IncomingHttpHeaders>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
        resolve(res.headers)
        req.destroy()
      })
      req.on('error', () => {})
    })
    expect(headers['connection']).toBe('keep-alive')
    expect(headers['cache-control']).toBe('no-cache')
  })

  it('should push a data event to connected clients when a node-update is broadcast', async () => {
    const { port } = server.address() as { port: number }

    const received = await new Promise<{ type: string; id: string }>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
        res.on('data', (chunk) => {
          const text = String(chunk)
          for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) {
              resolve(JSON.parse(line.slice(6)) as { type: string; id: string })
              req.destroy()
              return
            }
          }
        })

        // Emit after connection is fully registered (server runs synchronously before headers are flushed)
        setImmediate(() => {
          const node = cache.graph.nodes[0]
          if (node !== undefined) {
            cache['emit']({ type: 'node-update', id: node.id, node })
          }
        })
      })
      req.on('error', () => {})
    })

    expect(received.type).toBe('node-update')
    expect(received.id).toBe('test-doc')
  })

  it('should remove client from active list on connection close', async () => {
    const { port } = server.address() as { port: number }
    type WithListeners = { _listeners: Set<unknown> }
    const listeners = (cache as unknown as WithListeners)._listeners

    await new Promise<void>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/events' }, () => {
        setImmediate(() => {
          req.destroy()
          setTimeout(resolve, 50)
        })
      })
      req.on('error', () => {})
    })

    expect(listeners.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe('server — GET /', () => {
  let server: http.Server

  beforeEach(async () => {
    server = await startServer(makeCache())
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it('should return 200 with content-type text/html; charset=utf-8', async () => {
    const { status, headers } = await get(server, '/')
    expect(status).toBe(200)
    expect(headers['content-type']).toContain('text/html')
    expect(headers['content-type']).toContain('charset=utf-8')
  })

  it('should return a non-empty HTML string containing a <script> tag (D3 bootstrap)', async () => {
    const { body } = await get(server, '/')
    expect(body.length).toBeGreaterThan(0)
    expect(body).toContain('<script')
  })
})

// ---------------------------------------------------------------------------
// GET /api/open
// ---------------------------------------------------------------------------

describe('server — GET /api/open', () => {
  let server: http.Server

  beforeEach(async () => {
    server = await startServer(makeCache())
    mockSpawn.mockClear()
  })

  afterEach(async () => {
    await stopServer(server)
  })

  it('should return 204 and call spawn("code", [file]) for a valid file path', async () => {
    const { status } = await get(server, '/api/open?file=%2Fsome%2Ffile.ts')
    expect(status).toBe(204)
    expect(mockSpawn).toHaveBeenCalledWith('code', ['/some/file.ts'], expect.objectContaining({ detached: true }))
  })

  it('should return 400 { error: "file param required" } when file param is absent', async () => {
    const { status, body } = await get(server, '/api/open')
    const parsed = JSON.parse(body) as { error: string }
    expect(status).toBe(400)
    expect(parsed.error).toBe('file param required')
  })

  it('should return 400 { error: "file param required" } when file param is empty string', async () => {
    const { status, body } = await get(server, '/api/open?file=')
    const parsed = JSON.parse(body) as { error: string }
    expect(status).toBe(400)
    expect(parsed.error).toBe('file param required')
  })
})
