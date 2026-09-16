/**
 * Round 6. THE WORKFLOW GRAPH, stated once as a schema.
 *
 * WHAT THIS IS NOT: a replacement for `parseTemplates`. That function is the
 * LAYOUT FILE's reader and keeps its own hand-written absent-vs-malformed
 * rules, because a layout file is this app's own writing and a field it
 * cannot read costs the field rather than the record. Nothing here retrofits
 * it.
 *
 * WHAT THIS IS: the reader for the two places a workflow graph arrives with
 * NO reader at all — both of them new, both of them outside:
 *
 *   1. `parsePortable` (portable.ts) cast `r.templates` to
 *      `PersistedTemplate[]` after an `Array.isArray` and nothing else, so a
 *      .tccanvas file could put any object at all into the template library.
 *      Its sibling `parsePack` already routes payloads through a parser; this
 *      is the arm that did not.
 *   2. `template:save` over IPC cast the payload and handed it to the store,
 *      so the React Flow editor — or anything else holding the bridge — could
 *      write a record the layout reader would later refuse, and the refusal
 *      would land a relaunch later with no way back to the save that caused it.
 *
 * WHY A SCHEMA RATHER THAN A SIXTH HAND-WRITTEN PARSER: the two rules that
 * actually matter here are CROSS-FIELD — node keys are unique, and every edge
 * names a node that exists. Hand-written, those are the checks that get
 * dropped when an arm is added (a new node kind lands, and the key-uniqueness
 * loop three functions away is not touched). Declared once in a refinement,
 * they hold for every arm the union grows.
 *
 * THE DRIFT GUARD: this schema must never refuse a record `parseTemplates`
 * would keep, or an import would reject what a relaunch accepts and the two
 * readers would disagree silently. `verify:workflow-schema wfs.agree.1`
 * asserts exactly that, by feeding the store's own output back through here.
 */
import { z } from 'zod'
import { HANDOFF_TRIGGERS } from './handoff'
import { POOL_WIDTH_MAX } from './workflow-nodes'
import type { PersistedTemplate } from './templates'

/** A key, an id, a name: text with something in it. Blank is malformed, never a default. */
const filled = z.string().trim().min(1)

/**
 * `cwd`, `dx` and `dy` are what every node carries. They are REQUIRED here
 * and defaulted in `parseWorkflowNode`, which is not a contradiction: that
 * function reads a file this app wrote before the fields existed, and this
 * one reads a record that has already been through it.
 */
const placed = { cwd: z.string(), dx: z.number(), dy: z.number() }

const terminalOrChatNode = z.object({
  key: filled,
  kind: z.enum(['terminal', 'chat']),
  ...placed,
  presetId: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  w: z.number().optional(),
  h: z.number().optional()
})

// Each arm below states the SAME bound its arm in `parseWorkflowNode` states,
// and no other. A width of 0 is a file its author did not finish; an empty
// verb line is a node that would run nothing and report success.
const poolNode = z.object({ key: filled, kind: z.literal('pool'), ...placed, width: z.number().int().min(1).max(POOL_WIDTH_MAX), list: filled, prompt: z.string() })
const orchestratorNode = z.object({ key: filled, kind: z.literal('orchestrator'), ...placed, prompt: filled })
const collectNode = z.object({ key: filled, kind: z.literal('collect'), ...placed, target: filled })
const actionNode = z.object({ key: filled, kind: z.literal('action'), ...placed, line: filled })
const httpNode = z.object({ key: filled, kind: z.literal('http'), ...placed, url: filled, method: z.string().optional() })

/**
 * Discriminated on `kind`, so an unknown kind is refused BY NAME rather than
 * falling through to the terminal arm and being read as a terminal with no
 * command — the default-arm trap `parseTemplates` names in its own comment.
 */
export const workflowNodeSchema = z.discriminatedUnion('kind', [
  terminalOrChatNode.extend({ kind: z.literal('terminal') }),
  terminalOrChatNode.extend({ kind: z.literal('chat') }),
  poolNode, orchestratorNode, collectNode, actionNode, httpNode
])

export const workflowEdgeSchema = z.object({
  from: filled,
  to: filled,
  // A trigger this code does not know is malformed, never defaulted: a rule
  // that fires on a trigger its author did not write is the surprise the
  // handoff table exists to prevent.
  trigger: z.enum(HANDOFF_TRIGGERS as unknown as [string, ...string[]])
})

/** The two cross-field rules, applied to whatever arms the union grows. */
function coherent (graph: { nodes: { key: string }[]; edges: { from: string; to: string }[] }, ctx: z.RefinementCtx): void {
  const keys = new Set<string>()
  graph.nodes.forEach((node, i) => {
    if (keys.has(node.key)) ctx.addIssue({ code: 'custom', path: ['nodes', i, 'key'], message: `two nodes both call themselves "${node.key}"` })
    keys.add(node.key)
  })
  graph.edges.forEach((edge, i) => {
    // Named separately from/to, because "an edge names a missing node" sends
    // a reader hunting both ends of a link only one end of which is wrong.
    if (!keys.has(edge.from)) ctx.addIssue({ code: 'custom', path: ['edges', i, 'from'], message: `an edge starts at "${edge.from}", which is not a node here` })
    if (!keys.has(edge.to)) ctx.addIssue({ code: 'custom', path: ['edges', i, 'to'], message: `an edge ends at "${edge.to}", which is not a node here` })
  })
}

const graphShape = {
  name: filled,
  description: z.string().optional(),
  // A template with no node is a record that instantiates nothing. The layout
  // reader drops it too, for the same reason.
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(workflowEdgeSchema),
  // `false` is the ONLY value this field takes. Absent means reviewed — every
  // graph this canvas made itself, and every record older than the mark.
  //
  // The one field here that costs the FIELD rather than the record, and the
  // transform is `parseTemplates`' rule verbatim: absent or `true` is
  // reviewed, and ANYTHING ELSE present fails SAFE to unreviewed. A file that
  // says `reviewed: "yes"` is not a file to throw away — it is a file whose
  // mark cannot be read, and an unreadable mark must read as "not reviewed"
  // or the inertness rule has a hole in it.
  reviewed: z.unknown().optional().transform((v) => (v === undefined || v === true ? undefined : (false as const))),
  // Never normalised in: a written `revision: 0` would claim a save that
  // never happened, which is why these are optional rather than defaulted.
  revision: z.number().int().min(0).optional(),
  nextKey: z.number().int().min(0).optional()
}

/** A saved graph, as it sits in the library and in a portable file. */
export const workflowGraphSchema = z.object({ id: filled, ...graphShape }).superRefine(coherent)

/**
 * A graph ARRIVING over `template:save`, where the id is the store's to mint
 * on a first save and so may be absent. Everything else is identical, and
 * deliberately so — the editor may not write a record the library could not
 * hold.
 */
export const incomingWorkflowGraphSchema = z.object({ id: filled.optional(), ...graphShape }).superRefine(coherent)

export type IncomingWorkflowGraph = z.infer<typeof incomingWorkflowGraphSchema>

/** One sentence per problem, each naming where it is. `a.b.0.c` reads as `a › b › 0 › c`. */
export function graphProblems (error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.join(' › ')
    return where === '' ? issue.message : `${where}: ${issue.message}`
  })
}

/**
 * The portable-file arm. House shape, matching every other parser in
 * `layout-schema.ts`: never throws, absent is silent, present-but-wrong is
 * DROPPED BY NAME with a sentence a person can read, and the rest is kept.
 *
 * Per RECORD, not per field: a graph that fails this is not a graph with a
 * bad field, it is an object from a file that has no business in the library.
 */
export function parseWorkflowGraphs (raw: unknown, warnings: string[]): PersistedTemplate[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('the file\'s workflows were not a list — none were read')
    return []
  }
  const seen = new Set<string>()
  const out: PersistedTemplate[] = []
  raw.forEach((entry, i) => {
    const parsed = workflowGraphSchema.safeParse(entry)
    if (!parsed.success) {
      const named = typeof (entry as { name?: unknown })?.name === 'string' ? `"${(entry as { name: string }).name}"` : `${i}`
      warnings.push(`dropped workflow ${named}: ${graphProblems(parsed.error)[0] ?? 'it is not a workflow'}`)
      return
    }
    // A repeated id is not a second workflow, it is the same one twice — and
    // the second would shadow the first in every list that keys by id.
    if (seen.has(parsed.data.id)) { warnings.push(`dropped workflow "${parsed.data.name}": another in the file already claims its id`); return }
    seen.add(parsed.data.id)
    out.push(parsed.data as PersistedTemplate)
  })
  return out
}
