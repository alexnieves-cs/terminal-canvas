import type { HandoffTrigger } from './handoff'
import type { WorkflowNode } from './workflow-nodes'

/**
 * M80. A TEMPLATE: a shape of work — panels, their directories, their first
 * messages, and the edges between them — saved once and started again with
 * its `{{parameters}}` filled in.
 *
 * Top level in the layout beside `presets` and `prompts`, never a
 * workspace's: a template is a way of working, not a canvas.
 *
 * A node's `key` is the template's own name for it; edges name KEYS, never
 * panel ids, because the panels do not exist until it is instantiated —
 * which is also why a dropped node must take its edges with it (see
 * `parseTemplates`).
 */

export interface TerminalOrChatNode {
  key: string
  kind: 'terminal' | 'chat'
  /** A terminal node's preset, when it has one; else `command`, else the login shell. */
  presetId?: string
  command?: string
  /** The command's arguments, as the panel's own spec carries them (exec-style: `command` is the binary). */
  args?: string[]
  cwd: string
  title?: string
  /** A chat node's first message — INSERTED into its composer, never sent. */
  message?: string
  /** Where the node sits relative to the instantiation centre. */
  dx: number
  dy: number
  w?: number
  h?: number
}

/**
 * M131. `TemplateNode` widened to a union: a terminal/chat node (M80) or one
 * of the three workflow blocks (`WorkflowNode`), each carrying the same
 * `key` a template's edges name.
 */
export type TemplateNode = TerminalOrChatNode | (WorkflowNode & { key: string })

export interface TemplateEdge {
  from: string
  to: string
  trigger: HandoffTrigger
}

export interface PersistedTemplate {
  id: string
  name: string
  description?: string
  nodes: TemplateNode[]
  edges: TemplateEdge[]
}

/** The newest kept; a library, not a history. */
export const TEMPLATES_MAX = 30

/**
 * The built-ins are CODE, the way `BUILT_IN_PRESETS` is: a user cannot
 * delete one (the same named refusal), and a new one ships with the app
 * rather than being written into everybody's layout file.
 */
export const BUILT_IN_TEMPLATES: PersistedTemplate[] = [
  {
    id: 'builtin-review-repo',
    name: 'review this repository',
    description: 'a chat that reviews the working tree, beside the diff it is reviewing',
    nodes: [
      {
        key: 'review', kind: 'chat', cwd: '{{repository}}', title: 'review',
        message: 'Review the working tree for correctness and name every silent failure.',
        dx: -260, dy: 0
      },
      // EXEC-STYLE, like a panel's own spec: `command` is the binary and
      // `args` its arguments, so a saved template round-trips a panel exactly.
      { key: 'diff', kind: 'terminal', cwd: '{{repository}}', command: '/bin/sh', args: ['-lc', 'git diff --stat'], title: 'diff', dx: 260, dy: 0 }
    ],
    edges: [{ from: 'review', to: 'diff', trigger: 'idle' }]
  }
]

/** Built-ins first, then the user's — `allPresets`' own rule. */
export function allTemplates(user: readonly PersistedTemplate[]): PersistedTemplate[] {
  // A user entry can never SHADOW a built-in: `isBuiltInTemplate` would still
  // call that id built-in, so the row would refuse deletion and never say why.
  return [...BUILT_IN_TEMPLATES, ...user.filter((t) => !isBuiltInTemplate(t.id))]
}

export function isBuiltInTemplate(id: string): boolean {
  return BUILT_IN_TEMPLATES.some((t) => t.id === id)
}
