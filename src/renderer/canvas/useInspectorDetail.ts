import { onChatTurnEnd } from '@renderer/chat/chat-store'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Registry } from '@renderer/session/session-registry'
import { useAgentState } from '@renderer/session/agent-state-store'
import { getUsage } from '@renderer/session/usage-store'
import { isTerminalPanel, isToolboxPanel, type Panel } from '@renderer/panels/panels'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { ToolInventoryResult } from '@shared/toolbox'
import {
  buildInspectorSummary, buildReviewFields, buildToolboxFields, foldUsageHistory,
  reviewSignature, toolboxSignature, type ReviewFieldModel, type UsageHistory
} from '../shell/inspector-fields'

export interface InspectorDetailDeps {
  registry: Registry
  palette: PaletteController
  panels: Panel[]
  selectedId: string | null
  selectedPanel: Panel | undefined
  /**
   * M68. Whether the selected panel's process has arrived. The Changes query
   * answered "no session yet" for a panel selected while it was starting and
   * never asked again (only an idle ARRIVAL re-fired it, which a plain shell
   * never produces); this flips once, on spawn, and re-asks.
   */
  selectedSpawned: boolean
  /**
   * Every sessionless kind, not review nodes alone. Main holds no baseline
   * for a panel that never spawned, so querying for one renders a correct
   * answer to a question nobody should be asking.
   */
  selectedIsSessionless: boolean
  waitingIds: readonly string[]
}

/**
 * The inspector's three async detail sections — Changes, Toolbox and the
 * canvas summary — plus the palette's `hasSelection` probe.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split).
 *
 * Each section is a THREE-state result and must stay one: "nothing to show",
 * "asked but not yet answered", and "a real answer" are three different
 * renderings, and collapsing any two of them tells the user the wrong fix.
 * That is why `review` and `toolbox` start as `null`/`undefined` rather than
 * as an empty result, and why the effects clear before they re-query — a
 * select that only cleared on select-to-null renders the PREVIOUS panel's
 * Changes summary under the new panel's heading for the length of one IPC
 * round trip (`verify:panels` 100b).
 */
export function useInspectorDetail(deps: InspectorDetailDeps) {
  // M107. A chat's turn end is a change of what it changed: the Changes
  // section re-asks when the SELECTED chat's turn ends (M77 captured the
  // baseline at create; the trigger was the missing piece).
  const [chatTurnEnds, setChatTurnEnds] = useState(0)
  useEffect(() => onChatTurnEnd((id) => { if (id === deps.selectedId) setChatTurnEnds((n) => n + 1) }), [deps.selectedId])
  const {
    registry, palette, panels, selectedId, selectedPanel,
    selectedIsSessionless, selectedSpawned, waitingIds
  } = deps

  // The Changes section's own data, queried through review:panel rather than
  // computed here — the engine (main-side, real git) is the sole authority,
  // the same "no second author of a fact one side already derives correctly"
  // rule M6d and M7 both state in CLAUDE.md.
  const [review, setReview] = useState<ReviewFieldModel | null>(null)
  const selectedAgentState = useAgentState(selectedId ?? '')

  // A COUNTER of idle ARRIVALS, not the state itself. The review effect used
  // to depend on `selectedAgentState` wholesale, so `starting`, `busy`,
  // `idle`, `wants-you` and `exited` each re-fired it — up to four git
  // subprocesses per transition, on a path a chatty agent walks constantly —
  // while the spec and IPC.REVIEW_PANEL's own comment both name exactly one
  // useful signal: the transition TO `idle`, which means "this agent stopped
  // producing output" and is therefore the moment its work is worth
  // re-reading. Depending on a derived `state === 'idle'` boolean would not
  // do: it changes on the way OUT of idle too, which is a firing with nothing
  // new to read.
  const [idleArrivals, setIdleArrivals] = useState(0)
  const prevAgentRef = useRef<{ id: string | null; state: string | undefined }>({
    id: null,
    state: undefined
  })
  useEffect(() => {
    const prev = prevAgentRef.current
    prevAgentRef.current = { id: selectedId, state: selectedAgentState }
    // Only a transition WITHIN one panel's own selection. Across a selection
    // change the id has already re-fired the review effect below, and
    // counting it again would spend a second round of git processes to learn
    // the same answer.
    if (prev.id === selectedId && selectedAgentState === 'idle' && prev.state !== 'idle') {
      setIdleArrivals((n) => n + 1)
    }
  }, [selectedId, selectedAgentState])

  // M68. `never-started` for a panel that HAS spawned is the capture still
  // running — main fires it at create and answers the review before git has
  // said whether the cwd is a repository — so the answer is re-asked, a few
  // times, half a second apart, until it says something else. Bounded: a
  // panel that genuinely never started stays that way and this stops.
  /**
   * M86. Where the selected panel's branch stands against its tracking ref,
   * asked once the review answer has named a root. Three states: null before
   * an answer, a phrase, or '' when git could not say (the Changes note
   * already explains). No fetch is ever run; the phrase says `last fetch`.
   */
  const [branchLine, setBranchLine] = useState<string | null>(null)
  /** M86. The repository every worktree shares — a worktree panel's leaf is `tc-<id>-<stamp>`, which names nothing (M86's verifier). */
  const [repository, setRepository] = useState<string | null>(null)
  const reviewRoot = review?.root ?? null
  useEffect(() => {
    // Cleared on a ROOT change only, never on an idle: clearing on every idle
    // made the line vanish and return each time the agent finished a turn.
    setBranchLine(null)
    setRepository(null)
  }, [reviewRoot])
  useEffect(() => {
    if (reviewRoot === null) return
    let live = true
    void window.canvas.git.status(reviewRoot).then((s) => {
      if (!live) return
      if (s.kind !== 'status') { setBranchLine(''); return }
      setRepository(s.repository)
      setBranchLine(s.upstream === null ? `${s.branch} · no upstream` : `${s.branch} · ahead ${s.upstream.ahead} · behind ${s.upstream.behind} · against the last fetch`)
    }).catch(() => { if (live) setBranchLine('') })
    return () => { live = false }
  }, [reviewRoot, idleArrivals])
  const [reask, setReask] = useState(0)
  useEffect(() => { setReask(0) }, [selectedId])
  useEffect(() => {
    // Cleared UNCONDITIONALLY, before the invoke, not only when the selection
    // goes to null. The `live` flag below prevents a stale WRITE; nothing
    // prevented the stale RENDER, so selecting panel B kept panel A's model —
    // a real file list, with real counts — under B's heading for an IPC round
    // trip plus up to four git subprocesses, which is plainly visible on a
    // real repository. That is the confident wrong attribution this milestone
    // exists to prevent, arriving from the renderer rather than from git.
    // verify:panels 100b.
    setReview(null)
    // A review NODE is skipped outright, leaving `review` null so the Changes
    // section never renders for it. Main holds no baseline for a node's own
    // id, so the engine answers `never-started` — a perfectly correct answer
    // to a question nobody should be asking — and the pane rendered "this
    // panel has no session yet" under a heading for a panel that will never
    // have one, plus an Open-review button whose handler refuses a node as a
    // subject and returns. Both are one wrong query, not two bugs.
    // verify:panels 112.
    if (selectedId === null || selectedIsSessionless) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | null = null
    void window.canvas.review.panel(selectedId).then((result) => {
      if (live && result.kind === 'never-started' && selectedSpawned && reask < 6) timer = setTimeout(() => { if (live) setReask((n) => n + 1) }, 500)
      // The guard is not defensiveness: an invoke issued for panel A can
      // resolve AFTER the user has selected panel B, and writing it then
      // would show A's changes under B's name — the same wrong-panel
      // attribution, from the other direction.
      if (live) setReview(buildReviewFields(result))
    })
    return () => { live = false; if (timer !== null) clearTimeout(timer) }
  }, [selectedId, selectedIsSessionless, selectedSpawned, idleArrivals, reask, chatTurnEnds])
  /**
   * The Toolbox section's own query, and it copies the review effect above
   * line for line — including the two comments that ARE the design.
   *
   * The cwd is the dep rather than the panel, so this re-fires when the
   * SELECTION moves or the panel's own cwd changes, and not on every frame of
   * a drag: `panels` is a fresh array per setPanelRect, so a `selectedPanel`
   * dep would re-fire the query at 60Hz. A string is equal to itself.
   */
  const selectedToolboxCwd =
    selectedPanel === undefined
      ? null
      : isTerminalPanel(selectedPanel)
        ? selectedPanel.spec.cwd
        : isToolboxPanel(selectedPanel)
          ? selectedPanel.source.cwd
          : null
  const [toolbox, setToolbox] = useState<ToolInventoryResult | undefined>(undefined)
  useEffect(() => {
    // Cleared UNCONDITIONALLY, before the invoke, for the reason the review
    // effect above states: the `live` flag prevents a stale WRITE and nothing
    // prevents the stale RENDER, so selecting panel B would keep showing
    // panel A's inventory under B's heading for a whole round trip.
    setToolbox(undefined)
    if (selectedId === null || selectedToolboxCwd === null) return
    let live = true
    void window.canvas.toolbox
      .read({ panelId: selectedId, cwd: selectedToolboxCwd })
      .then((result) => {
        // Not defensiveness: an invoke issued for panel A can resolve after
        // the user has selected panel B.
        if (live) setToolbox(result)
      })
      .catch(() => {
        if (live) setToolbox({ kind: 'no-cwd' })
      })
    return () => {
      live = false
    }
  }, [selectedId, selectedToolboxCwd])
  const toolboxFields = selectedToolboxCwd === null ? null : buildToolboxFields(toolbox)
  // Its own signature and its own memo, never folded into inspectorSignature:
  // this arrives asynchronously on its own clock, exactly as `review` does.
  const toolboxSig = toolboxSignature(toolboxFields)
  const toolboxModel = useMemo(() => toolboxFields, [toolboxSig])

  const reviewSig = reviewSignature(review)
  // Frozen on reviewSignature for the identical reason inspectorModel is
  // frozen on inspectorSig above: buildReviewFields returns a fresh object on
  // six of its eight arms, and an unfrozen prop here defeats Inspector's memo
  // outright — see Inspector.tsx's own doc comment.
  const reviewModel = useMemo(() => review, [reviewSig])

  // Frozen on its three numbers for the same reason: a fresh object every
  // render defeats Inspector's memo on its own, whatever the model does.
  // M142. This week's usage rows from main's run ledger, folded and priced
  // here by the summary's own rule. Read once on mount, again whenever the
  // PANEL COUNT changes (a close is what appends a row — main records usage
  // before it drops it), and on a slow clock for the week's edge. Not the
  // registry's version: that moves on every tier change of every pan, and a
  // JSONL read over IPC per bump is heat with no symptom (both critics). The
  // read's three fates are three values: unanswered (undefined), rejected
  // (null — the sentence names it), answered (the fold). Never a two-state.
  const [history, setHistory] = useState<UsageHistory | null | undefined>(undefined)
  const panelCount = panels.length
  useEffect(() => {
    let live = true
    const read = (): void => {
      window.canvas.ledger.usage(Date.now() - 7 * 24 * 60 * 60 * 1000).then(
        (rows) => { if (live) setHistory(foldUsageHistory(rows)) },
        () => { if (live) setHistory(null) })
    }
    read()
    const timer = setInterval(read, 60_000)
    return () => { live = false; clearInterval(timer) }
  }, [panelCount])
  const summaryBuilt = buildInspectorSummary(
    panels, (id) => registry.get(id)?.status, waitingIds, getUsage, history)
  // M46: the canvas-wide totals join the signature, so a usage tick moves
  // the summary the way it moves a selected panel's Cost section. M142: the
  // history's word joins it, so the ledger's answer moves it too.
  const summarySig = `${summaryBuilt.panels}/${summaryBuilt.running}/${summaryBuilt.waiting}/${summaryBuilt.tokens}/${summaryBuilt.cost}/${history === undefined ? 'reading' : history === null ? 'failed' : `${history.sessions}/${history.tokens}/${history.costUsd}`}`
  const inspectorSummary = useMemo(() => summaryBuilt, [summarySig])

  // Cheap, and read once per render of the palette: getSelection() is a string
  // copy out of xterm's buffer, not a repaint.
  const hasSelection = (): boolean => {
    const id = palette.capturedId
    return id !== null && (registry.get(id)?.handle.getSelection() ?? '') !== ''
  }

  // review, selectedAgentState and idleArrivals are hook-internal: nothing
  // outside read them even when they lived in Canvas.tsx. reviewModel is the
  // frozen projection the inspector actually renders.
  return { toolboxModel, reviewModel, inspectorSummary, hasSelection, branchLine, repository}
}
