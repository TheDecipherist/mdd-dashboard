import { spawn } from 'node:child_process'
import * as nodePath from 'node:path'
import { GitCommit, GitCacheEntry } from './graph.js'

// ---------------------------------------------------------------------------
// parseGitLog
// ---------------------------------------------------------------------------

/**
 * Parse raw stdout from:
 *   git log --follow --format="%H|%aI|%s|%an" --max-count=100 -- <file>
 *
 * Each non-empty line is split on the first three `|` occurrences to produce
 * exactly four fields: hash, date, message, author.  The message field (%s)
 * is the git "subject" — it rarely contains `|`, but we handle it correctly
 * by only splitting on the first three pipe characters.
 */
export function parseGitLog(output: string): GitCommit[] {
  const lines = output.split('\n').filter(l => l.trim().length > 0)
  const capped = lines.slice(0, 100)

  return capped.map(line => {
    // Split on first three `|` chars to get exactly 4 parts.
    const parts: string[] = []
    let remaining = line
    for (let i = 0; i < 3; i++) {
      const idx = remaining.indexOf('|')
      if (idx === -1) {
        // Malformed line — push what we have and break.
        parts.push(remaining)
        remaining = ''
        break
      }
      parts.push(remaining.slice(0, idx))
      remaining = remaining.slice(idx + 1)
    }
    // Whatever is left (may include `|`) is the last field.
    parts.push(remaining)

    const hash = parts[0] ?? ''
    const date = parts[1] ?? ''
    const message = parts[2] ?? ''
    const author = parts[3] ?? ''

    return {
      hash,
      shortHash: hash.slice(0, 7),
      date,
      relativeDate: computeRelativeDate(date),
      message,
      author,
    }
  })
}

// ---------------------------------------------------------------------------
// computeRelativeDate
// ---------------------------------------------------------------------------

/**
 * Convert an ISO 8601 date string to a human-readable relative string.
 * The optional `now` parameter (milliseconds since epoch) defaults to
 * Date.now() and exists solely to make the function deterministically
 * testable without real timers.
 */
export function computeRelativeDate(isoDate: string, now?: number): string {
  const base = now ?? Date.now()
  const then = new Date(isoDate).getTime()
  const diffSec = Math.max(0, Math.floor((base - then) / 1000))

  if (diffSec < 60) {
    return 'just now'
  }
  if (diffSec < 3_600) {
    return `${Math.floor(diffSec / 60)} minutes ago`
  }
  if (diffSec < 86_400) {
    return `${Math.floor(diffSec / 3_600)} hours ago`
  }
  if (diffSec < 7 * 86_400) {
    return `${Math.floor(diffSec / 86_400)} days ago`
  }
  if (diffSec < 30 * 86_400) {
    return `${Math.floor(diffSec / (7 * 86_400))} weeks ago`
  }
  if (diffSec < 365 * 86_400) {
    return `${Math.floor(diffSec / (30 * 86_400))} months ago`
  }
  return `${Math.floor(diffSec / (365 * 86_400))} years ago`
}

// ---------------------------------------------------------------------------
// Internal helpers — spawn wrappers
// ---------------------------------------------------------------------------

interface SpawnResult {
  stdout: string
  stderr: string
  code: number | null
}

/**
 * Spawn a process and collect stdout/stderr.  Resolves with the captured
 * output and exit code.  Rejects only on spawn errors (e.g. ENOENT).
 */
function spawnCollect(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    child.on('error', reject)

    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        code,
      })
    })
  })
}

// ---------------------------------------------------------------------------
// loadGitData
// ---------------------------------------------------------------------------

/**
 * Load git history and uncommitted-change status for the given absolute
 * filepaths, all in a single `Promise.all` — never sequential.
 *
 * @param mddDir   - Absolute path to the .mdd directory (used as cwd for git)
 * @param filepaths - Absolute paths to the .md files of interest
 * @param docIds    - Map from absolute filepath → docId string
 *
 * Returns:
 *   entries      - Map<docId, GitCacheEntry>
 *   gitAvailable - false if git is not installed or the directory is not a repo
 */
export async function loadGitData(
  mddDir: string,
  filepaths: string[],
  docIds: Map<string, string>,
): Promise<{ entries: Map<string, GitCacheEntry>; gitAvailable: boolean }> {
  // We need the repo root (or mddDir itself as the cwd for git commands).
  // git status --short is run once with mddDir as cwd.
  const cwd = mddDir

  // -------------------------------------------------------------------------
  // Phase 1: Quick git-availability probe.
  // We detect ENOENT (binary missing) and exit-code 128 (not a git repo).
  // We do this by attempting git status first; if it fails fatally we bail.
  // -------------------------------------------------------------------------

  // Run git status and all per-file git logs concurrently.
  // We need to know gitAvailable before constructing entries, but we don't
  // want to sequence status → then logs.  Instead, run everything at once and
  // examine results together.

  // Build per-file log promises.
  const fileLogPromises: Promise<{ filepath: string; result: SpawnResult | null }>[] =
    filepaths.map(async filepath => {
      try {
        const result = await spawnCollect(
          'git',
          ['log', '--follow', '--format=%H|%aI|%s|%an', '--max-count=100', '--', filepath],
          cwd,
        )
        return { filepath, result }
      } catch (err: unknown) {
        // spawn error (e.g. ENOENT) — propagate as null so outer logic can
        // detect gitAvailable = false.
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return { filepath, result: null }
        }
        // Other spawn errors — log and treat as per-file failure.
        process.stderr.write(
          `[git] spawn error for ${filepath}: ${String(err)}\n`,
        )
        return { filepath, result: null }
      }
    })

  // Build the single git-status promise.
  const statusPromise: Promise<SpawnResult | null> = spawnCollect(
    'git',
    ['status', '--short', '.mdd/'],
    cwd,
  ).catch((err: unknown) => {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      process.stderr.write(`[git] status spawn error: ${String(err)}\n`)
    }
    return null
  })

  // Await everything concurrently.
  const [fileLogResults, statusResult] = await Promise.all([
    Promise.all(fileLogPromises),
    statusPromise,
  ])

  // -------------------------------------------------------------------------
  // Phase 2: Determine gitAvailable.
  // -------------------------------------------------------------------------

  // If status spawn returned null → ENOENT → git not available.
  if (statusResult === null) {
    return { entries: new Map(), gitAvailable: false }
  }

  // Exit code 128 from git status → not a git repo.
  if (statusResult.code === 128) {
    return { entries: new Map(), gitAvailable: false }
  }

  // Check if any per-file log returned null due to ENOENT.
  // (If status succeeded but a per-file spawn emitted ENOENT that's odd, but
  // be safe — treat it as git not available.)
  const hasEnoent = fileLogResults.some(r => r.result === null)
  if (hasEnoent) {
    // Distinguish: if all returned null it's likely ENOENT globally.
    // If only some, treat individually below.
    // We already know git binary exists (status succeeded), so a null here
    // is a per-file spawn error we already logged. Proceed with partial results.
  }

  // -------------------------------------------------------------------------
  // Phase 3: Parse git status output to find uncommitted files.
  // Format: "XY filename" — the filename may be the full relative path from
  // the repo root. We match by checking if the status line includes a segment
  // of the filepath.
  // -------------------------------------------------------------------------

  const statusLines = statusResult.stdout
    .split('\n')
    .filter(l => l.trim().length > 0)

  // Build a Set of relative paths (relative to cwd / repo root) that appear
  // in the status output.
  const uncommittedRelPaths = new Set<string>()
  for (const line of statusLines) {
    // Format: "XY <path>" or "XY <old> -> <new>" for renames.
    const trimmed = line.slice(3) // remove the two status chars + space
    // For renames ("R  old -> new"), take the new path (after "->").
    const arrowIdx = trimmed.indexOf(' -> ')
    const pathPart = arrowIdx !== -1 ? trimmed.slice(arrowIdx + 4) : trimmed
    uncommittedRelPaths.add(pathPart.trim())
  }

  // -------------------------------------------------------------------------
  // Phase 4: Build entries map.
  // -------------------------------------------------------------------------

  const entries = new Map<string, GitCacheEntry>()

  for (const { filepath, result } of fileLogResults) {
    const docId = docIds.get(filepath)
    if (docId === undefined) {
      // No docId mapping — skip.
      continue
    }

    // Determine uncommittedChanges by checking if any status path matches this
    // filepath (relative or absolute segment).
    const hasUncommittedChanges = [...uncommittedRelPaths].some(rel => {
      // rel is relative to repo root; filepath is absolute.
      // Check if the absolute filepath ends with the relative path.
      const normalRel = nodePath.normalize(rel)
      const normalAbs = nodePath.normalize(filepath)
      return normalAbs.endsWith(nodePath.sep + normalRel) || normalAbs === normalRel
    })

    if (result === null) {
      // Per-file spawn error — return empty entry.
      entries.set(docId, {
        commits: [],
        hasUncommittedChanges,
        loadedAt: Date.now(),
      })
      continue
    }

    // Exit code 128 on a per-file log → file not tracked / repo issue for this
    // file specifically.  Log and return empty.
    if (result.code === 128) {
      process.stderr.write(
        `[git] git log exited 128 for ${filepath} — skipping\n`,
      )
      entries.set(docId, {
        commits: [],
        hasUncommittedChanges,
        loadedAt: Date.now(),
      })
      continue
    }

    // Non-zero exit but not 128 — log and return empty for this file.
    if (result.code !== 0 && result.code !== null) {
      process.stderr.write(
        `[git] git log exited ${result.code} for ${filepath}: ${result.stderr.trim()}\n`,
      )
      entries.set(docId, {
        commits: [],
        hasUncommittedChanges,
        loadedAt: Date.now(),
      })
      continue
    }

    entries.set(docId, {
      commits: parseGitLog(result.stdout),
      hasUncommittedChanges,
      loadedAt: Date.now(),
    })
  }

  return { entries, gitAvailable: true }
}
