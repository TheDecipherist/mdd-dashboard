import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import chalk from 'chalk'

export interface Project {
  name: string
  fullPath: string
}

/**
 * Returns the projects root if the CWD is a direct child of it, otherwise null.
 * Returns null immediately when an explicit --path was given (picker should be bypassed).
 */
export function detectProjectsRoot(
  explicitPath: string | null,
  projectsRoot: string,
  cwd: string = process.cwd(),
): string | null {
  if (explicitPath !== null) return null
  const parent = path.dirname(cwd)
  const resolvedRoot = path.resolve(projectsRoot)
  if (parent !== resolvedRoot) return null
  return resolvedRoot
}

/**
 * Lists all direct subdirectories of root that contain a .mdd/ folder.
 * Returns empty array if root doesn't exist or has no MDD projects.
 */
export async function listMddProjects(root: string): Promise<Project[]> {
  let entries: string[]
  try {
    const dirents = await fs.readdir(root, { withFileTypes: true })
    entries = dirents.filter(d => d.isDirectory()).map(d => d.name)
  } catch {
    return []
  }

  const projects: Project[] = []
  await Promise.all(
    entries.map(async (name) => {
      const fullPath = path.join(root, name)
      try {
        await fs.stat(path.join(fullPath, '.mdd'))
        projects.push({ name, fullPath })
      } catch {
        // no .mdd/ — skip
      }
    }),
  )

  projects.sort((a, b) => a.name.localeCompare(b.name))
  return projects
}

/**
 * Returns the index of the project whose name matches the basename of cwd.
 * Falls back to 0 if no match.
 */
export function resolveDefaultIndex(projects: Project[], cwd: string): number {
  const base = path.basename(cwd)
  const idx = projects.findIndex(p => p.name === base)
  return idx === -1 ? 0 : idx
}

// ---------------------------------------------------------------------------
// Terminal renderer
// ---------------------------------------------------------------------------

function render(projects: Project[], cursor: number, lines: number): void {
  // Move up to overwrite previous render
  if (lines > 0) process.stdout.write(`\x1B[${lines}A\x1B[0J`)

  process.stdout.write(
    chalk.gray('  Select a project  ') +
    chalk.dim('(↑ ↓ to move, Enter to open, Ctrl-C to exit)') +
    '\n\n',
  )

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i]!
    if (i === cursor) {
      process.stdout.write('  ' + chalk.cyan.bold('●  ') + chalk.cyan.bold(p.name) + '\n')
    } else {
      process.stdout.write('  ' + chalk.dim('○  ') + chalk.white(p.name) + '\n')
    }
  }

  process.stdout.write('\n')
}

function clearRender(lines: number): void {
  if (lines > 0) process.stdout.write(`\x1B[${lines}A\x1B[0J`)
}

// Total lines written by render(): header(2) + projects(N) + trailing newline(1)
function renderLineCount(projects: Project[]): number {
  return 2 + projects.length + 1
}

/**
 * Shows the interactive picker and returns the selected project's fullPath,
 * or null if stdin is not a TTY or the user cancels.
 *
 * Single-project fast path: returns immediately without showing any UI.
 */
export async function showPicker(projects: Project[], defaultIndex: number): Promise<string | null> {
  if (projects.length === 0) return null

  if (projects.length === 1) {
    const p = projects[0]!
    process.stdout.write(chalk.green('✔ ') + chalk.white(`Using ${chalk.bold(p.name)}\n`))
    return p.fullPath
  }

  if (!process.stdin.isTTY) return null

  return new Promise<string | null>((resolve) => {
    let cursor = defaultIndex
    let rendered = 0

    const rl = readline.createInterface({ input: process.stdin })
    readline.emitKeypressEvents(process.stdin, rl)
    process.stdin.setRawMode(true)

    const cleanup = (result: string | null): void => {
      process.stdin.setRawMode(false)
      process.stdin.removeListener('keypress', onKey)
      rl.close()
      clearRender(rendered)
      resolve(result)
    }

    const onKey = (_: unknown, key: readline.Key): void => {
      if (!key) return

      if (key.sequence === '' || (key.ctrl && key.name === 'c')) {
        cleanup(null)
        process.exit(0)
        return
      }

      if (key.name === 'up' || key.name === 'k') {
        cursor = (cursor - 1 + projects.length) % projects.length
      } else if (key.name === 'down' || key.name === 'j') {
        cursor = (cursor + 1) % projects.length
      } else if (key.name === 'return') {
        const selected = projects[cursor]!
        process.stdout.write(chalk.green('✔ ') + chalk.white(`Opening ${chalk.bold(selected.name)}\n`))
        cleanup(selected.fullPath)
        return
      }

      render(projects, cursor, rendered)
      rendered = renderLineCount(projects)
    }

    process.stdin.on('keypress', onKey)
    render(projects, cursor, 0)
    rendered = renderLineCount(projects)
  })
}
