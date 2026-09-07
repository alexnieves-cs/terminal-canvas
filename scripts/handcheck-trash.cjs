/* The one arm of `npm run handcheck` that needs Electron: `shell.trashItem`
   is Electron's and unreachable from plain node. Run as
   ELECTRON_RUN_AS_NODE=1 <Electron> scripts/handcheck-trash.cjs — no window,
   no app.whenReady: shell.trashItem works from a node-mode Electron process.
   It creates a temp file, trashes it, and prints ONE JSON line: whether the
   file left its directory, and the path (so the person can see it in the
   Trash and empty it). */
const { mkdtempSync, writeFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
;(async () => {
  let out
  const { app, shell } = require('electron')
  try {
    await app.whenReady()
    const dir = mkdtempSync(join(tmpdir(), 'tc handcheck trash '))
    const file = join(dir, 'handcheck-trash-me.txt')
    writeFileSync(file, 'trashed by npm run handcheck\n')
    await shell.trashItem(file)
    out = { ok: !existsSync(file), path: file }
  } catch (error) {
    out = { ok: false, error: String(error && error.message || error) }
  }
  process.stdout.write(JSON.stringify(out) + '\n')
  app.exit(0)
})()
