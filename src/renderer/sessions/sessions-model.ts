/**
 * M445. The Sessions page's pure half: the header, the task groups, the
 * bulk bar, the attention-card verbs, and the reply box.
 *
 * No React and no store. The page reads the canvas's own words (`panelState`
 * via the caller) and the one queue; this module only arranges what it is
 * given. A zero count is dropped rather than printed — "0 dormant" is the
 * zero-value statement the rest layer does not say.
 *
 * The reply box's delivery is paste. A shell has no field: a stray Enter
 * must never run a command, and this module's `enterSubmits` is constantly
 * false so a caller cannot grow a submit-on-enter by accident.
 *
 * The sparkline reads `state-palette.ts` because an SVG stroke attribute
 * does not resolve `var(--state-*)`. The hex stays in that module.
 */

import type { AttentionKind, StateTone } from '@shared/redesign-contracts'
import { TONES, toneIsAsleep } from '@renderer/panels/panel-state'
import { STATE_PALETTE, TONE_TO_TOKEN, type PaletteTheme } from '@shared/state-palette'

export const SESSIONS_FEED_EVENT = 'tc-sessions-feed'
/** Ten minutes, the shell-prompt card's snooze. */
export const SNOOZE_MS = 10 * 60 * 1000

export interface SessionFact {
  id: string
  name: string
  agent: string
  folder: string
  branch: string
  word: string
  tone: StateTone
  activity: readonly number[]
  startedAt: number | null
  now: number
  costUsd: number | null
  lastLine: string
  taskId: string | null
  taskTitle: string | null
  taskTicket: string | null
  shell: boolean
  survives: boolean | null
  tokens: number | null
  changes: string | null
  /** False until something can deliver a paste or a chat send. */
  canPaste: boolean
  kind: 'terminal' | 'chat'
}

export interface SessionGroup {
  id: string
  title: string | null
  ticket: string | null
  rows: SessionFact[]
}

export interface SessionSourcePanel {
  id: string
  kind: 'terminal' | 'chat'
  title?: string
  cwd: string
  engine?: string
  shell: boolean
}

export interface SessionSourceTask {
  id: string
  title: string
  ticket: string | null
  panelId?: string
}

export interface SessionReads {
  word(id: string, panel: SessionSourcePanel): { word: string; tone: StateTone }
  lastLine(id: string): string
  costUsd(id: string): number | null
  startedAt(id: string): number | null
  survives(id: string): boolean | null
  tokens(id: string): number | null
  changes(id: string): string | null
  branch(id: string): string
  activity(id: string): readonly number[]
}

export type SortKey = 'name' | 'agent' | 'folder' | 'branch' | 'word' | 'run' | 'cost' | 'line'

export interface CardAction {
  id: 'allow' | 'diff' | 'deny' | 'open' | 'snooze' | 'restart' | 'log' | 'reply' | 'review'
  label: string
}

export interface EndAsk {
  message: string
  detail: string
  verb: 'End'
}

/** The engine word the rail already uses. A shell is a shell. */
export function engineLabel(engine: string | undefined, shell: boolean): string {
  if (shell || engine === undefined || engine === '') return 'shell'
  if (engine === 'claude-code') return 'claude'
  return engine
}

/** The last path segment. A trailing slash is not a segment. */
export function folderName(cwd: string): string {
  const parts = cwd.replace(/\/+$/, '').split('/').filter((part) => part !== '')
  return parts.length === 0 ? '' : parts[parts.length - 1]
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

/** A run length. Empty when the start is unknown — never a dash. */
export function formatRun(startedAt: number | null, now: number): string {
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(now) || now < startedAt) return ''
  const seconds = Math.round((now - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    const rest = seconds % 60
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export function formatTokens(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

/** Said only when the session is the one tmux keeps. Unknown and false are silence. */
export function survivesFact(survives: boolean | null): string | null {
  return survives === true ? 'reload and quit (tmux)' : null
}

export function startedFact(at: number | null): string | null {
  if (at === null || !Number.isFinite(at)) return null
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return null
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/**
 * Live is everything that is not asleep. Both clauses drop at zero, so an
 * empty canvas is "Sessions" and a canvas of only asleep sessions does not
 * say "0 live".
 */
export function sessionsTitle(facts: readonly { tone: StateTone }[]): string {
  let live = 0
  let dormant = 0
  for (const fact of facts) {
    if (toneIsAsleep(fact.tone)) dormant += 1
    else live += 1
  }
  const parts = ['Sessions']
  if (live > 0) parts.push(live === 1 ? '1 live' : `${live} live`)
  if (dormant > 0) parts.push(dormant === 1 ? '1 dormant' : `${dormant} dormant`)
  return parts.join(' · ')
}

/** The header's spend. A zero or an unpriced canvas says nothing. */
export function headerSpend(facts: readonly { costUsd: number | null }[]): string | null {
  let sum = 0
  let any = false
  for (const fact of facts) {
    if (fact.costUsd === null || !Number.isFinite(fact.costUsd) || fact.costUsd <= 0) continue
    sum += fact.costUsd
    any = true
  }
  return any ? formatUsd(sum) : null
}

export function filterFacts(facts: readonly SessionFact[], word: string | null): SessionFact[] {
  if (word === null || word === '') return [...facts]
  return facts.filter((fact) => fact.word === word)
}

export function stateWords(facts: readonly SessionFact[]): string[] {
  const seen: string[] = []
  for (const fact of facts) {
    if (fact.word !== '' && !seen.includes(fact.word)) seen.push(fact.word)
  }
  return seen
}

function priced(fact: SessionFact): number | null {
  if (fact.costUsd === null || !Number.isFinite(fact.costUsd) || fact.costUsd <= 0) return null
  return fact.costUsd
}

function compareFacts(a: SessionFact, b: SessionFact, key: SortKey, dir: 1 | -1): number {
  if (key === 'cost') return compareNumber(priced(a), priced(b), dir)
  if (key === 'run') return compareNumber(a.startedAt, b.startedAt, dir)
  const text = key === 'line' ? 'lastLine' : key
  const av = a[text]
  const bv = b[text]
  const as = typeof av === 'string' ? av : ''
  const bs = typeof bv === 'string' ? bv : ''
  if (as === '' && bs === '') return 0
  if (as === '') return 1
  if (bs === '') return -1
  return dir * as.localeCompare(bs)
}

function compareNumber(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return dir * (a - b)
}

export function sortFacts(facts: readonly SessionFact[], key: SortKey | null, dir: 1 | -1): SessionFact[] {
  if (key === null) return [...facts]
  return [...facts].sort((a, b) => compareFacts(a, b, key, dir))
}

/** First-seen task order. A session in no task, or in two, is the trailing group. */
export function groupRows(rows: readonly SessionFact[]): SessionGroup[] {
  const order: string[] = []
  const by = new Map<string, SessionFact[]>()
  const loose: SessionFact[] = []
  for (const row of rows) {
    if (row.taskId === null || row.taskId === '') {
      loose.push(row)
      continue
    }
    const list = by.get(row.taskId)
    if (list === undefined) {
      by.set(row.taskId, [row])
      order.push(row.taskId)
    } else list.push(row)
  }
  const groups: SessionGroup[] = order.map((id) => {
    const grouped = by.get(id) ?? []
    const first = grouped[0]
    return {
      id,
      title: first?.taskTitle ?? null,
      ticket: first?.taskTicket ?? null,
      rows: grouped
    }
  })
  if (loose.length > 0) groups.push({ id: '', title: null, ticket: null, rows: loose })
  return groups
}

export function groupHeading(group: { title: string | null; ticket: string | null }): string | null {
  if (group.title === null || group.title === '') return null
  if (group.ticket !== null && group.ticket !== '') return `${group.title} · ${group.ticket}`
  return group.title
}

export function bulkBar(count: number): { label: string; verbs: readonly ['Pause', 'Restart', 'Move to task…', 'End']; endConfirms: true } | null {
  if (!Number.isFinite(count) || count <= 0) return null
  const n = Math.floor(count)
  return {
    label: n === 1 ? '1 selected' : `${n} selected`,
    verbs: ['Pause', 'Restart', 'Move to task…', 'End'],
    endConfirms: true
  }
}

/** Pause needs a session that is still going. End is available for any selection. */
export function bulkEligible(rows: readonly { tone: StateTone }[]): { pause: boolean; restart: boolean; move: boolean; end: boolean } {
  if (rows.length === 0) return { pause: false, restart: false, move: false, end: false }
  const pause = rows.some((row) => !toneIsAsleep(row.tone) && row.tone !== 'exited' && row.tone !== 'done' && row.tone !== 'none')
  return { pause, restart: true, move: true, end: true }
}

export function endAsk(count: number): EndAsk {
  const n = Math.max(1, Math.floor(count))
  return {
    message: n === 1 ? 'End this session?' : `End ${n} sessions?`,
    detail: 'The session stops. Cancel leaves it running.',
    verb: 'End'
  }
}

export function cardActions(kind: AttentionKind): { actions: readonly CardAction[]; answerField: false } {
  switch (kind) {
    case 'approval':
      return { actions: [{ id: 'allow', label: 'Allow' }, { id: 'diff', label: 'Diff' }, { id: 'deny', label: 'Deny' }], answerField: false }
    case 'shell-prompt':
      return { actions: [{ id: 'open', label: 'Open on canvas' }, { id: 'snooze', label: 'Snooze 10m' }], answerField: false }
    case 'failed':
      return { actions: [{ id: 'restart', label: 'Restart' }, { id: 'log', label: 'Read log' }], answerField: false }
    case 'question':
      return { actions: [{ id: 'reply', label: 'Reply' }, { id: 'open', label: 'Open on canvas' }], answerField: false }
    case 'recovery':
      return { actions: [{ id: 'review', label: 'Review' }, { id: 'open', label: 'Open on canvas' }], answerField: false }
  }
}

export function cardTone(kind: AttentionKind): StateTone {
  switch (kind) {
    case 'approval':
    case 'question':
    case 'shell-prompt':
      return 'needs-you'
    case 'failed':
      return 'exited'
    case 'recovery':
      return 'idle'
  }
}

/**
 * A shell is closed, with the reason on the control. An agent whose paste
 * this page cannot reach is closed for the same reason a missing door is
 * not a hidden one. The delivery flag stays paste either way: the caller
 * that can send uses paste, never a raw write.
 */
export function replyBox(shell: boolean, canPaste: boolean): { enabled: boolean; reason: string | null; delivery: 'paste'; explicitSend: true } {
  if (shell) {
    return {
      enabled: false,
      reason: 'A shell runs what you type on its canvas. This box does not send.',
      delivery: 'paste',
      explicitSend: true
    }
  }
  if (!canPaste) {
    return {
      enabled: false,
      reason: 'Sending pastes into the session, and this page does not hold that session.',
      delivery: 'paste',
      explicitSend: true
    }
  }
  return { enabled: true, reason: null, delivery: 'paste', explicitSend: true }
}

/** Constantly false. The Send button is the only submit. */
export function enterSubmits(): false {
  return false
}

export function sparkline(samples: readonly number[], tone: StateTone, theme: PaletteTheme): { d: string; stroke: string } {
  const stroke = STATE_PALETTE[theme][TONE_TO_TOKEN[tone]]
  const usable = samples.filter((n) => Number.isFinite(n))
  if (usable.length < 2) return { d: '', stroke }
  let min = usable[0]
  let max = usable[0]
  for (const n of usable) {
    if (n < min) min = n
    if (n > max) max = n
  }
  const span = max - min || 1
  const width = 64
  const height = 16
  const pad = 1
  const d = usable.map((n, i) => {
    const x = (i / (usable.length - 1)) * (width - pad * 2) + pad
    const y = pad + (1 - (n - min) / span) * (height - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
  return { d, stroke }
}

export function appendTail(lines: readonly string[], chunk: string, cap: number): string[] {
  if (chunk === '') return [...lines]
  const parts = chunk.split(/\r?\n/)
  const out = lines.length === 0 ? [] : [...lines]
  if (out.length === 0) out.push(parts[0] ?? '')
  else out[out.length - 1] = `${out[out.length - 1] ?? ''}${parts[0] ?? ''}`
  for (let i = 1; i < parts.length; i++) out.push(parts[i] ?? '')
  if (!Number.isFinite(cap) || cap <= 0) return out
  return out.length > cap ? out.slice(out.length - cap) : out
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

function taskFor(id: string, tasks: readonly SessionSourceTask[]): SessionSourceTask | null {
  const hits = tasks.filter((task) => task.panelId === id)
  return hits.length === 1 ? hits[0] : null
}

export function factsFromSources(
  panels: readonly SessionSourcePanel[],
  tasks: readonly SessionSourceTask[],
  now: number,
  read: SessionReads
): SessionFact[] {
  const facts: SessionFact[] = []
  for (const panel of panels) {
    if (panel.kind !== 'terminal' && panel.kind !== 'chat') continue
    const task = taskFor(panel.id, tasks)
    const spoken = read.word(panel.id, panel)
    const folder = folderName(panel.cwd)
    const title = panel.title?.trim() ?? ''
    facts.push({
      id: panel.id,
      name: title !== '' ? title : (folder !== '' ? folder : 'Session'),
      agent: engineLabel(panel.engine, panel.shell),
      folder,
      branch: read.branch(panel.id),
      word: spoken.word,
      tone: spoken.tone,
      activity: read.activity(panel.id),
      startedAt: read.startedAt(panel.id),
      now,
      costUsd: read.costUsd(panel.id),
      lastLine: read.lastLine(panel.id),
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
      taskTicket: task?.ticket ?? null,
      shell: panel.shell,
      survives: read.survives(panel.id),
      tokens: read.tokens(panel.id),
      changes: read.changes(panel.id),
      canPaste: panel.kind === 'chat',
      kind: panel.kind
    })
  }
  return facts
}

function isTone(value: string): value is StateTone {
  return (TONES as readonly string[]).includes(value)
}

function str(value: unknown, fallback: string): string | null {
  if (value === undefined) return fallback
  return typeof value === 'string' ? value : null
}

function numOrNull(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** A shot or a test hands facts in. A malformed payload is refused whole. */
export function parseFeed(value: unknown): SessionFact[] | null {
  if (!Array.isArray(value)) return null
  const out: SessionFact[] = []
  for (const item of value) {
    if (item === null || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || row.id === '') return null
    if (typeof row.name !== 'string') return null
    if (typeof row.tone !== 'string' || !isTone(row.tone)) return null
    if (typeof row.word !== 'string') return null
    if (typeof row.shell !== 'boolean') return null
    const agent = str(row.agent, row.shell ? 'shell' : '')
    const folder = str(row.folder, '')
    const branch = str(row.branch, '')
    const lastLine = str(row.lastLine, '')
    const changes = str(row.changes, '')
    if (agent === null || folder === null || branch === null || lastLine === null || changes === null) return null
    const costUsd = numOrNull(row.costUsd)
    const startedAt = numOrNull(row.startedAt)
    const tokens = numOrNull(row.tokens)
    const now = numOrNull(row.now)
    if (costUsd === undefined || startedAt === undefined || tokens === undefined || now === undefined) return null
    let activity: number[] = []
    if (row.activity !== undefined) {
      if (!Array.isArray(row.activity) || row.activity.some((n) => typeof n !== 'number')) return null
      activity = row.activity as number[]
    }
    const taskId = row.taskId === undefined || row.taskId === null ? null : typeof row.taskId === 'string' ? row.taskId : undefined
    const taskTitle = row.taskTitle === undefined || row.taskTitle === null ? null : typeof row.taskTitle === 'string' ? row.taskTitle : undefined
    const taskTicket = row.taskTicket === undefined || row.taskTicket === null ? null : typeof row.taskTicket === 'string' ? row.taskTicket : undefined
    if (taskId === undefined || taskTitle === undefined || taskTicket === undefined) return null
    let survives: boolean | null = null
    if (row.survives !== undefined && row.survives !== null) {
      if (typeof row.survives !== 'boolean') return null
      survives = row.survives
    }
    let canPaste = false
    if (row.canPaste !== undefined) {
      if (typeof row.canPaste !== 'boolean') return null
      canPaste = row.canPaste
    }
    const kind = row.kind === 'chat' ? 'chat' : 'terminal'
    out.push({
      id: row.id,
      name: row.name,
      agent,
      folder,
      branch,
      word: row.word,
      tone: row.tone,
      activity,
      startedAt,
      now: now ?? 0,
      costUsd,
      lastLine,
      taskId,
      taskTitle,
      taskTicket,
      shell: row.shell,
      survives,
      tokens,
      changes: changes === '' ? null : changes,
      canPaste,
      kind
    })
  }
  return out
}
