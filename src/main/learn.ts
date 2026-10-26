import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { lessonFromComment, type CommentFacts, type Lesson } from '../shared/lessons'
import { checkDraft, clusterLessons, lessonsToSend, type Proposal } from '../shared/lesson-proposal'
import { RETIRE_WHY_MAX, RULES_MAX, canAccept, learnedBlockState, nameTaken, skillPath, withLearnedBlock, type LearnedRule } from '../shared/lesson-library'
import type { LearnDecideResult, LearnProposeResult, LearnProveResult, LearnRead, LearnRecordResult } from '../shared/learn'
import { PROOF_BRIEF_MAX, applyRule, failedProof, type ProofRecord } from '../shared/lesson-proof'
import type { ProofRequest } from './lesson-proof-runner'
import type { LessonStore } from './lesson-store'
import type { LearnStore } from './learn-store'
import type { ProposeOutcome } from './lesson-proposer'

/**
 * M570–M572 (lane O). The learn doors over main's stores — what `learn:*`
 * answers. Electron-free: `verify:learn` builds it over a temp directory,
 * fake git and a fake proposer, so the doors it proves are the ones main
 * registers.
 *
 * Every root the renderer names is resolved to its MAIN tree before it keys
 * anything: a lane's worktree and the checkout it was cut from teach one
 * repository, and a lesson filed under a worktree path would vanish with
 * the worktree.
 *
 * M576–M579. ACCEPT IS THE ONE DOOR THAT WRITES INTO THE PERSON'S
 * REPOSITORY, and only what a person pressed, for a draft whose proof holds
 * for its exact text: a CLAUDE.md line inside the app's fenced block (never
 * a byte outside it), or a new project skill (never over an existing file).
 * Never through a symlink — a linked CLAUDE.md or `.claude/skills` would
 * carry the write somewhere the page never named. A write the library could
 * not then record is undone. Retire rewrites the block without the rule, and
 * removes a skill only while its file is still exactly what was written.
 *
 * PROPOSE AND PROVE RUN AN AGENT, so each is refused unless `learn.agents`
 * is on (off by default: it spends money), read at the moment of the press,
 * and only ONE agent step runs at a time in this process — a second press
 * while one is drafting or replaying is refused by name rather than queued
 * into a second bill.
 */

export interface LearnDeps {
  lessons: LessonStore
  learn: LearnStore
  commonRootOf: (root: string) => Promise<string>
  /** The commit a panel's review is taken against, when main still holds it. */
  baselineOf: (panelId: string) => { root: string; sha: string } | undefined
  /** `learn.agents`, read at use. */
  agentsOn: () => boolean
  propose: (root: string, lessons: readonly Lesson[]) => Promise<ProposeOutcome>
  /** M573. The replay (main/lesson-proof-runner.ts). Never rejects in production; a throw is recorded as a failed proof. */
  prove: (req: ProofRequest) => Promise<ProofRecord>
  /** M573. Kill the running replay's agent (lesson-proof-runner.ts `stop`). */
  stopProof?: () => void
  /**
   * M576. The repository's files, for Accept and Retire. `read` is null ONLY
   * for a file that is absent and throws on any other failure — an unreadable
   * CLAUDE.md read as missing would be replaced by the block alone. `write`
   * creates parents and replaces through a temp file; `create` fails if the
   * file exists (a skill is never written over one, even one made a moment
   * ago); `remove` also drops the directory it leaves empty.
   */
  files: {
    read: (path: string) => string | null
    create: (path: string, text: string) => void
    write: (path: string, text: string) => void
    remove: (path: string) => void
    /** lstat, never followed. */
    isLink: (path: string) => boolean
  }
  now: () => number
}

export interface LearnDoors {
  read: (roots: unknown) => Promise<LearnRead>
  record: (raw: unknown) => Promise<LearnRecordResult>
  propose: (raw: unknown) => Promise<LearnProposeResult>
  decide: (raw: unknown) => Promise<LearnDecideResult>
  prove: (raw: unknown) => Promise<LearnProveResult>
  /** M573. Settles when the running replay (if any) has written its verdict — for the suite, and for a quit. */
  idle: () => Promise<void>
  /** M573. On quit: the running replay's agent is killed, never left billing in an orphaned tree. */
  stop: () => void
}

/** Off, an agent step says how to turn it on — one sentence for the page and the door. */
export const LEARN_AGENTS_OFF = 'drafting a rule runs an agent, which spends money — turn on "Lessons: let an agent draft and prove rules" in Settings first'

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function createLearnDoors(deps: LearnDeps): LearnDoors {
  // One agent step at a time, drafting or replaying: the lock is the word
  // the refusal names.
  let busy: 'drafting' | 'replaying' | null = null
  let running: Promise<void> = Promise.resolve()
  /** The proposal being replayed now. A `proving` record that is not this one has no replay coming back for it. */
  let replaying: string | null = null
  const unstick = (p: Proposal): Proposal => {
    if (p.state !== 'proving' || p.id === replaying) return p
    const { provingAt: _gone, ...rest } = p
    return { ...rest, state: 'draft', proof: failedProof(p, '', 'the replay ended without its verdict being kept — prove it again', p.provingAt ?? p.at, 0) }
  }

  const mainRoots = async (raw: unknown): Promise<string[]> => {
    const list = Array.isArray(raw) ? raw.filter(isStr).slice(0, 50) : []
    const out = new Set<string>()
    for (const r of list) {
      try { out.add(await deps.commonRootOf(r)) } catch { /* not a repository: nothing to read */ }
    }
    return [...out].sort()
  }

  const linked = (root: string, rel: string): string | undefined => {
    const parts = rel.split('/')
    return parts.map((_, i) => parts.slice(0, i + 1).join('/')).find((step) => deps.files.isLink(join(root, step)))
  }

  /** Refused while the library holds records it cannot read: the block is rebuilt from the records. */
  const unread = (root: string): LearnDecideResult | null => {
    const n = deps.learn.unreadRules(root)
    return n === 0 ? null : { ok: false, reason: `${n === 1 ? 'one stored rule' : `${n} stored rules`} could not be read, so CLAUDE.md is not rewritten — fix or remove ${n === 1 ? 'it' : 'them'} in ${deps.learn.fileOf(root)} first` }
  }

  const accept = (root: string, p: Proposal): LearnDecideResult => {
    const blocked = unread(root)
    if (blocked !== null) return blocked
    if (p.state !== 'draft') return { ok: false, reason: p.state === 'accepted' ? 'this rule is already in the library' : 'only a proved draft can be accepted' }
    const can = canAccept(p, p.proof)
    if (!can.ok) return can
    // The stored draft is checked again as the agent's answer was: a
    // hand-edited proposals file is not a way past the structure guards.
    const again = checkDraft({ ...p })
    if (again.kind === 'refused') return { ok: false, reason: again.reason.replace(/^the agent's /, 'the ') }
    if (again.draft.text !== p.text) return { ok: false, reason: 'the stored rule does not read as it was drafted — draft it again' }
    const rules = deps.learn.rules(root)
    if (rules.filter((r) => r.state === 'active').length >= RULES_MAX) return { ok: false, reason: `the library already holds ${RULES_MAX} active rules — retire one first` }
    if (p.kind === 'skill' && nameTaken(rules, p.name)) return { ok: false, reason: `a skill named ${p.name ?? ''} is already in the library — retire it first` }
    const proof = p.proof as ProofRecord
    const at = deps.now()
    const rule: LearnedRule = {
      // From the proposal, never the clock: a proposal is accepted at most once, and two accepts in one millisecond must not share a record.
      id: `rule:${p.id}`, root, proposalId: p.id, kind: p.kind, text: p.text, why: p.why,
      ...(p.kind === 'skill' ? { name: p.name as string, description: p.description ?? '' } : {}),
      lessonIds: p.lessonIds, proof, acceptedAt: at, state: 'active'
    }
    let undo: () => void
    try {
      if (p.kind === 'claude-md') {
        const file = join(root, 'CLAUDE.md')
        if (deps.files.isLink(file)) return { ok: false, reason: 'CLAUDE.md is a link in this repository — add the line by hand where it points' }
        const existing = deps.files.read(file)
        const next = withLearnedBlock(existing, [...rules, rule])
        if (next.kind === 'malformed') return { ok: false, reason: 'CLAUDE.md has the learned block\'s opening marker but not its close — fix the file by hand first' }
        deps.files.write(file, next.text ?? '')
        undo = () => (existing === null ? deps.files.remove(file) : deps.files.write(file, existing))
      } else {
        const rel = skillPath(rule.name as string)
        const link = linked(root, rel)
        if (link !== undefined) return { ok: false, reason: `${link} is a link in this repository — the skill was not written` }
        const file = join(root, rel)
        if (deps.files.read(file) !== null) return { ok: false, reason: `${rel} already exists — a learned skill never replaces one` }
        const text = applyRule(p, null)
        deps.files.create(file, text)
        rule.writtenHash = sha256(text)
        undo = () => deps.files.remove(file)
      }
    } catch (error) {
      return { ok: false, reason: `the rule could not be written: ${error instanceof Error ? error.message : String(error)}` }
    }
    const put = deps.learn.putRule(rule, 'accepted')
    if (!put.ok) {
      try { undo() } catch { /* the write stays; the reason says the library did not keep it */ }
      return put
    }
    return { ok: true, proposal: { ...p, state: 'accepted' }, rule }
  }

  const retire = (root: string, id: string, whyRaw: string): LearnDecideResult => {
    const blocked = unread(root)
    if (blocked !== null) return blocked
    const rules = deps.learn.rules(root)
    const rule = rules.find((r) => r.id === id)
    if (rule === undefined) return { ok: false, reason: 'that rule is not in this repository\'s library' }
    if (rule.state === 'retired') return { ok: false, reason: 'that rule is already retired' }
    const why = whyRaw.replace(/\s+/g, ' ').trim().slice(0, RETIRE_WHY_MAX)
    const next: LearnedRule = { ...rule, state: 'retired', retiredAt: deps.now(), ...(why === '' ? {} : { retiredWhy: why }) }
    let note: string | undefined
    let undo: () => void = () => undefined
    try {
      if (rule.kind === 'claude-md') {
        const file = join(root, 'CLAUDE.md')
        if (deps.files.isLink(file)) return { ok: false, reason: 'CLAUDE.md is a link in this repository — remove the line by hand where it points' }
        const existing = deps.files.read(file)
        // A block someone removed by hand is not put back to retire one line of
        // it: with no markers, withLearnedBlock would APPEND a fresh block.
        if (existing === null || learnedBlockState(existing) === 'none') note = 'the learned block was no longer in CLAUDE.md, so the file was not touched'
        else {
          const out = withLearnedBlock(existing, rules.map((r) => (r.id === id ? next : r)))
          if (out.kind === 'malformed') return { ok: false, reason: 'CLAUDE.md has the learned block\'s opening marker but not its close — fix the file by hand first' }
          if (out.text === null) deps.files.remove(file)
          else deps.files.write(file, out.text)
          undo = () => deps.files.write(file, existing)
        }
      } else {
        const rel = skillPath(rule.name as string)
        const link = linked(root, rel)
        if (link !== undefined) return { ok: false, reason: `${link} is a link in this repository — remove the skill by hand` }
        const file = join(root, rel)
        const text = deps.files.read(file)
        if (text === null) note = `${rel} was already gone`
        else if (rule.writtenHash !== undefined && sha256(text) === rule.writtenHash) {
          deps.files.remove(file)
          undo = () => deps.files.write(file, text)
        } else note = `${rel} was edited since it was accepted, so it was left in place — remove it by hand if it should go`
      }
    } catch (error) {
      return { ok: false, reason: `the rule could not be retired: ${error instanceof Error ? error.message : String(error)}` }
    }
    const put = deps.learn.putRule(next)
    if (!put.ok) {
      try { undo() } catch { /* the reason says the library did not keep it */ }
      return put
    }
    return { ok: true, rule: next, ...(note === undefined ? {} : { note }) }
  }

  return {
    async read(raw) {
      const roots = await mainRoots(raw)
      return {
        agents: deps.agentsOn(),
        repos: roots.map((root) => {
          const r = deps.lessons.list(root)
          return { root, lessons: r.lessons, skipped: r.skipped, clusters: clusterLessons(r.lessons), proposals: deps.learn.proposals(root).proposals.map(unstick), rules: deps.learn.rules(root) }
        })
      }
    },

    async record(raw) {
      // The renderer may record COMMENTS only. A discard lesson is main's to
      // take (lesson-capture.ts), from the diff main read itself, so a
      // renderer cannot file "the person threw this away" for work nobody
      // threw away.
      const facts = raw as CommentFacts
      if (!isRec(facts) || !isStr(facts.root) || !isStr(facts.taskId) || !isRec(facts.comment)) {
        return { ok: false, reason: 'a lesson from a comment needs its repository, its task and the comment' }
      }
      let lesson: Lesson | null
      try {
        lesson = lessonFromComment({ ...facts, root: await deps.commonRootOf(facts.root) })
      } catch {
        return { ok: false, reason: `${facts.root} is not inside a repository` }
      }
      if (lesson === null) return { ok: false, reason: 'only a comment of yours that was sent to the agent is a lesson' }
      // A sent comment never changes after it is sent, and the renderer's
      // harvest offers every sent comment it sees on each launch: one already
      // kept is a no-op, not a second line.
      const id = lesson.id
      if (deps.lessons.list(lesson.root).lessons.some((l) => l.id === id)) return { ok: true, id }
      const base = lesson.panelId === undefined ? undefined : deps.baselineOf(lesson.panelId)
      if (base !== undefined) lesson = { ...lesson, baseline: base.sha }
      const r = deps.lessons.add([lesson])
      return r.ok ? { ok: true, id: lesson.id } : r
    },

    async propose(raw) {
      if (!deps.agentsOn()) return { ok: false, reason: LEARN_AGENTS_OFF }
      if (!isRec(raw) || !isStr(raw.root) || !Array.isArray(raw.lessonIds)) return { ok: false, reason: 'a proposal names its repository and its lessons' }
      if (busy !== null) return { ok: false, reason: busy === 'drafting' ? 'a rule is already being drafted — wait for it to finish' : 'a rule is being proved — wait for the replay to finish' }
      busy = 'drafting'
      try {
        const root = await deps.commonRootOf(raw.root)
        const wanted = new Set(raw.lessonIds.filter(isStr))
        // Only lessons this repository holds: an id the renderer made up, or
        // one trimmed away since the page read, is not sent to the agent.
        // The newest PROPOSAL_LESSONS_MAX only, and the draft records exactly
        // those: "from N lessons" never counts one the agent did not read.
        const lessons = lessonsToSend(deps.lessons.list(root).lessons.filter((l) => wanted.has(l.id)))
        if (lessons.length === 0) return { ok: false, reason: 'none of those lessons is kept for this repository any more' }
        const outcome = await deps.propose(root, lessons)
        if (outcome.kind === 'refused') return { ok: false, reason: outcome.reason }
        const at = deps.now()
        const proposal = { ...outcome.draft, id: `proposal:${at.toString(36)}`, root, lessonIds: lessons.map((l) => l.id).sort(), at, state: 'draft' as const }
        const put = deps.learn.put(proposal)
        return put.ok ? { ok: true, proposal } : put
      } catch (error) {
        return { ok: false, reason: `the rule could not be drafted: ${error instanceof Error ? error.message : String(error)}` }
      } finally {
        busy = null
      }
    },

    async decide(raw) {
      if (!isRec(raw) || !isStr(raw.root) || !isStr(raw.id) || (raw.verdict !== 'dismiss' && raw.verdict !== 'accept' && raw.verdict !== 'retire')) return { ok: false, reason: 'an answer names its repository, its proposal and what to do' }
      let root: string
      try { root = await deps.commonRootOf(raw.root) } catch { return { ok: false, reason: `${raw.root} is not inside a repository` } }
      if (raw.verdict === 'retire') return retire(root, raw.id, typeof raw.why === 'string' ? raw.why : '')
      const current = deps.learn.proposals(root).proposals.find((p) => p.id === raw.id)
      // A draft being replayed is not dismissed, or accepted, under the replay's feet.
      if (current?.state === 'proving') return { ok: false, reason: 'this rule is being proved — wait for the replay to finish' }
      if (raw.verdict === 'accept') return current === undefined ? { ok: false, reason: 'that proposal is not kept for this repository' } : accept(root, current)
      const next = deps.learn.setState(root, raw.id, 'dismissed')
      return next === null ? { ok: false, reason: 'that proposal is not kept for this repository' } : { ok: true, proposal: next }
    },

    async prove(raw) {
      if (!deps.agentsOn()) return { ok: false, reason: LEARN_AGENTS_OFF }
      if (!isRec(raw) || !isStr(raw.root) || !isStr(raw.id)) return { ok: false, reason: 'a proof names its repository and its proposal' }
      if (busy !== null) return { ok: false, reason: busy === 'drafting' ? 'a rule is being drafted — wait for it to finish' : 'a rule is already being proved — wait for the replay to finish' }
      const brief = typeof raw.brief === 'string' ? raw.brief.trim() : ''
      const check = typeof raw.check === 'string' ? raw.check.trim() : ''
      if (brief === '') return { ok: false, reason: 'the replay needs the task it repeats — write the brief first' }
      if (brief.length > PROOF_BRIEF_MAX) return { ok: false, reason: `the brief is ${brief.length} characters — at most ${PROOF_BRIEF_MAX}` }
      if (/[\r\n]/.test(check)) return { ok: false, reason: 'the check is one command line' }
      busy = 'replaying'
      try {
        const root = await deps.commonRootOf(raw.root)
        const proposal = deps.learn.proposals(root).proposals.find((p) => p.id === raw.id)
        if (proposal === undefined || proposal.state !== 'draft') { busy = null; return { ok: false, reason: proposal === undefined ? 'that proposal is not kept for this repository' : 'only a draft can be proved' } }
        const ids = new Set(proposal.lessonIds)
        const lessons = deps.lessons.list(root).lessons.filter((l) => ids.has(l.id))
        if (lessons.length === 0) { busy = null; return { ok: false, reason: 'none of the lessons this rule was drafted from is kept any more' } }
        const started = deps.now()
        const marked = deps.learn.update(root, proposal.id, (p) => ({ ...p, state: 'proving', provingAt: started }))
        if (marked === null) { busy = null; return { ok: false, reason: 'the proposal could not be marked as being proved' } }
        // The replay runs on after this answer: it takes minutes, and the
        // page reads again until the verdict lands on the proposal.
        replaying = proposal.id
        running = (async () => {
          try {
            let proof: ProofRecord
            try {
              proof = await deps.prove({ root, rule: proposal, lessons, brief, check })
            } catch (error) {
              proof = failedProof(proposal, '', `the replay stopped on an error: ${error instanceof Error ? error.message : String(error)}`, deps.now(), deps.now() - started)
            }
            const kept = deps.learn.update(root, proposal.id, (p) => {
              const { provingAt: _done, ...rest } = p
              return { ...rest, state: 'draft', proof }
            })
            // The page then reads it unstuck (`unstick`): failed, saying so — never a replay forever in progress.
            if (kept === null) console.warn('[learn] the replay\'s verdict could not be kept', proposal.id, proof.verdict)
          } catch (error) {
            console.warn('[learn] the replay\'s verdict could not be kept', proposal.id, error)
          } finally {
            replaying = null
            busy = null
          }
        })()
        return { ok: true, proposal: marked }
      } catch (error) {
        busy = null
        return { ok: false, reason: `the proof could not start: ${error instanceof Error ? error.message : String(error)}` }
      }
    },

    idle: () => running,
    stop: () => { deps.stopProof?.() }
  }
}
