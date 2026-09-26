/**
 * M347. `node health.cjs` — one step of the uptime watcher (health.ts), run
 * once a minute by deploy/tc-collab-health.timer. It probes the server's own
 * `/healthz` on loopback, reads the error events tc-collab logged since the
 * last step (journalctl, JSON lines), saves its state beside it, and posts
 * each alert to TC_ALERT_WEBHOOK. Without a webhook the alerts are still
 * logged (and so in the journal), just not sent anywhere.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname } from 'node:path'
import { alertBody, errorEventsIn, healthStep, HEALTH_START, type HealthState } from './health'
import { createLog } from './log'

const log = createLog()
const port = Number(process.env['TC_COLLAB_PORT'] ?? '1234')
const statePath = process.env['TC_HEALTH_STATE'] ?? '/var/lib/tc-collab/health.json'

async function probe(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
    const h = await res.json() as { rooms?: number; connections?: number }
    return { ok: true, detail: `${h.rooms ?? '?'} rooms, ${h.connections ?? '?'} connections` }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

function readState(): HealthState & { checkedAt?: number } {
  try { return JSON.parse(readFileSync(statePath, 'utf8')) as HealthState & { checkedAt?: number } } catch { return { ...HEALTH_START } }
}

async function main(): Promise<void> {
  const now = Date.now()
  const prev = readState()
  const since = new Date(prev.checkedAt ?? now - 60_000).toISOString()
  let lines: string[] = []
  try {
    lines = execFileSync('journalctl', ['-u', 'tc-collab', '--since', since, '-o', 'cat', '--no-pager'], { encoding: 'utf8', timeout: 10_000 }).split('\n')
  } catch (e) { log('health.journal_error', { error: String(e instanceof Error ? e.message : e) }) }
  const { state, alerts } = healthStep(prev, now, await probe(), errorEventsIn(lines))
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, JSON.stringify({ ...state, checkedAt: now }))
  const hook = process.env['TC_ALERT_WEBHOOK'] ?? ''
  for (const text of alerts) {
    log('health.alert', { text })
    if (hook !== '') {
      try { await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: alertBody(text, hostname()) }) } catch (e) { log('alert.failed', { error: String(e) }) }
    }
  }
}

void main()
