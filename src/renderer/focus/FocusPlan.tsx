import { useState, type JSX } from 'react'
import { shellControl } from '@renderer/shell/shell-control'
import { useChatsVersion } from '@renderer/chat/chat-store'
import { planFactsOf } from './plan-facts'
import { displayPath } from '@shared/display-path'
import {
  addStep, implementVerifyPlan, planProblems, planView, removeStep, stepBrief, withStep,
  PLAN_STEP_KINDS, type PlanActionId, type PlanFacts, type PlanStep, type PlanStepKind, type TaskPlan
} from '@shared/task-plan'

/**
 * M327. THE TASK'S PLAN, in its workspace — who is doing what, what each step
 * waits on, where it works, what it should produce, and what actually
 * happened, with the actions that apply to THAT step beside it.
 *
 * The record is `PersistedWorkItem.plan`, written through the board's one
 * patch door; every state on this page is derived (`planView`) from the
 * agents' sessions, the witnessed check runs and the review mark. The three
 * doors a step can reach are the ones that already exist: a NEW agent is a
 * chat opened in the step's directory with its brief INSERTED (never sent);
 * an existing agent gets the brief in its composer; a check runs through the
 * review's own Run checks. Cancel is the runtime's interrupt, which keeps
 * the conversation.
 */
export interface FocusPlanProps {
  itemId: string
  title: string
  brief?: string
  plan?: TaskPlan
  /** The task's first declared check, offered to the plan's check step. */
  check?: string
  /** The task's own conversation, which takes the first implementation step. */
  ownChat?: string
  /** The task's chats, for assigning a step to one. */
  chats: readonly { id: string; title: string }[]
  lanePath?: string
  runs: readonly { command: string; exitCode: number | null; at: number }[]
  review: PlanFacts['review']
  onPatchPlan: (plan: TaskPlan | undefined) => void
  /** A new chat for a step; the brief is handed over by `onShowAgent`, after this page has claimed it. */
  onSpawnAgent?: (opts: { cwd?: string; title: string }) => Promise<{ id: string } | { reason: string }>
  /** Show an agent's conversation; with `text`, its composer receives it (inserted, never sent). */
  onShowAgent: (panelId: string, text?: string) => void
  onInterrupt?: (panelId: string) => void
  onRunCheck?: (command: string) => Promise<string | null>
  onReview: () => void
}

const ACTION_WORDS: Record<PlanActionId, string> = {
  start: 'Start an agent…', assign: 'Assign', open: 'Open its conversation', cancel: 'Cancel', retry: 'Retry',
  verify: 'Mark verified', run: 'Run check', review: 'Review', reopen: 'Reopen'
}

export function FocusPlan(p: FocusPlanProps): JSX.Element {
  useChatsVersion() // a turn ending anywhere re-derives the states
  const [note, setNote] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const plan = p.plan
  // Rebuilt each render — the chat store's version above is what re-renders this.
  const facts = planFactsOf({ chats: p.chats, runs: p.runs, review: p.review })

  if (plan === undefined) {
    return (
      <div className="fplan fplan--empty" data-focus-plan="none">
        <p className="fplan__lead">No plan yet. A plan says who does what, what each step waits on, and what counts as done — so a run that goes wrong can be read here instead of rebuilt from transcripts.</p>
        <div className="fplan__template">
          <strong>Implement and verify</strong>
          <ol className="fplan__template-steps">
            <li>Implement API — implementation agent</li>
            <li>Implement UI — frontend agent, running independently</li>
            <li>Verify integration — waits for both implementations</li>
            <li>Review result — the changes and the verification evidence</li>
          </ol>
          <button type="button" className="fplan__primary" data-focus-plan-create
            {...shellControl(() => p.onPatchPlan(implementVerifyPlan({ now: Date.now(), ...(p.ownChat === undefined ? {} : { owner: p.ownChat }), ...(p.check === undefined ? {} : { check: p.check }) })))}>Create this plan</button>
          <span className="fplan__caption">Creating it starts nothing. Each step is started by you, and an agent's brief waits in its composer until you send it.</span>
        </div>
      </div>
    )
  }

  const views = planView(plan, facts)
  const problems = planProblems(plan)
  const verified = views.filter((v) => v.state === 'verified').length
  const patch = (id: string, fields: Partial<Omit<PlanStep, 'id'>>): void => p.onPatchPlan(withStep(plan, id, fields))
  const brief = (id: string): string => stepBrief(plan, id, { title: p.title, ...(p.brief === undefined ? {} : { brief: p.brief }), ...(p.lanePath === undefined ? {} : { lane: p.lanePath }) })

  const handOff = (step: PlanStep, owner: string): void => {
    patch(step.id, { owner, startedAt: Date.now(), cancelledAt: undefined, verifiedAt: undefined })
    p.onShowAgent(owner, brief(step.id))
    setAssigning(null)
    setNote(`${step.title}'s brief is in the conversation on the left — read it and send it to start the step`)
  }
  const startNew = (step: PlanStep): void => {
    if (p.onSpawnAgent === undefined) { setNote('Starting an agent is not available here — assign the step to one of the task\'s agents'); return }
    setNote(null)
    void p.onSpawnAgent({ ...((step.cwd ?? p.lanePath) === undefined ? {} : { cwd: step.cwd ?? p.lanePath }), title: step.title }).then((r) => {
      if ('reason' in r) { setNote(`Nothing was started — ${r.reason}`); return }
      patch(step.id, { owner: r.id, startedAt: Date.now(), cancelledAt: undefined, verifiedAt: undefined })
      p.onShowAgent(r.id, brief(step.id))
      setNote(`A new agent has ${step.title}'s brief in its composer — send it to start the step`)
    })
  }
  const run = (step: PlanStep): void => {
    if (step.command === undefined || p.onRunCheck === undefined) return
    patch(step.id, { startedAt: Date.now(), cancelledAt: undefined })
    void p.onRunCheck(step.command).then((why) => setNote(why === null ? `Running \`${step.command}\` in the lane — the step reads its result when it ends` : `Not run — ${why}`))
  }
  const act = (step: PlanStep, a: PlanActionId): void => {
    if (a === 'start') startNew(step)
    else if (a === 'assign') setAssigning((cur) => (cur === step.id ? null : step.id))
    else if (a === 'open') { if (step.owner !== undefined) p.onShowAgent(step.owner) }
    else if (a === 'cancel') {
      if (step.owner !== undefined) p.onInterrupt?.(step.owner)
      patch(step.id, { cancelledAt: Date.now() })
      setNote(`${step.title} was cancelled — its agent's turn was interrupted; the conversation is kept`)
    } else if (a === 'retry') {
      // The same agent when its conversation is still here (the brief again, in
      // its composer); a new one when it was closed.
      if (step.kind === 'check') run(step)
      else if (step.owner !== undefined && p.chats.some((c) => c.id === step.owner)) handOff(step, step.owner)
      else startNew(step)
    } else if (a === 'verify') patch(step.id, { verifiedAt: Date.now() })
    else if (a === 'run') run(step)
    else if (a === 'review') p.onReview()
    else if (a === 'reopen') patch(step.id, { verifiedAt: undefined, startedAt: Date.now() })
  }

  const byId = new Map(plan.steps.map((s) => [s.id, s]))
  return (
    <div className="fplan" data-focus-plan={plan.steps.length}>
      <div className="fplan__head">
        <span className="fplan__summary" data-focus-plan-summary>{verified} of {plan.steps.length} steps verified</span>
        <span className="fplan__head-verbs">
          <button type="button" className="fplan__secondary" data-focus-plan-add disabled={plan.steps.length >= 12} {...shellControl(() => p.onPatchPlan(addStep(plan)))}>Add step</button>
          <button type="button" className="fplan__secondary" data-focus-plan-remove title="Remove the plan — the agents and their conversations are kept" {...shellControl(() => p.onPatchPlan(undefined))}>Remove plan</button>
        </span>
      </div>
      {problems.length > 0 && (
        <ul className="fplan__problems" data-focus-plan-problems={problems.length}>
          {problems.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      {note !== null && <p className="fplan__note" role="status" data-focus-plan-note>{note}</p>}
      <ol className="fplan__steps">
        {plan.steps.map((step, i) => {
          const v = views[i]!
          const owner = step.owner === undefined ? undefined : p.chats.find((c) => c.id === step.owner)
          const where = step.cwd ?? p.lanePath
          const primary = v.actions[0]
          return (
            <li key={step.id} className="fplan__step" data-plan-step={step.id} data-plan-state={v.state}>
              <div className="fplan__step-head">
                <span className="fplan__index" aria-hidden="true">{i + 1}</span>
                <span className="fplan__title">{step.title}</span>
                <span className="fplan__state" data-tone={v.tone} data-plan-word>
                  <span className="status-dot" data-tone={v.tone} aria-hidden="true" />{v.word}
                </span>
                <span className="fplan__verbs">
                  {primary !== undefined && (
                    <button type="button" className="fplan__primary" data-plan-action={primary} title={`${ACTION_WORDS[primary]} — ${step.title}`} disabled={!canAct(primary, step, p)}
                      {...shellControl(() => act(step, primary))}>{ACTION_WORDS[primary]}</button>
                  )}
                  {v.actions.slice(1).map((a) => (
                    <button key={a} type="button" className="fplan__secondary" data-plan-action={a} title={`${ACTION_WORDS[a]} — ${step.title}`} disabled={!canAct(a, step, p)}
                      {...shellControl(() => act(step, a))}>{ACTION_WORDS[a]}</button>
                  ))}
                  <button type="button" className="fplan__secondary" data-plan-edit aria-expanded={editing === step.id} {...shellControl(() => setEditing((cur) => (cur === step.id ? null : step.id)))}>{editing === step.id ? 'Done' : 'Edit'}</button>
                </span>
              </div>
              <p className="fplan__detail" data-plan-detail>{v.detail}</p>
              <dl className="fplan__facts">
                <div><dt>Owner</dt><dd data-plan-owner={step.owner ?? ''}>{step.kind === 'review' ? 'You' : step.kind === 'check' ? (step.command === undefined ? 'No command' : <code>{step.command}</code>) : owner !== undefined ? `${owner.title} · ${step.role || 'agent'}` : step.owner !== undefined ? 'a closed conversation' : `Unassigned · ${step.role || 'agent'}`}</dd></div>
                <div><dt>Waits for</dt><dd data-plan-deps={step.dependsOn.join(' ')}>{step.dependsOn.length === 0 ? 'Nothing — runs independently' : step.dependsOn.map((d) => byId.get(d)?.title ?? d).join(', ')}</dd></div>
                <div><dt>Works in</dt><dd title={where}>{where === undefined ? 'The task\'s lane, once it has one' : displayPath(where).short}</dd></div>
                <div><dt>Expected</dt><dd>{step.expected.trim() === '' ? '—' : step.expected}</dd></div>
              </dl>
              {assigning === step.id && (
                <div className="fplan__assign" data-plan-assign={step.id}>
                  <span className="fplan__caption">Hand {step.title} to:</span>
                  {p.chats.length === 0 && <span className="fplan__caption">This task has no conversation yet.</span>}
                  {p.chats.map((c) => (
                    <button key={c.id} type="button" className="fplan__secondary" data-plan-assign-to={c.id} {...shellControl(() => handOff(step, c.id))}>{c.title}</button>
                  ))}
                  {p.onSpawnAgent !== undefined && <button type="button" className="fplan__secondary" {...shellControl(() => { setAssigning(null); startNew(step) })}>A new agent…</button>}
                </div>
              )}
              {editing === step.id && (
                <StepEditor step={step} steps={plan.steps} onPatch={(f) => patch(step.id, f)} onRemove={() => { setEditing(null); p.onPatchPlan(removeStep(plan, step.id)) }} />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function canAct(a: PlanActionId, step: PlanStep, p: FocusPlanProps): boolean {
  if (a === 'start') return p.onSpawnAgent !== undefined
  if (a === 'run') return step.command !== undefined && p.onRunCheck !== undefined
  if (a === 'retry' && step.kind === 'check') return step.command !== undefined && p.onRunCheck !== undefined
  if (a === 'cancel') return step.owner !== undefined && p.onInterrupt !== undefined
  return true
}

/** The step's decisions, edited in place; each field saves as it changes. */
function StepEditor({ step, steps, onPatch, onRemove }: { step: PlanStep; steps: readonly PlanStep[]; onPatch: (f: Partial<Omit<PlanStep, 'id'>>) => void; onRemove: () => void }): JSX.Element {
  const field = (label: string, value: string, key: 'title' | 'role' | 'expected' | 'cwd' | 'command', placeholder = ''): JSX.Element => (
    <label className="fplan__field">
      <span>{label}</span>
      <input className="fplan__input" data-plan-field={key} value={value} placeholder={placeholder} data-edit-owner
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => onPatch({ [key]: key === 'title' && e.target.value.trim() === '' ? step.title : e.target.value } as Partial<PlanStep>)} />
    </label>
  )
  return (
    <div className="fplan__editor" data-plan-editor={step.id}>
      {field('Step', step.title, 'title')}
      <label className="fplan__field">
        <span>Kind</span>
        <select className="fplan__input" data-plan-field="kind" value={step.kind} onChange={(e) => onPatch({ kind: e.target.value as PlanStepKind })}>
          {PLAN_STEP_KINDS.map((k) => <option key={k} value={k}>{k === 'agent' ? 'An agent does it' : k === 'check' ? 'A check verifies it' : 'You review it'}</option>)}
        </select>
      </label>
      {step.kind === 'agent' && field('Role', step.role, 'role', 'implementation agent')}
      {field('Expected output', step.expected, 'expected', 'What done looks like')}
      {step.kind !== 'review' && field('Works in', step.cwd ?? '', 'cwd', 'The task\'s lane')}
      {step.kind === 'check' && field('Command', step.command ?? '', 'command', 'npm test')}
      <fieldset className="fplan__field fplan__deps">
        <legend>Waits for</legend>
        {steps.filter((s) => s.id !== step.id).map((s) => (
          <label key={s.id} className="fplan__dep">
            <input type="checkbox" data-plan-dep={s.id} checked={step.dependsOn.includes(s.id)}
              onChange={(e) => onPatch({ dependsOn: e.target.checked ? [...step.dependsOn, s.id] : step.dependsOn.filter((d) => d !== s.id) })} />
            {s.title}
          </label>
        ))}
      </fieldset>
      <button type="button" className="fplan__secondary fplan__remove" data-plan-remove {...shellControl(onRemove)}>Remove step</button>
    </div>
  )
}
