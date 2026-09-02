/**
 * M54 — the `tc` launcher main writes into userData/bin.
 *
 * A two-line shell script that runs THIS Electron binary as node over the
 * bundled CLI, so no separate node is needed on the machine. Both paths are
 * quoted because the packaged app lives under "Terminal Canvas.app". Written
 * through an injected writeFile so the compare-then-write is drivable under
 * plain node, and compared first so a launch is not a write.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function launcherScript(paths: { execPath: string; cliPath: string }): string {
  const q = (s: string): string => `"${s.replace(/(["$`\\])/g, '\\$1')}"`
  return [
    '#!/bin/sh',
    '# Written by Terminal Canvas (M54). Runs the app binary as node over the bundled tc CLI.',
    `ELECTRON_RUN_AS_NODE=1 exec ${q(paths.execPath)} ${q(paths.cliPath)} "$@"`,
    ''
  ].join('\n')
}

export function writeLauncher(input: {
  dir: string
  script: string
  writeFile: (path: string, content: string) => void
}): string {
  const path = join(input.dir, 'tc')
  mkdirSync(input.dir, { recursive: true })
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (current !== input.script) input.writeFile(path, input.script)
  return path
}
