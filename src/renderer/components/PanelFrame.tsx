import { useContext, type CSSProperties, type JSX, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { CardDetailContext } from './card-detail-context'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { WorldRect } from '@renderer/canvas/viewport'
import type { Panel } from '@renderer/panels/panels'
import type { PanelStateWord } from '@renderer/panels/panel-state'
import type { AgentState } from '@shared/types'
import { PanelPorts } from './PanelPorts'
import { Close, KIND_GLYPH } from '@renderer/icons'

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

export interface PanelFrameProps {
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
const KIND_WORD: Record<Exclude<Panel['kind'], 'terminal'>, string> = { review: 'review', file: 'file', toolbox: 'toolbox', jira: 'Jira', chat: 'chat', memory: 'memory', watcher: 'watcher' }

export function PanelFrame({
  id, kind, rect, z, selected, linkTarget, readOnly, className, rootAttrs, title, chrome, agentState,
  close, motion, onSelect, onBeginDrag, onBeginLink, children, kindWord, state, far
}: PanelFrameProps): JSX.Element {
  // M73. The tone every mark below reads: a terminal's rides rootAttrs, a
  // process kind's is its state's, a document kind's is `kind`.
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
        <div className="panel__card-summary">
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
          <span className="pf__state status-dot" data-agent-state={agentState ?? 'none'} data-tone={rootAttrs?.['data-tone'] ?? 'kind'} aria-hidden="true" />
        ) : (
          /* M66. A grey dot on a kind that has no state read as a state
             nobody could name (M66's critic); the kind's own glyph, the one
             the rail row shows, says what the panel is instead. */
          <span className="pf__state pf__state--kind" data-tone="kind" aria-hidden="true">{(() => { const G = KIND_GLYPH[kind]; return <G /> })()}</span>
        )}
        <span className="pf__title panel__title">{title}</span>
        {chrome}
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
