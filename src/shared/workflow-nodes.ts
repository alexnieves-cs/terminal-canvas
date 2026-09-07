/**
 * M131. Three block types M80's template did not have.
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

export type WorkflowNode = PoolNode | OrchestratorNode | CollectNode

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
  return null
}
