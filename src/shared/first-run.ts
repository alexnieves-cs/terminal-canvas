import { displayPath } from './display-path'
import { LANE_ENGINE, type OnboardingEngine } from './onboarding'

/**
 * M262. THE FIRST-RUN SEQUENCE AND THE CREATION FORMS' WORDS — pure, so the
 * launcher and both sheets render one answer and `verify:first-run` can pin
 * it without a browser.
 *
 * Every function here answers a question the old surfaces made the person
 * answer by reading: which folder was that, when did I use it, what could I
 * even ask for, which of these four kinds do I want, and what will happen if I
 * change nothing. None of them decides anything the start path decides —
 * `firstWorkPlan` and `startWorkNeeds` stay the authorities.
 */

/** One recent folder as a navigable row: the repository's NAME leads, the path rule's short form beside it, the time last. */
export interface RecentFolderRow {
  dir: string
  name: string
  short: string
  /** Words for when it was last used; ABSENT when unknown — a directory recorded before M262 has no time, and inventing one would be a lie. */
  when?: string
}

const basename = (dir: string): string => {
  const trimmed = dir.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  return (i === -1 ? trimmed : trimmed.slice(i + 1)) || trimmed || '—'
}

/**
 * Coarse on purpose: a folder list answers "was it this morning or last
 * month", and a seconds counter would re-render a form to say nothing new.
 */
export function lastUsedWords(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const days = Math.round(s / 86400)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} wk ago`
  return `${Math.round(days / 30)} mo ago`
}

export function recentFolderRows(recents: readonly string[], used: Readonly<Record<string, number>>, now: number, limit = 5): RecentFolderRow[] {
  return recents.slice(0, limit).map((dir) => {
    const at = used[dir]
    return { dir, name: basename(dir), short: displayPath(dir).short, ...(at === undefined ? {} : { when: lastUsedWords(at, now) }) }
  })
}

/**
 * THE EXAMPLES, named after the repository the person chose — real sentences
 * they could send, not a lorem placeholder. Empty with no folder: an example
 * about "this codebase" before there is one points at nothing.
 */
export interface IntentExample { id: 'review' | 'fix-test' | 'explain'; label: string; intention: string }
export function repositoryExamples(folder: string): IntentExample[] {
  const dir = folder.trim()
  if (dir === '') return []
  const repo = basename(dir)
  return [
    { id: 'review', label: 'Review recent changes', intention: `Review the recent changes in ${repo} and tell me what needs attention before they ship` },
    { id: 'fix-test', label: 'Fix a failing test', intention: `Find the failing test in ${repo}, work out why it fails, and make it pass` },
    { id: 'explain', label: 'Explain this codebase', intention: `Explain how ${repo} is organised — the main parts, how they connect, and where to start reading` }
  ]
}

/**
 * STEP 3 — choose an agent — appears ONLY when the default cannot simply be
 * used: the lane engine is missing (unavailable) or discovery has not
 * answered (ambiguous). With it installed the step is not a question, so it
 * is not asked; its row moves under the action as a status line.
 */
export function agentStepNeeded(rows: ReadonlyArray<Pick<OnboardingEngine, 'backend' | 'discovery'>>): boolean {
  return rows.find((row) => row.backend === LANE_ENGINE)?.discovery !== 'installed'
}

/**
 * THE DEFAULTS, SAID — `Claude Code · Standard effort · Default model`. An
 * empty knob reads as the CLI's own default in words a person uses; a knob
 * the row's CLI has no flag for is left out rather than printed as a promise.
 */
export function runtimeDefaultsLine(engine: string, opts: { effort?: string; model?: string; mode?: string; hasEffort?: boolean; hasMode?: boolean }): string {
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
  const parts = [engine]
  if (opts.hasEffort !== false) parts.push(opts.effort === undefined || opts.effort === '' ? 'Standard effort' : `${cap(opts.effort)} effort`)
  parts.push(opts.model === undefined || opts.model.trim() === '' ? 'Default model' : opts.model.trim())
  if (opts.hasMode !== false && opts.mode !== undefined && opts.mode !== '' && opts.mode !== 'default') parts.push(`${cap(opts.mode)} mode`)
  return parts.join(' · ')
}

/**
 * THE FOUR KINDS, EXPLAINED AT THE MOMENT OF CHOOSING — the sheet's `Agent`
 * select mixes them, and before M262 the only way to learn the difference
 * was to make one of each.
 */
export type CreationKind = 'agent' | 'terminal' | 'supervisor' | 'chat' | 'lineup' | 'template'
export const KIND_EXPLANATIONS: Readonly<Record<CreationKind, string>> = {
  agent: 'Agent — a coding agent in its own terminal, working in this folder. It can edit files and run commands; you watch and steer.',
  terminal: 'Terminal — a plain shell or one command in this folder. Nothing runs on its own; you type.',
  supervisor: 'Supervisor — a chat that reads this whole canvas and answers questions about it. One per canvas; it changes nothing.',
  chat: 'Chat — a conversation with an agent in this folder, as messages rather than a terminal. Good for asking, planning and reviewing.',
  lineup: 'Lineup — several panels at once in a fixed shape, previewed below before anything opens.',
  template: 'Template — a saved shape of work: the panels and the links between them, filled in from the fields below.'
}

/** The engine as a person names it — `Claude Code`, not the registry's `claude` — for the defaults line. Unknown ids pass through. */
const ENGINE_NAMES: Readonly<Record<string, string>> = { claude: 'Claude Code', 'claude-code': 'Claude Code', codex: 'Codex', copilot: 'Copilot', 'copilot-acp': 'Copilot', cursor: 'Cursor' }
export function engineDisplayName(id: string, fallback?: string): string {
  return ENGINE_NAMES[id] ?? fallback ?? id
}
