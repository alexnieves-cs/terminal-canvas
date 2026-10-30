/* M619. OrchestrationView.tsx was split into the view plus three sibling files
   (OrchGraphBoard.tsx, OrchDetailParts.tsx, orch-view-hooks.ts). A source-text
   pin that read the view alone would go silently GREEN on a negative check
   (`!/x/.test(view)`) once the code it guarded moved out, so every such pin
   reads the view's whole family through this one function instead. A new
   split file is added HERE, once, and every pin follows. */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const ORCH_VIEW_FILES = ['OrchestrationView.tsx', 'OrchGraphBoard.tsx', 'OrchDetailParts.tsx', 'orch-view-hooks.ts']

function orchViewSource(root = join(__dirname, '..', '..')) {
  return ORCH_VIEW_FILES.map((f) => readFileSync(join(root, 'src/renderer/orchestration', f), 'utf8')).join('\n')
}

module.exports = { ORCH_VIEW_FILES, orchViewSource }
