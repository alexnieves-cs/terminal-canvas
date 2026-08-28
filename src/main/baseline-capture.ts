import type { ReviewBaseline } from '@shared/review'

/**
 * The once-only guard's dependencies, injected rather than imported: this
 * lets the guard run under plain node against fakes (verify:review), the
 * same trade layout-store.ts and main/presets.ts already make. In
 * production every one of these closes over the real layoutStore and
 * reviewEngine — see main/index.ts.
 */
export interface BaselineCaptureDeps {
  baselineOf: (panelId: string) => ReviewBaseline | undefined
  setBaseline: (panelId: string, baseline: ReviewBaseline) => void
  resolveRepo: (cwd: string) => Promise<string | null>
  captureBaseline: (root: string) => Promise<string | null>
}

export interface BaselineCapture {
  /** Fire-and-forget: must never delay or fail a spawn. */
  capture(panelId: string, cwd: string): void
  /** Called from kill(); ends this id's current incarnation for capture purposes. */
  drop(panelId: string): void
  /**
   * True once a capture for this panel resolved a cwd that is NOT a
   * repository. This is the fact review-engine.ts's `notARepo` dep asks for
   * — see that interface's own doc comment for why `baselineOf` alone
   * cannot tell "not a repo" apart from "never spawned". Membership-only
   * (no timestamp, no epoch of its own): `drop` clears it below, the same
   * moment it poisons an in-flight sha capture, so a recycled id does not
   * inherit a stale "not a repo" verdict from whichever panel held that id
   * before it.
   */
  isNotARepo(panelId: string): boolean
}

export function createBaselineCapture(deps: BaselineCaptureDeps): BaselineCapture {
  // Panel id -> epoch. A fire-and-forget capture is a promise chain with no
  // way to cancel it, so a panel killed WHILE its capture is still awaiting
  // git can have that closure resolve AFTER the kill and write a baseline
  // for an id nothing owns any more. That is reachable, not hypothetical:
  // onReset() always mints the same recycled id (FIRST_RUN_ID), so the very
  // next panel to take that id would inherit a stranger's stale snapshot and
  // report "no changes" for a repository its own agent rewrote — the single
  // failure this whole milestone exists to prevent, arriving through a
  // second door. `drop` bumps the epoch; `capture` reads it once, before its
  // first await, and refuses to write if the epoch has moved by the time it
  // is ready to.
  const epoch = new Map<string, number>()
  // Membership only, deliberately separate from `epoch`: epoch answers "is
  // an in-flight write for THIS incarnation still valid", this Set answers
  // "what did the LAST valid capture conclude", and the two questions have
  // different lifetimes — this one has to survive past the moment a single
  // capture() call finishes, for as long as reviewEngine.review() keeps
  // asking about this panel.
  const notARepoIds = new Set<string>()

  return {
    capture(panelId, cwd) {
      if (deps.baselineOf(panelId) !== undefined) return
      const atCall = epoch.get(panelId) ?? 0
      void (async () => {
        const root = await deps.resolveRepo(cwd)
        if (root === null) {
          // Same epoch discipline as the sha write below: a kill landing
          // mid-resolve must not leave a stale "not a repo" verdict for
          // whichever panel recycles this id next.
          if ((epoch.get(panelId) ?? 0) === atCall) notARepoIds.add(panelId)
          return
        }
        // Two panels can spawn in the same tick and both pass the first
        // check above before either await resolves; this second check is
        // what stops the second one from overwriting the first's
        // already-captured baseline. It is a DIFFERENT guard from the epoch
        // one below — this one is about two LIVE captures for the same id,
        // the epoch one is about a capture that outlived its panel.
        if (deps.baselineOf(panelId) !== undefined) return
        const sha = await deps.captureBaseline(root)
        if (sha === null) return
        // The epoch may have moved during either await above — a kill can
        // land at any point while git is still running. Checked here, at
        // the write, rather than after each individual await: a stale write
        // is the only failure mode that matters, and checking once at the
        // point of writing covers both awaits without duplicating the guard.
        if ((epoch.get(panelId) ?? 0) !== atCall) return
        deps.setBaseline(panelId, { root, sha })
      })()
    },
    drop(panelId) {
      epoch.set(panelId, (epoch.get(panelId) ?? 0) + 1)
      notARepoIds.delete(panelId)
    },
    isNotARepo(panelId) {
      return notARepoIds.has(panelId)
    }
  }
}
