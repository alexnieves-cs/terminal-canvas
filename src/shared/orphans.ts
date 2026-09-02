/** M55. One tmux session the saved layouts do not know. Main finds them; the renderer adopts them. */
export interface OrphanRow {
  panelId: string
  pid: number
  /** The spawned command line as tmux reports it; '' for a login shell. */
  command: string
  cwd: string
}
