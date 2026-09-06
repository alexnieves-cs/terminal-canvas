/**
 * M112 — telemetry's two decisions, pure.
 *
 * `telemetryPlan` reads the two settings and answers with an arm: `no-dsn`
 * (every canvas that never opened this page), `malformed-dsn` (its OWN arm —
 * a typo must not read as "off", the three-state rule), or `on`. Nothing
 * here imports `@sentry/electron`; main/index.ts does the init, so this
 * module runs under plain node in verify:file.
 *
 * `scrubEvent` is the `beforeSend`. It builds a NEW event from an ALLOWLIST,
 * never spreads the SDK's: a field the SDK adds in a later version cannot
 * leak through a copy that names every field it keeps (M91's rule, applied
 * to a third data source after the diagnostics bundle and the toolbox
 * projector). Breadcrumbs carry console lines, which carry terminal bytes;
 * `request`, `user`, `extra`, `tags` and `contexts.device` name the machine
 * or the cwd; frame `vars` hold live values. None survives. Every kept
 * string has the userData directory and the home directory replaced and
 * passes `redactSecrets`.
 */
import { redactSecrets } from '../shared/redact'
import type { SettingValue } from '../shared/settings-schema'

export type TelemetryPlan =
  | { on: false; reason: 'no-dsn' | 'malformed-dsn' }
  | { on: true; dsn: string; nativeCrashes: boolean }

/** `https://<key>@<host>/<project>` — Sentry's own shape, nothing looser. */
const DSN = /^https:\/\/[A-Za-z0-9]+@[A-Za-z0-9.-]+(:\d+)?\/\d+$/

export function telemetryPlan(read: (id: string) => SettingValue | undefined): TelemetryPlan {
  const raw = read('telemetry.sentryDsn')
  const dsn = typeof raw === 'string' ? raw.trim() : ''
  if (dsn === '') return { on: false, reason: 'no-dsn' }
  if (!DSN.test(dsn)) return { on: false, reason: 'malformed-dsn' }
  return { on: true, dsn, nativeCrashes: read('telemetry.nativeCrashes') === true }
}

export interface ScrubPaths {
  userData: string
  home: string
}

type Dict = Record<string, unknown>
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)

function scrubString(s: string, paths: ScrubPaths): string {
  // userData first: it lives under home, so home-first would leave
  // `<home>/Library/Application Support/…`, which still names the app path.
  // Guarded on non-empty: split('') on an empty string explodes it into one
  // element per character, which join('<userData>') would then interleave
  // through the whole string — an empty path is skipped, not replaced.
  let out = s
  if (paths.userData) out = out.split(paths.userData).join('<userData>')
  if (paths.home) out = out.split(paths.home).join('<home>')
  return redactSecrets(out).text
}

function scrubFrame(f: unknown, paths: ScrubPaths): Dict | null {
  if (!isDict(f)) return null
  const out: Dict = {}
  if (typeof f.function === 'string') out.function = scrubString(f.function, paths)
  if (typeof f.filename === 'string') out.filename = scrubString(f.filename, paths)
  if (typeof f.lineno === 'number') out.lineno = f.lineno
  if (typeof f.colno === 'number') out.colno = f.colno
  return out
}

function scrubException(x: unknown, paths: ScrubPaths): Dict | null {
  if (!isDict(x)) return null
  const out: Dict = {}
  if (typeof x.type === 'string') out.type = scrubString(x.type, paths)
  if (typeof x.value === 'string') out.value = scrubString(x.value, paths)
  const frames = isDict(x.stacktrace) && Array.isArray(x.stacktrace.frames) ? x.stacktrace.frames : null
  if (frames) out.stacktrace = { frames: frames.map((f) => scrubFrame(f, paths)).filter((f): f is Dict => f !== null) }
  return out
}

function scrubContexts(c: unknown, paths: ScrubPaths): Dict | undefined {
  if (!isDict(c)) return undefined
  const out: Dict = {}
  // Closed to these four: each carries version and platform strings (OS
  // name, app version, Electron/Node runtime version), never machine
  // identity or user state. `device` is dropped for exactly the contrast —
  // it names the machine (hostname, model) — and the same argument applies
  // to anything added here later: it earns a place only by carrying a
  // version string, not an identifier.
  for (const key of ['os', 'app', 'runtime', 'electron'] as const) {
    const v = c[key]
    if (!isDict(v)) continue
    const kept: Dict = {}
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string') kept[k] = scrubString(val, paths)
      else if (typeof val === 'number' || typeof val === 'boolean') kept[k] = val
    }
    out[key] = kept
  }
  return out
}

/** The allowlist copy. Returns null for a non-object, which Sentry reads as "drop". */
export function scrubEvent(event: unknown, paths: ScrubPaths): Dict | null {
  if (!isDict(event)) return null
  const out: Dict = {}
  for (const key of ['event_id', 'timestamp', 'level', 'release', 'environment', 'platform'] as const) {
    const v = event[key]
    if (typeof v === 'string') out[key] = scrubString(v, paths)
    else if (typeof v === 'number') out[key] = v
  }
  if (typeof event.message === 'string') out.message = scrubString(event.message, paths)
  const contexts = scrubContexts(event.contexts, paths)
  if (contexts) out.contexts = contexts
  if (isDict(event.exception) && Array.isArray(event.exception.values)) {
    out.exception = { values: event.exception.values.map((x) => scrubException(x, paths)).filter((x): x is Dict => x !== null) }
  }
  return out
}
