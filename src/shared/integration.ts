import type { CombinePlan } from './combine'

/**
 * M317. FINISHING PARALLEL WORK — the pure half of the integration flow that
 * M311's combine opened: a combined result that knows WHAT it combined, a
 * failure traced to the tasks and files that produced it, a narrowly scoped
 * brief for the agent that should fix it, and the gate and receipt of the one
 * step that lands the lanes.
 *
 * Three rules the obvious version breaks silently:
 *
 * 1. **A combined result is about CONTENT, and goes stale with it.** Each lane
 *    is fingerprinted by what it would contribute — its content diff since its
 *    fork plus its untracked files — never by its HEAD alone. Committing the
 *    checked content does not change the fingerprint (the same bytes were
 *    checked), while an agent's one-line edit after the check does. The main
 *    tree moving is staleness too: the combination was built on `base`.
 * 2. **A failure names participants, not a culprit it cannot know.** A
 *    conflict is the later lane's to resolve (it applies onto the earlier
 *    ones — the plan's own "its author resolves the meeting" rule). A failed
 *    check is attributed through the files its output NAMES that a lane
 *    changed; when it names none, it says so (`unattributed`) and the person
 *    picks — a guess presented as a finding is the fabrication this app does
 *    not make.
 * 3. **What lands is what was checked.** The integrate step carries each
 *    lane's fingerprint and the combined tree's hash; main refuses when either
 *    moved and the receipt says whether the landed tree is byte-identical to
 *    the checked one, rather than implying it.
 *
 * Imports types only, so it runs in the plain-node tier (`verify:review integrate.*`).
 */

/** One lane's contribution, as main reads it (`combine:inputs`, and inside `combine:run`). */
export interface LaneFingerprint {
  lane: string
  /** The lane's HEAD — what a merge would carry; NOT the identity (see the header). */
  head: string
  /** A hash of the lane's content diff since its fork plus its untracked files. */
  digest: string
  /** The lane has uncommitted or untracked changes — a merge would leave them behind. */
  dirty: boolean
}

export type CombineInputsResult =
  | { kind: 'inputs'; root: string; base: string; lanes: LaneFingerprint[] }
  | { kind: 'git-missing' }
  | { kind: 'unreadable'; detail: string }

/** What a combined result was built from — the combine run's own record. */
export interface Witnessed {
  base: string
  inputs: readonly LaneFingerprint[]
}

export type IntegrationStanding =
  | { kind: 'current' }
  | {
    kind: 'stale'
    /** Lanes whose content moved since the combine. */
    changed: string[]
    /** Lanes the combine used that can no longer be read. */
    missing: string[]
    /** The main tree's HEAD is not the base the lanes were combined on. */
    mainMoved: boolean
  }

export function integrationStanding(witnessed: Witnessed, now: Extract<CombineInputsResult, { kind: 'inputs' }>): IntegrationStanding {
  const byLane = new Map(now.lanes.map((l) => [l.lane, l]))
  const changed: string[] = []
  const missing: string[] = []
  for (const w of witnessed.inputs) {
    const n = byLane.get(w.lane)
    if (n === undefined) missing.push(w.lane)
    else if (n.digest !== w.digest) changed.push(w.lane)
  }
  const mainMoved = now.base !== witnessed.base
  return changed.length === 0 && missing.length === 0 && !mainMoved ? { kind: 'current' } : { kind: 'stale', changed, missing, mainMoved }
}

export function staleWords(s: IntegrationStanding, labelOf: (lane: string) => string): string {
  if (s.kind === 'current') return 'Every lane is as it was combined.'
  const parts: string[] = []
  if (s.changed.length > 0) parts.push(`${s.changed.map(labelOf).join(', ')} changed since the combine`)
  if (s.missing.length > 0) parts.push(`${s.missing.map(labelOf).join(', ')} can no longer be read`)
  if (s.mainMoved) parts.push('the main tree has new commits')
  return `This result is out of date — ${parts.join('; ')}. Combine and check again before integrating.`
}

/* ── Attribution ─────────────────────────────────────────────────────────── */

export interface FailureParticipant {
  lane: string
  label: string
  /** `responsible` fixes it; `met` shares the named files; `present` was only in the combination. */
  role: 'responsible' | 'met' | 'present'
  /** The named paths this lane changed. */
  paths: string[]
}

export interface FailureAttribution {
  kind: 'conflict' | 'check'
  /** The lane whose agent the brief goes to by default. */
  responsible: string
  participants: FailureParticipant[]
  /** Paths the failure names that some lane changed (repo-relative). */
  paths: string[]
  /** The failure names no file any lane changed — the person should pick. */
  unattributed: boolean
  summary: string
}

const filesOf = (plan: CombinePlan, lane: string): readonly string[] => plan.lanes.find((l) => l.id === lane)?.files ?? []
const labelIn = (plan: CombinePlan, lane: string): string => plan.lanes.find((l) => l.id === lane)?.label ?? lane

/** Does a path an output names mean this changed file? Exact, or one is a path-suffix of the other. */
export function samePath(named: string, changed: string): boolean {
  if (named === changed) return true
  return changed.endsWith(`/${named}`) || named.endsWith(`/${changed}`)
}

/**
 * A git apply conflict: the conflicting lane resolves it (it lands on top),
 * and every lane already applied that changed a conflicting path met it.
 */
export function attributeConflict(plan: CombinePlan, conflict: { lane: string; paths: readonly string[] }, applied: readonly string[]): FailureAttribution {
  const paths = [...conflict.paths]
  const met = applied.filter((l) => filesOf(plan, l).some((f) => paths.some((p) => samePath(p, f))))
  const participants: FailureParticipant[] = [
    { lane: conflict.lane, label: labelIn(plan, conflict.lane), role: 'responsible', paths },
    ...met.map((l) => ({ lane: l, label: labelIn(plan, l), role: 'met' as const, paths: filesOf(plan, l).filter((f) => paths.some((p) => samePath(p, f))) })),
    ...applied.filter((l) => !met.includes(l)).map((l) => ({ lane: l, label: labelIn(plan, l), role: 'present' as const, paths: [] }))
  ]
  const others = met.length > 0 ? met : applied
  const where = paths.length > 0 ? ` in ${paths.join(', ')}` : ''
  return {
    kind: 'conflict', responsible: conflict.lane, participants, paths, unattributed: false,
    summary: `${labelIn(plan, conflict.lane)} does not apply on top of ${others.length === 0 ? 'the main tree' : others.map((l) => labelIn(plan, l)).join(' + ')}${where} — it lands later, so its agent reconciles the two.`
  }
}

/**
 * Paths an output names: `src/a.ts:12`, `src/a.ts(3,4)`, ` at /scratch/src/a.ts:1:2`,
 * `FAIL src/a.test.ts`. The scratch prefix is stripped so names are repo-relative;
 * URLs and version-like tokens are not paths.
 */
export function outputPaths(text: string, scratch?: string): string[] {
  const out = new Set<string>()
  const root = scratch === undefined ? undefined : scratch.replace(/\/+$/, '')
  const re = /(?:^|[\s('"`[])((?:\.{0,2}\/)?[A-Za-z0-9_@][\w@.\-/]*\.[A-Za-z][A-Za-z0-9]{0,6})(?=[:(\s'"`)\],]|$)/gm
  for (const m of text.matchAll(re)) {
    let p = m[1]
    if (/^[a-z]+:\/\//i.test(p) || p.includes('//')) continue
    if (root !== undefined && p.startsWith(`${root}/`)) p = p.slice(root.length + 1)
    else if (p.startsWith('/')) continue // an absolute path outside the combined tree is not a lane's file
    p = p.replace(/^\.\//, '')
    if (!p.includes('/') && !/\.(?:[cm]?[jt]sx?|py|rs|go|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|vue|svelte|css|scss|json|ya?ml|toml|md|sql|sh)$/.test(p)) continue
    out.add(p)
  }
  return [...out]
}

/** A failed check on the combined tree, traced through the files its output names. */
export function attributeCheckFailure(plan: CombinePlan, applied: readonly string[], output: string, scratch?: string): FailureAttribution {
  const named = outputPaths(output, scratch)
  const hits = new Map<string, string[]>()
  for (const lane of applied) {
    const mine = filesOf(plan, lane).filter((f) => named.some((n) => samePath(n, f)))
    if (mine.length > 0) hits.set(lane, mine)
  }
  const paths = [...new Set([...hits.values()].flat())]
  if (hits.size === 0) {
    const last = applied[applied.length - 1] ?? ''
    return {
      kind: 'check', responsible: last, paths: [], unattributed: true,
      participants: applied.map((l) => ({ lane: l, label: labelIn(plan, l), role: l === last ? 'responsible' as const : 'present' as const, paths: [] })),
      summary: named.length === 0
        ? 'The output names no file, so it cannot say which lane caused it — the last lane to land is suggested; pick another if you know better.'
        : `The output names ${named.slice(0, 3).join(', ')}${named.length > 3 ? '…' : ''}, which no lane changed — an interaction between the lanes. The last lane to land is suggested; pick another if you know better.`
    }
  }
  // Most named files first; a tie goes to the lane that lands LATER (it met the others).
  const ranked = [...hits.entries()].sort((a, b) => b[1].length - a[1].length || applied.indexOf(b[0]) - applied.indexOf(a[0]))
  const responsible = ranked[0][0]
  const participants: FailureParticipant[] = applied.map((l) => ({
    lane: l, label: labelIn(plan, l),
    role: l === responsible ? 'responsible' as const : hits.has(l) ? 'met' as const : 'present' as const,
    paths: hits.get(l) ?? []
  }))
  const others = [...hits.keys()].filter((l) => l !== responsible)
  return {
    kind: 'check', responsible, participants, paths, unattributed: false,
    summary: `The failure names ${paths.join(', ')}, changed by ${labelIn(plan, responsible)}${others.length > 0 ? ` and ${others.map((l) => labelIn(plan, l)).join(', ')}` : ''}.`
  }
}

/* ── The brief sent back ─────────────────────────────────────────────────── */

export interface FixBriefInput {
  attribution: FailureAttribution
  /** Which lane the brief goes to — the attribution's `responsible` unless the person picked another. */
  to: string
  labelOf: (lane: string) => string
  /** The check's command and exit, for a check failure. */
  command?: string
  exitCode?: number | null
  /** The output's last lines, ALREADY scrubbed by the caller (`outward`). */
  tail?: string
  base: string
}

/**
 * The follow-up to the responsible agent — scoped to THIS interaction: what
 * failed, which other lanes it meets and where their copies are (to read,
 * never edit), the output's own last lines, and the check to run again.
 * Shown whole before it is sent, like every hand-off.
 */
export function integrationFixBrief(i: FixBriefInput): string {
  const a = i.attribution
  const all = a.participants.filter((p) => p.lane !== i.to)
  const met = all.filter((p) => p.role === 'met' || (a.kind === 'conflict' && p.role === 'responsible'))
  // SCOPE: the lanes this failure actually meets. A lane that was only
  // present in the combination is not the agent's business; when nothing is
  // attributed, every other lane is (the cause is an interaction).
  const others = met.length > 0 ? met : all
  const mine = a.participants.find((p) => p.lane === i.to)
  const lines: string[] = []
  const withWhom = others.length === 0 ? 'the main tree' : others.map((p) => p.label).join(', ')
  if (a.kind === 'conflict') {
    lines.push(`Integration conflict: your changes do not apply on top of ${withWhom} (combined on ${i.base.slice(0, 7)}).`)
  } else {
    lines.push(`Integration failure: your lane and ${withWhom} can each pass alone, but together \`${i.command ?? 'the check'}\` ${i.exitCode === null || i.exitCode === undefined ? 'failed' : `exited ${i.exitCode}`} on the combined tree (on ${i.base.slice(0, 7)}).`)
  }
  lines.push('')
  const files = mine !== undefined && mine.paths.length > 0 ? mine.paths : a.paths
  if (files.length > 0) lines.push(`Files involved: ${files.join(', ')}`)
  for (const p of met) {
    if (p.paths.length === 0) continue
    lines.push(`${p.label} changed ${p.paths.join(', ')} too — its copy: ${p.paths.map((f) => `${p.lane}/${f}`).join(', ')}`)
  }
  if (a.unattributed) lines.push('The output does not name a file any lane changed, so the cause is an interaction — start from the output below.')
  if (i.tail !== undefined && i.tail.trim() !== '') {
    lines.push('', 'Last lines of the output:', '```', i.tail.trimEnd(), '```')
  }
  lines.push('', 'Please fix only this, in your own lane:')
  lines.push(`- keep ${others.length === 0 ? 'the existing behaviour' : `${others.map((p) => p.label).join(' and ')}'s change`} working — read ${others.length === 1 ? 'its' : 'their'} files, do not edit ${others.length === 1 ? 'that lane' : 'those lanes'}`)
  lines.push('- change only what this needs; no unrelated refactoring')
  lines.push(i.command === undefined ? '- say what you changed when you are done' : `- run \`${i.command}\` in your lane when you are done, and say what you changed`)
  return lines.join('\n')
}

/* ── The gate ────────────────────────────────────────────────────────────── */

export interface IntegrateLaneFacts {
  lane: string
  label: string
  /** The task's review standing for this lane; `no-task` when no task owns it. */
  review: 'current' | 'stale' | 'none' | 'unknown' | 'no-task'
  dirty: boolean
}

export interface GateItem { text: string; holds: boolean }

export interface IntegrationGate {
  ready: boolean
  items: GateItem[]
}

/**
 * What must hold before the lanes land, as a list the person reads: combined
 * cleanly, the combined check passed, nothing moved since, and each lane
 * reviewed at this revision and committed. Committing does not invalidate the
 * check (the fingerprint is content), so "commit it in its review" is always
 * a way forward from `dirty`.
 */
export function integrationGate(i: {
  lanes: readonly IntegrateLaneFacts[]
  combined: 'clean' | 'conflict' | 'none'
  check: 'passed' | 'failed' | 'running' | 'none'
  standing: IntegrationStanding | null
}): IntegrationGate {
  const items: GateItem[] = []
  items.push({ text: i.combined === 'clean' ? 'the lanes combine without a conflict' : i.combined === 'conflict' ? 'the lanes conflict when combined' : 'the lanes have not been combined', holds: i.combined === 'clean' })
  items.push({ text: i.check === 'passed' ? 'the check passed on the combined tree' : i.check === 'failed' ? 'the check failed on the combined tree' : i.check === 'running' ? 'the combined check is running' : 'no check has run on the combined tree', holds: i.check === 'passed' })
  items.push({ text: i.standing === null ? 'lanes not re-read since the combine' : i.standing.kind === 'current' ? 'no lane changed since it was checked' : 'a lane or the main tree changed since the check', holds: i.standing?.kind === 'current' })
  for (const l of i.lanes) {
    const reviewText = l.review === 'current' ? `${l.label} reviewed at this revision`
      : l.review === 'stale' ? `${l.label} changed since its review — review it again`
        : l.review === 'no-task' ? `${l.label} belongs to no task, so no review of it is recorded`
          : l.review === 'unknown' ? `${l.label}'s review predates revision tracking — review it again`
            : `${l.label} is not reviewed`
    items.push({ text: reviewText, holds: l.review === 'current' })
    items.push({ text: l.dirty ? `${l.label} has uncommitted changes — commit them in its review (the check still holds: the content is the same)` : `${l.label} is committed`, holds: !l.dirty })
  }
  return { ready: items.every((x) => x.holds), items }
}

/* ── Integrate, and its receipt ──────────────────────────────────────────── */

export interface IntegrateLaneRequest {
  lane: string
  label: string
  /** The fingerprint the combined check witnessed. */
  digest: string
  itemId?: string
  title?: string
}

export interface IntegrateRequest {
  root: string
  /** The main tree's HEAD the lanes were combined on. */
  base: string
  /** The combined tree's hash (`combine:run`'s `tree`). */
  tree: string
  /** In landing order. */
  lanes: IntegrateLaneRequest[]
  /** The combined check that witnessed it — its output record is re-read by main. */
  check: { command: string; outputId: string }
  /** The renderer's reviewed lanes (by path) — carried onto the receipt as the person's attestation. */
  reviewed: string[]
}

export type ReceiptLaneOutcome = 'merged' | 'conflict' | 'refused' | 'failed' | 'not-reached'

export interface ReceiptLane {
  lane: string
  label: string
  branch: string
  itemId?: string
  title?: string
  digest: string
  head: string
  reviewed: boolean
  outcome: ReceiptLaneOutcome
  commits: number
  /** The main tree's HEAD after this lane landed. */
  sha?: string
  detail?: string
}

export interface ReceiptCheck {
  command: string
  exitCode: number | null
  outputId: string
  at: number
  /** Always the combined tree today; named so a later witness (post-merge) reads differently. */
  where: string
}

export interface IntegrationReceipt {
  v: 1
  id: string
  root: string
  into: string
  at: number
  base: string
  before: string
  after: string
  tree: { checked: string; landed: string; identical: boolean }
  lanes: ReceiptLane[]
  checks: ReceiptCheck[]
  /** Every lane landed. */
  complete: boolean
}

export type IntegrateResult =
  | { kind: 'done'; receipt: IntegrationReceipt }
  | { kind: 'stale'; changed: string[]; mainMoved: boolean }
  | { kind: 'refused'; reason: string }

export function receiptHeadline(r: IntegrationReceipt): string {
  const merged = r.lanes.filter((l) => l.outcome === 'merged')
  const n = `${merged.length} of ${r.lanes.length} lane${r.lanes.length === 1 ? '' : 's'}`
  if (!r.complete) {
    const stop = r.lanes.find((l) => l.outcome !== 'merged' && l.outcome !== 'not-reached')
    return `${n} landed in ${r.into}; stopped at ${stop?.label ?? 'a lane'} — ${stop?.detail ?? stop?.outcome ?? 'not merged'}.`
  }
  return `${n} landed in ${r.into} (${r.before.slice(0, 7)} → ${r.after.slice(0, 7)}), ${r.tree.identical ? 'byte-identical to the tree the check passed on' : 'but the landed tree DIFFERS from the checked one — run the checks on the main tree'}.`
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === 'string'
const OUTCOMES: readonly ReceiptLaneOutcome[] = ['merged', 'conflict', 'refused', 'failed', 'not-reached']

/** A stored receipt read back; one malformed lane or check costs itself, a malformed receipt is dropped. */
export function parseReceipt(raw: unknown): IntegrationReceipt | null {
  if (!isObj(raw) || raw.v !== 1 || !str(raw.id) || !str(raw.root) || !str(raw.into) || typeof raw.at !== 'number') return null
  if (!str(raw.base) || !str(raw.before) || !str(raw.after) || !isObj(raw.tree) || !Array.isArray(raw.lanes)) return null
  const tree = raw.tree
  if (!str(tree.checked) || !str(tree.landed)) return null
  const lanes: ReceiptLane[] = raw.lanes.flatMap((l): ReceiptLane[] => {
    if (!isObj(l) || !str(l.lane) || !str(l.label) || !str(l.branch) || !str(l.digest) || !str(l.head)) return []
    if (!OUTCOMES.includes(l.outcome as ReceiptLaneOutcome) || typeof l.commits !== 'number') return []
    return [{
      lane: l.lane, label: l.label, branch: l.branch, digest: l.digest, head: l.head, reviewed: l.reviewed === true,
      outcome: l.outcome as ReceiptLaneOutcome, commits: l.commits,
      ...(str(l.itemId) ? { itemId: l.itemId } : {}), ...(str(l.title) ? { title: l.title } : {}),
      ...(str(l.sha) ? { sha: l.sha } : {}), ...(str(l.detail) ? { detail: l.detail } : {})
    }]
  })
  const checks: ReceiptCheck[] = (Array.isArray(raw.checks) ? raw.checks : []).flatMap((c): ReceiptCheck[] =>
    isObj(c) && str(c.command) && str(c.outputId) && typeof c.at === 'number' && str(c.where) && (c.exitCode === null || typeof c.exitCode === 'number')
      ? [{ command: c.command, exitCode: c.exitCode as number | null, outputId: c.outputId, at: c.at, where: c.where }] : [])
  return {
    v: 1, id: raw.id, root: raw.root, into: raw.into, at: raw.at, base: raw.base, before: raw.before, after: raw.after,
    tree: { checked: tree.checked, landed: tree.landed, identical: tree.checked === tree.landed && tree.checked !== '' },
    lanes, checks, complete: lanes.length > 0 && lanes.every((l) => l.outcome === 'merged')
  }
}
