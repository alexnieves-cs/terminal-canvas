import { onChatTurnEnd } from '@renderer/chat/chat-store'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Registry } from '@renderer/session/session-registry'
import { useAgentState } from '@renderer/session/agent-state-store'
import { getUsage } from '@renderer/session/usage-store'
import { useRateLimit } from '@renderer/session/rate-limit-store'
import type { Panel } from '@renderer/panels/panels'
import { inspectionDirectory } from './inspection-directory'
import { useTrailFor } from '@renderer/skills/skill-trail-store'

const NO_USED: readonly string[] = []
import type { PaletteController } from '@renderer/palette/usePalette'
import type { ToolInventoryResult } from '@shared/toolbox'
import {
  buildInspectorSummary, buildReviewFields, buildToolboxFields, foldUsageHistory,
  reviewSignature, toolboxSignature, type ReviewFieldModel, type UsageHistory
} from '../shell/inspector-fields'
import { buildUsageSeries, type UsageSeries } from '../shell/usage-series'

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
  // M256. The skills the SELECTED agent has used, so the Toolbox section can
  // name only the ones that belong to it. Subscribed per id through the trail
  // store's one door; '' names no panel and answers `none`.
  const trail = useTrailFor(selectedId ?? '', selectedPanel?.kind ?? 'terminal')
  const usedSkills = trail.kind === 'entries' ? trail.entries.map((e) => e.name) : NO_USED

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
  const directory = inspectionDirectory(selectedPanel, 'tools')
  const selectedToolboxCwd = directory.kind === 'known' ? directory.cwd : null
  const toolboxSubject = JSON.stringify([selectedId, selectedToolboxCwd])
  const [toolbox, setToolbox] = useState<{ subject: string; result: ToolInventoryResult } | undefined>(undefined)
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
        if (live) setToolbox({ subject: toolboxSubject, result })
      })
      .catch(() => {
        if (live) setToolbox({ subject: toolboxSubject, result: { kind: 'unavailable', reason: 'the toolbox read did not answer' } })
      })
    return () => {
      live = false
    }
  }, [selectedId, selectedToolboxCwd, toolboxSubject])
  // M194. Keyed on the POLICY's arm, never on the panel's kind. Gating this on
  // `isChatPanel` collapsed `unavailable` back into `no-directory` for every
  // other kind, and the inspector then printed "<kind> has no directory, so
  // there is no toolbox to read" over a directory that exists and could not be
  // used — the same false claim about the record that D01's finding 3.1 caught
  // in the starter golden, one kind over. `no-directory` still answers null on
  // purpose: the sentence Inspector already has NAMES the kind, which is more
  // than this reason could.
  const toolboxFields = selectedToolboxCwd === null
    ? directory.kind === 'absent' || directory.kind === 'unavailable'
      ? { hidden: false, summary: directory.reason, rows: [], more: 0, openReason: directory.reason }
      : null
    : buildToolboxFields(toolbox?.subject === toolboxSubject ? toolbox.result : undefined, { used: usedSkills })
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
  // Round 7. The SAME read, bucketed by day as well as folded. The rows carry
  // `endedAt` and this was the one place in the app that had them; folding
  // here and keeping nothing else meant the pane could say "$4.12 across 9
  // sessions" and could never say whether that was one afternoon or a week.
  // Built beside the fold rather than derived from it — a fold is not
  // invertible — and it costs no second IPC call.
  const [usageSeries, setUsageSeries] = useState<UsageSeries | null | undefined>(undefined)
  const panelCount = panels.length
  useEffect(() => {
    let live = true
    const read = (): void => {
      window.canvas.ledger.usage(Date.now() - 7 * 24 * 60 * 60 * 1000).then(
        (rows) => { if (!live) return; setHistory(foldUsageHistory(rows)); setUsageSeries(buildUsageSeries(rows, Date.now())) },
        () => { if (!live) return; setHistory(null); setUsageSeries(null) })
    }
    read()
    const timer = setInterval(read, 60_000)
    return () => { live = false; clearInterval(timer) }
  }, [panelCount])
  const summaryBuilt = buildInspectorSummary(
    panels, (id) => registry.get(id)?.status, waitingIds, getUsage, history, usageSeries)
  const rateLimit = useRateLimit()
  const summaryWithRate = { ...summaryBuilt, rateLimit }
  // M46: the canvas-wide totals join the signature, so a usage tick moves
  // the summary the way it moves a selected panel's Cost section. M142: the
  // history's word joins it, so the ledger's answer moves it too. Rate-limit
  // windows join so the no-selection gauge moves without touching registry.version().
  const summarySig = `${summaryBuilt.panels}/${summaryBuilt.running}/${summaryBuilt.waiting}/${summaryBuilt.tokens}/${summaryBuilt.cost}/${history === undefined ? 'reading' : history === null ? 'failed' : `${history.sessions}/${history.tokens}/${history.costUsd}`}/${usageSeries == null ? String(usageSeries) : usageSeries.buckets.map((b) => `${b.dayStart}:${b.tokens}:${b.costUsd}`).join(',')}/${rateLimit.kind}/${rateLimit.kind === 'none' ? '' : `${rateLimit.windows.five_hour?.utilization ?? ''}/${rateLimit.windows.seven_day?.utilization ?? ''}/${rateLimit.kind === 'limited' ? rateLimit.until : ''}`}`
  const inspectorSummary = useMemo(() => summaryWithRate, [summarySig])

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
