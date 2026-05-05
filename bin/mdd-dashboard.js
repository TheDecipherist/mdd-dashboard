#!/usr/bin/env node
// Node version guard — must run before any ESM import that uses top-level syntax
const major = parseInt(process.versions.node.split('.')[0], 10)
if (major < 20) {
  process.stderr.write(
    `mdd-dashboard requires Node.js >= 20 (found ${process.versions.node})\n`,
  )
  process.exit(1)
}

const { main } = await import('../dist/cli.js')
await main()
