import { VERBS, verbById, stripControl, acceptsTyping, type VerbDef } from './verb-table'
import { settingDef } from './settings-schema'
import type { AgentKind } from './cost'

/**
 * M96. A PLAN IS DATA: an ordered list of verb invocations with arguments
 * bound, plus the confirmation steps the table says it owes. Built and
 * validated here against the table and the canvas's facts; refused BY NAME
 * with a fix; run by an executor the renderer supplies. It is shown before
 * it runs and reports in the canvas's own state vocabulary.
 *
 * M101 saves one on a routine and refuses it at save time if it holds a
 * destructive verb; M97's Auto modes are plans with a turn limit. Neither
 * needs anything here to be a judgement made at its own call site.
 *
 * Pure; `verify:verbs plan.1`, `destructive.1`, `type.1–.2`, `settings.1`.
 */

export interface PlanInput {
  verb: string
  args: readonly string[]
}

export interface PlanStep {
  verb: string
  args: Record<string, string>
  /** Present on a destructive step: the runtime will not skip it. */
  confirm?: { reason: string }
}

export interface Plan {
  steps: PlanStep[]
}

export type PlanResult = { kind: 'plan'; plan: Plan } | { kind: 'refused'; reason: string; fix: string }

/** The facts a plan is bound against — M81's canvas model plus each panel's agent kind. */
export interface PlanFacts {
  panels: readonly { id: string; kind: string; agent?: AgentKind; state?: string }[]
  presets?: readonly { id: string }[]
  templates?: readonly { id: string }[]
  worktrees?: readonly { id: string }[]
  workspaces?: readonly { id: string }[]
}

/**
 * The palette's typed line: steps separated by `;`, each `verb arg arg…`.
 * A `rest` argument takes everything after the arguments before it.
 */
export function parsePlanLine(line: string): PlanInput[] {
  return line.split(';').map((s) => s.trim()).filter((s) => s !== '').map((s) => {
    const words = s.split(/\s+/)
    return { verb: words[0] ?? '', args: words.slice(1) }
  })
}

const refuse = (reason: string, fix: string): PlanResult => ({ kind: 'refused', reason, fix })

function bindArgs(verb: VerbDef, raw: readonly string[], facts: PlanFacts, index: number): { args: Record<string, string> } | PlanResult {
  const args: Record<string, string> = {}
  let cursor = 0
  for (const def of verb.args) {
    const value = def.rest ? raw.slice(cursor).join(' ') : raw[cursor]
    cursor = def.rest ? raw.length : cursor + 1
    if (value === undefined || value === '') {
      if (def.optional) continue
      return refuse(`step ${index + 1}: ${verb.id} needs a ${def.name}`, `write \`${verb.id} ${verb.args.map((a) => `<${a.name}>`).join(' ')}\``)
    }
    switch (def.kind) {
      case 'panel': {
        const panel = facts.panels.find((p) => p.id === value)
        if (!panel) return refuse(`step ${index + 1}: no panel is called ${value}`, 'name a panel by its id — the Panels pane and tc status list them')
        break
      }
      case 'preset':
        if (facts.presets !== undefined && !facts.presets.some((p) => p.id === value)) return refuse(`step ${index + 1}: no preset is called ${value}`, 'name a preset by its id — Manage presets… lists them')
        break
      case 'key': {
        const pool = def.name === 'template' ? facts.templates : def.name === 'worktree' ? facts.worktrees : def.name === 'workspace' ? facts.workspaces : undefined
        if (pool !== undefined && !pool.some((k) => k.id === value)) return refuse(`step ${index + 1}: no ${def.name} is called ${value}`, `name a ${def.name} by its id`)
        break
      }
      case 'setting': {
        const s = settingDef(value)
        if (s === undefined) return refuse(`step ${index + 1}: no setting is called ${value}`, 'Manage settings… lists every id')
        // Guardrail 1: the closed list. A plan that can raise its own
        // ceiling has no ceiling; a plan that can move the vault reads disk.
        if (s.planWritable !== true) return refuse(`step ${index + 1}: ${value} is not a setting a plan may write`, 'change it yourself in ⌘K › Settings — only cosmetic and attention settings are plan-writable')
        break
      }
      case 'text':
      case 'value':
        break
    }
    args[def.name] = def.kind === 'text' ? stripControl(value) : value
  }
  return { args }
}

export function buildPlan(inputs: readonly PlanInput[], facts: PlanFacts): PlanResult {
  if (inputs.length === 0) return refuse('nothing to run', 'write a verb and its arguments, e.g. `focus n3`')
  const steps: PlanStep[] = []
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]!
    const verb = verbById(input.verb)
    if (verb === undefined) return refuse(`step ${i + 1}: ${input.verb} is not a verb`, `the verbs are ${VERBS.map((v) => v.id).join(', ')}`)
    const bound = bindArgs(verb, input.args, facts, i)
    if ('kind' in bound) return bound
    // Guardrail 4: the panel's kind decides who may be typed into.
    if (verb.id === 'type' || verb.id === 'submit') {
      const panel = facts.panels.find((p) => p.id === bound.args['panel'])
      if (panel !== undefined && !acceptsTyping(panel)) {
        return refuse(`step ${i + 1}: ${panel.id} is a ${panel.kind === 'terminal' ? 'plain shell' : panel.kind} — a plan may only type into an agent`, 'aim it at an agent panel: a terminal running claude or codex, or a chat')
      }
    }
    if (verb.id === 'send') {
      const panel = facts.panels.find((p) => p.id === bound.args['panel'])
      if (panel !== undefined && panel.kind !== 'chat') return refuse(`step ${i + 1}: ${panel.id} is not a chat — send needs one`, 'use `type` and `submit` for an agent terminal')
    }
    const step: PlanStep = { verb: verb.id, args: bound.args }
    // Guardrail 5: destructive asks first. The step is not refused — it is
    // given the confirmation the runtime will not skip.
    if (verb.destructive) {
      const what = verb.args.length > 0 ? ` ${bound.args[verb.args[0]!.name] ?? ''}` : ''
      step.confirm = { reason: `${verb.id}${what} is destructive — confirm to run it` }
    }
    steps.push(step)
  }
  return { kind: 'plan', plan: { steps } }
}

/** One line per step, for the preview: `close n3 — confirm to run it`. */
export function describePlan(plan: Plan): string[] {
  return plan.steps.map((s) => {
    const verb = verbById(s.verb)
    const args = (verb?.args ?? []).map((a) => s.args[a.name]).filter((v) => v !== undefined && v !== '').join(' ')
    return `${s.verb}${args === '' ? '' : ' ' + args}${s.confirm === undefined ? '' : ' — ' + s.confirm.reason}`
  })
}

export function planIsDestructive(plan: Plan): boolean {
  return plan.steps.some((s) => verbById(s.verb)?.destructive === true)
}

export type StepOutcome = { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }

export type StepExecutor = (step: PlanStep) => StepOutcome | Promise<StepOutcome>

export interface RunReport {
  steps: StepOutcome[]
  /** `ran close n3 · 2 steps`, or `stopped at step 2: …`. */
  summary: string
}

/**
 * Runs the plan in order. A destructive step whose confirmation was not
 * acknowledged is REFUSED by name and stops the plan; nothing the executor
 * would have done happens. Acknowledgement is one flag for the whole plan
 * because the palette confirms the plan as shown, every destructive line
 * named in the preview.
 */
export async function runPlan(plan: Plan, exec: StepExecutor, opts: { acknowledged: boolean }): Promise<RunReport> {
  const steps: StepOutcome[] = []
  for (let i = 0; i < plan.steps.length; i += 1) {
    const step = plan.steps[i]!
    if (step.confirm !== undefined && !opts.acknowledged) {
      steps.push({ kind: 'refused', reason: `step ${i + 1} (${step.verb}) needs its confirmation — confirm the plan to run it` })
      return { steps, summary: `stopped at step ${i + 1}: ${step.verb} needs its confirmation` }
    }
    let outcome: StepOutcome
    try {
      outcome = await exec(step)
    } catch (error: unknown) {
      outcome = { kind: 'refused', reason: `step ${i + 1} (${step.verb}) failed: ${String(error)}` }
    }
    steps.push(outcome)
    if (outcome.kind === 'refused') return { steps, summary: `stopped at step ${i + 1}: ${outcome.reason}` }
  }
  const last = plan.steps[plan.steps.length - 1]!
  const lastLine = describePlan({ steps: [last] })[0]!.split(' — ')[0]
  return { steps, summary: `ran ${lastLine} · ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}` }
}
