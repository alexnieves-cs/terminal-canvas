/**
 * M132. Three block types M80's template did not have.
 *
 * Each is a NEW ARM on an existing union, never a new engine: the pool asks
 * M82's ceiling, the orchestrator is M81's supervisor mechanism, and the
 * collect is M78's joinAdvance, which already delivers payloads in panel
 * order. Adding a fourth later takes the same shape.
 */
export interface PoolNode {
  kind: 'pool'
  /**
   * How many workers the author WANTS. Not a ceiling: M82's
   * agents.maxConcurrent is read live at start and bounds this, so a pool of
   * 12 under a ceiling of 4 runs 4 and queues 8 with reason 'concurrency'.
   */
  width: number
  /**
   * The shared work list, as a FILE PATH.
   *
   * A shared list needs exactly one authority, and a file on disk is one both
   * the app and the agents can see, that neither has to invent, and that
   * survives a relaunch. An in-memory list would make this app the author of
   * work the agents are doing — the two-authors failure refused at groupRect,
   * at the work card's rect and at the diagnostics bundle.
   */
  list: string
  prompt: string
  cwd: string
  dx: number
  dy: number
}

export interface OrchestratorNode {
  kind: 'orchestrator'
  /** Rides every spawn through --append-system-prompt. See parse note below. */
  prompt: string
  cwd: string
  dx: number
  dy: number
}

export interface CollectNode {
  kind: 'collect'
  /** A file path or a template node key. */
  target: string
  cwd: string
  dx: number
  dy: number
}

/**
 * M188. THE ACTION NODE — a canvas verb line, run through the SAME executor
 * the palette and the agent door take. This is the kind that closes the
 * four-door rule: every v9 verb's `V9_DOORS` row has carried an OWED workflow
 * door since M180, and an action node running `note-add sticky` IS that door.
 *
 * The line is stored as TEXT and bound at run time, never at save: a plan
 * naming a panel that does not exist yet is the ordinary case for a template
 * (the panels are minted by the same instantiation), and binding early would
 * refuse a shape that is about to be correct.
 */
export interface ActionNode {
  kind: 'action'
  /** A verb line, exactly as `tc plan` and the palette's verb row take it. */
  line: string
  cwd: string
  dx: number
  dy: number
}

/**
 * M188. THE HTTP NODE — a GET, and only a GET.
 *
 * Any other method is refused BY NAME, and the reason is not squeamishness: a
 * write belongs on the broker's approval path (M102 asks the teammate's own
 * chat before a token is read), and a node that could POST without passing
 * that door would be a way around the one this app already built. The
 * response is capped and passes `outward` — it is a remote server's content
 * arriving in this app, which is exactly M96's gate.
 */
export interface HttpNode {
  kind: 'http'
  url: string
  /** Present for the refusal's sake: a node that says GET and means GET is honest about it. */
  method?: string
  cwd: string
  dx: number
  dy: number
}

export type WorkflowNode = PoolNode | OrchestratorNode | CollectNode | ActionNode | HttpNode

export const POOL_WIDTH_MAX = 24

/** The header readout. Nodes, not edges — the screenshot says BLOCKS. */
export function blockCount(t: { nodes: readonly unknown[] }): number {
  return t.nodes.length
}

/**
 * ABSENT-vs-MALFORMED, per node. A node the parser cannot use is DROPPED and
 * takes its edges with it, and the template is kept — layout-schema:1359's
 * existing arm, which stays exactly as it is for whatever comes after these
 * three.
 */
export function parseWorkflowNode(raw: Record<string, unknown>, warnings: string[]): WorkflowNode | null {
  // ABSENT is fine and means '' — but a PRESENT non-string is dropped by
  // name, the terminal arm's own `isStr(n.cwd)` rule. String() coerced `{}`
  // into the directory "[object Object]" and said nothing.
  if (raw.cwd !== undefined && typeof raw.cwd !== 'string') {
    warnings.push(`dropped ${String(raw.kind)} node: cwd was unusable`)
    return null
  }
  const base = { cwd: typeof raw.cwd === 'string' ? raw.cwd : '', dx: typeof raw.dx === 'number' ? raw.dx : 0, dy: typeof raw.dy === 'number' ? raw.dy : 0 }
  if (raw.kind === 'pool') {
    const width = raw.width
    // Never coerced. A width of 0 is not "1 worker" — it is a file the author
    // did not finish, and running it would mint work nobody asked for.
    if (typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > POOL_WIDTH_MAX) {
      warnings.push(`dropped pool node: width was unusable`)
      return null
    }
    if (typeof raw.list !== 'string' || raw.list === '') {
      warnings.push('dropped pool node: no list')
      return null
    }
    return { ...base, kind: 'pool', width, list: raw.list, prompt: typeof raw.prompt === 'string' ? raw.prompt : '' }
  }
  if (raw.kind === 'orchestrator') {
    if (typeof raw.prompt !== 'string' || raw.prompt === '') {
      warnings.push('dropped orchestrator node: no prompt')
      return null
    }
    return { ...base, kind: 'orchestrator', prompt: raw.prompt }
  }
  if (raw.kind === 'collect') {
    if (typeof raw.target !== 'string' || raw.target === '') {
      warnings.push('dropped collect node: no target')
      return null
    }
    return { ...base, kind: 'collect', target: raw.target }
  }
  if (raw.kind === 'action') {
    if (typeof raw.line !== 'string' || raw.line.trim() === '') {
      warnings.push('dropped action node: no verb line')
      return null
    }
    return { ...base, kind: 'action', line: raw.line }
  }
  if (raw.kind === 'http') {
    if (typeof raw.url !== 'string' || raw.url.trim() === '') {
      warnings.push('dropped http node: no url')
      return null
    }
    // The METHOD is kept as written even when it is one this node refuses to
    // run: the refusal names it at run time, where a person can read it. A
    // node silently rewritten to GET would run something other than what its
    // author wrote.
    return { ...base, kind: 'http', url: raw.url, ...(typeof raw.method === 'string' && raw.method.trim() !== '' ? { method: raw.method.trim().toUpperCase() } : {}) }
  }
  return null
}
