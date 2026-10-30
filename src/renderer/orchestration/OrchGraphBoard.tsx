/* M619. Split out of OrchestrationView.tsx: the 2D graph board and its parts
   (plates, cubes, callouts, packets, platforms, the minimap). Pure rendering
   over props; every read that can carry a secret still passes outward(). */
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { useLiveSession } from '@renderer/session/live-session-store'
import { useChat, lastAssistantText } from '@renderer/chat/chat-store'
import { outward } from '@shared/outward'
import { useLastLine } from '@renderer/session/last-line-store'
import type { PersistedWorkItem } from '@shared/work-items'
import { type WorkItemState } from '@shared/work-items'
import { displayPath } from '@shared/display-path'
import { shellControl } from '@renderer/shell/shell-control'
import { agentWord, TONE_WORKING, type Tone } from '@renderer/panels/panel-state'
import { KindChat, KindFile, KindTerminal, KindWatcher, KindWorkflow, KindWork, Orbit } from '@renderer/icons'
import { isLiveRosterState, orchEdgePackets, orchEdgePaintOrder, type OrchEdgeFire, ORCH_GRAPH_SIZE, type OrchGraphNode, type OrchMetricId, type OrchRosterRow, orchPhase } from './orchestration-model'
import { ORCH_COS_TILT, ORCH_FIT_FLOOR, ORCH_SIN_TILT, ORCH_ZOOM_RANGE, orchDepthBand, orchFitCamera, orchProjectWorld, type OrchCamera, type OrchDepthBand } from './orchestration-depth'
import type { OrchCubeSpec, OrchPlatformSpec } from './OrchestrationCubes'
import { ORCH_PLATE_LABEL, ORCH_PLATE_MORE, ORCH_PLATFORM, ORCH_SELECT_LIFT, orchConnectors, orchHiddenLine, orchHitOrder, orchLabelBudget, orchLabelMargins, orchNameTier, orchObjectVisible, orchPlatformBounds, orchPlatformCountsLine, orchPlatformHitPolygon, orchPolygonBounds, orchSceneObjects, orchSegmentBetween, orchZoomLevel, type OrchNameTier, type OrchObjectKind, type OrchPlatform, type OrchZoomLevel } from './orchestration-platforms'
import { getOrchPrefs, setOrchPrefs } from './orchestration-prefs'
import { ORCH_DEP_GROUPING } from './orchestration-dependency'
import type { OrchCubeTone } from './orchestration-cube-motion'


/** M292. Waiting-station cards drawn at once; past it the beacon, the plate word and the queue carry the fact. */
const ORCH_WAITING_CARDS = 3
/** M294. A platform's label plate: its backing width, height and the gap above the diamond's top tip. */
/** M294. A station-chain connector lights for this long after either end changes state — once, then rests. */
const ORCH_CONNECTOR_LIT_MS = 1400

/**
 * The R3F island is `import()`ed the first time Orchestration paints, never at
 * module scope, and the split is load-bearing rather than tidy. This view is in
 * the app's FIRST chunk, so a static import of OrchestrationCubes puts three.js
 * and @react-three/fiber — measured at +2.2MB — into startup for every session,
 * including the many that never open Orchestration at all. Monaco is kept out of
 * that chunk the same way, by CodeEditor (see file/editor-registry.ts's header);
 * this is the same rule, and it fails the same way: silently, with every suite
 * still green, because nothing here pins the chunk split.
 *
 * `OrchCubeSpec` above is an `import type`, erased at compile time, so naming the
 * module for its type costs nothing at runtime. That is easy to undo by accident
 * — dropping the `type` keyword re-bundles three with no error and no red suite.
 */
const OrchestrationCubes = lazy(async () => ({ default: (await import('./OrchestrationCubes')).OrchestrationCubes }))

/** A board stage change, painted as a brief rim on the moved item's member cubes. */
export interface OrchWash { at: number; stage: WorkItemState; ids: readonly string[] }

export function stateWord(row: Pick<OrchRosterRow, 'state'>): string {
  if (row.state === 'wants-you' || row.state === 'busy' || row.state === 'idle' || row.state === 'starting' || row.state === 'exited') {
    return agentWord(row.state).word
  }
  if (row.state === 'pool') return 'pool live'
  if (row.state === 'watching') return agentWord('busy').word
  if (row.state === 'passed') return agentWord('idle').word
  if (row.state === 'running') return agentWord('busy').word
  // M301. The reconciled word. It is NOT routed through agentWord, because
  // agentWord answers for a session that exists and this one does not — the
  // fallback below used to hand `idle` to exactly this case, which is the
  // lie M301 was written to end.
  if (row.state === 'unknown') return 'no session'
  return agentWord('idle').word
}

export function toneFromState(state: OrchRosterRow['state']): Tone {
  if (state === 'wants-you') return 'needs-you'
  if (state === 'busy' || state === 'watching' || state === 'pool') return TONE_WORKING
  if (state === 'starting') return 'starting'
  // M301. Quiet and finished, never the live-idle family. The word carries it too.
  if (state === 'unknown') return 'exited'
  if (state === 'exited') return 'exited'
  return 'idle'
}

// M279. formatAgo moved to shell/format-ago.ts: the inspector's Activity tab
// reads the same buffer and must age a row the same way.

export function kindGlyphSized(kind: OrchRosterRow['kind'], size: number): JSX.Element {
  if (kind === 'chat') return <KindChat size={size} />
  if (kind === 'terminal') return <KindTerminal size={size} />
  if (kind === 'watcher') return <KindWatcher size={size} />
  if (kind === 'workflow') return <KindWorkflow size={size} />
  if (kind === 'work') return <KindWork size={size} />
  if (kind === 'file') return <KindFile size={size} />
  return <Orbit size={size} />
}
export const kindGlyph = (kind: OrchRosterRow['kind']): JSX.Element => kindGlyphSized(kind, 16)

/** Where a plate's top edge hangs, in cube sizes below the cube's centre — clear of the platform's rim. */
export const PLATE_DROP_K = 1.2
export const PLATE_H = 34
export const PLATE_MAX_CHARS = 20

/**
 * A node's name plate: a kind tile, the name, and under it the state dot with
 * the product's state word and the role. It replaced two bare `<text>` rows,
 * which had no backing — over the grid and the spokes a name was half
 * legible, and two neighbours' names ran into each other. Every fact on it is
 * one the roster already has; nothing here is invented (no progress, no step).
 *
 * Plain SVG, never a foreignObject: this layer sits under a pan/zoom
 * projection, and the file's callouts are the only foreignObjects for the
 * reason orchestration-depth.ts gives. The width is ESTIMATED from the
 * character count (the name is mono, so the estimate is close) — measuring
 * text would be a layout read per node per camera frame.
 */
export function NodePlate({ node, synthetic, overflow, x, y, sub: subOverride, compact, selected = false }: { node: OrchGraphNode; synthetic: boolean; overflow: boolean; x: number; y: number; sub?: string
  /** M294. The compact tier: name and state word in two short lines, cut to this width (the station pitch on screen). */
  compact?: number
  /** #11. The selected station is never cut: it takes the full plate with its whole name, whatever the tier. Truncation is for the periphery. */
  selected?: boolean }): JSX.Element {
  const role = node.hub ? (synthetic ? 'Workspace hub' : 'Orchestrator') : overflow ? 'Other' : node.kind
  // A placeholder has no process, so it has no state to say: the role stands alone.
  //
  // M280: an ordinary satellite's plate says its STATE and nothing else — the
  // card beside it carries the kind, and the two sat eight pixels apart saying
  // the same word twice. The hub and the `+N more` node keep their role, because
  // theirs is not a kind: "Workspace hub", "Orchestrator" and "Other" name a
  // position in the ring that no card repeats and `node.kind` cannot express.
  // M291. A checkpoint's plate says `check · <result>` and an artifact's says
  // `file`: the kind is in the word as well as in the shape.
  const sub = subOverride ?? (synthetic ? role : node.hub || overflow ? `${stateWord(node)} · ${role}` : stateWord(node))
  if (compact !== undefined && !selected) {
    // The compact plate is cut to the pitch: at most `compact - 6` px wide, the
    // name and the word each truncated to what that width holds. No glyph — the
    // shape under it already says the kind — and the state dot stays, so the
    // word is never colour alone and the colour never word alone.
    const w = Math.max(44, Math.min(compact - 6, Math.max(node.title.length * 6.2, sub.length * 5.4) + 14))
    const fit = (text: string, px: number): string => { const cap = Math.max(4, Math.floor((w - 12) / px)); return text.length > cap ? `${text.slice(0, cap - 1).trimEnd()}…` : text }
    return (
      <g className="orch__plate orch__plate--compact" transform={`translate(${x - w / 2}, ${y})`} aria-hidden="true" data-orch-name-tier="compact">
        <title>{node.title}</title>
        <rect className="orch__plate-bg" width={w} height={PLATE_H - 6} rx={5} />
        <text x={6} y={12} className="orch__cube-label">{fit(node.title, 6.2)}</text>
        {!synthetic && <circle className="orch__cube-state" cx={8} cy={21} r={2} />}
        <text x={synthetic ? 6 : 13} y={24} className="orch__cube-role">{fit(sub, 5.4)}</text>
      </g>
    )
  }
  // #11. The name is set at --t-sm (12px mono, ~7.3px a character) and the
  // state line at --t-xs (~5.9px); the estimates follow the type. Selected, the
  // plate grows to the whole name — capped only where a name is a paragraph.
  const name = !selected && node.title.length > PLATE_MAX_CHARS ? `${node.title.slice(0, PLATE_MAX_CHARS - 1).trimEnd()}…` : node.title
  const w = Math.max(92, Math.min(selected ? 420 : 196, Math.max(name.length * 7.3, sub.length * 5.9) + 40))
  return (
    <g className="orch__plate" transform={`translate(${x - w / 2}, ${y})`} aria-hidden="true" data-orch-name-tier="full">
      <title>{node.title}</title>
      <rect className="orch__plate-bg" width={w} height={PLATE_H} rx={7} />
      <rect className="orch__plate-tile" x={6} y={7} width={20} height={20} rx={5} />
      <g className="orch__plate-glyph" transform="translate(10, 11)">{node.hub && !synthetic ? <Orbit size={12} /> : kindGlyphSized(node.kind, 12)}</g>
      <text x={32} y={14.5} className="orch__cube-label">{name}</text>
      {!synthetic && <circle className="orch__cube-state" cx={35} cy={24.5} r={2.5} />}
      <text x={synthetic ? 32 : 42} y={28} className="orch__cube-role">{sub}</text>
    </g>
  )
}

/**
 * The cube's SVG surface: hit-target, beacon and label. The 3D body itself is
 * a real-lit mesh painted by `<OrchestrationCubes>` (a WebGL canvas sandwiched
 * between this layer's ground/edges and its callouts in `.orch__graph-wrap`)
 * — this element keeps the same classes/data attributes the old CSS-3D body
 * carried (`orch__cube`, `data-tone`, `data-attention`, `data-depth`, …) so
 * click/dblclick, keyboard nav, `verify-orchestration.cjs` and `shot.cjs`'s
 * selectors are all unchanged. `attention` is computed once for both this
 * element and its mesh by `useAttentionAck` in `GraphBoard`, not locally —
 * two independent acknowledgment clocks would drift.
 */
export function IsoCube(props: {
  node: OrchGraphNode
  labelOffset: { x: number; y: number }
  band: OrchDepthBand
  selected: boolean
  attention: boolean
  /** The board stage this cube's task just entered, while the wash is live. */
  wash?: OrchWash
  /** M291. Station, checkpoint or artifact — the word on the plate and the DOM hook; absent for the legacy ring. */
  objectKind?: OrchObjectKind
  /** M292/M294. The name plate's density tier (orchNameTier): `none` draws no plate (the title stays on hover and in the List); absent = the legacy ring's full plate. */
  nameTier?: OrchNameTier
  /** M294. The station pitch on screen, the compact plate's width bound. */
  pitchPx?: number
  onSelect: (id: string) => void
  onJump: (id: string) => void
  onOverflow: () => void
}): JSX.Element {
  const { node, selected, attention, onSelect, onJump, onOverflow } = props
  const objectKind = props.objectKind
  const overflow = node.overflow !== undefined
  // The overflow node is not a panel: nothing to select or jump to, its verb is the roster.
  const synthetic = node.synthetic === true || node.id === '__hub__' || overflow
  const live = isLiveRosterState(node.state)
  const needs = node.state === 'wants-you'
  // State skins (M275, now carried by the mesh's material/motion, not CSS):
  // `tone` is still the DOM hook other suites and the callout card read.
  const tone = toneFromState(node.state)
  const skin = `${node.hub ? ' orch__cube--hub' : ''}${overflow ? ' orch__cube--overflow' : synthetic ? ' orch__cube--synthetic' : ''}${selected ? ' orch__cube--on' : ''}${live ? ' orch__cube--live' : ''}${needs ? ' orch__cube--needs' : ''}${tone === TONE_WORKING ? ' orch__cube--busy' : ''}${tone === 'starting' ? ' orch__cube--starting' : ''}${tone === 'exited' ? ' orch__cube--exited' : ''}${tone === 'idle' && !synthetic ? ' orch__cube--idle' : ''}`
  return (
    <g
      className={`orch__cube${skin}`}
      // The panel this cube stands for. The shot harness needs to address one
      // cube by panel to drive it into a state (an all-idle fixture cannot show
      // a lit ring), and every other DOM hook on this element — data-lit,
      // data-depth, data-expanded — is already spelled this way.
      data-node={node.id}
      data-orch-object={objectKind}
      // The cube's ROLE. The harness seeds by kind so a lit ring contains more
      // than one role — a scene in which every working cube is a terminal cannot
      // show that brightness preserves hue, whatever the shader does.
      data-kind={node.kind}
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: synthetic && !overflow ? 'default' : 'pointer' }}
      data-tone={tone}
      data-role={node.hub ? 'orchestrator' : node.kind}
      data-attention={attention || undefined}
      data-depth={props.band}
      data-orch-overflow={overflow ? node.overflow!.length : undefined}
      onClick={() => { if (overflow) onOverflow(); else if (!synthetic) onSelect(node.id) }}
      onDoubleClick={() => { if (!synthetic) onJump(node.id) }}
    >
      {/* Keyed on the shift's time so a second move restarts the rim instead of
          silently continuing the first one's animation. */}
      {props.wash !== undefined && (
        <ellipse key={props.wash.at} className="orch__cube-wash" data-stage={props.wash.stage} data-orch-wash={props.wash.stage}
          cy={node.size * 0.65} rx={node.size * 0.98} ry={node.size * 0.3} aria-hidden="true" />
      )}
      {/* Transparent hit-target standing in for the old foreignObject body — same
          footprint, so pointer capture, hover and the label's baseline don't move. */}
      <rect x={-node.size} y={-node.size} width={node.size * 2} height={node.size * 2} className="orch__cube-hit" fill="transparent" />
      {/* Needs-you beacon: a small amber point above the cube. It stops the moment the
          cube is selected — the person has looked, so the graph stops calling. */}
      {attention ? <circle className="orch__cube-beacon" cy={-node.size * 1.02} r={3} aria-hidden="true" /> : null}
      {((props.nameTier ?? 'full') !== 'none' || selected) && <NodePlate node={node} synthetic={synthetic} overflow={overflow} x={props.labelOffset.x} y={node.size * PLATE_DROP_K + props.labelOffset.y}
        selected={selected}
        {...(props.nameTier === 'compact' ? { compact: props.pitchPx ?? 80 } : {})}
        {...(objectKind === 'checkpoint' ? { sub: `check · ${stateWord(node)}` } : objectKind === 'artifact' ? { sub: 'file' } : {})} />}
    </g>
  )
}

/**
 * Attention acknowledgment for every cube, computed once here (not per-cube
 * inside IsoCube) so the SVG hit-target's beacon and the mesh's finite pulse
 * read the exact same clock. Mutating the ref during render is deliberate:
 * with at most nine cubes this is cheap bookkeeping, not a render side effect
 * anyone observes, and it avoids nine independent effects for a dynamic list.
 */
export function useAttentionAck(): (node: OrchGraphNode, selected: boolean) => boolean {
  const ack = useRef(new Map<string, boolean>())
  return (node, selected) => {
    const needs = node.state === 'wants-you'
    if (!needs) ack.current.set(node.id, false)
    else if (selected) ack.current.set(node.id, true)
    return needs && !selected && !(ack.current.get(node.id) ?? false)
  }
}

/** The last non-blank line of a chat reply or terminal tail, scrubbed for the HUD. */
export function outwardTail(panelId: string, isChat: boolean, terminalLine: string): string {
  const raw = isChat ? lastAssistantText(panelId) : terminalLine
  if (raw.trim() === '') return ''
  const lines = outward(raw, `panel ${panelId}`).text.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  return lines[lines.length - 1] ?? ''
}

/**
 * A callout card's box. ONE definition because two readers must agree on it:
 * the card's own <foreignObject>, and the collision placer that decides where
 * the card may sit. They were the same two literals written out twice, so the
 * kind line (M280) grew the card in one of them and the ring silently began
 * overlapping cards on the crowded side — a layout bug, not a type error.
 * Collapsed holds a tile beside three lines: name, kind, one state word.
 */
export const CALLOUT_H = { rest: 94, expanded: 172 } as const
export const calloutHeight = (expanded: boolean): number => (expanded ? CALLOUT_H.expanded : CALLOUT_H.rest)

/** How far below the cube centre a flipped card's anchor sits — under the name plate, whose own geometry decides it. */
export const calloutBelow = (size: number): number => size * PLATE_DROP_K + PLATE_H + 2

/** Read only the selected conversation; never expose thinking contents in the HUD. */
export function SelectedChatPhase({ panelId }: { panelId: string }): JSX.Element | null {
  const chat = useChat(panelId)
  const liveBlocks = chat.live?.blocks ?? []
  const turns = chat.turns.filter((turn) => turn.role === 'assistant')
  const blocks = chat.live ? liveBlocks.map((entry) => entry.block) : turns[turns.length - 1]?.blocks ?? []
  const liveText = liveBlocks[liveBlocks.length - 1]?.text ?? ''
  const tail = chat.live
    ? outward(liveText, `panel ${panelId}`).text.split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? ''
    : outwardTail(panelId, true, '')
  // A tool name is the agent's text too, so the label crosses the gate like the tail.
  const found = orchPhase(blocks, Boolean(chat.live))
  const phase = found.kind === 'idle' ? tail : outward(found.label, `panel ${panelId}`).text
  return phase ? <span className="orch__phase" data-phase={found.kind} title={phase}>{phase}</span> : null
}

/**
 * M305. The roster's state groups, in scan order. Pure over the rows; the group
 * ids are the product's own state words, and `metric` names the lens a group's
 * header applies (null: no lens for that group).
 */
export type OrchRosterGroupId = typeof TONE_WORKING | 'needs-you' | 'idle' | 'ended'
export function orchRosterGroups<R extends { state: string }>(rows: readonly R[]): { id: OrchRosterGroupId; label: string; metric: OrchMetricId | null; rows: R[] }[] {
  const of = (st: string): OrchRosterGroupId =>
    st === 'wants-you' ? 'needs-you'
      : st === 'busy' || st === 'starting' || st === 'running' || st === 'watching' || st === 'pool' ? TONE_WORKING
        : st === 'exited' || st === 'unknown' ? 'ended' : 'idle'
  const groups = [
    { id: TONE_WORKING, label: 'Working', metric: 'agents' as OrchMetricId | null, rows: [] as R[] },
    { id: 'needs-you' as const, label: 'Needs you', metric: 'waiting' as OrchMetricId | null, rows: [] as R[] },
    { id: 'idle' as const, label: 'Idle', metric: null, rows: [] as R[] },
    { id: 'ended' as const, label: 'Ended', metric: null, rows: [] as R[] }
  ]
  for (const r of rows) groups.find((g) => g.id === of(r.state))!.rows.push(r)
  return groups.filter((g) => g.rows.length > 0)
}

/** Cards share the projected cube anchor but never inherit its face rotation. */
export function CubeCallout({ node, offsetX, offsetY = 0, below, drift, band, expanded, task, onSelect, onJump, onInterrupt }: {
  node: OrchGraphNode; offsetX: number; expanded: boolean; task?: string
  /** M291. How far the placed row sits from the default row on its side (negative = higher); the stem stretches to it. */
  offsetY?: number
  /** The card hangs under the cube, stem pointing up — set when there is no room above. */
  below: boolean
  /** Callouts pan fastest: the card slides past its cube by this, the stem stretches to follow. */
  drift: { x: number; y: number }; band: OrchDepthBand
  onSelect: (id: string) => void; onJump: (id: string) => void; onInterrupt?: (id: string) => void
}): JSX.Element {
  // The card is the cube's other face: click selects, double-click jumps. Its own
  // buttons keep their verbs — a Jump press must not also toggle the selection.
  const onCard = (event: { target: EventTarget }, run: () => void): void => {
    if (event.target instanceof Element && event.target.closest('button') !== null) return
    run()
  }
  const chat = useChat(node.id)
  const live = useLiveSession(node.id)
  const blocks = [...chat.turns.flatMap((t) => t.blocks), ...(chat.live?.blocks.map((b) => b.block) ?? [])]
  const tool = blocks.reverse().find((b) => b.type === 'tool_use')
  // A LIVE chat's work line is its phase (Thinking… / Using · tool); a terminal has
  // no thinking channel, so it keeps its command. Same row — CALLOUT_H does not move.
  const livePhase = chat.live ? orchPhase(chat.live.blocks.map((b) => b.block), true) : null
  const work = live?.currentCommand || (livePhase && livePhase.kind !== 'idle' ? outward(livePhase.label, `panel ${node.id}`).text : undefined)
    || (tool?.type === 'tool_use' ? tool.name : undefined) || task
  const cwd = live?.cwd || chat.snapshot?.cwd
  const cost = chat.snapshot?.costUsd ?? chat.meta?.costUsd
  const lastLine = useLastLine(node.id)
  // The tail is what the agent last SAID, so it crosses outward() like every other
  // HUD reader (orch.gate.2). Only an expanded card pays for the scrub — at most
  // the hovered and the selected card — and a blank tail is omitted, never "—".
  const tail = expanded ? outwardTail(node.id, chat.turns.length > 0 || chat.live !== undefined && chat.live !== null, lastLine.line) : ''
  const needs = node.state === 'wants-you'
  const ask = (chat.snapshot?.pending.length ?? 0) > 0 ? 'Waiting on approval' : needs ? 'Needs input' : undefined
  const height = calloutHeight(expanded)
  const width = needs ? 218 : 184
  // Far cards shrink a little (never grow, so the collision pass stays honest).
  const s = band === 'far' ? 0.92 : band === 'mid' ? 0.96 : 1
  // The stem runs 22px from the anchor toward the card on whichever side it hangs.
  const sy = below ? 22 : -22
  const anchorY = below ? node.y + calloutBelow(node.size) : node.y - node.size
  return <g className="orch__callout" data-depth={band} transform={`translate(${node.x}, ${anchorY})`}>
    <path className="orch__callout-stem" d={`M 0 0 L ${offsetX + drift.x} ${sy + drift.y + offsetY}`} />
    <g transform={`translate(${offsetX + drift.x}, ${sy + drift.y + offsetY}) scale(${s}) translate(${-offsetX}, ${-sy})`}>
    <foreignObject x={offsetX - width / 2} y={below ? 22 : -height - 22} width={width} height={height + 22}>
      <div className="orch__callout-slot" data-below={below || undefined}><div className="orch__callout-card" data-needs={needs || undefined} data-expanded={expanded || undefined}
        onClick={(e) => onCard(e, () => onSelect(node.id))} onDoubleClick={(e) => onCard(e, () => onJump(node.id))}>
        {ask && <strong className="orch__callout-ask">{ask}</strong>}
        <div className="orch__callout-head">
          {/* The kind's glyph in a role-tinted tile, as the plate under the cube
              wears it — the card and the plate name the same panel, so they
              should not disagree about what it looks like. */}
          <span className="orch__callout-tile" aria-hidden="true">{kindGlyphSized(node.kind, 13)}</span>
          <div className="orch__callout-names">
            <strong title={node.title}>{node.title}</strong>
            {/* Name, kind, one state — the rest layer's three facts, on three
                lines instead of crushed onto one. `kind` is a real field; the
                reference's role blurbs ("Web & Docs") have no source here and
                are not invented to fill the line. */}
            <span className="orch__callout-kind">{node.kind}</span>
          </div>
        </div>
        {!ask && <span>{stateWord(node)}</span>}
        {work && <span className="orch__callout-work" title={work}>{work}</span>}
        <div className="orch__callout-detail">
          {tail && <span className="orch__callout-tail" title={tail}>{tail}</span>}
          {cwd && <code title={cwd}>{displayPath(cwd).short}</code>}
          {cost !== undefined && <span>${cost.toFixed(2)}</span>}
          <div className="orch__callout-actions">
            <button type="button" className="orch__mini" {...shellControl(() => onJump(node.id))}>Jump</button>
            {onInterrupt && <button type="button" className="orch__mini" {...shellControl(() => onInterrupt(node.id))}>Interrupt</button>}
          </div>
        </div>
      </div></div>
    </foreignObject>
    </g>
  </g>
}

export const packetFade = (t: number): number => Math.min(1, t / 0.08, (1 - t) / 0.12)

/**
 * The packets and payload chips on firing HUD edges. Its own component so the
 * per-frame clock re-renders a few circles, never the cubes and their callouts
 * (the canvas LinkLayer makes the same split for the same reason). The rAF runs
 * only while a packet is live; under reduced motion there is no travel — the
 * chip holds at the midpoint for the window, so the fact survives the motion.
 */
export function EdgePackets({ edges, points, fires }: {
  edges: readonly { from: string; to: string; authored?: boolean; trigger?: string }[]
  points: ReadonlyMap<string, { x: number; y: number }>
  fires: ReadonlyMap<string, OrchEdgeFire>
}): JSX.Element | null {
  const [, setFrame] = useState(0)
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Date.now() at render, not a stored clock: a fire that arrives while idle
  // must be measured against now, or it reads as future and never starts.
  const packets = orchEdgePackets(edges, fires, Date.now())
  const live = packets.length > 0
  useEffect(() => {
    if (!live || reduced) return
    let raf = requestAnimationFrame(function step() { setFrame((n) => n + 1); raf = requestAnimationFrame(step) })
    return () => cancelAnimationFrame(raf)
  }, [live, reduced])
  if (!live) return null
  return (
    <g className="orch__packets" aria-hidden="true">
      {packets.map((p) => {
        const a = points.get(p.from)
        const b = points.get(p.to)
        if (!a || !b) return null
        const at = (t: number): { x: number; y: number } => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
        const t = reduced ? 0.5 : p.t
        const head = at(t)
        const fade = reduced ? 1 : packetFade(p.t)
        return (
          <g key={p.key} data-orch-packet={p.key} data-authored={p.authored || undefined}>
            {!reduced && [0.14, 0.07].map((lag, i) => {
              const tail = at(Math.max(0, t - lag))
              return <circle key={lag} className="orch__packet-trail" cx={tail.x} cy={tail.y} r={p.authored ? 2 + i : 1.5 + i * 0.5} opacity={fade * (0.3 + i * 0.25)} />
            })}
            {!reduced && <circle className="orch__packet-halo" cx={head.x} cy={head.y} r={p.authored ? 7 : 5} opacity={fade * 0.5} />}
            {!reduced && <circle className="orch__packet" cx={head.x} cy={head.y} r={p.authored ? 3.5 : 2.5} opacity={fade} />}
            {p.trigger !== undefined && (
              <g className="orch__chip" transform={`translate(${head.x}, ${head.y - 16})`} opacity={fade} data-orch-chip={p.trigger}>
                <rect x={-(p.trigger.length * 5.4 + 14) / 2} y={-9} width={p.trigger.length * 5.4 + 14} height={18} rx={9} />
                <text y={3.5} textAnchor="middle">{p.trigger}</text>
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

/**
 * M291. The platform label plate: the island's goal, its placement line and
 * its counts, top-left of the plate, screen-aligned (plain SVG text, never
 * rotated with the stage). It is the island CARD Phase C floated over the ring,
 * moved onto the platform it names; a click focuses the island, a double-click
 * fits the camera to it. The `data-orch-island-id` hook is the same one the
 * List's column carries, so a check may address the island either way.
 */
export function PlatformPlate({ p, cx, y, w, level, focused, selected, onFocus, onFit, onWorld }: {
  /** M294. The plate is CENTRED on the diamond's top tip (`cx`), its bottom edge `y + h` a gap above the tip. */
  p: OrchPlatform; cx: number; y: number; w: number; level: OrchZoomLevel; focused: boolean; selected: boolean
  onFocus: (id: string) => void; onFit: (id: string) => void
  /** M432. Present only for a FOCUSED island with members: the "View in World" chip. */
  onWorld?: (id: string) => void
}): JSX.Element {
  const waiting = p.counts.needsYou > 0
  const ambiguous = p.island !== undefined && p.island.placement.kind === 'shared' && (p.island.writers > 1 || p.island.sharedWith.length > 0)
  const label = p.label.length > 30 ? `${p.label.slice(0, 29).trimEnd()}…` : p.label
  const counts = orchPlatformCountsLine(p)
  const hidden = orchHiddenLine(p)
  // Three lines, the plan's label: the goal; the repository and where its files
  // live (branch · own worktree, or a shared directory, said); then the state
  // WORD with the counts — so the plate says what the platform's colour and
  // glow only echo. The place line is the same text the List's column carries.
  // A session island's state IS `no task yet`; saying it twice was the critic's note.
  const stateLine = p.synthetic ? 'grouping only' : p.island?.source === 'work-item' ? `Task · ${p.state}` : 'Session · no task yet'
  const thirdLine = `${stateLine} · ${counts}`
  const placeLine = p.sub
  // The backing is at most the plate's width plus a little; each line is cut
  // to what fits it (SVG text does not clip), the full text on the title.
  // M298: never wider than ORCH_PLATE_LABEL.w — that is the width the fit reserves sideways.
  const plateW = Math.max(150, Math.min(ORCH_PLATE_LABEL.w, Math.max(w + 12, 150), Math.max(label.length * 6.6, placeLine.length * 5.4, thirdLine.length * 5.4) + 24))
  // M298: the `+N more` chip stands on the plate's far side from the tip (above an upper-row
  // label, below a lower-row one) inside the plate's width — beside it, it ran past the fit's
  // reserved width into the rail (measured on the 61- and 100-session fixtures).
  const moreY = p.labelSide === 'above' ? -(ORCH_PLATE_MORE.h + ORCH_PLATE_MORE.gap) : ORCH_PLATE_LABEL.h + ORCH_PLATE_MORE.gap
  // M432. The "View in World" chip stands on the same far side, one chip further out when the
  // `+N more` chip is there too — side by side they overran a narrow plate.
  const worldY = hidden === null ? moreY : moreY + (p.labelSide === 'above' ? -1 : 1) * (ORCH_PLATE_MORE.h + ORCH_PLATE_MORE.gap)
  const fitLine = (text: string, px: number): string => { const cap = Math.max(8, Math.floor((plateW - 16) / px)); return text.length > cap ? `${text.slice(0, cap - 1).trimEnd()}…` : text }
  const placeShown = fitLine(placeLine, 5.4)
  const thirdShown = fitLine(thirdLine, 5.4)
  const x = cx - plateW / 2
  return (
    <g className={`orch__pplate${focused ? ' orch__pplate--on' : ''}`} transform={`translate(${x}, ${y})`}
      data-orch-platform-plate={p.id} data-orch-island-id={p.island?.id} data-orch-island={p.island?.itemId ?? p.island?.subjectId ?? undefined}
      data-orch-island-source={p.island?.source} data-orch-island-ambiguous={ambiguous || undefined} data-orch-zoom={level}
      tabIndex={0} role="button" aria-pressed={selected} aria-label={`${p.label} — ${placeLine}; ${thirdLine}`}
      onClick={(e) => { e.stopPropagation(); onFocus(p.id) }} onDoubleClick={(e) => { e.stopPropagation(); onFit(p.id) }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') { e.preventDefault(); onFocus(p.id) } }}>
      <title>{`${p.label} — ${placeLine}. ${thirdLine}. Click to select the island; double-click to fit the camera to it.`}</title>
      <rect className="orch__pplate-bg" width={plateW} height={44} rx={6} />
      {waiting && <circle className="orch__cube-beacon orch__pplate-beacon" cx={plateW - 10} cy={10} r={3} aria-hidden="true" />}
      <text x={8} y={13} className="orch__pplate-title" data-orch-island-goal>{label}</text>
      <text x={8} y={25} className="orch__pplate-sub orch__pplate-place" data-orch-island-place={p.island === undefined ? undefined : ''}><title>{placeLine}</title>{placeShown}</text>
      <text x={8} y={37} className="orch__pplate-sub" data-orch-platform-state={p.state} data-orch-platform-counts><title>{thirdLine}</title>{thirdShown}</text>
      {p.synthetic && <text x={8} y={25} className="orch__pplate-sub" data-orch-grouping style={{ display: 'none' }}>{ORCH_DEP_GROUPING}</text>}
      {hidden !== null && (
        <g className="orch__pplate-more" transform={`translate(0, ${moreY})`} data-orch-platform-more={p.hidden.ids.length} role="button" tabIndex={0}
          aria-label={`${hidden} — focus the island to see them all`} onClick={(e) => { e.stopPropagation(); onFit(p.id) }}
          onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') { e.preventDefault(); onFit(p.id) } }}>
          <title>{`${hidden}. Focus the island to see every station.`}</title>
          <rect className="orch__pplate-bg" width={hidden.length * 5.6 + 16} height={18} rx={9} />
          <text x={8} y={12.5} className="orch__pplate-sub">{hidden}</text>
        </g>
      )}
      {onWorld !== undefined && (
        <g className="orch__pplate-more orch__pplate-world" transform={`translate(0, ${worldY})`} data-orch-platform-world={p.id} role="button" tabIndex={0}
          aria-label="View in World — this island's agents in the 3D room"
          onClick={(e) => { e.stopPropagation(); onWorld(p.id) }}
          onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') { e.preventDefault(); onWorld(p.id) } }}>
          <title>This island's agents in the World view.</title>
          <rect className="orch__pplate-bg" width={ORCH_WORLD_CHIP.length * 5.6 + 16} height={ORCH_PLATE_MORE.h} rx={9} />
          <text x={8} y={12.5} className="orch__pplate-sub">{ORCH_WORLD_CHIP}</text>
        </g>
      )}
    </g>
  )
}

/** M432. The plate's way to the 3D room. */
export const ORCH_WORLD_CHIP = 'View in World'


/**
 * M292. The minimap: every platform as a rectangle in model space, the camera's
 * viewport over them; a click moves the camera there. Screen-aligned HTML/SVG in
 * the scene's corner, outside the projection.
 */
export function Minimap({ platforms, cam, stage, onCentre }: { platforms: readonly OrchPlatform[]; cam: OrchCamera; stage: { w: number; h: number }; onCentre: (pt: { x: number; y: number }) => void }): JSX.Element {
  const bounds = orchPlatformBounds(platforms)
  const W = 112
  const H = 60
  const s = Math.min(W / Math.max(1, bounds.w + 40), H / Math.max(1, bounds.h + 40))
  const ox = (W - bounds.w * s) / 2 - bounds.x * s
  const oy = (H - bounds.h * s) / 2 - bounds.y * s
  // The viewport in model space: invert orchProjectWorld at the stage's corners.
  const inv = (sx: number, sy: number): { x: number; y: number } => ({
    x: (sx - stage.w / 2 - cam.x) / cam.k + stage.w / 2,
    y: ((sy - stage.h / 2 - cam.y) / cam.k) / ORCH_COS_TILT + stage.h / 2
  })
  const tl = inv(0, 0)
  const br = inv(stage.w, stage.h)
  return (
    <svg className="orch__minimap" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minimap of every platform and the camera" data-orch-minimap
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onCentre({ x: ((e.clientX - r.left) - ox) / s, y: ((e.clientY - r.top) - oy) / s }) }}>
      {/* M294. Each plate is its diamond (pre-tilt, so the minimap is a plan view). */}
      {platforms.map((p) => { const mx = ox + p.x * s; const my = oy + p.y * s; const r = Math.max(2, p.half * s); return <polygon key={p.id} className={`orch__minimap-plate${p.synthetic ? ' orch__minimap-plate--group' : ''}`} data-orch-minimap-plate={p.id} data-lit={p.counts.live > 0 || undefined} data-needs={p.counts.needsYou > 0 || undefined}
        points={`${mx},${my - r} ${mx + r},${my} ${mx},${my + r} ${mx - r},${my}`} /> })}
      <rect className="orch__minimap-view" x={ox + tl.x * s} y={oy + tl.y * s} width={Math.max(4, (br.x - tl.x) * s)} height={Math.max(3, (br.y - tl.y) * s)} rx={1} />
    </svg>
  )
}

export function GraphBoard(props: {
  platforms: readonly OrchPlatform[]
  edges: readonly { from: string; to: string; authored?: boolean; trigger?: string }[]
  fires: ReadonlyMap<string, OrchEdgeFire>
  selectedId: string | null
  selectedIds: readonly string[]
  panels: readonly Panel[]
  workItems: readonly PersistedWorkItem[]
  memberIds: readonly string[] | null
  /** Objects a metric / roster lens leaves lit; everything else dims in place. `null` = no lens. */
  litIds: ReadonlySet<string> | null
  wash: OrchWash | null
  onInterrupt?: (id: string) => void
  /** M290. Whether this panel's runtime has an interrupt door right now (the view's capability read). */
  canInterrupt: (id: string) => boolean
  /** M289. The dependency lens is on: trigger words on the authored edges, membership spokes drawn and marked as grouping. */
  depFocus: boolean
  firingKeys: ReadonlySet<string>
  /** M291. The focused island's platform (expands past the cap; the breadcrumb's middle). */
  focusedPlatformId: string | null
  onFocusPlatform: (id: string | null) => void
  /** M432. The focused plate's "View in World" chip; absent, none is drawn. */
  onViewInWorld?: (platformId: string) => void
  /** M292. Quality tier from the view's frame-time read. */
  quality: 'full' | 'lean' | 'flat'
  /** M293. WebGL could not be had: paint flat SVG bodies instead of mounting the island. */
  webgl: 'ready' | 'unavailable'
  onWebglLost: () => void
  onCamera: (camera: { x: number; y: number; k: number }) => void
  onSelect: (id: string) => void
  onJump: (id: string) => void
  describedBy?: string
}): JSX.Element {
  const { platforms, edges, selectedId, selectedIds, firingKeys, litIds, wash, onSelect, onJump, focusedPlatformId, onFocusPlatform } = props
  const lensedOut = (id: string): boolean => litIds !== null && !litIds.has(id)
  const hasSelection = selectedId !== null || selectedIds.length > 0
  const isSelected = (id: string): boolean => selectedId === id || selectedIds.includes(id)
  const attentionOf = useAttentionAck()
  const [hovered, setHovered] = useState<string | null>(null)
  // M283. The camera starts where the user left it, not at the origin (orchestration-prefs.ts).
  const [cam, setCam] = useState(() => getOrchPrefs().camera)
  useEffect(() => { setOrchPrefs({ camera: cam }); props.onCamera(cam) }, [cam, props.onCamera])
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  // M298. The stage FOLLOWS the panel's aspect ratio: its width stays the
  // model's 860 (so x is the same unit everywhere) and its height is what the
  // panel's shape makes it. The fixed 860×420 stage letterboxed inside the
  // real panel (xMidYMid meet) — measured 536×224 at the app's default
  // window, 812×224 narrow, 1128×649 wide: none of them 2.05:1 — so the fit
  // filled a band of the panel, not the panel; two platforms in the narrow
  // window spanned 31% of its width. Read off the scene's own box, so the SVG
  // viewBox, the island's viewBox and the hit-targets keep one projection.
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const [stageH, setStageH] = useState<number>(ORCH_GRAPH_SIZE.h)
  useEffect(() => {
    const el = sceneRef.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const read = (): void => {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      // Whole units, and never a sliver: a zero-height stage would divide by it.
      setStageH(Math.max(120, Math.round((ORCH_GRAPH_SIZE.w * r.height) / r.width)))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const stage = useMemo(() => ({ w: ORCH_GRAPH_SIZE.w, h: stageH }), [stageH])
  // M292. Camera Back: every DELIBERATE move (Fit all, Fit selected, a minimap
  // click, a focus) pushes the camera it left; a pan or a wheel does not, or
  // Back would step through every pixel of a drag.
  const history = useRef<OrchCamera[]>([])
  const [historyDepth, setHistoryDepth] = useState(0)
  const moveCamera = (next: OrchCamera): void => {
    autoFitted.current = false
    history.current = [...history.current.slice(-19), cam]
    setHistoryDepth(history.current.length)
    setCam(next)
  }
  // M298. Fit all keeps the label plates' pixels clear (orchLabelMargins) and
  // may go under the wheel's zoom floor (ORCH_FIT_FLOOR): everything, always.
  const fitAllCamera = (): OrchCamera => orchFitCamera(orchPlatformBounds(platforms), stage, 24, orchLabelMargins(platforms), ORCH_FIT_FLOOR)
  const fitAll = (): void => moveCamera(fitAllCamera())
  const fitPlatform = (id: string): void => {
    const p = platforms.find((x) => x.id === id)
    if (p === undefined) return
    moveCamera(orchFitCamera(orchPlatformBounds([p]), stage, 28, orchLabelMargins([p])))
  }
  const back = (): void => {
    const prev = history.current[history.current.length - 1]
    if (prev === undefined) return
    history.current = history.current.slice(0, -1)
    setHistoryDepth(history.current.length)
    setCam(prev)
  }
  // The camera flies on TWO occasions only: the first paint of a scene whose
  // camera is still the origin (the fleet must be in frame — M298: a lone
  // platform too, which the zig-zag seats lower-LEFT of the stage, measured
  // 43% of the panel's height and clipped at k = 1), and a change in how many
  // platforms there are (a new island landed off-screen). Never on an event.
  const countRef = useRef<number | null>(null)
  useEffect(() => {
    const n = platforms.length
    if (countRef.current === n) return
    const first = countRef.current === null
    countRef.current = n
    if (first && (cam.x !== 0 || cam.y !== 0 || cam.k !== 1)) return
    // Even then, only when something is now OFF the stage: a new island that
    // landed in view moves nothing, so the ones a person is looking at stay put.
    const b = orchPlatformBounds(platforms)
    const tl = orchProjectWorld({ x: b.x, y: b.y }, stage, cam)
    const br = orchProjectWorld({ x: b.x + b.w, y: b.y + b.h }, stage, cam)
    if (!first && tl.x >= 0 && tl.y >= 0 && br.x <= stage.w && br.y <= stage.h) return
    autoFitted.current = true
    setCam(fitAllCamera())
  }, [platforms.length])
  // M298. The first paint fits against the DEFAULT stage (the panel's box is
  // read a render later); when the measured stage arrives, a camera the
  // auto-fit set is fitted again. A camera a person has moved since is not.
  const autoFitted = useRef(false)
  useEffect(() => {
    if (!autoFitted.current) return
    setCam(fitAllCamera())
  }, [stageH])

  // ---- Projection: platforms, then every object on them, through one camera.
  const focusedIsOn = (id: string): boolean => focusedPlatformId === id
  // M294. The diamond ON SCREEN: half-width `half · k`, half-height that times
  // cos(tilt), the thickness band under it; the six-point outline is the
  // hit-target AND the mesh's silhouette (orchPlatformHitPolygon's header).
  // The focused plate is LIFTED by ORCH_SELECT_LIFT px — its outline, its
  // label and every object on it move together, so the target keeps following
  // the mesh (the mesh damps to the same number). The deck's rise (the stacked
  // tiers' height on screen) lifts a layer-1 object so it stands on the deck.
  const band = ORCH_PLATFORM.thickness * cam.k * ORCH_SIN_TILT
  const deckRise = ORCH_PLATFORM.stack * cam.k * ORCH_SIN_TILT
  const projPlatforms = platforms.map((p) => {
    const focused = focusedIsOn(p.id)
    const lift = focused ? ORCH_SELECT_LIFT : 0
    const c = orchProjectWorld({ x: p.x, y: p.y }, stage, cam)
    const y = c.y - lift
    const hx = p.half * cam.k
    const hy = hx * ORCH_COS_TILT
    const w = hx * 2
    const h = p.h * cam.k
    const points = orchPlatformHitPolygon({ x: c.x, y }, hx, hy, band)
    const hit = orchPolygonBounds(points)
    const level = orchZoomLevel(w, focused || p.expanded)
    // The label plate: centred on the tip its side names (p.labelSide), a gap clear of it.
    const labelY = p.labelSide === 'above' ? y - hy - ORCH_PLATE_LABEL.gap - ORCH_PLATE_LABEL.h : y + hy + band + ORCH_PLATE_LABEL.gap
    const label = { x: c.x - ORCH_PLATE_LABEL.w / 2, y: labelY, w: ORCH_PLATE_LABEL.w, h: ORCH_PLATE_LABEL.h }
    return { p, x: c.x, y, w, h, hx, hy, lift, depth: c.depth, level, points, hit, label, pitchPx: p.pitch * cam.k }
  })
  const levelOf = new Map(projPlatforms.map((pp) => [pp.p.id, pp.level]))
  const platformOf = (id: string): typeof projPlatforms[number] | undefined => projPlatforms.find((pp) => pp.p.id === id)
  const objects = orchSceneObjects(platforms)
  const projected = objects
    .filter((o) => orchObjectVisible(o, levelOf.get(o.platformId) ?? 'evidence'))
    .map((o) => {
      const c = orchProjectWorld({ x: o.x, y: o.y }, stage, cam)
      const size = o.size * cam.k
      const pp = platformOf(o.platformId)
      const y = c.y - (pp?.lift ?? 0) - (o.layer === 1 ? deckRise : 0)
      // A node-shaped record so the callout placer and IsoCube read it unchanged.
      const node: OrchGraphNode = { id: o.id, title: o.title, kind: o.panelKind === 'file' ? 'file' : o.panelKind, hub: false, x: c.x, y, state: o.state, size }
      return { ...node, object: o, lift: pp?.lift ?? 0, depth: c.depth + o.layer * 0.02, band: orchDepthBand(Math.max(-1, Math.min(1, c.depth))), drift: { x: 0, y: 0 } }
    })
  const budgeted = orchLabelBudget(projected, { selected: new Set(selectedIds.concat(selectedId === null ? [] : [selectedId])), hovered })
  // M294. A name at rest, by DENSITY (orchNameTier): the full plate where the
  // plate's station pitch on screen clears it, a compact two-line plate cut to
  // the pitch where nothing stands in the row it hangs into, none past that —
  // every name is in the List and on hover, and the selected, hovered and
  // waiting stations carry theirs on a CARD. The budget still caps the count.
  const nameTierOf = (n: typeof projected[number]): OrchNameTier => {
    if (!budgeted.has(n.id)) return 'none'
    return orchNameTier(platformOf(n.object.platformId)?.pitchPx ?? 0, n.object.front)
  }
  const points = new Map(projected.map((n) => [n.id, { x: n.x, y: n.y }]))

  const expanded = (id: string): boolean => selectedIds.includes(id) || selectedId === id || hovered === id
  // M291. A card for the selected, the hovered and the WAITING stations only:
  // the ring gave every live cube a card, and on a platform of seven stations
  // those cards covered the plate's label and each other. A working station's
  // word is on its platform's plate (`N working`) and in the List.
  // Waiting cards are capped at ORCH_WAITING_CARDS (nearest first): the
  // 100-session fixture put ten waiting stations on one island and ten amber
  // cards covered every plate. Every waiting station still has its beacon, its
  // plate word, the platform's `N need you` and its row in Needs attention.
  const waitingCards = new Set(projected.filter((n) => n.object.kind === 'station' && n.state === 'wants-you' && !expanded(n.id)).sort((a, b) => b.depth - a.depth).slice(0, ORCH_WAITING_CARDS).map((n) => n.id))
  const calloutNodes = projected.filter((n) => n.object.kind === 'station'
    && (props.memberIds === null || props.memberIds.includes(n.id))
    // A lensed-out cube keeps its place but not its card: the lit set's callouts are the answer.
    && !lensedOut(n.id)
    && (waitingCards.has(n.id) || expanded(n.id)))
  const offsets = new Map<string, { x: number; y: number }>()
  // Cards that hang BELOW their cube: a back-row cube has no room above it.
  const below = new Set<string>()
  const occupied: { x: number; y: number; w: number; h: number }[] = []
  // Every object AND every plate is an obstacle; a card over a platform's label
  // hides the island's name, which is the one thing the plate is for.
  const footprints = [
    ...projected.map((o) => ({ id: o.id, weight: 1, x: o.x - o.size * 1.4, y: o.y - o.size, w: o.size * 2.8, h: o.size + calloutBelow(o.size) })),
    // The island's label weighs like another CARD (the critic: the selected
    // station's card sat on the island's goal and repository lines) — a card
    // over a label hides the one fact the plate exists for. The obstacle IS the
    // label's box (M294: centred above the diamond's top tip), one definition.
    ...projPlatforms.map((pp) => ({ id: `plate:${pp.p.id}`, weight: 12, ...pp.label }))
  ]
  const cover = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad: number): number =>
    Math.max(0, Math.min(a.x + a.w + pad, b.x + b.w) - Math.max(a.x - pad, b.x)) * Math.max(0, Math.min(a.y + a.h + pad, b.y + b.h) - Math.max(a.y - pad, b.y))
  // A card that cannot clear the label band EXPANDED collapses to its rest
  // height: the three plates' labels form one band across the stage and the
  // fitted camera leaves ~130 units above it, less than an expanded card and
  // its stem — so an expanded card could only ever sit ON a label (the critic,
  // rounds 1–3). The rest card fits above the band; the detail is the inspector's.
  const compact = new Set<string>()
  for (const n of [...calloutNodes].sort((a, b) => Number(expanded(b.id)) - Number(expanded(a.id)))) {
    const w = n.state === 'wants-you' ? 218 : 184
    const plateTopOf = platformOf(n.object.platformId)?.label.y
    const fits = (hh: number): boolean => (plateTopOf !== undefined && plateTopOf - hh - 8 >= 8) || n.y + calloutBelow(n.size) + 22 + hh <= stage.h - 8
    if (expanded(n.id) && !fits(calloutHeight(true)) && fits(calloutHeight(false))) compact.add(n.id)
    const h = calloutHeight(expanded(n.id) && !compact.has(n.id))
    const others = footprints.filter((f) => f.id !== n.id)
    // A third row: ABOVE the island's label plate. The row just above the cube
    // always crosses that label's band (the cubes stand near the plate's top),
    // and sliding fully off the platform cost the placer more than covering
    // the label did (the critic, twice) — the field above the platforms is empty.
    const plateTop = plateTopOf
    // And a row BESIDE the cube: at the fitted camera the stage leaves ~130 units
    // above a platform and an expanded card is 172 plus its stem, so neither
    // above nor below fits and the clamp fallback landed on the label (the
    // critic, round 3). Beside, the x sweep finds the field past the platform.
    const beside = Math.max(8, Math.min(stage.h - h - 8, n.y - h / 2))
    const rows = [n.y - n.size - h - 22, ...(plateTop === undefined ? [] : [plateTop - h - 8]), n.y + calloutBelow(n.size) + 22, beside]
      .filter((y) => y >= 8 && y + h <= stage.h - 8)
    if (rows.length === 0) rows.push(Math.max(8, Math.min(stage.h - h - 8, n.y - n.size - h - 22)))
    const sweep = []
    for (let x = 8; x <= stage.w - w - 8; x += 24) sweep.push(x + w / 2 - n.x)
    const drifts = [0, ...[...occupied, ...others].flatMap((r) => [r.x + r.w + 12 + w / 2 - n.x, r.x - 12 - w / 2 - n.x]), w + 16, -w - 16, ...sweep]
    const candidates = rows.flatMap((y) => drifts.map((dx) => {
      const x = Math.max(8, Math.min(stage.w - w - 8, n.x + dx - w / 2))
      const box = { x, y, w, h }
      const overlap = occupied.reduce((sum, r) => sum + cover(box, r, 8) * 8, 0) + others.reduce((sum, r) => sum + cover(box, r, 0) * r.weight, 0)
      const distance = Math.hypot(x + w / 2 - n.x, y + h / 2 - n.y)
      return { x, y, w, h, overlap: overlap + distance * 60, distance }
    })).sort((a, b) => a.overlap - b.overlap || a.distance - b.distance)
    const placed = candidates[0]
    occupied.push(placed)
    if (placed.y > n.y) below.add(n.id)
    // The placed ROW too: the card used to render at the cube's own row whatever
    // the placer chose (it took an x offset and a side only), so the above-label
    // row was picked and then drawn on the label. The lift is the difference
    // from the default row on that side; the stem stretches to it.
    const defaultY = placed.y > n.y ? n.y + calloutBelow(n.size) + 22 : n.y - n.size - h - 22
    offsets.set(n.id, { x: placed.x + w / 2 - n.x, y: placed.y - defaultY })
  }

  const cubeSpecs: OrchCubeSpec[] = projected.map((n) => {
    const selected = isSelected(n.id)
    return {
      id: n.id, x: n.x, y: n.y, size: n.size, depth: n.depth, hub: false, synthetic: false, lift: n.lift,
      shape: n.object.kind === 'checkpoint' ? 'puck' : n.object.kind === 'artifact' ? 'tablet' : 'cube',
      tone: toneFromState(n.state) as OrchCubeTone, selected,
      // Role → hue: a chat is the accent, a terminal/file steel, a watcher/workflow violet — the secondary family.
      roleColor: n.kind === 'chat' ? '--iris' : n.kind === 'terminal' || n.kind === 'file' ? '--deck-steel' : '--deck-violet',
      dimmed: hasSelection && !selected, lensedOut: lensedOut(n.id),
      attention: attentionOf(n, selected)
    }
  })
  const platformSpecs: OrchPlatformSpec[] = projPlatforms.map((pp) => ({
    id: pp.p.id, x: pp.x, y: pp.y, side: pp.p.side * cam.k, inset: ORCH_PLATFORM.inset * cam.k, thickness: ORCH_PLATFORM.thickness * cam.k, depth: pp.depth, lift: pp.lift,
    synthetic: pp.p.synthetic, selected: focusedIsOn(pp.p.id), dimmed: focusedPlatformId !== null && !focusedIsOn(pp.p.id) && hasSelection,
    lit: pp.p.counts.live > 0, needsYou: pp.p.counts.needsYou > 0, expanded: pp.p.expanded
  }))
  // M294. Connectors: light paths between neighbouring platforms and along a
  // plate's stations, trimmed to the outlines they join so no path crosses a
  // body. They are GROUPING (the same word the lens gives membership), never a
  // dependency, and there is no hub for them to meet at. A station chain
  // LIGHTS once, finitely, when either end changes state — the class restarts
  // its one-shot animation through the key, and nothing loops.
  const stateStamps = useRef(new Map<string, { state: string; at: number }>())
  const now = Date.now()
  for (const n of projected) {
    const prev = stateStamps.current.get(n.id)
    if (prev === undefined) stateStamps.current.set(n.id, { state: n.state, at: 0 })
    else if (prev.state !== n.state) stateStamps.current.set(n.id, { state: n.state, at: now })
  }
  const connectors = orchConnectors(platforms).flatMap((c) => {
    if (c.kind === 'platform') {
      const a = platformOf(c.from); const b = platformOf(c.to)
      if (a === undefined || b === undefined) return []
      const seg = orchSegmentBetween({ x: a.x, y: a.y }, { x: b.x, y: b.y }, a.points, b.points)
      return seg === null ? [] : [{ ...c, ...seg, lit: 0 }]
    }
    const a = projected.find((n) => n.id === c.from); const b = projected.find((n) => n.id === c.to)
    if (a === undefined || b === undefined) return []
    const box = (n: typeof a): { x: number; y: number }[] => [{ x: n.x - n.size * 1.1, y: n.y - n.size * 1.1 }, { x: n.x + n.size * 1.1, y: n.y - n.size * 1.1 }, { x: n.x + n.size * 1.1, y: n.y + n.size * 1.1 }, { x: n.x - n.size * 1.1, y: n.y + n.size * 1.1 }]
    const seg = orchSegmentBetween({ x: a.x, y: a.y }, { x: b.x, y: b.y }, box(a), box(b))
    const at = Math.max(stateStamps.current.get(a.id)?.at ?? 0, stateStamps.current.get(b.id)?.at ?? 0)
    return seg === null ? [] : [{ ...c, ...seg, lit: now - at < ORCH_CONNECTOR_LIT_MS ? at : 0 }]
  })

  // Paint (= hit) order: resting plates far→near, their objects, then an expanded plate and its objects.
  const hitOrder = orchHitOrder([
    ...projPlatforms.map((pp) => ({ kind: 'platform' as const, id: pp.p.id, depth: pp.depth, expanded: pp.p.expanded })),
    ...projected.map((n) => ({ kind: n.object.kind, id: n.id, depth: n.depth, platformId: n.object.platformId }))
  ])

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    event.preventDefault()
    autoFitted.current = false
    const factor = event.deltaY > 0 ? 0.92 : 1.08
    setCam((c) => ({ ...c, k: Math.min(ORCH_ZOOM_RANGE.max, Math.max(ORCH_ZOOM_RANGE.min, c.k * factor)) }))
  }
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const target = event.target as SVGElement
    if (target.closest('.orch__cube, .orch__callout-host, .orch__pplate')) return
    drag.current = { x: event.clientX, y: event.clientY, cx: cam.x, cy: cam.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    if (d === null) return
    const svg = event.currentTarget
    const sx = svg.clientWidth > 0 ? stage.w / svg.clientWidth : 1
    const sy = svg.clientHeight > 0 ? stage.h / svg.clientHeight : 1
    autoFitted.current = false
    setCam((c) => ({ ...c, x: d.cx + (event.clientX - d.x) * sx, y: d.cy + (event.clientY - d.y) * sy }))
  }
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const centreOn = (pt: { x: number; y: number }): void => {
    const fy = stage.h / 2 + (pt.y - stage.h / 2) * ORCH_COS_TILT
    moveCamera({ k: cam.k, x: -(pt.x - stage.w / 2) * cam.k, y: -(fy - stage.h / 2) * cam.k })
  }
  const focusedPlatform = platforms.find((p) => p.id === focusedPlatformId) ?? null
  const selectedObject = selectedId === null ? null : objects.find((o) => o.id === selectedId) ?? null
  const authored = orchEdgePaintOrder(edges).filter((e) => e.authored === true)

  return (
    <>
    <div className="orch__graph-scene" ref={sceneRef} role="group" aria-label="Task platforms" aria-describedby={props.describedBy} data-lens={litIds !== null ? 'true' : undefined} data-orch-webgl={props.webgl} data-orch-quality={props.quality}>
      {/* Ground layer: defs and the dependency edges — what the meshes paint OVER. Owns pan/zoom. */}
      <svg
        className="orch__graph orch__graph--ground"
        viewBox={`0 0 ${stage.w} ${stage.h}`}
        aria-hidden="true"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* M293. With no WebGL the bodies are flat SVG: the plate's footprint and
            a glyph-less block per object, so every state's word and shape survive. */}
        {props.webgl === 'unavailable' && hitOrder.map((t) => {
          if (t.kind === 'platform') {
            const pp = projPlatforms.find((x) => x.p.id === t.id)!
            return <polygon key={`flat-${t.id}`} className={`orch__flat-plate${pp.p.synthetic ? ' orch__flat-plate--group' : ''}`} data-orch-flat="platform" points={pp.points.map((q) => `${q.x},${q.y}`).join(' ')} data-lit={pp.p.counts.live > 0 || undefined} />
          }
          const n = projected.find((x) => x.id === t.id)!
          return n.object.kind === 'checkpoint'
            ? <polygon key={`flat-${t.id}`} className="orch__flat-object" data-orch-flat={t.kind} data-tone={toneFromState(n.state)} points={Array.from({ length: 6 }, (_, i) => `${n.x + Math.cos((Math.PI / 3) * i) * n.size},${n.y + Math.sin((Math.PI / 3) * i) * n.size * 0.8}`).join(' ')} />
            : <rect key={`flat-${t.id}`} className="orch__flat-object" data-orch-flat={t.kind} data-tone={toneFromState(n.state)} x={n.x - n.size * (t.kind === 'artifact' ? 0.7 : 1)} y={n.y - n.size} width={n.size * (t.kind === 'artifact' ? 1.4 : 2)} height={n.size * 2} rx={2} />
        })}
        {/* M289/M291. With the lens on, membership is drawn and MARKED as grouping:
            a quiet dashed spoke from each station to its plate's anchor. At rest a
            station standing on its plate needs no line. */}
        {props.depFocus && projected.filter((n) => n.object.kind === 'station').map((n) => {
          const pp = projPlatforms.find((x) => x.p.id === n.object.platformId)
          if (pp === undefined) return null
          return <line key={`spoke-${n.id}`} x1={pp.x} y1={pp.label.y + pp.label.h} x2={n.x} y2={n.y} className={`orch__edge orch__edge--grouping${lensedOut(n.id) ? ' orch__edge--lensed' : ''}`} data-orch-edge="grouping" data-role={n.kind} />
        })}
        {authored.map((e) => {
          const from = points.get(e.from)
          const to = points.get(e.to)
          if (!from || !to) return null
          const firing = firingKeys.has(`${e.from}:${e.to}`) || firingKeys.has(`${e.to}:${e.from}`)
          const fromN = projected.find((n) => n.id === e.from)!
          const toN = projected.find((n) => n.id === e.to)!
          return (
            <line
              key={`${e.from}-${e.to}-a`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className={`orch__edge orch__edge--authored${firing ? ' orch__edge--current' : ''}${lensedOut(e.from) || lensedOut(e.to) ? ' orch__edge--lensed' : ''}`}
              data-role={toN.kind}
              data-connected-live={(isLiveRosterState(fromN.state) || isLiveRosterState(toN.state)) || undefined}
              data-edge-activity={firing ? 'firing' : undefined}
              data-orch-edge="dependency"
            />
          )
        })}
        {props.depFocus && authored.map((e) => {
          const from = points.get(e.from)
          const to = points.get(e.to)
          if (!from || !to) return null
          return <text key={`label-${e.from}-${e.to}`} className="orch__edge-label" x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} textAnchor="middle" data-orch-edge-label={`${e.from}:${e.to}`}>{e.trigger ?? 'a bare link'}</text>
        })}
      </svg>
      {/* The R3F island: platforms and the object meshes, painted above the
          ground layer and below the hit-targets. `pointer-events: none`. The
          fallback keeps the layer's box; with no WebGL the island is not mounted
          at all (the flat bodies above stand in) and the boundary says so. */}
      {props.webgl === 'ready' && (
        <WebglBoundary onLost={props.onWebglLost}>
          <Suspense fallback={<div className="orch__cube-canvas" aria-hidden="true" />}>
            <OrchestrationCubes nodes={cubeSpecs} platforms={platformSpecs} viewBox={stage} quality={props.quality} />
          </Suspense>
        </WebglBoundary>
      )}
      {/* Overlay: hit-targets in PAINT order (orchHitOrder — what elementFromPoint
          answers), plates, beacons, labels, callouts. Root is pointer-events:none. */}
      <svg className="orch__graph orch__graph--over" data-has-selection={hasSelection ? 'true' : undefined} viewBox={`0 0 ${stage.w} ${stage.h}`}>
        <filter id="orch-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* M294. The connectors paint FIRST in the overlay — above the meshes
            (a path under an opaque deck is no path) and under every target,
            plate and card. Trimmed to the outlines, so they never cross a body. */}
        <g className="orch__connectors" aria-hidden="true" data-orch-connectors={connectors.length}>
          {connectors.map((c) => (
            <line key={`${c.kind}-${c.from}-${c.to}-${c.lit}`} className={`orch__connector orch__connector--${c.kind}${c.lit > 0 ? ' orch__connector--lit' : ''}${props.depFocus ? ' orch__connector--lensed' : ''}`}
              data-orch-edge="grouping" data-orch-connector={c.kind} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}><title>{ORCH_DEP_GROUPING}</title></line>
          ))}
        </g>
        {hitOrder.map((t) => {
          if (t.kind === 'platform') {
            const pp = projPlatforms.find((x) => x.p.id === t.id)!
            return (
              <g key={`platform-${t.id}`} className={`orch__platform-host${focusedIsOn(t.id) ? ' orch__platform-host--on' : ''}`} data-orch-platform={t.id} data-orch-platform-zoom={pp.level} data-orch-platform-cell={`${pp.p.cell.col},${pp.p.cell.row}`}
                data-orch-platform-expanded={pp.p.expanded || undefined} data-orch-platform-synthetic={pp.p.synthetic || undefined} data-orch-platform-lift={pp.lift || undefined}
                onPointerEnter={() => setHovered(`platform:${t.id}`)} onPointerLeave={() => setHovered(null)}>
                {/* The base plate's footprint IS the hit-target — the diamond's six-point
                    outline, the mesh's own silhouette (M294): a click on empty plate
                    selects the island; a double-click fits the camera to it. */}
                <polygon className="orch__platform-hit" data-orch-platform-hit={t.id} points={pp.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="transparent"
                  onClick={() => onFocusPlatform(t.id)} onDoubleClick={() => { onFocusPlatform(t.id); fitPlatform(t.id) }} />
                <PlatformPlate p={pp.p} cx={pp.x} y={pp.label.y} w={pp.w} level={pp.level} focused={focusedIsOn(t.id)} selected={focusedIsOn(t.id) && selectedId === null}
                  onFocus={(id) => onFocusPlatform(id)} onFit={(id) => { onFocusPlatform(id); fitPlatform(id) }}
                  {...(props.onViewInWorld !== undefined && focusedIsOn(t.id) && (pp.p.island?.memberIds.length ?? 0) > 0 ? { onWorld: props.onViewInWorld } : {})} />
              </g>
            )
          }
          const n = projected.find((x) => x.id === t.id)!
          return (
            <g key={n.id} className="orch__callout-host" data-ghost={props.memberIds !== null && !props.memberIds.includes(n.id) || undefined}
              data-lensed={lensedOut(n.id) || undefined}
              onPointerEnter={() => setHovered(n.id)} onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(n.id)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(null) }}
              tabIndex={0}
              aria-label={`${n.title} — ${n.object.kind}`}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || e.key !== 'Enter') return
                // Enter INSPECTS: it selects (never toggles off) and the page-level
                // handler then hands the keyboard to the inspector's Open on canvas.
                if (!isSelected(n.id)) onSelect(n.id)
              }}>
            <IsoCube
              node={n}
              band={n.band}
              labelOffset={{ x: 0, y: 0 }}
              selected={isSelected(n.id)}
              attention={attentionOf(n, isSelected(n.id))}
              objectKind={n.object.kind}
              nameTier={nameTierOf(n)}
              pitchPx={platformOf(n.object.platformId)?.pitchPx ?? 80}
              {...(wash !== null && wash.ids.includes(n.id) ? { wash } : {})}
              onSelect={onSelect}
              onJump={onJump}
              onOverflow={() => undefined}
            />
            </g>
          )
        })}
        {projected.filter((n) => offsets.has(n.id)).map((n) => (
          <g key={`callout-${n.id}`} className="orch__callout-wrap" onPointerEnter={() => setHovered(n.id)} onPointerLeave={() => setHovered(null)}>
            <CubeCallout node={n} offsetX={offsets.get(n.id)!.x} offsetY={offsets.get(n.id)!.y} below={below.has(n.id)} drift={n.drift} band={n.band} expanded={expanded(n.id) && !compact.has(n.id)}
              task={props.workItems.find((w) => w.panelId === n.id)?.title} onSelect={onSelect} onJump={onJump}
              onInterrupt={props.onInterrupt && props.canInterrupt(n.id) ? props.onInterrupt : undefined} />
          </g>
        ))}
        <EdgePackets edges={authored} fires={props.fires} points={points} />
      </svg>
    </div>
      {/* M292. Screen-aligned orientation: breadcrumb, Fit all / Fit selected / Back, the minimap.
          M298: a RAIL beside the scene, not a corner over it — measured at the app's default
          window, the stacked corner tools covered a plate or a label in every fixture (one to
          three of them), because a composition that fills the panel has no empty corner. The
          rail's width is the fit's to lose at wide windows (11% at 1128 px) and nothing at the
          default and narrow ones, where the fit is height-bound. */}
      <div className="orch__scene-tools" data-orch-scene-tools>
        <nav className="orch__crumbs" aria-label="Selection breadcrumb" data-orch-crumbs>
          <button type="button" className="orch__crumb" data-orch-crumb="all" {...shellControl(() => { onFocusPlatform(null); fitAll() })}>All work</button>
          {focusedPlatform !== null && <><span className="orch__crumb-sep" aria-hidden="true" />
            <button type="button" className="orch__crumb" data-orch-crumb="platform" title={focusedPlatform.label} {...shellControl(() => fitPlatform(focusedPlatform.id))}>{focusedPlatform.label}</button></>}
          {selectedObject !== null && <><span className="orch__crumb-sep" aria-hidden="true" />
            <span className="orch__crumb orch__crumb--leaf" data-orch-crumb="object">{selectedObject.title} · {selectedObject.kind}</span></>}
        </nav>
        {props.webgl === 'unavailable' && (
          <p className="orch__caption orch__webgl-notice" data-orch-webgl-notice role="status">3D is unavailable here (no WebGL context) — the scene is flat, and every action is the same.</p>
        )}
        <div className="orch__scene-buttons" role="toolbar" aria-label="Camera">
          <button type="button" className="orch__mini" data-orch-fit="all" title="Fit every platform in view" {...shellControl(fitAll)}>Fit all</button>
          <button type="button" className="orch__mini" data-orch-fit="selected" disabled={focusedPlatform === null && selectedObject === null} title="Fit the selected island in view" {...shellControl(() => { const id = selectedObject?.platformId ?? focusedPlatform?.id; if (id !== undefined) fitPlatform(id) })}>Fit selected</button>
          <button type="button" className="orch__mini" data-orch-camera-back disabled={historyDepth === 0} title="Back to the previous camera" {...shellControl(back)}>Back</button>
        </div>
        <Minimap platforms={platforms} cam={cam} stage={stage} onCentre={centreOn} />
      </div>
    </>
  )
}

/**
 * M293. WebGL can go two ways: the context never comes (a headless GPU, a
 * blocked driver, a harness that denies it) — probed BEFORE the island mounts,
 * by asking a scratch canvas — or it is lost while running. Either way the
 * view flips to the flat SVG bodies and says so; every action was on the
 * SVG hit-targets all along, so nothing is lost but the lighting.
 */
class WebglBoundary extends Component<{ onLost: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }
  override componentDidCatch(): void { this.props.onLost() }
  override render(): ReactNode { return this.state.failed ? <div className="orch__cube-canvas" aria-hidden="true" /> : this.props.children }
}

