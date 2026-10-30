/* M620. palette/commands.ts builds its rows through section files in
   palette/commands/ (panel-rows, new-panel-rows, canvas-rows, manage-rows, and
   the older M278 builders). A pin that greps "commands.ts" for a literal
   `id: '…'` row would go red when the row moved, and a NEGATIVE pin would go
   silently green, so every row pin reads the family through this function.
   commands.ts comes first, so a slice that starts in it (closure.1's
   PaletteActions) still reads the same text. */
'use strict'
const { readFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

function paletteFiles(root = join(__dirname, '..', '..')) {
  const dir = join(root, 'src/renderer/palette/commands')
  return [join(root, 'src/renderer/palette/commands.ts'), ...readdirSync(dir).filter((f) => f.endsWith('.ts')).sort().map((f) => join(dir, f))]
}

function paletteSource(root) {
  return paletteFiles(root).map((f) => readFileSync(f, 'utf8')).join('\n')
}

module.exports = { paletteFiles, paletteSource }
