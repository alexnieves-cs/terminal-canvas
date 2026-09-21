/**
 * M302. SAVE A SUCCESSFUL ARRANGEMENT AS A TEMPLATE.
 *
 * An island that worked — its agents, where they ran, and the handoffs
 * between them — becomes a template: the shape of the work, saved once and
 * started again. It writes through the EXISTING template record
 * (`shared/templates.ts`) and the existing `template.save` door, so a saved
 * arrangement is an ordinary template everywhere else in the app and needs no
 * second reader, no second store and no schema of its own.
 *
 * THREE RULES, and the middle one is the load-bearing one.
 *
 * 1. **Keys, not panel ids.** A template's edges name node KEYS because the
 *    panels do not exist until it is instantiated (M80's own rule). An
 *    arrangement that saved panel ids would be an arrangement that could only
 *    be started once.
 *
 * 2. **A saved arrangement RUNS NOTHING when it is started.** Every node is a
 *    `chat`, whose `message` is INSERTED into the composer and never sent, so
 *    instantiating the arrangement produces conversations waiting for a
 *    person. The validation commands are deliberately NOT terminal nodes with
 *    a `command`: a terminal node spawns its command when the template is
 *    instantiated, which is exactly the "blindly replay side effects" the
 *    plan forbids — a validation command may deploy, may publish, may cost
 *    money. They are written into the description instead, where a person
 *    reads them and decides. This is a limitation on purpose and it is said
 *    out loud, here and on screen.
 *
 * 3. **The brief travels, the RESULTS do not.** The goal, the acceptance
 *    criteria and the validation commands describe the work; a run's diffs,
 *    checks and artifacts belong to the execution that produced them and stay
 *    with it (M300's run ids). A template that carried an old run's outcomes
 *    would let a rerun inherit evidence it never earned.
 *
 * Pure: no DOM, no React, no electron. `verify:orchestration orch-reuse.4`.
 */

import type { PersistedTemplate, TemplateEdge, TemplateNode } from '@shared/templates'
import type { HandoffTrigger } from '@shared/handoff'

export interface ArrangementMember {
  panelId: string
  /** The rail's label — what the person calls this agent. */
  title: string
  cwd: string
  /** The first message this agent was given, when the app still has it. */
  message?: string
  /** Where it sat, relative to the island's first member, so the shape is recognisable. */
  dx: number
  dy: number
}

export interface ArrangementInput {
  goal: string
  /** The task's brief, when it has one. */
  brief?: string
  criteria?: readonly string[]
  /** Validation commands, recorded as WORDS — see rule 2. */
  validation?: readonly string[]
  members: readonly ArrangementMember[]
  /** Authored handoffs between members, by panel id, with their trigger. */
  edges: readonly { from: string; to: string; trigger: HandoffTrigger }[]
  /** Where the island's work happened, for the description's provenance line. */
  placement?: string
}

/** The sentence the description carries about what a saved arrangement will NOT do. */
export const ARRANGEMENT_INERT_LINE =
  'Starting this arrangement opens its conversations with their first messages ready to send — it sends nothing and runs no commands.'

/** The heading the validation commands sit under, so a reader can find them. */
export const ARRANGEMENT_VALIDATION_HEADING = 'Validation commands (not run automatically):'

/**
 * A node's key: stable, derived from the member's ORDER rather than its panel
 * id, so the same arrangement saved twice from the same island produces the
 * same keys — and so a key never leaks a panel id that will not exist next
 * time. Prefixed because a bare number is a poor thing to read in an edge.
 */
export function arrangementKey(index: number): string {
  return `seat-${index + 1}`
}

/**
 * The description: the brief, the criteria, the validation commands and the
 * inert-start sentence, in the one field the template record has for prose.
 *
 * The template schema has no place for acceptance criteria or a validation
 * list, and this does NOT invent fields on it — a record that grew a private
 * shape here would be a record every other reader of templates could not
 * understand. Prose in the field that is for prose, and the ledger says so.
 */
export function arrangementDescription(input: ArrangementInput): string {
  const parts: string[] = []
  if (input.brief !== undefined && input.brief.trim() !== '') parts.push(input.brief.trim())
  const criteria = (input.criteria ?? []).filter((c) => c.trim() !== '')
  if (criteria.length > 0) parts.push(['Acceptance criteria:', ...criteria.map((c) => `- ${c}`)].join('\n'))
  const validation = (input.validation ?? []).filter((c) => c.trim() !== '')
  if (validation.length > 0) parts.push([ARRANGEMENT_VALIDATION_HEADING, ...validation.map((c) => `- ${c}`)].join('\n'))
  if (input.placement !== undefined && input.placement !== '') parts.push(`Saved from work in ${input.placement}.`)
  parts.push(ARRANGEMENT_INERT_LINE)
  return parts.join('\n\n')
}

/**
 * The arrangement, as a template ready for `template.save`. `id` is absent —
 * the store mints it — and `reviewed` is absent too, which means reviewed:
 * this canvas made it, and M190's inertness rule is about templates that
 * arrived from somewhere else.
 *
 * An edge whose endpoints are not both members is DROPPED, following
 * `parseTemplates`'s own rule that a dropped node takes its edges with it: a
 * handoff to a panel outside the island would name a key this template does
 * not have, and a template with a dangling edge is a template that refuses to
 * instantiate.
 */
export function arrangementTemplate(name: string, input: ArrangementInput): Omit<PersistedTemplate, 'id'> {
  const keyOf = new Map<string, string>()
  input.members.forEach((m, i) => keyOf.set(m.panelId, arrangementKey(i)))
  const nodes: TemplateNode[] = input.members.map((m, i) => ({
    key: arrangementKey(i),
    // Always a chat, never a terminal with a command — see rule 2.
    kind: 'chat' as const,
    cwd: m.cwd,
    title: m.title,
    ...(m.message === undefined || m.message.trim() === '' ? {} : { message: m.message }),
    dx: m.dx,
    dy: m.dy
  }))
  const edges: TemplateEdge[] = []
  for (const e of input.edges) {
    const from = keyOf.get(e.from)
    const to = keyOf.get(e.to)
    if (from === undefined || to === undefined || from === to) continue
    if (edges.some((x) => x.from === from && x.to === to)) continue
    edges.push({ from, to, trigger: e.trigger })
  }
  return {
    name: name.trim() === '' ? input.goal.trim() : name.trim(),
    description: arrangementDescription(input),
    nodes,
    edges
  }
}
