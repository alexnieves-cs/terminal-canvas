/**
 * M275. SWARM START-WORK PRESETS — an ARRANGEMENT, as data.
 *
 * A lineup (M104) opens N panels in a folder. A start (M197) opens ONE
 * conversation in a lane for one task. A SWARM is the thing neither of them
 * is: a reviewed shape of a multi-agent arrangement that a single Start work
 * runs — a hub identity, workers with named roles, the handoff edges between
 * them with REAL triggers, and the board card the whole thing belongs to.
 *
 * Six rules here are load-bearing, and each fails silently if undone.
 *
 * **The PRIMARY seat is the task's lane, and the existing executor makes it.**
 * A swarm does not reimplement `dispatchWorkItem`: it calls it for the primary
 * seat, so the item's `panelId`, `worktreeId`, the `dispatched` edge from the
 * card, the Places gate, `ensureForPanel` and the first send are the ones that
 * already shipped — which is also why Open PR, Review the lane and M202's
 * readiness keep working on a task a swarm started. A second lane-maker would
 * be a second author of what a task IS.
 *
 * **The supervisor is not a worker and takes no worktree.** It sits at the
 * REPOSITORY root under M81's own prompt (observe and report, never spawn,
 * close or write) — a hub identity, not a fake persona that pretends to do
 * the work. A supervisor in a worktree would report on a branch nobody else
 * is on.
 *
 * **A seat's place is a decision about ISOLATION, not a default.** `own-lane`
 * is for a seat that WRITES beside another writer; `task-lane` is for a seat
 * that must see exactly what the primary wrote (a tester testing something
 * else is worse than no tester); `root` is for a seat that only READS, and a
 * second worktree for a read is a lie about what is happening. M104 learned
 * the same lesson from the other side — a browser or a shell in a worktree
 * points at a directory the dev server was never started in.
 *
 * **Every edge names a trigger that can actually fire, and the triggers are
 * not interchangeable.** A chat has no exit code, so chat → chat is `idle` (a
 * turn's end). A terminal running a suite has one, so `exit-fail` means
 * literally "only when it failed" — which is how a failing run reaches a
 * person as `needs you` without anything polling. `handoffFires` is the one
 * table that decides, here as everywhere.
 *
 * **The board state a swarm starts FROM is checked; the state it leaves is
 * not invented.** `working` and `review` are the RUNTIME's words (M113), set
 * by a turn starting and a pull request opening. A swarm sets neither: it
 * refuses by name when the card is in a state the arrangement makes no sense
 * from (a review swarm over a `todo` task has no work to read), and leaves the
 * rest to the events that already own those words.
 *
 * **A preset that came from outside is INERT until a person has read it.**
 * `reviewed: false` is the template rule (M190) reached again, and it fails
 * SAFE: anything that is not exactly `true`/absent reads as unread, and
 * `swarmRefusal` names it before a single session is minted.
 *
 * Pure: no DOM, no node, no React. `verify:swarm`.
 */
import type { HandoffTrigger } from './handoff'
import type { WorkItemState } from './work-items'

export type SwarmPresetId = 'explore' | 'implement' | 'test' | 'review'
export const SWARM_PRESET_IDS: readonly SwarmPresetId[] = ['explore', 'implement', 'test', 'review']

/**
 * The roles, and they are the whole vocabulary: a seat's role decides its
 * brief, and a brief that is not one of these has no home. `supervisor` is
 * listed with the rest because it is a seat on the arrangement — it is simply
 * the one seat that never takes a lane.
 */
export type SwarmRole = 'supervisor' | 'explore' | 'implement' | 'test' | 'review'

/** Where a seat works — see the isolation rule in this file's header. */
export type SwarmPlace = 'task-lane' | 'own-lane' | 'root'

export interface SwarmSeat {
  /** The arrangement's own name for the seat; edges name KEYS, never panel ids — the panels do not exist yet (M80's rule). */
  key: string
  role: SwarmRole
  kind: 'chat' | 'terminal'
  /** The panel's title, and the word a refusal names the seat by. */
  title: string
  place: SwarmPlace
  /** A terminal seat's command, run through the login shell. Absent for a chat seat. */
  command?: string
  /**
   * A chat seat's opening message, SENT (a swarm is a hand-off, not a draft —
   * M114's rule, not M80's). ABSENT means the seat opens quiet and waits for
   * the edge that feeds it: a seat sent a message AND fed by a handoff would
   * answer the wrong question first, with the real input arriving mid-turn.
   */
  message?: string
  /** Offset from the PRIMARY seat's centre, in world units. */
  dx: number
  dy: number
  w?: number
  h?: number
}

export interface SwarmEdge {
  from: string
  to: string
  trigger: HandoffTrigger
  /** The word on the edge. A statement even when nothing automates. */
  label: string
  /**
   * False makes the edge a STATEMENT and not an automation — the shape of the
   * `dispatched` edge M114 draws from a card. The supervisor's edges are
   * statements on purpose: an enabled edge back into a hub that is also fed
   * BY its workers is the cycle `setLinkAutomation` refuses, and a refused
   * automation is the silent half of a shape that looks wired.
   */
  automate: boolean
}

export interface SwarmPreset {
  id: SwarmPresetId
  label: string
  /** One line, the row's hint. */
  hint: string
  /** The seat that takes the item's lane and becomes its `panelId` — the existing executor's. */
  primary: string
  seats: readonly SwarmSeat[]
  edges: readonly SwarmEdge[]
  /** The board states this arrangement may start from; anything else refuses by name. */
  startsFrom: readonly WorkItemState[]
  /** A review node over the task's lane is opened beside the arrangement. */
  opensReview?: true
  /** M190's rule: absent (and so read) for every built-in, which is CODE; `false` for anything that arrived from outside. */
  reviewed?: false
}

/**
 * THE BRIEFS, by role — CODE, the way `BUILT_IN_TEMPLATES` and
 * `SUPERVISOR_PROMPT` are. A chat's record carries only `{ preset, role }`
 * (see `SwarmMark`), never the prose: a brief written into everybody's
 * layout.json is a brief that can never be corrected, and a resumed session
 * would carry last month's words with no way to tell.
 *
 * The supervisor's is EMPTY here because M81's `SUPERVISOR_PROMPT` is its
 * whole job; `swarmSystemPrompt` composes the two.
 */
export const SWARM_BRIEFS: Readonly<Record<SwarmRole, string>> = {
  supervisor: '',
  explore: [
    'Your seat in this arrangement is EXPLORE.',
    'Read and map — never write, never commit, never run anything that changes files.',
    'Answer with what is there, where it is, and the options with their trade-offs; name what you could not determine rather than guessing.',
    'End your turn when the map is complete: the next seat is started from what you say.'
  ].join(' '),
  implement: [
    'Your seat in this arrangement is IMPLEMENT.',
    'This directory is a git worktree on its own branch; commit as you go, with clear messages.',
    'Never push, never merge and never open a pull request — the person does that from the card.',
    'End your turn when the change is complete and say plainly what you changed, because a tester is started from what you say.'
  ].join(' '),
  test: [
    'Your seat in this arrangement is TEST.',
    'Exercise what was just built and report what actually happened — the command you ran and its output, never a summary you expect to be true.',
    'Fix nothing silently: if something fails, say what failed and stop, so a person can decide.'
  ].join(' '),
  review: [
    'Your seat in this arrangement is REVIEW.',
    'Read the diff and judge readiness: what is finished, what is missing, and what a reviewer would object to.',
    // M361. Cross-agent review: each objection lands on its line as a proposal the person keeps or discards.
    'Put each objection on its line with `tc plan review-comment $TC_PANEL_ID <path>:<line> <what is wrong>` (path:line:old for a removed line): it reaches the person as a proposed comment they keep or discard.',
    'Never push, never merge and never open a pull request — you state readiness, a person decides.'
  ].join(' ')
}

/**
 * What a chat PERSISTS about its seat. Two short strings, so the brief above
 * stays code and a resumed session gets today's words (M81's rule: the CLI
 * keeps no record of an appended system prompt, so a chat that does not carry
 * the mark silently stops being what it was).
 */
export interface SwarmMark {
  preset: SwarmPresetId
  role: SwarmRole
}

/**
 * The appended system prompt for a seat, composed at every spawn.
 * `supervisorPrompt` is injected rather than imported so this module stays a
 * leaf that `chat-panel.ts` (which `layout-schema.ts` parses through) can name
 * without dragging the session contract behind it.
 */
export function swarmSystemPrompt(mark: SwarmMark, supervisorPrompt: string): string {
  const shape = `You are one seat in a ${SWARM_PRESETS[mark.preset].label.toLowerCase()} arrangement on a Terminal Canvas board item.`
  return mark.role === 'supervisor'
    ? `${supervisorPrompt} ${shape} The seats hand off to you as they finish their turns; report what the arrangement has established, and what still needs a person.`
    : `${shape} ${SWARM_BRIEFS[mark.role]}`
}

const CHAT_W = 560
const CHAT_H = 620
const TERM_W = 720
const TERM_H = 460
const GAP = 48
/** The second column's centre: half a chat, the gap, half a chat. */
const COL2 = CHAT_W / 2 + GAP + CHAT_W / 2
/** The second column's centre when that seat is a terminal, which is wider. */
const COL2_TERM = CHAT_W / 2 + GAP + TERM_W / 2
/** The hub's row, above both columns: a whole chat plus the gap. */
const ROW_UP = -(CHAT_H / 2 + GAP + CHAT_H / 2)

/** The hub, identical in all four arrangements but for the sentence it opens with. */
const hub = (message: string, dx: number): SwarmSeat => ({
  key: 'supervisor', role: 'supervisor', kind: 'chat', title: 'supervisor', place: 'root', message, dx, dy: ROW_UP, w: CHAT_W, h: CHAT_H
})

/** A statement edge from the hub to the seat it watches — never an automation; see `SwarmEdge.automate`. */
const supervises = (to: string): SwarmEdge => ({ from: 'supervisor', to, trigger: 'idle', label: 'supervises', automate: false })

/**
 * THE FOUR. Each is a real arrangement rather than a count of agents: the
 * seats differ in ROLE, in PLACE and in what starts them, which is what makes
 * choosing between them a decision about the work rather than about how busy
 * the canvas should look.
 */
export const SWARM_PRESETS: Readonly<Record<SwarmPresetId, SwarmPreset>> = {
  explore: {
    id: 'explore',
    label: 'Explore',
    hint: 'two readers map the code and the options; findings land in a supervisor',
    primary: 'map',
    // Both readers are LIGHT: no worktree for either. The primary takes the
    // task lane because the item's lane is what a task IS (`dispatchWorkItem`
    // mints it), and the second reads the repository as it actually stands.
    seats: [
      { key: 'map', role: 'explore', kind: 'chat', title: 'map', place: 'task-lane', dx: 0, dy: 0, w: CHAT_W, h: CHAT_H },
      {
        key: 'options', role: 'explore', kind: 'chat', title: 'options', place: 'root', dx: COL2, dy: 0, w: CHAT_W, h: CHAT_H,
        message: 'Independently of the other reader: what are the plausible ways to do this task in this repository? List each option with its trade-offs, and say which you would pick and why. Read only.'
      },
      hub('Two readers are mapping this task. Report what they establish as each finishes.', COL2 / 2)
    ],
    // A JOIN: the hub advances when BOTH readers have finished (M78's
    // `joinAdvance`), which is the difference between a report and half a report.
    edges: [
      { from: 'map', to: 'supervisor', trigger: 'idle', label: 'findings', automate: true },
      { from: 'options', to: 'supervisor', trigger: 'idle', label: 'findings', automate: true },
      supervises('map')
    ],
    startsFrom: ['todo', 'working']
  },
  implement: {
    id: 'implement',
    label: 'Implement',
    hint: 'an implementer in the task lane, a tester in the same lane, and a supervisor',
    primary: 'build',
    seats: [
      { key: 'build', role: 'implement', kind: 'chat', title: 'build', place: 'task-lane', dx: 0, dy: 0, w: CHAT_W, h: CHAT_H },
      // THE SAME LANE, deliberately. A tester in its own worktree would test
      // the branch point and pass while the change is broken — a green answer
      // about the wrong tree, which is the worst shape a check can take.
      { key: 'verify', role: 'test', kind: 'chat', title: 'test', place: 'task-lane', dx: COL2, dy: 0, w: CHAT_W, h: CHAT_H },
      hub('An implementer and a tester are working one item. Report what each establishes.', COL2 / 2)
    ],
    // A chat has no exit code, so the trigger is the turn's end. The
    // implementer's brief ends its turn on purpose, which is what makes this
    // edge fire at a meaningful moment rather than at a pause.
    edges: [
      { from: 'build', to: 'verify', trigger: 'idle', label: 'built — test it', automate: true },
      { from: 'verify', to: 'supervisor', trigger: 'idle', label: 'result', automate: true },
      supervises('build')
    ],
    startsFrom: ['todo', 'working']
  },
  test: {
    id: 'test',
    label: 'Test',
    hint: 'a suite runner in the lane; only a FAILING run reaches the agent, and you',
    primary: 'triage',
    seats: [
      { key: 'triage', role: 'test', kind: 'chat', title: 'triage', place: 'task-lane', dx: 0, dy: 0, w: CHAT_W, h: CHAT_H },
      // `npm test` is AUTHORED, not discovered: this app cannot know a
      // repository's suite, and guessing one silently is worse than a command
      // the person can read in the panel's title and change in the terminal.
      // A repository with no such script exits non-zero, which fires exactly
      // the edge below — the honest outcome, and a visible one.
      { key: 'runner', role: 'test', kind: 'terminal', title: 'npm test', place: 'task-lane', command: 'npm test', dx: COL2_TERM, dy: 0, w: TERM_W, h: TERM_H },
      hub('A suite is running in this task\'s lane. Report failures when they arrive.', COL2_TERM / 2)
    ],
    // `exit-fail` and nothing else. A passing run must not wake an agent: a
    // handoff on `always` would spend a turn saying "it passed", every time.
    edges: [
      { from: 'runner', to: 'triage', trigger: 'exit-fail', label: 'failed — triage it', automate: true },
      { from: 'triage', to: 'supervisor', trigger: 'idle', label: 'triage', automate: true },
      supervises('triage')
    ],
    startsFrom: ['todo', 'working', 'review']
  },
  review: {
    id: 'review',
    label: 'Review',
    hint: 'the diff gathered, readiness judged, and a person still opens the PR',
    primary: 'read',
    seats: [
      { key: 'read', role: 'review', kind: 'chat', title: 'review', place: 'task-lane', dx: 0, dy: 0, w: CHAT_W, h: CHAT_H },
      // A terminal, not a second agent: gathering a diff is `git diff`, and
      // an agent asked to run it would spend a turn on a command whose output
      // the edge below hands over verbatim. `--no-pager` because a pager in a
      // pty never exits, and an edge on `exit-ok` would then never fire.
      { key: 'diff', role: 'review', kind: 'terminal', title: 'git diff', place: 'task-lane', command: 'git --no-pager status -sb && git --no-pager diff --stat && git --no-pager diff', dx: COL2_TERM, dy: 0, w: TERM_W, h: TERM_H },
      hub('A review is being gathered for this item. Report readiness; the person opens the pull request.', COL2_TERM / 2)
    ],
    edges: [
      { from: 'diff', to: 'read', trigger: 'exit-ok', label: 'the diff', automate: true },
      { from: 'read', to: 'supervisor', trigger: 'idle', label: 'readiness', automate: true },
      supervises('read')
    ],
    // A `todo` item has nothing to review. This is the "right starting state"
    // as a REFUSAL rather than as a state this verb sets: `working` and
    // `review` are the runtime's words and a swarm never writes one.
    startsFrom: ['working', 'review'],
    opensReview: true
  }
}

/** The four, in the order they are offered — the order of the work, not the alphabet. */
export const SWARM_LIST: readonly SwarmPreset[] = SWARM_PRESET_IDS.map((id) => SWARM_PRESETS[id])

export function parseSwarmPresetId(value: unknown): SwarmPresetId | null {
  return typeof value === 'string' && (SWARM_PRESET_IDS as readonly string[]).includes(value) ? (value as SwarmPresetId) : null
}

const ROLES: readonly SwarmRole[] = ['supervisor', 'explore', 'implement', 'test', 'review']

/**
 * A persisted mark, or null. Fails SAFE in the direction that costs the mark
 * and not the panel: a chat whose seat cannot be read is still a chat, and it
 * simply spawns without an appended prompt rather than with a guessed one.
 */
export function parseSwarmMark(raw: unknown): SwarmMark | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const preset = parseSwarmPresetId(record['preset'])
  const role = typeof record['role'] === 'string' && ROLES.includes(record['role'] as SwarmRole) ? (record['role'] as SwarmRole) : null
  return preset === null || role === null ? null : { preset, role }
}

export const seatOf = (preset: SwarmPreset, key: string): SwarmSeat | undefined => preset.seats.find((s) => s.key === key)

/** The seat that takes the item's lane. Named through this function everywhere, so a preset whose `primary` names no seat is one bug and not four. */
export function primarySeat(preset: SwarmPreset): SwarmSeat | undefined {
  return seatOf(preset, preset.primary)
}

export interface PlannedSwarmSeat extends SwarmSeat {
  /** True when this seat gets a worktree of its own — `own-lane` only, and never the hub. */
  ownLane: boolean
  /** The words the preview uses for this seat's folder. */
  where: string
}

export interface SwarmPlan {
  preset: SwarmPreset
  seats: PlannedSwarmSeat[]
  agents: number
  terminals: number
  /** Worktrees this arrangement would create: the task's lane, plus one per `own-lane` seat. */
  lanes: number
  /** How many agent seats would queue behind `agents.maxConcurrent`, given the live count. */
  queued: number
  /** The sentence the sheet shows, or '' when nothing queues. */
  ceilingLine: string
  /** One line naming what would open, before anything is minted. */
  line: string
}

/**
 * The arrangement as it WOULD land, stated before anything is minted — the
 * start sheet's own rule (M197: the triple is stated before anything is
 * minted) extended to the shape.
 *
 * `queued` counts sends ALREADY WAITING as well as live agents, which is
 * M121's correction to the same arithmetic in `lineupPlan`: a preview that
 * counted the live agents alone said one would queue when two would.
 */
export function swarmPlan(preset: SwarmPreset, input: { maxConcurrent: number; liveAgents: number; queued?: number; rootWords?: string }): SwarmPlan {
  const root = input.rootWords ?? 'the repository'
  const seats: PlannedSwarmSeat[] = preset.seats.map((seat) => {
    const ownLane = seat.place === 'own-lane' && seat.role !== 'supervisor'
    const where = seat.place === 'root' ? root : ownLane ? 'a worktree of its own' : 'the task lane'
    return { ...seat, ownLane, where }
  })
  const agents = seats.filter((s) => s.kind === 'chat').length
  const terminals = seats.filter((s) => s.kind === 'terminal').length
  const lanes = 1 + seats.filter((s) => s.ownLane).length
  const waiting = Math.max(0, input.queued ?? 0)
  const room = input.maxConcurrent <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, input.maxConcurrent - input.liveAgents - waiting)
  const queued = Number.isFinite(room) ? Math.max(0, agents - room) : 0
  const ceilingLine = queued === 0
    ? ''
    : `${queued} of these ${agents} agents will queue behind the ceiling of ${input.maxConcurrent} (${input.liveAgents} live now${waiting > 0 ? `, ${waiting} already waiting` : ''}) — raise agents.maxConcurrent, or choose a smaller arrangement`
  const parts = [
    `${agents} conversation${agents === 1 ? '' : 's'}`,
    ...(terminals === 0 ? [] : [`${terminals} terminal${terminals === 1 ? '' : 's'}`]),
    `${lanes} worktree${lanes === 1 ? '' : 's'}`,
    `${preset.edges.filter((e) => e.automate).length} handoff${preset.edges.filter((e) => e.automate).length === 1 ? '' : 's'}`
  ]
  return { preset, seats, agents, terminals, lanes, queued, ceilingLine, line: parts.join(' · ') }
}

/** The word a board state reads as in a refusal — the board's own four, never a provider's. */
const STATE_WORDS: Readonly<Record<WorkItemState, string>> = { todo: 'to do', working: 'working', review: 'in review', done: 'done' }

export interface SwarmRefusalContext {
  /** Whether an agent CLI answered discovery. */
  agentAvailable: boolean
  /**
   * The chosen teammate. ABSENT means the caller's door does not ask for one
   * — a work card's Swarm menu, where the teammate is the start sheet's own
   * question — and the teammate arms are SKIPPED rather than refused. Refusing
   * "choose a teammate" from a door that never offered one would state a
   * question the person cannot answer where they are standing, and
   * `startWorkNeeds` already owns that sentence for the door that does ask.
   */
  teammate?: { name: string; places: readonly string[] }
  /** The card this would start, when there is one. A start that mints its card has none yet, and a fresh card is `todo`. */
  item?: { state: WorkItemState }
  merged?: boolean
}

/**
 * Why this arrangement cannot start, in the order the person can act on —
 * null when it can. ONE function, so the sheet's disabled Start, the card
 * menu's disabled rows and the executor's own last gate cannot disagree about
 * the same swarm. Nothing here widens a grant: every fix names a place to go.
 */
export function swarmRefusal(preset: SwarmPreset, ctx: SwarmRefusalContext): string | null {
  if (ctx.merged === true) return 'the merged view is read-only'
  // M190's rule, fail-safe: an arrangement somebody else wrote starts agents,
  // so it is inert until a person has looked at the seats and the commands.
  if (preset.reviewed === false) return `${preset.label} arrived from outside and nobody has read it yet — open it and mark it read before it may start agents`
  if (!ctx.agentAvailable) return 'no agent CLI is on the PATH — install claude or codex, or check the environment report'
  if (ctx.teammate !== undefined && ctx.teammate.places.length === 0) return `${ctx.teammate.name} has no places — add a folder in the Teammates pane`
  const state = ctx.item?.state ?? 'todo'
  if (!preset.startsFrom.includes(state)) {
    const from = preset.startsFrom.map((s) => STATE_WORDS[s]).join(' or ')
    return `a ${preset.label} arrangement starts from a task that is ${from}; this one is ${STATE_WORDS[state]}${state === 'todo' ? ' — start work on it first, then review it' : ''}`
  }
  return null
}

/** A seat this arrangement cannot mint, named by seat rather than by panel — a refusal a person can map back to the preview. */
export function swarmSeatRefusal(seat: SwarmSeat, reason: string): string {
  return `${seat.title} (${seat.role}) was refused — ${reason}`
}
