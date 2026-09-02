/**
 * M48. The environment report's SHAPE, shared by main (which builds it) and
 * the renderer (which renders it). The builder stays in main/env-report.ts;
 * this file imports nothing, like every other shared contract, so the web
 * project can name the type without reaching into main.
 */
export type CliName = 'claude' | 'codex' | 'git'
export const REPORTED_CLIS: readonly CliName[] = ['claude', 'codex', 'git']

export interface EnvReport {
  probedAt: number
  shell: { path: string; ok: boolean; reason?: string }
  pathEntries: string[]
  clis: Array<{ name: CliName; path: string | null }>
  tmux: { kind: 'tmux' | 'direct'; reason: string; path: string | null }
  layout: { path: string; backupWritten: boolean }
  /** Sorted key names of the resolved login environment. Names, never values. */
  envKeys: string[]
}

/** For harnesses that register the handler without a real probe behind it. */
export const INERT_ENV_REPORT: EnvReport = {
  probedAt: 0,
  shell: { path: '', ok: true },
  pathEntries: [],
  clis: REPORTED_CLIS.map((name) => ({ name, path: null })),
  tmux: { kind: 'direct', reason: 'not probed', path: null },
  layout: { path: '', backupWritten: false },
  envKeys: []
}
