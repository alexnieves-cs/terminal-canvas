import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { panelPath } from '@renderer/palette/panel-name'
import { displayPath } from '@shared/display-path'
import { lessonPlace, type Lesson } from '@shared/lessons'
import { draftLabel, type LessonCluster, type Proposal } from '@shared/lesson-proposal'
import { ruleShape, type ProofRecord } from '@shared/lesson-proof'
import { canAccept, provenance, type LearnedRule } from '@shared/lesson-library'
import type { LearnRead, LearnRepo } from '@shared/learn'
import { openSettingsPage } from '@renderer/settings/open'
import { agoWords } from '@shared/time-ago'

/**
 * M570–M572 (lane O). The Lessons page: what this canvas's repositories have
 * been taught, and the rules drafted from it.
 *
 * The repositories are the folders the canvas's panels sit in, resolved by
 * main to their main trees — the page never asks for a repository nobody
 * here works in, and a lane's worktree reads as the repository it came from.
 *
 * Lessons are shown grouped by the mistake they share (`clusterLessons`),
 * because a rule is drafted from a group, never from one file's history
 * alone when others say the same. "Draft a rule" is the one press here that
 * runs an agent: it is disabled, with the sentence that says how to turn it
 * on, while `learn.agents` is off. A draft is text to read.
 *
 * M573. Prove replays the task with the draft applied. The brief and the
 * check are shown, prefilled from the lessons' task, and are the person's
 * to confirm or fix before anything runs — a replay of the wrong task
 * proves nothing. While a replay runs the page reads again every few
 * seconds; the verdict and its evidence (the check's tail, the files where
 * the mistake came back) land on the draft.
 *
 * M576–M579. Accept appears only on a draft whose proof holds for its exact
 * text, and its title says what it writes and where. The library lists every
 * accepted rule with where it came from; Retire takes it back out of
 * CLAUDE.md (or removes the skill, unless someone has edited it) and keeps
 * the row, struck through, with the reason.
 */
export interface LearnPageProps {
  panels: readonly Panel[]
  /** M605. The Review page's other tab, where lessons come from. */
  onShowQueue?: () => void
}

const ago = (at: number, now: number): string => agoWords(now - at)

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export function LearnPage(p: LearnPageProps): JSX.Element {
  // Sorted and joined so a re-render with the same folders asks main nothing new.
  const key = useMemo(() => [...new Set(p.panels.map(panelPath).filter((x): x is string => x !== undefined))].sort().slice(0, 50).join('\n'), [p.panels])
  const [read, setRead] = useState<LearnRead | null>(null)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])
  useEffect(() => {
    let live = true
    const roots = key === '' ? [] : key.split('\n')
    void window.canvas.learn.read(roots).then((r) => { if (live) setRead(r) }, () => { if (live) setRead({ repos: [], agents: false }) })
    return () => { live = false }
  }, [key, tick])
  // A replay takes minutes and answers by changing the proposal: read again
  // while one is running, and stop when none is.
  const proving = (read?.repos ?? []).some((r) => r.proposals.some((x) => x.state === 'proving'))
  useEffect(() => {
    if (!proving) return
    const t = window.setInterval(refresh, 5000)
    return () => window.clearInterval(t)
  }, [proving, refresh])

  const now = Date.now()
  const repos = (read?.repos ?? []).filter((r) => r.lessons.length > 0 || r.skipped > 0 || r.proposals.length > 0 || r.rules.length > 0)
  return (
    <section className="learn" data-learn-page aria-label="Lessons">
      <header className="learn__head">
        <h2 className="learn__title">Lessons</h2>
        <span className="learn__note">what your reviews taught the agents here</span>
      </header>
      {read === null ? (
        <p className="learn__empty" data-learn-empty="reading">Reading…</p>
      ) : repos.length === 0 ? (
        <p className="learn__empty" data-learn-empty="none">
          Nothing learned yet. A lesson is kept when you discard a file in a review, or send a review comment to an agent.
          {p.onShowQueue !== undefined && <>{' '}<button type="button" className="pf__verb pf__verb--word" data-learn-show-queue onClick={p.onShowQueue}>See what is ready to review</button></>}
        </p>
      ) : repos.map((repo) => <RepoSection key={repo.root} repo={repo} agents={read.agents} now={now} onChanged={refresh} />)}
    </section>
  )
}

function RepoSection({ repo, agents, now, onChanged }: { repo: LearnRepo; agents: boolean; now: number; onChanged: () => void }): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const byId = new Map(repo.lessons.map((l) => [l.id, l]))
  const drafts = repo.proposals.filter((x) => x.state === 'draft' || x.state === 'proving')

  const draft = (c: LessonCluster): void => {
    if (busy !== null) return
    setBusy(c.id)
    setNote(null)
    void window.canvas.learn.propose({ root: repo.root, lessonIds: c.lessonIds }).then((r) => {
      setBusy(null)
      if (!r.ok) setNote(r.reason)
      onChanged()
    }, () => { setBusy(null); setNote('the rule could not be drafted') })
  }
  const dismiss = (x: Proposal): void => {
    void window.canvas.learn.decide({ root: repo.root, id: x.id, verdict: 'dismiss' }).then((r) => { if (!r.ok) setNote(r.reason); onChanged() }, () => setNote('the draft could not be dismissed'))
  }
  const accept = (x: Proposal): void => {
    setNote(null)
    void window.canvas.learn.decide({ root: repo.root, id: x.id, verdict: 'accept' }).then((r) => { setNote(r.ok ? r.note ?? null : r.reason); onChanged() }, () => setNote('the rule could not be accepted'))
  }
  const retire = (rule: LearnedRule, why: string): void => {
    setNote(null)
    void window.canvas.learn.decide({ root: repo.root, id: rule.id, verdict: 'retire', why }).then((r) => { setNote(r.ok ? r.note ?? null : r.reason); onChanged() }, () => setNote('the rule could not be retired'))
  }
  const where = (r: Pick<Proposal, 'kind' | 'name'>): string => (r.kind === 'claude-md' ? 'CLAUDE.md, inside its learned-rules block' : `.claude/skills/${r.name ?? ''}/SKILL.md`)

  return (
    <section className="learn__repo" data-learn-repo={repo.root} aria-label={displayPath(repo.root).short}>
      <h3 className="learn__repo-name" title={repo.root}>
        {displayPath(repo.root).short}
        <span className="learn__count">{plural(repo.lessons.length, 'lesson')}</span>
      </h3>
      {repo.skipped > 0 && <p className="learn__note" data-learn-skipped>{plural(repo.skipped, 'stored line')} could not be read</p>}
      {!agents && repo.lessons.length > 0 && (
        // M600. The reason the Draft and Prove buttons are off, said on the page
        // (not only in their tooltips, which a keyboard or touch never shows),
        // with the setting it names one press away.
        <p className="learn__note" id={`learn-off-${repo.root}`} data-learn-agents="off">
          Drafting a rule runs an agent, so it is off until you turn on “Lessons: let an agent draft and prove rules” in Settings.{' '}
          <button type="button" className="pf__verb pf__verb--word" data-learn-open-settings onClick={() => openSettingsPage('agents')}>Open Agents settings</button>
        </p>
      )}
      {note !== null && <p className="learn__note" data-learn-refusal>{note}</p>}

      {drafts.length > 0 && (
        <ul className="learn__list" aria-label="Drafted rules">
          {drafts.map((x) => (
            <li key={x.id} className="learn-draft" data-learn-draft={x.kind}>
              <span className="learn-draft__label">Draft · {draftLabel(x)} · from {plural(x.lessonIds.length, 'lesson')}</span>
              {x.kind === 'skill' && x.description !== undefined && <p className="learn-draft__why">{x.description}</p>}
              <pre className="learn-draft__text">{x.text}</pre>
              {x.why !== '' && <p className="learn-draft__why">{x.why}</p>}
              {x.state === 'proving'
                ? <p className="learn-draft__proof" data-learn-proof="proving">Proving… replaying the task in a scratch copy with this rule applied</p>
                : x.proof !== undefined && <ProofLine proof={x.proof} stale={x.proof.ruleText !== x.text || x.proof.ruleShape !== ruleShape(x)} />}
              {x.state === 'draft' && (
                <ProveForm repo={repo} proposal={x} agents={agents} lessons={x.lessonIds.map((id) => byId.get(id)).filter((l): l is Lesson => l !== undefined)}
                  onStarted={onChanged} onRefused={setNote} />
              )}
              <span className="learn-draft__verbs">
                {x.state === 'draft' && canAccept(x, x.proof).ok && (
                  <button type="button" className="pf__verb pf__verb--word" data-learn-verb="accept" title={`Write this rule into ${where(x)} in ${displayPath(repo.root).short} — the one press here that changes your repository`} onClick={() => accept(x)}>Accept</button>
                )}
                <button type="button" className="pf__verb pf__verb--word" data-learn-verb="dismiss" disabled={x.state === 'proving'} title="Drop this draft: nothing was written anywhere" onClick={() => dismiss(x)}>Dismiss</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {repo.rules.length > 0 && (
        <ul className="learn__list" aria-label="Library">
          {[...repo.rules].reverse().map((r) => <RuleRow key={r.id} rule={r} now={now} where={where(r)} onRetire={retire} />)}
        </ul>
      )}

      <ul className="learn__list" aria-label="Lessons">
        {repo.clusters.map((c) => {
          const members = c.lessonIds.map((id) => byId.get(id)).filter((l): l is Lesson => l !== undefined).sort((a, b) => b.at - a.at)
          return (
            <li key={c.id} className="learn-cluster" data-learn-cluster={c.lessonIds.length}>
              <span className="learn-cluster__head">
                <span className="learn-cluster__title">{plural(members.length, 'lesson')} about {c.paths.length === 1 ? c.paths[0] : plural(c.paths.length, 'file')}</span>
                <button type="button" className="pf__verb pf__verb--word" data-learn-verb="draft" disabled={!agents || busy !== null}
                  aria-describedby={agents ? undefined : `learn-off-${repo.root}`}
                  title={agents ? 'Ask an agent with no tools for one rule that would have prevented these — a draft you read, nothing is written' : 'Turn on “Lessons: let an agent draft and prove rules” in Settings first'}
                  onClick={() => draft(c)}>{busy === c.id ? 'Drafting…' : 'Draft a rule'}</button>
              </span>
              <ul className="learn__list">
                {members.map((l) => <LessonRow key={l.id} lesson={l} now={now} />)}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const VERDICT_WORD: Record<ProofRecord['verdict'], string> = {
  holds: 'Proved',
  recurred: 'The mistake came back',
  'check-failed': 'The check failed',
  'no-change': 'Nothing changed',
  'no-check': 'No check',
  failed: 'The replay could not run'
}

function ProofLine({ proof, stale }: { proof: ProofRecord; stale: boolean }): JSX.Element {
  return (
    <div className="learn-draft__proof" data-learn-proof={stale ? 'stale' : proof.verdict}>
      <p className="learn-draft__why"><strong>{stale ? 'Proved for an earlier wording' : VERDICT_WORD[proof.verdict]}</strong> — {proof.reason}</p>
      {(proof.check !== undefined || proof.recurrences.length > 0) && (
        <details className="learn-draft__evidence">
          <summary>Evidence</summary>
          {proof.recurrences.map((r) => <p key={r.lessonId} className="learn-draft__why">came back in {r.path} ({Math.round(r.overlap * 100)}% of the lesson)</p>)}
          {proof.changed.length > 0 && <p className="learn-draft__why">changed: {proof.changed.slice(0, 12).join(', ')}{proof.changed.length > 12 ? ` and ${proof.changed.length - 12} more` : ''}</p>}
          {proof.check !== undefined && (
            <>
              <p className="learn-draft__why">check <code>{proof.check.command}</code> {proof.check.exitCode === null ? 'was stopped' : `exited ${proof.check.exitCode}`}</p>
              {proof.check.tail.trim() !== '' && <pre className="learn-lesson__excerpt">{proof.check.tail}</pre>}
            </>
          )}
        </details>
      )}
    </div>
  )
}

/** The brief and check a replay will use, prefilled and editable; nothing runs until Run the proof. */
function ProveForm({ repo, proposal, agents, lessons, onStarted, onRefused }: {
  repo: LearnRepo; proposal: Proposal; agents: boolean; lessons: readonly Lesson[]; onStarted: () => void; onRefused: (reason: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const newest = [...lessons].sort((a, b) => b.at - a.at)
  const [brief, setBrief] = useState(() => newest.find((l) => l.brief !== undefined)?.brief ?? '')
  const [check, setCheck] = useState(() => (newest.find((l) => l.checks !== undefined)?.checks ?? []).join(' && '))
  const hasBase = lessons.some((l) => l.baseline !== undefined)
  if (!open) {
    return (
      <span className="learn-draft__verbs">
        <button type="button" className="pf__verb pf__verb--word" data-learn-verb="prove" disabled={!agents || !hasBase}
          aria-describedby={!agents ? `learn-off-${repo.root}` : undefined}
          title={!agents ? 'Turn on “Lessons: let an agent draft and prove rules” in Settings first' : !hasBase ? 'None of these lessons kept the commit its work was made on, so there is nothing to replay from' : 'Replay the task in a scratch copy with this rule applied'}
          onClick={() => setOpen(true)}>{proposal.proof === undefined ? 'Prove…' : 'Prove again…'}</button>
        {/* M600. Said beside the button, not only in its tooltip. */}
        {agents && !hasBase && <span className="learn__note" data-learn-prove-reason>Nothing to replay from: none of these lessons kept the commit its work was made on.</span>}
      </span>
    )
  }
  const run = (): void => {
    void window.canvas.learn.prove({ root: repo.root, id: proposal.id, brief, check }).then((r) => {
      if (!r.ok) { onRefused(r.reason); return }
      setOpen(false)
      onStarted()
    }, () => onRefused('the proof could not start'))
  }
  return (
    <div className="learn-prove" data-learn-prove>
      <label className="learn-prove__field">
        <span>The task to replay</span>
        <textarea className="learn-prove__input" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What the agent was asked to do" />
      </label>
      <label className="learn-prove__field">
        <span>The check that decides it passed</span>
        <input className="learn-prove__input" value={check} onChange={(e) => setCheck(e.target.value)} placeholder="npm test" />
      </label>
      <p className="learn__note">An agent repeats this task in a throwaway copy at the commit the lesson was made on, after your saved setup runs there. It can read and edit files but has no shell and runs no hooks; then the check runs there. One paid run; your checkout is not touched.</p>
      <span className="learn-draft__verbs">
        <button type="button" className="pf__verb pf__verb--word" data-learn-verb="run-proof" disabled={brief.trim() === ''} onClick={run}>Run the proof</button>
        <button type="button" className="pf__verb pf__verb--word" onClick={() => setOpen(false)}>Cancel</button>
      </span>
    </div>
  )
}

/** One accepted rule: what it says, where it lives, where it came from, and Retire (with an optional reason the library keeps). */
function RuleRow({ rule: r, now, where, onRetire }: { rule: LearnedRule; now: number; where: string; onRetire: (rule: LearnedRule, why: string) => void }): JSX.Element {
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState('')
  const retired = r.state === 'retired'
  return (
    <li className="learn-rule" data-learn-rule={r.state}>
      <span className="learn-draft__label">{retired ? 'Retired' : 'Rule'} · {draftLabel(r)} · accepted {ago(r.acceptedAt, now)}</span>
      <pre className="learn-draft__text">{r.text}</pre>
      <p className="learn-draft__why">{provenance(r)}</p>
      {!retired && <p className="learn-draft__why">in {where}</p>}
      {retired && <p className="learn-draft__why" data-learn-retired>retired {ago(r.retiredAt ?? r.acceptedAt, now)}{r.retiredWhy !== undefined ? ` — ${r.retiredWhy}` : ''}</p>}
      {!retired && (asking ? (
        <span className="learn-draft__verbs">
          <input className="learn-prove__input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why (kept with the rule)" aria-label="Why it is retired" />
          <button type="button" className="pf__verb pf__verb--word" data-learn-verb="retire-confirm" onClick={() => { setAsking(false); onRetire(r, why) }}>Retire</button>
          <button type="button" className="pf__verb pf__verb--word" onClick={() => setAsking(false)}>Cancel</button>
        </span>
      ) : (
        <span className="learn-draft__verbs">
          <button type="button" className="pf__verb pf__verb--word" data-learn-verb="retire" title={`Take this rule out of ${where}; the library keeps it, struck through`} onClick={() => setAsking(true)}>Retire…</button>
        </span>
      ))}
    </li>
  )
}

function LessonRow({ lesson: l, now }: { lesson: Lesson; now: number }): JSX.Element {
  return (
    <li className="learn-lesson" data-learn-lesson={l.source}>
      <span className="learn-lesson__place">{lessonPlace(l)}</span>
      {l.what !== undefined && <p className="learn-lesson__what">{l.what}</p>}
      {l.excerpt.trim() !== '' && <pre className="learn-lesson__excerpt">{l.excerpt}</pre>}
      <span className="learn-lesson__meta">
        {l.taskTitle !== undefined ? <span data-learn-task>{l.taskTitle}</span> : null}
        <span>{ago(l.at, now)}</span>
        {l.redacted !== undefined && <span data-learn-redacted>{plural(l.redacted, 'secret')} removed</span>}
      </span>
    </li>
  )
}
