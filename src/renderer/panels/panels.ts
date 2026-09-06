import { carryChatMarks } from '@shared/chat-panel'
import { carryBackend } from '@shared/agent-backends'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { WatchTrigger } from '@shared/watch-trigger'
import type { ChatSource } from '@shared/chat-panel'
import type { Point, WorldRect } from '@renderer/canvas/viewport'
import type { ReviewSubject } from '@shared/review'
import type { FileSource } from '@shared/file-panel'
import type { ToolboxSource, ToolScope } from '@shared/toolbox'
import type { LinkAutomation } from '@shared/handoff'

export type { ReviewSubject }

/**
 * A directed link from the panel HOLDING it to the panel it names.
 *
 * Adjacency on the SOURCE rather than a top-level array, and that choice is
 * what keeps History<Panel[]> — and therefore Canvas.tsx's commitHistory and
 * applyHistory, the two functions in this app carrying the loudest caveat
 * there is — completely untouched: a link rides Panel, so undo and redo work
 * with no changes to either. The usual objection to storing a relation on one
 * endpoint is that the endpoint is arbitrary; it is not arbitrary here,
 * because the link is DIRECTED (the arrowhead is at `to`), which makes the
 * source a real owner rather than a coin toss.
 *
 * Called `link`, never `edge`: EdgeIndicators.tsx and viewport.ts's
 * edgeIndicator already mean the off-screen attention pip, and a second
 * unrelated `edge` in renderer/canvas/ would make every future grep ambiguous
 * between two features with nothing to do with each other. Backlog #24 calls
 * these edges; this is the same feature under a name that is still free.
 */
export interface PanelLink {
  /** The panel this points AT. The panel holding it is the source. */
  to: string
  /** What the user says it means. Absent until they say — links start bare. */
  label?: string
  /**
   * The one functional action #24 ships. Kept on the directed relation it
   * belongs to: one source/target pair can have at most one restart rule, so
   * inventing an id and a second collection would only create two ways to say
   * the same thing. `enabled` is explicit because a rule that can fire while
   * its owner is away must have a visible, durable off switch.
   */
  automation?: LinkAutomation
}

export interface PanelBase {
  rect: WorldRect
  /** M92. Drag and resize refuse; close still arms. Absent unless set. */
  locked?: true
  /** M92. Kept live by assignTiers, counted inside the budget. Absent unless set. */
  pinned?: true
  /** M92. Filling the viewport, with the rect to go back to. Cleared by the first move or resize. */
  maximised?: { restore: WorldRect }
  /**
   * Paint order, rendered as style.zIndex. Stacking is NOT the array's order:
   * React reconciles a reordered keyed list by MOVING DOM nodes, and a move is
   * remove-then-insert, which would momentarily detach the subtree holding a
   * live terminal's host and its WebGL context. M3's eviction proves a
   * deliberate detach is survivable — dispose the addon, refresh on the way
   * back — but an incidental detach triggered by clicking an unrelated panel
   * does none of that. Keeping array order stable means React never moves
   * those nodes at all.
   */
  z: number
  /**
   * A name the user typed. Optional because most panels never get one, and
   * because the fallback chain below it (resolved command, then "login shell")
   * is what an unnamed panel is supposed to show — see TerminalPanel's header.
   *
   * It lives on Panel rather than PanelSession because it is layout, not
   * session state: it survives a relaunch, it belongs to the id rather than to
   * the process, and a panel that has never spawned can still have one.
   */
  title?: string
  /**
   * Outgoing links. OPTIONAL, and absent means none — which is every panel in
   * every layout.json ever written and every panel this app mints, so a reader
   * that treated absence as anything but "no links" would be wrong about the
   * common case. Read it through linksOf, never directly, so the absence is
   * normalised in exactly one place: a missed `?? []` is a TypeError inside a
   * render, which takes the whole canvas down rather than one link.
   */
  links?: PanelLink[]
}

/**
 * A panel with a PTY behind an xterm — what `Panel` meant on its own until
 * M9b.
 */
export interface TerminalPanel extends PanelBase {
  kind: 'terminal'
  spec: PanelSpecTemplate
  /** M49. A per-panel font size overriding the global setting. Absent means the global. */
  fontSize?: number
}

/**
 * A non-terminal panel: a rendered review of what one agent changed.
 *
 * It has no spec, and that absence is the point rather than an omission —
 * there is nothing to spawn, so it never reaches assignTiers, never reaches
 * registry.ensure, and can take neither a LIVE_BUDGET slot nor a WebGL
 * context. Canvas.tsx partitions on kind BEFORE tiering so that is
 * structurally true rather than merely unasked-for.
 */
export interface ReviewPanel extends PanelBase {
  kind: 'review'
  subject: ReviewSubject
}

/**
 * A local file rendered on the canvas, watched by main.
 *
 * The SECOND sessionless kind, and its arrival is what forces isTerminalPanel
 * below to exist. Like a review node it has no spec, so it never reaches
 * assignTiers, never reaches registry.ensure, and can take neither a
 * LIVE_BUDGET slot nor a WebGL context — structurally, via Canvas.tsx's
 * partition, rather than by a guard anyone has to remember.
 */
export interface FilePanel extends PanelBase {
  kind: 'file'
  source: FileSource
}

/** Jira's first concrete panel. It deliberately carries no provider machinery:
 * the next provider decides what, if anything, generalises. */
export interface JiraPanel extends PanelBase { kind: 'jira' }
/** M88. The GitHub work panel — the ninth kind, the second work panel, sessionless like Jira's. */
export interface GithubPanel extends PanelBase { kind: 'github' }

/**
 * A toolbox node: what the agent in one DIRECTORY can actually do — skills,
 * slash commands, subagents, MCP servers, hooks and permission counts.
 *
 * Addressed by CWD rather than by a subject panel id, the same decision
 * `ReviewSubject` made for the same reason: a node must keep answering after
 * the panel that prompted it is closed, and "what is installed for this
 * directory" is a fact about the directory. It also means twelve panels in one
 * repository share one answer.
 *
 * Holds no PanelSession and no process, exactly like a review node and a file
 * panel — see isTerminalPanel below, the ONE line that keeps that true.
 */
export interface ToolboxPanel extends PanelBase {
  kind: 'toolbox'
  source: ToolboxSource
}

/**
 * M83. The project memory — the SEVENTH kind, and a document one: what this
 * repository has decided, tried and failed. Sessionless like the review,
 * file, Jira and toolbox nodes: no spec, so it never reaches assignTiers,
 * registry.ensure or the live budget.
 */
export interface MemoryPanel extends PanelBase {
  kind: 'memory'
  source: { root: string }
}

/**
 * M73. A conversation with an agent — the SIXTH kind, and the first that is
 * a process node without being a terminal. Its process is main's
 * (`AgentSessionManager`), addressed by this panel's id; the renderer holds a
 * per-panel store mirror, never a session. No spec, so it never reaches
 * assignTiers or registry.ensure — isTerminalPanel's sixth clause is the one
 * line that keeps that structural.
 */
export interface ChatPanel extends PanelBase {
  kind: 'chat'
  chat: ChatSource
}

/**
 * M84. A watcher — the EIGHTH kind, and the second process node that is not a
 * terminal. Its process is main's (`watch-runner.ts`), addressed by this
 * panel's id, and it has no spec: like the chat panel it never reaches
 * assignTiers, `registry.ensure` or the live budget, and isTerminalPanel's
 * seventh clause is the one line that keeps that structural rather than
 * remembered.
 */
export interface WatcherPanel extends PanelBase {
  kind: 'watcher'
  /** `armed` ABSENT means armed — the ordinary case and every pre-toggle file. */
  watch: { cwd: string; command: string; args: string[]; trigger: WatchTrigger; armed?: false }
}

/**
 * M103. The browser pane — the ELEVENTH kind, a document kind whose
 * document is a live page in a guest process. Sessionless: no spec, so it
 * never reaches assignTiers, registry.ensure or the live budget, and
 * isTerminalPanel's clause below is the one line that keeps that
 * structural. The record holds the page it opens to; the ADDRESS BAR reads
 * the guest's own `getURL()` and never this field or the page's title.
 */
export interface BrowserPanel extends PanelBase {
  kind: 'browser'
  url: string
}

/**
 * M116. The work card — the TWELFTH kind, sessionless like Jira's: the
 * board's row in the world. It carries the item's id alone; the record
 * (title, state, teammate, lane, PR) lives on the workspace's workItems list
 * and the card looks it up at render, so a card can never disagree with the
 * board. Sessionless: no spec, so it never reaches assignTiers, and
 * isTerminalPanel's clause below is what keeps that structural.
 */
export interface WorkPanel extends PanelBase {
  kind: 'work'
  work: { itemId: string }
}

/**
 * M127. The skill panel — the THIRTEENTH kind, sessionless like the work
 * card. `scope` and `name` and nothing else: everything on screen (the
 * frontmatter, the capped SKILL.md text, the resource count, the
 * `alsoDefinedIn` link, which panels can see it, a plugin's details) is read
 * LIVE from the toolbox inventory, because a copy is a second author that
 * goes stale silently. Sessionless: no spec, so it never reaches
 * assignTiers, and isTerminalPanel's clause below is what keeps that
 * structural.
 */
export interface SkillPanel extends PanelBase {
  kind: 'skill'
  skill: { scope: ToolScope; name: string }
}

export type Panel = MemoryPanel | TerminalPanel | ReviewPanel | FilePanel | JiraPanel | GithubPanel | ToolboxPanel | ChatPanel | WatcherPanel | BrowserPanel | WorkPanel | SkillPanel

/**
 * The only kind test written against a `Panel` anywhere, and it is
 * deliberately positive. (Other reads of a `kind` field exist and are not
 * this: `layout-schema.ts` and `layout-adapt.ts`'s toPanels branch on the
 * PERSISTED record on the way in from disk, before a `Panel` exists at all;
 * `Inspector.tsx` branches on `InspectorModel.kind`, an already-built view
 * model; and `railTail` branches on a bare `Panel['kind']` argument it was
 * handed. Nothing but this function asks a live `Panel` what it is.)
 *
 * Never write `kind === 'terminal'` anywhere: `kind` is absent in every
 * layout.json written before M9b (see parsePanel) and in every verify
 * fixture written before it, and both must keep meaning "terminal". Asking
 * only whether something IS a review node makes the default fall the safe
 * way everywhere at once — a terminal panel misread as a review node stops
 * spawning silently on a restored canvas, while a review node misread as a
 * terminal fails loudly the first time anything reads its absent spec.
 */
export function isReviewPanel(panel: Panel): panel is ReviewPanel {
  return panel.kind === 'review'
}

export function isFilePanel(panel: Panel): panel is FilePanel {
  return panel.kind === 'file'
}
export function isJiraPanel(panel: Panel): panel is JiraPanel { return panel.kind === 'jira' }
export function isGithubPanel(panel: Panel): panel is GithubPanel { return panel.kind === 'github' }

export function isMemoryPanel(panel: Panel): panel is MemoryPanel {
  return panel.kind === 'memory'
}

export function isToolboxPanel(panel: Panel): panel is ToolboxPanel {
  return panel.kind === 'toolbox'
}

export function isChatPanel(panel: Panel): panel is ChatPanel {
  return panel.kind === 'chat'
}

export function isWatcherPanel(panel: Panel): panel is WatcherPanel {
  return panel.kind === 'watcher'
}

export function isBrowserPanel(panel: Panel): panel is BrowserPanel {
  return panel.kind === 'browser'
}

export function isWorkPanel(panel: Panel): panel is WorkPanel {
  return panel.kind === 'work'
}

export function isSkillPanel(panel: Panel): panel is SkillPanel {
  return panel.kind === 'skill'
}

/**
 * The partition test, and the reason it is spelled as a negation of the known
 * non-terminal kinds rather than as `kind === 'terminal'`.
 *
 * Canvas.tsx spelled "is a terminal panel" as `!isReviewPanel(p)` until M16,
 * and that was correct with exactly one non-terminal kind. With two it is
 * wrong in the DANGEROUS direction: a file panel satisfies !isReviewPanel,
 * lands in terminalPanels, reaches assignTiers and registry.ensure with no
 * spec, and mints a PanelSession for a <pre> — burning a LIVE_BUDGET slot and
 * a WebGL context on a panel that has no process.
 *
 * Written this way rather than as a positive `kind === 'terminal'` test
 * because absence must keep meaning terminal: `kind` is absent in every
 * layout.json written before M9b and in every verify fixture written before
 * it. A FIFTH kind edits exactly this one line — M21's toolbox panel was the
 * fourth, and it is the reason this sentence now says five.
 */
export function isTerminalPanel(panel: Panel): panel is TerminalPanel {
  return (
    !isReviewPanel(panel) && !isFilePanel(panel) && !isJiraPanel(panel) && !isGithubPanel(panel) && !isToolboxPanel(panel) &&
    !isMemoryPanel(panel) &&
    !isChatPanel(panel) && !isWatcherPanel(panel) && !isBrowserPanel(panel) && !isWorkPanel(panel) &&
    // M127. The thirteenth kind joins the partition HERE, and forgetting it
    // is the dangerous direction: a skill panel satisfying isTerminalPanel
    // reaches assignTiers and registry.ensure with no spec at all.
    !isSkillPanel(panel)
  )
}

export const PANEL_W = 720
export const PANEL_H = 460

/**
 * `command` is deliberately omitted, not defaulted here. The renderer cannot
 * see the login shell: electron-vite compiles `process.env` in the renderer
 * bundle down to `{}`, so `process.env.SHELL` is always `undefined` and any
 * fallback beside it becomes the only branch that ever runs — a bash or fish
 * user would silently get zsh. An absent command means "the login shell", and
 * main fills it in from the environment it already probed. See PanelSpec.
 */
const shell = (panelId: string, cwd = '~'): PanelSpecTemplate => ({
  panelId,
  cwd,
  args: ['-l']
})

/**
 * Scattered well outside the initial viewport, exactly as M2's placeholders
 * were: panning to find something stays testable by hand, and culling has
 * something to cull.
 *
 * Goes through a small local helper rather than twelve edited literals, so
 * the coordinates verify:panels' fixtures depend on cannot be disturbed by
 * the M9b `kind` edit.
 */
const seed = (id: string, x: number, y: number, z: number): TerminalPanel => ({
  kind: 'terminal',
  rect: { id, x, y, w: PANEL_W, h: PANEL_H },
  spec: shell(id),
  z
})

export const SEED_PANELS: Panel[] = [
  seed('s01', 0, 0, 1), seed('s02', 800, 0, 2), seed('s03', 1600, 0, 3),
  seed('s04', 0, 540, 4), seed('s05', 800, 540, 5), seed('s06', 1600, 540, 6),
  seed('s07', -900, 270, 7), seed('s08', -900, 810, 8), seed('s09', 2500, 270, 9),
  seed('s10', 400, 1100, 10), seed('s11', 1200, 1100, 11), seed('s12', 400, -640, 12)
]

/** The id the single first-run panel gets. Kept out of the `n` sequence Cmd+N uses. */
export const FIRST_RUN_ID = 'p1'

/**
 * What a fresh install — or a canvas that was reset — opens with: NOTHING.
 *
 * M48. An empty canvas is a designed state: Canvas renders the launcher over
 * it, made of the real create verbs, so a first panel is minted the way every
 * later one is. The placeholder panel this used to mint was SEED_PANELS with a
 * nicer name, and it taught nothing. Kept as a function so both call sites
 * (mount and reset) read the same decision. SEED_PANELS' twelve scattered
 * entries stay put as verify fixture data, which is what they always were.
 */
export function firstRunPanels(): Panel[] {
  return []
}

/**
 * Cmd+N, and every preset spawn: a panel centred on the point it is given, on
 * top. That point is USUALLY where the camera is looking, but not always —
 * Canvas.tsx runs it through cascadeCentre (below) first, which steps it off
 * an already-occupied slot. Placement deliberately does not live here:
 * makePanel has no panel list and no business gaining one, and
 * verify:viewport 48 pins exact centring as this function's contract.
 *
 * `spec` and `size` are optional so the no-preset call is unchanged. An absent
 * spec means the login shell, and note that `shell(id)` omits `command`
 * entirely rather than defaulting it — see the note above on why the renderer
 * must never resolve one.
 */
export function makePanel(
  id: string,
  centre: Point,
  z: number,
  spec?: Omit<PanelSpecTemplate, 'panelId'> & { panelId?: string },
  size?: { w?: number; h?: number }
): TerminalPanel {
  const w = size?.w ?? PANEL_W
  const h = size?.h ?? PANEL_H
  return {
    kind: 'terminal',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    // panelId is forced to the minted id: a template carrying a stale one
    // would give two panels the same session, which registry.ensure resolves
    // by returning the FIRST — so both render one handle.host and one silently
    // disappears. Same failure parseLayout's duplicate-id check exists for.
    spec: spec ? { ...spec, panelId: id } : shell(id),
    z
  }
}

/**
 * World units, +x and +y per step. 48 clears the ~30px `.panel__chrome`
 * (7px padding, 12px text, a 1px border), so every panel in a stack shows its
 * whole header — its title AND its close button — plus a sliver of terminal.
 *
 * Down-RIGHT rather than up-left, and that is not arbitrary: the new panel
 * takes `nextZ` and paints on top, so stepping down-right is what leaves the
 * OLDER panel's chrome uncovered. Up-left would lay the new chrome straight
 * over the old one and reveal nothing.
 */
export const CASCADE_STEP = 48

/**
 * Half a world pixel — deliberately NOT a "looks stacked" radius.
 *
 * Every coincidence this app can actually produce is EXACT: two Cmd+N presses
 * at an unmoved camera both come from the same `screenToWorld(centre,
 * viewportRef.current)`, so they agree bit for bit. The epsilon exists only so
 * the comparison survives recovering a centre as `rect.x + w / 2` from a rect
 * makePanel built as `centre.x - w / 2`. Widening it into a fuzzy radius
 * re-introduces the overlap rule cascadeCentre exists to avoid (see its note),
 * through the back door.
 *
 * Max-norm rather than Euclidean, because the step is axis-aligned.
 */
export const CASCADE_EPSILON = 0.5

/**
 * The same ceiling as lod.ts's LIVE_BUDGET, and for the same reason: more than
 * eight simultaneously live stacked panels is not a state worth cascading for.
 *
 * The bound itself is load-bearing. Worst case is 8 x 48 = 384 world px, which
 * keeps the deepest slot inside the cull region at EVERY scale — at MAX_SCALE
 * (3) in a 900px window the cull rect's half-height is 150 + CULL_MARGIN_PX / 3
 * = 230 world px, and the deepest panel's top edge is 384 - PANEL_H / 2 = 154.
 * Marching past this instead of wrapping is a worse failure than the stacking
 * it replaces: a panel outside the cull region is never promoted, so it never
 * spawns a PTY, and Cmd+N appears to do nothing at all.
 */
export const CASCADE_MAX_STEPS = 8

/**
 * Where a new panel actually goes: `centre`, unless a panel is ALREADY centred
 * there, in which case it steps down-and-right until it finds a free slot.
 *
 * The defect this fixes is indistinguishability, not overlap. Before it, N
 * presses of Cmd+N at one camera produced N byte-identical rects: the canvas
 * looked like it held one panel, and the buried ones could not be closed
 * (their close buttons were underneath) while each still held a WebGL context
 * and a LIVE_BUDGET slot.
 *
 * The test is therefore panel CENTRES, never rect overlap. Overlap is the
 * normal state of a working canvas — two 720x460 panels can barely both be on
 * screen without touching — so an overlap rule would step nearly every press
 * away from where the user is looking, which is the one thing Cmd+N promises.
 * Perfect coincidence is the only state with no visual evidence at all.
 *
 * Collision-based rather than a spawn counter, and that buys three things a
 * counter cannot: it self-resets (pan somewhere empty and the next panel is
 * centred again), it FILLS GAPS (close the middle of a cascade and the next
 * spawn lands back in that hole), and it works against panels restored from
 * disk, since it reads the live array rather than session-local state.
 *
 * Pure, and called from inside Canvas.tsx's `setPanels` updater with that
 * updater's own `current` — see the call site for why a ref read would
 * resurrect the bug under batching.
 */
export function cascadeCentre(centre: Point, panels: Panel[]): Point {
  const taken = (point: Point): boolean =>
    panels.some(
      ({ rect }) =>
        Math.abs(rect.x + rect.w / 2 - point.x) < CASCADE_EPSILON &&
        Math.abs(rect.y + rect.h / 2 - point.y) < CASCADE_EPSILON
    )
  for (let step = 0; step <= CASCADE_MAX_STEPS; step++) {
    const candidate = { x: centre.x + step * CASCADE_STEP, y: centre.y + step * CASCADE_STEP }
    if (!taken(candidate)) return candidate
  }
  // Every slot occupied: wrap to the original centre rather than march the
  // panel out of the cull region, where it would never be promoted at all.
  return centre
}

/** One above the highest current z, so a raised or new panel is on top. */
export function nextZ(panels: Panel[]): number {
  return panels.reduce((max, p) => Math.max(max, p.z), 0) + 1
}

/**
 * Replace one panel's rect. Serves both move and resize: applyDrag has already
 * decided what the rect is, and the move/resize distinction lives in DragMode
 * where it actually matters (it decides whether a pty:resize commit fires).
 */
export function setPanelRect(panels: Panel[], id: string, rect: WorldRect): Panel[] {
  return panels.map((p) => (p.rect.id === id ? { ...p, rect } : p))
}

/**
 * Drop the panel AND every link pointing at it.
 *
 * The incoming prune lives HERE rather than at the call sites, and that
 * placement is the whole of the dangling-link stance. Both callers are the two
 * branches of Canvas.tsx's onClosePanel, and both are already inside a
 * setPanels updater whose result goes straight to commitHistory — so the panel
 * and its links leave in ONE committed gesture, land in ONE history entry, and
 * one Cmd+Z brings back both (verify:panels 128). A prune written at the call
 * sites instead would be two places to get right, and the one that got missed
 * would leave a link pointing at nothing with no error anywhere — backlog
 * #24's named failure, "the standard failure of every graph UI that stored ids
 * without deciding this".
 *
 * Outgoing links need nothing: they leave with the panel that held them.
 *
 * verify:viewport 80, whose second clause is the over-correction guard —
 * stripping every link from every survivor satisfies "the dangling one is
 * gone" perfectly and silently empties the canvas on any close at all.
 */
export function removePanel(panels: Panel[], id: string): Panel[] {
  return panels.filter((p) => p.rect.id !== id).map((p) => pruneLinksTo(p, id))
}

/** The one place `links` being absent is normalised. See PanelBase.links. */
export function linksOf(panel: Panel): PanelLink[] {
  return panel.links ?? []
}

/**
 * Drop every link on this panel that points at `id`.
 *
 * Returns the panel UNCHANGED (same reference) when nothing pointed there, so
 * removePanel's map does not churn an identity for every survivor on every
 * close. That is economy rather than correctness — TerminalPanel is memo'd on
 * its rect and z rather than on the panel object — but a fresh object for
 * every panel on every close is a pointless allocation on a path already doing
 * real work.
 *
 * The key is DELETED rather than left as an empty array when nothing survives,
 * so a panel that never had links and a panel whose last link was pruned
 * serialise identically. Otherwise closing one panel rewrites `links: []` onto
 * every survivor in layout.json — noise in a file people read and diff.
 */
export function pruneLinksTo(panel: Panel, id: string): Panel {
  const links = linksOf(panel)
  if (!links.some((l) => l.to === id)) return panel
  const kept = links.filter((l) => l.to !== id)
  const next: Panel = { ...panel }
  if (kept.length === 0) delete next.links
  else next.links = kept
  return next
}

/** Replace one panel, by id, with the result of `f`. */
function mapPanel(panels: Panel[], id: string, f: (p: Panel) => Panel): Panel[] {
  return panels.map((p) => (p.rect.id === id ? f(p) : p))
}

/**
 * Add `from -> to`, refusing a self-link and refusing a duplicate.
 *
 * A self-link is a segment with no direction: linkAnchors answers null for
 * coincident centres, so it would persist forever as a link that renders
 * nothing — indistinguishable from a broken feature. A duplicate paints two
 * identical overlapping paths, which is cascadeCentre's indistinguishability
 * argument through a different door: the canvas looks like it holds one link
 * while holding two, and removing "the" link leaves one behind.
 *
 * `to -> from` alongside `from -> to` IS allowed. They are different claims,
 * and a fix for the duplicate case that collapsed them would be
 * over-correcting into "one link per pair". verify:viewport 79.
 *
 * Returns the SAME array when it refuses, which the call site depends on: a
 * commit pushed for a refused gesture is a history entry for a gesture that
 * changed nothing, and the rule is one entry per COMMITTED gesture.
 */
export function addLink(panels: Panel[], from: string, to: string): Panel[] {
  if (from === to) return panels
  const source = panels.find((p) => p.rect.id === from)
  if (!source || !panels.some((p) => p.rect.id === to)) return panels
  if (linksOf(source).some((l) => l.to === to)) return panels
  return mapPanel(panels, from, (p) => ({ ...p, links: [...linksOf(p), { to }] }))
}

/** Remove one link. Addressed by BOTH ends, since a->b and b->a both exist. */
export function removeLink(panels: Panel[], from: string, to: string): Panel[] {
  return mapPanel(panels, from, (p) => pruneLinksTo(p, to))
}

/**
 * Set one link's label.
 *
 * An empty string CLEARS the label rather than storing '', so the palette's
 * input mode has a way to undo a label without a second verb — and so an empty
 * label cannot round-trip to disk as a field that renders as a blank row the
 * user can neither see nor explain.
 */
export function setLinkLabel(
  panels: Panel[],
  from: string,
  to: string,
  label: string
): Panel[] {
  return mapPanel(panels, from, (p) => ({
    ...p,
    links: linksOf(p).map((l) =>
      l.to === to
        ? (label === ''
            ? { to: l.to, ...(l.automation === undefined ? {} : { automation: l.automation }) }
            : { ...l, label })
        : l
    )
  }))
}

/** Whether adding `from -> to` to the enabled automation graph closes a cycle. */
function wouldCycle(panels: Panel[], from: string, to: string): boolean {
  const seen = new Set<string>()
  const visit = (id: string): boolean => {
    if (id === from) return true
    if (seen.has(id)) return false
    seen.add(id)
    const panel = panels.find((p) => p.rect.id === id)
    return panel !== undefined && linksOf(panel).some(
      (link) => link.automation !== undefined && link.automation.enabled && visit(link.to)
    )
  }
  return visit(to)
}

/**
 * Set or replace THE automation on one existing link — M41's one mutator for
 * both kinds, which setRestartOnExit below is a thin call into. One rule per
 * link, so a handoff replaces a restart rule rather than stacking beside it.
 *
 * A cycle across BOTH kinds is refused rather than rate-limited: a limit
 * merely turns a configured loop into a delayed surprise, while refusing it
 * leaves the canvas in a state a user can reason about. Returns the identical
 * array for a missing link, a sessionless endpoint, a cyclic enable, and a
 * no-op (the same rule already there, or "off" on a link that has no rule),
 * so callers do not create a no-op undo entry.
 */
export function setLinkAutomation(
  panels: Panel[],
  from: string,
  to: string,
  automation: LinkAutomation
): Panel[] {
  const source = panels.find((p) => p.rect.id === from)
  const target = panels.find((p) => p.rect.id === to)
  // M78: a chat is a process kind — a valid source (a turn's end) and target (a send).
  const isProcess = (p: Panel): boolean => isTerminalPanel(p) || isChatPanel(p)
  if (!source || !target || !isProcess(source) || !isProcess(target)) return panels
  // A restart is the terminal's alone (a chat has no process to restart) —
  // the parser drops it on load, so the mutator must refuse it here too.
  if (automation.kind === 'restart-on-exit' && !(isTerminalPanel(source) && isTerminalPanel(target))) return panels
  const link = linksOf(source).find((candidate) => candidate.to === to)
  if (!link) return panels
  if (!automation.enabled && link.automation === undefined) return panels
  if (JSON.stringify(link.automation) === JSON.stringify(automation)) return panels
  if (automation.enabled && wouldCycle(panels, from, to)) return panels
  return mapPanel(panels, from, (panel) => ({
    ...panel,
    links: linksOf(panel).map((candidate) => candidate.to !== to ? candidate : { ...candidate, automation })
  }))
}

/**
 * The inspector's three-state cycle for the handoff control: off -> on exit
 * -> on idle -> off. From no rule, a disabled rule, or a RESTART rule the
 * next state is "on exit" — pressing the handoff control on a restart link
 * converts it, which is the one-rule-per-link decision made visible.
 */
export function nextHandoffState(current: LinkAutomation | undefined): LinkAutomation {
  if (current?.kind === 'handoff' && current.enabled) {
    // M78: a condition set from the edge's select cycles to off, like idle.
    return current.trigger === 'exit'
      ? { kind: 'handoff', enabled: true, trigger: 'idle' }
      : { kind: 'handoff', enabled: false, trigger: 'idle' }
  }
  return { kind: 'handoff', enabled: true, trigger: 'exit' }
}

/** Enable or disable the restart-on-exit action on one existing link. See setLinkAutomation. */
export function setRestartOnExit(
  panels: Panel[],
  from: string,
  to: string,
  enabled: boolean
): Panel[] {
  return setLinkAutomation(panels, from, to, { kind: 'restart-on-exit', enabled })
}

/** Raise by z, never by array position — see the note on Panel.z. */
export function raisePanel(panels: Panel[], id: string): Panel[] {
  const top = nextZ(panels)
  return panels.map((p) => (p.rect.id === id ? { ...p, z: top } : p))
}

/**
 * A review node is TALLER and NARROWER than a terminal panel: it is a list of
 * paths and a column of diff lines, both of which read better in a portrait
 * box than in the 720x460 landscape one a terminal wants.
 */
export const REVIEW_W = 640
export const REVIEW_H = 520

/** World units between a subject's right edge and its review node's left. */
export const REVIEW_GAP = 40

/**
 * Beside the subject, top-aligned with it, so the pair reads as one unit at
 * any zoom.
 *
 * The RESULT is a request, not a decision: Canvas.tsx runs it through
 * cascadeCentre exactly as onSpawn does, so opening two reviews of one panel
 * does not stack them byte-identically — the coincidence rule M6 established,
 * which review nodes inherit for free because cascadeCentre reads rects and
 * knows nothing about kinds.
 */
export function reviewCentre(subject: WorldRect, w = REVIEW_W, h = REVIEW_H): Point {
  return { x: subject.x + subject.w + REVIEW_GAP + w / 2, y: subject.y + h / 2 }
}

/**
 * Centred exactly on the point it is given, the contract makePanel has.
 *
 * `subject` is carried VERBATIM. Do not copy makePanel's `{ ...spec, panelId:
 * id }` line here: that line exists because a spec's panelId names the panel
 * ITSELF, while a subject's subjectId names a DIFFERENT panel. Forcing the
 * minted id into it makes the node a review of itself — no baseline, "not
 * started" forever, and nothing anywhere saying why. verify:viewport 76.
 */
export function makeReviewPanel(
  id: string,
  centre: Point,
  z: number,
  subject: ReviewSubject,
  size?: { w?: number; h?: number }
): ReviewPanel {
  const w = size?.w ?? REVIEW_W
  const h = size?.h ?? REVIEW_H
  return {
    kind: 'review',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    subject,
    z
  }
}

/**
 * A file panel is a READING surface: the review node's portrait box, for the
 * review node's reason, not the terminal's 720x460 landscape one.
 */
export const TOOLBOX_W = 560
export const TOOLBOX_H = 620

/**
 * A toolbox node.
 *
 * `source` is copied FIELD BY FIELD rather than spread, the rule
 * `makeFilePanel` already obeys: a shared reference means a caller mutating
 * its own object after the mint silently rewrites a panel already on the
 * canvas. And it deliberately does NOT stamp the minted id into `source` —
 * `makeReviewPanel`'s documented trap, which is one line, reads as
 * consistency, and produces a node describing itself.
 */
export function makeToolboxPanel(
  id: string,
  centre: Point,
  z: number,
  source: ToolboxSource,
  size?: { w?: number; h?: number }
): ToolboxPanel {
  const w = size?.w ?? TOOLBOX_W
  const h = size?.h ?? TOOLBOX_H
  return {
    kind: 'toolbox',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    z,
    source: { cwd: source.cwd, label: source.label }
  }
}

/** M83. A memory node: the project memory for one repository, as a document. */
export const WATCHER_W = 520
export const WATCHER_H = 340

/** M84. A watcher node, at the cascade centre like every other minted kind. */
export function makeWatcherPanel(
  id: string, centre: Point, z: number,
  watch: { cwd: string; command: string; args: string[]; trigger: WatchTrigger }
): WatcherPanel {
  return {
    kind: 'watcher',
    rect: { id, x: centre.x - WATCHER_W / 2, y: centre.y - WATCHER_H / 2, w: WATCHER_W, h: WATCHER_H },
    z,
    watch: { cwd: watch.cwd, command: watch.command, args: [...watch.args], trigger: watch.trigger }
  }
}

export const MEMORY_W = 460
export const MEMORY_H = 420

export function makeMemoryPanel(id: string, centre: Point, z: number, source: { root: string }): MemoryPanel {
  return {
    kind: 'memory',
    rect: { id, x: centre.x - MEMORY_W / 2, y: centre.y - MEMORY_H / 2, w: MEMORY_W, h: MEMORY_H },
    z,
    source: { root: source.root }
  }
}

export const BROWSER_W = 640
export const BROWSER_H = 480

/** M103. A browser panel at the cascade centre, opening to `url` (already http(s) by the caller's rule). */
export function makeBrowserPanel(id: string, centre: Point, z: number, url: string): BrowserPanel {
  return {
    kind: 'browser',
    rect: { id, x: centre.x - BROWSER_W / 2, y: centre.y - BROWSER_H / 2, w: BROWSER_W, h: BROWSER_H },
    z,
    url
  }
}

export const CHAT_W = 560
export const CHAT_H = 620

/**
 * M73. Centred exactly (makePanel's contract). The record is copied FIELD BY
 * FIELD and never spread: a shared reference lets the caller's later mutation
 * rewrite a panel already on the canvas, and a spread would write
 * `agentOptions: undefined`, which survives IPC and reads as present. The
 * minted id is never stamped into the record — makeReviewPanel's trap.
 */
export function makeChatPanel(
  id: string,
  centre: Point,
  z: number,
  chat: ChatSource,
  size?: { w?: number; h?: number }
): ChatPanel {
  const w = size?.w ?? CHAT_W
  const h = size?.h ?? CHAT_H
  return {
    kind: 'chat',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    z,
    chat: {
      // M81. A supervisor's flag is copied field-by-field like the rest: it is
      // what makes its next spawn carry the system prompt again.
      ...(chat.supervisor === true ? { supervisor: true as const } : {}),
      // M90/M99. The backend, the same way, through the registry's one rule:
      // absent and the default stay absent, so a claude record never grows a
      // key (`verify:panels codex.1` reads the file).
      ...carryBackend(chat),
      ...carryChatMarks(chat),
      // M100. The identity, absent unless set — the same rule as the backend.
      ...(chat.teammateId === undefined ? {} : { teammateId: chat.teammateId }),
      cwd: chat.cwd,
      sessionId: chat.sessionId,
      ...(chat.agentOptions === undefined ? {} : { agentOptions: { ...chat.agentOptions } })
    }
  }
}

export const FILE_W = 640
export const FILE_H = 520

/**
 * Centred exactly on the point it is given, the contract makePanel has.
 *
 * `source` is copied field by field rather than carried by reference, so a
 * caller reusing its object cannot mutate a mounted panel's path underneath
 * it. It is emphatically NOT rewritten: do not copy makePanel's
 * `{ ...spec, panelId: id }` line here — a spec's panelId names the panel
 * itself, and there is no field here that names a panel at all.
 */
export function makeFilePanel(
  id: string,
  centre: Point,
  z: number,
  source: FileSource,
  size?: { w?: number; h?: number }
): FilePanel {
  const w = size?.w ?? FILE_W
  const h = size?.h ?? FILE_H
  return {
    kind: 'file',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    // Field by field, and `prose` conditionally — never `{ ...source }`. The
    // spread would both share the caller's object (so a later mutation of it
    // rewrites a panel already on the canvas) and write `prose: undefined`,
    // which reads as present. makeReviewPanel's warning, at a sixth mint.
    source: { path: source.path, ...(source.prose === true ? { prose: true as const } : {}) },
    z
  }
}

export const JIRA_W = 640
export const JIRA_H = 520
export function makeGithubPanel(id: string, centre: Point, z: number): GithubPanel {
  return { kind: 'github', rect: { id, x: centre.x - JIRA_W / 2, y: centre.y - JIRA_H / 2, w: JIRA_W, h: JIRA_H }, z, title: 'GitHub work' }
}

export function makeJiraPanel(id: string, centre: Point, z: number): JiraPanel {
  return { kind: 'jira', rect: { id, x: centre.x - JIRA_W / 2, y: centre.y - JIRA_H / 2, w: JIRA_W, h: JIRA_H }, z, title: 'Jira tickets' }
}

/** M116. A card is a ROW, not a list: the work panels' width and a short height (above MIN_PANEL_H). */
export const WORK_H = 180
/**
 * M116. A work card at the centre. The title is the ITEM's at mint — the
 * rail reads `work · <title>` from it — and it is a copy on purpose: the
 * card's body reads the live record by id, so a renamed item re-titles the
 * body while the rail keeps the name the user saw when they made the card.
 */
export function makeWorkPanel(id: string, centre: Point, z: number, itemId: string, title: string): WorkPanel {
  return { kind: 'work', rect: { id, x: centre.x - JIRA_W / 2, y: centre.y - WORK_H / 2, w: JIRA_W, h: WORK_H }, z, title, work: { itemId } }
}

/** M127. A skill panel reads like a document: the work panels' width, a file panel's height. */
export const SKILL_H = 520
/**
 * M127. A skill panel at a point. The title is stamped at mint for the rail
 * — `skill · <name>` — and nothing reads it as the skill's own name; the
 * record's `skill.name` is the identity, and the title is a label.
 */
export function makeSkillPanel(id: string, centre: Point, z: number, scope: ToolScope, name: string): SkillPanel {
  return { kind: 'skill', rect: { id, x: centre.x - JIRA_W / 2, y: centre.y - SKILL_H / 2, w: JIRA_W, h: SKILL_H }, z, title: `skill · ${name}`, skill: { scope, name } }
}

/**
 * M92. The world rect that fills the VISIBLE viewport at the current scale,
 * inset by `margin` screen pixels. Pure over the camera: a check pins that
 * mapping it back through the viewport lands on the margin exactly.
 */
export function maximiseRect(viewport: { x: number; y: number; scale: number }, size: { width: number; height: number }, margin: number): WorldRect {
  const x = (margin - viewport.x) / viewport.scale
  const y = (margin - viewport.y) / viewport.scale
  return { id: '', x, y, w: (size.width - margin * 2) / viewport.scale, h: (size.height - margin * 2) / viewport.scale }
}

/**
 * M92. The three marks, carried through a field-by-field rebuild the way
 * `title` is: present only when set. Every site that rebuilds a Panel by
 * name spreads this, or a rename silently unlocks (the verifier's find).
 */
export function carryMarks(p: Panel): { locked?: true; pinned?: true; maximised?: { restore: WorldRect } } {
  return {
    ...(p.locked === true ? { locked: true as const } : {}),
    ...(p.pinned === true ? { pinned: true as const } : {}),
    ...(p.maximised === undefined ? {} : { maximised: { restore: { ...p.maximised.restore } } })
  }
}
