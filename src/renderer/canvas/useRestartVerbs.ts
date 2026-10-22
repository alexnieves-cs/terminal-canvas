import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { type Panel, isReviewPanel, linksOf } from '@renderer/panels/panels'
import { clearAgentState } from '@renderer/session/agent-state-store'
import { clearLiveSession } from '@renderer/session/live-session-store'
import { clearSubagents } from '@renderer/session/subagent-store'
import { clearUsage } from '@renderer/session/usage-store'
import { clearMachineCost } from '@renderer/session/machine-cost-store'
import { clearScrollbackTail } from '@renderer/session/scrollback-store'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { clearLastLine } from '@renderer/session/last-line-store'
import { clearLastActive } from '@renderer/session/last-active-store'
import { clearTrail } from '@renderer/skills/skill-trail-store'
import { forgetAgentLinksFor } from './agent-links-store'
import { forgetEdgesFor } from './useEdgeActivity'
import type { AutomationRow } from '../shell/Inspector'
import { railLabel } from '../shell/rail-rows'
import { describeAutomation, isRestartable } from '../shell/inspector-fields'
import { isSettledHandoff } from '../orchestration/orch-record'

import type { Registry } from '@renderer/session/session-registry'
/**
 * M507 (E4, the Canvas.tsx split). A review node's committed baseline, the
 * restart sequence shared by restartPanel and restartPanelWithMode, the
 * handoff map seeded from the record (M301), and the automation rows. Lifted
 * out of Canvas VERBATIM as one contiguous run and
 * called at exactly the position it occupied, with one destructured Deps
 * object so every dependency array names the same values.
 */
export interface UseRestartVerbsDeps {
  registry: Registry
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  setPanels: Dispatch<SetStateAction<Panel[]>>
}

export function useRestartVerbs(deps: UseRestartVerbsDeps) {
  const {
    panels, panelsRef, setPanels, registry
  } = deps
  /**
   * A node committed. Advance ITS OWN stored baseline to the commit it just
   * made, and nothing else.
   *
   * Without this the node reports the same files after a commit as before it,
   * permanently: it diffs the working tree against its baseline, and
   * committing does not change the working tree. A second press would then
   * re-commit content that is already in history.
   *
   * The SUBJECT PANEL's baseline in main is deliberately left alone. A node
   * can outlive its subject, so reaching into that panel's state is only
   * sometimes possible at all — and a write verb on one panel silently
   * resetting another surface's reading is the wrong direction.
   *
   * NO history entry. Cmd+Z cannot undo a commit, and an undo that restored
   * the old baseline would put the node back to reporting work that is now in
   * history — an undo stack that lies about what it can reverse is worse than
   * one that declines. The panel array still changes, so the existing
   * layout.save effect persists the new sha with no extra plumbing.
   */
  const onReviewCommitted = useCallback((nodeId: string, sha: string) => {
    if (sha === '') return
    setPanels((existing) => existing.map((p) =>
      p.rect.id === nodeId && isReviewPanel(p)
        ? { ...p, subject: { ...p.subject, baselineSha: sha } }
        : p))
  }, [])

  /**
   * The restart sequence, shared by `restartPanel` and `restartPanelWithMode`
   * so the two can never drift.
   *
   * `nextSpec` is what the panel should come back as. `restartPanel` passes
   * the spec unchanged; `restartPanelWithMode` passes one carrying a new
   * permission mode, which is the ONLY way a knob ever changes on a live
   * panel — see restartPanelWithMode's own comment for why a bare edit is
   * unsound.
   *
   * Every ordering note on the old restartPanel still applies verbatim and is
   * left where it was; this function is that body with one parameter added.
   */
  const restartWithSpec = useCallback(
    (id: string, nextSpec: PanelSpecTemplate) => {
      if (!isRestartable(registry.get(id)?.status)) return
      clearAgentState(id)
      forgetEdgesFor(id); forgetAgentLinksFor(id)
      clearLastLine(id)
      clearLastActive(id)
      clearLiveSession(id)
      clearSubagents(id)
      clearTrail(id)
      clearUsage(id)
      clearMachineCost(id)
      clearScrollbackTail(id)
      void registry.dispose(id).then(() => {
        // RE-CHECKED, never captured: the await is a real gap and the panel
        // can be closed inside it.
        if (!panelsRef.current.some((p) => p.rect.id === id)) return
        registry.ensure(id, nextSpec, { dormant: false })
        registry.touch(id)
        registry.bumpVersion()
      })
    },
    [registry]
  )

  // #24: functional links run from the registry's post-status exit hook, not
  // from a second raw IPC listener. A dormant or absent target is RECORDED as
  // skipped and never woken: an automation may restart an already-running
  // terminal, but it must not create an agent the user did not explicitly
  // start. The rule graph is cycle-free at creation and load, so one exit can
  // cascade only along a finite directed chain.
  const [automationResult, setAutomationResult] = useState<Map<string, string>>(() => new Map())
  /**
   * M301, closing Phase C's deferred item. This map is IN MEMORY, so after a
   * relaunch a handoff that fired — or was skipped, or was refused — read
   * `unknown`/`pending` in the dependency lens until the edge happened to fire
   * again. The only record of it was this Map, and the Map does not survive
   * quitting.
   *
   * It does now: M300 writes a durable row at `setHandoffResult`, the one
   * funnel every outcome passes through, with the link's own `from:to` key. On
   * mount the record is read ONCE and the newest row per key seeds the map, so
   * the lens opens on what actually happened rather than on silence.
   *
   * SEEDING, not authority: a row only fills a key this run has not written,
   * so a live outcome always wins over a remembered one. And a failed read
   * seeds nothing — the lens then says `unknown`, which is true, rather than
   * inheriting a stale sentence.
   */
  useEffect(() => {
    if (typeof window.canvas?.ledger?.timeline !== 'function') return
    let live = true
    void window.canvas.ledger.timeline({}, 200).then(
      (read) => {
        if (!live) return
        const seed = new Map<string, string>()
        for (const e of read.entries) {
          if (e.kind !== 'event' || e.row.event !== 'handoff') continue
          const key = e.row.key
          // Newest first, so the first row for a key is its latest outcome.
          // Belt and braces with the write-side filter above: a row an older
          // build may already have left on disk is not restored either.
          if (key !== undefined && e.row.detail !== undefined && isSettledHandoff(e.row.detail) && !seed.has(key)) seed.set(key, e.row.detail)
        }
        if (seed.size === 0) return
        setAutomationResult((current) => {
          const next = new Map(current)
          for (const [k, v] of seed) if (!next.has(k)) next.set(k, v)
          return next
        })
      },
      () => { /* a read that failed seeds nothing; `unknown` is the honest word */ }
    )
    return () => { live = false }
  }, [])
  const automationRowsBuilt: AutomationRow[] = panels.flatMap((source) => linksOf(source)
    .filter((link) => link.automation !== undefined)
    .map((link) => {
      const target = panels.find((panel) => panel.rect.id === link.to)
      return target === undefined ? null : {
        from: source.rect.id,
        to: target.rect.id,
        source: railLabel(source, undefined),
        target: railLabel(target, undefined),
        enabled: link.automation!.enabled,
        automation: link.automation!,
        sentence: describeAutomation(link.automation!)
      }
    })
    .filter((row): row is AutomationRow => row !== null))
  const automationRowsSignature = JSON.stringify(automationRowsBuilt)
  const automationRows = useMemo(() => automationRowsBuilt, [automationRowsSignature])

  return { automationResult, automationRows, automationRowsBuilt, automationRowsSignature, onReviewCommitted, restartWithSpec, setAutomationResult }
}
