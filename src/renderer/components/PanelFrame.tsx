import { useState, useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createContext, useContext, type CSSProperties, type JSX, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { CardDetailContext } from './card-detail-context'
import { farTitleParts, FAR_TITLE_SEPARATOR, type CardDetail } from '@renderer/canvas/card-detail'
import { useTierFade } from '@renderer/canvas/tier-fade'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { WorldRect } from '@renderer/canvas/viewport'
import type { Panel } from '@renderer/panels/panels'
import type { PanelStateWord } from '@renderer/panels/panel-state'
import type { AgentState } from '@shared/types'
import { colorOf } from '@shared/presence'
import { PanelPorts } from './PanelPorts'
import { Close, KIND_GLYPH, Lock, Maximize, Pin, Restore } from '@renderer/icons'
import { shellControl } from '@renderer/shell/shell-control'
import { fieldKeepsKey } from '@renderer/canvas/draft-focus'
import { useTrailFor } from '@renderer/skills/skill-trail-store'
import { useEdgeArriving } from '@renderer/canvas/useEdgeActivity'
import { useLastLine } from '@renderer/session/last-line-store'
import type { AdvancedDoor, AdvancedDoorId } from '@renderer/canvas/advanced-doors'
import { panelVerbs, runPanelVerb, type PanelVerb, type TaskMenuFact } from '@renderer/canvas/object-verbs'

/**
 * M47. ONE panel frame. Five kinds used to ship five hand-rolled headers,
 * each "reusing .panel for its box, its chrome and its resize" and then
 * declaring its own heading, refresh control, note, summary and body — five
 * families, three or four near-duplicate copies each, which is the kind of
 * duplication that drifts. A kind now supplies a TITLE (the honest chain,
 * computed by the kind), a `chrome` fragment (its own controls), a body,
 * and its close arming rule; the frame owns the box, the chrome row, the
 * close control, the resize handles and the link ports.
 *
 * THE DOM CONTRACT IS KEPT AS ALIASES. Roughly two hundred end-to-end
 * checks select on `.panel`, `.panel__chrome`, `.panel__title`,
 * `.panel__close`, `.panel__slot`, `.panel__card`, `.panel__resize` and the
 * `review-node__*` / `file-node__*` / `toolbox-node__*` / `jira-node__*`
 * hooks. Every frame element carries its `.pf__*` class AND the alias the
 * checks read; the duplicates are deleted from the STYLESHEET (verify:styles
 * frame.1), never from the DOM. A kind's body element carries `pf__body`
 * (plus `pf__body--text` for the reading kinds) beside its own alias.
 *
 * `.pf__body` IS NEVER TRANSFORMED, and the reason is not cosmetic: a
 * transform on the subtree hosting xterm changes what
 * getBoundingClientRect() reports while xterm's cell metrics stay
 * transform-blind — exactly the arithmetic pointer-correct.ts compensates
 * for. Counter-scale the body and every click in that panel lands on the
 * wrong cell with nothing thrown. Zoom-independent chrome (#60) was cut for
 * 1.0; if it returns, it counter-scales `.pf__chrome` and `.pf__handles`
 * and nothing else. verify:panels frame.2 pins this from both sides.
 */
export interface PanelFrameClose {
  armed: boolean
  title: string
  label?: string
  /** The kind's own rule (a terminal arms while its process runs, a file while a draft is dirty). */
  onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void
  /** What the armed control says; the un-armed one is the close glyph. */
  armedText: string
  /** Extra attributes for a check to find the control by. */
  attrs?: Record<string, string | boolean | undefined>
}


/**
 * M92. The marks a frame paints — lock, pin, maximised — keyed by panel id,
 * provided ONCE by the canvas the way `CardDetailContext` provides the tier,
 * so no kind has to thread three props it does not understand. `maximise` and
 * `restore` are the verbs the chrome control runs; `readOnly` is the merged
 * view, where the control is disabled by name.
 */
export interface PanelMarks {
  marks: ReadonlyMap<string, { locked: boolean; pinned: boolean; maximised: boolean; trailCollapsed: boolean }>
  maximise: (id: string) => void
  restore: (id: string) => void
  /** M130. Fold this panel's skill trail away, or bring it back. Absent in a fixture. */
  toggleTrail?: (id: string) => void
  readOnly: boolean
  /** M106. The ⋯ menu's door: focus this panel and open the palette captured on it. Absent in a fixture. */
  more?: (id: string) => void
  /** M204 (D08). The task lens: each member's id → why it is one; null or absent when no lens is on. */
  lens?: ReadonlyMap<string, string> | null
  /** M204 (D08). The ⋯ menu's task section: which task this panel is part of, and the three verbs. Absent in a fixture. */
  task?: { of: (id: string) => TaskMenuFact; show: (id: string) => void; related: (id: string) => void; arrange: (id: string) => void; /** M324. Open the task's focus view. */ focus?: (id: string) => void }
  /** Brief #19. The advanced features relevant to THIS panel, asked when the menu opens, and the verb each runs. Absent in a fixture. */
  advanced?: { of: (id: string) => AdvancedDoor[]; run: (id: string, door: AdvancedDoorId) => void }
}
/** M204 (D08). What the ⋯ menu knows about a panel's task — declared beside the verb list it feeds (M408). */
export type { TaskMenuFact } from '@renderer/canvas/object-verbs'
export const PanelMarksContext = createContext<PanelMarks>({ marks: new Map(), maximise: () => {}, restore: () => {}, readOnly: true })

export interface PanelFrameProps {
  /** M106. Open the palette captured on this panel — the ⋯ menu's door to every verb. Absent hides the door (a fixture). */
  onMore?: (id: string) => void
  id: string
  kind: Panel['kind']
  rect: WorldRect
  z: number
  selected: boolean
  linkTarget: boolean
  readOnly: boolean
  /** Extra root classes a kind still needs (`review-node`, the agent-state classes). */
  className?: string
  /** Extra root attributes (role, aria-label, data-agent-state, data-review-node…). */
  rootAttrs?: Record<string, string | undefined>
  /** The honest chain, computed by the kind. */
  title: ReactNode
  /** M405 (D2). The title's tooltip when it is not the title itself — the path rule's FULL path beside a name that shows its basename. */
  titleHint?: string
  /**
   * M405 (D2). RENAME IN PLACE: a double-click on the title swaps it for a
   * field holding the same words; Enter or leaving the field commits, Escape
   * keeps the old name, an empty field is a cancel (the palette's rule).
   * Absent: the title is only text (every kind but the terminal, and the
   * merged view's read-only geometry).
   */
  onRename?: (name: string) => void
  /** The kind's own chrome controls, between the title and close. */
  chrome?: ReactNode
  /** M170. A terminal started as an agent wears the chat's glyph beside its state dot, so a conversation and an agent terminal share one frame. */
  agentGlyph?: boolean
  /** Terminal panels have an agent; the frame paints its state dot. */
  agentState?: AgentState
  /** M69. The word the summary tier shows for a sessionless kind, when the kind's own name is not it (a prose file is a `note`). */
  kindWord?: string
  /**
   * M73. A PROCESS kind that is not a terminal (a chat panel) supplies its
   * state word and tone from the one vocabulary: the dot, the far tiers and
   * the edge read it instead of the kind. Absent for every document kind.
   */
  state?: PanelStateWord
  /** M76. What the summary tier shows UNDER the state word — a chat's pending question with its verbs. */
  far?: ReactNode
  /** #13. Configuration the kind moved out of its header (a chat's folder · branch · model): a line under the kind in the ⋯ menu, where it is looked for rather than read at rest. */
  menuDetail?: ReactNode
  /** null: no close control (the merged view's read-only geometry). */
  close: PanelFrameClose | null
  /** The terminal's enter animation, on the motion wrapper. */
  motion?: { entering: boolean; demoting?: boolean; waking?: boolean; onEntryEnd: (id: string) => void }
  onSelect: (id: string, additive?: boolean) => void
  onBeginDrag: (state: DragState) => void
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  children: ReactNode
  /**
   * The Supabase user whose agent this is, from the owner stamped on every
   * agent event (main's agent-runtime fan-out). Sets `--agent-owner`, which
   * the stylesheet reads for the WORKING tone only: activity is drawn in its
   * owner's colour, while needs-you stays amber and an error stays red — a
   * teammate's colour must never be mistaken for a state.
   */
  owner?: string
}

/**
 * M395 (the critic's P1 #3). A far card's NAME: the kicker (an agent's
 * `claude`) and the name (`api (2)`) as spans, with the separator between them
 * — so the element's text is still the title exactly, and the near tier (a
 * flipped card) paints it as one line as before. Only the far tiers' rules in
 * styles.css pull it apart: the kicker becomes one small line that gives
 * first, the separator goes, and the name holds a minimum SCREEN size across
 * up to two lines — the part that tells four `claude — …` cards apart survives.
 */
export function FarTitle({ title }: { title: ReactNode }): JSX.Element {
  if (typeof title !== 'string') return <>{title}</>
  const parts = farTitleParts(title)
  if (parts.kicker === undefined) return <span className="far-name__name">{title}</span>
  return (
    <>
      <span className="far-name__kicker">{parts.kicker}</span>
      <span className="far-name__sep">{FAR_TITLE_SEPARATOR}</span>
      <span className="far-name__name">{parts.name}</span>
    </>
  )
}

/** M69. The word a sessionless kind shows in its summary's state slot. */
const KIND_WORD: Record<Exclude<Panel['kind'], 'terminal'>, string> = { review: 'review', file: 'file', toolbox: 'toolbox', jira: 'Jira', github: 'GitHub', chat: 'chat', memory: 'memory', watcher: 'watcher', browser: 'browser', work: 'work', skill: 'skill', workflow: 'workflow', image: 'image', note: 'note', relay: 'relay', shape: 'shape' }

export function PanelFrame({
  id, kind, rect, z, selected, linkTarget, readOnly, className, rootAttrs, title, chrome, agentGlyph, agentState, owner,
  close, motion, onSelect, onBeginDrag, onBeginLink, children, kindWord, state, far, onMore, menuDetail, titleHint, onRename
}: PanelFrameProps): JSX.Element {
  // M405 (D2). The rim's rename field; null while the title is plain text.
  const [renaming, setRenaming] = useState<string | null>(null)
  // Ends the edit ONCE: Enter unmounts the field, and a blur arriving from that
  // unmount must not commit (or cancel) a second time.
  const renameOpenRef = useRef(false)
  renameOpenRef.current = renaming !== null
  const endRename = (value: string | null): void => {
    if (!renameOpenRef.current) return
    renameOpenRef.current = false
    setRenaming(null)
    if (value !== null && onRename !== undefined && value.trim() !== '' && value.trim() !== title) onRename(value)
  }
  // M233. Subscribed per panel id, so a frame re-renders for its OWN
  // arrivals and nobody else's — the same per-id discipline agent-state-store
  // uses, and the reason edge activity does not ride registry.version().
  const arriving = useEdgeArriving(id)
  // M260. THE UNREAD MARK, centrally: `last-line-store` already carries a
  // per-panel unread boolean (M105), written only for a chat whose turn ended
  // off-screen, but nothing painted it anywhere but the rail row. Reading it
  // here — once, for every kind — puts a rest-layer fact on the frame a chat
  // already wears (so it is visible at a zoomed-out card face too) without a
  // second unread-tracking mechanism: a kind nothing ever calls setLastLine
  // for reads the frozen EMPTY sentinel and paints nothing.
  const unread = useLastLine(id).unread
  const [menuOpen, setMenuOpen] = useState(false)
  // M121. The outside click. Installed only while the menu is open, on the
  // DOCUMENT in the capture phase — the canvas host's own mousedown starts a
  // pan (and stops nothing), so a bubble-phase listener would still see it,
  // but a mousedown a panel body swallows would not; capture sees every one.
  // Inside the host (the button, the title, the verbs) is not outside: the
  // menu's own verbs are mousedown-then-click, and closing on their mousedown
  // would unmount the button before its click could run.
  const menuHostRef = useRef<HTMLSpanElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  // M258. THE ⋯ MENU IS KEYBOARD-REACHABLE: opening it moves focus to its
  // first row, ArrowUp/ArrowDown/Home/End walk the rows, and Escape closes it
  // and hands focus back to the ⋯ button — so Tab, Enter, arrows, Escape is
  // a complete route with no pointer.
  useEffect(() => {
    if (!menuOpen) return
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    first?.focus({ preventScroll: true })
  }, [menuOpen])
  // M341. Bounded by the VISIBLE canvas too. M315 bounded the menu by its own
  // panel and let it scroll, which is right until the panel itself runs past
  // the window's foot: then the bound is off-screen as well, and the last rows
  // (Verbs in ⌘K, close) sat below the window (the `header` scene). It cannot
  // open upward instead — `.panel` clips with overflow: hidden, and a menu above
  // its header was measured present and painted nowhere. So its height is also
  // capped at the room between the header and the canvas's foot, in the menu's
  // own (world) pixels. Measured before the first paint AND on every frame the
  // menu stays open: the camera can move under an open menu (a pan, or a
  // jump's flight still landing — the `header` scene opened its menu mid-
  // flight, and a once-per-opening measure capped it for a place the panel
  // then left). One rect read per frame, and a state change only on a real move.
  const [menuRoom, setMenuRoom] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!menuOpen) { setMenuRoom(null); return }
    const measure = (): void => {
      const menu = menuRef.current
      if (menu === null || menu.offsetHeight === 0) return
      const view = (menu.closest('.canvas') ?? document.documentElement).getBoundingClientRect()
      const box = menu.getBoundingClientRect()
      // From the menu's OWN top edge: it hangs below the chrome's padding, not
      // at the ⋯ button's foot (the first version measured from there and still
      // overhung the window by the difference).
      const room = (Math.min(view.bottom, window.innerHeight) - box.top) / (box.height / menu.offsetHeight) - 8
      setMenuRoom((prev) => (prev !== null && Math.abs(prev - room) < 1 ? prev : room))
    }
    measure()
    let frame = requestAnimationFrame(function follow() { measure(); frame = requestAnimationFrame(follow) })
    return () => cancelAnimationFrame(frame)
  }, [menuOpen])
  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const rows = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const at = rows.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number): void => { event.preventDefault(); event.stopPropagation(); rows[(i + rows.length) % rows.length]?.focus({ preventScroll: true }) }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); menuButtonRef.current?.focus({ preventScroll: true }); return }
    if (rows.length === 0) return
    if (event.key === 'ArrowDown') go(at + 1)
    else if (event.key === 'ArrowUp') go(at < 0 ? rows.length - 1 : at - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(rows.length - 1)
  }
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent): void => {
      const host = menuHostRef.current
      if (host !== null && event.target instanceof Node && host.contains(event.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [menuOpen])
  // M73. The tone every mark below reads: a terminal's rides rootAttrs, a
  // process kind's is its state's, a document kind's is `kind`.
  const marks = useContext(PanelMarksContext)
  // M106. The canvas provides the door once; a kind may still hand its own.
  const more = onMore ?? marks.more
  const mark = marks.marks.get(id)
  // M408 (D1). The ⋯ menu's rows, asked when it opens (the task and the
  // advanced doors are live facts), from the one list the context menu reads.
  const menuTask = menuOpen ? marks.task?.of(id) : undefined
  const menuVerbs: PanelVerb[] = !menuOpen ? [] : panelVerbs({
    ...(menuTask !== undefined ? { task: menuTask } : {}),
    taskFocus: marks.task?.focus !== undefined,
    ...(marks.advanced !== undefined && !marks.readOnly ? { advanced: marks.advanced.of(id) } : {}),
    readOnly: marks.readOnly,
    framed: close !== null,
    maximised: mark?.maximised === true,
    palette: more !== undefined
  })
  const menuRow = (v: PanelVerb): JSX.Element => (
    <button key={v.id} type="button" role="menuitem" className={`pf__verb pf__verb--word${v.benefit !== undefined ? ' pf__menu-door' : ''}`}
      {...{ [v.attr[0]]: v.attr[1] }} disabled={v.disabled !== undefined} title={v.title}
      {...shellControl(() => { if (v.disabled !== undefined) return; setMenuOpen(false); runPanelVerb(v.id, id, { ...marks, more: more ?? marks.more }) })}>
      {v.benefit !== undefined ? <><span>{v.label}</span><span className="pf__menu-benefit">{v.benefit}</span></> : v.label}
    </button>
  )
  /**
   * M130. THE TRAIL'S CAPSULE — how many skills this panel's agent used, and
   * the control that folds the lane away.
   *
   * It is painted from the TRAIL and not from the kind, so a chat and a
   * terminal grow it on the same rule and nothing else has to know the trail
   * exists. It stays on screen in BOTH states, because a control that
   * disappears when its thing is off is indistinguishable from a feature that
   * was never built — this repo's standing rule for every administrative
   * affordance — and it says WORDS (`7 skills` / `hide 7 skills`), never a
   * chevron or an entity glyph (verify:styles icons.1).
   */
  const trail = useTrailFor(id, kind)
  const trailCount = trail.kind === 'entries' ? trail.entries.length : 0
  const trailCollapsed = mark?.trailCollapsed === true
  const tone = state?.tone ?? rootAttrs?.['data-tone'] ?? 'kind'
  // M69. Below SUMMARY_ENTER every kind — not only a terminal — renders its
  // summary in place of its body; below BLOCK_ENTER, a block in its tone. The
  // chrome row stays and the state edge is the border, so the edge survives
  // every tier. The terminal's own tiers are its own (TerminalPanel).
  const detail = useContext(CardDetailContext)
  const renderFar = (d: CardDetail): ReactNode | null => kind === 'terminal' ? null
    : d === 'cluster' ? (
      <div className="pf__body pf__far pf__far--cluster" data-card-cluster data-tone={tone}>
        <div className="panel__card-cluster" data-tone={tone} />
      </div>
    ) : d === 'block' ? (
      <div className="pf__body pf__far pf__far--block" data-card-block data-tone={tone}>
        <div className="panel__card-block" data-tone={tone}><span className="panel__card-block-title" title={typeof title === 'string' ? title : undefined}><FarTitle title={title} /></span></div>
      </div>
    ) : d === 'summary' ? (
      <div className="pf__body pf__far" data-card-summary>
        <div className="panel__card-summary" data-tone={tone}>
          {/* M166. The kind's glyph, large: a light with a name. */}
          <span className="panel__card-summary-glyph" aria-hidden="true">{(() => { const G = KIND_GLYPH[kind as Exclude<Panel['kind'], 'terminal'>]; return G ? <G /> : null })()}</span>
          <div className="panel__card-summary-title" title={typeof title === 'string' ? title : undefined}><FarTitle title={title} /></div>
          <div className="panel__card-summary-state" data-tone={tone}>{state?.word ?? kindWord ?? KIND_WORD[kind as Exclude<Panel['kind'], 'terminal'>]}</div>
          {far}
        </div>
      </div>
    ) : null
  const farBody = renderFar(detail)
  // Zoom crossfade (tier-fade.ts). The tier being left fades out while the
  // incoming one fades in, and whichever layer is NOT the in-flow body is
  // absolutely positioned over the body area — so the frame's geometry is the
  // same on every frame of the fade. The near body (`pf__keep`) can hold a
  // draft or a webview and is never cloned: leaving near, it stays in flow and
  // the far body floats over it; returning to near, it is in flow at once and
  // the far body it replaces floats as the ghost.
  const leaving = useTierFade(detail)
  const headerRef = useRef<HTMLElement | null>(null)
  const fading = kind !== 'terminal' && leaving !== null
  const toFar = fading && farBody !== null && renderFar(leaving) === null
  const layerTop = ((): number => {
    const h = headerRef.current
    if (h === null || getComputedStyle(h).position === 'absolute') return 0
    return h.offsetTop + h.offsetHeight
  })()
  const tierLayer = !fading ? null : toFar ? (
    <div className="pf__tier-layer pf__tier-layer--in" style={{ top: layerTop }} aria-hidden="true" inert={true} data-tier-ghost>{farBody}</div>
  ) : (
    <div className="pf__tier-layer pf__tier-layer--out" style={{ top: layerTop }} aria-hidden="true" inert={true} data-tier-ghost>{renderFar(leaving)}</div>
  )
  const style = { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z, ...(owner === undefined ? {} : { '--agent-owner': colorOf(owner) }) } as CSSProperties
  const beginMove = (event: ReactMouseEvent): void => {
    // Chrome selects, and starts a move. stopPropagation keeps the canvas
    // from reading this as a background click and deselecting;
    // preventDefault suppresses the native text-drag of the title.
    event.stopPropagation()
    event.preventDefault()
    // M408 (D1). ONLY A PRIMARY PRESS ON THE BARE CHROME MOVES. A control's
    // own handler (`shellControl`) only prevents default, so a press on ⋯,
    // fill or the trail used to bubble here and lift the panel under the
    // click; and nothing read `button`, so a right-press (or ⌃-press, the
    // Mac's right-click) dragged too. Neither begins a gesture; a control
    // press still selects, and a secondary press is selected by its menu.
    // M408 follow-up. A SECONDARY press selects nothing HERE: a terminal's
    // `onSelect` is onSelectPanel, whose registry.wake spawns a dormant
    // panel, and inspecting must be inert. The `contextmenu` that always
    // follows selects it through selectAndRaise (useCanvasContextMenu).
    if (event.button !== 0 || event.ctrlKey) return
    const control = event.target instanceof Element && event.target.closest('button, input, a, [role=menu]') !== null
    onSelect(id, event.shiftKey)
    if (control) return
    onBeginDrag({ panelId: id, mode: { kind: 'move' }, originRect: rect, originWorld: { x: event.clientX, y: event.clientY } })
  }
  const inner = (
    <>
      <header ref={headerRef} className="pf__chrome panel__chrome" onMouseDown={beginMove}>
        {/* The state dot (terminal) or the kind's accent mark — ONE rule set,
            keyed on data-agent-state, shared with the rail and the context
            pane (`.status-dot`). */}
        {kind === 'terminal' ? (
          <>
            {agentGlyph === true && <span className="pf__state pf__state--kind" data-tone="kind" data-agent-glyph aria-hidden="true"><KIND_GLYPH.chat /></span>}
            <span className="pf__state status-dot" data-agent-state={agentState ?? 'none'} data-tone={rootAttrs?.['data-tone'] ?? 'kind'} aria-hidden="true" />
          </>
        ) : (
          /* M66. A grey dot on a kind that has no state read as a state
             nobody could name (M66's critic); the kind's own glyph, the one
             the rail row shows, says what the panel is instead. */
          <span className="pf__state pf__state--kind" data-tone="kind" aria-hidden="true">{(() => { const G = KIND_GLYPH[kind]; return <G /> })()}</span>
        )}
        {/* M260. A rest-layer fact, not a hover-revealed verb: present in the
            DOM only while true, never opacity-gated like the chrome's other
            marks, so it is legible at a glance and at a zoomed-out card face. */}
        {unread && <span className="pf__unread" data-panel-unread title="changed while you were elsewhere" aria-label="unread" />}
        {/* M106. The title is what gives (see styles.css's header rule); the FULL
            title lives here and at the top of the ⋯ menu, never truncated to
            `Revie…` with nowhere to read the rest. */}
        {renaming !== null && onRename !== undefined ? (
          /* M405 (D2). The field sits where the title was, in the title's own
             box and font, so the rim does not jump. Its mousedown stays here:
             the header's would start a move and steal the caret. */
          <input className="pf__title pf__title-input" data-panel-title-input aria-label="Panel name" autoFocus value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              // Bare keys stay with the field (a canvas shortcut must not fire
              // mid-name); a ⌘ chord that is not a text edit reaches the canvas.
              if (fieldKeepsKey(e)) e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); endRename(renaming) }
              else if (e.key === 'Escape') { e.preventDefault(); endRename(null) }
            }}
            onBlur={() => endRename(renaming)} />
        ) : (
          <span className="pf__title panel__title" title={titleHint ?? (typeof title === 'string' ? title : undefined)}
            onDoubleClick={onRename === undefined || typeof title !== 'string' ? undefined : (e) => { e.stopPropagation(); setRenaming(title) }}>{title}</span>
        )}
        {/* M106. The one menu the frame grows: the full title, the kind, and the
            door to every verb the palette holds for this panel. */}
        <span className="pf__menu-host" ref={menuHostRef}>
          <button type="button" ref={menuButtonRef} className="pf__verb pf__verb--word pf__menu-open" data-panel-more aria-haspopup="menu" aria-expanded={menuOpen} title="More — the full title and every verb for this panel"
            {...shellControl(() => setMenuOpen((v) => !v))}>⋯</button>
          {menuOpen && (
            <div className="pf__menu" role="menu" ref={menuRef} data-panel-menu onMouseDown={(e) => e.stopPropagation()} onKeyDown={onMenuKey}
              // M315. Bounded by its own panel: the menu grows down from the
              // header, and on a short panel near the window's foot its last
              // rows (Verbs in ⌘K, close) ran off-screen. It scrolls instead.
              // M341: and by the visible canvas below the header (menuRoom), never under three rows.
              style={{ maxHeight: Math.max(96, Math.min(Math.max(160, rect.h - 40), menuRoom ?? Infinity)), overflowY: 'auto' }}>
              <div className="pf__menu-title" data-panel-menu-title>{title}</div>
              <div className="pf__note">{kind}</div>
              {menuDetail !== undefined && <div className="pf__note pf__menu-detail" data-panel-menu-detail>{menuDetail}</div>}
              {/* M204 (D08). The contextual door onto the task verbs, on EVERY
                  member and not only the card. A panel in two tasks says so
                  and names both rather than choosing; a panel in none shows
                  no section — there is no task to act on, and an empty
                  heading on every menu of the canvas would be noise.
                  Brief #19: the advanced doors, at most three, chosen from what
                  is true of this panel, each said as what it gives. M258: Fill
                  view / Restore size beside the palette's door.
                  M408 (D1): every row below is `panelVerbs` — the ONE list the
                  panel's context menu renders too — run through `runPanelVerb`. */}
              {menuTask?.kind === 'many' && <p className="pf__note" data-panel-menu-task="many">part of {menuTask.titles.length} tasks — {menuTask.titles.join(' and ')}; act from a card</p>}
              {menuTask?.kind === 'one' && (
                <div className="pf__menu-task" data-panel-menu-task="one">
                  <div className="pf__note">task · {menuTask.title}</div>
                  {menuVerbs.filter((v) => v.section === 'task').map(menuRow)}
                </div>
              )}
              {menuVerbs.some((v) => v.section === 'advanced') && (
                <div className="pf__menu-advanced" data-panel-menu-advanced={menuVerbs.filter((v) => v.section === 'advanced').length}>
                  <div className="pf__note">do more with this</div>
                  {menuVerbs.filter((v) => v.section === 'advanced').map(menuRow)}
                </div>
              )}
              {menuVerbs.filter((v) => v.section === 'frame').map(menuRow)}
              <button type="button" role="menuitem" className="pf__verb pf__verb--word" data-panel-menu-close title="Close this menu" {...shellControl(() => setMenuOpen(false))}>close menu</button>
            </div>
          )}
        </span>
        {/* M92. Lock and pin are STATE MARKS with the fix in their title; maximise is a control. */}
        {mark?.locked && <span className="pf__mark pf__mark--lock" data-panel-locked title="locked — drag and resize refuse; Unlock panel in the palette or the pane">{Lock}</span>}
        {mark?.pinned && <span className="pf__mark pf__mark--pin" data-panel-pinned title="pinned — kept live wherever the camera is; Unpin panel in the palette or the pane">{Pin}</span>}
        {trailCount > 0 && marks.toggleTrail !== undefined && (
          <button
            type="button"
            className="pf__verb pf__verb--word pf__trail"
            data-skill-trail-toggle={trailCollapsed ? 'collapsed' : 'expanded'}
            title={trailCollapsed ? 'Show the skills this agent used, in the lane beside this panel' : 'Fold the skill lane away; the count stays here'}
            {...shellControl(() => marks.toggleTrail?.(id))}
          >{trailCollapsed
            ? `${trailCount} ${trailCount === 1 ? 'skill' : 'skills'}`
            : `hide ${trailCount} ${trailCount === 1 ? 'skill' : 'skills'}`}</button>
        )}
        {chrome}
        {close !== null && (
          <button type="button" className="pf__verb pf__verb--word pf__maximise" data-panel-maximise={mark?.maximised ? 'restore' : 'maximise'}
            disabled={marks.readOnly}
            title={marks.readOnly ? 'the merged view is read-only' : mark?.maximised ? 'Restore size — back to where it was' : 'Fill view — this panel fills the window'}
            aria-label={mark?.maximised ? 'Restore size' : 'Fill view'}
            {...shellControl(() => { if (!marks.readOnly) (mark?.maximised ? marks.restore : marks.maximise)(id) })}>{mark?.maximised ? <Restore /> : <Maximize />}</button>
        )}
        {close !== null && (
          <button
            type="button"
            className={`pf__close panel__close icon-button${close.armed ? ' panel__close--arming' : ''}`}
            onMouseDown={close.onMouseDown}
            title={close.title}
            aria-label={close.label ?? close.title}
            {...(close.attrs ?? {})}
          >
            {close.armed ? close.armedText : <Close />}
          </button>
        )}
      </header>
      {toFar ? null : farBody}
      {/* Mounted under every tier and hidden under the far ones: a body
          subtree can hold a draft (a Jira comment), and unmounting it on a
          zoom would discard typed work with no sign (M69's verifier). */}
      <div className="pf__keep" hidden={farBody !== null && !toFar}>{children}</div>
      {tierLayer}
      {/* East, south and south-east only — see ResizeEdge. Each handle is a
          child of the frame, so it rides .world's transform with the rest of
          the panel instead of sitting in screen pixels and drifting on zoom.
          Suppressed under readOnly (the merged view's geometry is not this
          canvas's to write), as the ports are. */}
      {(readOnly ? [] : (['e', 's', 'se'] as const)).map((edge) => (
        <div
          key={edge}
          className={`pf__handle panel__resize panel__resize--${edge}`}
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            // M408 (D1). Only the primary button resizes; a right- or ⌃-press
            // is the context menu's, which selects without waking (above).
            if (event.button !== 0 || event.ctrlKey) return
            onSelect(id)
            onBeginDrag({ panelId: id, mode: { kind: 'resize', edge }, originRect: rect, originWorld: { x: event.clientX, y: event.clientY } })
          }}
        />
      ))}
      {/* M35. `links` lives on PanelBase, so every kind is a link endpoint.
          The PORT_MIN_SCALE cutoff is a canvas-host CLASS, never a `scale`
          prop threaded through a memoized component — PanelPorts' comment. */}
      {!readOnly && <PanelPorts panelId={id} onBeginLink={onBeginLink} />}
    </>
  )
  return (
    <div
      className={`panel pf pf--kind-${kind}${selected ? ' panel--selected' : ''}${className ? ` ${className}` : ''}`}
      data-panel-id={id}
      data-panel-kind={kind}
      data-link-target={linkTarget ? '' : undefined}
      style={style}
      // M63. The state edge reads this: a terminal supplies its tone through
      // rootAttrs; every other kind is its kind.
      data-tone={tone}
      data-agent-owner={owner}
      // M395. The body is a far CARD (its own name, large): the far tiers hide
      // the header's duplicate, clipped title (styles.css). A terminal states
      // it through rootAttrs, since only it knows whether its slot is live.
      data-far-card={farBody !== null ? '' : undefined}
      // M233. A join arrival landed HERE. It flashes `.pf::before` — M109's
      // state-edge glow — rather than adding a second mechanism for
      // "something reached me": the flash inherits that pseudo-element's
      // clipping and its pointer-events: none for free, and one element
      // cannot contradict itself about which edge of the frame means what.
      data-edge-arriving={arriving ? '' : undefined}
      // M204 (D08). The task lens, as an ATTRIBUTE the stylesheet paints —
      // opacity and an outline, neither of which is layout.
      // Which way a zoom crossfade runs; the stylesheet fades the in-flow body.
      data-tier-fade={!fading ? undefined : toFar ? 'to-far' : farBody === null ? 'to-near' : 'far'}
      data-task-lens={marks.lens === undefined || marks.lens === null ? undefined : marks.lens.has(id) ? 'member' : 'other'}
      {...(rootAttrs ?? {})}
    >
      {motion ? (
        /* Motion lives on this wrapper, never .panel: .panel's geometry rides
           .world and the viewport checks read that transform as a matrix. */
        <div
          className={`pf__motion panel__motion${motion.entering ? ' panel__motion--entering' : ''}${motion.demoting === true ? ' panel__motion--demoting' : ''}${motion.waking === true ? ' panel__motion--waking' : ''}`}
          onAnimationEnd={(event) => {
            if (event.animationName === 'panel-enter' || event.animationName === 'panel-demote' || event.animationName === 'panel-wake') motion.onEntryEnd(id)
          }}
        >
          {inner}
        </div>
      ) : inner}
    </div>
  )
}
