import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { PROPOSALS_MAX, parseProposal, type Proposal, type ProposalState } from '../shared/lesson-proposal'
import { failedProof } from '../shared/lesson-proof'
import { RULES_MAX, parseLearnedRule, type LearnedRule } from '../shared/lesson-library'
import { slugOf } from './memory-store'
import { writeFileAtomic } from './atomic-file'

/**
 * M571–M572 (lane O). What a repository's lessons have become: the proposed
 * rules, one JSON document per main tree under `userData/learn/<slug>.json`.
 *
 * A DOCUMENT, not a log (unlike the lessons beside it): a proposal changes
 * state — a draft is dismissed, later proved and accepted — so it is
 * rewritten in place, through a temp file and a rename (`layout-store.ts`'s
 * rule: a crash mid-write leaves the old file, never half of the new one).
 *
 * Nothing here is scrubbed again: a draft is built from lessons that were
 * scrubbed on their way into the lesson store, by an agent that was given
 * no tools. A malformed file reads as empty with its count, never a throw.
 *
 * Plain node against an injected directory; `verify:learn learn.propose.*`.
 */

export interface LearnStore {
  proposals(root: string): { proposals: Proposal[]; skipped: number }
  put(p: Proposal): { ok: true } | { ok: false; reason: string }
  setState(root: string, id: string, state: ProposalState): Proposal | null
  /** M573. Replace one proposal by a function of itself; null when it is not kept. */
  update(root: string, id: string, fn: (p: Proposal) => Proposal): Proposal | null
  /** M576. The library: accepted rules, active and retired, oldest accepted first. */
  rules(root: string): LearnedRule[]
  /**
   * M576. Stored rule records this read could not parse. They are kept
   * through every write, and while there are any, Accept and Retire refuse:
   * the block is rebuilt from the records, so a rule the store cannot read
   * would silently lose its line in CLAUDE.md (M576's critic).
   */
  unreadRules(root: string): number
  /**
   * M576. Keep a rule and, in the SAME write, set its proposal's state — an
   * accepted rule whose draft still reads as a draft would offer Accept twice.
   */
  putRule(rule: LearnedRule, proposalState?: ProposalState): { ok: true } | { ok: false; reason: string }
  fileOf(root: string): string
}

interface Doc { proposals: unknown[]; rules?: unknown[] }

/**
 * `bootAt` is when this process started: a proposal still `proving` from
 * before it was being replayed when the app quit, and no replay is coming
 * back for it. It reads as a draft whose proof FAILED, saying so — never as
 * a replay forever in progress.
 */
export function createLearnStore(deps: { dir: string; bootAt?: number }): LearnStore {
  const bootAt = deps.bootAt ?? Date.now()
  const settle = (p: Proposal): Proposal => {
    if (p.state !== 'proving' || (p.provingAt ?? 0) >= bootAt) return p
    const { provingAt: _gone, ...rest } = p
    return { ...rest, state: 'draft', proof: failedProof(p, '', 'the replay was interrupted when the app quit — prove it again', p.provingAt ?? p.at, 0) }
  }
  const fileOf = (root: string): string => join(deps.dir, `${slugOf(root)}.json`)

  type Read = { proposals: Proposal[]; rules: LearnedRule[]; badRules: unknown[]; skipped: number }
  const readDoc = (root: string): Read => {
    const file = fileOf(root)
    if (!existsSync(file)) return { proposals: [], rules: [], badRules: [], skipped: 0 }
    let doc: Doc
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
      doc = typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Doc).proposals) ? parsed as Doc : { proposals: [] }
    } catch { return { proposals: [], rules: [], badRules: [], skipped: 1 } }
    const proposals: Proposal[] = []
    const rules: LearnedRule[] = []
    const badRules: unknown[] = []
    let skipped = 0
    for (const raw of doc.proposals) {
      const p = parseProposal(raw)
      // A proposal stored under another root is a hand-edited file; it does not belong here.
      if (p === null || p.root !== root) skipped += 1
      else proposals.push(settle(p))
    }
    for (const raw of Array.isArray(doc.rules) ? doc.rules : []) {
      const r = parseLearnedRule(raw)
      if (r === null || r.root !== root) { skipped += 1; badRules.push(raw) } else rules.push(r)
    }
    return { proposals, rules, badRules, skipped }
  }

  /** `rules` written back with the records it could not read, untouched, after them. */
  const writeDoc = (root: string, proposals: readonly Proposal[], parsed: readonly LearnedRule[], badRules: readonly unknown[]): void => {
    const rules = [...parsed, ...badRules]
    mkdirSync(deps.dir, { recursive: true })
    const file = fileOf(root)
    // A file that does not parse is MOVED ASIDE, never written over: it read
    // as empty, and rewriting it would silently lose every draft it held.
    if (existsSync(file)) {
      try { JSON.parse(readFileSync(file, 'utf8')) } catch { renameSync(file, `${file}.bad-${Date.now()}`) }
    }
    writeFileAtomic(file, `${JSON.stringify({ proposals, rules }, null, 2)}\n`)
  }

  return {
    fileOf,
    proposals: (root) => {
      const r = readDoc(root)
      return { proposals: [...r.proposals].sort((a, b) => b.at - a.at), skipped: r.skipped }
    },
    put(p) {
      const parsed = parseProposal(p)
      if (parsed === null) return { ok: false, reason: 'a proposal needs an id, a repository, a rule and a time' }
      const doc = readDoc(parsed.root)
      const kept = doc.proposals.filter((x) => x.id !== parsed.id)
      // The newest PROPOSALS_MAX: a dismissed draft is the first to go, never
      // a live one, and never one being proved (its verdict would have nowhere to land).
      const rank = (x: Proposal): number => (x.state === 'proving' ? 0 : x.state === 'dismissed' ? 2 : 1)
      const all = [parsed, ...kept].sort((a, b) => rank(a) - rank(b) || b.at - a.at).slice(0, PROPOSALS_MAX)
      try { writeDoc(parsed.root, all, doc.rules, doc.badRules) } catch (error) { return { ok: false, reason: `could not keep the proposal: ${String(error)}` } }
      return { ok: true }
    },
    setState(root, id, state) {
      const doc = readDoc(root)
      const at = doc.proposals.findIndex((p) => p.id === id)
      if (at < 0) return null
      const next = { ...doc.proposals[at], state }
      try { writeDoc(root, doc.proposals.map((p, i) => (i === at ? next : p)), doc.rules, doc.badRules) } catch { return null }
      return next
    },
    update(root, id, fn) {
      const doc = readDoc(root)
      const at = doc.proposals.findIndex((p) => p.id === id)
      if (at < 0) return null
      const next = parseProposal(fn(doc.proposals[at]))
      if (next === null) return null
      try { writeDoc(root, doc.proposals.map((p, i) => (i === at ? next : p)), doc.rules, doc.badRules) } catch { return null }
      return next
    },
    rules: (root) => [...readDoc(root).rules].sort((a, b) => a.acceptedAt - b.acceptedAt),
    unreadRules: (root) => readDoc(root).badRules.length,
    putRule(rule, proposalState) {
      const parsed = parseLearnedRule(rule)
      if (parsed === null) return { ok: false, reason: 'a rule needs an id, a repository, its proposal, its text and its proof' }
      const doc = readDoc(parsed.root)
      const others = doc.rules.filter((r) => r.id !== parsed.id)
      // RULES_MAX: a retired rule is the first to go, never an active one —
      // an active rule dropped from the record would be a block line nobody
      // can retire. Accept refuses at RULES_MAX active (learn.ts).
      const retired = others.filter((r) => r.state === 'retired').sort((a, b) => (a.retiredAt ?? 0) - (b.retiredAt ?? 0))
      const over = Math.max(0, others.length + 1 - RULES_MAX)
      const dropped = new Set(retired.slice(0, over).map((r) => r.id))
      const rules = [...others.filter((r) => !dropped.has(r.id)), parsed]
      const proposals = proposalState === undefined ? doc.proposals : doc.proposals.map((p) => (p.id === parsed.proposalId ? { ...p, state: proposalState } : p))
      try { writeDoc(parsed.root, proposals, rules, doc.badRules) } catch (error) { return { ok: false, reason: `could not keep the rule: ${String(error)}` } }
      return { ok: true }
    }
  }
}
