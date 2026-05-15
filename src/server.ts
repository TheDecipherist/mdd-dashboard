import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import matter from 'gray-matter'
import type { Cache, SseDelta } from './cache.js'
import { getTemplate } from './template.js'
import { parseConnections } from './connections-parser.js'

// Lazy-loaded on first /api/doc/:id request — never at startup
let _markedFn: ((src: string) => string | Promise<string>) | null = null

async function loadMarked(): Promise<(src: string) => string | Promise<string>> {
  if (_markedFn === null) {
    const mod = await import('marked')
    _markedFn = mod.marked as (src: string) => string | Promise<string>
  }
  return _markedFn
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

export function createServer(
  cache: Cache,
  options: { gitAvailable?: boolean; mddDir?: string } = {},
): http.Server {
  return http.createServer(async (req, res) => {
    const url = req.url ?? '/'

    if (url === '/') {
      const html = getTemplate()
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
      })
      res.end(html)
      return
    }

    if (url === '/api/data') {
      sendJson(res, 200, cache.graph)
      return
    }

    if (url.startsWith('/api/doc/')) {
      const id = decodeURIComponent(url.slice('/api/doc/'.length))

      let filepath: string | undefined
      let fmMtime = 0
      for (const [fp, entry] of cache.frontmatter) {
        if (entry.data.id === id) {
          filepath = fp
          fmMtime = entry.mtime
          break
        }
      }

      if (filepath === undefined) {
        sendJson(res, 404, { error: 'doc not found' })
        return
      }

      const cached = cache.body.get(id)
      if (cached !== undefined && cached.mtime === fmMtime) {
        sendJson(res, 200, { html: cached.html })
        return
      }

      const raw = await fs.readFile(filepath, 'utf-8')
      const { content } = matter(raw)
      const markedFn = await loadMarked()
      const html = String(await Promise.resolve(markedFn(content)))
      cache.body.set(id, { mtime: fmMtime, html })
      sendJson(res, 200, { html })
      return
    }

    if (url.startsWith('/api/git/')) {
      const id = decodeURIComponent(url.slice('/api/git/'.length))

      if (!(options.gitAvailable ?? false)) {
        sendJson(res, 404, { error: 'git not available' })
        return
      }

      const gitEntry = cache.git.get(id)
      if (gitEntry === undefined) {
        sendJson(res, 404, { error: 'doc not found' })
        return
      }

      sendJson(res, 200, {
        commits: gitEntry.commits,
        hasUncommittedChanges: gitEntry.hasUncommittedChanges,
      })
      return
    }

    if (url.startsWith('/api/open')) {
      const fileParam = new URL(url, 'http://localhost').searchParams.get('file')
      if (!fileParam) {
        sendJson(res, 400, { error: 'file param required' })
        return
      }
      spawn('code', [fileParam], { detached: true, stdio: 'ignore' }).unref()
      res.writeHead(204)
      res.end()
      return
    }

    if (url === '/api/connections') {
      if (!options.mddDir) {
        sendJson(res, 404, { error: 'no connections.md' })
        return
      }
      const connectionsPath = path.join(options.mddDir, 'connections.md')
      try {
        const raw = await fs.readFile(connectionsPath, 'utf-8')
        sendJson(res, 200, parseConnections(raw))
      } catch (err: unknown) {
        const isNotFound = typeof err === 'object' && err !== null && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
        if (isNotFound) {
          sendJson(res, 404, { error: 'no connections.md' })
        } else {
          sendJson(res, 500, { error: 'parse error', message: String(err) })
        }
      }
      return
    }

    if (url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      res.write('\n')

      const listener = (delta: SseDelta): void => {
        res.write(`data: ${JSON.stringify(delta)}\n\n`)
      }

      cache.addListener(listener)
      req.on('close', () => {
        cache.removeListener(listener)
      })
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })
}
