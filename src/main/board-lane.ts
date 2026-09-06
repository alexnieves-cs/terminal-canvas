/**
 * M114. THE LANE — what `board:lane` does, in order, each step refusing by
 * name and minting nothing when it does:
 *
 *   1. the teammate exists;
 *   2. the repository root: the caller's chosen place (a typed or Jira item
 *      has no repository, so the sheet asked which place) or the clone of the
 *      item's `owner/repo` found under the teammate's places (board-repo.ts);
 *   3. the Places gate on that ROOT — before any worktree exists, M100's rule
 *      (the gate BEFORE resolveCwd, whose home fallback would launder a
 *      refused folder);
 *   4. the worktree manager's `ensureForPanel` for the CHAT's panel id, whose
 *      refusal passes through verbatim (git's own sentence).
 *
 * The lane itself lives under `userData/worktrees`, outside every place by
 * construction; `agent:create` will ask the gate again on the lane path, and
 * the gate judges a known lane by its record's root (places.ts, M114).
 *
 * Every collaborator is injected, so `verify:file lane.1` drives the whole
 * sequence under plain node with a fake gate and a fake manager.
 */
import { findRepoUnderPlaces, type RepoLookupDeps } from './board-repo'
import type { PlacesGate } from './places'
import type { WorktreeOutcome } from '../shared/types'
import type { PersistedTeammate } from '../shared/teammates'
import type { WorktreeRecord } from '../shared/layout-schema'
import type { BoardLaneRequest, BoardLaneResult } from '../shared/ipc-contract'

export interface BoardLaneDeps extends RepoLookupDeps {
  gate: PlacesGate
  worktrees: { ensureForPanel(panelId: string, cwd: string): Promise<WorktreeOutcome> }
  teammate: (id: string) => PersistedTeammate | undefined
  /** The record the manager just minted (or reused) for this panel in this root — the id the card keeps. */
  recordFor: (panelId: string, root: string) => WorktreeRecord | undefined
}

export interface BoardLane {
  lane(req: BoardLaneRequest): Promise<BoardLaneResult>
}

export function createBoardLane(deps: BoardLaneDeps): BoardLane {
  return {
    async lane(req) {
      const mate = deps.teammate(req.teammateId)
      if (mate === undefined) return { kind: 'refused', reason: `no teammate is called ${req.teammateId} — it may have been deleted; open the Teammates pane` }
      let root: string
      if (req.root !== undefined) {
        root = req.root
      } else if (req.repo !== undefined) {
        const found = findRepoUnderPlaces(req.repo, mate.places, deps)
        if (found === null) return { kind: 'refused', reason: `${mate.name} has no place that holds ${req.repo} — add a folder with a clone of it in the Teammates pane` }
        root = found
      } else {
        return { kind: 'refused', reason: `this item names no repository — choose which place ${mate.name} should work it in` }
      }
      const place = deps.gate.check(req.teammateId, root)
      if (!place.ok) return { kind: 'refused', reason: place.reason }
      const outcome = await deps.worktrees.ensureForPanel(req.chatPanelId, root)
      if (outcome.kind !== 'active') return { kind: 'refused', reason: outcome.reason }
      const record = deps.recordFor(req.chatPanelId, outcome.root)
      if (record === undefined) return { kind: 'refused', reason: `the worktree was created but no record names it — check the Worktrees list` }
      return { kind: 'lane', path: outcome.path, worktreeId: record.id, branch: outcome.branch, root: outcome.root }
    }
  }
}
