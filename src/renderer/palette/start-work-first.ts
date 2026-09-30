/**
 * M323. PROJECT-FIRST START — the decisions the Start work sheet makes before
 * a person has touched anything, pure and plain-node checked in
 * `verify:palette startwork-first.*`.
 *
 * The sheet used to open on eleven fields for "fix this bug". It now opens on
 * the repository and the task, with the agent and the backend ALREADY
 * answered from what the person used last (or the only sensible answer) and a
 * visible Change control; everything else sits under Options. Three rules
 * here fail silently if undone:
 *
 * **A preselection is a SUGGESTION the sheet states, never a hidden default.**
 * The chosen teammate and backend are named on the summary line, and a
 * teammate with no places is never preselected — it could not work anywhere,
 * so choosing it would turn "type and press Start" into a refusal.
 *
 * **A backend the task refuses is never kept just because it was last used.**
 * The preference is re-judged against THIS task's text on every change; the
 * first row that can do the task wins over a preferred row that cannot, so
 * the fast path never lands on a disabled Start.
 *
 * **Options opens itself when it holds something.** A recipe, an arrangement,
 * criteria, checks or deliverables that arrived with the start (a card's own,
 * a palette row's preset, a restored draft) are shown, not folded away —
 * a closed disclosure hiding a live choice is how a five-agent swarm starts
 * from a sheet that looked like a solo start.
 */
import type { PersistedTeammate } from '@shared/teammates'
import { BACKEND_IDS, DEFAULT_BACKEND, type AgentBackend } from '@shared/agent-backends'
import type { SwarmPresetId } from '@shared/swarm'
import { SWARM_PRESETS } from '@shared/swarm'
import type { BackendFit } from '@shared/backend-fit'
import { FIRST_LAUNCH_BACKENDS } from '@shared/onboarding'

/** What the last successful start used — the "existing configuration" a preselection reads. */
export interface StartWorkLast {
  teammateId?: string
  root?: string
  backend?: AgentBackend
}

/**
 * The teammate a start opens with: the one the caller named (a Teammates-pane
 * drop), then the one used last, then — when exactly one teammate has places —
 * that one. Several placed teammates and no history is a genuine question, so
 * the answer is '' and the picker opens.
 */
export function preselectTeammate(teammates: readonly PersistedTeammate[], given: string | undefined, last: StartWorkLast | null): string {
  const placed = (id: string | undefined): boolean => id !== undefined && teammates.some((t) => t.id === id && t.places.length > 0)
  // A named teammate is kept even without places: the caller chose it, and
  // the sheet's refusal names the fix. Only the GUESSES must be workable.
  if (given !== undefined && teammates.some((t) => t.id === given)) return given
  if (placed(last?.teammateId)) return last?.teammateId as string
  const withPlaces = teammates.filter((t) => t.places.length > 0)
  return withPlaces.length === 1 ? (withPlaces[0] as PersistedTeammate).id : ''
}

/** The repository a start opens with, once the teammate's list is read: a proposal's directory, then the last used, then the only one. '' asks. */
export function preselectRoot(repos: readonly { path: string }[], opts: { preferRoot?: string; last: StartWorkLast | null }): string {
  const prefer = opts.preferRoot
  if (prefer !== undefined) {
    const hit = [...repos].filter((r) => prefer === r.path || prefer.startsWith(`${r.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]
    if (hit !== undefined) return hit.path
  }
  const last = opts.last?.root
  if (last !== undefined && repos.some((r) => r.path === last)) return last
  return repos.length === 1 ? (repos[0] as { path: string }).path : ''
}

/**
 * The backend to use when the person has not picked one: the preferred row
 * (the card's own vendor, else the last used, else the default) unless THIS
 * task refuses it, then the first row that fits, then the first that is not
 * refused. Unavailable rows arrive already refused from the fit, so a CLI
 * discovery did not find is never the answer.
 */
export function preselectBackend(rows: readonly { backend: AgentBackend; fit: BackendFit }[], preferred: readonly (AgentBackend | undefined)[]): AgentBackend {
  const verdict = (b: AgentBackend): BackendFit['verdict'] | undefined => rows.find((r) => r.backend === b)?.fit.verdict
  for (const p of preferred) if (p !== undefined && verdict(p) !== undefined && verdict(p) !== 'refused') return p
  return rows.find((r) => r.fit.verdict === 'fits')?.backend ?? rows.find((r) => r.fit.verdict !== 'refused')?.backend ?? DEFAULT_BACKEND
}

/**
 * M403 (the M400 critic). The engine a NEW person would get: `onboardingReadiness`'s
 * rule — the first first-launch engine that is installed — read from the discovery
 * answer the sheet already holds (`available`, the preset probes of the same CLIs).
 * It comes before the default in the preference list, so a Codex-only machine's
 * Automatic says and mints Codex, as the launcher would. Undefined when nothing
 * answered (the default then stands, and its fit says why it cannot run).
 */
export function installedFirstBackend(available: Partial<Record<AgentBackend, boolean>> | undefined): AgentBackend | undefined {
  return available === undefined ? undefined : FIRST_LAUNCH_BACKENDS.find((b) => available[b] === true)
}

/** Whether Options must rest OPEN: it holds a choice that is not the default. */
export function optionsOpenAtRest(held: { recipeId?: string; swarm?: string; brief?: string; criteria?: string; checks?: string; deliverables?: string; params?: Record<string, string> }): boolean {
  const filled = (s: string | undefined): boolean => s !== undefined && s.trim() !== ''
  return filled(held.recipeId) || filled(held.swarm) || filled(held.brief) || filled(held.criteria) || filled(held.checks) || filled(held.deliverables) ||
    Object.values(held.params ?? {}).some(filled)
}

/**
 * THE DRAFT — what a person typed into the plain door, kept while they step
 * out to set up a repository or a teammate and restored when the sheet opens
 * again. Cleared by a successful start. Text fields only, plus the ids the
 * sheet re-validates against the live roster and repository list on restore.
 */
export interface StartWorkDraft {
  title: string
  teammateId?: string
  root?: string
  backend?: AgentBackend
  brief?: string
  criteria?: string
  checks?: string
  deliverables?: string
  swarm?: SwarmPresetId
  recipeId?: string
  aim?: string
  params?: Record<string, string>
  issueKey?: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/**
 * A stored draft, field by field: a malformed field costs itself and keeps
 * the rest, an unknown backend or arrangement is dropped rather than trusted,
 * and a draft with nothing in it parses to null so an empty sheet never says
 * "restored".
 */
export function parseStartDraft(raw: unknown): StartWorkDraft | null {
  if (!isRecord(raw)) return null
  const out: StartWorkDraft = { title: typeof raw.title === 'string' ? raw.title : '' }
  for (const k of ['teammateId', 'root', 'brief', 'criteria', 'checks', 'deliverables', 'recipeId', 'aim', 'issueKey'] as const) {
    const v = str(raw[k])
    if (v !== undefined) out[k] = v
  }
  if (typeof raw.backend === 'string' && (BACKEND_IDS as readonly string[]).includes(raw.backend)) out.backend = raw.backend as AgentBackend
  if (typeof raw.swarm === 'string' && Object.prototype.hasOwnProperty.call(SWARM_PRESETS, raw.swarm)) out.swarm = raw.swarm as SwarmPresetId
  if (isRecord(raw.params)) {
    const params = Object.fromEntries(Object.entries(raw.params).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''))
    if (Object.keys(params).length > 0) out.params = params
  }
  return draftIsEmpty(out) ? null : out
}

/** Nothing a person would miss: no text typed and no option set. The ids alone are not a draft — they are the preselection's to answer. */
export function draftIsEmpty(d: StartWorkDraft): boolean {
  return d.title.trim() === '' && !optionsOpenAtRest(d) && d.aim === undefined && d.issueKey === undefined
}

/** Last-used, parsed with the draft's rules. */
export function parseStartLast(raw: unknown): StartWorkLast | null {
  if (!isRecord(raw)) return null
  const out: StartWorkLast = {}
  const t = str(raw.teammateId); if (t !== undefined) out.teammateId = t
  const r = str(raw.root); if (r !== undefined) out.root = r
  if (typeof raw.backend === 'string' && (BACKEND_IDS as readonly string[]).includes(raw.backend)) out.backend = raw.backend as AgentBackend
  return Object.keys(out).length === 0 ? null : out
}

/* Storage: localStorage, wrapped (shell/useDockExpanded.ts's rule) — a
   per-viewer convenience that must never break the sheet when it throws. */
const DRAFT_KEY = 'tc.startWork.draft'
const LAST_KEY = 'tc.startWork.last'
const read = (key: string): unknown => { try { const raw = window.localStorage.getItem(key); return raw === null ? null : JSON.parse(raw) } catch { return null } }
const write = (key: string, value: unknown): void => { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* this run keeps nothing */ } }

export const startDraftStore = {
  load: (): StartWorkDraft | null => parseStartDraft(read(DRAFT_KEY)),
  save: (d: StartWorkDraft): void => write(DRAFT_KEY, draftIsEmpty(d) ? null : d),
  clear: (): void => write(DRAFT_KEY, null),
  last: (): StartWorkLast | null => parseStartLast(read(LAST_KEY)),
  remember: (l: StartWorkLast): void => write(LAST_KEY, l)
}
