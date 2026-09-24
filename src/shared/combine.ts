/**
 * M311. MAKING PARALLEL WORK SAFE TO COMBINE — the pure half.
 *
 * Two lanes that each pass on their own can still fail together, and the only
 * honest answer to "do these combine?" is a check run against the combined
 * tree. Everything before that run is a PREDICTION, and this module keeps the
 * two apart in its vocabulary:
 *
 * - an **overlap** is one repo-relative path changed in two or more SEPARATE
 *   checkouts (worktrees). Nothing is broken yet — each checkout has its own
 *   copy — but the files will meet at integration. It is a review path, not an
 *   alarm: most overlaps merge cleanly.
 * - **contention** is two or more writers in the SAME checkout on the same
 *   file. That is a live hazard (each agent's next read sees the other's
 *   half-edit) and no integration order fixes it; it is the Watch lens's
 *   `contended` flag, keyed by checkout (orchestration-live.ts).
 *
 * Conflating them was the obvious version and it fails silently in both
 * directions: two worktrees writing `src/api.ts` under different absolute
 * paths never showed as contended (keys differed), while two relative-path
 * writers in different checkouts showed as contended when they were not.
 *
 * Imports types only, so it runs in the plain-node tier (verify:review combine.*).
 */

import type { LaneFingerprint } from './integration'

/** One lane as the cross-worktree review reports it (ReviewSection, flattened). */
export interface CombineLane {
  /** The checkout's path — the lane's identity here, and where its checks run. */
  id: string
  label: string
  branch: string
  panelId?: string
  /** Repo-relative paths this lane changed since its fork (committed + working). */
  files: readonly string[]
  added: number
  removed: number
}

/**
 * An authored ordering between two lanes: `from` must land before `to`. Read
 * from the hand-off links the person drew (orchestration-dependency.ts) —
 * never inferred from overlap, which says the lanes MEET, not which is first.
 */
export interface CombineEdge { from: string; to: string }

export interface CombineOverlap {
  path: string
  /** Lane ids, in the order the lanes were given. */
  lanes: string[]
}

export interface CombineStep {
  id: string
  label: string
  /** Why it sits here, in words a person can argue with. */
  reason: string
  /** Paths it shares with lanes that land BEFORE it — where a conflict would show. */
  meets: string[]
}

export interface CombinePlan {
  /** Lanes with changes, in the given order; clean lanes have nothing to combine. */
  lanes: CombineLane[]
  overlaps: CombineOverlap[]
  /** The proposed integration order. Empty when fewer than two lanes have changes. */
  order: CombineStep[]
  /**
   * Lane ids caught in a cycle of authored links, when there is one — the
   * order then falls back to the overlap rule for those lanes and SAYS so,
   * rather than dropping them from the plan.
   */
  cycle: string[]
  /** One sentence for the header. */
  summary: string
}

/**
 * The plan. Order rule, in priority:
 *  1. an authored link wins (`from` before `to`);
 *  2. among lanes free to go, one that meets NOBODY lands first — it cannot
 *     conflict, so it should not wait behind one that might;
 *  3. then the smaller diff, so the larger change is the one rebased over
 *     fewer lines (and its author, not a bystander, resolves the meeting);
 *  4. then the given order, so the plan is stable.
 */
export function planCombine(lanes: readonly CombineLane[], edges: readonly CombineEdge[] = []): CombinePlan {
  const changed = lanes.filter((l) => l.files.length > 0)
  const ids = new Set(changed.map((l) => l.id))
  const byPath = new Map<string, string[]>()
  for (const l of changed) {
    for (const f of new Set(l.files)) {
      const at = byPath.get(f)
      if (at === undefined) byPath.set(f, [l.id])
      else at.push(l.id)
    }
  }
  const overlaps: CombineOverlap[] = [...byPath.entries()]
    .filter(([, at]) => at.length > 1)
    .map(([path, at]) => ({ path, lanes: at }))
    .sort((a, b) => b.lanes.length - a.lanes.length || a.path.localeCompare(b.path))
  const overlapCount = new Map<string, number>()
  for (const o of overlaps) for (const id of o.lanes) overlapCount.set(id, (overlapCount.get(id) ?? 0) + 1)

  // Authored links between lanes that are both in the plan; a self-link and a
  // duplicate carry nothing.
  const live = edges.filter((e) => e.from !== e.to && ids.has(e.from) && ids.has(e.to))
  const preds = new Map<string, Set<string>>(changed.map((l) => [l.id, new Set<string>()]))
  for (const e of live) preds.get(e.to)?.add(e.from)

  const rank = (a: CombineLane, b: CombineLane): number =>
    (overlapCount.get(a.id) ?? 0 ? 1 : 0) - (overlapCount.get(b.id) ?? 0 ? 1 : 0) ||
    (a.added + a.removed) - (b.added + b.removed) ||
    changed.indexOf(a) - changed.indexOf(b)

  const placed: CombineLane[] = []
  const done = new Set<string>()
  const reasons = new Map<string, string>()
  let cycle: string[] = []
  while (placed.length < changed.length) {
    const ready = changed.filter((l) => !done.has(l.id) && [...(preds.get(l.id) ?? [])].every((p) => done.has(p)))
    let next: CombineLane
    if (ready.length === 0) {
      // Every remaining lane waits on another remaining lane: a cycle. Take
      // the best by the overlap rule and say the links could not be honoured.
      const rest = changed.filter((l) => !done.has(l.id))
      if (cycle.length === 0) cycle = rest.map((l) => l.id)
      next = [...rest].sort(rank)[0]
      reasons.set(next.id, 'its hand-off links form a loop, so the overlap rule decides')
    } else {
      next = [...ready].sort(rank)[0]
      const after = [...(preds.get(next.id) ?? [])]
      if (after.length > 0) {
        const names = after.map((p) => changed.find((l) => l.id === p)?.label ?? p)
        reasons.set(next.id, `after ${names.join(', ')} — a hand-off link says so`)
      } else if ((overlapCount.get(next.id) ?? 0) === 0) {
        reasons.set(next.id, 'touches no file another lane changed')
      } else {
        reasons.set(next.id, `smallest of the overlapping lanes (${next.added + next.removed} lines)`)
      }
    }
    placed.push(next)
    done.add(next.id)
  }

  const order: CombineStep[] = changed.length < 2 ? [] : placed.map((l, i) => {
    const before = new Set(placed.slice(0, i).map((p) => p.id))
    const meets = overlaps.filter((o) => o.lanes.includes(l.id) && o.lanes.some((x) => before.has(x))).map((o) => o.path)
    return { id: l.id, label: l.label, reason: reasons.get(l.id) ?? '', meets }
  })

  const summary = changed.length === 0 ? 'No lane has changes to combine.'
    : changed.length === 1 ? `One lane has changes (${changed[0].label}) — nothing to combine it with.`
      : overlaps.length === 0 ? `${changed.length} lanes change separate files — they should combine cleanly; a combined check confirms it.`
        : `${changed.length} lanes, ${overlaps.length} ${overlaps.length === 1 ? 'file' : 'files'} changed in more than one — review ${overlaps.length === 1 ? 'it' : 'them'} before combining.`
  return { lanes: changed, overlaps, order, cycle, summary }
}

/**
 * A path as a checkout sees it: repo-relative when it is absolute and inside
 * `checkout`, unchanged otherwise (a relative tool path already is). Both
 * sides lose a trailing slash first, so `/r/wt` does not claim `/r/wt2/x`.
 */
export function relativeToCheckout(path: string, checkout: string | undefined): string {
  if (checkout === undefined || checkout === '' || !path.startsWith('/')) return path.replace(/^\.\//, '')
  const root = checkout.replace(/\/+$/, '')
  if (path === root) return '.'
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

/** What one combine run found, as main reports it (`combine:run`). */
export type CombineRunResult =
  | {
    kind: 'combined'
    /** The scratch checkout the lanes were applied into — where the combined check runs. */
    path: string
    /** The main tree's HEAD the combination starts from. */
    base: string
    applied: string[]
    /**
     * M317. Each lane's fingerprint AS IT WAS COMBINED (`integration.ts`) —
     * what makes the result able to go stale. Absent from a pre-M317 answer.
     */
    inputs?: LaneFingerprint[]
    /** M317. The combined tree's hash, when every lane applied — what the integrate step compares the landed tree to. */
    tree?: string
    /** A lane whose changes did not apply cleanly, and the paths git named; the run stops there. */
    conflict: { lane: string; paths: string[]; detail: string } | null
  }
  | { kind: 'git-missing' }
  | { kind: 'unreadable'; detail: string }

/** The paths `git apply --3way` names in its conflict report. */
export function parseApplyConflicts(stderr: string): string[] {
  const out = new Set<string>()
  for (const line of stderr.split('\n')) {
    // git ≥ 2.34 names a three-way conflict as a sentence with the path quoted.
    const quoted = /^Applied patch to '(.+)' with conflicts\.$/.exec(line.trim())
    if (quoted !== null) { out.add(quoted[1]); continue }
    const m = /^(?:error: patch failed: |U |CONFLICT \(content\): Merge conflict in |error: )([^:\s][^:]*?)(?::\d+)?(?:: .*)?$/.exec(line.trim())
    if (m === null) continue
    const p = m[1].trim()
    // `error: could not build fake ancestor` and friends are sentences, not paths.
    if (p.includes(' ')) continue
    out.add(p)
  }
  return [...out]
}

/** The sentence the Combine section shows for a run. */
export function combineRunLine(r: CombineRunResult, labelOf: (id: string) => string): string {
  if (r.kind === 'git-missing') return 'git is not installed, so the lanes cannot be combined here.'
  if (r.kind === 'unreadable') return `Could not combine: ${r.detail}`
  if (r.conflict !== null) {
    const where = r.conflict.paths.length > 0 ? ` in ${r.conflict.paths.join(', ')}` : ''
    return `${labelOf(r.conflict.lane)} does not apply on top of ${r.applied.length === 0 ? 'the main tree' : r.applied.map(labelOf).join(' + ')}${where}.`
  }
  return `${r.applied.length} lanes applied cleanly on ${r.base.slice(0, 7)} — run the checks on the combined tree.`
}
