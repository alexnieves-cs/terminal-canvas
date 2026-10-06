import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onChatTurnEnd } from '@renderer/chat/chat-store'
import type { WorktreeListRow } from '@shared/ipc-contract'
import type { ReviewAcross, ReviewSection } from '@shared/review'
import type { PersistedWorkItem } from '@shared/work-items'
import type { RunLiveFact } from '@shared/run-outcome'
import { projectSession } from '@shared/run-outcome'
import { laneSection, reviewHandoff, type ReviewHandoff } from '@shared/review-readiness'

// Module-level so `records ?? NO_WORKTREES` is the same array while the list
// is unread. A fresh `[]` each render rebuilt `lanes`, then `handoffsVersion`,
// then the resume summary, and the canvas re-rendered without a field changing.
// Opening the world in that loop nested layout updates until React stopped it.
// `records === null` is still "not read yet"; this constant is only the memo key.
const NO_WORKTREES: readonly WorktreeListRow[] = []

/**
 * M202 (D07). THE CARD'S REVIEW READINESS, read once per REPOSITORY.
 *
 * A card cannot answer "is there anything to review?" from anything it holds:
 * the answer is a diff, and a diff is main's. This hook is the bounded reader
 * that gets it, and the two bounds are the whole design.
 *
 * BY ROOT, NOT BY CARD. `review:across` answers for a repository — every
 * worktree of it, each against its own fork — so ten cards dispatched into
 * ten lanes of one repository are ONE invoke and not ten. `laneSection` then
 * picks each card's own section out of that one answer. Asking per card would
 * shell out to git once per card per refresh, which is this repository's
 * recurring signature for a missing dedupe: visible only as heat.
 *
 * ON EVENTS, NEVER ON A TIMER. The trigger is the same one the inspector's
 * Changes section uses — a chat turn ending — plus a change in the set of
 * roots the board actually names. A poll would keep asking git about a canvas
 * nobody is looking at; a card's readiness is only ever wrong in the window
 * between an agent writing a file and its turn ending, and the card says
 * `working` for the whole of that window anyway.
 *
 * THREE STATES, NOT TWO. Before the first answer lands, a dispatched card's
 * handoff is `undefined` and the card says NOTHING about review — never
 * `unknown`, never a zero. "Not read yet" and "read, and there is nothing"
 * are different facts and lead to different actions.
 */
export interface TaskHandoffDeps {
  workItems: readonly PersistedWorkItem[]
  /** M199's live facts, already built once for the canvas. */
  liveFacts: Readonly<Record<string, RunLiveFact>>
}

/**
 * `review:across` fails at the REPOSITORY level with two arms of its own, and
 * those are the task's failure too: a lane whose repository could not be read
 * has no diff to review. They are turned into the section shapes
 * `reviewHandoff` already has arms for, rather than given a fourth state —
 * the person's fix ("git is not on the PATH", "this folder could not be
 * read") is the same sentence whether the read failed for the repository or
 * for the lane inside it.
 */
function sectionFor(across: ReviewAcross, lanePath: string): ReviewSection | undefined {
  if (across.kind === 'git-missing') return { path: lanePath, branch: '', label: 'lane', result: { kind: 'git-missing' } }
  if (across.kind === 'unreadable') return { path: lanePath, branch: '', label: 'lane', result: { kind: 'repo-unreadable', detail: across.detail } }
  return laneSection(across.sections, lanePath)
}

export function useTaskHandoffs(deps: TaskHandoffDeps): {
  handoffOf: (itemId: string) => ReviewHandoff | undefined
  /** The task's lane, from the SAME records the handoff was judged against. */
  /** M204 (D08). `panelId` is the record's: the panel that opened the lane, so a task can say that panel is gone without the palette's list. */
  laneOf: (itemId: string) => { path: string; root: string; panelId: string; branch: string } | undefined
  /** The lane's changed paths, from the SAME read the handoff was judged against. */
  pathsOf: (itemId: string) => readonly string[] | undefined
  refresh: () => void
  /**
   * M315. Changes identity whenever the handoffs were rebuilt. `handoffOf` is
   * stable by design (it reads a ref), so an effect that DERIVES from it —
   * the resume summary — names this in its dependencies, or it keeps the
   * answer it computed before the first git read landed.
   */
  handoffsVersion: object
} {
  const { workItems, liveFacts } = deps
  const [acrossByRoot, setAcrossByRoot] = useState<Readonly<Record<string, ReviewAcross>>>({})
  const [token, setToken] = useState(0)
  const refresh = useCallback(() => setToken((n) => n + 1), [])

  /*
   * The worktree records, read HERE and not taken from the canvas's own list.
   *
   * That list is loaded when the PALETTE opens (`if (palette.open)
   * reloadWorktrees()`) — the right rule for a palette row and the wrong one
   * for a card that has to be honest at rest: a card reading it would say
   * `not started` about a task with a real lane until the person happened to
   * press ⌘K, which is a wrong answer that looks exactly like a right one.
   *
   * `null` is the third state and it is load-bearing: until the read lands,
   * a card that NAMES a worktree says nothing at all. Treating "not read yet"
   * as "record missing" would flash `lane missing` on every launch, which is
   * an alarm about nothing, on the surface a person checks first.
   */
  const [records, setRecords] = useState<readonly WorktreeListRow[] | null>(null)
  const wanted = workItems.some((i) => i.worktreeId !== undefined)
  const unknown = records === null ? wanted : workItems.some((i) => i.worktreeId !== undefined && !records.some((w) => w.id === i.worktreeId))
  // M401 (B2). A REFRESH re-reads the list too (token > 0), not only an
  // unknown record: a lane removed from the review is a record this list
  // still HOLDS, so "unknown" never fires for it and the task went on
  // offering to remove a lane that was gone. One IPC per refresh.
  const refreshedAt = useRef(0)
  useEffect(() => {
    if (!wanted) return
    if (!unknown && token === refreshedAt.current) return
    refreshedAt.current = token
    let live = true
    void window.canvas.worktree.list()
      .then((rows) => { if (live) setRecords(rows) })
      // A failed read leaves the previous answer standing; it is never turned
      // into an empty list, which would read as "every lane is gone".
      // A failed read LEAVES `records` where it was — `null` on the first
      // attempt, so every dispatched card goes on saying nothing. The first
      // cut wrote `r ?? []` here, and on the first read (the only one that
      // matters, since `records` starts null) that turned one failed IPC call
      // into `lane missing` on every card with a worktree, with no retry: a
      // loud, confident, wrong alarm about work that was fine.
      .catch(() => { /* keep the previous answer; an unread list is not an empty one */ })
    return () => { live = false }
    // Re-read when a card names a record this list does not hold — a fresh
    // dispatch — and on the same token the diffs are re-read on.
  }, [wanted, unknown, token])
  const worktreeRows = records ?? NO_WORKTREES

  // The lane every dispatched card sits in, and the repository it forks. A
  // card whose worktree record is gone contributes NO root: it must not drag
  // a read of some other repository along behind it.
  const lanes = useMemo(() => {
    // M428: the record's branch rides along — the world's card says which branch a lane's agent is on.
    const out: Record<string, { path: string; root: string; panelId: string; branch: string }> = {}
    for (const item of workItems) {
      if (item.worktreeId === undefined) continue
      const record = worktreeRows.find((w) => w.id === item.worktreeId)
      if (record === undefined) continue
      out[item.id] = { path: record.path, root: record.root, panelId: record.panelId, branch: record.branch }
    }
    return out
  }, [workItems, worktreeRows])

  // A stable key for "which repositories does this board name", so the effect
  // re-runs when that set changes and not on every render of a moving card.
  const roots = useMemo(() => [...new Set(Object.values(lanes).map((l) => l.root))].sort(), [lanes])
  const rootsKey = roots.join(' ')

  useEffect(() => onChatTurnEnd(() => refresh()), [refresh])

  useEffect(() => {
    if (roots.length === 0) { setAcrossByRoot({}); return }
    let live = true
    void Promise.all(roots.map(async (root) => [root, await window.canvas.review.across(root)] as const))
      .then((pairs) => {
        // The workspace can change under an await; a landed answer for a root
        // this board no longer names is dropped rather than cached.
        if (!live) return
        setAcrossByRoot(Object.fromEntries(pairs))
      })
      .catch(() => { /* a failed read leaves the previous answer standing, the way machine:sample's does */ })
    return () => { live = false }
    // `roots` is rebuilt every render; `rootsKey` is what actually changed.
  }, [rootsKey, token]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * The changed paths per task, from the SAME across answer the handoff was
   * judged against.
   *
   * This exists so the review node does not recompute them from its own
   * fetch. The two reads refresh on different triggers, so a node that
   * computed its own signature could hand `Mark reviewed` a fingerprint for a
   * diff the card never judged — two authors of one fact, which is the thing
   * this repository names by name.
   */
  const pathsRef = useRef<Record<string, readonly string[]>>({})
  const handoffsRef = useRef<Record<string, ReviewHandoff>>({})
  const built = useMemo(() => {
    const out: Record<string, ReviewHandoff> = {}
    const paths: Record<string, readonly string[]> = {}
    for (const item of workItems) {
      const lane = lanes[item.id]
      // A card with no lane at all still has an answer — `no-lane`, whose
      // action is Start work — and it needs no read to give it.
      // Three cases, kept apart. The records not read yet, or a lane whose
      // diff has not landed, say NOTHING. A lane whose record is genuinely
      // gone is `lane-missing`, which is a real answer with a real fix.
      if (item.worktreeId !== undefined && records === null) continue
      const across = lane === undefined ? undefined : acrossByRoot[lane.root]
      if (item.worktreeId !== undefined && lane !== undefined && across === undefined) continue
      const fact = item.panelId === undefined ? undefined : liveFacts[item.panelId]
      const section = lane === undefined || across === undefined ? undefined : sectionFor(across, lane.path)
      const r = section?.result
      paths[item.id] = r !== undefined && (r.kind === 'changes' || r.kind === 'shared') ? r.files.map((f) => f.path) : []
      out[item.id] = reviewHandoff({
        item,
        section,
        supervision: item.panelId === undefined || fact === undefined ? undefined : projectSession(item.panelId, fact)
      })
    }
    return { out, paths }
  }, [workItems, lanes, acrossByRoot, liveFacts, records])
  handoffsRef.current = built.out
  pathsRef.current = built.paths

  // The review node's task section must be told the SAME lane the handoff was
  // judged against. Two lookups against two lists would agree the day they
  // were written and disagree the first time one of them was stale.
  const lanesRef = useRef(lanes)
  lanesRef.current = lanes
  const handoffOf = useCallback((itemId: string) => handoffsRef.current[itemId], [])
  const laneOf = useCallback((itemId: string) => lanesRef.current[itemId], [])
  const pathsOf = useCallback((itemId: string) => pathsRef.current[itemId], [])
  return { handoffOf, laneOf, pathsOf, refresh, handoffsVersion: built }
}
