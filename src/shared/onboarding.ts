import type { EnvReport } from './env-report'
import type { AgentBackend } from './agent-session'
import type { RepoStatus } from './review'
import { shortPath } from './display-path'

/**
 * M180. The first-launch engines as a TABLE keyed by backend (M99's rule:
 * no consumer compares `backend` to a literal; `verify:agent-session
 * registry.1` greps for it). A third row here is a third first-launch door.
 */
export const FIRST_LAUNCH_ENGINES: Readonly<Record<'claude' | 'codex', { name: string; setupUrl: string }>> = {
  claude: { name: 'Claude Code', setupUrl: 'https://code.claude.com/docs/en/setup' },
  codex: { name: 'Codex', setupUrl: 'https://developers.openai.com/codex/cli/' }
}
export const FIRST_LAUNCH_BACKENDS = Object.keys(FIRST_LAUNCH_ENGINES) as ReadonlyArray<keyof typeof FIRST_LAUNCH_ENGINES>
export function isFirstLaunchBackend(backend: string): backend is keyof typeof FIRST_LAUNCH_ENGINES {
  return Object.prototype.hasOwnProperty.call(FIRST_LAUNCH_ENGINES, backend)
}

export interface OnboardingEngine {
  backend: 'claude' | 'codex'
  discovery: 'installed' | 'missing' | 'unknown'
  authentication: 'unknown'
  sentence: string
  setupUrl: string
}

/** Discovery reports installation only. Authentication belongs to the first real turn. */
export function onboardingReadiness(report: EnvReport | null, preferred?: AgentBackend): {
  rows: OnboardingEngine[]; preferred?: 'claude' | 'codex'
} {
  const rows = FIRST_LAUNCH_BACKENDS.map((backend): OnboardingEngine => {
    const cli = report?.clis.find((entry) => entry.name === backend)
    const answered = report !== null && report.shell.ok && report.probe?.timedOut !== true
    const discovery = !answered || cli === undefined ? 'unknown' : cli.path === null ? 'missing' : 'installed'
    const { name, setupUrl } = FIRST_LAUNCH_ENGINES[backend]
    return {
      backend, discovery, authentication: 'unknown',
      sentence: discovery === 'installed' ? `${name} is installed. Your first message checks sign-in.`
        : discovery === 'missing' ? `Install ${name} using its setup guide, then choose Check again.`
          : `${name} discovery has not answered. Choose Check again.`,
      setupUrl
    }
  })
  const selected = rows.find((row) => row.backend === preferred && row.discovery === 'installed')
    ?? rows.find((row) => row.discovery === 'installed')
  return { rows, ...(selected === undefined ? {} : { preferred: selected.backend }) }
}

/**
 * M205 (D09). THE FIRST START — a sentence and a folder, decided here and run
 * through D05's own executor (`dispatchWorkItem`), so a new person starts
 * work through the SAME path a returning one does. Pure: `verify:onboarding
 * onboarding.intent.1–.5`.
 *
 * The one thing D05 could not do for a new person is the teammate: its sheet
 * refuses with "no teammate yet" on an empty roster, and a fresh install's
 * roster is always empty. So the first start MAY mint one — and that mint is
 * a PLACE GRANT, which is why three rules here are load-bearing:
 *
 * - **The grant is exactly the folder the person typed.** Never its parent,
 *   never the repository root git reports: widening what was chosen is the
 *   substitution-widening defect M196 measured, reached from the other side.
 * - **Reuse is containment by PATH SEGMENT**, never a string prefix —
 *   `/code/app2` is not inside `/code/app`, and a prefix test would hand the
 *   second repository to the first one's teammate.
 * - **The grant is stated before it is made** (`summary`), and nothing is
 *   minted on any refusal: the repository answer is asked BEFORE the mint.
 *
 * Main's Places gate stays the authority; this only decides what to ask for.
 */
export interface FirstWorkRequest { intention: string; folder: string }
export interface FirstWorkContext {
  teammates: ReadonlyArray<{ id: string; name: string; places: readonly string[] }>
  /** `onboardingReadiness`'s answer. `rows` lets an UNANSWERED lane engine be told apart from a missing one. */
  readiness: { preferred?: 'claude' | 'codex'; rows?: ReadonlyArray<{ backend: string; discovery: OnboardingEngine['discovery'] }> }
}
export type FirstWorkField = 'intention' | 'folder' | 'engine'
export type FirstWorkPlan =
  | { kind: 'refused'; field: FirstWorkField; reason: string }
  | {
    kind: 'start'
    /** The task's title: the sentence's first line, capped. */
    title: string
    /** The whole sentence, present only when it says more than the title. */
    description?: string
    /** The folder with trailing separators removed — the root the lane is asked for. */
    folder: string
    /** Exactly one arm: reuse a standing teammate, or mint one whose only place is `folder`. */
    teammate: { reuse: string; mint?: undefined } | { reuse?: undefined; mint: { name: string; places: string[] } }
    /** What will happen, in the person's words, before anything does. */
    summary: string
  }
  /**
   * The lane engine is MISSING but another engine is installed (Codex-only).
   * A lane cannot run it, so Start work opens a conversation IN the folder on
   * that engine instead — the M205 "chat in this folder" door, reached on day
   * one rather than behind a refusal. No teammate, no grant, no branch.
   */
  | { kind: 'chat'; engine: 'claude' | 'codex'; folder: string; summary: string }

/**
 * What the launcher's Start work answers. `not-a-repository` is its own arm
 * because its fix is a DIFFERENT door (a conversation in that folder), not a
 * retry — collapsing it into `refused` would offer the wrong next step.
 */
export type FirstWorkOutcome =
  | { kind: 'started' }
  | { kind: 'refused'; reason: string }
  | { kind: 'not-a-repository'; reason: string }

/**
 * The one engine a lane can run: a teammate carries no backend, so D05's
 * dispatch always creates a Claude conversation. NAMED once here so no
 * consumer compares a backend to a literal (M99's rule, `verify:agent-session
 * registry.1`, which the Launcher's first cut tripped).
 */
export const LANE_ENGINE: keyof typeof FIRST_LAUNCH_ENGINES = 'claude'

/** The first line a card can hold. The full sentence is kept as the description. */
export const FIRST_WORK_TITLE_MAX = 80

const trimSeparators = (path: string): string => {
  const trimmed = path.trim().replace(/\/+$/, '')
  return trimmed === '' && path.trim().startsWith('/') ? '/' : trimmed
}

/**
 * For COMPARISON only, never for a grant: macOS's `/var`, `/tmp` and `/etc`
 * are symlinks into `/private`, and git reports the real path while a person
 * (or the folder dialog) may type the other. Without this a typed `/var/…`
 * never matched a teammate's `/private/var/…` place and minted a twin (the
 * M205 critic). The renderer cannot realpath; main's gate still judges.
 */
const comparable = (path: string): string => {
  const p = trimSeparators(path)
  return p.startsWith('/private/') ? p.slice('/private'.length) : p
}

/** Does `place` contain `folder`, by path segment? Equal counts. */
export function placeContains(place: string, folder: string): boolean {
  const p = comparable(place)
  const f = comparable(folder)
  if (p === '' || f === '') return false
  return f === p || f.startsWith(p === '/' ? '/' : `${p}/`)
}

/** M395. What a Start with no sentence says — on the button and under step 3. */
export const DESCRIBE_FIRST = 'Describe the task first'

export function firstWorkPlan(req: FirstWorkRequest, ctx: FirstWorkContext): FirstWorkPlan {
  // The ENGINE first: no sentence and no folder can fix a missing CLI, so a
  // person must not be asked to type into a start that cannot run (the first
  // static render said "say what you want to work on" to a Codex-only
  // machine — `onboarding.markup.1`).
  // THREE states, not two: a lane engine whose discovery has not ANSWERED is
  // not missing, and "install Claude Code" to a person who has it is the
  // wrong fix (the M205 critic).
  const laneRow = ctx.readiness.rows?.find((row) => row.backend === LANE_ENGINE)
  if (ctx.readiness.preferred !== LANE_ENGINE && laneRow?.discovery === 'unknown') {
    return { kind: 'refused', field: 'engine', reason: 'Claude Code discovery has not answered yet — choose Check again' }
  }
  if (ctx.readiness.preferred === undefined) {
    return { kind: 'refused', field: 'engine', reason: 'no conversation engine has been discovered — install Claude Code, then Check again' }
  }
  const preferred = ctx.readiness.preferred
  const sentence = req.intention.trim()
  const raw = req.folder.trim()
  // The renderer cannot expand `~` (it has no process.env — CLAUDE.md), and a
  // relative path is relative to nothing the person can see; a place is an
  // absolute folder or it is refused by main one step later with less to say.
  const folder = raw.startsWith('/') ? trimSeparators(raw) : null
  const where = folder === null ? '' : shortPath(folder)
  const who = folder === null ? undefined : folderTeammatePlan(folder, ctx.teammates)
  const standing = who?.reuse === undefined ? undefined : ctx.teammates.find((t) => t.id === who.reuse)
  const standingName = standing === undefined ? undefined : standing.name.trim() === '' ? standing.id : standing.name
  // The OUTCOME, stated as soon as the folder allows it — agent, repository,
  // branch, in that order — so the line above Start work previews what the
  // press will do while the sentence is still being typed, not only after.
  const lane = FIRST_LAUNCH_ENGINES[LANE_ENGINE].name
  const outcome = preferred !== LANE_ENGINE
    ? `${FIRST_LAUNCH_ENGINES[preferred].name} will open a conversation in ${where}. Your message will open in the composer, not sent — no task branch; that needs ${lane}`
    : standingName !== undefined
      ? `${standingName} (${lane}) will work in ${where} on a separate branch`
      // M315. The scope promise stays ("may work only in" is D04's policy,
      // stated before it binds); the internal teammate name and the path said
      // twice went — a new user read three identifiers for one folder.
      : `${lane} will work on its own branch of ${folderBase(folder ?? '')}, and may work only in ${where}`
  // M395. The dead-end rule's words: a Start that cannot run says what it
  // waits for, and it is not step 1's question again ("say what you want to
  // work on" sat under step 3, repeating "What are you working on?").
  if (sentence === '') {
    return { kind: 'refused', field: 'intention', reason: folder === null ? DESCRIBE_FIRST : `${DESCRIBE_FIRST} — then ${outcome}` }
  }
  if (raw === '') return { kind: 'refused', field: 'folder', reason: 'choose the repository folder to work in' }
  if (folder === null) return { kind: 'refused', field: 'folder', reason: 'type the folder as a full path starting with / — or use Choose…' }
  // A teammate carries no backend, so D05's dispatch always creates a Claude
  // conversation: Codex alone cannot start a LANE. Rather than a wall on day
  // one (the README sells Codex), the start resolves to what the installed
  // engine CAN do — a conversation in the folder — and says so before it
  // happens. Checked after the sentence and folder, so their refusals stay named.
  if (preferred !== LANE_ENGINE) return { kind: 'chat', engine: preferred, folder, summary: outcome }
  const [first = '', ...more] = sentence.split('\n')
  const line = first.trim()
  const cut = line.length > FIRST_WORK_TITLE_MAX
  const title = cut ? `${line.slice(0, FIRST_WORK_TITLE_MAX - 1).trimEnd()}…` : line
  // The dispatch's first message already carries the title in its header, so
  // the description is what the title does NOT say: the rest of the lines —
  // or the whole line when the title had to cut it. The first cut repeated
  // the first line to the agent (the M205 critic).
  const rest = more.join('\n').trim()
  const description = cut ? sentence : rest === '' ? undefined : rest
  return {
    kind: 'start', title, ...(description === undefined ? {} : { description }), folder,
    teammate: folderTeammatePlan(folder, ctx.teammates),
    summary: outcome
  }
}

/**
 * M400 (B1). WHO works in a folder when the person has not picked — the ONE
 * reuse-or-mint rule, shared by the launcher's first start and every door
 * of the New task sheet, so the two cannot drift. A standing teammate whose
 * place contains the folder by PATH SEGMENT is reused (`prefer` first, the
 * last one the person used, when it still contains it); otherwise one is
 * planned whose ONLY place is exactly the folder. Pure: the mint itself
 * happens in Canvas's `teammateForFolder`, after the repository answer, and
 * nothing is minted on a refusal.
 */
export function folderTeammatePlan(folder: string, teammates: FirstWorkContext['teammates'], prefer?: string, agent: string = FIRST_LAUNCH_ENGINES[LANE_ENGINE].name): { reuse: string; mint?: undefined } | { reuse?: undefined; mint: { name: string; places: string[] } } {
  const at = trimSeparators(folder)
  const contains = (t: FirstWorkContext['teammates'][number]): boolean => t.places.some((place) => placeContains(place, at))
  const preferred = prefer === undefined ? undefined : teammates.find((t) => t.id === prefer && contains(t))
  const standing = preferred ?? teammates.find(contains)
  if (standing !== undefined) return { reuse: standing.id }
  // M403 (the M400 critic). The new teammate is named after the agent that
  // will do the work — the SAME name the sheet's who line and the launcher's
  // step 3 say ("Claude Code", "Codex"), so one agent never has two names
  // on one sheet, and a Codex start never mints a teammate called Claude.
  return { mint: { name: `${agent} · ${folderBase(at)}`, places: [at] } }
}

function folderBase(folder: string): string {
  return folder.split('/').filter((s) => s !== '').pop() ?? folder
}

/**
 * M205. Is the folder a repository? Asked of `git:status` BEFORE any mint.
 * Three arms, three fixes: work in it; install git; choose a repository — or
 * talk about this folder in a conversation instead, which needs no branch.
 */
export type FirstWorkRepoAnswer =
  /** `canonical`: the folder git works in, when the typed one is another spelling of it (a symlink) — the place to grant and the root to start in. */
  | { kind: 'repository'; canonical?: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'not-a-repository'; reason: string }

export function firstWorkRepoAnswer(status: RepoStatus, folder: string, top?: string | null): FirstWorkRepoAnswer {
  if (status.kind === 'status') {
    // M403 (the M400 critic). Home and the filesystem root are never a new
    // teammate's place: a grant there is everything the person owns, and a
    // dotfiles repository in $HOME is the ordinary way to reach this arm.
    const real = status.real === undefined ? undefined : comparable(status.real)
    if (status.home === true) return { kind: 'refused', reason: `${shortPath(trimSeparators(folder))} is your home folder — a task's agent would be granted everything in it; choose the repository's own folder` }
    if (comparable(folder) === '/' || real === '/') return { kind: 'refused', reason: 'the filesystem root is not a repository folder a task can be granted — choose the repository\'s own folder' }
    // A SYMLINK: the typed folder and git's top level are the same directory
    // under two spellings. main's gate judges the realpath, and placeContains
    // compares strings, so a place stored as the link either mints a twin or
    // is refused AFTER the card exists. The realpath is what is granted and
    // started in (never wider: it IS the chosen folder). A link to a
    // SUBFOLDER is the subfolder refusal below, judged on the realpath.
    if (real !== undefined && top !== undefined && top !== null) {
      const t = comparable(top)
      if (real !== t && real.startsWith(t === '/' ? '/' : `${t}/`)) {
        return { kind: 'refused', reason: `${shortPath(trimSeparators(folder))} is inside the repository ${shortPath(top)} — choose the repository's own folder` }
      }
      if (real === t && comparable(folder) !== t) return { kind: 'repository', canonical: trimSeparators(top) }
    }
    // A SUBFOLDER answers git too, but the lane is made from git's top level
    // and main's gate then judges that root against a grant of the subfolder
    // — a refusal AFTER a teammate, a card and a worktree exist, naming a fix
    // the form never offered (the M205 critic). Refused here, before any
    // mint, and the grant is never widened to the root on the person's behalf.
    const root = comparable(status.root)
    const typed = comparable(folder)
    if (typed !== root && typed.startsWith(root === '/' ? '/' : `${root}/`)) {
      return { kind: 'refused', reason: `${shortPath(trimSeparators(folder))} is inside the repository ${shortPath(status.root)} — choose the repository's own folder` }
    }
    return { kind: 'repository' }
  }
  if (status.kind === 'git-missing') return { kind: 'refused', reason: 'git was not found on this machine — a task works on its own branch; install git, or Ask without a folder' }
  // A mistyped path is not a plain folder: offering "chat in this folder" for
  // one that does not exist is the wrong fix.
  if (/no such file|cannot change to|ENOENT|does not exist/i.test(status.detail)) {
    return { kind: 'refused', reason: `${shortPath(trimSeparators(folder))} does not exist — check the path, or use Choose…` }
  }
  return { kind: 'not-a-repository', reason: `${shortPath(trimSeparators(folder))} is not a git repository — a task works on its own branch, so it needs one` }
}

/**
 * M440. The first-run card. Four steps, one primary, and no spawn: a toggle
 * records a preset, and the last step only names the existing sheet. Discovery
 * is a probe result the caller measured. A binary that timed out is not
 * "not installed" — that sentence would send a person to install a tool that
 * may already be there.
 */
export const ONBOARDING_RAIL = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'agents', label: 'Agents' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'task', label: 'First task' }
] as const

export type OnboardingStepId = typeof ONBOARDING_RAIL[number]['id']

export const AGENTS_STEP_TITLE = 'Which agents live on your canvas?'
export const AGENTS_STEP_LEAD = 'These were found on your PATH. Turn on the ones you want as presets.'
export const ONBOARDING_FOOTER = 'You can change all of this later in Settings. Nothing runs until you start it.'
export const STATE_PREVIEW_CAPTION = 'One colour per state, everywhere. The same words a panel uses.'
export const CUSTOM_COMMAND = { label: 'Add a custom command…', opens: 'preset-editor' } as const

/** Copied onto the clipboard. Nothing in this module runs it. */
export const INSTALL_COMMANDS: Readonly<Record<string, string>> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli'
}

export const ONBOARDING_AGENTS = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'gemini', label: 'Gemini CLI' }
] as const

export const PLAIN_SHELL = { id: 'shell', label: 'Plain shell', locked: true as const }

export function installCommand(id: string): string | null {
  return Object.prototype.hasOwnProperty.call(INSTALL_COMMANDS, id) ? INSTALL_COMMANDS[id] : null
}

export function readyLabel(ready: number): string {
  if (!(ready > 0)) return 'Turn one on to continue'
  if (ready === 1) return '1 agent ready'
  return `${ready} agents ready`
}

export function stepWords(step: OnboardingStepId): string {
  const index = ONBOARDING_RAIL.findIndex((row) => row.id === step)
  const at = index < 0 ? 0 : index + 1
  return `Step ${at} of ${ONBOARDING_RAIL.length}`
}

export interface AgentProbe {
  id: string
  path: string | null
  version?: string | null
  timedOut?: boolean
}

export interface CanvasAgentRow {
  id: string
  label: string
  /** `unknown` is a probe that did not answer. It is not `missing`. */
  phase: 'found' | 'missing' | 'unknown'
  status: string
  path?: string
  version?: string
  enabled: boolean
  locked: boolean
  install?: string
}

export interface AgentStepView {
  rows: CanvasAgentRow[]
  shell: CanvasAgentRow
  ready: number
  label: string
  canContinue: boolean
}

export function agentRows(probes: readonly AgentProbe[], enabled: readonly string[]): AgentStepView {
  const on = new Set(enabled)
  const rows = ONBOARDING_AGENTS.map((agent): CanvasAgentRow => {
    const probe = probes.find((row) => row.id === agent.id)
    const timedOut = probe?.timedOut === true
    const path = !timedOut && probe?.path !== undefined && probe.path !== null && probe.path !== '' ? probe.path : undefined
    const phase = timedOut || probe === undefined ? 'unknown' : path === undefined ? 'missing' : 'found'
    const version = phase === 'found' && probe?.version !== undefined && probe.version !== null && probe.version.trim() !== '' ? probe.version.trim() : undefined
    const install = installCommand(agent.id) ?? undefined
    return {
      id: agent.id,
      label: agent.label,
      phase,
      status: phase === 'found' ? 'found' : phase === 'missing' ? 'not installed' : 'discovery did not answer',
      ...(path === undefined ? {} : { path }),
      ...(version === undefined ? {} : { version }),
      enabled: phase === 'found' && on.has(agent.id),
      locked: false,
      ...(install === undefined ? {} : { install })
    }
  })
  const ready = rows.filter((row) => row.phase === 'found' && row.enabled).length
  return {
    rows,
    shell: { id: PLAIN_SHELL.id, label: PLAIN_SHELL.label, phase: 'found', status: 'always on', enabled: true, locked: true },
    ready,
    label: readyLabel(ready),
    canContinue: ready > 0
  }
}

/**
 * Step 3. Persistence is a sentence about tmux, and only when the probe
 * answered. An unanswered probe does not claim tmux is installed or absent.
 */
export function sessionsPersistence(tmux: { path: string | null; timedOut?: boolean } | undefined): { known: boolean; persist: boolean; sentence: string } {
  if (tmux === undefined || tmux.timedOut === true) {
    return { known: false, persist: false, sentence: 'Whether sessions survive quit is unknown until tmux answers.' }
  }
  if (tmux.path !== null && tmux.path !== '') {
    return { known: true, persist: true, sentence: 'Sessions survive quit. tmux is installed, so closing the app leaves them running.' }
  }
  return { known: true, persist: false, sentence: 'Sessions end when you quit, until tmux is installed.' }
}

/** Step 4 names the existing sheet. It does not spawn. */
export const FIRST_TASK_HANDOFF = { sheet: 'start-work', spawns: false } as const
