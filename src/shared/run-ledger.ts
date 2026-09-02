/**
 * M52. One row of the run ledger — what a panel ran and how it ended. Shared
 * so the contract can name it; the writer is main/run-ledger.ts. No output
 * bytes, ever: metadata only.
 */
export interface RunRow {
  panelId: string
  command: string
  cwd: string
  startedAt: number
  endedAt: number
  exitCode: number | null
}
