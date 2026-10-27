import type { FilmInput } from './night-film'
import type { TimelineEntry } from './run-ledger'

/**
 * M564 (lane L). A SAMPLE NIGHT — sample data, labelled as such wherever it
 * is shown — for the README's clip and for `verify:film`'s fixtures. Three
 * Tonight tasks on a five-panel canvas, 23:10 to 06:40: one passes its
 * check, one stops on the person and then passes, one keeps failing. It is
 * the same input shape the "Last night" button builds from the real record,
 * so the clip is drawn by the app's own code, not mocked up beside it.
 */

const H = 60 * 60_000
const M = 60_000
/** 2026-10-25 23:10 local is not portable; a fixed epoch keeps the clip and the checks stable. */
export const SAMPLE_FROM = Date.UTC(2026, 9, 25, 23, 10)
export const SAMPLE_TO = SAMPLE_FROM + 7 * H + 30 * M

const at = (h: number, m: number): number => SAMPLE_FROM + h * H + m * M

const ev = (runId: string, t: number, event: 'dispatch' | 'permission' | 'check' | 'session' | 'artifact' | 'tool', panelId: string, title: string): TimelineEntry =>
  ({ kind: 'event', row: { kind: 'event', runId, at: t, event, source: event === 'permission' ? 'person' : 'agent', title, panelId } })

const cmd = (panelId: string, command: string, start: number, end: number, exitCode: number): TimelineEntry =>
  ({ kind: 'command', row: { panelId, command, cwd: '~/code/shop', startedAt: start, endedAt: end, exitCode } })

/** "HH:MM" in UTC, so the sample reads the same on every machine. */
export const sampleClock = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function sampleNight(): FilmInput {
  return {
    from: SAMPLE_FROM,
    to: SAMPLE_TO,
    clock: sampleClock,
    panels: [
      { id: 'p-auth', label: 'Refactor auth session', kind: 'Claude Code', rect: { x: 0, y: 0, w: 520, h: 340 } },
      { id: 'p-flaky', label: 'Fix flaky checkout test', kind: 'Codex', rect: { x: 580, y: 0, w: 520, h: 340 } },
      { id: 'p-docs', label: 'API docs pass', kind: 'Claude Code', rect: { x: 1160, y: 0, w: 520, h: 340 } },
      { id: 'p-watch', label: 'npm test --watch', kind: 'terminal', rect: { x: 0, y: 400, w: 820, h: 260 } },
      { id: 'p-review', label: 'Review: shop', kind: 'review layer', rect: { x: 880, y: 400, w: 800, h: 260 } }
    ],
    timeline: [
      // Before the night: the watcher and the review layer were already open.
      cmd('p-watch', 'npm test', at(-1, 0), at(-1, 2), 0),
      ev('r-rev', at(-1, 10), 'session', 'p-review', 'Review layer opened on shop'),
      ev('r-auth', at(0, 2), 'dispatch', 'p-auth', 'Dispatched: refactor the auth session store'),
      ev('r-auth', at(0, 40), 'tool', 'p-auth', 'Edit src/auth/session.ts'),
      ev('r-flaky', at(0, 55), 'dispatch', 'p-flaky', 'Dispatched: fix the flaky checkout test'),
      cmd('p-watch', 'npm test', at(1, 20), at(1, 24), 1),
      ev('r-auth', at(1, 50), 'artifact', 'p-auth', '6 files changed in src/auth'),
      ev('r-flaky', at(2, 30), 'permission', 'p-flaky', 'Allowed once: run `npm run e2e -- checkout`'),
      cmd('p-watch', 'npm test', at(2, 58), at(3, 2), 0),
      ev('r-docs', at(3, 15), 'dispatch', 'p-docs', 'Dispatched: write the API docs pass'),
      ev('r-flaky', at(4, 5), 'check', 'p-flaky', 'Check failed: `npm run e2e -- checkout`'),
      ev('r-docs', at(5, 0), 'artifact', 'p-docs', '3 files changed in docs/api'),
      ev('r-rev', at(6, 30), 'session', 'p-review', 'Review layer refreshed: 9 files waiting')
    ],
    tonight: {
      state: 'done',
      startedAt: at(0, 0),
      endedAt: at(7, 20),
      awake: false,
      tasks: [
        { id: 't1', panelId: 'p-auth', title: 'Refactor auth session', state: 'checked', attempts: 1, spentUsd: 3.1, checkFailures: 0, check: 'npm test -- auth', startedAt: at(0, 0), endedAt: at(2, 10) },
        { id: 't2', panelId: 'p-flaky', title: 'Fix flaky checkout test', state: 'stuck', reason: 'its check kept failing', attempts: 2, spentUsd: 4.4, checkFailures: 3, check: 'npm run e2e -- checkout', startedAt: at(0, 50), endedAt: at(4, 40) },
        { id: 't3', panelId: 'p-docs', title: 'API docs pass', state: 'checked', attempts: 1, spentUsd: 1.2, checkFailures: 0, check: 'npm run docs:lint', startedAt: at(3, 10), endedAt: at(5, 30) }
      ]
    },
    queue: [
      { kind: 'failed', itemId: 't2', title: 'Fix flaky checkout test', text: '`npm run e2e -- checkout` kept failing — the auto run gave up' },
      { kind: 'checked', itemId: 't3', title: 'API docs pass', text: '3 files to review', files: 3 },
      { kind: 'checked', itemId: 't1', title: 'Refactor auth session', text: '6 files to review', files: 6 }
    ]
  }
}
