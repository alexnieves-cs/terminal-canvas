import type { PersistedTemplate, TemplateNode } from '@shared/templates'
import { placeholders, fillPlaceholders } from '@renderer/chat/composer-model'
import type { Point } from '@renderer/canvas/viewport'

/**
 * M80. THE TEMPLATE MODEL, pure. What a template asks for, what filling it
 * gives, where its nodes land, and why it cannot run.
 *
 * The hole regex is `composer-model.ts`'s, IMPORTED: a template's
 * `{{parameters}}` and a prompt's `{{holes}}` are one idea, and a second
 * copy of the pattern would drift in the case nobody types twice.
 */

/** Every string in a template that a parameter can live in, in first-seen order. */
function fieldsOf(template: PersistedTemplate): string[] {
  const out: string[] = [template.name, ...(template.description === undefined ? [] : [template.description])]
  for (const n of template.nodes) {
    out.push(n.cwd)
    // M132: the three workflow kinds land here too but carry none of these
    // fields — this task lands the schema, not the runtime, so they are
    // skipped BY NAME rather than given a parameter surface of their own.
    if (n.kind !== 'terminal' && n.kind !== 'chat') continue
    if (n.command !== undefined) out.push(n.command)
    if (n.title !== undefined) out.push(n.title)
    if (n.message !== undefined) out.push(n.message)
  }
  return out
}

export function templateHoles(template: PersistedTemplate): string[] {
  const out: string[] = []
  for (const field of fieldsOf(template)) for (const name of placeholders(field)) if (!out.includes(name)) out.push(name)
  return out
}

/** A hole with no value stays as typed — the composer's own rule, reached through its own function. */
export function fillTemplate(template: PersistedTemplate, values: Record<string, string>): PersistedTemplate {
  const fill = (text: string): string => fillPlaceholders(text, values)
  return {
    ...template,
    name: fill(template.name),
    ...(template.description === undefined ? {} : { description: fill(template.description) }),
    nodes: template.nodes.map((n) => (n.kind !== 'terminal' && n.kind !== 'chat') ? { ...n, cwd: fill(n.cwd) } : ({
      ...n,
      cwd: fill(n.cwd),
      ...(n.command === undefined ? {} : { command: fill(n.command) }),
      ...(n.title === undefined ? {} : { title: fill(n.title) }),
      ...(n.message === undefined ? {} : { message: fill(n.message) })
    })),
    edges: template.edges.map((e) => ({ ...e }))
  }
}

export interface TemplatePlacement {
  key: string
  node: TemplateNode
  centre: Point
}

/** The nodes around a centre, in node order — the geometry the canvas mints from. */
export function templatePanels(template: PersistedTemplate, centre: Point): TemplatePlacement[] {
  return template.nodes.map((node) => ({ key: node.key, node, centre: { x: centre.x + node.dx, y: centre.y + node.dy } }))
}

/**
 * Why this template cannot be instantiated, in a sentence naming the fix —
 * or undefined. A row is disabled with this, never hidden.
 */
/**
 * M132/M133, fix round 2. Why a template's WORKFLOW BLOCKS stop it running —
 * or undefined.
 *
 * M132 landed the schema for `pool`, `orchestrator` and `collect`; nothing
 * instantiates them yet, and `instantiateTemplate` skips them BY NAME. A
 * template that is nothing but blocks therefore minted nothing at all and
 * still reported `spawned`, committing a no-op history entry; a mixed one
 * minted its terminals and quietly dropped the rest. Both are the partial
 * shape this repository refuses everywhere else, so the FIRST block found is
 * named and every Run door is disabled with the sentence rather than removed.
 */
export function workflowBlockRefusal(template: PersistedTemplate): string | undefined {
  // M138. The blocks RUN now — the pool through main's caller, the
  // orchestrator through its appended prompt, the collect through M78's
  // join. What is still refused by name is a pool that names no work list:
  // main cannot read a file nobody named, and a pool with nothing to pull
  // would mint workers for no items.
  const bare = template.nodes.find((n) => n.kind === 'pool' && n.list.trim() === '')
  return bare === undefined ? undefined : `${bare.key} is a pool block that names no work list — save the template with a list file`
}

export function templateRefusal(
  template: PersistedTemplate,
  presets: readonly { id: string }[],
  claudeAvailable: boolean
): string | undefined {
  // Tested FIRST and deterministically: a template can carry both a block and
  // a bad preset, and the block is the one that stops the whole shape.
  const blocked = workflowBlockRefusal(template)
  if (blocked !== undefined) return blocked
  const missing = template.nodes.find((n) => n.kind === 'terminal' && n.presetId !== undefined && !presets.some((p) => p.id === n.presetId))
  if (missing !== undefined) return `${missing.key} names a preset that no longer exists — save the template again`
  const bare = template.nodes.find((n) => n.kind === 'terminal' && n.presetId === undefined && (n.command ?? '') === '')
  if (bare !== undefined) return `${bare.key} names neither a preset nor a command`
  // A cycle is refused by `setLinkAutomation` at the last moment and silently
  // (it returns the array unchanged), which would leave a template half
  // applied — so it is refused HERE, by name, before anything is minted.
  const outgoing = new Map<string, string[]>()
  for (const e of template.edges) outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to])
  const seen = new Set<string>()
  const walking = new Set<string>()
  const cycles = (key: string): boolean => {
    if (walking.has(key)) return true
    if (seen.has(key)) return false
    walking.add(key)
    for (const next of outgoing.get(key) ?? []) if (cycles(next)) return true
    walking.delete(key)
    seen.add(key)
    return false
  }
  if (template.nodes.some((n) => cycles(n.key))) return 'its edges make a loop — a handoff graph cannot cycle'
  if (!claudeAvailable && template.nodes.some((n) => n.kind === 'chat')) {
    return 'claude was not found on the login PATH — install it, or check the environment report'
  }
  return undefined
}
