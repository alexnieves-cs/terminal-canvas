/**
 * M697. THE LOCAL USAGE TALLY, pure.
 *
 * Which features get used, and how far a first run gets, are the two
 * questions a launch needs answered, and "everything on your Mac" is the
 * promise this app makes. So the answer is a tally that never leaves the Mac
 * on its own: OFF until `usage.localCounts` is turned on, kept in one small
 * file in the app's data folder, and only ever copied out by the person, with
 * a palette verb, as text they can read before they paste it anywhere.
 *
 * What it can hold is CLOSED, here, by name. A feature is a count of how many
 * times one door in the IPC contract was asked, from `FEATURE_OF` below; a
 * funnel step is the first DAY (not time) a step happened. No argument of any
 * call is read: not a path, a prompt, a command or a panel name. A channel
 * not in the table is not counted, and a file that holds anything else is
 * read back without it (`parseUsageCounts`), so a hand edit or a later
 * version cannot widen what is kept.
 */

/** A door in the contract, and the feature name it counts as. */
export const FEATURE_OF: Readonly<Record<string, string>> = Object.freeze({
  'pty:create': 'terminal.open',
  'agent:create': 'agent.start',
  'agent:send': 'agent.message',
  'agent:answer': 'agent.approval-answered',
  'preset:spawn-by-id': 'preset.spawn',
  'workspace:create': 'workspace.create',
  'review:panel': 'review.open',
  'review:commit': 'review.commit',
  'review:discard': 'review.discard',
  'scrollback:search': 'search',
  'file:open': 'file.open',
  'browser:read': 'browser.read',
  'snapshot:restore': 'snapshot.restore',
  'combine:run': 'workflow.combine',
  'lane:merge': 'lane.merge',
  'routine:run': 'routine.run',
  'tonight:start': 'overnight.start',
  'tournament:start': 'tournament.start',
  'fork:branch': 'fork.branch',
  'cloud:dispatch': 'cloud.dispatch',
  'export:canvas-png': 'export.picture',
  'export:deck-pdf': 'export.deck',
  'portable:export': 'export.portable',
  'update:check': 'update.check',
  'update:install': 'update.install'
})

/** The first-run funnel, in order: each step is the first door of its kind. */
export const FUNNEL: readonly { step: string; channel: string }[] = Object.freeze([
  { step: 'first-terminal', channel: 'pty:create' },
  { step: 'first-agent', channel: 'agent:create' },
  { step: 'first-review', channel: 'review:panel' },
  { step: 'first-commit', channel: 'review:commit' },
  { step: 'first-overnight', channel: 'tonight:start' }
])

export const USAGE_SETTING = 'usage.localCounts'
export const USAGE_FILE = 'usage-counts.json'
/** A count stops here rather than growing into a float nobody can read exactly. */
export const COUNT_CAP = 1_000_000_000

export interface UsageCounts {
  version: 1
  /** The day counting started (`YYYY-MM-DD`, local). */
  since: string
  /** Step name → the first day it happened. */
  funnel: Record<string, string>
  /** Feature name → how many times. */
  counts: Record<string, number>
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const FEATURES = new Set(Object.values(FEATURE_OF))
const STEPS = new Set(FUNNEL.map((f) => f.step))

/** A local date as `YYYY-MM-DD`: the finest grain this tally keeps. */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

export function emptyUsageCounts(day: string): UsageCounts {
  return { version: 1, since: day, funnel: {}, counts: {} }
}

/** The feature a channel counts as, or null: everything not in the table is ignored. */
export function usageFeatureOf(channel: string): string | null {
  return Object.prototype.hasOwnProperty.call(FEATURE_OF, channel) ? FEATURE_OF[channel]! : null
}

/**
 * One door asked. Returns the SAME object when the channel is not counted,
 * so a caller can skip the write; otherwise a new tally.
 */
export function recordUsage(state: UsageCounts, channel: string, day: string): UsageCounts {
  const feature = usageFeatureOf(channel)
  if (feature === null) return state
  const counts = { ...state.counts, [feature]: Math.min(COUNT_CAP, (state.counts[feature] ?? 0) + 1) }
  const funnel = { ...state.funnel }
  for (const { step, channel: first } of FUNNEL) {
    if (first === channel && funnel[step] === undefined) funnel[step] = day
  }
  return { version: 1, since: state.since, funnel, counts }
}

/**
 * The file, read back through the same closed lists: an unknown feature or
 * step, a count that is not a whole number in range, or a day that is not a
 * day is dropped, never kept. Anything unreadable is null (start again).
 */
export function parseUsageCounts(text: string): UsageCounts | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1 || typeof r.since !== 'string' || !DAY.test(r.since)) return null
  const funnel: Record<string, string> = {}
  if (typeof r.funnel === 'object' && r.funnel !== null) {
    for (const [k, v] of Object.entries(r.funnel as Record<string, unknown>)) {
      if (STEPS.has(k) && typeof v === 'string' && DAY.test(v)) funnel[k] = v
    }
  }
  const counts: Record<string, number> = {}
  if (typeof r.counts === 'object' && r.counts !== null) {
    for (const [k, v] of Object.entries(r.counts as Record<string, unknown>)) {
      if (FEATURES.has(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= COUNT_CAP) counts[k] = v
    }
  }
  return { version: 1, since: r.since, funnel, counts }
}

/**
 * What "Copy my usage counts" puts on the clipboard: the tally and the app's
 * version, keys in a fixed order, nothing else. The person reads it before
 * they share it; this is the only way any of it leaves the Mac.
 */
export function usageCountsText(state: UsageCounts, appVersion: string): string {
  const funnel: Record<string, string> = {}
  for (const { step } of FUNNEL) if (state.funnel[step] !== undefined) funnel[step] = state.funnel[step]!
  const counts: Record<string, number> = {}
  for (const feature of [...FEATURES].sort()) if (state.counts[feature] !== undefined) counts[feature] = state.counts[feature]!
  return JSON.stringify({ app: 'terminal-canvas', version: appVersion, since: state.since, funnel, counts }, null, 2)
}
