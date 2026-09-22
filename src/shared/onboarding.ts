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
  const sentence = req.intention.trim()
  if (sentence === '') return { kind: 'refused', field: 'intention', reason: 'say what you want to work on, in a sentence' }
  const raw = req.folder.trim()
  if (raw === '') return { kind: 'refused', field: 'folder', reason: 'choose the repository folder to work in' }
  // The renderer cannot expand `~` (it has no process.env — CLAUDE.md), and a
  // relative path is relative to nothing the person can see; a place is an
  // absolute folder or it is refused by main one step later with less to say.
  if (!raw.startsWith('/')) return { kind: 'refused', field: 'folder', reason: 'type the folder as a full path starting with / — or use Choose…' }
  const folder = trimSeparators(raw)
  // A teammate carries no backend, so D05's dispatch always creates a Claude
  // conversation: Codex alone cannot start a LANE. Rather than a wall on day
  // one (the README sells Codex), the start resolves to what the installed
  // engine CAN do — a conversation in the folder — and says so before it
  // happens. Checked after the sentence and folder, so their refusals stay named.
  const preferred = ctx.readiness.preferred
  if (preferred !== LANE_ENGINE) {
    return {
      kind: 'chat', engine: preferred, folder,
      summary: `${FIRST_LAUNCH_ENGINES[preferred].name} opens a conversation in ${shortPath(folder)}, your sentence in its composer — no task branch; that needs ${FIRST_LAUNCH_ENGINES[LANE_ENGINE].name}`
    }
  }
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
  const where = shortPath(folder)
  const standing = ctx.teammates.find((t) => t.places.some((place) => placeContains(place, folder)))
  if (standing !== undefined) {
    const who = standing.name.trim() === '' ? standing.id : standing.name
    return {
      kind: 'start', title, ...(description === undefined ? {} : { description }), folder,
      teammate: { reuse: standing.id },
      summary: `${who} works on ${where}, on its own branch`
    }
  }
  const base = folder.split('/').filter((s) => s !== '').pop() ?? folder
  const name = `Claude · ${base}`
  return {
    kind: 'start', title, ...(description === undefined ? {} : { description }), folder,
    teammate: { mint: { name, places: [folder] } },
    summary: `a new teammate, ${name}, may work only in ${where} — the work happens on its own branch`
  }
}

/**
 * M205. Is the folder a repository? Asked of `git:status` BEFORE any mint.
 * Three arms, three fixes: work in it; install git; choose a repository — or
 * talk about this folder in a conversation instead, which needs no branch.
 */
export type FirstWorkRepoAnswer =
  | { kind: 'repository' }
  | { kind: 'refused'; reason: string }
  | { kind: 'not-a-repository'; reason: string }

export function firstWorkRepoAnswer(status: RepoStatus, folder: string): FirstWorkRepoAnswer {
  if (status.kind === 'status') {
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
  if (status.kind === 'git-missing') return { kind: 'refused', reason: 'git was not found on this machine — Start work makes a branch for the task; install git, or Ask without a folder' }
  // A mistyped path is not a plain folder: offering "chat in this folder" for
  // one that does not exist is the wrong fix.
  if (/no such file|cannot change to|ENOENT|does not exist/i.test(status.detail)) {
    return { kind: 'refused', reason: `${shortPath(trimSeparators(folder))} does not exist — check the path, or use Choose…` }
  }
  return { kind: 'not-a-repository', reason: `${shortPath(trimSeparators(folder))} is not a git repository — Start work makes a branch for the task, so it needs one` }
}
