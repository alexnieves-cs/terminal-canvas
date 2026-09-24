import type { ReviewHandoff } from '@shared/review-readiness'
import type { WorkbenchTab } from '@shared/orchestrate-prefs'

/**
 * M324. A TASK'S FOCUS VIEW — the pure half.
 *
 * The focus view opens one task into a stable workspace: its conversation on
 * one side, its evidence (changes, checks, output, artifacts, a bound
 * preview) on the other, and a header that keeps four facts in view the
 * whole time — the title, the repository, what is blocking it, and the next
 * action. It is a PAGE over a canvas that stays mounted (M268's rule), so the
 * canvas's camera is never touched and Back returns to exactly where it was.
 *
 * What a person arranged in it is remembered PER TASK: the split, the side,
 * the file open in Changes and how far it was scrolled. A per-viewer
 * convenience — never the layout file (a hundred tasks' reading positions
 * are not a canvas's record) — so localStorage, parsed field by field here,
 * where a malformed entry costs itself and nothing else.
 *
 * Pure: no DOM, no React. `verify:rail focus.*`.
 */

/**
 * The evidence side's tabs: the workbench's own four, the task's REVIEW (the
 * verdict, criteria, comments and the follow-up they compose — the review
 * node's own panel), and a preview when the task has one bound.
 */
export type FocusSide = 'changes' | 'checks' | 'review' | 'output' | 'artifacts' | 'preview'
export const FOCUS_SIDES: readonly FocusSide[] = ['changes', 'checks', 'review', 'output', 'artifacts', 'preview']

/** The workbench tab a side reads through; `preview` is the focus view's own. */
export function benchTabOf(side: FocusSide): WorkbenchTab | null {
  const tabs: Record<FocusSide, WorkbenchTab | null> = { changes: 'changes', checks: 'checks', review: null, output: 'output', artifacts: 'artifacts', preview: null }
  return tabs[side]
}

/** The conversation's share of the width. Neither side may be squeezed to nothing. */
export const FOCUS_SPLIT_MIN = 0.25
export const FOCUS_SPLIT_MAX = 0.7
export const FOCUS_SPLIT_DEFAULT = 0.42

export function clampSplit(v: number): number {
  if (!Number.isFinite(v)) return FOCUS_SPLIT_DEFAULT
  return Math.min(FOCUS_SPLIT_MAX, Math.max(FOCUS_SPLIT_MIN, Math.round(v * 1000) / 1000))
}

export interface FocusPrefs {
  split: number
  side: FocusSide
  /** The file open in Changes, by its path in the review. */
  file?: string
  /** How far that file's diff was scrolled, in pixels. */
  scroll?: number
  /** When these were last written, so the oldest task's prefs go first. */
  at: number
}

export const FOCUS_PREFS_MAX = 50

export function defaultFocusPrefs(): FocusPrefs {
  return { split: FOCUS_SPLIT_DEFAULT, side: 'changes', at: 0 }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** One task's prefs, field by field: a bad split costs the split, not the file. */
export function parseFocusPrefs(raw: unknown): FocusPrefs {
  const out = defaultFocusPrefs()
  if (!isRecord(raw)) return out
  if (typeof raw.split === 'number') out.split = clampSplit(raw.split)
  if (typeof raw.side === 'string' && (FOCUS_SIDES as readonly string[]).includes(raw.side)) out.side = raw.side as FocusSide
  if (typeof raw.file === 'string' && raw.file !== '') out.file = raw.file
  if (typeof raw.scroll === 'number' && Number.isFinite(raw.scroll) && raw.scroll >= 0) out.scroll = Math.round(raw.scroll)
  if (typeof raw.at === 'number' && Number.isFinite(raw.at)) out.at = raw.at
  return out
}

/** The whole map: entries that are not objects are dropped, and only the newest `FOCUS_PREFS_MAX` are kept. */
export function parseFocusPrefsMap(raw: unknown): Record<string, FocusPrefs> {
  if (!isRecord(raw)) return {}
  const entries = Object.entries(raw).filter(([id, v]) => id !== '' && isRecord(v)).map(([id, v]) => [id, parseFocusPrefs(v)] as const)
  entries.sort((a, b) => b[1].at - a[1].at)
  return Object.fromEntries(entries.slice(0, FOCUS_PREFS_MAX))
}

/** The prefs with a change applied; a new file forgets the old file's scroll. */
export function withFocusPrefs(prev: FocusPrefs, patch: Partial<Omit<FocusPrefs, 'at'>>, now: number): FocusPrefs {
  const next: FocusPrefs = { ...prev, ...patch, at: now }
  if (patch.split !== undefined) next.split = clampSplit(patch.split)
  if (patch.file !== undefined && patch.file !== prev.file && patch.scroll === undefined) delete next.scroll
  return next
}

/**
 * The side a task opens on: the one remembered — unless it names a preview
 * the task no longer has, which falls back to Changes rather than an empty
 * pane that promises a page.
 */
export function openingSide(prefs: FocusPrefs, has: { page: boolean; review: boolean }): FocusSide {
  if (prefs.side === 'preview' && !has.page) return 'changes'
  if (prefs.side === 'review' && !has.review) return 'changes'
  return prefs.side
}

export function sideLabel(side: FocusSide): string {
  const words: Record<FocusSide, string> = { changes: 'Changes', checks: 'Checks', review: 'Review', output: 'Output', artifacts: 'Artifacts', preview: 'Preview' }
  return words[side]
}

/* ── The header ─────────────────────────────────────────────────────────── */

/** What the header's next-action button does, inside the focus view. Null = say it, do nothing (there is no honest single press). */
export type FocusGo = { kind: 'side'; side: FocusSide } | { kind: 'conversation' } | null

export interface FocusHeader {
  /** The blocker sentence, or null when nothing blocks the task. */
  blocker: string | null
  /** The next action's words. Always present: "nothing waits on you" is a fact too. */
  next: string
  go: FocusGo
}

/**
 * The queue's group for the task when it has one (it is the product's own
 * judgment of what needs the person, `task-queue.ts`), the review handoff
 * otherwise, and a plain sentence when neither has read yet. Never invents a
 * third vocabulary: the words are the queue's and the handoff's.
 */
export function focusHeaderOf(input: {
  group?: { severity: 'blocked' | 'failed' | 'review' | 'lost'; why: string; next: { label: string; evidence: { kind: string } } }
  handoff?: Pick<ReviewHandoff, 'action' | 'detail' | 'actionLabel' | 'blocker'>
  hasConversation: boolean
}): FocusHeader {
  const g = input.group
  if (g !== undefined) {
    const ev = g.next.evidence.kind
    const go: FocusGo = ev === 'decision' ? { kind: 'conversation' }
      : ev === 'output' ? { kind: 'side', side: 'checks' }
      : ev === 'review' ? { kind: 'side', side: 'changes' }
      : input.hasConversation ? { kind: 'conversation' } : null
    return { blocker: g.why, next: g.next.label, go }
  }
  const h = input.handoff
  if (h !== undefined) {
    const blocker = h.blocker !== undefined ? h.detail : null
    // The handoff's own verb decides where the press goes: `review` is the
    // diff, `answer` and `resume` are the conversation, `start` has no door
    // inside a task that has not started.
    const byAction: Record<ReviewHandoff['action'], FocusGo> = {
      review: { kind: 'side', side: 'changes' },
      answer: input.hasConversation ? { kind: 'conversation' } : null,
      resume: input.hasConversation ? { kind: 'conversation' } : null,
      start: null
    }
    const go = byAction[h.action]
    return { blocker, next: h.actionLabel !== '' ? h.actionLabel : h.detail, go }
  }
  return {
    blocker: null,
    next: input.hasConversation ? 'Nothing waits on you — the conversation is open beside the evidence' : 'This task has not started — open Start work to give it a conversation',
    go: input.hasConversation ? { kind: 'conversation' } : null
  }
}
