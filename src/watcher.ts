import fs from 'node:fs'
import type { Cache } from './cache.js'

export function startWatcher(mddDir: string, cache: Cache): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const watcher = fs.watch(mddDir, { recursive: true }, (_event, filename) => {
    if (!filename || !filename.endsWith('.md')) return

    const absolutePath = mddDir + '/' + filename.replace(/\\/g, '/')

    // Per-filepath debounce — each file gets its own 100ms window
    const existing = timers.get(absolutePath)
    if (existing !== undefined) clearTimeout(existing)

    timers.set(
      absolutePath,
      setTimeout(() => {
        timers.delete(absolutePath)
        cache.invalidate(absolutePath, mddDir).catch((err: unknown) => {
          process.stderr.write(`[watcher] error processing ${filename}: ${String(err)}\n`)
        })
      }, 100),
    )
  })

  watcher.on('error', (err) => {
    process.stderr.write(`[watcher] fs.watch error: ${String(err)}\n`)
  })

  return () => watcher.close()
}
