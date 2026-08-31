import type { PanelSession } from '@renderer/session/panel-session'
import type {
  DiagnosticsSessionRow,
  DiagnosticsSnapshot,
  SessionBackendInfo
} from '@shared/ipc-contract'

export type { DiagnosticsSessionRow, DiagnosticsSnapshot }

/**
 * The diagnostics overlay's own view model: pure, no DOM, no React — the same
 * shape `review-node-model.ts`/`toolbox-node-model.ts` already earn a place in
 * `verify:rail`'s plain-node bundle for, and for the identical reason: this is
 * a computation worth pinning without a real renderer, a real registry or a
 * real PTY anywhere in earshot.
 *
 * `registry.all()` only ever returns TERMINAL sessions — a review, file, jira
 * or toolbox panel never reaches `assignTiers`/`registry.ensure` at all (see
 * "A review node never reaches `assignTiers` or `registry.ensure`" in
 * CLAUDE.md), so there is no `kind` field on a row: every row this model
 * produces is a terminal panel's session by construction.
 *
 * `DiagnosticsSessionRow` (declared in shared/ipc-contract.ts, since it is
 * also the export bundle's wire shape) deliberately has no `command`, no
 * `cwd`, no `args`, and nothing derived from `shell-env.ts`'s captured
 * environment. Backlog #31 names exactly this trap — "anything that
 * serialises app state for diagnostics must know not to include it" — and the
 * fix here is structural rather than a runtime scrub: the type this function
 * returns simply has nowhere to put a secret or a terminal byte, so a future
 * field added to `PanelSession` cannot leak through this model by accident
 * the way a spread would. `main/diagnostics-export.ts` writes exactly this
 * shape to disk with no further filtering, because the filtering already
 * happened here.
 */

export interface DiagnosticsInput {
  panels: PanelSession[]
  budget: number
  liveCount: number
  heldCount: number
  backend: SessionBackendInfo | null
  ipcMessagesPerSecond: number | null
}

function sessionOf(panel: PanelSession): DiagnosticsSessionRow {
  const row: DiagnosticsSessionRow = {
    id: panel.id,
    tier: panel.tier,
    dormant: panel.dormant,
    spawned: panel.spawned,
    status: panel.status.kind
  }
  if (panel.status.kind === 'running') row.pid = panel.status.pid
  return row
}

/**
 * Pure and total: no field here is read from anywhere but `input` itself, so
 * two calls with equal input produce deep-equal output — the same purity
 * `merged-layout.ts` and `rail-sections.ts` are pinned on, and what lets the
 * overlay poll this on its own timer with no risk of it doing anything but
 * describing what it was handed.
 */
export function buildDiagnosticsSnapshot(input: DiagnosticsInput): DiagnosticsSnapshot {
  return {
    liveCount: input.liveCount,
    heldCount: input.heldCount,
    budget: input.budget,
    backend: input.backend,
    ipcMessagesPerSecond: input.ipcMessagesPerSecond,
    sessions: input.panels.map(sessionOf)
  }
}
