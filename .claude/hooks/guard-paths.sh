#!/bin/bash
# PreToolUse: stdin is JSON with tool_input.file_path. Exit 2 blocks the edit.
# Lead (and an unset lane, so a session that forgot RD_LANE is not stuck) may
# edit anything. Every other lane is limited to ownership.json, and styles.css
# is further limited to that lane's marker span — F1 owns the token blocks.
#
# Two runs share this hook. A lane named in docs/streams/ownership.json (the
# streams run, A–E) is checked against that file, where a file nobody owns is
# open to every lane and only another lane's file is refused. Any other lane
# is a redesign lane and keeps the redesign's stricter rules unchanged.
# The lane comes from RD_LANE, or from .git/tc-lane when the env cannot be
# set (a cloud session): the file lives under .git so it is never committed.
INPUT=$(cat)
export RD_GUARD_INPUT="$INPUT"
node << 'NODE'
const fs = require('fs')
const path = require('path')
const input = JSON.parse(process.env.RD_GUARD_INPUT || '{}')
let lane = process.env.RD_LANE || ''
if (!lane) {
  try { lane = fs.readFileSync(path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.git', 'tc-lane'), 'utf8').trim() } catch { lane = '' }
}
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const tool = input.tool_input || input
const file = tool.file_path || tool.path || ''
if (!file) process.exit(0)
const rel = path.relative(root, path.isAbsolute(file) ? file : path.join(root, file)).split(path.sep).join('/')
if (!lane || lane === 'lead') process.exit(0)
let streams = null
try { streams = JSON.parse(fs.readFileSync(path.join(root, 'docs/streams/ownership.json'), 'utf8')) } catch { streams = null }
if (streams && streams.lanes && streams.lanes[lane]) {
  const mmS = (g, p) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$').test(p)
  if (rel === 'src/renderer/styles.css') {
    const css = fs.readFileSync(path.join(root, rel), 'utf8')
    const open = '/* ── st:' + lane + ' ── */'
    const close = '/* ── /st:' + lane + ' ── */'
    const start = css.indexOf(open)
    const end = css.indexOf(close)
    if (start < 0 || end < 0 || end < start) {
      console.error('styles.css has no st:' + lane + ' markers. Add them in a one-line PR first.')
      process.exit(2)
    }
    const edits = Array.isArray(tool.edits) ? tool.edits : [tool]
    if ((tool.content || tool.contents) && !tool.old_string && !tool.edits) {
      console.error('Replacing styles.css wholesale is refused in the streams run. Edit inside the st:' + lane + ' markers.')
      process.exit(2)
    }
    for (const edit of edits) {
      const old = edit.old_string || ''
      const at = old ? css.indexOf(old) : -1
      if (!old || at < 0 || css.indexOf(old, at + 1) >= 0 || at < start || at + old.length > end + close.length) {
        console.error('styles.css: ' + lane + ' may edit only between its st:' + lane + ' markers. Override an older rule from inside your block; the later rule wins.')
        process.exit(2)
      }
    }
    process.exit(0)
  }
  if ((streams.shared_writable || []).some((g) => mmS(g, rel))) process.exit(0)
  if (streams.lanes[lane].some((g) => mmS(g, rel))) process.exit(0)
  const others = Object.entries(streams.lanes).filter(([id, gs]) => id !== lane && gs.some((g) => mmS(g, rel))).map(([id]) => id)
  if (others.length === 0) process.exit(0)
  console.error(rel + ' belongs to stream ' + others.join(', ') + ', not ' + lane + '. Append a request to docs/streams/requests.md, or expose what you need from your own files.')
  process.exit(2)
}
if (rel.startsWith('verify/visual/goldens/')) {
  console.error('Goldens are lead-only. Never set UPDATE_GOLDENS.')
  process.exit(2)
}
const own = require(path.join(root, 'docs/redesign/ownership.json'))
const mm = (g, p) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$').test(p)
const frozen = own.frozen || []
if (frozen.some((g) => mm(g, rel))) {
  console.error(rel + ' is frozen at rd-foundations. Append a request to docs/redesign/requests.md and stop.')
  process.exit(2)
}
const ownersOf = (p) => Object.entries(own.lanes).filter(([, gs]) => gs.some((g) => mm(g, p))).map(([id]) => id)
if (rel === 'src/renderer/styles.css' && lane !== 'F1') {
  const css = fs.readFileSync(path.join(root, rel), 'utf8')
  const open = '/* ── rd:' + lane + ' ── */'
  const close = '/* ── /rd:' + lane + ' ── */'
  const start = css.indexOf(open)
  const end = css.indexOf(close)
  if (start < 0 || end < 0 || end < start) {
    console.error('styles.css has no rd:' + lane + ' markers.')
    process.exit(2)
  }
  const regionEnd = end + close.length
  const edits = Array.isArray(tool.edits) ? tool.edits : [tool]
  const wholeFile = (tool.content || tool.contents) && !tool.old_string && !tool.edits
  if (wholeFile) {
    console.error('Replacing styles.css wholesale is F1 only. Edit inside the rd:' + lane + ' markers.')
    process.exit(2)
  }
  for (const edit of edits) {
    const old = edit.old_string
    if (!old) {
      console.error('styles.css edit for ' + lane + ' needs old_string inside the rd:' + lane + ' markers. F1 owns every other line.')
      process.exit(2)
    }
    let from = 0
    let count = 0
    let at = -1
    while (true) {
      const idx = css.indexOf(old, from)
      if (idx < 0) break
      count += 1
      at = idx
      from = idx + old.length
      if (count > 1) break
    }
    if (count !== 1 || at < start || at + old.length > regionEnd) {
      console.error('styles.css: ' + lane + ' may edit only between its rd:' + lane + ' markers. F1 owns the token blocks. The blank line between blocks is not yours.')
      process.exit(2)
    }
  }
  process.exit(0)
}
const mine = (own.lanes[lane] || []).concat(own.shared_writable || [])
if (mine.some((g) => mm(g, rel))) process.exit(0)
const owners = ownersOf(rel)
console.error(rel + ' is not owned by ' + lane + (owners.length ? ' (owner: ' + owners.join(', ') + ')' : '') + '. Expose a hook/component in your own files, or append a request to docs/redesign/requests.md.')
process.exit(2)
NODE
