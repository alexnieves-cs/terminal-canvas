import { lessonSignature, signatureOverlap, type Lesson } from './lessons'
import type { RuleDraft } from './lesson-proposal'

/**
 * M573–M575 (lane O). THE PROOF — a drafted rule is kept only when replaying
 * the earlier task WITH the rule applied shows the mistake does not recur
 * and the task's check still passes. A rule nobody tested is a guess, and a
 * CLAUDE.md full of guesses is the thing this lane exists to avoid.
 *
 * The replay (main/lesson-proof-runner.ts) runs in a throwaway worktree at
 * the lesson's baseline — the commit the wrong work was made on top of —
 * with the rule written where an agent reads standing instructions (the
 * worktree's CLAUDE.md, or a skill under `.claude/skills/`). This module is
 * the part that decides, pure, so every verdict is driven by fixtures:
 *
 * - **recurred** — the replay changed a lesson's file again and its added
 *   lines repeat the lesson's fingerprint (RECUR_OVERLAP of it), or a
 *   commented line comes back word for word. A lesson with no fingerprint
 *   (a binary or unreadable discard) recurs when its file is touched at all:
 *   the only thing it can say is "not this file".
 * - **check-failed** — the task's check did not exit 0. A rule that stops a
 *   mistake by breaking the task is not a rule worth keeping.
 * - **no-change** — the replay changed nothing outside the rule's own file.
 *   That proves nothing either way, so it is not "holds".
 * - **no-check** — there was no check to run. The person is told to name one;
 *   "the mistake did not recur" alone is not a pass (the M475 rule: only a
 *   check exiting 0 is a pass).
 * - **holds** — none of the above. The only verdict that lets M576 accept.
 * - **failed** — the replay itself could not run (no worktree, the agent
 *   could not start, a timeout). Says why; proves nothing.
 *
 * Pure: no DOM, no node. `verify:learn learn.proof.*`.
 */

export type ProofVerdict = 'holds' | 'recurred' | 'check-failed' | 'no-change' | 'no-check' | 'failed'

export interface ProofRecurrence {
  lessonId: string
  path: string
  /** Share of the lesson's fingerprint the replay repeated (1 for a returned line or an unfingerprinted file). */
  overlap: number
}

export interface ProofRecord {
  verdict: ProofVerdict
  /** One sentence, the page's line. */
  reason: string
  at: number
  /** The commit the replay started from. */
  baseline: string
  /** The rule's text as it was proved — an edited rule is a different rule and reads unproved. */
  ruleText: string
  /**
   * The rest of what the rule IS (`ruleShape`): its kind and, for a skill, the
   * name and the description that decides when it loads. A proof stands for
   * all of it, not only the text (M576's critic).
   */
  ruleShape?: string
  check?: { command: string; exitCode: number | null; tail: string }
  recurrences: ProofRecurrence[]
  /** Files the replay changed, the rule's own file excluded. */
  changed: string[]
  durationMs: number
}

/** A lesson's fingerprint repeated this much in the replay's added lines is the mistake again. */
export const RECUR_OVERLAP = 0.5
export const PROOF_TAIL_MAX = 2000
export const PROOF_BRIEF_MAX = 8000

/** A skill's name: kebab-case, so it can never walk out of `.claude/skills/` (M573's critic). */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,47}$/

/** Where the rule is written in the replay's worktree. A name that is not kebab-case never reaches a path. */
export function ruleFilePath(rule: Pick<RuleDraft, 'kind' | 'name'>): string {
  if (rule.kind === 'claude-md') return 'CLAUDE.md'
  return `.claude/skills/${rule.name !== undefined && SKILL_NAME_RE.test(rule.name) ? rule.name : 'learned-rule'}/SKILL.md`
}

/**
 * Every path, from the worktree down, that must NOT be a symlink for the
 * rule to land inside the throwaway tree: a CLAUDE.md linked to AGENTS.md
 * or a `.claude/skills` linked to `~/.claude/skills` would put the trial
 * rule in the person's real file, where `worktree remove` never reaches.
 */
export function ruleFileSteps(rule: Pick<RuleDraft, 'kind' | 'name'>): string[] {
  const parts = ruleFilePath(rule).split('/')
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

/**
 * The rule applied to what the file held before: a CLAUDE.md line appended
 * under its own heading (a line added at the end of whatever the file says,
 * never replacing a byte of it); a skill as a whole SKILL.md with its
 * frontmatter. `existing` is the file's text, or null when it is absent.
 */
export function applyRule(rule: RuleDraft, existing: string | null): string {
  if (rule.kind === 'skill') {
    // The description is a JSON string, which is valid YAML: a `: ` or a
    // quote in it cannot break the frontmatter (M571's critic).
    return `---\nname: ${rule.name ?? 'learned-rule'}\ndescription: ${JSON.stringify((rule.description ?? '').replace(/\s+/g, ' ').trim())}\n---\n\n${rule.text.trim()}\n`
  }
  const head = existing === null || existing.trim() === '' ? '' : `${existing.replace(/\s*$/, '')}\n\n`
  return `${head}## Learned rule (on trial)\n\n- ${rule.text}\n`
}

/** git's C-quoted path (`"b/caf\303\251"`), unquoted to its UTF-8 text. */
export function unquoteGitPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) return raw
  const bytes: number[] = []
  const body = raw.slice(1, -1)
  const esc: Record<string, number> = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, '\\': 92 }
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i]
    if (c !== '\\') { for (const b of new TextEncoder().encode(c)) bytes.push(b); continue }
    const n = body[i + 1]
    if (/[0-7]/.test(n ?? '') && /^[0-7]{3}$/.test(body.slice(i + 1, i + 4))) { bytes.push(parseInt(body.slice(i + 1, i + 4), 8)); i += 3; continue }
    if (n !== undefined && esc[n] !== undefined) { bytes.push(esc[n]); i += 1; continue }
    bytes.push(92)
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

const headerPath = (rest: string): string | null => {
  const p = unquoteGitPath(rest.replace(/\t.*$/, ''))
  if (p === '/dev/null') return null
  return p.replace(/^[ab]\//, '')
}

/**
 * Per file, the lines the replay ADDED and REMOVED, from a unified diff
 * taken with git's default prefixes (`CONTENT_DIFF_CONFIG`'s pins). A
 * `+++`/`---` line is a header only between `diff --git` and the first
 * `@@`: inside a hunk, an added line whose text begins `++ ` is content.
 */
export function linesByFile(diff: string): Map<string, { added: string[]; removed: string[] }> {
  const out = new Map<string, { added: string[]; removed: string[] }>()
  let file: string | null = null
  let header = false
  let minus: string | null = null
  const entry = (f: string): { added: string[]; removed: string[] } => {
    let e = out.get(f)
    if (e === undefined) { e = { added: [], removed: [] }; out.set(f, e) }
    return e
  }
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) { header = true; file = null; minus = null; continue }
    if (header) {
      if (line.startsWith('--- ')) { minus = headerPath(line.slice(4)); continue }
      if (line.startsWith('+++ ')) { file = headerPath(line.slice(4)) ?? minus; if (file !== null) entry(file); continue }
      if (line.startsWith('@@')) header = false
      else continue
    }
    if (line.startsWith('@@')) continue
    if (file === null) continue
    if (line.startsWith('+')) entry(file).added.push(line.slice(1))
    else if (line.startsWith('-')) entry(file).removed.push(line.slice(1))
  }
  return out
}

/** Per file, the lines the replay added. */
export function addedByFile(diff: string): Map<string, string[]> {
  return new Map([...linesByFile(diff)].map(([k, v]) => [k, v.added]))
}

/** The paths from `git diff-index --name-status -z --no-renames`: `M\0path\0…`. */
export function changedFromNameStatus(z: string): string[] {
  const parts = z.split('\0')
  const out: string[] = []
  for (let i = 0; i + 1 < parts.length; i += 2) if (parts[i] !== '' && parts[i + 1] !== '') out.push(parts[i + 1])
  return [...new Set(out)].sort()
}

/**
 * Files a check commonly reads its commands or its configuration from. The
 * check runs whatever the tree holds after the agent, so a replay that
 * rewrote one can make its own check pass; such a "holds" names them.
 */
export const CHECK_FILE_RE = /(^|\/)(package\.json|Makefile|justfile|tsconfig[^/]*\.json|(vitest|jest|playwright|vite|babel|eslint)\.config\.[^/]+|\.eslintrc[^/]*|pytest\.ini|pyproject\.toml|setup\.cfg|tox\.ini|noxfile\.py|conftest\.py|Cargo\.toml|go\.mod|build\.gradle(\.kts)?|pom\.xml)$/

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** A lesson whose excerpt is only `-` lines is about something DELETED (lessons.ts's discardExcerpt). */
const isDeletion = (l: Lesson): boolean => {
  const lines = l.excerpt.split('\n').filter((x) => x.trim() !== '')
  return lines.length > 0 && lines.every((x) => x.startsWith('-'))
}

/**
 * Whether, and how much, the replay repeated each lesson. `touched` is every
 * file the replay changed (an empty new file has no lines but is touched).
 * A deletion lesson recurs when the replay DELETES its fingerprint again.
 */
export function recurrences(lessons: readonly Lesson[], lines: ReadonlyMap<string, { added: readonly string[]; removed: readonly string[] }>, touched: ReadonlySet<string> = new Set(lines.keys())): ProofRecurrence[] {
  const out: ProofRecurrence[] = []
  for (const l of lessons) {
    if (!touched.has(l.path) && !lines.has(l.path)) continue
    if (l.signature.length === 0) { out.push({ lessonId: l.id, path: l.path, overlap: 1 }); continue }
    const e = lines.get(l.path) ?? { added: [], removed: [] }
    const seen = isDeletion(l) ? e.removed : e.added
    const quote = norm(l.excerpt)
    if (l.source === 'comment' && quote !== '' && seen.some((x) => norm(x) === quote)) { out.push({ lessonId: l.id, path: l.path, overlap: 1 }); continue }
    const overlap = signatureOverlap(l.signature, lessonSignature(seen.join('\n')))
    if (overlap >= RECUR_OVERLAP) out.push({ lessonId: l.id, path: l.path, overlap: Math.round(overlap * 100) / 100 })
  }
  return out
}

/** Kind, name and description, as one string a proof records and Accept compares. */
export function ruleShape(rule: Pick<RuleDraft, 'kind' | 'name' | 'description'>): string {
  return JSON.stringify([rule.kind, rule.kind === 'skill' ? rule.name ?? '' : '', rule.kind === 'skill' ? rule.description ?? '' : ''])
}

export interface ProofFacts {
  lessons: readonly Lesson[]
  rule: RuleDraft
  baseline: string
  /**
   * The replay's diff against the tree as it stood AFTER the rule was written
   * and the setup ran (staged, untracked included) — so neither the rule nor
   * an `npm install`'s lockfile reads as the agent's work.
   */
  diff: string
  /** Every file it changed (`changedFromNameStatus`); derived from the diff when absent. */
  changed?: readonly string[]
  check: { command: string; exitCode: number | null; tail: string } | null
  at: number
  durationMs: number
}

/** The verdict, in its order: a recurrence outranks a failed check (it is the thing being tested). */
export function judgeProof(f: ProofFacts): ProofRecord {
  const lines = linesByFile(f.diff)
  const changed = [...new Set(f.changed ?? [...lines.keys()])].sort()
  const rec = recurrences(f.lessons, lines, new Set(changed))
  const ruleFile = ruleFilePath(f.rule)
  const base = {
    at: f.at, baseline: f.baseline, ruleText: f.rule.text, ruleShape: ruleShape(f.rule), recurrences: rec, changed, durationMs: f.durationMs,
    ...(f.check === null ? {} : { check: { command: f.check.command, exitCode: f.check.exitCode, tail: f.check.tail.slice(-PROOF_TAIL_MAX) } })
  }
  const n = (k: number, one: string): string => `${k} ${one}${k === 1 ? '' : 's'}`
  if (changed.length === 0) return { ...base, verdict: 'no-change', reason: 'the replay changed nothing, so it proves nothing — try a fuller brief' }
  if (rec.length > 0) return { ...base, verdict: 'recurred', reason: `the mistake came back in ${n(new Set(rec.map((r) => r.path)).size, 'file')} with the rule applied` }
  // The rule was in the tree the diff is taken against, so a change to its
  // file is the agent editing (or deleting) the rule under test.
  if (changed.includes(ruleFile)) return { ...base, verdict: 'failed', reason: `the replay changed ${ruleFile} itself, so it did not test the rule as written — prove it again` }
  if (f.check === null) return { ...base, verdict: 'no-check', reason: 'the mistake did not come back, but there was no check to run — name the task\'s check and prove it again' }
  if (f.check.exitCode !== 0) return { ...base, verdict: 'check-failed', reason: `the mistake did not come back, but the check failed (${f.check.exitCode === null ? 'it was stopped' : `exit ${f.check.exitCode}`})` }
  // Not touching a lesson's file at all can be the rule working ("leave the
  // generated file alone"), so it still holds — but the line says so.
  const lessonFiles = new Set(f.lessons.map((l) => l.path))
  const touched = changed.some((c) => lessonFiles.has(c))
  const checkFiles = changed.filter((c) => CHECK_FILE_RE.test(c))
  const notes = [
    ...(touched ? [] : ['none of them a lesson\'s file']),
    ...(checkFiles.length === 0 ? [] : [`it also changed ${checkFiles.slice(0, 3).join(', ')}${checkFiles.length > 3 ? ' and more' : ''}, which the check may read — look before accepting`])
  ]
  return { ...base, verdict: 'holds', reason: `the mistake did not come back and the check passed, over ${n(changed.length, 'changed file')}${notes.length === 0 ? '' : ` — ${notes.join('; ')}`}` }
}

/** A replay that could not run. */
export function failedProof(rule: RuleDraft, baseline: string, reason: string, at: number, durationMs: number): ProofRecord {
  return { verdict: 'failed', reason, at, baseline, ruleText: rule.text, ruleShape: ruleShape(rule), recurrences: [], changed: [], durationMs }
}

/**
 * Where a replay starts: the newest lesson's baseline among the rule's
 * lessons. Null when none kept one (a comment on a lane whose panel was
 * gone) — the page then says the proof needs a lesson with a baseline.
 */
export function replayBaseline(lessons: readonly Lesson[]): { sha: string; lesson: Lesson } | null {
  const withBase = [...lessons].filter((l) => l.baseline !== undefined).sort((a, b) => b.at - a.at)
  return withBase.length === 0 ? null : { sha: withBase[0].baseline as string, lesson: withBase[0] }
}

/** The proof stands for THIS rule only: an edited rule — text, kind, name or description — is unproved. */
export function proofHolds(rule: Pick<RuleDraft, 'text' | 'kind' | 'name' | 'description'>, proof: ProofRecord | undefined): boolean {
  return proof !== undefined && proof.verdict === 'holds' && proof.ruleText === rule.text && proof.ruleShape === ruleShape(rule)
}

export function parseProofRecord(raw: unknown): ProofRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const verdicts: ProofVerdict[] = ['holds', 'recurred', 'check-failed', 'no-change', 'no-check', 'failed']
  if (!verdicts.includes(r.verdict as ProofVerdict) || typeof r.reason !== 'string' || typeof r.at !== 'number' || typeof r.baseline !== 'string' || typeof r.ruleText !== 'string') return undefined
  const c = r.check as Record<string, unknown> | undefined
  const check = c !== undefined && typeof c === 'object' && c !== null && typeof c.command === 'string' && (typeof c.exitCode === 'number' || c.exitCode === null) && typeof c.tail === 'string'
    ? { command: c.command, exitCode: c.exitCode as number | null, tail: c.tail } : undefined
  const rec = Array.isArray(r.recurrences) ? r.recurrences.filter((x): x is ProofRecurrence => typeof x === 'object' && x !== null && typeof (x as ProofRecurrence).lessonId === 'string' && typeof (x as ProofRecurrence).path === 'string' && typeof (x as ProofRecurrence).overlap === 'number') : []
  return {
    verdict: r.verdict as ProofVerdict, reason: r.reason, at: r.at, baseline: r.baseline, ruleText: r.ruleText,
    ...(typeof r.ruleShape === 'string' ? { ruleShape: r.ruleShape } : {}),
    ...(check === undefined ? {} : { check }),
    recurrences: rec,
    changed: Array.isArray(r.changed) ? r.changed.filter((x): x is string => typeof x === 'string') : [],
    durationMs: typeof r.durationMs === 'number' ? r.durationMs : 0
  }
}
