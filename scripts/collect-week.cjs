/* M701. One week of real work, as counts: the raw material for deciding what
   Terminal Canvas builds next.

   Run with: npm run collect-week [-- --days 7] [--repo <path> ...] [--out <file>]

   READS, ALL LOCAL:
     - the app's event log (scripts/event-report.cjs; on only if you turned it on)
     - Claude Code transcripts under ~/.claude/projects, last N days by mtime
     - ~/.zsh_history and ~/.bash_history
     - the app's layout.json (panel kinds, and the folders panels were opened in)
     - `git log` of each repo given with --repo, or of the git repos those
       panel folders are in, filtered to your own git author email

   WRITES one JSON file (default out/week/week-<date>.json, which git ignores)
   and prints a summary. Nothing is sent anywhere.

   KEEPS COUNTS, NOT CONTENT (scripts/lib/week-parse.cjs): first words of
   shell commands, numbers of prompts and tool calls, gap times, panel kinds,
   commit and line counts. No command arguments, no prompt or output text, no
   file paths. Repos are named by their folder's last part. */
'use strict'
const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { basename, dirname, join, resolve } = require('node:path')
const W = require('./lib/week-parse.cjs')
const R = require('./event-report.cjs')

/* Commands that usually open another app: a rough count of leaving the canvas from a shell. */
const OTHER_APP_WORDS = ['code', 'cursor', 'zed', 'subl', 'idea', 'webstorm', 'open', 'xed', 'xcode-select', 'gitk', 'gitx', 'fork', 'tower', 'smerge']

function args() {
  const out = { days: 7, repos: [], out: null }
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--days') out.days = Number(a[++i])
    else if (a[i] === '--repo') out.repos.push(resolve(a[++i]))
    else if (a[i] === '--out') out.out = resolve(a[++i])
  }
  if (!Number.isFinite(out.days) || out.days <= 0) out.days = 7
  return out
}

const expand = (p) => (p === '~' ? homedir() : p.startsWith('~/') ? join(homedir(), p.slice(2)) : p)

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

function layout() {
  for (const dir of R.userDataCandidates()) {
    const file = join(dir, 'layout.json')
    if (existsSync(file)) {
      const json = readJson(file)
      if (json) return { found: true, ...W.layoutKinds(json) }
    }
  }
  return { found: false, workspaces: 0, total: {}, cwds: new Set() }
}

function transcripts(sinceMs, cwdKnown) {
  const root = join(homedir(), '.claude', 'projects')
  const out = { found: existsSync(root), sessions: 0, inCanvasFolder: 0, elsewhere: 0, prompts: 0, assistantTurns: 0, sidechainTurns: 0, tools: {}, gapsMs: [] }
  if (!out.found) return out
  for (const slug of readdirSync(root)) {
    const dir = join(root, slug)
    let names
    try { names = readdirSync(dir) } catch { continue }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      const file = join(dir, name)
      try { if (statSync(file).mtimeMs < sinceMs) continue } catch { continue }
      let text
      try { text = readFileSync(file, 'utf8') } catch { continue }
      const s = W.summarizeTranscript(text, sinceMs, cwdKnown)
      if (s.prompts === 0 && s.assistantTurns === 0) continue
      out.sessions++
      if (s.inCanvasFolder === true) out.inCanvasFolder++
      else out.elsewhere++
      out.prompts += s.prompts
      out.assistantTurns += s.assistantTurns
      out.sidechainTurns += s.sidechainTurns
      for (const [k, n] of Object.entries(s.tools)) out.tools[k] = (out.tools[k] ?? 0) + n
      out.gapsMs.push(...s.gapsMs)
    }
  }
  return out
}

function shell(sinceMs) {
  const entries = []
  const files = []
  for (const name of ['.zsh_history', '.bash_history']) {
    const file = join(homedir(), name)
    if (!existsSync(file)) continue
    files.push(name)
    // latin1: zsh writes "metafied" bytes that are not UTF-8; first words survive either way.
    entries.push(...W.parseShellHistory(readFileSync(file, 'latin1')))
  }
  const counted = W.countWords(entries, sinceMs)
  const otherApps = counted.top.filter((w) => OTHER_APP_WORDS.includes(w.word))
  return { files, total: counted.total, undated: counted.undated, top: counted.top.slice(0, 30), otherApps }
}

function gitRoot(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null }
}

function git(repos, sinceMs) {
  const out = []
  for (const repo of repos) {
    let email = ''
    try { email = execFileSync('git', ['-C', repo, 'config', 'user.email'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* no author filter */ }
    let text = ''
    try {
      text = execFileSync('git', ['-C', repo, 'log', '--all', `--since=${Math.floor(sinceMs / 1000)}`, '--numstat', '--format=@%at', ...(email ? [`--author=${email}`] : [])],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch { continue }
    out.push({ repo: basename(repo), authorFiltered: email !== '', ...W.parseGitNumstat(text) })
  }
  return out
}

const sec = (ms) => (ms === null ? null : Math.round(ms / 1000))
const secText = (s) => (s === null ? 'n/a' : `${s} s`)

function main() {
  const opts = args()
  const sinceMs = Date.now() - opts.days * 86_400_000
  const lay = layout()
  const canvasDirs = new Set([...lay.cwds].map((c) => resolve(expand(c))))
  const cwdKnown = (cwd) => {
    const abs = resolve(expand(cwd))
    for (const d of canvasDirs) if (abs === d || abs.startsWith(d + '/')) return true
    return false
  }

  // The event log, through the same reader as npm run event-report.
  const E = R.loadEventLog()
  const logDir = R.userDataCandidates().map((d) => join(d, 'event-log')).find((d) => existsSync(d)) ?? null
  const log = logDir ? R.readLog(E, logDir, sinceMs) : { records: [], skipped: 0, files: 0 }
  const events = log.files > 0 ? E.summarizeEvents(log.records) : null

  const tx = transcripts(sinceMs, cwdKnown)
  const gaps = tx.gapsMs.slice().sort((a, b) => a - b)
  const sh = shell(sinceMs)
  const repos = opts.repos.length > 0 ? opts.repos
    : [...new Set([...canvasDirs].filter((d) => existsSync(d)).map(gitRoot).filter((r) => r !== null))]
  const commits = git(repos, sinceMs)

  const week = {
    v: 1,
    collectedAt: new Date().toISOString(),
    days: opts.days,
    eventLog: events === null ? { found: false } : { found: true, files: log.files, skipped: log.skipped, summary: events },
    claudeCode: {
      found: tx.found,
      sessions: tx.sessions,
      sessionsInCanvasFolders: tx.inCanvasFolder,
      sessionsElsewhere: tx.elsewhere,
      prompts: tx.prompts,
      assistantTurns: tx.assistantTurns,
      subagentTurns: tx.sidechainTurns,
      tools: tx.tools,
      replyToNextPromptSec: { count: gaps.length, median: sec(W.quantile(gaps, 0.5)), p90: sec(W.quantile(gaps, 0.9)) }
    },
    shell: sh,
    layout: { found: lay.found, workspaces: lay.workspaces, panels: lay.total, folders: canvasDirs.size },
    git: commits
  }

  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date()
  const file = opts.out ?? join(__dirname, '..', 'out', 'week', `week-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(week, null, 2) + '\n')

  const lines = [`Wrote ${file}`, '']
  if (events) lines.push(R.report(E, events, { dir: logDir, ...log }), '')
  else lines.push('Event log: none yet. Turn on Settings > Privacy & telemetry > Keep a usage log on this Mac.', '')
  lines.push(
    `Claude Code: ${tx.sessions} session(s), ${tx.inCanvasFolder} in folders the canvas has open and ${tx.elsewhere} elsewhere; ${tx.prompts} prompts, ${tx.assistantTurns} replies`,
    `  Reply to your next prompt: median ${secText(week.claudeCode.replyToNextPromptSec.median)}, p90 ${secText(week.claudeCode.replyToNextPromptSec.p90)}`,
    `Shell: ${sh.total} dated commands in ${sh.files.join(', ') || 'no history file'}${sh.undated ? ` (${sh.undated} undated, not counted)` : ''}`,
    `  Most used: ${sh.top.slice(0, 10).map((w) => `${w.word} ${w.n}`).join(', ') || 'none'}`,
    `  Commands that open another app: ${sh.otherApps.map((w) => `${w.word} ${w.n}`).join(', ') || 'none'}`,
    `Layout: ${lay.found ? `${lay.workspaces} workspace(s), ${Object.entries(lay.total).map(([k, n]) => `${k} ${n}`).join(', ')}` : 'not found'}`,
    `Git: ${commits.map((c) => `${c.repo} ${c.commits} commit(s), +${c.added}/-${c.removed}`).join('; ') || 'no repos found'}`
  )
  console.log(lines.join('\n'))
}

if (require.main === module) main()
module.exports = { OTHER_APP_WORDS }
