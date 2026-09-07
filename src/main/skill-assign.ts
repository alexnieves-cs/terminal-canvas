/**
 * M130. Assignments: a shelf column, or a single skill, attaches to a
 * teammate — never a second brief-append path (M100 already owns the one
 * append; see `main/index.ts`) and never a renderer-side copy of it.
 *
 * The claim is precise: skills are NAMED to the agent. This app does not
 * load, install or activate anything — the same restraint
 * `agent-session.ts` shows when it declines to report a cost codex never
 * gave.
 *
 * A project-scoped skill's "repository" is resolved as the chat's own cwd —
 * simpler than reading the toolbox entry's `sourcePath` back apart, and
 * sufficient: a project skill is, by definition, the project the chat runs
 * in, so the chat's cwd already names the one repository whose skill this
 * is. Main already has this string (`resolveCwd`'s result) at the one spawn
 * site, with no extra read.
 */
import { parseSkillKey, type SkillKey } from '@shared/skills'
import { insidePlace, placeRefusal, type Realpath } from '@shared/places'
import type { PersistedTeammate } from '@shared/teammates'

/**
 * M130 fix round 1. A teammate chat's cwd is often a worktree LANE (M113's
 * board dispatch), living under `userData/worktrees` and outside every
 * place by construction (`main/places.ts`'s own reason for `worktreeRootOf`)
 * — never the repository a project skill belongs to. Translate BEFORE
 * `skillsForBrief` ever sees it, the same way `placesGate` already does,
 * or a project skill whose repository IS in the teammate's places is
 * dropped from the brief anyway, for a reason nobody could see.
 */
export function repoRootForBrief(cwd: string, worktreeRootOf: (path: string) => string | undefined): string {
  return worktreeRootOf(cwd) ?? cwd
}

export interface SkillsForBrief {
  /** Names only — never a path, a scope or anything an agent could act on beyond reading the word. */
  named: string[]
  /** A project-scoped skill outside the teammate's places, dropped from the brief. */
  refused: { name: string; repoRoot: string }[]
}

/**
 * The brief's own filter: every assigned key resolves to a bare name, except
 * a project-scoped one whose repository is outside the teammate's places,
 * which is dropped here (never named to the agent) and reported in
 * `refused` for the assign door's own refusal.
 */
export function skillsForBrief(
  teammate: PersistedTeammate,
  repoRoot: string,
  realpath: Realpath
): SkillsForBrief {
  const named: string[] = []
  const refused: { name: string; repoRoot: string }[] = []
  for (const key of teammate.skills ?? []) {
    const parsed = parseSkillKey(key)
    if (parsed === null) continue
    if (parsed.scope === 'project' && !insidePlace(repoRoot, teammate.places, realpath)) {
      refused.push({ name: parsed.name, repoRoot })
      continue
    }
    named.push(parsed.name)
  }
  return { named, refused }
}

/** Empty when there is nothing to say — an empty brief line would read as a feature that runs anyway. */
export function skillsBriefLine(named: readonly string[]): string {
  return named.length === 0 ? '' : `\n\nSkills available to you here: ${named.join(', ')}.`
}

/**
 * A project-scoped assignment refused BY NAME — naming the REPOSITORY (the
 * actionable fix) and never a worktree path under `userData/worktrees`
 * (M114's rule: a refusal must not name a path nobody should add).
 */
export function assignRefusal(
  scope: 'user' | 'project' | 'local',
  repoRoot: string,
  teammate: PersistedTeammate,
  realpath: Realpath
): string | null {
  if (scope !== 'project') return null
  if (insidePlace(repoRoot, teammate.places, realpath)) return null
  return placeRefusal(teammate.name, repoRoot)
}

/**
 * M130 fix round 2. Every project-scoped key the teammate's record now
 * carries that this REPOSITORY makes invisible — the full list, computed
 * with the REAL, symlink-resolved `insidePlace` (never the renderer's rough
 * prefix guess), for `teammate:save`'s own response.
 */
export function notVisibleFor(
  teammate: PersistedTeammate,
  repoRoot: string,
  realpath: Realpath
): { name: string; repoRoot: string }[] {
  const out: { name: string; repoRoot: string }[] = []
  for (const key of teammate.skills ?? []) {
    const parsed = parseSkillKey(key)
    if (parsed === null) continue
    if (assignRefusal(parsed.scope, repoRoot, teammate, realpath) !== null) out.push({ name: parsed.name, repoRoot })
  }
  return out
}

export type AssignResult = { ok: true; teammate: PersistedTeammate } | { ok: false; reason: string }

/**
 * Assign one or more keys to a teammate, keeping every key the teammate
 * already had. An unknown teammate is refused by name. Returns the whole
 * next record — the caller writes it through the ordinary `teammate:save`,
 * never a bespoke path.
 */
export function assignSkillsToTeammate(
  teammates: readonly PersistedTeammate[],
  teammateId: string,
  keys: readonly SkillKey[]
): AssignResult {
  const t = teammates.find((x) => x.id === teammateId)
  if (t === undefined) return { ok: false, reason: `no teammate is called ${teammateId} — it may have been deleted; open the Teammates pane` }
  const existing = t.skills ?? []
  const merged = Array.from(new Set([...existing, ...keys]))
  return { ok: true, teammate: { ...t, skills: merged } }
}
