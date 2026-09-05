/**
 * M71. The injected process seam under an agent session.
 *
 * PROCESS-shaped, not protocol-shaped, and that is the point. The failure
 * paths the runtime must survive — a truncated stream, a malformed line
 * mid-stream, a non-zero exit, a process that keeps talking after it was
 * killed — are byte and process facts, and a runner that handed the session
 * parsed events could not produce any of them. `verify:agent-session`'s fake
 * replays recorded stdout in chunks it chooses, breaks lines where it
 * chooses, records every stdin line and every kill, and exits when told;
 * `claude-cli-runner.ts` is the real one over `child_process`.
 *
 * Imports nothing, so the manager that depends on it stays in the plain-node
 * tier.
 */
export interface AgentProcess {
  readonly pid: number | undefined
  /** One JSON line. The newline is appended by the process, not the caller. */
  write(line: string): void
  onData(cb: (chunk: string) => void): void
  onExit(cb: (info: AgentExitInfo) => void): void
  /** Ask the OS to end it. The exit itself arrives later, through onExit. */
  kill(): void
}

export interface AgentExitInfo {
  code: number | null
  signal: string | null
  /** The tail of stderr, for a non-zero exit's explanation. */
  stderr?: string
}

export interface AgentSpawn {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  /**
   * M90. Close stdin at spawn. codex's `exec` BLOCKS reading an open stdin
   * ("Reading additional input from stdin…") and its prompt is an argument,
   * so a per-turn backend has nothing to write and must not leave the pipe
   * open. Absent is claude's open pipe.
   */
  closeStdin?: boolean
}

export type AgentRunner = (spawn: AgentSpawn) => AgentProcess
