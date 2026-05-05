import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { createRequire } from 'node:module'
import { loadAllDocs } from './parser.js'
import { Cache } from './cache.js'
import { createServer } from './server.js'
import { startWatcher } from './watcher.js'
import { loadGitData } from './git.js'

// ---------------------------------------------------------------------------
// argv parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  help: boolean
  version: boolean
  noOpen: boolean
  port: number | null
  projectDir: string | null
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, version: false, noOpen: false, port: null, projectDir: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') { args.help = true }
    else if (arg === '--version' || arg === '-v') { args.version = true }
    else if (arg === '--no-open') { args.noOpen = true }
    else if (arg === '--port') {
      const val = argv[++i]
      if (val !== undefined) args.port = parseInt(val, 10)
    } else if (arg === '--path') {
      const val = argv[++i]
      if (val !== undefined) args.projectDir = val
    }
  }
  return args
}

// ---------------------------------------------------------------------------
// Port scanning
// ---------------------------------------------------------------------------

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

async function findFreePort(start: number): Promise<number | null> {
  const end = start === 7321 ? 7340 : start
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port
  }
  return null
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)

  if (args.help) {
    process.stdout.write([
      'Usage: mdd-dashboard [options]',
      '',
      'Options:',
      '  --path <dir>   Project directory (default: cwd)',
      '  --port <n>     Starting port to use (default: 7321)',
      '  --no-open      Skip opening the browser',
      '  --version      Print version and exit',
      '  --help         Print this message and exit',
      '',
    ].join('\n'))
    process.exit(0)
  }

  if (args.version) {
    const require = createRequire(import.meta.url)
    const pkg = require('../package.json') as { version: string }
    process.stdout.write(pkg.version + '\n')
    process.exit(0)
  }

  // Resolve project directory
  let projectDir: string
  if (args.projectDir !== null) {
    const resolved = path.resolve(process.cwd(), args.projectDir)
    try {
      projectDir = await fs.realpath(resolved)
    } catch {
      projectDir = resolved
    }
  } else {
    projectDir = process.cwd()
  }

  const mddDir = path.join(projectDir, '.mdd')

  // Check for .mdd/ directory
  try {
    await fs.stat(mddDir)
  } catch {
    process.stderr.write('Error: no .mdd/ directory found. Is this an MDD project?\n')
    process.exit(1)
  }

  // Tier 1: load all docs, build graph
  const entries = await loadAllDocs(mddDir)
  const cache = new Cache()
  cache.seed(entries)

  // Find free port
  const startPort = args.port ?? 7321
  const port = await findFreePort(startPort)
  if (port === null) {
    process.stderr.write(`Error: no free port found in range ${startPort}–${startPort === 7321 ? 7340 : startPort}\n`)
    process.exit(1)
  }

  // Start HTTP server (gitAvailable mutated to true after Tier 3 finishes)
  const serverOptions = { gitAvailable: false }
  const server = createServer(cache, serverOptions)

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  process.stdout.write(`MDD Dashboard running at http://localhost:${port} — press Ctrl+C to stop\n`)

  // Start file watcher
  const stopWatcher = startWatcher(mddDir, cache)

  // Open browser (unless --no-open)
  if (!args.noOpen) {
    const { default: open } = await import('open')
    open(`http://localhost:${port}`).catch(() => {})
  }

  // Register SIGINT / SIGTERM handlers
  const shutdown = (): void => {
    stopWatcher()
    server.closeAllConnections()
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.on('unhandledRejection', (err) => {
    process.stderr.write(`[mdd-dashboard] unhandled rejection: ${String(err)}\n`)
  })

  // Tier 3: async git load — non-blocking, does not await
  void (async () => {
    const filepaths = Array.from(entries.keys())
    const docIds = new Map(
      Array.from(entries.entries()).map(([fp, e]) => [fp, e.data.id]),
    )
    const { entries: gitEntries, gitAvailable } = await loadGitData(mddDir, filepaths, docIds)

    if (gitAvailable) {
      serverOptions.gitAvailable = true
      cache.enrichWithGit(gitEntries)
    }
  })()
}
