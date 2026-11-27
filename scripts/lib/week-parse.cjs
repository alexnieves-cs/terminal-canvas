/* M701. The pure half of scripts/collect-week.cjs: text in, counts out. No
   fs, no child_process, so verify:event-log can feed it fixtures.

   Every function here keeps COUNTS and never content. A shell history line
   becomes its first word (`git`, `npm`, `code`); a Claude Code transcript
   becomes how many prompts, turns and tool calls it holds and how long the
   gaps were; a layout file becomes how many panels of each kind it holds; a
   git log becomes commits and lines. The week's report is meant to be read
   by its owner and pasted into a planning session, and none of it should
   need redacting first. */
'use strict'

/* The program a history line ran, or null. Leading `FOO=bar` assignments and
   a `sudo`/`time`/`env`/`command`/`exec`/`nohup` prefix are skipped; a path is
   reduced to its last part; anything that is not a plain program name is
   `other`, so a pasted secret on the command line never becomes a key. */
const PREFIXES = new Set(['sudo', 'time', 'env', 'command', 'exec', 'nohup', 'builtin', 'noglob'])
function firstWord(command) {
  const tokens = String(command).trim().split(/\s+/)
  for (const raw of tokens) {
    if (raw === '') continue
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(raw)) continue
    if (PREFIXES.has(raw)) continue
    const base = raw.replace(/^.*\//, '')
    return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(base) ? base : 'other'
  }
  return null
}

/* zsh EXTENDED_HISTORY (`: 1700000000:0;cmd`, a trailing backslash continues
   the command on the next line) and bash with HISTTIMEFORMAT (`#1700000000`
   on the line before). A line with no timestamp is kept with t = null: the
   caller decides whether undated history counts. */
function parseShellHistory(text) {
  const out = []
  const lines = String(text).split('\n')
  let pendingT = null
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const zsh = /^: (\d{9,11}):\d+;(.*)$/.exec(line)
    if (zsh) {
      let cmd = zsh[2]
      while (cmd.endsWith('\\') && i + 1 < lines.length) { cmd = cmd.slice(0, -1) + '\n' + lines[++i] }
      const word = firstWord(cmd)
      if (word !== null) out.push({ t: Number(zsh[1]) * 1000, word })
      continue
    }
    const stamp = /^#(\d{9,11})$/.exec(line)
    if (stamp) { pendingT = Number(stamp[1]) * 1000; continue }
    line = line.trim()
    if (line === '') continue
    const word = firstWord(line)
    if (word !== null) out.push({ t: pendingT, word })
    pendingT = null
  }
  return out
}

/* A word's count, most first, ties by name. */
function countWords(entries, sinceMs) {
  const counts = new Map()
  let total = 0
  let undated = 0
  for (const e of entries) {
    if (e.t === null) { undated++; continue }
    if (e.t < sinceMs) continue
    total++
    counts.set(e.word, (counts.get(e.word) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([word, n]) => ({ word, n }))
  return { total, undated, top }
}

/* A tool name as the event log keeps it (shared/event-log.ts toolClass): the
   built-in name, `mcp` for an MCP tool, `other` for anything else. Restated
   here because this file is plain CJS; verify:event-log week.3 pins the two
   agreeing. */
function toolClass(name) {
  if (typeof name !== 'string') return 'other'
  if (name.startsWith('mcp__') || name.startsWith('mcp_')) return 'mcp'
  return /^[A-Z][A-Za-z]{1,23}$/.test(name) ? name : 'other'
}

/* Whether a user record is the person typing, as opposed to a tool result the
   CLI files under the user role. */
function isPrompt(content) {
  if (typeof content === 'string') return content.trim() !== ''
  if (!Array.isArray(content)) return false
  return content.some((b) => b && b.type === 'text') && !content.some((b) => b && b.type === 'tool_result')
}

/* One Claude Code transcript's lines (`~/.claude/projects/<slug>/<id>.jsonl`)
   to counts, keeping records at or after sinceMs. `cwdKnown(cwd)` says
   whether the folder was open on the canvas, so the report can say how much
   agent work happened in folders the canvas had and how much elsewhere; it
   is called with the path and only its answer is kept. */
function summarizeTranscript(text, sinceMs, cwdKnown) {
  const sum = { prompts: 0, assistantTurns: 0, tools: {}, firstAt: null, lastAt: null, gapsMs: [], inCanvasFolder: null, sidechainTurns: 0 }
  let lastAssistantAt = null
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') continue
    let r
    try { r = JSON.parse(line) } catch { continue }
    if (!r || (r.type !== 'user' && r.type !== 'assistant')) continue
    const t = Date.parse(r.timestamp)
    if (!Number.isFinite(t) || t < sinceMs) continue
    if (r.isSidechain === true) { sum.sidechainTurns++; continue }
    if (sum.inCanvasFolder === null && typeof r.cwd === 'string' && typeof cwdKnown === 'function') sum.inCanvasFolder = cwdKnown(r.cwd) === true
    sum.firstAt = sum.firstAt === null ? t : Math.min(sum.firstAt, t)
    sum.lastAt = sum.lastAt === null ? t : Math.max(sum.lastAt, t)
    const content = r.message && r.message.content
    if (r.type === 'assistant') {
      sum.assistantTurns++
      lastAssistantAt = t
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b && b.type === 'tool_use') { const k = toolClass(b.name); sum.tools[k] = (sum.tools[k] ?? 0) + 1 }
        }
      }
    } else if (isPrompt(content)) {
      sum.prompts++
      if (lastAssistantAt !== null && t >= lastAssistantAt) sum.gapsMs.push(t - lastAssistantAt)
      lastAssistantAt = null
    }
  }
  return sum
}

/* A layout.json's panels by kind, per workspace and in total. An absent kind
   is a terminal (layout-schema PersistedTerminalPanel). `cwds` is the set of
   folders terminal and chat panels were opened in, for summarizeTranscript's
   question and to find the repos worked on; the caller keeps the set to
   itself and the report never prints it. */
function layoutKinds(json) {
  const total = {}
  const cwds = new Set()
  let workspaces = 0
  const list = json && Array.isArray(json.workspaces) ? json.workspaces : json && Array.isArray(json.panels) ? [json] : []
  for (const w of list) {
    workspaces++
    for (const p of Array.isArray(w.panels) ? w.panels : []) {
      const kind = p.kind === undefined ? 'terminal' : (typeof p.kind === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(p.kind) ? p.kind : 'other')
      total[kind] = (total[kind] ?? 0) + 1
      if (typeof p.cwd === 'string' && p.cwd.trim() !== '') cwds.add(p.cwd)
    }
  }
  return { workspaces, total, cwds }
}

/* `git log --numstat --format=@%at` to commits and lines. Binary files (`-`)
   count as a changed file with no lines. */
function parseGitNumstat(text) {
  const out = { commits: 0, files: 0, added: 0, removed: 0, days: new Set() }
  for (const line of String(text).split('\n')) {
    const head = /^@(\d+)$/.exec(line.trim())
    if (head) {
      out.commits++
      const d = new Date(Number(head[1]) * 1000)
      out.days.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)
      continue
    }
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line)
    if (m) {
      out.files++
      if (m[1] !== '-') out.added += Number(m[1])
      if (m[2] !== '-') out.removed += Number(m[2])
    }
  }
  return { commits: out.commits, files: out.files, added: out.added, removed: out.removed, activeDays: out.days.size }
}

/* Nearest-rank quantile, as shared/event-log.ts quantile. */
function quantile(sorted, q) {
  if (sorted.length === 0) return null
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length)))
  return sorted[rank - 1]
}

module.exports = { firstWord, parseShellHistory, countWords, toolClass, isPrompt, summarizeTranscript, layoutKinds, parseGitNumstat, quantile }
