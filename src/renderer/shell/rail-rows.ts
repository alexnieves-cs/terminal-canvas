import { workflowWatchLabel } from '@renderer/workflow/workflow-diagram'
import { isSkillPanel, isWorkflowPanel, isWorkPanel, isBrowserPanel, isWatcherPanel, isMemoryPanel, isFilePanel, isGithubPanel, isJiraPanel, isReviewPanel, isToolboxPanel, isChatPanel, isTerminalPanel, type Panel } from '@renderer/panels/panels'
import { browserHost } from '@shared/browser-panel'
import type { PanelStatus } from '@renderer/session/panel-session'
import { panelState, type StateInput } from '@renderer/panels/panel-state'
import type { WorkItemState } from '@shared/work-items'

/**
 * What the rail's Panels section renders, as plain data.
 *
 * Pure by construction — no React, no DOM, no registry reference — for the
 * same reason palette/commands.ts is: it puts the two pieces of this milestone
 * most able to be subtly wrong (the honest chain and the signature) in the
 * cheapest verify tier the repo has, and it means the rail's row logic can be
 * asserted without mounting anything.
 */

export interface RailRow {
  id: string
  /** M92. Layout marks, absent unless set. */
  locked?: boolean
  pinned?: boolean
  /** The honest chain's answer. See railLabel. */
  label: string
  /**
   * The state WORD with no agent state applied — `asleep`, `not started`,
   * `running`, `exited 1`, or the kind. See railTail. The row component
   * re-derives the word with the agent state it subscribes to (M63), so a
   * `running` row reads `working`/`idle`/`needs you` on screen.
   */
  tail: string
  /** Drives the start control, which is the ONLY way the rail wakes a panel. */
  dormant: boolean
  /** M63. What panelState needs, so the row can apply the agent state itself. */
  state: StateInput
}

/**
 * The same four links TerminalPanel's header walks, most specific first.
 *
 * The second link is the one that matters and the one that is easy to drop:
 * `status.command` is what main ACTUALLY spawned, and for a login-shell panel
 * `spec.command` is ABSENT — only main can name the user's shell — so without
 * it every default panel in the rail would read "login shell" while the panel's
 * own header reads `/bin/zsh`. Two labels for one panel, differing only in the
 * common case.
 *
 * The resolved command is deliberately NOT copied back into PanelSpec. Doing so
 * would make this a fifth place M5a's absent-command rule can be lost, and
 * every command-less preset would start spawning a hardcoded shell.
 */
export function railLabel(
  panel: Panel,
  status: PanelStatus | undefined,
  /**
   * M132. A workflow trigger's template name, by template id — so a watcher
   * whose command is `/usr/bin/true` (main's arming needs one) reads as the
   * WORKFLOW it runs and not as a binary nobody typed. OPTIONAL and
   * defaulted, the trade every parameter added to this family has made:
   * absent means "nobody asked", which `workflowWatchLabel` says as `a
   * workflow` rather than guessing the template is gone.
   */
  templateNameOf?: (templateId: string) => string | undefined
): string {
  // M116. A work card reads `work · <title>` with the KIND first, before the
  // title rule below: its title is the item's, and the chat dispatched on
  // that item carries the same words, so a rail of cards and lanes would be
  // two rows with one label and nothing saying which is the conversation.
  if (isWorkPanel(panel)) return panel.title === undefined ? 'work' : `work · ${panel.title}`
  // M127. Same rule as panel-name.ts's — one label for one panel.
  if (isSkillPanel(panel)) return panel.title ?? `skill · ${panel.skill.name}`
  // M132. The workflow panel names its template, the work card's own shape.
  if (isWorkflowPanel(panel)) return panel.title === undefined ? 'workflow' : `workflow · ${panel.title}`
  // The user's own title is the first link for BOTH kinds — it is the one
  // link the user chose.
  if (panel.title !== undefined) return panel.title
  // A review node names its SUBJECT. The label is the snapshot taken when
  // the node was created (see ReviewSubject): the subject panel may be gone,
  // and re-deriving from a live lookup here is exactly what would blank the
  // row at the moment the node is most useful.
  if (isReviewPanel(panel)) return `review: ${panel.subject.label}`
  // A file panel names its FILE. Same split as the review branch above: the
  // basename, not the whole path, because a 260px row cannot hold one and the
  // directory is the inspector's job.
  if (isFilePanel(panel)) return panel.source.path.slice(panel.source.path.lastIndexOf('/') + 1)
  if (isJiraPanel(panel)) return 'Jira tickets'
  if (isGithubPanel(panel)) return 'GitHub work'
  // A toolbox node names its DIRECTORY by basename, the same split the file
  // branch above makes and for the same reason: a 260px row cannot hold a
  // path, and the full cwd is the inspector's job.
  if (isToolboxPanel(panel)) {
    const cwd = panel.source.cwd.replace(/\/+$/, '')
    return `toolbox · ${cwd.slice(cwd.lastIndexOf('/') + 1) || cwd}`
  }
  // M83. The memory node reads by what it remembers, the same split.
  if (isMemoryPanel(panel)) {
    const root = panel.source.root.replace(/\/+$/, '')
    return `memory · ${root.slice(root.lastIndexOf('/') + 1) || root}`
  }
  // M84. A watcher reads by what it RUNS: the command is what the user named
  // it in their head, and the trigger is the row's trailing phrase — a row
  // that led with the trigger would sort every watcher under `on`.
  if (isWatcherPanel(panel)) {
    // M132. A workflow trigger names its WORKFLOW; the binary main's arming
    // needs is not what this watcher is for.
    if (panel.watch.templateId !== undefined) {
      return `watcher · ${workflowWatchLabel(templateNameOf === undefined ? null : templateNameOf(panel.watch.templateId))}`
    }
    const command = panel.watch.command.replace(/\/+$/, '')
    return `watcher · ${command.slice(command.lastIndexOf('/') + 1) || command}`
  }
  // M103. A browser panel reads by its HOST — the one part of a URL a row
  // can hold, and the part a person scans for (`localhost:3000` beside the
  // terminal that started it). The full url is the inspector's identity.
  if (isBrowserPanel(panel)) return `browser · ${browserHost(panel.url)}`
  // M73. The same split as the toolbox, for the same 260px reason.
  if (isChatPanel(panel)) {
    const cwd = panel.chat.cwd.replace(/\/+$/, '')
    return `chat · ${cwd.slice(cwd.lastIndexOf('/') + 1) || cwd}`
  }
  return (status?.kind === 'running' ? status.command : undefined)
    ?? panel.spec.command
    ?? 'login shell'
}

/**
 * The row's right-hand tail.
 *
 * `dormant` is tested FIRST and outranks the status kind. A dormant panel's
 * status is {kind:'idle'}, so a status-first implementation would render
 * "not started" — true, and useless: "dormant" is the word the panel's own card
 * uses, and it is what tells the user the start control on this row exists.
 *
 * The exited case is a template rather than a truthiness test on purpose.
 * `code` is 0 for a successful exit, the single most common exit there is, and
 * `code || ...` would print the wrong tail for exactly it.
 *
 * `kind` is defaulted to `'terminal'` so the pre-M9b two-argument call —
 * every existing `verify:rail` fixture, checks 5–9 included — keeps compiling
 * and keeps meaning what it meant.
 */
/**
 * What a rail row's TAIL says, which is a display vocabulary rather than the
 * panel union's own. It is `Panel['kind']` plus M27's `note` — a note is a
 * file panel carrying `source.prose`, so it has no `kind` of its own and
 * never should: making it one would move `isTerminalPanel`, both `nextIdRef`
 * regexes, five dispose guards and three store clears to express a difference
 * that is entirely in how the panel is painted.
 */
export type RailTailKind = Panel['kind'] | 'note'

export function railTail(status: PanelStatus | undefined, dormant: boolean, kind: RailTailKind = 'terminal'): string {
  // M63. One vocabulary: panelState is the only place a state word is
  // spelled. With no agent state a running process reads `running`; the row
  // component supplies the agent's word from its own subscription.
  return panelState({ kind, status, dormant }, undefined).word
}

/**
 * Array order, never Panel.z. Stacking is z and the array's order is
 * deliberately not (panels.ts says why); there is no reason for the rail to
 * invent a second answer to what order means, and sorting here would also make
 * every raise reorder a keyed list.
 *
 * The object literal's KEY ORDER is load-bearing, because railSignature below
 * serialises these rows: JSON.stringify preserves insertion order, so building
 * a row's fields in a different order in a later edit would change every
 * signature at once. Harmless in itself — the rows rebuild — but it means this
 * literal is not free to be reshuffled for tidiness.
 */
export function buildRailRows(
  panels: readonly Panel[],
  statusOf: (id: string) => PanelStatus | undefined,
  dormantIds: ReadonlySet<string>,
  /**
   * M116. A work card's item state by item id, so its row and its minimap
   * block speak the item's word. OPTIONAL and defaulted to nothing — every
   * older caller and check keeps its meaning — and absent (the record gone)
   * reads as the kind.
   */
  workStateOf?: (itemId: string) => WorkItemState | undefined,
  /** M132. Passed through to `railLabel` — see its own parameter. */
  templateNameOf?: (templateId: string) => string | undefined
): RailRow[] {
  return panels.map((panel) => {
    const id = panel.rect.id
    const status = statusOf(id)
    // Neither sessionless kind is ever dormant: the rail's start control
    // renders on dormant rows only, and a review node or a file panel
    // reporting dormant would offer a "start" arrow for a panel with nothing
    // to start — a visible control that cannot work.
    const dormant = isTerminalPanel(panel) ? dormantIds.has(id) : false
    // A prose file panel reports the display kind `note`. Derived HERE rather
    // than inside railTail, which is handed a kind and not a panel — and which
    // several callers reach with nothing else in hand.
    const tailKind: RailTailKind =
      isFilePanel(panel) && panel.source.prose === true ? 'note' : panel.kind
    // M116. The item's state rides the row's StateInput — present only when
    // the record is, so an older row's shape (and signature) is unchanged.
    const workState = isWorkPanel(panel) && workStateOf !== undefined ? workStateOf(panel.work.itemId) : undefined
    const state: StateInput = { kind: tailKind, status, dormant, ...(workState === undefined ? {} : { work: { state: workState } }) }
    // M92. The marks, absent unless set, so a plain row's shape is unchanged.
    return { id, label: railLabel(panel, status, templateNameOf), tail: workState === undefined ? railTail(status, dormant, tailKind) : panelState(state, undefined).word, dormant, state, ...(panel.locked === true ? { locked: true } : {}), ...(panel.pinned === true ? { pinned: true } : {}) }
  })
}

/**
 * The whole reason this module is not just a `.map()` in Canvas.tsx.
 *
 * `panels` is a fresh array on every setPanelRect — i.e. every frame of a drag
 * — and the palette's escape hatch for exactly this (key the memo on
 * `palette.open`, read out of panelsRef) has no equivalent here. Note the
 * reason, because the obvious one is wrong: the rail DOES collapse
 * (shell.railOpen, Cmd+\, the 22px strip). But Canvas renders <SideRail>
 * unconditionally and the collapse is a CSS class — .shell--rail-collapsed
 * narrows the region and display:none's .rail-list — so every row stays
 * mounted and reconciled while the user cannot see one, and a memo keyed on
 * railOpen would be keyed on a value that changes nothing about what React
 * has to build. So Canvas rebuilds the rows every render and freezes their
 * ARRAY IDENTITY on this string: a drag moves rects, the signature is
 * byte-identical, and memo'd SideRail/RailPanelRow re-render nothing.
 *
 * It is JSON.stringify over the ROWS rather than a hand-rolled concatenation
 * of their inputs, and both halves of that matter. Over the rows, so "the
 * signature covers exactly what a row renders" is structurally true rather
 * than dependent on someone remembering to add a field. And JSON rather than
 * `a + '|' + b`, because a label is USER TEXT: with an ordinary separator a
 * title containing it could forge a field boundary and make two genuinely
 * different lists produce one string, freezing the rail on stale rows for the
 * users whose titles happen to contain that character and nobody else. JSON
 * escapes quotes and needs no separator to be chosen at all.
 *
 * Agent state is deliberately absent from RailRow and therefore from this
 * signature: each row subscribes useAgentState(id) individually, so a bell on
 * n3 re-renders one row rather than moving a signature that rebuilds the list.
 */
export function railSignature(rows: readonly RailRow[]): string {
  return JSON.stringify(rows)
}

/**
 * M105. THE LAST LINE SAID — the transcript's last complete text block's last
 * non-empty line, one line, ellipsised from the RIGHT (prose, not a path).
 * The same content in both front-ends of a CONVERSATION; a terminal's
 * scrollback is not one, so a terminal row carries none.
 */
export const LAST_LINE_MAX = 96

export function lastLineOf(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  const last = lines[lines.length - 1] ?? ''
  return last.length > LAST_LINE_MAX ? `${last.slice(0, LAST_LINE_MAX - 1)}…` : last
}

/**
 * M105. The dock's two capsules: how many chats are LIVE (a turn streaming)
 * and how many are QUIET (ready, or asleep with a history). Terminals are
 * counted by neither — their liveness is the pill's, and the attention badge
 * already counts what needs a person.
 */
export function railCapsules(rows: readonly { id: string; kind: string; state: StateInput }[]): { live: number; quiet: number; liveWord: string; quietWord: string } {
  let live = 0, quiet = 0
  for (const r of rows) {
    const chat = r.state.kind === 'chat' ? r.state.chat : undefined
    if (r.kind !== 'chat' || chat === undefined) continue
    if (chat.status === 'streaming' || chat.status === 'starting') live += 1
    else if (chat.status === 'ready' || (chat.status === 'not-started' && chat.hasHistory === true)) quiet += 1
  }
  return { live, quiet, liveWord: `${live} live`, quietWord: `${quiet} quiet` }
}

/**
 * M107. THE THREAD HEADER reads on from the mark: folder · branch · engine ·
 * model. Every absent piece is absent — never `undefined`, never a
 * placeholder that reads as a value.
 */
/** M120. The folder piece of a sandboxed chat: the app's directory name would read as a project the user never chose. */
export const SANDBOX_HEADER = 'sandboxed · no folder'

export function chatHeaderLine(input: { cwd: string; branch?: string; backend: string; model?: string; sandbox?: boolean }): string {
  const folder = input.sandbox === true ? SANDBOX_HEADER : (input.cwd.replace(/\/+$/, '').split('/').filter((p) => p !== '').slice(-1)[0] ?? '/')
  return [folder, input.branch, input.backend, input.model].filter((p): p is string => typeof p === 'string' && p !== '').join(' · ')
}
