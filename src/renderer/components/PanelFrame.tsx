import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createContext, useContext, type CSSProperties, type JSX, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { CardDetailContext } from './card-detail-context'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { WorldRect } from '@renderer/canvas/viewport'
import type { Panel } from '@renderer/panels/panels'
import type { PanelStateWord } from '@renderer/panels/panel-state'
import type { AgentState } from '@shared/types'
import { PanelPorts } from './PanelPorts'
import { Close, KIND_GLYPH, Lock, Maximize, Pin, Restore } from '@renderer/icons'
import { shellControl } from '@renderer/shell/shell-control'
import { useTrailFor } from '@renderer/skills/skill-trail-store'
import { useEdgeArriving } from '@renderer/canvas/useEdgeActivity'

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
  task?: { of: (id: string) => TaskMenuFact; show: (id: string) => void; related: (id: string) => void; arrange: (id: string) => void }
}
/** M204 (D08). What the ⋯ menu knows about a panel's task, asked when it opens. */
export type TaskMenuFact = { kind: 'none' } | { kind: 'one'; title: string; related: boolean } | { kind: 'many'; titles: string[] }
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
  /** null: no close control (the merged view's read-only geometry). */
  close: PanelFrameClose | null
  /** The terminal's enter animation, on the motion wrapper. */
  motion?: { entering: boolean; onEntryEnd: (id: string) => void }
  onSelect: (id: string, additive?: boolean) => void
  onBeginDrag: (state: DragState) => void
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  children: ReactNode
}

/** M69. The word a sessionless kind shows in its summary's state slot. */
const KIND_WORD: Record<Exclude<Panel['kind'], 'terminal'>, string> = { review: 'review', file: 'file', toolbox: 'toolbox', jira: 'Jira', github: 'GitHub', chat: 'chat', memory: 'memory', watcher: 'watcher', browser: 'browser', work: 'work', skill: 'skill', workflow: 'workflow', image: 'image', note: 'note' }

export function PanelFrame({
  id, kind, rect, z, selected, linkTarget, readOnly, className, rootAttrs, title, chrome, agentGlyph, agentState,
  close, motion, onSelect, onBeginDrag, onBeginLink, children, kindWord, state, far, onMore
}: PanelFrameProps): JSX.Element {
  // M233. Subscribed per panel id, so a frame re-renders for its OWN
  // arrivals and nobody else's — the same per-id discipline agent-state-store
  // uses, and the reason edge activity does not ride registry.version().
  const arriving = useEdgeArriving(id)
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
  const farBody: ReactNode | null = kind === 'terminal' ? null
    : detail === 'block' ? (
      <div className="pf__body pf__far pf__far--block" data-card-block data-tone={tone}>
        <div className="panel__card-block" data-tone={tone}><span className="panel__card-block-title">{title}</span></div>
      </div>
    ) : detail === 'summary' ? (
      <div className="pf__body pf__far" data-card-summary>
        <div className="panel__card-summary" data-tone={tone}>
          {/* M166. The kind's glyph, large: a light with a name. */}
          <span className="panel__card-summary-glyph" aria-hidden="true">{(() => { const G = KIND_GLYPH[kind as Exclude<Panel['kind'], 'terminal'>]; return G ? <G /> : null })()}</span>
          <div className="panel__card-summary-title">{title}</div>
          <div className="panel__card-summary-state" data-tone={tone}>{state?.word ?? kindWord ?? KIND_WORD[kind as Exclude<Panel['kind'], 'terminal'>]}</div>
          {far}
        </div>
      </div>
    ) : null
  const style: CSSProperties = { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }
  const beginMove = (event: ReactMouseEvent): void => {
    // Chrome selects, and starts a move. stopPropagation keeps the canvas
    // from reading this as a background click and deselecting;
    // preventDefault suppresses the native text-drag of the title.
    event.stopPropagation()
    event.preventDefault()
    onSelect(id, event.shiftKey)
    onBeginDrag({ panelId: id, mode: { kind: 'move' }, originRect: rect, originWorld: { x: event.clientX, y: event.clientY } })
  }
  const inner = (
    <>
      <header className="pf__chrome panel__chrome" onMouseDown={beginMove}>
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
        {/* M106. The title is what gives (see styles.css's header rule); the FULL
            title lives here and at the top of the ⋯ menu, never truncated to
            `Revie…` with nowhere to read the rest. */}
        <span className="pf__title panel__title" title={typeof title === 'string' ? title : undefined}>{title}</span>
        {/* M106. The one menu the frame grows: the full title, the kind, and the
            door to every verb the palette holds for this panel. */}
        <span className="pf__menu-host" ref={menuHostRef}>
          <button type="button" ref={menuButtonRef} className="pf__verb pf__verb--word pf__menu-open" data-panel-more aria-haspopup="menu" aria-expanded={menuOpen} title="More — the full title and every verb for this panel"
            {...shellControl(() => setMenuOpen((v) => !v))}>⋯</button>
          {menuOpen && (
            <div className="pf__menu" role="menu" ref={menuRef} data-panel-menu onMouseDown={(e) => e.stopPropagation()} onKeyDown={onMenuKey}>
              <div className="pf__menu-title" data-panel-menu-title>{title}</div>
              <div className="pf__note">{kind}</div>
              {/* M204 (D08). The contextual door onto the task verbs, on EVERY
                  member and not only the card. A panel in two tasks says so
                  and names both rather than choosing; a panel in none shows
                  no section — there is no task to act on, and an empty
                  heading on every menu of the canvas would be noise. */}
              {marks.task !== undefined && (() => {
                const t = marks.task.of(id)
                if (t.kind === 'many') return <p className="pf__note" data-panel-menu-task="many">part of {t.titles.length} tasks — {t.titles.join(' and ')}; act from a card</p>
                if (t.kind === 'none') return null
                const task = marks.task
                return (
                  <div className="pf__menu-task" data-panel-menu-task="one">
                    <div className="pf__note">task · {t.title}</div>
                    <button type="button" className="pf__verb pf__verb--word" role="menuitem" data-panel-menu-task-verb="show" title="Frame this task — nothing moves" {...shellControl(() => { setMenuOpen(false); task.show(id) })}>Show this task</button>
                    <button type="button" className="pf__verb pf__verb--word" role="menuitem" data-panel-menu-task-verb="related" title={t.related ? 'Turn the lens off' : 'Ring this task\'s panels and dim the rest — nothing moves'} {...shellControl(() => { setMenuOpen(false); task.related(id) })}>{t.related ? 'Stop showing related' : 'Show related'}</button>
                    <button type="button" className="pf__verb pf__verb--word" role="menuitem" data-panel-menu-task-verb="arrange" disabled={marks.readOnly} title={marks.readOnly ? 'the merged view is read-only' : 'Compact this task\'s panels in reading order, clear of everything else — one undo'} {...shellControl(() => { if (marks.readOnly) return; setMenuOpen(false); task.arrange(id) })}>Arrange this task</button>
                  </div>
                )
              })()}
              {/* M258. The frame's common actions, in the one menu: Fill view /
                  Restore size beside the palette's door. The header's icon
                  control stays as the contextual shortcut. */}
              {close !== null && (
                <button type="button" role="menuitem" className="pf__verb pf__verb--word" data-panel-menu-maximise={mark?.maximised ? 'restore' : 'maximise'} disabled={marks.readOnly}
                  title={marks.readOnly ? 'the merged view is read-only' : mark?.maximised ? 'Restore this panel to where it was' : 'Fill the view with this panel'}
                  {...shellControl(() => { if (marks.readOnly) return; setMenuOpen(false); (mark?.maximised ? marks.restore : marks.maximise)(id) })}>{mark?.maximised ? 'Restore size' : 'Fill view'}</button>
              )}
              {more !== undefined && <button type="button" role="menuitem" className="pf__verb pf__verb--word" data-panel-menu-palette title="Every verb for this panel, in the palette" {...shellControl(() => { setMenuOpen(false); more(id) })}>Verbs in ⌘K…</button>}
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
      {farBody}
      {/* Mounted under every tier and hidden under the far ones: a body
          subtree can hold a draft (a Jira comment), and unmounting it on a
          zoom would discard typed work with no sign (M69's verifier). */}
      <div className="pf__keep" hidden={farBody !== null}>{children}</div>
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
      // M233. A join arrival landed HERE. It flashes `.pf::before` — M109's
      // state-edge glow — rather than adding a second mechanism for
      // "something reached me": the flash inherits that pseudo-element's
      // clipping and its pointer-events: none for free, and one element
      // cannot contradict itself about which edge of the frame means what.
      data-edge-arriving={arriving ? '' : undefined}
      // M204 (D08). The task lens, as an ATTRIBUTE the stylesheet paints —
      // opacity and an outline, neither of which is layout.
      data-task-lens={marks.lens === undefined || marks.lens === null ? undefined : marks.lens.has(id) ? 'member' : 'other'}
      {...(rootAttrs ?? {})}
    >
      {motion ? (
        /* Motion lives on this wrapper, never .panel: .panel's geometry rides
           .world and the viewport checks read that transform as a matrix. */
        <div
          className={`pf__motion panel__motion${motion.entering ? ' panel__motion--entering' : ''}`}
          onAnimationEnd={(event) => { if (event.animationName === 'panel-enter') motion.onEntryEnd(id) }}
        >
          {inner}
        </div>
      ) : inner}
    </div>
  )
}
