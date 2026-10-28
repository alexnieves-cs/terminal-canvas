import type { RuleDraft } from './lesson-proposal'
import { SKILL_NAME_RE, parseProofRecord, proofHolds, ruleShape, type ProofRecord } from './lesson-proof'

/**
 * M576–M579 (lane O). THE LIBRARY — the rules a person accepted, where each
 * came from, and the way to retire one.
 *
 * A rule is accepted only with a proof that HOLDS for its exact text
 * (`proofHolds`): the lane's promise is that nothing reaches CLAUDE.md on an
 * agent's say-so or on a guess. Accepting writes it where the agents read
 * it, in the repository's main tree:
 *
 * - **a CLAUDE.md line** goes inside ONE managed block, fenced by
 *   `<!-- tc:learned -->` … `<!-- /tc:learned -->`. The app rewrites only
 *   that block, from its own record, and never touches a byte outside it; a
 *   file without one gets it appended at the end. Retiring the last rule
 *   removes the block, and a file that held nothing else is removed with it.
 * - **a skill** is a project skill, `.claude/skills/<name>/SKILL.md`. Retire
 *   removes it only when the file is still byte-for-byte what was written
 *   (its hash is kept): a skill someone has since edited is theirs.
 *
 * Retired rules stay in the library, struck through, with when and why —
 * provenance outlives the rule, so "we tried that and it hurt" is kept.
 *
 * Pure: no DOM, no node. `verify:learn learn.library.*`.
 */

export type RuleState = 'active' | 'retired'

export interface LearnedRule extends RuleDraft {
  id: string
  root: string
  /** The proposal it was accepted from, and that proposal's lessons. */
  proposalId: string
  lessonIds: string[]
  proof: ProofRecord
  acceptedAt: number
  state: RuleState
  retiredAt?: number
  retiredWhy?: string
  /** A skill's SKILL.md as written, hashed — retire removes only an unedited file. */
  writtenHash?: string
}

export const RULES_MAX = 200
export const BLOCK_OPEN = '<!-- tc:learned -->'
export const BLOCK_CLOSE = '<!-- /tc:learned -->'
export const RETIRE_WHY_MAX = 300

/** The managed block for these rules, or '' when none is active. */
export function learnedBlock(rules: readonly LearnedRule[], eol = '\n'): string {
  const active = rules.filter((r) => r.state === 'active' && r.kind === 'claude-md').sort((a, b) => a.acceptedAt - b.acceptedAt)
  if (active.length === 0) return ''
  return [
    BLOCK_OPEN,
    '## Learned rules',
    '',
    '_Each line was proposed from a review lesson and proved by a replay in Terminal Canvas. Change them on its Lessons page: an edit made here is rewritten._',
    '',
    ...active.map((r) => `- ${r.text}`),
    BLOCK_CLOSE
  ].join(eol)
}

interface Span { start: number; end: number }

/**
 * Where the block's markers are: each only as a WHOLE LINE, and never inside
 * a fenced code block — a CLAUDE.md that documents this feature, in inline
 * code or a fenced example, mentions the markers without being the block
 * (M576's critic: the first version replaced everything between two
 * mentions). `end` is the end of the marker line, before its line break.
 */
function markers(text: string): { opens: Span[]; closes: Span[] } {
  const opens: Span[] = []
  const closes: Span[] = []
  let fence: string | null = null
  let pos = 0
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (f !== null) {
      if (fence === null) fence = f[1]
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null
    } else if (fence === null) {
      if (line === BLOCK_OPEN) opens.push({ start: pos, end: pos + line.length })
      else if (line === BLOCK_CLOSE) closes.push({ start: pos, end: pos + line.length })
    }
    pos += raw.length + 1
  }
  return { opens, closes }
}

/** Whether a file holds the block: none, exactly one, or markers that are not one block. */
export function learnedBlockState(text: string): 'none' | 'one' | 'malformed' {
  const { opens, closes } = markers(text)
  if (opens.length === 0 && closes.length === 0) return 'none'
  return opens.length === 1 && closes.length === 1 && closes[0].start >= opens[0].end ? 'one' : 'malformed'
}

/**
 * The file's new text with the block rewritten, or null when the file
 * should not exist (it held nothing but the block, and the block is gone).
 * Anything but exactly one open marker followed by one close marker is
 * refused (`malformed`) rather than guessed at: "replace to the end" would
 * eat what a person wrote after it, and with two blocks a retired rule would
 * live on in the one not rewritten. The block takes the file's own line
 * endings; accept adds one blank line before it, and retire takes back
 * exactly what accept added, so the person's bytes come back as they were.
 */
export function withLearnedBlock(existing: string | null, rules: readonly LearnedRule[]): { kind: 'text'; text: string | null } | { kind: 'malformed' } {
  const text = existing ?? ''
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const block = learnedBlock(rules, eol)
  const { opens, closes } = markers(text)
  if (opens.length === 0 && closes.length === 0) {
    if (block === '') return { kind: 'text', text: existing }
    if (text === '') return { kind: 'text', text: `${block}${eol}` }
    return { kind: 'text', text: `${text}${text.endsWith(eol) ? eol : `${eol}${eol}`}${block}${eol}` }
  }
  if (opens.length !== 1 || closes.length !== 1 || closes[0].start < opens[0].end) return { kind: 'malformed' }
  const before = text.slice(0, opens[0].start)
  const after = text.slice(closes[0].end)
  if (block !== '') return { kind: 'text', text: `${before}${block}${after}` }
  const head = before.endsWith(`${eol}${eol}`) ? before.slice(0, -eol.length) : before
  let tail = after.startsWith(eol) ? after.slice(eol.length) : after
  if (head === '') while (tail.startsWith(eol)) tail = tail.slice(eol.length)
  const joined = `${head}${tail}`
  return { kind: 'text', text: joined === '' ? null : joined }
}

/** Where a skill rule lives in the main tree. */
export function skillPath(name: string): string {
  return `.claude/skills/${name}/SKILL.md`
}

/** Accepting needs a proof that holds for this exact text. */
export function canAccept(rule: Pick<RuleDraft, 'text' | 'kind' | 'name' | 'description'>, proof: ProofRecord | undefined): { ok: true } | { ok: false; reason: string } {
  if (proof === undefined) return { ok: false, reason: 'prove the rule first — a replay with it applied must show the mistake gone and the check passing' }
  if (proof.ruleText !== rule.text || proof.ruleShape !== ruleShape(rule)) return { ok: false, reason: 'the rule changed since it was proved — prove it again' }
  if (!proofHolds(rule, proof)) return { ok: false, reason: `the proof did not hold: ${proof.reason}` }
  return { ok: true }
}

/** An active skill of this name already in the library blocks a second one: one file, one rule. */
export function nameTaken(rules: readonly LearnedRule[], name: string | undefined): boolean {
  return name !== undefined && rules.some((r) => r.state === 'active' && r.kind === 'skill' && r.name === name)
}

/** "accepted 3 days ago from 2 lessons · proved: …": the row's provenance line. */
export function provenance(r: LearnedRule): string {
  return `from ${r.lessonIds.length} lesson${r.lessonIds.length === 1 ? '' : 's'} · proved at ${r.proof.baseline.slice(0, 8)}: ${r.proof.reason}`
}

export function parseLearnedRule(raw: unknown): LearnedRule | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const str = (v: unknown): v is string => typeof v === 'string' && v !== ''
  if (!str(r.id) || !str(r.root) || !str(r.proposalId) || !str(r.text) || (r.kind !== 'claude-md' && r.kind !== 'skill')) return null
  if (typeof r.acceptedAt !== 'number' || (r.state !== 'active' && r.state !== 'retired')) return null
  if (r.kind === 'skill' && (!str(r.name) || !SKILL_NAME_RE.test(r.name) || typeof r.description !== 'string')) return null
  const proof = parseProofRecord(r.proof)
  if (proof === undefined) return null
  return {
    id: r.id, root: r.root, proposalId: r.proposalId, kind: r.kind, text: r.text, why: typeof r.why === 'string' ? r.why : '',
    lessonIds: Array.isArray(r.lessonIds) ? r.lessonIds.filter(str) : [],
    proof, acceptedAt: r.acceptedAt, state: r.state,
    ...(r.kind === 'skill' ? { name: r.name as string, description: r.description as string } : {}),
    ...(typeof r.retiredAt === 'number' ? { retiredAt: r.retiredAt } : {}),
    ...(str(r.retiredWhy) ? { retiredWhy: r.retiredWhy } : {}),
    ...(str(r.writtenHash) ? { writtenHash: r.writtenHash } : {})
  }
}
