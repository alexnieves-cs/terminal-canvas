/**
 * M347. The uptime watcher's one step, as a pure function over its saved
 * state, so verify:canvas-sync can walk it through an outage without a clock
 * or a network. `health-main.ts` runs it once a minute on the VM
 * (deploy/tc-collab-health.timer): it probes `GET /healthz`, reads the error
 * events the server logged since the last step, and posts what changed to
 * TC_ALERT_WEBHOOK.
 *
 * The rules, each there because the obvious version pages wrongly:
 *  - DOWN after 3 failed probes in a row, not 1: a restart (Restart=always)
 *    takes a probe or two, and paging on every deploy trains people to mute.
 *  - Said ONCE per outage, and RECOVERED said once when it ends — never a page
 *    a minute while it stays down.
 *  - Error EVENTS (a failed store, a pool error: any `"level":"error"` line)
 *    alert at most once per 30 minutes, with the count and the kinds, because
 *    a store failing on every change of a busy room is one problem, not five
 *    hundred.
 */
export interface HealthState {
  failures: number
  down: boolean
  lastErrorAlertAt: number | null
}

export const HEALTH_START: HealthState = { failures: 0, down: false, lastErrorAlertAt: null }
export const DOWN_AFTER = 3
export const ERROR_ALERT_EVERY_MS = 30 * 60 * 1000

export interface HealthProbe { ok: boolean; detail: string }

export function healthStep(state: HealthState, now: number, probe: HealthProbe, errorEvents: readonly string[]): { state: HealthState; alerts: string[] } {
  const alerts: string[] = []
  let { failures, down, lastErrorAlertAt } = state
  if (probe.ok) {
    if (down) alerts.push(`collab recovered — /healthz answers again (${probe.detail})`)
    failures = 0
    down = false
  } else {
    failures += 1
    if (!down && failures >= DOWN_AFTER) {
      down = true
      alerts.push(`collab DOWN — ${failures} health probes in a row failed (${probe.detail})`)
    }
  }
  if (errorEvents.length > 0 && (lastErrorAlertAt === null || now - lastErrorAlertAt >= ERROR_ALERT_EVERY_MS)) {
    const kinds = [...new Set(errorEvents)].sort().join(', ')
    alerts.push(`collab logged ${errorEvents.length} error event${errorEvents.length === 1 ? '' : 's'}: ${kinds}`)
    lastErrorAlertAt = now
  }
  return { state: { failures, down, lastErrorAlertAt }, alerts }
}

/** The error events in a run of the server's JSON log lines (log.ts); anything unparseable is not an event. */
export function errorEventsIn(lines: readonly string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as { level?: unknown; event?: unknown }
      if (e.level === 'error' && typeof e.event === 'string') out.push(e.event)
    } catch { /* journald's own lines, or a partial write: not an event */ }
  }
  return out
}

/** One alert's body, shaped for the common webhooks: Slack reads `text`, Discord `content`; ntfy takes the body as the message. */
export function alertBody(text: string, host: string): string {
  const line = `[tc-collab ${host}] ${text}`
  return JSON.stringify({ text: line, content: line })
}
